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
  project,
  rankPlayers,
  tick,
} from './engine';
import type { Action, GameHistory, Room } from './types';
import { prompts } from './prompts';
import { snapshotHistory, validHistoryId } from './history';
import { settlePartyPoints } from './party';

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
export function identity() {
  const id = randomBytes(12).toString('hex'),
    secret = randomBytes(32).toString('hex');
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
export async function makeRoom(name: unknown, avatar: unknown, hostPlays: unknown = true) {
  if (typeof hostPlays !== 'boolean') throw new GameError('主催者の参加方法を選んでください。');
  const session = identity();
  const host = newPlayer(session.id, session.hash, name, avatar, Date.now());
  host.spectator = !hostPlays;
  for (let tries = 0; tries < 8; tries++) {
    const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
    const room = createRoom(code, host, Date.now());
    room.historyId = randomBytes(16).toString('hex');
    try {
      await collection().doc(code).create(saved(room));
      return { view: project(room, host.id, Date.now(), prompts), token: session.token };
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
      const { id, code, game, finishedAt, expiresAt } = archive;
      room.history = [...(room.history ?? []), { id, code, game, finishedAt, expiresAt }].slice(
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
  const freshPlayer = newPlayer(session.id, session.hash, name, avatar, Date.now());
  let existing: string | null = null;
  const room = await mutate(code, (room, now) => {
    existing = authenticate(room, token);
    if (existing) {
      room.players[existing].active = true;
      room.players[existing].lastSeen = now;
      return;
    }
    joinRoom(room, { ...freshPlayer });
  });
  return {
    view: project(room, existing ?? session.id, Date.now(), prompts),
    token: existing ? token! : session.token,
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
      ['next', 'start', 'rematch'].includes(action.type) &&
      turn !== `${room.game}:${room.round}:${room.phase}:${room.matchIndex}`
    )
      throw new GameError('画面が更新されました。もう一度操作してください。', 409);
    act(room, id, action, now, prompts);
  });
  return project(room, authenticate(room, token), Date.now(), prompts);
}

export async function readHistory(id: string): Promise<GameHistory> {
  if (!validHistoryId(id)) throw new GameError('履歴のリンクを確認してください。', 400);
  const data = (await collection(HISTORY_COLLECTION).doc(id).get()).data();
  if (!data || data.expiresAt <= Date.now())
    throw new GameError('履歴が見つからないか、90日間の保存期間が終了しています。', 404);
  return JSON.parse(data.payload) as GameHistory;
}
