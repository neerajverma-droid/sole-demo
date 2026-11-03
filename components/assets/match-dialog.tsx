"use client";

import { useAtom } from "jotai";

import {
  MatchTransactionDialog,
  type MatchableEntity,
} from "@/components/shared/match-transaction-dialog";
import { matchAssetIdAtom } from "@/lib/atoms";
import { assetValue, formatAssetDate } from "@/lib/assets";
import { useAssetsStore } from "@/stores/assets";

/**
 * Asset match — same modal Liabilities, Equity and Super open for
 * "Match" / "AI Match". This wrapper converts an `Asset` into the
 * generic `MatchableEntity` shape and hands off to the shared dialog,
 * so the asset list gets the same upgraded UI as every other module
 * rather than its own bespoke copy.
 *
 * `lib/bank-match.ts` already handles `type="asset"` for both
 * single-match (`assets: [id]` → setMatchExpenses) and multi-match
 * (`entry_id`/`type: "asset"` → matchMultipleExpensesAssets), so no
 * endpoint changes are needed here.
 */
export function MatchDialog() {
  const [matchId, setMatchId] = useAtom(matchAssetIdAtom);
  const assets = useAssetsStore((state) => state.assets);

  const asset = assets.find((entry) => entry.id === matchId);

  const entity: MatchableEntity | null = asset
    ? {
        id: asset.id,
        title: asset.name,
        subtitle: formatAssetDate(asset.purchaseDate),
        amount: assetValue(asset),
        remainingAmount: asset.remainingAmount,
      }
    : null;

  return (
    <MatchTransactionDialog
      type="asset"
      noun="asset"
      open={matchId !== null}
      entity={entity}
      onClose={() => setMatchId(null)}
      invalidateQueryKeys={[["assets"]]}
    />
  );
}
