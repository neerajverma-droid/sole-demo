/**
 * The bulk importers take their defaults and rules from the business's
 * country: Australian files behave exactly as before, a New Zealand business
 * gets NZD contacts and NZBN checks, and a VAT country sees its own word.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const {
  DEFAULT_BULK_IMPORT_COUNTRY,
  autoMapBulkColumns,
  bulkErrorRowsCsv,
  bulkRowIssues,
  bulkTemplateCsv,
  fieldDisplay,
  labelDisplay,
} = await import("@/lib/bulk-import");
const { bulkImportCountry } = await import("@/lib/bulk-import-country");
const { FALLBACK_COUNTRY_CONTEXT } = await import("@/lib/country-context");
const { formField } = await import("@/lib/country-forms");
const { CONTACT_IMPORT_SPEC, contactImportSpec, contactPayload } =
  await import("@/lib/contact-import");
const { INVOICE_IMPORT_SPEC, invoiceImportSpec, invoicePayload } =
  await import("@/lib/invoice-import");
const { expenseImportSpec } = await import("@/lib/expense-import");
const { assetImportSpec } = await import("@/lib/asset-bulk-import");

type Ctx = typeof FALLBACK_COUNTRY_CONTEXT;
type Values = Record<string, string>;

const NZ_CONTEXT: Ctx = {
  ...FALLBACK_COUNTRY_CONTEXT,
  iso2: "NZ",
  name: "New Zealand",
  currency: "NZD",
  standardRate: 15,
  effectiveTax: {
    registered: true,
    enabled: true,
    rate: 15,
    name: "GST",
    source: "country",
    countryRate: 15,
  },
  labels: {
    ...FALLBACK_COUNTRY_CONTEXT.labels,
    tax: "GST",
    business_id: "NZBN",
  },
  forms: {
    contact: {
      fields: [
        formField({
          key: "ABN",
          ref: "business_registration_number",
          label: "NZBN",
          pattern: "^\\d{13}$",
          validator: "nzbn_gs1",
          inputMode: "numeric",
        }),
        formField({
          key: "currency",
          type: "currency",
          label: "Currency",
          required: true,
          default: "NZD",
        }),
      ],
    },
  },
};

const ZA_CONTEXT: Ctx = {
  ...FALLBACK_COUNTRY_CONTEXT,
  iso2: "ZA",
  currency: "ZAR",
  taxType: "VAT",
  effectiveTax: {
    registered: true,
    enabled: true,
    rate: 15,
    name: "VAT",
    source: "country",
    countryRate: 15,
  },
  labels: { ...FALLBACK_COUNTRY_CONTEXT.labels, tax: "VAT" },
  forms: {
    contact: {
      fields: [
        formField({
          key: "currency",
          type: "currency",
          label: "Currency",
          required: true,
          default: "ZAR",
        }),
      ],
    },
  },
};

const AU = bulkImportCountry(FALLBACK_COUNTRY_CONTEXT);
const NZ = bulkImportCountry(NZ_CONTEXT);
const ZA = bulkImportCountry(ZA_CONTEXT);

function values(
  spec: { fields: readonly { label: string }[] },
  overrides: Values,
): Values {
  const row: Values = {};
  for (const field of spec.fields) row[field.label] = "";
  return { ...row, ...overrides };
}

describe("bulkImportCountry", () => {
  it("reads the Australian fallback as the default every import had", () => {
    expect(AU.taxWord).toBe("GST");
    expect(AU.currency).toBe("AUD");
    expect(AU.taxOffered).toBe(true);
    expect(AU.taxRateOn("2026-01-01")).toBe(10);
    expect(AU.businessNumber?.label).toBe("ABN");
    expect(DEFAULT_BULK_IMPORT_COUNTRY.currency).toBe("AUD");
    expect(DEFAULT_BULK_IMPORT_COUNTRY.businessNumber?.label).toBe("ABN");
  });

  it("reads New Zealand's currency, rate and business number", () => {
    expect(NZ.currency).toBe("NZD");
    expect(NZ.taxRateOn("2026-01-01")).toBe(15);
    expect(NZ.businessNumber?.label).toBe("NZBN");
    expect(ZA.taxWord).toBe("VAT");
    expect(ZA.businessNumber).toBeNull();
  });
});

describe("contacts", () => {
  const base = {
    "Contact name": "Aroha",
    "Contact email": "aroha@example.nz",
    Type: "Client",
    "Business type": "Individual",
  };

  it("AU: unchanged — the ABN column, checked as an ABN, AUD by default", () => {
    const spec = contactImportSpec(AU);
    const abn = spec.fields.find((field) => field.label === "ABN")!;
    expect(fieldDisplay(abn)).toBe("ABN");
    expect(abn.display).toBeUndefined();
    expect(
      bulkRowIssues(spec, values(spec, { ...base, ABN: "51 824 753 556" })),
    ).toEqual([]);
    expect(
      bulkRowIssues(spec, values(spec, { ...base, ABN: "51824753557" })),
    ).toEqual(["ABN isn't valid"]);
    expect(bulkRowIssues(spec, values(spec, { ...base, ABN: "" }))).toEqual([]);
    expect(contactPayload(values(spec, base)).Currency).toBe("AUD");
    expect(
      contactPayload(values(spec, { ...base, Currency: "USD" }), AU).Currency,
    ).toBe("USD");
    expect(CONTACT_IMPORT_SPEC.fields.map((field) => field.label)).toEqual(
      spec.fields.map((field) => field.label),
    );
  });

  it("NZ: the column is called and checked as an NZBN, and contacts default to NZD", () => {
    const spec = contactImportSpec(NZ);
    const field = spec.fields.find((entry) => entry.label === "ABN")!;
    expect(fieldDisplay(field)).toBe("NZBN");
    expect(
      bulkRowIssues(spec, values(spec, { ...base, ABN: "9429041234563" })),
    ).toEqual([]);
    expect(
      bulkRowIssues(spec, values(spec, { ...base, ABN: "51824753556" })),
    ).toEqual(["NZBN isn't valid"]);

    const payload = contactPayload(
      values(spec, { ...base, ABN: "9429041234563" }),
      NZ,
    );
    expect(payload.ABN).toBe("9429041234563");
    expect(payload.Currency).toBe("NZD");
  });

  it("maps a column headed ABN, NZBN or Business number to the same field", () => {
    const spec = contactImportSpec(NZ);
    expect(autoMapBulkColumns(spec, ["ABN"])[0]).toBe("ABN");
    expect(autoMapBulkColumns(spec, ["NZBN"])[0]).toBe("ABN");
    expect(autoMapBulkColumns(spec, ["Business number"])[0]).toBe("ABN");
    expect(autoMapBulkColumns(CONTACT_IMPORT_SPEC, ["ABN"])[0]).toBe("ABN");
  });
});

describe("invoices", () => {
  const base = {
    "Client name": "Williams Health",
    "Sub total": "1200",
    "Total GST": "120",
  };

  it("AU: the template, examples and payload are what they always were", () => {
    expect(bulkTemplateCsv(invoiceImportSpec(AU))).toBe(
      bulkTemplateCsv(INVOICE_IMPORT_SPEC),
    );
    expect(INVOICE_IMPORT_SPEC.sampleRows.map((row) => row[5])).toEqual([
      "120.00",
      "86.00",
      "45.00",
    ]);
    expect(invoicePayload(values(INVOICE_IMPORT_SPEC, base)).currency).toBe(
      "AUD",
    );
  });

  it("NZ: examples taxed at 15%, and a new client in NZD", () => {
    const spec = invoiceImportSpec(NZ);
    expect(spec.sampleRows.map((row) => row[5])).toEqual([
      "180.00",
      "129.00",
      "67.50",
    ]);
    const payload = invoicePayload(values(spec, base), NZ);
    expect(payload.currency).toBe("NZD");
    // The file's figures are kept as given.
    expect(payload).toMatchObject({
      sub_total: 1200,
      total_gst: 120,
      total: 1320,
    });
  });

  it("a business that doesn't charge tax gets untaxed examples", () => {
    const spec = invoiceImportSpec({ ...NZ, taxOffered: false });
    expect(spec.sampleRows.map((row) => row[5])).toEqual([
      "0.00",
      "0.00",
      "0.00",
    ]);
  });

  it("VAT: the column and its message use the country's word, and a GST header still maps", () => {
    const spec = invoiceImportSpec(ZA);
    expect(labelDisplay(spec, "Total GST")).toBe("Total VAT");
    expect(bulkTemplateCsv(spec).split("\r\n")[0]).toContain("Total VAT");
    expect(
      bulkRowIssues(spec, values(spec, { ...base, "Total GST": "" })),
    ).toEqual(["Total VAT must be a number"]);
    expect(autoMapBulkColumns(spec, ["Total GST"])[0]).toBe("Total GST");
    expect(autoMapBulkColumns(spec, ["Total VAT"])[0]).toBe("Total GST");
    expect(autoMapBulkColumns(spec, ["VAT"])[0]).toBe("Total GST");
    expect(
      spec.fields.find((field) => field.label === "Total GST")?.review?.heading,
    ).toBe("VAT");
  });

  it("the error file is headed the way the template is", () => {
    const spec = invoiceImportSpec(ZA);
    const csv = bulkErrorRowsCsv(spec, [
      {
        index: 0,
        values: values(spec, { "Client name": "X" }),
        issues: ["bad"],
      },
    ]);
    expect(csv.split("\r\n")[0]).toContain("Total VAT");
  });
});

describe("expenses and assets", () => {
  const categories = [{ id: "72", name: "Office supplies" }];

  it("AU and NZ: GST wording unchanged", () => {
    for (const country of [AU, NZ]) {
      const expense = expenseImportSpec(categories, country);
      expect(
        expense.fields.find((field) => field.label === "GST included")?.display,
      ).toBeUndefined();
      const asset = assetImportSpec(categories, country);
      expect(
        asset.fields.find((field) => field.label === "GST amount")?.display,
      ).toBeUndefined();
    }
    const asset = assetImportSpec(categories, AU);
    expect(
      bulkRowIssues(asset, values(asset, { "GST amount": "ten" })),
    ).toContain("GST amount must be a number");
  });

  it("VAT: the columns and messages use the country's word", () => {
    const expense = expenseImportSpec(categories, ZA);
    expect(labelDisplay(expense, "GST included")).toBe("VAT included");
    expect(bulkRowIssues(expense, values(expense, {}))).toContain(
      "VAT included must be Yes or No",
    );
    expect(autoMapBulkColumns(expense, ["GST included"])[0]).toBe(
      "GST included",
    );

    const asset = assetImportSpec(categories, ZA);
    expect(labelDisplay(asset, "GST amount")).toBe("VAT amount");
    expect(
      bulkRowIssues(asset, values(asset, { "GST amount": "ten" })),
    ).toContain("VAT amount must be a number");
    expect(autoMapBulkColumns(asset, ["VAT amount"])[0]).toBe("GST amount");
  });
});
