# ISY Extension

ISY(I See You)는 웹 페이지에 표시되는 이미지 콘텐츠가 AI로 생성되었을 가능성을 브라우저에서 바로 확인하기 위한 Chrome 확장 프로그램입니다.

확장 프로그램은 현재 페이지의 이미지와 영상 요소를 수집하고, 로컬에서 실행 중인 FastAPI 서버(`http://localhost:8000`)에 분석 요청을 보냅니다. 서버는 PyTorch 기반 이미지 판별 모델(`versionv9`)을 사용해 REAL/FAKE 확률을 반환하고, 확장 프로그램은 결과 배지를 페이지 위에 표시합니다.

## 주요 기능

- Chrome Extension Manifest V3 기반 브라우저 확장
- 현재 페이지에서 이미지, 영상 요소 자동 탐색
- 이미지 우클릭 메뉴를 통한 단일 콘텐츠 분석
- 페이지 전체 분석 및 결과 배지 표시
- 분석 결과 메모리 캐시 적용
- FastAPI 기반 로컬 추론 서버
- PyTorch EfficientNet-B4 Late Fusion 이미지 모델
- 개발 및 UI 테스트용 mock 서버 제공

## 현재 구현 상태

| 영역 | 상태 | 설명 |
| --- | --- | --- |
| 이미지 분석 | 구현됨 | `versionv9` 모델과 `weights/best.pt`를 사용합니다. |
| 텍스트 분석 | 서버 엔드포인트만 준비됨 | 실제 모델 로더는 아직 구현되어 있지 않습니다. |
| 영상 분석 | 서버 엔드포인트만 준비됨 | 실제 영상 모델 추론 함수는 아직 구현되어 있지 않습니다. |
| 확장 프로그램 UI | 구현됨 | 팝업, 배지, 페이지 스캔, 우클릭 분석을 포함합니다. |
| Mock 서버 | 구현됨 | 실제 모델 없이 확장 프로그램 동작을 확인할 수 있습니다. |

## 프로젝트 구조

```text
isy-extention/
├─ extension/
│  ├─ manifest.json              # Chrome 확장 프로그램 설정
│  ├─ background.js              # Service Worker, API 호출, 캐시, 컨텍스트 메뉴
│  ├─ content.js                 # 페이지 콘텐츠 스캔 및 분석 요청
│  ├─ content.css                # 페이지 배지/오버레이 스타일
│  ├─ lib/
│  │  ├─ namespace.js            # ISY 전역 네임스페이스
│  │  ├─ site-adapters.js        # 사이트별 DOM 탐색 어댑터
│  │  ├─ media-extractor.js      # 이미지/영상/텍스트 후보 추출
│  │  ├─ badge-manager.js        # 분석 배지 DOM 관리
│  │  ├─ ui-manager.js           # 결과 배지와 상세 UI 렌더링
│  │  └─ observer.js             # DOM 변경 및 URL 변경 감지
│  ├─ popup/
│  │  ├─ popup.html              # 확장 프로그램 팝업 화면
│  │  ├─ popup.css
│  │  └─ popup.js
│  └─ icons/
├─ versionv9/
│  ├─ model.py                   # EfficientNet-B4 Late Fusion 모델
│  ├─ preprocess.py              # 얼굴 크롭, FFT 변환, 이미지 전처리
│  ├─ config.py                  # 모델 경로와 전처리 설정
│  └─ weights/
│     └─ best.pt                 # 이미지 모델 가중치
├─ server.py                     # 실제 FastAPI 추론 서버
├─ mock_server.py                # 모델 없이 테스트하는 Mock 서버
├─ requirements.txt              # Python 의존성
└─ README.md
```

## 실행 준비

Python 3.10 이상을 권장합니다. GPU가 없어도 CPU로 실행할 수 있지만, 이미지 추론 속도는 GPU 환경이 더 빠릅니다.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

모델 가중치 파일은 GitHub에 올리지 않는 것을 권장합니다. 저장소를 새로 받은 사람은 다음 경로에 이미지 모델 가중치를 직접 넣어야 합니다.

```text
versionv9/weights/best.pt
```

## 서버 실행

실제 이미지 모델로 실행:

```bash
python server.py
```

모델 없이 확장 프로그램 UI만 확인:

```bash
python mock_server.py
```

서버가 정상 실행되면 기본 주소는 다음과 같습니다.

```text
http://localhost:8000
```

## Chrome 확장 프로그램 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위의 `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 누릅니다.
4. 이 프로젝트의 `extension/` 폴더를 선택합니다.
5. `python server.py` 또는 `python mock_server.py`를 실행한 상태에서 웹 페이지를 엽니다.
6. 확장 프로그램 팝업에서 `현재 페이지 분석`을 누릅니다.

## API 사용 예시

이미지 분석:

```bash
curl -X POST http://localhost:8000/api/analyze/image ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"https://example.com/image.jpg\",\"media_type\":\"image\"}"
```

응답 예시:

```json
{
  "url": "https://example.com/image.jpg",
  "media_type": "image",
  "fake_probability": 0.1234,
  "real_probability": 0.8766,
  "label": "REAL",
  "consistency_score": 88,
  "crop_status": "success",
  "model": "versionv9-fftB"
}
```

## 모델 추가 방법

텍스트나 영상 모델을 추가하려면 `server.py`의 확장 지점을 사용합니다.

1. `text_model/` 또는 `video_model/` 폴더를 `versionv9/`와 비슷한 구조로 만듭니다.
2. 각 폴더에 `model.py`, `config.py`, `preprocess.py`, `weights/best.pt`를 준비합니다.
3. `server.py`의 `_load_text_model()` 또는 `_load_video_model()`을 구현합니다.
4. 텍스트는 `/api/analyze/text`, 영상은 `/api/analyze/video` 응답 형식을 이미지 분석과 맞춥니다.

## 주의사항

- 현재 실제 추론이 완성된 영역은 이미지 모델입니다.
- `*.pt` 모델 가중치는 `.gitignore`에 포함되어 있어 Git에 자동으로 올라가지 않습니다.
- 확장 프로그램은 로컬 서버 `http://localhost:8000`에 요청하도록 설정되어 있습니다.
- 공개 배포 전에는 모델 가중치 배포 방식, 라이선스, 데이터 출처, 성능 지표를 별도로 정리하는 것이 좋습니다.

## GitHub에 새로 올리기

현재 폴더가 아직 Git 저장소가 아니라면 다음 순서로 올릴 수 있습니다.

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USER/REPOSITORY.git
git push -u origin main
```

`versionv9/weights/best.pt`는 `.gitignore` 때문에 커밋되지 않습니다. 모델 파일까지 공유해야 한다면 GitHub Releases, Google Drive, Hugging Face Hub 같은 별도 배포 위치를 README에 추가하는 방식을 권장합니다.
