"use client";

import * as React from "react";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import {
  ConfirmDeleteDialog,
  FormDialog,
  Loadable,
  ModuleCard,
  ModuleEmpty,
  invalidClass,
  useFieldErrors,
  PropertyMoneyInput,
  usePropertyMoney,
} from "@/components/investment-property/module-shared";
import {
  useDeleteLoanMutation,
  useLoanQuery,
  useSaveLoanMutation,
} from "@/hooks/use-property-modules-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  formatPropertyDate,
  type Property,
} from "@/lib/investment-property";
import {
  INTEREST_TYPES,
  LOAN_TERM_UNITS,
  LOAN_TYPES,
  REPAYMENT_FREQUENCIES,
  SPLIT_TYPES,
  draftFromLoan,
  emptyLoanDraft,
  interestTypeLabel,
  loanIssues,
  loanTypeLabel,
  repaymentFrequencyLabel,
  type InterestType,
  type LoanDraft,
  type LoanTermUnit,
  type LoanType,
  type PropertyLoan,
  type RepaymentFrequency,
  type SplitType,
} from "@/lib/investment-property-loan";
import { parseIsoDate } from "@/lib/invoices";
import { activeCurrencySymbol } from "@/lib/country-context";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-3 first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium tabular">{value}</dd>
    </div>
  );
}

function percent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function rateSummary(loan: PropertyLoan): string {
  if (loan.interestType === "split") {
    return `${percent(loan.fixedRate)} fixed · ${percent(loan.variableRate)} variable`;
  }
  return percent(loan.interestRate);
}

