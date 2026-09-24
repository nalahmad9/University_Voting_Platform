import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  BLIND_KEY_VERSION,
  blindSuite,
  createReceiptHash,
  encodeBase64Url,
  sha256Hex,
  voteTokenMessage
} from "./blind-voting.js";

test("SHA-256 helpers return lowercase 256-bit hashes", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );

  const firstReceipt = createReceiptHash();
  const secondReceipt = createReceiptHash();

  assert.match(firstReceipt, /^[a-f0-9]{64}$/);
  assert.match(secondReceipt, /^[a-f0-9]{64}$/);
  assert.notEqual(firstReceipt, secondReceipt);
});

test("blind signature is valid only for its exact ballot, token, and expiry", async () => {
  const keyPair = await blindSuite.generateKey({
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1])
  });
  const signedInput = {
    ballotId: "ballot-a",
    keyVersion: BLIND_KEY_VERSION,
    expiresAt: "2026-10-01T12:00:00.000Z",
    token: encodeBase64Url(randomBytes(32))
  };
  const message = voteTokenMessage(signedInput);
  const preparedMessage = blindSuite.prepare(message);
  const { blindedMsg, inv } = await blindSuite.blind(
    keyPair.publicKey,
    preparedMessage
  );
  const blindSignature = await blindSuite.blindSign(
    keyPair.privateKey,
    blindedMsg
  );
  const signature = await blindSuite.finalize(
    keyPair.publicKey,
    preparedMessage,
    blindSignature,
    inv
  );

  assert.equal(
    await blindSuite.verify(keyPair.publicKey, signature, message),
    true
  );
  assert.equal(
    await blindSuite.verify(
      keyPair.publicKey,
      signature,
      voteTokenMessage({ ...signedInput, ballotId: "ballot-b" })
    ),
    false
  );
  assert.equal(
    await blindSuite.verify(
      keyPair.publicKey,
      signature,
      voteTokenMessage({
        ...signedInput,
        token: encodeBase64Url(randomBytes(32))
      })
    ),
    false
  );
  assert.equal(
    await blindSuite.verify(
      keyPair.publicKey,
      signature,
      voteTokenMessage({
        ...signedInput,
        expiresAt: "2026-10-01T12:00:01.000Z"
      })
    ),
    false
  );

  const tamperedSignature = new Uint8Array(signature);
  tamperedSignature[0] ^= 1;
  assert.equal(
    await blindSuite.verify(keyPair.publicKey, tamperedSignature, message),
    false
  );
});
