"use client";

/**
 * The floating "Ask Sole" chat widget — sole-webapp's `Solechatwidget.js`,
 * ported to keep its own look (not the new app's theme) and its drag
 * behaviour exactly, per an explicit request for parity on both. Three
 * message sources feed one list — see `lib/chat.ts`'s own doc comment for
 * why history, the assistant's reply and the shared SSE connection don't
 * race or duplicate each other.
 */
import * as React from "react";
import { useAtom } from "jotai";
import { MessageCircle, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/components/auth/session-provider";
import { useSSE } from "@/components/realtime/sse-provider";
import {
  MediaLightbox,
  MessageBubble,
  TypingIndicator,
} from "@/components/layout/chat-message-bubble";
import { chatOpenAtom } from "@/lib/atoms";
import {
  chatAttachmentAccept,
  endAgentChat,
  EMPTY_STATE_BUTTONS,
  EMPTY_STATE_TEXT,
  fetchChatHistory,
  fetchChatUnreadCount,
  generateId,
  markChatRead,
  sendAgentMessage,
  sendAssistantMessage,
  uploadChatAttachment,
  type ChatAttachment,
  type ChatMessage,
} from "@/lib/chat";
import { cn } from "@/lib/utils";

const DEFAULT_POSITION = { x: 24, y: 24 };
const DRAG_MARGIN = 12;
const TEXTAREA_MAX_HEIGHT = 96;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function userInitialFrom(user: { first_name?: string; email?: string } | null): string {
  const source = user?.first_name || user?.email || "U";
  return source[0]?.toUpperCase() ?? "U";
}

export function SupportChat() {
  const { user } = useSession();
  const { on } = useSSE();

  const [open, setOpen] = useAtom(chatOpenAtom);
  const isOpenRef = React.useRef(open);
  isOpenRef.current = open;

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [isAgentMode, setIsAgentMode] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [attachment, setAttachment] = React.useState<ChatAttachment | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);

  const [historyLoaded, setHistoryLoaded] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  const [position, setPosition] = React.useState(DEFAULT_POSITION);
  const [isDragging, setIsDragging] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const dragStartRef = React.useRef<{ offsetX: number; offsetY: number } | null>(null);
  const hasDraggedRef = React.useRef(false);

  const listRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------------ *
   * Unread count — fetched once up front so the badge is right even
   * before the panel's ever been opened this session.
   * ------------------------------------------------------------------ */
  React.useEffect(() => {
    fetchChatUnreadCount()
      .then(setUnreadCount)
      .catch(() => {});
  }, []);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "auto") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  /* ------------------------------------------------------------------ *
   * History — loaded once, the first time the panel is opened.
   * ------------------------------------------------------------------ */
  React.useEffect(() => {
    if (!open || historyLoaded) return;
    let cancelled = false;
    setIsLoadingMore(true);
    fetchChatHistory(1, 10)
      .then(({ messages: recent, hasMore: more }) => {
        if (cancelled) return;
        setMessages(recent);
        setHasMore(more);
        setCurrentPage(1);
        requestAnimationFrame(() => scrollToBottom());
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setHistoryLoaded(true);
          setIsLoadingMore(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, historyLoaded, scrollToBottom]);

  const loadMoreMessages = React.useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    const el = listRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    setIsLoadingMore(true);
    fetchChatHistory(currentPage + 1, 10)
      .then(({ messages: older, hasMore: more }) => {
        setMessages((prev) => [...older, ...prev]);
        setHasMore(more);
        setCurrentPage((page) => page + 1);
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
        });
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  }, [currentPage, hasMore, isLoadingMore]);

  const onListScroll = React.useCallback(() => {
    const el = listRef.current;
    if (el && el.scrollTop < 60) loadMoreMessages();
  }, [loadMoreMessages]);

  /* ------------------------------------------------------------------ *
   * Opening/closing — opening is also "I've now read everything".
   * ------------------------------------------------------------------ */
  const toggleOpen = React.useCallback(() => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        setUnreadCount(0);
        void markChatRead();
      }
      return next;
    });
  }, [setOpen]);

  /* ------------------------------------------------------------------ *
   * Live updates — the shared SSE connection.
   * ------------------------------------------------------------------ */
  React.useEffect(() => {
    const unsubscribers = [
      on("agent_message", (payload) => {
        const data = (payload as { data?: Record<string, unknown> })?.data ?? payload ?? {};
        const record = data as Record<string, unknown>;
        const text = typeof record.text === "string" ? record.text : "";
        const notice = !!record.notice;
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            serverId: (record.messageId as number | string | undefined) ?? null,
            role: notice ? "notice" : "agent",
            text,
            mediaUrl: (record.mediaUrl as string | undefined) ?? null,
            mediaType: (record.contentType as string | undefined) ?? "text",
            timestamp: new Date().toISOString(),
          },
        ]);
        if (!notice) {
          if (!isOpenRef.current) setUnreadCount((count) => count + 1);
          else void markChatRead();
        }
        requestAnimationFrame(() => scrollToBottom("smooth"));
      }),
      on("agent_message_edited", (payload) => {
        const data = (payload as { data?: Record<string, unknown> })?.data ?? payload ?? {};
        const record = data as Record<string, unknown>;
        setMessages((prev) =>
          prev.map((message) =>
            message.serverId === record.messageId
              ? { ...message, text: String(record.text ?? message.text), edited: true }
              : message,
          ),
        );
      }),
      on("agent_message_deleted", (payload) => {
        const data = (payload as { data?: Record<string, unknown> })?.data ?? payload ?? {};
        const record = data as Record<string, unknown>;
        setMessages((prev) => prev.filter((message) => message.serverId !== record.messageId));
      }),
      on("conversation_taken", () => setIsAgentMode(true)),
      on("conversation_released", () => {
        setIsAgentMode(false);
        setAttachment(null);
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [on, scrollToBottom]);

  /* ------------------------------------------------------------------ *
   * Sending
   * ------------------------------------------------------------------ */
  /**
   * `override` is a quick-action button firing: `text` is what the user
   * "said" (the button's own label, shown in their bubble), `payload` is
   * what's actually sent to the assistant as `input` — sole-webapp's own
   * `sendMessage(text, payload)` split exactly, so a button never has to
   * show the person a raw `payload` slug like `create_expense` as if they'd
   * typed it themselves.
   */
  const send = React.useCallback(
    async (override?: { text: string; payload?: string }) => {
      const text = override?.text ?? draft.trim();
      if (!text && !attachment) return;
      const apiInput = override?.payload || text;

      if (!override) setDraft("");
      const staged = override ? null : attachment;
      setAttachment(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "user",
          text: text || staged?.name || "",
          mediaUrl: staged?.url ?? null,
          mediaType: staged?.contentType ?? null,
          timestamp: new Date().toISOString(),
        },
      ]);
      requestAnimationFrame(() => scrollToBottom("smooth"));

      try {
        if (isAgentMode) {
          // Bypasses the bot entirely — a human is already handling this.
          await sendAgentMessage({
            text: text || undefined,
            mediaUrl: staged?.url,
            contentType: staged?.contentType,
          });
          return;
        }

        setIsTyping(true);
        const reply = await sendAssistantMessage(apiInput);
        if (reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "bot",
              text: reply.text,
              mediaUrl: reply.mediaUrl,
              mediaType: reply.mediaType,
              timestamp: reply.timestamp,
              buttons: reply.buttons,
            },
          ]);
          requestAnimationFrame(() => scrollToBottom("smooth"));
        }
        if (!isOpenRef.current) setUnreadCount((count) => count + 1);
        else void markChatRead();
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "system",
            text: "Something went wrong. Please try again.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [attachment, draft, isAgentMode, scrollToBottom],
  );

  const onQuickAction = React.useCallback(
    (button: { text: string; payload?: string; url?: string }) => {
      if (button.url) {
        window.open(button.url, "_blank", "noopener,noreferrer");
        return;
      }
      void send({ text: button.text, payload: button.payload });
    },
    [send],
  );

  const handleAttach = React.useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      setAttachment(await uploadChatAttachment(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't attach that file.");
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleEndAgentChat = React.useCallback(() => {
    // No optimistic flip here — `conversation_released` over SSE is what
    // actually clears agent mode, once the server's really done it.
    endAgentChat().catch(() => {
      toast.error("Couldn't end the chat with support. Try again.");
    });
  }, []);

  /* ------------------------------------------------------------------ *
   * Drag — plain pointer events, no library. Position is stored as
   * right/bottom offsets (not left/top) because that's how the button is
   * actually positioned, so a move only ever has to flip one sign, not
   * reconcile two coordinate systems on every frame.
   * ------------------------------------------------------------------ */
  const handleDragMove = React.useCallback((clientX: number, clientY: number) => {
    const start = dragStartRef.current;
    const btn = wrapperRef.current;
    if (!start || !btn) return;
    hasDraggedRef.current = true;

    const btnW = btn.offsetWidth;
    const btnH = btn.offsetHeight;
    const rawX = clientX - start.offsetX;
    const rawY = clientY - start.offsetY;
    const x = clamp(rawX, DRAG_MARGIN, window.innerWidth - btnW - DRAG_MARGIN);
    const y = clamp(rawY, DRAG_MARGIN, window.innerHeight - btnH - DRAG_MARGIN);

    setPosition({
      x: window.innerWidth - x - btnW,
      y: window.innerHeight - y - btnH,
    });
  }, []);

  const handleDragStart = React.useCallback((clientX: number, clientY: number) => {
    const btn = wrapperRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    dragStartRef.current = {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
    };
    hasDraggedRef.current = false;
    setIsDragging(true);
  }, []);

  React.useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (event: MouseEvent) => handleDragMove(event.clientX, event.clientY);
    const onMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, handleDragMove]);

  React.useEffect(() => {
    if (!isDragging) return;
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) handleDragMove(touch.clientX, touch.clientY);
    };
    const onTouchEnd = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, handleDragMove]);

  const userInitial = userInitialFrom(user);

  return (
    <div
      ref={wrapperRef}
      className="fixed z-[45] select-none"
      style={{ right: `${position.x}px`, bottom: `${position.y}px` }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        handleDragStart(event.clientX, event.clientY);
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (touch) handleDragStart(touch.clientX, touch.clientY);
      }}
    >
      {open && (
        <div
          role="dialog"
          aria-label="Sole support"
          className={cn(
            "absolute bottom-14 right-0 flex h-[600px] w-[360px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300",
          )}
          style={{ zIndex: 2147483647 }}
        >
          <header className="flex items-center justify-between gap-3 rounded-t-2xl bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/favicon.ico" alt="" className="size-5 rounded-full" />
              </span>
              <div>
                <p className="text-sm font-semibold">Sole Support</p>
                <p className="flex items-center gap-1.5 text-xs text-white/80">
                  <span className="size-1.5 rounded-full bg-emerald-300 motion-safe:animate-pulse" />
                  Online
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close support chat"
              className="grid size-7 place-items-center rounded-full text-white/90 hover:bg-white/15"
            >
              <X className="size-4" />
            </button>
          </header>

          {isAgentMode && (
            <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-3 py-1.5">
              <span className="size-2 shrink-0 rounded-full bg-amber-400 motion-safe:animate-ping" />
              <p className="flex-1 text-xs font-medium text-amber-700">
                You are connected with a live support agent
              </p>
              <button
                type="button"
                onClick={handleEndAgentChat}
                className="shrink-0 text-[11px] font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-900"
              >
                End chat
              </button>
            </div>
          )}

          <div ref={listRef} onScroll={onListScroll} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {isLoadingMore && (
              <div className="flex justify-center">
                <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4 py-1.5 text-xs text-stone-400">
                  <span
                    className="size-3 rounded-full border-2 border-stone-300 border-t-blue-500"
                    style={{ animation: "soleSpin 0.8s linear infinite" }}
                    aria-hidden
                  />
                  {messages.length > 0 ? "Loading older messages…" : "Loading…"}
                </div>
              </div>
            )}
            {hasMore && !isLoadingMore && messages.length > 0 && (
              <div className="flex justify-center">
                <span className="text-[10px] text-stone-400">↑ Scroll up to load older messages</span>
              </div>
            )}
            {messages.length === 0 && !isLoadingMore && (
              <MessageBubble
                message={{
                  id: "empty_state",
                  role: "bot",
                  text: EMPTY_STATE_TEXT,
                  timestamp: new Date().toISOString(),
                  buttons: EMPTY_STATE_BUTTONS,
                }}
                userInitial={userInitial}
                onOpenImage={setLightboxUrl}
                onQuickAction={onQuickAction}
              />
            )}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                userInitial={userInitial}
                onOpenImage={setLightboxUrl}
                onQuickAction={onQuickAction}
              />
            ))}
            {isTyping && <TypingIndicator />}
          </div>

          <div className="border-t border-stone-100 p-3">
            {attachment && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs">
                {attachment.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.preview} alt="" className="size-8 rounded object-cover" />
                ) : (
                  <Paperclip className="size-4 shrink-0 text-stone-500" />
                )}
                <span className="flex-1 truncate">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  aria-label="Remove attachment"
                  className="shrink-0 text-stone-400 hover:text-stone-700"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {isAgentMode && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={chatAttachmentAccept()}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void handleAttach(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    aria-label="Attach a file"
                    className="grid size-9 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <span
                        className="size-4 rounded-full border-2 border-stone-300 border-t-primary"
                        style={{ animation: "soleSpin 0.8s linear infinite" }}
                        aria-hidden
                      />
                    ) : (
                      <Paperclip className="size-4" />
                    )}
                  </button>
                </>
              )}
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  const el = event.target;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Type your message…"
                aria-label="Message"
                className="max-h-24 flex-1 resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={isTyping || isUploading || (!draft.trim() && !attachment)}
                aria-label="Send"
                className="btn-soft-lit grid size-9 shrink-0 place-items-center rounded-full bg-primary text-white transition-transform hover:scale-105 disabled:pointer-events-none disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </form>
            <p className="pt-2 text-center text-[10px] text-stone-400">Powered by Harigaji</p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleOpen}
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
        className={cn(
          // Soft lit, like the portal's blue buttons (`ask-sole-lit`); the
          // float, glow and ping below are the launcher's own and unchanged.
          "ask-sole-lit relative z-10 flex items-center justify-center gap-1.5 rounded-full bg-primary text-white transition-all duration-300",
          !open ? "h-10 pl-3 pr-3.5" : "size-11",
          isDragging ? "scale-95 cursor-grabbing" : "cursor-pointer hover:scale-105 active:scale-95",
        )}
        style={{
          // A tighter shadow while it's being dragged; otherwise the class's.
          boxShadow: isDragging ? "0 4px 20px hsl(var(--primary) / 0.4)" : undefined,
          animation: isDragging ? undefined : "soleFloat 3.2s ease-in-out infinite",
        }}
      >
        {!open && (
          <>
            <span
              className="pointer-events-none absolute -inset-3 rounded-full bg-primary/25 blur-lg"
              style={{ animation: "soleGlow 2.6s ease-in-out infinite" }}
            />
            <span
              className="pointer-events-none absolute -inset-1 rounded-full border-2 border-primary/50"
              style={{ animation: "solePing 2.6s ease-out infinite" }}
            />
          </>
        )}
        {open ? (
          <X className="size-4" />
        ) : (
          <>
            <MessageCircle className="size-4" />
            <span className="text-xs font-bold">Ask Sole</span>
          </>
        )}
        {!open && unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 z-20 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      <style jsx>{`
        @keyframes soleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes soleGlow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
        @keyframes solePing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes soleSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
