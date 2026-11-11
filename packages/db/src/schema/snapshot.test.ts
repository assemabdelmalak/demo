import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as kitApi from 'drizzle-kit/api';
import { describe, expect, it } from 'vitest';

import * as schema from './index.js';

const META = fileURLToPath(new URL('../../drizzle/meta', import.meta.url));

interface Snapshot {
  id: string;
}

// drizzle-kit's declarations are written against zod 3 and do not resolve under zod 4, so the two
// functions used here are typed by hand.
const kit = kitApi as unknown as {
  generateDrizzleJson: (imports: Record<string, unknown>, prevId?: string) => Snapshot;
  generateMigration: (previous: Snapshot, current: Snapshot) => Promise<string[]>;
};

function latestSnapshot(): Snapshot {
  const file = readdirSync(META)
    .filter((name) => name.endsWith('_snapshot.json'))
    .sort()
    .at(-1);
  if (!file) throw new Error('no snapshot in drizzle/meta; run `pnpm db:generate`');
  return JSON.parse(readFileSync(`${META}/${file}`, 'utf8')) as Snapshot;
}

describe('schema snapshot (P1-T02)', () => {
  it('has a committed migration for every schema change', async () => {
    const committed = latestSnapshot();
    const current = kit.generateDrizzleJson(schema, committed.id);
    // Any statement here means `pnpm db:generate` was not run after editing the schema.
    expect(await kit.generateMigration(committed, current)).toEqual([]);
  });
});
