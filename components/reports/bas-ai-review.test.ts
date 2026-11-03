// @vitest-environment node
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const { FindingCard } = await import("@/components/reports/bas-ai-review");

import type { ReviewFinding, ReviewRow } from "@/lib/bas-review";

const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: "r0",
  linked: true,
  source: { kind: "expense", id: 9 },
  type: "Expense",
  date: "2025-08-10",
  name: "Laptop",
  party: "JB",
  code: "G11",
  category: "Office",
  exGst: 4000,
  gst: 400,
  incGst: 4400,
  ...over,
});

const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  id: "f1",
  source: "rule",
  severity: "high",
  title: "A purchase has no tax invoice",
  detail: "detail",
  action: "add_details",
  impactAmount: 400,
  suggestions: [],
  rowCount: 1,
  rows: [row()],
  ...over,
});

function render(f: ReviewFinding, decision: "pending" | "accepted" | "rejected" = "pending") {
  const client = new QueryClient();
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(FindingCard, {
        finding: f,
        decision,
        onDecide: () => {},
      }),
    ),
  );
}

const suggestion = {
  rowId: "r0",
  kind: "gst_off" as const,
  label: "Don't claim the GST",
  current: "Claiming $400.00 GST",
  proposed: "No GST claimed",
};

/** The per-row "Edit" links, which are the only Edit controls. */
const editLinks = (html: string) => html.match(/<a [^>]*>(?:(?!<\/a>).)*Edit<\/a>/g) ?? [];

describe("FindingCard", () => {
  it("shows the suggested change as advice, with no Apply and no auto-edit", () => {
    const html = render(finding({ suggestions: [suggestion] }));
    expect(html).toContain("Suggested change");
    expect(html).toContain("Claiming $400.00 GST");
    expect(html).toContain("No GST claimed");
    expect(html).not.toContain("Apply");
    expect(html).not.toContain("Keep as is");
  });

  it("offers only Mark as done and Ignore as decisions", () => {
    const html = render(finding());
    expect(html).toContain("Mark as done");
    expect(html).toContain("Ignore");
  });

  it("has Edit on each transaction row and nowhere else", () => {
    const rows = [
      row(),
      row({ id: "r1", source: { kind: "invoice", id: 3 } }),
      row({ id: "r2", source: null }),
    ];
    const links = editLinks(render(finding({ rowCount: 3, rows })));
    expect(links).toHaveLength(3);
    expect(links[0]).toContain('href="/expenses/9"');
    expect(links[1]).toContain('href="/invoices/3"');
    expect(links[2]).toContain("/expenses?search=");
    for (const link of links) expect(link).toContain('target="_blank"');
  });

  it("shows a single-row finding's row open, so its Edit is right there", () => {
    expect(editLinks(render(finding()))).toHaveLength(1);
  });

  it("folds a long list of rows until asked", () => {
    const rows = Array.from({ length: 4 }, (_, i) => row({ id: `r${i}` }));
    const html = render(finding({ rowCount: 4, rows }));
    expect(editLinks(html)).toHaveLength(0);
    expect(html).toContain("Show 4 transactions");
  });

  it("a handled finding offers Undo, not the decision buttons", () => {
    const html = render(finding(), "rejected");
    expect(html).toContain("Undo");
    expect(html).toContain("Ignored");
    expect(html).not.toContain("Mark as done");
  });
});
