"use client";

import { useRouter } from "next/navigation";
import {
  CheckCheck,
  Eye,
  FileText,
  Link2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Repeat,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuAction } from "@/components/ui/menu-action";
import { Shimmer } from "@/components/ui/shimmer";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AiMatchButton } from "@/components/expenses/expenses-table";
import { BillStatusBadge, RepeatBadge, SupplierMark } from "@/components/bills/bill-status";
import { ROW_ICON_CLASS, RowIconAction } from "@/components/documents/row-actions";
import { billDueClass, isBillOwed, type Bill } from "@/lib/bills";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";

export type BillRowActions = {
  /** Pay from the bank feed: converts a saved bill and matches it in one step. */
  onMatch: (bill: Bill) => void;
  onConvert: (bill: Bill) => void;
  onUnapprove: (bill: Bill) => void;
  onDelete: (bill: Bill) => void;
  onAttach: (bill: Bill) => void;
  onManageRepeat: (scheduleId: string) => void;
};

const COLUMN_COUNT = 10;

/**
 * Every bill on the page: a table from tablet width up, cards on a phone.
 * Saved bills can be ticked for the bulk bar — converted ones can't be bulk
 * converted or deleted, so they carry no box.
 */
export function BillsList({
  bills,
  today,
  selected,
  onSelectedChange,
  convertingId,
  actions,
}: {
  bills: Bill[];
  today: string;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  convertingId: string | null;
  actions: BillRowActions;
}) {
  const selectable = bills.filter((bill) => bill.status === "draft");
  const allSelected = selectable.length > 0 && selectable.every((bill) => selected.has(bill.id));
  const someSelected = selectable.some((bill) => selected.has(bill.id));

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  };

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card shadow-sm md:block" data-usertour="bill-list">
        <Table className="min-w-[1040px]">
          <BillsHeader
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            disabled={selectable.length === 0}
            onCheckedChange={(on) => {
              const next = new Set(selected);
              for (const bill of selectable) {
                if (on) next.add(bill.id);
                else next.delete(bill.id);
              }
              onSelectedChange(next);
            }}
          />
          <TableBody>
            {bills.map((bill, index) => (
              <BillRow
                key={bill.id}
                bill={bill}
                today={today}
                selected={selected.has(bill.id)}
                onSelect={(on) => toggle(bill.id, on)}
                actionsTourId={index === 0 ? "bill-row-actions" : undefined}
                converting={convertingId === bill.id}
                actions={actions}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden" aria-label="Bills">
        {bills.map((bill) => (
          <BillCard
            key={bill.id}
            bill={bill}
            today={today}
            selected={selected.has(bill.id)}
            onSelect={(on) => toggle(bill.id, on)}
            converting={convertingId === bill.id}
            actions={actions}
          />
        ))}
      </ul>
    </>
  );
}

export function BillsListSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm" aria-hidden>
      <Table className="min-w-[1040px]">
        <BillsHeader checked={false} disabled onCheckedChange={() => {}} />
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={`skeleton-${index}`}>
              {Array.from({ length: COLUMN_COUNT }).map((__, cellIndex) => (
                <TableCell key={cellIndex}>
                  <Shimmer className="mx-auto h-4 w-20" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BillsHeader({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean | "indeterminate";
  disabled: boolean;
  onCheckedChange: (on: boolean) => void;
}) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-10">
          <Checkbox
            checked={checked}
            disabled={disabled}
            onCheckedChange={(value) => onCheckedChange(value === true)}
            aria-label="Select every saved bill on this page"
          />
        </TableHead>
        <TableHead>Supplier</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")}>Bill no.</TableHead>
        <TableHead className="text-center">Category</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")}>Bill date</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")}>Due date</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")}>Total</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")}>Status</TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-center")} data-usertour="bill-match-column">
          Match transaction
        </TableHead>
        <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
      </TableRow>
    </TableHeader>
  );
}

/** "$40.00 left" under a part-paid bill's total. */
function AmountLeft({ bill }: { bill: Bill }) {
  if (bill.paymentStatus !== "part_paid") return null;
  return <span className="block text-[11px] font-normal text-muted-foreground">{invoiceMoney(bill.amountDue)} left</span>;
}

