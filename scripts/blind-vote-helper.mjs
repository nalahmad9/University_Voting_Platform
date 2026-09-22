import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RSABSSA } from "@cloudflare/blindrsa-ts";

const apiBaseUrl = process.env.QUORUM_API_URL ?? "http://localhost:4000/api/v1";
const stateDirectory = resolve(".blind-vote-test");
const suite = RSABSSA.SHA384.PSS.Deterministic();

function usage() {
  console.error([
    "Usage:",
    "  npm run blind-vote:prepare -- <ballot-id>",
    "  npm run blind-vote:finalize -- <ballot-id> <blind-signature>",
    "  npm run blind-vote:clear -- <ballot-id>"
  ].join("\n"));
  process.exitCode = 1;
}

function statePath(ballotId) {
  return resolve(stateDirectory, `${ballotId}.json`);
}

function encode(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function decode(value) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function tokenMessage(input) {
  return new TextEncoder().encode([
    "quorum.vote-token.v1",
    input.ballotId,
    input.keyVersion,
    input.expiresAt,
    input.token
  ].join("\0"));
}

async function prepare(ballotId) {
  const response = await fetch(`${apiBaseUrl}/voting/ballots/${encodeURIComponent(ballotId)}/key`);
  if (!response.ok) throw new Error(`Voting key request failed with status ${response.status}`);
  const key = (await response.json()).data;
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key.publicKey,
    { name: "RSA-PSS", hash: "SHA-384" },
    true,
    ["verify"]
  );
  const token = encode(crypto.getRandomValues(new Uint8Array(32)));
  const preparedMessage = suite.prepare(tokenMessage({
    ballotId,
    keyVersion: key.keyVersion,
    expiresAt: key.expiresAt,
    token
  }));
  const { blindedMsg, inv } = await suite.blind(publicKey, preparedMessage);
  const state = {
    ballotId,
    token,
    inverse: encode(inv),
    keyVersion: key.keyVersion,
    expiresAt: key.expiresAt,
    publicKey: key.publicKey
  };
  await mkdir(stateDirectory, { recursive: true });
  await writeFile(statePath(ballotId), JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({
    ballotId,
    blindedToken: encode(blindedMsg),
    keyVersion: key.keyVersion,
    expiresAt: key.expiresAt,
    idempotencyKey: crypto.randomUUID()
  }, null, 2));
}

async function finalize(ballotId, blindSignature) {
  const state = JSON.parse(await readFile(statePath(ballotId), "utf8"));
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    state.publicKey,
    { name: "RSA-PSS", hash: "SHA-384" },
    true,
    ["verify"]
  );
  const preparedMessage = suite.prepare(tokenMessage(state));
  const signature = await suite.finalize(
    publicKey,
    preparedMessage,
    decode(blindSignature),
    decode(state.inverse)
  );
  console.log(JSON.stringify({
    ballotId,
    token: state.token,
    signature: encode(signature),
    keyVersion: state.keyVersion,
    expiresAt: state.expiresAt
  }, null, 2));
}

async function clear(ballotId) {
  await rm(statePath(ballotId), { force: true });
  console.log(`Cleared local blind-vote test state for ${ballotId}`);
}

const [command, ballotId, value] = process.argv.slice(2);
if (!command || !ballotId) {
  usage();
} else if (command === "prepare") {
  await prepare(ballotId);
} else if (command === "finalize" && value) {
  await finalize(ballotId, value);
} else if (command === "clear") {
  await clear(ballotId);
} else {
  usage();
}
