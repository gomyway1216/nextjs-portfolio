/**
 * No-limit Texas Hold'em rules engine.
 *
 * The engine has no React or DOM dependencies. It owns the deck, betting
 * rounds, legal-action checks, all-ins, side pots and seven-card showdown
 * evaluation. CPU strategy lives in ai.ts and only receives public state plus
 * its own hole cards.
 */

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'complete';
export type PokerActionType = 'fold' | 'check' | 'call' | 'raise';

export interface PokerAction {
  type: PokerActionType;
  /** Absolute amount this player has committed on the current street. */
  raiseTo?: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isHuman: boolean;
  stack: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  streetBet: number;
  totalContribution: number;
  lastAction: PokerActionType | 'bet' | 'small-blind' | 'big-blind' | null;
}

export interface HandRank {
  /** 8 = straight flush, 0 = high card. */
  category: number;
  tiebreak: number[];
  name: HandCategoryName;
}

export type HandCategoryName =
  | 'straight-flush'
  | 'four-of-a-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'two-pair'
  | 'one-pair'
  | 'high-card';

export interface PotResult {
  amount: number;
  eligible: number[];
  winners: number[];
}

export interface HandResult {
  payouts: number[];
  winnerIndices: number[];
  handRanks: Record<number, HandRank>;
  pots: PotResult[];
  uncontested: boolean;
}

export interface LogEntry {
  id: number;
  type: 'hand' | 'blind' | 'action' | 'street' | 'result';
  seatIndex?: number;
  action?: PokerActionType;
  amount?: number;
  street?: Street;
  detail?: string;
}

export interface GameState {
  players: PlayerState[];
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  board: Card[];
  deck: Card[];
  street: Street;
  currentBet: number;
  minRaise: number;
  currentActor: number | null;
  pending: number[];
  /** Seats that may call or fold but whose raise option was not reopened. */
  raiseLocked: number[];
  /** True while an all-in board is being revealed one card at a time. */
  runout: boolean;
  handNumber: number;
  log: LogEntry[];
  nextLogId: number;
  result: HandResult | null;
}

export interface LegalActions {
  toCall: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export const rankValue = (rank: Rank): number => RANKS.indexOf(rank) + 2;

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

export function shuffleDeck(deck: readonly Card[], rng: () => number = Math.random): Card[] {
  const shuffled = [...deck];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function straightHigh(values: number[]): number | null {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    if (unique[index] - unique[index + 4] === 4) return unique[index];
  }
  return null;
}

export function evaluateFive(cards: readonly Card[]): HandRank {
  if (cards.length !== 5) throw new Error('evaluateFive requires exactly five cards');

  const values = cards.map((card) => rankValue(card.rank));
  const descending = [...values].sort((a, b) => b - a);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straight = straightHigh(values);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (flush && straight !== null) {
    return { category: 8, tiebreak: [straight], name: 'straight-flush' };
  }
  if (groups[0][1] === 4) {
    return { category: 7, tiebreak: [groups[0][0], groups[1][0]], name: 'four-of-a-kind' };
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { category: 6, tiebreak: [groups[0][0], groups[1][0]], name: 'full-house' };
  }
  if (flush) return { category: 5, tiebreak: descending, name: 'flush' };
  if (straight !== null) return { category: 4, tiebreak: [straight], name: 'straight' };
  if (groups[0][1] === 3) {
    const kickers = groups.filter((group) => group[1] === 1).map((group) => group[0]).sort((a, b) => b - a);
    return { category: 3, tiebreak: [groups[0][0], ...kickers], name: 'three-of-a-kind' };
  }
  const pairs = groups.filter((group) => group[1] === 2).map((group) => group[0]).sort((a, b) => b - a);
  if (pairs.length === 2) {
    const kicker = groups.find((group) => group[1] === 1)?.[0] ?? 0;
    return { category: 2, tiebreak: [pairs[0], pairs[1], kicker], name: 'two-pair' };
  }
  if (pairs.length === 1) {
    const kickers = groups.filter((group) => group[1] === 1).map((group) => group[0]).sort((a, b) => b - a);
    return { category: 1, tiebreak: [pairs[0], ...kickers], name: 'one-pair' };
  }
  return { category: 0, tiebreak: descending, name: 'high-card' };
}

export function compareHandRanks(left: HandRank, right: HandRank): number {
  if (left.category !== right.category) return left.category - right.category;
  const length = Math.max(left.tiebreak.length, right.tiebreak.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.tiebreak[index] ?? 0) - (right.tiebreak[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function evaluateBest(cards: readonly Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) throw new Error('evaluateBest requires five to seven cards');
  let best: HandRank | null = null;
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const rank = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareHandRanks(rank, best) > 0) best = rank;
          }
        }
      }
    }
  }
  if (!best) throw new Error('Unable to evaluate hand');
  return best;
}

