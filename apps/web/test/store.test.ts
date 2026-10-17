import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseAgentInput } from '@/lib/agents';
import { JsonFileStore } from '@/lib/server/store';

function newStore() {
  return new JsonFileStore(path.join(mkdtempSync(path.join(tmpdir(), 'onboard-')), 'store.json'));
}

const input = parseAgentInput({ name: 'Tour', goal: 'Show things', startUrl: 'https://x.dev' });

describe('JsonFileStore', () => {
  it('creates agents with unique slugs and persists them', async () => {
    const store = newStore();
    const a = await store.createAgent(input);
    const b = await store.createAgent(input);
    expect(a.slug).toBe('tour');
    expect(b.slug).toMatch(/^tour-[0-9a-f]{4}$/);
    expect(await store.getAgentBySlug(b.slug)).toMatchObject({ id: b.id });
  });

  it('handles concurrent writes without losing data', async () => {
    const store = newStore();
    await Promise.all(Array.from({ length: 20 }, () => store.createAgent(input)));
    const reopened = new JsonFileStore((store as unknown as { file: string }).file);
    expect(await reopened.listAgents()).toHaveLength(20);
  });

  it('tracks session state from worker events', async () => {
    const store = newStore();
    const agent = await store.createAgent(input);
    const session = await store.createSession(agent.id, 'room-1', 'Sam');
    await store.appendSessionEvents(session.id, [
      { type: 'status', data: { state: 'presenting' }, ts: 1 },
      { type: 'say', data: { text: 'Hi Sam!' }, ts: 2 },
    ]);
    expect((await store.getSession(session.id))?.state).toBe('presenting');
    await store.appendSessionEvents(session.id, [
      { type: 'summary', data: { summary: 'Went well' }, ts: 3 },
      { type: 'status', data: { state: 'ended' }, ts: 4 },
    ]);
    const done = await store.getSession(session.id);
    expect(done).toMatchObject({ state: 'ended', summary: 'Went well' });
    expect(done?.events).toHaveLength(4);
    expect(await store.appendSessionEvents('nope', [])).toBeUndefined();
  });

  it('deletes an agent with its sessions and research', async () => {
    const store = newStore();
    const agent = await store.createAgent(input);
    await store.createSession(agent.id, 'r', 'v');
    await store.createResearchJob(agent.id, { notes: '', docsUrls: [] });
    expect(await store.deleteAgent(agent.id)).toBe(true);
    expect(await store.listSessions(agent.id)).toHaveLength(0);
    expect(await store.latestResearchJob(agent.id)).toBeUndefined();
  });

  it('stores research jobs and folds researcher events into them', async () => {
    const store = newStore();
    const agent = await store.createAgent(input);
    const first = await store.createResearchJob(agent.id, { notes: 'CFOs', docsUrls: [] });
    await new Promise((r) => setTimeout(r, 5));
    const job = await store.createResearchJob(agent.id, { notes: 'again', docsUrls: [] });
    expect((await store.latestResearchJob(agent.id))?.id).toBe(job.id);
    await store.appendResearchEvents(job.id, [
      { type: 'draft', data: { goal: 'Show reports', knowledge: 'k', playbook: {} }, ts: 1 },
      { type: 'status', data: { state: 'drafted' }, ts: 2 },
    ]);
    const done = await store.getResearchJob(job.id);
    expect(done).toMatchObject({ state: 'drafted', draft: { goal: 'Show reports' } });
    await store.updateResearchJob(job.id, { revisions: 1 });
    expect((await store.getResearchJob(job.id))?.revisions).toBe(1);
    expect((await store.getResearchJob(first.id))?.state).toBe('queued');
    expect(await store.appendResearchEvents('nope', [])).toBeUndefined();
  });

  it('upgrades store files written before research existed', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'onboard-'));
    const file = path.join(dir, 'store.json');
    const legacyAgent = { ...input, id: 'x', slug: 'x', createdAt: '', updatedAt: '' } as Record<
      string,
      unknown
    >;
    delete legacyAgent.knowledge;
    writeFileSync(file, JSON.stringify({ agents: [legacyAgent], sessions: [] }));
    const store = new JsonFileStore(file);
    expect((await store.getAgent('x'))?.knowledge).toBe('');
    expect(await store.latestResearchJob('x')).toBeUndefined();
  });
});
