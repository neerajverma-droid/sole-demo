/**
 * Bulk contact import — the field contract, validation and payload builder.
 *
 * Ported from sole-webapp's `components/Migration/BulkContactMigrations.js`
 * and its `schemas/ContactBulkUpload.js`, which post `{ type: "upload",
 * file_data: [...] }` to `/client/bulk/create`.
 *
 * The rules worth spelling out, because both are easy to get backwards:
 *
 *  - **Email is required of Clients, not Suppliers.** The backend
 *    deduplicates suppliers by name and clients by email, so only a client
 *    actually needs one.
 *  - **Business name is required only for a Business.** An Individual
 *    contact legitimately has none.
 */
import {
  DEFAULT_BULK_IMPORT_COUNTRY,
  isEmail,
  isPhone,
  type BulkImportCountry,
  type BulkImportSpec,
  type BulkRow,
  type BulkValues,
} from "@/lib/bulk-import";
import { validateFormField } from "@/lib/country-forms";

export const CONTACT_TYPES = ["Client", "Supplier"] as const;
export const CONTACT_BUSINESS_TYPES = ["Business", "Individual"] as const;

/**
 * Every field `normalizeClientRow` understands on the backend, paired with
 * the key it reads it under.
 *
 * The first six are the template's own columns and the six the Review table
 * shows; the rest exist because sole-webapp's importer maps them and the
 * backend stores them, so a contacts export carrying a website, an NDIS
 * number or bank details had no way to bring them across.
 *
 * Built for the business's country: the business-number column is called and
 * checked as that country's number (ABN in Australia, NZBN in New Zealand),
 * though it is still the `ABN` field on the wire and a column headed "ABN"
 * still maps to it.
 */
