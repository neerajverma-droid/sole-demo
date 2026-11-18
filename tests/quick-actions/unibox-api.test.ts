/**
 * Quick Actions — the `/unibox/*` reads and every write the screen fires.
 *
 * One test per call sole-webapp's `pages/quick-actions` made on mount, plus
 * the writes behind each button: same route, same body, and the same
 * success / failure handling.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const unibox = await import("@/lib/unibox");
const { sendInvoiceReminderApi, markInvoicePaidWithCashApi } = await import("@/lib/invoices");

const ok = <T>(data: T) => ({ data: { success: true, data } });

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Reads — the fifteen calls the old page made on mount
 * ------------------------------------------------------------------ */

describe("list reads", () => {
  const LISTS = [
    ["fetchUniboxQuotes", "quotes"],
    ["fetchUniboxExpenses", "expenses"],
    ["fetchUniboxAssets", "assets"],
    ["fetchUniboxLiabilities", "liabilities"],
    ["fetchUniboxEquity", "equity"],
    ["fetchUniboxTimeEntries", "timeTracker"],
    ["fetchUniboxProjects", "projects"],
    ["fetchUniboxTrips", "kmTracker"],
    ["fetchUniboxWorkComingUp", "workComingUp"],
    ["fetchUniboxBankTransactions", "bankTransactions"],
  ] as const;

  it.each(LISTS)("%s reads /unibox/%s and returns its rows", async (fn, route) => {
    apiMock.get.mockResolvedValueOnce(ok([{ id: 1 }, { id: 2 }]));

    const rows = await unibox[fn]();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.unibox[route], undefined);
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it.each(LISTS)("%s falls back to an empty list when data isn't an array", async (fn) => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: null } });
    await expect(unibox[fn]()).resolves.toEqual([]);

    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "nope" } });
    await expect(unibox[fn]()).resolves.toEqual([]);
  });
});

describe("fetchUniboxInvoices", () => {
  it("asks for draft, overdue and due-soon invoices separately", async () => {
    apiMock.get.mockResolvedValue(ok([]));

    await unibox.fetchUniboxInvoices();

    expect(apiMock.get).toHaveBeenCalledTimes(3);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.unibox.invoices, { params: { status: "draft" } });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.unibox.invoices, { params: { status: "overdue" } });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.unibox.invoices, { params: { status: "due_soon" } });
  });

  it("merges the three sets, keeping one copy of an invoice listed twice", async () => {
    apiMock.get
      .mockResolvedValueOnce(ok([{ id: 1, status: "draft" }]))
      .mockResolvedValueOnce(ok([{ id: 2, status: "overdue" }, { id: 3, status: "sent" }]))
      .mockResolvedValueOnce(ok([{ id: 3, status: "sent", total: 99 }]));

    const invoices = await unibox.fetchUniboxInvoices();

    expect(invoices.map((invoice) => invoice.id)).toEqual([1, 2, 3]);
    // The later copy wins, as the old Map did.
    expect(invoices.find((invoice) => invoice.id === 3)?.total).toBe(99);
  });

  it("treats a string and a number id as the same invoice", async () => {
    apiMock.get
      .mockResolvedValueOnce(ok([{ id: 7 }]))
      .mockResolvedValueOnce(ok([{ id: "7" }]))
      .mockResolvedValueOnce(ok([]));

    await expect(unibox.fetchUniboxInvoices()).resolves.toHaveLength(1);
  });
});

