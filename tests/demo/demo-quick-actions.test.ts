import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mapUnmatchedRow } from "@/lib/bank-transactions";
import { buildDeck } from "@/lib/quick-actions-today";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { getSeedData, handleMockRequest } from "@/lib/demo-seed/mock-server";
import { __resetSessionForTests, endDemoSession } from "@/lib/demo-seed/session";

/* eslint-disable @typescript-eslint/no-explicit-any */
const get = (path: string, params: Record<string, any> = {}) => handleMockRequest("GET", path, params)!;

function suggestions() {
  const rows = get("/v2/bank/bank-transactions", { pageSize: 100 }).data.data.bank_transactions.bank_transaction_details;
  return rows.map((r: any) => mapUnmatchedRow(r));
}

function deck() {
  const invoices = ["draft", "overdue", "due_soon"].flatMap((status) => get("/unibox/invoices", { status }).data.data);
  return buildDeck({
    invoices,
    quotes: get("/unibox/quotes").data.data,
    suggestions: suggestions().filter((t: any) => t.aiSuggestions || t.suggestedDocument),
    bankLines: get("/unibox/bank-transactions").data.data,
    expenses: get("/unibox/expenses").data.data,
    onboarding: get("/unibox/onboarding").data.data,
    now: Date.now(),
  } as any);
}

beforeEach(() => {
  endDemoSession();
  __resetSessionForTests();
});
afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
});

const login = (industry: string, country: "AU" | "NZ") => handleMockRequest("POST", "/demo/login", {}, { industry, country });

describe("quick actions: AI transactions", () => {
  for (const [industry, country] of [
    ["plumbing", "AU"],
    ["hairdressers", "NZ"],
    ["ndis", "AU"],
  ] as const) {
    it(`${industry} / ${country}: the deck has an approve-categories card and a needs-your-eye note`, () => {
      login(industry, country);
      const card = deck().find((c) => c.kind === "approve-categories");
      expect(card, "approve-categories card").toBeDefined();
      expect(card!.items.length).toBeGreaterThanOrEqual(6);
      expect(card!.note).toMatch(/needs? your eye/);
    });
  }

  it("the default demo has the card too", () => {
    expect(deck().find((c) => c.kind === "approve-categories")).toBeDefined();
  });

  it("predictions carry a category, a confidence and alternatives; some carry a document", () => {
    login("plumbing", "AU");
    const rows = suggestions();
    expect(rows.every((r: any) => r.aiSuggestions?.primary.name)).toBe(true);
    expect(rows.some((r: any) => r.suggestedDocument?.type === "expense")).toBe(true);
    expect(rows.some((r: any) => r.suggestedDocument?.type === "invoice")).toBe(true);
    expect(rows.some((r: any) => !r.suggestedClient && !r.suggestedDocument)).toBe(true);
  });

  it("approving a category suggestion books the line and the card shrinks", () => {
    login("plumbing", "AU");
    const before = deck().find((c) => c.kind === "approve-categories")!;
    const item: any = before.items.find((i: any) => i.source.approval.document === null)!;
    const approval = item.source.approval;
    const res = handleMockRequest(
      "POST",
      "/v2/bank/transaction-detail-match",
      {},
      JSON.stringify(
        buildEncryptedRequestBody({ transaction_id: approval.transactionId, account_subcategory_id: approval.categoryId, client_id: approval.clientId, gst_included: "1", is_ai_match: "1" }),
      ),
    )!;
    expect(res.data.success).toBe(true);
    const after = deck().find((c) => c.kind === "approve-categories")!;
    expect(after.items.length).toBe(before.items.length - 1);
    expect(getSeedData().bankTransactions.some((l: any) => String(l.id) === approval.transactionId && l.is_reconciled)).toBe(true);
    // The line now shows under matched transactions.
    expect(JSON.stringify(get("/v2/bank/sole-saved-transactions", { pageSize: 500 }).data)).toContain(item.label.slice(0, 12));
  });

  it("bulk approve, matching a document, and reject all work", () => {
    login("cleaning", "AU");
    const card = deck().find((c) => c.kind === "approve-categories")!;
    const docItem: any = card.items.find((i: any) => i.source.approval.document?.type === "invoice");
    expect(docItem).toBeDefined();
    const doc = docItem.source.approval.document;
    const invoiceBefore = (getSeedData().invoices as any[]).find((i) => String(i.invoice_id) === String(doc.id));
    expect(invoiceBefore.status).not.toBe("paid");
    handleMockRequest("POST", "/v2/bank-transaction/match-invoice", {}, JSON.stringify(buildEncryptedRequestBody({ bank_transaction_id: Number(docItem.id), invoices: [Number(doc.id)] })));
    expect((getSeedData().invoices as any[]).find((i) => String(i.invoice_id) === String(doc.id)).status).toBe("paid");

    const coded = deck().find((c) => c.kind === "approve-categories")!.items.filter((i: any) => !i.source.approval.document);
    const bulk = handleMockRequest(
      "POST",
      "/v2/bank/transaction-detail-match",
      {},
      JSON.stringify(
        buildEncryptedRequestBody({
          transactions: coded.slice(0, 2).map((i: any) => ({ transaction_id: i.source.approval.transactionId, account_subcategory_id: i.source.approval.categoryId, client_id: i.source.approval.clientId, gst_included: 1, is_ai_match: true })),
          is_ai_match: true,
        }),
      ),
    )!;
    expect(bulk.data.success).toBe(true);

    const remaining = suggestions().filter((t: any) => t.aiSuggestions).map((t: any) => t.id);
    expect(remaining.length).toBeGreaterThan(0);
    const rej = handleMockRequest("POST", "/v2/bank-transaction/ai-suggestion-action", {}, JSON.stringify(buildEncryptedRequestBody({ transaction_ids: remaining, action: "reject" })))!;
    expect(rej.data.success).toBe(true);
    expect(suggestions().filter((t: any) => t.aiSuggestions)).toHaveLength(0);
    // Rejected lines stay in the bank feed, just without a suggestion.
    expect(suggestions().length).toBeGreaterThan(0);
  });

  it("unibox answers match what the page reads", () => {
    login("hospitality", "NZ");
    const progress = get("/unibox/progress").data.data;
    expect(progress.health.score).toBeGreaterThan(0);
    expect(progress.streak.current).toBeGreaterThan(0);
    expect(progress.activity.counts).toHaveLength(7);
    expect(progress.recent_actions.length).toBeGreaterThan(0);
    expect(get("/unibox/priorities").data.data.items.length).toBeGreaterThan(0);
    expect(get("/unibox/invoices", { status: "overdue" }).data.data.every((i: any) => i.status === "overdue" || i.status === "due")).toBe(true);
    expect(get("/unibox/expenses").data.data.some((e: any) => e.possible_match === 1)).toBe(true);
    expect(get("/v2/classification/summary").data.data.pending).toBeGreaterThan(0);
  });
});
