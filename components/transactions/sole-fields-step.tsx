"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { WizardSectionHeading } from "@/components/bulk/wizard-parts";
import {
  soleFieldIssue,
  type ValidatedTransactionRow,
} from "@/lib/bulk-transactions";
import { documentTax } from "@/lib/country-context";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";

/** An account subcategory, as the chart of accounts returns it. */
export type AccountOption = {
  id: string;
  name: string;
  capital: boolean;
  /** Heading it's listed under — Income, Expenses, Assets, Capital Account. */
  group?: string;
};

/** A client or supplier, paired with the contact the transaction matches to. */
export type PartyOption = {
  clientId: string;
  contactId: string;
  name: string;
};

const PAGE_SIZE = 12;

/**
 * Sole Fields — the step that turns imported rows into matched ones.
 *
 * The port of sole-webapp's step 5. Every row arrives from the `validate`
 * call with the user's matching rules already applied, and this is where
 * they're completed or cleared: pick an account and the row books to it,
 * leave it blank and the row imports as an ordinary unmatched bank
 * transaction.
 *
 * The dependency between the columns is the whole design, and it's the
 * backend's, not a nicety: an account with no client (or, for a debit, no
 * name) fails `upload` validation and takes the *entire batch* down with it.
 * So the client and name inputs stay disabled until an account is chosen,
 * and `soleFieldIssue` says per row what's still missing rather than letting
 * someone press Import and get one opaque server error for the whole file.
 */