describe("single-object reads", () => {
  it("fetchUniboxPriorities returns data.items", async () => {
    apiMock.get.mockResolvedValueOnce(ok({ items: [{ id: "invoice:1" }] }));

    await expect(unibox.fetchUniboxPriorities()).resolves.toEqual([{ id: "invoice:1" }]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.unibox.priorities);
  });

  it("fetchUniboxPriorities is empty when the server sends no items", async () => {
    apiMock.get.mockResolvedValueOnce(ok({}));
    await expect(unibox.fetchUniboxPriorities()).resolves.toEqual([]);

    apiMock.get.mockResolvedValueOnce({ data: {} });
    await expect(unibox.fetchUniboxPriorities()).resolves.toEqual([]);
  });

  it("fetchUniboxProgress returns the progress object, or null", async () => {
    apiMock.get.mockResolvedValueOnce(ok({ health: { score: 72 } }));
    await expect(unibox.fetchUniboxProgress()).resolves.toEqual({ health: { score: 72 } });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.unibox.progress);

    apiMock.get.mockResolvedValueOnce({ data: {} });
    await expect(unibox.fetchUniboxProgress()).resolves.toBeNull();
  });

  it("fetchUniboxOnboarding returns the setup state, or null", async () => {
    apiMock.get.mockResolvedValueOnce(ok({ show_suggestions: true }));
    await expect(unibox.fetchUniboxOnboarding()).resolves.toEqual({ show_suggestions: true });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.unibox.onboarding);

    apiMock.get.mockResolvedValueOnce({ data: {} });
    await expect(unibox.fetchUniboxOnboarding()).resolves.toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Writes — Get paid
 * ------------------------------------------------------------------ */

describe("send invoice", () => {
  it("posts to /unibox/invoices/:id/send and resolves with the server's message", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true, message: "Sent!" } });

    await expect(unibox.sendUniboxInvoiceApi(12)).resolves.toBe("Sent!");
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.unibox.sendInvoice("12"));
  });

  it("resolves with an empty message when the server sends none", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true } });
    await expect(unibox.sendUniboxInvoiceApi(12)).resolves.toBe("");
  });

  it("throws the server's message on failure, or a fallback", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: false, message: "No email on file" } });
    await expect(unibox.sendUniboxInvoiceApi(12)).rejects.toThrow("No email on file");

    apiMock.post.mockResolvedValueOnce({ data: { success: false } });
    await expect(unibox.sendUniboxInvoiceApi(12)).rejects.toThrow("Unable to send this invoice.");
  });
});

describe("send quote / send again", () => {
  it("posts to /unibox/quotes/:id/send", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true, message: "Quote sent" } });

    await expect(unibox.sendUniboxQuoteApi("45")).resolves.toBe("Quote sent");
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.unibox.sendQuote("45"));
  });

  it("throws on failure", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: false } });
    await expect(unibox.sendUniboxQuoteApi("45")).rejects.toThrow("Unable to send this quote.");
  });
});

describe("convert quote to invoice", () => {
  it("sends the quote id and its valid-till date, encrypted", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true, message: "Converted" } });

    await expect(
      unibox.convertUniboxQuoteApi({ id: 9, quote_id: 45, valid_till: "2026-11-30" }),
    ).resolves.toBe("Converted");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.convertToInvoice);
    // Plain FormData is what the server rejects with "Failed to decrypt payload".
    expect(body).not.toBeInstanceOf(FormData);
    expect(decryptPayload((body as { data: string }).data)).toEqual({ id: "45", due_date: "2026-11-30" });
  });

  it("uses the row id when there's no quote id, and today when there's no valid-till", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true } });
    const today = new Date().toISOString().split("T")[0];

    await unibox.convertUniboxQuoteApi({ id: 9 });

    const body = apiMock.post.mock.calls[0][1] as { data: string };
    expect(decryptPayload(body.data)).toEqual({ id: "9", due_date: today });
  });

  it("throws on failure", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: false, message: "Already converted" } });
    await expect(unibox.convertUniboxQuoteApi({ id: 9 })).rejects.toThrow("Already converted");
  });
});

/* ------------------------------------------------------------------ *
 * Writes — the urgent five's invoice actions
 * ------------------------------------------------------------------ */

describe("follow up (invoice reminder)", () => {
  it("posts the invoice id and type to the reminder route", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true } });

    await sendInvoiceReminderApi("31");

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.communicationPreference.sendReminder, {
      id: 31,
      type: "invoice",
    });
  });

  it("throws when the server refuses", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: false, message: "Client has no email" } });
    await expect(sendInvoiceReminderApi("31")).rejects.toThrow();
  });
});

describe("mark as paid with cash", () => {
  it("posts the invoice id and today's date to the cash route", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true } });

    await markInvoicePaidWithCashApi("31");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.paidWithCash);
    expect(body).toMatchObject({ invoice_id: 31 });
    expect(body.payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("throws when the server refuses", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: false } });
    await expect(markInvoicePaidWithCashApi("31")).rejects.toThrow();
  });
});
