import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@/lib/server/secrets';

describe('secret encryption', () => {
  it('round-trips and never repeats ciphertext', () => {
    const a = encryptSecret('hunter2');
    const b = encryptSecret('hunter2');
    expect(a).not.toBe(b);
    expect(a).not.toContain('hunter2');
    expect(decryptSecret(a)).toBe('hunter2');
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('rejects tampered values', () => {
    const [v, iv, tag, ct] = encryptSecret('hunter2').split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
    expect(() => decryptSecret('plaintext')).toThrow();
  });
});
