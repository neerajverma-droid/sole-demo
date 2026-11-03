"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Copy,
  Download,
  Eye,
  FileText,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuAction } from "@/components/ui/menu-action";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterPills } from "@/components/ui/filter-pills";
import { TablePagination } from "@/components/ui/table-pagination";
import { apiErrorMessage } from "@/lib/api-error";
import { PAGE_SIZES } from "@/lib/products";
import {
  formatRangeLabel,
  PACK_ROUTES,
  type PackStatus,
} from "@/lib/report-packs";
import {
  SkeletonActionCell,
  SkeletonBadgeCell,
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import {
  useDeletePack,
  useDeleteTemplate,
  useOpenPackDownload,
  useDuplicatePack,
  useDuplicateTemplate,
  usePackTemplates,
  useReportPacks,
} from "@/hooks/use-report-packs";
import { PackStatusBadge } from "./pack-status-badge";
import { NewPackDialog } from "./new-pack-dialog";

function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Empty>
      <EmptyMedia>
        <RefreshCw />
      </EmptyMedia>
      <EmptyTitle>Could not load your {what}</EmptyTitle>
      <EmptyDescription>
        The server did not answer. Check your connection, then try again.
      </EmptyDescription>
      <EmptyActions>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      </EmptyActions>
    </Empty>
  );
}

