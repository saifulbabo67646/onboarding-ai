import { relations, sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization, user } from './auth-schema';

/** Encrypted at rest: `value` holds AES-GCM ciphertext (see lib/server/secrets.ts). */
export type StoredSecret = { name: string; value: string };

export const presenter = pgTable(
  'presenter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    mode: text('mode').notNull(),
    goal: text('goal').notNull(),
    startUrl: text('start_url').notNull(),
    description: text('description').notNull().default(''),
    presenterName: text('presenter_name').notNull(),
    companyName: text('company_name').notNull().default(''),
    greeting: text('greeting').notNull().default(''),
    language: text('language').notNull().default('English'),
    voiceId: text('voice_id').notNull().default(''),
    allowWhiteboard: boolean('allow_whiteboard').notNull().default(false),
    maxMinutes: integer('max_minutes').notNull().default(20),
    published: boolean('published').notNull().default(true),
    secrets: jsonb('secrets').$type<StoredSecret[]>().notNull().default([]),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('presenter_organization_idx').on(t.organizationId, t.updatedAt),
    check('presenter_mode_check', sql`${t.mode} in ('product_demo', 'presentation')`),
  ],
);

export const demoSession = pgTable(
  'demo_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presenterId: uuid('presenter_id')
      .notNull()
      .references(() => presenter.id, { onDelete: 'cascade' }),
    // Denormalised so every dashboard query can filter by workspace directly.
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    room: text('room').notNull(),
    visitorName: text('visitor_name').notNull(),
    /** Hash of the visitor's IP, only used for join rate limiting. */
    visitorIpHash: text('visitor_ip_hash'),
    state: text('state').notNull().default('starting'),
    endReason: text('end_reason'),
    summary: text('summary'),
    messageCount: integer('message_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    index('demo_session_organization_idx').on(t.organizationId, t.startedAt),
    index('demo_session_presenter_idx').on(t.presenterId, t.startedAt),
    index('demo_session_ip_idx').on(t.visitorIpHash, t.startedAt),
  ],
);

export const sessionEvent = pgTable(
  'session_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => demoSession.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    /** Seconds since the epoch, as reported by the worker. */
    ts: doublePrecision('ts').notNull(),
  },
  (t) => [index('session_event_session_idx').on(t.sessionId, t.ts)],
);

export const presenterRelations = relations(presenter, ({ one, many }) => ({
  organization: one(organization, {
    fields: [presenter.organizationId],
    references: [organization.id],
  }),
  sessions: many(demoSession),
}));

export const demoSessionRelations = relations(demoSession, ({ one, many }) => ({
  presenter: one(presenter, { fields: [demoSession.presenterId], references: [presenter.id] }),
  events: many(sessionEvent),
}));

export const sessionEventRelations = relations(sessionEvent, ({ one }) => ({
  session: one(demoSession, { fields: [sessionEvent.sessionId], references: [demoSession.id] }),
}));
