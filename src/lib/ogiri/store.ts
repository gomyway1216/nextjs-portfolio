import 'server-only';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '@/lib/firebase-admin';
import {
  act,
  createRoom,
  GameError,
  joinRoom,
  newPlayer,
  settingsInput,
  project,
  rankPlayers,
  ROOM_TTL,
  tick,
  turnKey,
} from './engine';
import { drawingAsset } from './drawing-game';
import { DEFAULT_SETTINGS, type Action, type GameHistory, type Room } from './types';
import { prompts } from './prompts';
import { snapshotHistory, validHistoryId } from './history';
import { settlePartyPoints } from './party';
import { hashPassphrase, verifyPassphrase, type PassphraseHash } from './passphrase';
import { normalizePlayerText } from './text';

const dummyPassphraseHash: PassphraseHash = { salt: '0'.repeat(32), hash: '0'.repeat(64) };

export const COLLECTION = 'ogiri_party_rooms';
export const HISTORY_COLLECTION = 'ogiri_party_history';
function collection(name = COLLECTION) {
  // A real Firestore emulator shared by all browser contexts; never selectable on Vercel.
  if (
    !process.env.VERCEL &&
    process.env.OGIRI_EMULATOR === '1' &&
    process.env.FIRESTORE_EMULATOR_HOST
  ) {
    const app =
      getApps().find((a) => a.name === 'ogiri-emulator') ??
      initializeApp({ projectId: 'demo-ogiri' }, 'ogiri-emulator');
    return adminFirestore(app).collection(name);
  }
  return getFirestore().collection(name);
}
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');
export function identity(id = randomBytes(12).toString('hex')) {
  const secret = randomBytes(32).toString('hex');
  return { id, hash: hash(secret), token: `${id}.${secret}` };
}
export function authenticate(room: Room, token?: string): string | null {
  if (!token || !/^[a-f0-9]{24}\.[a-f0-9]{64}$/.test(token)) return null;
  const [id, secret] = token.split('.');
  const player = room.players[id];
  return player &&
    !player.kicked &&
    timingSafeEqual(Buffer.from(player.secretHash, 'hex'), Buffer.from(hash(secret), 'hex'))
    ? id
    : null;
}
function saved(room: Room) {
  return { ...room, deleteAfter: Timestamp.fromMillis(room.expiresAt) };
}
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const recoveryHash = (room: Room, code: string) => hash(`ogiri-recovery:${room.code}:${code}`);
function issueRecoveryCode(room: Room, id: string) {
  let code: string;
  do {
    code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
  } while (Object.values(room.players).some(player => player.recoveryHash === recoveryHash(room, code)));
  room.players[id].recoveryHash = recoveryHash(room, code);
  return code;
}
export async function makeRoom(name: unknown, avatar: unknown, hostPlays: unknown = true, gameType: unknown = 'ogiri') {
  if (typeof hostPlays !== 'boolean') throw new GameError('主催者の参加方法を選んでください。');
  const settings = settingsInput({ ...DEFAULT_SETTINGS, gameType });
  const session = identity();
  const host = newPlayer(session.id, session.hash, name, avatar, Date.now());
  host.spectator = !hostPlays;
  for (let tries = 0; tries < 8; tries++) {
    const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
    const room = createRoom(code, host, Date.now());
    const recoveryCode = issueRecoveryCode(room, host.id);
    room.settings = settings;
    room.historyId = randomBytes(16).toString('hex');
    try {
      await collection().doc(code).create(saved(room));
      return { view: { ...project(room, host.id, Date.now(), prompts), recoveryCode }, token: session.token };
    } catch (error) {
      if ((error as { code?: number }).code !== 6) throw error;
    }
  }
  throw new GameError('ルームを作成できませんでした。もう一度お試しください。', 503);
}
/** Optimistic transaction on the whole room. A conditional update commits only the exact
 * version we read. Contenders re-read and revalidate permissions/deadlines. Unlike server
 * read-lock transactions, simultaneous phones don't hold locks while polling or heartbeating. */
