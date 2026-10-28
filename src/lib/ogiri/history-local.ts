import { validHistoryId } from './history';
import type { HistoryRef } from './types';

const KEY = 'ogiri:history';
export function readLocalHistory(
  storage: Pick<Storage, 'getItem'>,
  now = Date.now(),
): HistoryRef[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is HistoryRef =>
        Boolean(
          v &&
            typeof v.id === 'string' &&
            validHistoryId(v.id) &&
            /^[A-HJ-NP-Z2-9]{6}$/.test(v.code) &&
            Number.isInteger(v.game) &&
            v.game > 0 &&
            Number.isFinite(v.finishedAt) &&
            Number.isFinite(v.expiresAt) &&
            v.expiresAt > now,
        ),
      )
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, 100);
  } catch {
    return [];
  }
}
export function rememberHistory(refs: HistoryRef[]): void {
  try {
    const all = new Map(readLocalHistory(localStorage).map((r) => [r.id, r]));
    for (const r of refs) if (r.expiresAt > Date.now()) all.set(r.id, r);
    const value = JSON.stringify(
      [...all.values()].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 100),
    );
    if (localStorage.getItem(KEY) !== value) localStorage.setItem(KEY, value);
  } catch {
    /* The history link and download still work when browser storage is unavailable. */
  }
}
