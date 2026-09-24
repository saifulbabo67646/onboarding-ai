/**
 * Minimal owner authentication for the dashboard: a single password from
 * `DASHBOARD_PASSWORD`, exchanged for a cookie holding a SHA-256 digest.
 * Works in both the Node and Edge (middleware) runtimes via Web Crypto.
 * Without `DASHBOARD_PASSWORD` the dashboard is open (local development).
 */

export const AUTH_COOKIE = 'onboard_owner';

export function authEnabled(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

export async function ownerToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`onboard-dashboard:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isOwnerToken(token: string | undefined): Promise<boolean> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return true;
  if (!token) return false;
  return safeEqual(token, await ownerToken(password));
}

/** Bearer check for callbacks from the presenter worker. */
export function isAgentRequest(authorization: string | null): boolean {
  const secret = process.env.AGENT_CALLBACK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return safeEqual(authorization ?? '', `Bearer ${secret}`);
}
