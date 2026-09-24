import { access } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const webUrl = process.env.BOT_TEST_WEB_URL ?? "http://localhost:5173";
const aiUrl = process.env.BOT_TEST_AI_URL ?? "http://localhost:8000";
const attempts = Number(process.env.BOT_TEST_ATTEMPTS ?? "20");
const executableCandidates = [
  process.env.CHROME_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

async function chromeExecutable() {
  for (const candidate of executableCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known local Chrome location.
    }
  }
  throw new Error("Chrome was not found. Set CHROME_EXECUTABLE_PATH before running this simulation.");
}

const browser = await puppeteer.launch({
  executablePath: await chromeExecutable(),
  headless: true,
  args: ["--no-first-run", "--disable-background-networking"]
});

try {
  const page = await browser.newPage();
  await page.goto(webUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("input[autocomplete='username']", { timeout: 15_000 });

  const assessments = await Promise.all(Array.from({ length: attempts }, async () => {
    const response = await fetch(`${aiUrl}/v1/anomaly/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        device_class: "unknown",
        completion_duration_band: "under_20_seconds",
        request_rate_bucket: "high",
        replay_indicator: false
      })
    });
    if (!response.ok) throw new Error(`Anomaly service returned ${response.status}`);
    return response.json();
  }));

  const missed = assessments.filter(item => !item.quarantined || item.risk_score < item.threshold);
  if (missed.length > 0) throw new Error(`${missed.length} high-velocity attempts were not quarantined`);
  console.log(`Verified ${assessments.length} simulated high-velocity attempts were auto-quarantined.`);
} finally {
  await browser.close();
}
