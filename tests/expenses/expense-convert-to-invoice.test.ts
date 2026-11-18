// @vitest-environment node
/**
 * Expenses → Convert to invoice opens the invoice on its own page, the way
 * Time Tracker's Create invoice does, instead of in a modal.
 *
 * Rendered to markup like the repo's other render tests — there's no DOM test
 * environment, so effects and clicks don't run. The invoice editor is stubbed
 * so what the page hands it (and its onSaved) can be checked directly.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(() => new Promise(() => {})), post: vi.fn() },
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

const markExpenseInvoicedApi = vi.fn();
vi.mock("@/lib/expenses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/expenses")>()),
  markExpenseInvoicedApi,
}));

type EditorProps = {
  expense?: { id: string };
  invoiceId?: string;
  returnTo?: string;
  onSaved?: (saved: { id: string; number: string }) => Promise<void>;
};
const editorProps: EditorProps[] = [];
vi.mock("@/components/invoices/invoice-editor", () => ({
  InvoiceEditor: (props: EditorProps) => {
    editorProps.push(props);
    return React.createElement("div", { "data-editor": "invoice" });
  },
}));

const { ExpenseInvoiceEditor, expenseInvoiceHref, expenseInvoiceQueryKey } =
  await import("@/components/expenses/expense-invoice-editor");
const { InvoiceEditor } = await import("@/components/invoices/invoice-editor");
const { TimeInvoiceEditor } = await import("@/components/time-tracker/time-invoice-editor");
const { default: NewGeneralInvoicePage } = await import("@/app/(app)/invoices/new/general/page");
const { default: EditInvoicePage } = await import("@/app/(app)/invoices/[id]/page");
const { mapApiExpense } = await import("@/lib/expenses");
const { useExpensesStore } = await import("@/stores/expenses");

const expense = (over: Record<string, unknown> = {}) =>
  mapApiExpense({
    expense_id: 42,
    name: "Printer paper",
    date: "2026-11-03",
    price: "55.00",
    total_price: "55.00",
    ...over,
  });

function render(
  props: { expenseId: string; invoiceId?: string },
  cached?: ReturnType<typeof expense>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (cached) client.setQueryData(expenseInvoiceQueryKey(props.expenseId), cached);
  const html = renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ExpenseInvoiceEditor, props),
    ),
  );
  return { html, client };
}

beforeEach(() => {
  editorProps.length = 0;
  push.mockReset();
  toastError.mockReset();
  markExpenseInvoicedApi.mockReset();
});

describe("the link Convert to invoice opens", () => {
  it("is a new general invoice, or the chosen draft, carrying the expense", () => {
    expect(expenseInvoiceHref("42")).toBe("/invoices/new/general?expense=42");
    expect(expenseInvoiceHref("42", "77")).toBe("/invoices/77?expense=42");
  });

  it("encodes ids that aren't URL-safe", () => {
    expect(expenseInvoiceHref("a b", "c/d")).toBe("/invoices/c%2Fd?expense=a%20b");
  });
});

describe("the invoice pages route ?expense= to the expense editor", () => {
  it("opens a new invoice for the expense", async () => {
    const page = await NewGeneralInvoicePage({
      searchParams: Promise.resolve({ expense: "42" }),
    });
    expect(page.type).toBe(ExpenseInvoiceEditor);
    expect(page.props).toEqual({ expenseId: "42" });
  });

  it("adds the expense to a chosen draft", async () => {
    const page = await EditInvoicePage({
      params: Promise.resolve({ id: "77" }),
      searchParams: Promise.resolve({ expense: "42" }),
    });
    expect(page.type).toBe(ExpenseInvoiceEditor);
    expect(page.props).toEqual({ expenseId: "42", invoiceId: "77" });
  });

  it("leaves Time Tracker's ?time= and the plain pages as they were", async () => {
    const time = await NewGeneralInvoicePage({
      searchParams: Promise.resolve({ time: "k1" }),
    });
    expect(time.type).toBe(TimeInvoiceEditor);

    const blank = await NewGeneralInvoicePage({ searchParams: Promise.resolve({}) });
    expect(blank.type).toBe(InvoiceEditor);

    const existing = await EditInvoicePage({
      params: Promise.resolve({ id: "77" }),
      searchParams: Promise.resolve({}),
    });
    expect(existing.type).toBe(InvoiceEditor);
    expect(existing.props).toEqual({ invoiceId: "77" });
  });
});

describe("the expense invoice page", () => {
  it("waits for the expense when it isn't cached (a reload)", () => {
    const { html } = render({ expenseId: "42" });
    expect(html).toContain("Preparing the invoice from your expense");
    expect(editorProps).toHaveLength(0);
  });

  it("opens the full editor on the row the list handed over", () => {
    const { html } = render({ expenseId: "42" }, expense());
    expect(html).toContain("From Expenses:");
    expect(html).toContain("Printer paper");
    expect(html).toContain("$55.00");
    expect(html).not.toContain("added as a new line on this draft");
    expect(editorProps).toHaveLength(1);
    expect(editorProps[0].expense?.id).toBe("42");
    expect(editorProps[0].invoiceId).toBeUndefined();
    expect(editorProps[0].returnTo).toBe("/expenses");
  });

  it("opens the chosen draft with the expense appended", () => {
    const { html } = render({ expenseId: "42", invoiceId: "77" }, expense());
    expect(html).toContain("added as a new line on this draft");
    expect(editorProps[0].invoiceId).toBe("77");
  });

  it("refuses an expense that's already been invoiced", () => {
    const { html } = render({ expenseId: "42" }, expense({ invoice_id: 9 }));
    expect(html).toContain("This expense has already been invoiced");
    expect(html).toContain('href="/expenses"');
    expect(editorProps).toHaveLength(0);
  });

  it("on save, links the expense, marks it invoiced and goes back to Expenses", async () => {
    markExpenseInvoicedApi.mockResolvedValue(undefined);
    const linkInvoice = vi.spyOn(useExpensesStore.getState(), "linkInvoice");
    const { client } = render({ expenseId: "42" }, expense());

    await editorProps[0].onSaved!({ id: "9", number: "INV-0009" });

    expect(markExpenseInvoicedApi).toHaveBeenCalledWith("42", "9", "INV-0009");
    expect(push).toHaveBeenCalledWith("/expenses");
    expect(toastError).not.toHaveBeenCalled();
    // Going Back into the page now finds it invoiced, so it can't be raised twice.
    const cached = client.getQueryData<ReturnType<typeof expense>>(expenseInvoiceQueryKey("42"));
    expect(cached?.invoiceId).toBe("9");
    linkInvoice.mockRestore();
  });

  it("says so when the link fails, but still leaves the saved invoice and goes back", async () => {
    markExpenseInvoicedApi.mockRejectedValue(new Error("boom"));
    render({ expenseId: "42" }, expense());

    await editorProps[0].onSaved!({ id: "9", number: "INV-0009" });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/expenses");
  });
});
