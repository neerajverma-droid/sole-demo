"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { Info, Landmark, Plus, Target, TrendingUp, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { MoneyInput } from "@/components/planner/money-input";
import {
  GOAL_ALLOCATION_HASH,
  PLANNER_ROOT,
  PlannerDetailHeader,
  PlannerFormFooter,
  PlannerNotFound,
  useFieldTouch,
  usePlannerSection,
} from "@/components/planner/planner-detail";
import { DeleteGoalDialog } from "@/components/planner/planner-dialogs";
import { deleteGoalIdAtom } from "@/lib/atoms";
import { formatInvoiceDate, invoiceMoney, toIsoDate } from "@/lib/invoices";
import {
  GOAL_TYPES,
  GOAL_TYPE_HINTS,
  allocationIssue,
  allocationMessage,
  contributionRule,
  draftFromGoal,
  emptyGoalDraft,
  formatOrDash,
  goalAllocated,
  goalIssues,
  goalProgress,
  goalStatus,
  goalStatusVariant,
  goalSummaryLine,
  pacingLine,
  goalRemaining,
  goalTarget,
  requiredWeekly,
  type FundingSource,
  type GoalDraft,
  type GoalType,
} from "@/lib/planner";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  useAllocateToGoalMutation,
  useGoalFundingQuery,
  usePlannerGoalsQuery,
  useRemoveAllocationMutation,
  useSaveGoalMutation,
} from "@/hooks/use-planner-query";
import { fundingSourcesFromSummary } from "@/lib/planner-api";
import { usePlannerStore } from "@/stores/planner";
import { EVENTS } from "@/lib/analytics-events";
import { useTrackOnce } from "@/hooks/use-track-once";

const WEEKLY_TIP =
  "What's left to reach the target, divided by the weeks until the target date.";

/**
 * The goal detail page: a two-step form — set the target, then track progress
 * against it.
 *
 * Every derived figure recomputes from what's typed, so the four figures under
 * step 1 and the ring in step 2 move as you edit rather than after saving. The
 * important restraint is that nothing status-shaped appears until the goal has
 * both a target amount and a date — a new goal is unfinished, not behind.
 */