export function SoleFieldsStep({
  rows,
  accountsFor,
  partiesFor,
  loading,
  onChange,
}: {
  rows: ValidatedTransactionRow[];
  /** Income accounts for a credit, expense/asset accounts for a debit. */
  accountsFor: (type: "credit" | "debit") => AccountOption[];
  /** Clients for a credit, suppliers for a debit. */
  partiesFor: (type: "credit" | "debit") => PartyOption[];
  loading: boolean;
  onChange: (index: number, patch: Partial<ValidatedTransactionRow>) => void;
}) {
  const [page, setPage] = React.useState(1);
  // "GST" in AU and NZ, "VAT" in ZA, or the business's own name for it.
  const { country } = useCountryContext();
  const taxName = documentTax(country).word;

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  /** True when every row already includes GST — drives the header switch. */
  const allGst =
    rows.length > 0 && rows.every((row) => row.gst_include !== false);

  const setAllGst = (include: boolean) =>
    rows.forEach((_, index) => onChange(index, { gst_include: include }));

  const matched = rows.filter((row) => row.account_subcategory_id).length;

  return (
    <div className="space-y-4" data-usertour="txn-stage-fields">
      <WizardSectionHeading
        title="Sole fields"
        description="Leave Account blank to import a plain, unmatched transaction. Choose one and the matching fields for that row become required."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <p className="text-sm text-muted-foreground tabular">
          {matched} of {rows.length} {rows.length === 1 ? "row" : "rows"} will
          be matched to an account.
        </p>
        <div className="flex items-center gap-2">
          <Label htmlFor="bulk-gst-all" className="text-sm font-normal">
            Include {taxName} on all
          </Label>
          <Switch
            id="bulk-gst-all"
            checked={allGst}
            onCheckedChange={setAllGst}
          />
        </div>
      </div>

      <div className="overflow-auto rounded-lg border">
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="w-[110px]">Type</TableHead>
              <TableHead className="w-[110px]">Date</TableHead>
              <TableHead className="w-[110px] text-right">Amount</TableHead>
              <TableHead className="min-w-[180px]">Description</TableHead>
              <TableHead className="min-w-[200px]">Account</TableHead>
              <TableHead className="min-w-[200px]">Client / Supplier</TableHead>
              <TableHead className="min-w-[180px]">Name</TableHead>
              <TableHead className="w-[90px] text-center">{taxName}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, offset) => {
              const index = (current - 1) * PAGE_SIZE + offset;
              const credit = row.type === "credit";
              const accounts = accountsFor(row.type);
              const parties = partiesFor(row.type);
              const account = accounts.find(
                (option) => option.id === String(row.account_subcategory_id),
              );
              const matchedRow = Boolean(row.account_subcategory_id);
              // A capital account books straight to equity — it takes no
              // client and no name, and the backend rejects it for carrying
              // either, so those cells stay off rather than merely empty.
              const capital = account?.capital === true;
              const issue = soleFieldIssue(row);

              return (
                <TableRow key={index} className={cn(issue && "bg-warning/5")}>
                  <TableCell className="text-muted-foreground tabular">
                    {index + 1}
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant={credit ? "success" : "destructive"}
                      className="gap-1 font-normal"
                    >
                      {credit ? (
                        <ArrowDownLeft className="size-3" aria-hidden />
                      ) : (
                        <ArrowUpRight className="size-3" aria-hidden />
                      )}
                      {credit ? "Credit" : "Debit"}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-muted-foreground tabular">
                    {row.transaction_date || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {row.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate">
                    {row.description || "—"}
                  </TableCell>

                  <TableCell>
                    <SearchSelect
                      label={`Account, row ${index + 1}`}
                      placeholder={loading ? "Loading…" : "Select account"}
                      disabled={loading}
                      value={account ? account.name : ""}
                      options={accounts.map((option) => ({
                        key: option.id,
                        label: option.name,
                        group: option.group,
                      }))}
                      onSelect={(id) => {
                        const chosen = accounts.find((o) => o.id === id);
                        onChange(index, {
                          account_subcategory_id: Number(id),
                          account_subcategory: chosen
                            ? {
                                account_subcategory_id: Number(chosen.id),
                                name: chosen.name,
                                capital: chosen.capital,
                              }
                            : null,
                          // Switching to a capital account clears what it
                          // can't carry, rather than leaving values behind
                          // that would fail on upload.
                          ...(chosen?.capital
                            ? {
                                client: null,
                                client_id: null,
                                contact_id: null,
                                name: "",
                              }
                            : {}),
                        });
                      }}
                      onClear={() =>
                        onChange(index, {
                          account_subcategory_id: 0,
                          account_subcategory: null,
                          client: null,
                          client_id: null,
                          contact_id: null,
                          name: "",
                        })
                      }
                    />
                  </TableCell>

                  <TableCell>
                    <SearchSelect
                      label={`${credit ? "Client" : "Supplier"}, row ${index + 1}`}
                      placeholder={
                        !matchedRow
                          ? "Select an account first"
                          : capital
                            ? "Not needed"
                            : credit
                              ? "Select client"
                              : "Select supplier"
                      }
                      disabled={!matchedRow || capital || loading}
                      value={
                        row.client_id
                          ? (parties.find(
                              (party) =>
                                party.clientId === String(row.client_id),
                            )?.name ?? String(row.client?.name ?? ""))
                          : ""
                      }
                      options={parties.map((party) => ({
                        key: party.clientId,
                        label: party.name,
                      }))}
                      onSelect={(clientId) => {
                        const party = parties.find(
                          (option) => option.clientId === clientId,
                        );
                        onChange(index, {
                          client_id: Number(clientId),
                          contact_id: party ? Number(party.contactId) : null,
                          client: party
                            ? { id: Number(party.clientId), name: party.name }
                            : null,
                        });
                      }}
                      onClear={() =>
                        onChange(index, {
                          client: null,
                          client_id: null,
                          contact_id: null,
                        })
                      }
                    />
                  </TableCell>

                  <TableCell>
                    {credit || capital ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <Input
                        className="h-8"
                        value={row.name ?? ""}
                        disabled={!matchedRow}
                        placeholder={
                          matchedRow
                            ? "Asset or expense name"
                            : "Select an account first"
                        }
                        aria-label={`Asset or expense name, row ${index + 1}`}
                        onChange={(event) =>
                          onChange(index, { name: event.target.value })
                        }
                      />
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    <Switch
                      checked={row.gst_include !== false}
                      aria-label={`Include ${taxName}, row ${index + 1}`}
                      onCheckedChange={(checked) =>
                        onChange(index, { gst_include: checked })
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Said per row, under the table, because the server answers
          all-or-nothing and its message names no row at all. */}
      <SoleFieldIssues rows={rows} />

      {rows.length > PAGE_SIZE && (
        <NumberedPagination
          page={{
            page: current,
            pageCount,
            total: rows.length,
            from: (current - 1) * PAGE_SIZE + 1,
            to: Math.min(current * PAGE_SIZE, rows.length),
          }}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          // Fixed at a page's worth: the rows are wide and each carries three
          // controls, so a "200 per page" option would be a scroll, not a view.
          onPageSizeChange={() => {}}
          itemLabel="transaction"
          navLabel="Sole fields pages"
        />
      )}
    </div>
  );
}

function SoleFieldIssues({ rows }: { rows: ValidatedTransactionRow[] }) {
  const issues = rows
    .map((row, index) => ({ index, issue: soleFieldIssue(row) }))
    .filter((entry): entry is { index: number; issue: string } =>
      Boolean(entry.issue),
    );

  if (issues.length === 0) return null;

  return (
    <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <p className="text-sm font-medium tabular">
        {issues.length} {issues.length === 1 ? "row needs" : "rows need"} a
        field filled in before this can be imported
      </p>
      <ul className="space-y-0.5">
        {issues.slice(0, 5).map((entry) => (
          <li key={entry.index} className="text-xs text-muted-foreground">
            Row {entry.index + 1} — {entry.issue}
          </li>
        ))}
        {issues.length > 5 && (
          <li className="text-xs text-muted-foreground tabular">
            …and {issues.length - 5} more.
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * A compact searchable picker, the same Command-in-a-Popover the expense
 * category select uses — sized to sit inside a table row, and with a Clear
 * entry because emptying the Account column is a real choice here, not an
 * absence of one.
 */
function SearchSelect({
  label,
  placeholder,
  value,
  options,
  disabled,
  onSelect,
  onClear,
}: {
  label: string;
  placeholder: string;
  value: string;
  /** Options sharing a `group` are listed together under it as a heading. */
  options: { key: string; label: string; group?: string }[];
  disabled?: boolean;
  onSelect: (key: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  // Grouped in first-seen order, so the caller's order is the list's order.
  const groups = options.reduce<
    { heading?: string; options: typeof options }[]
  >((acc, option) => {
    const existing = acc.find((group) => group.heading === option.group);
    if (existing) existing.options.push(option);
    else acc.push({ heading: option.group, options: [option] });
    return acc;
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className="h-8 w-full justify-between px-2 font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" className="h-9" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onClear();
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  Clear
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((group) => (
              <CommandGroup key={group.heading ?? ""} heading={group.heading}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option.key}
                    value={option.label}
                    onSelect={() => {
                      onSelect(option.key);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        option.label === value ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
