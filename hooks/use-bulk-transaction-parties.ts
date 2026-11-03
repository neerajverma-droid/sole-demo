"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";

import {
  fetchInvoiceContacts,
  type InvoiceContact,
} from "@/lib/invoice-clients";
import type { PartyOption } from "@/components/transactions/sole-fields-step";

/**
 * The clients and suppliers the Sole Fields step matches rows against.
 *
 * Both lists at once, because a file almost always contains credits and
 * debits together and fetching lazily would leave half the rows' pickers
 * empty on arrival. sole-webapp's migration page does the same thing — two
 * calls on mount, one per contact type.
 *
 * Each option carries a `contactId` as well as a `clientId` because the
 * upload endpoint wants both: a transaction matches to a company, but it
 * books against a person at that company. Contacts are grouped by client and
 * the primary one wins, which is exactly what the backend falls back to
 * anyway when a rule names a client and no contact.
 */
export function partyOptions(
  contacts: InvoiceContact[] | undefined,
): PartyOption[] {
  const byClient = new Map<string, PartyOption>();

  for (const contact of contacts ?? []) {
    if (!contact.clientId) continue;
    const existing = byClient.get(contact.clientId);
    // Primary wins; otherwise the first one seen keeps the slot, so the
    // choice is stable rather than dependent on response order.
    if (existing && !contact.isPrimary) continue;
    byClient.set(contact.clientId, {
      clientId: contact.clientId,
      contactId: contact.id,
      // The company name is what someone is picking; a client with no
      // business name on file falls back to the person's.
      name: contact.clientName || contact.name || "Unnamed",
    });
  }

  return [...byClient.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function useBulkTransactionParties() {
  const [clients, suppliers] = useQueries({
    queries: [
      {
        queryKey: ["bulk-parties", 1],
        queryFn: () => fetchInvoiceContacts(1),
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: ["bulk-parties", 2],
        queryFn: () => fetchInvoiceContacts(2),
        staleTime: 5 * 60 * 1000,
      },
    ],
  });

  const clientOptions = React.useMemo(
    () => partyOptions(clients.data),
    [clients.data],
  );
  const supplierOptions = React.useMemo(
    () => partyOptions(suppliers.data),
    [suppliers.data],
  );

  const partiesFor = React.useCallback(
    (type: "credit" | "debit") =>
      type === "credit" ? clientOptions : supplierOptions,
    [clientOptions, supplierOptions],
  );

  return {
    partiesFor,
    loading: clients.isLoading || suppliers.isLoading,
    error: clients.isError || suppliers.isError,
  };
}
