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

/** The lookup, started once. It settles with its error where there are no credentials of any kind, null otherwise. */
let lookup: Promise<Error | null> | null = null;
/** Set once the lookup has found no credentials of any kind. */
let missing: Error | null = null;

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

/** The lookup, started the first time it is asked for; it never rejects. */
function lookUpOnce(): Promise<Error | null> {
  lookup ??= lookUp().then((found) => {
    missing = found;
    return found;
  });
  return lookup;
}

const noCredentials = (found: Error) => new Error(found.message, { cause: found });

/**
 * Settles at once where the server has credentials (or may have), and rejects at once, with the lookup's own error
 * ("Could not load the default credentials…"), where it has none at all; the first time, once the lookup has answered.
 * Await it before a read that would otherwise wait on the Firestore client's retries to find that out.
 */
export async function requireAdminCredentials(): Promise<void> {
  const found = await lookUpOnce();
  if (found) throw noCredentials(found);
}

/**
 * For a client about to be handed out (firebase-admin.ts's `getFirestore` and `getRealtimeDatabase`): throws at once,
 * with the lookup's own error, where the lookup has already found no credentials at all, and otherwise starts the
 * lookup (once) and returns. It never waits, and never throws where the server was given a service account.
 */
export function throwIfWithoutCredentials(): void {
  void lookUpOnce();
  if (missing) throw noCredentials(missing);
}
