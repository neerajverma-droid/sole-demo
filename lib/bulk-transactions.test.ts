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
const {
  firstSoleFieldError,
  soleFieldIssue,
  toUploadRows,
  uploadBulkTransactions,
  validateBulkTransactions,
} = await import("@/lib/bulk-transactions");

type BulkRow = Awaited<
  ReturnType<typeof validateBulkTransactions>
>[number];

/** Decrypts whatever body a call sent — this endpoint takes a bare `{data}`. */
function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not a {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** A row as the wizard submits it: parsed, uncategorised, nothing matched. */
function plainRow(overrides: Partial<BulkRow> = {}): BulkRow {
  return {
    type: "credit",
    transaction_date: "2025-07-20",
    amount: 1120,
    description: "Stripe payout",
    account_subcategory_id: 0,
    gst_include: true,
    ...overrides,
  };
}

/** A row a matching rule categorised and resolved in full. */
function matchedRow(overrides: Partial<BulkRow> = {}): BulkRow {
  return plainRow({
    account_subcategory_id: 51,
    account_subcategory: {
      account_subcategory_id: 51,
      name: "Sales income",
      capital: false,
    },
    client: { id: 7, name: "Acme" },
    client_id: 7,
    contact_id: 12,
    name: "",
    ...overrides,
  });
}

describe("validateBulkTransactions", () => {
  it("posts type 'validate' with the rows, encrypted", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { transactions: [matchedRow()] } },
    });

    const result = await validateBulkTransactions([plainRow()]);

    expect(apiMock.post.mock.calls[0][0]).toBe(
      apiRoutes.bulkTransaction.bulkInsert,
    );
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.type).toBe("validate");
    expect(fields.transaction_data).toHaveLength(1);
    expect(result[0].account_subcategory_id).toBe(51);
  });

  it("throws with the server's own message when validation is refused", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Transaction type must be provided" },
    });
    await expect(validateBulkTransactions([plainRow()])).rejects.toThrow(
      "Transaction type must be provided",
    );
  });
});

describe("soleFieldIssue", () => {
  it("passes a row with no account — that's a plain unmatched import", () => {
    expect(soleFieldIssue(plainRow())).toBeNull();
  });

  it("passes a fully resolved match", () => {
    expect(soleFieldIssue(matchedRow())).toBeNull();
  });

  it("names the missing party, in the row's own language", () => {
    expect(
      soleFieldIssue(
        matchedRow({ client: null, client_id: null, contact_id: null }),
      ),
    ).toBe("Select a client, or clear the account.");

    expect(
      soleFieldIssue(
        matchedRow({
          type: "debit",
          client: null,
          client_id: null,
          contact_id: null,
        }),
      ),
    ).toBe("Select a supplier, or clear the account.");
  });

  it("asks a matched debit for an asset/expense name", () => {
    expect(soleFieldIssue(matchedRow({ type: "debit", name: "  " }))).toBe(
      "Enter an asset/expense name, or clear the account.",
    );
    expect(
      soleFieldIssue(matchedRow({ type: "debit", name: "Studio rent" })),
    ).toBeNull();
  });

  it("refuses a capital row that carries a client — the backend does too", () => {
    const capital = matchedRow({
      account_subcategory: {
        account_subcategory_id: 90,
        name: "Owner drawings",
        capital: true,
      },
      account_subcategory_id: 90,
    });
    expect(soleFieldIssue(capital)).toBe(
      "A capital account can't carry a client, supplier or name.",
    );

    expect(
      soleFieldIssue({
        ...capital,
        client: null,
        client_id: null,
        contact_id: null,
        name: "",
      }),
    ).toBeNull();
  });
});

describe("firstSoleFieldError", () => {
  it("names the first offending row, numbered from one", () => {
    expect(
      firstSoleFieldError([
        plainRow(),
        matchedRow({ client: null, client_id: null, contact_id: null }),
      ]),
    ).toBe("Row 2: Select a client, or clear the account.");
  });

  it("is null when every row would survive the upload", () => {
    expect(firstSoleFieldError([plainRow(), matchedRow()])).toBeNull();
  });
});

describe("toUploadRows", () => {
  it("sends an unmatched row with no account and nothing else", () => {
    expect(toUploadRows([plainRow()])[0]).toEqual({
      type: "credit",
      transaction_date: "2025-07-20",
      amount: 1120,
      description: "Stripe payout",
      account_subcategory_id: 0,
      gst_include: true,
    });
  });

  it("puts the ids inside `client`, where the backend reads them", () => {
    const [row] = toUploadRows([matchedRow()]);
    expect(row.account_subcategory_id).toBe(51);
    // `normalizeBulkTransactionRow` reads `txData.client?.client_id`, not the
    // top-level fields the validate response puts beside it.
    expect(row.client).toMatchObject({ client_id: 7, contact_id: 12 });
  });

  it("strips client and name off a capital row", () => {
    const [row] = toUploadRows([
      matchedRow({
        account_subcategory: {
          account_subcategory_id: 90,
          name: "Owner drawings",
          capital: true,
        },
        account_subcategory_id: 90,
        name: "leftover",
      }),
    ]);
    expect(row.account_subcategory_id).toBe(90);
    expect(row.client).toBeNull();
    expect(row.name).toBe("");
  });

  it("keeps the GST flag the Sole Fields step set", () => {
    expect(toUploadRows([plainRow({ gst_include: false })])[0].gst_include).toBe(
      false,
    );
  });
});

describe("uploadBulkTransactions", () => {
  it("posts type 'upload' and reports the server's counts", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          data: {
            success_transactions: 8,
            failed_transactions: 2,
            total_transactions: 10,
          },
        },
      },
    });

    const result = await uploadBulkTransactions([plainRow()]);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.type).toBe("upload");
    expect(result).toEqual({ succeeded: 8, failed: 2, total: 10 });
  });

  it("falls back to every row landing when no counts come back", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    expect(await uploadBulkTransactions([plainRow(), plainRow()])).toEqual({
      succeeded: 2,
      failed: 0,
      total: 2,
    });
  });

  it("surfaces the offending rows when the batch is rejected", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: false,
        message: "Cannot upload: 1 transaction(s) have validation errors.",
        data: {
          transactions: [
            { ...plainRow(), is_valid: true },
            {
              ...plainRow(),
              is_valid: false,
              errors: ["Transaction date cannot be in the future"],
            },
          ],
        },
      },
    });

    await expect(uploadBulkTransactions([plainRow()])).rejects.toThrow(
      /Row 2: Transaction date cannot be in the future/,
    );
  });
});
