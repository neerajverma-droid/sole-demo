"use client";

import * as React from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  BookOpen,
  HeartHandshake,
  Package,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import {
  SkeletonActionCell,
  SkeletonBadgeCell,
  SkeletonIdentityCell,
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TablePagination } from "@/components/ui/table-pagination";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteItemDialog } from "@/components/inventory/delete-item-dialog";
import {
  GeneralCatalogueTable,
  NdisCatalogueTable,
} from "@/components/products/catalogue-tables";
import { StatStrip } from "@/components/ui/stat-strip";
import { CustomProductsTable } from "@/components/products/custom-products-table";
import { ProductDetailsDialog } from "@/components/products/product-details-dialog";
import { ProductBulkDialog } from "@/components/products/product-bulk-dialog";
import { ProductDialog } from "@/components/products/product-dialog";
import { ProductFilterDialog } from "@/components/products/product-filter-dialog";
import {
  isNdisBusinessProfile,
  useActiveBusiness,
} from "@/hooks/use-active-business";
import { useActiveBusinessIndustry } from "@/hooks/use-active-business-industry";
import { useGeneralCatalogueQuery } from "@/hooks/use-general-catalogue-query";
import { useInventoryQuery } from "@/hooks/use-inventory-query";
import { useNdisPageQuery } from "@/hooks/use-ndis-page-query";
import { useNdisQuery } from "@/hooks/use-ndis-query";
import {
  generalFiltersAtom,
  ndisFiltersAtom,
  productBulkOpenAtom,
  productDialogAtom,
  productFilterOpenAtom,
  productFiltersAtom,
  productsPageAtom,
  productsPageSizeAtom,
  productsQueryAtom,
  productsTabAtom,
} from "@/lib/atoms";
import { searchGeneralCatalogue } from "@/lib/general-catalogue";
import {
  EMPTY_GENERAL_FILTERS,
  EMPTY_NDIS_FILTERS,
  EMPTY_PRODUCT_FILTERS,
  PRODUCT_TABS,
  TAB_SEARCH_PLACEHOLDER,
  activeGeneralFilters,
  activeNdisFilters,
  activeProductFilters,
  customStats,
  filterCustomProducts,
  filterGeneralCatalogue,
  generalStats,
  ndisStats,
  paginate,
  type Page,
  type ProductTab,
} from "@/lib/products";
import type { NdisSupportItem } from "@/lib/ndis-support-items";
import { useInventoryStore } from "@/stores/inventory";

