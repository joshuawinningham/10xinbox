import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { themes } from "@/lib/themes";
import { cn } from "@/lib/utils";

interface ThemePickerProps {
  theme: string;
  onThemeChange: (theme: string) => void;
}

export function ThemePicker({ theme, onThemeChange }: ThemePickerProps) {
  return (
    <RadioGroup
      defaultValue={theme}
      onValueChange={onThemeChange}
      className="grid grid-cols-3 gap-4"
    >
      {themes.map((t) => (
        <Label
          key={t.name}
          className={cn(
            "cursor-pointer space-y-2 rounded-lg border p-4 hover:border-primary",
            theme === t.name && "border-primary"
          )}
        >
          <RadioGroupItem value={t.name} className="sr-only" />
          <div className="items-center rounded-md border-2 border-muted p-1">
            <div
              className="h-8 w-full rounded-sm"
              style={{
                backgroundColor: `hsl(${t.colors.light.primary})`,
              }}
            />
          </div>
          <span className="block w-full text-center font-normal">
            {t.label}
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}