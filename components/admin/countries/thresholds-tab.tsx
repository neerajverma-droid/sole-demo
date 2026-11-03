"use client";

import * as React from "react";
import { CalendarPlus, Lock, MoreHorizontal, Plus, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuAction } from "@/components/ui/menu-action";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { ScheduleThresholdDialog } from "@/components/admin/countries/schedule-threshold-dialog";
import { useDeleteThresholdMutation } from "@/hooks/use-admin-countries-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  formatMoney,
  formatRegistryDate,
  isRowEditable,
  rowStatePill,
  thresholdLabel,
  type Threshold,
} from "@/lib/admin/countries";
import { cn } from "@/lib/utils";

/**
 * Registration turnovers, tax-invoice limits and the other figures the product
 * compares an amount against.
 *
 * Effective-dated for the same reason rates are: "a tax invoice is required
 * above $82.50" was true of a document written last year whether or not the
 * figure has moved since.
 */
export function ThresholdsTab({
  iso2,
  country,
  currency,
  thresholds,
  isSuperAdmin,
}: {
  iso2: string;
  country: string;
  currency: string;
  thresholds: Threshold[];
  isSuperAdmin: boolean;
}) {
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [replacing, setReplacing] = React.useState<Threshold | null>(null);
  const [deleting, setDeleting] = React.useState<Threshold | null>(null);

  const groups = React.useMemo(() => groupByKey(thresholds), [thresholds]);

  const openSchedule = (threshold: Threshold | null) => {
    setReplacing(threshold);
    setScheduleOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Each threshold is resolved by the date on the document, so last year&apos;s figure still
          applies to last year&apos;s invoice.
        </p>
        <Button onClick={() => openSchedule(null)}>
          <Plus />
          Schedule a threshold
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No thresholds yet. Without them the product falls back to asking for a tax invoice on
          every document and never prompts a business to register.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader className="surface-subtle">
              <TableRow>
                <TableHead className="pl-4">Threshold</TableHead>
                <TableHead className={HUG_COLUMN}>Amount</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className={HUG_COLUMN}>State</TableHead>
                <TableHead className={`${HUG_COLUMN} pr-4`}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) =>
                group.rows.map((threshold, index) => (
                  <ThresholdRow
                    key={threshold.id}
                    threshold={threshold}
                    /* The name is on the first period only; the rest are its history. */
                    showName={index === 0}
                    onReplace={() => openSchedule(threshold)}
                    onDelete={() => setDeleting(threshold)}
                  />
                )),
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ScheduleThresholdDialog
        iso2={iso2}
        country={country}
        currency={currency}
        existing={thresholds}
        isSuperAdmin={isSuperAdmin}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        replacing={replacing}
      />
      <DeleteThresholdDialog iso2={iso2} threshold={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function ThresholdRow({
  threshold,
  showName,
  onReplace,
  onDelete,
}: {
  threshold: Threshold;
  showName: boolean;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const state = rowStatePill(threshold.state);
  const locked = !isRowEditable(threshold.state);

  return (
    <TableRow className={cn(threshold.state === "past" && "text-muted-foreground")}>
      <TableCell className="pl-4">
        {showName ? (
          <>
            <span className="font-medium">{thresholdLabel(threshold.key)}</span>
            <p className="font-mono text-xs text-muted-foreground">{threshold.key}</p>
          </>
        ) : (
          <span className="pl-4 text-xs text-muted-foreground">previously</span>
        )}
      </TableCell>
      <TableCell className={`${HUG_COLUMN} tabular font-medium`}>
        {formatMoney(threshold.amount, threshold.currency)}
      </TableCell>
      <TableCell>
        <span className="tabular">{formatRegistryDate(threshold.effectiveFrom)}</span>
        <span className="text-muted-foreground"> – </span>
        <span className={cn("tabular", !threshold.effectiveTo && "text-muted-foreground")}>
          {threshold.effectiveTo ? formatRegistryDate(threshold.effectiveTo) : "open ended"}
        </span>
        {threshold.notes ? (
          <p className="truncate text-xs text-muted-foreground">{threshold.notes}</p>
        ) : null}
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <StatusPill label={state.label} tone={state.tone} />
      </TableCell>
      <TableCell className={`${HUG_COLUMN} pr-4`}>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${threshold.key} from ${threshold.effectiveFrom}`}
              >
                {locked ? <Lock className="size-4" /> : <MoreHorizontal />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <MenuAction icon={<CalendarPlus />} label="Schedule a new value" onSelect={onReplace} />
              <MenuAction
                icon={<Trash2 />}
                label="Remove this period"
                destructive
                onSelect={onDelete}
                disabledReason={
                  locked
                    ? "This period has started and is published, so figures may have been filed against it. Schedule a new value instead."
                    : undefined
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

function DeleteThresholdDialog({
  iso2,
  threshold,
  onClose,
}: {
  iso2: string;
  threshold: Threshold | null;
  onClose: () => void;
}) {
  const remove = useDeleteThresholdMutation(iso2);

  return (
    <AlertDialog
      open={threshold !== null}
      onOpenChange={(open) => !open && !remove.isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {threshold ? thresholdLabel(threshold.key) : "this threshold"} from{" "}
            {formatRegistryDate(threshold?.effectiveFrom)}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {threshold?.state === "staged"
              ? "This period was never published, so nothing a business has seen changes."
              : "This period is published but hasn't started yet."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!threshold) return;
              remove.mutate(threshold.id, {
                onSuccess: () => {
                  toast.success("Threshold period removed");
                  onClose();
                },
                onError: (error) =>
                  toast.error(apiErrorMessage(error, "The period couldn't be removed.")),
              });
            }}
          >
            {remove.isPending ? "Removing…" : "Remove period"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Thresholds still in use first, then alphabetically; newest period first within each. */
function groupByKey(thresholds: Threshold[]): { key: string; rows: Threshold[] }[] {
  const byKey = new Map<string, Threshold[]>();
  for (const threshold of thresholds) {
    byKey.set(threshold.key, [...(byKey.get(threshold.key) ?? []), threshold]);
  }
  return [...byKey.entries()]
    .map(([key, rows]) => ({
      key,
      rows: [...rows].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    }))
    .sort((a, b) => {
      const liveA = a.rows.some((row) => row.state !== "past") ? 0 : 1;
      const liveB = b.rows.some((row) => row.state !== "past") ? 0 : 1;
      return liveA - liveB || a.key.localeCompare(b.key);
    });
}
