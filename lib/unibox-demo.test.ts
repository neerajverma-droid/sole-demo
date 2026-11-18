import { describe, expect, it } from "vitest";

import { isDemoRow, overlayDemo } from "@/lib/unibox-demo";
import type { UniboxInvoice, UniboxMatchable } from "@/lib/unibox";
import { getPaidSets, bankFeedRows, matchableRows } from "@/lib/unibox-rules";

const NOW = Date.UTC(2026, 10, 2, 12);

describe("overlayDemo", () => {
  it("fills an empty list with sample rows, each marked", () => {
    const { data, sampled } = overlayDemo("projects", [], NOW);
    expect(sampled).toBe(true);
    expect((data as unknown[]).length).toBeGreaterThan(0);
    expect((data as unknown[]).every(isDemoRow)).toBe(true);
  });

  it("leaves a list that has rows of its own alone", () => {
    const real: UniboxMatchable[] = [{ id: 1, name: "Real expense" }];
    const { data, sampled } = overlayDemo("expenses", real, NOW);
    expect(sampled).toBe(false);
    expect(data).toBe(real);
  });

  it("treats a failed or missing answer as empty", () => {
    expect(overlayDemo("assets", undefined, NOW).sampled).toBe(true);
  });

  it("never samples onboarding", () => {
    const { sampled } = overlayDemo("onboarding", null, NOW);
    expect(sampled).toBe(false);
  });

  it("samples progress only when there is no activity of its own", () => {
    expect(overlayDemo("progress", null, NOW).sampled).toBe(true);
    expect(overlayDemo("progress", { streak: { current: 0 } }, NOW).sampled).toBe(true);
    const real = { streak: { current: 2 } };
    expect(overlayDemo("progress", real, NOW)).toEqual({ data: real, sampled: false });
  });

  it("tops the urgent five up to five, keeping the account's own item first", () => {
    const real = [{ id: "real-1", resource_type: "expense", action: { key: "match", label: "Match" } }];
    const { data, sampled } = overlayDemo("priorities", real, NOW);
    const rows = data as { id: string }[];
    expect(sampled).toBe(true);
    expect(rows).toHaveLength(5);
    expect(rows[0].id).toBe("real-1");
    expect(rows.slice(1).every(isDemoRow)).toBe(true);
  });

  it("leaves a full urgent five alone", () => {
    const real = Array.from({ length: 5 }, (_, index) => ({ id: `real-${index}` }));
    expect(overlayDemo("priorities", real, NOW)).toEqual({ data: real, sampled: false });
  });

  it("gives every urgent-five sample an id and an action the list can use", () => {
    const { data } = overlayDemo("priorities", [], NOW);
    for (const item of data as { id: string; action?: unknown }[]) {
      expect(item.id.startsWith("demo-")).toBe(true);
      expect(item.action).toBeTruthy();
    }
  });
});

describe("overlayDemo — Get paid invoices", () => {
  it("adds a sample for each empty tab and keeps the real invoice", () => {
    const real: UniboxInvoice[] = [{ id: 7, invoice_no: "INV-7", status: "draft", total: 100 }];
    const { data, sampled } = overlayDemo("invoices", real, NOW);
    const rows = data as UniboxInvoice[];
    expect(sampled).toBe(true);
    expect(rows[0]).toBe(real[0]);

    const sets = getPaidSets(rows, [], NOW);
    expect(sets.invoiceCounts["To send"]).toBe(1);
    expect(sets.invoiceCounts.Overdue).toBe(1);
    expect(sets.invoiceCounts["Due soon"]).toBe(1);
    expect(rows.filter(isDemoRow)).toHaveLength(2);
  });

  it("fills a brand-new account's three tabs", () => {
    const rows = overlayDemo("invoices", [], NOW).data as UniboxInvoice[];
    const sets = getPaidSets(rows, [], NOW);
    expect(Object.values(sets.invoiceCounts).every((count) => count === 1)).toBe(true);
  });
});

describe("samples against the cards' own filters", () => {
  it("shows every bank sample as unmatched", () => {
    const rows = overlayDemo("bankTransactions", [], NOW).data as Parameters<typeof bankFeedRows>[0];
    expect(bankFeedRows(rows)).toHaveLength(rows.length);
  });

  it("shows every expense sample as not yet reconciled", () => {
    const rows = overlayDemo("expenses", [], NOW).data as UniboxMatchable[];
    expect(matchableRows(rows)).toHaveLength(rows.length);
  });
});
