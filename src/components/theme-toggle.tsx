"use client";

import { DropdownMenu } from "radix-ui";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { setThemePreference, useTheme, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/cn";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Light / Dark / System switch. The choice is remembered on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, theme } = useTheme();
  const Icon = theme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn("grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink", className)}
        aria-label={`Theme: ${OPTIONS.find((o) => o.value === preference)?.label}`}
        title="Light or dark mode"
        data-testid="theme-toggle"
      >
        <Icon className="size-5" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-[var(--radius-md)] border border-line bg-surface p-1 text-sm text-ink shadow-float data-[state=open]:animate-fade-in"
        >
          <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium text-ink-muted">Appearance</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={preference} onValueChange={(v) => setThemePreference(v as ThemePreference)}>
            {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 outline-none data-[highlighted]:bg-surface-muted"
              >
                <ItemIcon className="size-4 text-ink-muted" aria-hidden />
                <span className="flex-1">{label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check className="size-4" aria-hidden />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
