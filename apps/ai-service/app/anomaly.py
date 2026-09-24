from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import IsolationForest

from .schemas import AnonymousRiskFeatures


DEVICE_CLASSES = ("desktop", "mobile", "tablet", "unknown")
DURATION_BANDS = ("under_20_seconds", "20_to_60_seconds", "over_60_seconds")
RATE_BUCKETS = ("normal", "elevated", "high")


@dataclass(frozen=True)
class ScoredAnomaly:
    risk_score: float
    reasons: list[str]


def _encode(
    device_class: str,
    completion_duration_band: str,
    request_rate_bucket: str,
    replay_indicator: bool,
) -> list[float]:
    return [
        *[float(device_class == value) for value in DEVICE_CLASSES],
        *[float(completion_duration_band == value) for value in DURATION_BANDS],
        *[float(request_rate_bucket == value) for value in RATE_BUCKETS],
        float(replay_indicator),
    ]


def _training_samples() -> np.ndarray:
    rng = np.random.default_rng(42)
    rows = []
    for _ in range(768):
        rows.append(
            _encode(
                str(rng.choice(DEVICE_CLASSES, p=(0.58, 0.29, 0.12, 0.01))),
                str(rng.choice(DURATION_BANDS, p=(0.05, 0.68, 0.27))),
                str(rng.choice(RATE_BUCKETS, p=(0.95, 0.05, 0.0))),
                False,
            )
        )
    return np.asarray(rows, dtype=np.float64)


class IsolationForestScorer:
    def __init__(self) -> None:
        self._model = IsolationForest(
            n_estimators=200,
            contamination=0.05,
            random_state=42,
            n_jobs=1,
        )
        self._model.fit(_training_samples())

    def score(self, features: AnonymousRiskFeatures) -> ScoredAnomaly:
        vector = np.asarray(
            [
                _encode(
                    features.device_class.value,
                    features.completion_duration_band.value,
                    features.request_rate_bucket.value,
                    features.replay_indicator,
                )
            ],
            dtype=np.float64,
        )
        normality = float(self._model.decision_function(vector)[0])
        model_risk = float(np.clip(0.5 - (normality * 2.5), 0.0, 1.0))
        policy_floor = 0.0
        reasons: list[str] = []

        if features.replay_indicator:
            policy_floor = max(policy_floor, 0.98)
            reasons.append("A token replay signal was present.")
        if features.request_rate_bucket.value == "high":
            policy_floor = max(policy_floor, 0.85)
            reasons.append("The anonymous ballot arrival rate was unusually high.")
        elif features.request_rate_bucket.value == "elevated":
            policy_floor = max(policy_floor, 0.45)
            reasons.append("The anonymous ballot arrival rate was elevated.")
        if features.completion_duration_band.value == "under_20_seconds":
            policy_floor = max(
                policy_floor,
                0.78 if features.request_rate_bucket.value != "normal" else 0.5,
            )
            reasons.append("The completion-duration band was unusually short.")
        if features.device_class.value == "unknown":
            policy_floor = max(policy_floor, 0.4)
            reasons.append("The generic device class could not be determined.")
        if model_risk >= 0.65:
            reasons.append("The combined coarse-feature pattern differed from the baseline.")
        if not reasons:
            reasons.append("No significant anonymous risk signal was detected.")

        return ScoredAnomaly(
            risk_score=round(max(model_risk, policy_floor), 4),
            reasons=reasons,
        )
