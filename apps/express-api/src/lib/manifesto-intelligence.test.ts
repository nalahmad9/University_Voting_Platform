import assert from "node:assert/strict";
import test from "node:test";

import { isExactManifestoExcerpt, storedTopics } from "./manifesto-intelligence.js";

const manifesto = [
  "Transparency and accountability: I will publish monthly meeting summaries and a clear progress dashboard.",
  "Student welfare: I will create a peer wellbeing network and publish clear support referrals.",
  "Access and inclusion: I will introduce captions and hybrid participation for major student events.",
  "Academic and career support: I will organize internship workshops and peer tutoring sessions.",
  "Campus services: I will collect and publish student feedback about transport, laboratories, and study spaces.",
  "Sustainability: I will expand recycling points and campus water-refill stations.",
  "Clubs and community: I will create one shared events calendar for clubs and volunteering opportunities."
].join("\n");

test("derives grounded comparison positions from labelled manifesto sections", () => {
  const topics = storedTopics(null, manifesto);

  assert.equal(topics["Transparency and accountability"], "I will publish monthly meeting summaries and a clear progress dashboard.");
  assert.equal(topics["Student welfare"], "I will create a peer wellbeing network and publish clear support referrals.");
  assert.equal(topics["Access and inclusion"], "I will introduce captions and hybrid participation for major student events.");
  assert.equal(topics["Sustainability"], "I will expand recycling points and campus water-refill stations.");

  for (const position of Object.values(topics)) {
    assert.equal(isExactManifestoExcerpt(position, manifesto), true);
  }
});

test("derives useful topics from ordinary manifesto sentences", () => {
  const ordinaryManifesto = [
    "I will publish a monthly progress dashboard showing which student concerns were raised.",
    "I will hold weekly student office hours for academic services, laboratories, transportation, and campus facilities.",
    "I will create one shared calendar for clubs, workshops, volunteering opportunities, and student events."
  ].join(" ");
  const topics = storedTopics(null, ordinaryManifesto);

  assert.notEqual(topics["Transparency and accountability"], "Not addressed");
  assert.notEqual(topics["Academic and career support"], "Not addressed");
  assert.notEqual(topics["Campus services"], "Not addressed");
  assert.notEqual(topics["Clubs and community"], "Not addressed");
});

test("accepts only exact source wording as an administrator-edited highlight", () => {
  assert.equal(
    isExactManifestoExcerpt("I will publish monthly meeting summaries and a clear progress dashboard.", manifesto),
    true
  );
  assert.equal(isExactManifestoExcerpt("I will guarantee perfect transparency for every student.", manifesto), false);
});
