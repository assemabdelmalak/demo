import { defineConfig } from 'drizzle-kit';

// `generate` only diffs the schema against the committed snapshots; it never connects to a
// database. The URL is used by `studio` alone.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  migrations: { schema: 'drizzle' },
  dbCredentials: {
    url: process.env.DATABASE_URL_MIGRATOR ?? 'postgres://localhost:5432/radd',
  },
  strict: true,
  verbose: true,
});
