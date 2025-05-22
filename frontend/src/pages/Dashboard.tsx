import React, { useState } from 'react';
import { MailIcon, SendIcon, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTodayEmailStats } from '@/hooks/useTodayEmailStats';
import { useSendReport } from '@/hooks/useSendReport';
import { useEmailStats, EmailStatsView } from '@/hooks/useEmailStats';

const hourlyVolumeData = [
  { name: '1AM', received: 8, sent: 5 },
  { name: '2AM', received: 6, sent: 4 },
  { name: '3AM', received: 4, sent: 2 },
  { name: '4AM', received: 3, sent: 2 },
  { name: '5AM', received: 5, sent: 3 },
  { name: '6AM', received: 12, sent: 8 },
  { name: '7AM', received: 25, sent: 18 },
  { name: '8AM', received: 45, sent: 35 },
  { name: '9AM', received: 68, sent: 52 },
  { name: '10AM', received: 72, sent: 58 },
  { name: '11AM', received: 65, sent: 50 },
  { name: '12PM', received: 58, sent: 45 },
];

const dailyVolumeData = [
  { name: 'Mon', received: 45, sent: 32 },
  { name: 'Tue', received: 78, sent: 65 },
  { name: 'Wed', received: 95, sent: 78 },
  { name: 'Thu', received: 87, sent: 69 },
  { name: 'Fri', received: 75, sent: 55 },
  { name: 'Sat', received: 35, sent: 28 },
  { name: 'Sun', received: 42, sent: 31 },
];

const monthlyVolumeData = Array.from({ length: 31 }, (_, i) => ({
  name: (i + 1).toString(),
  received: Math.floor(Math.random() * (200 - 100) + 100),
  sent: Math.floor(Math.random() * (150 - 80) + 80),
}));

const yearlyVolumeData = [
  { name: 'June', received: 4800, sent: 4200 },
  { name: 'July', received: 4600, sent: 4100 },
  { name: 'Aug', received: 5100, sent: 4500 },
  { name: 'Sept', received: 4900, sent: 4300 },
  { name: 'Oct', received: 4700, sent: 4150 },
  { name: 'Nov', received: 4850, sent: 4250 },
  { name: 'Dec', received: 4300, sent: 3900 },
  { name: 'Jan', received: 4550, sent: 4050 },
  { name: 'Feb', received: 4750, sent: 4200 },
  { name: 'Mar', received: 5200, sent: 4600 },
  { name: 'Apr', received: 4950, sent: 4400 },
  { name: 'May', received: 5150, sent: 4550 },
];

export default function Dashboard() {
  const [period, setPeriod] = useState<EmailStatsView>("hourly");
  const { emailsSent, emailsReceived, loading, error } = useTodayEmailStats();
  const { sendReport, loading: sending, success, error: sendError } = useSendReport();
  const { data: statsData, loading: statsLoading, error: statsError } = useEmailStats(period);

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

  return (
    <>
      <h1 className="text-4xl font-bold tracking-tight mb-8">Dashboard</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 mb-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">Emails Received Today</CardTitle>
            <MailIcon className="h-6 w-6 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              {loading ? '...' : error ? '--' : emailsReceived}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              +12% from yesterday
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">Emails Sent Today</CardTitle>
            <SendIcon className="h-6 w-6 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              {loading ? '...' : error ? '--' : emailsSent}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              +8% from yesterday
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
        <ToggleGroup type="single" value={period} onValueChange={(value) => value && setPeriod(value)}>
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
            <CardTitle>Email Activity (Bar)</CardTitle>
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
            <CardTitle>Email Activity (Line)</CardTitle>
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
            <CardTitle>Email Activity (Area)</CardTitle>
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