import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so the module's own `import api from
// "@/utils/axiosInstance"` resolves to the mock above.
const { createBulkAssets, createBulkExpenses, createBulkInvoices } =
  await import("@/lib/bulk-records");

/** Decrypts whatever body a call sent — these endpoints take a bare `{data}`. */
function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not a {data} envelope");
  }
  return decryptPayload(asData.data);
}

// The rows' shape is irrelevant to the client — it posts them as given.
type AnyRows = never[];
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Row ${i + 1}` })) as unknown as AnyRows;

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([
  ["createBulkInvoices", createBulkInvoices, apiRoutes.invoice.bulkCreate, "invoices"],
  ["createBulkExpenses", createBulkExpenses, apiRoutes.expense.bulkCreate, "expenses"],
  ["createBulkAssets", createBulkAssets, apiRoutes.asset.bulkCreate, "assets"],
] as const)("%s", (_name, create, url, key) => {
  it(`POSTs the rows encrypted under "${key}" to its bulk/create route`, async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: [{}, {}] } });

    await create(rows(2));

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = apiMock.post.mock.calls[0];
    expect(calledUrl).toBe(url);
    // Encrypted, not posted in the clear.
    expect(Object.keys(body)).toEqual(["data"]);
    expect(decryptedFieldsFromBody(body)).toEqual({
      [key]: [{ name: "Row 1" }, { name: "Row 2" }],
    });
  });

  it("refuses an empty batch before sending anything", async () => {
    await expect(create([])).rejects.toThrow("There are no rows to import.");
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe("the shared result/err handling", () => {
  it("counts created from the echoed array, the rest as failed, never skipped", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, message: "2 invoices created successfully", data: [{}, {}] },
    });

    const result = await createBulkInvoices(rows(3));

    expect(result).toEqual({ created: 2, failed: 1, skipped: 0 });
    expect(result).not.toHaveProperty("rows");
  });

  it("reads a 2xx with no echoed array as the whole batch landing", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, message: "Done" } });

    expect(await createBulkExpenses(rows(4))).toEqual({ created: 4, failed: 0, skipped: 0 });
  });

  it("treats a missing success flag as success, not failure", async () => {
    apiMock.post.mockResolvedValue({ data: { data: [{}] } });

    expect(await createBulkAssets(rows(1))).toEqual({ created: 1, failed: 0, skipped: 0 });
  });

  it("never reports negative failures when the server echoes more than was sent", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: [{}, {}, {}] } });

    expect((await createBulkAssets(rows(2))).failed).toBe(0);
  });

  it("throws the server's message on success: false", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "invoices array is required", error: "ignored" },
    });

    await expect(createBulkInvoices(rows(1))).rejects.toThrow("invoices array is required");
  });

  it("falls back to the error field, then a generic message", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: false, error: "Row 3 bad date" } });
    await expect(createBulkExpenses(rows(1))).rejects.toThrow("Row 3 bad date");

    apiMock.post.mockResolvedValueOnce({ data: { success: false } });
    await expect(createBulkExpenses(rows(1))).rejects.toThrow("The import failed.");
  });

  it("lets a transport error propagate as-is", async () => {
    const error = new Error("Network Error");
    apiMock.post.mockRejectedValue(error);

    await expect(createBulkAssets(rows(1))).rejects.toBe(error);
  });
});
