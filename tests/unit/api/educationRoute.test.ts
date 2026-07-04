import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAdmin: vi.fn(),
  getFirestore: vi.fn(),
}));

vi.mock('@/app/api/_lib/withActivityLog', () => ({
  withActivityLog: (_action: string, handler: unknown) => handler,
}));

vi.mock('@/lib/auth-utils', () => ({
  ensureAdmin: mocks.ensureAdmin,
}));

vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: mocks.getFirestore,
}));

const makeRequest = (url: string, init?: RequestInit) => new Request(url, init) as never;
type RouteHandler = (request: never, context: never) => Promise<Response | undefined> | Response | undefined;

async function callRoute(handler: RouteHandler, request: never): Promise<Response> {
  const response = await handler(request, undefined as never);
  if (!response) {
    throw new Error('Route handler returned no response');
  }
  return response;
}

describe('/api/education route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.ensureAdmin.mockReset();
    mocks.getFirestore.mockReset();
  });

  it('rejects education creation without admin authentication', async () => {
    const { POST } = await import('@/app/api/education/route');
    const authResponse = Response.json({ error: 'No authorization token provided' }, { status: 401 });
    mocks.ensureAdmin.mockResolvedValue({ user: null, response: authResponse });

    const response = await callRoute(POST, makeRequest('https://example.com/api/education', {
      method: 'POST',
      body: JSON.stringify({ degreeTitle: 'B.S.', instituteName: 'SJSU' }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.getFirestore).not.toHaveBeenCalled();
  });

  it('creates an education entry with normalized editable fields', async () => {
    const { POST } = await import('@/app/api/education/route');
    const add = vi.fn().mockResolvedValue({ id: 'education-1' });
    mocks.ensureAdmin.mockResolvedValue({ user: { uid: 'admin', isAdmin: true } });
    mocks.getFirestore.mockReturnValue({
      collection: vi.fn(() => ({ add })),
    });

    const response = await callRoute(POST, makeRequest('https://example.com/api/education', {
      method: 'POST',
      body: JSON.stringify({
        passingYear: '2019 - 2021',
        degreeTitle: ' B.S. in Computer Science ',
        instituteName: ' San Jose State University ',
        order: 2,
      }),
    }));

    await expect(response.json()).resolves.toMatchObject({ id: 'education-1' });
    expect(response.status).toBe(201);
    expect(add).toHaveBeenCalledWith({
      passingYear: '2019 - 2021',
      degreeTitle: 'B.S. in Computer Science',
      instituteName: 'San Jose State University',
      order: 2,
    });
  });

  it('updates an existing education entry by id', async () => {
    const { PUT } = await import('@/app/api/education/route');
    const update = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({
      get: vi.fn().mockResolvedValue({ exists: true }),
      update,
    }));
    mocks.ensureAdmin.mockResolvedValue({ user: { uid: 'admin', isAdmin: true } });
    mocks.getFirestore.mockReturnValue({
      collection: vi.fn(() => ({ doc })),
    });

    const response = await callRoute(PUT, makeRequest('https://example.com/api/education', {
      method: 'PUT',
      body: JSON.stringify({
        id: 'education-1',
        passingYear: '2021',
        degreeTitle: 'M.S. in Software Engineering',
        instituteName: 'SJSU',
        order: 0,
      }),
    }));

    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(doc).toHaveBeenCalledWith('education-1');
    expect(update).toHaveBeenCalledWith({
      passingYear: '2021',
      degreeTitle: 'M.S. in Software Engineering',
      instituteName: 'SJSU',
      order: 0,
    });
  });

  it('deletes an education entry by id', async () => {
    const { DELETE } = await import('@/app/api/education/route');
    const deleteDoc = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({
      get: vi.fn().mockResolvedValue({ exists: true }),
      delete: deleteDoc,
    }));
    mocks.ensureAdmin.mockResolvedValue({ user: { uid: 'admin', isAdmin: true } });
    mocks.getFirestore.mockReturnValue({
      collection: vi.fn(() => ({ doc })),
    });

    const response = await callRoute(DELETE, makeRequest('https://example.com/api/education?id=education-1', {
      method: 'DELETE',
    }));

    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(doc).toHaveBeenCalledWith('education-1');
    expect(deleteDoc).toHaveBeenCalled();
  });
});
