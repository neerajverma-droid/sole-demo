/**
 * Contacts — real API layer.
 *
 * What the UI calls a "Contact" is a company/business record, backed by the
 * `/client` REST resource (`apiRoutes.contact.*`). The people at that company
 * are a separate `/contact` resource (`apiRoutes.companyContact.*`), linked
 * by `client_id`. This mirrors `lib/liabilities.ts`'s idioms — raw `Api*`
 * types, a `mapApi...` translator, `buildEncryptedRequestBody` on every
 * non-GET call — split into its own file because the company/person split
 * gives this module more surface than a single-resource one like Liability.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  composeContactPeople,
  type Contact,
  type ContactFormValues,
  type ContactPerson,
  type ContactTab,
} from "@/lib/contacts";
import { contactPayloads } from "@/lib/contact-import";
import type {
  BulkImportCountry,
  BulkImportResult,
  BulkResultRow,
  BulkRow,
} from "@/lib/bulk-import";
import { activeBaseCurrency } from "@/lib/country-context";

/** Accepts the same boolean/number/string-ish values the backend does. */
function parseFlag(
  value: boolean | number | string | undefined | null,
): boolean {
  return !!value && value !== "0";
}

/**
 * The seed data's own "DD Mon YYYY" style, kept for a record loaded from the
 * server too. The server sends `created_at` as `DD-MM-YYYY` (`getClientsListV2`
 * formats it with `moment(...).format('DD-MM-YYYY')`, matching sole-webapp's
 * own display convention) — not a shape `new Date(...)` can parse. For any
 * day past the 12th, `new Date("17-09-2026")` is `Invalid Date` (blank); for
 * day 12 or under it silently swaps day and month instead. Parsed by hand to
 * avoid both.
 */
function formatContactCreated(raw: string | null | undefined): string {
  if (!raw) return "";

  const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  const date = ddmmyyyy
    ? new Date(
        Number(ddmmyyyy[3]),
        Number(ddmmyyyy[2]) - 1,
        Number(ddmmyyyy[1]),
      )
    : new Date(raw);

  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ *
 * List — GET /client/v2, filtered by tab.
 * ------------------------------------------------------------------ */

type ApiContactRow = {
  id: string | number;
  business_name?: string | null;
  email?: string | null;
  type?: string | null;
  created_at?: string | null;
  notes?: string | null;
  primary_contact?: {
    name?: string | null;
    email?: string | null;
    country_calling_code?: string | null;
    phone_number?: string | null;
  } | null;
  address_line1?: string | null;
  city?: string | null;
  country?: string | null;
};

/**
 * Some rows in the `address` table were saved with a literal `Optional("…")`
 * wrapper around the value — looks like an iOS client bug that stringified a
 * Swift optional instead of unwrapping it. Stripped here rather than shown
 * to a user as-is.
 */
function cleanAddressField(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^Optional\("(.*)"\)$/.exec(value.trim());
  return (match ? match[1] : value).trim();
}

function mapApiContactRow(row: ApiContactRow, isDefault: boolean): Contact {
  const primary = row.primary_contact;
  const businessName = row.business_name?.trim() || "";

  return {
    id: String(row.id),
    businessName,
    personName: primary?.name?.trim() || "",
    email: row.email?.trim() || primary?.email?.trim() || "",
    countryCode: primary?.country_calling_code || "+61",
    phone: primary?.phone_number || "",
    abn: "",
    website: "",
    currency: activeBaseCurrency(),
    division: "",
    position: "",
    addressLine1: cleanAddressField(row.address_line1),
    city: cleanAddressField(row.city),
    country: cleanAddressField(row.country),
    notes: row.notes ?? "",
    isPrimary: true,
    type: row.type === "Supplier" ? "Supplier" : "Client",
    // The list row doesn't carry `company_type` — derived from whether it
    // has a business name rather than stored twice, same rule the seed data
    // and the bulk-import mapping already use.
    businessType: businessName ? "Business" : "Individual",
    created: formatContactCreated(row.created_at),
    isDefault,
  };
}

export type ContactsPage = {
  contacts: Contact[];
  total: number;
};

type ApiContactListResponse = {
  success?: boolean;
  data?: ApiContactRow[];
  meta?: {
    all?: number;
    total_clients?: number;
    total_suppliers?: number;
  };
  pagination?: {
    total?: number;
  };
};

function contactListParams(
  tab: ContactTab,
  page: number,
  pageSize: number,
  search: string,
): Record<string, string> {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(pageSize),
  };
  if (search.trim()) params.searchQuery = search.trim();

  if (tab === "Default") {
    params["filter_by[scope]"] = "default";
  } else {
    params.type = tab === "Supplier" ? "2" : "1";
  }

  return params;
}

