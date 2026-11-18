/**
 * Bulk asset import — the field contract, validation and payload builder.
 *
 * Ported from sole-webapp's `components/Migration/BulkAssetMigration.js`,
 * which posts `{ assets: [...] }` to `/assets/bulk/create`.
 *
 * As with expenses, the backend wants an `account_subcategory_id`, so the spec
 * is built against the fetched chart of accounts (its Assets accounts — the
 * same ones the old importer's dropdown offered) rather than exported as a
 * constant. That list goes to the AI formatter with the file as id and name;
 * each row comes back with the id of the account it fits, or nothing, and
 * Review shows a dropdown with it chosen, for the person to change.
 *
 * This replaces the older row-at-a-time importer in `lib/asset-import.ts`,
 * whose header warned off `/assets/bulk/create` because the endpoint dropped
 * brand/type/category. It drops brand and type still — those aren't columns
 * here — but it does take the category, and it's the endpoint sole-webapp
 * uses, which is the contract this port is meant to match.
 */
import {
  DEFAULT_BULK_IMPORT_COUNTRY,
  bulkNumber,
  isMoney,
  isPhone,
  matchCategory,
  parseBulkBoolean,
  parseBulkDate,
  todayIso,
  type BulkImportCountry,
  type BulkImportSpec,
  type BulkRow,
  type BulkValues,
} from "@/lib/bulk-import";

/** A category the file can name, as the chart of accounts returns it. */
export type AssetCategoryOption = { id: string; name: string };

const YES_NO = ["Yes", "No"] as const;

/**
 * `country` words the tax column and its messages ("VAT amount" in South
 * Africa); files headed "GST amount" still map — that's the label. The
 * amount itself is the file's: the server stores it (and works a row's tax
 * out at the business's rate only when a row says GST but gives no amount).
 */
