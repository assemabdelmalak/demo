import { loadEnvOrExit } from '@radd/config/env';
import { runMigrations } from '@radd/db';

/**
 * `node dist/migrate.js`: applies pending migrations as the schema owner, then exits. Run before
 * each deploy (DEPLOYMENT §3) and by `pnpm db:migrate`. The API itself never holds this credential.
 */
async function main(): Promise<void> {
  const env = loadEnvOrExit('migrate');
  await runMigrations({ url: env.DATABASE_URL_MIGRATOR });
  process.stdout.write('Migrations are up to date\n');
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Migration failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
