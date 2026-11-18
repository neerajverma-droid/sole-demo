"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  autoMapBulkColumns,
  buildBulkRows,
  bulkCellText,
  bulkEditorSeed,
  bulkErrorRowsCsv,
  bulkFieldErrors,
  fieldDisplay,
  groupBulkIssues,
  reviewFields,
  withBulkIssues,
  type BulkField,
  type BulkImportResult,
  type BulkImportSpec,
  type BulkRow,
  type BulkValues,
} from "@/lib/bulk-import";
import { IMPORT_FILE_ACCEPT, downloadCsv } from "@/lib/file-parser";
import { aiTargetFromBulkSpec, importFileError } from "@/lib/ai-format";
import { BulkResultsDialog } from "@/components/bulk/bulk-results-dialog";
import { BulkChoiceSelect } from "@/components/bulk/choice-select";
import {
  PINNED_ACTIONS_CELL,
  PINNED_ACTIONS_CELL_EDITING,
  PINNED_ACTIONS_HEAD,
  WizardStepper,
} from "@/components/bulk/wizard-parts";
import { useImportFileReader } from "@/components/bulk/use-import-file-reader";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useMigrationsStore } from "@/stores/migrations";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { bulkModuleContext, sectionName } from "@/lib/analytics-modules";
import { useTrackOnOpen } from "@/hooks/use-track-once";

const STEPS = [
  { n: 1, label: "Import" },
  { n: 2, label: "Review" },
  { n: 3, label: "Done" },
] as const;

/**
 * The bulk importer every module shares.
 *
 * Lifted wholesale out of the Contacts dialog — same four steps, same
 * stepper, same drop zone, same example table, same grouped error summary and
 * inline-editable review table — and parameterised by a `BulkImportSpec` so
 * Invoices, Expenses and Assets get the identical thing rather than three
 * more copies that drift apart.
 *
 * The module supplies data and one `onImport`; everything on screen is here.
 */