/**
 * The expense list's match cell, for a bill: AI Match when the feed already
 * has a payment that fits what's owed, otherwise a plain Match. A paid bill
 * says so; a void one has nothing to match.
 */
function MatchCell({ bill, disabled, onMatch }: { bill: Bill; disabled: boolean; onMatch: () => void }) {
  if (bill.paymentStatus === "paid") {
    return <span className="whitespace-nowrap text-muted-foreground">Matched</span>;
  }
  if (!isBillOwed(bill)) return <span className="text-muted-foreground">—</span>;
  if (bill.possibleMatch > 0 && !disabled) {
    return <AiMatchButton suggestions={bill.possibleMatch} onOpen={onMatch} />;
  }
  return (
    <Button variant="outline" size="sm" onClick={onMatch} disabled={disabled}>
      <Link2 />
      Match
    </Button>
  );
}

/**
 * Opens a bill from a click anywhere on its row (or card). A click on anything
 * interactive inside — the checkbox, Match, the action icons, the repeat badge —
 * does its own thing instead; so does one bubbling up through a portal (the
 * actions menu or a tooltip), and a drag that selected some text.
 */
function useOpenBill(bill: Bill) {
  const router = useRouter();
  const href = `/expenses/bills/${bill.id}`;
  return {
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      if (!event.currentTarget.contains(target)) return;
      if (target.closest("button, a, input, label, [role=checkbox]")) return;
      if (window.getSelection()?.toString()) return;
      router.push(href);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" && event.target === event.currentTarget) router.push(href);
    },
  };
}

/** The supplier, and beside it the repeat badge — which opens Manage repeat. */
function SupplierName({ bill, onManageRepeat, className }: { bill: Bill; onManageRepeat: (scheduleId: string) => void; className?: string }) {
  const schedule = bill.schedule;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span className="truncate font-medium">
        {bill.supplierName || <span className="text-muted-foreground">No supplier yet</span>}
      </span>
      {schedule && <RepeatBadge schedule={schedule} occurrenceNo={bill.occurrenceNo} onManage={() => onManageRepeat(schedule.id)} />}
    </span>
  );
}

