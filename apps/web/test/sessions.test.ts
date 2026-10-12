import { describe, expect, it } from 'vitest';
import { formatDuration } from '@/lib/format';
import { overviewStats, sessionDuration, sessionStatus } from '@/lib/sessions';
import type { DemoAgent, DemoSession } from '@/lib/types';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function session(over: Partial<DemoSession> = {}): DemoSession {
  return {
    id: Math.random().toString(36),
    agentId: 'a1',
    room: 'r',
    visitorName: 'Sam',
    state: 'ended',
    startedAt: minutesAgo(30),
    endedAt: minutesAgo(20),
    events: [],
    ...over,
  };
}

describe('sessionStatus', () => {
  it('maps worker states to what the dashboard shows', () => {
    expect(sessionStatus(session(), NOW)).toBe('ended');
    expect(sessionStatus(session({ state: 'presenting', endedAt: undefined }), NOW)).toBe('live');
    expect(sessionStatus(session({ state: 'starting', endedAt: undefined }), NOW)).toBe(
      'connecting',
    );
  });

  it('marks failed dispatches', () => {
    const failed = session({
      events: [{ type: 'status', data: { state: 'ended', reason: 'dispatch failed' }, ts: 0 }],
    });
    expect(sessionStatus(failed, NOW)).toBe('failed');
  });

  it('treats sessions that never reported an end as ended after a while', () => {
    const stale = session({ state: 'presenting', startedAt: minutesAgo(600), endedAt: undefined });
    expect(sessionStatus(stale, NOW)).toBe('ended');
  });
});

describe('sessionDuration', () => {
  it('uses the end time, or now for live sessions', () => {
    expect(sessionDuration(session(), NOW)).toBe(600);
    expect(sessionDuration(session({ state: 'presenting', endedAt: undefined }), NOW)).toBe(1800);
  });
});

describe('overviewStats', () => {
  const agent = { id: 'a1', published: true } as DemoAgent;

  it('counts live sessions, weekly totals and the daily series', () => {
    const sessions = [
      session(),
      session({ state: 'presenting', endedAt: undefined, startedAt: minutesAgo(5) }),
      session({ startedAt: minutesAgo(60 * 24 * 9), endedAt: minutesAgo(60 * 24 * 9 - 4) }),
    ];
    const stats = overviewStats([agent], sessions, { now: NOW });
    expect(stats.liveNow).toBe(1);
    expect(stats.sessions7d).toBe(2);
    expect(stats.sessionsPrev7d).toBe(1);
    expect(stats.daily).toHaveLength(14);
    expect(stats.daily.reduce((a, d) => a + d.count, 0)).toBe(3);
    expect(stats.avgDurationSec).toBe((600 + 240) / 2);
  });

  it('has no average when nothing has finished', () => {
    expect(overviewStats([agent], [], { now: NOW }).avgDurationSec).toBeNull();
  });
});

describe('formatDuration', () => {
  it('reads naturally', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(600)).toBe('10m');
    expect(formatDuration(647)).toBe('10m 47s');
    expect(formatDuration(3720)).toBe('1h 2m');
    expect(formatDuration(null)).toBe('—');
  });
});
