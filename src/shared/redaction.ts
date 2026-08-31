import { ValidationError } from './errors';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret',
  'apikey',
  'clientsecret',
]);

const MAX_SNAPSHOT_BYTES = 1_048_576;

/** Recursively strips known sensitive keys from a value before it is persisted or logged. */
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redactSensitive(val);
    }
    return result;
  }
  return value;
}

/** Rejects snapshots larger than the configured audit-entry size limit (1 MiB by default). */
export function assertSnapshotSize(value: unknown, maxBytes = MAX_SNAPSHOT_BYTES): void {
  const size = Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  if (size > maxBytes) {
    throw new ValidationError(`Snapshot exceeds maximum size of ${maxBytes} bytes`);
  }
}
