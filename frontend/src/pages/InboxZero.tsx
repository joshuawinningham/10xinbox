import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import PageHeading from '@/components/PageHeading';
import { useWorkingHours } from '@/hooks/useWorkingHours';

export default function InboxZero() {
  const { user } = useAuth();
  const { workingHours, loading: whLoading } = useWorkingHours();
  const [history, setHistory] = useState<{ date: string; inboxCount: number; isWorkingDay: boolean }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user?.id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/inbox-zero-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        if (!res.ok) throw new Error('Failed to fetch inbox zero history');
        const data = await res.json();
        setHistory(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [user?.id]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  // Get total days in the current month
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Map for quick lookup (keyed by date string 'YYYY-MM-DD')
  const historyMap = new Map(history.map((d) => [d.date, d]));

  // Build a full month calendar matrix (weeks, Sun-Sat)
  const weeks: Array<Array<any>> = [];
  let week: Array<any> = [];
  const firstDayDate = new Date(currentYear, currentMonth, 1);
  let firstWeekday = firstDayDate.getDay(); // 0=Sun, 6=Sat
  for (let i = 0; i < firstWeekday; i++) {
    week.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(currentYear, currentMonth, day);
    // const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat (not needed since we use API's isWorkingDay)
    const key = dateObj.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const dayData = historyMap.get(key);
    const isWorkingDay = dayData?.isWorkingDay ?? false; // Use API's isWorkingDay field
    week.push({
      day,
      dayData,
      isWorkingDay,
      dateObj,
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) {
      week.push(null);
    }
    weeks.push(week);
  }
  // Flatten for grid rendering (headers: Sun-Sat)
  const dayHeaders = ["S","M","T","W","T","F","S"];
  // Define types for calendar grid
  interface HeaderCell { type: 'header'; label: string; }
  interface DayCell { type: 'day'; value: any; }
  const calendarGrid: Array<HeaderCell | DayCell> = [
    ...dayHeaders.map((d) => ({ type: 'header' as const, label: d })),
    ...weeks.flat().map((d) => ({ type: 'day' as const, value: d })),
  ];

  // Count working days and inbox zero days (use same logic as Dashboard)
  const monthHistory = history.filter((d) => {
    // Use string manipulation to avoid timezone issues (same as Dashboard)
    const [year, month] = d.date.split('-').map(Number);
    return (
      year === currentYear &&
      (month - 1) === currentMonth && // month-1 because JS months are 0-indexed
      d.isWorkingDay // Use working days from user settings (same as Dashboard)
    );
  });
  const inboxZeroDays = monthHistory.filter((d) => d.inboxCount === 0).length;

  // Debug: log working days and current month/year
  useEffect(() => {
    if (workingHours) {
      console.log('Working days (1=Mon, 7=Sun):', workingHours.days);
      console.log('Current year:', currentYear, 'Current month:', currentMonth + 1);
    }
  }, [workingHours, currentYear, currentMonth]);

  return (
    <div className="mx-auto max-w-2xl p-0 pt-0 mt-0">
      <PageHeading>Inbox Zero Calendar</PageHeading>
      <p className="text-muted-foreground mb-6">See which working days you achieved Inbox Zero in the current month.</p>
      <Card className="hover:shadow-lg transition-shadow mb-8">
        <CardHeader>
          <CardTitle>Inbox Zero Days: <span className="text-primary">{inboxZeroDays}</span> / {monthHistory.length}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || whLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">{error}</div>
          ) : (
            <div className="flex justify-center items-center">
              <div className="grid grid-cols-7 gap-2 mt-2 w-fit">
                {calendarGrid.map((cell, i) =>
                  cell.type === 'header' ? (
                    <div
                      key={i}
                      className="text-base text-center text-muted-foreground font-medium mb-1"
                    >
                      {cell.label}
                    </div>
                  ) : cell.value ? (
                    <div
                      key={i}
                      className={`w-10 h-10 rounded flex items-center justify-center text-sm font-semibold border ${cell.value.isWorkingDay ? (cell.value.dayData && cell.value.dayData.inboxCount === 0 ? 'bg-primary text-white border-primary' : 'bg-muted text-muted-foreground border-muted') : 'bg-gray-100 text-gray-400 border-gray-200'}`}
                      title={cell.value.isWorkingDay
                        ? cell.value.dayData
                          ? `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(cell.value.day).padStart(2,'0')}: ${cell.value.dayData.inboxCount === 0 ? 'Inbox Zero!' : (cell.value.dayData.inboxCount !== undefined ? cell.value.dayData.inboxCount + ' in inbox' : '')}`
                          : `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(cell.value.day).padStart(2,'0')}: No data`
                        : 'Not a working day'}
                    >
                      {cell.value.day}
                    </div>
                  ) : (
                    <div key={i} className="w-10 h-10" />
                  )
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}