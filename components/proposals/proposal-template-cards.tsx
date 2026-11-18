"use client";

import * as React from "react";
import { FileText, Loader2 } from "lucide-react";

import type { ProposalTemplate } from "@/lib/proposals";
import { Shimmer } from "@/components/ui/shimmer";
import { cn } from "@/lib/utils";

/** The template cards shared by the New proposal picker and the templates page. */

export function TemplateSection({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count?: number;
  tone: "primary" | "success";
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn("size-1.5 rounded-full", tone === "primary" ? "bg-primary" : "bg-success")} />
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular">
            {count}
          </span>
        )}
      </h3>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

/**
 * A template in the New proposal picker, as sole-pm's cards work: click to
 * preview; on hover (or keyboard focus) the service count gives way to
 * Preview and Create proposal, in the same spot so the card never resizes.
 */
export function TemplateCard({
  template,
  applying,
  disabled,
  onSelect,
  onPreview,
}: {
  template: ProposalTemplate;
  applying: boolean;
  disabled: boolean;
  /** Create the proposal from this template. */
  onSelect: () => void;
  onPreview: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Preview ${template.name}`}
      aria-busy={applying || undefined}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onPreview()}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview();
        }
      }}
      className={cn(
        "group flex min-h-[76px] cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        applying ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
        disabled && !applying && "cursor-not-allowed",
      )}
    >
      <span className="line-clamp-2 text-[13px] font-medium leading-snug" title={template.name}>
        {template.name}
      </span>

      <div className="mt-auto grid">
        <span
          style={{ gridArea: "1 / 1" }}
          className={cn(
            "flex items-center gap-1.5 text-[11px] text-muted-foreground transition-opacity",
            !applying &&
              "group-hover:pointer-events-none group-hover:opacity-0 group-focus-within:pointer-events-none group-focus-within:opacity-0",
          )}
        >
          {applying ? (
            <>
              <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
              <span className="font-medium text-primary">Creating proposal…</span>
            </>
          ) : (
            <>
              <FileText className="size-3.5" aria-hidden />
              {template.serviceCount} {template.serviceCount === 1 ? "service" : "services"}
            </>
          )}
        </span>

        {!applying && (
          <span
            style={{ gridArea: "1 / 1" }}
            className="pointer-events-none flex items-center gap-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          >
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onPreview();
              }}
              className="h-6 rounded-full bg-primary px-3 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Preview
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
              }}
              className="h-6 rounded-full border border-primary bg-card px-3 text-[10px] font-bold uppercase tracking-wide text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              Create proposal
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A template card while the list loads — the card's own shape (icon, name,
 * description, footer), so the grid doesn't jump when the real ones land.
 * `edge` matches the templates page's coloured left edge.
 */
export function TemplateCardSkeleton({ edge = false, compact = false }: { edge?: boolean; compact?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm",
        edge && "border-l-[3px] border-l-muted",
        compact ? "min-h-[76px]" : "min-h-[104px]",
      )}
    >
      <div className="flex items-center gap-2">
        {!compact && <Shimmer className="size-6 shrink-0 rounded-md" />}
        <Shimmer className="h-3.5 w-3/4" />
      </div>
      {!compact && (
        <>
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-3 w-2/3" />
        </>
      )}
      <div className="mt-auto flex gap-1.5">
        <Shimmer className="h-4 w-16 rounded" />
        {!compact && <Shimmer className="h-4 w-24 rounded" />}
      </div>
    </div>
  );
}

/** A loading grid of skeleton cards, announced once for screen readers. */
export function TemplateGridSkeleton({
  count,
  edge,
  compact,
  className,
}: {
  count: number;
  edge?: boolean;
  compact?: boolean;
  className: string;
}) {
  return (
    <div className={className} role="status" aria-label="Loading templates">
      {Array.from({ length: count }).map((_, index) => (
        <TemplateCardSkeleton key={index} edge={edge} compact={compact} />
      ))}
    </div>
  );
}
