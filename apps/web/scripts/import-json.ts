/**
 * One-off import of presenters from the old JSON file store into Postgres.
 *
 *   DATABASE_URL=... pnpm db:import-json --email you@company.com [--file .data/store.json]
 *
 * Presenters land in the oldest workspace the given user owns. Slugs are kept
 * when free, so share links and website widgets keep working. Session history
 * is not imported.
 */
import { and, asc, eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { parseAgentInput } from '../lib/agents';
import { createDb } from '../lib/server/db/client';
import { runMigrations } from '../lib/server/db/migrate';
import { member, presenter, user } from '../lib/server/db/schema';
import { encryptSecret } from '../lib/server/secrets';

const { values } = parseArgs({
  options: { email: { type: 'string' }, file: { type: 'string' } },
});
const url = process.env.DATABASE_URL;
if (!url || !values.email) {
  console.error(
    'Usage: DATABASE_URL=... pnpm db:import-json --email you@company.com [--file path]',
  );
  process.exit(1);
}
const file = values.file ?? path.join(process.env.DATA_DIR ?? '.data', 'store.json');

async function main() {
  await runMigrations(url);
  const { db, close } = createDb(url!);
  try {
    const [owner] = await db
      .select({ userId: user.id, workspaceId: member.organizationId })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(and(eq(user.email, values.email!.toLowerCase()), eq(member.role, 'owner')))
      .orderBy(asc(member.createdAt))
      .limit(1);
    if (!owner) throw new Error(`No workspace owned by ${values.email}. Sign up first.`);

    const data = JSON.parse(readFileSync(file, 'utf8')) as { agents?: Record<string, unknown>[] };
    let imported = 0;
    for (const old of data.agents ?? []) {
      const input = parseAgentInput(old);
      const slug = String(old.slug ?? '');
      const [row] = await db
        .insert(presenter)
        .values({
          ...input,
          secrets: input.secrets.map((s) => ({ name: s.name, value: encryptSecret(s.value) })),
          organizationId: owner.workspaceId,
          createdBy: owner.userId,
          slug: slug || `imported-${Date.now().toString(36)}`,
        })
        .onConflictDoNothing({ target: presenter.slug })
        .returning({ id: presenter.id });
      if (row) {
        imported++;
        console.info(`imported ${input.name} (/demo/${slug})`);
      } else {
        console.warn(`skipped ${input.name}: slug "${slug}" is already taken`);
      }
    }
    console.info(`Done: ${imported} presenter(s) imported.`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
