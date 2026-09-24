import assert from "node:assert/strict";
import test from "node:test";

import { normalizeReceiptHash } from "./receipt-verification.js";

test("receipt lookup accepts a complete SHA-256 hash and normalizes case", () => {
  const receipt = "A".repeat(64);
  assert.equal(normalizeReceiptHash(`  ${receipt}  `), "a".repeat(64));
});

test("receipt lookup rejects partial and non-hexadecimal values", () => {
  assert.equal(normalizeReceiptHash("a".repeat(63)), null);
  assert.equal(normalizeReceiptHash("z".repeat(64)), null);
  assert.equal(normalizeReceiptHash(""), null);
});
