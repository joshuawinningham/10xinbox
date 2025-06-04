import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTimeZone } from '@/hooks/useTimeZone';
import { DateTime } from 'luxon';

export type EmailStatsView = 'hourly' | 'daily' | 'monthly' | 'yearly';

export function useEmailStats(view: EmailStatsView) {
  const { user } = useAuth();
  const { timeZone, loading: tzLoading } = useTimeZone();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !timeZone || tzLoading) {
      setLoading(true);
      return;
    }
    setLoading(true);
    setError(null);
    const fetchStats = async () => {
      try {
        let stats: any[] = [];
        if (view === 'hourly') {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/hourly-stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, time_zone: timeZone }),
          });
          const json = await res.json();
          if (json.error) throw new Error(json.error);
          stats = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            emails_sent: json.sent[i] || 0,
            emails_received: json.received[i] || 0,
          }));
        } else {
          // For daily, monthly, yearly, fetch stats for up to 365 days
          const days = view === 'daily' ? 7 : view === 'monthly' ? 31 : 365;
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, days }),
          });
          const json = await res.json();
          if (json.error) throw new Error(json.error);
          const statsRaw = json.stats || [];
          const tz = timeZone;
          if (view === 'monthly') {
            // Aggregate by day of current month
            const now = DateTime.now().setZone(tz);
            const year = now.year;
            const month = now.month;
            const daysInMonth = now.daysInMonth;
            const daily: Record<number, { emails_sent: number, emails_received: number }> = {};
            statsRaw.forEach((row: any) => {
              const dateObj = DateTime.fromISO(row.date, { zone: tz });
              if (dateObj.year === year && dateObj.month === month) {
                const day = dateObj.day;
                if (!daily[day]) daily[day] = { emails_sent: 0, emails_received: 0 };
                daily[day].emails_sent += row.emails_sent;
                daily[day].emails_received += row.emails_received;
              }
            });
            const days = typeof daysInMonth === 'number' ? daysInMonth : 0;
            stats = Array.from({ length: days }, (_, i) => ({
              date: (i + 1).toString(),
              emails_sent: daily[i + 1]?.emails_sent ?? 0,
              emails_received: daily[i + 1]?.emails_received ?? 0,
            }));
          } else if (view === 'yearly') {
            // Aggregate by month for last 12 months
            const now = DateTime.now().setZone(tz);
            const months: { [key: string]: { emails_sent: number, emails_received: number } } = {};
            statsRaw.forEach((row: any) => {
              const dateObj = DateTime.fromISO(row.date, { zone: tz });
              const key = `${dateObj.year}-${dateObj.month.toString().padStart(2, '0')}`;
              if (!months[key]) months[key] = { emails_sent: 0, emails_received: 0 };
              months[key].emails_sent += row.emails_sent;
              months[key].emails_received += row.emails_received;
            });
            // Get last 12 months keys in order
            const monthKeys = [];
            for (let i = 11; i >= 0; i--) {
              const d = now.minus({ months: i });
              monthKeys.push(`${d.year}-${d.month.toString().padStart(2, '0')}`);
            }
            stats = monthKeys.map(key => {
              const d = DateTime.fromISO(`${key}-01`, { zone: tz });
              return {
                date: d.isValid ? d.toFormat('MMM') : key, // fallback for debugging
                emails_sent: months[key]?.emails_sent || 0,
                emails_received: months[key]?.emails_received || 0,
              };
            });
          } else {
            // Daily: always show current week as Mon-Sun
            const today = DateTime.now().setZone(tz);
            const weekStart = today.set({ weekday: 1 }); // Monday of this week
            const weekDays = Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));
            stats = weekDays.map(day => {
              const found = statsRaw.find((row: any) => DateTime.fromISO(row.date, { zone: tz }).hasSame(day, 'day'));
              return {
                date: day.toFormat('EEE'), // 'Mon', 'Tue', etc.
                emails_sent: found ? found.emails_sent : 0,
                emails_received: found ? found.emails_received : 0,
              };
            });
          }
        }
        setData(stats);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [user?.id, timeZone, tzLoading, view]);

  return { data, loading: loading || tzLoading, error };
} 