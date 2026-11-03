"use client";

import * as React from "react";
import Link from "next/link";
import { useSetAtom } from "jotai";
import { ArrowLeft } from "lucide-react";

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
