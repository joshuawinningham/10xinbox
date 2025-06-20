import { useState, useEffect } from 'react';
import { FileText, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTodayEmailStats } from '@/hooks/useTodayEmailStats';
import { useSendReport } from '@/hooks/useSendReport';
import { useEmailStats, EmailStatsView } from '@/hooks/useEmailStats';
import { useAuth } from '@/hooks/useAuth';
import { useTimeZone } from '@/hooks/useTimeZone';
import { connectGmail } from '@/lib/gmail';
import PageHeading from '@/components/PageHeading';

export default function Dashboard() {
  const [period, setPeriod] = useState<EmailStatsView>("hourly");
  const { emailsSent, emailsReceived, emailsSentYesterday, emailsReceivedYesterday, newThreads, replies, loading, error } = useTodayEmailStats();
  const { sendReport, loading: sending, success, error: sendError } = useSendReport();
  const { data: statsData, loading: statsLoading, error: statsError } = useEmailStats(period);
  const { user } = useAuth();
  const { timeZone, loading: tzLoading } = useTimeZone();
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [responseCount, setResponseCount] = useState<number>(0);
  const [responseLoading, setResponseLoading] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [inboxZeroDays, setInboxZeroDays] = useState<number | null>(null);
  const [inboxZeroLoading, setInboxZeroLoading] = useState(false);
  const [inboxZeroError, setInboxZeroError] = useState<string | null>(null);
  const [consecutiveInboxZero, setConsecutiveInboxZero] = useState<number | null>(null);
  const [showPermissionBanner, setShowPermissionBanner] = useState(true);

  useEffect(() => {
    if (!user?.id || !timeZone || tzLoading) {
      setResponseLoading(true);
      return;
    }
    setResponseLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/gmail/response-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, time_zone: timeZone, day: 'today' }),
    })
      .then(res => res.json())
      .then(data => {
        setResponseTime(data.average_response_time);
        setResponseCount(data.count || 0);
        setResponseError(null);
      })
      .catch(err => {
        setResponseError(err.message || 'Failed to fetch response time');
        setResponseTime(null);
        setResponseCount(0);
      })
      .finally(() => {
        setResponseLoading(false);
      });
  }, [user?.id, timeZone, tzLoading]);

  // Add event listener to refresh response time when email is sent
  useEffect(() => {
    if (!user?.id) return; // Don't set up listener if no user
    
    const handleRefreshResponseTime = () => {
      console.log('Received refreshResponseTime event, refreshing in 2 seconds...');
      // Add a small delay to allow Gmail API to process the sent email
      setTimeout(() => {
        console.log('Refreshing response time data...');
        const fetchResponseTime = async () => {
          if (!user?.id) return;
          setResponseLoading(true);
          setResponseError(null);
          try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/response-time`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: user.id }),
            });
            if (!res.ok) throw new Error('Failed to fetch response time');
            const data = await res.json();
            console.log('Response time data received:', data);
            setResponseTime(data.average_response_time);
            setResponseCount(data.count || 0);
          } catch (err) {
            console.error('Error fetching response time:', err);
            setResponseError((err as Error).message);
          } finally {
            setResponseLoading(false);
          }
        };
        fetchResponseTime();
      }, 2000); // 2 second delay to allow Gmail API processing
    };

    console.log('Setting up refreshResponseTime event listener');
    window.addEventListener('refreshResponseTime', handleRefreshResponseTime);
    return () => {
      console.log('Removing refreshResponseTime event listener');
      window.removeEventListener('refreshResponseTime', handleRefreshResponseTime);
    };
  }, [user?.id]);

  useEffect(() => {
    const fetchInboxZero = async () => {
      if (!user?.id) return;
      setInboxZeroLoading(true);
      setInboxZeroError(null);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/inbox-zero-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        if (!res.ok) throw new Error('Failed to fetch inbox zero history');
        const data = await res.json();
        // Only count working days in the current month where inboxCount === 0
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const daysThisMonth = Array.isArray(data)
          ? data.filter((d: any) => {
              const date = new Date(d.date);
              return (
                date.getFullYear() === currentYear &&
                date.getMonth() === currentMonth &&
                d.isWorkingDay // Use working days from user settings
              );
            })
          : [];
        const inboxZeroWorkingDays = daysThisMonth.filter((d: any) => d.inboxCount === 0).length;
        setInboxZeroDays(inboxZeroWorkingDays);
      } catch (err) {
        setInboxZeroError((err as Error).message);
      } finally {
        setInboxZeroLoading(false);
      }
    };
    fetchInboxZero();
  }, [user?.id]);

  useEffect(() => {
    const fetchConsecutiveInboxZero = async () => {
      if (!user?.id) return;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/gmail/inbox-zero-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        if (!res.ok) throw new Error('Failed to fetch inbox zero history');
        const data = await res.json();
        // Only consider working days in the current month
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        // Sort by date ascending
        const monthData = Array.isArray(data)
          ? data.filter((d: any) => {
              const date = new Date(d.date);
              return (
                date.getFullYear() === currentYear &&
                date.getMonth() === currentMonth &&
                d.isWorkingDay // Use working days from user settings
              );
            }).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          : [];
        // Find the longest streak ending today (or yesterday if today is weekend)
        let streak = 0;
        for (let i = monthData.length - 1; i >= 0; i--) {
          if (monthData[i].inboxCount === 0) {
            streak++;
          } else {
            break;
          }
        }
        setConsecutiveInboxZero(streak);
      } catch (err) {
        setConsecutiveInboxZero(null);
      }
    };
    fetchConsecutiveInboxZero();
  }, [user?.id]);

  function formatDuration(seconds: number | null) {
    if (seconds == null) return '--';
    if (seconds < 60) return `${seconds}s`;
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (min < 60) return `${min}m${sec > 0 ? ` ${sec}s` : ''}`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h${remMin > 0 ? ` ${remMin}m` : ''}${sec > 0 ? ` ${sec}s` : ''}`;
  }

  // Helper to get recharts dataKey for x-axis
  const getXAxisKey = () => {
    if (period === 'daily') return 'date'; // Mon, Tue, ...
    if (period === 'monthly') return 'date'; // 1, 2, ...
    if (period === 'yearly') return 'date'; // Jan, Feb, ...
    return 'hour'; // hourly
  };

  // Helper to get recharts data
  const getVolumeData = () => {
    if (statsLoading || !statsData) return [];
    if (period === 'hourly') {
      // Ensure all 24 hours are present, fill missing with zeros
      const hours = Array.from({ length: 24 }, (_, i) => i);
      const dataByHour = Object.fromEntries(statsData.map((d: any) => [d.hour, d]));
      return hours.map(hour => ({
        hour,
        emails_sent: dataByHour[hour]?.emails_sent || 0,
        emails_received: dataByHour[hour]?.emails_received || 0,
      }));
    }
    return statsData;
  };

  // Helper to format hour labels
  const formatHour = (h: number) => {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };

  const chartColors = {
    received: `hsl(var(--primary))`,
    sent: `hsl(var(--primary) / 0.5)`,
    grid: `hsl(var(--border))`,
    text: `hsl(var(--muted-foreground))`,
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // For hourly, format the label as time
      const displayLabel = period === 'hourly' ? formatHour(label) : label;
      return (
        <div className="rounded-lg border bg-background p-2 shadow-md">
          <p className="mb-1 font-medium">{displayLabel}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div 
                className="h-2 w-2 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-muted-foreground">
                {entry.name}: <span className="font-medium text-foreground">{entry.value}</span>
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const chartConfig = {
    cartesianGrid: {
      strokeDasharray: "3 3",
      stroke: chartColors.grid,
    },
    xAxis: {
      stroke: chartColors.text,
      tick: { 
        fill: chartColors.text,
        fontSize: 10
      },
      interval: 0,
      angle: 0,
      textAnchor: 'middle',
      height: 30,
      dx: period === 'hourly' ? -2 : 0,
    },
    yAxis: {
      stroke: chartColors.text,
      tick: { 
        fill: chartColors.text,
        fontSize: 11
      },
    },
  };

  const getChartMargin = () => {
    if (period === 'monthly') {
      return { bottom: 20, left: 10, right: 10 };
    } else if (period === 'yearly') {
      return { bottom: 20, left: 10, right: 10 };
    } else if (period === 'hourly') {
      return { bottom: 20, left: 10, right: 10 };
    }
    return { bottom: 20, left: 10, right: 10 };
  };

  const received = emailsReceived ?? 0;
  const sent = emailsSent ?? 0;

  return (
    <>
      <PageHeading className="mt-2">Dashboard</PageHeading>
      {statsError === 'insufficient_permissions' && showPermissionBanner && (
        <div className="flex items-center gap-4 bg-yellow-100 border border-yellow-300 text-yellow-900 px-4 py-3 rounded mb-6">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          <span className="flex-1">
            Your Gmail connection is missing required permissions. Please re-authorize to continue seeing your email stats.
          </span>
          <Button
            variant="outline"
            className="border-yellow-400 text-yellow-900 hover:bg-yellow-200"
            onClick={() => user && connectGmail(user.id)}
          >
            Re-authorize Gmail
          </Button>
          <button
            className="ml-2 text-yellow-700 hover:text-yellow-900 text-xl font-bold"
            onClick={() => setShowPermissionBanner(false)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">Emails Received<br />Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              {loading ? '...' : error ? '--' : received}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {loading || error ? '--' :
                emailsReceivedYesterday === 0 || emailsReceivedYesterday == null
                  ? '+0% from yesterday'
                  : `${emailsReceivedYesterday === 0 ? '+0' : ((received - emailsReceivedYesterday) / emailsReceivedYesterday * 100 > 0 ? '+' : '')}${((received - emailsReceivedYesterday) / (emailsReceivedYesterday || 1) * 100).toFixed(0)}% from yesterday`}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">Outgoing Emails<br />Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              {loading ? '...' : error ? '--' : sent}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {loading || error ? '--' : (
                <>
                  <div>{newThreads} new · {replies} replies</div>
                  <div className="mt-1">
                    {emailsSentYesterday === 0 || emailsSentYesterday == null
                      ? '+0% from yesterday'
                      : `${emailsSentYesterday === 0 ? '+0' : ((sent - emailsSentYesterday) / emailsSentYesterday * 100 > 0 ? '+' : '')}${((sent - emailsSentYesterday) / (emailsSentYesterday || 1) * 100).toFixed(0)}% from yesterday`}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">Avg. Response<br />Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              {responseLoading ? '...' : responseError ? '--' : formatDuration(responseTime)}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {responseCount > 0 ? `${responseCount} replies today` : 'No replies today'}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">Inbox Zero Days<br />This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              {inboxZeroLoading ? '...' : inboxZeroError ? '--' : inboxZeroDays}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {inboxZeroDays !== null ? `${inboxZeroDays} days with zero inbox` : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">Consecutive<br />Inbox Zero Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              {consecutiveInboxZero === null ? '...' : consecutiveInboxZero}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {consecutiveInboxZero === 1 ? '1 day streak' : `${consecutiveInboxZero ?? 0} day streak`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="flex flex-col gap-2">
          <Button onClick={sendReport} className="gap-2" disabled={sending}>
            <FileText className="h-4 w-4" />
            {sending ? 'Sending...' : 'Send Report'}
          </Button>
          {success && <span className="text-green-600 text-xs">{success}</span>}
          {sendError && <span className="text-red-600 text-xs">{sendError}</span>}
        </div>
        <ToggleGroup type="single" value={period} onValueChange={(value) => value && setPeriod(value as EmailStatsView)}>
          <ToggleGroupItem value="hourly" aria-label="Hourly view">
            Hourly
          </ToggleGroupItem>
          <ToggleGroupItem value="daily" aria-label="Daily view">
            Daily
          </ToggleGroupItem>
          <ToggleGroupItem value="monthly" aria-label="Monthly view">
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem value="yearly" aria-label="Yearly view">
            Yearly
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>{period === 'yearly' ? 'Emails Received/Sent Last 12 Months (Bar)' : period === 'monthly' ? 'Emails Received/Sent This Month (Bar)' : period === 'daily' ? 'Emails Received/Sent This Week (Bar)' : 'Emails Received/Sent Today (Bar)'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getVolumeData()} margin={getChartMargin()}>
                  <CartesianGrid {...chartConfig.cartesianGrid} />
                  <XAxis {...chartConfig.xAxis} dataKey={getXAxisKey()} tickFormatter={period === 'hourly' ? formatHour : undefined} interval={period === 'hourly' ? 1 : 0} angle={0} textAnchor="middle" height={30} />
                  <YAxis {...chartConfig.yAxis} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="emails_received" name="Received" fill={chartColors.received} />
                  <Bar dataKey="emails_sent" name="Sent" fill={chartColors.sent} />
                </BarChart>
              </ResponsiveContainer>
              {statsLoading && <div className="text-center text-xs mt-2">Loading...</div>}
              {statsError && <div className="text-center text-xs text-red-500 mt-2">{statsError}</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>{period === 'yearly' ? 'Emails Received/Sent Last 12 Months (Line)' : period === 'monthly' ? 'Emails Received/Sent This Month (Line)' : period === 'daily' ? 'Emails Received/Sent This Week (Line)' : 'Emails Received/Sent Today (Line)'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={getVolumeData()} margin={getChartMargin()}>
                  <CartesianGrid {...chartConfig.cartesianGrid} />
                  <XAxis {...chartConfig.xAxis} dataKey={getXAxisKey()} tickFormatter={period === 'hourly' ? formatHour : undefined} interval={period === 'hourly' ? 1 : 0} angle={0} textAnchor="middle" height={30} />
                  <YAxis {...chartConfig.yAxis} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="emails_received" 
                    name="Received" 
                    stroke={chartColors.received}
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="emails_sent" 
                    name="Sent" 
                    stroke={chartColors.sent}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
              {statsLoading && <div className="text-center text-xs mt-2">Loading...</div>}
              {statsError && <div className="text-center text-xs text-red-500 mt-2">{statsError}</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>{period === 'yearly' ? 'Emails Received/Sent Last 12 Months (Area)' : period === 'monthly' ? 'Emails Received/Sent This Month (Area)' : period === 'daily' ? 'Emails Received/Sent This Week (Area)' : 'Emails Received/Sent Today (Area)'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={getVolumeData()} margin={getChartMargin()}>
                  <CartesianGrid {...chartConfig.cartesianGrid} />
                  <XAxis {...chartConfig.xAxis} dataKey={getXAxisKey()} tickFormatter={period === 'hourly' ? formatHour : undefined} interval={period === 'hourly' ? 1 : 0} angle={0} textAnchor="middle" height={30} />
                  <YAxis {...chartConfig.yAxis} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="emails_received" 
                    name="Received"
                    stackId="1" 
                    stroke={chartColors.received}
                    fill={chartColors.received}
                    fillOpacity={0.3} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="emails_sent" 
                    name="Sent"
                    stackId="1" 
                    stroke={chartColors.sent}
                    fill={chartColors.sent}
                    fillOpacity={0.3} 
                  />
                </AreaChart>
              </ResponsiveContainer>
              {statsLoading && <div className="text-center text-xs mt-2">Loading...</div>}
              {statsError && <div className="text-center text-xs text-red-500 mt-2">{statsError}</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}