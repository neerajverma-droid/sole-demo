"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import { Shimmer } from "@/components/ui/shimmer";
import {
  SkeletonActionCell,
  SkeletonBadgeCell,
  SkeletonIdentityCell,
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Highlight } from "@/components/contacts/highlight";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import {
  DeleteProjectDialog,
  PROJECTS_ROOT,
  ProjectAvatar,
  ProjectStatusBadge,
  projectHref,
  useProjectMoney,
  type ProjectTarget,
} from "@/components/projects/project-shared";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useProjectsQuery } from "@/hooks/use-projects-query";
import type { PageInfo } from "@/lib/products";
import {
  DEFAULT_PROJECT_PAGE_SIZE,
  PROJECT_PAGE_SIZES,
  PROJECT_STATUS_TABS,
  formatProjectDate,
  projectProgress,
  type ProjectListItem,
  type ProjectStatusFilter,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

function toStatusFilter(value: string | null): ProjectStatusFilter {
  return value === "draft" || value === "inprogress" || value === "closed" ? value : "all";
}

/**
 * Projects: every project with its client, budget, dates and jobs — the
 * design's list over sole-webapp's ProjectList. The tab, search and page sit
 * in the URL (`?status=`, `?search_query=`, `?page=`, `?page_size=`) as they
 * did there, so a link to a filtered view still works.
 */
export function ProjectsScreen() {
  const router = useRouter();
  // Both are only null under the legacy pages router, which never renders this.
  const pathname = usePathname() ?? PROJECTS_ROOT;
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(
    () => rawSearchParams ?? new URLSearchParams(),
    [rawSearchParams],
  );

  const status = toStatusFilter(searchParams.get("status"));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Number(searchParams.get("page_size")) || DEFAULT_PROJECT_PAGE_SIZE;
  const [search, setSearch] = React.useState(() => searchParams.get("search_query") ?? "");
  const debouncedSearch = useDebouncedValue(search);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectTarget | null>(null);

  const setParams = React.useCallback(
    (changes: Record<string, string | number | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(changes).forEach(([key, value]) => {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, String(value));
      });
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // The search lands in the URL once typing settles, and always resets the page.
  React.useEffect(() => {
    if ((searchParams.get("search_query") ?? "") === debouncedSearch.trim()) return;
    setParams({ search_query: debouncedSearch.trim() || null, page: null });
  }, [debouncedSearch, searchParams, setParams]);

  const listQuery = useProjectsQuery({ status, search: debouncedSearch }, page, pageSize);
  const rows = listQuery.data?.projects ?? [];
  const total = listQuery.data?.total ?? 0;
  const counts = listQuery.data?.counts;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  const settling = search !== debouncedSearch || listQuery.isPlaceholderData;
  // A new tab, page or search shows the skeleton rather than the last view's
  // rows faded — the counts in the tabs stay up while it loads.
  const showSkeleton = listQuery.isLoading || listQuery.isPlaceholderData;
  // Nothing at all yet: the header and one empty card, no search or tabs. The
  // counts cover every status but follow the search, so a search with no hits
  // (or a search's leftovers still standing in while it clears) never counts.
  const noProjects =
    !listQuery.isLoading &&
    !listQuery.isError &&
    !listQuery.isPlaceholderData &&
    !search.trim() &&
    !debouncedSearch.trim() &&
    total === 0 &&
    (counts?.all ?? 0) === 0;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Briefcase}
        title="Projects"
        description="Track project budgets, jobs and milestones across your clients."
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          New project
        </Button>
      </PageHeader>

      {noProjects ? (
        <Empty>
          <EmptyMedia>
            <Briefcase aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Get started by creating your first project to organize and track your work.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              Create your first project
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="p-[15px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search project"
                aria-label="Search projects"
                className="pl-9"
              />
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Project status"
            className="flex gap-1 overflow-x-auto border-b border-border px-4"
          >
            {PROJECT_STATUS_TABS.map((tab) => {
              const active = status === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParams({ status: tab.value, page: null })}
                  className={cn(
                    "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-2 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  {counts ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[11px] font-semibold tabular",
                        active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {counts[tab.value]}
                    </span>
                  ) : (
                    // First load: a pill-shaped shimmer where the count will land.
                    <Shimmer className="h-[18px] w-5 rounded-full" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>

          {showSkeleton ? (
            <Table>
              <ProjectsTableHeader />
              <TableBody>
                <SkeletonRows
                  render={() => (
                    <>
                      <SkeletonIdentityCell nameWidth="w-32" subtextWidth="w-16" />
                      <SkeletonTextCell width="w-32" className={CENTRED_SKELETON} />
                      <SkeletonBadgeCell width="w-20" className={CENTRED_SKELETON} />
                      <SkeletonTextCell width="w-28" className={CENTRED_SKELETON} />
                      <SkeletonTextCell width="w-12" className={CENTRED_SKELETON} />
                      <SkeletonTextCell width="w-20" className={CENTRED_SKELETON} />
                      <SkeletonTextCell width="w-20" className={CENTRED_SKELETON} />
                      <SkeletonBadgeCell width="w-20" className={CENTRED_SKELETON} />
                      <SkeletonTextCell width="w-24" className={CENTRED_SKELETON} />
                      <SkeletonActionCell className={STICKY_ACTIONS} />
                    </>
                  )}
                />
              </TableBody>
            </Table>
          ) : listQuery.isError && rows.length === 0 ? (
            <Empty className="border-0 shadow-none">
              <EmptyMedia>
                <TriangleAlert aria-hidden />
              </EmptyMedia>
              <div className="space-y-1">
                <EmptyTitle>Couldn&apos;t load projects</EmptyTitle>
                <EmptyDescription>Something went wrong reaching the server. Try again.</EmptyDescription>
              </div>
              <EmptyActions>
                <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
                  Try again
                </Button>
              </EmptyActions>
            </Empty>
          ) : total === 0 && !settling ? (
            <Empty className="border-0 shadow-none">
              <EmptyMedia>
                <SearchX aria-hidden />
              </EmptyMedia>
              <div className="space-y-1">
                <EmptyTitle>No projects match this view</EmptyTitle>
                <EmptyDescription>
                  Try adjusting your search terms, or switch the status tab.
                </EmptyDescription>
              </div>
              <EmptyActions>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setParams({ search_query: null, status: null, page: null });
                  }}
                >
                  Clear filters
                </Button>
              </EmptyActions>
            </Empty>
          ) : (
            <>
              <Table>
                <ProjectsTableHeader />
                <TableBody className={cn(settling && "opacity-60 transition-opacity")}>
                  {rows.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      query={debouncedSearch}
                      onOpen={() => router.push(projectHref(project.id))}
                      onEdit={() => setEditId(project.id)}
                      onDelete={() => setDeleteTarget({ id: project.id, name: project.name })}
                    />
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </section>
      )}

      {total > 0 && !listQuery.isLoading && (
        <NumberedPagination
          page={pageInfo}
          pageSize={pageSize}
          pageSizes={PROJECT_PAGE_SIZES}
          onPageChange={(next) => setParams({ page: next === 1 ? null : next })}
          onPageSizeChange={(next) => setParams({ page_size: next, page: null })}
          itemLabel="project"
          navLabel="Projects pages"
          disabled={settling}
        />
      )}

      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => setParams({ status: null, page: null })}
      />
      <ProjectFormDialog
        open={editId !== null}
        projectId={editId ?? undefined}
        onOpenChange={(open) => !open && setEditId(null)}
      />
      <DeleteProjectDialog
        project={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}

/** Centred like the Expenses table — every column but the name and the menu. */
function ProjectsTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Projects</TableHead>
        <TableHead className="text-center">Client</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")}>Status</TableHead>
        <TableHead className="min-w-[180px] text-center">Budget</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")}>WIP</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")}>Start date</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")}>End date</TableHead>
        <TableHead className="text-center">Job/Milestone</TableHead>
        <TableHead className="text-center">Description</TableHead>
        <TableHead className={cn(HUG_COLUMN, STICKY_ACTIONS, STICKY_HEAD_TINT, "text-right")}>
          Actions
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

/**
 * The Actions column stays pinned to the right edge while the table scrolls
 * sideways, as the old list had it. Its fill has to be opaque — the header
 * wash and the row hover are both translucent tints, which would let the
 * scrolled cells show through — so it's the card colour with the same tint
 * layered on top as a gradient, divided off by a rule along its left edge.
 */
const STICKY_ACTIONS =
  "sticky right-0 z-10 bg-card " +
  // The Transactions table's frozen-pane edge, mirrored for a right-hand
  // column: a 1px rule (an inset shadow — a border would scroll away with the
  // collapsed grid) plus a short shadow falling left over the passing columns.
  "shadow-[inset_1px_0_0_hsl(var(--border)),-6px_0_8px_-6px_rgba(0,0,0,0.12)] " +
  "dark:shadow-[inset_1px_0_0_hsl(var(--border)),-6px_0_8px_-6px_rgba(0,0,0,0.55)]";
const STICKY_HEAD_TINT =
  "[background-image:linear-gradient(hsl(var(--primary)/0.06),hsl(var(--primary)/0.06))] " +
  "dark:[background-image:linear-gradient(hsl(var(--primary)/0.10),hsl(var(--primary)/0.10))]";
const STICKY_ROW_HOVER =
  "group-hover:[background-image:linear-gradient(hsl(var(--primary)/0.05),hsl(var(--primary)/0.05))]";

/** The shared skeleton cells left-align; these columns sit centred. */
const CENTRED_SKELETON = "[&>*]:mx-auto [&>div]:justify-center";

function ProjectRow({
  project,
  query,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: ProjectListItem;
  query: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const money = useProjectMoney();
  const href = projectHref(project.id);
  const progress = projectProgress(project.budget, project.usedBudget);
  const [firstJob] = project.jobNames;

  return (
    <TableRow
      className="group cursor-pointer"
      onClick={(event) => {
        // Menus, links and buttons in the row handle their own clicks.
        if ((event.target as HTMLElement).closest("a,button,[role=menu]")) return;
        onOpen();
      }}
    >
      <TableCell className="max-w-[240px]">
        <div className="flex items-center gap-3">
          <ProjectAvatar id={project.id} name={project.name} className="size-8 text-xs" />
          <div className="min-w-0">
            <Link
              href={href}
              className="block truncate font-medium outline-none hover:text-primary hover:underline focus-visible:underline"
            >
              <Highlight text={project.name} query={query} />
            </Link>
            <div className="truncate text-xs text-muted-foreground tabular">
              <Highlight text={project.code} query={query} />
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[240px] text-center">
        <div className="truncate">{project.clientName || "—"}</div>
        <div className="truncate text-xs text-muted-foreground">{project.clientEmail || "—"}</div>
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        <ProjectStatusBadge status={project.status} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-3">
          <div
            className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Budget used"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <span className="whitespace-nowrap tabular">{money(project.budget)}</span>
        </div>
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center tabular")}>{money(project.usedBudget)}</TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center text-muted-foreground tabular")}>
        {formatProjectDate(project.startDate)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center text-muted-foreground tabular")}>
        {formatProjectDate(project.endDate)}
      </TableCell>
      <TableCell className="text-center">
        {firstJob ? (
          <div className="flex items-center justify-center gap-1.5">
            <span className="max-w-[120px] truncate rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium">
              {firstJob}
            </span>
            {project.jobsCount > 1 && (
              <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground tabular">
                +{project.jobsCount - 1}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-[180px] text-center">
        {project.description ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate text-muted-foreground">{project.description}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{project.description}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, STICKY_ACTIONS, STICKY_ROW_HOVER)}>
        {/* As the old row had it: Edit and Delete in the menu, and its own
            arrow beside it to open the project. */}
        <div className="flex items-center justify-end gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Actions for ${project.name}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <MenuAction icon={<Pencil />} label="Edit project" onSelect={onEdit} />
              <MenuAction icon={<Trash2 />} label="Delete project" onSelect={onDelete} destructive />
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary hover:bg-primary/10 hover:text-primary"
                asChild
              >
                <Link href={href} aria-label={`View ${project.name}`}>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View details</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}
