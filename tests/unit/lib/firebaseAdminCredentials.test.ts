import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// firebase-admin.ts hands out Firestore and the Realtime Database as before where the server has credentials, and
// fails at once where it has been found to have none (adminCredentials.ts). The Admin SDK is faked: nothing reaches a
// real server or account, and no credentials are used.

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn<() => Promise<unknown>>(),
  applicationDefault: vi.fn(),
  initializeApp: vi.fn(),
  cert: vi.fn(),
  db: { kind: 'fake firestore' },
  rtdb: { kind: 'fake rtdb' },
  auth: { kind: 'fake auth' },
}));

vi.mock('firebase-admin/app', () => ({
  applicationDefault: mocks.applicationDefault,
  cert: mocks.cert,
  getApps: () => [],
  initializeApp: mocks.initializeApp,
}));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: {}, getFirestore: () => mocks.db }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => mocks.auth }));
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({}) }));
vi.mock('firebase-admin/database', () => ({ getDatabase: () => mocks.rtdb }));

const NONE = 'Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.';

/** The modules afresh, in a new server: the credentials lookup is kept on `globalThis` for the life of the server. */
async function fresh() {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('meetyudai.adminCredentials')];
  vi.resetModules();
  return {
    admin: await import('@/lib/firebase-admin'),
    credentials: await import('@/lib/adminCredentials'),
  };
}

beforeEach(() => {
  for (const mock of [mocks.getAccessToken, mocks.applicationDefault, mocks.initializeApp, mocks.cert]) mock.mockReset();
  mocks.applicationDefault.mockImplementation(() => ({ getAccessToken: mocks.getAccessToken }));
  mocks.initializeApp.mockImplementation(() => ({ name: 'fake-app' }));
  mocks.cert.mockImplementation((account: unknown) => account);
  for (const name of ['FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PROJECT_ID']) vi.stubEnv(name, '');
  vi.stubEnv('NEXT_PUBLIC_PROJECT_ID', 'placeholder-project');
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('firebase-admin', () => {
  it('with a service account (production): hands out Firestore and the Realtime Database as before, and looks nothing up', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_KEY', JSON.stringify({ project_id: 'placeholder-project', client_email: 'placeholder@example.test' }));
    const { admin, credentials } = await fresh();
    expect(admin.getFirestore()).toBe(mocks.db);
    await credentials.requireAdminCredentials();
    expect(admin.getFirestore()).toBe(mocks.db);
    expect(admin.getRealtimeDatabase()).toBe(mocks.rtdb);
    expect(mocks.applicationDefault).not.toHaveBeenCalled();
    expect(mocks.cert).toHaveBeenCalledTimes(1);
  });

  it('with no credentials at all (CI): once the lookup has answered, Firestore and the Realtime Database fail at once with its words', async () => {
    mocks.getAccessToken.mockRejectedValue(new Error(NONE));
    const { admin, credentials } = await fresh();
    // The first ask starts the lookup and is handed the client, as before.
    expect(admin.getFirestore()).toBe(mocks.db);
    await expect(credentials.requireAdminCredentials()).rejects.toThrow(NONE);
    expect(() => admin.getFirestore()).toThrow(NONE);
    expect(() => admin.getRealtimeDatabase()).toThrow(NONE);
    // Checking a token needs no credentials of the server's own: the sign-in is left as it is.
    expect(admin.getAuth()).toBe(mocks.auth);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('with application-default credentials (gcloud on a developer’s machine): hands everything out as before', async () => {
    mocks.getAccessToken.mockResolvedValue({ access_token: 'placeholder', expires_in: 3600 });
    const { admin, credentials } = await fresh();
    expect(admin.getFirestore()).toBe(mocks.db);
    await credentials.requireAdminCredentials();
    expect(admin.getFirestore()).toBe(mocks.db);
    expect(admin.getRealtimeDatabase()).toBe(mocks.rtdb);
  });
});
