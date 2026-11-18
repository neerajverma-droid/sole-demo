"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { FileSignature } from "lucide-react";
import { toast } from "sonner";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Shimmer } from "@/components/ui/shimmer";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { commandOpenAtom, viewProposalIdAtom } from "@/lib/atoms";
import { searchTargets, type SearchTarget } from "@/lib/nav";
import { fetchProposalsPage, proposalStatusLabel } from "@/lib/proposals";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/** Below this the server's title search would match nearly everything. */
const MIN_RECORD_QUERY = 2;

/**
 * The events the rail sends for the same destination, so a module opened from
 * search counts as opened. A sub-module (Invoices, under Sales) is its module
 * opened too — the rail's group click — so it sends both. Shortcuts and
 * resources ("Create invoice", a widget) aren't modules and send nothing.
 */
function reportSearchNavigation(target: SearchTarget): void {
  if (target.kind === "module") {
    track(EVENTS.MODULE_CLICKED, { module_name: target.label, source: "search" });
  } else if (target.kind === "sub_module" && target.parent) {
    track(EVENTS.MODULE_CLICKED, { module_name: target.parent, source: "search" });
    track(EVENTS.SUB_MODULE_CLICKED, {
      module_name: target.parent,
      sub_module_name: target.label,
      source: "search",
    });
  }
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useAtom(commandOpenAtom);
  const setViewProposalId = useSetAtom(viewProposalIdAtom);
  const targets = React.useMemo(() => searchTargets(), []);
  const [query, setQuery] = React.useState("");
  const debounced = useDebouncedValue(query.trim(), 300);

  // Proposals by name, straight from the server's own title search.
  const proposalsQuery = useQuery({
    queryKey: ["command-proposals", debounced],
    queryFn: () => fetchProposalsPage(1, 5, debounced),
    enabled: open && debounced.length >= MIN_RECORD_QUERY,
    staleTime: 30_000,
  });
  const proposals =
    debounced.length >= MIN_RECORD_QUERY ? (proposalsQuery.data?.proposals ?? []) : [];
  const searchingProposals =
    query.trim().length >= MIN_RECORD_QUERY &&
    (query.trim() !== debounced || proposalsQuery.isFetching);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // `key` is optional on KeyboardEvent at runtime: password managers, IME
      // composition and other synthetic keydowns arrive without one, and
      // reading `.toLowerCase()` off that crashed the whole app.
      if (event.key?.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search pages, actions and proposals"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searchingProposals ? "Searching…" : "No matches. Try another term."}
        </CommandEmpty>
        {(proposals.length > 0 || searchingProposals) && (
          <CommandGroup heading="Proposals">
            {proposals.map((proposal) => (
              <CommandItem
                key={proposal.id}
                // The server already matched on the title; the typed query
                // rides along so cmdk's own filter never hides a server hit.
                value={`proposal-${proposal.id} ${proposal.title} ${proposal.clientName} ${query}`}
                onSelect={() => {
                  setOpen(false);
                  setViewProposalId(proposal.id);
                  router.push("/proposals");
                }}
              >
                <FileSignature className="text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {proposal.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    for {proposal.clientName}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {proposalStatusLabel(proposal.status)}
                </span>
              </CommandItem>
            ))}
            {searchingProposals && proposals.length === 0 &&
              // Skeleton rows while the search is on its way.
              [0, 1, 2].map((index) => (
                <CommandItem
                  key={`proposal-skeleton-${index}`}
                  disabled
                  value={`proposal-searching-${index} ${query}`}
                  aria-label="Searching proposals"
                >
                  <Shimmer className="size-4 rounded" />
                  <Shimmer className="h-3.5 w-48" />
                  <Shimmer className="ml-auto h-3 w-12" />
                </CommandItem>
              ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {targets.map((target, index) => (
            <CommandItem
              key={`${target.label}-${index}`}
              value={`${target.label} ${target.parent ?? ""}`}
              onSelect={() => {
                setOpen(false);
                if (target.href) {
                  reportSearchNavigation(target);
                  router.push(target.href);
                } else {
                  toast(`${target.label} is coming soon`);
                }
              }}
            >
              <span className="flex-1">{target.label}</span>
              <span className="text-xs text-muted-foreground">
                {target.parent ?? (target.href ? "Page" : "Coming soon")}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
