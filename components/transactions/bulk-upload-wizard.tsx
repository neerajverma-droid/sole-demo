"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Download,
  Loader2,
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
import {
  TXN_AI_TARGET,
  TXN_REVIEW_TABS,
  autoMapTxnColumns,
  buildTxnRows,
  canonicalTxnType,
  filterReviewRows,
  importAmount,
  parseImportDate,
  txnErrorRowsCsv,
  txnFieldErrors,
  withTxnIssues,
  type ParsedTxnRow,
  type ParsedTxnValues,
  type TxnReviewTab,
} from "@/lib/transaction-import";
import { IMPORT_FILE_ACCEPT } from "@/lib/file-parser";
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
  PINNED_ACTIONS_CELL,
  PINNED_ACTIONS_CELL_EDITING,
  PINNED_ACTIONS_HEAD,
  WizardSectionHeading,
  WizardStepper,
  formatBytes,
} from "@/components/bulk/wizard-parts";
import { cn } from "@/lib/utils";
import { useMigrationsStore } from "@/stores/migrations";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { MIGRATIONS_MODULE } from "@/lib/analytics-modules";
import { useTrackOnce } from "@/hooks/use-track-once";

const STEPS = [
  "Import",
  "Review",
  "Matching rules",
  "Sole fields",
  "Done",
] as const;

