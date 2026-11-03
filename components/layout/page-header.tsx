import type { LucideIcon } from "lucide-react";

import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

/**
 * Every screen opens the same way: a brand icon tile, the title, a one-line
 * description, and the screen's primary action on the right.
 */
/** Money out earns the warm accent; brand indigo is the default. */
export const WARM_TILE = "bg-warm text-warm-foreground";

export function PageHeader({
  icon: Icon,
  title,
  titleTip,
  description,
  iconTone = "bg-primary/10 text-primary",
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** Explains what the screen's records are, beside the title. */
  titleTip?: string;
  description?: string;
  /**
   * Overrides the tile's colour. Money-out screens pass `WARM_TILE` — the accent
   * belongs on the icon, never on the figures.
   */
  iconTone?: string;
  /** The screen's actions, right-aligned. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            iconTone,
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {titleTip && <InfoTip text={titleTip} />}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-3">{children}</div>
      )}
    </div>
  );
}

/** Frames the demo toggle consistently beneath a page header. */
export function PreviewToggleRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-card px-3 py-2">
      {children}
    </div>
  );
}

/**
 * The gradient hairline that tops each screen's hero card — the brand device
 * carrying indigo into the warm secondary. The parent needs `overflow-hidden`
 * so it sits flush to the rounded corners.
 */
export function HeroHairline({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-1 w-full bg-gradient-to-r from-chart-in via-chart-in/60 to-chart-out",
        className,
      )}
      aria-hidden
    />
  );
}
