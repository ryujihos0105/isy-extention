"""
ISY 실제 추론 서버
엔드포인트:
  POST /api/analyze/image  → 이미지 모델 (versionv9 또는 versionv12)
  POST /api/analyze/text   → 텍스트 모델 (text_model/ 폴더 추가 시 활성화)
  POST /api/analyze/video  → 영상 모델 (video_model/ 폴더 추가 시 활성화)

이미지 모델 전환:
  아래 IMAGE_MODEL_VERSION 한 줄만 "v3" / "v9" / "v12" 로 바꾸고 서버 재시작.
  sys.path / import / 가중치 경로 / run_inference 분기 모두 자동 처리.

새 이미지 모델 버전 추가:
  1. versionvNN/ 폴더를 기존과 동일한 구조로 생성
     (model.py / config.py / preprocess.py / weights/best.pt)
  2. _IMAGE_MODEL_REGISTRY 에 한 줄 추가
  3. run_inference 의 튜플 길이 분기 확인 (2개=v3형 / 3개=v9형 / 4개=v12형)

실행: python server.py
"""

import sys
import os

# CLIP 가중치(open_clip)는 최초 1회 huggingface.co 에서 다운로드된다.
# 백신/프록시의 TLS 검사 환경에서는 certifi 번들로 인증서 검증이 실패하므로,
# 설치돼 있으면 Windows 인증서 저장소를 사용하도록 truststore 를 주입한다.
# (인증서가 이미 정상이면 무해. 반드시 open_clip 을 import 하는 preprocess 보다 먼저 실행)
try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

# ─── 이미지 모델 버전 선택 ─────────────────────────────────
# "v9"  (LateFusion: RGB+FFT)
# "v12" (TripleFusion: RGB+FFT+CLIP)
# "v3"  (CLIP-only: CLIP ViT-L-14 임베딩 → Linear sigmoid, predict.py/tunmbs.pt 와 동일)
IMAGE_MODEL_VERSION = "v3"
# ───────────────────────────────────────────────────────────

# force_cpu=True 인 버전은 CUDA가 있어도 이미지 모델을 CPU로 로드/추론한다.
# v12(TripleFusion+CLIP)는 GPU VRAM을 초과(OOM)하므로 CPU로 강제.
_IMAGE_MODEL_REGISTRY = {
    "v9":  {"folder": "versionv9",  "label": "versionv9-fftB",          "force_cpu": False},
    "v12": {"folder": "versionv12", "label": "versionv12-tripleFusion", "force_cpu": True},
    "v3":  {"folder": "versionv3",  "label": "versionv3-clipViTL14",    "force_cpu": True},
}
_image_meta           = _IMAGE_MODEL_REGISTRY[IMAGE_MODEL_VERSION]
_IMAGE_MODEL_FOLDER   = _image_meta["folder"]
_IMAGE_MODEL_LABEL    = _image_meta["label"]
_IMAGE_FORCE_CPU      = _image_meta.get("force_cpu", False)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), _IMAGE_MODEL_FOLDER))

# force_cpu 버전은 preprocess(CLIP/InsightFace)까지 CPU로 강제해야 OOM을 피한다.
# preprocess.py 는 import 시점에 SIMCAP_DEVICE 환경변수를 읽어 CLIP/InsightFace 디바이스를
# 결정하므로, 반드시 아래 import보다 먼저 설정해야 한다.
if _IMAGE_FORCE_CPU:
    os.environ["SIMCAP_DEVICE"] = "cpu"

import hashlib
import json
import time
import threading
import shutil
import tempfile
import torch
import torch.nn.functional as F
import requests
import traceback
from collections import OrderedDict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from PIL import Image
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import urlparse, urlunparse, parse_qs, unquote, urljoin
import ipaddress
import socket

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

# 두 버전 모두 모듈 이름(model/preprocess/config)과 시그니처(load_model/preprocess_image)가 동일.
# 클래스 이름만 다르므로(LateFusionModel ↔ TripleFusionModel) 클래스는 import하지 않는다.
from model import load_model
from preprocess import preprocess_image
from config import MODEL_PATH
from video_inference import (
    check_video_assets,
    download_direct_video,
    download_youtube_video,
    load_video_model,
    remove_temp_video,
)

