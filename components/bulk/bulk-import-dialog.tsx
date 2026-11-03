"use client";

import * as React from "react";
import {
  Check,
  ChevronRight,
  Download,
  FileText,
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
  DO_NOT_IMPORT,
  autoMapBulkColumns,
  buildBulkRows,
  bulkErrorRowsCsv,
  bulkTemplateCsv,
  duplicateBulkMappings,
  fieldDisplay,
  fieldOptions,
  groupBulkIssues,
  labelDisplay,
  reviewFields,
  withBulkIssues,
  type BulkField,
  type BulkImportResult,
  type BulkImportSpec,
  type BulkRow,
  type BulkValues,
} from "@/lib/bulk-import";
import {
  IMPORT_FILE_ACCEPT,
  downloadCsv,
  type ParsedSheet,
} from "@/lib/file-parser";
import { aiTargetFromBulkSpec, importFileError } from "@/lib/ai-format";
import { BulkResultsDialog } from "@/components/bulk/bulk-results-dialog";
import { useImportFileReader } from "@/components/bulk/use-import-file-reader";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useMigrationsStore } from "@/stores/migrations";

const STEPS = [
  { n: 1, label: "Import" },
  { n: 2, label: "Map data" },
  { n: 3, label: "Review" },
  { n: 4, label: "Done" },
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
}: {
  spec: BulkImportSpec;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: BulkRow[]) => Promise<BulkImportResult>;
  reviewFooter?: React.ReactNode;
  busy?: boolean;
  busyLabel?: string;
}) {
  const recordImport = useMigrationsStore((state) => state.recordImport);

  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);
  /**
   * The picked file. Nothing is sent until Continue — picking only checks
   * it's a CSV/Excel under 5 MB, so someone can swap files without a wasted
   * AI call on each.
   */
  const [file, setFile] = React.useState<File | null>(null);
  /** The workbook as read — kept so the Map step can re-derive rows. */
  const [sheet, setSheet] = React.useState<ParsedSheet | null>(null);
  const [rows, setRows] = React.useState<BulkRow[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  /** File column index to field label, seeded by `autoMapBulkColumns`. */
  const [mapping, setMapping] = React.useState<Record<number, string>>({});
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
    setSheet(null);
    setRows([]);
    setParseError(null);
    setMapping({});
    setResult(null);
    setImporting(false);
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  /** Holds the chosen file until Continue; a new pick drops the old read. */
  const pickFile = (selected: File) => {
    fileReader.cancel();
    setSheet(null);
    setRows([]);
    setMapping({});
    const invalid = importFileError(selected);
    setFile(invalid ? null : selected);
    setParseError(invalid);
  };

  /**
   * Continue on the Import step — Claude reformats the file into this spec's
   * columns (see `lib/ai-format.ts`), falling back to a plain parse if that
   * fails, then goes straight to Map.
   */
  const formatFile = async (selected: File) => {
    setParseError(null);

    const result = await fileReader.read(selected);
    if (!result) return;
    if (!result.ok) {
      setParseError(result.error);
      return;
    }

    const { columns, rows: sheetRows } = result.sheet;
    const guessed = autoMapBulkColumns(spec, columns);
    setSheet(result.sheet);
    setMapping(guessed);
    setRows(buildBulkRows(spec, columns, sheetRows, guessed));
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

  const nothingToImport = step === 3 && cleanRows.length === 0;
  const continueDisabled =
    (step === 1 && !file) ||
    fileReader.formatting ||
    importing ||
    busy;

  const continueLabels = [
    // Already formatted (they came Back) — Continue just returns to Map.
    sheet ? "Continue to map data" : "Format & continue",
    "Continue to review",
    `Import ${spec.nounPlural}`,
    "Done",
  ];

  const onContinue = async () => {
    if (continueDisabled || nothingToImport) return;

    if (step === 4) {
      close();
      return;
    }

    if (step === 1 && file) {
      if (sheet) setStep(2);
      else await formatFile(file);
      return;
    }

    if (step === 2 && sheet) {
      // Two columns on the same field is the one mapping that can't be
      // resolved for someone — it would take whichever came last.
      const duplicates = duplicateBulkMappings(mapping);
      if (duplicates.length > 0) {
        toast.error(
          `${duplicates.map((label) => labelDisplay(spec, label)).join(" and ")} ${duplicates.length === 1 ? "is" : "are"} mapped to more than one column.`,
        );
        return;
      }
      setRows(buildBulkRows(spec, sheet.columns, sheet.rows, mapping));
      setStep(3);
      return;
    }

    if (step === 3) {
      setImporting(true);
      try {
        const outcome = await onImport(cleanRows);
        // Rows the file itself couldn't offer are skipped too — they weren't
        // imported, and leaving them out makes the tiles not add up to the
        // file someone uploaded.
        setResult({
          ...outcome,
          skipped: outcome.skipped + issueRows.length,
        });
        // The Data Migration Center ticks this module's step off this.
        recordImport(spec.migrationStep, outcome.created);
        setStep(4);
      } catch (error) {
        toast.error(
          apiErrorMessage(error, `Failed to import ${spec.nounPlural}.`),
        );
      } finally {
        setImporting(false);
      }
      return;
    }

    setStep((step + 1) as 1 | 2 | 3 | 4);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="space-y-1 border-b p-6 text-left">
          <DialogTitle>{spec.title}</DialogTitle>
          <DialogDescription>{spec.description}</DialogDescription>
        </DialogHeader>

        <Stepper current={step} />

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <ImportStep
              spec={spec}
              file={file}
              rowCount={rows.length}
              parseError={parseError}
              onFile={pickFile}
              onRemove={() => {
                fileReader.cancel();
                setFile(null);
                setSheet(null);
                setRows([]);
                setParseError(null);
              }}
            />
          )}
          {step === 2 && sheet && (
            <MapStep
              spec={spec}
              columns={sheet.columns}
              firstRow={sheet.rows[0]}
              mapping={mapping}
              onChange={setMapping}
            />
          )}
          {step === 3 && (
            <ReviewStep
              spec={spec}
              rows={rows}
              cleanCount={cleanRows.length}
              issueCount={issueRows.length}
              onRowChange={updateRow}
              onRowDelete={deleteRow}
              footer={reviewFooter}
            />
          )}
          {step === 4 && <DoneStep spec={spec} result={result} />}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t bg-muted/40 p-4 sm:justify-between">
          <Button variant="ghost" onClick={close}>
            {step === 4 ? "Close" : "Cancel"}
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(step === 2 || step === 3) && (
              <Button
                variant="outline"
                onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}
              >
                Back
              </Button>
            )}
            {step === 3 && (
              <Button variant="outline" onClick={reset}>
                Choose a different file
              </Button>
            )}
            {/* A disabled Import button is a dead end — say why instead. */}
            {nothingToImport ? (
              <p className="max-w-xs text-xs text-muted-foreground">
                No rows can be imported yet — fix the errors above or upload a
                different file.
              </p>
            ) : (
              <Button onClick={onContinue} disabled={continueDisabled}>
                {step === 1 && fileReader.formatting
                  ? "Formatting with AI…"
                  : step === 3 && importing
                    ? "Importing…"
                    : step === 3 && busy && busyLabel
                      ? busyLabel
                      : continueLabels[step - 1]}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      {/*
        The results dialog, over the top of step 4.

        A count alone can't say "nothing imported because all three rows
        already existed" — that reads as a failure when nothing went wrong.
        This is where the server's own per-row answer gets shown, and it's
        why the toast that used to fire here is gone: a toast can't hold it.
      */}
      <BulkResultsDialog
        open={step === 4 && result !== null}
        onOpenChange={(next) => !next && close()}
        result={result}
        fileName={file?.name}
        noun={spec.noun}
        nounPlural={spec.nounPlural}
        onDone={close}
      />
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
  rowCount,
  parseError,
  onFile,
  onRemove,
}: {
  spec: BulkImportSpec;
  file: { name: string; size: number } | null;
  rowCount: number;
  parseError: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const documented = spec.fields.filter((field) => field.desc);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          title={`Upload your ${spec.nounPlural}`}
          description={`A CSV or Excel export from your existing system.`}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // A real file with the real headers — the columns someone fills
            // in here are the ones the Map step will recognise coming back.
            downloadCsv(spec.templateFilename, bulkTemplateCsv(spec));
            toast.success("Template downloaded");
          }}
        >
          <Download />
          Download template
        </Button>
      </div>

      {file ? (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground tabular">
              {formatBytes(file.size)}
              {rowCount > 0 && ` · ${rowCount} rows found`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onRemove}
            aria-label="Remove file"
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

      {parseError && <p className="text-xs text-destructive">{parseError}</p>}

      <div className="space-y-3">
        <SectionHeading
          title="Example of CSV structure"
          description="Scroll to see all columns →"
        />
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {spec.templateColumns.map((column) => (
                  <TableHead key={column} className="whitespace-nowrap">
                    {labelDisplay(spec, column)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {spec.sampleRows.map((row, index) => (
                <TableRow key={index}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      className="whitespace-nowrap text-muted-foreground"
                    >
                      {cell || "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <SectionHeading title="Fields" />
        <dl className="grid gap-x-8 gap-y-2.5 rounded-lg border bg-muted/40 p-4 sm:grid-cols-2">
          {documented.map((field) => (
            <div
              key={field.label}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="text-sm">
                {fieldDisplay(field)}
                {field.required && (
                  <span className="ml-0.5 text-destructive" aria-hidden>
                    *
                  </span>
                )}
                <span className="ml-2 text-xs text-muted-foreground">
                  {field.desc}
                </span>
              </dt>
              <dd className="shrink-0 text-xs text-muted-foreground">
                {field.required ? "Required" : ""}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/**
 * One row per column that's actually in the uploaded file.
 *
 * Listing the template's columns instead, and reading cells by position, is
 * what made a reordered export import one field's values into another without
 * ever saying so.
 */
function MapStep({
  spec,
  columns,
  firstRow,
  mapping,
  onChange,
}: {
  spec: BulkImportSpec;
  columns: string[];
  firstRow: Record<string, string> | undefined;
  mapping: Record<number, string>;
  onChange: (next: Record<number, string>) => void;
}) {
  const options = fieldOptions(spec);

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Map your columns"
        description="Match each column in your file to a Sole field."
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column in your file</TableHead>
              <TableHead>Sample</TableHead>
              <TableHead className="w-[200px]">Sole field</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((column, index) => (
              <TableRow key={`${column}-${index}`}>
                <TableCell className="font-medium">{column}</TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {firstRow?.[column] || "—"}
                </TableCell>
                <TableCell>
                  <Select
                    value={mapping[index] ?? DO_NOT_IMPORT}
                    onValueChange={(value) =>
                      onChange({ ...mapping, [index]: value })
                    }
                  >
                    <SelectTrigger aria-label={`Sole field for ${column}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {labelDisplay(spec, option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
}: {
  spec: BulkImportSpec;
  rows: BulkRow[];
  cleanCount: number;
  issueCount: number;
  onRowChange: (index: number, values: BulkValues) => void;
  onRowDelete: (index: number) => void;
  footer?: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<BulkValues | null>(null);
  const rowRefs = React.useRef<Record<number, HTMLTableRowElement | null>>({});

  const groups = groupBulkIssues(spec, rows);
  const columns = reviewFields(spec);

  const startEdit = (row: BulkRow) => {
    setEditing(row.index);
    const next: BulkValues = {};
    for (const field of columns) {
      const value = row.values[field.label] ?? "";
      // A select whose value isn't one of its options would render blank and
      // then silently write that blank back on save, so an unrecognised value
      // becomes "" up front and the placeholder shows instead.
      next[field.label] =
        field.review?.editor.kind === "select" &&
        !field.review.editor.options.some(
          (option) => option.toLowerCase() === value.trim().toLowerCase(),
        )
          ? ""
          : value;
    }
    setDraft(next);
    // The edit may have been triggered from the grouped summary above.
    requestAnimationFrame(() =>
      rowRefs.current[row.index]?.scrollIntoView({ block: "nearest" }),
    );
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (editing === null || !draft) return;
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
    <div className="space-y-4">
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
        <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium tabular">
                {issueCount} {issueCount === 1 ? "row needs" : "rows need"}{" "}
                attention
              </p>
              <p className="text-xs text-muted-foreground">
                Fix them inline below, or download them to fix in a spreadsheet
                and re-upload.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadErrors}>
              <Download />
              Download rows with errors
            </Button>
          </div>

          {/* One line per issue, not the same sentence on every row. */}
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
                          onClick={() => startEdit(row)}
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
        </div>
      )}

      <div className="max-h-72 overflow-auto rounded-lg border">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              {columns.map((field) => (
                <TableHead key={field.label}>{field.review?.heading}</TableHead>
              ))}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isEditing = editing === row.index && draft !== null;
              return (
                <TableRow
                  key={row.index}
                  ref={(node) => {
                    rowRefs.current[row.index] = node;
                  }}
                  className={cn(isEditing && "bg-primary/[0.03]")}
                >
                  <TableCell className="text-muted-foreground tabular">
                    {row.index + 1}
                  </TableCell>

                  {isEditing && draft ? (
                    <>
                      {columns.map((field) => (
                        <TableCell key={field.label}>
                          <CellEditor
                            field={field}
                            rowNumber={row.index + 1}
                            value={draft[field.label] ?? ""}
                            onChange={(value) =>
                              patch({ [field.label]: value })
                            }
                          />
                        </TableCell>
                      ))}
                      <TableCell />
                      <TableCell className="text-right">
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
                      {columns.map((field, columnIndex) => (
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
                          {row.values[field.label] || "—"}
                        </TableCell>
                      ))}
                      <TableCell>
                        {row.issues.length === 0 ? (
                          <Badge variant="success">Ready</Badge>
                        ) : (
                          <Badge variant="warning" className="tabular">
                            {row.issues.length}{" "}
                            {row.issues.length === 1 ? "error" : "errors"}
                          </Badge>
                        )}
                      </TableCell>
                      {/*
                        Edit on every row, not only the broken ones. The
                        column used to be empty for anything valid, which
                        made a clean row look uneditable — sole-webapp lets
                        you open any of them, and a row that passes
                        validation can still be wrong.
                      */}
                      <TableCell className="text-right">
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

function CellEditor({
  field,
  rowNumber,
  value,
  onChange,
}: {
  field: BulkField;
  rowNumber: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const editor = field.review?.editor;
  const label = `${fieldDisplay(field)}, row ${rowNumber}`;

  if (editor?.kind === "select") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8" aria-label={label}>
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
  }

  return (
    <Input
      className="h-8"
      inputMode={editor?.kind === "text" ? editor.inputMode : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
    />
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
  const skipped = (result?.skipped ?? 0) + (result?.failed ?? 0);

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
