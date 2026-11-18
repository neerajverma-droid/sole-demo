"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { CalendarDays, ListChecks, StickyNote, Target } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { BudgetLinkedExpenses } from "@/components/planner/budget-expenses";
import { CategoryChecklist } from "@/components/planner/category-checklist";
import { MoneyInput } from "@/components/planner/money-input";
import {
  PLANNER_ROOT,
  PlannerDetailHeader,
  PlannerFormFooter,
  PlannerNotFound,
  useFieldTouch,
  usePlannerSection,
} from "@/components/planner/planner-detail";
import { DeleteBudgetDialog } from "@/components/planner/planner-dialogs";
import { deleteBudgetIdAtom } from "@/lib/atoms";
import { invoiceMoney, parseIsoDate, toIsoDate } from "@/lib/invoices";
import {
  BUDGET_PERIODS,
  budgetAmount,
  budgetAutoEndDate,
  budgetIssues,
  budgetSummaryLine,
  draftFromBudget,
  emptyBudgetDraft,
  type BudgetDraft,
  type BudgetPeriod,
} from "@/lib/planner";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  usePlannerBudgetsQuery,
  usePlannerCategoriesQuery,
  useSaveBudgetMutation,
} from "@/hooks/use-planner-query";
import { usePlannerStore } from "@/stores/planner";
import { activeCurrencySymbol } from "@/lib/country-context";

/**
 * The budget page: the same stacked, numbered form as a goal and an expense
 * plan, rather than the cramped modal this used to be.
 *
 * Four steps down the page — the amount, the window it applies to, the expense
 * categories it reads spend from, and a note. Nothing is a wizard: every step is
 * on the page at once, and the alert-threshold hint recomputes from what's typed
 * so the percentage reads as a dollar figure before it's saved.
 */
