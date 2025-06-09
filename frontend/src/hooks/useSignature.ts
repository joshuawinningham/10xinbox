import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabase';

export function useSignature() {
  const [signature, setSignature] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    async function fetchSignature() {
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('signature')
          .eq('user_id', user.id)
          .single();

        if (error) throw error;
        setSignature(data?.signature || '');
      } catch (err) {
        console.error('Error fetching signature:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch signature');
      } finally {
        setLoading(false);
      }
    }

    fetchSignature();
  }, [user]);

  const updateSignature = async (newSignature: string) => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          signature: newSignature,
        });

      if (error) throw error;
      setSignature(newSignature);
    } catch (err) {
      console.error('Error updating signature:', err);
      setError(err instanceof Error ? err.message : 'Failed to update signature');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    signature,
    loading,
    error,
    updateSignature,
  };
} 