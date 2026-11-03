/**
 * Clients and their contacts, as the invoice editor needs them.
 *
 * A client is a company; a contact is a person at it. An invoice is raised
 * against the client (`client_id`) but addressed to one or more of its
 * contacts (`selected_contact`), which is what decides who the email goes to.
 * Selecting a contact therefore locks the client — the picker can't mix
 * recipients from two different companies onto one invoice.
 *
 * The NDIS claim header is derived from here rather than typed: the
 * participant is the client's primary contact, and their NDIS number and plan
 * manager live on that contact record. Nothing on an invoice stores a copy.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { normaliseCurrency, type DocumentCurrency } from "@/lib/invoices";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

type ApiInvoiceContact = {
  contact_id: string | number;
  client_id: string | number;
  name?: string;
  email?: string;
  phone_number?: string;
  country_calling_code?: string;
  profile_color?: string;
  is_primary?: number | boolean;
  ndis_no?: string | null;
  client?: {
    business_name?: string;
    currency?: string | null;
    ABN?: string | null;
    address?: string;
  } | null;
};

export type InvoiceContact = {
  /** The contact's own id — what `selected_contact[].id` carries. */
  id: string;
  /** The company this contact belongs to — what `client_id` carries. */
  clientId: string;
  name: string;
  email: string;
  /** Primary contacts are the NDIS participant and the default recipient. */
  isPrimary: boolean;
  ndisNumber: string;
  /** The company's name, shown as the group heading in the picker. */
  clientName: string;
  /** Absent or AUD means no conversion is on offer for this client. */
  clientCurrency: DocumentCurrency | null;
  clientAbn: string;
  clientAddress: string;
};

function mapInvoiceContact(raw: ApiInvoiceContact): InvoiceContact {
  return {
    id: String(raw.contact_id),
    clientId: String(raw.client_id),
    name: raw.name?.trim() || "",
    email: raw.email?.trim() || "",
    isPrimary: Number(raw.is_primary) === 1,
    ndisNumber: (raw.ndis_no ?? "").trim(),
    clientName: raw.client?.business_name?.trim() || "",
    clientCurrency: normaliseCurrency(raw.client?.currency),
    clientAbn: (raw.client?.ABN ?? "").trim(),
    clientAddress: raw.client?.address?.trim() || "",
  };
}

/**
 * Every contact on every client of this business, newest client first.
 *
 * `type` is the backend's own contact type — 1 for clients, 2 for suppliers.
 * It defaults to clients because that's what an invoice is raised against;
 * the bulk transaction importer's Sole Fields step asks for both, since a
 * credit matches to a client and a debit to a supplier.
 */
export async function fetchInvoiceContacts(
  type: 1 | 2 = 1,
): Promise<InvoiceContact[]> {
  const response = await api.get<{
    success: boolean;
    data?: ApiInvoiceContact[];
  }>(apiRoutes.companyContact.list, { params: { type } });

  return (response.data?.data ?? []).map(mapInvoiceContact);
}

