"use client";

import Link from "next/link";
import { useSetAtom } from "jotai";
import { Landmark, Plus, TrendingDown, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { AssetBulkUploadDialog } from "@/components/assets/asset-bulk-upload-dialog";
import { AssetDialogs } from "@/components/assets/asset-dialogs";
import { AssetEditGate } from "@/components/assets/asset-edit-gate";
import { AssetFinanceBanner } from "@/components/assets/asset-finance-banner";
import { AssetsSummary } from "@/components/assets/assets-summary";
import { ASSETS_ROOT, AssetsTable } from "@/components/assets/assets-table";
import { assetBulkOpenAtom, assetRegistryOpenAtom } from "@/lib/atoms";
import { useAssetsQuery } from "@/hooks/use-assets-query";
import { useAssetsStore } from "@/stores/assets";

const TITLE_TIP =
  "Everything your business owns and what it's worth — equipment, vehicles, tools and stock. Recording an asset here is what lets Sole depreciate it over time and claim it correctly at tax time.";

export function AssetsScreen() {
  const assetsQuery = useAssetsQuery();
  const stored = useAssetsStore((state) => state.assets);
  const setRegistryOpen = useSetAtom(assetRegistryOpenAtom);
  const setBulkOpen = useSetAtom(assetBulkOpenAtom);

  const assets = stored;
  const isEmpty = assets.length === 0;
  /*
   * Only a genuinely first load — a background refetch keeps the rows already
   * on screen rather than flashing the skeleton back over them.
   */
  const loading = assetsQuery.isLoading && stored.length === 0;
  /*
   * A register that has answered and has nothing in it. `assets` is always the
   * whole register — the table's search and filters narrow their own copy — so
   * this can't be a filter coming up short. `isSuccess` rather than
   * `!loading`: the register waits on the asset registry first, and a request
   * that hasn't started (or failed) isn't an empty register.
   */
  const noAssets = assetsQuery.isSuccess && assets.length === 0;

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Landmark}
        title="Assets"
        titleTip={TITLE_TIP}
        description="Track what your business owns — equipment, vehicles, stock and more."
      >
        <div
          className="flex flex-wrap items-center gap-3"
          data-usertour="asset-tools"
        >
          <Button variant="outline" asChild>
            <Link href={`${ASSETS_ROOT}/depreciation-report`}>
              <TrendingDown />
              Depreciation report
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setRegistryOpen(true)}>
            Asset registry
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload />
            Bulk import
          </Button>
        </div>
        {!isEmpty && (
          <Button asChild data-usertour="asset-new-button">
            <Link href={`${ASSETS_ROOT}/new`}>
              <Plus />
              New asset
            </Link>
          </Button>
        )}
      </PageHeader>

      {/* Once the register has loaded with nothing in it, the table's empty
          state is the whole story — no promo, no four zeros. */}
      {!noAssets && <AssetFinanceBanner />}

      {!noAssets && <AssetsSummary assets={assets} loading={loading} />}

      <AssetsTable assets={assets} loading={loading} isEmpty={noAssets} />

      <AssetDialogs />
      <AssetEditGate />
      <AssetBulkUploadDialog />
    </div>
  );
}
