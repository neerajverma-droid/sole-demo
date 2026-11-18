"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquarePlus, MessagesSquare, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { CommentThreadCard } from "@/components/proposals/comments/comment-thread-card";
import type { PreviewTab } from "@/components/proposals/proposal-document";
import {
  COMMENT_BODY_MAX,
  PORTAL_REFRESH_MS,
  SECTION_LABEL,
  SECTION_OF_TAB,
  addPublicComment,
  fetchPublicThreads,
  locateQuote,
  offsetsOfRange,
  openCount,
  placementOf,
  publicThreadsQueryKey,
  rangeFromOffsets,
  resolvePublicThread,
  sortThreads,
  textMapOf,
  type CommentAnchor,
  type CommentThread,
} from "@/lib/proposal-comments";
// Names for the CSS Custom Highlight API; styled in app/globals.css.
const HIGHLIGHT = "proposal-comment";
const HIGHLIGHT_ACTIVE = "proposal-comment-active";

type Draft = { quote: string; anchor: CommentAnchor | null };

const supportsHighlights = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

/**
 * Commenting on the public link, as Google Docs does it: select text on the
 * page and press Comment (or comment on the whole page); threads sit beside
 * the page, highlighted in it; replies from the business show up within
 * PORTAL_REFRESH_MS. Read-only once the proposal is answered.
 */
