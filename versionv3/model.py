# 이 파일은 v3(CLIP-only) 모델 구조 정의를 담당합니다.
# predict.py 의 분류 헤드와 동일: L2 정규화된 CLIP 이미지 임베딩 → Linear(in_dim→1) → sigmoid → P(AI)
#
# 서버(server.py)의 run_inference 는 logits 를 받아 F.softmax(dim=1) 후
# index 0 = Fake, index 1 = Real 로 해석한다.
# 따라서 sigmoid 단일 로짓 z 를 2-class 로짓 [z, 0] 으로 변환하면
#   softmax([z, 0]) = [sigmoid(z), 1 - sigmoid(z)] = [P(AI), P(Human)] = [Fake, Real]
# 가 되어 predict.py(THRESHOLD=0.5, P(AI)>=0.5 → AI)와 정확히 동일한 판정을 낸다.

import torch
import torch.nn as nn


class ClipLinearModel(nn.Module):
    """tunmbs.pt 의 분류 헤드를 2-class 로짓 인터페이스로 감싼 래퍼.

    forward 입력은 이미 L2 정규화된 CLIP 임베딩 (B, in_dim) — CLIP 백본 인코딩은
    preprocess.py 가 담당한다 (v12 가 get_clip_feature 를 preprocess 에 둔 것과 동일 패턴).
    """

    def __init__(self, in_dim: int, positive_index: int = 1):
        super().__init__()
        self.head = nn.Linear(in_dim, 1)
        # tunmbs.pt: classes={0:'human', 1:'ai'}, positive_index=1
        # → sigmoid(head) = P(positive=ai). positive_index 가 0이면 의미가 뒤집히므로 보정.
        self.positive_index = positive_index

    def forward(self, x_clip: torch.Tensor) -> torch.Tensor:
        z = self.head(x_clip)                  # (B, 1) — positive 클래스 로짓
        if self.positive_index == 0:           # positive 가 human 이면 부호 반전해 P(AI) 로 통일
            z = -z
        zeros = torch.zeros_like(z)            # Human(=Real) 기준 로짓 0
        return torch.cat([z, zeros], dim=1)    # (B, 2) = [Fake(AI) 로짓, Real(Human) 로짓]


def load_model(model_path: str, device: str) -> ClipLinearModel:
    """저장된 가중치(tunmbs.pt 형식)를 불러와 추론 준비 상태의 헤드 모델을 반환한다."""
    try:
        ck = torch.load(model_path, map_location=device, weights_only=False)
    except FileNotFoundError:
        raise FileNotFoundError(f"[에러] 가중치 파일을 찾을 수 없습니다: {model_path}")

    in_dim = int(ck["in_dim"])
    positive_index = int(ck.get("positive_index", 1))

    model = ClipLinearModel(in_dim=in_dim, positive_index=positive_index)
    model.head.load_state_dict(ck["state_dict"])
    model.to(device)
    model.eval()
    return model
