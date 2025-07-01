import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmMessage, setShowConfirmMessage] = useState(false);

  useEffect(() => {
    // Get the current session and user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes to the auth session
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    console.log('Calling supabase.auth.signInWithPassword', email);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      console.log('Supabase login error:', error.message);
    }
    setLoading(false);
    return !error;
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/settings/profile`
      }
    });
    if (error) setError(error.message);
    if (data.user && !data.session) setShowConfirmMessage(true);
    setLoading(false);
    return !error;
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    await supabase.auth.signOut();
    setLoading(false);
  }, []);

  const resetPassword = useCallback(async (newPassword: string) => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setError(error.message);
    setLoading(false);
    return !error;
  }, []);

  return {
    user,
    loading,
    error,
    showConfirmMessage,
    login,
    signup,
    logout,
    resetPassword,
    setShowConfirmMessage,
  };
}

// Custom hook for logout with redirect
export function useLogout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  return async () => {
    await logout();
    navigate('/login');
  };
} 