function ConfirmDelete({
  open,
  title,
  description,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const STATUS_FILTERS = ["All", "Draft", "Approved", "Published"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_FOR_FILTER: Record<StatusFilter, PackStatus | undefined> = {
  All: undefined,
  Draft: "draft",
  Approved: "approved",
  Published: "published",
};

function PacksTab() {
  const [filter, setFilter] = React.useState<StatusFilter>("All");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(25);
  const packs = useReportPacks({
    status: STATUS_FOR_FILTER[filter],
    page,
    limit: pageSize,
  });
  const duplicate = useDuplicatePack();
  const remove = useDeletePack();
  const download = useOpenPackDownload();
  const [pendingDelete, setPendingDelete] = React.useState<{
    id: number;
    name: string;
  } | null>(null);

  if (packs.isLoading) {
    return (
      <Table>
        <TableBody>
          <SkeletonRows
            count={5}
            render={() => (
              <>
                <SkeletonTextCell />
                <SkeletonTextCell />
                <SkeletonTextCell />
                <SkeletonBadgeCell />
                <SkeletonActionCell />
              </>
            )}
          />
        </TableBody>
      </Table>
    );
  }

  if (packs.isError) {
    return <LoadError what="report packs" onRetry={() => packs.refetch()} />;
  }

  const rows = packs.data?.packs ?? [];
  const pagination = packs.data?.pagination;

  if (rows.length === 0 && filter === "All" && page === 1) {
    return (
      <Empty>
        <EmptyMedia>
          <FileText />
        </EmptyMedia>
        <EmptyTitle>No report packs yet</EmptyTitle>
        <EmptyDescription>
          A pack bundles several reports into one PDF with a cover, a contents
          page and your commentary.
        </EmptyDescription>
        <EmptyActions>
          <Button asChild>
            <Link href={PACK_ROUTES.newPack}>
              <Plus />
              New report pack
            </Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <FilterPills
        options={STATUS_FILTERS}
        value={filter}
        onChange={(next) => {
          setFilter(next);
          setPage(1);
        }}
        label="Filter report packs by status"
      />

      {rows.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No {filter.toLowerCase()} packs</EmptyTitle>
          <EmptyDescription>
            Nothing matches this filter right now.
          </EmptyDescription>
          <EmptyActions>
            <Button
              variant="outline"
              onClick={() => {
                setFilter("All");
                setPage(1);
              }}
            >
              Show all packs
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Reports</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((pack) => (
                <TableRow key={pack.id}>
                  <TableCell>
                    <Link
                      href={PACK_ROUTES.pack(pack.id)}
                      className="font-medium hover:underline"
                    >
                      {pack.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRangeLabel(pack.period_from, pack.period_to)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {pack.report_count ?? 0}
                  </TableCell>
                  <TableCell>
                    <PackStatusBadge
                      status={pack.status}
                      generationStatus={pack.generation_status}
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${pack.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <MenuAction
                          icon={<Eye />}
                          label="Open"
                          href={PACK_ROUTES.pack(pack.id)}
                        />
                        <MenuAction
                          icon={<Download />}
                          label="Download"
                          onSelect={() => download.open(pack.id)}
                          disabledReason={
                            pack.pdf_url
                              ? undefined
                              : "Generate a preview PDF first."
                          }
                        />
                        <MenuAction
                          icon={<Copy />}
                          label="Save as new"
                          onSelect={() =>
                            duplicate
                              .mutateAsync(pack.id)
                              .then(() => toast.success("Pack duplicated."))
                              .catch((error) =>
                                toast.error(
                                  apiErrorMessage(
                                    error,
                                    "Could not duplicate the pack.",
                                  ),
                                ),
                              )
                          }
                        />
                        <DropdownMenuSeparator />
                        <MenuAction
                          icon={<Trash2 />}
                          label="Delete"
                          destructive
                          onSelect={() =>
                            setPendingDelete({ id: pack.id, name: pack.name })
                          }
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pagination && pagination.total > PAGE_SIZES[0] && (
            <TablePagination
              page={{
                page: pagination.page,
                pageCount: Math.max(pagination.total_pages, 1),
                total: pagination.total,
                from: (pagination.page - 1) * pagination.limit + 1,
                to: Math.min(
                  pagination.page * pagination.limit,
                  pagination.total,
                ),
              }}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
              label="packs"
            />
          )}
        </>
      )}

      <ConfirmDelete
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name}"?`}
        description="This permanently removes the pack and its generated PDF. It cannot be undone."
        onOpenChange={(next) => !next && setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove
            .mutateAsync(pendingDelete.id)
            .then(() => toast.success("Pack deleted."))
            .catch((error) =>
              toast.error(apiErrorMessage(error, "Could not delete the pack.")),
            );
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function TemplatesTab() {
  const templates = usePackTemplates();
  const duplicate = useDuplicateTemplate();
  const remove = useDeleteTemplate();
  const [pendingDelete, setPendingDelete] = React.useState<{
    id: number;
    name: string;
  } | null>(null);

  if (templates.isLoading) {
    return (
      <Table>
        <TableBody>
          <SkeletonRows
            count={4}
            render={() => (
              <>
                <SkeletonTextCell />
                <SkeletonTextCell />
                <SkeletonTextCell />
                <SkeletonActionCell />
              </>
            )}
          />
        </TableBody>
      </Table>
    );
  }

  if (templates.isError) {
    return <LoadError what="templates" onRetry={() => templates.refetch()} />;
  }

  const rows = templates.data?.templates ?? [];

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <Layers />
        </EmptyMedia>
        <EmptyTitle>No templates yet</EmptyTitle>
        <EmptyDescription>
          A template is the recipe a pack is built from: which reports, in what
          order, with what styling.
        </EmptyDescription>
        <EmptyActions>
          <Button asChild>
            <Link href={PACK_ROUTES.newTemplate}>
              <Plus />
              New template
            </Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Reports</TableHead>
            <TableHead>Used in</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((template) => (
            <TableRow key={template.id}>
              <TableCell>
                <Link
                  href={PACK_ROUTES.template(template.id)}
                  className="font-medium hover:underline"
                >
                  {template.name}
                </Link>
                {template.description && (
                  <p className="text-sm text-muted-foreground">
                    {template.description}
                  </p>
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {template.report_count ?? 0}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {template.access === "tenant"
                  ? "All my businesses"
                  : "This business"}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${template.name}`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <MenuAction
                      icon={<Pencil />}
                      label="Edit"
                      href={PACK_ROUTES.template(template.id)}
                    />
                    <MenuAction
                      icon={<Copy />}
                      label="Duplicate"
                      onSelect={() =>
                        duplicate
                          .mutateAsync(template.id)
                          .then(() => toast.success("Template duplicated."))
                          .catch((error) =>
                            toast.error(
                              apiErrorMessage(error, "Could not duplicate it."),
                            ),
                          )
                      }
                    />
                    <DropdownMenuSeparator />
                    <MenuAction
                      icon={<Trash2 />}
                      label="Delete"
                      destructive
                      onSelect={() =>
                        setPendingDelete({
                          id: template.id,
                          name: template.name,
                        })
                      }
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDelete
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name}"?`}
        description="Packs already built from this template keep their reports. New packs will not be able to use it."
        onOpenChange={(next) => !next && setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove
            .mutateAsync(pendingDelete.id)
            .then(() => toast.success("Template deleted."))
            .catch((error) =>
              toast.error(apiErrorMessage(error, "Could not delete it.")),
            );
          setPendingDelete(null);
        }}
      />
    </>
  );
}

export function PackListScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = searchParams?.get("tab") === "templates" ? "templates" : "packs";
  const creating = searchParams?.get("new") === "1";

  const go = (next: { tab?: string; creating?: boolean }) => {
    const params = new URLSearchParams();
    if ((next.tab ?? tab) === "templates") params.set("tab", "templates");
    if (next.creating ?? creating) params.set("new", "1");
    const query = params.toString();
    router.replace(query ? `${PACK_ROUTES.list}?${query}` : PACK_ROUTES.list);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Report packs</h1>
          <p className="text-sm text-muted-foreground">
            Bundle several reports into one PDF with a cover, contents and your
            commentary.
          </p>
        </div>
        {tab === "packs" ? (
          <Button onClick={() => go({ creating: true })}>
            <Plus />
            New report pack
          </Button>
        ) : (
          <Button asChild>
            <Link href={PACK_ROUTES.newTemplate}>
              <Plus />
              New template
            </Link>
          </Button>
        )}
      </header>

      <Tabs
        value={tab}
        onValueChange={(next) => go({ tab: next, creating: false })}
      >
        <TabsList>
          <TabsTrigger value="packs">Report packs</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="packs" className="mt-4">
          <PacksTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
      </Tabs>

      <NewPackDialog
        open={creating}
        onOpenChange={(open) => go({ creating: open })}
      />
    </div>
  );
}
