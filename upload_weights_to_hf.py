"""
HF Hub에 ISY 모델 가중치(best.pt) 업로드 스크립트.
실행: python upload_weights_to_hf.py
"""

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

import requests
from pathlib import Path
from huggingface_hub import HfApi, create_repo, configure_http_backend


def _no_verify_session() -> requests.Session:
    session = requests.Session()
    session.verify = False
    return session

configure_http_backend(backend_factory=_no_verify_session)

BASE_DIR = Path(__file__).resolve().parent
HF_REPO_ID = "ryujiho/isy-weights"

FILES = {
    "image/best.pt": BASE_DIR / "versionv9" / "weights" / "best.pt",
    "video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_frame/best.pt":
        BASE_DIR / "video" / "checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_frame" / "best.pt",
    "video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_frame/best.pt":
        BASE_DIR / "video" / "checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_frame" / "best.pt",
    "video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_ff2f_holdout_frame/best.pt":
        BASE_DIR / "video" / "checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_ff2f_holdout_frame" / "best.pt",
    "video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_seed1337_frame/best.pt":
        BASE_DIR / "video" / "checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_seed1337_frame" / "best.pt",
    "video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_seed7_frame/best.pt":
        BASE_DIR / "video" / "checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_seed7_frame" / "best.pt",
    "video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_df_holdout_frame/best.pt":
        BASE_DIR / "video" / "checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_df_holdout_frame" / "best.pt",
    "video/checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_img320_frame/best.pt":
        BASE_DIR / "video" / "checkpoints_protocol_youtube_dataset_plus_local_videoonly_clean_robustaug_ema_img320_frame" / "best.pt",
}


def main():
    # huggingface-cli login 또는 HF_TOKEN 환경변수로 인증 필요
    api = HfApi()

    print(f"레포 생성 중: {HF_REPO_ID}")
    create_repo(HF_REPO_ID, repo_type="model", exist_ok=True, private=False)
    print("레포 준비 완료\n")

    for hf_path, local_path in FILES.items():
        if not local_path.exists():
            print(f"[SKIP] 로컬 파일 없음: {local_path}")
            continue

        size_mb = local_path.stat().st_size / (1024 ** 2)
        print(f"업로드 중: {hf_path} ({size_mb:.1f} MB)")
        api.upload_file(
            path_or_fileobj=str(local_path),
            path_in_repo=hf_path,
            repo_id=HF_REPO_ID,
            repo_type="model",
        )
        print(f"  완료: {hf_path}")

    print("\n모든 파일 업로드 완료!")
    print(f"레포: https://huggingface.co/{HF_REPO_ID}")


if __name__ == "__main__":
    main()
