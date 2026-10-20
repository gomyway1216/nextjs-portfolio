import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Admin SDK is replaced by fakes: no app, credential or network is real.
const mocks = vi.hoisted(() => ({
  getApps: vi.fn(),
  initializeApp: vi.fn(),
  initializeFirestore: vi.fn(),
  getFirestore: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(),
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp,
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: vi.fn() },
  getFirestore: mocks.getFirestore,
  initializeFirestore: mocks.initializeFirestore,
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn(() => ({ kind: 'auth' })) }));
vi.mock('firebase-admin/storage', () => ({ getStorage: vi.fn(() => ({ kind: 'storage' })) }));
vi.mock('firebase-admin/database', () => ({ getDatabase: vi.fn(() => ({ kind: 'database' })) }));

const fakeApp = { name: '[DEFAULT]' };
const restDb = { kind: 'firestore', transport: 'rest' };

describe('Admin Firestore settings', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_KEY', '');
    vi.stubEnv('FIREBASE_PRIVATE_KEY', '');
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', '');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'demo-project');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.getApps.mockReturnValue([]);
    mocks.initializeApp.mockReturnValue(fakeApp);
    mocks.initializeFirestore.mockReturnValue(restDb);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('prefers REST unless FIRESTORE_PREFER_REST is set', async () => {
    const { adminFirestoreSettings } = await import('@/lib/firebase-admin');

    expect(adminFirestoreSettings({})).toEqual({ preferRest: true });
    // Set either way, the SDK reads the variable itself.
    expect(adminFirestoreSettings({ FIRESTORE_PREFER_REST: 'false' })).toEqual({});
    expect(adminFirestoreSettings({ FIRESTORE_PREFER_REST: 'true' })).toEqual({});
  });

  it('creates the Firestore instance once, with preferRest', async () => {
    vi.stubEnv('FIRESTORE_PREFER_REST', undefined);
    const { getFirestore } = await import('@/lib/firebase-admin');

    expect(getFirestore()).toBe(restDb);
    expect(getFirestore()).toBe(restDb);

    expect(mocks.initializeFirestore).toHaveBeenCalledTimes(1);
    expect(mocks.initializeFirestore).toHaveBeenCalledWith(fakeApp, { preferRest: true });
    expect(mocks.getFirestore).not.toHaveBeenCalled();
  });

  it('uses the same settings when the app already exists', async () => {
    vi.stubEnv('FIRESTORE_PREFER_REST', undefined);
    mocks.getApps.mockReturnValue([fakeApp]);
    const { getFirestore } = await import('@/lib/firebase-admin');

    expect(getFirestore()).toBe(restDb);
    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.initializeFirestore).toHaveBeenCalledWith(fakeApp, { preferRest: true });
  });

  it('leaves the transport to FIRESTORE_PREFER_REST when it is set', async () => {
    vi.stubEnv('FIRESTORE_PREFER_REST', 'false');
    const { getFirestore } = await import('@/lib/firebase-admin');

    getFirestore();

    expect(mocks.initializeFirestore).toHaveBeenCalledWith(fakeApp, {});
  });

  it('reuses an instance that was already set up with other settings', async () => {
    vi.stubEnv('FIRESTORE_PREFER_REST', undefined);
    const existing = { kind: 'firestore', transport: 'grpc' };
    mocks.getApps.mockReturnValue([fakeApp]);
    mocks.initializeFirestore.mockImplementation(() => {
      throw new Error('initializeFirestore() has already been called with different options.');
    });
    mocks.getFirestore.mockReturnValue(existing);
    const { getFirestore } = await import('@/lib/firebase-admin');

    expect(getFirestore()).toBe(existing);
    expect(mocks.getFirestore).toHaveBeenCalledWith(fakeApp);
  });
});
