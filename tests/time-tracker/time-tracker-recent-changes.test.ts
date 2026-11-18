import { describe, expect, it, vi } from "vitest";

/*
 * The Time Tracker changes after the module first shipped:
 *
 *  - "New client" from its pickers needs an email; "New supplier" doesn't.
 *  - Create invoice opens the invoice on its own page, not in a modal: the
 *    draft check decides whether to offer a choice first, and both invoice
 *    routes hand a `?time=` link to the Time Tracker invoice editor.
 */

// The routes import the editors, which pull in the whole invoice stack — the
// tests only need to see which one a route renders.
vi.mock("@/components/invoices/invoice-editor", () => ({ InvoiceEditor: () => null }));
vi.mock("@/components/time-tracker/time-invoice-editor", () => ({ TimeInvoiceEditor: () => null }));
vi.mock("@/components/expenses/expense-invoice-editor", () => ({ ExpenseInvoiceEditor: () => null }));

const { quickContactIssues } = await import("@/lib/contacts");
const { timeInvoiceStep } = await import("@/lib/time-invoice-handoff");
const { InvoiceEditor } = await import("@/components/invoices/invoice-editor");
const { TimeInvoiceEditor } = await import("@/components/time-tracker/time-invoice-editor");
const { ExpenseInvoiceEditor } = await import("@/components/expenses/expense-invoice-editor");
const { default: NewGeneralInvoicePage } = await import("@/app/(app)/invoices/new/general/page");
const { default: EditInvoicePage } = await import("@/app/(app)/invoices/[id]/page");

describe("quick-adding a contact from a picker", () => {
  it("needs an email for a client", () => {
    const issues = quickContactIssues("Client", { name: "Acme", email: "" });
    expect(issues.emailRequired).toBe(true);
    expect(issues.email).toBe("Enter the client's email address.");
  });

  it("lets a supplier go without one", () => {
    const issues = quickContactIssues("Supplier", { name: "Acme", email: "  " });
    expect(issues.emailRequired).toBe(false);
    expect(issues.email).toBeUndefined();
  });

  it("flags a badly typed email for either kind", () => {
    expect(quickContactIssues("Client", { name: "Acme", email: "acme.com" }).email).toBe("Enter a valid email address.");
    expect(quickContactIssues("Supplier", { name: "Acme", email: "acme@" }).email).toBe("Enter a valid email address.");
  });

  it("accepts a client with a name and a real email", () => {
    expect(quickContactIssues("Client", { name: " Acme ", email: " a@acme.com " })).toEqual({
      emailRequired: true,
      name: undefined,
      email: undefined,
    });
  });

  it("still needs a name of two characters or more", () => {
    expect(quickContactIssues("Client", { name: " A ", email: "a@acme.com" }).name).toMatch(/at least 2/);
  });
});

describe("what Create invoice does next", () => {
  const base = { open: true, clientId: "11", draftsLoading: false, draftCount: 0 };

  it("does nothing while closed", () => {
    expect(timeInvoiceStep({ ...base, open: false, draftCount: 3 })).toBe("closed");
  });

  it("waits while the client's drafts load", () => {
    expect(timeInvoiceStep({ ...base, draftsLoading: true })).toBe("checking");
  });

  it("offers the drafts when the client has any", () => {
    expect(timeInvoiceStep({ ...base, draftCount: 2 })).toBe("choosing");
  });

  it("goes straight to a new invoice page when there are none", () => {
    expect(timeInvoiceStep(base)).toBe("open-new");
  });

  it("goes straight to a new invoice page when there's no client to have drafts", () => {
    // Drafts are never fetched without a client, so "loading" can't hold it up.
    expect(timeInvoiceStep({ ...base, clientId: null, draftsLoading: true })).toBe("open-new");
  });
});

describe("the invoice routes", () => {
  it("open the Time Tracker invoice for a new invoice when handed ?time=", async () => {
    const page = await NewGeneralInvoicePage({ searchParams: Promise.resolve({ time: "k1" }) });
    expect(page.type).toBe(TimeInvoiceEditor);
    expect(page.props).toEqual({ handoffKey: "k1" });
  });

  it("open the plain editor otherwise, as before", async () => {
    const page = await NewGeneralInvoicePage({ searchParams: Promise.resolve({ quote: "9" }) });
    expect(page.type).toBe(InvoiceEditor);
    expect(page.props).toMatchObject({ quoteId: "9" });
  });

  it("leave an expense's own handoff to its editor", async () => {
    const page = await NewGeneralInvoicePage({ searchParams: Promise.resolve({ expense: "9" }) });
    expect(page.type).toBe(ExpenseInvoiceEditor);
  });

  it("take the Time Tracker handoff first when a link carries both", async () => {
    const page = await NewGeneralInvoicePage({ searchParams: Promise.resolve({ time: "k1", expense: "9" }) });
    expect(page.type).toBe(TimeInvoiceEditor);
  });

  it("open a chosen draft with the time appended when handed ?time=", async () => {
    const page = await EditInvoicePage({
      params: Promise.resolve({ id: "55" }),
      searchParams: Promise.resolve({ time: "k2" }),
    });
    expect(page.type).toBe(TimeInvoiceEditor);
    expect(page.props).toEqual({ handoffKey: "k2", invoiceId: "55" });
  });

  it("open a draft for plain editing otherwise", async () => {
    const page = await EditInvoicePage({ params: Promise.resolve({ id: "55" }), searchParams: Promise.resolve({}) });
    expect(page.type).toBe(InvoiceEditor);
    expect(page.props).toEqual({ invoiceId: "55" });
  });
});
