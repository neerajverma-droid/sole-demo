/**
 * The parts of the shared tabular-report engine `lib/report-table.test.ts`
 * doesn't reach: `downloadTabularReport`, Chart of Accounts' drill-down
 * (`fetchAccountDetail`), and the per-report `report_type_id` table from
 * `docs/testing-coverage-reporting-suite.md`'s quick reference.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const { downloadTabularReport } = await import("@/lib/report-table");
const {
  assetListingConfig,
  auditTrailConfig,
  cashFlowConfig,
  chartOfAccountsConfig,
  customerSupplierConfig,
  CUSTOMER_SUPPLIER_TABS,
  fetchAccountDetail,
} = await import("@/lib/report-configs");

/** The browser bits a download touches — no DOM in this repo's node env. */
function stubBrowser() {
  const link = { href: "", setAttribute: vi.fn(), click: vi.fn() };
  const createObjectURL = vi.fn(() => "blob:report");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("window", { URL: { createObjectURL, revokeObjectURL } });
  vi.stubGlobal("document", {
    createElement: vi.fn(() => link),
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
  });
  return { link, createObjectURL, revokeObjectURL };
}

function formFields(form: FormData): Record<string, string> {
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadTabularReport", () => {
  const range = { from: "2026-07-01", to: "2026-09-30" };

  it("posts action=download as plain multipart, asking for a blob", async () => {
    const { link, revokeObjectURL } = stubBrowser();
    apiMock.post.mockResolvedValue({ data: "pdf-bytes", headers: {} });

    await downloadTabularReport("3", range, "pdf", "Asset listing");

    const [url, form, config] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.reporting.reports);
    expect(form).toBeInstanceOf(FormData);
    expect(formFields(form)).toEqual({
      report_type_id: "3",
      action: "download",
      start_date: "2026-07-01",
      end_date: "2026-09-30",
      format: "pdf",
    });
    expect(config).toEqual({ responseType: "blob" });
    expect(link.setAttribute).toHaveBeenCalledWith("download", "Asset listing.pdf");
    expect(link.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  it("names the file from Content-Disposition when the server sends one", async () => {
    const { link } = stubBrowser();
    apiMock.post.mockResolvedValue({
      data: "csv",
      headers: { "content-disposition": 'attachment; filename="cash-flow-Q1.csv"' },
    });

    await downloadTabularReport("11", range, "csv", "Cash flow");

    expect(link.setAttribute).toHaveBeenCalledWith("download", "cash-flow-Q1.csv");
  });

  it("leaves format unsent for xlsx — the server's own default", async () => {
    stubBrowser();
    apiMock.post.mockResolvedValue({ data: "x", headers: {} });

    await downloadTabularReport("10", range, "xlsx", "Chart of accounts");

    expect(formFields(apiMock.post.mock.calls[0][1])).not.toHaveProperty("format");
  });

  it("passes non-empty extras through and drops empty ones", async () => {
    stubBrowser();
    apiMock.post.mockResolvedValue({ data: "x", headers: {} });

    await downloadTabularReport("9", range, "csv", "Customers", {
      recordType: "Invoice",
      section: "",
    });

    const fields = formFields(apiMock.post.mock.calls[0][1]);
    expect(fields.recordType).toBe("Invoice");
    expect(fields).not.toHaveProperty("section");
  });
});

describe("fetchAccountDetail", () => {
  const DETAIL = {
    account: { subcategory_id: 42, code: "200", name: "Sales", category: "Income" },
    gst_treatment: {
      source: "journal_lines",
      entries: 10,
      with_gst: 7,
      without_gst: 3,
      gst_percentage: 70,
      label: "Mixed (70% GST)",
    },
    activity: { net_amount: 1200, first_posted: "2026-01-01", last_posted: null },
  };

  it("GETs /report/account/{Subcategory Id} and returns the data as sent", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: DETAIL } });

    expect(await fetchAccountDetail("42")).toEqual(DETAIL);
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.reporting.account}/42`);
  });

  it("encodes the id into the path", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: DETAIL } });
    await fetchAccountDetail("4/2");
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.reporting.account}/4%2F2`);
  });

  it("throws the server's message, or a default, when there's nothing to show", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "No such account" } });
    await expect(fetchAccountDetail("42")).rejects.toThrow("No such account");

    apiMock.get.mockResolvedValue({ data: { success: true } });
    await expect(fetchAccountDetail("42")).rejects.toThrow("Account not found.");
  });
});

describe("report_type_id per report", () => {
  it("matches the documented ids, always as strings", () => {
    expect(assetListingConfig.reportTypeId).toBe("3");
    expect(chartOfAccountsConfig.reportTypeId).toBe("10");
    expect(cashFlowConfig.reportTypeId).toBe("11");
    for (const tab of CUSTOMER_SUPPLIER_TABS) {
      expect(customerSupplierConfig(tab).reportTypeId).toBe("9");
    }
  });

  it("gives Audit Trail no report type, so neither download nor send is offered", () => {
    expect(auditTrailConfig.reportTypeId).toBeUndefined();
    expect(auditTrailConfig.dated).toBe(false);
    expect(auditTrailConfig.periods).toEqual([]);
  });

  it("tones Asset Listing's Matched badge: Yes → success, otherwise warning", () => {
    const matched = assetListingConfig.columns.find((c) => c.key === "Matched");
    expect(matched?.format).toBe("badge");
    expect(matched?.tone?.("Yes")).toBe("success");
    expect(matched?.tone?.("No")).toBe("warning");
  });
});
