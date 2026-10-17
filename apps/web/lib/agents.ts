import type { DemoAgent, DemoMode, PublicAgent, Secret } from './types';
import { object, str, url, ValidationError } from './validation';

export { ValidationError };

export type AgentInput = Omit<DemoAgent, 'id' | 'slug' | 'createdAt' | 'updatedAt'>;

const MODES: DemoMode[] = ['product_demo', 'presentation'];

function secrets(value: unknown): Secret[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('secrets must be a list');
  return value
    .map((s, i) => ({
      name: str(s?.name, `secrets[${i}].name`, { max: 64 }).replace(/[^\w-]/g, '_'),
      value: str(s?.value, `secrets[${i}].value`, { max: 2000 }),
    }))
    .filter((s) => s.name && s.value);
}

/** Validate and normalise dashboard input. `previous` keeps secret values the client didn't resend. */
export function parseAgentInput(body: unknown, previous?: DemoAgent): AgentInput {
  const b = object(body);
  const published = b.published === undefined ? true : Boolean(b.published);
  const mode = (b.mode ?? 'product_demo') as DemoMode;
  if (!MODES.includes(mode)) throw new ValidationError('mode must be product_demo or presentation');
  const maxMinutes = Number(b.maxMinutes ?? 30);
  if (!Number.isFinite(maxMinutes) || maxMinutes < 2 || maxMinutes > 120) {
    throw new ValidationError('maxMinutes must be between 2 and 120');
  }
  let parsedSecrets = secrets(b.secrets);
  if (previous) {
    // The dashboard never receives secret values back; an empty value means "keep".
    const rawList = Array.isArray(b.secrets) ? (b.secrets as Secret[]) : [];
    const kept = rawList
      .filter((s) => s?.name && !s.value)
      .map((s) => previous.secrets.find((p) => p.name === s.name))
      .filter((s): s is Secret => Boolean(s));
    parsedSecrets = [...parsedSecrets, ...kept];
  }
  return {
    name: str(b.name, 'name', { required: true, max: 120 }),
    mode,
    // A paused presenter may have no goal yet (its demo is still being researched).
    goal: str(b.goal, 'goal', { required: published, max: 8000 }),
    knowledge: str(b.knowledge, 'knowledge', { max: 30000 }),
    startUrl: url(b.startUrl, 'startUrl'),
    description: str(b.description, 'description', { max: 1000 }),
    presenterName: str(b.presenterName, 'presenterName', { max: 60 }) || 'Alex',
    companyName: str(b.companyName, 'companyName', { max: 120 }),
    greeting: str(b.greeting, 'greeting', { max: 500 }),
    language: str(b.language, 'language', { max: 40 }) || 'English',
    voiceId: str(b.voiceId, 'voiceId', { max: 100 }),
    allowWhiteboard: Boolean(b.allowWhiteboard),
    maxMinutes,
    secrets: parsedSecrets,
    published,
  };
}

/** The editable fields of a stored agent, e.g. to update a few of them. */
export function agentInputOf(agent: DemoAgent): AgentInput {
  const input: Partial<DemoAgent> = { ...agent };
  delete input.id;
  delete input.slug;
  delete input.createdAt;
  delete input.updatedAt;
  return input as AgentInput;
}

/** Whether visitors can start a session: published and with something to present. */
export function isJoinable(agent: DemoAgent): boolean {
  return agent.published && Boolean(agent.goal.trim());
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  return base || 'demo';
}

export function toPublic(agent: DemoAgent): PublicAgent {
  return {
    slug: agent.slug,
    name: agent.name,
    mode: agent.mode,
    description: agent.description,
    presenterName: agent.presenterName,
    companyName: agent.companyName,
  };
}

/** Agent as returned to the dashboard: secret values are never sent to the browser. */
export function toOwnerView(agent: DemoAgent): DemoAgent {
  return { ...agent, secrets: agent.secrets.map((s) => ({ name: s.name, value: '' })) };
}

/** The brief the presenter worker receives (see onboard_director.DemoBrief). */
export function toBrief(agent: DemoAgent, visitorName: string) {
  return {
    goal: agent.goal,
    knowledge: agent.knowledge || null,
    mode: agent.mode,
    start_url: agent.startUrl,
    presenter_name: agent.presenterName,
    company_name: agent.companyName || null,
    audience_name: visitorName || null,
    greeting: agent.greeting || null,
    language: agent.language,
    allow_whiteboard: agent.allowWhiteboard,
    max_minutes: agent.maxMinutes,
    secrets: agent.secrets,
  };
}
