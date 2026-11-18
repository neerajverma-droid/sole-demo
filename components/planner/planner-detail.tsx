"use client";

import * as React from "react";
import Link from "next/link";
import { useSetAtom } from "jotai";
import { ArrowLeft, Trash2 } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SearchX } from "lucide-react";
import { plannerTabAtom } from "@/lib/atoms";
import type { PlannerTab } from "@/lib/planner";

export const PLANNER_ROOT = "/expenses/business-planner";

/** The URL fragment (and element id) of a goal page's allocation section. */
export const GOAL_ALLOCATION_HASH = "allocation";

export type Crumb = {
  label: string;
  /** Omitted on the last crumb — you're already there. */
  href?: string;
};

/**
 * The header for a planner detail page.
 *
 * A detail view gets this instead of the planner's own page header: two headers
 * stacked, one with the title and tabs and one with a back link, said the same
 * thing twice. Here the back control and the breadcrumb carry the position and
 * the view's primary action sits on the right.
 */
export function PlannerDetailHeader({
  backHref,
  backLabel,
  crumbs,
  action,
}: {
  backHref: string;
  /** Announced on the icon button, since the breadcrumb carries the words. */
  backLabel: string;
  crumbs: Crumb[];
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          asChild
          aria-label={`Back to ${backLabel}`}
        >
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>

        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => (
              <React.Fragment key={crumb.label}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="max-w-[24ch] truncate">
                      {crumb.label}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {action}
    </div>
  );
}

/**
 * The action bar at the foot of a planner form — Cancel and the save button on
 * the right, pinned to the bottom of the viewport while the form scrolls.
 *
 * The same bar the invoice and quote editors use, so saving is in the same
 * place on every form: bottom right, not up in the page header. Delete, where
 * the record can be deleted, sits at the far left.
 */
export function PlannerFormFooter({
  onCancel,
  onSave,
  saving,
  saveLabel,
  onDelete,
  saveTourId,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  /** "Save goal" when creating, "Update goal" when editing. */
  saveLabel: string;
  /** Present only for a record that exists. */
  onDelete?: () => void;
  /** Rendered as `data-usertour` on the save button, for a tour to point at. */
  saveTourId?: string;
}) {
  return (
    // A direct child of the page's column, never wrapped: `sticky` only holds
    // within its parent, so a wrapper would pin it to nothing.
    <div className="sticky bottom-0 z-10 -mb-2 flex flex-wrap items-center justify-end gap-2 border-t bg-background py-3">
      {onDelete && (
        <Button
          variant="ghost"
          className="mr-auto text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 />
          Delete
        </Button>
      )}
      <Button variant="outline" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button onClick={onSave} disabled={saving} data-usertour={saveTourId}>
        {saving ? "Saving…" : saveLabel}
      </Button>
    </div>
  );
}

/**
 * Sends you back to the right tab.
 *
 * A detail page is its own route, so the planner's tab state has to be told
 * which section you came from — otherwise leaving a goal lands you on Overview,
 * and a hard refresh of a detail URL would too.
 */
export function usePlannerSection(tab: PlannerTab) {
  const setTab = useSetAtom(plannerTabAtom);
  React.useEffect(() => {
    setTab(tab);
  }, [setTab, tab]);
}

/**
 * When a field's error is allowed to show.
 *
 * Not while typing: an untouched form that scolds on the first keystroke reads
 * as an error the user hasn't had the chance to avoid. A field's message appears
 * once it has been left (`touch`), or for every field once Save has been
 * pressed (`submit`) — whichever comes first.
 */
export function useFieldTouch() {
  const [submitted, setSubmitted] = React.useState(false);
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const touch = React.useCallback((key: string) => {
    setTouched((current) =>
      current.has(key) ? current : new Set(current).add(key),
    );
  }, []);
  const submit = React.useCallback(() => setSubmitted(true), []);
  const reset = React.useCallback(() => {
    setSubmitted(false);
    setTouched(new Set());
  }, []);

  /** The message for `key`, if it's time to show it. */
  const visible = <T extends { key: string; message: string }>(
    issues: T[],
    key: string,
  ) =>
    submitted || touched.has(key)
      ? issues.find((issue) => issue.key === key)?.message
      : undefined;

  return { touch, submit, reset, visible };
}

/** A detail URL that points at nothing — a deleted record, or a typo. */
export function PlannerNotFound({
  what,
  backHref,
  backLabel,
}: {
  what: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <Empty>
      <EmptyMedia>
        <SearchX aria-hidden />
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>That {what} doesn&apos;t exist</EmptyTitle>
        <EmptyDescription>
          It may have been deleted. Everything else is where you left it.
        </EmptyDescription>
      </div>
      <EmptyActions>
        <Button size="sm" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </EmptyActions>
    </Empty>
  );
}
