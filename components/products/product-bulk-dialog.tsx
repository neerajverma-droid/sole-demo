"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Download, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FieldDocsList,
  WizardDropzone,
  WizardSectionHeading,
  WizardStepper,
} from "@/components/bulk/wizard-parts";
import { downloadCsv } from "@/lib/file-parser";
import { productBulkOpenAtom } from "@/lib/atoms";
import { createInventoryItemApi } from "@/lib/inventory";
import {
  PRODUCT_IMPORT_FIELDS,
  PRODUCT_IMPORT_TEMPLATE_HEADERS,
  draftFromImportRow,
  parseProductsCsv,
  productImportTemplateCsv,
  type ParsedProductRow,
} from "@/lib/products";
import { productTaxLabels } from "@/lib/product-tax";
import { cn } from "@/lib/utils";
import { useActiveBusinessIndustry } from "@/hooks/use-active-business-industry";
import { useCountryContext } from "@/hooks/use-country-context";

const STEPS = ["Import", "Map data", "Review upload", "Results"] as const;
const CONTINUE_LABELS = [
  "Continue to map data",
  "Continue to review",
  "Import items",
  "Done",
];

const MAX_BYTES = 5 * 1024 * 1024;

export function ProductBulkDialog() {
  const [open, setOpen] = useAtom(productBulkOpenAtom);
  const queryClient = useQueryClient();
  const industry = useActiveBusinessIndustry();
  const { country } = useCountryContext();

  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState<{ name: string; size: number } | null>(
    null,
  );
  const [rows, setRows] = React.useState<ParsedProductRow[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  /** Column index in the file for each field, so a reordered CSV still maps. */
  const [mapping, setMapping] = React.useState<number[]>(
    PRODUCT_IMPORT_FIELDS.map((_, index) => index),
  );
  const [imported, setImported] = React.useState({ ok: 0, skipped: 0 });
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setStep(0);
    setFile(null);
    setRows([]);
    setParseError(null);
    setMapping(PRODUCT_IMPORT_FIELDS.map((_, index) => index));
    setImported({ ok: 0, skipped: 0 });
  };

  const onFile = (chosen: File) => {
    if (chosen.size > MAX_BYTES) {
      setFile({ name: chosen.name, size: chosen.size });
      setParseError("That file is over 5 MB. Split it and try again.");
      setRows([]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseProductsCsv(String(reader.result));
      setFile({ name: chosen.name, size: chosen.size });
      setRows(parsed);
      setParseError(
        parsed.length === 0
          ? "No rows found. Check the file has a header row and at least one item."
          : null,
      );
    };
    reader.onerror = () => setParseError("That file could not be read.");
    reader.readAsText(chosen);
  };

  const valid = rows.filter((row) => row.issues.length === 0);
  const invalid = rows.filter((row) => row.issues.length > 0);

  const canContinue =
    !submitting &&
    (step === 0
      ? rows.length > 0 && !parseError
      : step === 2
        ? valid.length > 0
        : true);

  const onContinue = async () => {
    if (step === 2) {
      setSubmitting(true);
      // Sequential, not Promise.all: each row's duplicate-name check runs
      // against the rows already saved, and one slow/failed row shouldn't
      // sour the whole batch the way an all-or-nothing request would.
      let ok = 0;
      let failed = invalid.length;
      for (const row of valid) {
        try {
          await createInventoryItemApi(
            draftFromImportRow(row, industry, productTaxLabels(country)),
          );
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok > 0) {
        await queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      }
      setImported({ ok, skipped: failed });
      setSubmitting(false);
      if (ok > 0) {
        toast.success(`${ok} ${ok === 1 ? "item" : "items"} imported`);
      } else {
        toast.error("No items were imported");
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      setOpen(false);
      reset();
      return;
    }
    setStep(step + 1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape and an overlay click both come through here too, same as the
        // disabled Back button (disabled={submitting}, below) — without this
        // guard, closing mid-import doesn't stop the row-by-row loop in
        // onContinue, it just closes the dialog while that loop keeps
        // running. reset() would then wipe step/rows/imported out from under
        // it, and when the loop finishes it writes its real counts and calls
        // setStep(3) on whatever's been reopened since — a fresh import
        // session gets yanked to the old one's Results screen.
        if (!next && submitting) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk import products &amp; services</DialogTitle>
        </DialogHeader>

        <WizardStepper steps={STEPS} current={step} />

        {step === 0 && (
          <div className="space-y-4">
            <WizardSectionHeading
              title="Upload your file"
              description="A CSV with one item per row. These are the columns we read."
            />
            <FieldDocsList fields={PRODUCT_IMPORT_FIELDS} />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv("sole-products-template.csv", productImportTemplateCsv())
              }
            >
              <Download />
              Download template
            </Button>
            <WizardDropzone
              file={file}
              rowCount={rows.length}
              parseError={parseError}
              onFile={onFile}
              onRemove={() => {
                setFile(null);
                setRows([]);
                setParseError(null);
              }}
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <WizardSectionHeading
              title="Map data"
              description="Match each Sole field to a column in your file."
            />
            <div className="divide-y rounded-lg border border-border">
              {PRODUCT_IMPORT_FIELDS.map((field, index) => (
                <div
                  key={field.name}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <p className="text-sm font-medium">
                    {field.name}
                    {field.required && (
                      <span className="ml-0.5 text-destructive" aria-hidden>
                        *
                      </span>
                    )}
                  </p>
                  <Select
                    value={String(mapping[index])}
                    onValueChange={(value) =>
                      setMapping((current) =>
                        current.map((entry, i) =>
                          i === index ? Number(value) : entry,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      className="w-56"
                      aria-label={`Column for ${field.name}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_IMPORT_TEMPLATE_HEADERS.map((header, i) => (
                        <SelectItem key={header} value={String(i)}>
                          Column {i + 1} — {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Defaults assume the template&apos;s column order.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <WizardSectionHeading
              title="Review upload"
              description={`${valid.length} ready to import${
                invalid.length > 0
                  ? `, ${invalid.length} will be skipped`
                  : ""
              }.`}
            />
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity type</TableHead>
                    <TableHead className="text-right">Selling price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.name}-${index}`}>
                      <TableCell className="font-medium">
                        {row.name || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.type || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.quantityType || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {row.salePrice || "—"}
                      </TableCell>
                      <TableCell>
                        {row.issues.length === 0 ? (
                          <Badge variant="success">Ready</Badge>
                        ) : (
                          <span className="space-y-1">
                            <Badge variant="danger">Skipped</Badge>
                            <span className="block text-xs text-muted-foreground">
                              {row.issues[0]}
                            </span>
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2 text-center">
            <span
              className={cn(
                "mx-auto grid size-12 place-items-center rounded-full",
                imported.skipped > 0
                  ? "bg-warning/10 text-warning"
                  : "bg-success/10 text-success",
              )}
              aria-hidden
            >
              {imported.skipped > 0 ? (
                <TriangleAlert className="size-6" />
              ) : (
                <CircleCheck className="size-6" />
              )}
            </span>
            <div className="space-y-1">
              <p className="font-medium">
                {imported.ok} {imported.ok === 1 ? "item" : "items"} imported
              </p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                {imported.skipped > 0
                  ? `${imported.skipped} row${imported.skipped === 1 ? "" : "s"} were skipped because a required field was missing or invalid. Fix them in your file and import again.`
                  : "They're in your Custom catalogue now, ready to add to an invoice or quote."}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step > 0 && step < 3 && (
            <Button
              variant="outline"
              className="mr-auto"
              onClick={() => setStep(step - 1)}
              disabled={submitting}
            >
              Back
            </Button>
          )}
          <Button onClick={onContinue} disabled={!canContinue}>
            {submitting && <Loader2 className="animate-spin" aria-hidden />}
            {CONTINUE_LABELS[step]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
