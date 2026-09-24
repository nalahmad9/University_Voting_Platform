const RECEIPT_HASH_PATTERN = /^[a-f0-9]{64}$/;

export function normalizeReceiptHash(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return RECEIPT_HASH_PATTERN.test(normalized) ? normalized : null;
}
