import { NextResponse, type NextRequest } from 'next/server';
import { parseAgentInput, toOwnerView, ValidationError } from '@/lib/agents';
import { getStore } from '@/lib/server/store';

export async function GET() {
  const agents = await getStore().listAgents();
  return NextResponse.json({ agents: agents.map(toOwnerView) });
}

export async function POST(request: NextRequest) {
  try {
    const input = parseAgentInput(await request.json());
    const agent = await getStore().createAgent(input);
    return NextResponse.json({ agent: toOwnerView(agent) }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError || e instanceof SyntaxError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
