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
  assetIssues,
  firstIncompleteStep,
  EMPTY_DEPRECIATION,
  savedPhotoName,
  removedPhotoFields,
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
      // The linked stock item's own vocabulary — what the Inventory screen reads.
      qty_type: "items",
      inventory_count: "128",
      low_stock_threshold: "20",
    });
    // Nothing picked from the autocomplete — no id to link to, so none sent.
    expect(fields.inventory_product_id).toBeUndefined();
  });

  it("sends the sale price for an Inventory asset, and nothing when it's blank", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    const draft = {
      ...emptyAssetDraft("2026-06-01"),
      name: "Toyota Hilux",
      costPrice: "200",
      category: "Inventory" as const,
      tracked: true,
      unitType: "Items",
      openingStock: "5",
      lowStockAlert: "1",
    };

    await createAssetApi({ ...draft, salePrice: "350" }, REGISTRY);
    expect(formDataToObject(apiMock.post.mock.calls[0][1] as FormData).selling_price).toBe("350");

    // Blank keeps whatever the stock item already has.
    await createAssetApi({ ...draft, salePrice: "" }, REGISTRY);
    expect(formDataToObject(apiMock.post.mock.calls[1][1] as FormData).selling_price).toBeUndefined();
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

describe("the asset payload — only what applies", () => {
  const base = {
    ...emptyAssetDraft("2026-06-01"),
    name: "MacBook Pro",
    costPrice: "4299",
    category: "Technology" as const,
    brand: "DeWalt",
    assetType: "New",
    modelNo: "A2992",
    serialNo: "C02XG0FDH7JY",
    identifyingMarks: "Sticker",
    warrantyExpiry: "2028-06-01",
    testAndTagDate: "2026-07-01",
  };
  const fresh = (name: string) => ({
    dataUrl: "data:image/jpeg;base64,aGVsbG8=",
    name,
    size: 5,
  });
  const depreciation = (values: Partial<typeof EMPTY_DEPRECIATION>) => ({
    ...EMPTY_DEPRECIATION,
    enabled: true,
    startDate: "2026-06-01",
    ...values,
  });

  beforeEach(() => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
  });

  it("leaves the advanced-only fields out on a plan without Advanced Assets", async () => {
    await createAssetApi(
      {
        ...base,
        photos: { photo: fresh("photo.jpg"), serial: fresh("serial.jpg") },
        depreciation: depreciation({ effectiveLife: "4" }),
      },
      REGISTRY,
      { advanced: false },
    );
    const fields = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    for (const key of [
      "asset_brand_id",
      "asset_type_id",
      "model_no",
      "serial_no",
      "identifiable_marks",
      "warranty_date",
      "test_and_tag_date",
      "serial_no_photo",
      "is_depreciation",
      "effective_life_years",
    ]) {
      expect(fields).not.toHaveProperty(key);
    }
    expect(fields.asset_photo).toEqual({ fileName: "photo.jpg" });
    expect(fields.asset_category).toBe("Technology");
  });

  it("sends them with Advanced Assets (the default)", async () => {
    await createAssetApi(base, REGISTRY);
    const fields = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    expect(fields).toMatchObject({
      asset_brand_id: "7",
      serial_no: "C02XG0FDH7JY",
      warranty_date: "2028-06-01",
      is_depreciation: "0",
    });
  });

  it("sends no life or rate for a full write-off", async () => {
    await createAssetApi(
      {
        ...base,
        depreciation: depreciation({
          method: "Full depreciation on purchase",
          effectiveLife: "5",
          overrideRate: "30",
        }),
      },
      REGISTRY,
    );
    const fields = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    expect(fields.depreciation_method).toBe("full_depreciation");
    expect(fields).not.toHaveProperty("effective_life_years");
    expect(fields).not.toHaveProperty("depreciation_rate");
  });

  it("sends a rate only for diminishing value", async () => {
    await createAssetApi(
      { ...base, depreciation: depreciation({ effectiveLife: "5", overrideRate: "30" }) },
      REGISTRY,
    );
    const straight = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    expect(straight.effective_life_years).toBe("5");
    expect(straight).not.toHaveProperty("depreciation_rate");

    await createAssetApi(
      {
        ...base,
        depreciation: depreciation({
          method: "Diminishing value",
          effectiveLife: "5",
          overrideRate: "30",
        }),
      },
      REGISTRY,
    );
    const diminishing = formDataToObject(apiMock.post.mock.calls[1][1] as FormData);
    expect(diminishing.depreciation_rate).toBe("30");
  });

  it("sends comma-formatted residual value and cost limit as plain numbers", async () => {
    await createAssetApi(
      {
        ...base,
        costPrice: "68,000",
        depreciation: depreciation({
          effectiveLife: "8",
          residualValue: "1,500",
          costLimit: "64,741.50",
        }),
      },
      REGISTRY,
    );
    const fields = formDataToObject(apiMock.post.mock.calls[0][1] as FormData);
    expect(fields).toMatchObject({
      price: "68000",
      residual_value: "1500",
      cost_limit: "64741.5",
    });
  });
});

