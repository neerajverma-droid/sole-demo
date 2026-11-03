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

// Imported after the mock so `lib/assets.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  createAssetApi,
  updateAssetApi,
  deleteAssetsApi,
  fetchAssets,
  fetchAssetDepreciation,
  saveAssetDepreciationApi,
  fetchAssetStatus,
  reportAssetStatusApi,
  markAssetReturnedApi,
  deleteAssetStatusApi,
  registryEntryByName,
  emptyAssetDraft,
  filterAssets,
  canEditAsset,
  assetOwing,
  isPaid,
  assetAdvancedFilterCount,
  assetFiltersToApi,
  assetValueCeiling,
  assetsNarrowed,
  EMPTY_ASSET_ADVANCED_FILTERS,
} = await import("@/lib/assets");

const REGISTRY = {
  brands: [{ id: 7, name: "DeWalt" }],
  types: [{ id: 3, name: "New" }],
};

const ACCOUNT_CATEGORIES_RESPONSE = {
  success: true,
  data: {
    account_categories: [
      {
        account_category_id: 1,
        name: "Assets",
        account_subcategories: [
          { account_subcategory_id: 42, name: "Inventory" },
        ],
      },
    ],
  },
};

function mockGetByUrl(map: Record<string, unknown>) {
  apiMock.get.mockImplementation((url: string) => {
    const match = Object.keys(map).find((key) => url.startsWith(key));
    if (!match) return Promise.reject(new Error(`Unexpected GET ${url}`));
    return Promise.resolve({ data: map[match] });
  });
}

/** A FormData instance, as the plain object a test can assert against. */
function formDataToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    out[key] = value instanceof File ? { fileName: value.name } : value;
  }
  return out;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetByUrl({
    [apiRoutes.accountCategory.list]: ACCOUNT_CATEGORIES_RESPONSE,
  });
});

describe("registryEntryByName", () => {
  it("matches case-insensitively", () => {
    expect(registryEntryByName(REGISTRY.brands, "dewalt")).toEqual({
      id: 7,
      name: "DeWalt",
    });
  });

  it("returns undefined for no match or an empty query", () => {
    expect(registryEntryByName(REGISTRY.brands, "Makita")).toBeUndefined();
    expect(registryEntryByName(REGISTRY.brands, "  ")).toBeUndefined();
  });
});

describe("creating an asset", () => {
  it("posts multipart form data with the fields sole-webapp's own submit sends", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    const draft = {
      ...emptyAssetDraft("2026-06-01"),
      name: "DeWalt mitre saw",
      costPrice: "1249",
      category: "Tools" as const,
      supplierId: "88",
      supplierName: "Total Tools",
      gst: true,
      paidWithCash: false,
      brand: "DeWalt",
      assetType: "New",
      modelNo: "DWS779",
    };

    await createAssetApi(draft, REGISTRY);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.asset.add);
    expect(body).toBeInstanceOf(FormData);

    const fields = formDataToObject(body as FormData);
    expect(fields).toMatchObject({
      name: "DeWalt mitre saw",
      price: "1249",
      date_of_purchase: "2026-06-01",
      gst: "1",
      paid_with_cash: "0",
      client_id: "88",
      client_name: "Total Tools",
      asset_brand_id: "7",
      asset_type_id: "3",
      asset_category: "Tools",
      model_no: "DWS779",
      is_depreciation: "0",
    });
    // Not the tracked (Inventory) category, so no chart-of-accounts lookup
    // and none of the inventory-linkage fields.
    expect(fields.account_subcategory_id).toBeUndefined();
    expect(fields.inventory_flag).toBeUndefined();
  });

  it("resolves the Inventory account subcategory and sends stock fields for a tracked asset", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    const draft = {
      ...emptyAssetDraft("2026-06-01"),
      name: "Timber panel stock",
      costPrice: "3120",
      category: "Inventory" as const,
      tracked: true,
      unitType: "Items",
      openingStock: "128",
      lowStockAlert: "20",
    };

    await createAssetApi(draft, REGISTRY);

    const fields = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    expect(fields).toMatchObject({
      account_subcategory_id: "42",
      is_inventory_category: "1",
      is_inventory: "1",
      inventory_flag: "1",
      qty_type: "Items",
      inventory_count: "128",
      low_stock_threshold: "20",
    });
    // Nothing picked from the autocomplete — no id to link to, so none sent.
    expect(fields.inventory_product_id).toBeUndefined();
  });

  it("links to an existing product instead of letting the backend create a duplicate", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    const draft = {
      ...emptyAssetDraft("2026-06-01"),
      name: "Timber panel stock",
      costPrice: "3120",
      category: "Inventory" as const,
      tracked: true,
      unitType: "Items",
      openingStock: "128",
      lowStockAlert: "20",
      // As if picked from the asset-name autocomplete.
      inventoryProductId: "77",
    };

    await createAssetApi(draft, REGISTRY);

    const fields = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    expect(fields.inventory_product_id).toBe("77");
  });

  it("never sends a stale inventory link for a non-Inventory category", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    const draft = {
      ...emptyAssetDraft("2026-06-01"),
      category: "Tools" as const,
      inventoryProductId: "77",
    };

    await createAssetApi(draft, REGISTRY);

    const fields = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    expect(fields.inventory_product_id).toBeUndefined();
  });

  it("submits depreciation inline, mapped to the API's enum", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    const draft = {
      ...emptyAssetDraft("2026-06-01"),
      name: "MacBook Pro",
      costPrice: "4299",
      depreciation: {
        enabled: true,
        method: "Diminishing value" as const,
        effectiveLife: "4",
        overrideRate: "",
        residualValue: "",
        costLimit: "",
        startDate: "2026-06-01",
      },
    };

    await createAssetApi(draft, REGISTRY);

    const fields = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    expect(fields).toMatchObject({
      is_depreciation: "1",
      depreciation_method: "diminishing_value",
      effective_life_years: "4",
      depreciation_start_date: "2026-06-01",
    });
  });

  it("throws with the server's message when the create call reports failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Name is required" },
    });
    await expect(
      createAssetApi(emptyAssetDraft("2026-06-01"), REGISTRY),
    ).rejects.toThrow("Name is required");
  });
});

