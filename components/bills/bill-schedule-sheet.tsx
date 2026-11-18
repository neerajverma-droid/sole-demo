"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Ban, Loader2, SkipForward, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { BusinessContactSelect } from "@/components/documents/business-contact-select";
import { ExpenseCategorySelect } from "@/components/expenses/expense-category-select";
import { BillLineItems } from "@/components/bills/bill-line-items";
import { BillRepeatFields } from "@/components/bills/bill-repeat-fields";
import { BillStatusBadge } from "@/components/bills/bill-status";
import {
  useBillScheduleQuery,
  useSkipBillScheduleMutation,
  useStopBillScheduleMutation,
  useUnskipBillScheduleMutation,
  useUpdateBillScheduleMutation,
} from "@/hooks/use-bills-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { apiErrorMessage } from "@/lib/api-error";
import {
  billRepeatLabel,
  billTotals,
  draftFromSchedule,
  occurrenceLabel,
  scheduleEndLabel,
  scheduleIssues,
  type BillExpected,
  type BillScheduleDraft,
} from "@/lib/bills";
import { fetchBusinessContacts } from "@/lib/clients";
import { countryCurrencySymbol, documentTax } from "@/lib/country-context";
import { fetchExpenseCategories } from "@/lib/expenses";
import { formatInvoiceDate, invoiceMoney, toIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

const STATUS_COPY = {
  active: { label: "Active", variant: "success" as const },
  ended: { label: "Ended", variant: "outline" as const },
  stopped: { label: "Stopped", variant: "outline" as const },
};

/**
 * One repeating bill's schedule: what's coming, the bills it has made, and —
 * while it's active — changes to every bill still to come. Bills already made
 * are never touched here; each one is edited on its own page.
 */
export function BillScheduleSheet({ scheduleId, onClose }: { scheduleId: string | null; onClose: () => void }) {
  const query = useBillScheduleQuery(scheduleId);
  const schedule = query.data;
  const update = useUpdateBillScheduleMutation();
  const skip = useSkipBillScheduleMutation();
  const unskip = useUnskipBillScheduleMutation();
  const stop = useStopBillScheduleMutation();
  const today = toIsoDate(new Date());

  const [draft, setDraft] = React.useState<BillScheduleDraft | null>(null);
  const [edited, setEdited] = React.useState(false);
  const [triedSave, setTriedSave] = React.useState(false);
  const [confirmStop, setConfirmStop] = React.useState(false);

  // Re-seed whenever a different schedule opens, or this one reloads untouched.
  const seededFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!schedule) return;
    if (seededFor.current === schedule.id && edited) return;
    seededFor.current = schedule.id;
    setDraft(draftFromSchedule(schedule));
    setEdited(false);
    setTriedSave(false);
  }, [schedule, edited]);

  React.useEffect(() => {
    if (!scheduleId) {
      seededFor.current = null;
      setDraft(null);
      setEdited(false);
    }
  }, [scheduleId]);

  const patch = (values: Partial<BillScheduleDraft>) => {
    setEdited(true);
    setDraft((current) => (current ? { ...current, ...values } : current));
  };

  const active = schedule?.status === "active";
  const { country } = useCountryContext();
  const tax = documentTax(country, draft?.nextDate || null);
  const taxWord = country.effectiveTax.registered ? tax.word : null;

  const categoriesQuery = useQuery({ queryKey: ["expense-categories"], queryFn: fetchExpenseCategories, enabled: !!scheduleId });
  const suppliersQuery = useQuery({
    queryKey: ["expense-suppliers"],
    queryFn: () => fetchBusinessContacts("Supplier"),
    enabled: !!scheduleId,
  });
  const categories = categoriesQuery.data ?? [];

  const issues = draft && schedule ? scheduleIssues(draft, schedule.occurrencesMade, today) : [];
  const issueFor = (key: string) => (triedSave || edited ? issues : []).find((issue) => issue.key === key)?.message;
  const totals = draft ? billTotals(draft.lines, taxWord ? tax.rate : 0) : null;

  const onSave = () => {
    if (!schedule || !draft) return;
    setTriedSave(true);
    if (issues.length > 0) return;
    update.mutate(
      { id: schedule.id, draft },
      {
        onSuccess: () => {
          toast.success("Repeat updated", { description: "Bills already made stay as they are." });
          setEdited(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Couldn't save the repeat.")),
      },
    );
  };

  const onSkip = () => {
    if (!schedule) return;
    skip.mutate(
      { id: schedule.id },
      {
        onSuccess: () => {
          toast.success("Next bill skipped", { description: "It stays listed, struck through — undo it any time before its date." });
          setEdited(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Couldn't skip the next bill.")),
      },
    );
  };

  const onUnskip = (billDate: string) => {
    if (!schedule) return;
    unskip.mutate(
      { id: schedule.id, billDate },
      {
        onSuccess: () => {
          toast.success("Skip undone", { description: `The bill on ${formatInvoiceDate(billDate)} will be made after all.` });
          setEdited(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Couldn't undo the skip.")),
      },
    );
  };

  const onStop = () => {
    if (!schedule) return;
    stop.mutate(schedule.id, {
      onSuccess: () => {
        toast.success("Repeat stopped", { description: "Bills already made stay in your list." });
        setConfirmStop(false);
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Couldn't stop this repeat.")),
    });
  };

  // The next bill that will actually be made — skipped dates ahead of it don't count.
  const next = schedule?.upcoming.find((entry) => !entry.skipped);
  const endLabel = schedule ? scheduleEndLabel(schedule) : null;

  return (
    <Sheet open={!!scheduleId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl" data-usertour="bill-schedule-sheet">
        <SheetHeader className="space-y-1 border-b p-6 text-left">
          <SheetTitle className="flex items-center gap-2">
            Repeating bill{schedule?.supplierName ? ` · ${schedule.supplierName}` : ""}
            {schedule && <Badge variant={STATUS_COPY[schedule.status].variant}>{STATUS_COPY[schedule.status].label}</Badge>}
          </SheetTitle>
          <SheetDescription>
            {schedule
              ? [
                  billRepeatLabel(schedule.frequency),
                  `${schedule.occurrencesMade} made so far`,
                  endLabel,
                  active && schedule.nextDate ? `next on ${formatInvoiceDate(schedule.nextDate)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {query.isLoading || (schedule && !draft) ? (
            <div className="space-y-3" aria-hidden>
              <Shimmer className="h-20 w-full" />
              <Shimmer className="h-40 w-full" />
            </div>
          ) : query.isError ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">Couldn&apos;t load this repeat</p>
              <p className="mt-1 text-sm text-muted-foreground">{query.error?.message}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : schedule && draft ? (
            <>
              {active && (
                <section className="space-y-2" data-usertour="bill-schedule-coming-up">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Coming up</h3>
                    <Button variant="outline" size="sm" onClick={onSkip} disabled={skip.isPending || !next || edited}>
                      {skip.isPending ? <Loader2 className="animate-spin" /> : <SkipForward />}
                      Skip next bill
                    </Button>
                  </div>
                  {edited && <p className="text-xs text-muted-foreground">Save or undo your changes before skipping.</p>}
                  <ComingUpList
                    upcoming={schedule.upcoming}
                    onUnskip={onUnskip}
                    unskippingDate={unskip.isPending ? (unskip.variables?.billDate ?? null) : null}
                    disabled={unskip.isPending || edited}
                  />
                  <p className="text-xs text-muted-foreground">
                    A skipped bill isn&apos;t made
                    {schedule.endType === "after_count" ? " and doesn't count towards the number of bills" : ""} — undo it any time
                    before its date. To move a bill to another date, change the next bill date below.
                  </p>
                </section>
              )}

              <section className="space-y-2" data-usertour="bill-schedule-history">
                <h3 className="text-sm font-semibold">Bills so far</h3>
                {schedule.bills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None left in your list.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {schedule.bills.map((bill) => (
                      <li key={bill.id}>
                        <Link
                          href={`/expenses/bills/${bill.id}`}
                          onClick={onClose}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/40"
                        >
                          <span className="min-w-0">
                            <span className="font-medium tabular">{bill.billDate ? formatInvoiceDate(bill.billDate) : "No date"}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {[bill.billNo, occurrenceLabel(bill.occurrenceNo, schedule.totalCount) ?? (bill.occurrenceNo ? `#${bill.occurrenceNo}` : null)]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-medium tabular">{invoiceMoney(bill.total)}</span>
                            <BillStatusBadge bill={bill} className="px-1.5 py-0 text-[10px]" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {active && (
                <section className="space-y-4" aria-labelledby="schedule-future-heading" data-usertour="bill-schedule-future">
                  {/* The tour points here, not at the whole section: that's taller than the
                      screen, so a tooltip placed against it ends up off the top. */}
                  <div data-usertour="bill-schedule-future-heading">
                    <h3 id="schedule-future-heading" className="text-sm font-semibold">
                      Bills still to come
                    </h3>
                    <p className="text-xs text-muted-foreground">Changes here apply to the next bill onwards.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <BusinessContactSelect
                      type="Supplier"
                      label="Supplier"
                      contacts={suppliersQuery.data ?? []}
                      loading={suppliersQuery.isLoading}
                      contactId={draft.supplierId}
                      contactName={draft.supplierName}
                      onSelect={({ contactId, contactName }) => patch({ supplierId: contactId, supplierName: contactName })}
                      onContactsChanged={() => suppliersQuery.refetch()}
                      error={issueFor("supplier")}
                    />
                    <ExpenseCategorySelect
                      categories={categories}
                      loading={categoriesQuery.isLoading}
                      categoryId={draft.categoryId}
                      onSelect={(categoryId) => {
                        const option = categories.find((entry) => entry.id === categoryId);
                        patch({ categoryId, category: option?.name ?? "" });
                      }}
                      error={issueFor("category")}
                    />
                  </div>
                  <BillRepeatFields
                    idPrefix="schedule-repeat"
                    value={draft}
                    onChange={patch}
                    errorFor={issueFor}
                    countHint={`Counting the ${schedule.occurrencesMade} already made.`}
                  />
                  <Field
                    label="Due"
                    htmlFor="schedule-due-days"
                    hint="Days after each bill's date that it's due — 0 for due on the bill date."
                    required
                    error={issueFor("dueDays")}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        id="schedule-due-days"
                        inputMode="numeric"
                        className="w-24"
                        value={draft.dueDays}
                        onChange={(event) => patch({ dueDays: event.target.value.replace(/[^\d]/g, "") })}
                        placeholder="14"
                      />
                      <span className="text-sm text-muted-foreground">days after the bill date</span>
                    </div>
                  </Field>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Lines</h4>
                    <BillLineItems
                      lines={draft.lines}
                      onChange={(lines) => patch({ lines })}
                      rate={tax.rate}
                      taxWord={taxWord}
                      currencyMark={countryCurrencySymbol(country)}
                      readOnly={false}
                      errorFor={issueFor}
                    />
                  </div>
                  <Field label="Notes" htmlFor="schedule-notes">
                    <Textarea id="schedule-notes" rows={2} value={draft.notes} onChange={(event) => patch({ notes: event.target.value })} />
                  </Field>
                </section>
              )}
            </>
          ) : null}
        </div>

        {schedule && active && draft && (
          <SheetFooter className="flex-row flex-wrap items-center gap-2 border-t p-4 sm:justify-between">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmStop(true)}
              data-usertour="bill-schedule-stop"
            >
              <Ban />
              Stop repeat
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {totals && (
                <span className="mr-1 text-sm text-muted-foreground">
                  Each bill <span className="font-semibold tabular text-foreground">{invoiceMoney(totals.total)}</span>
                </span>
              )}
              {edited && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(draftFromSchedule(schedule));
                    setEdited(false);
                    setTriedSave(false);
                  }}
                >
                  Undo changes
                </Button>
              )}
              <Button onClick={onSave} disabled={!edited || update.isPending}>
                {update.isPending && <Loader2 className="animate-spin" />}
                Save changes
              </Button>
            </div>
          </SheetFooter>
        )}

        <AlertDialog open={confirmStop} onOpenChange={(open) => !open && !stop.isPending && setConfirmStop(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Stop this repeat?</AlertDialogTitle>
              <AlertDialogDescription>
                No more bills will be made. Bills already in your list stay as they are. This can&apos;t be undone — you&apos;d set up
                a new repeat from a bill instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={stop.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={stop.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(event) => {
                  event.preventDefault();
                  onStop();
                }}
              >
                {stop.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Stop repeat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The next few bills a repeat will make. A skipped one keeps its place,
 * struck through and tagged, with Undo so it can be brought back.
 */
export function ComingUpList({
  upcoming,
  onUnskip,
  unskippingDate,
  disabled,
}: {
  upcoming: BillExpected[];
  onUnskip: (billDate: string) => void;
  /** The skipped date an undo is in flight for, to spin its button. */
  unskippingDate: string | null;
  disabled: boolean;
}) {
  if (upcoming.length === 0) {
    return <p className="text-sm text-muted-foreground">No more bills to come.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {upcoming.map((entry) => {
        const position = occurrenceLabel(entry.occurrenceNo, entry.totalCount);
        return (
          <li
            key={entry.key}
            data-skipped={entry.skipped || undefined}
            className={cn("flex items-center justify-between gap-3 px-3 py-2 text-sm", entry.skipped && "bg-muted/40")}
          >
            <span className={cn("min-w-0", entry.skipped && "text-muted-foreground line-through decoration-muted-foreground/70")}>
              <span className="font-medium tabular">{formatInvoiceDate(entry.billDate)}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {entry.dueDate ? `due ${formatInvoiceDate(entry.dueDate)}` : "no due date"}
                {position ? ` · ${position}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {entry.skipped && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Skipped
                </Badge>
              )}
              <span className={cn("font-medium tabular", entry.skipped && "text-muted-foreground line-through")}>{invoiceMoney(entry.total)}</span>
              {entry.skipped && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => onUnskip(entry.billDate)}
                  disabled={disabled}
                  aria-label={`Undo skipping the bill on ${formatInvoiceDate(entry.billDate)}`}
                >
                  {unskippingDate === entry.billDate ? <Loader2 className="animate-spin" /> : <Undo2 />}
                  Undo
                </Button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
