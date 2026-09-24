import { z } from "zod";
import { env } from "../config/env.js";

export type DeviceClass = "desktop" | "mobile" | "tablet" | "unknown";
export type CompletionDurationBand =
  | "under_20_seconds"
  | "20_to_60_seconds"
  | "over_60_seconds";
export type RequestRateBucket = "normal" | "elevated" | "high";

export interface AnonymousAnomalyFeatures {
  deviceClass: DeviceClass;
  completionDurationBand: CompletionDurationBand;
  requestRateBucket: RequestRateBucket;
  replayIndicator: boolean;
}

export interface AnomalyAssessment {
  riskScore: number;
  quarantined: boolean;
  threshold: number;
  modelVersion: string;
  reasons: string[];
  source: "isolation-forest" | "local-fallback";
}

const responseSchema = z.object({
  risk_score: z.number().min(0).max(1),
  quarantined: z.boolean(),
  threshold: z.number().min(0).max(1),
  model_version: z.string().min(1),
  reasons: z.array(z.string().min(1)).min(1)
}).strict();

export function fallbackAnomalyAssessment(
  features: AnonymousAnomalyFeatures
): AnomalyAssessment {
  let riskScore = 0;
  const reasons: string[] = [];

  if (features.completionDurationBand === "under_20_seconds") {
    riskScore += 0.35;
    reasons.push("The completion-duration band was unusually short.");
  }
  if (features.deviceClass === "unknown") {
    riskScore += 0.1;
    reasons.push("The generic device class could not be determined.");
  }
  if (features.requestRateBucket === "elevated") {
    riskScore += 0.35;
    reasons.push("The anonymous ballot arrival rate was elevated.");
  }
  if (features.requestRateBucket === "high") {
    riskScore += 0.8;
    reasons.push("The anonymous ballot arrival rate was unusually high.");
  }
  if (features.replayIndicator) {
    riskScore += 0.8;
    reasons.push("A token replay signal was present.");
  }

  riskScore = Math.min(1, riskScore);
  return {
    riskScore,
    quarantined: riskScore >= 0.75,
    threshold: 0.75,
    modelVersion: "privacy-rules-fallback-v1",
    reasons: reasons.length > 0
      ? reasons
      : ["No significant anonymous risk signal was detected."],
    source: "local-fallback"
  };
}

export async function assessAnonymousVote(
  features: AnonymousAnomalyFeatures
): Promise<AnomalyAssessment> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.AI_SERVICE_URL}/v1/anomaly/score`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        device_class: features.deviceClass,
        completion_duration_band: features.completionDurationBand,
        request_rate_bucket: features.requestRateBucket,
        replay_indicator: features.replayIndicator
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Anomaly service rejected the feature set");
    const assessment = responseSchema.parse(await response.json());

    return {
      riskScore: assessment.risk_score,
      quarantined: assessment.quarantined,
      threshold: assessment.threshold,
      modelVersion: assessment.model_version,
      reasons: assessment.reasons,
      source: "isolation-forest"
    };
  } catch {
    return fallbackAnomalyAssessment(features);
  } finally {
    clearTimeout(timeout);
  }
}