describe("updating an asset", () => {
  it("sends the asset id in the body, not the URL", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await updateAssetApi("501", emptyAssetDraft("2026-06-01"), REGISTRY);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.asset.update);
    expect(formDataToObject(body as FormData).asset_id).toBe("501");
  });

  it("only attaches a photo when it's a freshly picked file, not an existing server URL", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    const draft = {
      ...emptyAssetDraft("2026-06-01"),
      photos: {
        photo: {
          dataUrl: "https://cdn.example.com/assets/501/photo.jpg",
          name: "photo.jpg",
          size: 1000,
        },
      },
    };
    await updateAssetApi("501", draft, REGISTRY);
    expect(formDataToObject(apiMock.post.mock.calls[0][1] as FormData)).not.toHaveProperty(
      "asset_photo",
    );

    apiMock.post.mockClear();
    const freshDraft = {
      ...emptyAssetDraft("2026-06-01"),
      photos: {
        photo: {
          dataUrl: "data:image/jpeg;base64,aGVsbG8=",
          name: "photo.jpg",
          size: 5,
        },
      },
    };
    await updateAssetApi("501", freshDraft, REGISTRY);
    const fields = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    expect(fields.asset_photo).toEqual({ fileName: "photo.jpg" });
    expect(fields.asset_pic).toEqual({ fileName: "photo.jpg" });
  });

  it("never attaches documents inline on update — only on create", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    const draft = {
      ...emptyAssetDraft("2026-06-01"),
      documents: [
        { dataUrl: "data:application/pdf;base64,aGVsbG8=", name: "receipt.pdf", size: 5 },
      ],
    };

    await updateAssetApi("501", draft, REGISTRY);
    expect(formDataToObject(apiMock.post.mock.calls[0][1] as FormData)).not.toHaveProperty(
      "files[]",
    );

    apiMock.post.mockClear();
    await createAssetApi(draft, REGISTRY);
    expect(formDataToObject(apiMock.post.mock.calls[0][1] as FormData)).toHaveProperty(
      "files[]",
    );
  });
});

describe("deleting assets", () => {
  it("surfaces skipped ids rather than reporting every id as deleted", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { deleted_asset_ids: [1], skipped_asset_ids: [2] },
      },
    });

    const result = await deleteAssetsApi(["1", "2"]);

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.asset.delete, {
      assets: ["1", "2"],
    });
    expect(result).toEqual({ deletedIds: ["1"], skippedIds: ["2"] });
  });
});

