import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTimeZone } from '@/hooks/useTimeZone';

export function useTodayEmailStats() {
  const { user } = useAuth();
  const { timeZone, loading: tzLoading } = useTimeZone();
  const [emailsSent, setEmailsSent] = useState<number | null>(null);
  const [emailsReceived, setEmailsReceived] = useState<number | null>(null);
  const [emailsSentYesterday, setEmailsSentYesterday] = useState<number | null>(null);
  const [emailsReceivedYesterday, setEmailsReceivedYesterday] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !timeZone || tzLoading) {
      setLoading(true);
      return;
    }
    setLoading(true);
    Promise.all([
      fetch(`${import.meta.env.VITE_API_URL}/api/gmail/fetch-stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, time_zone: timeZone, day: 'today' }),
      })
        .then(res => res.json()),
      fetch(`${import.meta.env.VITE_API_URL}/api/gmail/fetch-stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, time_zone: timeZone, day: 'yesterday' }),
      })
        .then(res => res.json()),
    ])
      .then(([today, yesterday]) => {
        setEmailsSent(today.emails_sent ?? 0);
        setEmailsReceived(today.emails_received ?? 0);
        setEmailsSentYesterday(yesterday.emails_sent ?? 0);
        setEmailsReceivedYesterday(yesterday.emails_received ?? 0);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch stats');
        setLoading(false);
      });
  }, [user?.id, timeZone, tzLoading]);

  return {
    emailsSent,
    emailsReceived,
    emailsSentYesterday,
    emailsReceivedYesterday,
    loading: loading || tzLoading,
    error
  };
} 