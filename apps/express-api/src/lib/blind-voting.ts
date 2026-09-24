import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RSABSSA } from "@cloudflare/blindrsa-ts";
import { env } from "../config/env.js";

export const BLIND_SIGNATURE_SUITE = "RSABSSA-SHA384-PSS-Deterministic" as const;
export const BLIND_KEY_VERSION = "v1";
export const blindSuite = RSABSSA.SHA384.PSS.Deterministic();

type StoredKeyPair = {
  version: string;
  suite: typeof BLIND_SIGNATURE_SUITE;
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

type BallotKeyPair = StoredKeyPair & {
  publicCryptoKey: CryptoKey;
  privateCryptoKey: CryptoKey;
};

const keyPromises = new Map<string, Promise<BallotKeyPair>>();

function keyDirectory(): string {
  if (env.BLIND_SIGNING_KEY_DIRECTORY) return resolve(env.BLIND_SIGNING_KEY_DIRECTORY);
  return fileURLToPath(new URL("../../.local-keys/", import.meta.url));
}

function keyFile(ballotId: string): string {
  return resolve(keyDirectory(), `ballot-${ballotId}-${BLIND_KEY_VERSION}.json`);
}

async function importStoredKeys(stored: StoredKeyPair): Promise<BallotKeyPair> {
  if (stored.version !== BLIND_KEY_VERSION || stored.suite !== BLIND_SIGNATURE_SUITE) {
    throw new Error("Unsupported blind-signing key version");
  }
  const algorithm = { name: "RSA-PSS", hash: "SHA-384" };
  const [publicCryptoKey, privateCryptoKey] = await Promise.all([
    crypto.subtle.importKey("jwk", stored.publicKey, algorithm, true, ["verify"]),
    crypto.subtle.importKey("jwk", stored.privateKey, algorithm, true, ["sign"])
  ]);
  return { ...stored, publicCryptoKey, privateCryptoKey };
}

async function createStoredKeys(path: string): Promise<StoredKeyPair> {
  const pair = await blindSuite.generateKey({
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1])
  });
  const stored: StoredKeyPair = {
    version: BLIND_KEY_VERSION,
    suite: BLIND_SIGNATURE_SUITE,
    publicKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
    privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey)
  };
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(stored), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
  return stored;
}

async function loadBallotKeyPair(ballotId: string): Promise<BallotKeyPair> {
  const path = keyFile(ballotId);
  let stored: StoredKeyPair;
  try {
    stored = JSON.parse(await readFile(path, "utf8")) as StoredKeyPair;
  } catch (error) {
    const missing = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
    if (!missing) throw error;
    stored = await createStoredKeys(path);
  }
  return importStoredKeys(stored);
}

export function getBallotKeyPair(ballotId: string): Promise<BallotKeyPair> {
  let pending = keyPromises.get(ballotId);
  if (!pending) {
    pending = loadBallotKeyPair(ballotId);
    keyPromises.set(ballotId, pending);
  }
  return pending;
}

export function voteTokenMessage(input: {
  ballotId: string;
  keyVersion: string;
  expiresAt: string;
  token: string;
}): Uint8Array {
  return new TextEncoder().encode([
    "quorum.vote-token.v1",
    input.ballotId,
    input.keyVersion,
    input.expiresAt,
    input.token
  ].join("\u0000"));
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createReceiptHash(): string {
  const receiptDomain = Buffer.from("quorum.receipt.v1\0", "utf8");
  const receiptNonce = randomBytes(32);

  return sha256Hex(Buffer.concat([receiptDomain, receiptNonce]));
}

export function decodeBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

export function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