# ── 모델 전역 상태 ──────────────────────────────────────────
# 이미지 모델은 버전에 따라 LateFusionModel 또는 TripleFusionModel — 공통 베이스 타입힌트는 생략
_image_model = None
_text_model = None
_video_model = None
_device: Optional[str] = None          # 공통 디바이스 (영상/텍스트)
_image_device: Optional[str] = None    # 이미지 모델 전용 — force_cpu면 "cpu"로 고정

BASE_DIR      = os.path.dirname(__file__)
BASE_PATH     = Path(BASE_DIR)
IMAGE_WEIGHTS = os.path.join(BASE_DIR, _IMAGE_MODEL_FOLDER, MODEL_PATH)
TEXT_WEIGHTS  = os.path.join(BASE_DIR, "text_model", "weights", "best.pt")
VIDEO_DIR     = os.path.join(BASE_DIR, "video")
DEMO_PLATFORM_DIR = BASE_PATH / "demo_platform"
DEMO_UPLOAD_DIR = DEMO_PLATFORM_DIR / "uploads"
DEMO_DISCLOSURES_PATH = DEMO_PLATFORM_DIR / "disclosures.json"
DEMO_STATIC_DIR = DEMO_PLATFORM_DIR / "static"
DEMO_MAX_VIDEO_BYTES = 500 * 1024 * 1024
_platform_disclosure_lock = threading.Lock()


def _load_text_model(device: str):
    """텍스트 모델 로더 — text_model/ 폴더 추가 후 구현.
    아직 미구현이므로 명시적으로 None 반환 — 호출 측은 _text_model is None 가드 필요.
    """
    # sys.path.insert(0, os.path.join(BASE_DIR, "text_model"))
    # from model import load_model as load_text
    # return load_text(TEXT_WEIGHTS, device)
    print("[ISY] _load_text_model 호출됨 — 구현 전, None 반환")
    return None


def _load_video_model(device: str):
    """영상 모델 로더 — video_model/ 폴더 추가 후 구현"""
    return load_video_model(device)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _image_model, _text_model, _video_model, _device, _image_device
    _device = "cuda" if torch.cuda.is_available() else "cpu"
    # 이미지 모델은 force_cpu면 CUDA가 있어도 CPU 사용 (v12 OOM 회피)
    _image_device = "cpu" if _IMAGE_FORCE_CPU else _device
    print(f"[ISY] 디바이스: {_device} (이미지: {_image_device})")

    # 이미지 모델 (필수)
    print(f"[ISY] 이미지 모델 로드 중 ({IMAGE_MODEL_VERSION}, {_image_device}): {IMAGE_WEIGHTS}")
    _image_model = load_model(IMAGE_WEIGHTS, _image_device)
    print(f"[ISY] 이미지 모델 준비됨 ({_IMAGE_MODEL_LABEL})")

    # 텍스트 모델 (선택 — 폴더 있을 때만)
    if os.path.exists(TEXT_WEIGHTS):
        print("[ISY] 텍스트 모델 로드 중...")
        _text_model = _load_text_model(_device)
        print("[ISY] 텍스트 모델 준비됨")
    else:
        print("[ISY] 텍스트 모델 없음 — /api/analyze/text 비활성화")

    # 영상 모델 (선택 — 폴더 있을 때만)
    missing_video_assets = check_video_assets()
    if not missing_video_assets:
        print("[ISY] 영상 모델 로드 중...")
        _video_model = _load_video_model(_device)
        print("[ISY] 영상 모델 준비됨")
    else:
        print("[ISY] 영상 모델 없음 — /api/analyze/video 비활성화")

    yield
    _image_model = _text_model = _video_model = None


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://studio.youtube.com"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


class AnalyzeRequest(BaseModel):
    url: str
    media_type: Optional[str] = None
    page_url: Optional[str] = None

class TextRequest(BaseModel):
    text: str