function LoanForm({
  initial,
  open,
  onOpenChange,
  propertyId,
  editing,
}: {
  initial: LoanDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  editing: boolean;
}) {
  const save = useSaveLoanMutation(propertyId);
  const [draft, setDraft] = React.useState<LoanDraft>(initial);
  const issues = loanIssues(draft);
  const { error, touch, attempt } = useFieldErrors(issues);

  const patch = (values: Partial<LoanDraft>) => {
    touch(...(Object.keys(values) as (keyof LoanDraft)[]));
    setDraft((current) => ({ ...current, ...values }));
  };

  const submit = () => {
    if (!attempt() || save.isPending) return;
    save.mutate(draft, {
      onSuccess: () => {
        toast.success(editing ? "Loan updated" : "Loan added");
        onOpenChange(false);
      },
      onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't save the loan.")),
    });
  };

  const split = draft.interestType === "split";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit loan" : "Add loan"}
      description="The loan that funds this property. Its balance feeds the property's equity."
      submitLabel={editing ? "Save changes" : "Add loan"}
      pending={save.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lender" htmlFor="loan-lender" required error={error("lenderName")}>
          <Input
            id="loan-lender"
            value={draft.lenderName}
            onChange={(event) => patch({ lenderName: event.target.value })}
            placeholder="e.g. Commonwealth Bank"
            aria-invalid={!!error("lenderName")}
            className={invalidClass(error("lenderName"))}
            maxLength={255}
          />
        </Field>
        <Field label="Loan start date" required error={error("startDate")}>
          <DatePicker
            label="Loan start date"
            value={draft.startDate}
            onChange={(startDate) => patch({ startDate })}
            toDate={new Date()}
          />
        </Field>
        <Field label="Original loan amount" htmlFor="loan-original" required error={error("originalAmount")}>
          <PropertyMoneyInput
            id="loan-original"
            label="Original loan amount"
            value={draft.originalAmount}
            onChange={(originalAmount) => patch({ originalAmount })}
            invalid={!!error("originalAmount")}
            placeholder="0.00"
          />
        </Field>
        <Field
          label="Current balance"
          htmlFor="loan-balance"
          hint="Leave blank to use the original amount."
          error={error("currentBalance")}
        >
          <PropertyMoneyInput
            id="loan-balance"
            label="Current balance"
            value={draft.currentBalance}
            onChange={(currentBalance) => patch({ currentBalance })}
            invalid={!!error("currentBalance")}
            placeholder="0.00"
          />
        </Field>
        <Field label="Loan type">
          <Select value={draft.loanType} onValueChange={(value) => patch({ loanType: value as LoanType })}>
            <SelectTrigger aria-label="Loan type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOAN_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Interest type">
          <Select
            value={draft.interestType}
            onValueChange={(value) => patch({ interestType: value as InterestType })}
          >
            <SelectTrigger aria-label="Interest type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTEREST_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {draft.loanType === "interest_only" && (
          <Field label="Interest-only period ends" error={error("interestOnlyEndDate")}>
            <DatePicker
              label="Interest-only period ends"
              value={draft.interestOnlyEndDate}
              onChange={(interestOnlyEndDate) => patch({ interestOnlyEndDate })}
              fromDate={parseIsoDate(draft.startDate)}
            />
          </Field>
        )}

        {split ? (
          <>
            <Field label="Fixed rate (%)" htmlFor="loan-fixed" required error={error("fixedRate")}>
              <Input
                id="loan-fixed"
                inputMode="decimal"
                value={draft.fixedRate}
                onChange={(event) => patch({ fixedRate: event.target.value })}
                placeholder="e.g. 5.99"
                aria-invalid={!!error("fixedRate")}
                className={invalidClass(error("fixedRate"))}
              />
            </Field>
            <Field label="Variable rate (%)" htmlFor="loan-variable" required error={error("variableRate")}>
              <Input
                id="loan-variable"
                inputMode="decimal"
                value={draft.variableRate}
                onChange={(event) => patch({ variableRate: event.target.value })}
                placeholder="e.g. 6.34"
                aria-invalid={!!error("variableRate")}
                className={invalidClass(error("variableRate"))}
              />
            </Field>
            <Field label="Fixed portion is a">
              <Select
                value={draft.splitType}
                onValueChange={(value) => patch({ splitType: value as SplitType })}
              >
                <SelectTrigger aria-label="Fixed portion type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPLIT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={draft.splitType === "percentage" ? "Fixed portion (%)" : `Fixed portion (${activeCurrencySymbol()})`}
              htmlFor="loan-portion"
              required
              error={error("fixedPortion")}
            >
              <Input
                id="loan-portion"
                inputMode="decimal"
                value={draft.fixedPortion}
                onChange={(event) => patch({ fixedPortion: event.target.value })}
                placeholder={draft.splitType === "percentage" ? "e.g. 50" : "e.g. 250000"}
                aria-invalid={!!error("fixedPortion")}
                className={invalidClass(error("fixedPortion"))}
              />
            </Field>
          </>
        ) : (
          <Field label="Interest rate (%)" htmlFor="loan-rate" error={error("interestRate")}>
            <Input
              id="loan-rate"
              inputMode="decimal"
              value={draft.interestRate}
              onChange={(event) => patch({ interestRate: event.target.value })}
              placeholder="e.g. 6.25"
              aria-invalid={!!error("interestRate")}
              className={invalidClass(error("interestRate"))}
            />
          </Field>
        )}

        <Field label="Repayment frequency" error={error("repaymentFrequency")}>
          <Select
            value={draft.repaymentFrequency || "none"}
            onValueChange={(value) =>
              patch({ repaymentFrequency: value === "none" ? "" : (value as RepaymentFrequency) })
            }
          >
            <SelectTrigger aria-label="Repayment frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {REPAYMENT_FREQUENCIES.map((frequency) => (
                <SelectItem key={frequency.value} value={frequency.value}>
                  {frequency.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Repayment amount" htmlFor="loan-repayment" error={error("repaymentAmount")}>
          <PropertyMoneyInput
            id="loan-repayment"
            label="Repayment amount"
            value={draft.repaymentAmount}
            onChange={(repaymentAmount) => patch({ repaymentAmount })}
            invalid={!!error("repaymentAmount")}
            placeholder="0.00"
          />
        </Field>
        <Field label="Loan term" htmlFor="loan-term" error={error("termValue")}>
          <div className="flex gap-2">
            <Input
              id="loan-term"
              inputMode="numeric"
              value={draft.termValue}
              onChange={(event) => patch({ termValue: event.target.value })}
              placeholder="e.g. 30"
              aria-invalid={!!error("termValue")}
              className={invalidClass(error("termValue"))}
            />
            <Select value={draft.termUnit} onValueChange={(value) => patch({ termUnit: value as LoanTermUnit })}>
              <SelectTrigger aria-label="Loan term unit" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOAN_TERM_UNITS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Field>
      </div>
      <Field label="Notes" htmlFor="loan-notes">
        <Textarea
          id="loan-notes"
          value={draft.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={3}
          placeholder="Offset account, redraw facility, break costs…"
        />
      </Field>
    </FormDialog>
  );
}

