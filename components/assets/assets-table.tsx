"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import {
  ArrowDownUp,
  CalendarRange,
  Copy,
  Download,
  Eye,
  Landmark,
  Link2,
  Loader2,
  MoreHorizontal,
  PackageX,
  Paperclip,
  Pencil,
  Search,
  SearchX,
  Shield,
  ShieldAlert,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { MenuAction } from "@/components/ui/menu-action";
import { RowIconButton } from "@/components/ui/row-icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SkeletonActionCell,
  SkeletonBadgeCell,
  SkeletonCheckboxCell,
  SkeletonIdentityCell,
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import { Highlight } from "@/components/contacts/highlight";
import { AssetsFiltersDialog } from "@/components/assets/assets-filters";
import {
  assetSelectionAtom,
  assetsAdvancedFilterAtom,
  assetsQueryAtom,
  assetsSortAtom,
  attachAssetIdAtom,
  bulkUndoAssetMatchIdsAtom,
  deleteAssetIdAtom,
  deleteAssetIdsAtom,
  matchAssetIdAtom,
  undoAssetMatchIdAtom,
  viewAssetIdAtom,
} from "@/lib/atoms";
import {
  ASSET_SORTS,
  EMPTY_ASSET_ADVANCED_FILTERS,
  assetValueCeiling,
  assetMoney,
  assetOwing,
  assetValue,
  canEditAsset,
  assetsNarrowed,
  downloadAssetsApi,
  filterAssets,
  formatAssetDate,
  isDisposed,
  type Asset,
  type AssetSort,
} from "@/lib/assets";
import { cn } from "@/lib/utils";
import { useDuplicateAssetMutation } from "@/hooks/use-asset-mutations";
import { useFilteredAssetsQuery } from "@/hooks/use-assets-query";

export const ASSETS_ROOT = "/assets";

/* ------------------------------------------------------------------ *
 * Column widths
 * ------------------------------------------------------------------ */

/**
 * The register's columns, declared once and worn by the header and the cells.
 *
 * `table-fixed` is what makes any of these binding. An `auto` table measures its
 * content and treats a declared width as a suggestion, which is how a long
 * supplier name ends up owning a third of the row while the date column sits at
 * four characters wide.
 *
 * Two columns are sized to what they hold — a checkbox and a cluster of three
 * icon buttons, neither of which has anything to gain from more room — and the
 * five that carry the record split what's left in equal fifths. Under
 * `table-fixed` only the first row is measured, so the width has to be on the
 * header *and* the body cell: a header column sized against unsized cells is a
 * heading that lines up with nothing.
 */
const CHECKBOX_COLUMN = "w-[44px]";

/** Three `size-8` buttons, their gaps, and the cell's own padding. */
const ACTIONS_COLUMN = "w-[132px]";

/**
 * A fifth of the row, less the two fixed columns.
 *
 * 44 + 132 = 176. Written as the arithmetic rather than as a resolved
 * percentage so the two constants above stay the only place those numbers live.
 */
const DATA_COLUMN = "w-[calc((100%_-_176px)/5)]";

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

const DEFAULT_PAGE_SIZE = 25;

/**
 * The register. Same shape as the other list tables: a toolbar, a bulk bar that
 * only exists while something is selected, then the rows — with the true empty
 * state and the search-miss state kept apart.
 */