export async function fetchContactsPage(
  tab: ContactTab,
  page: number,
  pageSize: number,
  search: string,
): Promise<ContactsPage> {
  const response = await api.get<ApiContactListResponse>(
    apiRoutes.contact.list,
    {
      params: contactListParams(tab, page, pageSize, search),
    },
  );

  const rows = response.data?.data ?? [];
  const isDefault = tab === "Default";

  return {
    contacts: rows.map((row) => mapApiContactRow(row, isDefault)),
    total: response.data?.pagination?.total ?? rows.length,
  };
}

/**
 * Every Client-tab contact in one generous page, for screens that need to
 * group or look up *by* contact rather than browse them — "Where your
 * customers are" and its Geographic Insights page — same "one big page
 * instead of real pagination" idiom `fetchExpenses`/`fetchInvoices` use.
 * Suppliers and the global Default directory aren't included: invoices bill
 * clients, not either of those.
 */
export const FETCH_ALL_CLIENTS_LIMIT = 1000;

export async function fetchAllContacts(): Promise<Contact[]> {
  const response = await api.get<ApiContactListResponse>(
    apiRoutes.contact.list,
    {
      params: contactListParams("Client", 1, FETCH_ALL_CLIENTS_LIMIT, ""),
    },
  );
  const rows = response.data?.data ?? [];
  return rows.map((row) => mapApiContactRow(row, false));
}

/**
 * Two lightweight `limit=1` calls: the plain list's own `meta` already
 * carries the account-wide Client/Supplier totals, and the `scope=default`
 * branch's `pagination.total` carries how many global rows exist. Neither
 * needs its rows, just the counters.
 */
export async function fetchContactTabCounts(): Promise<{
  clients: number;
  suppliers: number;
  default: number;
}> {
  const [totals, defaults] = await Promise.all([
    api.get<ApiContactListResponse>(apiRoutes.contact.list, {
      params: { page: "1", limit: "1" },
    }),
    api.get<ApiContactListResponse>(apiRoutes.contact.list, {
      params: { page: "1", limit: "1", "filter_by[scope]": "default" },
    }),
  ]);

  return {
    clients: Number(totals.data?.meta?.total_clients ?? 0),
    suppliers: Number(totals.data?.meta?.total_suppliers ?? 0),
    default: Number(defaults.data?.pagination?.total ?? 0),
  };
}

/* ------------------------------------------------------------------ *
 * Detail — GET /client/:id, for the edit drawer. The list row doesn't carry
 * ABN, notes, address or the people list's own ids.
 * ------------------------------------------------------------------ */

type ApiContactDetailPerson = {
  id?: string | number;
  name?: string | null;
  email?: string | null;
  division?: string | null;
  position?: string | null;
  is_primary?: number | boolean | string;
  phone_number?: string | null;
  country_calling_code?: string | null;
};

type ApiContactDetail = {
  id?: string | number;
  type?: string | null;
  company_type?: string | null;
  business_name?: string | null;
  website?: string | null;
  ABN?: string | null;
  notes?: string | null;
  currency?: string | null;
  address_line1?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  contacts?: ApiContactDetailPerson[] | null;
};