/** The contacts belonging to one client, primary first. */
export function contactsForClient(
  contacts: InvoiceContact[],
  clientId: string | null,
): InvoiceContact[] {
  if (!clientId) return [];
  return contacts
    .filter((contact) => contact.clientId === clientId)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

/**
 * The contact an NDIS claim names as the participant: the client's primary
 * one, falling back to whichever comes first when nothing is flagged.
 */
export function primaryContactFor(
  contacts: InvoiceContact[],
  clientId: string | null,
): InvoiceContact | undefined {
  const group = contactsForClient(contacts, clientId);
  return group.find((contact) => contact.isPrimary) ?? group[0];
}

/* ------------------------------------------------------------------ *
 * NDIS claim details — GET /client/:id
 *
 * The list endpoint carries the participant's NDIS number but not their plan
 * manager, so the claim header fetches the client record once a client is
 * chosen. This is the only NDIS-specific lookup the editor makes.
 * ------------------------------------------------------------------ */

export type ClientNdisDetails = {
  /**
   * Which client this describes.
   *
   * Carried so a caller can prove the details in hand belong to the client
   * currently selected. Without it, the moment between changing client and
   * the new lookup landing shows the previous client's verdict against the
   * new client's name — which reads as the validation accusing the wrong
   * person.
   */
  clientId: string;
  /**
   * The contact row the participant's NDIS details live on (the client's
   * primary contact) — empty when the client has no contact at all, in which
   * case adding the number creates one.
   */
  participantContactId: string;
  participantName: string;
  participantNumber: string;
  planManagerName: string;
  planManagerNumber: string;
};

type ApiClientDetail = {
  contacts?: Array<{
    id: string | number;
    name?: string;
    is_primary?: number | boolean;
    ndis_no?: string | null;
    plan_manager_name?: string | null;
    plan_manager_ndis?: string | null;
  }> | null;
};

export async function fetchClientNdisDetails(
  clientId: string,
): Promise<ClientNdisDetails> {
  const response = await api.get<{ success: boolean; data?: ApiClientDetail }>(
    `${apiRoutes.contact.getDetails}/${clientId}`,
  );

  const contacts = response.data?.data?.contacts ?? [];
  const primary =
    contacts.find((contact) => Number(contact.is_primary) === 1) ?? contacts[0];

  return {
    clientId,
    participantContactId: primary?.id != null ? String(primary.id) : "",
    participantName: primary?.name?.trim() || "",
    participantNumber: (primary?.ndis_no ?? "").trim(),
    planManagerName: (primary?.plan_manager_name ?? "").trim(),
    planManagerNumber: (primary?.plan_manager_ndis ?? "").trim(),
  };
}

/* ------------------------------------------------------------------ *
 * Creating a client — POST /client
 * ------------------------------------------------------------------ */

/**
 * Adds a client with one primary contact.
 *
 * `type: 1` marks it a client rather than a supplier, and the contact is
 * mandatory: a client with no contact row would never come back from
 * `/contact/list`, so the invoice picker would lose the client it just made.
 */
export async function createInvoiceClientApi(values: {
  name: string;
  email: string;
  /** Optional — recorded on the primary contact, where NDIS claims read it. */
  ndisNumber?: string;
}): Promise<{
  clientId: string;
  clientName: string;
  contact: { id: string; name: string; email: string };
}> {
  const response = await api.post<{
    success: boolean;
    message?: string;
    data?: {
      client_id?: string | number;
      id?: string | number;
      contacts?: Array<{ id?: string | number; contact_id?: string | number }>;
    };
  }>(apiRoutes.client.add, {
    name: values.name,
    email: values.email,
    type: 1,
    // No currency: the server starts the client in the business's own (NZD for NZ, AUD for AU).
    contacts: [
      {
        name: values.name,
        email: values.email,
        is_primary: 1,
        ...(values.ndisNumber ? { ndis_no: values.ndisNumber } : {}),
      },
    ],
  });

  const data = response.data?.data;
  if (response.data?.success === false || !data) {
    throw new Error(response.data?.message || "Couldn't add that client.");
  }

  const clientId = data.client_id ?? data.id;
  if (clientId == null) {
    throw new Error("The client saved but the server returned no id.");
  }

  const created = data.contacts?.[0];
  const contactId = created?.contact_id ?? created?.id;

  return {
    clientId: String(clientId),
    clientName: values.name,
    contact: {
      // A response that omits the contact still leaves a usable client — the
      // refetched list supplies the real contact id a moment later.
      id: contactId != null ? String(contactId) : "",
      name: values.name,
      email: values.email,
    },
  };
}

/**
 * The one NDIS rule sole-webapp actually enforces at submit: the participant
 * being claimed for must have an NDIS number on their contact record, since
 * the claim can't be lodged without it.
 */
export function ndisClientIssue(
  details: ClientNdisDetails | undefined,
  /** The client currently on the invoice. Anything else is a stale answer. */
  clientId: string | null,
): string | undefined {
  // No client chosen, nothing loaded, or loaded for a *different* client:
  // there is no verdict to give yet. Reporting one from the previous client
  // is what made this fire against a client that was never checked.
  if (!clientId || !details || details.clientId !== clientId) return undefined;
  if (details.participantNumber) return undefined;

  return details.participantName
    ? `${details.participantName} has no NDIS number. Add it to their contact record before claiming.`
    : "This client's primary contact has no NDIS number.";
}

/* ------------------------------------------------------------------ *
 * Adding a participant's NDIS number — PATCH /contact/:id, POST /contact
 * ------------------------------------------------------------------ */

export type ParticipantNdisValues = {
  ndisNumber: string;
  planManagerName: string;
  planManagerNumber: string;
};

/**
 * Records the participant's NDIS details on the client's primary contact,
 * from inside the invoice or quote being raised — the same fields and the
 * same endpoint sole-webapp's "Edit primary contact" drawer saves
 * (`ndis_no`, `plan_manager_name`, `plan_manager_ndis` on PATCH /contact/:id).
 * A client with no contact at all gets a primary one created, as the old
 * drawer's "add contact" mode did.
 *
 * Returns the details as they now stand, so the caller can clear the claim
 * check immediately rather than waiting on a refetch.
 */
export async function saveParticipantNdisApi(
  details: Pick<
    ClientNdisDetails,
    "clientId" | "participantContactId" | "participantName"
  >,
  values: ParticipantNdisValues,
  /** Names a newly created contact when the client had none. */
  clientName: string,
): Promise<ClientNdisDetails> {
  const fields = {
    ndis_no: values.ndisNumber.trim(),
    plan_manager_name: values.planManagerName.trim(),
    plan_manager_ndis: values.planManagerNumber.trim(),
  };

  let contactId = details.participantContactId;
  let participantName = details.participantName;

  if (contactId) {
    const response = await api.patch<{ success?: boolean; message?: string }>(
      `${apiRoutes.companyContact.update}/${contactId}`,
      buildEncryptedRequestBody(fields),
    );
    if (response.data?.success === false) {
      throw new Error(
        response.data.message || "Couldn't save the NDIS number.",
      );
    }
  } else {
    participantName = clientName.trim() || "Participant";
    const response = await api.post<{
      success?: boolean;
      message?: string;
      data?: { id?: string | number; contact_id?: string | number };
    }>(
      apiRoutes.companyContact.create,
      buildEncryptedRequestBody({
        ...fields,
        client_id: details.clientId,
        name: participantName,
        is_primary: 1,
      }),
    );
    if (response.data?.success === false) {
      throw new Error(
        response.data.message || "Couldn't save the NDIS number.",
      );
    }
    const created = response.data?.data?.id ?? response.data?.data?.contact_id;
    contactId = created != null ? String(created) : "";
  }

  return {
    clientId: details.clientId,
    participantContactId: contactId,
    participantName,
    participantNumber: fields.ndis_no,
    planManagerName: fields.plan_manager_name,
    planManagerNumber: fields.plan_manager_ndis,
  };
}
