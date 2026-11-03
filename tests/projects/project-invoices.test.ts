import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/project-invoices.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  PROJECT_INVOICE_PAGE_SIZE,
  fetchProjectInvoicesPage,
  fetchProjectInvoiceSummary,
  projectInvoicePageInfo,
  projectInvoicePaidWithCashApi,
  sendProjectInvoiceReminderApi,
  sendProjectInvoicePaidReceiptApi,
  deleteProjectInvoiceApi,
} = await import("@/lib/project-invoices");

/** Pulls the decrypted fields back out of an encrypted `{ data }` body. */
function decryptBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not a {data} envelope");
  }
  return decryptPayload(asData.data);
}

/** A raw `/project/invoiceList` row — fields overridden per test as needed. */
function rawInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    invoice_no: "INV-0501",
    invoice_date: "2026-10-01",
    due_date: "2026-10-31",
    total: "1100.00",
    mark_as: "sent",
    template_id: 3,
    paid_with_cash: 0,
    bank_transaction_id: null,
    bulk_upload: 0,
    client: { name: "Acme Pty Ltd", business_name: "Acme Trading" },
    invoiceItem: [{ description: "Kitchen demolition" }, { description: "Skip bin hire" }],
    ...overrides,
  };
}

/** Wraps rows in the list endpoint's envelope. */
function listResponse(
  invoices: unknown[],
  pagination: Record<string, unknown> = { totalItems: invoices.length, totalPages: 1 },
) {
  return { data: { success: true, data: { invoices, pagination } } };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Every status test is relative to "today" — pin it so the overdue split is
  // deterministic. Midday local time keeps the timezone adjustment in
  // `todayIso` on the same calendar day.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 22, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the page size constant", () => {
  it("is 10 rows, as the old tab showed", () => {
    expect(PROJECT_INVOICE_PAGE_SIZE).toBe(10);
  });
});

