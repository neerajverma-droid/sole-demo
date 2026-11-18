"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";

import { BulkImportDialog } from "@/components/bulk/bulk-import-dialog";
import { apiErrorMessage } from "@/lib/api-error";
import type { BulkImportResult, BulkResultRow, BulkRow } from "@/lib/bulk-import";
import { productBulkOpenAtom } from "@/lib/atoms";
import { createInventoryItemApi } from "@/lib/inventory";
import { productDraftFromBulkRow, productImportSpec } from "@/lib/product-bulk-import";
import { productTaxLabels } from "@/lib/product-tax";
import { useActiveBusinessIndustry } from "@/hooks/use-active-business-industry";
import { useBulkImportCountry } from "@/hooks/use-bulk-import-country";
import { useCountryContext } from "@/hooks/use-country-context";

/** The module as people know it (the importer's own noun is "items"). */
const PRODUCTS_MODULE = "Product & services";

/**
 * Bulk import for products & services.
 *
 * The same importer the Data Migration Center uses: pick a file, Claude puts it
 * in the columns listed on screen (see `lib/ai-format.ts`), and Review is where
 * a wrong guess is fixed before anything is saved. There's no template to
 * download and no mapping step.
 */
export function ProductBulkDialog() {
  const [open, setOpen] = useAtom(productBulkOpenAtom);
  const queryClient = useQueryClient();
  const industry = useActiveBusinessIndustry();
  const { country } = useCountryContext();
  const importCountry = useBulkImportCountry();

  const spec = React.useMemo(
    () => productImportSpec(importCountry),
    [importCountry],
  );

  const onImport = async (rows: BulkRow[]): Promise<BulkImportResult> => {
    const labels = productTaxLabels(country);
    const results: BulkResultRow[] = [];
    let created = 0;
    let failed = 0;

    // Sequential, not Promise.all: each row's duplicate-name check runs against
    // the rows already saved, and one slow or failed row shouldn't sour the
    // whole batch the way an all-or-nothing request would.
    for (const row of rows) {
      const name = row.values["Item name"].trim();
      try {
        await createInventoryItemApi(
          productDraftFromBulkRow(row, industry, labels),
        );
        created += 1;
        results.push({ row: row.index + 1, status: "success", identifier: name });
      } catch (error) {
        failed += 1;
        results.push({
          row: row.index + 1,
          status: "failed",
          identifier: name,
          message: apiErrorMessage(error, "Couldn't save this item."),
        });
      }
    }

    if (created > 0) {
      await queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    }

    return { created, failed, skipped: 0, rows: results };
  };

  return (
    <BulkImportDialog
      moduleName={PRODUCTS_MODULE}
      spec={spec}
      open={open}
      onOpenChange={setOpen}
      onImport={onImport}
    />
  );
}
