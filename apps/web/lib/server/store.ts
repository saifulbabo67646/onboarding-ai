import 'server-only';
import { randomBytes } from 'crypto';
import { and, asc, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { slugify, type AgentInput } from '../agents';
import type {
  DemoAgent,
  DemoSession,
  DemoSessionDetail,
  SessionEvent,
  SessionState,
} from '../types';
import { getDb, type Database } from './db/client';
import { demoSession, presenter, sessionEvent } from './db/schema';
import { decryptSecret, encryptSecret } from './secrets';

/**
 * All persistence goes through this class. Every dashboard read and write is
 * scoped by `workspaceId`, so one workspace can never see another's data.
 * The only unscoped lookups are the public ones (by slug, for visitors) and
 * the worker callback (by session id, authenticated with a shared secret).
 */
export class Store {
  constructor(private readonly db: Database) {}

  // ── Presenters ─────────────────────────────────────────────

  async listAgents(workspaceId: string): Promise<DemoAgent[]> {
    const rows = await this.db
      .select()
      .from(presenter)
      .where(eq(presenter.organizationId, workspaceId))
      .orderBy(desc(presenter.updatedAt));
    return rows.map(toAgent);
  }

  async getAgent(workspaceId: string, id: string): Promise<DemoAgent | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await this.db
      .select()
      .from(presenter)
      .where(and(eq(presenter.id, id), eq(presenter.organizationId, workspaceId)));
    return row && toAgent(row);
  }

  /** Public lookup for the visitor join page and widget. */
  async getAgentBySlug(slug: string): Promise<DemoAgent | undefined> {
    const [row] = await this.db.select().from(presenter).where(eq(presenter.slug, slug));
    return row && toAgent(row);
  }

  async createAgent(
    workspaceId: string,
    userId: string | null,
    input: AgentInput,
  ): Promise<DemoAgent> {
    const base = slugify(input.name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      const [row] = await this.db
        .insert(presenter)
        .values({ ...fromInput(input), organizationId: workspaceId, createdBy: userId, slug })
        .onConflictDoNothing({ target: presenter.slug })
        .returning();
      if (row) return toAgent(row);
    }
    throw new Error('Could not allocate a unique slug');
  }

  async updateAgent(
    workspaceId: string,
    id: string,
    input: AgentInput,
  ): Promise<DemoAgent | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await this.db
      .update(presenter)
      .set({ ...fromInput(input), updatedAt: new Date() })
      .where(and(eq(presenter.id, id), eq(presenter.organizationId, workspaceId)))
      .returning();
    return row && toAgent(row);
  }

  async deleteAgent(workspaceId: string, id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await this.db
      .delete(presenter)
      .where(and(eq(presenter.id, id), eq(presenter.organizationId, workspaceId)))
      .returning({ id: presenter.id });
    return rows.length > 0;
  }

  // ── Sessions ───────────────────────────────────────────────

  async createSession(
    agent: DemoAgent,
    room: string,
    visitorName: string,
    visitorIpHash: string | null,
  ): Promise<DemoSession> {
    const [row] = await this.db
      .insert(demoSession)
      .values({
        presenterId: agent.id,
        organizationId: agent.workspaceId,
        room,
        visitorName,
        visitorIpHash,
      })
      .returning();
    return toSession(row);
  }

  async listSessions(
    workspaceId: string,
    { agentId, limit = 50 }: { agentId?: string; limit?: number } = {},
  ): Promise<DemoSession[]> {
    if (agentId && !isUuid(agentId)) return [];
    const rows = await this.db
      .select()
      .from(demoSession)
      .where(
        and(
          eq(demoSession.organizationId, workspaceId),
          agentId ? eq(demoSession.presenterId, agentId) : undefined,
        ),
      )
      .orderBy(desc(demoSession.startedAt))
      .limit(limit);
    return rows.map(toSession);
  }

  async getSession(workspaceId: string, id: string): Promise<DemoSessionDetail | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await this.db
      .select()
      .from(demoSession)
      .where(and(eq(demoSession.id, id), eq(demoSession.organizationId, workspaceId)));
    if (!row) return undefined;
    const events = await this.db
      .select()
      .from(sessionEvent)
      .where(eq(sessionEvent.sessionId, id))
      .orderBy(asc(sessionEvent.ts), asc(sessionEvent.id));
    return {
      ...toSession(row),
      events: events.map((e) => ({ type: e.type, data: e.data, ts: e.ts })),
    };
  }

  /** Worker callback: store events and roll them up into the session row. */
  async appendSessionEvents(id: string, events: SessionEvent[]): Promise<boolean> {
    if (!isUuid(id)) return false;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(demoSession).where(eq(demoSession.id, id)).for('update');
      if (!row) return false;
      if (events.length === 0) return true;
      await tx.insert(sessionEvent).values(events.map((e) => ({ sessionId: id, ...e })));

      const patch: Partial<typeof demoSession.$inferInsert> = {
        messageCount:
          row.messageCount + events.filter((e) => e.type === 'say' || e.type === 'heard').length,
        lastEventAt: new Date(Math.max(...events.map((e) => e.ts)) * 1000),
      };
      for (const event of events) {
        if (event.type === 'status') {
          const state = event.data.state as SessionState | undefined;
          if (state && ['starting', 'joined', 'presenting', 'ended'].includes(state))
            patch.state = state;
          if (state === 'ended') {
            patch.endedAt = new Date(event.ts * 1000);
            if (typeof event.data.reason === 'string') patch.endReason = event.data.reason;
          }
        } else if (event.type === 'summary' || event.type === 'end') {
          const summary = event.data.summary;
          if (typeof summary === 'string' && summary) patch.summary = summary;
        }
      }
      await tx.update(demoSession).set(patch).where(eq(demoSession.id, id));
      return true;
    });
  }

  // ── Abuse limits for the public join endpoint ──────────────

  async countJoinsFromIp(ipHash: string, since: Date): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(demoSession)
      .where(and(eq(demoSession.visitorIpHash, ipHash), gte(demoSession.startedAt, since)));
    return r.n;
  }

  async countActiveSessions(agentId: string, since: Date): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(demoSession)
      .where(
        and(
          eq(demoSession.presenterId, agentId),
          gte(demoSession.startedAt, since),
          inArray(demoSession.state, ['starting', 'joined', 'presenting']),
        ),
      );
    return r.n;
  }
}

