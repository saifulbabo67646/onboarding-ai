import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseAgentInput } from '@/lib/agents';
import { createDb, type Database } from '@/lib/server/db/client';
import { runMigrations } from '@/lib/server/db/migrate';
import { member, organization, presenter, user } from '@/lib/server/db/schema';
import { Store } from '@/lib/server/store';

// Runs against a real Postgres. CI provides one; locally point TEST_DATABASE_URL
// at a throwaway database (its tables are truncated).
const url = process.env.TEST_DATABASE_URL;

const input = parseAgentInput({
  name: 'Tour',
  goal: 'Show things',
  startUrl: 'https://x.dev',
  secrets: [{ name: 'password', value: 'hunter2' }],
});

describe.skipIf(!url)('Store (Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let store: Store;
  let ws1: string;
  let ws2: string;
  let userId: string;

  async function workspace(name: string) {
    const id = randomUUID();
    await db
      .insert(organization)
      .values({ id, name, slug: `${name}-${id.slice(0, 6)}`, createdAt: new Date() });
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: id,
      userId,
      role: 'owner',
      createdAt: new Date(),
    });
    return id;
  }

  beforeAll(async () => {
    await runMigrations(url);
    ({ db, close } = createDb(url!));
    store = new Store(db);
  });

  afterAll(async () => {
    await close?.();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table "user", organization cascade`);
    userId = randomUUID();
    await db.insert(user).values({ id: userId, name: 'Ada', email: `${userId}@example.com` });
    ws1 = await workspace('one');
    ws2 = await workspace('two');
  });

  it('allocates unique slugs and finds presenters publicly by slug', async () => {
    const a = await store.createAgent(ws1, userId, input);
    const b = await store.createAgent(ws2, userId, input);
    expect(a.slug).toBe('tour');
    expect(b.slug).toMatch(/^tour-[0-9a-f]{4}$/);
    expect(await store.getAgentBySlug(b.slug)).toMatchObject({ id: b.id, workspaceId: ws2 });
  });

  it('keeps workspaces isolated', async () => {
    const a = await store.createAgent(ws1, userId, input);
    const session = await store.createSession(a, 'room-1', 'Sam', null);

    expect(await store.listAgents(ws2)).toHaveLength(0);
    expect(await store.getAgent(ws2, a.id)).toBeUndefined();
    expect(await store.updateAgent(ws2, a.id, { ...input, name: 'Hijacked' })).toBeUndefined();
    expect(await store.deleteAgent(ws2, a.id)).toBe(false);
    expect(await store.listSessions(ws2)).toHaveLength(0);
    expect(await store.getSession(ws2, session.id)).toBeUndefined();

    expect((await store.getAgent(ws1, a.id))?.name).toBe('Tour');
    expect(await store.listSessions(ws1)).toHaveLength(1);
  });

  it('encrypts presenter secrets at rest', async () => {
    const a = await store.createAgent(ws1, userId, input);
    const [row] = await db.select({ secrets: presenter.secrets }).from(presenter);
    expect(JSON.stringify(row.secrets)).not.toContain('hunter2');
    expect(row.secrets[0].value).toMatch(/^v1:/);
    expect((await store.getAgent(ws1, a.id))?.secrets).toEqual([
      { name: 'password', value: 'hunter2' },
    ]);
  });

  it('rolls worker events up into the session', async () => {
    const a = await store.createAgent(ws1, userId, input);
    const s = await store.createSession(a, 'room-1', 'Sam', 'iphash');
    expect(
      await store.appendSessionEvents(s.id, [
        { type: 'status', data: { state: 'presenting' }, ts: 1_760_000_000 },
        { type: 'say', data: { text: 'Hi Sam!' }, ts: 1_760_000_002 },
        { type: 'heard', data: { text: 'Hello' }, ts: 1_760_000_004 },
      ]),
    ).toBe(true);
    expect(await store.getSession(ws1, s.id)).toMatchObject({
      state: 'presenting',
      messageCount: 2,
    });

    await store.appendSessionEvents(s.id, [
      { type: 'summary', data: { summary: 'Went well' }, ts: 1_760_000_010 },
      { type: 'status', data: { state: 'ended', reason: 'goal complete' }, ts: 1_760_000_011 },
    ]);
    const done = await store.getSession(ws1, s.id);
    expect(done).toMatchObject({
      state: 'ended',
      summary: 'Went well',
      endReason: 'goal complete',
    });
    expect(done?.endedAt).toBe(new Date(1_760_000_011_000).toISOString());
    expect(done?.events.map((e) => e.type)).toEqual([
      'status',
      'say',
      'heard',
      'summary',
      'status',
    ]);

    expect(await store.appendSessionEvents(randomUUID(), [])).toBe(false);
    expect(await store.appendSessionEvents('not-a-uuid', [])).toBe(false);
  });

  it('counts joins per IP and active sessions per presenter', async () => {
    const a = await store.createAgent(ws1, userId, input);
    const since = new Date(Date.now() - 60_000);
    const s1 = await store.createSession(a, 'r1', 'A', 'ip-1');
    await store.createSession(a, 'r2', 'B', 'ip-1');
    await store.createSession(a, 'r3', 'C', 'ip-2');
    expect(await store.countJoinsFromIp('ip-1', since)).toBe(2);
    expect(await store.countActiveSessions(a.id, since)).toBe(3);
    await store.appendSessionEvents(s1.id, [
      { type: 'status', data: { state: 'ended' }, ts: Date.now() / 1000 },
    ]);
    expect(await store.countActiveSessions(a.id, since)).toBe(2);
  });

  it('deletes a presenter with its sessions and events', async () => {
    const a = await store.createAgent(ws1, userId, input);
    const s = await store.createSession(a, 'r', 'v', null);
    await store.appendSessionEvents(s.id, [{ type: 'say', data: { text: 'hi' }, ts: 1 }]);
    expect(await store.deleteAgent(ws1, a.id)).toBe(true);
    expect(await store.listSessions(ws1)).toHaveLength(0);
  });

  it('stores AI research jobs per workspace and folds researcher events in', async () => {
    const a = await store.createAgent(ws1, userId, {
      ...input,
      goal: '',
      knowledge: '',
      published: false,
    });
    const job = await store.createResearchJob(a, { notes: 'Focus on reports', docsUrls: [] });
    expect(job).toMatchObject({ agentId: a.id, workspaceId: ws1, state: 'queued', revisions: 0 });
    expect(await store.latestResearchJob(ws2, a.id)).toBeUndefined();

    const draft = { goal: 'Show reports', knowledge: '## Notes', playbook: { sections: [] } };
    const done = await store.appendResearchEvents(job.id, [
      { type: 'status', data: { state: 'researching', phase: 'docs' }, ts: 1_760_000_000 },
      { type: 'progress', data: { phase: 'docs', message: 'Read docs' }, ts: 1_760_000_001 },
      { type: 'warning', data: { message: 'No sandbox' }, ts: 1_760_000_002 },
      { type: 'draft', data: draft, ts: 1_760_000_003 },
      { type: 'status', data: { state: 'drafted' }, ts: 1_760_000_004 },
    ]);
    expect(done).toMatchObject({ state: 'drafted', phase: 'docs', warnings: ['No sandbox'] });
    expect(done?.draft?.goal).toBe('Show reports');
    expect(done?.events.map((e) => e.type)).not.toContain('draft');
    expect(done?.finishedAt).toBe(new Date(1_760_000_004_000).toISOString());

    expect(await store.updateResearchJob(ws2, job.id, { revisions: 5 })).toBeUndefined();
    const applied = await store.updateResearchJob(ws1, job.id, {
      revisions: 1,
      appliedAt: new Date().toISOString(),
    });
    expect(applied).toMatchObject({ revisions: 1 });
    expect(applied?.appliedAt).toBeDefined();
    expect((await store.latestResearchJob(ws1, a.id))?.id).toBe(job.id);

    expect(await store.appendResearchEvents(randomUUID(), [])).toBeUndefined();
    expect(await store.deleteAgent(ws1, a.id)).toBe(true);
    expect(await store.latestResearchJob(ws1, a.id)).toBeUndefined();
  });

  it('keeps the preparation notes with the presenter', async () => {
    const a = await store.createAgent(ws1, userId, {
      ...input,
      knowledge: 'Reports live under Insights',
    });
    expect((await store.getAgent(ws1, a.id))?.knowledge).toBe('Reports live under Insights');
  });

  it('removes everything when a workspace is deleted', async () => {
    await store.createAgent(ws1, userId, input);
    await db.delete(organization).where(sql`${organization.id} = ${ws1}`);
    expect(await store.listAgents(ws1)).toHaveLength(0);
  });
});
