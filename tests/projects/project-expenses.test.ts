import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";
import { EVENTS } from "@/lib/analytics-events";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

const trackMock = vi.fn();

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// `createProjectExpenseApi` fires the same analytics event the main expense
// form does — mocked so the test can assert it without touching Mixpanel.
vi.mock("@/lib/analytics", () => ({ track: trackMock }));

// Imported after the mocks so `lib/project-expenses.ts`'s own imports resolve
// to the mocked modules above.
const {
  fetchProjectExpenses,
  fetchProjectExpenseSummary,
  fetchUnassignedExpenses,
  assignExpensesToProjectApi,
  fetchProjectJobOptions,
  createProjectExpenseApi,
  updateProjectExpenseApi,
  PROJECT_HIDDEN_CATEGORY_ID,
  invoiceSeedFromProjectExpense,
  pageInfo,
  fetchProjectExpenseView,
} = await import("@/lib/project-expenses");
const { emptyExpenseDraft } = await import("@/lib/expenses");

type Draft = ReturnType<typeof emptyExpenseDraft>;

/** A minimal, valid draft — individual fields overridden per test as needed. */
function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    ...emptyExpenseDraft("2026-10-01"),
    description: "  Timber for deck  ",
    amount: 220,
    categoryId: "57",
    supplierId: "12",
    contactId: "34",
    gst: true,
    paymentMethod: "Card",
    ...overrides,
  };
}

/** Decrypts whatever body a call sent, whether it's a bare `{data}` object or a FormData carrying one. */
function decryptBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string") throw new Error("FormData had no 'data' field");
    return decryptPayload(data);
  }
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was neither FormData nor a {data} envelope");
  }
  return decryptPayload(asData.data);
}

/** A row from `GET /v2/expense/project/:projectId`, in the raw model shape. */
function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 901,
    name: " Timber ",
    price: "220.00",
    business_amount: null,
    date: "2026-09-14",
    project_job_id: 7,
    invoice_id: null,
    is_invoiced: 0,
    client: { name: "Bunnings" },
    accountSubcategory: { name: "Materials" },
    invoice: null,
    projectJob: { job_name: "Deck", job_code: "J-7" },
    ...overrides,
  };
}

const PROJECT = {
  id: "88",
  clientId: "12",
  clientName: "Harper & Co",
  name: "Harper deck",
};

beforeEach(() => {
  vi.resetAllMocks();
});

/* ------------------------------------------------------------------ */

