/**
 * Bulk product & service import — the field contract, validation and the
 * conversion to an inventory draft.
 *
 * The same shape as the other importers (`asset-bulk-import.ts`, …): a
 * `BulkImportSpec` for the shared `BulkImportDialog`, so Products gets the
 * same Import → Review → Done flow, the same AI formatting and the same
 * inline-editable review table rather than a wizard of its own. Items are not
 * a Data Migration Center step, so there is no `migrationStep` — the AI
 * endpoint is told what this is through `aiType`.
 */
import {
  DEFAULT_BULK_IMPORT_COUNTRY,
  bulkNumber,
  isMoney,
  parseBulkBoolean,
  type BulkImportCountry,
  type BulkImportSpec,
  type BulkRow,
  type BulkValues,
} from "@/lib/bulk-import";
import type { ItemDraft } from "@/lib/inventory";
import {
  draftFromImportRow,
  type ParsedProductRow,
} from "@/lib/products";
import type { ProductTaxLabels } from "@/lib/product-tax";

const TYPES = ["Product", "Service"] as const;
const QUANTITY_TYPES = ["Items", "Hours", "Days", "Km"] as const;
const YES_NO = ["Yes", "No"] as const;

const isOneOf = (options: readonly string[], value: string) =>
  options.some((option) => option.toLowerCase() === value.trim().toLowerCase());

/** An optional whole number: empty is fine, "12" is fine, "1.5" and "abc" aren't. */
const isWholeNumber = (value: string) => /^\d+$/.test(value.trim());

/**
 * `country` words the tax column ("VAT" in South Africa); a file headed "GST"
 * still maps, because that's the field's label.
 */
