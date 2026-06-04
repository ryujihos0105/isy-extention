# 이 파일은 v3(CLIP-only) 이미지 전처리를 담당합니다.
# predict.py 의 to_image/main 전처리 경로와 동일:
#   1) 이미지를 (640, 360) 으로 LANCZOS 리사이즈  (학습과 동일 — 바꾸지 말 것)
#   2) open_clip 의 preprocess 적용
#   3) encode_image → L2 정규화 → CLIP 임베딩 (in_dim,) 반환
#
# v9/v12 와 달리 얼굴 크롭 / FFT 가 없다. 모델(model.py)은 이 임베딩만 입력받는다.

import os

import torch
from PIL import Image
import open_clip

from config import CLIP_MODEL_NAME, CLIP_PRETRAINED, RESIZE


# ── 디바이스 ──────────────────────────────────────────────
_DEVICE = os.environ.get("SIMCAP_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")


# ── best.pt 메타에서 백본/리사이즈 설정 읽기 (predict.py 와 동일하게 유지) ──
# 체크포인트에 backbone/pretrained/resize 가 들어있으면 그것을 우선 사용하고,
# 없으면 config.py 기본값으로 폴백한다.
_CKPT_PATH = os.path.join(os.path.dirname(__file__), "weights", "best.pt")
_backbone, _pretrained, _resize = CLIP_MODEL_NAME, CLIP_PRETRAINED, tuple(RESIZE)
try:
    _ck = torch.load(_CKPT_PATH, map_location="cpu", weights_only=False)
    _backbone   = _ck.get("backbone", _backbone)
    _pretrained = _ck.get("pretrained", _pretrained)
    _resize     = tuple(_ck.get("resize", _resize))
    del _ck
except Exception:
    pass  # 메타 읽기 실패 시 config.py 기본값 사용


# ── CLIP 모델 초기화 ──────────────────────────────────────
# 전역으로 한 번만 로드. 가중치는 최초 실행 시 자동 다운로드된다(ViT-L-14 약 1.7GB).
_clip_model, _, _clip_preprocess = open_clip.create_model_and_transforms(
    _backbone, pretrained=_pretrained
)
_clip_model = _clip_model.to(_DEVICE).eval()
for _p in _clip_model.parameters():
    _p.requires_grad = False


# CLIP-only 모델은 얼굴 크롭을 하지 않으므로 항상 동일한 상태 문자열을 쓴다.
CROP_NA = "해당 없음 (CLIP-only)"


def get_clip_feature(img_pil: Image.Image) -> torch.Tensor:
    """리사이즈된 PIL 이미지 → L2 정규화된 CLIP 임베딩 (in_dim,) CPU 텐서."""
    im = img_pil.convert("RGB").resize(_resize, Image.LANCZOS)
    clip_in = _clip_preprocess(im).unsqueeze(0).to(_DEVICE)
    with torch.no_grad():
        feat = _clip_model.encode_image(clip_in)
        feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat.squeeze(0).cpu().float()  # (in_dim,)


def preprocess_image(image_source) -> tuple[torch.Tensor, str]:
    """이미지(경로 또는 PIL.Image) → (x_clip[1, in_dim], crop_status).

    server.py 의 run_inference 는 길이 2 튜플을 단일 입력 모델로 처리한다.
    """
    try:
        if isinstance(image_source, Image.Image):
            img_pil = image_source.convert("RGB")
        else:
            img_pil = Image.open(image_source).convert("RGB")
    except FileNotFoundError:
        raise FileNotFoundError(f"[에러] 이미지 파일을 찾을 수 없습니다: {image_source}")
    except Exception as e:
        raise RuntimeError(f"[에러] 이미지 로드 실패: {e}")

    x_clip = get_clip_feature(img_pil)        # (in_dim,)
    return x_clip.unsqueeze(0), CROP_NA       # (1, in_dim), 상태