export function PortalComments({
  token,
  tab,
  pageRef,
  canComment,
}: {
  token: string;
  tab: PreviewTab;
  /** The page being read — where selections are taken and highlights drawn. */
  pageRef: React.RefObject<HTMLElement | null>;
  canComment: boolean;
}) {
  const queryClient = useQueryClient();
  const section = SECTION_OF_TAB[tab] ?? null;
  const query = useQuery({
    queryKey: publicThreadsQueryKey(token),
    queryFn: () => fetchPublicThreads(token),
    refetchInterval: PORTAL_REFRESH_MS,
  });
  const threads = React.useMemo(() => sortThreads(query.data ?? []), [query.data]);
  const pageThreads = threads.filter((thread) => thread.section === section);

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [busyThread, setBusyThread] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<{ draft: Draft; top: number; left: number } | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [located, setLocated] = React.useState<Set<string>>(new Set());

  const store = (next: CommentThread[]) => queryClient.setQueryData(publicThreadsQueryKey(token), next);

  // Changing page drops anything half-started on the last one.
  React.useEffect(() => {
    setDraft(null);
    setSelection(null);
    setActiveId(null);
  }, [tab]);

  // A selection inside the page offers "Comment" just above it.
  React.useEffect(() => {
    if (!canComment || !section) return;
    const check = () => {
      const page = pageRef.current;
      const current = window.getSelection();
      if (!page || !current || current.isCollapsed || !current.rangeCount) {
        setSelection(null);
        return;
      }
      const range = current.getRangeAt(0);
      if (!page.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const map = textMapOf(page);
      const offsets = offsetsOfRange(map, range);
      const placement = offsets ? placementOf(map.text, offsets.start, offsets.end) : null;
      if (!placement?.quote) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelection({ draft: placement, top: rect.top + window.scrollY - 44, left: rect.left + window.scrollX + rect.width / 2 });
    };
    document.addEventListener("selectionchange", check);
    return () => document.removeEventListener("selectionchange", check);
  }, [canComment, section, pageRef]);

  // Highlight every thread's quote on this page; the active one stronger.
  React.useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const frame = requestAnimationFrame(() => {
      const map = textMapOf(page);
      const ranges = new Map<string, Range>();
      for (const thread of pageThreads) {
        if (!thread.quote) continue;
        const at = locateQuote(map.text, thread.quote, thread.anchor);
        const range = at ? rangeFromOffsets(map, at.start, at.end) : null;
        if (range) ranges.set(thread.id, range);
      }
      setLocated(new Set(ranges.keys()));
      if (!supportsHighlights()) return;
      const open = [...ranges].filter(([id]) => !threads.find((thread) => thread.id === id)?.resolved);
      CSS.highlights.set(HIGHLIGHT, new Highlight(...open.map(([, range]) => range)));
      const active = activeId ? ranges.get(activeId) : null;
      if (active) CSS.highlights.set(HIGHLIGHT_ACTIVE, new Highlight(active));
      else CSS.highlights.delete(HIGHLIGHT_ACTIVE);
    });
    return () => cancelAnimationFrame(frame);
  });

  React.useEffect(
    () => () => {
      if (!supportsHighlights()) return;
      CSS.highlights.delete(HIGHLIGHT);
      CSS.highlights.delete(HIGHLIGHT_ACTIVE);
    },
    [],
  );

  const startDraft = (next: Draft) => {
    setDraft(next);
    setBody("");
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    // Wide screens already show the panel beside the page; below lg it's a sheet.
    if (window.matchMedia("(max-width: 1023px)").matches) setSheetOpen(true);
  };

  const submit = async () => {
    if (!draft || !section || !body.trim()) return;
    setSaving(true);
    try {
      store(await addPublicComment(token, { section, quote: draft.quote, anchor: draft.anchor, body: body.trim() }));
      setDraft(null);
      setBody("");
      toast.success("Comment sent. You'll see the reply here.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send your comment.");
    } finally {
      setSaving(false);
    }
  };

  const reply = async (threadId: string, text: string) => {
    try {
      store(await addPublicComment(token, { threadId, body: text }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send your reply.");
      throw error;
    }
  };

  const resolve = async (threadId: string, resolved: boolean) => {
    setBusyThread(threadId);
    try {
      store(await resolvePublicThread(token, threadId, resolved));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the comment.");
    } finally {
      setBusyThread(null);
    }
  };

  const selectThread = (thread: CommentThread) => {
    setActiveId(thread.id === activeId ? null : thread.id);
    if (!thread.quote || !pageRef.current) return;
    const map = textMapOf(pageRef.current);
    const at = locateQuote(map.text, thread.quote, thread.anchor);
    const range = at ? rangeFromOffsets(map, at.start, at.end) : null;
    (range?.startContainer.parentElement ?? null)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!section) return null;

  const panel = (
    <div className="space-y-3">
      {canComment && draft && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-card p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium">New comment</p>
            <button
              type="button"
              aria-label="Cancel comment"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setDraft(null)}
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="line-clamp-3 border-l-2 border-warning pl-2 text-xs italic text-foreground/80">
            {draft.quote ? `“${draft.quote}”` : `On the whole ${SECTION_LABEL[section]} page`}
          </p>
          <Textarea
            autoFocus
            rows={3}
            value={body}
            maxLength={COMMENT_BODY_MAX}
            placeholder="What would you like changed?"
            aria-label="Comment"
            disabled={saving}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!body.trim() || saving} onClick={() => void submit()}>
              {saving && <Loader2 className="animate-spin" />}
              Comment
            </Button>
          </div>
        </div>
      )}

      {canComment && !draft && (
        <div className="rounded-lg border border-dashed border-border bg-card/60 p-3 text-xs text-muted-foreground">
          <p>Select any text on the page to comment on it, or</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => startDraft({ quote: "", anchor: null })}
          >
            <MessageSquarePlus />
            Comment on this page
          </Button>
        </div>
      )}

      {query.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Loading comments…
        </p>
      ) : pageThreads.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments on this page yet.</p>
      ) : (
        pageThreads.map((thread) => (
          <CommentThreadCard
            key={thread.id}
            thread={thread}
            viewer="client"
            active={thread.id === activeId}
            located={!thread.quote || located.has(thread.id)}
            canReply={canComment}
            busy={busyThread === thread.id}
            onSelect={() => selectThread(thread)}
            onReply={(text) => reply(thread.id, text)}
            onResolve={(resolved) => void resolve(thread.id, resolved)}
          />
        ))
      )}
    </div>
  );

  const total = openCount(threads);

  return (
    <>
      {selection && (
        <Button
          type="button"
          size="sm"
          className="absolute z-30 -translate-x-1/2 shadow-lg"
          style={{ top: selection.top, left: selection.left }}
          // Keep the selection while the button is pressed.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => startDraft(selection.draft)}
        >
          <MessageSquarePlus />
          Comment
        </Button>
      )}

      {/* Wide screens: beside the page. */}
      <aside className="hidden w-80 shrink-0 lg:block" aria-label="Comments">
        <div className="sticky top-4 max-h-[calc(100dvh-2rem)] space-y-3 overflow-y-auto pb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessagesSquare className="size-4" aria-hidden />
            Comments
            <span className="font-normal text-muted-foreground">· {SECTION_LABEL[section]}</span>
          </h2>
          {panel}
        </div>
      </aside>

      {/* Phones and tablets: a button that opens them as a sheet. */}
      <Button
        type="button"
        className="fixed bottom-24 right-4 z-30 shadow-lg lg:hidden"
        onClick={() => setSheetOpen(true)}
      >
        <MessagesSquare />
        Comments{total > 0 ? ` (${total})` : ""}
      </Button>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto lg:hidden">
          <SheetHeader className="text-left">
            <SheetTitle>Comments · {SECTION_LABEL[section]}</SheetTitle>
            <SheetDescription>Select text on the page to comment on it, or comment on the whole page.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{panel}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
