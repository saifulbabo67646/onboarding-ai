/**
 * AI research for presenters: the owner gives a URL (and demo credentials),
 * the researcher service learns the product and drafts the demo, the owner
 * reviews it once. Pure functions here; persistence lives in the store and
 * transport in `lib/server/researcher.ts`.
 */
import type {
  DemoAgent,
  Playbook,
  ResearchDraft,
  ResearchInput,
  ResearchJob,
  ResearchPhase,
  ResearchState,
  SessionEvent,
} from './types';
import { object, str, url, ValidationError } from './validation';

const PHASES: ResearchPhase[] = ['docs', 'explore', 'write'];
const STATES: ResearchState[] = ['queued', 'researching', 'drafted', 'failed'];
const MAX_EVENTS_PER_JOB = 400;
/** A job silent for this long is treated as dead (the researcher restarted). */
export const STALE_JOB_MS = 60 * 60 * 1000;

export function parseResearchInput(body: unknown): ResearchInput {
  const b = body === undefined || body === null ? {} : object(body);
  const raw = b.docsUrls ?? [];
  if (!Array.isArray(raw)) throw new ValidationError('docsUrls must be a list');
  if (raw.length > 10) throw new ValidationError('docsUrls can have at most 10 links');
  return {
    notes: str(b.notes, 'notes', { max: 4000 }),
    docsUrls: raw
      .filter((u) => typeof u === 'string' && u.trim())
      .map((u, i) => url(u, `docsUrls[${i}]`)),
  };
}

export interface DraftEdit {
  goal: string;
  knowledge: string;
  publish: boolean;
}

export function parseDraftEdit(body: unknown): DraftEdit {
  const b = object(body);
  const publish = Boolean(b.publish);
  return {
    goal: str(b.goal, 'goal', { required: publish, max: 8000 }),
    knowledge: str(b.knowledge, 'knowledge', { max: 30000 }),
    publish,
  };
}

/** The payload for the researcher service (see onboard_researcher.ResearchRequest). */
export function toResearchRequest(agent: DemoAgent, input: ResearchInput) {
  return {
    url: agent.startUrl,
    product_name: agent.name,
    company_name: agent.companyName || null,
    notes: input.notes || null,
    docs_urls: input.docsUrls,
    language: agent.language,
    presenter_name: agent.presenterName,
    max_minutes: agent.maxMinutes,
    secrets: agent.secrets,
  };
}

export function isActive(job: ResearchJob, now = Date.now()): boolean {
  if (job.state !== 'queued' && job.state !== 'researching') return false;
  const last = job.events.at(-1)?.ts;
  const lastSeen = last ? last * 1000 : Date.parse(job.startedAt);
  return now - lastSeen < STALE_JOB_MS;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Validate a draft coming from the researcher; returns undefined if unusable. */
export function parseDraft(data: unknown): ResearchDraft | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  if (typeof d.goal !== 'string' || !d.goal.trim() || typeof d.knowledge !== 'string') {
    return undefined;
  }
  const p = (d.playbook ?? {}) as Partial<Playbook>;
  const login = (p.login ?? {}) as Partial<Playbook['login']>;
  const playbook: Playbook = {
    product_name: String(p.product_name ?? ''),
    product_summary: String(p.product_summary ?? ''),
    audience: String(p.audience ?? ''),
    demo_title: String(p.demo_title ?? ''),
    goal: String(p.goal ?? ''),
    duration_minutes: Number(p.duration_minutes) || 0,
    opening: String(p.opening ?? ''),
    sections: (Array.isArray(p.sections) ? p.sections : []).map((s) => ({
      title: String(s?.title ?? ''),
      objective: String(s?.objective ?? ''),
      where: String(s?.where ?? ''),
      steps: strings(s?.steps),
      talking_points: strings(s?.talking_points),
    })),
    login: {
      required: Boolean(login.required),
      steps: strings(login.steps),
      secret_names: strings(login.secret_names),
    },
    faq: (Array.isArray(p.faq) ? p.faq : []).map((f) => ({
      question: String(f?.question ?? ''),
      answer: String(f?.answer ?? ''),
    })),
    glossary: (Array.isArray(p.glossary) ? p.glossary : []).map((g) => ({
      term: String(g?.term ?? ''),
      meaning: String(g?.meaning ?? ''),
    })),
    avoid: strings(p.avoid),
    sources: strings(p.sources),
  };
  return { goal: d.goal, knowledge: d.knowledge, playbook };
}

/** Fold one researcher event into the job (see onboard_researcher.service for the protocol). */
export function applyResearchEvent(job: ResearchJob, event: SessionEvent) {
  const data = event.data;
  const finishedAt = new Date(event.ts * 1000).toISOString();
  if (event.type === 'status') {
    const state = data.state as ResearchState;
    if (STATES.includes(state)) job.state = state;
    if (PHASES.includes(data.phase as ResearchPhase)) job.phase = data.phase as ResearchPhase;
    if (state === 'drafted' || state === 'failed') job.finishedAt = finishedAt;
  } else if (event.type === 'draft') {
    const draft = parseDraft(data);
    if (draft) job.draft = draft;
  } else if (event.type === 'warning' && typeof data.message === 'string') {
    job.warnings.push(data.message);
  } else if (event.type === 'error' && typeof data.message === 'string') {
    job.error = data.message;
  }
  if (event.type !== 'draft') {
    // Drafts are large and already stored on the job; keep the log light.
    job.events.push(event);
    if (job.events.length > MAX_EVENTS_PER_JOB) {
      job.events.splice(0, job.events.length - MAX_EVENTS_PER_JOB);
    }
  }
}

/** Progress lines for the dashboard log, newest last. */
export function progressLines(job: ResearchJob): string[] {
  return job.events
    .filter(
      (e) => (e.type === 'progress' || e.type === 'warning') && typeof e.data.message === 'string',
    )
    .map((e) => String(e.data.message));
}
