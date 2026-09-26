import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-muted border-line",
  info: "bg-info-soft text-info border-info/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning-ink border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/20",
  accent: "bg-accent-soft text-accent-ink border-accent/30",
};

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}

const alertIcon = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof alertIcon;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = alertIcon[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-[var(--radius-md)] border p-3 text-sm", toneClass[tone], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-ink/80")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-md)] border border-line bg-surface", className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-[var(--radius-sm)] bg-surface-sunken", className)} {...props} />;
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-surface-muted text-ink-muted">
        <Icon className="size-5" />
      </div>
      <p className="font-semibold">{title}</p>
      {children && <p className="max-w-sm text-sm text-ink-muted">{children}</p>}
      {action}
    </div>
  );
}

export type { Tone };
