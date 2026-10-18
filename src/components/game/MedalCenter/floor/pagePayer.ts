'use client';

/**
 * The page's own floor jackpot payer (jackpotPayer.ts), on the page's medals
 * (bank.ts) and whoever is signed in (pageAccount.ts), and the hook that every
 * page showing the floor jackpot uses: it starts the payer for the player
 * whose medals are on the table, and hears what it pays.
 */

import { useEffect, useState } from 'react';
import { bank } from '../bank';
import { createJackpotPayer, type JackpotPaid, type JackpotPayer } from './jackpotPayer';
import { pageAccount } from './pageAccount';
import { lastKnownPlace, onJackpotDue } from './reporter';

let payer: JackpotPayer | null = null;

export function pagePayer(): JackpotPayer | null {
  if (typeof window === 'undefined') return null;
  if (payer) return payer;
  const made = createJackpotPayer({
    account: pageAccount,
    fetch: (...args) => window.fetch(...args),
    bank: {
      table: () => {
        const state = bank().getState();
        return state.loaded && state.ledger ? { owner: state.owner, device: state.ledger.device } : null;
      },
      credit: (move, keep) => bank().credit(move, keep),
    },
    now: () => Date.now(),
    later: (run, ms) => window.setTimeout(run, ms),
    cancel: (handle) => window.clearTimeout(handle as number),
  });
  // A report that won, or the floor saying a player has wins waiting: paid now.
  onJackpotDue((uid) => made.look(uid));
  payer = made;
  return payer;
}

/**
 * For a page that shows the floor jackpot: pays the floor jackpots of the
 * player whose medals are on the table (`owner`, an account's id), when this
 * device knows they are on the floor, and gives the last one it paid on this
 * page, for the page to celebrate.
 */
export function useJackpotPayer(owner: string | null): JackpotPaid | null {
  const [paid, setPaid] = useState<JackpotPaid | null>(null);
  useEffect(() => {
    const it = pagePayer();
    if (!it) return;
    return it.onPaid((heard) => setPaid(heard));
  }, []);
  useEffect(() => {
    if (!owner) return;
    // A player this device has seen join the floor may have won on a page that has gone since: their wins are asked for.
    // Anybody else is asked by the floor itself, whenever it says they have one waiting (the medal center's front asks).
    if (lastKnownPlace(owner) === true) pagePayer()?.look(owner);
  }, [owner]);
  return paid && paid.uid === owner ? paid : null;
}
