import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export function createDb(url: string): { db: Database; close: () => Promise<void> } {
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    onnotice: () => {},
  });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

// One pool per server process (and survives Next.js dev hot reloads).
const globalForDb = globalThis as unknown as { onboardDb?: Database };

export function getDb(): Database {
  if (!globalForDb.onboardDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForDb.onboardDb = createDb(url).db;
  }
  return globalForDb.onboardDb;
}
