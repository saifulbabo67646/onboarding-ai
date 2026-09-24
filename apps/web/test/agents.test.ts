import { describe, expect, it } from 'vitest';
import {
  parseAgentInput,
  slugify,
  toBrief,
  toOwnerView,
  toPublic,
  ValidationError,
} from '@/lib/agents';
import type { DemoAgent } from '@/lib/types';

const valid = {
  name: 'Dashboard tour',
  goal: 'Show the analytics dashboard',
  startUrl: 'app.example.com/login',
};

describe('parseAgentInput', () => {
  it('applies defaults and normalises the URL', () => {
    const input = parseAgentInput(valid);
    expect(input.mode).toBe('product_demo');
    expect(input.startUrl).toBe('https://app.example.com/login');
    expect(input.presenterName).toBe('Alex');
    expect(input.published).toBe(true);
    expect(input.maxMinutes).toBe(30);
  });

  it('rejects missing goal, bad mode and non-http URLs', () => {
    expect(() => parseAgentInput({ ...valid, goal: ' ' })).toThrow(ValidationError);
    expect(() => parseAgentInput({ ...valid, mode: 'karaoke' })).toThrow(ValidationError);
    expect(() => parseAgentInput({ ...valid, startUrl: 'javascript:alert(1)' })).toThrow(
      ValidationError,
    );
    expect(() => parseAgentInput({ ...valid, maxMinutes: 500 })).toThrow(ValidationError);
  });

  it('keeps saved secret values when the client sends them back empty', () => {
    const previous = {
      ...parseAgentInput(valid),
      id: '1',
      slug: 's',
      createdAt: '',
      updatedAt: '',
      secrets: [{ name: 'password', value: 'hunter2' }],
    } as DemoAgent;
    const updated = parseAgentInput(
      {
        ...valid,
        secrets: [
          { name: 'password', value: '' },
          { name: 'otp', value: '123' },
        ],
      },
      previous,
    );
    expect(updated.secrets).toEqual([
      { name: 'otp', value: '123' },
      { name: 'password', value: 'hunter2' },
    ]);
  });
});

describe('views', () => {
  const agent: DemoAgent = {
    ...parseAgentInput({ ...valid, secrets: [{ name: 'password', value: 'hunter2' }] }),
    id: 'a1',
    slug: 'dashboard-tour',
    createdAt: '',
    updatedAt: '',
  };

  it('never exposes secrets or the goal publicly', () => {
    const pub = JSON.stringify(toPublic(agent));
    expect(pub).not.toContain('hunter2');
    expect(pub).not.toContain(agent.goal);
    expect(JSON.stringify(toOwnerView(agent))).not.toContain('hunter2');
  });

  it('builds the worker brief with snake_case keys', () => {
    const brief = toBrief(agent, 'Sam');
    expect(brief).toMatchObject({
      goal: agent.goal,
      mode: 'product_demo',
      start_url: 'https://app.example.com/login',
      audience_name: 'Sam',
      secrets: [{ name: 'password', value: 'hunter2' }],
    });
  });
});

describe('slugify', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('Q3 Product Update — Café!')).toBe('q3-product-update-cafe');
    expect(slugify('!!!')).toBe('demo');
  });
});
