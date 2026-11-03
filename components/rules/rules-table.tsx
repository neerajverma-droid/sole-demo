"use client";

import Link from "next/link";
import { useAtom, useSetAtom } from "jotai";
import {
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  SearchX,
  Trash2,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Highlight } from "@/components/contacts/highlight";
import { useSyncRuleMutation } from "@/hooks/use-rules-query";
import { deleteRuleIdAtom, rulesFilterAtom, rulesQueryAtom } from "@/lib/atoms";
import {
  RULE_FILTERS,
  conditionSentence,
  filterRules,
  type Rule,
  type RuleFilter,
} from "@/lib/rules";
import { useRulesStore } from "@/stores/rules";

export function RulesTable({
  loading,
  onAdd,
  onEdit,
}: {
  loading: boolean;
  /**
   * Add / edit in place instead of navigating to the rule pages — the bulk
   * upload's Matching rules step passes these so the wizard isn't left.
   */
  onAdd?: () => void;
  onEdit?: (rule: Rule) => void;
}) {
  const rules = useRulesStore((state) => state.rules);
  const [filter, setFilter] = useAtom(rulesFilterAtom);
  const [query, setQuery] = useAtom(rulesQueryAtom);
  const setDeleteId = useSetAtom(deleteRuleIdAtom);

  const rows = filterRules(rules, filter, query);

  const counts = RULE_FILTERS.reduce<Partial<Record<RuleFilter, number>>>(
    (acc, option) => {
      acc[option] = filterRules(rules, option, "").length;
      return acc;
    },
    {},
  );

  if (loading && rules.length === 0) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Transaction type</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Account category</TableHead>
              <TableHead>Subcategory</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="w-[132px]">Sync matching</TableHead>
              <TableHead className="w-[88px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody aria-hidden>
            {Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                <TableCell>
                  <Shimmer className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Shimmer className="h-5 w-24 rounded-full" />
                </TableCell>
                <TableCell>
                  <Shimmer className="h-4 w-40" />
                </TableCell>
                <TableCell>
                  <Shimmer className="h-5 w-20 rounded-md" />
                </TableCell>
                <TableCell>
                  <Shimmer className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Shimmer className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Shimmer className="h-8 w-24 rounded-md" />
                </TableCell>
                <TableCell>
                  <Shimmer className="ml-auto h-8 w-16 rounded-md" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <Workflow aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>No matching rules yet</EmptyTitle>
          <EmptyDescription>
            Add a rule to auto-categorise transactions as they come in.
          </EmptyDescription>
        </div>
        <EmptyActions>
          {onAdd ? (
            <Button size="sm" onClick={onAdd}>
              Add rule
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link href="/transactions/rules/new">Add rule</Link>
            </Button>
          )}
        </EmptyActions>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          label="Filter rules by transaction type"
          options={RULE_FILTERS}
          value={filter}
          onChange={setFilter}
          counts={counts}
        />

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rules"
            aria-label="Search rules"
            className="pl-9"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <SearchX aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No rules match your search or filter</EmptyTitle>
            <EmptyDescription>
              Try a different name or condition, or clear the filters.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setFilter("All");
              }}
            >
              Clear filters
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Transaction type</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Account category</TableHead>
                <TableHead>Subcategory</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="w-[132px]">Sync matching</TableHead>
                <TableHead className="w-[88px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  query={query}
                  onEdit={onEdit && (() => onEdit(rule))}
                  onDelete={() => setDeleteId(rule.id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  query,
  onEdit,
  onDelete,
}: {
  rule: Rule;
  query: string;
  /** Edits in place; without it, Edit links to the rule's page. */
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const syncingRuleId = useRulesStore((state) => state.syncingRuleId);
  const syncMutation = useSyncRuleMutation();

  const syncing = syncingRuleId === rule.id;
  const anySyncing = syncingRuleId !== null;

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Highlight text={rule.name} query={query} />
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{rule.type}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {conditionSentence(rule)}
      </TableCell>
      <TableCell>
        <span className="inline-flex rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {rule.accountCategoryName || "—"}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {rule.categoryName || "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {rule.clientName || "—"}
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={anySyncing}
          onClick={() =>
            syncMutation.mutate({ ruleId: rule.id, ruleName: rule.name })
          }
        >
          {syncing ? (
            <>
              <Loader2 className="animate-spin" />
              Syncing
            </>
          ) : (
            <>
              <RefreshCw />
              Start sync
            </>
          )}
        </Button>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {onEdit ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onEdit}
              aria-label={`Edit ${rule.name}`}
            >
              <Pencil className="size-4 text-muted-foreground" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              asChild
              aria-label={`Edit ${rule.name}`}
            >
              <Link href={`/transactions/rules/${rule.id}`}>
                <Pencil className="size-4 text-muted-foreground" />
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onDelete}
            aria-label={`Delete ${rule.name}`}
          >
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
