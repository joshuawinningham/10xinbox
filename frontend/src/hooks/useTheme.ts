import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

export function useTheme() {
  const [theme, setTheme] = useState('blue');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    async function fetchTheme() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/get-theme`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setTheme(data.theme || 'blue');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch theme');
      } finally {
        setLoading(false);
      }
    }
    fetchTheme();
  }, [user]);

  const updateTheme = async (newTheme: string) => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/set-theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, theme: newTheme }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTheme(newTheme);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update theme');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    theme,
    loading,
    error,
    updateTheme,
  };
} 