# ISY — I See You

웹 페이지의 이미지·영상·텍스트가 AI로 생성된 콘텐츠인지 브라우저에서 실시간으로 탐지하는 Chrome 확장 프로그램입니다.

확장 프로그램이 페이지의 미디어를 수집하면, 로컬 FastAPI 서버가 PyTorch 모델로 REAL/FAKE 확률을 계산하고, 결과 배지를 페이지 위에 바로 표시합니다.

```
브라우저 (content.js)
    └─► background.js (Service Worker)
            └─► localhost:8000 (FastAPI + PyTorch)
                    └─► REAL / FAKE 확률 반환
```

## 구현 상태

| 영역 | 상태 | 비고 |
|------|------|------|
| 이미지 분석 | ✅ 완성 | EfficientNet-B4 Late Fusion + FFT (versionv9) |
| 텍스트 분석 | 🔲 엔드포인트만 준비 | `text_model/` 폴더 추가 시 활성화 |
| 영상 분석 | 🔲 엔드포인트만 준비 | `video_model/` 폴더 추가 시 활성화 |
| 확장 프로그램 UI | ✅ 완성 | 팝업, 배지, 페이지 스캔, 우클릭 분석 |
| Mock 서버 | ✅ 완성 | 모델 없이 UI 동작 확인 가능 |

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

`*.pt` 파일은 Git에 포함되지 않습니다. 팀에서 공유받은 가중치 파일을 아래 경로에 넣어주세요.

```
versionv9/weights/best.pt
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
│   ├── background.js            # Service Worker — API 호출, LRU 캐시
│   ├── content.js               # 페이지 스캔, 배지 표시
│   ├── content.css
│   ├── lib/
│   │   ├── namespace.js         # ISY 전역 네임스페이스
│   │   ├── site-adapters.js     # 사이트별 DOM 어댑터 (YouTube, Instagram 등)
│   │   ├── media-extractor.js   # 이미지·영상·텍스트 후보 수집
│   │   ├── badge-manager.js     # 배지 DOM 부착/제거
│   │   ├── ui-manager.js        # 배지 렌더링, 상세 오버레이
│   │   └── observer.js          # DOM 변화·URL 변화 감지
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
├── versionv9/                   # 이미지 판별 모델 (완성)
│   ├── model.py                 # EfficientNet-B4 Late Fusion 정의
│   ├── preprocess.py            # 얼굴 크롭 + FFT 방식 B 전처리
│   ├── config.py                # 경로·하이퍼파라미터 설정
│   └── weights/
│       └── best.pt              # 학습된 가중치 (Git 미포함 — 별도 공유)
├── server.py                    # FastAPI 추론 서버
├── mock_server.py               # 테스트용 Mock 서버
└── requirements.txt             # Python 의존성
```

---

## API

### `POST /api/analyze/image`

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

### `POST /api/analyze/text` / `POST /api/analyze/video`

현재 엔드포인트만 준비된 상태입니다. 각 모델 폴더(`text_model/`, `video_model/`)를 추가하면 자동으로 활성화됩니다.

---

## 새 모델 추가 방법

`versionv9/`와 동일한 구조로 폴더를 만들면 됩니다.

```
text_model/          또는       video_model/
├── model.py                    ├── model.py
├── preprocess.py               ├── preprocess.py
├── config.py                   ├── config.py
└── weights/best.pt             └── weights/best.pt
```

그다음 `server.py`의 `_load_text_model()` 또는 `_load_video_model()` 함수를 구현하고 서버를 재시작합니다.

---

## 주의사항

- 모델 가중치(`*.pt`)는 `.gitignore`로 Git에 포함되지 않습니다. 팀 내 별도 채널(Google Drive, Hugging Face Hub 등)로 공유하세요.
- 서버는 `localhost:8000`에서만 요청을 수신합니다. 외부에서는 접근할 수 없습니다.
- 확장 프로그램은 모든 URL에서 실행되므로 온라인 뱅킹 등 민감한 사이트에서 사용 시 주의하세요.