// ── Mapping ────────────────────────────────────────────────

type PresenterRow = typeof presenter.$inferSelect;
type SessionRow = typeof demoSession.$inferSelect;

function fromInput(input: AgentInput) {
  return {
    ...input,
    secrets: input.secrets.map((s) => ({ name: s.name, value: encryptSecret(s.value) })),
  };
}

function toAgent(row: PresenterRow): DemoAgent {
  return {
    id: row.id,
    workspaceId: row.organizationId,
    slug: row.slug,
    name: row.name,
    mode: row.mode as DemoAgent['mode'],
    goal: row.goal,
    startUrl: row.startUrl,
    description: row.description,
    presenterName: row.presenterName,
    companyName: row.companyName,
    greeting: row.greeting,
    language: row.language,
    voiceId: row.voiceId,
    allowWhiteboard: row.allowWhiteboard,
    maxMinutes: row.maxMinutes,
    published: row.published,
    secrets: row.secrets.map((s) => ({ name: s.name, value: decryptSecret(s.value) })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSession(row: SessionRow): DemoSession {
  return {
    id: row.id,
    agentId: row.presenterId,
    workspaceId: row.organizationId,
    room: row.room,
    visitorName: row.visitorName,
    state: row.state as SessionState,
    endReason: row.endReason ?? undefined,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString(),
    lastEventAt: row.lastEventAt?.toISOString(),
    summary: row.summary ?? undefined,
    messageCount: row.messageCount,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}

let store: Store | undefined;

export function getStore(): Store {
  store ??= new Store(getDb());
  return store;
}