describe("fetching a project's expenses", () => {
  it("GETs the project's route with the page and limit", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [], meta: { total: 0 } } });

    await fetchProjectExpenses("88", 2, 10);

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.projects.projectExpenseList}/88`, {
      params: { page: 2, limit: 10 },
    });
  });

  it("maps every field of a raw row", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          projectRow({
            invoice_id: 55,
            invoice: { invoice_no: "INV-0055" },
          }),
        ],
        meta: { total: "31" },
      },
    });

    const page = await fetchProjectExpenses("88", 1, 10);

    expect(page.total).toBe(31);
    expect(page.expenses).toEqual([
      {
        id: "901",
        date: "2026-09-14",
        description: "Timber",
        supplierName: "Bunnings",
        category: "Materials",
        jobId: "7",
        jobLabel: "Deck (J-7)",
        invoiceId: "55",
        invoiceNo: "INV-0055",
        invoiced: true,
        amount: 220,
      },
    ]);
  });

  it("uses the business amount when it's above zero, otherwise the whole price", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          projectRow({ id: 1, price: "220", business_amount: "150.50" }),
          projectRow({ id: 2, price: "220", business_amount: "0" }),
          projectRow({ id: 3, price: 99, business_amount: null }),
          projectRow({ id: 4, price: null, business_amount: undefined }),
        ],
      },
    });

    const { expenses } = await fetchProjectExpenses("88", 1, 10);

    expect(expenses.map((e) => e.amount)).toEqual([150.5, 220, 99, 0]);
  });

  it("counts an expense as invoiced from either invoice_id or is_invoiced", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          projectRow({ id: 1, invoice_id: 55, is_invoiced: 0 }),
          projectRow({ id: 2, invoice_id: null, is_invoiced: 1 }),
          projectRow({ id: 3, invoice_id: null, is_invoiced: "1" }),
          projectRow({ id: 4, invoice_id: null, is_invoiced: true }),
          projectRow({ id: 5, invoice_id: null, is_invoiced: 0 }),
          // A zero id is the server's "no invoice", not a real one.
          projectRow({ id: 6, invoice_id: 0, is_invoiced: false }),
        ],
      },
    });

    const { expenses } = await fetchProjectExpenses("88", 1, 10);

    expect(expenses.map((e) => e.invoiced)).toEqual([true, true, true, true, false, false]);
    expect(expenses[5].invoiceId).toBeNull();
  });

  it("labels the job by name alone without a code, and blank without a job", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          projectRow({ id: 1, projectJob: { job_name: "Deck", job_code: null } }),
          projectRow({ id: 2, project_job_id: null, projectJob: null }),
          // A code with no name is no label at all.
          projectRow({ id: 3, projectJob: { job_name: "", job_code: "J-9" } }),
        ],
      },
    });

    const { expenses } = await fetchProjectExpenses("88", 1, 10);

    expect(expenses.map((e) => e.jobLabel)).toEqual(["Deck", "", ""]);
    expect(expenses[1].jobId).toBeNull();
  });

  it("reads missing nested objects as blank strings", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 5 }],
      },
    });

    const { expenses } = await fetchProjectExpenses("88", 1, 10);

    expect(expenses[0]).toEqual({
      id: "5",
      date: "",
      description: "",
      supplierName: "",
      category: "",
      jobId: null,
      jobLabel: "",
      invoiceId: null,
      invoiceNo: "",
      invoiced: false,
      amount: 0,
    });
  });

  it("falls back to the row count when the response has no total", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [projectRow({ id: 1 }), projectRow({ id: 2 })], meta: null },
    });

    const page = await fetchProjectExpenses("88", 1, 10);

    expect(page.total).toBe(2);
  });

  it("treats a missing data array as an empty page", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });

    await expect(fetchProjectExpenses("88", 1, 10)).resolves.toEqual({ expenses: [], total: 0 });
  });

  it("throws the server's message on success:false, or a default without one", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "Project not found for user." } });
    await expect(fetchProjectExpenses("88", 1, 10)).rejects.toThrow("Project not found for user.");

    apiMock.get.mockResolvedValueOnce({ data: { success: false } });
    await expect(fetchProjectExpenses("88", 1, 10)).rejects.toThrow(
      "Couldn't load this project's expenses.",
    );
  });
});

/* ------------------------------------------------------------------ */

describe("the Expenses tab's stat cards", () => {
  it("reads every linked expense in one request rather than the page on screen", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [], meta: { total: 0 } } });

    await fetchProjectExpenseSummary("88");

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.projects.projectExpenseList}/88`, {
      params: { page: 1, limit: 1000 },
    });
  });

  it("totals invoiced and not-invoiced amounts across all rows", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          // Invoiced via invoice_id, split — counts its business share.
          projectRow({ id: 1, invoice_id: 55, price: "300", business_amount: "200" }),
          // Invoiced via the flag.
          projectRow({ id: 2, is_invoiced: 1, price: "49.50" }),
          // Not invoiced.
          projectRow({ id: 3, price: "100.25" }),
          projectRow({ id: 4, price: "10" }),
        ],
        meta: { total: 4 },
      },
    });

    const summary = await fetchProjectExpenseSummary("88");

    expect(summary).toEqual({
      count: 4,
      total: 359.75,
      invoiced: 249.5,
      invoicedCount: 2,
      notInvoiced: 110.25,
      notInvoicedCount: 2,
    });
  });

  it("is all zeros for a project with no expenses", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [], meta: { total: 0 } } });

    await expect(fetchProjectExpenseSummary("88")).resolves.toEqual({
      count: 0,
      total: 0,
      invoiced: 0,
      invoicedCount: 0,
      notInvoiced: 0,
      notInvoicedCount: 0,
    });
  });

  it("passes on the list's error", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Nope" } });

    await expect(fetchProjectExpenseSummary("88")).rejects.toThrow("Nope");
  });
});

