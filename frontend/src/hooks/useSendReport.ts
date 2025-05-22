import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function useSendReport() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendReport = useCallback(async () => {
    if (!user?.id) {
      setError('User not logged in');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('http://localhost:3001/api/report/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send report');
      setSuccess('Report sent!');
    } catch (err: any) {
      setError(err.message || 'Failed to send report');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  return { sendReport, loading, success, error };
} 