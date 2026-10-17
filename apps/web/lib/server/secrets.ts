import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Presenter secrets (demo-account logins) are encrypted at rest with
 * AES-256-GCM. The key lives outside the database in SECRETS_ENCRYPTION_KEY
 * (32 bytes, base64). Format: `v1:<iv>:<tag>:<ciphertext>` (base64 parts).
 */
const PREFIX = 'v1';

function key(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (raw) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32)
      throw new Error('SECRETS_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
    return buf;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECRETS_ENCRYPTION_KEY must be set in production');
  }
  // Development fallback so a fresh checkout works; never used in production.
  const seed = process.env.BETTER_AUTH_SECRET ?? 'onboard-dev-only-secret';
  return createHash('sha256').update(`secrets:${seed}`).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    PREFIX,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(stored: string): string {
  const [prefix, iv, tag, ciphertext] = stored.split(':');
  if (prefix !== PREFIX || !iv || !tag || ciphertext === undefined) {
    throw new Error('Unrecognised secret format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
