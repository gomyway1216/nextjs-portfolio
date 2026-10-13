import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The account's store on the real save service, with a made-up Firebase under it and a made-up server behind
// `fetch`. Nobody is signed in and nothing is fetched. What is tried here is the player changing at every point
// at which a call can be interrupted: whatever happens, no request may leave as anybody but the player the call
// named.

interface FakeUser {
  uid: string;
  getIdToken: () => Promise<string>;
}
const firebase = vi.hoisted(() => {
  /** Who is signed in, how often that has been looked at, and a change of player set to follow one of those looks. */
  const now = { user: null as null | FakeUser, looks: 0, changeAfter: 0, changeTo: null as null | FakeUser };
  const auth = {
    get currentUser(): null | FakeUser {
      const seen = now.user;
      now.looks += 1;
      if (now.looks === now.changeAfter) now.user = now.changeTo;
      return seen;
    },
    set currentUser(next: null | FakeUser) {
      now.user = next;
    },
  };
  return { auth, now };
});
vi.mock('@/lib/firebaseConnect', () => ({ auth: firebase.auth }));

import { accountStoreFor } from '@/components/game/MedalPusher/accountStore';
import type { AccountStore } from '@/components/game/MedalPusher/account';

/** Lets the microtask queue go round. Everything in these fakes is answered there, so this is all the time there is. */
const turn = async (times: number): Promise<void> => {
  for (let i = 0; i < times; i++) await Promise.resolve();
};

/** How many turns a token takes to come, and an answer from the server. */
const pace = { token: 0, answer: 0 };

const TOKEN_OF = 'made-up-token-of-';
/** A user as Firebase gives one: the token is theirs, and still comes when they have signed out meanwhile. */
const user = (uid: string): FakeUser => ({
  uid,
  getIdToken: async () => {
    await turn(pace.token);
    return TOKEN_OF + uid;
  },
});
const ANN = user('ann');
const BOB = user('bob');

/** A request as the server saw it: whose token it carried, and who was signed in at the instant it left. */
interface Sent {
  method: string;
  as: string;
  signedIn: string | null;
}
let sent: Sent[] = [];
let docs = new Map<string, unknown>();

