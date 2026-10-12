import { NextResponse, type NextRequest } from 'next/server';
import { parseAgentInput, toOwnerView } from '@/lib/agents';
import { withViewer } from '@/lib/server/api';
import { getStore } from '@/lib/server/store';

export const GET = withViewer(async (viewer) => {
  const agents = await getStore().listAgents(viewer.workspace.id);
  return NextResponse.json({ agents: agents.map(toOwnerView) });
});

export const POST = withViewer(async (viewer, request: NextRequest) => {
  const input = parseAgentInput(await request.json());
  const agent = await getStore().createAgent(viewer.workspace.id, viewer.user.id, input);
  return NextResponse.json({ agent: toOwnerView(agent) }, { status: 201 });
});