function mapApiDetailPerson(raw: ApiContactDetailPerson): ContactPerson {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    personName: raw.name?.trim() || "",
    email: raw.email?.trim() || "",
    countryCode: raw.country_calling_code || "+61",
    phone: raw.phone_number || "",
    division: raw.division || "",
    position: raw.position || "",
    isPrimary: parseFlag(raw.is_primary),
  };
}

export async function fetchContactDetail(id: string): Promise<Contact> {
  const response = await api.get<{
    success?: boolean;
    data?: ApiContactDetail;
  }>(`${apiRoutes.contact.getDetails}/${id}`);
  const raw = response.data?.data;
  if (!raw) throw new Error("Contact not found");

  const people = (raw.contacts ?? []).map(mapApiDetailPerson);
  const primary = people.find((person) => person.isPrimary) ?? people[0];

  return {
    id: String(raw.id ?? id),
    businessName: raw.business_name?.trim() || "",
    personName: primary?.personName ?? "",
    email: primary?.email ?? "",
    countryCode: primary?.countryCode ?? "+61",
    phone: primary?.phone ?? "",
    abn: raw.ABN ?? "",
    website: raw.website ?? "",
    currency: raw.currency || activeBaseCurrency(),
    division: primary?.division ?? "",
    position: primary?.position ?? "",
    addressLine1: raw.address_line1 ?? "",
    city: raw.city ?? "",
    country: raw.country ?? "",
    notes: raw.notes ?? "",
    isPrimary: true,
    type: raw.type === "Supplier" ? "Supplier" : "Client",
    businessType: raw.company_type === "individual" ? "Individual" : "Business",
    // Not shown or used anywhere in the edit drawer — the list row already
    // carries the display value for the table.
    created: "",
    people,
    isDefault: false,
  };
}

/* ------------------------------------------------------------------ *
 * Write — company. POST/PATCH/DELETE /client.
 * ------------------------------------------------------------------ */

function contactCompanyWriteFields(values: ContactFormValues) {
  return {
    business_name: values.businessName.trim(),
    website: values.website.trim(),
    ABN: values.abn.trim(),
    notes: values.notes.trim(),
    currency: values.currency,
    address_line1: values.addressLine1.trim(),
    country: values.country.trim(),
    city: values.city.trim(),
    company_type:
      values.businessType === "Individual" ? "individual" : "business",
    type: values.type === "Supplier" ? 2 : 1,
  };
}

function contactPersonWriteFields(person: ContactPerson) {
  return {
    name: person.personName.trim(),
    email: person.email.trim(),
    division: person.division,
    position: person.position,
    is_primary: person.isPrimary ? 1 : 0,
    phone_number: person.phone,
    country_calling_code: person.countryCode,
  };
}

/**
 * Creates the company and every person on it in one call — the backend
 * service creates the Client, then loops `contacts[]` and creates each as a
 * child Contact row in the same transaction, so no follow-up per-person call
 * is needed here (unlike an update, where people are reconciled separately).
 */
export async function createContactApi(
  values: ContactFormValues,
): Promise<Contact> {
  const people = composeContactPeople(values);
  const body = buildEncryptedRequestBody({
    ...contactCompanyWriteFields(values),
    contacts: people.map(contactPersonWriteFields),
  });

  const response = await api.post<{
    success?: boolean;
    message?: string;
    data?: { id?: string | number };
  }>(apiRoutes.contact.create, body);

  if (response.data?.success === false) {
    throw new Error(response.data?.message || "Failed to create contact.");
  }

  const id = response.data?.data?.id;
  if (id == null) {
    throw new Error("The contact saved but the server returned no id.");
  }

  // How many people a contact carries is the thing worth knowing here — a
  // company with six named contacts is a different kind of customer from a
  // sole trader billing one person.
  track(EVENTS.CONTACT_CREATED, { people_count: people.length });

  return {
    id: String(id),
    businessName:
      values.businessType === "Business" ? values.businessName.trim() : "",
    personName: values.personName.trim(),
    email: values.email.trim(),
    countryCode: values.countryCode,
    phone: values.phone,
    abn: values.abn,
    website: values.website,
    currency: values.currency,
    division: values.division,
    position: values.position,
    addressLine1: values.addressLine1,
    city: values.city,
    country: values.country,
    notes: values.notes,
    isPrimary: true,
    type: values.type,
    businessType: values.businessType,
    created: formatContactCreated(new Date().toISOString()),
    people,
    isDefault: false,
  };
}

