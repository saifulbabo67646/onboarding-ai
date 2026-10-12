// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DATABASE_AUTO_MIGRATE !== '0') {
    const { runMigrations } = await import('./lib/server/db/migrate');
    await runMigrations();
    console.info('[db] migrations up to date');
  }
}
