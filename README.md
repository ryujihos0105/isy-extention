# ISY — I See You

웹 페이지의 이미지·영상·텍스트가 AI로 생성된 콘텐츠인지 브라우저에서 실시간으로 탐지하는 Chrome 확장 프로그램입니다.

확장 프로그램이 페이지의 미디어를 수집하면, 로컬 FastAPI 서버가 PyTorch 모델로 REAL/FAKE 확률을 계산하고, 결과 배지를 페이지 위에 바로 표시합니다.

```
브라우저 (content.js)
    └─► background.js (Service Worker)
            └─► localhost:8000 (FastAPI + PyTorch)
                    └─► REAL / FAKE 확률 반환
```

---

## 구현 상태

| 영역 | 상태 | 비고 |
|------|------|------|
| 이미지 분석 | ✅ 완성 | 3종 모델(v3 / v9 / v12) 한 줄 전환 — 아래 [이미지 모델 버전](#이미지-모델-버전-v3--v9--v12) 참고 |
| 영상 분석 | ✅ 완성 | EfficientNet-B0 앙상블 n=7 Median TTA (video_inference.py) |
| 텍스트 분석 | 🔲 엔드포인트 준비 중 | `text_model/` 폴더 추가 시 활성화 |
| 확장 프로그램 UI | ✅ 완성 | 팝업 모드 카드, 배지, 페이지 스캔, 우클릭 분석 |
| Mock 서버 | ✅ 완성 | 모델 없이 UI 동작 확인 가능 |
| 데모 플랫폼 | ✅ 완성 | DEMO 가상 플랫폼 — 업로드 스캔 애니메이션 + 링 게이지, ISY 검증 라벨 시연 |

### 판정 레벨 임계값

분석 결과의 `fake_probability`(AI 생성 확률)에 따라 3단계로 표시합니다. (`server.py > _result_level`)

| 레벨 | 조건 | 표시 |
|------|------|------|
| 의심 (high) | `fake_probability ≥ 0.70` | AI 생성 의심 |
| 주의 (mid) | `0.40 ≤ fake_probability < 0.70` | 주의 |
| 정상 (low) | `fake_probability < 0.40` | 실제(REAL) 추정 |

---

## 이미지 모델 버전 (v3 / v9 / v12)

이미지 판별 모델은 3종이 들어 있으며, `server.py` 상단의 **`IMAGE_MODEL_VERSION` 한 줄**만 바꾸고 서버를 재시작하면 전환됩니다. import 경로·가중치 경로·추론 분기는 모두 자동 처리됩니다.

```python
# server.py
IMAGE_MODEL_VERSION = "v3"   # "v3" | "v9" | "v12"
```

| 버전 | 구조 | 입력 특징 | 백본 | 디바이스 | 특징 / 용도 |
|------|------|----------|------|----------|------------|
| **v3** | CLIP-only (`ClipLinearModel`) | CLIP 임베딩만 | open-clip **ViT-L-14** (openai) | CPU 강제 | 얼굴 크롭·FFT 없음. **YouTube 썸네일(640×360) 특화**. `predict.py`/`tunmbs.pt`와 동일. 최초 실행 시 CLIP 가중치 약 1.7GB 자동 다운로드 |
| **v9** | LateFusion (`LateFusionModel`) | RGB + FFT | EfficientNet-B4 | GPU 가능 | 얼굴 크롭 + FFT 방식 B. 범용 이미지(인물 포함) 판별 |
| **v12** | TripleFusion (`TripleFusionModel`) | RGB + FFT + CLIP | EfficientNet + open-clip **ViT-B-32** | CPU 강제 (GPU OOM 회피) | v9에 CLIP 브랜치 추가. 가장 무겁지만 표현력 높음 |

> **CPU 강제 이유** — v3·v12는 CLIP 백본을 함께 올리면 GPU VRAM을 초과(OOM)하므로 `_IMAGE_MODEL_REGISTRY`에서 `force_cpu: True`로 강제합니다. v9는 GPU가 있으면 GPU를 사용합니다.

> **open-clip 의존성** — v3·v12를 쓰려면 `open-clip-torch`가 필요합니다(`requirements.txt`에 포함). 최초 실행 시 백본 가중치를 huggingface.co에서 내려받으며, 사내 프록시/백신 TLS 검사 환경에서는 `truststore`(Python ≥ 3.10) 또는 `pip-system-certs`(Python < 3.10)가 SSL 검증을 처리합니다.

각 버전이 반환하는 `model` 라벨: v3 → `versionv3-clipViTL14`, v9 → `versionv9-fftB`, v12 → `versionv12-tripleFusion`.

---

## 빠른 시작

### 1. 저장소 클론

```bash
git clone https://github.com/ryujihos0105/isy-extention.git
cd isy-extention
```

### 2. Python 환경 설정

Python 3.10 이상이 필요합니다.

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
```

### 3. 패키지 설치

**PyTorch는 환경에 맞는 버전을 먼저 설치하세요.**

```bash
# CUDA 11.8 (GPU)
pip install torch==2.7.1+cu118 torchvision==0.22.1+cu118 --index-url https://download.pytorch.org/whl/cu118

# CUDA 12.1 (GPU)
pip install torch==2.7.1+cu121 torchvision==0.22.1+cu121 --index-url https://download.pytorch.org/whl/cu121

# CPU only
pip install torch==2.7.1 torchvision==0.22.1
```

그다음 나머지 패키지를 설치합니다.

```bash
pip install -r requirements.txt
```

### 4. 모델 가중치 배치

`*.pt` 파일은 Git에 포함되지 않습니다. **[Hugging Face Hub](https://huggingface.co/ryujiho/isy-weights)** 에서 다운로드한 뒤 아래 경로에 넣어주세요.

**이미지 모델** — 사용할 버전(`IMAGE_MODEL_VERSION`)에 해당하는 가중치만 있으면 됩니다.

HF Hub 경로 → 로컬 경로:
```
image/v3/best.pt   →  versionv3/weights/best.pt    # v3 (CLIP-only)
image/v9/best.pt   →  versionv9/weights/best.pt    # v9 (LateFusion: RGB+FFT)
image/v12/best.pt  →  versionv12/weights/best.pt   # v12 (TripleFusion: RGB+FFT+CLIP)
```

> v3·v12는 위 `best.pt` 외에 open-clip 백본 가중치(ViT-L-14 / ViT-B-32)를 최초 실행 시 자동으로 내려받습니다.

**영상 모델** (앙상블 7개, 폴더는 이미 생성되어 있음)

HF Hub에서 `video/checkpoints_.../best.pt` → 로컬 경로:
```
video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_frame/best.pt
video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_frame/best.pt
video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_ff2f_holdout_frame/best.pt
video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_img320_frame/best.pt
video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_seed1337_frame/best.pt
video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_seed7_frame/best.pt
video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_df_holdout_frame/best.pt
```

### 5. 서버 실행

```bash
# 실제 모델로 실행
python server.py

# 모델 없이 UI만 테스트
python mock_server.py
```

서버가 실행되면 `http://localhost:8000` 에서 응답합니다.

### 6. 확장 프로그램 설치

1. Chrome에서 `chrome://extensions` 를 엽니다.
2. 오른쪽 위 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 클릭합니다.
4. 이 프로젝트의 `extension/` 폴더를 선택합니다.
5. 서버가 실행된 상태에서 아무 페이지나 열고, 팝업에서 **현재 페이지 분석**을 누릅니다.

---

## 프로젝트 구조

```
isy-extention/
├── extension/                   # Chrome 확장 프로그램
│   ├── manifest.json            # MV3 설정 (권한, 스크립트 목록)
│   ├── background.js            # Service Worker — API 호출, LRU 캐시(200개, TTL 30분)
│   ├── content.js               # 페이지 스캔, 배지 표시
│   ├── content.css
│   ├── lib/
│   │   ├── namespace.js         # ISY 전역 네임스페이스
│   │   ├── site-adapters.js     # 사이트별 DOM 어댑터 (YouTube, Instagram, Naver)
│   │   ├── media-extractor.js   # 이미지·영상·텍스트 후보 수집
│   │   ├── badge-manager.js     # 배지 DOM 부착/제거
│   │   ├── ui-manager.js        # 배지 렌더링, 상세 오버레이
│   │   └── observer.js          # DOM 변화·URL 변화 감지
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
├── versionv3/                   # 이미지 판별 모델 — CLIP-only (ViT-L-14)
│   ├── model.py                 # ClipLinearModel 정의 (CLIP 임베딩 → Linear → sigmoid)
│   ├── preprocess.py            # CLIP 인코딩 (640×360 리사이즈)
│   ├── config.py                # CLIP 백본·경로 설정
│   └── weights/best.pt          # 학습된 가중치 (Git 미포함)
├── versionv9/                   # 이미지 판별 모델 — LateFusion (RGB+FFT)
│   ├── model.py                 # EfficientNet-B4 Late Fusion 정의
│   ├── preprocess.py            # 얼굴 크롭 + FFT 방식 B 전처리
│   ├── config.py                # 경로·하이퍼파라미터 설정
│   └── weights/best.pt          # 학습된 가중치 (Git 미포함)
├── versionv12/                  # 이미지 판별 모델 — TripleFusion (RGB+FFT+CLIP)
│   ├── model.py                 # TripleFusionModel 정의 (CLIP ViT-B-32 브랜치 추가)
│   ├── preprocess.py            # 얼굴 크롭 + FFT + CLIP 인코딩
│   ├── config.py                # 경로·하이퍼파라미터·CLIP 설정
│   ├── requirements.txt         # v12 단독 사용 시 의존성 (open-clip-torch 포함)
│   └── weights/best.pt          # 학습된 가중치 (Git 미포함)
├── video_inference.py           # 영상 판별 모델 추론 (완성)
│   └── EfficientNet-B0 앙상블 n=7, Median TTA
├── video/                       # 영상 모델 관련 파일
│   ├── builder.py               # 모델 빌더
│   ├── masking.py               # 마스킹 유틸리티
│   ├── MODEL_HANDOFF.md         # 영상 모델 인수인계 문서
│   └── checkpoints_*/best.pt   # 앙상블 체크포인트 (Git 미포함)
├── demo_platform/               # 시연용 데모 플랫폼 (DEMO 가상 플랫폼, 다크 테마)
│   ├── disclosures.json         # 업로드 영상별 AI 공개 라벨 저장 (런타임 생성, Git 미포함)
│   ├── uploads/                 # 업로드된 영상 파일 (런타임 생성, Git 미포함)
│   └── static/
│       ├── browse.html / .js    # 홈 (영상 그리드, 호버 프리뷰 + AI 라벨)
│       ├── upload.html / .js    # 크리에이터 업로드 화면 (스캔 애니메이션 + 링 게이지)
│       ├── watch.html / .js     # 시청자 화면 (영상 위 ISY 검증 라벨, 처음 10초)
│       ├── utils.js             # 공통 유틸리티
│       └── demo.css             # 다크 테마 공통 스타일
├── server.py                    # FastAPI 추론 서버
├── mock_server.py               # 테스트용 Mock 서버
└── requirements.txt             # Python 의존성
```

---

## API

### 이미지 분석 — `POST /api/analyze/image`

```bash
curl -X POST http://localhost:8000/api/analyze/image \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/image.jpg"}'
```

```json
{
  "url": "https://example.com/image.jpg",
  "media_type": "image",
  "fake_probability": 0.1234,
  "real_probability": 0.8766,
  "label": "REAL",
  "consistency_score": 88,
  "crop_status": "성공",
  "model": "versionv9-fftB"
}
```

> `model` 값은 활성 `IMAGE_MODEL_VERSION`에 따라 달라집니다 — `versionv3-clipViTL14` / `versionv9-fftB` / `versionv12-tripleFusion`.

### 영상 분석 — `POST /api/analyze/video`

```bash
curl -X POST http://localhost:8000/api/analyze/video \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID", "platform_meta": {"platform": "youtube", "videoId": "VIDEO_ID"}}'
```

```json
{
  "url": "...",
  "media_type": "video",
  "fake_probability": 0.87,
  "real_probability": 0.13,
  "label": "FAKE",
  "model": "efficientnet-b0-ensemble-n7-median-tta"
}
```

### 텍스트 분석 — `POST /api/analyze/text`

현재 엔드포인트만 준비된 상태입니다. `text_model/` 폴더를 추가하면 자동으로 활성화됩니다.

### 데모 플랫폼

플랫폼 협약을 가정한 시연 화면(DEMO 가상 플랫폼, 다크 테마)입니다. 크리에이터가 업로드 페이지에서 영상을 올리면 스캔 애니메이션 + 링 게이지로 분석 과정을 보여주고, 서버가 결과를 `Platform Disclosure API` 형태로 저장한 뒤(`disclosures.json`), 시청자 화면에서 ISY 검증 라벨(영상 위, 처음 10초)로 표시합니다. (YouTube의 '광고 포함' 스타일 AI 공개 라벨 시나리오)

```bash
python server.py
```

| 화면 | URL |
|------|-----|
| 홈 (영상 그리드) | http://localhost:8000/demo/browse |
| 크리에이터 업로드 | http://localhost:8000/demo/upload |
| 시청자 화면 | http://localhost:8000/demo/watch/{video_id} |

관련 API:

| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/platform/demo-upload` | 영상 업로드 + 자동 분석 + disclosure 저장 |
| `GET /api/platform/disclosures` | 전체 disclosure 목록 (browse 페이지용) |
| `GET /api/platform/disclosures/{video_id}` | 단일 disclosure 조회 |
| `GET /api/platform/videos/{video_id}` | 저장된 영상 파일 스트리밍 |

---

## 새 모델 추가 방법

### 새 타입(텍스트 등) 모델 추가

`versionv9/`와 동일한 구조로 폴더를 만들거나 `video_inference.py`처럼 별도 모듈로 작성합니다.

```
text_model/
├── model.py
├── preprocess.py
├── config.py
└── weights/best.pt
```

그다음 `server.py`의 `_load_text_model()` 함수를 구현하고 서버를 재시작합니다.

### 새 이미지 모델 버전 추가 (versionvNN)

1. `versionvNN/` 폴더를 기존 버전과 동일한 구조로 생성합니다 (`model.py` / `preprocess.py` / `config.py` / `weights/best.pt`). `load_model` / `preprocess_image` 시그니처를 동일하게 맞춥니다.
2. `server.py`의 `_IMAGE_MODEL_REGISTRY`에 한 줄 추가합니다.
   ```python
   "vNN": {"folder": "versionvNN", "label": "...", "force_cpu": False},
   ```
3. `preprocess_image` 반환 튜플 길이가 기존과 다르면 `run_inference`의 분기를 확장합니다.
   - 길이 2 = v3형 (CLIP 임베딩 1개)
   - 길이 3 = v9형 (RGB + FFT)
   - 길이 4 = v12형 (RGB + FFT + CLIP)
4. `IMAGE_MODEL_VERSION = "vNN"`으로 바꾸고 서버를 재시작합니다.

---

## 개발자 디버그 옵션

사용자용 결과 라벨에는 판정에 필요한 정보만 표시합니다. 내부 분석 정보(콘텐츠 유형, 얼굴 크롭 결과, 모델명 등)는 기본적으로 숨겨져 있습니다.

개발 중 상세 결과 오버레이에서 내부 정보를 보고 싶으면 분석 대상 페이지의 DevTools 콘솔에서 아래 값을 켭니다.

```js
localStorage.setItem('isyDebugDetails', 'true')
```

다시 사용자 기본 표시로 되돌리려면:

```js
localStorage.removeItem('isyDebugDetails')
```

---

## 주의사항

- 모델 가중치(`*.pt`)는 `.gitignore`로 Git에 포함되지 않습니다. [Hugging Face Hub](https://huggingface.co/ryujiho/isy-weights) 에서 다운로드하세요.
- 서버는 `localhost:8000`에서만 요청을 수신합니다. 외부에서는 접근할 수 없습니다.
- 확장 프로그램은 모든 URL에서 실행되므로 온라인 뱅킹 등 민감한 사이트에서 사용 시 주의하세요.
