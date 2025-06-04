import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import PageHeading from '@/components/PageHeading';

// Helper to get weekday index with Monday as 0
function getMondayStartWeekday(date: Date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export default function InboxZero() {
  const { user } = useAuth();
  const [history, setHistory] = useState<{ date: string; inboxCount: number }[]>([]);
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

  // Only count/display business days in the current month
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const daysInMonth = now.getDate(); // up to today
  const monthHistory = history.filter((d) => {
    const date = new Date(d.date);
    return (
      date.getFullYear() === currentYear &&
      date.getMonth() === currentMonth &&
      date.getDay() !== 0 && // not Sunday
      date.getDay() !== 6    // not Saturday
    );
  });
  const inboxZeroDays = monthHistory.filter((d) => d.inboxCount === 0).length;

  // Map for quick lookup
  const historyMap = new Map(monthHistory.map((d) => [new Date(d.date).getDate(), d]));

  // Build a business days calendar matrix (weeks)
  const weeks: Array<Array<any>> = [];
  let week: Array<any> = [];
  const firstDayDate = new Date(currentYear, currentMonth, 1);
  let firstWeekday = getMondayStartWeekday(firstDayDate);
  for (let i = 0; i < firstWeekday; i++) {
    week.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentYear, currentMonth, day);
    if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends
    const d = historyMap.get(day) ? { day, ...historyMap.get(day) } : { day };
    week.push(d);
    if (week.length === 5) { // Only 5 business days per week
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 5) {
      week.push(null);
    }
    weeks.push(week);
  }
  // Flatten for grid rendering (headers: M-F)
  const businessDayHeaders = ["M","T","W","T","F"];
  // Define types for calendar grid
  interface HeaderCell { type: 'header'; label: string; }
  interface DayCell { type: 'day'; value: any; }
  const calendarGrid: Array<HeaderCell | DayCell> = [
    ...businessDayHeaders.map((d) => ({ type: 'header' as const, label: d })),
    ...weeks.flat().map((d) => ({ type: 'day' as const, value: d })),
  ];

  return (
    <div className="mx-auto max-w-2xl p-6">
      <PageHeading>Inbox Zero Calendar</PageHeading>
      <p className="text-muted-foreground mb-6">See which days you achieved Inbox Zero in the current month.</p>
      <Card className="hover:shadow-lg transition-shadow mb-8">
        <CardHeader>
          <CardTitle>Inbox Zero Days: <span className="text-primary">{inboxZeroDays}</span> / {daysInMonth}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">{error}</div>
          ) : (
            <div className="flex justify-center items-center">
              <div className="grid grid-cols-5 gap-2 mt-2 w-fit">
                {calendarGrid.map((cell, i) =>
                  cell.type === 'header' ? (
                    <div
                      key={i}
                      className="text-base text-center text-muted-foreground font-medium mb-1"
                    >
                      {cell.label}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={`w-10 h-10 rounded flex items-center justify-center text-sm font-semibold border ${cell.value ? (cell.value.inboxCount === 0 ? 'bg-primary text-white border-primary' : 'bg-muted text-muted-foreground border-muted') : 'invisible'}`}
                      title={cell.value ? `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(cell.value.day).padStart(2,'0')}: ${cell.value.inboxCount === 0 ? 'Inbox Zero!' : (cell.value.inboxCount !== undefined ? cell.value.inboxCount + ' in inbox' : '')}` : ''}
                    >
                      {cell.value ? cell.value.day : ''}
                    </div>
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