describe("savedPhotoName", () => {
  it("keeps the stored file's extension, so a PDF receipt isn't taken for an image", () => {
    expect(savedPhotoName("receipt", "https://s3.example.com/a/1712_x.pdf")).toBe("receipt.pdf");
    expect(
      savedPhotoName("receipt", "https://s3.example.com/a/1712_x.PDF?X-Amz-Signature=abc"),
    ).toBe("receipt.pdf");
    expect(savedPhotoName("photo", "https://s3.example.com/a/1712_x.png")).toBe("photo.png");
  });

  it("falls back to .jpg when the URL has no extension", () => {
    expect(savedPhotoName("photo", "https://s3.example.com/a/1712_x")).toBe("photo.jpg");
  });
});

describe("removedPhotoFields — clearing saved photos on update", () => {
  const saved = (name: string) => ({ dataUrl: `https://cdn.example.com/${name}`, name, size: 0 });
  const fresh = { dataUrl: "data:image/jpeg;base64,aGVsbG8=", name: "new.jpg", size: 5 };

  it("names each saved slot the edit emptied", () => {
    expect(
      removedPhotoFields(
        { photo: saved("p.jpg"), receipt: saved("r.pdf"), marks: saved("m.jpg") },
        { marks: saved("m.jpg") },
      ),
    ).toEqual(["asset_photo", "receipt_photo"]);
  });

  it("leaves a slot alone when it was replaced or never had a photo", () => {
    expect(removedPhotoFields({ photo: saved("p.jpg") }, { photo: fresh, serial: fresh })).toEqual([]);
    expect(removedPhotoFields({}, {})).toEqual([]);
  });

  it("only ever clears the asset photo on the basic plan", () => {
    expect(
      removedPhotoFields({ photo: saved("p.jpg"), serial: saved("s.jpg") }, {}, false),
    ).toEqual(["asset_photo"]);
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

  it("sends remove_photos for a saved photo the edit removed", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    const original = {
      category: "Equipment" as const,
      accountSubcategoryId: "77",
      photos: { receipt: { dataUrl: "https://cdn.example.com/r.pdf", name: "receipt.pdf", size: 0 } },
    };
    await updateAssetApi("501", { ...emptyAssetDraft("2026-06-01"), category: "Equipment" }, REGISTRY, original);
    expect(formDataToObject(apiMock.post.mock.calls[0][1] as FormData).remove_photos).toBe("receipt_photo");

    apiMock.post.mockClear();
    await updateAssetApi(
      "501",
      { ...emptyAssetDraft("2026-06-01"), category: "Equipment", photos: original.photos },
      REGISTRY,
      original,
    );
    expect(formDataToObject(apiMock.post.mock.calls[0][1] as FormData)).not.toHaveProperty("remove_photos");
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

  it("sends only what applies to the method, with plain-number amounts", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { id: 9, depreciation_method: "straight_line" } },
    });
    const values = {
      enabled: true,
      method: "Straight line" as const,
      effectiveLife: "8",
      overrideRate: "40",
      residualValue: "1,500",
      costLimit: "64,741.50",
      startDate: "2026-01-01",
    };

    await saveAssetDepreciationApi("501", values);
    expect(apiMock.post.mock.calls[0][1]).toMatchObject({
      effective_life_years: "8",
      depreciation_rate: null,
      residual_value: "1500",
      cost_limit: "64741.5",
    });

    await saveAssetDepreciationApi("501", { ...values, method: "Diminishing value" });
    expect(apiMock.post.mock.calls[1][1]).toMatchObject({ depreciation_rate: "40" });

    await saveAssetDepreciationApi("501", {
      ...values,
      method: "Full depreciation on purchase",
    });
    expect(apiMock.post.mock.calls[2][1]).toMatchObject({
      effective_life_years: null,
      depreciation_rate: null,
    });
  });
});