export function BulkImportDialog({
  spec,
  open,
  onOpenChange,
  onImport,
  /**
   * Rendered under the Review table — for a module that has something extra
   * to say about its rows, like which categories a file didn't match. Kept to
   * a slot rather than baked in, since most modules have nothing to add.
   */
  reviewFooter,
  /** Blocks the import while the module's own reference data is still loading. */
  busy = false,
  busyLabel,
  /** Extra classes for the modal, e.g. a wider `sm:max-w-*` for a module with many columns. */
  contentClassName,
  compactIssues = false,
  page = false,
  exitHref = "/migrations",
  exitLabel = "Data Migration Center",
  moduleName,
}: {
  spec: BulkImportSpec;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: BulkRow[]) => Promise<BulkImportResult>;
  reviewFooter?: React.ReactNode;
  busy?: boolean;
  busyLabel?: string;
  contentClassName?: string;
  /**
   * Collapses the error summary to one line — the count and the download
   * button — for a module whose Review cells already say what's wrong, so the
   * grouped list would only repeat them.
   */
  compactIssues?: boolean;
  /**
   * Render as a full page instead of a modal — the Data Migration Center opens
   * each importer this way, as the bank transactions one does. `open` is
   * ignored; leaving (cancel, done) goes to `exitHref`.
   */
  page?: boolean;
  exitHref?: string;
  exitLabel?: string;
  /**
   * The module's name in analytics when the spec's noun isn't it — products
   * import "items", but the module people know is "Product & services".
   */
  moduleName?: string;
}) {
  const router = useRouter();
  const recordImport = useMigrationsStore((state) => state.recordImport);
  const pathname = usePathname();
  const moduleContext = bulkModuleContext(
    pathname ?? "",
    moduleName ?? sectionName(spec.nounPlural),
  );
  // As a page (from Migrations) there is no dialog to open: arriving is the start.
  useTrackOnOpen(EVENTS.BULK_UPLOAD_INITIATED, open || page, moduleContext);

  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  /**
   * The picked file. Nothing is sent until Continue — picking only checks
   * it's a CSV/Excel under 5 MB, so someone can swap files without a wasted
   * AI call on each.
   */
  const [file, setFile] = React.useState<File | null>(null);
  const [rows, setRows] = React.useState<BulkRow[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  /** What the server said the import did. Drives the results dialog. */
  const [result, setResult] = React.useState<BulkImportResult | null>(null);
  const [importing, setImporting] = React.useState(false);

  const aiTarget = React.useMemo(() => aiTargetFromBulkSpec(spec), [spec]);
  const fileReader = useImportFileReader(aiTarget);

  /*
   * The spec can change under an open dialog — the chart of accounts or the
   * business's country context landing — and rows checked against the old one
   * would keep its verdicts: an NZBN judged as an ABN, a category judged
   * against an empty list. Re-checked here; the values are untouched.
   */
  React.useEffect(() => {
    setRows((current) =>
      current.length === 0
        ? current
        : current.map((row) => withBulkIssues(spec, row)),
    );
  }, [spec]);

  const cleanRows = rows.filter((row) => row.issues.length === 0);
  const issueRows = rows.filter((row) => row.issues.length > 0);

  const reset = () => {
    fileReader.cancel();
    setStep(1);
    setFile(null);
    setRows([]);
    setParseError(null);
    setResult(null);
    setImporting(false);
  };

  const close = () => {
    if (page) {
      router.push(exitHref);
      return;
    }
    onOpenChange(false);
    reset();
  };

  /**
   * Picking a file is the whole Import step: once it passes the type and size
   * check, Claude reformats it into this spec's columns (see
   * `lib/ai-format.ts`), falling back to a plain parse if that fails, and the
   * wizard goes straight to Review. Columns are matched to fields by name —
   * there's no mapping step to correct that, so Review's inline edit is where
   * a wrong guess gets fixed.
   */
  const pickFile = async (selected: File) => {
    fileReader.cancel();
    setRows([]);
    const invalid = importFileError(selected);
    setFile(invalid ? null : selected);
    setParseError(invalid);
    if (invalid) return;
    track(EVENTS.FILE_UPLOADED, moduleContext);

    const result = await fileReader.read(selected);
    if (!result) return;
    if (!result.ok) {
      setParseError(result.error);
      return;
    }

    const { columns, rows: sheetRows } = result.sheet;
    const guessed = autoMapBulkColumns(spec, columns);
    setRows(buildBulkRows(spec, columns, sheetRows, guessed));
    // Columns are matched to fields automatically now, so mapping and arriving
    // at Review happen together.
    track(EVENTS.DATA_MAPPED, {
      section_name: moduleContext.module_name,
      sub_module_name: moduleContext.sub_module_name,
    });
    track(EVENTS.DATA_REVIEW_INITIATED, moduleContext);
    setStep(2);
  };

  /**
   * Drops a row from the import.
   *
   * sole-webapp's review table carries Delete beside Edit on every row, and
   * it's the only way to get rid of a row you don't want without going back
   * to the spreadsheet — a row with no *errors* can still be one you didn't
   * mean to bring across. `index` stays as the file's own row number so the
   * numbering keeps pointing at the source file after a delete.
   */
  const deleteRow = (index: number) =>
    setRows((current) => current.filter((row) => row.index !== index));

  /** Inline edit on the Review step — re-validates so status updates live. */
  const updateRow = (index: number, values: BulkValues) => {
    setRows((current) =>
      current.map((row) =>
        row.index === index
          ? withBulkIssues(spec, { ...row, values: { ...row.values, ...values } })
          : row,
      ),
    );
  };

  const nothingToImport = step === 2 && cleanRows.length === 0;
  const continueDisabled = fileReader.formatting || importing || busy;

  const onContinue = async () => {
    if (continueDisabled || nothingToImport) return;

    if (step === 3) {
      close();
      return;
    }

    if (step === 2) {
      setImporting(true);
      try {
        const outcome = await onImport(cleanRows);
        // Rows still carrying errors were never sent. Counted on their own —
        // not as "skipped", which means the server already had them — so the
        // results still add up to the file someone uploaded.
        setResult({ ...outcome, invalid: issueRows.length });
        // The Data Migration Center ticks this module's step off this.
        if (spec.migrationStep) recordImport(spec.migrationStep, outcome.created);
        track(EVENTS.DATA_IMPORTED, {
          ...moduleContext,
          count: outcome.created,
        });
        setStep(3);
      } catch (error) {
        toast.error(
          apiErrorMessage(error, `Failed to import ${spec.nounPlural}.`),
        );
      } finally {
        setImporting(false);
      }
    }
  };

  const body = (
    <>
      {step === 1 && (
        <ImportStep
          spec={spec}
          file={file}
          busyLabel={busy ? (busyLabel ?? "Loading…") : null}
          formatting={fileReader.formatting}
          parseError={parseError}
          onFile={pickFile}
          onRemove={() => {
            fileReader.cancel();
            setFile(null);
            setRows([]);
            setParseError(null);
          }}
        />
      )}
      {step === 2 && (
        <ReviewStep
          spec={spec}
          rows={rows}
          cleanCount={cleanRows.length}
          issueCount={issueRows.length}
          onRowChange={updateRow}
          onRowDelete={deleteRow}
          footer={reviewFooter}
          compactIssues={compactIssues}
        />
      )}
      {step === 3 && <DoneStep spec={spec} result={result} />}
    </>
  );

  /** Nothing to continue with on Import — choosing a file is the action. */
  const actions = (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {step === 2 && (
          <Button variant="outline" onClick={reset}>
            Choose a different file
          </Button>
        )}
        {nothingToImport ? (
          // A disabled Import button is a dead end — say why instead.
          <p className="max-w-xs text-xs text-muted-foreground">
            No rows can be imported yet — fix the errors above or upload a
            different file.
          </p>
        ) : (
          step > 1 && (
            <Button
              onClick={onContinue}
              disabled={continueDisabled}
              data-usertour="bulk-continue"
            >
              {step === 2 && importing
                ? "Importing…"
                : step === 2 && busy && busyLabel
                  ? busyLabel
                  : step === 2
                    ? `Import ${spec.nounPlural}`
                    : "Done"}
            </Button>
          )
        )}
      </div>
    </>
  );

  const showingResults = step === 3 && result !== null;

  const results = (
    /*
      The results dialog, over the top of the Done step.

      A count alone can't say "nothing imported because all three rows
      already existed" — that reads as a failure when nothing went wrong.
      This is where the server's own per-row answer gets shown.
    */
    <BulkResultsDialog
      open={showingResults}
      onOpenChange={(next) => !next && close()}
      result={result}
      fileName={file?.name}
      noun={spec.noun}
      nounPlural={spec.nounPlural}
      onDone={close}
    />
  );

  if (page) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href={exitHref}>
              <ArrowLeft />
              {exitLabel}
            </Link>
          </Button>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {spec.title}
            </h1>
            <p className="text-sm text-muted-foreground">{spec.description}</p>
          </div>
        </div>

        <WizardStepper steps={STEPS.map((item) => item.label)} current={step - 1} />

        <div className="space-y-6">{body}</div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button variant="ghost" onClick={close}>
            {step === 3 ? "Close" : "Cancel"}
          </Button>
          {actions}
        </div>

        {results}
      </div>
    );
  }

  return (
    <Dialog open={open && !showingResults} onOpenChange={(next) => !next && close()}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl",
          contentClassName,
        )}
      >
        <DialogHeader className="space-y-1 border-b p-6 text-left">
          <DialogTitle>{spec.title}</DialogTitle>
          <DialogDescription>{spec.description}</DialogDescription>
        </DialogHeader>

        <Stepper current={step} />

        <div className="min-h-0 flex-1 overflow-y-auto p-6">{body}</div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t bg-muted/40 p-4 sm:justify-between">
          <Button variant="ghost" onClick={close}>
            {step === 3 ? "Close" : "Cancel"}
          </Button>
          {actions}
        </DialogFooter>
      </DialogContent>

      {results}
    </Dialog>
  );
}

