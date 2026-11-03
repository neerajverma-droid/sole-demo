"use client";

import * as React from "react";
import { useAtom, useSetAtom } from "jotai";
import { Globe, Pencil, Search, SearchX, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Highlight } from "@/components/contacts/highlight";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useContactsQuery,
  useContactTabCountsQuery,
} from "@/hooks/use-contacts-query";
import {
  contactDrawerAtom,
  contactsQueryAtom,
  contactsTabAtom,
  deleteContactIdAtom,
} from "@/lib/atoms";
import {
  CONTACT_TABS,
  contactDisplayName,
  contactInitials,
  formatPhone,
  type Contact,
  type ContactTab,
} from "@/lib/contacts";
import type { PageInfo, PageSize } from "@/lib/products";
import { cn } from "@/lib/utils";

/** Which of `useContactTabCountsQuery`'s figures each tab shows. */
const TAB_COUNT_KEYS: Record<ContactTab, "clients" | "suppliers" | "default"> = {
  Client: "clients",
  Supplier: "suppliers",
  Default: "default",
};

export function ContactsTable() {
  const [tab, setTab] = useAtom(contactsTabAtom);
  const [query, setQuery] = useAtom(contactsQueryAtom);
  const setDrawer = useSetAtom(contactDrawerAtom);
  const setDeleteId = useSetAtom(deleteContactIdAtom);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<PageSize>(10);

  // Waits for typing to pause before it hits the API — the search box reads
  // the atom directly, so it keeps updating instantly either way.
  const debouncedQuery = useDebouncedValue(query, 350);

  // Back to page one whenever the tab or the search underneath changes shape
  // — an old page number surviving either would risk landing past its last page.
  const previousKey = React.useRef(`${tab}:${debouncedQuery}`);
  React.useEffect(() => {
    const key = `${tab}:${debouncedQuery}`;
    if (previousKey.current === key) return;
    previousKey.current = key;
    setPage(1);
  }, [tab, debouncedQuery]);

  const contactsQuery = useContactsQuery(tab, page, pageSize, debouncedQuery);
  const countsQuery = useContactTabCountsQuery();
  const counts = countsQuery.data;

  const rows = contactsQuery.data?.contacts ?? [];
  const total = contactsQuery.data?.total ?? 0;
  /*
   * True on the first load, and for as long as a tab, search or page change
   * is still in flight. `keepPreviousData` leaves the previous page's rows
   * sitting in `contactsQuery.data` while the new request is out — without
   * this, that stale page would flash on screen under the tab or search that
   * just replaced it instead of a shimmer saying a fresh page is coming.
   */
  const rowsLoading = contactsQuery.isLoading || contactsQuery.isPlaceholderData;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  const needle = query.trim();

  /*
   * No clients or suppliers at all — rather than a search that matched
   * nothing — so the tabs, search and pager have nothing to act on: just the
   * empty state, same as the rules table. Both search values count, so a
   * search still settling never collapses the toolbar mid-keystroke, and an
   * errored count never lands here.
   */
  if (
    countsQuery.isSuccess &&
    countsQuery.data.clients === 0 &&
    countsQuery.data.suppliers === 0 &&
    !needle &&
    !debouncedQuery.trim()
  ) {
    return (
      <EmptyState
        searching={false}
        tab={null}
        onClear={() => setQuery("")}
        onNew={() => setDrawer({ open: true, editId: null })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          data-tour="contact-tabs"
          data-usertour="contact-tabs"
          value={tab}
          onValueChange={(value) => setTab(value as ContactTab)}
        >
          <TabsList>
            {CONTACT_TABS.map((option) => {
              // Default is a different kind of row — global and unowned,
              // not one of the account's own clients or suppliers — so its
              // trigger gets its own icon and accent rather than reading
              // like a third, equal category.
              const isDefaultTab = option === "Default";
              const count = counts?.[TAB_COUNT_KEYS[option]];

              return (
                <TabsTrigger
                  key={option}
                  value={option}
                  className={cn(
                    "gap-1.5 font-normal",
                    isDefaultTab &&
                      "text-primary data-[state=active]:text-primary",
                  )}
                >
                  {isDefaultTab && (
                    <Globe className="size-3.5" aria-hidden />
                  )}
                  {option}
                  {countsQuery.isLoading ? (
                    <Shimmer className="h-3.5 w-4" aria-hidden />
                  ) : (
                    <span className="text-xs text-muted-foreground tabular">
                      {count ?? 0}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div
          className="relative w-full sm:w-72"
          data-usertour="contact-search"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts"
            aria-label="Search contacts"
            className="pl-9"
          />
        </div>
      </div>

      {rowsLoading ? (
        <ContactsTableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          searching={!!needle}
          tab={tab}
          onClear={() => setQuery("")}
          onNew={() => setDrawer({ open: true, editId: null })}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* Contact stays left, Actions stays right, and the two
                      columns between read as a centered block of their own. */}
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-center">Phone</TableHead>
                  <TableHead className="text-center">Created</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead className="w-[88px] text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    query={query}
                    onEdit={() =>
                      setDrawer({ open: true, editId: contact.id })
                    }
                    onDelete={() => setDeleteId(contact.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <NumberedPagination
            page={pageInfo}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next as PageSize);
              setPage(1);
            }}
            itemLabel="contact"
            navLabel="Contacts pages"
          />
        </>
      )}
    </div>
  );
}

function ContactRow({
  contact,
  query,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  query: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const displayName = contactDisplayName(contact);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {contactInitials(contact.personName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">
              <Highlight text={displayName} query={query} />
            </p>
            <p className="truncate text-xs text-muted-foreground">
              <Highlight text={contact.email} query={query} />
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-center text-muted-foreground tabular">
        {formatPhone(contact)}
      </TableCell>
      <TableCell className="text-center text-muted-foreground tabular">
        {contact.created || "—"}
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="secondary">{contact.type}</Badge>
      </TableCell>
      <TableCell className="text-right">
        {/* A default/global row is read-only and unowned — no edit or
            delete affordance at all, not even a disabled one. */}
        {!contact.isDefault && (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onEdit}
              aria-label={`Edit ${displayName}`}
            >
              <Pencil className="size-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onDelete}
              aria-label={`Delete ${displayName}`}
            >
              <Trash2 className="size-4 text-muted-foreground" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Stands in for the real table for as long as a page is out — same header,
 * same column alignment, so nothing shifts when the rows land. Modeled on
 * `InvoicesTableSkeleton`.
 */
function ContactsTableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-hidden
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contact</TableHead>
            <TableHead className="text-center">Phone</TableHead>
            <TableHead className="text-center">Created</TableHead>
            <TableHead className="text-center">Type</TableHead>
            <TableHead className="w-[88px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, index) => (
            <TableRow key={`skeleton-${index}`}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Shimmer className="size-8 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Shimmer className="h-4 w-32" />
                    <Shimmer className="h-3 w-40" />
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-4 w-24" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-4 w-20" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Shimmer className="size-8 rounded-full" />
                  <Shimmer className="size-8 rounded-full" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * `tab` is null when the account has no contacts at all; otherwise the copy
 * names the tab that's empty, so an empty Supplier tab doesn't claim there
 * are no contacts while the Client tab has plenty.
 */
function EmptyState({
  searching,
  tab,
  onClear,
  onNew,
}: {
  searching: boolean;
  tab: ContactTab | null;
  onClear: () => void;
  onNew: () => void;
}) {
  const title = searching
    ? "No contacts match your search"
    : tab === "Client"
      ? "No clients yet"
      : tab === "Supplier"
        ? "No suppliers yet"
        : tab === "Default"
          ? "No default contacts"
          : "No contacts yet";

  const body = searching
    ? "Try a different name or email, or clear the search."
    : tab === "Client"
      ? "Add a client to send them invoices and quotes in seconds."
      : tab === "Supplier"
        ? "Add a supplier to record what you buy from them against their name."
        : tab === "Default"
          ? "Shared contacts available to every account will show up here."
          : "Add clients and suppliers to send them invoices and quotes in seconds.";

  // Default contacts aren't the account's own to create, so that tab has
  // nothing to nudge towards.
  const canCreate = !searching && tab !== "Default";

  return (
    <Empty>
      <EmptyMedia>
        {searching ? <SearchX aria-hidden /> : <Users aria-hidden />}
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </div>
      {canCreate && <EmptyCue label="Start here" />}
      {(searching || canCreate) && (
        <EmptyActions>
          {searching ? (
            <Button variant="outline" size="sm" onClick={onClear}>
              Clear search
            </Button>
          ) : (
            <Button size="sm" onClick={onNew}>
              {tab === "Client"
                ? "Add a client"
                : tab === "Supplier"
                  ? "Add a supplier"
                  : "Add your first contact"}
            </Button>
          )}
        </EmptyActions>
      )}
    </Empty>
  );
}
