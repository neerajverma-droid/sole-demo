"use client";

import { useAtom } from "jotai";

import {
  MatchTransactionDialog,
  type MatchableEntity,
} from "@/components/shared/match-transaction-dialog";
import { matchContributionIdAtom } from "@/lib/atoms";
import { contributionAmount, contributionRemaining, formatContributionDate } from "@/lib/super";
import { useSuperStore } from "@/stores/super";

/**
 * Same modal Liabilities and Equity open for "Match"/"AI Match" — see
 * `components/shared/match-transaction-dialog.tsx`. This wrapper only knows
 * how to turn a `Contribution` into the generic shape that dialog needs, and
 * which queries to refresh once it closes.
 */
export function MatchDialog() {
  const [matchId, setMatchId] = useAtom(matchContributionIdAtom);
  const contributions = useSuperStore((state) => state.contributions);

  const contribution = contributions.find((entry) => entry.id === matchId);
  const entity: MatchableEntity | null = contribution
    ? {
        id: contribution.id,
        title: contribution.fundName,
        subtitle: formatContributionDate(contribution.date),
        amount: contributionAmount(contribution),
        remainingAmount: contributionRemaining(contribution),
      }
    : null;

  return (
    <MatchTransactionDialog
      type="expense"
      noun="contribution"
      open={matchId !== null}
      entity={entity}
      onClose={() => setMatchId(null)}
      invalidateQueryKeys={[
        ["super-contributions"],
        ["super-contribution-matrix"],
      ]}
      // Super's contribution dialog is the one module that prefers the
      // possible-matches endpoint's own remaining figure — fresher than the
      // list snapshot — over the row's own remaining amount.
      remainingFromFetch
    />
  );
}
