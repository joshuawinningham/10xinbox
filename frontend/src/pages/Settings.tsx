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
import PageHeading from '@/components/PageHeading';
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

export default function SettingsPage() {
  return (
    <>
      <PageHeading>Settings</PageHeading>
      
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Time Zone</CardTitle>
            <CardDescription>
              Choose your preferred time zone for displaying data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select defaultValue="UTC">
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
          </CardContent>
        </Card>

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
            <Button className="w-[280px]">
              Connect Gmail
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}