export function LoanTab({ property }: { property: Property }) {
  const money = usePropertyMoney();
  const query = useLoanQuery(property.id);
  const remove = useDeleteLoanMutation(property.id);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const readOnly = property.status === "disposed";

  return (
    <Loadable query={query} skeletonClassName="h-64">
      {(loan) => {
        if (!loan) {
          return (
            <ModuleCard title="Loan" description="Track the loan against this property.">
              <ModuleEmpty
                icon={<Landmark aria-hidden />}
                title="No loan recorded"
                description="Add the loan to track its balance, repayments and the property's equity."
                action={
                  !readOnly && (
                    <Button size="sm" onClick={() => setFormOpen(true)}>
                      <Plus />
                      Add loan
                    </Button>
                  )
                }
              />
              {formOpen && (
                <LoanForm
                  initial={emptyLoanDraft()}
                  open={formOpen}
                  onOpenChange={setFormOpen}
                  propertyId={property.id}
                  editing={false}
                />
              )}
            </ModuleCard>
          );
        }

        const stats: StatCard[] = [
          {
            key: "balance",
            label: "Current balance",
            value: money(loan.currentBalance),
            icon: Landmark,
            tone: "warning",
          },
          {
            key: "original",
            label: "Original amount",
            value: money(loan.originalAmount),
            icon: Landmark,
          },
          {
            key: "rate",
            label: "Interest rate",
            value: loan.interestType === "split" ? "Split" : percent(loan.interestRate),
            meta: loan.interestType === "split" ? rateSummary(loan) : interestTypeLabel(loan.interestType),
            icon: Landmark,
          },
          {
            key: "repayment",
            label: "Repayment",
            value: loan.repaymentAmount === null ? "—" : money(loan.repaymentAmount),
            meta: loan.repaymentFrequency ? repaymentFrequencyLabel(loan.repaymentFrequency) : undefined,
            icon: Landmark,
          },
        ];

        return (
          <div className="space-y-4">
            <StatCards stats={stats} />
            <ModuleCard
              title={loan.lenderName}
              description="Loan details"
              action={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={readOnly}
                    onClick={() => setFormOpen(true)}
                  >
                    <Pencil />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={readOnly}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 />
                    Delete
                  </Button>
                </>
              }
            >
              <dl className="grid gap-x-10 sm:grid-cols-2">
                <Row label="Loan start date" value={formatPropertyDate(loan.startDate)} />
                <Row label="Loan type" value={loanTypeLabel(loan.loanType)} />
                <Row label="Interest type" value={interestTypeLabel(loan.interestType)} />
                <Row label="Rate" value={rateSummary(loan)} />
                {loan.interestType === "split" && loan.fixedPortion !== null && (
                  <Row
                    label="Fixed portion"
                    value={
                      loan.splitType === "percentage"
                        ? `${loan.fixedPortion}%`
                        : money(loan.fixedPortion)
                    }
                  />
                )}
                {loan.loanType === "interest_only" && (
                  <Row
                    label="Interest-only ends"
                    value={formatPropertyDate(loan.interestOnlyEndDate)}
                  />
                )}
                <Row
                  label="Loan term"
                  value={loan.termValue !== null && loan.termUnit ? `${loan.termValue} ${loan.termUnit}` : "—"}
                />
                <Row label="Original amount" value={money(loan.originalAmount)} />
              </dl>
              {loan.notes && (
                <div className="border-t border-border pt-3">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{loan.notes}</p>
                </div>
              )}
            </ModuleCard>

            {formOpen && (
              <LoanForm
                initial={draftFromLoan(loan)}
                open={formOpen}
                onOpenChange={setFormOpen}
                propertyId={property.id}
                editing
              />
            )}
            <ConfirmDeleteDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              title="Delete loan?"
              description="This removes the loan from the property. Its equity will be calculated without it. This action can't be undone."
              confirmLabel="Delete loan"
              pending={remove.isPending}
              onConfirm={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Loan deleted");
                    setDeleteOpen(false);
                  },
                  onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't delete the loan.")),
                })
              }
            />
          </div>
        );
      }}
    </Loadable>
  );
}
