// Some packages list optional peer dependencies they never need at runtime. pnpm links the ones
// that exist anywhere in the workspace, which drags dev tools into the API's production install
// and its Docker image (checked to stay under 250 MB). The edges are removed here.
//
// - better-auth lists every framework it can integrate with: Next.js, Vitest (with Vite and jsdom)
//   and drizzle-kit put the API image at 530 MB instead of ~130 MB. Neither the API nor the console
//   uses those integrations. React stays: the console's auth client needs it.
// - valibot (via Bull Board's API) lists TypeScript for its type definitions only; it added 23 MB
//   of compiler to the API image.
const UNUSED_PEERS = {
  'better-auth': ['next', 'vitest', 'drizzle-kit'],
  valibot: ['typescript'],
};

function unusedPeersOf(name) {
  if (!name) return undefined;
  if (name.startsWith('@better-auth/')) return UNUSED_PEERS['better-auth'];
  return UNUSED_PEERS[name];
}

function readPackage(pkg) {
  for (const peer of unusedPeersOf(pkg.name) ?? []) {
    delete pkg.peerDependencies?.[peer];
    delete pkg.peerDependenciesMeta?.[peer];
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