export function AssetsTable({
  assets,
  loading,
  isEmpty,
}: {
  assets: Asset[];
  /** The register hasn't landed yet — a skeleton rather than "No assets yet",
   *  which reads as a real answer when it's only a slow one. */
  loading?: boolean;
  /** The register has loaded with nothing in it — just "No assets yet",
   *  without a search, filters and sort over nothing. */
  isEmpty?: boolean;
}) {
  const [query, setQuery] = useAtom(assetsQueryAtom);
  const [advanced, setAdvanced] = useAtom(assetsAdvancedFilterAtom);
  const [sort, setSort] = useAtom(assetsSortAtom);
  const [selected, setSelected] = useAtom(assetSelectionAtom);
  const router = useRouter();

  const setViewId = useSetAtom(viewAssetIdAtom);
  const setAttachId = useSetAtom(attachAssetIdAtom);
  const setDeleteId = useSetAtom(deleteAssetIdAtom);
  const setDeleteIds = useSetAtom(deleteAssetIdsAtom);
  const setMatchId = useSetAtom(matchAssetIdAtom);
  const setUndoMatchId = useSetAtom(undoAssetMatchIdAtom);
  const setBulkUndoMatchIds = useSetAtom(bulkUndoAssetMatchIdsAtom);

  const duplicateAsset = useDuplicateAssetMutation();
  const [downloading, setDownloading] = React.useState(false);

  /*
   * Which assets are in play is the server's call once the dialog's filters are
   * on: `filtered.assets` is its answer, and null means nothing is filtering so
   * the whole register is used. Search and sort then work on that list here, as
   * they always have. The slider's ceiling and the bulk-undo check still read
   * the whole register, so applying a filter can't move either of them.
   */
  const filtered = useFilteredAssetsQuery(advanced);
  const source = filtered.assets ?? assets;
  const rows = filterAssets(source, { query, sort });
  const narrowed = assetsNarrowed({ query, advanced });
  const valueCeiling = assetValueCeiling(assets);
  const tableLoading = loading || filtered.isLoading;

  /* ---------------------------------------------------------------- *
   * Which page of the register is up
   * ---------------------------------------------------------------- */

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(DEFAULT_PAGE_SIZE);

  /*
   * Back to page one whenever the list underneath changes shape.
   *
   * Compared during render rather than in an effect, the way the Dashboard's
   * area card resets its open panel: an effect would paint page nine of a
   * three-page result first and correct it after, and page nine of three is an
   * empty table.
   */
  const narrowing = `${query}|${sort}|${JSON.stringify(advanced)}`;
  const lastNarrowing = React.useRef(narrowing);
  if (lastNarrowing.current !== narrowing) {
    lastNarrowing.current = narrowing;
    if (page !== 1) setPage(1);
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /*
   * Clamped rather than corrected. Deleting the last row of the last page drops
   * the page count under `page`, and clamping here means the table shows the
   * new last page on the same render — where writing state back would need
   * another one, and would fight the reset above for who owns `page`.
   */
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const paged = rows.slice(pageStart, pageStart + pageSize);

  /** Selection is scoped to what's visible, so a hidden row can't be deleted. */
  const visibleIds = rows.map((row) => row.id);
  const chosen = selected.filter((id) => visibleIds.includes(id));
  const allChosen = chosen.length > 0 && chosen.length === visibleIds.length;
  const someChosen = chosen.length > 0 && chosen.length < visibleIds.length;
  // Same rule as sole-webapp's own bulk bar: only offered when every
  // selection is actually matched, not just some of them.
  const canBulkUndoMatch =
    chosen.length > 0 &&
    chosen.every((id) => assets.find((asset) => asset.id === id)?.isReconciled);

  const toggleAll = () => setSelected(allChosen ? [] : visibleIds);
  const toggleOne = (id: string) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((entry) => entry !== id)
        : [...selected, id],
    );

  const clearFilters = () => {
    setQuery("");
    setAdvanced(EMPTY_ASSET_ADVANCED_FILTERS);
  };

  if (isEmpty) {
    return (
      <Empty className="gap-2.5 py-9">
        <EmptyMedia>
          <Landmark aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No assets yet</EmptyTitle>
          <EmptyDescription>
            Add what your business owns — equipment, vehicles, tools and stock
            — and Sole tracks its value and depreciation.
          </EmptyDescription>
        </div>
        <EmptyCue label="Start here" />
        <EmptyActions>
          <Button size="sm" asChild data-usertour="asset-new-button">
            <Link href={`${ASSETS_ROOT}/new`}>New asset</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        data-usertour="asset-search-filters"
      >
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets"
            aria-label="Search assets"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AssetsFiltersDialog
            value={advanced}
            onChange={setAdvanced}
            ceiling={valueCeiling}
          />

          <Select
            value={sort}
            onValueChange={(value) => setSort(value as AssetSort)}
          >
            <SelectTrigger aria-label="Sort assets" className="w-[11rem]">
              <ArrowDownUp className="size-4 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_SORTS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            disabled={downloading || rows.length === 0}
            onClick={async () => {
              const ids =
                chosen.length > 0 ? chosen : rows.map((row) => row.id);
              setDownloading(true);
              try {
                const blob = await downloadAssetsApi(ids);
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "assets.zip";
                link.click();
                URL.revokeObjectURL(url);
              } catch {
                toast.error("Couldn't download those assets");
              } finally {
                setDownloading(false);
              }
            }}
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download />
            )}
            {downloading ? "Preparing…" : "Download"}
          </Button>
        </div>
      </div>

      {/* The bulk bar only exists while something is selected. */}
      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.03] px-4 py-2.5">
          <p className="text-sm font-medium tabular">
            {chosen.length} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canBulkUndoMatch && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkUndoMatchIds(chosen)}
              >
                Undo match
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteIds(chosen)}
            >
              <Trash2 />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setSelected([])}
            >
              <X />
              Clear
            </Button>
          </div>
        </div>
      )}

      {filtered.isError ? (
        <Empty className="gap-2.5 py-9">
          <EmptyMedia>
            <SearchX aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Couldn&apos;t apply those filters</EmptyTitle>
            <EmptyDescription>
              The register didn&apos;t come back. Try again, or clear the
              filters to see everything.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </EmptyActions>
        </Empty>
      ) : tableLoading ? (
        <AssetsTableSkeleton />
      ) : rows.length === 0 ? (
        <Empty className="gap-2.5 py-9">
          <EmptyMedia>
            {narrowed ? <SearchX aria-hidden /> : <Landmark aria-hidden />}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {narrowed ? "No assets match" : "No assets yet"}
            </EmptyTitle>
            <EmptyDescription>
              {narrowed
                ? "Try a different search, or clear the filters to see the whole register."
                : "Add what your business owns — equipment, vehicles, tools and stock — and Sole tracks its value and depreciation."}
            </EmptyDescription>
          </div>
          {!narrowed && <EmptyCue label="Start here" />}
          <EmptyActions>
            {narrowed ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button size="sm" asChild data-usertour="asset-new-button">
                <Link href={`${ASSETS_ROOT}/new`}>New asset</Link>
              </Button>
            )}
          </EmptyActions>
        </Empty>
      ) : (
        <>
          <div
            className={cn(
              "overflow-x-auto rounded-lg border border-border bg-card shadow-sm transition-opacity",
              filtered.isPlaceholderData && "pointer-events-none opacity-60",
            )}
            aria-busy={filtered.isPlaceholderData}
          >
            <Table className="min-w-[1080px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className={CHECKBOX_COLUMN}>
                    <Checkbox
                      checked={someChosen ? "indeterminate" : allChosen}
                      onCheckedChange={toggleAll}
                      aria-label="Select all assets"
                    />
                  </TableHead>
                  <TableHead className={DATA_COLUMN}>Asset</TableHead>
                  <TableHead className={DATA_COLUMN}>Supplier</TableHead>
                  {/* The only right-aligned figure, and the only right-aligned
                      heading to go with it. */}
                  <TableHead className={cn(DATA_COLUMN, "text-right")}>
                    Asset value
                  </TableHead>
                  <TableHead className={DATA_COLUMN}>
                    Date of purchase
                  </TableHead>
                  <TableHead className={DATA_COLUMN}>
                    Match transaction
                  </TableHead>
                  <TableHead className={cn(ACTIONS_COLUMN, "text-right")}>
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* This page's rows. Selection still spans the whole filtered
                    list, so a tick set on page one survives a trip to page
                    two and the bulk bar keeps counting it. */}
                {paged.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    query={query}
                    selected={selected.includes(asset.id)}
                    onToggle={() => toggleOne(asset.id)}
                    onView={() => setViewId(asset.id)}
                    onAttach={() => setAttachId(asset.id)}
                    onDepreciation={() =>
                      router.push(`${ASSETS_ROOT}/${asset.id}/depreciation`)
                    }
                    onSchedule={() =>
                      router.push(
                        `${ASSETS_ROOT}/${asset.id}/depreciation/schedule`,
                      )
                    }
                    onDisposal={() =>
                      router.push(`${ASSETS_ROOT}/${asset.id}/disposal`)
                    }
                    onInsurance={() =>
                      router.push(`${ASSETS_ROOT}/${asset.id}/insurance`)
                    }
                    onStatus={() =>
                      router.push(`${ASSETS_ROOT}/${asset.id}/status`)
                    }
                    onMatch={() => setMatchId(asset.id)}
                    onUndoMatch={() => setUndoMatchId(asset.id)}
                    onDelete={() => setDeleteId(asset.id)}
                    duplicating={
                      duplicateAsset.isPending &&
                      duplicateAsset.variables?.id === asset.id
                    }
                    onDuplicate={() => {
                      duplicateAsset.mutate(asset, {
                        onSuccess: () =>
                          toast.success(`Duplicated ${asset.name}`),
                        onError: () =>
                          toast.error(`Couldn't duplicate ${asset.name}`),
                      });
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <NumberedPagination
            page={{
              page: currentPage,
              pageCount,
              total,
              from: total === 0 ? 0 : pageStart + 1,
              to: Math.min(pageStart + pageSize, total),
            }}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              // Row 30 is on a different page at 10 a page than at 50, so the
              // honest thing after a resize is the top of the list rather than
              // whichever page number happens to still be in range.
              setPage(1);
            }}
            itemLabel="asset"
            navLabel="Assets pages"
          />
        </>
      )}
    </div>
  );
}