describe("fetching one page of a project's invoices", () => {
  it("GETs the project invoice list with project_id, page and limit params", async () => {
    apiMock.get.mockResolvedValue(listResponse([]));

    await fetchProjectInvoicesPage("77", 3, 10);

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.getInvoiceList, {
      params: { project_id: "77", page: 3, limit: 10 },
    });
  });

  it("reports the pagination's totalItems as the total, parsing strings", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([rawInvoice()], { totalItems: "42", totalPages: "5" }),
    );

    const page = await fetchProjectInvoicesPage("77", 1, 10);

    expect(page.total).toBe(42);
  });

  it("falls back to zero rows and a zero total when the payload is empty", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });

    await expect(fetchProjectInvoicesPage("77", 1, 10)).resolves.toEqual({ rows: [], total: 0 });
  });

  it("maps a full row into the tab's narrow shape", async () => {
    apiMock.get.mockResolvedValue(listResponse([rawInvoice()]));

    const { rows } = await fetchProjectInvoicesPage("77", 1, 10);

    expect(rows).toEqual([
      {
        id: "501",
        number: "INV-0501",
        clientName: "Acme Pty Ltd",
        // Only the first line item's description is shown.
        description: "Kitchen demolition",
        issued: "2026-10-01",
        due: "2026-10-31",
        total: 1100,
        status: "sent",
        templateId: "3",
        paidWithCash: false,
        reconciled: false,
        bulkUpload: false,
        bulkUploadMatched: false,
      },
    ]);
  });

  it("reads dd-MM-yyyy dates as well as yyyy-MM-dd", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([rawInvoice({ invoice_date: "01-10-2026", due_date: "15-11-2026" })]),
    );

    const [row] = (await fetchProjectInvoicesPage("77", 1, 10)).rows;

    expect(row.issued).toBe("2026-10-01");
    expect(row.due).toBe("2026-11-15");
  });

  it("leaves dates empty when the row has none", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([rawInvoice({ invoice_date: null, due_date: undefined })]),
    );

    const [row] = (await fetchProjectInvoicesPage("77", 1, 10)).rows;

    expect(row.issued).toBe("");
    expect(row.due).toBe("");
  });

  describe("client name", () => {
    it("falls back to the client's business name when the name is blank", async () => {
      apiMock.get.mockResolvedValue(
        listResponse([rawInvoice({ client: { name: "  ", business_name: "Acme Trading" } })]),
      );

      const [row] = (await fetchProjectInvoicesPage("77", 1, 10)).rows;

      expect(row.clientName).toBe("Acme Trading");
    });

    it("is empty when the invoice has no client", async () => {
      apiMock.get.mockResolvedValue(listResponse([rawInvoice({ client: null })]));

      const [row] = (await fetchProjectInvoicesPage("77", 1, 10)).rows;

      expect(row.clientName).toBe("");
    });
  });

  it("leaves the description empty when there are no line items", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([rawInvoice({ invoiceItem: [] }), rawInvoice({ id: 502, invoiceItem: null })]),
    );

    const { rows } = await fetchProjectInvoicesPage("77", 1, 10);

    expect(rows.map((row) => row.description)).toEqual(["", ""]);
  });

  it("falls back to template 1 when the row has no template id", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([rawInvoice({ template_id: null }), rawInvoice({ id: 502, template_id: "" })]),
    );

    const { rows } = await fetchProjectInvoicesPage("77", 1, 10);

    expect(rows.map((row) => row.templateId)).toEqual(["1", "1"]);
  });

  it("reads paid_with_cash from 1, '1', true and 'true'", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        rawInvoice({ paid_with_cash: 1 }),
        rawInvoice({ paid_with_cash: "1" }),
        rawInvoice({ paid_with_cash: true }),
        rawInvoice({ paid_with_cash: "true" }),
        rawInvoice({ paid_with_cash: 0 }),
        rawInvoice({ paid_with_cash: null }),
      ]),
    );

    const { rows } = await fetchProjectInvoicesPage("77", 1, 10);

    expect(rows.map((row) => row.paidWithCash)).toEqual([true, true, true, true, false, false]);
  });

  it("marks a row reconciled only when it has a positive bank transaction id", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        rawInvoice({ bank_transaction_id: 9001 }),
        rawInvoice({ bank_transaction_id: "12" }),
        rawInvoice({ bank_transaction_id: 0 }),
        rawInvoice({ bank_transaction_id: null }),
      ]),
    );

    const { rows } = await fetchProjectInvoicesPage("77", 1, 10);

    expect(rows.map((row) => row.reconciled)).toEqual([true, true, false, false]);
  });

  describe("bulk-upload flags", () => {
    it("flags an imported invoice as a bulk upload", async () => {
      apiMock.get.mockResolvedValue(listResponse([rawInvoice({ bulk_upload: 1 })]));

      const [row] = (await fetchProjectInvoicesPage("77", 1, 10)).rows;

      expect(row.bulkUpload).toBe(true);
      // The endpoint sends no remainingAmount today, so it never counts as matched.
      expect(row.bulkUploadMatched).toBe(false);
    });

    it("counts an imported invoice with nothing left owing as matched", async () => {
      apiMock.get.mockResolvedValue(
        listResponse([
          rawInvoice({ bulk_upload: 1, remainingAmount: 0 }),
          rawInvoice({ bulk_upload: 1, remainingAmount: "0.00" }),
          rawInvoice({ bulk_upload: 1, remainingAmount: 50 }),
        ]),
      );

      const { rows } = await fetchProjectInvoicesPage("77", 1, 10);

      expect(rows.map((row) => row.bulkUploadMatched)).toEqual([true, true, false]);
    });

    it("never counts a non-imported invoice as matched, whatever it owes", async () => {
      apiMock.get.mockResolvedValue(
        listResponse([rawInvoice({ bulk_upload: 0, remainingAmount: 0 })]),
      );

      const [row] = (await fetchProjectInvoicesPage("77", 1, 10)).rows;

      expect(row.bulkUpload).toBe(false);
      expect(row.bulkUploadMatched).toBe(false);
    });
  });

  it("throws the API's message when the response says success: false", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Project not found" } });

    await expect(fetchProjectInvoicesPage("77", 1, 10)).rejects.toThrow("Project not found");
  });

  it("throws a fallback message when success: false comes with no message", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });

    await expect(fetchProjectInvoicesPage("77", 1, 10)).rejects.toThrow(
      "Couldn't load this project's invoices.",
    );
  });
});

