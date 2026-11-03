"use client";

import Link from "next/link";
import { PiggyBank, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import {
  AttachEquityDialog,
  DeleteEquityDialog,
  EquityDetailsDialog,
  MatchEquityDialog,
  UnmatchEquityDialog,
} from "@/components/equity/equity-dialogs";
import { EquityTable } from "@/components/equity/equity-table";

/**
 * Equity / capital: the owner's own money moving in and out.
 *
 * Laid out as its sibling Liabilities page is — header, search, table,
 * pagination — because it's the same job on a different record, and the two sit
 * under one nav group where a second layout would read as a second product.
 */
export function EquityScreen() {
  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={PiggyBank}
        title="Equity"
        description="Capital you've put into the business, and the drawings you've taken back out."
      >
        <Button asChild>
          <Link href="/equity/new">
            <Plus />
            New equity
          </Link>
        </Button>
      </PageHeader>

      <EquityTable />

      <EquityDetailsDialog />
      <AttachEquityDialog />
      <MatchEquityDialog />
      <UnmatchEquityDialog />
      <DeleteEquityDialog />
    </div>
  );
}