function AssetRow({
  asset,
  query,
  selected,
  onToggle,
  onView,
  onAttach,
  onDepreciation,
  onSchedule,
  onDisposal,
  onInsurance,
  onStatus,
  onMatch,
  onUndoMatch,
  onDelete,
  duplicating,
  onDuplicate,
}: {
  asset: Asset;
  query: string;
  selected: boolean;
  onToggle: () => void;
  onView: () => void;
  onAttach: () => void;
  onDepreciation: () => void;
  onSchedule: () => void;
  onDisposal: () => void;
  onInsurance: () => void;
  onStatus: () => void;
  onMatch: () => void;
  onUndoMatch: () => void;
  onDelete: () => void;
  duplicating: boolean;
  onDuplicate: () => void;
}) {
  const owing = assetOwing(asset);

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className={CHECKBOX_COLUMN}>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${asset.name}`}
        />
      </TableCell>

      <TableCell className={DATA_COLUMN}>
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">
            <Highlight text={asset.name} query={query} />
          </p>
          {/* The category as a quiet tag rather than its own column — it
              qualifies the name rather than standing beside it. Disposal joins
              it there: it qualifies the asset the same way, and it's muted
              because a sold asset is a fact about the record rather than
              something wrong with it. */}
          {/* A div, not a span: `Badge` renders a div, and a div inside a span
              is markup React refuses to hydrate. */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {asset.category}
            </span>
            {isDisposed(asset) && (
              <Badge
                variant="outline"
                className="shrink-0 rounded border-transparent bg-muted px-1.5 py-0 text-xs font-normal text-muted-foreground"
              >
                Disposed
              </Badge>
            )}
            {/* Tinted, unlike Disposed: this is a live concern still worth
                acting on, not a settled fact about the record. */}
            {asset.statusReason && (
              <Badge
                variant="destructive"
                className="shrink-0 rounded px-1.5 py-0 text-xs font-normal"
              >
                {asset.statusReason}
              </Badge>
            )}
          </div>
        </div>
      </TableCell>

      {/* Truncated rather than wrapped: every column is a fifth of the row now,
          so a long supplier has to give way inside its own column instead of
          growing it or pushing the row two lines tall. */}
      <TableCell className={cn(DATA_COLUMN, "text-muted-foreground")}>
        <p className="truncate">
          <Highlight text={asset.supplierName || "—"} query={query} />
        </p>
      </TableCell>

      <TableCell className={cn(DATA_COLUMN, "text-right")}>
        <p className="font-medium tabular">{assetMoney(assetValue(asset))}</p>
        <p className="text-xs tabular text-muted-foreground">
          {owing > 0 ? (
            <span className="text-warning">owing {assetMoney(owing)}</span>
          ) : (
            "—"
          )}
        </p>
      </TableCell>

      <TableCell
        className={cn(
          DATA_COLUMN,
          "whitespace-nowrap text-muted-foreground tabular",
        )}
      >
        {formatAssetDate(asset.purchaseDate)}
      </TableCell>

      <TableCell className={DATA_COLUMN}>
        {asset.isReconciled ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Badge variant="success" className="shrink-0">
              Matched
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={onUndoMatch}
            >
              Undo
            </Button>
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={onMatch}>
            <Link2 />
            {asset.possibleMatchCount > 0 ? "AI Match" : "Match"}
          </Button>
        )}
      </TableCell>

      <TableCell className={cn(ACTIONS_COLUMN, "text-right")}>
        {/*
          The two actions worth a click of their own, then everything else.

          View and Edit are what a register is opened for, and burying the two
          most-used actions one press deeper than the six that follow them is
          the wrong way round. They're the shared `RowIconButton`, so this
          cluster is the same treatment and the same rhythm as the one on
          Expenses and Invoices — and they come out of the menu rather than
          being repeated in it, since an action offered twice a centimetre apart
          reads as two different actions.
        */}
        <div
          className="flex items-center justify-end gap-1"
          data-usertour="asset-row-actions"
        >
          <RowIconButton
            icon={<Eye />}
            label={`View ${asset.name}`}
            onClick={onView}
          />
          {/* Absent rather than disabled once matched, as on Expenses: the cost it
              was matched against shouldn't move without an undo first. */}
          {canEditAsset(asset) && (
            <RowIconButton
              icon={<Pencil />}
              label={`Edit ${asset.name}`}
              href={`${ASSETS_ROOT}/${asset.id}`}
            />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`More actions for ${asset.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            {/* The edit actions, then Delete on its own. */}
            <DropdownMenuContent align="end" className="w-56">
              <MenuAction
                icon={<Paperclip />}
                label="Attach document"
                onSelect={onAttach}
              />
              <MenuAction
                icon={<TrendingDown />}
                label="Depreciation settings"
                onSelect={onDepreciation}
              />
              <MenuAction
                icon={<CalendarRange />}
                label="View depreciation schedule"
                onSelect={onSchedule}
              />
              <MenuAction
                icon={<PackageX />}
                label="Record disposal"
                onSelect={onDisposal}
              />
              <MenuAction
                icon={<Shield />}
                label="Manage insurance"
                onSelect={onInsurance}
              />
              <MenuAction
                icon={<ShieldAlert />}
                label="Report lost, damaged or stolen"
                onSelect={onStatus}
              />
              <MenuAction
                icon={
                  duplicating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Copy />
                  )
                }
                label={duplicating ? "Duplicating…" : "Duplicate"}
                disabledReason={duplicating ? "Duplicating…" : undefined}
                onSelect={onDuplicate}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Trash2 />}
                label="Delete"
                onSelect={onDelete}
                destructive
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Stands in for the register while it loads — same columns, same widths and
 * the same `table-fixed` layout, so the real rows land where the placeholders
 * already were instead of shifting the page under a reader.
 */