describe("filterAssets — Matched/Unmatched", () => {
  const draft = { ...emptyAssetDraft("2026-01-01"), category: "Equipment" as const };
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
    expect(canEditAsset({ isReconciled: false, paidWithCash: false })).toBe(true);
  });

  it("takes Edit away once the asset is matched — what it cost is what the bank transaction was reconciled against", () => {
    expect(canEditAsset({ isReconciled: true, paidWithCash: false })).toBe(false);
  });

  it("treats paid with cash as matched too, as the register's Matched badge does", () => {
    expect(canEditAsset({ isReconciled: false, paidWithCash: true })).toBe(false);
  });
});

describe("assetOwing / isPaid / Paid & Owing filters", () => {
  const base = {
    ...emptyAssetDraft("2026-01-01"),
    category: "Equipment" as const,
    costPrice: "1000",
  };
  const cash = { ...base, id: "cash", paidWithCash: true, remainingAmount: 1000 };
  const matchedFully = { ...base, id: "matched", isReconciled: true, remainingAmount: 0 };
  const partlyMatched = { ...base, id: "partial", remainingAmount: 400 };
  const unpaid = { ...base, id: "unpaid", remainingAmount: 1000 };
  const all = [cash, matchedFully, partlyMatched, unpaid];

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

  it("ignores sub-cent rounding residue", () => {
    expect(assetOwing({ ...base, remainingAmount: 0.001 })).toBe(0);
  });

  it("Paid and Owing split the register with no overlap and no gap", () => {
    expect(ids("Paid")).toEqual(["cash", "matched"]);
    expect(ids("Owing")).toEqual(["partial", "unpaid"]);
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

/* ------------------------------------------------------------------ *
 * Category → chart-of-accounts account
 * ------------------------------------------------------------------ */

/** Every "Assets" subcategory the mapping can name, with its own id. */
const FULL_CHART = {
  success: true,
  data: {
    account_categories: [
      {
        account_category_id: 1,
        name: "Assets",
        account_subcategories: [
          { account_subcategory_id: 42, name: "Inventory" },
          { account_subcategory_id: 51, name: "Plant and Equipment" },
          { account_subcategory_id: 52, name: "Motor Vehicles" },
          { account_subcategory_id: 53, name: "Office Equipment" },
          { account_subcategory_id: 59, name: "Other Assets" },
        ],
      },
    ],
  },
};

/**
 * A clean `lib/assets` (and the `lib/inventory` lookup cache under it) with
 * the given chart of accounts — the lookup is cached per page load, so each
 * chart needs its own module instance.
 */
async function libWithChart(chart: unknown) {
  vi.resetModules();
  mockGetByUrl({ [apiRoutes.accountCategory.list]: chart });
  apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
  return import("@/lib/assets");
}

function sentFields(): Record<string, unknown> {
  return formDataToObject(apiMock.post.mock.calls.at(-1)![1] as FormData);
}

describe("category → account", () => {
  it.each([
    ["Equipment", "51"],
    ["Tools", "51"],
    ["Vehicle", "52"],
    ["Technology", "53"],
    ["Furniture", "53"],
    ["Property", "59"],
    ["Other", "59"],
    ["Inventory", "42"],
  ] as const)("files %s under the user's own account (%s)", async (category, id) => {
    const lib = await libWithChart(FULL_CHART);
    await lib.createAssetApi(
      { ...lib.emptyAssetDraft("2026-06-01"), name: "x", costPrice: "10", category },
      REGISTRY,
    );
    expect(sentFields().account_subcategory_id).toBe(id);
  });

  it("keeps the whole mapping in one exported table", async () => {
    const lib = await libWithChart(FULL_CHART);
    expect(lib.ASSET_CATEGORY_ACCOUNTS).toEqual({
      Equipment: "Plant and Equipment",
      Tools: "Plant and Equipment",
      Vehicle: "Motor Vehicles",
      Technology: "Office Equipment",
      Furniture: "Office Equipment",
      Property: "Other Assets",
      Other: "Other Assets",
      Inventory: "Inventory",
    });
  });

  it("falls back to Other Assets when the named account isn't on the chart", async () => {
    const lib = await libWithChart({
      success: true,
      data: {
        account_categories: [
          {
            account_category_id: 1,
            name: "Assets",
            account_subcategories: [{ account_subcategory_id: 59, name: "other assets" }],
          },
        ],
      },
    });
    expect(await lib.resolveAssetAccountSubcategoryId("Vehicle")).toBe(59);
  });

  it("sends no account when neither the named account nor Other Assets exists", async () => {
    const lib = await libWithChart(ACCOUNT_CATEGORIES_RESPONSE);
    await lib.createAssetApi(
      { ...lib.emptyAssetDraft("2026-06-01"), name: "x", costPrice: "10", category: "Vehicle" },
      REGISTRY,
    );
    expect(sentFields()).not.toHaveProperty("account_subcategory_id");
    // Inventory is still found on the same chart.
    expect(await lib.resolveAssetAccountSubcategoryId("Inventory")).toBe(42);
    // No category chosen: nothing to resolve.
    expect(await lib.resolveAssetAccountSubcategoryId("")).toBeNull();
  });

  it("looks the chart of accounts up once, however many saves follow", async () => {
    const lib = await libWithChart(FULL_CHART);
    await lib.resolveAssetAccountSubcategoryId("Vehicle");
    await lib.resolveAssetAccountSubcategoryId("Tools");
    await lib.resolveAssetAccountSubcategoryId("Inventory");
    const lookups = apiMock.get.mock.calls.filter(
      ([url]) => url === apiRoutes.accountCategory.list,
    );
    expect(lookups).toHaveLength(1);
  });
});

describe("category → account, on update", () => {
  const loaded = { category: "Equipment" as const, accountSubcategoryId: "77" };

  it("leaves the account alone when the category wasn't changed in this edit", async () => {
    const lib = await libWithChart(FULL_CHART);
    await lib.updateAssetApi(
      "501",
      { ...lib.emptyAssetDraft("2026-06-01"), category: "Equipment" },
      REGISTRY,
      loaded,
    );
    // Omitted rather than re-resolved: the backend keeps the stored account.
    expect(sentFields()).not.toHaveProperty("account_subcategory_id");
  });

  it("moves it when the category was changed", async () => {
    const lib = await libWithChart(FULL_CHART);
    await lib.updateAssetApi(
      "501",
      { ...lib.emptyAssetDraft("2026-06-01"), category: "Vehicle" },
      REGISTRY,
      loaded,
    );
    expect(sentFields().account_subcategory_id).toBe("52");
  });

  it("gives an asset saved without an account one, from its category", async () => {
    const lib = await libWithChart(FULL_CHART);
    await lib.updateAssetApi(
      "501",
      { ...lib.emptyAssetDraft("2026-06-01"), category: "Equipment" },
      REGISTRY,
      { category: "Equipment", accountSubcategoryId: null },
    );
    expect(sentFields().account_subcategory_id).toBe("51");
  });

  it("decides with shouldResolveAccountOnUpdate", async () => {
    const lib = await libWithChart(FULL_CHART);
    expect(lib.shouldResolveAccountOnUpdate({ category: "Equipment" }, loaded)).toBe(false);
    expect(lib.shouldResolveAccountOnUpdate({ category: "Tools" }, loaded)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Reading an old asset back
 * ------------------------------------------------------------------ */

describe("category on a saved asset", () => {
  async function mapped(row: Record<string, unknown>) {
    mockGetByUrl({
      [apiRoutes.asset.list]: {
        success: true,
        data: { asset_details: [{ asset_id: 1, name: "Old asset", ...row }] },
      },
    });
    const [asset] = await fetchAssets(REGISTRY);
    return asset;
  }

  it("is Inventory whenever a stock item is linked, whatever the stored category says", async () => {
    expect((await mapped({ inventory_product_id: 9, asset_category: null })).category).toBe(
      "Inventory",
    );
    expect((await mapped({ inventory_product_id: 9, asset_category: "Laptop" })).category).toBe(
      "Inventory",
    );
  });

  it("uses a stored category from the list", async () => {
    expect(
      (await mapped({ asset_category: "tools", account_subcategory: { name: "Motor Vehicles" } }))
        .category,
    ).toBe("Tools");
  });

  it.each([
    ["Inventory", "Inventory"],
    ["Motor Vehicles", "Vehicle"],
    ["Plant and Equipment", "Equipment"],
    ["Office Equipment", "Technology"],
    ["Other Assets", "Other"],
    ["Land and Buildings", "Other"],
  ])("reads an old asset filed under %s as %s", async (account, category) => {
    const asset = await mapped({
      asset_category: "Laptop",
      account_subcategory_id: 51,
      account_subcategory: { name: account },
    });
    expect(asset.category).toBe(category);
  });

  it("falls back to a top-level subcategory_name, then Other", async () => {
    expect((await mapped({ asset_category: null, subcategory_name: "Motor Vehicles" })).category).toBe(
      "Vehicle",
    );
    expect((await mapped({ asset_category: null })).category).toBe("Other");
  });

  it("keeps the account it was loaded with", async () => {
    expect((await mapped({ account_subcategory_id: 51 })).accountSubcategoryId).toBe("51");
    expect((await mapped({ account_subcategory_id: null })).accountSubcategoryId).toBeNull();
  });

  it("maps every matched journal entry, newest first, skipping ones without an id", async () => {
    const asset = await mapped({
      matched_journal_entries: [
        {
          journal_entry_id: 301,
          bank_transaction_id: 88,
          transaction_description: "EFTPOS Toyota",
          matched_amount: 400,
          matched_at: "2026-06-02T10:00:00.000Z",
        },
        { journal_entry_id: 300, bank_transaction_id: null, matched_amount: "600.5" },
        { journal_entry_id: null },
      ],
    });
    expect(asset.matchedJournalEntries).toEqual([
      {
        journalEntryId: "301",
        bankTransactionId: "88",
        description: "EFTPOS Toyota",
        amount: 400,
        matchedAt: "2026-06-02T10:00:00.000Z",
      },
      {
        journalEntryId: "300",
        bankTransactionId: null,
        description: "",
        amount: 600.5,
        matchedAt: "",
      },
    ]);
  });
});

describe("a new asset's draft", () => {
  it("has no category until one is chosen", () => {
    expect(emptyAssetDraft("2026-06-01").category).toBe("");
  });
});

describe("assetIssues — depreciation amounts", () => {
  function draftWith(
    depreciation: Partial<typeof EMPTY_DEPRECIATION>,
    extra: Partial<ReturnType<typeof emptyAssetDraft>> = {},
  ) {
    return {
      ...emptyAssetDraft("2026-01-01"),
      name: "Laptop",
      category: "Technology" as const,
      supplierId: "12",
      supplierName: "Harvey Norman",
      costPrice: "1000",
      brand: "Dell",
      assetType: "New",
      // Ex-GST by default, so the cap is the plain $1,000.
      gst: false,
      ...extra,
      depreciation: {
        ...EMPTY_DEPRECIATION,
        enabled: true,
        effectiveLife: "5",
        ...depreciation,
      },
    };
  }

  it("allows residual and cost limit up to the asset value, not a cent over", () => {
    expect(assetIssues(draftWith({ residualValue: "1000" }))).toEqual([]);
    expect(assetIssues(draftWith({ costLimit: "1000" }))).toEqual([]);
    expect(assetIssues(draftWith({ residualValue: "1000.01" }))).toEqual([
      { key: "residualValue", message: "Residual value cannot be greater than asset value" },
    ]);
    expect(assetIssues(draftWith({ costLimit: "1000.01" }))).toEqual([
      { key: "costLimit", message: "Cost limit cannot be greater than asset value" },
    ]);
  });

  it("caps against the ex-GST cost when the price includes GST", () => {
    // $1,000 inc. 10% GST → $909.09 ex.
    const inc = { gst: true };
    expect(assetIssues(draftWith({ residualValue: "909.09" }, inc))).toEqual([]);
    expect(
      assetIssues(draftWith({ residualValue: "909.10" }, inc)).map((i) => i.key),
    ).toEqual(["residualValue"]);
    // At 15% the ex-GST figure is lower still ($869.57).
    expect(assetIssues(draftWith({ residualValue: "869.57" }, inc), 15)).toEqual([]);
    expect(
      assetIssues(draftWith({ residualValue: "869.58" }, inc), 15).map((i) => i.key),
    ).toEqual(["residualValue"]);
  });

  it("rejects negatives, a residual at the cost limit, and an out-of-range rate", () => {
    expect(assetIssues(draftWith({ residualValue: "-1" }))).toEqual([
      { key: "residualValue", message: "Must be 0 or greater" },
    ]);
    expect(assetIssues(draftWith({ residualValue: "500", costLimit: "500" }))).toEqual([
      { key: "residualValue", message: "Residual value must be less than the cost limit" },
    ]);
    const dv = { method: "Diminishing value" as const };
    expect(assetIssues(draftWith({ ...dv, overrideRate: "101" }))).toEqual([
      { key: "overrideRate", message: "Override rate must be between 0 and 100" },
    ]);
    expect(assetIssues(draftWith({ ...dv, overrideRate: "100" }))).toEqual([]);
  });

  it("ignores the rate on straight line, where the field is disabled (as on the depreciation screen)", () => {
    expect(
      assetIssues(draftWith({ method: "Straight line", overrideRate: "500" })),
    ).toEqual([]);
  });

  it("ignores the rate on a full write-off, and everything when disabled", () => {
    expect(
      assetIssues(
        draftWith({ method: "Full depreciation on purchase", overrideRate: "500" }),
      ),
    ).toEqual([]);
    expect(
      assetIssues(draftWith({ enabled: false, residualValue: "-5", costLimit: "x" })),
    ).toEqual([]);
  });

  it("skips the cap while the cost is missing (that's step one's issue)", () => {
    expect(
      assetIssues(draftWith({ residualValue: "50" }, { costPrice: "" })).map((i) => i.key),
    ).toEqual(["costPrice"]);
  });

  it("sends a bad depreciation figure back to the depreciation step", () => {
    expect(firstIncompleteStep(assetIssues(draftWith({ costLimit: "-1" })))).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Unit types
 * ------------------------------------------------------------------ */

describe("unit types", () => {
  it("offers the four units the Inventory module understands", async () => {
    const { UNIT_TYPES } = await import("@/lib/assets");
    expect([...UNIT_TYPES]).toEqual(["Items", "Hours", "Days", "Km"]);
  });

  it("sends the stock item's own lower-case qty_type, Items by default", async () => {
    const { unitTypeToApi } = await import("@/lib/assets");
    expect(unitTypeToApi("Days")).toBe("days");
    expect(unitTypeToApi("Km")).toBe("km");
    expect(unitTypeToApi("")).toBe("items");
    expect(unitTypeToApi("Kilograms")).toBe("items");
  });

  it("reads a stored qty_type back as its label", async () => {
    const { unitTypeFromApi } = await import("@/lib/assets");
    expect(unitTypeFromApi("hours")).toBe("Hours");
    expect(unitTypeFromApi("km")).toBe("Km");
    expect(unitTypeFromApi("Kilograms")).toBe("");
    expect(unitTypeFromApi(null)).toBe("");
  });

  it("sends Days as days for a tracked Inventory asset", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await createAssetApi(
      {
        ...emptyAssetDraft("2026-06-01"),
        name: "Hire days",
        costPrice: "100",
        category: "Inventory",
        tracked: true,
        unitType: "Days",
      },
      REGISTRY,
    );
    expect(formDataToObject(apiMock.post.mock.calls[0][1] as FormData).qty_type).toBe("days");
  });
});

/* ------------------------------------------------------------------ *
 * Documents on an edit
 * ------------------------------------------------------------------ */

describe("syncAssetDocumentsApi", () => {
  const saved = (id: string, name: string) => ({
    id,
    name,
    size: 0,
    dataUrl: `https://cdn.example.com/${name}`,
  });
  const fresh = (name: string) => ({
    name,
    size: 5,
    dataUrl: "data:application/pdf;base64,aGVsbG8=",
  });

  it("attaches documents added in the form and deletes saved ones that were removed", async () => {
    const { syncAssetDocumentsApi } = await import("@/lib/assets");
    apiMock.post.mockResolvedValue({ data: { success: true } });
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    const result = await syncAssetDocumentsApi(
      "501",
      [saved("11", "warranty.pdf"), saved("12", "manual.pdf")],
      [saved("12", "manual.pdf"), fresh("invoice.pdf")],
    );

    expect(result).toEqual({ uploaded: 1, removed: 1, failures: [] });
    expect(apiMock.delete).toHaveBeenCalledTimes(1);
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.asset.deleteAttachment + "/11");
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.asset.uploadAttachment);
    expect(formDataToObject(body as FormData)).toEqual({
      asset_id: "501",
      "files[]": { fileName: "invoice.pdf" },
    });
  });

  it("does nothing when the documents weren't touched", async () => {
    const { syncAssetDocumentsApi } = await import("@/lib/assets");
    const docs = [saved("11", "warranty.pdf")];
    expect(await syncAssetDocumentsApi("501", docs, [...docs])).toEqual({
      uploaded: 0,
      removed: 0,
      failures: [],
    });
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("carries on past a failure and reports it rather than throwing", async () => {
    const { syncAssetDocumentsApi } = await import("@/lib/assets");
    apiMock.delete.mockResolvedValue({ data: { success: false, message: "Not yours" } });
    apiMock.post.mockResolvedValue({ data: { success: true } });

    const result = await syncAssetDocumentsApi(
      "501",
      [saved("11", "warranty.pdf")],
      [fresh("invoice.pdf")],
    );
    expect(result.uploaded).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.failures).toEqual(["warranty.pdf: Not yours"]);
  });

  it("maps a saved document's id and URL off the detail response", async () => {
    mockGetByUrl({
      [apiRoutes.asset.info]: {
        success: true,
        data: {
          asset_id: 501,
          name: "Ute",
          documents: [{ id: 11, file_path: "https://cdn.example.com/w.pdf", file_name: "w.pdf" }],
        },
      },
    });
    const { fetchAssetDetails, isSavedAssetFile } = await import("@/lib/assets");
    const asset = await fetchAssetDetails("501", REGISTRY);
    expect(asset.documents).toEqual([
      { id: "11", dataUrl: "https://cdn.example.com/w.pdf", name: "w.pdf", size: 0 },
    ]);
    expect(isSavedAssetFile(asset.documents[0])).toBe(true);
    expect(isSavedAssetFile({ dataUrl: "data:x", name: "n", size: 1 })).toBe(false);
  });
});


describe("assetIssues — plan without Advanced Assets", () => {
  it("doesn't ask for make, type or depreciation on the basic form", async () => {
    const { assetIssues, emptyAssetDraft } = await import("@/lib/assets");
    const draft = {
      ...emptyAssetDraft("2026-11-04"),
      name: "Drill",
      costPrice: "110",
      supplierName: "Bunnings",
      supplierId: "1",
      category: "Tools" as const,
      brand: "",
      assetType: "",
      depreciation: { ...emptyAssetDraft("2026-11-04").depreciation, enabled: true, effectiveLife: "" },
    };
    const basicKeys = assetIssues(draft, 10, { advanced: false }).map((issue) => issue.key);
    expect(basicKeys).toEqual([]);
    const advancedKeys = assetIssues(draft, 10).map((issue) => issue.key);
    expect(advancedKeys).toEqual(expect.arrayContaining(["brand", "assetType", "effectiveLife"]));
  });
});
