import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function useTimeZone() {
  const { user } = useAuth();
  const [timeZone, setTimeZone] = useState<string>('UTC');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the user's time zone from the backend
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/auth/get-timezone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id }),
    })
      .then(res => res.json())
      .then(data => {
        setTimeZone(data.time_zone || 'UTC');
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch time zone');
        setLoading(false);
      });
  }, [user?.id]);

  // Function to update the user's time zone
  const updateTimeZone = useCallback((newTimeZone: string) => {
    if (!user?.id) return;
    setLoading(true);
    console.log('Updating time zone:', { userId: user.id, newTimeZone });
    fetch(`${import.meta.env.VITE_API_URL}/api/auth/set-timezone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, time_zone: newTimeZone }),
    })
      .then(res => {
        console.log('Time zone update response status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('Time zone update response:', data);
        setTimeZone(newTimeZone);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to update time zone:', err);
        setError('Failed to update time zone');
        setLoading(false);
      });
  }, [user?.id]);

  return { timeZone, loading, error, updateTimeZone };
} 