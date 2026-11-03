"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { Info, Landmark, Plus, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  PLANNER_ROOT,
  PlannerDetailHeader,
  PlannerNotFound,
  usePlannerSection,
} from "@/components/planner/planner-detail";
import { DeleteGoalDialog } from "@/components/planner/planner-dialogs";
import { StepNumber } from "@/components/planner/step-number";
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
  const [draft, setDraft] = React.useState<GoalDraft>(() =>
    editing ? draftFromGoal(editing) : emptyGoalDraft(),
  );
  const [edited, setEdited] = React.useState(false);

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
    setEdited(false);
  }, [editing]);

  const patch = (values: Partial<GoalDraft>) => {
    setEdited(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  const issues = goalIssues(draft, goalAllocated(editing ?? { allocations: [] }));
  const issueFor = (key: string) =>
    edited ? issues.find((issue) => issue.key === key)?.message : undefined;

  /**
   * The figures are read from the draft plus the saved allocations, so editing
   * the target updates them live — but a goal that hasn't been saved yet has no
   * allocations, which is the honest starting point.
   */
  const live = {
    ...draft,
    created: editing?.created ?? today,
    allocations: editing?.allocations ?? [],
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
    setEdited(true);
    if (issues.length > 0) return;

    try {
      const saved = await saveGoal.mutateAsync({
        id: editing?.id ?? null,
        draft,
      });

      if (editing) {
        toast.success("Goal saved", { description: goalSummaryLine(draft) });
        router.push(PLANNER_ROOT);
        return;
      }

      toast.success("Goal created", { description: goalSummaryLine(draft) });
      // Replaces rather than pushes, and lands on the saved goal so allocating
      // to it is the obvious next step — Back then leaves for the list, not for
      // a blank form that no longer exists.
      router.replace(`${PLANNER_ROOT}/goals/${saved.id}`);
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
    <div className="space-y-4">
      <PlannerDetailHeader
        backHref={PLANNER_ROOT}
        backLabel="Goals"
        crumbs={[
          { label: "Business planner", href: PLANNER_ROOT },
          { label: "Goals", href: PLANNER_ROOT },
          { label: editing ? editing.name || "Untitled goal" : "New goal" },
        ]}
        action={
          <Button
            onClick={onSave}
            disabled={(edited && issues.length > 0) || saveGoal.isPending}
            data-usertour="goal-save"
          >
            {saveGoal.isPending ? "Saving..." : "Save goal"}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* Step 1 ------------------------------------------------------- */}
          <Card data-usertour="goal-target">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2.5 text-base">
                <StepNumber n={1} />
                Set the target
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Goal name" required error={issueFor("name")}>
                <Input
                  value={draft.name}
                  onChange={(event) => patch({ name: event.target.value })}
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
            </CardContent>
          </Card>

          {/* Step 2 ------------------------------------------------------- */}
          <Card data-usertour="goal-progress">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="flex items-center gap-2.5 text-base">
                <StepNumber n={2} />
                Track progress
              </CardTitle>
              {/* Suppressed entirely until the goal is measurable. */}
              {status && (
                <Badge variant={goalStatusVariant(status)}>{status}</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
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
                  loadingSources={fundingQuery.isLoading}
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
            </CardContent>
          </Card>
        </div>

        {/* Sidebar ------------------------------------------------------- */}
        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4 text-primary" aria-hidden />
              How Sole tracks this goal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
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
          </CardContent>
        </Card>
      </div>

      {/* Footer. Save lives in the header row, so it isn't offered twice. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={!editing}
          onClick={() => editing && setDeleteId(editing.id)}
        >
          <Trash2 />
          Delete
        </Button>
        <Button variant="outline" asChild>
          <Link href={PLANNER_ROOT}>Back to goals</Link>
        </Button>
      </div>

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

  if (loadingSources && sources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border surface-subtle p-4 text-sm text-muted-foreground">
        Loading funding sources...
      </p>
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