/** Two people are the same submission if none of their editable fields moved. */
function contactPersonChanged(a: ContactPerson, b: ContactPerson): boolean {
  return (
    a.personName !== b.personName ||
    a.email !== b.email ||
    a.division !== b.division ||
    a.position !== b.position ||
    a.isPrimary !== b.isPrimary ||
    a.phone !== b.phone ||
    a.countryCode !== b.countryCode
  );
}

async function createContactPersonApi(
  clientId: string,
  person: ContactPerson,
): Promise<void> {
  const body = buildEncryptedRequestBody({
    ...contactPersonWriteFields(person),
    client_id: clientId,
  });
  const response = await api.post<{ success?: boolean; message?: string }>(
    apiRoutes.companyContact.create,
    body,
  );
  if (response.data?.success === false) {
    throw new Error(
      response.data?.message || "Failed to add a contact person.",
    );
  }
}

async function updateContactPersonApi(
  personId: string,
  person: ContactPerson,
): Promise<void> {
  const body = buildEncryptedRequestBody(contactPersonWriteFields(person));
  const response = await api.patch<{ success?: boolean; message?: string }>(
    `${apiRoutes.companyContact.update}/${personId}`,
    body,
  );
  if (response.data?.success === false) {
    throw new Error(
      response.data?.message || "Failed to update a contact person.",
    );
  }
}

async function deleteContactPersonApi(personId: string): Promise<void> {
  const response = await api.delete<{ success?: boolean; message?: string }>(
    `${apiRoutes.companyContact.delete}/${personId}`,
    { data: buildEncryptedRequestBody({}) },
  );
  if (response.data?.success === false) {
    throw new Error(
      response.data?.message || "Failed to remove a contact person.",
    );
  }
}

/**
 * Updates the company, then reconciles people one by one against
 * `originalPeople` (the detail fetch's own list, with real ids) — the update
 * endpoint doesn't accept a `contacts` array the way create does. A
 * submitted person with no id is new (POST); one with an id whose fields
 * changed is patched; one from `originalPeople` no longer present is
 * deleted. Unrelated people run in parallel since none of the three kinds of
 * change touch each other.
 */
export async function updateContactApi(
  id: string,
  values: ContactFormValues,
  originalPeople: ContactPerson[],
): Promise<void> {
  const body = buildEncryptedRequestBody(contactCompanyWriteFields(values));
  const response = await api.patch<{ success?: boolean; message?: string }>(
    `${apiRoutes.contact.update}/${id}`,
    body,
  );
  if (response.data?.success === false) {
    throw new Error(response.data?.message || "Failed to update contact.");
  }

  const submitted = composeContactPeople(values);
  const submittedIds = new Set(
    submitted
      .filter((person) => person.id)
      .map((person) => person.id as string),
  );

  const toDelete = originalPeople.filter(
    (person): person is ContactPerson & { id: string } =>
      !!person.id && !submittedIds.has(person.id),
  );

  const toCreate: ContactPerson[] = [];
  const toUpdate: { id: string; person: ContactPerson }[] = [];

  for (const person of submitted) {
    if (!person.id) {
      toCreate.push(person);
      continue;
    }
    const original = originalPeople.find((entry) => entry.id === person.id);
    if (!original || contactPersonChanged(original, person)) {
      toUpdate.push({ id: person.id, person });
    }
  }

  await Promise.all([
    ...toDelete.map((person) => deleteContactPersonApi(person.id)),
    ...toUpdate.map(({ id: personId, person }) =>
      updateContactPersonApi(personId, person),
    ),
    ...toCreate.map((person) => createContactPersonApi(id, person)),
  ]);
}

