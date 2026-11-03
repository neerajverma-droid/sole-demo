"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChartLine,
  FileText,
  ListChecks,
  Pencil,
  Receipt,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import {
  PROJECTS_ROOT,
  ProjectAvatar,
  ProjectStatusBadge,
  useProjectMoney,
} from "@/components/projects/project-shared";
import { ProjectExpensesTab } from "@/components/projects/detail/expenses-tab";
import { ProjectInvoicesTab } from "@/components/projects/detail/invoices-tab";
import { ProjectJobsTab } from "@/components/projects/detail/jobs-tab";
import { ProjectOverviewTab } from "@/components/projects/detail/overview-tab";
import { useProjectQuery } from "@/hooks/use-projects-query";
import { projectProgress } from "@/lib/projects";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "overview", label: "Overview", icon: ChartLine },
  { value: "jobs", label: "Job / Milestone", icon: ListChecks },
  { value: "invoices", label: "Invoices", icon: FileText },
  { value: "expenses", label: "Expenses", icon: Receipt },
] as const;

type TabValue = (typeof TABS)[number]["value"];

/**
 * One project — sole-webapp's ProjectDetail in the design's layout: the
 * project's name, code, client and status over a tab bar, with the budget
 * used against the budget beside them as the old header had it.
 */
export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const money = useProjectMoney();
  const projectQuery = useProjectQuery(projectId);
  const project = projectQuery.data;

  // The tab lives in the URL (`?tab=invoices`), so a refresh or a shared
  // link reopens the same tab rather than falling back to Overview.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const tab: TabValue = TABS.some((entry) => entry.value === tabParam)
    ? (tabParam as TabValue)
    : "overview";
  const setTab = (next: TabValue) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : (pathname ?? ""), { scroll: false });
  };
  const [editOpen, setEditOpen] = React.useState(false);

  const back = (
    <Button
      variant="ghost"
      size="sm"
      className="-my-1 -ml-2 h-7 gap-1.5 px-2 text-[13px] [&_svg]:size-3.5"
      asChild
    >
      <Link href={PROJECTS_ROOT}>
        <ArrowLeft />
        Projects
      </Link>
    </Button>
  );

  if (projectQuery.isLoading) {
    return (
      <div className="space-y-[15px]">
        {back}
        <div className="flex items-center gap-3">
          <Shimmer className="size-12 rounded-md" />
          <div className="space-y-2">
            <Shimmer className="h-7 w-56 rounded-md" />
            <Shimmer className="h-4 w-36 rounded-md" />
          </div>
        </div>
        <Shimmer className="h-10 w-full max-w-xl rounded-md" />
        <Shimmer className="h-72 w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="space-y-[15px]">
        {back}
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Couldn&apos;t load this project</EmptyTitle>
            <EmptyDescription>
              It may have been deleted, or the server couldn&apos;t be reached.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" onClick={() => projectQuery.refetch()}>
              Try again
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  const progress = projectProgress(project.budget, project.usedBudget);

  return (
    <div className="space-y-[15px]">
      {back}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectAvatar id={project.id} name={project.name} className="size-12 text-base" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              <span className="tabular">{project.code}</span>
              {project.clientName && ` · ${project.clientName}`}
              {project.clientEmail && (
                <span className="hidden sm:inline"> · {project.clientEmail}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Budget used"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground tabular">
              {money(project.usedBudget)} / {money(project.budget)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil />
            Edit
          </Button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Project sections"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map(({ value, label, icon: Icon }) => {
          const active = tab === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(value)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === "overview" && <ProjectOverviewTab project={project} />}
        {tab === "jobs" && <ProjectJobsTab project={project} />}
        {tab === "invoices" && <ProjectInvoicesTab project={project} />}
        {tab === "expenses" && <ProjectExpensesTab project={project} />}
      </div>

      <ProjectFormDialog open={editOpen} projectId={project.id} onOpenChange={setEditOpen} />
    </div>
  );
}
