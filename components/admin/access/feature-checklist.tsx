"use client";

import { BarChart3, Check, Loader2, Radar, type LucideIcon } from "lucide-react";

import { COMMAND_CENTRE_DASHBOARDS } from "@/lib/admin/access";
import { ADMIN_FEATURE_GROUPS, type AdminFeature } from "@/lib/admin/admin-users";
import { findAdminNavItem } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

/**
 * The icon a section has in the sidebar, so a tile here and the row it unlocks
 * look like the same thing. Mixpanel has no row of its own — it's a tab — so
 * it gets the chart icon.
 */
function featureIcon(key: string): LucideIcon {
  const dashboard = COMMAND_CENTRE_DASHBOARDS.find((entry) => entry.featureKey === key);
  const navId = dashboard ? `cc-${dashboard.slug}` : key;
  return findAdminNavItem(navId)?.icon ?? (key === "mixpanel" ? BarChart3 : Radar);
}

/**
 * Every grantable section as a selectable tile, one group under the other.
 *
 * Shared by the create dialog, where it edits a local list, and each admin's
 * row, where every tick is a request. It only reports what was asked for —
 * `onChange(keys, checked)` — and the caller decides whether that's a state
 * update or a call to the server. `pending` marks the keys a request is still
 * out for, so a tile can't be double-clicked into two requests.
 *
 * Each group gets "Select all" / "Clear", sent as one batch: the backend takes
 * a list, and granting twelve dashboards shouldn't be twelve round trips.
 */
export function FeatureChecklist({
  idPrefix,
  value,
  onChange,
  pending = [],
  disabled = false,
  columns = 3,
}: {
  /** Keeps ids unique when several lists are on screen at once. */
  idPrefix: string;
  value: string[];
  onChange: (keys: string[], checked: boolean) => void;
  pending?: string[];
  disabled?: boolean;
  /**
   * Tiles per row at full width. A dialog is narrower than the page, so it
   * asks for two — three would truncate every description in it.
   */
  columns?: 2 | 3;
}) {
  return (
    <div className="space-y-6">
      {ADMIN_FEATURE_GROUPS.map((group) => {
        const keys = group.features.map((feature) => feature.key);
        const granted = keys.filter((key) => value.includes(key));
        const busy = keys.some((key) => pending.includes(key));
        const allOn = granted.length === keys.length;
        const headingId = `${idPrefix}-${group.id}-heading`;

        return (
          <section key={group.id} aria-labelledby={headingId} className="space-y-3">
            <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
              <div className="min-w-0">
                <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
                  {group.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[11px] font-medium tabular",
                      granted.length > 0
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {granted.length}/{keys.length}
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() =>
                  allOn
                    ? onChange(granted, false)
                    : onChange(
                        keys.filter((key) => !value.includes(key)),
                        true,
                      )
                }
                className="shrink-0 rounded-sm text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                {allOn ? "Clear all" : "Select all"}
              </button>
            </div>

            <ul className={cn("grid gap-2 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3")}>
              {group.features.map((feature) => (
                <li key={feature.key} className="min-w-0">
                  <FeatureTile
                    feature={feature}
                    checked={value.includes(feature.key)}
                    pending={pending.includes(feature.key)}
                    disabled={disabled}
                    onToggle={(next) => onChange([feature.key], next)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * One section: icon, name and a line on what it opens, with the check in the
 * corner. The whole tile is the control — a `role="checkbox"` button rather
 * than a label around a small box, so the target is the size of the tile.
 */
function FeatureTile({
  feature,
  checked,
  pending,
  disabled,
  onToggle,
}: {
  feature: AdminFeature;
  checked: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const Icon = featureIcon(feature.key);
  const inert = disabled || pending;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-busy={pending || undefined}
      disabled={inert}
      onClick={() => onToggle(!checked)}
      className={cn(
        "group flex h-full w-full items-center gap-3 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        checked
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-card hover:border-primary/30 hover:bg-muted/40",
        inert && "cursor-default",
        disabled && "opacity-60",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md transition-colors",
          checked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{feature.label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {feature.description}
        </span>
      </span>

      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-transparent group-hover:border-primary/40",
        )}
        aria-hidden
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </span>
    </button>
  );
}
