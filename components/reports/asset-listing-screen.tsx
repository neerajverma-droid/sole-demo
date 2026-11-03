"use client";

import { useAtom } from "jotai";
import { Boxes } from "lucide-react";

import { TabularReportScreen } from "@/components/reports/tabular-report-screen";
import { assetListingPeriodAtom, assetListingRangeAtom } from "@/lib/atoms";
import { assetListingConfig } from "@/lib/report-configs";

/**
 * Asset Listing.
 *
 * The asset register for a period, which is what an accountant asks for at year
 * end — every purchase with its GST split, and whether it's been reconciled.
 * Nothing bespoke: it's the shared tabular report with its own columns.
 */
export function AssetListingScreen() {
  const [period, setPeriod] = useAtom(assetListingPeriodAtom);
  const [range, setRange] = useAtom(assetListingRangeAtom);

  return (
    <TabularReportScreen
      config={assetListingConfig}
      icon={Boxes}
      period={period}
      onPeriodChange={setPeriod}
      range={range}
      onRangeChange={setRange}
      defaultPageSize={50}
      emptyIcon={Boxes}
      emptyTitle="No assets bought in this period"
      emptyDescription="Check the dates above — nothing was added to the asset register between them. Assets you record will appear here with their GST split."
      emptyAction={{ label: "Go to Assets", href: "/assets" }}
    />
  );
}
