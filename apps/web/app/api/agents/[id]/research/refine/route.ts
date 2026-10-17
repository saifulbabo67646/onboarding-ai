import { NextResponse, type NextRequest } from 'next/server';
import { toResearchRequest } from '@/lib/research';
import { withViewer } from '@/lib/server/api';
import { errorResponse } from '@/lib/server/http';
import { refinePlaybook } from '@/lib/server/researcher';
import { getStore } from '@/lib/server/store';
import { object, str } from '@/lib/validation';

type Params = { params: Promise<{ id: string }> };

/** Revise the latest draft from the owner's plain-language feedback. */
export const POST = withViewer(async (viewer, request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const store = getStore();
  const agent = await store.getAgent(viewer.workspace.id, id);
  const job = agent && (await store.latestResearchJob(viewer.workspace.id, id));
  if (!agent || !job?.draft) {
    return NextResponse.json({ error: 'There is no draft to refine yet.' }, { status: 404 });
  }
  const instruction = str(object(await request.json()).instruction, 'instruction', {
    required: true,
    max: 2000,
  });
  try {
    const draft = await refinePlaybook(
      toResearchRequest(agent, job),
      job.draft.playbook,
      instruction,
    );
    const updated = await store.updateResearchJob(viewer.workspace.id, job.id, {
      draft,
      revisions: job.revisions + 1,
      appliedAt: undefined,
    });
    return NextResponse.json({ job: updated });
  } catch (e) {
    return errorResponse(e);
  }
});