/** Consistent typographic contrast for every region heading in the wizard. */
function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-base font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-6 py-3">
      {STEPS.map((step, index) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <React.Fragment key={step.n}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  done || active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" aria-hidden /> : step.n}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active
                    ? "font-medium"
                    : done
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <Separator className="w-6 shrink-0" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ImportStep({
  spec,
  file,
  busyLabel,
  formatting,
  parseError,
  onFile,
  onRemove,
}: {
  spec: BulkImportSpec;
  file: { name: string; size: number } | null;
  /**
   * Set while the module's reference data (the chart of accounts) is loading.
   * A file picked now would be formatted and checked against an empty list, so
   * the drop zone waits.
   */
  busyLabel: string | null;
  formatting: boolean;
  parseError: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const required = spec.fields.filter((field) => field.required);

  return (
    <div className="space-y-6" data-usertour="bulk-upload">
      <SectionHeading
        title={`Upload your ${spec.nounPlural}`}
        description="A CSV or Excel export from your existing system. We'll read it as soon as you add it."
      />

      <div data-usertour="bulk-dropzone">
        {busyLabel ? (
          <div
            className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4"
            role="status"
          >
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">{busyLabel}</p>
          </div>
        ) : file && formatting ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground tabular">
                {formatBytes(file.size)} · Formatting with AI…
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onRemove}
              aria-label="Cancel upload"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) onFile(dropped);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed bg-muted/30 px-6 py-10 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40",
            )}
          >
            <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
              <Upload className="size-5" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <p className="text-sm text-muted-foreground">
                Drop your file here, or
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                Choose file
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              CSV or Excel up to 5 MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={IMPORT_FILE_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) onFile(selected);
                event.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      {parseError && <p className="text-xs text-destructive">{parseError}</p>}

      {required.length > 0 && (
        <div className="space-y-3">
          <SectionHeading title="Required fields" />
          <dl className="grid gap-x-8 gap-y-2.5 rounded-lg border bg-muted/40 p-4 sm:grid-cols-2">
            {required.map((field) => (
              <div key={field.label} className="text-sm">
                <dt className="inline">
                  {fieldDisplay(field)}
                  <span className="ml-0.5 text-destructive" aria-hidden>
                    *
                  </span>
                </dt>
                {field.desc && (
                  <dd className="ml-2 inline text-xs text-muted-foreground">
                    {field.desc}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function ReviewStep({
  spec,
  rows,
  cleanCount,
  issueCount,
  onRowChange,
  onRowDelete,
  footer,
  compactIssues,
}: {
  spec: BulkImportSpec;
  rows: BulkRow[];
  cleanCount: number;
  issueCount: number;
  onRowChange: (index: number, values: BulkValues) => void;
  onRowDelete: (index: number) => void;
  footer?: React.ReactNode;
  compactIssues: boolean;
}) {
  const [editing, setEditing] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<BulkValues | null>(null);
  /**
   * The cell to put the cursor in once a row opens for editing. `n` counts the
   * requests, so asking for the same cell twice — Save refused on a field that
   * is still wrong — focuses it again.
   */
  const [focusRequest, setFocusRequest] = React.useState<{
    field: string;
    n: number;
  } | null>(null);
  const rowRefs = React.useRef<Record<number, HTMLTableRowElement | null>>({});

  const groups = groupBulkIssues(spec, rows);
  const columns = reviewFields(spec);

  const requestFocus = (field: string) =>
    setFocusRequest((current) => ({ field, n: (current?.n ?? 0) + 1 }));

  React.useEffect(() => {
    if (editing === null || !focusRequest) return;
    // After the row has swapped its cells for editors.
    const frame = requestAnimationFrame(() => {
      const control = rowRefs.current[editing]?.querySelector<HTMLElement>(
        `[data-bulk-field="${CSS.escape(focusRequest.field)}"]`,
      );
      control?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, focusRequest]);

  /**
   * Opens a row for editing with the cursor where the problem is: the cell
   * that was clicked, else the first cell in error, else the first cell.
   */
  const startEdit = (row: BulkRow, focusField?: string) => {
    setEditing(row.index);
    const next: BulkValues = {};
    for (const field of columns) {
      next[field.label] = bulkEditorSeed(field, row.values[field.label] ?? "");
    }
    setDraft(next);

    const errors = bulkFieldErrors(spec, row.values);
    const target =
      columns.find((field) => field.label === focusField) ??
      columns.find((field) => errors[field.label]) ??
      columns[0];
    if (target) requestFocus(target.label);

    // The edit may have been triggered from the grouped summary above.
    requestAnimationFrame(() =>
      rowRefs.current[row.index]?.scrollIntoView({ block: "nearest" }),
    );
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft(null);
  };

  /** What's wrong with the row as it stands in the editors, live as they type. */
  const editingRow =
    editing === null ? null : (rows.find((row) => row.index === editing) ?? null);
  const draftErrors =
    editingRow && draft
      ? bulkFieldErrors(spec, { ...editingRow.values, ...draft })
      : {};

  /**
   * Saving a row that's still wrong would only put it back on the error list,
   * so it stays open instead, with the cursor on the first cell to fix. Only
   * fields that have an editor count — a problem in one that doesn't would be
   * a row nobody could ever save.
   */
  const saveEdit = () => {
    if (editing === null || !draft) return;
    const blocking = columns.find((field) => draftErrors[field.label]);
    if (blocking) {
      requestFocus(blocking.label);
      return;
    }
    onRowChange(editing, draft);
    cancelEdit();
  };

  const patch = (values: BulkValues) =>
    setDraft((current) => (current ? { ...current, ...values } : current));

  const downloadErrors = () => {
    downloadCsv(spec.errorsFilename, bulkErrorRowsCsv(spec, rows));
    toast.success("Rows with errors downloaded");
  };

  return (
    <div className="space-y-4" data-usertour="bulk-review">
      <SectionHeading
        title="Review before import"
        description="Check each row, edit anything that looks off, then import. Rows with errors are skipped."
      />

      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total rows" value={rows.length} />
        <Stat label="Ready to import" value={cleanCount} tone="success" />
        <Stat label="Need attention" value={issueCount} tone="warning" />
      </dl>

      {groups.length > 0 && (
        <div
          className={cn(
            "rounded-lg border border-warning/40 bg-warning/5",
            compactIssues ? "px-3 py-2" : "space-y-3 p-4",
          )}
        >
          <div
            className={cn(
              "flex flex-wrap justify-between gap-3",
              compactIssues ? "items-center" : "items-start",
            )}
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium tabular">
                {issueCount} {issueCount === 1 ? "row needs" : "rows need"}{" "}
                attention
              </p>
              <p className="text-xs text-muted-foreground">
                {compactIssues
                  ? "Rows with errors will be skipped if you import."
                  : "Fix them inline below, or download them to fix in a spreadsheet and re-upload."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={compactIssues ? "h-7 text-xs" : undefined}
              onClick={downloadErrors}
            >
              <Download />
              Download rows with errors
            </Button>
          </div>

          {/* One line per issue, not the same sentence on every row. */}
          {!compactIssues && (
          <ul className="space-y-0.5">
            {groups.map((group) => (
              <li key={group.message}>
                <Collapsible>
                  <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm hover:bg-warning/10">
                    <ChevronRight
                      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
                      aria-hidden
                    />
                    <span className="tabular">{group.headline}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 py-1 pl-6">
                    {group.rows.map((row) => (
                      <div
                        key={row.index}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="truncate text-muted-foreground">
                          Row {row.index + 1}
                          {row.values[spec.rowLabelField]
                            ? ` — ${row.values[spec.rowLabelField]}`
                            : ""}
                        </span>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto shrink-0 p-0 text-xs"
                          onClick={() => startEdit(row, group.field)}
                        >
                          Edit
                        </Button>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
          )}
        </div>
      )}

      {/*
        The height cap goes on the table's own scroll container, not a wrapper
        around it: with two nested scrollers the sideways bar belonged to the
        inner one and sat at the bottom of the whole table, out of sight until
        you scrolled down. One container keeps it at the bottom of what's
        visible.
      */}
      <div
        className="overflow-hidden rounded-lg border"
        data-usertour="bulk-review-table"
      >
        <Table
          containerClassName="scrollbar-visible max-h-[26rem]"
          className={columns.length > 8 ? "min-w-[1100px]" : "min-w-[860px]"}
        >
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              {columns.map((field) => (
                <TableHead key={field.label}>{field.review?.heading}</TableHead>
              ))}
              <TableHead>Status</TableHead>
              <TableHead className={cn("text-right", PINNED_ACTIONS_HEAD)}>
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isEditing = editing === row.index && draft !== null;
              // Only rows with problems pay for the check.
              const fieldErrors =
                row.issues.length > 0 ? bulkFieldErrors(spec, row.values) : {};
              return (
                <TableRow
                  key={row.index}
                  ref={(node) => {
                    rowRefs.current[row.index] = node;
                  }}
                  className={cn("group/row", isEditing && "bg-primary/[0.03]")}
                >
                  <TableCell className="text-muted-foreground tabular">
                    {row.index + 1}
                  </TableCell>

                  {isEditing && draft ? (
                    <>
                      {columns.map((field) => (
                        <TableCell
                          key={field.label}
                          className={cn("align-top", field.review?.editWidth)}
                        >
                          <CellEditor
                            field={field}
                            rowNumber={row.index + 1}
                            value={draft[field.label] ?? ""}
                            error={draftErrors[field.label]}
                            onChange={(value) =>
                              patch({ [field.label]: value })
                            }
                            onSubmit={saveEdit}
                            onCancel={cancelEdit}
                          />
                        </TableCell>
                      ))}
                      <TableCell />
                      <TableCell
                        className={cn(
                          "text-right align-top",
                          PINNED_ACTIONS_CELL_EDITING,
                        )}
                      >
                        <div className="flex justify-end gap-1">
                          <Button size="sm" className="h-8" onClick={saveEdit}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      {columns.map((field, columnIndex) => {
                        const text = bulkCellText(spec, row.values, field.label);
                        const fieldError = fieldErrors[field.label];
                        const bad = fieldError !== undefined;
                        const editor = field.review?.editor;
                        const emptyChoice =
                          editor?.kind === "choice" &&
                          !(row.values[field.label] ?? "").trim();
                        return (
                          <TableCell
                            key={field.label}
                            className={cn(
                              // The first column is the row's name — it carries
                              // the weight, the rest recede.
                              columnIndex === 0
                                ? "font-medium"
                                : "text-muted-foreground",
                              field.review?.mono && "tabular",
                            )}
                          >
                            {emptyChoice ? (
                              /*
                                An empty dropdown field is the dropdown itself,
                                not a message about one: the AI had no match, so
                                the person picks straight from the cell.
                              */
                              <BulkChoiceSelect
                                options={editor.options}
                                value=""
                                onChange={(value) =>
                                  onRowChange(row.index, { [field.label]: value })
                                }
                                placeholder={editor.placeholder}
                                attention
                                label={`${fieldDisplay(field)}, row ${row.index + 1}`}
                                field={field.label}
                              />
                            ) : bad && editor?.kind === "select" ? (
                              /*
                                A Yes/No or other fixed-choice cell that's wrong
                                is the dropdown itself, with what to do in red,
                                so it's one click to put right.
                              */
                              <Select
                                value=""
                                onValueChange={(value) =>
                                  onRowChange(row.index, {
                                    [field.label]: value,
                                  })
                                }
                              >
                                <SelectTrigger
                                  className="h-8 data-[placeholder]:text-destructive"
                                  aria-label={`${fieldDisplay(field)}, row ${row.index + 1}`}
                                  data-bulk-field={field.label}
                                >
                                  <SelectValue placeholder={fieldError} />
                                </SelectTrigger>
                                <SelectContent>
                                  {editor.options.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : bad ? (
                              /*
                                The cell that's at fault says what's wrong with
                                it and is itself the way in: click it (or Tab to
                                it and press Enter) and the row opens with the
                                cursor in this field.
                              */
                              <button
                                type="button"
                                onClick={() => startEdit(row, field.label)}
                                aria-label={`Fix ${fieldDisplay(field)}, row ${row.index + 1}: ${fieldError}`}
                                className="block w-full cursor-pointer rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <span className="block">{text || "—"}</span>
                                <span className="mt-0.5 block text-xs font-normal text-destructive">
                                  {fieldError}
                                </span>
                              </button>
                            ) : text ? (
                              text
                            ) : field.review?.empty ? (
                              <span className="text-xs italic text-muted-foreground/70">
                                {field.review.empty}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        {row.issues.length === 0 ? (
                          <Badge variant="success">Ready</Badge>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                aria-label={`Fix row ${row.index + 1}: ${row.issues.join("; ")}`}
                                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <Badge variant="warning" className="tabular">
                                  {row.issues.length}{" "}
                                  {row.issues.length === 1 ? "error" : "errors"}
                                </Badge>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-64">
                              <ul className="space-y-0.5">
                                {row.issues.map((message) => (
                                  <li key={message}>{message}</li>
                                ))}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      {/*
                        Edit on every row, not only the broken ones. The
                        column used to be empty for anything valid, which
                        made a clean row look uneditable — sole-webapp lets
                        you open any of them, and a row that passes
                        validation can still be wrong.
                      */}
                      <TableCell
                        className={cn("text-right", PINNED_ACTIONS_CELL)}
                      >
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-foreground"
                                onClick={() => startEdit(row)}
                                aria-label={`Edit row ${row.index + 1}`}
                              >
                                <Pencil />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Edit</TooltipContent>
                          </Tooltip>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => onRowDelete(row.index)}
                            aria-label={`Remove row ${row.index + 1}`}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {footer}
    </div>
  );
}

/**
 * One Review cell in edit mode.
 *
 * Every control carries `data-bulk-field` so Review can put the cursor in the
 * one that's wrong, and — when it is wrong — a red border, `aria-invalid`, and
 * the reason underneath, tied to it with `aria-describedby`. Enter saves and
 * Escape cancels from a text box; the dropdowns keep those keys for themselves.
 */
function CellEditor({
  field,
  rowNumber,
  value,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  field: BulkField;
  rowNumber: number;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const editor = field.review?.editor;
  const label = `${fieldDisplay(field)}, row ${rowNumber}`;
  const errorId = React.useId();
  const invalid = Boolean(error);
  const invalidClass = "border-destructive focus-visible:ring-destructive";

  let control: React.ReactNode;
  if (editor?.kind === "choice") {
    control = (
      <BulkChoiceSelect
        options={editor.options}
        value={value}
        onChange={onChange}
        placeholder={editor.placeholder}
        invalid={invalid}
        describedBy={invalid ? errorId : undefined}
        label={label}
        field={field.label}
      />
    );
  } else if (editor?.kind === "select") {
    control = (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className={cn("h-8", invalid && invalidClass)}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          data-bulk-field={field.label}
        >
          <SelectValue placeholder={editor.placeholder ?? "Select"} />
        </SelectTrigger>
        <SelectContent>
          {editor.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else {
    control = (
      <Input
        className={cn("h-8", invalid && invalidClass)}
        inputMode={editor?.kind === "text" ? editor.inputMode : undefined}
        placeholder={field.review?.empty}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        data-bulk-field={field.label}
      />
    );
  }

  return (
    <div className="space-y-1">
      {control}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning";
}) {
  return (
    <div className="rounded-md border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-xl font-semibold tabular",
          tone === "success" && value > 0 && "text-success",
          tone === "warning" && value > 0 && "text-warning",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * What sits behind the results dialog.
 *
 * Deliberately a summary rather than the full breakdown — the dialog in
 * front of it carries that, and this is what someone sees for the moment
 * between the import landing and the dialog painting, and again if they
 * dismiss the dialog with Escape.
 */
function DoneStep({
  spec,
  result,
}: {
  spec: BulkImportSpec;
  result: BulkImportResult | null;
}) {
  const created = result?.created ?? 0;
  const skipped =
    (result?.skipped ?? 0) + (result?.failed ?? 0) + (result?.invalid ?? 0);

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Check className="size-5 text-success" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium tabular">
          {created} {created === 1 ? spec.noun : spec.nounPlural} imported
        </p>
        {skipped > 0 && (
          <p className="text-sm text-muted-foreground tabular">
            {skipped} {skipped === 1 ? "row" : "rows"} not imported.
          </p>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
