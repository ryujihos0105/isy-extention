# 이 파일은 v3(CLIP-only) 모델의 설정값을 담당합니다.
# predict.py + tunmbs.pt 와 동일한 구조 — CLIP ViT-L-14 임베딩 → Linear(768→1) → sigmoid → P(AI)
# v9/v12 와 달리 FFT/얼굴크롭 없음. 유튜브 썸네일(640x360) 특화 모델.

# ── 경로 설정 ─────────────────────────────────────────────
MODEL_PATH = "weights/best.pt"   # tunmbs.pt 복사본 (state_dict + 메타 포함)

# ── CLIP 백본 기본값 ──────────────────────────────────────
# 실제 값은 best.pt 안의 메타(backbone/pretrained/resize/in_dim)를 우선 사용한다.
# 아래는 메타가 없을 때를 대비한 폴백 기본값.
CLIP_MODEL_NAME = "ViT-L-14"     # open_clip 백본
CLIP_PRETRAINED = "openai"       # 사전학습 가중치 (최초 실행 시 약 1.7GB 자동 다운로드)
CLIP_FEAT_DIM   = 768            # ViT-L-14 이미지 임베딩 차원
RESIZE          = (640, 360)     # CLIP 전처리 전 리사이즈 (학습과 동일하게 유지)
