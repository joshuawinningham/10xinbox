import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useWorkingHours, WorkingHours } from '@/hooks/useWorkingHours';

const dayLabels = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

// Helper function to format time in 12-hour format
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Helper function to calculate buffer cutoff time
function calculateCutoffTime(endTime: string, bufferMinutes: number): string {
  const [hours, minutes] = endTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes - bufferMinutes;
  const cutoffHours = Math.floor(totalMinutes / 60);
  const cutoffMinutes = totalMinutes % 60;
  return `${cutoffHours.toString().padStart(2, '0')}:${cutoffMinutes.toString().padStart(2, '0')}`;
}

export function WorkingHoursSettings() {
  const { workingHours, loading, error, updateWorkingHours } = useWorkingHours();
  const [localWorkingHours, setLocalWorkingHours] = useState<WorkingHours>(workingHours);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Update local state when working hours change
  useEffect(() => {
    setLocalWorkingHours(workingHours);
  }, [workingHours]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateWorkingHours(localWorkingHours);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch (err) {
      console.error('Error saving working hours:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDayToggle = (day: number) => {
    const newDays = localWorkingHours.days.includes(day)
      ? localWorkingHours.days.filter(d => d !== day)
      : [...localWorkingHours.days, day].sort();
    
    setLocalWorkingHours(prev => ({
      ...prev,
      days: newDays
    }));
  };

  const hasChanges = () => {
    return (
      localWorkingHours.start !== workingHours.start ||
      localWorkingHours.end !== workingHours.end ||
      localWorkingHours.bufferMinutes !== workingHours.bufferMinutes ||
      JSON.stringify(localWorkingHours.days.sort()) !== JSON.stringify(workingHours.days.sort())
    );
  };

  // Calculate the cutoff time for the help text
  const cutoffTime = calculateCutoffTime(localWorkingHours.end, localWorkingHours.bufferMinutes);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Working Hours</CardTitle>
        <CardDescription>
          Set your working hours for Inbox Zero tracking. Only business days within these hours will be counted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Time Range */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Working Hours</Label>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="start-time">Start:</Label>
              <input
                id="start-time"
                type="time"
                value={localWorkingHours.start}
                onChange={(e) => setLocalWorkingHours(prev => ({ ...prev, start: e.target.value }))}
                className="px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading || saving}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="end-time">End:</Label>
              <input
                id="end-time"
                type="time"
                value={localWorkingHours.end}
                onChange={(e) => setLocalWorkingHours(prev => ({ ...prev, end: e.target.value }))}
                className="px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading || saving}
              />
            </div>
          </div>
        </div>

        {/* Buffer Setting */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Inbox Zero Buffer</Label>
          <div className="flex items-center gap-2">
            <Label htmlFor="buffer-minutes">Buffer time (minutes):</Label>
            <Input
              id="buffer-minutes"
              type="number"
              min="0"
              max="120"
              value={localWorkingHours.bufferMinutes}
              onChange={(e) => setLocalWorkingHours(prev => ({ 
                ...prev, 
                bufferMinutes: Math.max(0, Math.min(120, parseInt(e.target.value) || 0))
              }))}
              className="w-20"
              disabled={loading || saving}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Emails received after {formatTime(cutoffTime)} won't count toward Inbox Zero. You have until {formatTime(localWorkingHours.end)} to clear your inbox.
          </p>
        </div>

        {/* Working Days */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Working Days</Label>
          <div className="grid grid-cols-2 gap-3">
            {dayLabels.map((day) => (
              <div key={day.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`day-${day.value}`}
                  checked={localWorkingHours.days.includes(day.value)}
                  onCheckedChange={() => handleDayToggle(day.value)}
                  disabled={loading || saving}
                />
                <Label
                  htmlFor={`day-${day.value}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {day.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <Button 
            onClick={handleSave} 
            disabled={loading || saving || !hasChanges()}
            className="min-w-[80px]"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
          {saveSuccess && <span className="text-green-600">Saved!</span>}
        </div>

        {error && <div className="text-red-500 text-sm">{error}</div>}
      </CardContent>
    </Card>
  );
} 