"""
ISY 모의 백엔드 서버
실제 모델 없이 확장 프로그램 UI/동작을 테스트할 때 사용.
"""

import random
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


class AnalyzeRequest(BaseModel):
    url: str
    media_type: str | None = None

class TextRequest(BaseModel):
    text: str

class VideoRequest(BaseModel):
    url: str | None = None
    platform_meta: dict | None = None


@app.post("/api/analyze/image")
async def analyze_image(req: AnalyzeRequest):
    # 테스트용: URL에 특정 키워드가 있으면 AI 생성으로 판정
    keywords = ["ai", "generated", "fake", "synthetic", "midjourney", "dalle"]
    is_suspicious = any(kw in req.url.lower() for kw in keywords)

    fake_prob = random.uniform(0.6, 0.95) if is_suspicious else random.uniform(0.05, 0.35)

    return {
        "url": req.url,
        "media_type": "image",
        "fake_probability": round(fake_prob, 4),
        "consistency_score": round((1 - fake_prob) * 100),
        "model": "mock-v1",
    }


@app.post("/api/analyze/video")
async def analyze_video(req: VideoRequest):
    fake_prob = random.uniform(0.1, 0.9)

    return {
        "url": req.url,
        "media_type": "video",
        "fake_probability": round(fake_prob, 4),
        "consistency_score": round((1 - fake_prob) * 100),
        "model": "mock-v1",
    }


@app.post("/api/analyze/text")
async def analyze_text(req: TextRequest):
    text = req.text

    # AI가 생성한 한국어 텍스트에서 자주 나타나는 패턴
    ko_patterns = [
        # 접속어/부사 과다 사용
        "또한", "뿐만 아니라", "더불어", "아울러", "나아가",
        "따라서", "그러므로", "결론적으로", "궁극적으로", "무엇보다도",
        # AI 특유의 형식적 표현
        "살펴보겠습니다", "알아보겠습니다", "중요합니다", "필요합니다",
        "다양한 측면", "여러 가지 측면", "이러한 관점", "핵심적인",
        "효과적으로", "체계적으로", "지속적으로", "포괄적으로",
        "심층적으로", "전반적으로", "구체적으로 살펴",
        # 틀에 박힌 마무리
        "이상으로", "정리하자면", "요약하면", "마지막으로",
    ]

    # 영어 패턴도 유지
    en_patterns = [
        "delve", "certainly", "moreover", "furthermore",
        "it is worth noting", "in conclusion", "as an ai",
        "in today's world", "in the realm of",
    ]

    ko_hits = sum(1 for p in ko_patterns if p in text)
    en_hits = sum(1 for p in en_patterns if p in text.lower())
    total_hits = ko_hits + en_hits

    base = min(0.35 + total_hits * 0.08, 0.95)
    fake_prob = base + random.uniform(-0.05, 0.05)
    fake_prob = max(0.0, min(1.0, fake_prob))

    return {
        "media_type": "text",
        "fake_probability": round(fake_prob, 4),
        "consistency_score": round((1 - fake_prob) * 100),
        "text_length": len(req.text),
        "model": "mock-v1",
    }


if __name__ == "__main__":
    import uvicorn
    print("ISY 모의 서버 시작: http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
