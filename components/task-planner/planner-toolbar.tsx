"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Columns3,
  List,
  ListFilter,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DateRangePicker } from "@/components/documents/date-range-picker";
import {
  activeFilterCount,
  applySort,
  currentSort,
  SORT_OPTIONS,
  type PlannerClient,
  type PlannerFilters,
  type PlannerSort,
  type PlannerView,
} from "@/lib/task-planner";
import { cn } from "@/lib/utils";

const VIEWS: { view: PlannerView; label: string; icon: LucideIcon }[] = [
  { view: "board", label: "Board", icon: Columns3 },
  { view: "list", label: "List", icon: List },
];

type FilterDraft = Pick<PlannerFilters, "billable" | "start_date" | "end_date"> & {
  contactIds: string[];
};

/**
 * PlannerFilter.js — billable only, a date range (up to today) and which
 * clients — drafted in the popover and applied together, `contact_id` and its
 * `client_id` alias set to the same list.
 */
function PlannerFilterPopover({
  clients,
  loadingClients,
  filters,
  onApply,
}: {
  clients: PlannerClient[];
  loadingClients: boolean;
  filters: PlannerFilters;
  onApply: (patch: Partial<PlannerFilters>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [draft, setDraft] = React.useState<FilterDraft>({
    billable: false,
    start_date: null,
    end_date: null,
    contactIds: [],
  });

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setDraft({
      billable: filters.billable,
      start_date: filters.start_date,
      end_date: filters.end_date,
      contactIds: filters.contact_id.length ? filters.contact_id : filters.client_id,
    });
  }, [open, filters]);

  const allIds = clients.map((client) => client.contact_id);
  const allSelected = allIds.length > 0 && draft.contactIds.length === allIds.length;
  const visible = query
    ? clients.filter((client) => client.name.toLowerCase().includes(query.toLowerCase()))
    : clients;
  const count = activeFilterCount(filters);
  const today = new Date();

  const apply = (next: FilterDraft) => {
    onApply({
      billable: next.billable,
      start_date: next.start_date,
      end_date: next.end_date,
      contact_id: next.contactIds,
      client_id: next.contactIds,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" data-usertour="scheduling-planner-filter">
          <ListFilter />
          Filter
          {count > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-3">
        <div className="pb-2">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Billing</p>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            <Checkbox
              checked={draft.billable}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, billable: checked === true }))}
            />
            Billable only
          </label>
        </div>

        <div className="border-t border-border py-2">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Date range</p>
          {/* One range, up to today, sent as the same start_date / end_date. */}
          <DateRangePicker
            from={draft.start_date ?? ""}
            to={draft.end_date ?? ""}
            toDate={today}
            onChange={({ from, to }) =>
              setDraft((prev) => ({ ...prev, start_date: from || null, end_date: to || null }))
            }
          />
        </div>

        <div className="border-t border-border py-2">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Clients
            {draft.contactIds.length > 0 && (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
                {draft.contactIds.length}
              </span>
            )}
          </p>
          {loadingClients ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Loading clients…</p>
          ) : clients.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No clients found</p>
          ) : (
            <>
              <div className="relative mb-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients"
                  aria-label="Search clients"
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <div className="scrollbar-thin flex max-h-[200px] flex-col gap-px overflow-y-auto">
                {!query && (
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() =>
                        setDraft((prev) => ({ ...prev, contactIds: allSelected ? [] : allIds }))
                      }
                    />
                    Select all ({clients.length})
                  </label>
                )}
                {visible.map((client) => (
                  <label
                    key={client.contact_id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={draft.contactIds.includes(client.contact_id)}
                      onCheckedChange={() =>
                        setDraft((prev) => ({
                          ...prev,
                          contactIds: prev.contactIds.includes(client.contact_id)
                            ? prev.contactIds.filter((id) => id !== client.contact_id)
                            : [...prev.contactIds, client.contact_id],
                        }))
                      }
                    />
                    <span className="truncate">{client.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => apply({ billable: false, start_date: null, end_date: null, contactIds: [] })}
          >
            Reset
          </Button>
          <Button size="sm" onClick={() => apply(draft)}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PlannerToolbar({
  view,
  onViewChange,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  clients,
  loadingClients,
  selectMode,
  onToggleSelectMode,
}: {
  view: PlannerView;
  onViewChange: (view: PlannerView) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filters: PlannerFilters;
  onFiltersChange: (update: (prev: PlannerFilters) => PlannerFilters) => void;
  clients: PlannerClient[];
  loadingClients: boolean;
  selectMode: boolean;
  onToggleSelectMode: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative min-w-[220px] max-w-[420px] flex-1" data-usertour="scheduling-planner-search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tasks..."
          aria-label="Search tasks"
          className="h-10 pl-9 pr-8"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="View"
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background p-0.5 shadow-sm"
          data-usertour="scheduling-planner-views"
        >
          {VIEWS.map(({ view: option, label, icon: Icon }) => (
            <Tooltip key={option}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${label} view`}
                  aria-pressed={view === option}
                  onClick={() => onViewChange(option)}
                  className={cn(
                    "grid size-8 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted",
                    view === option && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{label} view</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              aria-pressed={selectMode}
              onClick={onToggleSelectMode}
              className={cn(selectMode && "border-primary text-primary")}
            >
              <ArrowLeftRight />
              Bulk move
            </Button>
          </TooltipTrigger>
          <TooltipContent>Select tasks to move to Done</TooltipContent>
        </Tooltip>

        <PlannerFilterPopover
          clients={clients}
          loadingClients={loadingClients}
          filters={filters}
          onApply={(patch) => onFiltersChange((prev) => ({ ...prev, ...patch }))}
        />

        <Select
          value={currentSort(filters)}
          onValueChange={(value) => onFiltersChange((prev) => applySort(prev, value as PlannerSort))}
        >
          <SelectTrigger className="h-9 w-[150px]" aria-label="Sort">
            <span className="text-muted-foreground">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