describe("fetching the register", () => {
  it("GETs with pagination off and maps brand/type ids, category and embedded disposal", async () => {
    mockGetByUrl({
      [apiRoutes.asset.list]: {
        success: true,
        data: {
          asset_details: [
            {
              asset_id: 501,
              name: "DeWalt mitre saw",
              price: "1249.00",
              gst: 1,
              date_of_purchase: "2026-01-18",
              asset_category: "Tools",
              asset_brand_id: 7,
              asset_type_id: 3,
              model_no: "DWS779",
              asset_status: { disposed_date: "2026-07-01", sale_value: "300" },
            },
          ],
        },
      },
    });

    const assets = await fetchAssets(REGISTRY);

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.asset.list, {
      params: { pagination: "off" },
    });
    expect(assets).toEqual([
      expect.objectContaining({
        id: "501",
        name: "DeWalt mitre saw",
        costPrice: "1249",
        category: "Tools",
        brand: "DeWalt",
        assetType: "New",
        modelNo: "DWS779",
        disposedDate: "2026-07-01",
        saleValue: "300",
      }),
    ]);
  });

  it("reads reconciliation state off is_reconciled, not bank_transaction_id", async () => {
    mockGetByUrl({
      [apiRoutes.asset.list]: {
        success: true,
        data: {
          asset_details: [
            {
              // sole-ocr's match service explicitly nulls bank_transaction_id
              // back out once matched — is_reconciled is the real signal.
              asset_id: 1,
              name: "Matched asset",
              bank_transaction_id: null,
              is_reconciled: 1,
              remainingAmount: 0,
              possible_match: 0,
            },
            {
              asset_id: 2,
              name: "Unmatched asset",
              is_reconciled: 0,
              remainingAmount: "600.00",
              possible_match: 3,
            },
          ],
        },
      },
    });
    const [matched, unmatched] = await fetchAssets(REGISTRY);
    expect(matched).toMatchObject({
      isReconciled: true,
      remainingAmount: 0,
      possibleMatchCount: 0,
    });
    expect(unmatched).toMatchObject({
      isReconciled: false,
      remainingAmount: 600,
      possibleMatchCount: 3,
    });
  });

  it("falls back to Other for a category the fixed list doesn't recognise", async () => {
    mockGetByUrl({
      [apiRoutes.asset.list]: {
        success: true,
        data: { asset_details: [{ asset_id: 1, name: "Mystery item", asset_category: "Whatever" }] },
      },
    });
    const [asset] = await fetchAssets(REGISTRY);
    expect(asset.category).toBe("Other");
  });

  it("reads an active lost/stolen report but not one already marked returned", async () => {
    mockGetByUrl({
      [apiRoutes.asset.list]: {
        success: true,
        data: {
          asset_details: [
            {
              asset_id: 1,
              name: "Reported",
              asset_status: { status_type: "stolen", is_returned: 0 },
            },
            {
              asset_id: 2,
              name: "Returned already",
              asset_status: { status_type: "lost_damaged", is_returned: 1 },
            },
          ],
        },
      },
    });
    const [reported, returned] = await fetchAssets(REGISTRY);
    expect(reported.statusReason).toBe("Stolen");
    expect(returned.statusReason).toBeNull();
  });
});

describe("asset status (lost/damaged/stolen)", () => {
  it("returns null, not an error, when nothing's been reported", async () => {
    apiMock.get.mockRejectedValue({ response: { status: 404 } });
    await expect(fetchAssetStatus("501")).resolves.toBeNull();
  });

  it("maps a report to this app's labels", async () => {
    mockGetByUrl({
      [apiRoutes.asset.status.byAsset]: {
        success: true,
        data: {
          status_type: "stolen",
          reference_no: "REF-1",
          police_report_no: "PR-99",
          notes: "Taken from the van",
          is_returned: 0,
          created_at: "2026-09-16T04:25:07.000Z",
        },
      },
    });
    const record = await fetchAssetStatus("501");
    expect(record).toEqual({
      reason: "Stolen",
      referenceNo: "REF-1",
      policeReportNo: "PR-99",
      notes: "Taken from the van",
      isReturned: false,
      reportedDate: "2026-09-16",
    });
  });

  it("posts the reason mapped to the API's enum", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { status_type: "lost_damaged" } },
    });
    await reportAssetStatusApi("501", {
      reason: "Lost or damaged",
      referenceNo: "",
      policeReportNo: "",
      notes: "",
      sendInsuranceReport: false,
    });
    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.asset.status.create,
      expect.objectContaining({ asset_id: "501", status_type: "lost_damaged" }),
    );
  });

  it("throws the server's message when reporting stolen without insurance", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "An insurance record is required to report this asset stolen" },
    });
    await expect(
      reportAssetStatusApi("501", {
        reason: "Stolen",
        referenceNo: "",
        policeReportNo: "",
        notes: "",
        sendInsuranceReport: false,
      }),
    ).rejects.toThrow("An insurance record is required to report this asset stolen");
  });

  it("marks an asset returned via the dedicated endpoint", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    await markAssetReturnedApi("501");
    expect(apiMock.patch).toHaveBeenCalledWith(
      apiRoutes.asset.status.markReturned("501"),
    );
  });

  it("deletes a report entirely, distinct from marking it returned", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteAssetStatusApi("501");
    expect(apiMock.delete).toHaveBeenCalledWith(
      apiRoutes.asset.status.delete + "501",
    );
  });
});