export function evaluateMadeHand(hole: readonly Card[], board: readonly Card[]): HandRank | null {
  if (hole.length !== 2 || board.length < 3 || board.length > 5) return null;
  return evaluateBest([...hole, ...board]);
}

export function totalPot(state: Pick<GameState, 'players'>): number {
  return state.players.reduce((sum, player) => sum + player.totalContribution, 0);
}

function nextSeat(players: readonly PlayerState[], from: number, predicate: (player: PlayerState) => boolean): number {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (from + offset) % players.length;
    if (predicate(players[index])) return index;
  }
  return from;
}

function nextPendingSeat(players: readonly PlayerState[], from: number, pending: readonly number[]): number | null {
  const pendingSet = new Set(pending);
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (from + offset) % players.length;
    if (pendingSet.has(index) && !players[index].folded && !players[index].allIn) return index;
  }
  return null;
}

function appendLog(state: GameState, entry: Omit<LogEntry, 'id'>): GameState {
  return {
    ...state,
    log: [...state.log, { ...entry, id: state.nextLogId }],
    nextLogId: state.nextLogId + 1,
  };
}

function contribute(player: PlayerState, requested: number): number {
  const amount = Math.max(0, Math.min(player.stack, requested));
  player.stack -= amount;
  player.streetBet += amount;
  player.totalContribution += amount;
  player.allIn = player.stack === 0;
  return amount;
}

export function createGame(
  playerCount: number,
  options: { startingStack?: number; smallBlind?: number; bigBlind?: number; rng?: () => number } = {},
): GameState {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) {
    throw new Error('Texas Hold’em supports two to eight players');
  }
  const startingStack = options.startingStack ?? 200;
  const players: PlayerState[] = Array.from({ length: playerCount }, (_, index) => ({
    id: index === 0 ? 'human' : `solver-${index}`,
    name: index === 0 ? 'You' : `Solver ${String(index).padStart(2, '0')}`,
    isHuman: index === 0,
    stack: startingStack,
    hole: [],
    folded: false,
    allIn: false,
    streetBet: 0,
    totalContribution: 0,
    lastAction: null,
  }));

  const shell: GameState = {
    players,
    dealerIndex: playerCount - 1,
    smallBlindIndex: 0,
    bigBlindIndex: 1,
    smallBlind: options.smallBlind ?? 1,
    bigBlind: options.bigBlind ?? 2,
    startingStack,
    board: [],
    deck: [],
    street: 'complete',
    currentBet: 0,
    minRaise: options.bigBlind ?? 2,
    currentActor: null,
    pending: [],
    raiseLocked: [],
    runout: false,
    handNumber: 0,
    log: [],
    nextLogId: 1,
    result: null,
  };
  return startNextHand(shell, options.rng);
}

