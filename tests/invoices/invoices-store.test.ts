import { beforeEach, describe, expect, it, vi } from "vitest";

// `stores/sales-settings.ts` (read by duplicateInvoice) uses zustand's
// `persist`, which writes through to storage on every set — and this repo's
// "node" test environment has no real localStorage.
vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

const toggleFavouriteMock = vi.fn();
vi.mock("@/lib/invoice-templates", () => ({
  toggleInvoiceDefaultFavouriteApi: toggleFavouriteMock,
}));

const { useInvoicesStore } = await import("@/stores/invoices");
const { useSalesSettingsStore } = await import("@/stores/sales-settings");
const { DEFAULT_SALES_SETTINGS } = await import("@/lib/sales-settings");
const { emptyInvoiceDraft, newLineItem } = await import("@/lib/invoices");

type Invoice = ReturnType<typeof useInvoicesStore.getState>["invoices"][number];

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    ...emptyInvoiceDraft("INV-0001", "2026-03-01"),
    id: "1",
    clientId: "42",
    clientName: "Acme",
    status: "Outstanding",
    items: [{ ...newLineItem(), description: "Work", quantity: "1", price: "100", gst: false }],
    paidAmount: 0,
    sentAt: null,
    matchedTransactionId: null,
    possibleMatch: 0,
    isRecurring: false,
    paidWithCash: false,
    ...over,
  } as Invoice;
}

/** Lets a resolved/rejected API promise's `.then`/`.catch` run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const state = () => useInvoicesStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useInvoicesStore.setState({ invoices: [], hydrated: false, favouriteTemplates: [] });
  useSalesSettingsStore.setState({ settings: DEFAULT_SALES_SETTINGS });
});

/* ------------------------------------------------------------------ *
 * Favourite templates
 * ------------------------------------------------------------------ */

describe("toggleFavouriteTemplate", () => {
  it("stars optimistically, before the server answers", () => {
    toggleFavouriteMock.mockReturnValue(new Promise(() => {}));

    state().toggleFavouriteTemplate("5");

    expect(state().favouriteTemplates).toEqual(["5"]);
    expect(toggleFavouriteMock).toHaveBeenCalledWith("5");
  });

  it("unstars optimistically", () => {
    toggleFavouriteMock.mockReturnValue(new Promise(() => {}));
    useInvoicesStore.setState({ favouriteTemplates: ["4", "5"] });

    state().toggleFavouriteTemplate("5");

    expect(state().favouriteTemplates).toEqual(["4"]);
  });

  it("keeps the star without duplicating it when the server confirms", async () => {
    toggleFavouriteMock.mockResolvedValue(true);

    state().toggleFavouriteTemplate("5");
    await flush();

    expect(state().favouriteTemplates).toEqual(["5"]);
  });

  it("reconciles to the server's answer when it disagrees with the optimistic flip", async () => {
    // Optimistically starred, but the server says it's now not a favourite.
    toggleFavouriteMock.mockResolvedValue(false);
    state().toggleFavouriteTemplate("5");
    await flush();
    expect(state().favouriteTemplates).toEqual([]);

    // Optimistically unstarred, but the server says it still is.
    useInvoicesStore.setState({ favouriteTemplates: ["5"] });
    toggleFavouriteMock.mockResolvedValue(true);
    state().toggleFavouriteTemplate("5");
    expect(state().favouriteTemplates).toEqual([]);
    await flush();
    expect(state().favouriteTemplates).toEqual(["5"]);
  });

  it("rolls back to the previous set when the call fails", async () => {
    toggleFavouriteMock.mockRejectedValue(new Error("500"));
    useInvoicesStore.setState({ favouriteTemplates: ["4"] });

    state().toggleFavouriteTemplate("5");
    expect(state().favouriteTemplates).toEqual(["4", "5"]);
    await flush();

    expect(state().favouriteTemplates).toEqual(["4"]);
  });
});

/* ------------------------------------------------------------------ *
 * Hydration
 * ------------------------------------------------------------------ */

