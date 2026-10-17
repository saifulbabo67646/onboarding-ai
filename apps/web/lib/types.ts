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
  /** What the presenter should accomplish, in plain language. Empty while a draft is researched. */
  goal: string;
  /** Background the presenter studies before the call (product facts, navigation, FAQ). */
  knowledge: string;
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

// ── AI research: the presenter learns the product and drafts its own demo ──

export type ResearchState = 'queued' | 'researching' | 'drafted' | 'failed';

export type ResearchPhase = 'docs' | 'explore' | 'write';

export interface PlaybookSection {
  title: string;
  objective: string;
  where: string;
  steps: string[];
  talking_points: string[];
}

/** The structured demo plan written by onboard-researcher (snake_case, as produced). */
export interface Playbook {
  product_name: string;
  product_summary: string;
  audience: string;
  demo_title: string;
  goal: string;
  duration_minutes: number;
  opening: string;
  sections: PlaybookSection[];
  login: { required: boolean; steps: string[]; secret_names: string[] };
  faq: { question: string; answer: string }[];
  glossary: { term: string; meaning: string }[];
  avoid: string[];
  sources: string[];
}

/** A playbook plus the two texts it renders to for the presenter. */
export interface ResearchDraft {
  goal: string;
  knowledge: string;
  playbook: Playbook;
}

/** What the owner tells the researcher besides the URL and credentials. */
export interface ResearchInput {
  notes: string;
  docsUrls: string[];
}

export interface ResearchJob extends ResearchInput {
  id: string;
  agentId: string;
  state: ResearchState;
  phase?: ResearchPhase;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  warnings: string[];
  /** Progress lines and status changes reported by the researcher. */
  events: SessionEvent[];
  draft?: ResearchDraft;
  /** How many times the owner refined the draft with feedback. */
  revisions: number;
  /** When the draft was copied into the presenter's goal and notes. */
  appliedAt?: string;
}
