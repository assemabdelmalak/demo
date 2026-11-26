import { loadEnvOrExit } from '@radd/config/env';

import { SEED_MEMBERS, SEED_SUPER_ADMIN } from './data.js';
import { runSeed, SEED_SUMMARY, SeedConflictError, totals } from './run.js';

/**
 * `pnpm db:seed [--with-session]`: the demo restaurant "Beit Tayta" (SEED_DATA). Safe to run
 * again at any time; it only writes what differs. Never runs with APP_ENV=production.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== '--with-session');
  if (unknown.length > 0) {
    process.stderr.write(
      `Unknown option ${unknown.join(' ')}. Usage: pnpm db:seed [--with-session]\n`,
    );
    process.exit(2);
  }
  const env = loadEnvOrExit('seed');
  const report = await runSeed({
    runtimeUrl: env.DATABASE_URL,
    adminUrl: env.DATABASE_URL_ADMIN,
    authSecret: env.BETTER_AUTH_SECRET,
    appEnv: env.APP_ENV,
    withSession: args.includes('--with-session'),
  });

  const sum = totals(report);
  const out = (line = '') => process.stdout.write(`${line}\n`);
  out(
    `Beit Tayta seeded (APP_ENV=${env.APP_ENV}): ${String(sum.inserted)} rows created, ` +
      `${String(sum.updated)} updated, ${String(sum.unchanged)} already up to date.`,
  );
  out(
    `  ${String(SEED_SUMMARY.dishes)} dishes; allergens deliberately unconfirmed on: ` +
      `${SEED_SUMMARY.unconfirmedDishes.join(', ')}.`,
  );
  out('  Sign in to the console with (passwords in docs/SEED_DATA.md):');
  for (const member of SEED_MEMBERS) {
    out(`    ${member.role.padEnd(8)} ${member.email}${member.pin ? `  (PIN ${member.pin})` : ''}`);
  }
  if (report.superAdmin) {
    const admin = report.superAdmin;
    out(`  Super admin (local only): ${admin.email} / ${admin.password}`);
    out(`    TOTP seed: ${admin.totpSecret}`);
    out(`    Authenticator link: ${admin.otpauthUri}`);
    if (!env.SUPER_ADMIN_EMAILS.includes(SEED_SUPER_ADMIN.email)) {
      out(`    Note: add ${SEED_SUPER_ADMIN.email} to SUPER_ADMIN_EMAILS to give it admin access.`);
    }
  } else {
    out(`  No super admin seeded (APP_ENV=${env.APP_ENV}; only local and test get one).`);
  }
  for (const skipped of report.skippedSessions) {
    out(`  Demo session on table ${String(skipped.table)} skipped: ${skipped.reason}.`);
  }
  out(
    'publish pending: the menu is not published yet, so the restaurant stays a draft that diners cannot see (publishing arrives in P2-T08).',
  );
  out('images pending: no dish photos yet (the assets pipeline arrives in P2-T02).');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `Seed failed: ${message}\n${error instanceof SeedConflictError ? '' : 'Each step runs in its own transaction; run the seed again once the cause is fixed.\n'}`,
  );
  process.exit(1);
});
