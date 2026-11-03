import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One block of a multi-section form.
 *
 * Every sectioned form on the platform was building its own block out of the
 * same literal — `rounded-lg border border-border bg-card p-4 shadow-sm` — and
 * labelling it, or not, however it saw fit. Five different section treatments
 * had grown up that way. This is the one of them, so a form gets the grouping
 * for free and can't drift.
 *
 * The restraint is the point: a tinted heading and a surface faint enough that
 * you notice the grouping rather than the colour. Fields keep their own
 * background — nothing inside a section is tinted.
 */

export type FormSectionTone = "default" | "warm";

/** Money-handling sections may take the warm tile; everything else is brand. */
const TILE: Record<FormSectionTone, string> = {
  default: "bg-primary/10 text-primary",
  warm: "bg-warm text-warm-foreground",
};

export function FormSection({
  icon: Icon,
  title,
  description,
  tone = "default",
  action,
  className,
  headerClassName,
  tourId,
  bare = false,
  children,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  /** The muted line under the title. Optional — not every section needs one. */
  description?: string;
  tone?: FormSectionTone;
  /** Right-aligned in the header, for a section that owns a control. */
  action?: React.ReactNode;
  /** Goes on the fields wrapper, which is where callers set their columns. */
  className?: string;
  headerClassName?: string;
  /** Rendered as `data-tour`, for a walkthrough to point at — as FilterPills does. */
  tourId?: string;
  /** Header only: no rule beneath it and no padded body, for a collapsed section. */
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    // overflow-hidden so the header band clips to the card's radius.
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-tour={tourId}
    >
      {/* The colour lives here and nowhere else. A wash this faint plus the
          rule beneath it is enough to read the strip as a header; the fields
          below it stay on the card, exactly as they were before sections had
          any treatment at all. */}
      <div
        className={cn(
          "flex items-start gap-2.5 px-4 py-3",
          !bare && "border-b border-border",
          // 2% in light, and no more: `--muted-foreground` clears AA on the
          // card by 4.74:1, so the helper line has only a quarter of a point
          // to give away. At 4% the band spent it and the helper landed on
          // 4.48. Dark starts at 7.35:1 and can afford the stronger wash it
          // needs to be visible at all.
          "bg-primary/[0.02] dark:bg-primary/[0.06]",
          headerClassName,
        )}
      >
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-4",
            TILE[tone],
          )}
          aria-hidden
        >
          <Icon />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          {/* Not `text-primary`: the brand indigo manages 3.9:1 on the dark
              card, which fails AA for a heading this size. */}
          <h2 className="flex items-center gap-1.5 text-sm font-semibold leading-6 text-primary-heading">
            {title}
          </h2>
          {description && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* `space-y-4` unless the caller sets its own layout — the sections these
          replaced spaced their children that way, and a caller passing a grid
          means to own the spacing itself. */}
      {bare ? (
        children
      ) : (
        <div className={cn("p-4", className || "space-y-4")}>{children}</div>
      )}
    </section>
  );
}
