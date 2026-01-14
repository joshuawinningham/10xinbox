import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTimeZone } from '@/hooks/useTimeZone';

interface DayStats {
  total_sent: number;
  emails_received: number;
  new_threads: number;
  replies: number;
}

async function fetchDayStats(userId: string, timeZone: string, day: 'today' | 'yesterday'): Promise<DayStats> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/fetch-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, time_zone: timeZone, day }),
  });
  if (!res.ok) throw new Error(`Failed to fetch ${day} stats`);
  return res.json();
}

export function useTodayEmailStats() {
  const { user } = useAuth();
  const { timeZone, loading: tzLoading } = useTimeZone();
  const [emailsSent, setEmailsSent] = useState<number | null>(null);
  const [emailsReceived, setEmailsReceived] = useState<number | null>(null);
  const [emailsSentYesterday, setEmailsSentYesterday] = useState<number | null>(null);
  const [emailsReceivedYesterday, setEmailsReceivedYesterday] = useState<number | null>(null);
  const [newThreads, setNewThreads] = useState<number>(0);
  const [replies, setReplies] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || tzLoading || timeZone === 'UTC') return;

    const loadStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const [today, yesterday] = await Promise.all([
          fetchDayStats(user.id, timeZone, 'today'),
          fetchDayStats(user.id, timeZone, 'yesterday'),
        ]);
        setEmailsSent(today.total_sent ?? 0);
        setEmailsReceived(today.emails_received ?? 0);
        setEmailsSentYesterday(yesterday.total_sent ?? 0);
        setEmailsReceivedYesterday(yesterday.emails_received ?? 0);
        setNewThreads(today.new_threads ?? 0);
        setReplies(today.replies ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [user?.id, timeZone, tzLoading]);

  return {
    emailsSent,
    emailsReceived,
    emailsSentYesterday,
    emailsReceivedYesterday,
    newThreads,
    replies,
    loading,
    error,
  };
} 