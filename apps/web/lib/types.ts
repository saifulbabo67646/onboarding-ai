export type DemoMode = 'product_demo' | 'presentation';

export interface Secret {
  name: string;
  value: string;
}

/** A presenter configured by the owner: a goal, a starting point and a persona. */
export interface DemoAgent {
  id: string;
  slug: string;
  name: string;
  mode: DemoMode;
  /** What the presenter should accomplish, in plain language. */
  goal: string;
  /** Web app URL (product demo) or deck link (presentation). */
  startUrl: string;
  /** Shown to visitors on the public demo page. */
  description: string;
  presenterName: string;
  companyName: string;
  greeting: string;
  language: string;
  voiceId: string;
  allowWhiteboard: boolean;
  maxMinutes: number;
  secrets: Secret[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SessionState = 'starting' | 'joined' | 'presenting' | 'ended';

export interface SessionEvent {
  type: string;
  data: Record<string, unknown>;
  ts: number;
}

export interface DemoSession {
  id: string;
  agentId: string;
  room: string;
  visitorName: string;
  state: SessionState;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  events: SessionEvent[];
}

/** What the public demo page may know about an agent (no goal, no secrets). */
export interface PublicAgent {
  slug: string;
  name: string;
  mode: DemoMode;
  description: string;
  presenterName: string;
  companyName: string;
}

export interface ConnectionDetails {
  serverUrl: string;
  roomName: string;
  participantToken: string;
  participantName: string;
  sessionId: string;
}
