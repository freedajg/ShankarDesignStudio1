"use client";

import { Minus, Plus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

/** Segmented control (radio group semantics). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; hint?: string }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-[var(--radius-md)] bg-surface-sunken p-1", className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={o.hint}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-colors",
              size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
              active ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** − [n] + quantity control with a real number input. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 20000,
  label,
  disabled,
  size = "md",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [draft, setDraft] = React.useState(String(value));
  // follow external changes to `value` (adjusting state during render, per React guidance)
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(String(value));
  }
  const commit = (raw: string) => {
    const n = Math.floor(Number(raw));
    const clamped = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    onChange(clamped);
    setDraft(String(clamped));
  };
  const btn = cn(
    "grid shrink-0 place-items-center text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-40",
    size === "sm" ? "size-8" : "size-10",
  );
  return (
    <div className={cn("inline-flex items-center rounded-[var(--radius-sm)] border border-line-strong bg-surface", disabled && "opacity-50")}>
      <button type="button" className={btn} aria-label={`Decrease ${label}`} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value !== "") commit(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value || String(min))}
        onFocus={(e) => e.target.select()}
        className={cn(
          "w-12 border-x border-line bg-transparent text-center font-medium tabular-nums outline-none [appearance:textfield] focus-visible:bg-ginger-soft [&::-webkit-inner-spin-button]:appearance-none",
          size === "sm" ? "h-8 text-sm" : "h-10",
        )}
      />
      <button type="button" className={btn} aria-label={`Increase ${label}`} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Colour swatch radio. */
export function Swatch({
  hex,
  name,
  selected,
  onSelect,
  size = 36,
}: {
  hex: string;
  name: string;
  selected: boolean;
  onSelect: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      title={name}
      onClick={onSelect}
      className={cn(
        "shrink-0 rounded-full border border-black/15 transition-shadow",
        selected ? "ring-2 ring-ginger ring-offset-2 ring-offset-surface" : "hover:ring-2 hover:ring-line-strong hover:ring-offset-1",
      )}
      style={{ backgroundColor: hex, width: size, height: size }}
    />
  );
}
