/**
 * Real clients and suppliers — the same `clients` table any module's real
 * `client_id` field (a matching rule's, or eventually an expense's, a
 * liability's, a manual transaction's) is validated against, not the mock
 * contacts store `ClientCombobox` reads from.
 *
 * Deliberately separate from `lib/invoice-clients.ts`: invoices need
 * per-contact recipients, currency, ABN and NDIS details for the document
 * itself, none of which a plain "pick or add a client/supplier" field
 * anywhere else has any use for.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { normaliseCurrency, type DocumentCurrency } from "@/lib/invoices";
import type { ContactType } from "@/lib/contacts";

export type BusinessContact = {
  id: string;
  name: string;
  email: string;
  /** Absent or AUD means no conversion is on offer for this one. */
  currency: DocumentCurrency | null;
  abn: string;
  address: string;
  /**
   * The id of this client/supplier's primary *contact* row — a different id
   * space than `id` above (that's the client/company id). Only ever
   * populated right after `createBusinessContactApi` creates one; the plain
   * client list this type is otherwise read from doesn't carry it.
   */
  primaryContactId?: string | null;
};

type ApiClientAddress = {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

type ApiClientRow = {
  client_id: number | string;
  name?: string | null;
  business_name?: string | null;
  email?: string | null;
  currency?: string | null;
  ABN?: string | null;
  address?: ApiClientAddress | null;
  /** This client/supplier's own primary *contact* row's id — a different id space than `client_id`. */
  primary_contact?: number | string | null;
};

/** The real backend's own string values for `filter_by[type]`. */
function apiContactType(type: ContactType): "client" | "supplier" {
  return type === "Client" ? "client" : "supplier";
}

function formatClientAddress(address: ApiClientAddress | null | undefined): string {
  if (!address) return "";
  return [address.address_line1, address.city, address.state, address.country]
    .filter(Boolean)
    .join(", ");
}

function mapClientRow(row: ApiClientRow): BusinessContact {
  return {
    id: String(row.client_id),
    name: row.business_name?.trim() || row.name?.trim() || "",
    email: row.email?.trim() || "",
    currency: normaliseCurrency(row.currency),
    abn: row.ABN?.trim() || "",
    address: formatClientAddress(row.address),
    primaryContactId:
      row.primary_contact != null ? String(row.primary_contact) : null,
  };
}

/**
 * Every client, or every supplier, on this account — plus the global
 * defaults every account shares (Amazon, Google, and so on: `user_id = 0`
 * rows seeded once for everyone). `filter_by[scope]=all` is what asks the
 * backend to OR those in alongside this account's own, rather than the
 * account-only rows a plain request returns.
 */
export async function fetchBusinessContacts(
  type: ContactType,
): Promise<BusinessContact[]> {
  const response = await api.get<{
    success: boolean;
    message?: string;
    data?: { clients_details?: ApiClientRow[] };
  }>(apiRoutes.client.listV2, {
    params: {
      page_size: 100,
      "filter_by[type]": apiContactType(type),
      "filter_by[scope]": "all",
    },
    // The axios instance has no timeout of its own, so a request the server
    // never answers would leave every picker built on this list spinning.
    timeout: 30_000,
  });

  // A 200 that says it failed is still a failure — returning [] here would
  // read as "no clients yet" instead of an error the picker can retry.
  if (response.data?.success === false) {
    throw new Error(
      response.data.message || `Couldn't load ${type.toLowerCase()}s.`,
    );
  }

  const rows = response.data?.data?.clients_details ?? [];
  return rows.map(mapClientRow);
}

/**
 * Adds a client or a supplier with one primary contact — the same `POST
 * /client` route and `contacts` requirement `createInvoiceClientApi`
 * (lib/invoice-clients.ts) already uses for clients, generalized to the
 * other type too. Verified against sole-ocr: `contacts` (min one, name
 * required) is required regardless of `type` — the client row's own
 * name/email are actually derived from the primary contact, not from any
 * top-level field — and email is optional on every contact either way. Only
 * the duplicate check the backend runs differs by type (name-based for a
 * supplier, email-based for a client), which this function doesn't need to
 * branch on.
 */
export async function createBusinessContactApi(
  type: ContactType,
  values: { name: string; email?: string },
): Promise<BusinessContact> {
  const response = await api.post<{
    success: boolean;
    message?: string;
    data?: {
      client_id?: string | number;
      id?: string | number;
      /** The new primary contact's own id — a real column on the client row itself. */
      primary_contact?: string | number | null;
    };
  }>(apiRoutes.client.add, {
    name: values.name,
    email: values.email ?? "",
    type: type === "Client" ? 1 : 2,
    contacts: [
      {
        name: values.name,
        email: values.email ?? "",
        is_primary: 1,
      },
    ],
  });

  const data = response.data?.data;
  if (response.data?.success === false || !data) {
    throw new Error(
      response.data?.message || `Couldn't add that ${type.toLowerCase()}.`,
    );
  }

  const id = data.client_id ?? data.id;
  if (id == null) {
    throw new Error(
      `The ${type.toLowerCase()} saved but the server returned no id.`,
    );
  }

  return {
    id: String(id),
    name: values.name,
    email: values.email?.trim() || "",
    // Nothing this form collects yet — a fresh contact just doesn't have
    // one until it's added on the Contacts screen.
    currency: null,
    abn: "",
    address: "",
    primaryContactId:
      data.primary_contact != null ? String(data.primary_contact) : null,
  };
}
