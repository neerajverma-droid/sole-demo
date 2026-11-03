"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  FileText,
  Pencil,
  Plus,
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
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { DeleteRuleDialog } from "@/components/rules/delete-rule-dialog";
import { RuleFormDialog } from "@/components/rules/rule-form-dialog";
import { RulesTable } from "@/components/rules/rules-table";
import { useRulesQuery } from "@/hooks/use-rules-query";
import { useRulesStore } from "@/stores/rules";
import {
  TXN_AI_TARGET,
  TXN_CSV_COLUMNS,
  TXN_FIELD_OPTIONS,
  TXN_REVIEW_TABS,
  TXN_SAMPLE_ROWS,
  autoMapTxnColumns,
  buildTxnRows,
  canonicalTxnType,
  duplicateTxnMappings,
  filterReviewRows,
  groupTxnIssues,
  importAmount,
  parseImportDate,
  txnErrorRowsCsv,
  txnTemplateCsv,
  withTxnIssues,
  type ParsedTxnRow,
  type ParsedTxnValues,
  type TxnReviewTab,
} from "@/lib/transaction-import";
import {
  IMPORT_FILE_ACCEPT,
  downloadCsv,
  type ParsedSheet,
} from "@/lib/file-parser";
import {
  useUploadBulkTransactions,
  useValidateBulkTransactions,
} from "@/hooks/use-bulk-transaction-import";
import {
  fetchManualAccounts,
  matchCategoryGroups,
} from "@/lib/manual-transaction";
import { useBulkTransactionParties } from "@/hooks/use-bulk-transaction-parties";
import {
  SoleFieldsStep,
  type AccountOption,
} from "@/components/transactions/sole-fields-step";
import { importFileError } from "@/lib/ai-format";
import { BulkResultsDialog } from "@/components/bulk/bulk-results-dialog";
import { useImportFileReader } from "@/components/bulk/use-import-file-reader";
import { firstSoleFieldError } from "@/lib/bulk-transactions";
import type {
  BulkUploadResult,
  ValidatedTransactionRow,
} from "@/lib/bulk-transactions";
import { apiErrorMessage } from "@/lib/api-error";
import {
  WizardSectionHeading,
  WizardStepper,
  formatBytes,
} from "@/components/bulk/wizard-parts";
import { cn } from "@/lib/utils";
import { useMigrationsStore } from "@/stores/migrations";

const STEPS = [
  "Import",
  "Map data",
  "Review",
  "Matching rules",
  "Sole fields",
  "Done",
] as const;

const CONTINUE_LABELS = [
  "Format & continue",
  "Continue to review",
  "Continue to rules",
  "Continue to Sole fields",
  "Import transactions",
  "Done",
];

/**
 * The red asterisk the page header promises ("Fields marked with * are
 * mandatory") — shown on every required column wherever one is named.
 */
function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  );
}

/**
 * Accounts sole-webapp's bulk upload skips by name on top of the Match
 * modal's own exclusions: refunds and credit notes have their own flows.
 */
const BULK_EXCLUDED_ACCOUNTS = [
  "vendor refund",
  "credit note",
  "client refund",
];

/** Every template column is one the import can't go without. */
const isRequiredTxnField = (field: string) =>
  (TXN_CSV_COLUMNS as readonly string[]).includes(field);

const FIELD_DOCS = [
  { name: "Transaction type", desc: "Credit or Debit" },
  {
    name: "Amount",
    desc: "Positive number, no currency symbol",
  },
  { name: "Date", desc: "DD/MM/YYYY" },
  {
    name: "Description",
    desc: "What the transaction was for",
  },
];

