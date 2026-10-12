import 'server-only';
import { timingSafeEqual } from 'crypto';

/** Bearer check for callbacks from the presenter worker (AGENT_CALLBACK_SECRET). */
export function isAgentRequest(authorization: string | null): boolean {
  const secret = process.env.AGENT_CALLBACK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