export function startNextHand(state: GameState, rng: () => number = Math.random): GameState {
  if (state.street !== 'complete' && state.handNumber > 0) throw new Error('Current hand is not complete');

  const resetPlayers: PlayerState[] = state.players.map((player) => ({
    ...player,
    stack: player.stack > 0 ? player.stack : state.startingStack,
    hole: [] as Card[],
    folded: false,
    allIn: false,
    streetBet: 0,
    totalContribution: 0,
    lastAction: null,
  }));
  const dealerIndex = nextSeat(resetPlayers, state.dealerIndex, (player) => player.stack > 0);
  const smallBlindIndex = resetPlayers.length === 2
    ? dealerIndex
    : nextSeat(resetPlayers, dealerIndex, (player) => player.stack > 0);
  const bigBlindIndex = nextSeat(resetPlayers, smallBlindIndex, (player) => player.stack > 0);
  const deck = shuffleDeck(createDeck(), rng);
  let cursor = 0;

  for (let round = 0; round < 2; round += 1) {
    let seat = dealerIndex;
    for (let count = 0; count < resetPlayers.length; count += 1) {
      seat = nextSeat(resetPlayers, seat, (player) => player.stack > 0);
      resetPlayers[seat].hole.push(deck[cursor]);
      cursor += 1;
    }
  }

  const smallPosted = contribute(resetPlayers[smallBlindIndex], state.smallBlind);
  resetPlayers[smallBlindIndex].lastAction = 'small-blind';
  const bigPosted = contribute(resetPlayers[bigBlindIndex], state.bigBlind);
  resetPlayers[bigBlindIndex].lastAction = 'big-blind';
  const pending = resetPlayers
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => !player.folded && !player.allIn)
    .map(({ index }) => index);

  let next: GameState = {
    ...state,
    players: resetPlayers,
    dealerIndex,
    smallBlindIndex,
    bigBlindIndex,
    board: [],
    deck: deck.slice(cursor),
    street: 'preflop',
    currentBet: Math.max(smallPosted, bigPosted),
    minRaise: state.bigBlind,
    currentActor: nextPendingSeat(resetPlayers, bigBlindIndex, pending),
    pending,
    raiseLocked: [],
    runout: false,
    handNumber: state.handNumber + 1,
    log: [],
    nextLogId: 1,
    result: null,
  };
  next = appendLog(next, { type: 'hand', amount: next.handNumber });
  next = appendLog(next, { type: 'blind', seatIndex: smallBlindIndex, amount: smallPosted, detail: 'small' });
  next = appendLog(next, { type: 'blind', seatIndex: bigBlindIndex, amount: bigPosted, detail: 'big' });
  return next;
}

export function getLegalActions(state: GameState, seatIndex: number): LegalActions {
  const player = state.players[seatIndex];
  const toCall = Math.max(0, state.currentBet - player.streetBet);
  const callAmount = Math.min(toCall, player.stack);
  const maxRaiseTo = player.streetBet + player.stack;
  const minRaiseTo = state.currentBet + state.minRaise;
  const active = state.street !== 'complete' && !player.folded && !player.allIn;
  return {
    toCall,
    canFold: active && toCall > 0,
    canCheck: active && toCall === 0,
    canCall: active && toCall > 0 && callAmount > 0,
    callAmount,
    canRaise:
      active
      && maxRaiseTo > state.currentBet
      && !state.raiseLocked.includes(seatIndex),
    minRaiseTo,
    maxRaiseTo,
  };
}

function liveIndices(players: readonly PlayerState[]): number[] {
  return players.map((player, index) => ({ player, index })).filter(({ player }) => !player.folded).map(({ index }) => index);
}

function actionableIndices(players: readonly PlayerState[]): number[] {
  return players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => !player.folded && !player.allIn)
    .map(({ index }) => index);
}

function clockwiseDistance(index: number, from: number, count: number): number {
  return (index - from + count) % count;
}