describe("depreciation", () => {
  it("returns null, not an error, when nothing's been set up yet", async () => {
    apiMock.get.mockRejectedValue({ response: { status: 404 } });
    await expect(fetchAssetDepreciation("501")).resolves.toBeNull();
  });

  it("rethrows a non-404 failure", async () => {
    apiMock.get.mockRejectedValue({ response: { status: 500 } });
    await expect(fetchAssetDepreciation("501")).rejects.toBeTruthy();
  });

  it("maps the API's enum back to this app's labels, with the record id for later deletion", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 9,
          depreciation_method: "full_depreciation",
          start_date: "2026-01-01",
        },
      },
    });

    const record = await saveAssetDepreciationApi("501", {
      enabled: true,
      method: "Full depreciation on purchase",
      effectiveLife: "",
      overrideRate: "",
      residualValue: "",
      costLimit: "",
      startDate: "2026-01-01",
    });

    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.asset.depreciation.create,
      expect.objectContaining({
        asset_id: "501",
        depreciation_method: "full_depreciation",
      }),
    );
    expect(record).toMatchObject({ id: "9", method: "Full depreciation on purchase" });
  });
});

describe("filterAssets — Matched/Unmatched", () => {
  const draft = { ...emptyAssetDraft("2026-01-01") };
  const matched = { ...draft, isReconciled: true, id: "1" };
  const unmatched = { ...draft, isReconciled: false, id: "2" };

  it("Matched keeps only reconciled assets", () => {
    const result = filterAssets([matched, unmatched], {
      query: "",
      filter: "Matched",
      sort: "Newest first",
    });
    expect(result.map((a) => a.id)).toEqual(["1"]);
  });

  it("Unmatched keeps only unreconciled assets", () => {
    const result = filterAssets([matched, unmatched], {
      query: "",
      filter: "Unmatched",
      sort: "Newest first",
    });
    expect(result.map((a) => a.id)).toEqual(["2"]);
  });
});

describe("canEditAsset", () => {
  it("lets an unmatched asset be edited", () => {
    expect(canEditAsset({ isReconciled: false })).toBe(true);
  });

  it("takes Edit away once the asset is matched — what it cost is what the bank transaction was reconciled against", () => {
    expect(canEditAsset({ isReconciled: true })).toBe(false);
  });
});

describe("assetOwing / isPaid / Paid & Owing filters", () => {
  const base = { ...emptyAssetDraft("2026-01-01"), costPrice: "1000" };
  const cash = { ...base, id: "cash", paidWithCash: true, remainingAmount: 1000 };
  const matchedFully = { ...base, id: "matched", isReconciled: true, remainingAmount: 0 };
  const partlyMatched = { ...base, id: "partial", remainingAmount: 400 };
  const unpaid = { ...base, id: "unpaid", remainingAmount: 1000 };
  const financed = { ...base, id: "fin", owing: "250", remainingAmount: 0 };
  const all = [cash, matchedFully, partlyMatched, unpaid, financed];

  const ids = (filter: "Paid" | "Owing") =>
    filterAssets(all, { query: "", filter, sort: "Name A–Z" })
      .map((a) => a.id)
      .sort();

  it("treats cash and fully matched assets as paid", () => {
    expect(isPaid(cash)).toBe(true);
    expect(isPaid(matchedFully)).toBe(true);
  });

  it("owes what is left after matched payments", () => {
    expect(assetOwing(partlyMatched)).toBe(400);
    expect(assetOwing(unpaid)).toBe(1000);
  });

  it("lets a figure typed this session stand for the financed amount", () => {
    expect(assetOwing(financed)).toBe(250);
  });

  it("ignores sub-cent rounding residue", () => {
    expect(assetOwing({ ...base, remainingAmount: 0.001 })).toBe(0);
  });

  it("Paid and Owing split the register with no overlap and no gap", () => {
    expect(ids("Paid")).toEqual(["cash", "matched"]);
    expect(ids("Owing")).toEqual(["fin", "partial", "unpaid"]);
  });
});

