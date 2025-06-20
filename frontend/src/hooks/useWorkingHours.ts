import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

export interface WorkingHours {
  start: string; // HH:MM format
  end: string; // HH:MM format
  days: number[]; // Array of day numbers (1=Monday, 2=Tuesday, etc.)
  bufferMinutes: number; // Buffer time in minutes before end of working hours
}

export function useWorkingHours() {
  const { user } = useAuth();
  const [workingHours, setWorkingHours] = useState<WorkingHours>({
    start: '09:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5], // Monday to Friday by default
    bufferMinutes: 30 // 30 minutes buffer by default
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the user's working hours from the backend
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/auth/get-working-hours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id }),
    })
      .then(res => res.json())
      .then(data => {
        setWorkingHours({
          start: data.working_hours_start || '09:00',
          end: data.working_hours_end || '17:00',
          days: data.working_days || [1, 2, 3, 4, 5],
          bufferMinutes: data.inbox_zero_buffer_minutes || 30
        });
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch working hours');
        setLoading(false);
      });
  }, [user?.id]);

  // Function to update the user's working hours
  const updateWorkingHours = useCallback((newWorkingHours: WorkingHours) => {
    if (!user?.id) return Promise.reject('No user ID');
    
    setLoading(true);
    return fetch(`${import.meta.env.VITE_API_URL}/api/auth/set-working-hours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_id: user.id, 
        working_hours_start: newWorkingHours.start,
        working_hours_end: newWorkingHours.end,
        working_days: newWorkingHours.days,
        inbox_zero_buffer_minutes: newWorkingHours.bufferMinutes
      }),
    })
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to update working hours');
        }
        return res.json();
      })
      .then(data => {
        setWorkingHours(newWorkingHours);
        setLoading(false);
        return data;
      })
      .catch(err => {
        console.error('Failed to update working hours:', err);
        setError('Failed to update working hours');
        setLoading(false);
        throw err;
      });
  }, [user?.id]);

  return { workingHours, setWorkingHours, loading, error, updateWorkingHours };
} 