export async function deleteContactApi(id: string): Promise<void> {
  const response = await api.delete<{ success?: boolean; message?: string }>(
    `${apiRoutes.contact.delete}/${id}`,
    { data: buildEncryptedRequestBody({}) },
  );
  if (response.data?.success === false) {
    throw new Error(response.data?.message || "Failed to delete contact.");
  }
}

/* ------------------------------------------------------------------ *
 * Bulk create — POST /client/bulk/create.
 * ------------------------------------------------------------------ */

/**
 * The envelope `bulkCreateClients` returns.
 *
 * `data` is the per-row log — one entry per submitted row saying whether it
 * was created, skipped as a duplicate, or failed — and `meta` holds the
 * counts. `success` stays `true` for every per-row outcome, so branching on
 * it says nothing about whether anything landed; only a request-level failure
 * (a bad payload, a throw before the loop) comes back false.
 */
type ApiBulkCreateResponse = {
  success?: boolean;
  message?: string;
  data?: {
    row?: number;
    status?: string;
    identifier?: string;
    message?: string;
  }[];
  meta?: {
    total?: number;
    created?: number;
    skipped?: number;
    failed?: number;
  };
};

/**
 * Submits the clean rows.
 *
 * Takes the import engine's generic rows and converts them at this boundary,
 * which is the only place the backend's own field names matter. `country`
 * is the business's, for the currency a row without one starts in.
 */
export async function bulkCreateContactsApi(
  rows: BulkRow[],
  country?: BulkImportCountry,
): Promise<BulkImportResult> {
  if (rows.length === 0) throw new Error("File is empty");

  const body = buildEncryptedRequestBody({
    type: "upload",
    file_data: contactPayloads(rows, country),
  });
  const response = await api.post<ApiBulkCreateResponse>(
    apiRoutes.client.bulkInsert,
    body,
  );

  if (response.data?.success === false) {
    throw new Error(response.data?.message || "Failed to import contacts.");
  }

  const meta = response.data?.meta;

  // The per-row log, kept so the results dialog can say *which* row was
  // skipped and why — "already exists" is the common answer and a bare count
  // can't carry it. The service's own status strings are success/skipped/
  // failed (see `ClientService.bulkCreateClients`).
  const log = response.data?.data ?? [];
  const resultRows: BulkResultRow[] = log.map((entry, index) => ({
    row: Number(entry.row ?? index + 1),
    status:
      entry.status === "success" || entry.status === "skipped"
        ? entry.status
        : "failed",
    identifier: entry.identifier,
    message: entry.message,
  }));

  // With no `meta` there is nothing to count but the log, and with neither,
  // the honest reading of a 2xx is that every row landed.
  /*
   * Counted once, from whichever of the three shapes the server answered in.
   *
   * Reporting from each `return` separately would have been the easy version
   * and the wrong one: two of these branches are the server answering without
   * `meta`, and an event wired to only the third would miss those imports
   * entirely while looking perfectly healthy in the code.
   *
   * `count` is what landed, not what was in the file. Skipped and failed ride
   * alongside rather than being folded in, because "already exists" is the
   * common answer here and an import that skipped most of a file is a
   * different event from one that worked.
   */
  const counts = !meta
    ? resultRows.length === 0
      ? { created: rows.length, failed: 0, skipped: 0 }
      : {
          created: resultRows.filter((e) => e.status === "success").length,
          failed: resultRows.filter((e) => e.status === "failed").length,
          skipped: resultRows.filter((e) => e.status === "skipped").length,
        }
    : {
        created: Number(meta.created ?? 0),
        failed: Number(meta.failed ?? 0),
        skipped: Number(meta.skipped ?? 0),
      };

  track(EVENTS.CONTACTS_IMPORTED, {
    count: counts.created,
    skipped_count: counts.skipped,
    failed_count: counts.failed,
    file_rows: rows.length,
  });

  return {
    ...counts,
    rows: resultRows.length > 0 ? resultRows : undefined,
  };
}
