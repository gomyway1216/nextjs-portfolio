'use client';
import { useEffect } from 'react';
import { toast } from 'sonner';

const ALERT_DURATION = 5000;

interface InstantMessageProps {
  message: string;
  onClose: () => void;
  severity?: 'error' | 'warning' | 'info' | 'success';
}

const InstantMessage = ({ message, onClose, severity = 'error' }: InstantMessageProps) => {
  useEffect(() => {
    if (message) {
      // Show toast based on severity
      const _toastId = severity === 'error'
        ? toast.error(message, { duration: ALERT_DURATION })
        : severity === 'success'
        ? toast.success(message, { duration: ALERT_DURATION })
        : severity === 'warning'
        ? toast.warning(message, { duration: ALERT_DURATION })
        : toast.info(message, { duration: ALERT_DURATION });

      // Call onClose after duration
      const timer = setTimeout(() => {
        onClose();
      }, ALERT_DURATION);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [message, onClose, severity]);

  // This component doesn't render anything - Sonner handles the UI
  return null;
};

export default InstantMessage;
