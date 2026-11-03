"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Filter,
  Info,
  Loader2,
  Plus,
  Tag,
  Wand2,
  X,
} from "lucide-react";
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
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BusinessContactSelect } from "@/components/documents/business-contact-select";
import { Field } from "@/components/documents/field";
import { RuleCategorySelect } from "@/components/rules/rule-category-select";
import {
  useCreateRuleMutation,
  useUpdateRuleMutation,
} from "@/hooks/use-rules-query";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchBusinessContacts } from "@/lib/clients";
import type { ContactType } from "@/lib/contacts";
import {
  RULE_CHECKS,
  RULE_TYPES,
  draftFromRule,
  emptyRuleDraft,
  fetchRuleCategories,
  fetchRuleDetail,
  filterRuleCategories,
  invalidRuleValues,
  isNumericComparison,
  previewSentence,
  ruleComparesFor,
  ruleIssues,
  ruleValueError,
  ruleValueHint,
  type RuleCheck,
  type RuleCompare,
  type RuleDraft,
  type RuleType,
} from "@/lib/rules";
import { cn } from "@/lib/utils";

export function RuleForm({
  ruleId,
  onDone,
}: {
  ruleId?: string;
  /**
   * Embeds the form in place (the bulk upload's Matching rules step) instead
   * of running as its own page: Cancel and a successful save call this rather
   * than navigating back to /transactions/rules.
   */
  onDone?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const embedded = !!onDone;
  const finish = () =>
    onDone ? onDone() : router.push("/transactions/rules");
  const createRule = useCreateRuleMutation();
  const updateRule = useUpdateRuleMutation();

  const ruleQuery = useQuery({
    queryKey: ["rule", ruleId],
    queryFn: () => fetchRuleDetail(ruleId as string),
    enabled: !!ruleId,
  });
  const editing = ruleQuery.data;

  const [draft, setDraft] = React.useState<RuleDraft>(() => emptyRuleDraft());
  const [valueInput, setValueInput] = React.useState("");
  /**
   * Errors surface field by field, once that field has been touched — picking
   * a client or switching the type shouldn't light up every other empty field.
   * A save attempt reveals the lot, same as the invoice editor.
   */
  const [touchedFields, setTouchedFields] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [attempted, setAttempted] = React.useState(false);
  const touch = (...keys: string[]) =>
    setTouchedFields((current) =>
      keys.every((key) => current.has(key))
        ? current
        : new Set([...current, ...keys]),
    );
  const untouch = (...keys: string[]) =>
    setTouchedFields((current) =>
      keys.some((key) => current.has(key))
        ? new Set([...current].filter((key) => !keys.includes(key)))
        : current,
    );

  // The detail fetch lands after the form's first render (editing only) —
  // seed the draft once, so it doesn't clobber anything already typed.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (!editing || seededRef.current) return;
    seededRef.current = true;
    setDraft(draftFromRule(editing));
  }, [editing]);

  // The chart of accounts is fixed, platform-wide data — fetched once
  // regardless of type, and narrowed to Credit/Debit client-side, rather
  // than refetching the same list every time the type is switched.
  const categoriesQuery = useQuery({
    queryKey: ["rule-categories"],
    queryFn: fetchRuleCategories,
  });
  const categories = filterRuleCategories(
    categoriesQuery.data ?? [],
    draft.type,
  );

  const contactType: ContactType =
    draft.type === "Credit (income)" ? "Client" : "Supplier";

  const contactsQuery = useQuery({
    queryKey: ["rule-clients", contactType],
    queryFn: () => fetchBusinessContacts(contactType),
  });
  const contacts = contactsQuery.data ?? [];

  const fieldRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const register = (key: string) => (node: HTMLElement | null) => {
    fieldRefs.current[key] = node;
  };

  const issues = ruleIssues(draft);
  const issueFor = (key: string) =>
    attempted || touchedFields.has(key)
      ? issues.find((issue) => issue.key === key)?.message
      : undefined;

  const patch = (values: Partial<RuleDraft>) => {
    setDraft((current) => ({ ...current, ...values }));
  };

  // Live, never blocking: the keystrokes land and the error appears.
  const valueError = ruleValueError(valueInput, draft.check, draft.compare);
  const numeric = isNumericComparison(draft.check, draft.compare);
  const invalidValues = invalidRuleValues(draft);

  const commitValue = () => {
    const trimmed = valueInput.trim();
    if (!trimmed) return;
    // Add stays active whenever there's text, so an invalid value has to say
    // why it didn't take rather than looking like a dead button.
    if (valueError) {
      toast.error(valueError);
      return;
    }
    if (draft.values.includes(trimmed)) {
      setValueInput("");
      return;
    }
    touch("values");
    patch({ values: [...draft.values, trimmed] });
    setValueInput("");
  };

  const saving = createRule.isPending || updateRule.isPending;

  const onSave = () => {
    if (issues.length > 0) {
      // Never fail silently: reveal every error, say what's first, go to it.
      setAttempted(true);
      toast.error(issues[0].message);
      const target = fieldRefs.current[issues[0].key];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus({ preventScroll: true });
      }
      return;
    }
    if (editing) {
      updateRule.mutate(
        { id: editing.id, draft },
        {
          onSuccess: () => {
            toast.success("Rule updated");
            // Dropped, not just invalidated: the form seeds from the first
            // data it sees, so a cached copy would reopen with the old rule.
            queryClient.removeQueries({ queryKey: ["rule", editing.id] });
            finish();
          },
          onError: (error: Error) =>
            toast.error(error.message || "Failed to update rule."),
        },
      );
    } else {
      createRule.mutate(draft, {
        onSuccess: () => {
          toast.success("Rule added");
          finish();
        },
        onError: (error: Error) =>
          toast.error(error.message || "Failed to create rule."),
      });
    }
  };

  if (ruleId && ruleQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6" aria-hidden>
        <Shimmer className="h-8 w-48 rounded-md" />
        <Shimmer className="h-96 w-full rounded-lg border border-border" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        {!embedded && (
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/transactions/rules">
              <ArrowLeft />
              Matching rules
            </Link>
          </Button>
        )}

        {/* Actions live in the form header, not a duplicate footer pair. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1
              className={cn(
                "font-semibold tracking-tight",
                embedded ? "text-lg" : "text-2xl",
              )}
            >
              {editing ? "Edit rule" : "Add rule"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Fields marked with <span className="text-destructive">*</span> are
              required.
            </p>
          </div>
          <div className="flex gap-2">
            {embedded ? (
              <Button variant="outline" onClick={onDone} disabled={saving}>
                Cancel
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href="/transactions/rules">Cancel</Link>
              </Button>
            )}
            {/* After a save attempt, the hint says what's still outstanding. */}
            {attempted && issues.length > 0 && (
              <p className="self-center text-xs text-muted-foreground">
                {issues.length === 1
                  ? issues[0].message
                  : `${issues.length} fields need attention`}
              </p>
            )}
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Save rule"}
            </Button>
          </div>
        </div>
      </div>

      <FormSection
        icon={Wand2}
        title="Rule basics"
        description="What this rule is called and which transactions it looks at."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Transaction type">
          <Select
            value={draft.type}
            onValueChange={(value) => {
              // A different type draws from a different real client/supplier
              // list, and a different slice of the chart of accounts, so
              // whatever was picked under the old one is cleared. That's the
              // form's doing, not the user's, so it isn't flagged as missing.
              untouch("category", "client");
              patch({
                type: value as RuleType,
                clientId: null,
                clientName: "",
                categoryId: "",
              });
            }}
          >
            <SelectTrigger aria-label="Transaction type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Name" required error={issueFor("name")}>
          <Input
            ref={register("name")}
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
            onBlur={() => touch("name")}
            placeholder="Stripe payouts"
            aria-invalid={!!issueFor("name")}
            className={cn(
              issueFor("name") &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
        </Field>
      </FormSection>

      {/* Condition builder */}
      <FormSection
        icon={Filter}
        title="Conditions"
        description="A transaction has to match these for the rule to fire."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Step number={1} label="What to check">
            <Select
              value={draft.check}
              onValueChange={(value) => {
                const check = value as RuleCheck;
                // A compare picked under the old check may not be offered
                // under the new one (Amount's five vs. Description's two) —
                // reset to that check's own first option, same as sole-
                // webapp's own picker does on this same switch.
                const compare = ruleComparesFor(check)[0];
                // Values already added may stop being valid (text under an
                // Amount check), so they get re-checked — but an empty list
                // isn't something this change made wrong.
                if (draft.values.length > 0) touch("values");
                patch({ check, compare });
              }}
            >
              <SelectTrigger aria-label="What to check">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_CHECKS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Step>

          <Step number={2} label="How to compare">
            <Select
              value={draft.compare}
              onValueChange={(value) => {
                if (draft.values.length > 0) touch("values");
                patch({ compare: value as RuleCompare });
              }}
            >
              <SelectTrigger aria-label="How to compare">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ruleComparesFor(draft.check).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Step>

          <Step
            number={3}
            label={draft.check === "Amount" ? "Value to match" : "Word to match"}
            hint={ruleValueHint(draft.check, draft.compare)}
            required
          >
            <div className="flex gap-2">
              <Input
                ref={register("values")}
                value={valueInput}
                inputMode={numeric ? "decimal" : "text"}
                onChange={(event) => setValueInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitValue();
                  }
                }}
                placeholder={
                  draft.check === "Amount" ? "e.g., 100.00" : "Type a value & press Enter"
                }
                aria-invalid={!!valueError || !!issueFor("values")}
                aria-label={draft.check === "Amount" ? "Value to match" : "Word to match"}
                className={cn(
                  numeric && "tabular",
                  (valueError || issueFor("values")) &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              <Button
                variant="secondary"
                // h-9 matches the Input exactly, so the pair reads as one
                // control. pointer-events-auto so the disabled cursor shows.
                className={cn(
                  "h-9 shrink-0 bg-muted text-foreground",
                  "hover:bg-primary/10 hover:text-primary",
                  "disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50",
                )}
                disabled={!valueInput.trim()}
                onClick={commitValue}
              >
                <Plus className="size-4" />
                Add
              </Button>
            </div>
            {valueError ? (
              <p className="text-xs text-destructive">{valueError}</p>
            ) : issueFor("values") ? (
              <p className="text-xs text-destructive">{issueFor("values")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Press Enter or click Add to add a value
              </p>
            )}
          </Step>
        </div>

        {draft.values.length > 0 && (
          <ul className="flex flex-wrap items-center gap-2">
            {draft.values.length > 1 && (
              <li
                className="text-[10px] italic text-muted-foreground"
                aria-hidden
              >
                matched with OR
              </li>
            )}
            {draft.values.map((value) => {
              const invalid = invalidValues.includes(value);
              return (
                <li key={value}>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md py-1 pl-2.5 pr-1 text-sm",
                      invalid
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary",
                    )}
                    aria-invalid={invalid || undefined}
                    title={invalid ? "Not a number" : undefined}
                  >
                    <span className={cn(numeric && "tabular")}>{value}</span>
                    <button
                      type="button"
                      onClick={() => {
                        touch("values");
                        patch({
                          values: draft.values.filter(
                            (entry) => entry !== value,
                          ),
                        });
                      }}
                      aria-label={`Remove ${value}`}
                      className={cn(
                        "grid size-5 place-items-center rounded outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        invalid
                          ? "hover:bg-destructive/15"
                          : "hover:bg-primary/15",
                      )}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-1 rounded-md bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Rule preview
          </p>
          <p className="text-sm">{previewSentence(draft)}</p>
        </div>
      </FormSection>

      {/* Assign */}
      <FormSection
        icon={Tag}
        title="Assign"
        description="What the rule sets on a transaction that matches."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <RuleCategorySelect
            categories={categories}
            loading={categoriesQuery.isLoading}
            categoryId={draft.categoryId}
            onSelect={(categoryId) => {
              touch("category");
              patch({ categoryId });
            }}
            error={issueFor("category")}
            register={register("category")}
          />

          <BusinessContactSelect
            type={contactType}
            contacts={contacts}
            loading={contactsQuery.isLoading}
            loadError={
              contactsQuery.isError
                ? apiErrorMessage(
                    contactsQuery.error,
                    `Couldn't load ${contactType.toLowerCase()}s.`,
                  )
                : undefined
            }
            onRetry={() => contactsQuery.refetch()}
            contactId={draft.clientId}
            contactName={draft.clientName}
            onSelect={({ contactId, contactName }) => {
              touch("client");
              patch({ clientId: contactId, clientName: contactName });
            }}
            onContactsChanged={() => contactsQuery.refetch()}
            error={issueFor("client")}
            register={register("client")}
          />
        </div>

        {/* Debit-only — sole-webapp's own "Expense / Asset" field, a free-text
            label independent of the supplier picked above. */}
        {draft.type === "Debit (expense)" && (
          <Field
            label="Expense / Asset"
            required
            error={issueFor("assignName")}
          >
            <Input
              ref={register("assignName")}
              value={draft.assignName}
              onChange={(event) => patch({ assignName: event.target.value })}
              onBlur={() => touch("assignName")}
              placeholder="Enter name"
              aria-invalid={!!issueFor("assignName")}
              className={cn(
                issueFor("assignName") &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>
        )}

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Include GST</p>
            <p className="text-xs text-muted-foreground">
              Apply GST when this rule categorises a transaction.
            </p>
          </div>
          <Switch
            checked={draft.gst}
            onCheckedChange={(checked) => patch({ gst: checked })}
            aria-label="Include GST"
          />
        </div>
      </FormSection>
    </div>
  );
}

/** A numbered step in the 1-2-3 condition builder. */
function Step({
  number,
  label,
  required,
  hint,
  children,
}: {
  number: number;
  label: string;
  required?: boolean;
  /** Sole-webapp's own per-combination help text (`ruleValueHint`), shown as
   *  an info icon next to the label rather than always on screen. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground tabular"
          aria-hidden
        >
          {number}
        </span>
        <p className="text-sm font-medium">
          {label}
          {required && (
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
          )}
        </p>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info
                className="size-3.5 cursor-help text-muted-foreground"
                aria-label={hint}
              />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}
