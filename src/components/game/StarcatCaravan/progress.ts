import { createSync, decide, GUEST, type AccountStore, type Player, type Slots, type Status, type Sync, type Why } from '../MedalPusher/account';
import { CHARACTERS, SAVE_KEY, type Character } from './data';
import { gameReducer, initialGame, parseSave, type Action, type GameState } from './engine';

export const PROGRESS_GAME_KEY = 'starcat-caravan';

export interface ProgressSnapshot {
  game: GameState;
  opened: number;
  ready: boolean;
  playable: boolean;
  recovered: boolean;
  catalogMissing: boolean;
  status: Status;
}

interface ProgressOptions {
  characters?: readonly Character[];
  store: AccountStore | null;
  slots: () => Slots;
  now?: () => number;
  mark?: () => string;
}

/** The medal center's account keeper, with this game's journal as its document. */
export function createProgress({ store, slots, characters = CHARACTERS, now = Date.now, mark = () => crypto.randomUUID() }: ProgressOptions) {
  let player = GUEST;
  let keeper: Sync | null = null;
  const listeners = new Set<() => void>();
  let snapshot: ProgressSnapshot = {
    game: initialGame(), opened: 0, ready: false, playable: false, recovered: false, catalogMissing: false,
    status: { where: 'device', kept: true },
  };
  const serverSnapshot = snapshot;

  const checkpointPosition = () => {
    if (!snapshot.playable || (!snapshot.game.journey && !snapshot.game.arena)) return;
    const game = gameReducer(snapshot.game, { type: 'checkpoint' }, characters);
    if (game !== snapshot.game) { snapshot = { ...snapshot, game }; publish(); }
  };

  const publish = (changes: Partial<ProgressSnapshot> = {}) => {
    snapshot = { ...snapshot, ...changes };
    // An unread account must be opened before play can spend its currency.
    // Offline play is available when this device already has that account's copy.
    snapshot.catalogMissing = Object.keys(snapshot.game.save.owned).some((id) => !characters.some((cat) => cat.id === id));
    snapshot.playable = snapshot.ready && !snapshot.catalogMissing && player.settled && snapshot.status.where !== 'checking'
      && snapshot.status.where !== 'unreadable' && (!store || player.uid === null || keeper?.owner() === player.uid);
    for (const listener of listeners) listener();
  };

  const open = () => {
    if (!keeper) return;
    const text = keeper.open();
    const save = parseSave(text, characters, true);
    const unreadable = text !== null && save === null;
    snapshot = {
      ...snapshot, game: { ...initialGame(), ...(save ? { save } : {}) },
      opened: snapshot.opened + 1, ready: !unreadable, recovered: unreadable,
    };
    keeper.save('tick');
    publish();
  };

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    attend(next: Player) {
      checkpointPosition();
      player = next;
      keeper?.player(next);
      publish();
    },
    start() {
      if (keeper) return;
      keeper = createSync({
        kept: {
          slot: SAVE_KEY,
          current: () => snapshot.ready ? JSON.stringify(snapshot.game.save) : null,
          reads: (text) => parseSave(text, characters, true) !== null,
          print: (text) => text,
          settle: decide,
          reopen: open,
        },
        store, slots, now, mark,
        onStatus: (status) => publish({ status }),
      });
      keeper.player(player);
      open();
    },
    dispatch(action: Exclude<Action, { type: 'load' }>) {
      if (!snapshot.playable) return;
      const previous = snapshot.game;
      const game = gameReducer(previous, action, characters);
      if (game === previous) return;
      snapshot = { ...snapshot, game };
      // Battle animation is transient. Only lasting progress needs a write.
      if (game.save !== previous.save) keeper?.save('moment');
      publish();
    },
    save(why: Why = 'tick') {
      checkpointPosition();
      keeper?.save(why);
    },
    close() {
      if (!keeper) return;
      checkpointPosition();
      keeper.save('left');
      const uid = keeper.owner();
      keeper.close();
      keeper = null;
      if (uid !== null) store?.forget(uid);
    },
  };
}