async function mutate(
  code: string,
  apply: (room: Room, now: number) => void,
  onlyIfDue = false,
): Promise<Room> {
  const ref = collection().doc(code);
  for (let attempt = 0; attempt < 40; attempt++) {
    const snapshot = await ref.get(),
      room = snapshot.data() as Room | undefined,
      now = Date.now();
    if (!room || room.expiresAt <= now)
      throw new GameError('ルームが見つからないか、有効期限が切れています。', 404);
    const oldRevision = room.revision;
    const oldGame = room.game;
    const archives: GameHistory[] = [];
    const archiveFinished = () => {
      if (room.phase !== 'finished' || room.round === 0 || room.archivedGame === room.game) return;
      settlePartyPoints(room, rankPlayers(room));
      room.historyId ??= randomBytes(16).toString('hex');
      const archive = snapshotHistory(room, room.historyId, now, prompts);
      archives.push(archive);
      room.archivedGame = room.game;
      const { id, code, game, finishedAt, expiresAt, gameType } = archive;
      room.history = [...(room.history ?? []), { id, code, game, finishedAt, expiresAt, gameType }].slice(
        -50,
      );
    };
    // Also preserve a finished room from before this deployment when its host starts a rematch.
    archiveFinished();
    apply(room, now);
    if (room.game !== oldGame) room.historyId = randomBytes(16).toString('hex');
    archiveFinished();
    if (onlyIfDue && room.revision === oldRevision && !archives.length) return room;
    try {
      if (archives.length) {
        const batch = ref.firestore.batch();
        batch.update(ref, saved(room), { lastUpdateTime: snapshot.updateTime! });
        for (const archive of archives)
          batch.create(collection(HISTORY_COLLECTION).doc(archive.id), {
            payload: JSON.stringify(archive),
            expiresAt: archive.expiresAt,
            deleteAfter: Timestamp.fromMillis(archive.expiresAt),
          });
        await batch.commit();
      } else await ref.update(saved(room), { lastUpdateTime: snapshot.updateTime! });
      return room;
    } catch (error) {
      if (!(archives.length ? [6, 9, 10] : [9, 10]).includes((error as { code: number }).code))
        throw error;
      await new Promise((resolve) => setTimeout(resolve, randomInt(15, 80)));
    }
  }
  throw new GameError('同時に多くの操作がありました。もう一度お試しください。', 409);
}
export async function enterRoom(
  code: string,
  token: string | undefined,
  name: unknown,
  avatar: unknown,
) {
  const session = identity();
  let existing: string | null = null;
  let recoveryCode: string | undefined;
  const room = await mutate(code, (room, now) => {
    recoveryCode = undefined;
    existing = authenticate(room, token);
    if (existing) {
      act(room, existing, { type: 'return' }, now, prompts);
      if (!room.players[existing].recoveryHash) recoveryCode = issueRecoveryCode(room, existing);
      return;
    }
    joinRoom(room, newPlayer(session.id, session.hash, name, avatar, now));
    recoveryCode = issueRecoveryCode(room, session.id);
  });
  return {
    view: { ...project(room, existing ?? session.id, Date.now(), prompts), ...(recoveryCode ? { recoveryCode } : {}) },
    token: existing ? token! : session.token,
  };
}
/** Explicit authenticated issuance also lazily upgrades rooms created before recovery support. */
export async function regenerateRecoveryCode(code: string, token: string | undefined) {
  let recoveryCode = '';
  const room = await mutate(code, (room) => {
    const id = authenticate(room, token);
    if (!id) throw new GameError('参加し直してください。', 401);
    recoveryCode = issueRecoveryCode(room, id);
    room.revision++;
  });
  return { ...project(room, authenticate(room, token), Date.now(), prompts), recoveryCode };
}

function countRecoveryAttempt(room: Room, now: number) {
  const attempts = room.recoveryAttempts;
  if (attempts && attempts.resetAt > now && attempts.count >= 30)
    throw new GameError('復帰の試行が多すぎます。5分ほど待ってください。', 429);
  room.recoveryAttempts = !attempts || attempts.resetAt <= now
    ? { count: 1, resetAt: now + 5 * 60000 }
    : { ...attempts, count: attempts.count + 1 };
}

export async function setRecoveryPassphrase(code: string, token: string | undefined, value: unknown) {
  // Reject unauthenticated callers before doing expensive password hashing.
  if (!(await readRoom(code, token)).me) throw new GameError('参加し直してください。', 401);
  const verifier = await hashPassphrase(value);
  const room = await mutate(code, room => {
    const id = authenticate(room, token);
    if (!id) throw new GameError('参加し直してください。', 401);
    room.players[id].passphraseHash = verifier;
    room.revision++;
  });
  return project(room, authenticate(room, token), Date.now(), prompts);
}

