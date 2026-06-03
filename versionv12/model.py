# 이 파일은 Triple Fusion 모델 구조 정의를 담당합니다 (v12)
# v9 (2-branch: RGB + FFT) 대비 v12는 CLIP 브랜치를 추가한 3-branch Late Fusion

import torch
import torch.nn as nn
import timm

from config import CLIP_FEAT_DIM


# Triple Fusion 모델 클래스 (노트북 Cell 11 TripleFusionModel과 동일 구조)
# RGB / FFT / CLIP 세 브랜치가 각각 특징을 추출한 뒤, 합쳐서 최종 판단
class TripleFusionModel(nn.Module):
    """
    구조:
      rgb_branch  : EfficientNet-B4 (num_classes=0) → (B, 1792)
      fft_branch  : EfficientNet-B4 (num_classes=0) → (B, 1792)
      clip_proj   : Linear(512, 512) → ReLU → Dropout(0.2)  ← CLIP feature 투영
      concat      : (B, 1792 + 1792 + 512) = (B, 4096)
      fusion_head : Linear(4096, 512) → ReLU → Dropout(0.3)
                    → Linear(512, 128) → ReLU → Dropout(0.2)
                    → Linear(128, 2)
    출력 logits: index 0 = Fake, index 1 = Real
    """

    def __init__(self, clip_feat_dim: int = CLIP_FEAT_DIM):
        super().__init__()
        # 각 EfficientNet 브랜치는 classifier 제거 (feature extractor 전용)
        # 추론 데모이므로 pretrained=False (가중치를 state_dict로 직접 로드)
        self.rgb_branch = timm.create_model("efficientnet_b4", pretrained=False, num_classes=0)
        self.fft_branch = timm.create_model("efficientnet_b4", pretrained=False, num_classes=0)

        self.clip_proj = nn.Sequential(
            nn.Linear(clip_feat_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.2),
        )

        feat_dim  = self.rgb_branch.num_features  # EfficientNet-B4: 1792
        total_dim = feat_dim + feat_dim + 512      # 1792 + 1792 + 512 = 4096
        self.fusion_head = nn.Sequential(
            nn.Linear(total_dim, 512), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(512, 128),       nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(128, 2),         # 최종 출력: [Fake, Real]
        )

    def forward(self, x_rgb: torch.Tensor, x_fft: torch.Tensor, x_clip: torch.Tensor) -> torch.Tensor:
        rgb_f  = self.rgb_branch(x_rgb)                       # (B, 1792)
        fft_f  = self.fft_branch(x_fft)                       # (B, 1792)
        clip_f = self.clip_proj(x_clip)                       # (B, 512)
        fused  = torch.cat([rgb_f, fft_f, clip_f], dim=1)     # (B, 4096)
        return self.fusion_head(fused)                        # (B, 2)


# 저장된 가중치를 불러와 추론 준비 상태의 모델을 반환하는 함수
def load_model(model_path: str, device: str) -> TripleFusionModel:
    model = TripleFusionModel()

    try:
        state_dict = torch.load(model_path, map_location=device, weights_only=True)
        model.load_state_dict(state_dict)
    except FileNotFoundError:
        raise FileNotFoundError(f"[에러] 가중치 파일을 찾을 수 없습니다: {model_path}")
    except RuntimeError as e:
        raise RuntimeError(f"[에러] 가중치 로드 실패 (모델 구조가 맞지 않을 수 있습니다): {e}")

    model.to(device)
    model.eval()  # 추론 모드로 전환 (Dropout, BatchNorm 비활성화)
    return model