class PlatformMeta(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    platform: Optional[str] = None   # 'youtube' | 'instagram' | null
    video_id: Optional[str] = Field(default=None, alias="videoId")   # YouTube videoId, Instagram shortcode 등

class VideoRequest(BaseModel):
    # url: 직접 다운로드 가능한 영상 URL. blob: 영상이면 null.
    url: Optional[str] = None
    # platform_meta: url이 없을 때 플랫폼 API를 통해 영상을 가져오기 위한 식별자
    platform_meta: Optional[PlatformMeta] = None


_BLOCKED_HOSTS = (
    "localhost",
    "127.",
    "0.0.0.0",
    "::1",
    "169.254.",   # AWS/GCP link-local metadata
    "100.64.",    # Carrier-grade NAT
    "10.",
    "172.16.", "172.17.", "172.18.", "172.19.", "172.20.",
    "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
    "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
    "192.168.",
)

MAX_IMAGE_BYTES = 30 * 1024 * 1024  # 30MB
MAX_REDIRECTS = 3

# 결과 메모리 캐시.
# 동일 이미지에 대한 재요청을 추론 큐에 다시 태우지 않는다.
# 클라이언트(background.js) 캐시가 SW 종료/탭 분리에서 날아가도 서버 측에서 흡수.
_RESULT_CACHE_MAX = 200
_RESULT_CACHE_TTL_SEC = 30 * 60
_result_cache: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()
_result_cache_lock = threading.Lock()


def _ensure_demo_platform_dirs() -> None:
    DEMO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    DEMO_STATIC_DIR.mkdir(parents=True, exist_ok=True)


def _load_platform_disclosures() -> dict:
    _ensure_demo_platform_dirs()
    if not DEMO_DISCLOSURES_PATH.exists():
        return {}
    try:
        with DEMO_DISCLOSURES_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        traceback.print_exc()
        return {}


def _save_platform_disclosures(data: dict) -> None:
    _ensure_demo_platform_dirs()
    tmp_path = DEMO_DISCLOSURES_PATH.with_suffix(".json.tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp_path.replace(DEMO_DISCLOSURES_PATH)


def _get_platform_disclosure(video_id: str) -> Optional[dict]:
    with _platform_disclosure_lock:
        return _load_platform_disclosures().get(video_id)


def _put_platform_disclosure(video_id: str, disclosure: dict) -> None:
    with _platform_disclosure_lock:
        data = _load_platform_disclosures()
        data[video_id] = disclosure
        _save_platform_disclosures(data)


def _delete_platform_disclosure(video_id: str) -> bool:
    """disclosure 메타 + 저장된 영상 파일을 함께 삭제한다.

    메타가 없으면 False. 메타에 stored_filename이 있으면 uploads/의 파일도 제거하되,
    파일이 이미 없어도(메타만 남은 경우) 메타 제거는 정상 처리한다.
    """
    with _platform_disclosure_lock:
        data = _load_platform_disclosures()
        disclosure = data.pop(video_id, None)
        if disclosure is None:
            return False
        _save_platform_disclosures(data)

    stored_filename = (disclosure or {}).get("stored_filename")
    if stored_filename:
        try:
            (DEMO_UPLOAD_DIR / stored_filename).unlink(missing_ok=True)
        except Exception:
            traceback.print_exc()
    return True


def _result_level(fake_probability: float) -> str:
    if fake_probability >= 0.7:
        return "high"
    if fake_probability >= 0.4:
        return "uncertain"
    return "low"


# (viewer_title, summary_adverb) — adverb는 "평가되었습니다" 앞에 붙는 부사
_LEVEL_VIEWER_LABELS: dict[str, tuple[str, str]] = {
    "high":      ("AI 생성 가능성 높음",    ""),
    "uncertain": ("AI 생성 여부 확인 필요", ""),
    "low":       ("AI 생성 가능성 낮음",    "낮게 "),
}


def _build_platform_disclosure(
    *,
    video_id: str,
    filename: str,
    content_type: Optional[str],
    file_size: int,
    stored_filename: str,
    sha256: str,
    result: dict,
) -> dict:
    fake_probability = float(result.get("fake_probability") or 0)
    real_probability = float(result.get("real_probability") or max(0, 1 - fake_probability))
    percent = round(fake_probability * 100)
    level = _result_level(fake_probability)
    viewer_title, adverb = _LEVEL_VIEWER_LABELS.get(level, ("AI 생성 여부 불명확", ""))
    viewer_summary = f"ISY 자동 분석 결과 AI 생성 가능성이 {percent}%로 {adverb}평가되었습니다."

    return {
        "video_id": video_id,
        "filename": filename,
        "content_type": content_type or "video/mp4",
        "file_size": file_size,
        "stored_filename": stored_filename,
        "sha256": sha256,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": "ISY Partner Disclosure API",
        "media_type": "video",
        "fake_probability": round(fake_probability, 4),
        "real_probability": round(real_probability, 4),
        "percent": percent,
        "level": level,
        "model": result.get("model") or "isy-video",
        "raw_label": result.get("label"),
        "viewer_title": viewer_title,
        "viewer_summary": viewer_summary,
    }


def _cache_get(key: str) -> Optional[dict]:
    now = time.monotonic()
    with _result_cache_lock:
        entry = _result_cache.get(key)
        if entry is None:
            return None
        ts, result = entry
        if now - ts > _RESULT_CACHE_TTL_SEC:
            _result_cache.pop(key, None)
            return None
        _result_cache.move_to_end(key)
        return result


def _cache_put(key: str, result: dict) -> None:
    with _result_cache_lock:
        _result_cache[key] = (time.monotonic(), result)
        _result_cache.move_to_end(key)
        while len(_result_cache) > _RESULT_CACHE_MAX:
            _result_cache.popitem(last=False)


def _assert_safe_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"허용되지 않는 URL 스킴: {parsed.scheme}")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError("호스트를 파싱할 수 없습니다")
    if any(host.startswith(b) for b in _BLOCKED_HOSTS):
        raise ValueError(f"내부/사설 주소로의 요청은 허용되지 않습니다: {host}")

    # 호스트가 IP 리터럴이면 즉시 검증
    try:
        addr_literal = ipaddress.ip_address(host)
        if (addr_literal.is_private or addr_literal.is_loopback
                or addr_literal.is_link_local or addr_literal.is_reserved
                or addr_literal.is_multicast or addr_literal.is_unspecified):
            raise ValueError(f"내부/사설 IP: {addr_literal}")
        return
    except ValueError as exc:
        if "내부" in str(exc):
            raise

    # DNS 해석 후 모든 결과 IP 검증 (DNS rebinding 방지)
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise ValueError(f"DNS 해석 실패: {host}") from e
    for info in infos:
        try:
            addr = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        if (addr.is_private or addr.is_loopback or addr.is_link_local
                or addr.is_reserved or addr.is_multicast or addr.is_unspecified):
            raise ValueError(f"내부/사설 주소로 해석됨: {host} → {addr}")


def resolve_image_url(url: str, page_url: Optional[str] = None) -> tuple:
    """
    도메인별 URL 정규화 + Referer 결정.
    반환: (실제_요청_URL, Referer_헤더값)

    - ytimg.com (YouTube): 쿼리 파라미터 제거 (sqp가 포맷 변경 유발)
    - pstatic.net dthumb (Naver 프록시): src 파라미터에서 실제 URL 추출
    - 그 외: URL 그대로 사용
    """
    parsed = urlparse(url)

    if "ytimg.com" in parsed.netloc:
        clean = urlunparse(parsed._replace(query="", fragment=""))
        return clean, "https://www.youtube.com/"

    if "fbcdn.net" in parsed.netloc or "cdninstagram.com" in parsed.netloc:
        return url, page_url or "https://www.instagram.com/"

    if "pstatic.net" in parsed.netloc and "dthumb" in parsed.path:
        params = parse_qs(parsed.query)
        if "src" in params:
            actual = params["src"][0].strip('"')
            for _ in range(3):
                decoded = unquote(actual)
                if decoded == actual:
                    break
                actual = decoded
            actual = actual.strip('"')
            return actual, "https://www.naver.com/"
        return url, "https://www.naver.com/"

    # 도메인 기반 Referer 추론
    referer = f"{parsed.scheme}://{parsed.netloc}/"
    return url, referer


def fetch_image(url: str, page_url: Optional[str] = None) -> Image.Image:
    _assert_safe_url(url)
    resolved_url, referer = resolve_image_url(url, page_url)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": referer,
    }

    # 명시적 리다이렉트 추적 — 매 hop마다 _assert_safe_url 재검증 (SSRF 방지)
    current_url = resolved_url
    resp = None
    for hop in range(MAX_REDIRECTS + 1):
        _assert_safe_url(current_url)
        resp = requests.get(
            current_url,
            headers=headers,
            timeout=12,
            stream=True,
            allow_redirects=False,
        )
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("location")
            resp.close()
            if not location:
                raise ValueError("리다이렉트에 location 헤더 없음")
            current_url = urljoin(current_url, location)
            continue
        break
    else:
        if resp is not None:
            resp.close()
        raise ValueError(f"리다이렉트 횟수 초과 ({MAX_REDIRECTS}회)")

    try:
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "").lower()
        if not content_type.startswith("image/"):
            raise ValueError(f"이미지가 아닌 응답 (content-type: {content_type})")

        content_length = resp.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_IMAGE_BYTES:
                    raise ValueError(f"이미지 크기 초과: {content_length} bytes")
            except (TypeError, ValueError):
                pass  # 헤더 파싱 실패는 스트림 검증에 위임

        # 청크 단위 스트림 다운로드 + 누적 크기 검증
        buf = BytesIO()
        total = 0
        for chunk in resp.iter_content(64 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > MAX_IMAGE_BYTES:
                raise ValueError(f"이미지 크기 초과 (스트림 중 {total} bytes)")
            buf.write(chunk)
        buf.seek(0)
    finally:
        resp.close()

    img = Image.open(buf).convert("RGB")
    img.load()
    return img


def run_inference(img_pil: Image.Image) -> dict:
    assert _image_model is not None and _image_device is not None, "이미지 모델이 로드되지 않았습니다"

    # v3:  (x_clip, crop_status) 2개 — 단일 입력(CLIP 임베딩) 모델
    # v9:  (x_rgb, x_fft, crop_status) 3개
    # v12: (x_rgb, x_fft, x_clip, crop_status) 4개
    out = preprocess_image(img_pil)
    if len(out) == 2:
        x_single, crop_status = out
        model_inputs = (x_single.to(_image_device),)
    elif len(out) == 3:
        x_rgb, x_fft, crop_status = out
        model_inputs = (x_rgb.to(_image_device), x_fft.to(_image_device))
    else:
        x_rgb, x_fft, x_clip, crop_status = out
        model_inputs = (x_rgb.to(_image_device), x_fft.to(_image_device), x_clip.to(_image_device))

    with torch.no_grad():
        logits = _image_model(*model_inputs)
        probs = F.softmax(logits, dim=1)[0]

    fake_prob = probs[0].item()
    real_prob = probs[1].item()

    return {
        "fake_probability": round(fake_prob, 4),
        "real_probability": round(real_prob, 4),
        "label": "REAL" if real_prob >= 0.5 else "FAKE",
        "consistency_score": round(real_prob * 100),
        "crop_status": crop_status,
        "model": _IMAGE_MODEL_LABEL,
    }


# sync def 핸들러: FastAPI가 threadpool에서 실행 → blocking I/O(fetch_image)와 GIL 밖 추론을
# 진짜 병렬로 처리. async def로 두면 메인 이벤트 루프가 fetch/추론 동안 점유돼 다른 요청이 막힌다.
@app.post("/api/analyze/image")
def analyze_image(req: AnalyzeRequest):
    if not req.url:
        raise HTTPException(status_code=400, detail="url 필드가 필요합니다")

    # 캐시 키: 정규화된 실제 다운로드 URL. dthumb/sqp 변형이 동일 원본으로 수렴.
    try:
        cache_key, _ = resolve_image_url(req.url, req.page_url)
    except Exception:
        cache_key = req.url

    cached = _cache_get(cache_key)
    if cached is not None:
        return {"url": req.url, "media_type": "image", "from_cache": True, **cached}

    try:
        img_pil = fetch_image(req.url, req.page_url)
    except requests.RequestException as e:
        print(f"[ISY] 다운로드 실패 ({req.url}): {e}")
        raise HTTPException(status_code=502, detail=f"이미지 다운로드 실패: {e}")
    except Exception as e:
        print(f"[ISY] 이미지 열기 실패 ({req.url}): {e}")
        raise HTTPException(status_code=400, detail=f"이미지 열기 실패: {e}")

    try:
        result = run_inference(img_pil)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"추론 실패: {e}")

    _cache_put(cache_key, result)
    return {"url": req.url, "media_type": "image", **result}


