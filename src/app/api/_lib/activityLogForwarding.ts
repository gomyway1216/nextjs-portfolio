/**
 * Whether this build was made on Vercel: set in next.config.ts at build time, where Vercel always says so, and inlined
 * into the server's code, so it does not depend on Vercel also exposing `VERCEL` to its functions at run time.
 */
const BUILT_ON_VERCEL = process.env.ACTIVITY_LOG_BUILT_ON_VERCEL === '1';

/**
 * Whether this server sends activity logs on to the `logClientActivity` Cloud Function, which writes them into
 * production's `activity_logs` (the admin's traffic charts and error lists).
 *
 * Only a deployment on Vercel does (production and previews, as before). Anywhere else (CI's e2e server, a developer's
 * `next dev` or `next start`) the entries are dropped here: those servers answer test traffic, which would otherwise be
 * written into production's logs as visits and errors. `ACTIVITY_LOG_FORWARD=1` turns forwarding on anywhere (to try
 * the logging itself locally), and `ACTIVITY_LOG_FORWARD=0` off anywhere.
 */
export function forwardsActivityLogs(
  env: Readonly<Record<string, string | undefined>> = process.env,
  builtOnVercel: boolean = BUILT_ON_VERCEL,
): boolean {
  if (env.ACTIVITY_LOG_FORWARD === '1') return true;
  if (env.ACTIVITY_LOG_FORWARD === '0') return false;
  return builtOnVercel || env.VERCEL === '1';
}
