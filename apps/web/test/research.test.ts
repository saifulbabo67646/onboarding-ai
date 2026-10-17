import { describe, expect, it } from 'vitest';
import { parseAgentInput } from '@/lib/agents';
import {
  applyResearchEvent,
  isActive,
  parseDraft,
  parseDraftEdit,
  parseResearchInput,
  progressLines,
  STALE_JOB_MS,
  toResearchRequest,
} from '@/lib/research';
import type { DemoAgent, ResearchJob } from '@/lib/types';
import { ValidationError } from '@/lib/validation';

const agent: DemoAgent = {
  ...parseAgentInput({
    name: 'Acme tour',
    goal: '',
    published: false,
    startUrl: 'app.acme.dev/login',
    secrets: [{ name: 'password', value: 'hunter2' }],
  }),
  id: 'a1',
  slug: 'acme-tour',
  createdAt: '',
  updatedAt: '',
};

function job(patch: Partial<ResearchJob> = {}): ResearchJob {
  return {
    id: 'j1',
    agentId: 'a1',
    notes: '',
    docsUrls: [],
    state: 'queued',
    startedAt: new Date().toISOString(),
    warnings: [],
    events: [],
    revisions: 0,
    ...patch,
  };
}

const draft = {
  goal: 'Show reports',
  knowledge: '## Acme',
  playbook: { product_name: 'Acme', sections: [{ title: 'Home', steps: ['Open', 3] }] },
};

describe('research input', () => {
  it('normalises docs links and rejects bad ones', () => {
    expect(parseResearchInput({ notes: ' focus ', docsUrls: ['docs.acme.dev', ''] })).toEqual({
      notes: 'focus',
      docsUrls: ['https://docs.acme.dev/'],
    });
    expect(parseResearchInput(undefined)).toEqual({ notes: '', docsUrls: [] });
    expect(() => parseResearchInput({ docsUrls: ['javascript:alert(1)'] })).toThrow(
      ValidationError,
    );
    expect(() => parseResearchInput({ docsUrls: 'x' })).toThrow(ValidationError);
  });

  it('requires a goal only when publishing a draft', () => {
    expect(parseDraftEdit({ goal: '', knowledge: 'k' }).publish).toBe(false);
    expect(() => parseDraftEdit({ goal: ' ', publish: true })).toThrow(ValidationError);
  });

  it('builds the researcher request with credentials and hints', () => {
    expect(toResearchRequest(agent, { notes: 'CFOs', docsUrls: ['https://d/'] })).toMatchObject({
      url: 'https://app.acme.dev/login',
      product_name: 'Acme tour',
      notes: 'CFOs',
      docs_urls: ['https://d/'],
      secrets: [{ name: 'password', value: 'hunter2' }],
    });
  });
});

describe('research events', () => {
  it('tracks phases, warnings, the draft and completion', () => {
    const j = job();
    applyResearchEvent(j, { type: 'status', data: { state: 'researching', phase: 'docs' }, ts: 1 });
    applyResearchEvent(j, { type: 'progress', data: { phase: 'docs', message: 'Reading' }, ts: 2 });
    applyResearchEvent(j, { type: 'warning', data: { message: 'No sandbox' }, ts: 3 });
    applyResearchEvent(j, { type: 'draft', data: draft, ts: 4 });
    applyResearchEvent(j, { type: 'status', data: { state: 'drafted' }, ts: 5 });
    expect(j).toMatchObject({ state: 'drafted', phase: 'docs', warnings: ['No sandbox'] });
    expect(j.finishedAt).toBe(new Date(5000).toISOString());
    expect(j.draft?.playbook.sections[0].steps).toEqual(['Open']);
    expect(j.events.map((e) => e.type)).not.toContain('draft');
    expect(progressLines(j)).toEqual(['Reading', 'No sandbox']);
  });

  it('records errors and ignores unusable drafts', () => {
    const j = job();
    applyResearchEvent(j, { type: 'draft', data: { goal: '' }, ts: 1 });
    applyResearchEvent(j, { type: 'error', data: { message: 'boom' }, ts: 2 });
    applyResearchEvent(j, { type: 'status', data: { state: 'failed' }, ts: 3 });
    expect(j).toMatchObject({ state: 'failed', error: 'boom' });
    expect(j.draft).toBeUndefined();
    expect(parseDraft(null)).toBeUndefined();
  });

  it('treats long-silent jobs as no longer running', () => {
    const now = Date.now();
    expect(isActive(job(), now)).toBe(true);
    expect(isActive(job({ state: 'drafted' }), now)).toBe(false);
    const old = new Date(now - STALE_JOB_MS - 1000).toISOString();
    expect(isActive(job({ startedAt: old }), now)).toBe(false);
  });
});