@app.post("/api/analyze/text")
async def analyze_text(req: TextRequest):
    if _text_model is None:
        raise HTTPException(status_code=503, detail="텍스트 모델 준비 중 — text_model/ 폴더를 추가하세요")

    # 텍스트 모델 추론 — text_model/ 추가 후 구현
    # result = run_text_inference(req.text)
    # return {"media_type": "text", **result}
    raise HTTPException(status_code=501, detail="텍스트 추론 미구현")


def run_video_inference(url: Optional[str], platform_meta: Optional[PlatformMeta]) -> dict:
    """
    영상 추론 스텁 — 영상 모델 담당자가 구현

    입력:
      url           - 직접 접근 가능한 영상 URL (blob: 이면 None)
      platform_meta - { platform, video_id }
                      platform='youtube'  → video_id로 yt-dlp 등으로 다운로드
                      platform='instagram' → video_id로 게시물 API 활용
                      platform=None       → url만으로 처리

    반환 형식 (이미지 모델과 동일한 계약 유지):
      {
        "fake_probability": float,   # 0.0 ~ 1.0
        "real_probability": float,
        "label": "FAKE" | "REAL",
        "consistency_score": int,    # 0 ~ 100
        "model": str
      }
    """
    assert _video_model is not None, "video model is not loaded"

    temp_video_path = None
    try:
        if platform_meta and platform_meta.platform == "youtube" and platform_meta.video_id:
            temp_video_path = download_youtube_video(platform_meta.video_id)
        elif url:
            _assert_safe_url(url)
            parsed = urlparse(url)
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "video/webm,video/mp4,video/*,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Referer": f"{parsed.scheme}://{parsed.netloc}/",
            }
            temp_video_path = download_direct_video(url, headers=headers)
        else:
            raise ValueError("url or platform_meta.video_id is required")

        return _video_model.predict_path(temp_video_path)
    finally:
        if temp_video_path is not None:
            remove_temp_video(temp_video_path)

