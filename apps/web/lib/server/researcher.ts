import 'server-only';
import { parseDraft } from '../research';
import type { Playbook, ResearchDraft } from '../types';

/**
 * Client for the onboard-researcher service (`onboard-researcher serve`).
 * Requests include the presenter's demo credentials, so the service must sit
 * on a private network behind RESEARCHER_TOKEN.
 */

export class ResearcherError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}

function baseUrl(): string {
  return (process.env.RESEARCHER_URL ?? 'http://127.0.0.1:8790').replace(/\/$/, '');
}

async function call(path: string, body: unknown, timeoutMs: number): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.RESEARCHER_TOKEN)
    headers.Authorization = `Bearer ${process.env.RESEARCHER_TOKEN}`;
  try {
    return await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (e) {
    console.error('researcher unreachable', e);
    throw new ResearcherError(
      'The research service is not reachable. Check that it is running and RESEARCHER_URL is set.',
    );
  }
}

/** Queue a research job; progress arrives later at `callbackUrl`. */
export async function startResearch(
  jobId: string,
  request: Record<string, unknown>,
  callbackUrl: string,
): Promise<void> {
  const res = await call('/jobs', { job_id: jobId, request, callback_url: callbackUrl }, 15_000);
  if (!res.ok) {
    throw new ResearcherError(`The research service refused the job (${res.status}).`);
  }
}

/** Revise a playbook from the owner's feedback (synchronous, takes up to a few minutes). */
export async function refinePlaybook(
  request: Record<string, unknown>,
  playbook: Playbook,
  instruction: string,
): Promise<ResearchDraft> {
  const res = await call('/refine', { request, playbook, instruction }, 5 * 60_000);
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const message =
      typeof body?.error === 'string' ? body.error : `Refinement failed (${res.status}).`;
    throw new ResearcherError(message, res.status === 422 ? 422 : 502);
  }
  const draft = parseDraft(body);
  if (!draft) throw new ResearcherError('The research service returned an unusable draft.', 502);
  return draft;
}