/* ------------------------------------------------------------------ */

describe("fetching expenses not on any project", () => {
  it("GETs the expense list in project mode with the page and limit", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchUnassignedExpenses(3, 25);

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.projects.getProjectExpenses, {
      params: { page: 3, limit: 25, mode: "project" },
    });
  });

  it("maps each row, with the same business-amount-else-price rule", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 11,
            name: " Fuel ",
            price: "80",
            business_amount: "60",
            date: "2026-08-02",
            accountSubcategory: { name: "Motor vehicle" },
          },
          { id: 12, price: "45.5", business_amount: 0 },
        ],
        meta: { total: 40 },
      },
    });

    const result = await fetchUnassignedExpenses(1, 10);

    expect(result).toEqual({
      total: 40,
      expenses: [
        { id: "11", date: "2026-08-02", description: "Fuel", category: "Motor vehicle", amount: 60 },
        { id: "12", date: "", description: "", category: "", amount: 45.5 },
      ],
    });
  });

  it("falls back to the row count when the response has no total", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ id: 1 }] } });

    const result = await fetchUnassignedExpenses(1, 10);

    expect(result.total).toBe(1);
  });

  it("throws the server's message on success:false, or a default without one", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "Forbidden" } });
    await expect(fetchUnassignedExpenses(1, 10)).rejects.toThrow("Forbidden");

    apiMock.get.mockResolvedValueOnce({ data: { success: false } });
    await expect(fetchUnassignedExpenses(1, 10)).rejects.toThrow("Couldn't load your expenses.");
  });
});

/* ------------------------------------------------------------------ */

describe("assigning existing expenses to a project", () => {
  it("PATCHes an encrypted body with the project, expense ids and job", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true, message: "Done." } });

    const result = await assignExpensesToProjectApi({
      projectId: "88",
      expenseIds: ["901", "902"],
      projectJobId: "7",
    });

    expect(result).toEqual({ message: "Done." });
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.addExpenseToProject);
    // The controller reads only `decryptPayload(req.body.data)`.
    expect(Object.keys(body)).toEqual(["data"]);
    expect(decryptBody(body)).toEqual({
      projectId: "88",
      expenseIds: ["901", "902"],
      projectJobId: "7",
    });
  });

  it("leaves the job out entirely, rather than sending blank, when there's none", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });

    await assignExpensesToProjectApi({ projectId: "88", expenseIds: ["901"], projectJobId: null });

    const fields = decryptBody(apiMock.patch.mock.calls[0][1]);
    expect(fields).toEqual({ projectId: "88", expenseIds: ["901"] });
    expect(fields).not.toHaveProperty("projectJobId");
  });

  it("returns a default message when the server sends none", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });

    await expect(
      assignExpensesToProjectApi({ projectId: "88", expenseIds: ["901"], projectJobId: null }),
    ).resolves.toEqual({ message: "Expenses added to project successfully." });
  });

  it("throws the server's message on success:false, or a default without one", async () => {
    const input = { projectId: "88", expenseIds: ["901"], projectJobId: null };

    apiMock.patch.mockResolvedValueOnce({ data: { success: false, message: "Must pass at least one expense." } });
    await expect(assignExpensesToProjectApi(input)).rejects.toThrow("Must pass at least one expense.");

    apiMock.patch.mockResolvedValueOnce({ data: { success: false } });
    await expect(assignExpensesToProjectApi(input)).rejects.toThrow(
      "Couldn't add those expenses to the project.",
    );
  });
});

/* ------------------------------------------------------------------ */

