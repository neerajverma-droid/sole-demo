"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { BillsPanel } from "@/components/bills/bills-panel";

/** Supplier bills waiting to become expenses, on their own page under Expenses. */
export function BillsScreen() {
  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={FileText}
        title="Bills"
        description="Record bills from your suppliers, match them to payments from your bank, and see what's owed and when."
      >
        <Button asChild data-usertour="bill-new-button">
          <Link href="/expenses/bills/new">
            <Plus />
            Add bill
          </Link>
        </Button>
      </PageHeader>

      <BillsPanel />
    </div>
  );
}