describe("mapping an invoice's status", () => {
  /** Fetches a single row with the given mark_as / due_date and returns its status. */
  async function statusOf(markAs: unknown, dueDate: unknown) {
    apiMock.get.mockResolvedValue(listResponse([rawInvoice({ mark_as: markAs, due_date: dueDate })]));
    const [row] = (await fetchProjectInvoicesPage("77", 1, 10)).rows;
    return row.status;
  }

  it("keeps draft, paid and partially paid as stored, whatever the due date", async () => {
    // Due in the past — none of these should flip to overdue.
    expect(await statusOf("draft", "2026-01-01")).toBe("draft");
    expect(await statusOf("paid", "2026-01-01")).toBe("paid");
    expect(await statusOf("partially_paid", "2026-01-01")).toBe("partially_paid");
  });

  it("reads the stored value case-insensitively", async () => {
    expect(await statusOf("PAID", "2026-01-01")).toBe("paid");
    expect(await statusOf("Draft", "2026-01-01")).toBe("draft");
  });

  it("shows a sent invoice past its due date as overdue", async () => {
    expect(await statusOf("sent", "2026-10-21")).toBe("overdue");
  });

  it("shows a sent invoice due today as sent, not overdue", async () => {
    expect(await statusOf("sent", "2026-10-22")).toBe("sent");
  });

  it("shows a sent invoice due in the future as sent", async () => {
    expect(await statusOf("sent", "2026-11-30")).toBe("sent");
  });

  it("shows a sent invoice with no due date as sent", async () => {
    expect(await statusOf("sent", null)).toBe("sent");
  });

  it("splits on the clock's current day, not a fixed one", async () => {
    vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));

    expect(await statusOf("sent", "2026-10-31")).toBe("overdue");
  });

  it("treats any other stored value like sent, splitting on the due date", async () => {
    // The endpoint only stores draft/sent/paid/partially_paid; anything else
    // (or nothing) falls through to the sent/overdue split.
    expect(await statusOf("due", "2026-10-01")).toBe("overdue");
    expect(await statusOf(null, "2026-12-01")).toBe("sent");
  });
});

describe("summarising a project's invoices across every page", () => {
  it("pages through the list 100 at a time until totalPages is reached", async () => {
    apiMock.get
      .mockResolvedValueOnce(listResponse([rawInvoice({ id: 1 })], { totalItems: 3, totalPages: 3 }))
      .mockResolvedValueOnce(listResponse([rawInvoice({ id: 2 })], { totalItems: 3, totalPages: 3 }))
      .mockResolvedValueOnce(listResponse([rawInvoice({ id: 3 })], { totalItems: 3, totalPages: 3 }));

    const summary = await fetchProjectInvoiceSummary("77");

    expect(apiMock.get).toHaveBeenCalledTimes(3);
    [1, 2, 3].forEach((page, index) => {
      expect(apiMock.get).toHaveBeenNthCalledWith(index + 1, apiRoutes.projects.getInvoiceList, {
        params: { project_id: "77", page, limit: 100 },
      });
    });
    expect(summary.count).toBe(3);
  });

  it("stops after one request when the response omits totalPages", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoices: [rawInvoice()] } },
    });

    await fetchProjectInvoiceSummary("77");

    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it("stops after one request for a project with no invoices (totalPages 0)", async () => {
    apiMock.get.mockResolvedValue(listResponse([], { totalItems: 0, totalPages: 0 }));

    const summary = await fetchProjectInvoiceSummary("77");

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ count: 0, invoiced: 0, paid: 0, outstanding: 0 });
  });

  it("excludes drafts, and splits the rest into paid and outstanding", async () => {
    apiMock.get.mockResolvedValue(
      listResponse([
        rawInvoice({ id: 1, mark_as: "draft", total: "999" }),
        rawInvoice({ id: 2, mark_as: "paid", total: "1000" }),
        rawInvoice({ id: 3, mark_as: "paid", total: 250.5 }),
        // Partially paid counts as outstanding in full.
        rawInvoice({ id: 4, mark_as: "partially_paid", total: "400" }),
        rawInvoice({ id: 5, mark_as: "sent", total: "300", due_date: "2026-12-01" }),
        // Overdue (sent, past due) is still outstanding.
        rawInvoice({ id: 6, mark_as: "sent", total: "200", due_date: "2026-09-01" }),
      ]),
    );

    const summary = await fetchProjectInvoiceSummary("77");

    expect(summary).toEqual({
      count: 5,
      invoiced: 2150.5,
      paid: 1250.5,
      outstanding: 900,
    });
  });

  it("sums totals across pages", async () => {
    apiMock.get
      .mockResolvedValueOnce(
        listResponse([rawInvoice({ id: 1, mark_as: "paid", total: "100" })], {
          totalItems: 2,
          totalPages: 2,
        }),
      )
      .mockResolvedValueOnce(
        listResponse([rawInvoice({ id: 2, mark_as: "sent", total: "40" })], {
          totalItems: 2,
          totalPages: 2,
        }),
      );

    await expect(fetchProjectInvoiceSummary("77")).resolves.toEqual({
      count: 2,
      invoiced: 140,
      paid: 100,
      outstanding: 40,
    });
  });

  it("throws when any page comes back with success: false", async () => {
    apiMock.get
      .mockResolvedValueOnce(listResponse([rawInvoice()], { totalItems: 101, totalPages: 2 }))
      .mockResolvedValueOnce({ data: { success: false, message: "Server error" } });

    await expect(fetchProjectInvoiceSummary("77")).rejects.toThrow("Server error");
  });
});

