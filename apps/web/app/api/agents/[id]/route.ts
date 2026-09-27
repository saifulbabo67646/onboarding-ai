import { NextResponse, type NextRequest } from 'next/server';
import { parseAgentInput, toOwnerView, ValidationError } from '@/lib/agents';
import { getStore } from '@/lib/server/store';

type Params = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const agent = await getStore().getAgent(id);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sessions = await getStore().listSessions(id, 25);
  return NextResponse.json({ agent: toOwnerView(agent), sessions });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const store = getStore();
  const existing = await store.getAgent(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const agent = await store.updateAgent(id, parseAgentInput(await request.json(), existing));
    return NextResponse.json({ agent: agent && toOwnerView(agent) });
  } catch (e) {
    if (e instanceof ValidationError || e instanceof SyntaxError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const deleted = await getStore().deleteAgent(id);
  return NextResponse.json({ deleted }, { status: deleted ? 200 : 404 });
}
