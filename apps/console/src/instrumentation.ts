/**
 * Runs once when the server starts (not at build time), so a container with missing or invalid
 * env exits immediately with the list of problems (P0-T02, ADR-012).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadEnvOrExit } = await import('@radd/config/env');
    loadEnvOrExit('console');
  }
}
