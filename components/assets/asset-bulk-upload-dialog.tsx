"use client";

import * as React from "react";
import { useAtom } from "jotai";

import { BulkImportDialog } from "@/components/bulk/bulk-import-dialog";
import { assetBulkOpenAtom } from "@/lib/atoms";
import { assetImportSpec } from "@/lib/asset-bulk-import";
import { useAccountCategoriesQuery } from "@/hooks/use-account-categories-query";
import { useBulkCreateAssetsMutation } from "@/hooks/use-assets-query";
import { useBulkImportCountry } from "@/hooks/use-bulk-import-country";

/**
 * Asset bulk upload.
 *
 * Replaces the earlier one-row-at-a-time dialog, which looped
 * `createAssetApi` because `/assets/bulk/create` dropped the category. It no
 * longer does — the category travels as a resolved `account_subcategory_id`,
 * which is what sole-webapp's own asset migration sends — so this is one
 * request for the batch and the same wizard every other module uses.
 *
 * The trade is real and worth naming: the old loop gave partial success and
 * could invent registry entries for an unknown brand or asset type. The
 * batch endpoint is all-or-nothing and has no brand/type columns at all, so
 * those are set from the asset screen afterwards rather than from the file.
 */
export function AssetBulkUploadDialog() {
  const [open, setOpen] = useAtom(assetBulkOpenAtom);
  const categoriesQuery = useAccountCategoriesQuery("Assets");
  const categories = React.useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );

  const importAssets = useBulkCreateAssetsMutation(categories);
  // Words the tax column in the business's own term ("VAT amount").
  const country = useBulkImportCountry();

  const spec = React.useMemo(
    () => assetImportSpec(categories, country),
    [categories, country],
  );

  return (
    <BulkImportDialog
      spec={spec}
      open={open}
      onOpenChange={setOpen}
      busy={categoriesQuery.isLoading}
      busyLabel="Loading categories…"
      onImport={(rows) => importAssets.mutateAsync(rows)}
      reviewFooter={
        categoriesQuery.isError ? (
          <p className="text-xs text-destructive">
            Your chart of accounts could not be loaded, so categories
            can&apos;t be checked against it. Importing now would leave every
            asset uncategorised — close this and try again.
          </p>
        ) : null
      }
    />
  );
}
