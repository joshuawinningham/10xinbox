import { useState, useEffect } from 'react';

export function useGmailConnection(userId: string | undefined) {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    fetch(`${import.meta.env.VITE_API_URL}/api/gmail/is-connected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
      .then(res => res.json())
      .then(res => setGmailConnected(res.connected))
      .catch(() => setError('Failed to check Gmail connection'))
      .finally(() => setLoading(false));
  }, [userId]);

  return { gmailConnected, loading, error };
} 