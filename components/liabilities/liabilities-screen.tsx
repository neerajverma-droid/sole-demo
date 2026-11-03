"use client";

import Link from "next/link";
import { Plus, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { LiabilitiesTable } from "@/components/liabilities/liabilities-table";
import {
  AttachLiabilityDialog,
  DeleteLiabilityDialog,
  LiabilityDetailsDialog,
  MatchLiabilityDialog,
  UnmatchLiabilityDialog,
} from "@/components/liabilities/liability-dialogs";

/**
 * Liabilities: what the business owes that isn't a supplier bill.
 *
 * Laid out as Expenses and Invoices are — header, search, table, pagination —
 * because it's the same job on a different record, and a third layout for it
 * would be a third thing to learn.
 */
export function LiabilitiesScreen() {
  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Scale}
        title="Liabilities"
        description="Accrued wages, loans and anything else you owe outside your bills."
      >
        <Button asChild>
          <Link href="/liabilities/new">
            <Plus />
            New liability
          </Link>
        </Button>
      </PageHeader>

      <LiabilitiesTable />

      <LiabilityDetailsDialog />
      <AttachLiabilityDialog />
      <MatchLiabilityDialog />
      <UnmatchLiabilityDialog />
      <DeleteLiabilityDialog />
    </div>
  );
}
