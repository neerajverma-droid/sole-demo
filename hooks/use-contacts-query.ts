"use client";

import * as React from "react";
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  bulkCreateContactsApi,
  createContactApi,
  deleteContactApi,
  fetchAllContacts,
  fetchContactDetail,
  FETCH_ALL_CLIENTS_LIMIT,
  fetchContactsPage,
  fetchContactTabCounts,
  updateContactApi,
} from "@/lib/contacts-api";
import type {
  ContactFormValues,
  ContactPerson,
  ContactTab,
} from "@/lib/contacts";
import type { BulkRow } from "@/lib/bulk-import";
import { useBulkImportCountry } from "@/hooks/use-bulk-import-country";
import { useContactsStore } from "@/stores/contacts";

/**
 * Loads one page of the account's contacts and mirrors it into the shared
 * store. `tab`, `page`, `pageSize` and `search` are all the server
 * understands — changing any of them refetches. Mirrors
 * `use-liabilities-query.ts`.
 */
export function useContactsQuery(
  tab: ContactTab,
  page: number,
  pageSize: number,
  search: string,
) {
  const setContacts = useContactsStore((state) => state.setContacts);

  const query = useQuery({
    queryKey: ["contacts", tab, page, pageSize, search],
    queryFn: () => fetchContactsPage(tab, page, pageSize, search),
    /*
     * The previous page's rows stay on screen while the next one is in
     * flight, so a tab, page or search change never empties the table back
     * to a first-load shimmer.
     */
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    if (query.data) setContacts(query.data.contacts);
  }, [query.data, setContacts]);

  return query;
}

/**
 * Every Client-tab contact, for "Where your customers are" and Geographic
 * Insights — they group invoices by contact address, which needs the whole
 * book rather than whichever page happens to be on screen.
 */
export function useAllClientContactsQuery() {
  const setContacts = useContactsStore((state) => state.setContacts);

  const query = useQuery({
    queryKey: ["contacts", "all-clients"],
    queryFn: fetchAllContacts,
  });

  React.useEffect(() => {
    if (query.data) setContacts(query.data);
  }, [query.data, setContacts]);

  return query;
}

/**
 * Clients and suppliers for a "send to" picker. Separate from the table's
 * query so opening a dialog never replaces the page of contacts on screen
 * behind it, and so a screen that never loaded the contacts list still has
 * people to offer.
 */
export function useRecipientContactsQuery(enabled: boolean) {
  const useTab = (tab: ContactTab) =>
    useQuery({
      queryKey: ["contacts", "recipients", tab],
      queryFn: () => fetchContactsPage(tab, 1, FETCH_ALL_CLIENTS_LIMIT, ""),
      enabled,
      staleTime: 60_000,
    });

  const clients = useTab("Client");
  const suppliers = useTab("Supplier");

  return {
    clients: clients.data?.contacts ?? [],
    suppliers: suppliers.data?.contacts ?? [],
    isLoading: clients.isLoading || suppliers.isLoading,
    isError: clients.isError || suppliers.isError,
  };
}

/** The three tab counts — the summary tiles and the tab badges both read this. */
export function useContactTabCountsQuery() {
  return useQuery({
    queryKey: ["contacts", "counts"],
    queryFn: fetchContactTabCounts,
  });
}

/** The edit drawer's initial values — the list row doesn't carry ABN, notes,
 *  address or the people list's own ids, only the detail endpoint does. */
export function useContactDetailQuery(id: string | null) {
  return useQuery({
    queryKey: ["contacts", "detail", id],
    queryFn: () => fetchContactDetail(id as string),
    enabled: !!id,
  });
}

/**
 * Every cache that holds some view of the client/supplier book. The pickers
 * on other screens (invoice and quote client, expense/asset/liability
 * supplier, rule party, transaction contact person…) each keep their own
 * copy under their own key, so invalidating `["contacts"]` alone left a
 * client added on the Contacts page missing from them for the whole
 * five-minute stale window.
 */
const CONTACT_LIST_QUERY_KEYS: readonly (readonly string[])[] = [
  ["contacts"],
  ["invoice-contacts"],
  ["company-contacts"],
  ["rule-clients"],
  ["expense-suppliers"],
  ["expense-supplier-names"],
  ["asset-suppliers"],
  ["liability-suppliers"],
  ["bulk-parties"],
  ["proposal-contacts"],
];

/** Marks every client/supplier list stale, refetching the ones on screen. */
export function invalidateContactLists(queryClient: QueryClient) {
  return Promise.all(
    CONTACT_LIST_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

/** Every mutation below refetches whichever page/search is on screen, and
 *  the tab counts alongside it — a create, edit, delete or bulk import can
 *  shift which rows belong on the current page and how many are in each tab.
 *  The other screens' pickers are marked stale too, so the change is there
 *  the next time one of them opens. */
function useInvalidateContacts() {
  const queryClient = useQueryClient();
  return () => invalidateContactLists(queryClient);
}

export function useCreateContactMutation() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (values: ContactFormValues) => createContactApi(values),
    onSuccess: invalidate,
  });
}

export function useUpdateContactMutation() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: ({
      id,
      values,
      originalPeople,
    }: {
      id: string;
      values: ContactFormValues;
      originalPeople: ContactPerson[];
    }) => updateContactApi(id, values, originalPeople),
    onSuccess: invalidate,
  });
}

export function useDeleteContactMutation() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (id: string) => deleteContactApi(id),
    onSuccess: invalidate,
  });
}

export function useBulkCreateContactsMutation() {
  const invalidate = useInvalidateContacts();
  // A row with no currency starts in the business's own (NZD in New Zealand).
  const country = useBulkImportCountry();
  return useMutation({
    mutationFn: (rows: BulkRow[]) => bulkCreateContactsApi(rows, country),
    onSuccess: invalidate,
  });
}
