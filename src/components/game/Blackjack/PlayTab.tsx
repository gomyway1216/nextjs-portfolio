'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Action,
  Card,
  RoundResult,
  basicStrategyDecision,
  handValue,
  isBlackjack,
  isBust,
  newDeck,
  playDealerTurn,
  shuffle,
} from './engine';

type Phase = 'idle' | 'playing' | 'dealer' | 'done';

const INITIAL_BANKROLL = 1000;
const BET = 10;

interface PlayState {
  deck: Card[];
  cursor: number;
  player: Card[];
  dealer: Card[];
  actualBet: number;
  doubled: boolean;
  phase: Phase;
  result: RoundResult | null;
}

const freshState = (): PlayState => ({ deck: [], cursor: 0, player: [], dealer: [], actualBet: BET, doubled: false, phase: 'idle', result: null });

interface SessionStats {
  hands: number;
  net: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  hintFollows: number;
  hintDiverges: number;
}

const INITIAL_STATS: SessionStats = { hands: 0, net: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, hintFollows: 0, hintDiverges: 0 };

export const PlayTab = () => {
  const { t } = useTranslation();
  const [bankroll, setBankroll] = useState(INITIAL_BANKROLL);
  const [state, setState] = useState<PlayState>(freshState);
  const [showHint, setShowHint] = useState(true);
  const [stats, setStats] = useState<SessionStats>(INITIAL_STATS);

  const deal = () => {
    if (bankroll < BET) return;
    const deck = shuffle(newDeck());
    let cursor = 0;
    const player = [deck[cursor++], deck[cursor++]];
    const dealer = [deck[cursor++], deck[cursor++]];

    if (isBlackjack(player) || isBlackjack(dealer)) {
      const result = resolveImmediate(player, dealer, BET);
      setBankroll((b) => b + result.net);
      bookHand(result);
      setState({ deck, cursor, player, dealer, actualBet: BET, doubled: false, phase: 'done', result });
      return;
    }

    setState({ deck, cursor, player, dealer, actualBet: BET, doubled: false, phase: 'playing', result: null });
  };

  const bookHand = (r: RoundResult) => {
    setStats((s) => ({
      hands: s.hands + 1,
      net: s.net + r.net,
      wins: s.wins + (r.outcome === 'win' || r.outcome === 'blackjack' ? 1 : 0),
      losses: s.losses + (r.outcome === 'lose' ? 1 : 0),
      pushes: s.pushes + (r.outcome === 'push' ? 1 : 0),
      blackjacks: s.blackjacks + (r.outcome === 'blackjack' ? 1 : 0),
      hintFollows: s.hintFollows,
      hintDiverges: s.hintDiverges,
    }));
  };

  const recordAction = (taken: Action) => {
    if (state.phase !== 'playing') return;
    // Same canDouble logic as the live hint — otherwise a player who
    // (correctly) Hits because they can't afford to Double gets penalized.
    const canDouble = state.player.length === 2 && bankroll >= state.actualBet;
    const recommended = basicStrategyDecision(state.player, state.dealer[0], canDouble);
    setStats((s) => taken === recommended
      ? { ...s, hintFollows: s.hintFollows + 1 }
      : { ...s, hintDiverges: s.hintDiverges + 1 });
  };

  const hit = () => {
    if (state.phase !== 'playing') return;
    recordAction('hit');
    setState((prev) => {
      const cursor = prev.cursor;
      const card = prev.deck[cursor];
      const player = [...prev.player, card];
      const newState = { ...prev, player, cursor: cursor + 1 };
      if (isBust(player)) {
        return finishDealer({ ...newState, phase: 'dealer' });
      }
      return newState;
    });
  };

  const stand = () => {
    if (state.phase !== 'playing') return;
    recordAction('stand');
    setState((prev) => finishDealer({ ...prev, phase: 'dealer' }));
  };

  const double = () => {
    if (state.phase !== 'playing' || state.player.length !== 2) return;
    if (bankroll < state.actualBet) return; // not enough to double
    recordAction('double');
    setState((prev) => {
      const cursor = prev.cursor;
      const card = prev.deck[cursor];
      const player = [...prev.player, card];
      return finishDealer({ ...prev, player, cursor: cursor + 1, actualBet: prev.actualBet * 2, doubled: true, phase: 'dealer' });
    });
  };

  const finishDealer = (s: PlayState): PlayState => {
    if (isBust(s.player)) {
      const result: RoundResult = { player: s.player, dealer: s.dealer, outcome: 'lose', bet: s.actualBet, net: -s.actualBet, doubled: s.doubled };
      setBankroll((b) => b + result.net);
      bookHand(result);
      return { ...s, phase: 'done', result };
    }
    const dealer = [...s.dealer];
    let cursor = s.cursor;
    playDealerTurn(dealer, () => s.deck[cursor++]);
    const pV = handValue(s.player).total;
    const dV = handValue(dealer).total;
    let outcome: RoundResult['outcome'];
    let net: number;
    if (dV > 21 || pV > dV) { outcome = 'win'; net = s.actualBet; }
    else if (pV < dV) { outcome = 'lose'; net = -s.actualBet; }
    else { outcome = 'push'; net = 0; }
    const result: RoundResult = { player: s.player, dealer, outcome, bet: s.actualBet, net, doubled: s.doubled };
    setBankroll((b) => b + net);
    bookHand(result);
    return { ...s, dealer, cursor, phase: 'done', result };
  };

  const next = () => setState(freshState());
  const reset = () => {
    setBankroll(INITIAL_BANKROLL);
    setStats(INITIAL_STATS);
    setState(freshState());
  };

  const hint = useMemo(() => {
    if (state.phase !== 'playing') return null;
    const canDouble = state.player.length === 2 && bankroll >= state.actualBet;
    return basicStrategyDecision(state.player, state.dealer[0], canDouble);
  }, [state.phase, state.player, state.dealer, state.actualBet, bankroll]);

  const winRate = stats.hands === 0 ? null : stats.wins / stats.hands;
  const followRate = (stats.hintFollows + stats.hintDiverges) === 0
    ? null
    : stats.hintFollows / (stats.hintFollows + stats.hintDiverges);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>{t('games.blackjack.play.dealer')}</h3>
        <CardRow cards={state.dealer} hideHoleCard={state.phase === 'playing'} />
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.2rem' }}>
          {state.dealer.length === 0 ? '—' : state.phase === 'playing' ? `${t('games.blackjack.play.upcard')}: ${cardText(state.dealer[0])}` : `${t('games.blackjack.play.total')}: ${handValue(state.dealer).total}${isBust(state.dealer) ? ` (${t('games.blackjack.play.bust')})` : ''}`}
        </div>

        <h3 style={{ margin: '1rem 0 0.5rem', color: '#fbbf24' }}>{t('games.blackjack.play.you')}</h3>
        <CardRow cards={state.player} />
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.2rem' }}>
          {state.player.length === 0 ? '—' : `${t('games.blackjack.play.total')}: ${handValue(state.player).total}${handValue(state.player).soft ? ` (${t('games.blackjack.play.soft')})` : ''}${isBust(state.player) ? ` ${t('games.blackjack.play.bust')}` : ''}`}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          {state.phase === 'idle' && (
            <button onClick={deal} disabled={bankroll < BET} style={btn('#22c55e', bankroll < BET)}>{t('games.blackjack.play.dealButton', { bet: BET })}</button>
          )}
          {state.phase === 'playing' && (
            <>
              <button onClick={hit} style={btn('#0ea5e9')}>Hit{showHint && hint === 'hit' ? ' 💡' : ''}</button>
              <button onClick={stand} style={btn('#94a3b8', false, '#0f172a')}>Stand{showHint && hint === 'stand' ? ' 💡' : ''}</button>
              <button
                onClick={double}
                disabled={state.player.length !== 2 || bankroll < state.actualBet}
                style={btn('#a855f7', state.player.length !== 2 || bankroll < state.actualBet)}
              >
                Double{showHint && hint === 'double' ? ' 💡' : ''}
              </button>
            </>
          )}
          {state.phase === 'done' && state.result && (
            <button onClick={next} style={btn('#22c55e', bankroll < BET)}>{t('games.blackjack.play.nextHand')}</button>
          )}
        </div>

        {state.phase === 'done' && state.result && (
          <div style={{ marginTop: '0.6rem', padding: '0.55rem 0.8rem', borderRadius: 10, background: state.result.net > 0 ? '#15803d44' : state.result.net < 0 ? '#7f1d1d44' : '#1e293b', border: `1px solid ${state.result.net > 0 ? '#4ade80' : state.result.net < 0 ? '#f87171' : '#334155'}`, color: state.result.net > 0 ? '#4ade80' : state.result.net < 0 ? '#fca5a5' : '#cbd5e1', fontWeight: 700 }}>
            {t(`games.blackjack.play.outcomes.${state.result.outcome}`)}{state.result.doubled ? ' (Double)' : ''} — {state.result.net > 0 ? `+${state.result.net}` : state.result.net}
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.8rem', color: '#94a3b8', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} /> {t('games.blackjack.play.showHint')}
        </label>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>{t('games.blackjack.play.status')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Stat label={t('games.blackjack.play.stats.bankroll')} value={`$${bankroll}`} color={bankroll < INITIAL_BANKROLL ? '#f87171' : '#4ade80'} />
          <Stat label={t('games.blackjack.play.stats.sessionNet')} value={`${stats.net >= 0 ? '+' : ''}${stats.net}`} color={stats.net >= 0 ? '#4ade80' : '#f87171'} />
          <Stat label={t('games.blackjack.play.stats.hands')} value={`${stats.hands}`} color="#67e8f9" />
          <Stat label={t('games.blackjack.play.stats.winRate')} value={winRate === null ? '—' : `${(winRate * 100).toFixed(1)}%`} color="#a78bfa" />
          <Stat label={t('games.blackjack.play.stats.blackjacks')} value={`${stats.blackjacks}`} color="#fbbf24" />
          <Stat label={t('games.blackjack.play.stats.followRate')} value={followRate === null ? '—' : `${(followRate * 100).toFixed(1)}%`} color="#f472b6" />
        </div>

        <div style={{ marginTop: '0.8rem' }}>
          <button onClick={reset} style={btn('#1e293b', false, '#94a3b8', '#334155')}>{t('games.blackjack.play.resetSession')}</button>
        </div>

        <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: '#020617', border: '1px solid #1e293b', borderRadius: 10, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <strong style={{ color: '#fbbf24' }}>{t('games.blackjack.play.rulesTitle')}</strong> {t('games.blackjack.play.rulesBody1')}<br />
          {t('games.blackjack.play.rulesBody2')}
          {' '}
          <strong>{t('games.blackjack.play.rulesBody3')}</strong>
        </div>
      </div>
    </div>
  );
};

const resolveImmediate = (player: Card[], dealer: Card[], bet: number): RoundResult => {
  const pBJ = isBlackjack(player);
  const dBJ = isBlackjack(dealer);
  if (pBJ && dBJ) return { player, dealer, outcome: 'push', bet, net: 0, doubled: false };
  if (pBJ) return { player, dealer, outcome: 'blackjack', bet, net: bet * 1.5, doubled: false };
  if (dBJ) return { player, dealer, outcome: 'lose', bet, net: -bet, doubled: false };
  // unreachable; only called when at least one BJ
  return { player, dealer, outcome: 'push', bet, net: 0, doubled: false };
};

const cardText = (c: Card) => `${c.rank}${c.suit}`;

const CardRow = ({ cards, hideHoleCard = false }: { cards: Card[]; hideHoleCard?: boolean }) => (
  <div style={{ display: 'flex', gap: '0.4rem', minHeight: 88 }}>
    {cards.map((c, i) => (
      <div
        key={i}
        style={{
          width: 56,
          height: 80,
          background: '#fff',
          color: c.suit === '♥' || c.suit === '♦' ? '#dc2626' : '#0f172a',
          border: '1px solid #94a3b8',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '0.3rem',
          fontWeight: 800,
        }}
      >
        {hideHoleCard && i === 1 ? (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1e3a8a, #312e81)', borderRadius: 6 }} />
        ) : (
          <>
            <div>{c.rank}{c.suit}</div>
            <div style={{ alignSelf: 'flex-end' }}>{c.suit}</div>
          </>
        )}
      </div>
    ))}
  </div>
);

const btn = (bg: string, disabled = false, color = '#fff', border?: string): React.CSSProperties => ({
  background: disabled ? '#1e293b' : bg,
  color: disabled ? '#475569' : color,
  border: border ? `1px solid ${border}` : 'none',
  borderRadius: 10,
  padding: '0.55rem 1.1rem',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}44`, borderRadius: 10, padding: '0.55rem 0.7rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.25rem', fontWeight: 800 }}>{value}</div>
  </div>
);
