/**
 * A finger pulling a piece out of the tray and onto the board.
 *
 * The Tray starts it and the Board is where it lands, so this sits between them and
 * talks to the game only through the Board's own onCursor and onTouchDone. Moves go
 * straight to the floating piece's transform: React hears only that a drag began,
 * ended, or crossed the board's edge.
 */

'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Cells } from './pieceArt';

/** A press that travels this far is a drag. Less is a tap, which picks the piece. */
const DRAG_START_PX = 9;
/** Clear space between the fingertip and the piece's lower edge. */
const FINGER_GAP_PX = 34;
/** A floating piece stays this big in a cell, however small the board's cells are. */
const MIN_FLOAT_CELL_PX = 20;
/** A click after a drag is the drag's own last event, not a tap. */
const CLICK_AFTER_DRAG_MS = 100;

export interface DragTarget {
  svg: SVGSVGElement;
  size: number;
  onCursor: (row: number, col: number) => void;
  onLeave: () => void;
  onTouchDone: () => void;
}

export interface ActiveDrag {
  cells: Cells;
  color: number;
  /** The piece is over the board, where the ghost shows it. */
  over: boolean;
}

export interface TrayPress {
  event: ReactPointerEvent<HTMLElement>;
  cells: Cells;
  color: number;
  /** The piece is in hand already, so a drag has nothing to pick up. */
  selected: boolean;
  /** The tray slides sideways, so a sideways finger is sliding it. */
  slides: boolean;
  /** Toggles the piece in hand. */
  onSelect: () => void;
}

export interface PieceDrag {
  active: ActiveDrag | null;
  /** The Board's way in. Returns how to leave. */
  connect: (board: DragTarget) => () => void;
  attachFloat: (element: HTMLDivElement | null) => void;
  press: (press: TrayPress) => void;
  /** True during a drag, for a touchmove guard that has to answer at once. */
  isDragging: () => boolean;
  /** True if this click is the end of a drag, and should do nothing. */
  ignoreClick: () => boolean;
}

export const usePieceDrag = (): PieceDrag => {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const target = useRef<DragTarget | null>(null);
  const float = useRef<HTMLDivElement | null>(null);
  const place = useRef({ x: 0, y: 0, cell: MIN_FLOAT_CELL_PX });
  const dragging = useRef(false);
  const clickUntil = useRef(0);
  const stop = useRef<(() => void) | null>(null);

  const showFloat = useCallback(() => {
    const element = float.current;
    if (!element) return;
    const { x, y, cell } = place.current;
    element.style.setProperty('--float-cell', `${cell}px`);
    element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  }, []);

  const attachFloat = useCallback(
    (element: HTMLDivElement | null) => {
      float.current = element;
      showFloat();
    },
    [showFloat],
  );

  const press = useCallback(
    ({ event, cells, color, selected, slides, onSelect }: TrayPress) => {
      // One finger drags at a time: a second must not take the first one's release away from it.
      if (stop.current) return;
      const { pointerId, clientX: startX, clientY: startY } = event;
      const rows = Math.max(...cells.map(([row]) => row)) + 1;
      let x = startX;
      let y = startY;
      let started = false;
      let over = false;
      let frame = 0;
      let lastRow = -1;
      let lastCol = -1;

      const apply = () => {
        frame = 0;
        const board = target.current;
        if (!board) return;
        const box = board.svg.getBoundingClientRect();
        const unit = box.width / board.size;
        // The piece rides above the finger, or the finger hides it. By the bottom of the
        // screen there is no finger left to lift above, so the last rows can still be reached.
        const lift = (FINGER_GAP_PX + (rows * unit) / 2) * Math.min(1, Math.max(0, window.innerHeight - y) / (FINGER_GAP_PX * 2));
        const anchorY = y - lift;
        // A cell's grace around the board, and two below it, where a board that fills the screen leaves the finger.
        const nowOver = x >= box.left - unit && x <= box.right + unit && anchorY >= box.top - unit && anchorY <= box.bottom + 2 * unit;

        place.current = { x, y: anchorY, cell: Math.max(unit, MIN_FLOAT_CELL_PX) };
        showFloat();

        if (nowOver) {
          const row = Math.max(0, Math.min(board.size - 1, Math.floor((anchorY - box.top) / unit)));
          const col = Math.max(0, Math.min(board.size - 1, Math.floor((x - box.left) / unit)));
          if (row !== lastRow || col !== lastCol) {
            lastRow = row;
            lastCol = col;
            board.onCursor(row, col);
            // Settling on the closest legal spot as it moves shows where a release would land.
            board.onTouchDone();
          }
        } else if (over) {
          lastRow = -1;
          lastCol = -1;
          board.onLeave();
        }
        if (nowOver !== over) {
          over = nowOver;
          setActive((current) => (current ? { ...current, over } : current));
        }
      };

      const handleMove = (moved: PointerEvent) => {
        if (moved.pointerId !== pointerId) return;
        x = moved.clientX;
        y = moved.clientY;
        if (!started) {
          const across = Math.abs(x - startX);
          const down = y - startY;
          if (Math.hypot(across, down) < DRAG_START_PX) return;
          // These gestures are the browser's: leave them before the tray's touchmove guard can refuse them.
          if (down > across || (slides && across > Math.abs(down))) {
            stop.current?.();
            return;
          }
          started = true;
          dragging.current = true;
          if (!selected) onSelect();
          // Picking a piece by touch lands it somewhere: in a drag it isn't anywhere until it reaches the board.
          target.current?.onLeave();
          setActive({ cells, color, over: false });
        }
        frame ||= requestAnimationFrame(apply);
      };

      const finish = (ended: PointerEvent) => {
        if (ended.pointerId !== pointerId) return;
        stop.current?.();
        if (!started) return;
        if (ended.type === 'pointerup') {
          x = ended.clientX;
          y = ended.clientY;
          apply();
        }
        dragging.current = false;
        clickUntil.current = performance.now() + CLICK_AFTER_DRAG_MS;
        setActive(null);
        if (ended.type === 'pointerup' && over) target.current?.onTouchDone();
        else onSelect(); // Let go anywhere else and the piece goes back in the tray.
      };

      stop.current = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        stop.current = null;
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [showFloat],
  );

  useEffect(() => () => stop.current?.(), []);

  const connect = useCallback((board: DragTarget) => {
    target.current = board;
    return () => {
      target.current = null;
    };
  }, []);

  const isDragging = useCallback(() => dragging.current, []);
  const ignoreClick = useCallback(() => performance.now() < clickUntil.current, []);

  return useMemo(() => ({ active, connect, attachFloat, press, isDragging, ignoreClick }), [active, connect, attachFloat, press, isDragging, ignoreClick]);
};
