import { useState, useCallback, useEffect } from 'react';

export function useToast(durationMs = 4000) {
  const [message, setMessage] = useState<string | null>(null);

  const showToast = useCallback((text: string) => {
    setMessage(text);
  }, []);

  const dismissToast = useCallback(() => {
    setMessage(null);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);

  return { toastMessage: message, showToast, dismissToast };
}