describe("page info for the pager", () => {
  it("describes a middle page", () => {
    expect(projectInvoicePageInfo(2, 10, 35)).toEqual({
      page: 2,
      pageCount: 4,
      total: 35,
      from: 11,
      to: 20,
    });
  });

  it("caps 'to' at the total on the last page", () => {
    expect(projectInvoicePageInfo(4, 10, 35)).toMatchObject({ from: 31, to: 35 });
  });

  it("reports one empty page when there are no invoices", () => {
    expect(projectInvoicePageInfo(1, 10, 0)).toEqual({
      page: 1,
      pageCount: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });

  it("clamps a page past the end back to the last page", () => {
    expect(projectInvoicePageInfo(9, 10, 35)).toMatchObject({ page: 4, from: 31, to: 35 });
  });

  it("clamps a page below 1 up to the first page", () => {
    expect(projectInvoicePageInfo(0, 10, 35)).toMatchObject({ page: 1, from: 1, to: 10 });
  });
});

describe("marking an invoice paid with cash", () => {
  it("POSTs an encrypted { invoice_id, undo: 0, payment_date } to invoice.paidWithCash", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "Marked as paid" } });

    const message = await projectInvoicePaidWithCashApi("501", {
      undo: false,
      paymentDate: "2026-10-22",
    });

    expect(message).toBe("Marked as paid");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.paidWithCash);
    expect(decryptBody(body)).toEqual({ invoice_id: 501, undo: 0, payment_date: "2026-10-22" });
  });

  it("sends undo: 1 and leaves payment_date out entirely when undoing", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    // Even if a date is passed, an undo must not carry it.
    await projectInvoicePaidWithCashApi("501", { undo: true, paymentDate: "2026-10-22" });

    const decrypted = decryptBody(apiMock.post.mock.calls[0][1]);
    expect(decrypted).toEqual({ invoice_id: 501, undo: 1 });
    expect(decrypted).not.toHaveProperty("payment_date");
  });

  it("throws the API's message on success: false", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Already paid" } });

    await expect(
      projectInvoicePaidWithCashApi("501", { undo: false, paymentDate: "2026-10-22" }),
    ).rejects.toThrow("Already paid");
  });

  it("throws a fallback message on success: false with no message", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });

    await expect(projectInvoicePaidWithCashApi("501", { undo: true })).rejects.toThrow(
      "Failed to update cash payment status",
    );
  });
});

describe("sending a payment reminder", () => {
  it("POSTs an encrypted { id, type: 'invoice' } to communicationPreference.sendReminder", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "Reminder sent" } });

    await expect(sendProjectInvoiceReminderApi("501")).resolves.toBe("Reminder sent");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.communicationPreference.sendReminder);
    expect(decryptBody(body)).toEqual({ id: 501, type: "invoice" });
  });

  it("throws on success: false, falling back to its own message", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });

    await expect(sendProjectInvoiceReminderApi("501")).rejects.toThrow(
      "Couldn't send the reminder.",
    );
  });
});

describe("sending a paid receipt", () => {
  it("POSTs an encrypted { id } to invoice.sendPaidReceipt", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "Receipt sent" } });

    await expect(sendProjectInvoicePaidReceiptApi("501")).resolves.toBe("Receipt sent");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.sendPaidReceipt);
    expect(decryptBody(body)).toEqual({ id: 501 });
  });

  it("throws on success: false, falling back to its own message", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });

    await expect(sendProjectInvoicePaidReceiptApi("501")).rejects.toThrow(
      "Couldn't send the paid receipt.",
    );
  });
});

describe("deleting an invoice", () => {
  it("POSTs an encrypted { id } to the invoice bulk-delete endpoint", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "Deleted" } });

    await expect(deleteProjectInvoiceApi("501")).resolves.toBe("Deleted");

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.invoice.bulkDelete);
    expect(decryptBody(body)).toEqual({ id: 501 });
  });

  it("throws the API's message on success: false", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Invoice is reconciled" } });

    await expect(deleteProjectInvoiceApi("501")).rejects.toThrow("Invoice is reconciled");
  });

  it("throws a fallback message on success: false with no message", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });

    await expect(deleteProjectInvoiceApi("501")).rejects.toThrow("Failed to delete invoice");
  });
});
