import { create } from "zustand";

import type { Contact } from "@/lib/contacts";

/**
 * The client source of truth for contacts — mirrors whichever page of
 * `fetchContactsPage` (lib/contacts-api.ts, `/client/v2`) is currently on
 * screen, not the whole account, same pattern as `stores/liabilities.ts`.
 * Enough for the row-action dialogs and the invoices/quotes/expenses
 * pickers to look up a contact by id; creating, editing, deleting and bulk
 * importing all go through the real API and then invalidate the
 * `["contacts"]` query.
 */
type ContactsState = {
  contacts: Contact[];
  /** True once the first real fetch lands — lets screens skip the empty state while loading. */
  hydrated: boolean;
  /** Replaces the contacts list wholesale with a fresh page of results. */
  setContacts: (contacts: Contact[]) => void;
};

export const useContactsStore = create<ContactsState>()((set) => ({
  contacts: [],
  hydrated: false,

  setContacts: (contacts) => set({ contacts, hydrated: true }),
}));