@app.post("/api/analyze/video")
def analyze_video(req: VideoRequest):
    if _video_model is None:
        raise HTTPException(status_code=503, detail="영상 모델 없음 — video_model/ 폴더를 추가하세요")
    if not req.url and (not req.platform_meta or not req.platform_meta.video_id):
        raise HTTPException(status_code=400, detail="url 또는 platform_meta.video_id 중 하나가 필요합니다")

    try:
        result = run_video_inference(req.url, req.platform_meta)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"영상 추론 실패: {e}")

    return {"url": req.url, "media_type": "video", **result}


@app.post("/api/analyze/video-file")
def analyze_video_file(file: UploadFile = File(...)):
    if _video_model is None:
        raise HTTPException(status_code=503, detail="video model is not loaded")

    suffix = os.path.splitext(file.filename or "")[1] or ".mp4"
    temp_dir = tempfile.mkdtemp(prefix="isy-upload-video-")
    temp_path = os.path.join(temp_dir, "upload" + suffix)
    try:
        with open(temp_path, "wb") as out:
            shutil.copyfileobj(file.file, out)
        result = _video_model.predict_path(temp_path)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"video file inference failed: {e}")
    finally:
        try:
            file.file.close()
        except Exception:
            pass
        shutil.rmtree(temp_dir, ignore_errors=True)

    return {"url": None, "media_type": "video", **result}


