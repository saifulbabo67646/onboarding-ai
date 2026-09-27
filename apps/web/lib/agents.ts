import type { DemoAgent, DemoMode, PublicAgent, Secret } from './types';

export type AgentInput = Omit<DemoAgent, 'id' | 'slug' | 'createdAt' | 'updatedAt'>;

export class ValidationError extends Error {}

const MODES: DemoMode[] = ['product_demo', 'presentation'];

function str(value: unknown, field: string, { required = false, max = 4000 } = {}): string {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new ValidationError(`${field} is required`);
  if (trimmed.length > max) throw new ValidationError(`${field} is too long (max ${max})`);
  return trimmed;
}

function url(value: unknown, field: string): string {
  const raw = str(value, field, { required: true, max: 2000 });
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new ValidationError(`${field} must be a valid http(s) URL`);
  }
}

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
  if (!body || typeof body !== 'object') throw new ValidationError('Expected a JSON object');
  const b = body as Record<string, unknown>;
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
    goal: str(b.goal, 'goal', { required: true, max: 8000 }),
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
    published: b.published === undefined ? true : Boolean(b.published),
  };
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
