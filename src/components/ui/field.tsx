import * as React from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink placeholder:text-ink-subtle transition-colors focus-visible:border-ginger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginger/30 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5", className)} {...props} />;
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, "h-11 appearance-auto pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-ink", className)} {...props} />;
}

/**
 * Label + control + hint/error, wired for screen readers.
 * The control is rendered by the child render-prop with the ids it needs.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = React.useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1 font-normal text-ink-subtle">(optional)</span>}
      </Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
