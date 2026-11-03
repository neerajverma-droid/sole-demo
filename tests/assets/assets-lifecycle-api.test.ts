/**
 * The asset API surface `lib/assets.test.ts` doesn't reach: insurance,
 * disposal, the brand/type registry, the depreciation delete/save-failure
 * paths, the single-asset fetch, the ZIP download's blob-wrapped error, and
 * OCR capture.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

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

const {
  fetchAssetInsurance,
  createAssetInsuranceApi,
  updateAssetInsuranceApi,
  deleteAssetInsuranceApi,
  sendAssetInsuranceReportApi,
  newAssetInsurance,
  fetchAssetDisposal,
  recordAssetDisposalApi,
  deleteAssetDisposalApi,
  fetchAssetRegistry,
  createAssetBrandApi,
  createAssetTypeApi,
  saveAssetDepreciationApi,
  deleteAssetDepreciationApi,
  fetchAssetDetails,
  downloadAssetsApi,
  extractAssetApi,
  EMPTY_DEPRECIATION,
} = await import("@/lib/assets");

beforeEach(() => {
  vi.resetAllMocks();
});

const API_POLICY = {
  id: 9,
  insurer_name: "NRMA",
  policy_number: "POL-1",
  insurer_email: "claims@nrma.test",
  broker_name: null,
  broker_phone: null,
  coverage_amount: 50000,
  premium_amount: null,
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  notes: null,
};

describe("insurance", () => {
  it("maps every policy on file, with nulls read as empty strings", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [API_POLICY] } });

    const policies = await fetchAssetInsurance("42");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.asset.insurance.byAsset + "42");
    expect(policies).toEqual([
      {
        id: "9",
        insurerName: "NRMA",
        policyNumber: "POL-1",
        insurerEmail: "claims@nrma.test",
        brokerName: "",
        brokerPhone: "",
        coverageAmount: "50000",
        premiumAmount: "",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        notes: "",
      },
    ]);
  });

  it("returns an empty list, never throws, when there's no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchAssetInsurance("42")).toEqual([]);
  });

  it("creates with the asset id in the body, sending blank amounts as 0 / null", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: API_POLICY } });
    const record = { ...newAssetInsurance(), insurerName: "NRMA", startDate: "2026-01-01" };

    const created = await createAssetInsuranceApi("42", record);

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.asset.insurance.create, {
      asset_id: "42",
      insurer_name: "NRMA",
      policy_number: "",
      insurer_email: "",
      broker_name: "",
      broker_phone: "",
      coverage_amount: 0,
      premium_amount: null,
      start_date: "2026-01-01",
      end_date: "",
      notes: "",
    });
    expect(created.id).toBe("9");
  });

  it("throws the server's message when a create fails", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "End date before start" } });
    await expect(createAssetInsuranceApi("42", newAssetInsurance())).rejects.toThrow(
      "End date before start",
    );
  });

  it("updates with PATCH, addressed by the record's own id", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true, data: API_POLICY } });
    const record = { ...newAssetInsurance(), id: "9", coverageAmount: "50000", premiumAmount: "1200" };

    await updateAssetInsuranceApi(record);

    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.asset.insurance.update + "9");
    expect(body).not.toHaveProperty("asset_id");
    expect(body).toMatchObject({ coverage_amount: "50000", premium_amount: "1200" });
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("deletes one record at a time", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteAssetInsuranceApi("9");
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.asset.insurance.delete + "9");
  });

  it("sends the report to /{id}/send, and surfaces failure", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await sendAssetInsuranceReportApi("9");
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.asset.insurance.send + "9/send");

    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(sendAssetInsuranceReportApi("9")).rejects.toThrow("Failed to send the report.");
  });

  it("gives every blank policy its own id", () => {
    expect(newAssetInsurance().id).not.toBe(newAssetInsurance().id);
  });
});

describe("disposal", () => {
  it("maps a disposal record", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { disposed_date: "2026-03-31", sale_value: 1500, suggested_sale_value: "1800.00" },
      },
    });

    expect(await fetchAssetDisposal("42")).toEqual({
      disposedDate: "2026-03-31",
      saleValue: "1500",
      suggestedSaleValue: "1800.00",
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.asset.disposal.byAsset + "42");
  });

  it("is null for a row with no disposed date — the date is the disposal", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { disposed_date: null, suggested_sale_value: 1800 } },
    });
    expect(await fetchAssetDisposal("42")).toBeNull();
  });

  it("is null on a 404, and rethrows anything else", async () => {
    apiMock.get.mockRejectedValueOnce({ response: { status: 404 } });
    expect(await fetchAssetDisposal("42")).toBeNull();

    const failure = { response: { status: 500 } };
    apiMock.get.mockRejectedValueOnce(failure);
    await expect(fetchAssetDisposal("42")).rejects.toBe(failure);
  });

  it("records a disposal, sending a blank sale value as null (scrapped / given away)", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await recordAssetDisposalApi("42", { disposedDate: "2026-03-31", saleValue: "" });

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.asset.disposal.create, {
      asset_id: "42",
      disposed_date: "2026-03-31",
      sale_value: null,
    });
  });

  it("throws the server's message when recording fails", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Already disposed" } });
    await expect(
      recordAssetDisposalApi("42", { disposedDate: "2026-03-31", saleValue: "10" }),
    ).rejects.toThrow("Already disposed");
  });

  it("deletes by asset id", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteAssetDisposalApi("42");
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.asset.disposal.delete + "42");

    apiMock.delete.mockResolvedValue({ data: { success: false } });
    await expect(deleteAssetDisposalApi("42")).rejects.toThrow(
      "Failed to remove the disposal record.",
    );
  });
});

describe("registry (brands & types)", () => {
  it("fetches both lists in parallel and coerces ids to numbers", async () => {
    apiMock.get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          success: true,
          data:
            url === apiRoutes.assetRegistry.brands
              ? [{ id: "7", name: "DeWalt" }]
              : [{ id: 3, name: "New" }],
        },
      }),
    );

    expect(await fetchAssetRegistry()).toEqual({
      brands: [{ id: 7, name: "DeWalt" }],
      types: [{ id: 3, name: "New" }],
    });
    expect(apiMock.get).toHaveBeenCalledTimes(2);
  });

  it("treats a missing list as empty", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchAssetRegistry()).toEqual({ brands: [], types: [] });
  });

  it("posts a trimmed name for a new brand and a new type", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: "11", name: "Makita" } } });

    expect(await createAssetBrandApi("  Makita ")).toEqual({ id: 11, name: "Makita" });
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.assetRegistry.brands, { name: "Makita" });

    await createAssetTypeApi(" Used ");
    expect(apiMock.post).toHaveBeenLastCalledWith(apiRoutes.assetRegistry.types, { name: "Used" });
  });

  it("throws when the create response carries no data", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(createAssetBrandApi("Makita")).rejects.toThrow("Failed to add brand.");
    await expect(createAssetTypeApi("Used")).rejects.toThrow("Failed to add asset type.");
  });

  it("lets a 409 collision through as the axios error, not the function's own message", async () => {
    const conflict = Object.assign(new Error("Request failed with status code 409"), {
      response: { status: 409, data: { success: false, message: '"Makita" already exists' } },
    });
    apiMock.post.mockRejectedValue(conflict);
    await expect(createAssetBrandApi("Makita")).rejects.toBe(conflict);
  });
});

describe("depreciation — save failure and delete", () => {
  it("sends blank optional figures as null on save", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 5, depreciation_method: null } } });

    await saveAssetDepreciationApi("42", {
      ...EMPTY_DEPRECIATION,
      enabled: true,
      effectiveLife: "5",
      startDate: "2026-01-01",
    });

    expect(apiMock.post.mock.calls[0][1]).toMatchObject({
      asset_id: "42",
      effective_life_years: "5",
      depreciation_rate: null,
      residual_value: null,
      cost_limit: null,
      start_date: "2026-01-01",
    });
  });

  it("throws when the save response has no record", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(saveAssetDepreciationApi("42", EMPTY_DEPRECIATION)).rejects.toThrow(
      "Failed to save depreciation.",
    );
  });

  it("deletes by the depreciation record's id, not the asset's", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteAssetDepreciationApi("5");
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.asset.depreciation.delete + "5");

    apiMock.delete.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(deleteAssetDepreciationApi("5")).rejects.toThrow("Nope");
  });
});

describe("fetchAssetDetails", () => {
  it("throws 'Asset not found.' for a missing row", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    await expect(fetchAssetDetails("42", { brands: [], types: [] })).rejects.toThrow(
      "Asset not found.",
    );
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.asset.info + "42");
  });
});

describe("downloadAssetsApi", () => {
  it("GETs a blob with the ids as assets[]", async () => {
    const zip = new Blob(["zip"]);
    apiMock.get.mockResolvedValue({ data: zip });

    expect(await downloadAssetsApi(["1", "2"])).toBe(zip);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.asset.download, {
      params: { "assets[]": ["1", "2"] },
      responseType: "blob",
    });
  });

  it("re-reads a JSON error delivered as a Blob to recover the server's message", async () => {
    apiMock.get.mockRejectedValue({
      response: {
        data: new Blob([JSON.stringify({ message: "No attachments found for selected assets" })]),
      },
    });
    await expect(downloadAssetsApi(["1"])).rejects.toThrow(
      "No attachments found for selected assets",
    );
  });

  it("falls back to a generic message when the blob isn't JSON", async () => {
    apiMock.get.mockRejectedValue({ response: { data: new Blob(["<html>"]) } });
    await expect(downloadAssetsApi(["1"])).rejects.toThrow("Couldn't download those assets.");
  });
});

describe("extractAssetApi", () => {
  const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });

  it("uploads to S3, then extracts — and always reports GST, since OCR never reads it", async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { success: true, url: "https://s3/r.jpg", key: "r.jpg" } })
      .mockResolvedValueOnce({
        data: {
          success: true,
          extractedData: {
            name: "Mitre saw",
            price: "1249",
            date_of_purchase: null,
            supplier: "Total Tools",
            category: "Tools",
            serial_no: null,
          },
          processingInfo: { confidence: 85 },
        },
      });

    const result = await extractAssetApi(file, "2026-10-08");

    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.asset.ocr.upload);
    expect(apiMock.post.mock.calls[1]).toEqual([
      apiRoutes.asset.ocr.extract,
      { s3Url: "https://s3/r.jpg", s3Key: "r.jpg", fileType: "image/jpeg" },
    ]);
    expect(result.confidence).toBeCloseTo(0.85);
    expect(result.fields).toMatchObject({
      name: "Mitre saw",
      costPrice: "1249",
      purchaseDate: "2026-10-08",
      supplierName: "Total Tools",
      category: "Tools",
      gst: true,
    });
  });

  it("leaves a zero or unreadable price blank rather than '0'", async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { success: true, url: "u", key: "k" } })
      .mockResolvedValueOnce({ data: { success: true, extractedData: { price: "n/a" } } });

    const result = await extractAssetApi(file, "2026-10-08");
    expect(result.fields.costPrice).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("stops at a failed upload with the flat response's own error", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: false, error: "File too large" } });
    await expect(extractAssetApi(file, "2026-10-08")).rejects.toThrow("File too large");
    expect(apiMock.post).toHaveBeenCalledTimes(1);
  });

  it("throws when extraction reports no data", async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { success: true, url: "u", key: "k" } })
      .mockResolvedValueOnce({ data: { success: false } });
    await expect(extractAssetApi(file, "2026-10-08")).rejects.toThrow(
      "Couldn't read that document.",
    );
  });
});
