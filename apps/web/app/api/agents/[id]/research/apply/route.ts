import { NextResponse, type NextRequest } from 'next/server';
import { agentInputOf, toOwnerView } from '@/lib/agents';
import { parseDraftEdit } from '@/lib/research';
import { withViewer } from '@/lib/server/api';
import { getStore } from '@/lib/server/store';

type Params = { params: Promise<{ id: string }> };

/** The owner approves the (possibly edited) draft: it becomes the presenter's goal and notes. */
export const POST = withViewer(async (viewer, request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const store = getStore();
  const agent = await store.getAgent(viewer.workspace.id, id);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const edit = parseDraftEdit(await request.json());
  const updated = await store.updateAgent(viewer.workspace.id, id, {
    ...agentInputOf(agent),
    goal: edit.goal,
    knowledge: edit.knowledge,
    published: edit.publish || (agent.published && Boolean(edit.goal)),
  });
  const job = await store.latestResearchJob(viewer.workspace.id, id);
  if (job?.draft) {
    await store.updateResearchJob(viewer.workspace.id, job.id, {
      appliedAt: new Date().toISOString(),
    });
  }
  return NextResponse.json({ agent: updated && toOwnerView(updated) });
});
