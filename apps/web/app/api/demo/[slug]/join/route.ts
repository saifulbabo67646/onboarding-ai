import { randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { toBrief } from '@/lib/agents';
import { dispatchPresenter, livekitServerUrl, participantToken } from '@/lib/server/livekit';
import { getStore } from '@/lib/server/store';
import type { ConnectionDetails } from '@/lib/types';

type Params = { params: Promise<{ slug: string }> };

/** A visitor asks to join a live demo: create a private room and send a presenter into it. */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const store = getStore();
  const agent = await store.getAgentBySlug(slug);
  if (!agent || !agent.published) {
    return NextResponse.json({ error: 'This demo is not available.' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const visitorName = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (!visitorName) {
    return NextResponse.json({ error: 'Please tell us your name.' }, { status: 400 });
  }

  const room = `demo-${agent.slug}-${randomBytes(4).toString('hex')}`;
  const session = await store.createSession(agent.id, room, visitorName);
  const callbackBase = process.env.AGENT_CALLBACK_BASE_URL ?? request.nextUrl.origin;

  try {
    await dispatchPresenter(room, {
      session_id: session.id,
      brief: toBrief(agent, visitorName),
      voice: { tts_voice: agent.voiceId || undefined },
      callback_url: `${callbackBase}/api/sessions/${session.id}/events`,
    });
    const details: ConnectionDetails = {
      serverUrl: livekitServerUrl(),
      roomName: room,
      participantName: visitorName,
      participantToken: await participantToken(
        room,
        `visitor-${randomBytes(3).toString('hex')}`,
        visitorName,
      ),
      sessionId: session.id,
    };
    return NextResponse.json(details);
  } catch (e) {
    console.error('failed to start demo session', e);
    await store.appendSessionEvents(session.id, [
      {
        type: 'status',
        data: { state: 'ended', reason: 'dispatch failed' },
        ts: Date.now() / 1000,
      },
    ]);
    return NextResponse.json(
      { error: 'We could not start the live demo right now. Please try again in a minute.' },
      { status: 503 },
    );
  }
}
