import { assertSnapshotSize, redactSensitive } from '../src/shared/redaction';
import { ValidationError } from '../src/shared/errors';

describe('redactSensitive', () => {
  it('redacts known sensitive keys recursively, including nested objects and arrays', () => {
    const input = {
      userId: '11111111-1111-4111-8111-111111111111',
      password: 'super-secret',
      nested: { token: 'abc', ok: 'value' },
      list: [{ refreshToken: 'xyz', name: 'ok' }],
    };

    expect(redactSensitive(input)).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      password: '[REDACTED]',
      nested: { token: '[REDACTED]', ok: 'value' },
      list: [{ refreshToken: '[REDACTED]', name: 'ok' }],
    });
  });

  it('leaves primitives and null untouched', () => {
    expect(redactSensitive('value')).toBe('value');
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBeNull();
  });
});

describe('assertSnapshotSize', () => {
  it('accepts snapshots within the size limit', () => {
    expect(() => assertSnapshotSize({ status: 'active' })).not.toThrow();
  });

  it('rejects snapshots larger than the configured limit', () => {
    const oversized = { blob: 'x'.repeat(10) };
    expect(() => assertSnapshotSize(oversized, 5)).toThrow(ValidationError);
  });
});
