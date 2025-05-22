import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTimeZone } from '@/hooks/useTimeZone';

export function useTodayEmailStats() {
  const { user } = useAuth();
  const { timeZone, loading: tzLoading } = useTimeZone();
  const [emailsSent, setEmailsSent] = useState<number | null>(null);
  const [emailsReceived, setEmailsReceived] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !timeZone || tzLoading) {
      setLoading(true);
      return;
    }
    setLoading(true);
    fetch('http://localhost:3001/api/gmail/fetch-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, time_zone: timeZone, day: 'today' }),
    })
      .then(res => res.json())
      .then(data => {
        setEmailsSent(data.emails_sent ?? 0);
        setEmailsReceived(data.emails_received ?? 0);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch stats');
        setLoading(false);
      });
  }, [user?.id, timeZone, tzLoading]);

  return { emailsSent, emailsReceived, loading: loading || tzLoading, error };
} 