export function BudgetDetail({
  budgetId,
}: {
  /** Undefined when creating; a budget id when opening one. */
  budgetId?: string;
}) {
  const router = useRouter();
  const today = toIsoDate(new Date());
  // Leaving this page returns to the Budget tab, not to Overview.
  usePlannerSection("Budget");
  const [, setDeleteId] = useAtom(deleteBudgetIdAtom);
  const budgets = usePlannerStore((state) => state.budgets);

  // Reachable directly, so this page loads what it needs itself.
  const budgetsQuery = usePlannerBudgetsQuery();
  const saveBudget = useSaveBudgetMutation();
  /**
   * The categories a budget can cover, from the chart of accounts rather than a
   * fixed list — the API stores them as `account_subcategory_id`s, so anything
   * not in the catalogue couldn't be saved against the budget anyway.
   */
  const categoriesQuery = usePlannerCategoriesQuery();
  const categoryOptions = React.useMemo(
    () => (categoriesQuery.data ?? []).map((category) => category.name),
    [categoriesQuery.data],
  );

  const editing = budgetId
    ? budgets.find((budget) => budget.id === budgetId)
    : undefined;
  const [draft, setDraft] = React.useState<BudgetDraft>(() =>
    editing ? draftFromBudget(editing) : emptyBudgetDraft(today),
  );
  const fields = useFieldTouch();

  // Seed the form again the first time the budget arrives — see GoalDetail for
  // why: this page often mounts before its list has loaded.
  const seededId = React.useRef<string | null>(editing?.id ?? null);
  React.useEffect(() => {
    if (!editing || seededId.current === editing.id) return;
    seededId.current = editing.id;
    setDraft(draftFromBudget(editing));
    fields.reset();
  }, [editing, fields.reset]);

  const patch = (values: Partial<BudgetDraft>) => {
    setDraft((current) => ({ ...current, ...values }));
  };

  /**
   * Choosing a period fills in the end date it implies, and moving the start
   * date moves that end with it — the same behaviour as the reference form,
   * where only Custom leaves you to type an end date yourself.
   */
  const setPeriod = (period: BudgetPeriod) =>
    patch({
      period,
      endDate:
        period === "Custom"
          ? draft.endDate
          : budgetAutoEndDate(draft.startDate, period),
    });

  const setStartDate = (startDate: string) =>
    patch({
      startDate,
      endDate:
        draft.period === "Custom"
          ? draft.endDate
          : budgetAutoEndDate(startDate, draft.period),
    });

  const issues = budgetIssues(draft);
  // Shown once a field has been left, or everything once Save is pressed.
  const issueFor = (key: string) => fields.visible(issues, key);

  const amount = budgetAmount(draft);
  const threshold = Number(draft.alertThreshold);
  // Only worth saying once both halves are real; otherwise it'd read "$0".
  const alertHint =
    amount > 0 && Number.isFinite(threshold) && threshold > 0 && threshold <= 100
      ? `Sole flags this budget once spending passes ${invoiceMoney((amount * threshold) / 100)}.`
      : "The share of the amount at which Sole flags the budget.";

  const onSave = async () => {
    fields.submit();
    if (issues.length > 0) return;

    try {
      await saveBudget.mutateAsync({ id: editing?.id ?? null, draft });
      toast.success(editing ? "Budget saved" : "Budget created", {
        description: budgetSummaryLine(draft),
      });
      // Back to the Budget tab either way: unlike a goal, there's nothing to do
      // on a saved budget — the spend comes from the ledger on its own.
      router.push(PLANNER_ROOT);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save budget."));
    }
  };

  // A URL that points at a budget which no longer exists — only once the list
  // has loaded, since until then it simply hasn't arrived.
  if (budgetId && !editing && !budgetsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <PlannerDetailHeader
          backHref={PLANNER_ROOT}
          backLabel="Budget"
          crumbs={[
            { label: "Business planner", href: PLANNER_ROOT },
            { label: "Budget", href: PLANNER_ROOT },
            { label: "Not found" },
          ]}
        />
        <PlannerNotFound
          what="budget"
          backHref={PLANNER_ROOT}
          backLabel="Back to budgets"
        />
      </div>
    );
  }

  return (
    <div className="space-y-[15px]">
      <PlannerDetailHeader
        backHref={PLANNER_ROOT}
        backLabel="Budget"
        crumbs={[
          { label: "Business planner", href: PLANNER_ROOT },
          { label: "Budget", href: PLANNER_ROOT },
          { label: editing ? editing.name || "Untitled budget" : "New budget" },
        ]}
      />

      <div className="space-y-[15px]">
        {/* Step 1 --------------------------------------------------------- */}
        <div data-usertour="budget-target">
          <FormSection
            icon={Target}
            title="Set the target"
            description="How much this envelope allows, and when Sole should warn you."
            className="space-y-4"
          >
            <Field
              label="Budget name"
              htmlFor="budget-name"
              required
              error={issueFor("name")}
            >
              <Input
                id="budget-name"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                onBlur={() => fields.touch("name")}
                placeholder="Software & subscriptions"
                aria-invalid={!!issueFor("name")}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Amount (${activeCurrencySymbol()})`} required error={issueFor("amount")}>
                <MoneyInput
                  value={draft.amount}
                  onChange={(value) => patch({ amount: value })}
                  onBlur={() => fields.touch("amount")}
                  label="Budget amount"
                  invalid={!!issueFor("amount")}
                />
              </Field>

              <Field
                label="Alert threshold (%)"
                required
                hint={alertHint}
                error={issueFor("alertThreshold")}
              >
                <PercentInput
                  value={draft.alertThreshold}
                  onChange={(value) => patch({ alertThreshold: value })}
                  onBlur={() => fields.touch("alertThreshold")}
                  label="Alert threshold"
                  invalid={!!issueFor("alertThreshold")}
                />
              </Field>
            </div>
          </FormSection>
        </div>

        {/* Step 2 --------------------------------------------------------- */}
        <div data-usertour="budget-timeline">
          <FormSection
            icon={CalendarDays}
            title="Timeline"
            description="The window the budget's spend is read from."
            className="space-y-4"
          >
            <Field
              label="Period"
              hint={
                draft.period === "Custom"
                  ? "Spend is read between the two dates below."
                  : "Spend is read between the dates below, which this period fills in for you."
              }
            >
              <Select
                value={draft.period}
                onValueChange={(period) => setPeriod(period as BudgetPeriod)}
              >
                <SelectTrigger aria-label="Period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUDGET_PERIODS.map((period) => (
                    <SelectItem key={period} value={period}>
                      {period}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Start date"
                required={draft.period === "Custom"}
                error={issueFor("startDate")}
              >
                <DatePicker
                  value={draft.startDate}
                  onChange={setStartDate}
                  onClose={() => fields.touch("startDate")}
                  invalid={!!issueFor("startDate")}
                  label="Start date"
                />
              </Field>

              <Field
                label="End date"
                required={draft.period === "Custom"}
                error={issueFor("endDate")}
              >
                {/* Can't precede the start, so the calendar won't offer it. */}
                <DatePicker
                  value={draft.endDate}
                  onChange={(iso) => patch({ endDate: iso })}
                  onClose={() => fields.touch("endDate")}
                  invalid={!!issueFor("endDate")}
                  fromDate={parseIsoDate(draft.startDate)}
                  label="End date"
                />
              </Field>
            </div>
          </FormSection>
        </div>

        {/* Step 3 --------------------------------------------------------- */}
        <div data-usertour="budget-categories">
          <FormSection
            icon={ListChecks}
            title="Assign categories"
            description="Which expenses count against this budget."
            className="space-y-4"
          >
            <Field
              label="Expense categories"
              required
              hint="Choose the categories for this budget. Once it's saved, link the expenses that count towards it."
              error={issueFor("categories")}
            >
              <CategoryChecklist
                options={categoryOptions}
                selected={draft.categories}
                onChange={(categories) => patch({ categories })}
                onTouched={() => fields.touch("categories")}
                invalid={!!issueFor("categories")}
                placeholder={
                  categoriesQuery.isLoading
                    ? "Loading categories"
                    : "Search categories"
                }
              />
            </Field>
          </FormSection>
        </div>

        {/* Step 4 --------------------------------------------------------- */}
        <FormSection icon={StickyNote} title="Notes">
          <Field
            label="Notes"
            htmlFor="budget-notes"
            hint="Optional. Only you see this."
          >
            <Textarea
              id="budget-notes"
              rows={4}
              value={draft.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              placeholder="What this envelope is meant to cover, and what it isn't."
            />
          </Field>
        </FormSection>

        {/* Which expenses count against this budget.
            Only for a budget that exists — there is nothing to link an expense
            to until it has been saved, and the picker is scoped by the saved
            budget's categories and period. */}
        {editing && (
          <BudgetLinkedExpenses
            budgetId={editing.id}
            budgetAmount={amount}
          />
        )}
      </div>

      {/* Save, like every other form, lives bottom right. */}
      <PlannerFormFooter
        onCancel={() => router.push(PLANNER_ROOT)}
        onSave={onSave}
        saving={saveBudget.isPending}
        saveLabel={editing ? "Update budget" : "Save budget"}
        onDelete={editing ? () => setDeleteId(editing.id) : undefined}
        saveTourId="budget-save"
      />

      {/* Mounted here rather than on the list: confirming has to leave the
          page, which the list's copy can't do. */}
      <DeleteBudgetDialog onDeleted={() => router.push(PLANNER_ROOT)} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/**
 * A percentage field. Suffixed rather than prefixed, and otherwise the twin of
 * MoneyInput — typed text with a live error, keystrokes never blocked.
 */
function PercentInput({
  value,
  onChange,
  onBlur,
  label,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label: string;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        className={cn(
          "pr-7 tabular",
          invalid && "border-destructive focus-visible:ring-destructive",
        )}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-label={label}
        aria-invalid={!!invalid}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}