/** The route, near enough: it knows a player by their token alone, and reads or writes that player's document. */
const server = async (_url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
  const as = init.headers.Authorization.replace(`Bearer ${TOKEN_OF}`, '');
  // Noted before anything is awaited: this is the instant `fetch` was called.
  sent.push({ method: init.method ?? 'GET', as, signedIn: firebase.now.user?.uid ?? null });
  await turn(pace.answer);
  if (init.method === 'PUT') docs.set(as, (JSON.parse(init.body ?? '{}') as { state: unknown }).state);
  const state = docs.get(as);
  const body = init.method === 'PUT' ? { success: true } : { save: state === undefined ? null : { state, updatedAt: null } };
  return { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
};

beforeEach(() => {
  sent = [];
  docs = new Map<string, unknown>([
    ['ann', { owner: 'ann' }],
    ['bob', { owner: 'bob' }],
  ]);
  pace.token = 0;
  pace.answer = 0;
  firebase.auth.currentUser = ANN;
  firebase.now.looks = 0;
  firebase.now.changeAfter = 0;
  vi.stubGlobal('fetch', vi.fn(server));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SWITCHES = ['to another player', 'to nobody', 'to another player and back', 'to nobody and back'] as const;
type Switch = (typeof SWITCHES)[number];
const PACES = [
  { token: 0, answer: 0 },
  { token: 3, answer: 0 },
  { token: 0, answer: 3 },
  { token: 2, answer: 2 },
];
/** More turns than any call here takes from beginning to end, so that every point in it is tried. */
const TURNS = 40;

type Outcome = { ok: true; value: unknown } | { ok: false } | null;

/** Begins a call as Ann, changes who is signed in `after` turns later, and lets everything finish. */
async function interrupted(call: (store: AccountStore) => Promise<unknown>, after: number, how: Switch) {
  firebase.auth.currentUser = ANN;
  const store = accountStoreFor('medal-pusher');
  let outcome: Outcome = null;
  const running = call(store).then(
    (value) => void (outcome = { ok: true, value }),
    () => void (outcome = { ok: false }),
  );
  await turn(after);
  const finishedFirst = outcome !== null;
  firebase.auth.currentUser = how.startsWith('to nobody') ? null : BOB;
  if (how.endsWith('and back')) {
    await turn(1);
    firebase.auth.currentUser = ANN;
  }
  await running;
  await turn(TURNS);
  return { store, outcome: outcome as Outcome, finishedFirst };
}

/** Every request that left was Ann's own: it carried her token, and she was the one signed in as it left. */
const onlyAsAnn = (): void => {
  for (const request of sent) expect(request).toMatchObject({ as: 'ann', signedIn: 'ann' });
};

describe.each(PACES)('the player changing while a call is made (a token takes $token turns, an answer $answer)', ({ token, answer }) => {
  beforeEach(() => {
    pace.token = token;
    pace.answer = answer;
  });

  it.each(SWITCHES)('never reads another player’s save for the one it was asked about: %s', async (how) => {
    let finished = 0;
    for (let after = 0; after <= TURNS; after++) {
      sent = [];
      const { outcome, finishedFirst } = await interrupted((store) => store.load('ann'), after, how);
      onlyAsAnn();
      expect(sent.length).toBeLessThanOrEqual(1);
      // It gives Ann's save or it fails. It never gives Bob's, and never says that Ann has none.
      if (outcome?.ok) expect(outcome.value).toMatchObject({ state: { owner: 'ann' } });
      else expect(outcome).toEqual({ ok: false });
      if (finishedFirst) finished += 1;
    }
    // The last of these changed the player after the call was over: every point before that was tried.
    expect(finished).toBeGreaterThan(0);
    expect(finished).toBeLessThan(TURNS);
  });

  it.each(SWITCHES)('never writes one player’s machine to another’s account: %s', async (how) => {
    let finished = 0;
    for (let after = 0; after <= TURNS; after++) {
      sent = [];
      docs.set('ann', { owner: 'ann' });
      const { outcome, finishedFirst } = await interrupted((store) => store.store('ann', { owner: 'ann', machine: after }), after, how);
      onlyAsAnn();
      expect(sent.length).toBeLessThanOrEqual(1);
      expect(docs.get('bob')).toEqual({ owner: 'bob' });
      // Written to Ann's account, or not written at all and said so.
      if (outcome?.ok) expect(docs.get('ann')).toEqual({ owner: 'ann', machine: after });
      else expect(sent).toEqual([]);
      if (finishedFirst) finished += 1;
    }
    expect(finished).toBeGreaterThan(0);
    expect(finished).toBeLessThan(TURNS);
  });

  it.each(SWITCHES)('never sends the leaving write with a token that is not the player’s own: %s', async (how) => {
    for (let after = 0; after <= TURNS; after++) {
      sent = [];
      docs.set('ann', { owner: 'ann' });
      const { store } = await interrupted((store) => store.prepare('ann'), after, how);
      expect(sent).toEqual([]);
      // The page is left now, whoever is signed in by now. Ann's machine goes as Ann while she is signed in, or
      // not at all; and Bob's is not sent with a token that was got ready for her.
      expect(store.storeNow('bob', { owner: 'bob', machine: 'bobs' })).toBeNull();
      const going = store.storeNow('ann', { owner: 'ann', machine: after });
      if (firebase.now.user?.uid !== 'ann') expect(going).toBeNull();
      await going;
      await turn(TURNS);
      onlyAsAnn();
      expect(docs.get('bob')).toEqual({ owner: 'bob' });
      if (going === null) expect(docs.get('ann')).toEqual({ owner: 'ann' });
      else expect(docs.get('ann')).toEqual({ owner: 'ann', machine: after });
    }
  });
});

describe('a call for the player who is about to sign in, begun while another still is', () => {
  it.each(PACES)('is refused, or made as the player it names: never with the other’s token (a token takes $token turns, an answer $answer)', async ({ token, answer }) => {
    pace.token = token;
    pace.answer = answer;
    for (const kind of ['load', 'store'] as const) {
      for (let after = 0; after <= TURNS; after++) {
        sent = [];
        docs.set('ann', { owner: 'ann' });
        docs.set('bob', { owner: 'bob' });
        // Ann is signed in when the call for Bob begins, and Bob is by the time it is over.
        const { outcome } = await interrupted((store) => (kind === 'load' ? store.load('bob') : store.store('bob', { owner: 'bob', machine: after })), after, 'to another player');
        for (const request of sent) expect(request).toMatchObject({ as: 'bob', signedIn: 'bob' });
        expect(docs.get('ann')).toEqual({ owner: 'ann' });
        if (kind === 'load' && outcome?.ok) expect(outcome.value).toMatchObject({ state: { owner: 'bob' } });
        if (!outcome?.ok) expect(sent).toEqual([]);
      }
    }
  });
});

describe('the player changing between two looks at who is signed in', () => {
  // The other way of putting it: however often the code asks who is signed in, the answer changes after the
  // first, the second, the third … time it asks. A request that then leaves with the other player's token is one
  // that looked again after it had made sure.
  const LOOKS = 8;

  it.each([
    ['another player', BOB],
    ['nobody', null],
  ])('never sends a call for one player with a token of anybody else: the next look finds %s', async (_name, next) => {
    for (const kind of ['load', 'store', 'prepare'] as const) {
      let most = 0;
      for (let changeAfter = 1; changeAfter <= LOOKS; changeAfter++) {
        sent = [];
        docs.set('ann', { owner: 'ann' });
        firebase.auth.currentUser = ANN;
        firebase.now.looks = 0;
        firebase.now.changeAfter = changeAfter;
        firebase.now.changeTo = next;
        const store = accountStoreFor('medal-pusher');
        const outcome = await (kind === 'load' ? store.load('ann') : kind === 'store' ? store.store('ann', { owner: 'ann', machine: 1 }) : store.prepare('ann')).then(
          (value) => ({ ok: true, value }),
          () => ({ ok: false, value: undefined }),
        );
        const looked = firebase.now.looks;
        if (kind === 'prepare') await store.storeNow('ann', { owner: 'ann', machine: 1 });
        await turn(TURNS);
        most = Math.max(most, looked);
        for (const request of sent) expect(request.as).toBe('ann');
        expect(docs.get('bob')).toEqual({ owner: 'bob' });
        if (kind === 'load' && outcome.ok) expect(outcome.value).toMatchObject({ state: { owner: 'ann' } });
      }
      // The code looked fewer times than the changes that were tried: every gap between two looks was covered.
      expect(most).toBeLessThan(LOOKS);
    }
  });
});

describe('the account’s store on the real service', () => {
  it('serves the next player as themselves once they are the one signed in', async () => {
    const store = accountStoreFor('medal-pusher');
    await store.store('ann', { owner: 'ann', machine: 1 });
    firebase.auth.currentUser = BOB;
    await expect(store.load('ann')).rejects.toThrow();
    await expect(store.load('bob')).resolves.toMatchObject({ state: { owner: 'bob' } });
    await store.store('bob', { owner: 'bob', machine: 2 });
    expect(docs.get('ann')).toEqual({ owner: 'ann', machine: 1 });
    expect(docs.get('bob')).toEqual({ owner: 'bob', machine: 2 });
    expect(sent.map((request) => request.as)).toEqual(['ann', 'bob', 'bob']);
    for (const request of sent) expect(request.signedIn).toBe(request.as);
  });
});
