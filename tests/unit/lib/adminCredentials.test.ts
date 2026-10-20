import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Whether the server has Google credentials, as adminCredentials.ts decides it: at once where it was given a service
// account (production), and otherwise by Google's application-default lookup, once. The lookup is faked; nothing
// reaches a real server or account, and no credentials are used.

const mocks = vi.hoisted(() => ({ getAccessToken: vi.fn<() => Promise<unknown>>(), applicationDefault: vi.fn() }));

vi.mock('firebase-admin/app', () => ({
  applicationDefault: mocks.applicationDefault,
}));

/** What google-auth-library says where there are no application-default credentials anywhere. */
const NONE = 'Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.';

/** The module afresh: its lookup is kept for the life of the server, so each test starts a new one. */
async function fresh() {
  vi.resetModules();
  return import('@/lib/adminCredentials');
}

beforeEach(() => {
  mocks.getAccessToken.mockReset();
  mocks.applicationDefault.mockReset();
  mocks.applicationDefault.mockImplementation(() => ({ getAccessToken: mocks.getAccessToken }));
  for (const name of ['FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_PROJECT_ID']) vi.stubEnv(name, '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a server given a service account, as production is', () => {
  it('has credentials with its key, and looks nothing up', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_KEY', 'placeholder-not-a-key');
    const { requireAdminCredentials } = await fresh();
    await expect(requireAdminCredentials()).resolves.toBeUndefined();
    await expect(requireAdminCredentials()).resolves.toBeUndefined();
    expect(mocks.applicationDefault).not.toHaveBeenCalled();
  });

  it('has credentials with a private key, its account and a project, and looks nothing up', async () => {
    vi.stubEnv('FIREBASE_PRIVATE_KEY', 'placeholder-not-a-key');
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'placeholder@example.test');
    vi.stubEnv('NEXT_PUBLIC_PROJECT_ID', 'placeholder-project');
    const { requireAdminCredentials, hasServiceAccount } = await fresh();
    await expect(requireAdminCredentials()).resolves.toBeUndefined();
    expect(mocks.applicationDefault).not.toHaveBeenCalled();
    // The same three firebase-admin.ts needs to use them; without a project it falls back on the default lookup.
    expect(hasServiceAccount({ FIREBASE_PRIVATE_KEY: 'k', FIREBASE_CLIENT_EMAIL: 'e', FIREBASE_PROJECT_ID: 'p' })).toBe(true);
    expect(hasServiceAccount({ FIREBASE_PRIVATE_KEY: 'k', FIREBASE_CLIENT_EMAIL: 'e' })).toBe(false);
    expect(hasServiceAccount({ FIREBASE_PRIVATE_KEY: 'k', NEXT_PUBLIC_PROJECT_ID: 'p' })).toBe(false);
    expect(hasServiceAccount({})).toBe(false);
  });
});

describe('a server with no service account', () => {
  it('with no credentials anywhere (CI): fails at once with the lookup’s own words, every time, after looking once', async () => {
    mocks.getAccessToken.mockRejectedValue(new Error(NONE));
    const { requireAdminCredentials } = await fresh();
    await expect(requireAdminCredentials()).rejects.toThrow(NONE);
    await expect(requireAdminCredentials()).rejects.toThrow(NONE);
    await expect(requireAdminCredentials()).rejects.toThrow(NONE);
    expect(mocks.applicationDefault).toHaveBeenCalledTimes(1);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('with no credentials: reads asked for at once wait on one lookup, not one each', async () => {
    let answer: (reason: Error) => void = () => undefined;
    mocks.getAccessToken.mockReturnValue(new Promise((_, reject) => (answer = reject)));
    const { requireAdminCredentials } = await fresh();
    const asked = [requireAdminCredentials(), requireAdminCredentials(), requireAdminCredentials()];
    answer(new Error(NONE));
    for (const read of asked) await expect(read).rejects.toThrow(NONE);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('with application-default credentials (gcloud on a developer’s machine): reads go ahead, after looking once', async () => {
    mocks.getAccessToken.mockResolvedValue({ access_token: 'placeholder', expires_in: 3600 });
    const { requireAdminCredentials } = await fresh();
    await expect(requireAdminCredentials()).resolves.toBeUndefined();
    await expect(requireAdminCredentials()).resolves.toBeUndefined();
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('with credentials that could not be used just now (the network): reads go ahead, and fail or not as before', async () => {
    mocks.getAccessToken.mockRejectedValue(new Error('request to https://oauth2.googleapis.com/token failed, reason: getaddrinfo ENOTFOUND'));
    const { requireAdminCredentials } = await fresh();
    await expect(requireAdminCredentials()).resolves.toBeUndefined();
    await expect(requireAdminCredentials()).resolves.toBeUndefined();
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });
});
