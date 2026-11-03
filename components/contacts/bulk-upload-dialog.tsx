"use client";

import * as React from "react";
import { useAtom } from "jotai";

import { BulkImportDialog } from "@/components/bulk/bulk-import-dialog";
import { bulkUploadOpenAtom } from "@/lib/atoms";
import { contactImportSpec } from "@/lib/contact-import";
import { useBulkCreateContactsMutation } from "@/hooks/use-contacts-query";
import { useBulkImportCountry } from "@/hooks/use-bulk-import-country";

/**
 * Contact bulk upload.
 *
 * The wizard this dialog used to contain is now `BulkImportDialog` — the
 * whole thing was lifted out so Invoices, Expenses and Assets could render
 * the identical importer rather than three copies of it. Nothing on screen
 * changed; what's left here is where the rows go, and the business's
 * country — which names and checks the business-number column (ABN, NZBN).
 */
export function BulkUploadDialog() {
  const [open, setOpen] = useAtom(bulkUploadOpenAtom);
  const bulkCreateContacts = useBulkCreateContactsMutation();
  const country = useBulkImportCountry();
  const spec = React.useMemo(() => contactImportSpec(country), [country]);

  return (
    <BulkImportDialog
      spec={spec}
      open={open}
      onOpenChange={setOpen}
      onImport={(rows) => bulkCreateContacts.mutateAsync(rows)}
    />
  );
}