export function productImportSpec(
  country: BulkImportCountry = DEFAULT_BULK_IMPORT_COUNTRY,
): BulkImportSpec {
  const tax = country.taxWord;
  const renamed = tax !== "GST";

  return {
    title: "Bulk import products & services",
    description: "Import the things you sell from a file.",
    noun: "item",
    nounPlural: "items",
    aiType: "products",
    templateFilename: "product-import-template.csv",
    errorsFilename: "product-import-errors.csv",
    rowLabelField: "Item name",

    fields: [
      {
        label: "Item name",
        required: true,
        desc: "What you're selling",
        aliases: ["item name", "name", "item", "product", "product name", "service"],
        review: { heading: "Item", editor: { kind: "text" } },
      },
      {
        label: "Type",
        required: true,
        desc: "Product or Service",
        aliases: ["type", "item type", "product or service"],
        review: {
          heading: "Type",
          editor: { kind: "select", options: TYPES, placeholder: "Type" },
        },
      },
      {
        label: "Quantity type",
        required: true,
        desc: "Items, Hours, Days or Km",
        aliases: ["quantity type", "unit", "units", "unit of measure", "uom", "per"],
        review: {
          heading: "Quantity type",
          editor: {
            kind: "select",
            options: QUANTITY_TYPES,
            placeholder: "Quantity type",
          },
        },
      },
      {
        label: "Description",
        desc: "Shown on the invoice line",
        aliases: ["description", "details", "notes", "sale description"],
      },
      {
        label: "Cost price",
        desc: "Number, no currency symbol",
        aliases: ["cost price", "cost", "purchase price", "buy price"],
      },
      {
        label: "Selling price",
        desc: "Number, no currency symbol",
        aliases: ["selling price", "sale price", "price", "unit price", "rate"],
        review: {
          heading: "Selling price",
          editor: { kind: "text", inputMode: "decimal" },
          mono: true,
        },
      },
      {
        label: "GST",
        ...(renamed ? { display: tax } : {}),
        desc: `Yes or No — does ${tax} apply`,
        aliases: [
          "gst",
          "tax",
          "taxable",
          "tax applies",
          ...(renamed ? [tax.toLowerCase()] : []),
        ],
        review: {
          heading: tax,
          editor: { kind: "select", options: YES_NO, placeholder: "Yes / No" },
        },
      },
      {
        label: "Track inventory",
        desc: "Yes or No",
        aliases: ["track inventory", "tracked", "track stock", "inventory item"],
      },
      {
        label: "Inventory count",
        desc: "Whole number",
        aliases: ["inventory count", "stock", "quantity", "on hand", "opening stock"],
      },
    ],

    templateColumns: [
      "Item name",
      "Type",
      "Quantity type",
      "Description",
      "Cost price",
      "Selling price",
      "GST",
      "Track inventory",
      "Inventory count",
    ],

    sampleRows: [
      [
        "Consulting hour",
        "Service",
        "Hours",
        "Consulting, billed hourly",
        "",
        "180",
        "Yes",
        "No",
        "",
      ],
      [
        "Timber panel — oak",
        "Product",
        "Items",
        "Oak panel 1200x600",
        "42",
        "89",
        "Yes",
        "Yes",
        "128",
      ],
    ],

    issues: [
      {
        message: "Item name is required",
        field: "Item name",
        summary: "missing an item name",
        test: (row) => row["Item name"].trim() === "",
      },
      {
        message: "Type must be Product or Service",
        field: "Type",
        summary: "missing a Type of Product or Service",
        test: (row) => !isOneOf(TYPES, row["Type"]),
      },
      {
        message: "Quantity type must be Items, Hours, Days or Km",
        field: "Quantity type",
        summary: "missing a Quantity type of Items, Hours, Days or Km",
        test: (row) => !isOneOf(QUANTITY_TYPES, row["Quantity type"]),
      },
      {
        message: "Cost price isn't a valid number",
        field: "Cost price",
        summary: "carrying an unreadable Cost price",
        test: (row) => row["Cost price"].trim() !== "" && !isMoney(row["Cost price"]),
      },
      {
        message: "Selling price isn't a valid number",
        field: "Selling price",
        summary: "carrying an unreadable Selling price",
        test: (row) =>
          row["Selling price"].trim() !== "" && !isMoney(row["Selling price"]),
      },
      {
        message: `${tax} must be Yes or No`,
        field: "GST",
        summary: `carrying a ${tax} value that isn't Yes or No`,
        test: (row) => row["GST"].trim() !== "" && parseBulkBoolean(row["GST"]) === null,
      },
      {
        message: "Track inventory must be Yes or No",
        field: "Track inventory",
        summary: "carrying a Track inventory value that isn't Yes or No",
        test: (row) =>
          row["Track inventory"].trim() !== "" &&
          parseBulkBoolean(row["Track inventory"]) === null,
      },
      {
        message: "Inventory count must be a whole number",
        field: "Inventory count",
        summary: "carrying an Inventory count that isn't a whole number",
        test: (row) =>
          row["Inventory count"].trim() !== "" &&
          !isWholeNumber(row["Inventory count"]),
      },
    ],
  };
}

/** A price cell in the form the item form stores: no symbol, at most two decimals. */
function cleanPrice(value: string): string {
  const amount = bulkNumber(value);
  if (!Number.isFinite(amount)) return "";
  return String(Number(amount.toFixed(2)));
}

/** A valid review row, as the product parser's row shape, ready for a draft. */
function parsedRow(values: BulkValues): ParsedProductRow {
  const yesNo = (value: string) => (parseBulkBoolean(value) ? "Yes" : "No");
  return {
    name: values["Item name"],
    type: values["Type"],
    quantityType: values["Quantity type"],
    description: values["Description"],
    costPrice: cleanPrice(values["Cost price"]),
    salePrice: cleanPrice(values["Selling price"]),
    gst: yesNo(values["GST"]),
    tracked: yesNo(values["Track inventory"]),
    inventoryCount: values["Inventory count"].trim(),
    issues: [],
  };
}

/** One review row as the inventory draft the API takes. */
export function productDraftFromBulkRow(
  row: BulkRow,
  industry: ItemDraft["industry"],
  labels: ProductTaxLabels,
): ItemDraft {
  return draftFromImportRow(parsedRow(row.values), industry, labels);
}
