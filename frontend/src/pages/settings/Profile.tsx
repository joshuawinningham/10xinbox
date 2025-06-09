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
import { useSignature } from '@/hooks/useSignature';
import { useTheme } from '@/hooks/useTheme';
import { Mail } from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';

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
  const { user } = useAuth();
  const { gmailConnected, loading: gmailLoading } = useGmailConnection(user?.id);
  const { timeZone, loading: tzLoading, error: tzError, updateTimeZone } = useTimeZone();
  const { signature: savedSignature, loading: signatureLoading, error: signatureError, updateSignature } = useSignature();
  const { theme, error: themeError, updateTheme } = useTheme();
  const [localSignature, setLocalSignature] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Update local signature when saved signature changes
  useEffect(() => {
    setLocalSignature(savedSignature);
  }, [savedSignature]);

  // Apply theme when it changes
  useEffect(() => {
    if (theme) {
      applyTheme(theme);
    }
  }, [theme]);

  const handleSaveSignature = async () => {
    try {
      setSaving(true);
      await updateSignature(localSignature);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch (err) {
      console.error('Error saving signature:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = (newTheme: string) => {
    updateTheme(newTheme);
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
            {themeError && <div className="text-red-500 text-xs mt-2">{themeError}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email Signature</CardTitle>
            <CardDescription>
              This signature will be automatically added to the end of your emails. You can edit or remove it per email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <RichTextEditor
                value={localSignature}
                onChange={setLocalSignature}
                className="min-h-[120px]"
                attachments={[]}
                onAddAttachment={() => {}}
                onRemoveAttachment={() => {}}
              />
            </div>
            <Button onClick={handleSaveSignature} disabled={saving || signatureLoading}>
              {saving ? 'Saving...' : 'Save Signature'}
            </Button>
            {saveSuccess && <span className="text-green-600 ml-4">Saved!</span>}
            {signatureError && <div className="text-red-500 text-xs mt-2">{signatureError}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}