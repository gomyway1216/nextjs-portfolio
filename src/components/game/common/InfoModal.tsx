/**
 * Reusable info modal
 */

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
  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.64)',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid rgba(14, 165, 233, 0.34)',
          borderRadius: '1rem',
          padding: 'clamp(1.25rem, 4vw, 2rem)',
          maxWidth: '600px',
          maxHeight: 'min(88vh, 720px)',
          width: '100%',
          position: 'relative',
          overflowY: 'auto',
          color: '#e5e7eb',
          boxShadow: '0 28px 90px rgba(0, 0, 0, 0.34)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close dialog"
          style={{
            position: 'absolute',
            top: '0.875rem',
            right: '0.875rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '999px',
            color: '#fff',
            cursor: 'pointer',
            padding: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
        >
          <XIcon style={{ width: '1.25rem', height: '1.25rem' }} />
        </button>

        <h2 style={{
          color: '#fff',
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
