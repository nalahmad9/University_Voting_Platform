import assert from "node:assert/strict";
import test from "node:test";

import {
  assessAnonymousVote,
  fallbackAnomalyAssessment
} from "./anomaly-intelligence.js";

test("ordinary coarse features stay below the fallback quarantine threshold", () => {
  const assessment = fallbackAnomalyAssessment({
    deviceClass: "desktop",
    completionDurationBand: "20_to_60_seconds",
    requestRateBucket: "normal",
    replayIndicator: false
  });

  assert.equal(assessment.quarantined, false);
  assert.ok(assessment.riskScore < assessment.threshold);
});

test("high aggregate rate or replay signals trigger fallback quarantine", () => {
  const highRate = fallbackAnomalyAssessment({
    deviceClass: "mobile",
    completionDurationBand: "20_to_60_seconds",
    requestRateBucket: "high",
    replayIndicator: false
  });
  const replay = fallbackAnomalyAssessment({
    deviceClass: "tablet",
    completionDurationBand: "over_60_seconds",
    requestRateBucket: "normal",
    replayIndicator: true
  });

  assert.equal(highRate.quarantined, true);
  assert.equal(replay.quarantined, true);
});

test("AI service receives only the four approved coarse features", async () => {
  const originalFetch = globalThis.fetch;
  let submittedBody: unknown;
  globalThis.fetch = async (_input, init) => {
    submittedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      risk_score: 0.18,
      quarantined: false,
      threshold: 0.75,
      model_version: "isolation-forest-v1",
      reasons: ["No significant anonymous risk signal was detected."]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const assessment = await assessAnonymousVote({
      deviceClass: "desktop",
      completionDurationBand: "20_to_60_seconds",
      requestRateBucket: "normal",
      replayIndicator: false
    });

    assert.deepEqual(submittedBody, {
      device_class: "desktop",
      completion_duration_band: "20_to_60_seconds",
      request_rate_bucket: "normal",
      replay_indicator: false
    });
    assert.equal(assessment.source, "isolation-forest");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
