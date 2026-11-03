"use client";

import { Landmark, PiggyBank, Receipt, TrendingDown } from "lucide-react";

import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { assetMoney, assetStats, type Asset } from "@/lib/assets";

/**
 * The four figures, toned by meaning rather than all indigo: what it's all
 * worth, what's actually yours, what's still financed, and how much of the
 * register is being written down.
 */
export function AssetsSummary({
  assets,
  loading,
}: {
  assets: Asset[];
  /** The register hasn't landed yet — shown in place of four $0.00s, which
   *  read as a real answer rather than a pending one. */
  loading?: boolean;
}) {
  const stats = assetStats(assets);

  if (loading) {
    // Same breakpoints StatCards uses for four cards, so the real figures
    // land exactly where the placeholders were.
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }).map((_, index) => (
          <Shimmer
            key={index}
            className="h-[116px] w-full rounded-lg border border-border"
          />
        ))}
      </div>
    );
  }

  const cards: StatCard[] = [
    {
      key: "total",
      label: "Total asset value",
      value: assetMoney(stats.totalValue),
      meta: `${assets.length} ${assets.length === 1 ? "asset" : "assets"} on the register`,
      icon: Landmark,
    },
    {
      key: "paid",
      label: "Fully paid",
      tone: "success",
      value: assetMoney(stats.paidValue),
      meta: `${stats.paidCount} paid`,
      icon: PiggyBank,
    },
    {
      key: "owing",
      label: "Amount owing",
      tone: "warning",
      value: assetMoney(stats.owingValue),
      meta:
        stats.owingCount > 0
          ? `${stats.owingCount} awaiting payment`
          : "Nothing outstanding",
      icon: Receipt,
    },
    {
      key: "depreciating",
      label: "Depreciating",
      tone: "accent",
      value: String(stats.depreciatingCount),
      meta:
        stats.depreciatingCount > 0
          ? "Being written down over time"
          : "None set up yet",
      icon: TrendingDown,
    },
  ];

  return (
    <div data-usertour="asset-summary">
      <StatCards stats={cards} />
    </div>
  );
}
