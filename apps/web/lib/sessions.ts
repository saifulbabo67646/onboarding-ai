import type { DemoAgent, DemoSession } from './types';

export type SessionStatus = 'connecting' | 'live' | 'ended' | 'failed';

/** If the worker never reports an end, treat a session as over after this long. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export function sessionStatus(session: DemoSession, now = Date.now()): SessionStatus {
  if (session.state === 'ended') {
    return session.endReason === 'dispatch failed' ? 'failed' : 'ended';
  }
  if (now - Date.parse(session.startedAt) > STALE_AFTER_MS) return 'ended';
  return session.state === 'presenting' ? 'live' : 'connecting';
}

/** Session length in seconds (until now for live sessions, last event for stale ones). */
export function sessionDuration(session: DemoSession, now = Date.now()): number {
  const start = Date.parse(session.startedAt);
  let end: number;
  if (session.endedAt) end = Date.parse(session.endedAt);
  else if (sessionStatus(session, now) === 'ended') {
    end = session.lastEventAt ? Date.parse(session.lastEventAt) : start;
  } else end = now;
  return Math.max(0, Math.round((end - start) / 1000));
}

export type OverviewStats = {
  presenters: number;
  published: number;
  liveNow: number;
  sessions7d: number;
  sessionsPrev7d: number;
  avgDurationSec: number | null;
  daily: { date: string; count: number }[];
};

/** Aggregates for the dashboard overview. `days` buckets are local calendar days. */
export function overviewStats(
  agents: DemoAgent[],
  sessions: DemoSession[],
  { now = Date.now(), days = 14 } = {},
): OverviewStats {
  const DAY = 86_400_000;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(startOfToday.getTime() - (days - 1 - i) * DAY);
    return { date: d.toISOString(), count: 0 };
  });
  const firstBucket = startOfToday.getTime() - (days - 1) * DAY;
  let sessions7d = 0;
  let sessionsPrev7d = 0;
  let liveNow = 0;
  const durations: number[] = [];

  for (const s of sessions) {
    const t = Date.parse(s.startedAt);
    const age = now - t;
    if (age < 7 * DAY) sessions7d++;
    else if (age < 14 * DAY) sessionsPrev7d++;
    if (t >= firstBucket) {
      const idx = Math.floor((t - firstBucket) / DAY);
      if (daily[idx]) daily[idx].count++;
    }
    const status = sessionStatus(s, now);
    if (status === 'live' || status === 'connecting') liveNow++;
    if (status === 'ended') durations.push(sessionDuration(s, now));
  }

  return {
    presenters: agents.length,
    published: agents.filter((a) => a.published).length,
    liveNow,
    sessions7d,
    sessionsPrev7d,
    avgDurationSec: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    daily,
  };
}
