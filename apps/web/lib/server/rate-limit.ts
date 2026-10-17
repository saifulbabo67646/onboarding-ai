import 'server-only';
import { createHash } from 'crypto';

export const JOIN_LIMITS = {
  /** Joins allowed from one IP address per window. */
  perIp: Number(process.env.JOIN_LIMIT_PER_IP ?? 6),
  windowMinutes: Number(process.env.JOIN_LIMIT_WINDOW_MINUTES ?? 10),
  /** Live sessions one presenter may run at once. */
  concurrentPerPresenter: Number(process.env.MAX_CONCURRENT_SESSIONS_PER_PRESENTER ?? 10),
};

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip') || null;
}

/** Salted hash so raw IP addresses are never stored. */
export function hashIp(ip: string): string {
  const salt = process.env.BETTER_AUTH_SECRET ?? 'onboard';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}
