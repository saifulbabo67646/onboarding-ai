export type DemoMode = 'product_demo' | 'presentation';

export interface Secret {
  name: string;
  value: string;
}

/** A presenter configured by the owner: a goal, a starting point and a persona. */
export interface DemoAgent {
  id: string;
  /** The workspace (Better Auth organization) that owns this presenter. */
  workspaceId: string;
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
  workspaceId: string;
  room: string;
  visitorName: string;
  state: SessionState;
  /** Set when the session ended abnormally, e.g. "dispatch failed". */
  endReason?: string;
  startedAt: string;
  endedAt?: string;
  lastEventAt?: string;
  summary?: string;
  /** Lines of conversation (presenter + visitor) so far. */
  messageCount: number;
}

export interface DemoSessionDetail extends DemoSession {
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

export type WorkspaceRole = 'owner' | 'admin' | 'member';

/** The signed-in user and the workspace they are working in. */
export type Viewer = {
  user: { id: string; name: string; email: string; image?: string | null };
  workspace: { id: string; name: string; slug: string };
  role: WorkspaceRole;
  workspaces: { id: string; name: string; role: WorkspaceRole }[];
};
