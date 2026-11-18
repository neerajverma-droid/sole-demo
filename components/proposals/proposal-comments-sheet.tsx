"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessagesSquare } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CommentThreadCard } from "@/components/proposals/comments/comment-thread-card";
import { useSSE } from "@/components/realtime/sse-provider";
import { apiErrorMessage } from "@/lib/api-error";
import {
  COMMENT_EVENT,
  STEP_OF_SECTION,
  fetchThreads,
  openCount,
  replyToThread,
  resolveThread,
  sortThreads,
  threadsQueryKey,
  type CommentThread,
} from "@/lib/proposal-comments";
import type { ProposalStep } from "@/lib/proposals";
import { cn } from "@/lib/utils";

/** The client's comments on this proposal, live: new ones arrive over the app's SSE connection. */
export function useProposalThreads(proposalId: string | null) {
  const queryClient = useQueryClient();
  const { on } = useSSE();
  const query = useQuery({
    queryKey: threadsQueryKey(proposalId ?? ""),
    queryFn: () => fetchThreads(proposalId as string),
    enabled: Boolean(proposalId),
  });

  React.useEffect(
    () =>
      on(COMMENT_EVENT, (payload) => {
        const id = (payload as { proposal_id?: string } | null)?.proposal_id;
        if (proposalId && String(id) === proposalId) {
          void queryClient.invalidateQueries({ queryKey: threadsQueryKey(proposalId) });
        }
      }),
    [on, proposalId, queryClient],
  );

  return query;
}

/**
 * The builder's Comments button and panel: every thread the client started on
 * the public link, open ones first. Reply or resolve here; opening a thread
 * jumps to the step where its page is edited. `focusThreadId` (from a
 * notification's link) opens the panel on that thread.
 */
export function ProposalComments({
  proposalId,
  focusThreadId,
  onOpenStep,
}: {
  proposalId: string;
  focusThreadId?: string | null;
  onOpenStep: (step: ProposalStep) => void;
}) {
  const queryClient = useQueryClient();
  const query = useProposalThreads(proposalId);
  const threads = React.useMemo(() => sortThreads(query.data ?? []), [query.data]);
  const [open, setOpen] = React.useState(Boolean(focusThreadId));
  const [activeId, setActiveId] = React.useState<string | null>(focusThreadId ?? null);
  const [busyThread, setBusyThread] = React.useState<string | null>(null);
  const openThreads = openCount(threads);

  const store = (next: CommentThread[]) => queryClient.setQueryData(threadsQueryKey(proposalId), next);

  // A notification's thread: open its step too, so the fix is one click away.
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (focused.current || !focusThreadId) return;
    const thread = threads.find((candidate) => candidate.id === focusThreadId);
    if (!thread) return;
    focused.current = true;
    onOpenStep(STEP_OF_SECTION[thread.section]);
  }, [focusThreadId, threads, onOpenStep]);

  const reply = async (threadId: string, body: string) => {
    try {
      store(await replyToThread(proposalId, threadId, body));
      toast.success("Reply sent — your client sees it on their link.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't send your reply."));
      throw error;
    }
  };

  const resolve = async (threadId: string, resolved: boolean) => {
    setBusyThread(threadId);
    try {
      store(await resolveThread(proposalId, threadId, resolved));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't update the comment."));
    } finally {
      setBusyThread(null);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={openThreads ? `Comments, ${openThreads} open` : "Comments"}
        onClick={() => setOpen(true)}
        className="relative"
      >
        <MessagesSquare />
        <span className="hidden sm:inline">Comments</span>
        {openThreads > 0 && (
          <span className="grid min-w-5 place-items-center rounded-full bg-warning px-1 text-[11px] font-semibold text-white">
            {openThreads}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border p-4 text-left">
            <SheetTitle>Client comments</SheetTitle>
            <SheetDescription>
              Your client comments on the proposal link. Reply here, change the proposal, and they see both on their
              link — the link stays the same.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {query.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading comments…
              </p>
            ) : query.isError ? (
              <p className="text-sm text-destructive">Couldn&apos;t load the comments.</p>
            ) : threads.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No comments yet. When your client comments on the proposal link, it shows up here and in your
                notifications.
              </p>
            ) : (
              threads.map((thread) => (
                <div key={thread.id} className={cn(thread.id === activeId && "scroll-mt-4")}>
                  <CommentThreadCard
                    thread={thread}
                    viewer="user"
                    showSection
                    active={thread.id === activeId}
                    busy={busyThread === thread.id}
                    onSelect={() => {
                      setActiveId(thread.id);
                      onOpenStep(STEP_OF_SECTION[thread.section]);
                    }}
                    onReply={(body) => reply(thread.id, body)}
                    onResolve={(resolved) => void resolve(thread.id, resolved)}
                  />
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
