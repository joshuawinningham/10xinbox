import { useState, useEffect, useCallback } from 'react';

export function useGmailConnection(userId: string | undefined) {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(() => {
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

  const refreshToken = useCallback(() => {
    if (!userId) return;
    // Proactively refresh token to prevent disconnections
    fetch(`${import.meta.env.VITE_API_URL}/api/gmail/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          console.log('Token refreshed successfully');
        }
      })
      .catch(err => {
        console.error('Failed to refresh token:', err);
      });
  }, [userId]);

  useEffect(() => {
    fetchStatus();
    
    // Poll connection status every 30 seconds
    const statusInterval = setInterval(fetchStatus, 30000);
    
    // Proactively refresh token every 15 minutes to prevent expirations
    const refreshInterval = setInterval(refreshToken, 15 * 60 * 1000);
    
    return () => {
      clearInterval(statusInterval);
      clearInterval(refreshInterval);
    };
  }, [fetchStatus, refreshToken]);

  return { gmailConnected, setGmailConnected, loading, error, refresh: fetchStatus };
} 