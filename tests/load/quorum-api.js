import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    peak_public_traffic: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 20 },
        { duration: "30s", target: 50 },
        { duration: "15s", target: 0 }
      ],
      gracefulRampDown: "5s"
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"]
  }
};

const apiUrl = __ENV.K6_API_URL || "http://localhost:4000/api/v1";
const missingReceipt = "a".repeat(64);

export default function () {
  const health = http.get(`${apiUrl}/health`);
  check(health, { "API health is available": response => response.status === 200 });

  const database = http.get(`${apiUrl}/health/database`);
  check(database, { "database health is available": response => response.status === 200 });

  const lookup = http.get(`${apiUrl}/public/receipts/${missingReceipt}`);
  check(lookup, { "unknown receipt is handled": response => response.status === 404 });
  sleep(0.25);
}