export function GoalDetail({
  goalId,
}: {
  /** Undefined when creating; a goal id when opening one. */
  goalId?: string;
}) {
  useTrackOnce(EVENTS.CREATE_GOAL_INITIATED, !goalId);
  const router = useRouter();
  // Dated here rather than passed in, as the expense and refund forms do.
  const today = toIsoDate(new Date());
  // Leaving this page returns to the Goals tab, not to Overview.
  usePlannerSection("Goals");
  const [, setDeleteId] = useAtom(deleteGoalIdAtom);
  const goals = usePlannerStore((state) => state.goals);

  // The page is reachable directly, so it loads the goals itself rather than
  // relying on the planner screen having been visited first.
  const goalsQuery = usePlannerGoalsQuery();
  const saveGoal = useSaveGoalMutation();
  const allocate = useAllocateToGoalMutation();
  const removeAllocation = useRemoveAllocationMutation();
  /**
   * Where the money can come from, and how much of each is still unspoken for.
   *
   * From the API rather than worked out here: the server nets off every goal in
   * the business, while this page only knows about the ones it happens to have
   * loaded — so a locally-derived "available" could offer a dollar that another
   * goal has already claimed.
   */
  const fundingQuery = useGoalFundingQuery();

  const editing = goalId ? goals.find((goal) => goal.id === goalId) : undefined;

  /*
   * A link ending in #allocation (a row on the Goals list) means "take me to
   * the funding". The browser can't do it itself: this page often mounts
   * before the goal has loaded, so the section isn't there to scroll to yet.
   * Once the goal is, go there — once, so a later refetch doesn't pull the page
   * back from wherever the person has since scrolled to.
   */
  const scrolledToAllocation = React.useRef(false);
  React.useEffect(() => {
    if (!editing || scrolledToAllocation.current) return;
    if (window.location.hash !== `#${GOAL_ALLOCATION_HASH}`) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(GOAL_ALLOCATION_HASH)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      scrolledToAllocation.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);
  const [draft, setDraft] = React.useState<GoalDraft>(() =>
    editing ? draftFromGoal(editing) : emptyGoalDraft(),
  );
  const fields = useFieldTouch();

  /**
   * Seed the form again the first time the goal actually arrives.
   *
   * This page is reachable by link and by refresh, so it often mounts before
   * the list has loaded — at which point `editing` is undefined and the draft
   * above starts blank. Without this, the form would stay blank over a goal
   * that does exist, and saving would wipe it.
   */
  const seededId = React.useRef<string | null>(editing?.id ?? null);
  React.useEffect(() => {
    if (!editing || seededId.current === editing.id) return;
    seededId.current = editing.id;
    setDraft(draftFromGoal(editing));
    fields.reset();
  }, [editing, fields.reset]);

  const patch = (values: Partial<GoalDraft>) => {
    setDraft((current) => ({ ...current, ...values }));
  };

  const issues = goalIssues(draft, goalAllocated(editing ?? { allocations: [] }));
  // Shown once a field has been left, or everything once Save is pressed.
  const issueFor = (key: string) => fields.visible(issues, key);

  /**
   * The figures are read from the draft plus the saved allocations, so editing
   * the target updates them live — but a goal that hasn't been saved yet has no
   * allocations, which is the honest starting point.
   */
  // The badge is the server's, as on the goals list, for as long as the target
  // the server judged is the one on the form. Once the amount or date is being
  // edited it no longer applies, so the local pacing answers live instead.
  const serverStatusApplies =
    !!editing &&
    draft.targetAmount === editing.targetAmount &&
    draft.targetDate === editing.targetDate;
  const live = {
    ...draft,
    created: editing?.created ?? today,
    allocations: editing?.allocations ?? [],
    computedStatus: serverStatusApplies ? (editing?.computedStatus ?? null) : null,
  };

  const target = goalTarget(live);
  const allocated = goalAllocated(live);
  const remaining = goalRemaining(live);
  const weekly = requiredWeekly(live, today);
  const status = goalStatus(live, today);
  const progress = goalProgress(live);
  const message = allocationMessage(live);
  const pacing = pacingLine(live, today);
  const sources = React.useMemo(
    () => (fundingQuery.data ? fundingSourcesFromSummary(fundingQuery.data) : []),
    [fundingQuery.data],
  );

  const onSave = async () => {
    fields.submit();
    if (issues.length > 0) return;

    try {
      await saveGoal.mutateAsync({
        id: editing?.id ?? null,
        draft,
      });

      toast.success(editing ? "Goal saved" : "Goal created", {
        description: goalSummaryLine(draft),
      });
      // Creating and editing both end on the list; the new goal is one click
      // away there when it's time to allocate to it.
      router.push(PLANNER_ROOT);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save goal."));
    }
  };

  // A URL that points at a goal which no longer exists. Only once the list has
  // actually loaded — until then it isn't missing, it just hasn't arrived.
  if (goalId && !editing && !goalsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <PlannerDetailHeader
          backHref={PLANNER_ROOT}
          backLabel="Goals"
          crumbs={[
            { label: "Business planner", href: PLANNER_ROOT },
            { label: "Goals", href: PLANNER_ROOT },
            { label: "Not found" },
          ]}
        />
        <PlannerNotFound
          what="goal"
          backHref={PLANNER_ROOT}
          backLabel="Back to goals"
        />
      </div>
    );
  }

  return (
    <div className="space-y-[15px]">
      <PlannerDetailHeader
        backHref={PLANNER_ROOT}
        backLabel="Goals"
        crumbs={[
          { label: "Business planner", href: PLANNER_ROOT },
          { label: "Goals", href: PLANNER_ROOT },
          { label: editing ? editing.name || "Untitled goal" : "New goal" },
        ]}
      />

      <div className="grid gap-[15px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-[15px]">
          {/* Step 1 ------------------------------------------------------- */}
          <div data-usertour="goal-target">
            <FormSection
              icon={Target}
              title="Set the target"
              description="What you're saving for, how much, and by when."
              className="space-y-4"
            >
              <Field label="Goal name" required error={issueFor("name")}>
                <Input
                  value={draft.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  onBlur={() => fields.touch("name")}
                  placeholder="Three-month buffer"
                  aria-invalid={!!issueFor("name")}
                />
              </Field>

              <Field label="Goal type" hint={GOAL_TYPE_HINTS[draft.type]}>
                <Select
                  value={draft.type}
                  onValueChange={(value) => patch({ type: value as GoalType })}
                >
                  <SelectTrigger aria-label="Goal type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Target amount"
                  required
                  error={issueFor("targetAmount")}
                >
                  <MoneyInput
                    value={draft.targetAmount}
                    onChange={(value) => patch({ targetAmount: value })}
                    onBlur={() => fields.touch("targetAmount")}
                    label="Target amount"
                    invalid={!!issueFor("targetAmount")}
                  />
                </Field>

                <Field
                  label="Target date"
                  required
                  error={issueFor("targetDate")}
                >
                  {/* No default: a date of "today" would make a new goal
                      instantly overdue, which is the bug being avoided. */}
                  <DatePicker
                    value={draft.targetDate}
                    onChange={(iso) => patch({ targetDate: iso })}
                    onClose={() => fields.touch("targetDate")}
                    invalid={!!issueFor("targetDate")}
                    fromDate={new Date()}
                    label="Target date"
                  />
                </Field>
              </div>

              <dl className="grid gap-3 rounded-lg border border-dashed border-border surface-subtle p-3 sm:grid-cols-4">
                <Derived
                  label="Target"
                  value={target > 0 ? invoiceMoney(target) : "—"}
                />
                <Derived label="Allocated" value={invoiceMoney(allocated)} />
                <Derived
                  label="Remaining"
                  value={target > 0 ? invoiceMoney(remaining) : "—"}
                />
                <Derived
                  label="Required weekly"
                  value={formatOrDash(weekly)}
                  tip={WEEKLY_TIP}
                />
              </dl>
            </FormSection>
          </div>

          {/* Step 2 ------------------------------------------------------- */}
          <div
            id={GOAL_ALLOCATION_HASH}
            data-usertour="goal-progress"
            className="scroll-mt-6"
          >
            <FormSection
              icon={TrendingUp}
              title="Track progress"
              description="What's been set aside against the target."
              // Suppressed entirely until the goal is measurable.
              action={
                status ? (
                  <Badge variant={goalStatusVariant(status)}>{status}</Badge>
                ) : undefined
              }
              className="space-y-5"
            >
              <div className="flex flex-wrap items-center gap-5">
                <ProgressRing
                  percent={progress * 100}
                  measurable={target > 0}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm tabular">
                    {invoiceMoney(allocated)}
                    <span className="text-muted-foreground">
                      {" "}
                      of {target > 0 ? invoiceMoney(target) : "no target yet"}
                      {target > 0 && " set aside"}
                    </span>
                  </p>
                  <Progress value={progress * 100} />
                  <p
                    className={cn(
                      "text-xs",
                      message.tone === "success"
                        ? "text-success"
                        : "text-muted-foreground",
                    )}
                  >
                    {message.text}
                  </p>
                  {/* What to do about it, where there's something to do. Both
                      lines are suppressed rather than shown as zero — advice
                      nobody can act on is noise. */}
                  {pacing && (
                    <p className="text-xs text-muted-foreground">{pacing}</p>
                  )}
                  {allocated > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Allocations reduce estimated available cash by{" "}
                      <span className="font-medium tabular">
                        {invoiceMoney(allocated)}
                      </span>
                      .
                    </p>
                  )}
                </div>
              </div>

              {editing ? (
                <AllocationBlock
                  goalId={editing.id}
                  sources={sources}
                  loadingSources={fundingQuery.isFetching}
                  // Never more than the goal still needs, and never more than
                  // the account holds — whichever runs out first.
                  remaining={remaining}
                  pending={allocate.isPending}
                  onAllocate={async (allocation) => {
                    try {
                      await allocate.mutateAsync({
                        goalId: editing.id,
                        allocation,
                      });
                      return true;
                    } catch (error) {
                      toast.error(
                        apiErrorMessage(error, "Failed to add allocation."),
                      );
                      return false;
                    }
                  }}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-border surface-subtle p-4 text-sm text-muted-foreground">
                  Save the goal first — allocations attach to a saved goal.
                </p>
              )}

              {editing && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Allocation history
                  </p>
                  {editing.allocations.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                      No allocations yet
                    </p>
                  ) : (
                    <ul className="divide-y rounded-lg border border-border">
                      {editing.allocations.map((allocation) => (
                        <li
                          key={allocation.id}
                          className="flex items-center gap-3 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm tabular">
                              {invoiceMoney(allocation.amount)}
                              <span className="text-muted-foreground">
                                {" "}
                                from {allocation.source}
                              </span>
                            </p>
                            <p className="truncate text-xs text-muted-foreground tabular">
                              {formatInvoiceDate(allocation.date)}
                              {allocation.note && ` · ${allocation.note}`}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            disabled={removeAllocation.isPending}
                            onClick={async () => {
                              try {
                                await removeAllocation.mutateAsync({
                                  goalId: editing.id,
                                  allocationId: allocation.id,
                                });
                                toast.success("Allocation removed");
                              } catch (error) {
                                toast.error(
                                  apiErrorMessage(
                                    error,
                                    "Failed to remove allocation.",
                                  ),
                                );
                              }
                            }}
                            aria-label={`Remove allocation of ${invoiceMoney(allocation.amount)}`}
                          >
                            <X className="size-4 text-muted-foreground" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </FormSection>
          </div>
        </div>

        {/* Sidebar ------------------------------------------------------- */}
        <div className="h-fit lg:sticky lg:top-6">
          <FormSection
            icon={Info}
            title="How Sole tracks this goal"
            className="space-y-4 text-sm"
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contribution rule
              </p>
              <p className="leading-relaxed text-muted-foreground">
                {contributionRule(live, today)}
              </p>
            </div>
            <div className="space-y-1 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Available cash impact
              </p>
              <p className="leading-relaxed text-muted-foreground">
                Allocations are earmarked, not spent. They reduce your estimated
                available cash so you don&apos;t plan the same dollar twice, and
                they post no accounting transaction — nothing moves between
                accounts and nothing appears in your ledger.
              </p>
            </div>
          </FormSection>
        </div>
      </div>

      {/* Save, like every other form, lives bottom right. */}
      <PlannerFormFooter
        onCancel={() => router.push(PLANNER_ROOT)}
        onSave={onSave}
        saving={saveGoal.isPending}
        saveLabel={editing ? "Update goal" : "Save goal"}
        onDelete={editing ? () => setDeleteId(editing.id) : undefined}
        saveTourId="goal-save"
      />

      {/* Mounted here rather than on the list: this is the only place a goal
          can be deleted from, and confirming has to leave the page. */}
      <DeleteGoalDialog onDeleted={() => router.push(PLANNER_ROOT)} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Derived({
  label,
  value,
  tip,
}: {
  label: string;
  value: string;
  tip?: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {tip && <InfoTip text={tip} />}
      </dt>
      <dd className="text-sm font-medium tabular">{value}</dd>
    </div>
  );
}

/** The percentage ring. Renders an empty track while there's no target. */
function ProgressRing({
  percent,
  measurable,
}: {
  percent: number;
  measurable: boolean;
}) {
  const value = measurable ? Math.round(percent) : 0;
  return (
    <div
      className="relative grid size-24 shrink-0 place-items-center"
      role="img"
      aria-label={measurable ? `${value}% allocated` : "No target set yet"}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: measurable
            ? `conic-gradient(hsl(var(--primary)) ${value * 3.6}deg, hsl(var(--muted)) 0deg)`
            : "hsl(var(--muted))",
        }}
        aria-hidden
      />
      <div className="absolute inset-[9px] rounded-full bg-card" aria-hidden />
      <span className="relative text-lg font-semibold tabular">
        {measurable ? `${value}%` : "—"}
      </span>
    </div>
  );
}

/** Earmark cash from one account against this goal. */
function AllocationBlock({
  goalId,
  sources,
  loadingSources,
  remaining,
  pending,
  onAllocate,
}: {
  goalId: string;
  sources: FundingSource[];
  /** While the funding summary is still out — the list arrives after the goal. */
  loadingSources: boolean;
  /** What the goal still needs. Nothing beyond this can usefully be earmarked. */
  remaining: number;
  pending: boolean;
  /** Resolves true when the allocation was accepted, so the form can clear. */
  onAllocate: (allocation: {
    amount: number;
    note: string;
    sourceType: "cash" | "bank";
    bankAccountId?: number | null;
    bankAccountName?: string;
  }) => Promise<boolean>;
}) {
  const [source, setSource] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");

  // The sources arrive after this mounts, so the first one is chosen once they
  // do rather than in the initial state, which would have nothing to pick from.
  React.useEffect(() => {
    if (!source && sources.length > 0) setSource(sources[0].name);
  }, [source, sources]);

  const account = sources.find((entry) => entry.name === source);
  const available = account?.available ?? 0;
  /*
   * The cap is whichever runs out first: what the account still has spare, or
   * what the goal still needs. Earmarking past the target would report the goal
   * as more than complete, and past the account would spend the same dollar
   * twice.
   */
  const cap = Math.min(available, Math.max(remaining, 0));
  const issue = allocationIssue(amount, cap);
  const value = Number(amount) || 0;
  const fullyAllocated = remaining <= 0;

  const submit = async () => {
    if (!account) return;
    const cleared = await onAllocate({
      amount: value,
      note: note.trim(),
      sourceType: account.kind === "wallet" ? "cash" : "bank",
      bankAccountId: account.bankAccountId ?? null,
      bankAccountName: account.kind === "wallet" ? undefined : account.name,
    });
    if (!cleared) return;
    toast.success(`${invoiceMoney(value)} allocated`, {
      description: `Earmarked from ${account.name} — no transaction posted.`,
    });
    setAmount("");
    setNote("");
  };

  // Whenever the sources are being fetched, including a refresh over cached
  // ones: the balances shown beside the radio buttons are what a person
  // allocates against, so stale figures aren't worth showing.
  if (loadingSources) {
    return (
      <div
        className="space-y-4 rounded-lg border border-border p-4"
        aria-busy
        aria-label="Loading funding sources"
      >
        <Shimmer className="h-4 w-36" />
        <div className="space-y-2">
          {[0, 1].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <Shimmer className="size-4 rounded-full" />
              <Shimmer className="size-8 rounded-md" />
              <Shimmer className="h-4 flex-1" />
              <div className="space-y-1.5">
                <Shimmer className="ml-auto h-4 w-20" />
                <Shimmer className="ml-auto h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Shimmer className="h-9" />
          <Shimmer className="h-9" />
        </div>
        <Shimmer className="h-8 w-24" />
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border surface-subtle p-4 text-sm text-muted-foreground">
        No funding sources available. Connect a bank account or top up your cash
        wallet to start allocating.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Add to allocation</p>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs text-muted-foreground">
          Funding source
        </legend>
        <div className="space-y-2">
          {sources.map((entry) => {
            const chosen = source === entry.name;
            const Icon = entry.kind === "wallet" ? Wallet : Landmark;
            return (
              <label
                key={entry.name}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
                  chosen
                    ? "border-primary bg-primary/[0.04]"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name={`source-${goalId}`}
                  value={entry.name}
                  checked={chosen}
                  onChange={() => setSource(entry.name)}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-md",
                    chosen
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {entry.name}
                  {entry.detail && (
                    <span className="ml-2 text-xs text-muted-foreground tabular">
                      {entry.detail}
                    </span>
                  )}
                </span>
                {/* Balance is what's there; available is what's left to
                    earmark, and green only while there's some of it. */}
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular">
                    {invoiceMoney(entry.balance)}
                  </span>
                  <span
                    className={cn(
                      "block text-xs tabular",
                      entry.available > 0
                        ? "text-success"
                        : "text-muted-foreground",
                    )}
                  >
                    {invoiceMoney(entry.available)} available
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {account && (
        <p className="flex items-start gap-2 rounded-md border border-primary/25 bg-primary/[0.06] p-3 text-xs">
          <Info className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
          <span>
            Allocating from {account.name}:{" "}
            {remaining <= available ? (
              <>
                this goal needs{" "}
                <span className="font-medium tabular">
                  {invoiceMoney(Math.max(remaining, 0))}
                </span>{" "}
                more
              </>
            ) : (
              <>
                available{" "}
                <span className="font-medium tabular">
                  {invoiceMoney(available)}
                </span>
              </>
            )}
          </span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" error={issue}>
          <MoneyInput
            value={amount}
            onChange={setAmount}
            label="Allocation amount"
            invalid={!!issue}
          />
        </Field>
        <Field label="Note" hint="Optional.">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="July GST collected"
            aria-label="Allocation note"
          />
        </Field>
      </div>

      <Button
        size="sm"
        disabled={
          !!issue || value <= 0 || value > cap || !source || pending ||
          fullyAllocated
        }
        onClick={submit}
      >
        <Plus />
        {pending ? "Allocating..." : "Allocate"}
      </Button>
    </div>
  );
}
