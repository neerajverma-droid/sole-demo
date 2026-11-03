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
import { ScheduleRateDialog } from "@/components/admin/countries/schedule-rate-dialog";
import { useDeleteRateMutation } from "@/hooks/use-admin-countries-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  formatRate,
  formatRegistryDate,
  isRowEditable,
  rowStatePill,
  type TaxRate,
} from "@/lib/admin/countries";
import { cn } from "@/lib/utils";

/**
 * Every rate the country has ever had, grouped by tax code and newest first.
 *
 * A timeline rather than a list of current values, because that's what the data
 * is: an invoice dated last March is priced from the row that was in effect
 * last March, and anyone about to change a rate needs to see that the old one
 * doesn't disappear.
 *
 * A period that has already started and been published is locked — the backend
 * refuses to edit or delete it, since returns may have been filed on it — so
 * those rows offer "Schedule a replacement" where the others offer Delete.
 */
export function TaxRatesTab({
  iso2,
  country,
  taxType,
  rates,
  isSuperAdmin,
}: {
  iso2: string;
  country: string;
  taxType: string;
  rates: TaxRate[];
  isSuperAdmin: boolean;
}) {
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [replacing, setReplacing] = React.useState<TaxRate | null>(null);
  const [deleting, setDeleting] = React.useState<TaxRate | null>(null);

  const groups = React.useMemo(() => groupByCode(rates), [rates]);

  const openSchedule = (rate: TaxRate | null) => {
    setReplacing(rate);
    setScheduleOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Each tax code is a timeline. A rate is resolved by the date on the document, so a
          scheduled change applies itself — there is no job to run and no deploy.
        </p>
        <Button onClick={() => openSchedule(null)}>
          <Plus />
          Schedule a rate
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No rates yet. A country needs at least one standard rate in effect before it can go live.
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.taxCode} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                {group.taxCode}
                {group.rates.some((rate) => rate.isDefault) ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Standard rate
                  </span>
                ) : null}
                <span className="text-xs font-normal text-muted-foreground">
                  {group.rates.length} {group.rates.length === 1 ? "period" : "periods"}
                </span>
              </h3>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader className="surface-subtle">
                    <TableRow>
                      <TableHead className="pl-4">Rate</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className={HUG_COLUMN}>Applies to</TableHead>
                      <TableHead className={HUG_COLUMN}>State</TableHead>
                      <TableHead className={`${HUG_COLUMN} pr-4`}>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rates.map((rate) => (
                      <RateRow
                        key={rate.id}
                        rate={rate}
                        onReplace={() => openSchedule(rate)}
                        onDelete={() => setDeleting(rate)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      <ScheduleRateDialog
        iso2={iso2}
        country={country}
        taxType={taxType}
        existing={rates}
        isSuperAdmin={isSuperAdmin}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        replacing={replacing}
      />
      <DeleteRateDialog iso2={iso2} rate={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function RateRow({
  rate,
  onReplace,
  onDelete,
}: {
  rate: TaxRate;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const state = rowStatePill(rate.state);
  const locked = !isRowEditable(rate.state);

  return (
    <TableRow className={cn(rate.state === "past" && "text-muted-foreground")}>
      <TableCell className="pl-4">
        <span className="font-medium tabular">{formatRate(rate.rate)}</span>
        {rate.isCapital ? (
          <span className="ml-2 text-xs text-muted-foreground">capital</span>
        ) : null}
        <p className="text-xs text-muted-foreground">{rate.name}</p>
      </TableCell>
      <TableCell>
        <span className="tabular">{formatRegistryDate(rate.effectiveFrom)}</span>
        <span className="text-muted-foreground"> – </span>
        <span className={cn("tabular", !rate.effectiveTo && "text-muted-foreground")}>
          {rate.effectiveTo ? formatRegistryDate(rate.effectiveTo) : "open ended"}
        </span>
      </TableCell>
      <TableCell className={`${HUG_COLUMN} text-sm capitalize`}>
        {rate.appliesTo === "both" ? "Sales & purchases" : rate.appliesTo}
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
                aria-label={`Actions for the ${rate.taxCode} period from ${rate.effectiveFrom}`}
              >
                {locked ? <Lock className="size-4" /> : <MoreHorizontal />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <MenuAction
                icon={<CalendarPlus />}
                label="Schedule a replacement"
                onSelect={onReplace}
              />
              <MenuAction
                icon={<Trash2 />}
                label="Remove this period"
                destructive
                onSelect={onDelete}
                disabledReason={
                  locked
                    ? "This period has started and is published, so returns may have been filed on it. End it by scheduling a replacement instead."
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

function DeleteRateDialog({
  iso2,
  rate,
  onClose,
}: {
  iso2: string;
  rate: TaxRate | null;
  onClose: () => void;
}) {
  const remove = useDeleteRateMutation(iso2);

  return (
    <AlertDialog open={rate !== null} onOpenChange={(open) => !open && !remove.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {rate?.taxCode} from {formatRegistryDate(rate?.effectiveFrom)}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {rate?.state === "staged"
              ? "This period was never published, so nothing a business has seen changes."
              : "This period is published but hasn't started yet, so no return depends on it."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!rate) return;
              remove.mutate(rate.id, {
                onSuccess: () => {
                  toast.success(`${rate.taxCode} period removed`);
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

/** Codes with a period still running first, then alphabetically; newest period first. */
function groupByCode(rates: TaxRate[]): { taxCode: string; rates: TaxRate[] }[] {
  const byCode = new Map<string, TaxRate[]>();
  for (const rate of rates) {
    byCode.set(rate.taxCode, [...(byCode.get(rate.taxCode) ?? []), rate]);
  }
  return [...byCode.entries()]
    .map(([taxCode, group]) => ({
      taxCode,
      rates: [...group].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    }))
    .sort((a, b) => {
      const liveA = a.rates.some((rate) => rate.state !== "past") ? 0 : 1;
      const liveB = b.rates.some((rate) => rate.state !== "past") ? 0 : 1;
      return liveA - liveB || a.taxCode.localeCompare(b.taxCode);
    });
}
