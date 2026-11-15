// better-auth lists every framework it can integrate with as an optional peer dependency. pnpm
// links the ones that exist anywhere in the workspace, which put Next.js, Vitest (with Vite and
// jsdom) and drizzle-kit into the API's production install: a 530 MB image instead of ~130 MB.
// Neither the API nor the console uses those integrations, so the edges are removed here.
// React stays: the console's auth client needs it.
const UNUSED_BETTER_AUTH_PEERS = ['next', 'vitest', 'drizzle-kit'];

function readPackage(pkg) {
  if (pkg.name === 'better-auth' || pkg.name?.startsWith('@better-auth/')) {
    for (const peer of UNUSED_BETTER_AUTH_PEERS) {
      delete pkg.peerDependencies?.[peer];
      delete pkg.peerDependenciesMeta?.[peer];
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
