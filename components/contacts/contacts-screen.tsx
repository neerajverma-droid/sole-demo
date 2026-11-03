"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { Plus, Upload, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { BulkUploadDialog } from "@/components/contacts/bulk-upload-dialog";
import { ContactDrawer } from "@/components/contacts/contact-drawer";
import { ContactsSummary } from "@/components/contacts/contacts-summary";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { DeleteContactDialog } from "@/components/contacts/delete-contact-dialog";
import { useContactTabCountsQuery } from "@/hooks/use-contacts-query";
import {
  bulkUploadOpenAtom,
  contactDrawerAtom,
  contactsQueryAtom,
} from "@/lib/atoms";
import { useCreateIntent } from "@/lib/use-create-intent";
import { useContactsStore } from "@/stores/contacts";

export function ContactsScreen() {
  const setDrawer = useSetAtom(contactDrawerAtom);
  const setBulkOpen = useSetAtom(bulkUploadOpenAtom);
  const createIntent = useCreateIntent();
  const hydrated = useContactsStore((state) => state.hydrated);
  // The summary's own data source — paired with `hydrated` (set once the
  // table's own query lands its first page) the same way
  // `invoices-screen.tsx` pairs `hydrated` with its list query.
  const countsQuery = useContactTabCountsQuery();
  const loading = !hydrated && countsQuery.isLoading;
  /*
   * No clients or suppliers at all, and no search narrowing it — the summary
   * goes and the table is left showing only its own empty state. The same
   * counts the summary and the tabs already read, so nothing extra is
   * fetched.
   */
  const search = useAtomValue(contactsQueryAtom);
  const hasNoContacts =
    countsQuery.isSuccess &&
    countsQuery.data.clients === 0 &&
    countsQuery.data.suppliers === 0 &&
    !search.trim();

  // `?contact=<id>` is how the rest of the app links to one client's record
  // — the dashboard's area drill-in, for one. There's no page per contact,
  // so the record is the drawer, opened on arrival.
  const contactId = useSearchParams()?.get("contact");

  // Deep-linked from a "New contact" entry point: open the drawer on mount.
  React.useEffect(() => {
    if (createIntent) setDrawer({ open: true, editId: null });
  }, [createIntent, setDrawer]);

  /*
   * Opened by id directly rather than checked against the store first: the
   * store only ever holds whichever tab/page the table last fetched, not
   * every contact, so a deep link to a contact outside that page can't be
   * confirmed to exist from here. `ContactDrawer`'s own detail fetch is what
   * finds out — and closes itself if that comes back empty.
   */
  React.useEffect(() => {
    if (contactId) setDrawer({ open: true, editId: contactId });
  }, [contactId, setDrawer]);

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Users}
        title="Contacts"
        description="Your clients and suppliers in one place."
      >
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <Upload />
          Bulk upload
        </Button>
        <Button
          data-tour="add-contact"
          data-usertour="contact-new-button"
          onClick={() => setDrawer({ open: true, editId: null })}
        >
          <Plus />
          New contact
        </Button>
      </PageHeader>

      {/*
        Each half loads on its own: the summary's own tab-counts fetch and
        the table's own paginated fetch fire together rather than one
        waiting on the other.
      */}
      {!hasNoContacts && <ContactsSummary loading={loading} />}
      <ContactsTable />

      <ContactDrawer />
      <DeleteContactDialog />
      <BulkUploadDialog />
    </div>
  );
}
