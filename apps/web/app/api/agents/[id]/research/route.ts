import { NextResponse, type NextRequest } from 'next/server';
import { isActive, parseResearchInput, toResearchRequest } from '@/lib/research';
import { errorResponse } from '@/lib/server/http';
import { startResearch } from '@/lib/server/researcher';
import { getStore } from '@/lib/server/store';

type Params = { params: Promise<{ id: string }> };

/** The presenter's latest research job (polled by the dashboard while it runs). */
export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const store = getStore();
  if (!(await store.getAgent(id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ job: (await store.latestResearchJob(id)) ?? null });
}

/** Start researching the presenter's app: docs, hands-on exploration, then a draft demo. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const store = getStore();
  const agent = await store.getAgent(id);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const input = parseResearchInput(await request.json().catch(() => ({})));
    const latest = await store.latestResearchJob(id);
    if (latest && isActive(latest)) {
      return NextResponse.json(
        { error: 'Research is already running.', job: latest },
        { status: 409 },
      );
    }
    const job = await store.createResearchJob(id, input);
    const callbackBase = process.env.AGENT_CALLBACK_BASE_URL ?? request.nextUrl.origin;
    try {
      await startResearch(
        job.id,
        toResearchRequest(agent, input),
        `${callbackBase}/api/research/${job.id}/events`,
      );
    } catch (e) {
      const failed = await store.appendResearchEvents(job.id, [
        { type: 'error', data: { message: (e as Error).message }, ts: Date.now() / 1000 },
        { type: 'status', data: { state: 'failed' }, ts: Date.now() / 1000 },
      ]);
      return NextResponse.json({ error: (e as Error).message, job: failed }, { status: 503 });
    }
    return NextResponse.json({ job }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
