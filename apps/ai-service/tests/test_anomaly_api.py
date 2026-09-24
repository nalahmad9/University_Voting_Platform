from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_reports_loaded_model() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["model"] == "isolation-forest-v1"


def test_ordinary_anonymous_pattern_is_not_quarantined() -> None:
    response = client.post(
        "/v1/anomaly/score",
        json={
            "device_class": "desktop",
            "completion_duration_band": "20_to_60_seconds",
            "request_rate_bucket": "normal",
            "replay_indicator": False,
        },
    )

    assert response.status_code == 200
    assessment = response.json()
    assert 0 <= assessment["risk_score"] < assessment["threshold"]
    assert assessment["quarantined"] is False


def test_replay_signal_is_automatically_quarantined() -> None:
    response = client.post(
        "/v1/anomaly/score",
        json={
            "device_class": "mobile",
            "completion_duration_band": "20_to_60_seconds",
            "request_rate_bucket": "normal",
            "replay_indicator": True,
        },
    )

    assert response.status_code == 200
    assessment = response.json()
    assert assessment["risk_score"] >= assessment["threshold"]
    assert assessment["quarantined"] is True


def test_identity_fields_are_rejected() -> None:
    response = client.post(
        "/v1/anomaly/score",
        json={
            "device_class": "desktop",
            "completion_duration_band": "20_to_60_seconds",
            "request_rate_bucket": "normal",
            "replay_indicator": False,
            "student_id": "must-not-be-accepted",
        },
    )

    assert response.status_code == 422
