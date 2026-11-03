"use client";

import * as React from "react";
import Link from "next/link";
import { useAtomValue } from "jotai";
import { ChevronRight, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CustomerAreaDetailSheet } from "@/components/dashboard/customer-area-detail";
import { RankedRow } from "@/components/dashboard/ranked-row";
import { AreaLevelSelect } from "@/components/dashboard/area-level-select";
import { accountStageAtom, areaLevelAtom } from "@/lib/atoms";
import {
  areaLevelLabel,
  customerAreaDetail,
  customerAreas,
  type CustomerAreaDetail,
} from "@/lib/customer-areas";
import { money } from "@/lib/dashboard-data";
import { GEOGRAPHIC_INSIGHTS_HREF } from "@/lib/geographic-insights";
import { useAllClientContactsQuery } from "@/hooks/use-contacts-query";
import { useContactsStore } from "@/stores/contacts";
import { useInvoicesStore } from "@/stores/invoices";
import { useQuotesStore } from "@/stores/quotes";

/** What the map colours and sizes its markers by. */
const METRIC_LABEL = "Invoiced value";

/**
 * Where the invoiced money comes from.
 *
 * Read off invoices joined to contacts rather than off the contact list, so an
 * area's size is what it has actually been billed. Top four: past that it stops
 * being a shape you can take in and becomes a table.
 *
 * A row is a way in as much as a figure — selecting one opens the area's own
 * breakdown, which is the only place the customers behind the total are named.
 */
export function CustomerAreasCard() {
  useAllClientContactsQuery();
  const stage = useAtomValue(accountStageAtom);
  const level = useAtomValue(areaLevelAtom);
  const invoices = useInvoicesStore((state) => state.invoices);
  const quotes = useQuotesStore((state) => state.quotes);
  const contacts = useContactsStore((state) => state.contacts);

  const [selected, setSelected] = React.useState<string | null>(null);

  /*
   * Regrouping retires whatever was open: "Richmond" isn't a key any more once
   * the rows are states, and a panel left open would be showing an area that no
   * longer exists in the list behind it.
   */
  const lastLevel = React.useRef(level);
  if (lastLevel.current !== level) {
    lastLevel.current = level;
    if (selected !== null) setSelected(null);
  }

  const isActive = stage === "active";
  const summary = customerAreas(isActive ? invoices : [], contacts, { level });
  const leading = Math.max(...summary.areas.map((area) => area.amount), 0);

  const detail = React.useMemo(
    () =>
      selected
        ? customerAreaDetail(selected, {
            invoices: isActive ? invoices : [],
            quotes: isActive ? quotes : [],
            contacts,
            level,
          })
        : null,
    [selected, isActive, invoices, quotes, contacts, level],
  );

  // The last area opened, held past the close so the panel keeps its contents
  // while it slides out rather than emptying under the user's hand.
  const shown = React.useRef<CustomerAreaDetail | null>(null);
  if (detail) shown.current = detail;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-1">
          {/* The title is the way through as much as the action is — this card
              is a summary of a page, and both say so. */}
          <CardTitle className="text-base">
            <Link
              href={GEOGRAPHIC_INSIGHTS_HREF}
              className="rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              Where your customers are
            </Link>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            By invoiced value
            {summary.remaining > 0 &&
              ` · top 4 of ${summary.areas.length + summary.remaining}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AreaLevelSelect />
          <Button variant="ghost" size="sm" asChild>
            <Link href={GEOGRAPHIC_INSIGHTS_HREF}>
              View all
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {summary.areas.length === 0 ? (
          <Empty className="border-0 bg-transparent px-0 py-6 shadow-none">
            <EmptyMedia>
              <MapPin aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No invoiced clients yet</EmptyTitle>
              <EmptyDescription>
                Send an invoice and the areas your customers are in will appear
                here, ranked by what they&apos;re worth.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button variant="outline" size="sm" asChild>
                <Link href="/invoices/new">Create invoice</Link>
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          <div className="space-y-2">
            <p className="px-2.5 text-xs font-medium text-muted-foreground">
              Top areas by invoiced · by {areaLevelLabel(level).toLowerCase()}
            </p>
            <ul className="space-y-1">
              {summary.areas.map((area) => (
                <li key={area.key}>
                  <RankedRow
                    label={`${area.label} · ${area.invoiceCount} ${
                      area.invoiceCount === 1 ? "invoice" : "invoices"
                    }`}
                    valueLabel={money(area.amount)}
                    percent={area.percent}
                    totalLabel="invoiced"
                    leading={area.amount === leading}
                    onSelect={() => setSelected(area.key)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <CustomerAreaDetailSheet
        detail={detail ?? shown.current}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        metricLabel={METRIC_LABEL}
        isTopArea={summary.areas[0]?.key === selected}
      />
    </Card>
  );
}