@app.post("/api/platform/demo-upload")
def platform_demo_upload(file: UploadFile = File(...)):
    if _video_model is None:
        raise HTTPException(status_code=503, detail="video model is not loaded")

    suffix = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    if suffix not in {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}:
        suffix = ".mp4"

    _ensure_demo_platform_dirs()
    temp_dir = tempfile.mkdtemp(prefix="isy-platform-upload-")
    temp_path = os.path.join(temp_dir, "upload" + suffix)
    hasher = hashlib.sha256()
    total = 0
    try:
        with open(temp_path, "wb") as out:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > DEMO_MAX_VIDEO_BYTES:
                    raise HTTPException(status_code=413, detail="video file is too large for the demo platform")
                hasher.update(chunk)
                out.write(chunk)

        sha256 = hasher.hexdigest()
        video_id = sha256[:16]
        stored_filename = f"{video_id}{suffix}"
        stored_path = DEMO_UPLOAD_DIR / stored_filename
        shutil.copyfile(temp_path, stored_path)

        result = _video_model.predict_path(str(stored_path))
        disclosure = _build_platform_disclosure(
            video_id=video_id,
            filename=file.filename or stored_filename,
            content_type=file.content_type,
            file_size=total,
            stored_filename=stored_filename,
            sha256=sha256,
            result=result,
        )
        _put_platform_disclosure(video_id, disclosure)
        return {
            "ok": True,
            "video_id": video_id,
            "watch_url": f"/demo/watch/{video_id}",
            "disclosure": disclosure,
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"demo platform upload failed: {e}")
    finally:
        try:
            file.file.close()
        except Exception:
            pass
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.get("/api/platform/disclosures")
def list_platform_disclosures():
    with _platform_disclosure_lock:
        return list(_load_platform_disclosures().values())


