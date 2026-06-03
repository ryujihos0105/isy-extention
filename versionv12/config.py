# 이 파일은 데모 실행에 필요한 모든 설정값을 담당합니다 (v12 TripleFusion: RGB + FFT + CLIP)

# ── 경로 설정 ─────────────────────────────────────────────
MODEL_PATH = "weights/best.pt"             # v12 TripleFusion 학습 가중치 (노트북의 best_model.pt)
IMAGE_PATH = "../demo/samples/test.jpg"    # 추론할 이미지 기본 경로 (demo/ 폴더 참조)

# ── 모델/이미지 설정 ──────────────────────────────────────
IMG_SIZE    = 224            # 모델 입력 이미지 크기
FACE_MARGIN = 0.25           # 얼굴 크롭 시 여백 비율
PAD_RATIO   = 0.3            # 1차 탐지 실패 시 재탐지용 패딩 비율

# ── ImageNet 정규화 통계 (RGB / FFT 브랜치용) ─────────────
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

# ── FFT 방식 B 하이퍼파라미터 ─────────────────────────────
# 학습 시 (노트북 v12 CFG)와 동일하게 유지해야 함
FFT_CUTOFF    = 0.1     # 시그모이드 고주파 마스크 컷오프 (낮을수록 더 많은 고주파 통과)
FFT_STEEPNESS = 10.0    # 마스크 경계 선명도

# ── CLIP 브랜치 설정 ──────────────────────────────────────
# 학습 시 (노트북 v12 CFG)와 반드시 동일해야 함. CLIP 전처리/정규화는 open_clip이 담당.
CLIP_MODEL_NAME = "ViT-B-32"   # open_clip 백본
CLIP_PRETRAINED = "openai"     # 사전학습 가중치 (최초 실행 시 자동 다운로드)
CLIP_FEAT_DIM   = 512          # CLIP 이미지 임베딩 차원