describe("fetching a project's jobs", () => {
  it("GETs the first 100 jobs and labels each by name and code", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 7, job_name: "Deck", job_code: "J-7" },
          { id: 8, job_name: "Fence", job_code: "" },
          // No name: shown as a placeholder rather than an empty option.
          { id: 9, job_name: null, job_code: "J-9" },
        ],
      },
    });

    const jobs = await fetchProjectJobOptions("88");

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.projects.jobsListByProject}/88`, {
      params: { page: 1, limit: 100 },
    });
    expect(jobs).toEqual([
      { id: "7", label: "Deck (J-7)" },
      { id: "8", label: "Fence" },
      { id: "9", label: "Untitled job" },
    ]);
  });

  it("returns no jobs, rather than throwing, on success:false", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Nope" } });

    await expect(fetchProjectJobOptions("88")).resolves.toEqual([]);
  });

  it("returns no jobs when the response has no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });

    await expect(fetchProjectJobOptions("88")).resolves.toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

describe("creating an expense on a project", () => {
  it("POSTs the full field set with the project and job link, flags as 1/0", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1234 } } });

    const result = await createProjectExpenseApi({
      draft: draft({ paymentMethod: "Cash" }),
      files: [],
      projectId: "88",
      projectJobId: "7",
    });

    expect(result).toEqual({ id: "1234" });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.addV2);
    // No files: a plain `{ data }` envelope rather than FormData.
    expect(body).not.toBeInstanceOf(FormData);
    expect(decryptBody(body)).toEqual({
      name: "Timber for deck",
      price: 220,
      date: "2026-10-01",
      account_subcategory_id: "57",
      client_id: "12",
      contact_id: "34",
      gst: 1,
      paid_with_cash: 1,
      is_split: 0,
      business_amount: "220.00",
      personal_amount: "0.00",
      project_id: "88",
      project_job_id: "7",
      transaction_date: "2026-10-01",
      is_asset: "no",
    });
  });

  it("splits the amount into business and personal portions when split is on", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    await createProjectExpenseApi({
      draft: draft({ amount: 220, splitEnabled: true, businessAmount: 150.5, gst: false }),
      files: [],
      projectId: "88",
      projectJobId: null,
    });

    const fields = decryptBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({
      gst: 0,
      paid_with_cash: 0,
      is_split: 1,
      business_amount: "150.50",
      personal_amount: "69.50",
    });
  });

  it("never sends a negative personal amount when the business share exceeds the total", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    await createProjectExpenseApi({
      draft: draft({ amount: 100, splitEnabled: true, businessAmount: 120 }),
      files: [],
      projectId: "88",
      projectJobId: null,
    });

    const fields = decryptBody(apiMock.post.mock.calls[0][1]);
    expect(fields.personal_amount).toBe("0.00");
    expect(fields.business_amount).toBe("120.00");
  });

  it("leaves absent ids out rather than sending them as blank strings", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });

    await createProjectExpenseApi({
      draft: draft({ supplierId: null, contactId: null, categoryId: "" }),
      files: [],
      projectId: "88",
      projectJobId: null,
    });

    const fields = decryptBody(apiMock.post.mock.calls[0][1]);
    for (const key of ["client_id", "contact_id", "account_subcategory_id", "project_job_id"]) {
      expect(fields).not.toHaveProperty(key);
    }
    expect(Object.values(fields)).not.toContain("");
    expect(fields.project_id).toBe("88");
  });

  it("sends receipts as files[] in FormData beside the encrypted fields", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    const receipt = new File(["%PDF"], "receipt.pdf", { type: "application/pdf" });
    const photo = new File(["jpg"], "photo.jpg", { type: "image/jpeg" });

    await createProjectExpenseApi({
      draft: draft(),
      files: [receipt, photo],
      projectId: "88",
      projectJobId: "7",
    });

    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect(body).toBeInstanceOf(FormData);
    const files = body.getAll("files[]") as File[];
    expect(files.map((file) => file.name)).toEqual(["receipt.pdf", "photo.jpg"]);
    expect(decryptBody(body)).toMatchObject({ project_id: "88", project_job_id: "7" });
  });

  it("sends a single receipt as files[] too, not under its own field name", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    const receipt = new File(["%PDF"], "receipt.pdf", { type: "application/pdf" });

    await createProjectExpenseApi({ draft: draft(), files: [receipt], projectId: "88", projectJobId: null });

    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect((body.getAll("files[]") as File[]).map((file) => file.name)).toEqual(["receipt.pdf"]);
  });

  it("fires the expense-logged event the main expense form fires", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    const receipt = new File(["x"], "r.png", { type: "image/png" });

    await createProjectExpenseApi({
      draft: draft({ amount: 220, gst: true, paymentMethod: "Cash", splitEnabled: true, businessAmount: 100 }),
      files: [receipt],
      projectId: "88",
      projectJobId: null,
    });

    expect(trackMock).toHaveBeenCalledWith(EVENTS.EXPENSE_LOGGED, {
      amount: 220,
      has_receipt: true,
      has_gst: true,
      payment_method: "Cash",
      is_split: true,
    });
  });

  it("throws without an id in the response, and doesn't track it", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await expect(
      createProjectExpenseApi({ draft: draft(), files: [], projectId: "88", projectJobId: null }),
    ).rejects.toThrow("Failed to save expense.");

    apiMock.post.mockResolvedValueOnce({ data: { success: false, message: "Required data missing" } });
    await expect(
      createProjectExpenseApi({ draft: draft(), files: [], projectId: "88", projectJobId: null }),
    ).rejects.toThrow("Required data missing");

    expect(trackMock).not.toHaveBeenCalled();
  });

  it("accepts an id of 0 as a real id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 0 } } });

    await expect(
      createProjectExpenseApi({ draft: draft(), files: [], projectId: "88", projectJobId: null }),
    ).resolves.toEqual({ id: "0" });
  });
});

/* ------------------------------------------------------------------ */

describe("editing an expense on a project", () => {
  it("POSTs the id and fields, keeping the project link and leaving the job alone", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await updateProjectExpenseApi({ id: "901", draft: draft(), projectId: "88" });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.expense.updateV2);
    const fields = decryptBody(body);
    expect(fields).toEqual({
      id: "901",
      name: "Timber for deck",
      price: 220,
      date: "2026-10-01",
      account_subcategory_id: "57",
      client_id: "12",
      contact_id: "34",
      gst: 1,
      paid_with_cash: 0,
      is_split: 0,
      business_amount: "220.00",
      personal_amount: "0.00",
      // Not null: `lib/expenses.ts`'s mapper sends null, which unlinks it.
      project_id: "88",
      transaction_date: "2026-10-01",
      is_asset: "no",
    });
    expect(fields).not.toHaveProperty("project_job_id");
  });

  it("throws the server's message on success:false, or a default without one", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: false, message: "Expense not found." } });
    await expect(updateProjectExpenseApi({ id: "901", draft: draft(), projectId: "88" })).rejects.toThrow(
      "Expense not found.",
    );

    apiMock.post.mockResolvedValueOnce({ data: { success: false } });
    await expect(updateProjectExpenseApi({ id: "901", draft: draft(), projectId: "88" })).rejects.toThrow(
      "Failed to update expense.",
    );
  });
});

describe("the project form's hidden category", () => {
  it("is category 181, as a string to compare with category ids", () => {
    expect(PROJECT_HIDDEN_CATEGORY_ID).toBe("181");
  });
});

/* ------------------------------------------------------------------ */

describe("converting a project expense to an invoice", () => {
  const expense = {
    id: "901",
    date: "2026-09-14",
    description: "Timber",
    supplierName: "Bunnings",
    category: "Materials",
    jobId: "7",
    jobLabel: "Deck (J-7)",
    invoiceId: null,
    invoiceNo: "",
    invoiced: false,
    amount: 150.5,
  };

  it("seeds one GST-free line at the amount, for the project's client", () => {
    const seed = invoiceSeedFromProjectExpense(expense, PROJECT);

    expect(seed).toEqual({
      description: "Timber",
      items: [
        expect.objectContaining({
          description: "Timber",
          quantity: "1",
          price: "150.50",
          // The amount already includes GST paid; a taxable line would charge it twice.
          gst: false,
        }),
      ],
      clientId: "12",
      clientName: "Harper & Co",
      projectId: "88",
    });
    expect(seed.items).toHaveLength(1);
    expect(seed.items[0].id).toEqual(expect.any(String));
  });

  it("falls back to 'Expense' without a description and to the project name without a client name", () => {
    const seed = invoiceSeedFromProjectExpense(
      { ...expense, description: "" },
      { ...PROJECT, clientId: null, clientName: "" },
    );

    expect(seed.description).toBe("Expense");
    expect(seed.items[0].description).toBe("Expense");
    expect(seed.clientId).toBeNull();
    expect(seed.clientName).toBe("Harper deck");
  });
});

/* ------------------------------------------------------------------ */

describe("page info for the paged list", () => {
  it("gives the 1-based range for a middle page", () => {
    expect(pageInfo(2, 10, 42)).toEqual({ page: 2, pageCount: 5, total: 42, from: 11, to: 20 });
  });

  it("ends the last page at the total", () => {
    expect(pageInfo(5, 10, 42)).toEqual({ page: 5, pageCount: 5, total: 42, from: 41, to: 42 });
  });

  it("clamps a page past the end or below 1 into range", () => {
    expect(pageInfo(9, 10, 42).page).toBe(5);
    expect(pageInfo(0, 10, 42)).toMatchObject({ page: 1, from: 1, to: 10 });
  });

  it("shows one empty page with zeroed bounds when there's nothing", () => {
    expect(pageInfo(3, 10, 0)).toEqual({ page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
  });
});

/* ------------------------------------------------------------------ */

describe("viewing a project expense", () => {
  /** A `GET /v2/expense/:id` payload as the v2 service builds it. */
  function viewResponse(overrides: Record<string, unknown> = {}) {
    return {
      data: {
        success: true,
        data: {
          name: " Timber ",
          date: "2026-09-14",
          account_subcategory: { name: "Materials" },
          client: { name: "Bunnings" },
          sub_total: 200,
          total_gst: 20,
          total_price: 220,
          // The v2 service sends the business share as `price` here.
          price: 220,
          is_split: 0,
          business_amount: 220,
          personal_amount: 0,
          paid_with_cash: 0,
          image: null,
          image_type: "",
          documents: [],
          ...overrides,
        },
      },
    };
  }

  it("GETs the expense's info route", async () => {
    apiMock.get.mockResolvedValue(viewResponse());

    await fetchProjectExpenseView("901");

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.expense.info}901`);
  });

  it("maps every field of an unsplit expense", async () => {
    apiMock.get.mockResolvedValue(viewResponse());

    await expect(fetchProjectExpenseView("901")).resolves.toEqual({
      name: "Timber",
      date: "2026-09-14",
      category: "Materials",
      supplier: "Bunnings",
      subTotal: 200,
      gst: 20,
      totalPrice: 220,
      isSplit: false,
      businessAmount: 220,
      personalAmount: 0,
      paidWithCash: false,
      files: [],
    });
  });

  it("parses amounts sent as strings", async () => {
    apiMock.get.mockResolvedValue(
      viewResponse({ sub_total: "100.10", total_gst: "10.01", total_price: "110.11", price: "110.11" }),
    );

    const view = await fetchProjectExpenseView("901");

    expect(view).toMatchObject({ subTotal: 100.1, gst: 10.01, totalPrice: 110.11 });
  });

  it("falls back to price for the total when total_price is absent or blank", async () => {
    apiMock.get.mockResolvedValueOnce(viewResponse({ total_price: undefined, price: 99 }));
    expect((await fetchProjectExpenseView("901")).totalPrice).toBe(99);

    apiMock.get.mockResolvedValueOnce(viewResponse({ total_price: "", price: "45.5" }));
    expect((await fetchProjectExpenseView("901")).totalPrice).toBe(45.5);

    apiMock.get.mockResolvedValueOnce(viewResponse({ total_price: "abc", price: 12 }));
    expect((await fetchProjectExpenseView("901")).totalPrice).toBe(12);
  });

  it("keeps a real zero total rather than falling back to price", async () => {
    apiMock.get.mockResolvedValue(viewResponse({ total_price: 0, price: 50 }));

    expect((await fetchProjectExpenseView("901")).totalPrice).toBe(0);
  });

  it("reads missing values as null, not zero, so they show as '-'", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });

    await expect(fetchProjectExpenseView("901")).resolves.toEqual({
      name: "",
      date: "",
      category: "",
      supplier: "",
      subTotal: null,
      gst: null,
      totalPrice: null,
      isSplit: false,
      businessAmount: null,
      personalAmount: null,
      paidWithCash: false,
      files: [],
    });
  });

  it("reads non-numeric amounts as null", async () => {
    apiMock.get.mockResolvedValue(viewResponse({ sub_total: "n/a", total_gst: null, personal_amount: "" }));

    const view = await fetchProjectExpenseView("901");

    expect(view).toMatchObject({ subTotal: null, gst: null, personalAmount: null });
  });

  describe("split detection", () => {
    it("is split when flagged, as a number, string or boolean", async () => {
      for (const flag of [1, "1", true]) {
        apiMock.get.mockResolvedValueOnce(viewResponse({ is_split: flag }));
        expect((await fetchProjectExpenseView("901")).isSplit).toBe(true);
      }
    });

    it("is split when unflagged but the business share is below the total", async () => {
      apiMock.get.mockResolvedValue(
        viewResponse({ is_split: 0, total_price: 220, price: 150, business_amount: 150, personal_amount: 70 }),
      );

      const view = await fetchProjectExpenseView("901");

      expect(view).toMatchObject({
        isSplit: true,
        totalPrice: 220,
        // `price` is the business share in the v2 info response
        // (`effectivePrice` in services/v2/expense.js), which is what
        // ExpensesInfo.js shows as "Price (Business)".
        businessAmount: 150,
        personalAmount: 70,
      });
    });

    it("compares the business share against price when there's no total_price", async () => {
      apiMock.get.mockResolvedValue(viewResponse({ is_split: 0, total_price: null, price: 220, business_amount: 100 }));

      expect((await fetchProjectExpenseView("901")).isSplit).toBe(true);
    });

    it("isn't split when the business share equals or exceeds the total", async () => {
      apiMock.get.mockResolvedValueOnce(viewResponse({ is_split: 0, total_price: 220, business_amount: 220 }));
      expect((await fetchProjectExpenseView("901")).isSplit).toBe(false);

      apiMock.get.mockResolvedValueOnce(viewResponse({ is_split: 0, total_price: 220, business_amount: 300 }));
      expect((await fetchProjectExpenseView("901")).isSplit).toBe(false);
    });

    it("isn't split with no business share, or with no total to compare against", async () => {
      apiMock.get.mockResolvedValueOnce(viewResponse({ is_split: 0, total_price: 220, business_amount: 0 }));
      expect((await fetchProjectExpenseView("901")).isSplit).toBe(false);

      apiMock.get.mockResolvedValueOnce(
        viewResponse({ is_split: null, total_price: null, price: null, business_amount: 50 }),
      );
      expect((await fetchProjectExpenseView("901")).isSplit).toBe(false);
    });
  });

  it("reads paid_with_cash as 1, '1' or true", async () => {
    const cases: [unknown, boolean][] = [
      [1, true],
      ["1", true],
      [true, true],
      [0, false],
      ["0", false],
      [false, false],
      [null, false],
    ];
    for (const [value, expected] of cases) {
      apiMock.get.mockResolvedValueOnce(viewResponse({ paid_with_cash: value }));
      expect((await fetchProjectExpenseView("901")).paidWithCash).toBe(expected);
    }
  });

  describe("files", () => {
    it("lists the receipt image first, then each document", async () => {
      apiMock.get.mockResolvedValue(
        viewResponse({
          image: "https://cdn.example.com/receipt.JPG",
          image_type: "",
          documents: [
            { file_path: "https://cdn.example.com/invoice.pdf", file_name: " Supplier invoice " },
            { file_path: "https://cdn.example.com/site.webp?sig=abc", file_name: "Site photo" },
          ],
        }),
      );

      const { files } = await fetchProjectExpenseView("901");

      expect(files).toEqual([
        { url: "https://cdn.example.com/receipt.JPG", name: "Receipt", isImage: true },
        { url: "https://cdn.example.com/invoice.pdf", name: "Supplier invoice", isImage: false },
        // A query string after the extension still counts as an image.
        { url: "https://cdn.example.com/site.webp?sig=abc", name: "Site photo", isImage: true },
      ]);
    });

    it("treats the receipt as an image when image_type says so, whatever its extension", async () => {
      apiMock.get.mockResolvedValueOnce(viewResponse({ image: "https://cdn.example.com/blob", image_type: "image" }));
      expect((await fetchProjectExpenseView("901")).files[0].isImage).toBe(true);

      apiMock.get.mockResolvedValueOnce(viewResponse({ image: "https://cdn.example.com/r.pdf", image_type: "pdf" }));
      expect((await fetchProjectExpenseView("901")).files[0].isImage).toBe(false);
    });

    it("takes a document's URL from file_path, then file_url, then url, or a bare string", async () => {
      apiMock.get.mockResolvedValue(
        viewResponse({
          documents: [
            { file_path: "https://a/one.png", file_url: "https://a/ignored.png" },
            { file_url: "https://a/two.gif" },
            { url: "https://a/three.jpeg" },
            "https://a/four.pdf",
          ],
        }),
      );

      const { files } = await fetchProjectExpenseView("901");

      expect(files).toEqual([
        { url: "https://a/one.png", name: "Document 1", isImage: true },
        { url: "https://a/two.gif", name: "Document 2", isImage: true },
        { url: "https://a/three.jpeg", name: "Document 3", isImage: true },
        { url: "https://a/four.pdf", name: "Document 4", isImage: false },
      ]);
    });

    it("skips documents with no URL and the one that repeats the receipt", async () => {
      apiMock.get.mockResolvedValue(
        viewResponse({
          image: "https://a/receipt.png",
          documents: [
            { file_path: "https://a/receipt.png", file_name: "Duplicate" },
            { file_path: null, file_name: "Nothing" },
            "",
            { file_path: "https://a/kept.pdf", file_name: "  " },
          ],
        }),
      );

      const { files } = await fetchProjectExpenseView("901");

      expect(files.map((file) => file.url)).toEqual(["https://a/receipt.png", "https://a/kept.pdf"]);
      // A blank file name falls back to the document's position in the
      // server's list — skipped entries still count towards that number.
      expect(files[1].name).toBe("Document 4");
    });

    it("is empty without a receipt or documents", async () => {
      apiMock.get.mockResolvedValue(viewResponse({ image: "", documents: null }));

      expect((await fetchProjectExpenseView("901")).files).toEqual([]);
    });
  });

  it("throws the server's message on success:false, or a default without one", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "Don't have permission to do this action." } });
    await expect(fetchProjectExpenseView("901")).rejects.toThrow("Don't have permission to do this action.");

    apiMock.get.mockResolvedValueOnce({ data: { success: false } });
    await expect(fetchProjectExpenseView("901")).rejects.toThrow("Expense not found.");
  });

  it("throws when a successful response carries no expense", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: null } });

    await expect(fetchProjectExpenseView("901")).rejects.toThrow("Expense not found.");
  });
});
