"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MoneyInput } from "@/components/planner/money-input";
import { TaxResultsPanel } from "@/components/tax/tax-results-panel";
import { reportMoney } from "@/lib/report-periods";
import { RESOURCES_HREF } from "@/lib/nav";
import {
  EMPTY_TAX_DRAFT,
  ENTITY_TYPES,
  TAX_STEPS,
  TAX_YEARS,
  estimateTax,
  incomeComplete,
  type EntityType,
  type TaxDraft,
  type TaxYearLabel,
} from "@/lib/tax-estimator";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { financialYearOf, transactionSummary } from "@/lib/transactions";
import { cn } from "@/lib/utils";
import { useTransactionsStore } from "@/stores/transactions";

/**
 * The Tax Estimator.
 *
 * Four steps and a live figure. The steps exist because the questions fall into
 * four unrelated groups and asking twenty-one of them at once is how a form
 * gets abandoned; the panel exists because the four steps are otherwise a
 * questionnaire with no reward until the end.
 *
 * Nothing is submitted anywhere. The whole page is a calculator over local
 * state, which is why there's no store behind it and no draft to recover —
 * closing it throws the working away, which is the right outcome for a
 * back-of-the-envelope figure.
 */
export function TaxEstimatorScreen() {
  const [draft, setDraft] = React.useState<TaxDraft>(EMPTY_TAX_DRAFT);
  const [step, setStep] = React.useState(0);
  /** Set by Calculate Tax, which is what marks the last step done. */
  const [calculated, setCalculated] = React.useState(false);

  const transactions = useTransactionsStore((state) => state.transactions);

  const patch = (next: Partial<TaxDraft>) =>
    setDraft((current) => ({ ...current, ...next }));

  const active = TAX_STEPS[step];
  const last = step === TAX_STEPS.length - 1;

  /**
   * Whether a step is behind the person filling the form in.
   *
   * Complete means "moved past", not "answered": three of the four steps have
   * no required field, so waiting for answers would leave the indicator stuck
   * at step one for anyone whose year had no capital gains, no contributions
   * and no spouse — which is most people.
   */
  const done = (index: number) => index < step || calculated;

  /**
   * Revenue and expenses, from the feed.
   *
   * `transactionSummary` already excludes personal spending and transfers,
   * which is exactly the line between "what the business earned" and "what went
   * through the account" — so this fills the field with the figure the estimate
   * wants rather than the one the bank shows.
   */
  const pull = (field: "revenue" | "expenses") => () => {
    const year = TAX_YEARS.find((entry) => entry.label === draft.year);
    const inYear = transactions.filter(
      (transaction) => financialYearOf(transaction.date) === year?.endsIn,
    );
    const summary = transactionSummary(inYear);
    const value = field === "revenue" ? summary.moneyIn : summary.moneyOut;

    if (value === 0) {
      toast(`No ${field === "revenue" ? "income" : "expenses"} to pull`, {
        description: `Nothing in your transactions for ${draft.year} yet.`,
      });
      return;
    }

    patch({ [field]: String(value) } as Partial<TaxDraft>);
    toast.success(`Pulled ${reportMoney(value)} from your transactions`, {
      description: `${inYear.length} transactions in ${draft.year}. Edit it if that's not the whole picture.`,
    });
  };

  const calculate = () => {
    setCalculated(true);

    /*
     * On the button, not on `estimateTax`. That function is pure arithmetic
     * re-run on every keystroke — `tax-results-panel` calls it on each render
     * — so instrumenting it would have produced hundreds of events per person
     * and a number nobody could interpret. Pressing Calculate is the one
     * deliberate act here.
     */
    track(EVENTS.TAX_ESTIMATOR_USED, {
      estimated_tax: estimateTax(draft).estimatedTaxPayable,
      year: draft.year,
    });

    toast.success("Tax estimate updated", {
      description: `${reportMoney(estimateTax(draft).estimatedTaxPayable)} estimated for ${draft.year}. An estimate, not tax advice.`,
    });
  };

  return (
    <div className="space-y-[15px]">
      {/* Header ------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          {/* Back to the hub it's launched from, which is the only way in. */}
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href={RESOURCES_HREF}>
              <ArrowLeft />
              Widgets &amp; Resources
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tax Estimator
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Label
            htmlFor="tax-year"
            className="text-sm font-medium text-muted-foreground"
          >
            Financial year
          </Label>
          <Select
            value={draft.year}
            onValueChange={(value) => patch({ year: value as TaxYearLabel })}
          >
            <SelectTrigger id="tax-year" className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_YEARS.map((year) => (
                <SelectItem key={year.label} value={year.label}>
                  {year.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Body --------------------------------------------------------- */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <StepProgress current={step} done={done} onJump={setStep} />

          <FormSection
            icon={active.icon}
            title={active.title}
            description={active.subtitle}
            // The tint the Quote editor's sections use, one stop stronger:
            // this is the only section on the page, so it carries the whole
            // header rather than dividing a stack of them.
            headerClassName="gap-3 px-4 py-3.5 bg-primary/[0.06] dark:bg-primary/[0.12]"
            action={
              <span className="text-xs text-muted-foreground">
                Step {step + 1} of {TAX_STEPS.length}
              </span>
            }
            className="space-y-6 p-5"
          >
            {step === 0 && (
              <IncomeStep draft={draft} patch={patch} onPull={pull} />
            )}
            {step === 1 && <GainsStep draft={draft} patch={patch} />}
            {step === 2 && <SuperStep draft={draft} patch={patch} />}
            {step === 3 && <MedicareStep draft={draft} patch={patch} />}

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              {last ? (
                <Button onClick={calculate}>Calculate Tax</Button>
              ) : (
                <NextButton
                  // The platform's rule: an action that doesn't apply is
                  // disabled with the reason on hover, never hidden.
                  blockedBy={
                    step === 0 && !incomeComplete(draft)
                      ? "Enter your revenue and expenses first."
                      : undefined
                  }
                  onClick={() => setStep(step + 1)}
                />
              )}
            </div>
          </FormSection>
        </div>

        <TaxResultsPanel draft={draft} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

/**
 * Four circles and the line between them.
 *
 * The line is its own element between items rather than a border on them, so
 * "filled up to here" is a state of the gap and not of either circle — which is
 * what lets the third connector be indigo while the fourth circle is still
 * inactive.
 *
 * A completed circle is a button back to its step. Everything behind you is
 * already reachable with the Back button, so this is a shortcut to a state
 * rather than a new way to break the sequence.
 */
function StepProgress({
  current,
  done,
  onJump,
}: {
  current: number;
  done: (index: number) => boolean;
  onJump: (index: number) => void;
}) {
  return (
    <ol className="flex items-start" aria-label="Progress">
      {TAX_STEPS.map((step, index) => {
        const complete = done(index);
        const isCurrent = index === current;
        const lit = complete || isCurrent;

        const circle = (
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold",
              "motion-safe:transition-colors",
              complete
                ? "border-primary bg-primary text-primary-foreground"
                : isCurrent
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground",
            )}
          >
            {complete ? <Check className="size-4" aria-hidden /> : index + 1}
          </span>
        );

        return (
          <React.Fragment key={step.id}>
            {index > 0 && (
              <li
                aria-hidden
                className={cn(
                  "mt-4 h-0.5 min-w-4 flex-1 motion-safe:transition-colors",
                  done(index - 1) ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <li
              className="flex w-20 flex-col items-center gap-2 sm:w-28"
              aria-current={isCurrent ? "step" : undefined}
            >
              {complete && !isCurrent ? (
                <button
                  type="button"
                  onClick={() => onJump(index)}
                  aria-label={`Back to ${step.nav}`}
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {circle}
                </button>
              ) : (
                circle
              )}
              <span
                className={cn(
                  "text-center text-[12px] leading-tight",
                  lit ? "text-primary" : "text-muted-foreground",
                )}
              >
                {step.nav}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/**
 * Next, with a reason when it can't be pressed.
 *
 * The span around the button is load-bearing: a disabled button fires no
 * pointer events, so the tooltip needs a wrapper that does — the same shape
 * `RowIconButton` uses for the same reason.
 */
function NextButton({
  blockedBy,
  onClick,
}: {
  blockedBy?: string;
  onClick: () => void;
}) {
  const button = (
    <Button onClick={onClick} disabled={!!blockedBy}>
      Next
    </Button>
  );

  if (!blockedBy) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{blockedBy}</TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ *
 * Fields
 * ------------------------------------------------------------------ */

type Patch = (next: Partial<TaxDraft>) => void;

/** A label, its tooltip, and whatever the field wants beside them. */
function FieldLabel({
  htmlFor,
  label,
  tip,
  required,
  action,
}: {
  htmlFor: string;
  label: string;
  tip: string;
  required?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-6 items-center gap-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <InfoTip text={tip} />
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

function MoneyField({
  id,
  label,
  tip,
  required,
  value,
  onChange,
  disabled,
  action,
}: {
  id: string;
  label: string;
  tip: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel
        htmlFor={id}
        label={label}
        tip={tip}
        required={required}
        action={action}
      />
      <MoneyInput
        id={id}
        value={value}
        onChange={onChange}
        label={label}
        disabled={disabled}
        placeholder="0.00"
      />
    </div>
  );
}

/** The sparkle shortcut beside Revenue and Expenses. */
function PullFromTransactions({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-6 gap-1 px-1.5 text-[12px] font-medium text-primary hover:bg-primary/10 hover:text-primary [&_svg]:size-3"
    >
      <Sparkles aria-hidden />
      Pull from transactions
    </Button>
  );
}

/** A question with a switch, and whatever the answer reveals beneath it. */
function ToggleRow({
  id,
  label,
  tip,
  required,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  label: string;
  tip: string;
  required?: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-sm font-medium">
            {label}
            {required && <span className="text-destructive"> *</span>}
          </p>
          <InfoTip text={tip} />
        </div>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-label={label}
        />
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** The soft indigo note that stands in for a section nobody needs. */
function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-primary/20 bg-primary/[0.06] p-3">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p className="text-sm leading-relaxed text-primary-heading">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The four steps
 * ------------------------------------------------------------------ */

function IncomeStep({
  draft,
  patch,
  onPull,
}: {
  draft: TaxDraft;
  patch: Patch;
  onPull: (field: "revenue" | "expenses") => () => void;
}) {
  return (
    /*
     * Two columns that stack on small screens, and the fields are ordered down
     * each column rather than across the pair — income and its deductions face
     * each other, which is the comparison someone filling this in is making.
     */
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <div className="space-y-4">
        <MoneyField
          id="tax-revenue"
          label="Revenue"
          required
          tip="Everything the business invoiced or was paid this financial year, before expenses."
          value={draft.revenue}
          onChange={(revenue) => patch({ revenue })}
          action={<PullFromTransactions onClick={onPull("revenue")} />}
        />
        <MoneyField
          id="tax-additional-income"
          label="Additional Income"
          tip="Income from outside the business — salary, interest, dividends, rent."
          value={draft.additionalIncome}
          onChange={(additionalIncome) => patch({ additionalIncome })}
        />

        <div className="space-y-1.5">
          <FieldLabel
            htmlFor="tax-entity"
            label="Entity Type"
            tip="How the business is structured. A company pays a flat rate and no Medicare levy; the others are taxed at individual rates."
          />
          <Select
            value={draft.entityType}
            onValueChange={(value) =>
              patch({ entityType: value as EntityType })
            }
          >
            <SelectTrigger id="tax-entity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <MoneyField
          id="tax-capital-works"
          label="Capital Works Deduction"
          tip="The deduction for construction costs on a building you use for the business, spread over its life."
          value={draft.capitalWorksDeduction}
          onChange={(capitalWorksDeduction) => patch({ capitalWorksDeduction })}
        />
        <MoneyField
          id="tax-payg"
          label="PAYG Instalments Paid"
          tip="What you've already paid the ATO in instalments this year. It comes off the estimate at the end."
          value={draft.paygInstalments}
          onChange={(paygInstalments) => patch({ paygInstalments })}
        />
      </div>

      <div className="space-y-4">
        <MoneyField
          id="tax-expenses"
          label="Expenses"
          required
          tip="Everything the business spent that it can claim — the money-out side of your transactions."
          value={draft.expenses}
          onChange={(expenses) => patch({ expenses })}
          action={<PullFromTransactions onClick={onPull("expenses")} />}
        />
        <MoneyField
          id="tax-additional-deductions"
          label="Additional Deductions"
          tip="Claimable costs that aren't in your expenses — home office, donations, professional subscriptions."
          value={draft.additionalDeductions}
          onChange={(additionalDeductions) => patch({ additionalDeductions })}
        />
        <MoneyField
          id="tax-depreciation"
          label="Additional Depreciation"
          tip="Decline in value on assets not already in your expenses. The asset registry works this out for what it holds."
          value={draft.additionalDepreciation}
          onChange={(additionalDepreciation) =>
            patch({ additionalDepreciation })
          }
        />
        <MoneyField
          id="tax-add-backs"
          label="Non-Deductible Add-backs"
          tip="Spending that went through the books but can't be claimed — fines, entertainment, the private share of a mixed expense."
          value={draft.nonDeductibleAddBacks}
          onChange={(nonDeductibleAddBacks) => patch({ nonDeductibleAddBacks })}
        />
      </div>
    </div>
  );
}

function GainsStep({ draft, patch }: { draft: TaxDraft; patch: Patch }) {
  return (
    <div className="space-y-4">
      <ToggleRow
        id="tax-has-gains"
        label="Did you make any capital gains this financial year?"
        required
        tip="A capital gain is the profit on selling an asset — shares, property, equipment, a domain name."
        checked={draft.hasCapitalGains}
        onCheckedChange={(hasCapitalGains) => patch({ hasCapitalGains })}
      />

      {draft.hasCapitalGains ? (
        <>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <MoneyField
              id="tax-gains"
              label="Total Capital Gains"
              tip="What you sold the assets for, less what you paid and what it cost you to sell."
              value={draft.capitalGains}
              onChange={(capitalGains) => patch({ capitalGains })}
            />
            <MoneyField
              id="tax-losses"
              label="Total Capital Losses"
              tip="Losses on assets sold this year. They offset gains — a net loss carries forward rather than reducing your income."
              value={draft.capitalLosses}
              onChange={(capitalLosses) => patch({ capitalLosses })}
            />
          </div>

          <ToggleRow
            id="tax-cgt-discount"
            label="Eligible for CGT discount"
            tip="Individuals and trusts holding an asset over twelve months are taxed on half the gain. Companies get no discount."
            checked={draft.cgtDiscount}
            onCheckedChange={(cgtDiscount) => patch({ cgtDiscount })}
          />
        </>
      ) : (
        <InfoBanner>
          You have indicated no capital gains for this financial year. This
          section will be exempt from your tax estimate.
        </InfoBanner>
      )}
    </div>
  );
}

function SuperStep({ draft, patch }: { draft: TaxDraft; patch: Patch }) {
  const off = !draft.madeSuperContributions;

  return (
    <div className="space-y-4">
      <ToggleRow
        id="tax-made-super"
        label="Did you make any after-tax personal super contributions this financial year?"
        tip="Money you paid into super yourself, out of income you'd already been taxed on — not your employer's contributions."
        checked={draft.madeSuperContributions}
        onCheckedChange={(madeSuperContributions) =>
          patch({ madeSuperContributions })
        }
      />

      {/*
        Disabled rather than hidden. The two figures are the substance of this
        step, and a step whose card emptied out when the answer was no would
        leave nothing to say what the question had been about.
      */}
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <MoneyField
          id="tax-super-contributions"
          label="Total Contributions"
          tip="Everything you put in personally this year. Up to the $30,000 concessional cap can be claimed as a deduction."
          value={draft.superContributions}
          onChange={(superContributions) => patch({ superContributions })}
          disabled={off}
        />
        <MoneyField
          id="tax-super-taxable-income"
          label="Total Taxable Income"
          tip="The income you're claiming the contribution against. A deduction can't be larger than the income it reduces."
          value={draft.superTaxableIncome}
          onChange={(superTaxableIncome) => patch({ superTaxableIncome })}
          disabled={off}
        />
      </div>
    </div>
  );
}

function MedicareStep({ draft, patch }: { draft: TaxDraft; patch: Patch }) {
  return (
    <div className="space-y-3">
      <ToggleRow
        id="tax-has-spouse"
        label="Did you have a spouse this financial year?"
        required
        tip="Married or de facto. It raises the surcharge thresholds to the family ones, which is why their income is asked for."
        checked={draft.hasSpouse}
        onCheckedChange={(hasSpouse) => patch({ hasSpouse })}
      >
        {draft.hasSpouse && (
          <MoneyField
            id="tax-spouse-income"
            label="Spouse's Gross Income"
            tip="Their income before tax. It moves you up the surcharge tiers but isn't itself surcharged here."
            value={draft.spouseIncome}
            onChange={(spouseIncome) => patch({ spouseIncome })}
          />
        )}
      </ToggleRow>

      <ToggleRow
        id="tax-medicare-exempt"
        label="Were you eligible for Medicare Levy exemptions?"
        tip="Some visa holders, defence members and people with a medical exemption certificate pay no levy."
        checked={draft.medicareExempt}
        onCheckedChange={(medicareExempt) => patch({ medicareExempt })}
      />

      <ToggleRow
        id="tax-private-health"
        label="Did you have private health insurance?"
        tip="Appropriate hospital cover for the full year means no Medicare levy surcharge, whatever you earn."
        checked={draft.privateHealth}
        onCheckedChange={(privateHealth) => patch({ privateHealth })}
      />
    </div>
  );
}
