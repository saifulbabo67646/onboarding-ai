import 'server-only';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';

const AGENT_NAME = process.env.AGENT_NAME ?? 'onboarding-agent';

function env() {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set');
  }
  return { url: LIVEKIT_URL, key: LIVEKIT_API_KEY, secret: LIVEKIT_API_SECRET };
}

export function livekitServerUrl(): string {
  return env().url;
}

export async function participantToken(
  room: string,
  identity: string,
  name: string,
): Promise<string> {
  const { key, secret } = env();
  const token = new AccessToken(key, secret, { identity, name, ttl: '15m' });
  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });
  return token.toJwt();
}

/** Creates the room and asks the presenter worker to join it with the given metadata. */
export async function dispatchPresenter(room: string, metadata: object): Promise<void> {
  const { url, key, secret } = env();
  const httpUrl = url.replace(/^ws/, 'http');
  await new RoomServiceClient(httpUrl, key, secret).createRoom({ name: room, emptyTimeout: 120 });
  await new AgentDispatchClient(httpUrl, key, secret).createDispatch(room, AGENT_NAME, {
    metadata: JSON.stringify(metadata),
  });
}
