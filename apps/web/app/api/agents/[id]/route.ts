import { NextResponse, type NextRequest } from 'next/server';
import { parseAgentInput, toOwnerView } from '@/lib/agents';
import { withViewer } from '@/lib/server/api';
import { getStore } from '@/lib/server/store';

type Params = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export const GET = withViewer(async (viewer, _: NextRequest, { params }: Params) => {
  const { id } = await params;
  const store = getStore();
  const agent = await store.getAgent(viewer.workspace.id, id);
  if (!agent) return notFound();
  const sessions = await store.listSessions(viewer.workspace.id, { agentId: id, limit: 25 });
  return NextResponse.json({ agent: toOwnerView(agent), sessions });
});

export const PUT = withViewer(async (viewer, request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const store = getStore();
  const existing = await store.getAgent(viewer.workspace.id, id);
  if (!existing) return notFound();
  const agent = await store.updateAgent(
    viewer.workspace.id,
    id,
    parseAgentInput(await request.json(), existing),
  );
  return agent ? NextResponse.json({ agent: toOwnerView(agent) }) : notFound();
});

export const DELETE = withViewer(async (viewer, _: NextRequest, { params }: Params) => {
  const { id } = await params;
  const deleted = await getStore().deleteAgent(viewer.workspace.id, id);
  return deleted ? NextResponse.json({ deleted }) : notFound();
});
