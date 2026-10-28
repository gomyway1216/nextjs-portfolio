import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDLE_STOP_MS, pollingDelay, startRoomPolling } from '../../../src/lib/ogiri/polling';
import type { RoomView } from '../../../src/lib/ogiri/types';

const lobby = { revision: 1, phase: 'lobby', paused: false, deadline: 0 } as RoomView;
const active = { ...lobby, phase: 'answering', deadline: 100_000 } as RoomView;
const cleanups: Array<() => void> = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanups.splice(0).forEach((stop) => stop()); vi.useRealTimers(); });

function setup(read = vi.fn(async (_signal: AbortSignal) => {})) {
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = new EventTarget();
  let online = true;
  let view = lobby;
  const stopped = vi.fn(), error = vi.fn();
  const poller = startRoomPolling({ read, view: () => view, stopped, error,
    document: doc, window: win, online: () => online });
  cleanups.push(poller.stop);
  return { read, stopped, error, poller, setView: (next: RoomView) => { view = next; },
    hide: (hidden: boolean) => { doc.hidden = hidden; doc.dispatchEvent(new Event('visibilitychange')); },
    connect: (value: boolean) => { online = value; win.dispatchEvent(new Event(value ? 'online' : 'offline')); } };
}

it('backs off idle rooms, while a running game stays responsive', () => {
  expect([0, 15_000, 60_000, IDLE_STOP_MS].map((t) => pollingDelay(lobby, t)))
    .toEqual([1500, 5000, 15_000, null]);
  expect(pollingDelay(active, IDLE_STOP_MS)).toBe(1500);
  expect(pollingDelay({ ...active, paused: true }, IDLE_STOP_MS)).toBeNull();
});

it('suspends manual results while keeping timed answers and votes responsive', () => {
  for (const phase of ['reveal', 'ranking'] as const) {
    const manual = { ...active, phase, settings: { autoAdvance: false } } as RoomView;
    expect([0, 15_000, 60_000, IDLE_STOP_MS].map((t) => pollingDelay(manual, t))).toEqual([1500, 5000, 15000, null]);
    expect(pollingDelay({ ...manual, settings: { autoAdvance: true } } as RoomView, IDLE_STOP_MS)).toBe(1500);
  }
  for (const phase of ['answering', 'voting'] as const)
    expect(pollingDelay({ ...active, phase, settings: { autoAdvance: false } } as RoomView, IDLE_STOP_MS)).toBe(1500);
});

it('backs off while waiting for late answers, without slowing timed voting', () => {
  for (const automatic of [true, false]) {
    const overtime = { ...active, serverTime: active.deadline, settings: { autoAdvance: automatic } } as RoomView;
    expect([0, 15000, 60000, IDLE_STOP_MS].map(t => pollingDelay(overtime, t)))
      .toEqual([1500, 5000, 15000, null]);
    expect(pollingDelay({ ...overtime, phase: 'voting' }, IDLE_STOP_MS)).toBe(1500);
  }
});

it('sends no hidden/offline polls or heartbeats and resumes immediately', async () => {
  const p = setup();
  await vi.advanceTimersByTimeAsync(0);
  p.hide(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(p.read).toHaveBeenCalledTimes(1);
  p.hide(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(p.read).toHaveBeenCalledTimes(2);
  p.connect(false);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(p.read).toHaveBeenCalledTimes(2);
  p.connect(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(p.read).toHaveBeenCalledTimes(3);
});

it('stops a visible but abandoned room after 15 minutes until explicit resume', async () => {
  const p = setup();
  await vi.advanceTimersByTimeAsync(IDLE_STOP_MS + 15_000);
  expect(p.stopped).toHaveBeenLastCalledWith('idle');
  const reads = p.read.mock.calls.length;
  expect(reads).toBeLessThan(100); // Fixed 1.5-second polling would make over 600 calls.
  await vi.advanceTimersByTimeAsync(IDLE_STOP_MS);
  expect(p.read).toHaveBeenCalledTimes(reads);
  p.poller.resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(p.read).toHaveBeenCalledTimes(reads + 1);
  expect(p.stopped).toHaveBeenLastCalledWith(null);
});

it('resets the idle window when someone changes the room', async () => {
  const p = setup();
  await vi.advanceTimersByTimeAsync(14 * 60_000);
  p.setView({ ...lobby, revision: 2 });
  await vi.advanceTimersByTimeAsync(2 * 60_000);
  expect(p.stopped).not.toHaveBeenCalledWith('idle');
});

it('never retries an expired room, including after switching tabs', async () => {
  const p = setup(vi.fn(async () => { throw Object.assign(new Error('expired'), { status: 404 }); }));
  await vi.advanceTimersByTimeAsync(0);
  p.hide(true); p.hide(false);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(p.read).toHaveBeenCalledTimes(1);
  expect(p.stopped).toHaveBeenLastCalledWith('expired');
});

it('backs off temporary server failures and eventually suspends abandoned retries', async () => {
  const p = setup(vi.fn(async () => { throw Object.assign(new Error('busy'), { status: 503 }); }));
  await vi.advanceTimersByTimeAsync(IDLE_STOP_MS + 30_000);
  expect(p.read.mock.calls.length).toBeLessThan(40);
  expect(p.stopped).toHaveBeenLastCalledWith('idle');
});

it('aborts a hidden in-flight request without starting an overlapping read', async () => {
  let finish!: () => void;
  const read = vi.fn((_signal: AbortSignal) => new Promise<void>((resolve) => { finish = resolve; }));
  const p = setup(read);
  p.hide(true);
  expect(read.mock.calls[0][0].aborted).toBe(true);
  p.hide(false);
  await vi.advanceTimersByTimeAsync(5000);
  expect(read).toHaveBeenCalledTimes(1);
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(2);
  p.poller.stop(); finish();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(read).toHaveBeenCalledTimes(2);
});