describe("advanced filters — the Filter by dialog", () => {
  const filters = (partial: Partial<typeof EMPTY_ASSET_ADVANCED_FILTERS>) => ({
    ...EMPTY_ASSET_ADVANCED_FILTERS,
    ...partial,
  });

  it("sends nothing while every filter is at rest", () => {
    expect(assetFiltersToApi(EMPTY_ASSET_ADVANCED_FILTERS)).toEqual({});
    expect(assetAdvancedFilterCount(EMPTY_ASSET_ADVANCED_FILTERS)).toBe(0);
  });

  it("maps each filter to the key GET /assets reads", () => {
    expect(
      assetFiltersToApi(
        filters({
          paidWithCashOnly: true,
          match: "Matched",
          dateFrom: "2026-02-01",
          dateTo: "2026-05-01",
          minValue: 400,
          maxValue: 9000.5,
          categories: ["12", "15"],
        }),
      ),
    ).toEqual({
      paid_with_cash: 1,
      match_status: "matched",
      start_date: "2026-02-01",
      end_date: "2026-05-01",
      min_price: 400,
      max_price: 9000.5,
      account_subcategory_id: [12, 15],
    });
  });

  it("maps Unmatched, and leaves an open end of a range out", () => {
    expect(assetFiltersToApi(filters({ match: "Unmatched", minValue: 1 }))).toEqual({
      match_status: "unmatched",
      min_price: 1,
    });
  });

  it("never sends paid_with_cash as 0, which the endpoint would read as 1", () => {
    expect(assetFiltersToApi(filters({ paidWithCashOnly: false }))).not.toHaveProperty(
      "paid_with_cash",
    );
  });

  it("drops category ids that aren't real subcategory ids", () => {
    expect(assetFiltersToApi(filters({ categories: ["abc", "", "0", "7"] }))).toEqual({
      account_subcategory_id: [7],
    });
  });

  it("fetches the whole register unfiltered, with no filter_by", async () => {
    mockGetByUrl({ [apiRoutes.asset.list]: { success: true, data: { asset_details: [] } } });
    await fetchAssets(REGISTRY);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.asset.list, {
      params: { pagination: "off" },
    });
  });

  it("asks the server to filter, as a JSON filter_by", async () => {
    mockGetByUrl({ [apiRoutes.asset.list]: { success: true, data: { asset_details: [] } } });
    await fetchAssets(
      REGISTRY,
      filters({ match: "Unmatched", paidWithCashOnly: true, categories: ["3"] }),
    );
    const [, config] = apiMock.get.mock.calls.find(
      ([url]) => url === apiRoutes.asset.list,
    )!;
    expect(config.params.pagination).toBe("off");
    expect(JSON.parse(config.params.filter_by)).toEqual({
      paid_with_cash: 1,
      match_status: "unmatched",
      account_subcategory_id: [3],
    });
  });

  it("counts each narrowing group once, and counts as narrowing for the empty copy", () => {
    const active = filters({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      minValue: 1,
      maxValue: 5,
    });
    expect(assetAdvancedFilterCount(active)).toBe(2);
    expect(assetsNarrowed({ query: "", advanced: active })).toBe(true);
    expect(
      assetsNarrowed({ query: "", advanced: EMPTY_ASSET_ADVANCED_FILTERS }),
    ).toBe(false);
  });

  it("sizes the value slider to the dearest asset, never below 1,000", () => {
    expect(assetValueCeiling([])).toBe(1000);
    expect(assetValueCeiling([{ costPrice: "400" }])).toBe(1000);
    expect(assetValueCeiling([{ costPrice: "42,000" }])).toBe(42000);
    expect(assetValueCeiling([{ costPrice: "42,350" }])).toBe(43000);
  });
});
