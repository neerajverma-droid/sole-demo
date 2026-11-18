"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { Landmark, Plus, TrendingDown, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import {
  AssetAccessDenied,
  AssetUsageCounter,
  useAssetAccess,
  useGuardedAddAsset,
} from "@/components/assets/asset-access";
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
  const router = useRouter();
  const access = useAssetAccess();
  const addAsset = useGuardedAddAsset();
  const assetsQuery = useAssetsQuery();
  const stored = useAssetsStore((state) => state.assets);
  const setRegistryOpen = useSetAtom(assetRegistryOpenAtom);
  const setBulkOpen = useSetAtom(assetBulkOpenAtom);

  const hydrated = useAssetsStore((state) => state.hydrated);

  const assets = stored;
  /*
   * Loading until the register has actually landed in the store — not just
   * while the assets request is in flight. That request waits on the asset
   * registry first and is disabled meanwhile, so `isLoading` is false for the
   * whole of that wait and the screen showed "No assets yet" and zero stats
   * before the skeleton ever appeared. `hydrated` is also what covers the beat
   * between the data arriving and the store being filled from it. A background
   * refetch still keeps the rows on screen, since the store stays hydrated.
   */
  const loading = !hydrated && !assetsQuery.isError;

  // An accountant whose grant doesn't include viewing assets (old app:
  // blockAction("asset", "view") hid the page).
  if (!access.canView) return <AssetAccessDenied action="assets" />;

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
          {/* Advanced Assets only, as on the old register. */}
          {access.advanced && (
            <>
              <Button variant="outline" asChild>
                <Link href={`${ASSETS_ROOT}/depreciation-report`}>
                  <TrendingDown />
                  Depreciation report
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setRegistryOpen(true)}>
                Asset registry
              </Button>
            </>
          )}
          {addAsset.canAdd && (
            <Button
              variant="outline"
              onClick={() => addAsset.guard(() => setBulkOpen(true))}
            >
              <Upload />
              Bulk import
            </Button>
          )}
        </div>
        {addAsset.canAdd && (
          <Button
            data-usertour="asset-new-button"
            onClick={() => addAsset.guard(() => router.push(`${ASSETS_ROOT}/new`))}
          >
            <Plus />
            New asset
          </Button>
        )}
      </PageHeader>

      <AssetUsageCounter />

      {/* All of it stays for an empty register too, as on Invoices: the same
          screen it will have later, with "No assets yet" where the rows go. */}
      <AssetFinanceBanner />

      <AssetsSummary assets={assets} loading={loading} />

      <AssetsTable assets={assets} loading={loading} />

      <AssetDialogs />
      <AssetEditGate />
      <AssetBulkUploadDialog />
      {addAsset.dialog}
    </div>
  );
}