export function assetImportSpec(
  categories: readonly AssetCategoryOption[],
  country: BulkImportCountry = DEFAULT_BULK_IMPORT_COUNTRY,
): BulkImportSpec {
  const known = categories.length > 0;
  const categoryOptions = categories.map(({ id, name }) => ({
    value: id,
    label: name,
  }));
  const tax = country.taxWord;
  const renamed = tax !== "GST";
  const taxWord = tax.toLowerCase();

  return {
    title: "Asset bulk upload",
    description: "Import your company assets and equipment from a file.",
    noun: "asset",
    nounPlural: "assets",
    migrationStep: "assets",
    templateFilename: "asset-import-template.csv",
    errorsFilename: "asset-import-errors.csv",
    rowLabelField: "Asset name",

    fields: [
      {
        label: "Asset name",
        apiKey: "name",
        required: true,
        desc: "What it is",
        aliases: ["asset name", "name", "asset", "item", "equipment"],
        review: {
          heading: "Asset",
          editor: { kind: "text" },
          editWidth: "min-w-48",
        },
      },
      {
        label: "Category",
        apiKey: "account_subcategory_id",
        required: true,
        desc: "An asset account from your chart of accounts",
        aliases: ["category", "asset category", "account", "asset type"],
        review: {
          heading: "Category",
          editor: {
            kind: "choice",
            options: categoryOptions,
            placeholder: "Choose a category",
            // A plain-parse fallback leaves the file's own wording in the cell.
            resolve: (raw) => matchCategory(raw, categories) ?? "",
          },
          editWidth: "min-w-56",
        },
      },
      {
        label: "Purchase date",
        apiKey: "date_of_purchase",
        required: true,
        desc: "DD/MM/YYYY",
        aliases: ["purchase date", "date", "date of purchase", "acquired"],
        review: {
          heading: "Purchased",
          editor: { kind: "text" },
          mono: true,
          editWidth: "min-w-36",
        },
      },
      {
        label: "Purchase price",
        apiKey: "price",
        required: true,
        desc: "What you paid, no currency symbol",
        aliases: ["purchase price", "price", "cost", "amount", "value"],
        review: {
          heading: "Price",
          editor: { kind: "text", inputMode: "decimal" },
          mono: true,
          editWidth: "min-w-32",
        },
      },
      {
        label: "Paid",
        apiKey: "paid_with_cash",
        required: true,
        desc: "Yes or No — has it been paid already",
        aliases: ["paid", "is paid", "ispaid", "paid status", "settled"],
        review: {
          heading: "Paid",
          editor: { kind: "select", options: YES_NO, placeholder: "Yes / No" },
          editWidth: "min-w-28",
        },
      },
      {
        label: "GST amount",
        ...(renamed ? { display: `${tax} amount` } : {}),
        apiKey: "gst_amount",
        desc: `Optional — the ${tax} portion of the price`,
        aliases: [
          "gst amount",
          "gst",
          "tax",
          "tax amount",
          ...(renamed ? [taxWord, `${taxWord} amount`] : []),
        ],
        review: {
          heading: tax,
          editor: { kind: "text", inputMode: "decimal" },
          mono: true,
          editWidth: "min-w-28",
        },
      },
      {
        label: "Supplier name",
        apiKey: "client_name",
        desc: "Optional — who you bought it from",
        aliases: ["supplier name", "supplier", "vendor", "seller", "bought from"],
      },
      {
        label: "Supplier phone",
        desc: "Optional",
        aliases: ["supplier phone", "phone", "mobile", "vendor phone"],
        // Checked on import, so it needs a cell to be fixed in.
        review: {
          heading: "Phone",
          editor: { kind: "text", inputMode: "tel" },
          mono: true,
          editWidth: "min-w-44",
        },
      },
      {
        label: "Description",
        desc: "Optional",
        aliases: ["description", "notes", "details", "comment"],
      },
    ],

    templateColumns: [
      "Asset name",
      "Category",
      "Purchase date",
      "Purchase price",
      "Paid",
      "GST amount",
      "Supplier name",
    ],

    sampleRows: [
      [
        "Dell Latitude 5540 laptop",
        categories[0]?.name ?? "Office equipment",
        "01/06/2025",
        "2349.00",
        "Yes",
        "234.90",
        "Harvey Norman Business",
      ],
      [
        "DeWalt mitre saw",
        categories[1]?.name ?? categories[0]?.name ?? "Tools",
        "12/05/2025",
        "1249.00",
        "Yes",
        "124.90",
        "Total Tools",
      ],
      [
        "Delivery van",
        categories[2]?.name ?? categories[0]?.name ?? "Motor vehicles",
        "03/03/2025",
        "38500.00",
        "No",
        "3850.00",
        "Northside Motors",
      ],
    ],

    issues: [
      {
        message: "Asset name is required",
        hint: "Required",
        field: "Asset name",
        summary: "missing an asset name",
        test: (row) => row["Asset name"].trim() === "",
      },
      {
        message: "Category is required",
        hint: "Choose a category",
        field: "Category",
        summary: "without a category",
        // Not while the list is empty (still loading, or failed): there's
        // nothing to choose from, so asking would make every row unfixable.
        test: (row) => known && row["Category"].trim() === "",
      },
      {
        message: "Category isn't one of your asset accounts",
        hint: "Not on your chart of accounts",
        field: "Category",
        summary: "naming a category that isn't on your chart of accounts",
        test: (row) =>
          known &&
          row["Category"].trim() !== "" &&
          !categories.some((category) => category.id === row["Category"].trim()),
      },
      {
        message: "Purchase date must be DD/MM/YYYY",
        hint: "Use DD/MM/YYYY",
        field: "Purchase date",
        summary: "missing a valid Purchase date",
        test: (row) => !parseBulkDate(row["Purchase date"]),
      },
      {
        message: "Purchase date is in the future",
        hint: "Can't be in the future",
        field: "Purchase date",
        summary: "dated in the future",
        test: (row) => {
          const date = parseBulkDate(row["Purchase date"]);
          return date !== null && date > todayIso();
        },
      },
      {
        message: "Purchase price must be a positive number",
        hint: "Enter a valid amount",
        field: "Purchase price",
        summary: "missing a valid Purchase price",
        test: (row) =>
          row["Purchase price"].trim() === "" || !isMoney(row["Purchase price"]),
      },
      {
        message: "Paid must be Yes or No",
        hint: "Choose Yes or No",
        field: "Paid",
        summary: "missing a Yes/No for Paid",
        test: (row) => parseBulkBoolean(row["Paid"]) === null,
      },
      {
        message: `${tax} amount must be a number`,
        hint: "Enter an amount",
        field: "GST amount",
        summary: `carrying an unreadable ${tax} amount`,
        test: (row) =>
          row["GST amount"].trim() !== "" && !isMoney(row["GST amount"]),
      },
      {
        message: `${tax} amount is more than the purchase price`,
        hint: "More than the price",
        field: "GST amount",
        summary: `carrying more ${tax} than price`,
        // Caught here because nothing downstream checks it, and an asset
        // whose GST exceeds its cost quietly distorts every depreciation
        // figure it then feeds.
        test: (row) => {
          const price = bulkNumber(row["Purchase price"]);
          const gst = bulkNumber(row["GST amount"]);
          if (!Number.isFinite(price) || !Number.isFinite(gst)) return false;
          return gst > price;
        },
      },
      {
        message: "Invalid supplier phone",
        hint: "Use 8–15 digits",
        field: "Supplier phone",
        summary: "carrying a malformed phone number",
        test: (row) =>
          row["Supplier phone"].trim() !== "" && !isPhone(row["Supplier phone"]),
      },
    ],
  };
}

/** One asset as `/assets/bulk/create` expects it. */
export type AssetImportPayload = {
  name: string;
  price: number;
  date_of_purchase: string;
  account_subcategory_id: string | null;
  client_name: string | null;
  gst_amount: number;
  paid_with_cash: boolean;
};

export function assetPayload(
  values: BulkValues,
  categories: readonly AssetCategoryOption[],
): AssetImportPayload {
  const price = bulkNumber(values["Purchase price"]);
  const gst = bulkNumber(values["GST amount"]);

  return {
    name: values["Asset name"].trim() || "Unnamed Asset",
    price: Number.isFinite(price) ? Number(price.toFixed(2)) : 0,
    date_of_purchase: parseBulkDate(values["Purchase date"]) ?? todayIso(),
    account_subcategory_id: matchCategory(values["Category"], categories),
    client_name: values["Supplier name"].trim() || null,
    gst_amount: Number.isFinite(gst) ? Number(gst.toFixed(2)) : 0,
    paid_with_cash: parseBulkBoolean(values["Paid"]) === true,
  };
}

export function assetPayloads(
  rows: BulkRow[],
  categories: readonly AssetCategoryOption[],
): AssetImportPayload[] {
  return rows.map((row) => assetPayload(row.values, categories));
}