@app.get("/api/platform/disclosures/{video_id}")
def get_platform_disclosure(video_id: str):
    disclosure = _get_platform_disclosure(video_id)
    if not disclosure:
        raise HTTPException(status_code=404, detail="platform disclosure not found")
    return disclosure


@app.delete("/api/platform/disclosures/{video_id}")
def delete_platform_disclosure(video_id: str):
    deleted = _delete_platform_disclosure(video_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="platform disclosure not found")
    return {"ok": True, "video_id": video_id}


@app.get("/api/platform/videos/{video_id}")
def get_platform_video(video_id: str):
    disclosure = _get_platform_disclosure(video_id)
    if not disclosure:
        raise HTTPException(status_code=404, detail="platform disclosure not found")
    stored_filename = disclosure.get("stored_filename")
    if not stored_filename:
        raise HTTPException(status_code=404, detail="video file not found")
    path = DEMO_UPLOAD_DIR / stored_filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="video file not found")
    return FileResponse(path, media_type=disclosure.get("content_type") or "video/mp4")


@app.get("/demo/browse")
def platform_demo_browse_page():
    path = DEMO_STATIC_DIR / "browse.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail="demo browse page not found")
    return FileResponse(path)


@app.get("/demo/upload")
def platform_demo_upload_page():
    path = DEMO_STATIC_DIR / "upload.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail="demo upload page not found")
    return FileResponse(path)


@app.get("/demo/watch/{video_id}")
def platform_demo_watch_page(video_id: str):
    path = DEMO_STATIC_DIR / "watch.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail="demo watch page not found")
    return FileResponse(path)


@app.get("/demo/static/{filename}")
def platform_demo_static(filename: str):
    if "/" in filename or "\\" in filename or filename.startswith(".."):
        raise HTTPException(status_code=400, detail="invalid static path")
    base = DEMO_STATIC_DIR.resolve()
    resolved = (DEMO_STATIC_DIR / filename).resolve()
    try:
        resolved.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid static path")
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="static file not found")
    return FileResponse(resolved)


if __name__ == "__main__":
    import uvicorn
    print("ISY 실제 추론 서버 시작: http://localhost:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