export function ProductsScreen() {
  const customQuery = useInventoryQuery();
  const stored = useInventoryStore((state) => state.items);
  /**
   * sole-webapp only ever shows the NDIS tab to a business in the NDIS
   * industry (`checkNdis(industry_id)` in its own Products & Services
   * screen) — everyone else gets General and Custom only. `ready` guards
   * against bouncing a genuine NDIS business off the tab before its profile
   * has even loaded; until then this defaults to "not NDIS", same as
   * `new-ndis-invoice.tsx`'s own loading state.
   */
  const { business, ready } = useActiveBusiness();
  const ndisAvailable = isNdisBusinessProfile(business);
  const ndisQuery = useNdisQuery(ndisAvailable);
  const ndisItems = React.useMemo(
    () => ndisQuery.data ?? [],
    [ndisQuery.data],
  );
  const generalQuery = useGeneralCatalogueQuery();
  const generalItems = React.useMemo(
    () => generalQuery.data ?? [],
    [generalQuery.data],
  );
  const industry = useActiveBusinessIndustry();
  const [tab, setTab] = useAtom(productsTabAtom);
  const [query, setQueryValue] = useAtom(productsQueryAtom);
  const [filters, setFilters] = useAtom(productFiltersAtom);
  const [generalFilters, setGeneralFilters] = useAtom(generalFiltersAtom);
  const [ndisFilters, setNdisFilters] = useAtom(ndisFiltersAtom);
  const [pages, setPages] = useAtom(productsPageAtom);
  const [pageSize, setPageSize] = useAtom(productsPageSizeAtom);
  const setFilterOpen = useSetAtom(productFilterOpenAtom);
  const setDialog = useSetAtom(productDialogAtom);
  const setBulkOpen = useSetAtom(productBulkOpenAtom);

  const setQuery = (next: string) => {
    setQueryValue(next);
    // A new search starts at the top; staying on page 4 would look like no hits.
    setPages({ General: 1, NDIS: 1, Custom: 1 });
  };

  /**
   * Filters name fields that only exist on the tab they were set from, so they
   * don't survive the switch — where the search term, being a question about
   * the catalogue rather than about its columns, does.
   */
  const changeTab = (next: ProductTab) => {
    setTab(next);
    setFilters(EMPTY_PRODUCT_FILTERS);
    setGeneralFilters(EMPTY_GENERAL_FILTERS);
    setNdisFilters(EMPTY_NDIS_FILTERS);
  };
  const setPage = (next: number) => setPages({ ...pages, [tab]: next });

  const visibleTabs = PRODUCT_TABS.filter(
    (option) => option !== "NDIS" || ndisAvailable,
  );
  // A business that loses NDIS eligibility mid-session (switched to a
  // non-NDIS business, industry changed) can't be left stranded on a tab
  // that's no longer in the list — same as sole-webapp's own
  // `handleClearRouter` call when `!isNdis` and the URL still says ndis.
  React.useEffect(() => {
    if (ready && !ndisAvailable && tab === "NDIS") changeTab("General");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ndisAvailable, tab]);

  /**
   * General and Custom paginate client-side via `paginate()`, which clamps a
   * stale page number back into range on its own. NDIS is server-paginated —
   * nothing clamps it — so applying a filter while sitting on, say, page 3
   * would otherwise request a page that filter no longer has, get an empty
   * result back, and show a nonsensical "21–2 of 2 items" instead of the 2
   * rows that do match (they're on page 1). Search already resets every
   * tab's page via `setQuery`; this covers the filter dialog's Apply too.
   */
  React.useEffect(() => {
    setPages((current) => ({ ...current, NDIS: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ndisFilters]);

  const general = generalItems;
  const custom = stored;

  // NDIS is the one tab with too many rows (650+) to fetch in full on every
  // load — search, the facet filters and pagination all happen server-side,
  // so this only ever asks for the one page actually on screen.
  const ndisPageQuery = useNdisPageQuery(
    {
      search: query,
      page: pages.NDIS,
      limit: pageSize,
      registrationGroup: ndisFilters.registrationGroup,
      supportCategory: ndisFilters.supportCategory,
    },
    tab === "NDIS" && ndisAvailable,
  );
  const ndisPageData = ndisPageQuery.data;

  /*
   * Whether the tab in front of you is still waiting on its own first fetch.
   * Each tab has a different source, so "loading" is per-tab, not per-screen —
   * and each is gated on having nothing to show yet, so a background refetch
   * never pulls a populated table out from under a reader.
   */
  const tabLoading =
    tab === "General"
      ? generalQuery.isLoading && generalItems.length === 0
      : tab === "NDIS"
        ? ndisPageQuery.isLoading && !ndisPageData
        : customQuery.isLoading && stored.length === 0;

  // Paginated per tab with its own row type, so nothing needs casting back.
  const generalPage = paginate(
    filterGeneralCatalogue(
      searchGeneralCatalogue(query, general),
      generalFilters,
    ),
    pages.General,
    pageSize,
  );
  const ndisPage: Page<NdisSupportItem> = {
    rows: ndisPageData?.items ?? [],
    page: pages.NDIS,
    pageCount: ndisPageData?.totalPages ?? 1,
    total: ndisPageData?.total ?? 0,
    from: ndisPageData?.total ? (pages.NDIS - 1) * pageSize + 1 : 0,
    to: Math.min(pages.NDIS * pageSize, ndisPageData?.total ?? 0),
  };
  const customPage = paginate(
    filterCustomProducts(custom, query, filters),
    pages.Custom,
    pageSize,
  );
  const page =
    tab === "General" ? generalPage : tab === "NDIS" ? ndisPage : customPage;

  /** How many filters are narrowing the tab in front of you, for the badge. */
  const facets =
    tab === "General"
      ? activeGeneralFilters(generalFilters)
      : tab === "NDIS"
        ? activeNdisFilters(ndisFilters)
        : activeProductFilters(filters);
  /** Whether what's on screen is a narrowed view rather than the whole list. */
  const narrowed = !!query.trim() || facets > 0;

  /** Unfiltered totals, so a tab's count doesn't move as you search. */
  const counts: Record<ProductTab, number> = {
    General: general.length,
    NDIS: ndisItems.length,
    Custom: custom.length,
  };
  /*
   * Every tab this business can see has genuinely loaded with nothing in it,
   * and nothing is narrowing the one in front of you — so the tabs, search,
   * filter and stats have nothing to act on: just the header and the empty
   * state that can do something about it, same as the rules screen. Read off
   * each query rather than the store so a fetch that errored, or one that
   * hasn't landed yet, never collapses the screen. A single empty tab keeps
   * everything, so the others can still be switched to.
   */
  const hasNoProducts =
    ready &&
    !narrowed &&
    generalQuery.isSuccess &&
    generalQuery.data.length === 0 &&
    customQuery.isSuccess &&
    customQuery.data.length === 0 &&
    (!ndisAvailable ||
      (ndisQuery.isSuccess && ndisQuery.data.length === 0));
  const stats =
    tab === "General"
      ? generalStats(general)
      : tab === "NDIS"
        ? ndisStats(ndisItems)
        : customStats(custom);
  /**
   * Every General row shares the profile's industry, so it's said once here
   * instead of repeating down a column.
   */
  const context =
    tab === "General"
      ? `${industry} catalogue · ${general.length} ${general.length === 1 ? "item" : "items"}`
      : tab === "NDIS"
        ? `NDIS support catalogue · ${counts.NDIS} support ${counts.NDIS === 1 ? "item" : "items"}`
        : `Your items · ${custom.length} ${custom.length === 1 ? "item" : "items"}`;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Package}
        title="Products & services"
        description={context}
      >
        {/*
          Both actions create a Custom item, but they belong to the screen
          rather than to one tab — same as sole-webapp, which renders them in
          its own header regardless of which tab is open. Hiding them on
          General/NDIS meant finding something in the reference catalogue and
          then having to switch tabs before you could add anything yourself.
        */}
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <Upload />
          Bulk import
        </Button>
        <Button onClick={() => setDialog({ open: true, editId: null })}>
          <Plus />
          Create custom product
        </Button>
      </PageHeader>

      {hasNoProducts ? (
        // Custom is the only catalogue the user fills themselves, so its
        // empty state — with Create custom product — is the one worth showing.
        <TabEmptyState
          tab="Custom"
          narrowed={false}
          onClear={() => setQuery("")}
          onCreate={() => setDialog({ open: true, editId: null })}
        />
      ) : (
        <>
          {/* Tabs and the controls that act on them share a line: which catalogue
              you're in and how you're narrowing it are one decision. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={tab}
              onValueChange={(next) => changeTab(next as ProductTab)}
            >
              <TabsList aria-label="Catalogue" data-usertour="products-tabs">
                {visibleTabs.map((option) => (
                  <TabsTrigger
                    key={option}
                    value={option}
                    className="gap-1.5"
                    data-usertour={`products-tab-${option.toLowerCase()}`}
                  >
                    {option}
                    <span className="text-xs tabular text-muted-foreground">
                      ({counts[option]})
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div
              className="flex w-full flex-1 items-center gap-2 sm:w-auto sm:justify-end"
              data-usertour="products-search-filters"
            >
              <div className="relative w-full sm:w-56">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={TAB_SEARCH_PLACEHOLDER[tab]}
                  aria-label={TAB_SEARCH_PLACEHOLDER[tab]}
                  className="pl-9"
                />
              </div>

              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => setFilterOpen(true)}
              >
                <SlidersHorizontal />
                Filter by
                {facets > 0 && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary tabular">
                    {facets}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {tabLoading ? (
            <CatalogueSkeleton />
          ) : page.total === 0 ? (
            <TabEmptyState
              tab={tab}
              narrowed={narrowed}
              onClear={() => {
                setQuery("");
                setFilters(EMPTY_PRODUCT_FILTERS);
                setGeneralFilters(EMPTY_GENERAL_FILTERS);
                setNdisFilters(EMPTY_NDIS_FILTERS);
              }}
              onCreate={() => setDialog({ open: true, editId: null })}
            />
          ) : (
            <div className="space-y-4">
              <StatStrip stats={stats} />

              {tab === "General" && (
                <GeneralCatalogueTable rows={generalPage.rows} query={query} />
              )}
              {tab === "NDIS" && (
                <NdisCatalogueTable rows={ndisPage.rows} query={query} />
              )}
              {tab === "Custom" && (
                <CustomProductsTable rows={customPage.rows} query={query} />
              )}

              <TablePagination
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(next) => {
                  setPageSize(next as typeof pageSize);
                  setPage(1);
                }}
                label={tab === "NDIS" ? "support items" : "items"}
              />
            </div>
          )}
        </>
      )}

      <ProductDetailsDialog />
      <ProductDialog />
      <ProductFilterDialog />
      <ProductBulkDialog />
      {/* Inventory's dialog — one catalogue, so one confirmation. */}
      <DeleteItemDialog />
    </div>
  );
}

/** Each tab is empty for its own reason, so each says something different. */
function TabEmptyState({
  tab,
  narrowed,
  onClear,
  onCreate,
}: {
  tab: ProductTab;
  narrowed: boolean;
  onClear: () => void;
  onCreate: () => void;
}) {
  if (narrowed) {
    return (
      <Empty>
        <EmptyMedia>
          <SearchX aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>Nothing matches your search</EmptyTitle>
          <EmptyDescription>
            Try a different term, or clear it to see the whole catalogue.
          </EmptyDescription>
        </div>
        <EmptyActions>
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  if (tab === "General") {
    return (
      <Empty>
        <EmptyMedia>
          <BookOpen aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No general catalogue for your industry yet</EmptyTitle>
          <EmptyDescription>
            This list is seeded from the industry on your business profile. Set
            one in Settings and the usual items for it appear here.
          </EmptyDescription>
        </div>
      </Empty>
    );
  }

  if (tab === "NDIS") {
    return (
      <Empty>
        <EmptyMedia>
          <HeartHandshake aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No NDIS support items loaded</EmptyTitle>
          <EmptyDescription>
            The NDIS reference is published by the NDIA and refreshed each year.
            Once it&apos;s loaded you can look up any support item by name or
            number.
          </EmptyDescription>
        </div>
      </Empty>
    );
  }

  return (
    <Empty>
      <EmptyMedia>
        <Package aria-hidden />
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>No custom items yet</EmptyTitle>
        <EmptyDescription>
          Add the things you sell that aren&apos;t in the general or NDIS lists,
          with their price and tax, and they&apos;ll be ready to drop onto an
          invoice or quote.
        </EmptyDescription>
      </div>
      <EmptyActions>
        <Button size="sm" onClick={onCreate}>
          Create custom product
        </Button>
      </EmptyActions>
    </Empty>
  );
}

/**
 * Stands in for whichever catalogue is still loading.
 *
 * One shape for all three tabs rather than three near-identical skeletons:
 * they're the same stat strip over the same name-plus-columns table, and a
 * placeholder's job is to hold the layout, not to spell out which columns are
 * coming.
 */
function CatalogueSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Shimmer className="h-[90px] w-full rounded-lg border border-border" />
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Quantity type</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Tax rate</TableHead>
              <TableHead>Transaction type</TableHead>
              <TableHead className="w-[60px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SkeletonRows
              render={() => (
                <>
                  <SkeletonIdentityCell nameWidth="w-36" subtextWidth="w-24" />
                  <SkeletonTextCell width="w-16" />
                  <SkeletonTextCell width="w-16" align="right" />
                  <SkeletonTextCell width="w-20" />
                  <SkeletonBadgeCell width="w-20" />
                  <SkeletonActionCell />
                </>
              )}
            />
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
