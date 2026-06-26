/**
 * Reusable info modal
 */

import { useEffect, useId, useState } from 'react';
import { X as XIcon } from 'lucide-react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const InfoModal: React.FC<InfoModalProps> = ({
  isOpen,
  onClose,
  title,
  children
}) => {
  const titleId = useId();
  const [isCloseHovered, setIsCloseHovered] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
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
