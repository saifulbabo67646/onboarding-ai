import 'server-only';
import { randomBytes, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { slugify, type AgentInput } from '../agents';
import type { DemoAgent, DemoSession, SessionEvent, SessionState } from '../types';

/**
 * Persistence for agents and sessions. The default implementation is a JSON
 * file (zero setup, fine for a single web instance); swap in a database by
 * implementing this interface and returning it from `getStore()`.
 */
export interface Store {
  listAgents(): Promise<DemoAgent[]>;
  getAgent(id: string): Promise<DemoAgent | undefined>;
  getAgentBySlug(slug: string): Promise<DemoAgent | undefined>;
  createAgent(input: AgentInput): Promise<DemoAgent>;
  updateAgent(id: string, input: AgentInput): Promise<DemoAgent | undefined>;
  deleteAgent(id: string): Promise<boolean>;
  createSession(agentId: string, room: string, visitorName: string): Promise<DemoSession>;
  getSession(id: string): Promise<DemoSession | undefined>;
  listSessions(agentId?: string, limit?: number): Promise<DemoSession[]>;
  appendSessionEvents(id: string, events: SessionEvent[]): Promise<DemoSession | undefined>;
}

interface Data {
  agents: DemoAgent[];
  sessions: DemoSession[];
}

const MAX_EVENTS_PER_SESSION = 2000;
const MAX_SESSIONS = 1000;

export class JsonFileStore implements Store {
  private cache: Data | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  private async load(): Promise<Data> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, 'utf8')) as Data;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      this.cache = { agents: [], sessions: [] };
    }
    return this.cache;
  }

  /** Serialises mutations and writes atomically (temp file + rename). */
  private mutate<T>(fn: (data: Data) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.load();
      const result = fn(data);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, this.file);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async listAgents() {
    const data = await this.load();
    return [...data.agents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getAgent(id: string) {
    return (await this.load()).agents.find((a) => a.id === id);
  }

  async getAgentBySlug(slug: string) {
    return (await this.load()).agents.find((a) => a.slug === slug);
  }

  createAgent(input: AgentInput) {
    return this.mutate((data) => {
      const now = new Date().toISOString();
      let slug = slugify(input.name);
      while (data.agents.some((a) => a.slug === slug)) {
        slug = `${slugify(input.name)}-${randomBytes(2).toString('hex')}`;
      }
      const agent: DemoAgent = { ...input, id: randomUUID(), slug, createdAt: now, updatedAt: now };
      data.agents.push(agent);
      return agent;
    });
  }

  updateAgent(id: string, input: AgentInput) {
    return this.mutate((data) => {
      const i = data.agents.findIndex((a) => a.id === id);
      if (i < 0) return undefined;
      data.agents[i] = { ...data.agents[i], ...input, updatedAt: new Date().toISOString() };
      return data.agents[i];
    });
  }

  deleteAgent(id: string) {
    return this.mutate((data) => {
      const before = data.agents.length;
      data.agents = data.agents.filter((a) => a.id !== id);
      data.sessions = data.sessions.filter((s) => s.agentId !== id);
      return data.agents.length < before;
    });
  }

  createSession(agentId: string, room: string, visitorName: string) {
    return this.mutate((data) => {
      const session: DemoSession = {
        id: randomUUID(),
        agentId,
        room,
        visitorName,
        state: 'starting',
        startedAt: new Date().toISOString(),
        events: [],
      };
      data.sessions.push(session);
      if (data.sessions.length > MAX_SESSIONS)
        data.sessions.splice(0, data.sessions.length - MAX_SESSIONS);
      return session;
    });
  }

  async getSession(id: string) {
    return (await this.load()).sessions.find((s) => s.id === id);
  }

  async listSessions(agentId?: string, limit = 50) {
    const data = await this.load();
    return data.sessions
      .filter((s) => !agentId || s.agentId === agentId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  appendSessionEvents(id: string, events: SessionEvent[]) {
    return this.mutate((data) => {
      const session = data.sessions.find((s) => s.id === id);
      if (!session) return undefined;
      for (const event of events) {
        applyEvent(session, event);
      }
      session.events.push(...events);
      if (session.events.length > MAX_EVENTS_PER_SESSION) {
        session.events.splice(0, session.events.length - MAX_EVENTS_PER_SESSION);
      }
      return session;
    });
  }
}

export function applyEvent(session: DemoSession, event: SessionEvent) {
  if (event.type === 'status') {
    const state = event.data.state as SessionState | undefined;
    if (state && ['starting', 'joined', 'presenting', 'ended'].includes(state))
      session.state = state;
    if (state === 'ended') session.endedAt = new Date(event.ts * 1000).toISOString();
  } else if (event.type === 'summary' || event.type === 'end') {
    const summary = event.data.summary;
    if (typeof summary === 'string' && summary) session.summary = summary;
  }
}

let store: Store | undefined;

export function getStore(): Store {
  if (!store) {
    const dir = process.env.DATA_DIR ?? path.join(process.cwd(), '.data');
    store = new JsonFileStore(path.join(dir, 'store.json'));
  }
  return store;
}