export function BulkUploadWizard() {
  const router = useRouter();
  const recordImport = useMigrationsStore((state) => state.recordImport);
  const validateRows = useValidateBulkTransactions();
  const uploadRows = useUploadBulkTransactions();

  /*
   * The Sole Fields step's reference data. Both fetch while someone is still
   * on the earlier steps, so the pickers are populated by the time the step
   * is reached rather than blank for a beat after it opens.
   */
  // The same chart-of-accounts fetch (and cache key) the manual entry form
  // and the Match modal use — matched by category id, as sole-webapp does.
  const accountsQuery = useQuery({
    queryKey: ["manual-transaction-accounts"],
    queryFn: fetchManualAccounts,
  });
  const parties = useBulkTransactionParties();

  const [step, setStep] = React.useState(0);
  /**
   * The picked file. Nothing is sent until Continue — picking only checks
   * it's a CSV/Excel under 5 MB, so someone can swap files without a wasted
   * AI call on each.
   */
  const [file, setFile] = React.useState<File | null>(null);
  /** The workbook as read — kept so the Map step can re-derive rows. */
  const [sheet, setSheet] = React.useState<ParsedSheet | null>(null);
  const [rows, setRows] = React.useState<ParsedTxnRow[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  /** File column index to Sole field, seeded by `autoMapTxnColumns`. */
  const [mapping, setMapping] = React.useState<Record<number, string>>({});
  /** The validate response — what the Sole Fields step edits. */
  const [soleRows, setSoleRows] = React.useState<ValidatedTransactionRow[]>([]);
  const [result, setResult] = React.useState<BulkUploadResult | null>(null);

  const cleanRows = rows.filter((row) => row.issues.length === 0);
  const issueRows = rows.filter((row) => row.issues.length > 0);

  const fileReader = useImportFileReader(TXN_AI_TARGET);

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
   * Continue on the Import step — Claude reformats the file into the
   * template's columns (see `lib/ai-format.ts`), falling back to a plain parse
   * if that fails, then goes straight to Map.
   */
  const formatFile = async (selected: File) => {
    setParseError(null);

    const result = await fileReader.read(selected);
    if (!result) return;
    if (!result.ok) {
      setParseError(result.error);
      return;
    }

    // Rows are built straight away so the Import step can report a count,
    // then rebuilt on the way out of the Map step if the mapping changed.
    const { columns, rows: sheetRows } = result.sheet;
    const guessed = autoMapTxnColumns(columns);
    setSheet(result.sheet);
    setMapping(guessed);
    setRows(buildTxnRows(columns, sheetRows, guessed));
    setStep(1);
  };

  const updateRow = (index: number, values: ParsedTxnValues) =>
    setRows((current) =>
      current.map((row) =>
        row.index === index ? withTxnIssues({ ...row, ...values }) : row,
      ),
    );

  /**
   * Drops a row from the import — the other half of the Actions column, and
   * the only way to exclude a row that validates but shouldn't be brought
   * across. `index` is left alone so the numbering keeps pointing at the
   * source file.
   */
  const deleteRow = (index: number) =>
    setRows((current) => current.filter((row) => row.index !== index));

  const reset = () => {
    fileReader.cancel();
    setStep(0);
    setFile(null);
    setSheet(null);
    setRows([]);
    setParseError(null);
    setMapping({});
    // Cleared too: the validated rows belong to the file being replaced, and
    // leaving them would carry one file's account matches onto another's.
    setSoleRows([]);
    setResult(null);
  };

  const nothingToImport = step === 2 && cleanRows.length === 0;
  const busy =
    fileReader.formatting || validateRows.isPending || uploadRows.isPending;
  const continueDisabled =
    (step === 0 && !file) || (step === 2 && cleanRows.length === 0) || busy;

  /** Accounts a row of this direction can book to, matching sole-webapp. */
  const accountsFor = React.useCallback(
    (type: "credit" | "debit"): AccountOption[] =>
      // Money in: Income, then Capital Account (owner capital input). Money
      // out: Expenses, Assets, then Capital Account (drawings) — the groups
      // sole-webapp's BulkTransaction builds from `categories.income` +
      // `capitalIncome` and `expanseOnly` + `assetOnly` + `capitalExpanse`.
      matchCategoryGroups(
        accountsQuery.data ?? [],
        type === "credit" ? "Credit" : "Debit",
      ).flatMap((group) =>
        group.options
          .filter(
            (account) =>
              !BULK_EXCLUDED_ACCOUNTS.includes(account.name.toLowerCase()),
          )
          .map((account) => ({
            id: account.id,
            name: account.name,
            group: group.label,
            // Capital (category 3) books straight to equity — the step
            // clears and locks client/supplier and name for it.
            capital: account.categoryId === 3,
          })),
      ),
    [accountsQuery.data],
  );

  const referenceLoading = accountsQuery.isLoading || parties.loading;

  /** One row's edit from the Sole Fields step. */
  const updateSoleRow = (
    index: number,
    patch: Partial<ValidatedTransactionRow>,
  ) =>
    setSoleRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  const onContinue = async () => {
    if (continueDisabled || nothingToImport) return;
    if (step === 5) {
      router.push("/transactions");
      return;
    }

    if (step === 0 && file) {
      if (sheet) setStep(1);
      else await formatFile(file);
      return;
    }

    if (step === 1 && sheet) {
      // Two columns on the same Sole field is the one mapping the backend
      // can't resolve for us — it would take whichever it saw last.
      const duplicates = duplicateTxnMappings(mapping);
      if (duplicates.length > 0) {
        toast.error(
          `${duplicates.join(" and ")} ${duplicates.length === 1 ? "is" : "are"} mapped to more than one column.`,
        );
        return;
      }
      setRows(buildTxnRows(sheet.columns, sheet.rows, mapping));
      setStep(2);
      return;
    }

    // Leaving the Matching rules step runs `validate`, which is what applies
    // those rules — the Sole Fields step then opens showing their work.
    if (step === 3) {
      try {
        const validated = await validateRows.mutateAsync(
          cleanRows.map((row) => ({
            type: canonicalTxnType(row.type) === "Credit" ? "credit" : "debit",
            transaction_date: parseImportDate(row.date) ?? "",
            amount: importAmount(row.amount),
            description: row.description.trim(),
            account_subcategory_id: 0,
            gst_include: true,
          })),
        );
        setSoleRows(validated);
        setStep(4);
      } catch (error) {
        toast.error(apiErrorMessage(error, "Could not check those rows."));
      }
      return;
    }

    if (step === 4) {
      // Checked here because the server is all-or-nothing and its refusal
      // names no row — one unfinished row would reject the whole file.
      const blocker = firstSoleFieldError(soleRows);
      if (blocker) {
        toast.error(blocker);
        return;
      }

      try {
        const outcome = await uploadRows.mutateAsync(soleRows);
        setResult(outcome);
        // The Data Migration Center ticks its Bank Transactions step off this.
        recordImport("transactions", outcome.succeeded);
        setStep(5);
      } catch (error) {
        toast.error(apiErrorMessage(error, "Failed to import transactions."));
      }
      return;
    }

    setStep(step + 1);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/transactions">
            <ArrowLeft />
            Transactions
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Bulk transaction upload
          </h1>
          <p className="text-sm text-muted-foreground">
            Fields marked with <span className="text-destructive">*</span> are
            mandatory in your CSV.
          </p>
        </div>
      </div>

      <WizardStepper steps={STEPS} current={step} />

      <div className="space-y-6">
        {step === 0 && (
          <ImportStep
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
        {step === 1 && sheet && (
          <MapStep
            columns={sheet.columns}
            firstRow={sheet.rows[0]}
            mapping={mapping}
            onChange={setMapping}
          />
        )}
        {step === 2 && (
          <ReviewStep
            rows={rows}
            cleanCount={cleanRows.length}
            issueCount={issueRows.length}
            onRowChange={updateRow}
            onRowDelete={deleteRow}
          />
        )}
        {step === 3 && <RulesStep />}
        {step === 4 && (
          <SoleFieldsStep
            rows={soleRows}
            accountsFor={accountsFor}
            partiesFor={parties.partiesFor}
            loading={referenceLoading}
            onChange={updateSoleRow}
          />
        )}
        {step === 5 && <DoneStep result={result} />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href="/transactions">{step === 5 ? "Close" : "Cancel"}</Link>
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {step > 0 && step < 5 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step === 2 && (
            <Button variant="outline" onClick={reset}>
              Choose a different file
            </Button>
          )}
          {nothingToImport ? (
            <p className="max-w-xs text-xs text-muted-foreground">
              No rows can be imported yet — fix the errors above or upload a
              different file.
            </p>
          ) : (
            <Button onClick={onContinue} disabled={continueDisabled}>
              {fileReader.formatting
                ? "Formatting with AI…"
                : validateRows.isPending
                  ? "Checking…"
                  : uploadRows.isPending
                    ? "Importing…"
                    : step === 0 && sheet
                      ? // Already formatted (they came Back) — just return to Map.
                        "Continue to map data"
                      : CONTINUE_LABELS[step]}
            </Button>
          )}
        </div>
      </div>

      {/*
        The same results dialog the other importers show. The server answers
        with per-batch counts rather than per-row outcomes here, so the table
        inside it stays empty — the banner and the three tiles are what this
        module has to report.
      */}
      <BulkResultsDialog
        open={step === 5 && result !== null}
        onOpenChange={(next) => !next && router.push("/transactions")}
        result={
          result && {
            created: result.succeeded,
            failed: result.failed,
            skipped: issueRows.length,
          }
        }
        fileName={file?.name}
        noun="transaction"
        nounPlural="transactions"
        onDone={() => router.push("/transactions")}
      />
    </div>
  );
}

function ImportStep({
  file,
  rowCount,
  parseError,
  onFile,
  onRemove,
}: {
  file: { name: string; size: number } | null;
  rowCount: number;
  parseError: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  return (
    <div className="space-y-6">
      <div
        className="flex flex-wrap items-start justify-between gap-4"
        data-usertour="txn-upload"
      >
        <WizardSectionHeading
          title="Upload your transactions"
          description="A CSV export from your bank or accounting tool."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // A real file with the real headers — the columns someone fills in
            // here are the ones the Map step will recognise on the way back.
            downloadCsv("transaction-import-template.csv", txnTemplateCsv());
            toast.success("Template downloaded");
          }}
        >
          <Download />
          Download template
        </Button>
      </div>

      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <FileText
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
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
        <WizardSectionHeading title="Example of CSV structure" />
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                {TXN_CSV_COLUMNS.map((column) => (
                  <TableHead key={column} className="whitespace-nowrap">
                    {column}
                    <RequiredMark />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {TXN_SAMPLE_ROWS.map((row, index) => (
                <TableRow key={index}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      className="whitespace-nowrap text-muted-foreground"
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <WizardSectionHeading title="Mandatory fields" />
        <dl className="grid gap-x-8 gap-y-2.5 rounded-lg border border-border bg-card p-4 shadow-sm sm:grid-cols-2">
          {FIELD_DOCS.map((doc) => (
            <div
              key={doc.name}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="text-sm">
                {doc.name}
                <RequiredMark />
                <span className="ml-2 text-xs text-muted-foreground">
                  {doc.desc}
                </span>
              </dt>
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
 * It used to list the template's four column names regardless of what was
 * uploaded, and the parser read cells by position — so a bank export with
 * its columns in any other order imported dates into the amount field
 * without ever saying so. The table is unchanged; what it lists is now the
 * file's own headers, and the choices made here are what the parser reads.
 */
function MapStep({
  columns,
  firstRow,
  mapping,
  onChange,
}: {
  columns: string[];
  firstRow: Record<string, string> | undefined;
  mapping: Record<number, string>;
  onChange: (next: Record<number, string>) => void;
}) {
  return (
    <div className="space-y-4" data-usertour="txn-stage-map">
      <WizardSectionHeading
        title="Map your columns"
        description="Match each column in your file to a Sole field."
      />
      <div className="rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column in your file</TableHead>
              <TableHead>Sample</TableHead>
              <TableHead className="w-[220px]">Sole field</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((column, index) => (
              <TableRow key={`${column}-${index}`}>
                <TableCell className="font-medium">{column}</TableCell>
                <TableCell className="max-w-[220px] truncate text-muted-foreground">
                  {firstRow?.[column] || "—"}
                </TableCell>
                <TableCell>
                  <Select
                    value={mapping[index] ?? "Don't import"}
                    onValueChange={(value) =>
                      onChange({ ...mapping, [index]: value })
                    }
                  >
                    <SelectTrigger aria-label={`Sole field for ${column}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TXN_FIELD_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                          {isRequiredTxnField(option) && <RequiredMark />}
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
  rows,
  cleanCount,
  issueCount,
  onRowChange,
  onRowDelete,
}: {
  rows: ParsedTxnRow[];
  cleanCount: number;
  issueCount: number;
  onRowChange: (index: number, values: ParsedTxnValues) => void;
  onRowDelete: (index: number) => void;
}) {
  const [tab, setTab] = React.useState<TxnReviewTab>("All rows");
  const [editing, setEditing] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<ParsedTxnValues | null>(null);
  const rowRefs = React.useRef<Record<number, HTMLTableRowElement | null>>({});

  const groups = groupTxnIssues(rows);
  const visible = filterReviewRows(rows, tab);

  const counts: Partial<Record<TxnReviewTab, number>> = {
    "All rows": rows.length,
    "Clean rows": cleanCount,
    "Rows with issues": issueCount,
  };

  const startEdit = (row: ParsedTxnRow) => {
    setEditing(row.index);
    setDraft({
      type: canonicalTxnType(row.type),
      amount: row.amount,
      date: row.date,
      description: row.description,
    });
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

  const patch = (values: Partial<ParsedTxnValues>) =>
    setDraft((current) => (current ? { ...current, ...values } : current));

  const downloadErrors = () => {
    const blob = new Blob(["﻿" + txnErrorRowsCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transaction-import-errors.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Rows with errors downloaded");
  };

  return (
    <div className="space-y-4" data-usertour="txn-stage-review">
      <WizardSectionHeading
        title="Review upload"
        description="Check each row, edit anything that looks off, then import. Rows with errors are skipped."
      />

      <FilterPills
        label="Filter review rows"
        options={TXN_REVIEW_TABS}
        value={tab}
        onChange={setTab}
        counts={counts}
      />

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
                          {row.description ? ` — ${row.description}` : ""}
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

      <div className="max-h-96 overflow-auto rounded-lg border border-border bg-card shadow-sm">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="w-[150px]">Type</TableHead>
              <TableHead className="w-[130px]">Amount</TableHead>
              <TableHead className="w-[140px]">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[150px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No rows in this view.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => {
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
                        <TableCell>
                          <Select
                            value={draft.type}
                            onValueChange={(value) => patch({ type: value })}
                          >
                            <SelectTrigger
                              className="h-8"
                              aria-label={`Type, row ${row.index + 1}`}
                            >
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Credit">Credit</SelectItem>
                              <SelectItem value="Debit">Debit</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 tabular"
                            inputMode="decimal"
                            value={draft.amount}
                            onChange={(event) =>
                              patch({ amount: event.target.value })
                            }
                            aria-label={`Amount, row ${row.index + 1}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 tabular"
                            value={draft.date}
                            placeholder="DD/MM/YYYY"
                            onChange={(event) =>
                              patch({ date: event.target.value })
                            }
                            aria-label={`Date, row ${row.index + 1}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            value={draft.description}
                            onChange={(event) =>
                              patch({ description: event.target.value })
                            }
                            aria-label={`Description, row ${row.index + 1}`}
                          />
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              className="h-8"
                              onClick={saveEdit}
                            >
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
                        <TableCell className="text-muted-foreground">
                          {row.type || "—"}
                        </TableCell>
                        <TableCell className="tabular">
                          {row.amount || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular">
                          {row.date || "—"}
                        </TableCell>
                        <TableCell className="max-w-[26ch] truncate">
                          {row.description || "—"}
                        </TableCell>
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
                          you open any of them.
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
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Add, edit and delete all happen on this step — the form opens in a dialog
 * and delete asks in place, as sole-webapp's step did. Going off to
 * /transactions/rules would lose the file mid-import.
 */
function RulesStep() {
  const rulesQuery = useRulesQuery();
  /** `null` closed, `"new"` adding, otherwise the id of the rule being edited. */
  const [formRule, setFormRule] = React.useState<string | null>(null);

  /*
   * Start sync on a row (or on all rules) reports its result through the rules
   * store, which the Rules page shows as a dialog. This step has no such
   * dialog, so a finished sync said nothing here — report it as a toast
   * instead, and clear it so it doesn't reappear on the Rules page later.
   */
  const lastSync = useRulesStore((state) => state.lastSync);
  const setLastSync = useRulesStore((state) => state.setLastSync);
  React.useEffect(() => {
    if (!lastSync) return;
    const { matched, ruleName } = lastSync;
    toast.success(
      `Sync complete — ${matched} ${matched === 1 ? "transaction" : "transactions"} matched`,
      {
        description:
          matched === 0
            ? `Nothing needed recategorising for ${ruleName === "All rules" ? "your rules" : `“${ruleName}”`}.`
            : ruleName === "All rules"
              ? "Matched against all your active rules."
              : `Matched using “${ruleName}”.`,
      },
    );
    setLastSync(null);
  }, [lastSync, setLastSync]);

  return (
    <div className="space-y-4" data-usertour="txn-stage-rules">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <WizardSectionHeading
          title="Matching rules"
          description="Optional — rules auto-categorise matching transactions on import. You can skip this and add them later."
        />
        <Button size="sm" onClick={() => setFormRule("new")}>
          <Plus />
          Add rule
        </Button>
      </div>
      <RulesTable
        loading={rulesQuery.isLoading}
        onAdd={() => setFormRule("new")}
        onEdit={(rule) => setFormRule(rule.id)}
      />

      <RuleFormDialog
        open={formRule !== null}
        ruleId={formRule === "new" ? undefined : (formRule ?? undefined)}
        onOpenChange={(open) => !open && setFormRule(null)}
      />
      <DeleteRuleDialog />
    </div>
  );
}

/**
 * What sits behind the results dialog — see `BulkImportDialog`'s own
 * `DoneStep` for why both exist.
 */
function DoneStep({ result }: { result: BulkUploadResult | null }) {
  const ok = result?.succeeded ?? 0;
  const failed = result?.failed ?? 0;

  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span
        className="grid size-12 place-items-center rounded-full bg-success/10 text-success"
        aria-hidden
      >
        <Check className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="font-medium tabular">
          {ok} {ok === 1 ? "transaction" : "transactions"} imported
        </p>
        {failed > 0 && (
          <p className="text-sm text-muted-foreground tabular">
            {failed} {failed === 1 ? "row" : "rows"} not imported.
          </p>
        )}
      </div>
    </div>
  );
}
