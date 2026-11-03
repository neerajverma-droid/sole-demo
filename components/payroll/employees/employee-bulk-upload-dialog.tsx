"use client";

import * as React from "react";
import { CircleCheck, CircleX, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WizardDropzone } from "@/components/bulk/wizard-parts";
import { useBulkUploadEmployeesMutation } from "@/hooks/use-payroll-employees-query";
import { plural } from "@/lib/payroll";
import {
  BULK_TEMPLATE_FILENAME,
  employeeErrorMessage,
  employeeWriteBlock,
  fetchBulkTemplateApi,
  type BulkUploadResult,
  type EmployeeWriteBlock,
} from "@/lib/payroll-employees";

/** Hands the browser a blob to save under `filename`. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Data rows in a CSV, header excluded — only for the "N rows found" line. */
function countRows(text: string): number {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return Math.max(0, lines.length - 1);
}

/**
 * Many employees from one CSV — download the template, fill it, upload it.
 *
 * The backend validates and creates row by row, so the result is a split:
 * how many went in, how many didn't, and why for each row that didn't.
 */
export function EmployeeBulkUploadDialog({
  open,
  onOpenChange,
  onBlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The upload would take more seats than are free, or payroll is off. */
  onBlocked: (block: EmployeeWriteBlock, message: string) => void;
}) {
  const uploadMutation = useBulkUploadEmployeesMutation();
  const [downloading, setDownloading] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [rowCount, setRowCount] = React.useState(0);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BulkUploadResult | null>(null);

  React.useEffect(() => {
    if (open) return;
    setFile(null);
    setRowCount(0);
    setParseError(null);
    setResult(null);
  }, [open]);

  const onFile = async (chosen: File) => {
    setResult(null);
    if (!/\.csv$/i.test(chosen.name)) {
      setFile(chosen);
      setRowCount(0);
      setParseError(
        "Choose a .csv file — save the template as CSV before uploading.",
      );
      return;
    }
    setFile(chosen);
    setParseError(null);
    try {
      setRowCount(countRows(await chosen.text()));
    } catch {
      setRowCount(0);
    }
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      saveBlob(await fetchBulkTemplateApi(), BULK_TEMPLATE_FILENAME);
      toast.success("CSV template downloaded.");
    } catch (error) {
      toast.error(
        employeeErrorMessage(error, "Failed to download CSV template."),
      );
    } finally {
      setDownloading(false);
    }
  };

  const upload = async () => {
    if (!file) return;
    try {
      const { result: next, message } = await uploadMutation.mutateAsync(file);
      setResult(next);
      toast.success(message);
    } catch (error) {
      const message = employeeErrorMessage(error, "Failed to upload CSV file.");
      const block = employeeWriteBlock(error);
      if (block) onBlocked(block, message);
      else toast.error(message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !uploadMutation.isPending && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk upload employees</DialogTitle>
          <DialogDescription>
            Add several employees at once from a CSV. Each one takes a seat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">1. Get the template</p>
              <p className="text-xs text-muted-foreground">
                One employee per row, with the columns payroll expects.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void downloadTemplate()}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Download />
              )}
              Download CSV
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">2. Upload it</p>
            <WizardDropzone
              file={file}
              rowCount={rowCount}
              parseError={parseError}
              onFile={(chosen) => void onFile(chosen)}
              onRemove={() => {
                setFile(null);
                setParseError(null);
                setResult(null);
              }}
              hint="CSV only"
            />
          </div>

          {result && <ResultPanel result={result} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={() => void upload()}
              disabled={!file || !!parseError || uploadMutation.isPending}
            >
              {uploadMutation.isPending && (
                <Loader2 className="animate-spin" aria-hidden />
              )}
              {uploadMutation.isPending ? "Uploading…" : "Upload employees"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultPanel({ result }: { result: BulkUploadResult }) {
  return (
    <div
      className="space-y-3 rounded-md border border-border p-3"
      role="status"
    >
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <p className="flex items-center gap-1.5">
          <CircleCheck className="size-4 text-success" aria-hidden />
          <span className="tabular">
            {plural(result.validCount, "employee")}
          </span>{" "}
          created
        </p>
        {result.failedCount > 0 && (
          <p className="flex items-center gap-1.5">
            <CircleX className="size-4 text-destructive" aria-hidden />
            <span className="tabular">
              {plural(result.failedCount, "row")}
            </span>{" "}
            failed
          </p>
        )}
      </div>
      {result.errors.length > 0 && (
        <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-md bg-muted/40 text-sm">
          {result.errors.map((error) => (
            <li
              key={`${error.row}-${error.error}`}
              className="flex gap-3 px-3 py-2"
            >
              <span className="shrink-0 text-muted-foreground tabular">
                Row {error.row}
              </span>
              <span>{error.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
