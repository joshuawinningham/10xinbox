import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ThemePicker } from "@/components/theme-picker";
import { applyTheme } from "@/lib/theme-utils";
import { useAuth } from '@/hooks/useAuth';
import { connectGmail, disconnectGmail } from '@/lib/gmail';
import { useGmailConnection } from '@/hooks/useGmailConnection';
import { useTimeZone } from '@/hooks/useTimeZone';
import { Mail } from 'lucide-react';

const timezones = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland"
];

export default function SettingsProfile() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'blue');
  const { user } = useAuth();
  const { gmailConnected, loading: gmailLoading } = useGmailConnection(user?.id);
  const { timeZone, loading: tzLoading, error: tzError, updateTimeZone } = useTimeZone();

  useEffect(() => {
    // Apply the initial theme
    applyTheme(theme);
  }, []);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profile Settings</h2>
        <p className="text-muted-foreground">
          Manage your profile settings and email connections.
        </p>
      </div>
      
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle>Gmail Connection</CardTitle>
                <CardDescription>
                  Connect your Gmail account to start tracking email analytics
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {gmailConnected ? (
              <Button
                className="w-[280px]"
                onClick={async () => {
                  if (user) {
                    await disconnectGmail(user.id);
                    window.location.reload();
                  }
                }}
                disabled={gmailLoading || !user}
              >
                {gmailLoading ? 'Checking...' : 'Disconnect Gmail'}
              </Button>
            ) : (
              <Button
                className="w-[280px]"
                onClick={() => user && connectGmail(user.id)}
                disabled={gmailLoading || !user}
              >
                {gmailLoading ? 'Checking...' : 'Connect Gmail'}
            </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time Zone</CardTitle>
            <CardDescription>
              Choose your preferred time zone for displaying data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={timeZone}
              onValueChange={updateTimeZone}
              disabled={tzLoading}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select time zone" />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((timezone) => (
                  <SelectItem key={timezone} value={timezone}>
                    {timezone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tzError && <div className="text-red-500 text-xs mt-2">{tzError}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>
              Choose your preferred color theme
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemePicker theme={theme} onThemeChange={handleThemeChange} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}