describe("setInvoices", () => {
  it("marks the store hydrated along with the list", () => {
    state().setInvoices([invoice()]);
    expect(state().hydrated).toBe(true);
    expect(state().invoices).toHaveLength(1);
  });

  it("marks it hydrated even for an empty account", () => {
    state().setInvoices([]);
    expect(state().hydrated).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Editing
 * ------------------------------------------------------------------ */

describe("updateInvoice", () => {
  it("rebuilds the document from the draft, trimmed, keeping its status", () => {
    state().setInvoices([invoice({ status: "Overdue" })]);

    state().updateInvoice("1", {
      ...emptyInvoiceDraft(" INV-0001 ", "2026-03-01"),
      clientName: "  New Name  ",
      description: "Edited",
    });

    expect(state().invoices[0]).toMatchObject({
      id: "1",
      status: "Overdue",
      number: "INV-0001",
      clientName: "New Name",
      description: "Edited",
    });
  });

  it("keeps what's been paid, sent and matched", () => {
    state().setInvoices([
      invoice({
        paidAmount: 40,
        sentAt: "2026-03-02",
        matchedTransactionId: "tx-9",
        possibleMatch: 3,
      }),
    ]);

    state().updateInvoice("1", emptyInvoiceDraft("INV-0001", "2026-03-01"));

    expect(state().invoices[0]).toMatchObject({
      paidAmount: 40,
      sentAt: "2026-03-02",
      matchedTransactionId: "tx-9",
      possibleMatch: 3,
    });
  });

  it("resets isRecurring and paidWithCash to false, since toInvoice always does", () => {
    state().setInvoices([invoice({ isRecurring: true, paidWithCash: true })]);

    state().updateInvoice("1", emptyInvoiceDraft("INV-0001", "2026-03-01"));

    expect(state().invoices[0]).toMatchObject({ isRecurring: false, paidWithCash: false });
  });

  it("leaves every other invoice alone", () => {
    const other = invoice({ id: "2", number: "INV-0002" });
    state().setInvoices([invoice(), other]);

    state().updateInvoice("1", emptyInvoiceDraft("INV-0009", "2026-03-01"));

    expect(state().invoices[1]).toBe(other);
  });
});

/* ------------------------------------------------------------------ *
 * Duplicating
 * ------------------------------------------------------------------ */

describe("duplicateInvoice", () => {
  it("returns undefined for an id that isn't in the store", () => {
    expect(state().duplicateInvoice("nope")).toBeUndefined();
    expect(state().invoices).toEqual([]);
  });

  it("puts a draft copy first, unpaid, unsent and unmatched", () => {
    state().setInvoices([
      invoice({
        status: "Paid",
        paidAmount: 100,
        sentAt: "2026-03-02",
        matchedTransactionId: "tx-9",
        possibleMatch: 2,
      }),
    ]);

    const copy = state().duplicateInvoice("1");

    expect(copy).toBeDefined();
    expect(state().invoices[0]).toBe(copy);
    expect(state().invoices).toHaveLength(2);
    expect(copy).toMatchObject({
      status: "Draft",
      paidAmount: 0,
      sentAt: null,
      matchedTransactionId: null,
      possibleMatch: 0,
      clientName: "Acme",
    });
    expect(copy!.id).not.toBe("1");
    // Fresh line ids, same content.
    expect(copy!.items[0].id).not.toBe(state().invoices[1].items[0].id);
    expect(copy!.items[0]).toMatchObject({ description: "Work", price: "100" });
  });

  it("numbers the copy from the store's highest number and the Sales settings floor", () => {
    useSalesSettingsStore.setState({
      settings: { ...DEFAULT_SALES_SETTINGS, invoicePrefix: "SOLE", nextInvoiceNumber: "5" },
    });
    state().setInvoices([invoice({ number: "SOLE-0011" })]);

    expect(state().duplicateInvoice("1")!.number).toBe("SOLE-0012");

    useSalesSettingsStore.setState({
      settings: { ...DEFAULT_SALES_SETTINGS, invoicePrefix: "SOLE", nextInvoiceNumber: "50" },
    });
    expect(state().duplicateInvoice("1")!.number).toBe("SOLE-0050");
  });

  it("keeps the source's isRecurring and paidWithCash, unlike updateInvoice", () => {
    state().setInvoices([invoice({ isRecurring: true, paidWithCash: true })]);

    expect(state().duplicateInvoice("1")).toMatchObject({
      isRecurring: true,
      paidWithCash: true,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Sending, payments, matching
 * ------------------------------------------------------------------ */

describe("markSent", () => {
  it("stamps today's date on an unsent invoice", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 6, 10, 0));
    try {
      state().setInvoices([invoice()]);
      state().markSent("1");
      expect(state().invoices[0].sentAt).toBe("2026-05-06");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the original date on an invoice already sent", () => {
    state().setInvoices([invoice({ sentAt: "2026-03-02" })]);
    state().markSent("1");
    expect(state().invoices[0].sentAt).toBe("2026-03-02");
  });
});

describe("recordPayment", () => {
  it("replaces the paid amount rather than adding to it, and derives the status", () => {
    state().setInvoices([invoice({ paidAmount: 30, status: "Overdue" })]);

    state().recordPayment("1", 40);
    expect(state().invoices[0]).toMatchObject({ paidAmount: 40, status: "Partially paid" });

    state().recordPayment("1", 100);
    expect(state().invoices[0]).toMatchObject({ paidAmount: 100, status: "Paid" });
  });
});

describe("markPaid", () => {
  it("settles each chosen invoice at its full amount", () => {
    state().setInvoices([invoice(), invoice({ id: "2" })]);

    state().markPaid(["1"]);

    expect(state().invoices[0]).toMatchObject({ status: "Paid", paidAmount: 100 });
    expect(state().invoices[1]).toMatchObject({ status: "Outstanding", paidAmount: 0 });
  });
});

describe("matchTransaction / unmatchTransaction", () => {
  it("drops the link without touching the status", () => {
    state().setInvoices([invoice({ status: "Overdue" })]);

    state().matchTransaction("1", "tx-1");
    expect(state().invoices[0].matchedTransactionId).toBe("tx-1");

    state().unmatchTransaction("1");
    expect(state().invoices[0]).toMatchObject({
      matchedTransactionId: null,
      status: "Overdue",
    });
  });
});

describe("addInvoice", () => {
  it("adds a new draft first, with nothing paid, sent or matched", () => {
    state().setInvoices([invoice()]);

    const added = state().addInvoice({
      ...emptyInvoiceDraft(" INV-0002 ", "2026-03-01"),
      clientName: " Beta ",
    });

    expect(state().invoices[0]).toBe(added);
    expect(added).toMatchObject({
      status: "Draft",
      number: "INV-0002",
      clientName: "Beta",
      paidAmount: 0,
      sentAt: null,
      possibleMatch: 0,
      isRecurring: false,
      paidWithCash: false,
    });
  });
});
