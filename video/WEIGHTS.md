# 영상 모델 가중치

각 체크포인트 폴더 안에 `best.pt` 파일을 넣어주세요. 폴더는 이미 만들어져 있습니다.

```
video/
├── checkpoints_..._ema_df_holdout_frame/
│   └── best.pt   ← 여기
├── checkpoints_..._ema_ff2f_holdout_frame/
│   └── best.pt   ← 여기
├── checkpoints_..._ema_frame/
│   └── best.pt   ← 여기
├── checkpoints_..._ema_img320_frame/
│   └── best.pt   ← 여기
├── checkpoints_..._ema_seed1337_frame/
│   └── best.pt   ← 여기
├── checkpoints_..._ema_seed7_frame/
│   └── best.pt   ← 여기
└── checkpoints_..._frame/
    └── best.pt   ← 여기 (총 7개)
```

7개 폴더 모두에 `best.pt`를 넣어야 앙상블 추론이 동작합니다.  
파일은 팀 내 공유 채널(Google Drive 등)에서 받을 수 있습니다.
