/**
 * Real per-contact rows — `GET /contact/list`, one row per contact/person,
 * each carrying both its own `contact_id` and its parent company's
 * `client_id`. This is what sole-webapp's own `SearchableClientSelect`
 * actually sources an expense's Supplier field from (not the per-client list
 * `lib/clients.ts` reads) — the two ids are genuinely different, and an
 * expense's real `contact_id` column has to come from here.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import type { ContactType } from "@/lib/contacts";

export type CompanyContact = {
  contactId: string;
  clientId: string;
  /** The contact — a person — themselves. */
  name: string;
  email: string;
  /**
   * The company they belong to. sole-webapp's own picker actually shows and
   * stores the contact's own name as if it were the client's, but this app's
   * Supplier column reads as a business name elsewhere, so it's kept
   * separately rather than copying that mix-up.
   */
  clientName: string;
  /** The company's primary contact — the person a pick of the company stands for. */
  isPrimary: boolean;
};

type ApiCompanyContactRow = {
  contact_id: number | string;
  client_id?: number | string | null;
  name?: string | null;
  email?: string | null;
  client?: { business_name?: string | null } | null;
  is_primary?: number | boolean | null;
};

/** The real backend's own numeric `Client.type` values for this endpoint. */
function apiContactType(type: ContactType): 1 | 2 {
  return type === "Client" ? 1 : 2;
}

/**
 * Every contact on the client or supplier side, plus the global defaults
 * every account shares (Amazon, Google, and so on — `user_id = 0` rows
 * seeded once for everyone). `filter_by[scope]=all` asks the backend to
 * merge those in alongside this account's own, the same param `lib/clients.ts`'s
 * `fetchBusinessContacts` already sends to the sibling `/client` endpoint.
 * No search param exists on this endpoint otherwise (confirmed against
 * sole-ocr — only `type` and `filter_by[scope]` have any effect), so
 * narrowing by what's typed is the caller's own job, same as the per-client
 * list.
 */
export async function fetchCompanyContacts(
  type: ContactType,
): Promise<CompanyContact[]> {
  const response = await api.get<{
    success: boolean;
    data?: ApiCompanyContactRow[];
  }>(apiRoutes.companyContact.list, {
    params: {
      type: apiContactType(type),
      "filter_by[scope]": "all",
    },
  });

  const rows = response.data?.data ?? [];
  return rows
    .filter((row) => row.client_id != null)
    .map((row) => ({
      contactId: String(row.contact_id),
      clientId: String(row.client_id),
      name: row.name?.trim() || "",
      email: row.email?.trim() || "",
      clientName: row.client?.business_name?.trim() || row.name?.trim() || "",
      isPrimary: row.is_primary === true || Number(row.is_primary) === 1,
    }));
}
