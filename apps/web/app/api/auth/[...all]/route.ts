import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/server/auth';

// Sign-in, sign-up, Google OAuth, sessions, workspaces and invitations.
export function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
