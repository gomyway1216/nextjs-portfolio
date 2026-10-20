/**
 * Reusable info modal.
 *
 * While it is open, the keyboard stays in it: focus moves to its close button
 * when it opens, Tab and Shift+Tab go round its own controls, Escape closes it,
 * and focus goes back to whatever opened it (the How to play button) when it
 * closes, so that a keyboard or screen reader user is never left behind it.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { X as XIcon } from 'lucide-react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getUITranslation } from '../constants/gameTranslations';

/** What Tab can reach inside the dialog. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  closeLabel?: string;
  children: React.ReactNode;
}

export const InfoModal: React.FC<InfoModalProps> = ({
  isOpen,
  onClose,
  title,
  closeLabel,
  children
}) => {
  const titleId = useId();
  const { language } = useGameLanguage();
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The latest onClose, so that a parent drawing again (a new function each time) does not move focus.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // The control the last click was on, noted before the page's own handlers hear it. Safari does not give a button
  // the focus when it is clicked or tapped, so there the focus is still on the page when the dialog opens, and this is
  // what opened it. (A click, not the press before it: a page that comes to life between the two has heard only the
  // click. It is listened for as the dialog is put in the page, in the same step as the button's own handler.)
  const pressed = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const note = (event: MouseEvent) => {
      pressed.current = event.target instanceof Element ? event.target.closest<HTMLElement>(FOCUSABLE) : null;
    };
    document.addEventListener('click', note, true);
    return () => document.removeEventListener('click', note, true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : pressed.current;
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const stops = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0);
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const at = document.activeElement;
      if (event.shiftKey ? at === first || !dialog.contains(at) : at === last || !dialog.contains(at)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--games-route-backdrop, rgba(0, 0, 0, 0.64))',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 80,
        padding: '5.5rem 1rem 1rem'
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          background: 'var(--games-route-surface-raised, rgba(15, 23, 42, 0.96))',
          border: '1px solid color-mix(in srgb, #0ea5e9 36%, var(--games-route-border, rgba(14, 165, 233, 0.34)))',
          borderRadius: '8px',
          padding: 'clamp(1.25rem, 4vw, 2rem)',
          maxWidth: '600px',
          maxHeight: 'calc(100vh - 6.5rem)',
          width: '100%',
          position: 'relative',
          overflowY: 'auto',
          color: 'var(--games-route-fg, #e5e7eb)',
          boxShadow: 'var(--games-route-shadow, 0 28px 90px rgba(0, 0, 0, 0.34))'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={closeLabel ?? getUITranslation(language).closeDialog}
          style={{
            position: 'absolute',
            top: '0.875rem',
            right: '0.875rem',
            background: isCloseHovered ? 'var(--games-route-control-hover, rgba(255, 255, 255, 0.18))' : 'var(--games-route-control, rgba(255, 255, 255, 0.1))',
            border: '1px solid var(--games-route-border, rgba(255, 255, 255, 0.12))',
            borderRadius: '999px',
            color: 'var(--games-route-fg, #fff)',
            cursor: 'pointer',
            padding: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={() => setIsCloseHovered(true)}
          onMouseLeave={() => setIsCloseHovered(false)}
        >
          <XIcon style={{ width: '1.25rem', height: '1.25rem' }} />
        </button>

        <h2 id={titleId} style={{
          color: 'var(--games-route-fg, #fff)',
          fontSize: 'clamp(1.45rem, 5vw, 1.875rem)',
          fontWeight: 760,
          marginBottom: '1.5rem',
          paddingInline: '2rem',
          textAlign: 'center',
          lineHeight: 1.15
        }}>
          {title}
        </h2>

        {children}
      </div>
    </div>
  );
};