export function contactImportSpec(
  country: BulkImportCountry = DEFAULT_BULK_IMPORT_COUNTRY,
): BulkImportSpec {
  const businessNumber = country.businessNumber;
  const businessNumberLabel = businessNumber?.label || "Business number";

  return {
    title: "Contact bulk upload",
    description: "Import your clients and suppliers from a CSV file.",
    noun: "contact",
    nounPlural: "contacts",
    migrationStep: "contacts",
    templateFilename: "contact-import-template.csv",
    errorsFilename: "contact-import-errors.csv",
    rowLabelField: "Contact name",

    fields: [
      {
        label: "Contact name",
        apiKey: "Contact Name",
        required: true,
        desc: "Primary contact person",
        aliases: ["contact name", "name", "full name", "primary contact"],
        review: { heading: "Name", editor: { kind: "text" } },
      },
      {
        label: "Business name",
        apiKey: "Business Name",
        desc: "Required for a Business",
        aliases: ["business name", "company", "company name", "organisation"],
        review: { heading: "Business name", editor: { kind: "text" } },
      },
      {
        label: "Contact email",
        apiKey: "Contact Email",
        desc: "Required for a Client",
        aliases: ["contact email", "email", "email address", "e mail"],
        review: {
          heading: "Email",
          editor: { kind: "text", inputMode: "email" },
        },
      },
      {
        label: "Mobile no",
        apiKey: "Mobile No",
        desc: "Phone number",
        aliases: ["mobile no", "mobile", "phone", "phone number", "telephone"],
        review: {
          heading: "Phone",
          editor: { kind: "text", inputMode: "tel" },
          mono: true,
        },
      },
      {
        label: "Type",
        apiKey: "Type",
        required: true,
        desc: "Client or Supplier",
        aliases: ["type", "contact type", "client or supplier", "relationship"],
        review: {
          heading: "Type",
          editor: { kind: "select", options: CONTACT_TYPES },
        },
      },
      {
        label: "Business type",
        apiKey: "Business type",
        required: true,
        desc: "Individual or Business",
        aliases: ["business type", "entity type", "individual or business"],
        review: {
          heading: "Business type",
          editor: { kind: "select", options: CONTACT_BUSINESS_TYPES },
        },
      },
      {
        label: "Website",
        apiKey: "Website",
        aliases: ["website", "url", "web", "web address"],
      },
      {
        label: "ABN",
        apiKey: "ABN",
        ...(businessNumberLabel !== "ABN" ? { display: businessNumberLabel } : {}),
        aliases: [
          "abn",
          "australian business number",
          "nzbn",
          "new zealand business number",
          "business number",
        ],
      },
      {
        label: "Currency",
        apiKey: "Currency",
        aliases: ["currency", "currency code"],
      },
      { label: "NDIS no", apiKey: "NDIS No", aliases: ["ndis no", "ndis", "ndis number"] },
      { label: "Plan manager name", apiKey: "Plan Manager Name" },
      { label: "Plan manager NDIS", apiKey: "Plan Manager NDIS" },
      { label: "Account holder", apiKey: "Account Holder" },
      { label: "Account number", apiKey: "Account Number" },
      { label: "Bank name", apiKey: "Bank Name" },
      { label: "BSB", apiKey: "BSB" },
      {
        label: "Contact phone number",
        apiKey: "Contact Phone Number",
        aliases: ["contact phone number", "contact phone"],
      },
      { label: "Contact NDIS no", apiKey: "Contact NDIS No" },
      { label: "Contact plan manager name", apiKey: "Contact Plan Manager Name" },
      { label: "Contact plan manager NDIS", apiKey: "Contact Plan Manager NDIS" },
    ],

    templateColumns: [
      "Business name",
      "Contact name",
      "Contact email",
      "Mobile no",
      "Type",
      "Business type",
    ],

    sampleRows: [
      ["", "Michael Turner", "michael.turner@email.com", "+61411111111", "Client", "Individual"],
      [
        "Williams Health",
        "Emma Williams",
        "emma.williams@email.com",
        "+61422222222",
        "Supplier",
        "Business",
      ],
      [
        "Johnson Logistics",
        "Liam Johnson",
        "liam.johnson@email.com",
        "+61433333333",
        "Client",
        "Business",
      ],
    ],

    issues: [
      {
        message: "Contact name missing",
        summary: "missing a contact name",
        // One character, not two: the backend's rule is a non-empty
        // `contact_name`, and a contact genuinely called "Q" was being refused
        // by a stricter front end than the thing it submits to.
        test: (row) => row["Contact name"].trim().length < 1,
      },
      {
        message: "Invalid email",
        summary: "missing a valid email",
        // Only when there is one. The requirement itself is Client-only, below.
        test: (row) =>
          row["Contact email"].trim() !== "" && !isEmail(row["Contact email"]),
      },
      {
        message: "Email is required for clients",
        summary: "a client with no email",
        test: (row) =>
          /^client$/i.test(row["Type"].trim()) &&
          row["Contact email"].trim() === "",
      },
      {
        message: "Type must be Client or Supplier",
        summary: "missing a valid Type",
        test: (row) => !/^(client|supplier)$/i.test(row["Type"].trim()),
      },
      {
        message: "Business type must be Business or Individual",
        summary: "missing a valid Business type",
        // "bussiness" is tolerated because sole-webapp's schema tolerates it,
        // and files exported from it carry that spelling.
        test: (row) =>
          !/^(business|bussiness|individual)$/i.test(row["Business type"].trim()),
      },
      {
        message: "Business name required for Business",
        summary: "missing a business name",
        test: (row) =>
          /^(business|bussiness)$/i.test(row["Business type"].trim()) &&
          row["Business name"].trim().length < 1,
      },
      {
        message: "Phone must be 8–15 digits",
        summary: "carrying an unusable phone number",
        test: (row) =>
          row["Mobile no"].trim() !== "" && !isPhone(row["Mobile no"]),
      },
      {
        // The server checks the number by the business's country and fails the
        // row; caught here instead so it can be fixed before importing.
        message: `${businessNumberLabel} isn't valid`,
        summary: `carrying an invalid ${businessNumberLabel}`,
        test: (row) =>
          (row["ABN"] ?? "").trim() !== "" &&
          validateFormField(businessNumber, row["ABN"]) !== undefined,
      },
    ],
  };
}

/** The Australian spec — what every import was before the country context. */
export const CONTACT_IMPORT_SPEC: BulkImportSpec = contactImportSpec();

/** One contact row as `/client/bulk/create` expects it. */
export type ContactImportPayload = Record<string, string | number>;

/**
 * Builds the wire payload.
 *
 * Every mapped field travels under the backend's own key; `Type` goes as the
 * numeric code sole-webapp sends (1 for a client, 2 for a supplier), and
 * Currency falls back to the business's own (AUD, NZD) only when the file
 * didn't carry one.
 */
export function contactPayload(
  values: BulkValues,
  country: BulkImportCountry = DEFAULT_BULK_IMPORT_COUNTRY,
): ContactImportPayload {
  const payload: ContactImportPayload = {};

  // Field labels and API keys are the same in every country — only the
  // on-screen names differ — so the Australian spec reads any country's row.
  for (const field of CONTACT_IMPORT_SPEC.fields) {
    const value = (values[field.label] ?? "").trim();
    if (value !== "") payload[field.apiKey ?? field.label] = value;
  }

  payload.Type = /^supplier$/i.test((values["Type"] ?? "").trim()) ? 2 : 1;
  payload.Currency = String(payload.Currency ?? "").trim() || country.currency;

  return payload;
}

export function contactPayloads(
  rows: BulkRow[],
  country: BulkImportCountry = DEFAULT_BULK_IMPORT_COUNTRY,
): ContactImportPayload[] {
  return rows.map((row) => contactPayload(row.values, country));
}
