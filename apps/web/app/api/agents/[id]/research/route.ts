import { NextResponse, type NextRequest } from 'next/server';
import { isActive, parseResearchInput, toResearchRequest } from '@/lib/research';
import { withViewer } from '@/lib/server/api';
import { errorResponse } from '@/lib/server/http';
import { startResearch } from '@/lib/server/researcher';
import { getStore } from '@/lib/server/store';

type Params = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

/** The presenter's latest research job (polled by the dashboard while it runs). */
export const GET = withViewer(async (viewer, _: NextRequest, { params }: Params) => {
  const { id } = await params;
  const store = getStore();
  if (!(await store.getAgent(viewer.workspace.id, id))) return notFound();
  return NextResponse.json({
    job: (await store.latestResearchJob(viewer.workspace.id, id)) ?? null,
  });
});

/** Start researching the presenter's app: docs, hands-on exploration, then a draft demo. */
export const POST = withViewer(async (viewer, request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const store = getStore();
  const agent = await store.getAgent(viewer.workspace.id, id);
  if (!agent) return notFound();
  const input = parseResearchInput(await request.json().catch(() => ({})));
  const latest = await store.latestResearchJob(viewer.workspace.id, id);
  if (latest && isActive(latest)) {
    return NextResponse.json(
      { error: 'Research is already running.', job: latest },
      { status: 409 },
    );
  }
  const job = await store.createResearchJob(agent, input);
  const callbackBase = process.env.AGENT_CALLBACK_BASE_URL ?? request.nextUrl.origin;
  try {
    await startResearch(
      job.id,
      toResearchRequest(agent, input),
      `${callbackBase}/api/research/${job.id}/events`,
    );
  } catch (e) {
    const now = Date.now() / 1000;
    const failed = await store.appendResearchEvents(job.id, [
      { type: 'error', data: { message: (e as Error).message }, ts: now },
      { type: 'status', data: { state: 'failed' }, ts: now },
    ]);
    const response = errorResponse(e);
    return NextResponse.json(
      { ...(await response.json()), job: failed },
      { status: response.status },
    );
  }
  return NextResponse.json({ job }, { status: 202 });
});
