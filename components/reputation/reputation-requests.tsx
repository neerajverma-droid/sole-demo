"use client";

import * as React from "react";
import { Mail, RotateCcw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { FilterPill } from "@/components/ui/filter-pills";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { ClientCell, TonePill } from "@/components/reputation/reputation-ui";
import { paginate } from "@/lib/products";
import {
  canResend,
  feedbackClientLabel,
  feedbackReferenceLabel,
  isQueued,
  matchesRequestFilter,
  REQUEST_FILTERS,
  requestSentDate,
  requestStatus,
  type ReputationFeedback,
  type RequestFilter,
} from "@/lib/reputation";

export function ReputationRequestsTab({
  requests,
  loading,
  onSendNew,
  onResend,
}: {
  requests: ReputationFeedback[];
  loading: boolean;
  onSendNew: () => void;
  onResend: (request: ReputationFeedback) => void;
}) {
  const [filter, setFilter] = React.useState<RequestFilter>("All");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  React.useEffect(() => setPage(1), [filter]);

  const filtered = requests.filter((request) => matchesRequestFilter(request, filter));
  const paged = paginate(filtered, page, pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter requests by status">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">Status</span>
            {REQUEST_FILTERS.map((option) => (
              <FilterPill
                key={option}
                active={filter === option}
                variant="soft"
                onSelect={() => setFilter(option)}
                className="px-3 py-1 text-xs"
              >
                {option}
              </FilterPill>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Auto-sent after job completion per your delay setting.</p>
        </div>
        <Button onClick={onSendNew} className="shrink-0">
          <Send />
          Send review request
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Client</TableHead>
              <TableHead className="text-center">Channels</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="px-4 text-right">
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell className="px-4" colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5}>
                  <Empty className="border-0 py-10 shadow-none">
                    <EmptyTitle>No requests found</EmptyTitle>
                    <EmptyDescription>
                      {filter === "All"
                        ? "Requests will appear here once jobs complete or you send one."
                        : `No requests match the “${filter}” filter.`}
                    </EmptyDescription>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              paged.rows.map((request) => {
                const status = requestStatus(request);
                const queued = isQueued(request);
                return (
                  <TableRow key={request.id}>
                    <TableCell className="px-4 py-3">
                      <ClientCell name={feedbackClientLabel(request)} subtitle={feedbackReferenceLabel(request)} />
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      <Mail className="inline size-4" aria-label="Email" />
                    </TableCell>
                    <TableCell className="text-sm tabular text-muted-foreground">
                      {queued ? <span className="italic">Queued</span> : requestSentDate(request)}
                    </TableCell>
                    <TableCell>
                      <TonePill tone={status.tone}>{status.label}</TonePill>
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      {canResend(request) ? (
                        <Button variant="outline" size="sm" onClick={() => onResend(request)}>
                          {queued ? <Send /> : <RotateCcw />}
                          {queued ? "Send now" : "Resend"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {!loading && filtered.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <TablePagination
              page={paged}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              label="requests"
            />
          </div>
        )}
      </div>
    </div>
  );
}
