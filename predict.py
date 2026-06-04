#!/usr/bin/env python3
"""
YouTube 썸네일 AI/Human 분류기 (v3) 추론 스크립트.

사용법:
  python predict.py thumb.jpg
  python predict.py https://youtu.be/VIDEOID          # 썸네일 자동 다운로드
  python predict.py a.jpg https://youtu.be/xxxx ...   # 여러 개 한 번에

필요 패키지:  pip install torch open_clip_torch pillow requests
같은 폴더에 필요한 파일:  clip_clf_v3.pt   (학습된 분류 헤드 + 메타)
* 첫 실행 시 CLIP 백본(약 1.7GB)을 open_clip이 자동 다운로드함(인터넷 필요).
* 전처리(640x360 리사이즈 + L2 정규화)는 학습과 동일하게 이 스크립트가 처리함.
"""
import sys, io, re, os
import torch, torch.nn as nn

CKPT = os.environ.get("MODEL_PT", "clip_clf_v3.pt")   # 경로 다르면 환경변수 MODEL_PT로 지정
THRESHOLD = 0.5                                        # P(AI) >= 0.5 -> AI

def load():
    ck = torch.load(CKPT, map_location="cpu")
    head = nn.Linear(ck["in_dim"], 1)
    head.load_state_dict(ck["state_dict"]); head.eval()
    import open_clip
    model, _, preprocess = open_clip.create_model_and_transforms(
        ck["backbone"], pretrained=ck["pretrained"])
    model.eval()
    return ck, head, model, preprocess

def to_image(src):
    from PIL import Image
    import requests
    m = re.search(r"(?:youtu\.be/|v=|/shorts/)([A-Za-z0-9_-]{11})", src)
    if m:                                              # 유튜브 URL/ID -> maxresdefault 썸네일
        r = requests.get(f"https://i.ytimg.com/vi/{m.group(1)}/maxresdefault.jpg", timeout=20)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")
    return Image.open(src).convert("RGB")              # 로컬 이미지 파일

def main(args):
    from PIL import Image
    ck, head, model, preprocess = load()
    resize = tuple(ck["resize"])
    print(f"# backbone={ck['backbone']}/{ck['pretrained']}  resize={resize}  "
          f"threshold={THRESHOLD}  (training OOF AUC={ck.get('oof_auc')})")
    for src in args:
        try:
            im = to_image(src).resize(resize, Image.LANCZOS)
            with torch.no_grad():
                e = model.encode_image(preprocess(im).unsqueeze(0))
                e = e / e.norm(dim=-1, keepdim=True)
                p_ai = torch.sigmoid(head(e.float())).item()
            label = "AI" if p_ai >= THRESHOLD else "HUMAN"
            print(f"{label:5}  P(AI)={p_ai:.3f}   {src}")
        except Exception as ex:
            print(f"ERROR  {src}  ({ex})")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    main(sys.argv[1:])
