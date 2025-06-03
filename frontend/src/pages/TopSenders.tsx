import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { DateTime } from 'luxon';
import PageHeading from '@/components/PageHeading';

type TopSender = {
  email: string;
  name: string;
  count: number;
};

export default function TopSenders() {
  const { user } = useAuth();
  const [data, setData] = useState<TopSender[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => DateTime.now().minus({ days: 29 }).toISODate());
  const [endDate, setEndDate] = useState(() => DateTime.now().toISODate());

  const fetchTopSenders = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/top-senders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          start_date: startDate,
          end_date: endDate,
          limit: 10,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message || 'Failed to fetch top senders');
      } else {
        setError('Failed to fetch top senders');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopSenders();
    // eslint-disable-next-line
  }, [user?.id, startDate, endDate]);

  return (
    <>
      <PageHeading>Top Senders</PageHeading>
      <div className="mx-auto max-w-screen-2xl">
        <Card className="mb-8 hover:shadow-lg transition-shadow w-full">
          <CardHeader>
            <CardTitle>Filter by Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div>
                <label className="block text-sm mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded px-2 py-1" />
              </div>
              <div>
                <label className="block text-sm mb-1">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded px-2 py-1" />
              </div>
              <button onClick={fetchTopSenders} className="px-4 py-2 rounded bg-primary text-white hover:bg-primary/90 mt-[22px]">Apply</button>
            </div>
          </CardContent>
        </Card>
        <Card className="mb-8 hover:shadow-lg transition-shadow w-full">
          <CardHeader>
            <CardTitle>Top Senders (Bar Chart)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[450px] bg-transparent">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 20, left: 36, bottom: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Emails Received" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
              {loading && <div className="text-center text-xs mt-2">Loading...</div>}
              {error && <div className="text-center text-xs text-red-500 mt-2">{error}</div>}
            </div>
          </CardContent>
        </Card>
        <Card className="mb-8 hover:shadow-lg transition-shadow w-full">
          <CardHeader>
            <CardTitle>Top Senders (Table)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Emails Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={row.email}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{row.name || <span className="text-muted-foreground">(No Name)</span>}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.count}</TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">No data</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {loading && <div className="text-center text-xs mt-2">Loading...</div>}
            {error && <div className="text-center text-xs text-red-500 mt-2">{error}</div>}
          </CardContent>
        </Card>
      </div>
    </>
  );
} 