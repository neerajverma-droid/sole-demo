"use client";

import * as React from "react";
import { BookOpen, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountDetailPanel } from "@/components/reports/account-detail-panel";
import { TabularReportScreen } from "@/components/reports/tabular-report-screen";
import {
  COA_SECTIONS,
  chartOfAccountsConfig,
  type CoaSection,
  type CoaSort,
} from "@/lib/report-configs";
import type { ReportRow } from "@/lib/report-table";

const ALL_SECTIONS = "All sections";

/**
 * Chart of Accounts.
 *
 * Every account in the ledger with its GST treatment — the list an accountant
 * checks before a BAS, because an account coded the wrong way is where a wrong
 * GST figure comes from.
 *
 * The section filter and the sort are both server-side, so they cover every
 * page rather than reordering the twenty rows currently loaded. There's no
 * period control: `getChartsAccountData` accepts dates and ignores them, and a
 * control that does nothing is worse than no control.
 */
export function ChartOfAccountsScreen() {
  const [section, setSection] = React.useState<CoaSection | typeof ALL_SECTIONS>(
    ALL_SECTIONS,
  );
  const [sortBy, setSortBy] = React.useState<CoaSort>("code");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [selected, setSelected] = React.useState<ReportRow | null>(null);

  const touched = section !== ALL_SECTIONS || sortBy !== "code" || sortDir !== "asc";

  const reset = () => {
    setSection(ALL_SECTIONS);
    setSortBy("code");
    setSortDir("asc");
  };

  const extra = React.useMemo(
    () => ({
      ...(section === ALL_SECTIONS ? {} : { section }),
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [section, sortBy, sortDir],
  );

  return (
    <TabularReportScreen
      config={chartOfAccountsConfig}
      icon={BookOpen}
      period="This financial year"
      onPeriodChange={() => {}}
      range={null}
      onRangeChange={() => {}}
      extra={extra}
      // The old report opened on 100 rows: a chart of accounts is read as a
      // whole list, and paging through it in twenties makes it hard to scan.
      defaultPageSize={100}
      sort={{ by: sortBy, dir: sortDir }}
      onSortChange={(by, dir) => {
        setSortBy(by as CoaSort);
        setSortDir(dir);
      }}
      onRowClick={(row) =>
        // Clicking the open row closes it, the way a disclosure behaves.
        setSelected((current) => (current?.id === row.id ? null : row))
      }
      selectedRowId={selected?.id ?? null}
      detail={
        selected && selected.cells["Subcategory Id"] ? (
          <AccountDetailPanel
            subcategoryId={selected.cells["Subcategory Id"]!}
            code={selected.cells["Account Code"] ?? ""}
            name={selected.cells["Account Name"] ?? ""}
            section={selected.cells.Section ?? ""}
            onClose={() => setSelected(null)}
          />
        ) : null
      }
      toolbar={
        <div className="flex flex-wrap items-end gap-4 rounded-md border border-dashed border-border bg-card px-4 py-3 print:hidden">
          <div className="space-y-1.5">
            <Label htmlFor="coa-section" className="text-xs">
              Show
            </Label>
            <Select
              value={section}
              onValueChange={(next) =>
                setSection(next as CoaSection | typeof ALL_SECTIONS)
              }
            >
              <SelectTrigger id="coa-section" className="h-9 w-[12rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SECTIONS}>All accounts</SelectItem>
                {COA_SECTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option} only
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Only once there's something to reset — a permanently visible
              Reset on an untouched list is a control with nothing to do. */}
          {touched && (
            <Button variant="ghost" size="sm" className="mb-0.5" onClick={reset}>
              Reset
            </Button>
          )}

          <p className="mb-2 ml-auto text-xs text-muted-foreground">
            Click an account to see its GST treatment
          </p>
        </div>
      }
      emptyIcon={SearchX}
      emptyTitle="No accounts to show"
      emptyDescription="Nothing matches this section filter. Clear it to see the whole chart of accounts."
    />
  );
}
