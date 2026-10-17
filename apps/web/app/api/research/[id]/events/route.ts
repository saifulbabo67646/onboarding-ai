import { NextResponse, type NextRequest } from 'next/server';
import { isAgentRequest } from '@/lib/server/agent-auth';
import { getStore } from '@/lib/server/store';
import type { SessionEvent } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

/** Progress, warnings and the final draft reported by the research service. */
export async function POST(request: NextRequest, { params }: Params) {
  if (!isAgentRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { events?: unknown } | null;
  if (!body || !Array.isArray(body.events)) {
    return NextResponse.json({ error: 'Expected {events: [...]}' }, { status: 400 });
  }
  const events: SessionEvent[] = body.events
    .filter((e): e is SessionEvent => typeof e?.type === 'string' && typeof e?.data === 'object')
    .slice(0, 100)
    .map((e) => ({ type: e.type, data: e.data ?? {}, ts: Number(e.ts) || Date.now() / 1000 }));
  const job = await getStore().appendResearchEvents(id, events);
  if (!job) return NextResponse.json({ error: 'Unknown research job' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
