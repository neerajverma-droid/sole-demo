"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { BusinessContactSelect } from "@/components/documents/business-contact-select";
import { fetchBusinessContacts, type BusinessContact } from "@/lib/clients";
import {
  fetchCompanyContacts,
  type CompanyContact,
} from "@/lib/company-contacts";
import type { ContactType } from "@/lib/contacts";

export type ContactPick = {
  /** The company — what the API calls `client_id`. */
  clientId: string;
  /** The person — the API's `contact_id`. */
  contactId: string;
  name: string;
};

/** The person a pick of a company stands for: its primary contact, else its first. */
function personFor(
  people: CompanyContact[],
  clientId: string,
): CompanyContact | null {
  const theirs = people.filter((person) => person.clientId === clientId);
  return theirs.find((person) => person.isPrimary) ?? theirs[0] ?? null;
}

/**
 * The transaction screens' client/supplier picker. It lists the companies
 * themselves — the same list, rows and "add new" dialog as the expense form's
 * supplier field (`fetchBusinessContacts`, `/client`) — so a supplier reads as
 * "Amazon", not as its contact person ("Customer Support"), and a default
 * supplier shows the business's own currency.
 *
 * A transaction still stores both ids, so a pick carries the company and its
 * primary contact person (from `/contact/list`). `contactId` in and out is the
 * person's id, as it always was, so the screens using this didn't change.
 *
 * `type` decides the list: Client for money in, Supplier for money out.
 */
export function ContactPersonSelect({
  type,
  contactId,
  name,
  onSelect,
  error,
  register,
  compact,
}: {
  type: ContactType;
  /** The picked person's `contact_id`, or "" when none is. */
  contactId: string;
  name: string;
  onSelect: (pick: ContactPick) => void;
  error?: string;
  register?: (node: HTMLElement | null) => void;
  compact?: boolean;
}) {
  const companiesQuery = useQuery({
    queryKey: ["business-contacts", type],
    queryFn: () => fetchBusinessContacts(type),
  });
  const peopleQuery = useQuery({
    queryKey: ["company-contacts", type],
    queryFn: () => fetchCompanyContacts(type),
  });
  const companies = React.useMemo<BusinessContact[]>(
    () => companiesQuery.data ?? [],
    [companiesQuery.data],
  );
  const people = React.useMemo(
    () => peopleQuery.data ?? [],
    [peopleQuery.data],
  );

  // The company of the person picked earlier, so the list shows it as chosen.
  const selectedClientId = React.useMemo(
    () =>
      contactId
        ? (people.find((person) => person.contactId === contactId)?.clientId ??
          null)
        : null,
    [contactId, people],
  );

  return (
    <BusinessContactSelect
      type={type}
      contacts={companies}
      loading={companiesQuery.isLoading}
      contactId={selectedClientId}
      contactName={name}
      compact={compact}
      error={error}
      register={register}
      onContactsChanged={() => {
        void companiesQuery.refetch();
        void peopleQuery.refetch();
      }}
      onSelect={(picked) => {
        // `picked.contactId` is the company's id. Its person is its primary
        // contact; one just created in the dialog comes back alongside it.
        const person = personFor(people, picked.contactId);
        onSelect({
          clientId: picked.contactId,
          contactId: person?.contactId ?? picked.primaryContactId ?? "",
          name: picked.contactName,
        });
      }}
    />
  );
}