function AssetsTableSkeleton() {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm"
      aria-hidden
    >
      <Table className="min-w-[1080px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className={CHECKBOX_COLUMN} />
            <TableHead className={DATA_COLUMN}>Asset</TableHead>
            <TableHead className={DATA_COLUMN}>Supplier</TableHead>
            <TableHead className={cn(DATA_COLUMN, "text-right")}>
              Asset value
            </TableHead>
            <TableHead className={DATA_COLUMN}>Date of purchase</TableHead>
            <TableHead className={DATA_COLUMN}>Match transaction</TableHead>
            <TableHead className={cn(ACTIONS_COLUMN, "text-right")}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SkeletonRows
            render={() => (
              <>
                <SkeletonCheckboxCell className={CHECKBOX_COLUMN} />
                <SkeletonIdentityCell
                  className={DATA_COLUMN}
                  nameWidth="w-28"
                  subtextWidth="w-20"
                />
                <SkeletonTextCell className={DATA_COLUMN} width="w-24" />
                <SkeletonTextCell
                  className={DATA_COLUMN}
                  width="w-20"
                  align="right"
                />
                <SkeletonTextCell className={DATA_COLUMN} width="w-24" />
                <SkeletonBadgeCell className={DATA_COLUMN} width="w-24" />
                <SkeletonActionCell className={ACTIONS_COLUMN} />
              </>
            )}
          />
        </TableBody>
      </Table>
    </div>
  );
}
