# ISY - I See You: AI 생성 콘텐츠 탐지 크롬 확장프로그램

## 프로젝트 개요
- 이미지, 텍스트, 영상이 AI로 생성됐는지 실시간 탐지
- 크롬 확장프로그램(Manifest V3)으로 사용자가 직접 입력하지 않아도 브라우저에서 자동 탐지
- 각 모달리티별 판별 모델은 개발 완료, 확장프로그램 통합 진행 중

## 현재 상태
- 이미지 모델: `versionv9/` (LateFusionModel, PyTorch) — 완성
- 텍스트 모델: `text_model/` 폴더 추가 시 활성화 예정
- 영상 모델: `video_model/` 폴더 추가 시 활성화 예정
- 백엔드: FastAPI (`server.py`), localhost:8000

## 기술 스택
- 프론트엔드: Chrome Extension MV3 (Vanilla JS)
- 백엔드: FastAPI + PyTorch
- 통신 흐름: `content.js` → `background.js` (Service Worker) → `localhost:8000`

## 프로젝트 구조
```
isy-extention/
├── manifest.json          # MV3 설정, 권한: activeTab, storage, scripting, contextMenus
├── background.js          # Service Worker, API 요청 처리, LRU 캐시(200개, TTL 30분)
├── content.js             # 콘텐츠 스크립트 진입점, 배지 표시
├── content.css            # 배지/오버레이 스타일
├── server.py              # FastAPI 실제 추론 서버
├── mock_server.py         # 테스트용 목 서버
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── lib/
│   ├── namespace.js       # ISY 전역 네임스페이스
│   ├── site-adapters.js   # 사이트별 어댑터 (pageType, containerFinder 지원)
│   ├── media-extractor.js # 미디어/텍스트 추출 (pageType 반영)
│   ├── badge-manager.js   # 배지 DOM 부착 (containerFinder는 어댑터에 위임)
│   ├── ui-manager.js      # 배지 렌더링 + 상세 오버레이 (position: fixed)
│   └── observer.js        # 미디어/텍스트 변화 감지, URL 변화 감지
└── versionv9/             # 이미지 판별 모델
    ├── model.py           # LateFusionModel 정의
    ├── preprocess.py      # 이미지 전처리
    ├── config.py          # 모델 경로 등 설정
    └── weights/best.pt    # 학습된 가중치
```

## API 엔드포인트
- `POST /api/analyze/image` → 이미지 판별 (versionv9, 완성)
- `POST /api/analyze/text`  → 텍스트 판별 (text_model/ 추가 시 활성화)
- `POST /api/analyze/video` → 영상 판별 (video_model/ 추가 시 활성화)

요청 형식: `{ "url": "...", "media_type": "image" }` 또는 `{ "text": "..." }`

## 새 모델 추가 방법 (server.py 주석 기준)
1. `{type}_model/` 폴더를 `versionv9/`와 동일한 구조로 생성
2. `server.py`의 `_load_{type}_model()` 함수 구현
3. 서버 재시작

## 개발 실행
```bash
python server.py        # 실제 추론 서버
python mock_server.py   # 목 서버 (모델 없이 테스트)
```
