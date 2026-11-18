"use client";

import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Check, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_BODY_MAX, SECTION_LABEL, type CommentThread } from "@/lib/proposal-comments";
import { emailInitials } from "@/lib/proposal-email-theme";
import { cn } from "@/lib/utils";

const ago = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${formatDistanceToNowStrict(date)} ago`;
};

/**
 * One thread, as Google Docs shows it: the quoted text, each comment with its
 * author, a reply box and Resolve / Reopen. Used on the public link (the
 * client) and in the builder (you) — `viewer` decides whose side is "you".
 */
export function CommentThreadCard({
  thread,
  viewer,
  active,
  located = true,
  showSection,
  canReply = true,
  busy,
  onSelect,
  onReply,
  onResolve,
}: {
  thread: CommentThread;
  viewer: "client" | "user";
  active?: boolean;
  /** False when the quoted text is no longer on the page. */
  located?: boolean;
  showSection?: boolean;
  canReply?: boolean;
  busy?: boolean;
  onSelect?: () => void;
  onReply: (body: string) => Promise<void>;
  onResolve: (resolved: boolean) => void;
}) {
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const send = async () => {
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    try {
      await onReply(body);
      setReply("");
    } finally {
      setSending(false);
    }
  };

  return (
    <article
      className={cn(
        "rounded-lg border bg-card text-left shadow-sm transition-colors",
        active ? "border-primary ring-1 ring-primary/30" : "border-border",
        thread.resolved && "opacity-75",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full rounded-t-lg px-3 pt-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {showSection && <span className="font-medium">{SECTION_LABEL[thread.section]}</span>}
          {thread.resolved && (
            <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-px font-medium text-success">
              <Check className="size-3" aria-hidden />
              Resolved
            </span>
          )}
        </span>
        {thread.quote ? (
          <span
            className={cn(
              "mt-1 line-clamp-2 border-l-2 pl-2 text-xs italic",
              located ? "border-warning text-foreground/80" : "border-border text-muted-foreground",
            )}
          >
            “{thread.quote}”
            {!located && <span className="not-italic"> · on text that has since changed</span>}
          </span>
        ) : (
          <span className="mt-1 block text-xs text-muted-foreground">On the whole {SECTION_LABEL[thread.section]} page</span>
        )}
      </button>

      <ol className="space-y-3 px-3 py-3">
        {thread.comments.map((comment) => {
          const mine = comment.authorType === viewer;
          return (
            <li key={comment.id} className="flex gap-2">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                  comment.authorType === "user" ? "bg-primary text-primary-foreground" : "bg-warning/20 text-warning",
                )}
                aria-hidden
              >
                {emailInitials(comment.authorName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
                  <span className="font-semibold">{mine ? "You" : comment.authorName}</span>
                  <span className="text-muted-foreground">{ago(comment.createdAt)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-line break-words text-sm">{comment.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-2 border-t border-border px-3 py-2.5">
        {canReply && (
          <Textarea
            value={reply}
            rows={2}
            maxLength={COMMENT_BODY_MAX}
            placeholder="Reply…"
            aria-label="Reply"
            className="min-h-0 resize-none text-sm"
            disabled={sending || busy}
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send();
              }
            }}
          />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onResolve(!thread.resolved)}
          >
            {thread.resolved ? <RotateCcw /> : <Check />}
            {thread.resolved ? "Reopen" : "Resolve"}
          </Button>
          {canReply && (
            <Button type="button" size="sm" disabled={!reply.trim() || sending || busy} onClick={() => void send()}>
              {sending && <Loader2 className="animate-spin" />}
              Reply
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
