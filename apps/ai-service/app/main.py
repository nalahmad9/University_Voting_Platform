from fastapi import FastAPI

from .anomaly import IsolationForestScorer
from .schemas import AnomalyAssessment, AnonymousRiskFeatures
from .settings import settings

app = FastAPI(title="Quorum AI Service", version="0.2.0")
scorer = IsolationForestScorer()


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "quorum-ai-service",
        "model": settings.anomaly_model_version,
    }


@app.post("/v1/anomaly/score", response_model=AnomalyAssessment)
async def score_anonymous_features(
    features: AnonymousRiskFeatures,
) -> AnomalyAssessment:
    scored = scorer.score(features)
    return AnomalyAssessment(
        risk_score=scored.risk_score,
        quarantined=scored.risk_score >= settings.anomaly_quarantine_threshold,
        threshold=settings.anomaly_quarantine_threshold,
        model_version=settings.anomaly_model_version,
        reasons=scored.reasons,
    )