const CONTINUE_LABELS = [
  "",
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

export function BulkUploadWizard({
  from,
}: {
  /** Where it was opened from, when that isn't Transactions. */
  from?: "migrations";
} = {}) {
  const router = useRouter();
  // Back, Cancel and Done all return to where this was opened from, named so.
  const exit =
    from === "migrations"
      ? { href: "/migrations", label: "Data Migration Center" }
      : { href: "/transactions", label: "Transactions" };
  const recordImport = useMigrationsStore((state) => state.recordImport);
  const moduleContext = {
    module_name: from === "migrations" ? MIGRATIONS_MODULE : "Transactions",
    sub_module_name: "Transactions",
  };
  useTrackOnce(EVENTS.BULK_UPLOAD_INITIATED, true, moduleContext);
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
  const [rows, setRows] = React.useState<ParsedTxnRow[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  /** The validate response — what the Sole Fields step edits. */
  const [soleRows, setSoleRows] = React.useState<ValidatedTransactionRow[]>([]);
  const [result, setResult] = React.useState<BulkUploadResult | null>(null);

  const cleanRows = rows.filter((row) => row.issues.length === 0);
  const issueRows = rows.filter((row) => row.issues.length > 0);

  const fileReader = useImportFileReader(TXN_AI_TARGET);

  /**
   * Picking a file is the whole Import step: once it passes the type and size
   * check, Claude reformats it into the template's columns (see
   * `lib/ai-format.ts`), falling back to a plain parse if that fails, and the
   * wizard goes straight to Review. Columns are matched by name — Review's
   * inline edit is where a wrong guess gets fixed.
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
    setRows(buildTxnRows(columns, sheetRows, autoMapTxnColumns(columns)));
    // Columns are matched automatically, so mapping and arriving at Review
    // happen together — the same pair the generic bulk dialog sends.
    track(EVENTS.DATA_MAPPED, {
      section_name: moduleContext.module_name,
      sub_module_name: moduleContext.sub_module_name,
    });
    track(EVENTS.DATA_REVIEW_INITIATED, moduleContext);
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
    setRows([]);
    setParseError(null);
    // Cleared too: the validated rows belong to the file being replaced, and
    // leaving them would carry one file's account matches onto another's.
    setSoleRows([]);
    setResult(null);
  };

  const nothingToImport = step === 1 && cleanRows.length === 0;
  const busy =
    fileReader.formatting || validateRows.isPending || uploadRows.isPending;
  const continueDisabled = (step === 1 && cleanRows.length === 0) || busy;

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
    if (step === 4) {
      router.push(exit.href);
      return;
    }

    if (step === 0) return;

    // Leaving the Matching rules step runs `validate`, which is what applies
    // those rules — the Sole Fields step then opens showing their work.
    if (step === 2) {
      track(EVENTS.CONTINUE_TO_SOLE_FIELDS_CLICKED, moduleContext);
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
        setStep(3);
      } catch (error) {
        toast.error(apiErrorMessage(error, "Could not check those rows."));
      }
      return;
    }

    if (step === 3) {
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
        track(EVENTS.DATA_IMPORTED, {
          ...moduleContext,
          count: outcome.succeeded,
        });
        setStep(4);
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
          <Link href={exit.href}>
            <ArrowLeft />
            {exit.label}
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
        {step === 1 && (
          <ReviewStep
            rows={rows}
            cleanCount={cleanRows.length}
            issueCount={issueRows.length}
            onRowChange={updateRow}
            onRowDelete={deleteRow}
          />
        )}
        {step === 2 && <RulesStep />}
        {step === 3 && (
          <SoleFieldsStep
            rows={soleRows}
            accountsFor={accountsFor}
            partiesFor={parties.partiesFor}
            loading={referenceLoading}
            onChange={updateSoleRow}
          />
        )}
        {step === 4 && <DoneStep result={result} />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href={exit.href}>{step === 4 ? "Close" : "Cancel"}</Link>
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {step > 1 && step < 4 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step === 1 && (
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
            step > 0 && (
              <Button
                onClick={onContinue}
                disabled={continueDisabled}
                data-usertour="txn-continue"
              >
                {validateRows.isPending
                  ? "Checking…"
                  : uploadRows.isPending
                    ? "Importing…"
                    : CONTINUE_LABELS[step]}
              </Button>
            )
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
        open={step === 4 && result !== null}
        onOpenChange={(next) => !next && router.push(exit.href)}
        result={
          result && {
            created: result.succeeded,
            failed: result.failed,
            // Never sent — rows still carrying errors, not ones the server
            // already had, which is what "skipped" would say.
            skipped: 0,
            invalid: issueRows.length,
          }
        }
        fileName={file?.name}
        noun="transaction"
        nounPlural="transactions"
        onDone={() => router.push(exit.href)}
      />
    </div>
  );
}

function ImportStep({
  file,
  formatting,
  parseError,
  onFile,
  onRemove,
}: {
  file: { name: string; size: number } | null;
  formatting: boolean;
  parseError: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  return (
    <div className="space-y-6">
      <div data-usertour="txn-upload">
        <WizardSectionHeading
          title="Upload your transactions"
          description="A CSV export from your bank or accounting tool. We'll read it as soon as you add it."
        />
      </div>

      <div data-usertour="txn-dropzone">
        {file && formatting ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
            <Loader2
              className="size-4 shrink-0 animate-spin text-primary"
              aria-hidden
            />
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

const TXN_FIELDS = ["type", "amount", "date", "description"] as const;
type TxnField = (typeof TXN_FIELDS)[number];

const INVALID_CLASS = "border-destructive focus-visible:ring-destructive";

/** The reason a cell in edit mode is wrong, under its control. */
function EditError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1 text-xs text-destructive">{message}</p>
  ) : null;
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
  /** The cell to put the cursor in once a row opens; `n` lets the same cell be asked for twice. */
  const [focusRequest, setFocusRequest] = React.useState<{
    field: TxnField;
    n: number;
  } | null>(null);
  const rowRefs = React.useRef<Record<number, HTMLTableRowElement | null>>({});

  const visible = filterReviewRows(rows, tab);

  const counts: Partial<Record<TxnReviewTab, number>> = {
    "All rows": rows.length,
    "Clean rows": cleanCount,
    "Rows with issues": issueCount,
  };

  const requestFocus = (field: TxnField) =>
    setFocusRequest((current) => ({ field, n: (current?.n ?? 0) + 1 }));

  React.useEffect(() => {
    if (editing === null || !focusRequest) return;
    // After the row has swapped its cells for editors.
    const frame = requestAnimationFrame(() => {
      rowRefs.current[editing]
        ?.querySelector<HTMLElement>(`[data-txn-field="${focusRequest.field}"]`)
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, focusRequest]);

  /** Opens a row with the cursor on the cell clicked, else the first one in error. */
  const startEdit = (row: ParsedTxnRow, focusField?: TxnField) => {
    setEditing(row.index);
    setDraft({
      type: canonicalTxnType(row.type),
      amount: row.amount,
      date: row.date,
      description: row.description,
    });
    const errors = txnFieldErrors(row);
    requestFocus(
      focusField ?? TXN_FIELDS.find((field) => errors[field]) ?? "type",
    );
    requestAnimationFrame(() =>
      rowRefs.current[row.index]?.scrollIntoView({ block: "nearest" }),
    );
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft(null);
  };

  /** What's wrong with the row as it stands in the editors, live as they type. */
  const draftErrors = draft ? txnFieldErrors(draft) : {};

  /** A row that's still wrong would only go back on the error list, so it stays open on the first cell to fix. */
  const saveEdit = () => {
    if (editing === null || !draft) return;
    const blocking = TXN_FIELDS.find((field) => draftErrors[field]);
    if (blocking) {
      requestFocus(blocking);
      return;
    }
    onRowChange(editing, draft);
    cancelEdit();
  };

  /** Enter saves, Escape cancels, from a text box. */
  const submitKeys = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  };

  /**
   * A read-only cell. One that's wrong says why, in red under its value, and is
   * itself the way in: click it and the row opens with the cursor there.
   */
  const renderCell = (
    row: ParsedTxnRow,
    errors: Partial<Record<TxnField, string>>,
    field: TxnField,
    text: string,
  ) => {
    const error = errors[field];
    if (!error) return text || "—";
    return (
      <button
        type="button"
        onClick={() => startEdit(row, field)}
        aria-label={`Fix ${field}, row ${row.index + 1}: ${error}`}
        className="block w-full cursor-pointer rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block truncate">{text || "—"}</span>
        <span className="mt-0.5 block text-xs font-normal text-destructive">
          {error}
        </span>
      </button>
    );
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

      {issueCount > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium tabular">
                {issueCount} {issueCount === 1 ? "row needs" : "rows need"}{" "}
                attention
              </p>
              <p className="text-xs text-muted-foreground">
                Rows with errors will be skipped if you import.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={downloadErrors}
            >
              <Download />
              Download rows with errors
            </Button>
          </div>
        </div>
      )}

      <div
        className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        data-usertour="txn-review-table"
      >
        <Table
          containerClassName="scrollbar-visible max-h-96"
          className="min-w-[820px]"
        >
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="w-[150px]">Type</TableHead>
              <TableHead className="w-[130px]">Amount</TableHead>
              <TableHead className="w-[140px]">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead
                className={cn("w-[150px] text-right", PINNED_ACTIONS_HEAD)}
              >
                Actions
              </TableHead>
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
                // Only rows with problems pay for the check.
                const fieldErrors =
                  row.issues.length > 0 ? txnFieldErrors(row) : {};
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
                        <TableCell className="min-w-36 align-top">
                          <Select
                            value={draft.type}
                            onValueChange={(value) => patch({ type: value })}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-8",
                                draftErrors.type && INVALID_CLASS,
                              )}
                              aria-label={`Type, row ${row.index + 1}`}
                              aria-invalid={draftErrors.type ? true : undefined}
                              data-txn-field="type"
                            >
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Credit">Credit</SelectItem>
                              <SelectItem value="Debit">Debit</SelectItem>
                            </SelectContent>
                          </Select>
                          <EditError message={draftErrors.type} />
                        </TableCell>
                        <TableCell className="min-w-36 align-top">
                          <Input
                            className={cn(
                              "h-8 tabular",
                              draftErrors.amount && INVALID_CLASS,
                            )}
                            inputMode="decimal"
                            value={draft.amount}
                            onChange={(event) =>
                              patch({ amount: event.target.value })
                            }
                            onKeyDown={submitKeys}
                            aria-label={`Amount, row ${row.index + 1}`}
                            aria-invalid={draftErrors.amount ? true : undefined}
                            data-txn-field="amount"
                          />
                          <EditError message={draftErrors.amount} />
                        </TableCell>
                        <TableCell className="min-w-40 align-top">
                          <Input
                            className={cn(
                              "h-8 tabular",
                              draftErrors.date && INVALID_CLASS,
                            )}
                            value={draft.date}
                            placeholder="DD/MM/YYYY"
                            onChange={(event) =>
                              patch({ date: event.target.value })
                            }
                            onKeyDown={submitKeys}
                            aria-label={`Date, row ${row.index + 1}`}
                            aria-invalid={draftErrors.date ? true : undefined}
                            data-txn-field="date"
                          />
                          <EditError message={draftErrors.date} />
                        </TableCell>
                        <TableCell className="min-w-64 align-top">
                          <Input
                            className={cn(
                              "h-8",
                              draftErrors.description && INVALID_CLASS,
                            )}
                            value={draft.description}
                            onChange={(event) =>
                              patch({ description: event.target.value })
                            }
                            onKeyDown={submitKeys}
                            aria-label={`Description, row ${row.index + 1}`}
                            aria-invalid={
                              draftErrors.description ? true : undefined
                            }
                            data-txn-field="description"
                          />
                          <EditError message={draftErrors.description} />
                        </TableCell>
                        <TableCell />
                        <TableCell
                          className={cn(
                            "text-right align-top",
                            PINNED_ACTIONS_CELL_EDITING,
                          )}
                        >
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
                          {fieldErrors.type ? (
                            /*
                              A missing or unreadable Type is a two-way pick, so
                              the dropdown is the cell: choose straight from the
                              row rather than open it first.
                            */
                            <Select
                              value=""
                              onValueChange={(value) =>
                                onRowChange(row.index, {
                                  type: value,
                                  amount: row.amount,
                                  date: row.date,
                                  description: row.description,
                                })
                              }
                            >
                              <SelectTrigger
                                className="h-8 data-[placeholder]:text-destructive"
                                aria-label={`Type, row ${row.index + 1}`}
                                data-txn-field="type"
                              >
                                <SelectValue placeholder="Choose Credit or Debit" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Credit">Credit</SelectItem>
                                <SelectItem value="Debit">Debit</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            renderCell(row, fieldErrors, "type", row.type)
                          )}
                        </TableCell>
                        <TableCell className="tabular">
                          {renderCell(row, fieldErrors, "amount", row.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular">
                          {renderCell(row, fieldErrors, "date", row.date)}
                        </TableCell>
                        <TableCell className="max-w-[26ch] truncate">
                          {renderCell(
                            row,
                            fieldErrors,
                            "description",
                            row.description,
                          )}
                        </TableCell>
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
                                    {row.issues.length === 1
                                      ? "error"
                                      : "errors"}
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
                          you open any of them.
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
 *
 * No Sync column here: sync works on transactions already saved, and this
 * file isn't saved until the Sole Fields step. The rules reach the file when
 * Continue runs `validate`, which the description says.
 */
function RulesStep() {
  const rulesQuery = useRulesQuery();
  /** `null` closed, `"new"` adding, otherwise the id of the rule being edited. */
  const [formRule, setFormRule] = React.useState<string | null>(null);

  return (
    <div className="space-y-4" data-usertour="txn-stage-rules">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <WizardSectionHeading
          title="Matching rules"
          description="Optional — rules you add or edit here are applied to the rows in your file when you continue to Sole fields, where you can check and change what they filled in. You can skip this and add them later."
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
        hideSync
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
