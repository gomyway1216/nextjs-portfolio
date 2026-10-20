import { applicationDefault } from 'firebase-admin/app';

/**
 * Whether this server has Google credentials to read Firestore and the Realtime Database with: known at once where it
 * was given a service account, and otherwise looked up once.
 *
 * Production is given a service account (FIREBASE_SERVICE_ACCOUNT_KEY, or FIREBASE_PRIVATE_KEY with its
 * FIREBASE_CLIENT_EMAIL and a project, as firebase-admin.ts reads them): it has credentials, nothing is looked up, and
 * every read goes ahead as it always has. Without one, the Admin SDK falls back on Google's application-default
 * credentials (gcloud's login on a developer's machine, the metadata server on Google Cloud), and those are looked for
 * here, once. Where there are none at all (CI, a machine never logged in), a read can only fail, but the Firestore client
 * finds that out by retrying the lookup with backoff, 7–13 s a read, long past what a page waits for (the medal floor
 * gives up at 6 s), and leaves an unhandled rejection in the log for every try. Known once, such a read fails at once,
 * with the lookup's own error.
 *
 * Credentials found later (a developer logging in with gcloud while the server runs) are seen after a restart.
 */

/** The lookup's error where there are no credentials of any kind; null where there are, or may be. Settled once. */
let lookup: Promise<Error | null> | null = null;

/** Whether the server was given a service account of its own, as production is (see `getAdminSDK`). */
export function hasServiceAccount(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (env.FIREBASE_SERVICE_ACCOUNT_KEY) return true;
  return Boolean(env.FIREBASE_PRIVATE_KEY && env.FIREBASE_CLIENT_EMAIL && (env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_PROJECT_ID));
}

/** Google's own words for "no application-default credentials anywhere" (google-auth-library). */
const NO_CREDENTIALS = 'Could not load the default credentials';

async function lookUp(): Promise<Error | null> {
  if (hasServiceAccount()) return null;
  try {
    await applicationDefault().getAccessToken();
    return null;
  } catch (error) {
    // Only "there are none" is remembered. Credentials that are there but could not be used just now (the network, a
    // token refused) are left to the read, which fails or not as it did before.
    return error instanceof Error && error.message.includes(NO_CREDENTIALS) ? error : null;
  }
}

/**
 * Settles at once where the server has credentials (or may have), and rejects at once, with the lookup's own error
 * ("Could not load the default credentials…"), where it has none at all. Await it before a read that would otherwise
 * wait on the Firestore client's retries to find that out.
 */
export async function requireAdminCredentials(): Promise<void> {
  lookup ??= lookUp();
  const missing = await lookup;
  if (missing) throw new Error(missing.message, { cause: missing });
}