export function settleShowdown(
  players: readonly PlayerState[],
  board: readonly Card[],
  dealerIndex: number,
): HandResult {
  const payouts = Array(players.length).fill(0) as number[];
  const handRanks: Record<number, HandRank> = {};
  for (const index of liveIndices(players)) handRanks[index] = evaluateBest([...players[index].hole, ...board]);

  const levels = [...new Set(players.map((player) => player.totalContribution).filter((amount) => amount > 0))].sort((a, b) => a - b);
  const pots: PotResult[] = [];
  const winnerIndices: number[] = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.totalContribution >= level)
      .map(({ index }) => index);
    const amount = (level - previous) * contributors.length;
    previous = level;
    if (amount <= 0) continue;
    if (contributors.length === 1) {
      payouts[contributors[0]] += amount;
      continue;
    }
    const eligible = contributors.filter((index) => !players[index].folded);
    if (eligible.length === 0) continue;
    let winners = [eligible[0]];
    for (const index of eligible.slice(1)) {
      const comparison = compareHandRanks(handRanks[index], handRanks[winners[0]]);
      if (comparison > 0) winners = [index];
      else if (comparison === 0) winners.push(index);
    }
    winners.sort((a, b) => clockwiseDistance(a, dealerIndex + 1, players.length) - clockwiseDistance(b, dealerIndex + 1, players.length));
    const share = Math.floor(amount / winners.length);
    let remainder = amount % winners.length;
    for (const winner of winners) {
      payouts[winner] += share + (remainder > 0 ? 1 : 0);
      remainder -= remainder > 0 ? 1 : 0;
      if (!winnerIndices.includes(winner)) winnerIndices.push(winner);
    }
    pots.push({ amount, eligible, winners });
  }
  return {
    payouts,
    winnerIndices,
    handRanks,
    pots,
    uncontested: false,
  };
}

function finishShowdown(state: GameState): GameState {
  const players = state.players.map((player) => ({ ...player }));
  const result = settleShowdown(players, state.board, state.dealerIndex);
  result.payouts.forEach((amount, index) => { players[index].stack += amount; });
  let next: GameState = {
    ...state,
    players,
    street: 'complete',
    currentActor: null,
    pending: [],
    raiseLocked: [],
    runout: false,
    result,
  };
  for (const winner of result.winnerIndices) {
    next = appendLog(next, {
      type: 'result',
      seatIndex: winner,
      amount: result.payouts[winner],
      detail: result.handRanks[winner]?.name,
    });
  }
  return next;
}

function finishUncontested(state: GameState, winner: number): GameState {
  const players = state.players.map((player) => ({ ...player }));
  const amount = totalPot(state);
  players[winner].stack += amount;
  const payouts = Array(players.length).fill(0) as number[];
  payouts[winner] = amount;
  const result: HandResult = {
    payouts,
    winnerIndices: [winner],
    handRanks: {},
    pots: [{ amount, eligible: [winner], winners: [winner] }],
    uncontested: true,
  };
  let next: GameState = {
    ...state,
    players,
    street: 'complete',
    currentActor: null,
    pending: [],
    raiseLocked: [],
    runout: false,
    result,
  };
  next = appendLog(next, { type: 'result', seatIndex: winner, amount, detail: 'uncontested' });
  return next;
}

function beginRunout(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, streetBet: 0, lastAction: null })),
    currentBet: 0,
    currentActor: null,
    pending: [],
    raiseLocked: [],
    runout: true,
  };
}

export function advanceRunout(state: GameState): GameState {
  if (!state.runout) throw new Error('No all-in runout is pending');
  if (state.board.length >= 5) return finishShowdown({ ...state, runout: false });

  const boardLength = state.board.length;
  const startsStreet = boardLength === 0 || boardLength === 3 || boardLength === 4;
  const deck = startsStreet ? state.deck.slice(1) : [...state.deck];
  if (deck.length === 0) throw new Error('Deck exhausted during all-in runout');
  const street: Street = boardLength < 3 ? 'flop' : boardLength === 3 ? 'turn' : 'river';
  let next: GameState = {
    ...state,
    board: [...state.board, deck[0]],
    deck: deck.slice(1),
    street,
    currentActor: null,
    pending: [],
    raiseLocked: [],
    runout: true,
  };
  if (street !== state.street) next = appendLog(next, { type: 'street', street });
  return next;
}