function BillRow({
  bill,
  today,
  selected,
  onSelect,
  actionsTourId,
  converting,
  actions,
}: {
  bill: Bill;
  today: string;
  selected: boolean;
  onSelect: (on: boolean) => void;
  // Rendered as `data-usertour` on the actions cell, for a tour to point at.
  actionsTourId?: string;
  converting: boolean;
  actions: BillRowActions;
}) {
  const draft = bill.status === "draft";
  const label = bill.billNo || bill.supplierName || "bill";
  const open = useOpenBill(bill);

  return (
    <TableRow data-state={selected ? "selected" : undefined} className="cursor-pointer" tabIndex={0} aria-label={`Open ${label}`} {...open}>
      <TableCell className="w-10">
        {draft && <Checkbox checked={selected} onCheckedChange={(value) => onSelect(value === true)} aria-label={`Select ${label}`} />}
      </TableCell>
      <TableCell className="max-w-[280px]">
        <SupplierName bill={bill} onManageRepeat={actions.onManageRepeat} />
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center tabular text-muted-foreground")}>{bill.billNo || "—"}</TableCell>
      <TableCell className="max-w-[180px] text-center text-muted-foreground">
        <span className="block truncate">{bill.category || "—"}</span>
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center tabular text-muted-foreground")}>
        {bill.billDate ? formatInvoiceDate(bill.billDate) : "—"}
      </TableCell>
      {/* The Due column keeps status colour, as on the invoice list; other dates stay muted. */}
      <TableCell className={cn(HUG_COLUMN, "text-center tabular", billDueClass(bill, today))}>
        {bill.dueDate ? formatInvoiceDate(bill.dueDate) : "—"}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center font-medium tabular")}>
        {invoiceMoney(bill.total)}
        <AmountLeft bill={bill} />
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        <BillStatusBadge bill={bill} />
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        <MatchCell bill={bill} disabled={converting} onMatch={() => actions.onMatch(bill)} />
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <div className="flex items-center justify-end gap-1" data-usertour={actionsTourId}>
          <BillRowIcons bill={bill} actions={actions} />
          <BillMenu bill={bill} label={label} actions={actions} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function BillCard({
  bill,
  today,
  selected,
  onSelect,
  converting,
  actions,
}: {
  bill: Bill;
  today: string;
  selected: boolean;
  onSelect: (on: boolean) => void;
  converting: boolean;
  actions: BillRowActions;
}) {
  const draft = bill.status === "draft";
  const label = bill.billNo || bill.supplierName || "bill";
  const open = useOpenBill(bill);
  return (
    <li
      className={cn("cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm", selected && "border-primary/40 bg-primary/[0.03]")}
      tabIndex={0}
      aria-label={`Open ${label}`}
      {...open}
    >
      <div className="flex items-start gap-3">
        {draft ? (
          <Checkbox className="mt-2.5" checked={selected} onCheckedChange={(value) => onSelect(value === true)} aria-label={`Select ${label}`} />
        ) : null}
        <SupplierMark name={bill.supplierName} />
        <div className="min-w-0 flex-1">
          <SupplierName bill={bill} onManageRepeat={actions.onManageRepeat} />
          <span className="block truncate text-xs text-muted-foreground">{[bill.billNo, bill.category].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <div className="shrink-0 text-right">
          <span className="block font-semibold tabular">{invoiceMoney(bill.total)}</span>
          <AmountLeft bill={bill} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
        <BillStatusBadge bill={bill} />
        <span className={cn("text-xs tabular", billDueClass(bill, today))}>
          {bill.dueDate ? `Due ${formatInvoiceDate(bill.dueDate)}` : "No due date"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <MatchCell bill={bill} disabled={converting} onMatch={() => actions.onMatch(bill)} />
          <BillRowIcons bill={bill} actions={actions} />
          <BillMenu bill={bill} label={label} actions={actions} />
        </div>
      </div>
    </li>
  );
}

/**
 * Edit and Add attachment, on the row rather than in the menu. Only a saved
 * bill takes either, so a converted one keeps them disabled with the reason —
 * its files live on its expense, and View in the menu opens it.
 */
function BillRowIcons({ bill, actions }: { bill: Bill; actions: BillRowActions }) {
  const draft = bill.status === "draft";
  return (
    <>
      <RowIconAction
        icon={<Pencil />}
        label="Edit bill"
        href={`/expenses/bills/${bill.id}`}
        disabledReason={draft ? undefined : "Only a saved bill can be edited — use View in the menu"}
      />
      <RowIconAction
        icon={<Paperclip />}
        label="Add attachment"
        onClick={() => actions.onAttach(bill)}
        disabledReason={draft ? undefined : "A converted bill's files live on its expense"}
      />
    </>
  );
}

function BillMenu({ bill, label, actions }: { bill: Bill; label: string; actions: BillRowActions }) {
  const draft = bill.status === "draft";
  // Any money matched to its expense means undoing would orphan that match.
  const matched = bill.paymentStatus === "paid" || bill.paymentStatus === "part_paid";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn(ROW_ICON_CLASS, "data-[state=open]:text-primary")} aria-label={`Actions for ${label}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {/* A saved bill's Edit and Add attachment stand on the row itself. */}
        {!draft && <MenuAction icon={<Eye />} label="View" href={`/expenses/bills/${bill.id}`} />}
        {/* For a bill paid in cash, or wanted in expenses before it's paid. */}
        {draft && <MenuAction icon={<CheckCheck />} label="Convert to expense" onSelect={() => actions.onConvert(bill)} />}
        {bill.expenseId && <MenuAction icon={<FileText />} label="View expense" href={`/expenses/${bill.expenseId}`} />}
        {bill.schedule && (
          <MenuAction icon={<Repeat />} label="Manage repeat" onSelect={() => actions.onManageRepeat(bill.schedule!.id)} />
        )}
        {!draft && bill.status !== "void" && (
          <MenuAction
            icon={<Undo2 />}
            label="Undo conversion"
            onSelect={() => actions.onUnapprove(bill)}
            disabledReason={matched ? "Unmatch its expense first" : undefined}
          />
        )}
        {draft && (
          <>
            <DropdownMenuSeparator />
            <MenuAction icon={<Trash2 />} label="Delete" onSelect={() => actions.onDelete(bill)} destructive />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
