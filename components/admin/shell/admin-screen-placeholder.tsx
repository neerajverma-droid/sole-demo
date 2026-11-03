"use client";

import { Construction } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageHeader } from "@/components/layout/page-header";
import { findAdminNavItem } from "@/lib/admin/nav";

/**
 * Route stub for an admin screen that hasn't been built yet.
 *
 * Takes the nav id rather than an icon and title, because a page is a server
 * component and can't hand a component function across to this one — and so
 * the stub's heading can't drift from the sidebar row that opened it.
 */
export function AdminScreenPlaceholder({
  navId,
  title,
  description,
}: {
  navId: string;
  /** Overrides the nav label, e.g. for a detail page under a list row. */
  title?: string;
  description?: string;
}) {
  const item = findAdminNavItem(navId);
  if (!item) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={item.icon}
        title={title ?? item.label}
        description={description ?? item.description}
      />
      <Empty>
        <EmptyMedia>
          <Construction />
        </EmptyMedia>
        <EmptyTitle>Not built yet</EmptyTitle>
        <EmptyDescription>
          This screen comes next. The route, guard and navigation are in place.
        </EmptyDescription>
      </Empty>
    </div>
  );
}