export async function recoverWithPassphrase(code: string, name: unknown, value: unknown) {
  const normalizedName = typeof name === 'string' ? normalizePlayerText(name).toLocaleLowerCase('ja') : '';
  let candidate: { id: string; verifier: PassphraseHash } | null = null;
  // Persist the shared room throttle BEFORE scrypt; retries cannot bypass it.
  await mutate(code, (room, now) => {
    candidate = null;
    countRecoveryAttempt(room, now);
    const player = Object.values(room.players).find(player =>
      !player.kicked && player.name.toLocaleLowerCase('ja') === normalizedName);
    if (player?.passphraseHash) candidate = { id: player.id, verifier: player.passphraseHash };
    room.revision++;
  });
  const checked = candidate as { id: string; verifier: PassphraseHash } | null;
  const verified = await verifyPassphrase(value, checked?.verifier ?? dummyPassphraseHash);
  if (!checked || !verified)
    throw new GameError('ニックネームと合言葉を確認してください。', 401);
  let session: ReturnType<typeof identity> | null = null;
  const room = await mutate(code, (room, now) => {
    session = null;
    const player = room.players[checked.id];
    // A concurrent change/kick must revoke an in-flight login too.
    if (!player || player.kicked || player.passphraseHash?.salt !== checked.verifier.salt ||
      player.passphraseHash?.hash !== checked.verifier.hash)
      throw new GameError('ニックネームと合言葉を確認してください。', 401);
    session = identity(player.id);
    player.secretHash = session.hash;
    player.lastSeen = now;
    room.expiresAt = now + ROOM_TTL;
    room.revision++;
  });
  if (!session) throw new GameError('ニックネームと合言葉を確認してください。', 401);
  const recovered = session as ReturnType<typeof identity>;
  return { view: project(room, recovered.id, Date.now(), prompts), token: recovered.token };
}

/** Count failures in the existing room document so cold starts cannot bypass the throttle.
 * A recovered device replaces the old session, while keeping the participant and role. */
export async function recoverRoom(code: string, input: unknown) {
  const normalized = typeof input === 'string' ? input.toUpperCase().replace(/[\s-]/g, '') : '';
  let session: ReturnType<typeof identity> | null = null;
  const room = await mutate(code, (room, now) => {
    // mutate may retry after a concurrent update; never retain a rejected attempt's session.
    session = null;
    countRecoveryAttempt(room, now);
    const candidate = /^[A-HJ-NP-Z2-9]{8}$/.test(normalized) ? recoveryHash(room, normalized) : '';
    const player = Object.values(room.players).find(player => !player.kicked && player.recoveryHash === candidate);
    if (player) {
      session = identity(player.id);
      player.secretHash = session.hash;
      // Recovery itself preserves an explicit rest; returning to play is a separate action.
      player.lastSeen = now;
      room.expiresAt = now + ROOM_TTL;
    }
    room.revision++;
  });
  if (!session) throw new GameError('復帰コードを確認してください。', 401);
  const recovered = session as ReturnType<typeof identity>;
  return {
    view: { ...project(room, recovered.id, Date.now(), prompts), recoveryCode: normalized },
    token: recovered.token,
  };
}
export async function readRoom(code: string, token?: string, tv = false) {
  const ref = collection().doc(code);
  let room = (await ref.get()).data() as Room | undefined;
  if (!room || room.expiresAt <= Date.now())
    throw new GameError('ルームが見つからないか、有効期限が切れています。', 404);
  if (
    tick(structuredClone(room), Date.now(), prompts) ||
    (room.phase === 'finished' && room.round > 0 && room.archivedGame !== room.game)
  ) {
    room = await mutate(
      code,
      (current, now) => {
        tick(current, now, prompts);
      },
      true,
    );
  }
  return project(room, tv ? null : authenticate(room, token), Date.now(), prompts);
}
export async function command(
  code: string,
  token: string | undefined,
  action: Action,
  turn?: string,
) {
  const room = await mutate(code, (room, now) => {
    const id = authenticate(room, token);
    if (!id) throw new GameError('参加し直してください。', 401);
    tick(room, now, prompts);
    if (
      ['next', 'extend', 'start', 'rematch', 'answerReady', 'partyAnswer', 'partyVote', 'drawingSubmit', 'drawingGuess', 'drawingVote'].includes(action.type) &&
      turn !== turnKey(room)
    )
      throw new GameError('画面が更新されました。もう一度操作してください。', 409);
    act(room, id, action, now, prompts);
  });
  return project(room, authenticate(room, token), Date.now(), prompts);
}

export async function readDrawing(code: string, id: string, token?: string) {
  const room = (await collection().doc(code).get()).data() as Room | undefined;
  if (!room || room.expiresAt <= Date.now()) throw new GameError('ルームの有効期限が切れています。', 404);
  return drawingAsset(room, id, authenticate(room, token));
}

export async function readHistory(id: string): Promise<GameHistory> {
  if (!validHistoryId(id)) throw new GameError('履歴のリンクを確認してください。', 400);
  const data = (await collection(HISTORY_COLLECTION).doc(id).get()).data();
  if (!data || data.expiresAt <= Date.now())
    throw new GameError('履歴が見つからないか、90日間の保存期間が終了しています。', 404);
  return JSON.parse(data.payload) as GameHistory;
}
