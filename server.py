"""
ISY 실제 추론 서버
엔드포인트:
  POST /api/analyze/image  → 이미지 모델 (versionv9)
  POST /api/analyze/text   → 텍스트 모델 (text_model/ 폴더 추가 시 활성화)
  POST /api/analyze/video  → 영상 모델 (video_model/ 폴더 추가 시 활성화)

새 모델 추가 방법:
  1. {type}_model/ 폴더를 versionv9와 동일한 구조로 생성
     (model.py / config.py / preprocess.py / weights/best.pt)
  2. 아래 _load_{type}_model() 함수 채우기
  3. 서버 재시작
실행: python server.py
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "versionv9"))

import torch
import torch.nn.functional as F
import requests
import traceback
from io import BytesIO
from PIL import Image
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import urlparse, urlunparse, parse_qs, unquote

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from model import load_model, LateFusionModel
from preprocess import preprocess_image
from config import MODEL_PATH

# ── 모델 전역 상태 ──────────────────────────────────────────
_image_model: Optional[LateFusionModel] = None
_text_model = None    # 텍스트 모델 추가 시 타입 지정
_video_model = None   # 영상 모델 추가 시 타입 지정
_device: Optional[str] = None

BASE_DIR      = os.path.dirname(__file__)
IMAGE_WEIGHTS = os.path.join(BASE_DIR, "versionv9", MODEL_PATH)
TEXT_WEIGHTS  = os.path.join(BASE_DIR, "text_model", "weights", "best.pt")
VIDEO_WEIGHTS = os.path.join(BASE_DIR, "video_model", "weights", "best.pt")


def _load_text_model(device: str):
    """텍스트 모델 로더 — text_model/ 폴더 추가 후 구현"""
    # sys.path.insert(0, os.path.join(BASE_DIR, "text_model"))
    # from model import load_model as load_text
    # return load_text(TEXT_WEIGHTS, device)
    pass


def _load_video_model(device: str):
    """영상 모델 로더 — video_model/ 폴더 추가 후 구현"""
    # sys.path.insert(0, os.path.join(BASE_DIR, "video_model"))
    # from model import load_model as load_video
    # return load_video(VIDEO_WEIGHTS, device)
    pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _image_model, _text_model, _video_model, _device
    _device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[ISY] 디바이스: {_device}")

    # 이미지 모델 (필수)
    print(f"[ISY] 이미지 모델 로드 중: {IMAGE_WEIGHTS}")
    _image_model = load_model(IMAGE_WEIGHTS, _device)
    print("[ISY] 이미지 모델 준비됨")

    # 텍스트 모델 (선택 — 폴더 있을 때만)
    if os.path.exists(TEXT_WEIGHTS):
        print("[ISY] 텍스트 모델 로드 중...")
        _text_model = _load_text_model(_device)
        print("[ISY] 텍스트 모델 준비됨")
    else:
        print("[ISY] 텍스트 모델 없음 — /api/analyze/text 비활성화")

    # 영상 모델 (선택 — 폴더 있을 때만)
    if os.path.exists(VIDEO_WEIGHTS):
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
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


class AnalyzeRequest(BaseModel):
    url: str
    media_type: Optional[str] = None
    page_url: Optional[str] = None

class TextRequest(BaseModel):
    text: str

class PlatformMeta(BaseModel):
    platform: Optional[str] = None   # 'youtube' | 'instagram' | null
    video_id: Optional[str] = None   # YouTube videoId, Instagram shortcode 등

class VideoRequest(BaseModel):
    # url: 직접 다운로드 가능한 영상 URL. blob: 영상이면 null.
    url: Optional[str] = None
    # platform_meta: url이 없을 때 플랫폼 API를 통해 영상을 가져오기 위한 식별자
    platform_meta: Optional[PlatformMeta] = None


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
            actual = unquote(params["src"][0]).strip('"')
            return actual, "https://www.naver.com/"
        return url, "https://www.naver.com/"

    # 도메인 기반 Referer 추론
    referer = f"{parsed.scheme}://{parsed.netloc}/"
    return url, referer


def fetch_image(url: str, page_url: Optional[str] = None) -> Image.Image:
    resolved_url, referer = resolve_image_url(url, page_url)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": referer,
    }
    resp = requests.get(resolved_url, headers=headers, timeout=10)
    resp.raise_for_status()

    content_type = resp.headers.get("content-type", "")
    if "text/html" in content_type:
        raise ValueError(f"이미지가 아닌 응답 반환됨 (content-type: {content_type})")

    img = Image.open(BytesIO(resp.content)).convert("RGB")
    img.load()
    return img


def run_inference(img_pil: Image.Image) -> dict:
    assert _image_model is not None and _device is not None, "이미지 모델이 로드되지 않았습니다"
    x_rgb, x_fft, crop_status = preprocess_image(img_pil)
    x_rgb = x_rgb.to(_device)
    x_fft = x_fft.to(_device)

    with torch.no_grad():
        logits = _image_model(x_rgb, x_fft)
        probs = F.softmax(logits, dim=1)[0]

    fake_prob = probs[0].item()
    real_prob = probs[1].item()

    return {
        "fake_probability": round(fake_prob, 4),
        "real_probability": round(real_prob, 4),
        "label": "REAL" if real_prob >= 0.5 else "FAKE",
        "consistency_score": round(real_prob * 100),
        "crop_status": crop_status,
        "model": "versionv9-fftB",
    }


@app.post("/api/analyze/image")
async def analyze_image(req: AnalyzeRequest):
    if not req.url:
        raise HTTPException(status_code=400, detail="url 필드가 필요합니다")

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
    # TODO: 영상 모델 담당자가 구현
    # 예시 흐름:
    #   frames = download_and_sample_frames(url, platform_meta)
    #   result = _video_model(frames)
    #   return { "fake_probability": ..., "label": ... }
    raise NotImplementedError("영상 추론 미구현 — video_model/ 폴더 및 run_video_inference() 구현 필요")


@app.post("/api/analyze/video")
async def analyze_video(req: VideoRequest):
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


if __name__ == "__main__":
    import uvicorn
    print("ISY 실제 추론 서버 시작: http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