function advanceStreet(state: GameState): GameState {
  const players = state.players.map((player) => ({ ...player, streetBet: 0, lastAction: null }));
  if (state.street === 'river') return finishShowdown({ ...state, players });

  const drawCount = state.street === 'preflop' ? 3 : 1;
  const street: Street = state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river';
  let next: GameState = {
    ...state,
    players,
    board: [...state.board, ...state.deck.slice(1, drawCount + 1)],
    deck: state.deck.slice(drawCount + 1),
    street,
    currentBet: 0,
    minRaise: state.bigBlind,
    pending: actionableIndices(players),
    raiseLocked: [],
    currentActor: null,
  };
  next = appendLog(next, { type: 'street', street });

  // With fewer than two players able to wager, no further betting is possible.
  if (actionableIndices(players).length < 2) return beginRunout(next);
  next.currentActor = nextPendingSeat(players, state.dealerIndex, next.pending);
  return next;
}

export function applyPlayerAction(state: GameState, seatIndex: number, action: PokerAction): GameState {
  if (state.currentActor !== seatIndex) throw new Error('Action is out of turn');
  const legal = getLegalActions(state, seatIndex);
  const players = state.players.map((player) => ({ ...player }));
  const player = players[seatIndex];
  let pending = state.pending.filter((index) => index !== seatIndex);
  let raiseLocked = [...state.raiseLocked];
  let currentBet = state.currentBet;
  let minRaise = state.minRaise;
  let logAmount = 0;

  if (action.type === 'fold') {
    if (!legal.canFold) throw new Error('Fold is not legal');
    player.folded = true;
    player.lastAction = 'fold';
  } else if (action.type === 'check') {
    if (!legal.canCheck) throw new Error('Check is not legal');
    player.lastAction = 'check';
  } else if (action.type === 'call') {
    if (!legal.canCall) throw new Error('Call is not legal');
    logAmount = contribute(player, legal.callAmount);
    player.lastAction = 'call';
  } else {
    const raiseTo = Math.round(action.raiseTo ?? 0);
    if (!legal.canRaise || raiseTo <= currentBet || raiseTo > legal.maxRaiseTo) throw new Error('Raise is not legal');
    if (raiseTo < legal.minRaiseTo && raiseTo !== legal.maxRaiseTo) throw new Error('Raise is below the minimum');
    const oldPending = new Set(state.pending);
    const openingBet = state.currentBet === 0;
    const raiseSize = raiseTo - currentBet;
    logAmount = contribute(player, raiseTo - player.streetBet);
    player.lastAction = openingBet ? 'bet' : 'raise';
    currentBet = raiseTo;
    if (raiseSize >= state.minRaise) {
      minRaise = raiseSize;
      pending = actionableIndices(players).filter((index) => index !== seatIndex);
      raiseLocked = [];
    } else {
      const owing = actionableIndices(players).filter((index) => index !== seatIndex && players[index].streetBet < currentBet);
      const alreadyActed = owing.filter((index) => !oldPending.has(index));
      pending = [...new Set([...pending, ...owing])];
      raiseLocked = [...new Set([...raiseLocked, ...alreadyActed])];
    }
  }

  raiseLocked = raiseLocked.filter((index) => !players[index].folded && !players[index].allIn);
  pending = pending.filter((index) => !players[index].folded && !players[index].allIn);
  let next: GameState = { ...state, players, pending, raiseLocked, currentBet, minRaise };
  next = appendLog(next, {
    type: 'action',
    seatIndex,
    action: action.type,
    amount: action.type === 'raise' ? currentBet : logAmount,
    detail: action.type === 'raise' && state.currentBet === 0 ? 'bet' : undefined,
  });

  const live = liveIndices(players);
  if (live.length === 1) return finishUncontested(next, live[0]);
  if (pending.length === 0) {
    if (live.length > 1 && actionableIndices(players).length < 2) return beginRunout(next);
    return advanceStreet(next);
  }
  next.currentActor = nextPendingSeat(players, seatIndex, pending);
  return next;
}
