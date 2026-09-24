from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class DeviceClass(StrEnum):
    DESKTOP = "desktop"
    MOBILE = "mobile"
    TABLET = "tablet"
    UNKNOWN = "unknown"


class CompletionDurationBand(StrEnum):
    UNDER_20_SECONDS = "under_20_seconds"
    FROM_20_TO_60_SECONDS = "20_to_60_seconds"
    OVER_60_SECONDS = "over_60_seconds"


class RequestRateBucket(StrEnum):
    NORMAL = "normal"
    ELEVATED = "elevated"
    HIGH = "high"


class AnonymousRiskFeatures(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_class: DeviceClass
    completion_duration_band: CompletionDurationBand
    request_rate_bucket: RequestRateBucket
    replay_indicator: bool


class AnomalyAssessment(BaseModel):
    risk_score: float = Field(ge=0.0, le=1.0)
    quarantined: bool
    threshold: float = Field(ge=0.0, le=1.0)
    model_version: str
    reasons: list[str]
