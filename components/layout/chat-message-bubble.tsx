"use client";

/** One row in the Ask Sole chat's message list, plus its own fullscreen image
 *  lightbox — sole-webapp's `MessageBubble`/`TypingIndicator`/`MediaLightbox`,
 *  ported with the same bubble colours (the one thing this widget is asked to
 *  keep sole-webapp's own theme for, not the new app's). */
import * as React from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

import {
  downloadChatFile,
  formatChatTime,
  getPdfPreviewUrl,
  isPdfAttachment,
  type ChatMessage,
} from "@/lib/chat";
import { cn } from "@/lib/utils";

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <BotAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-stone-100 bg-white px-4 py-3 shadow-sm">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 rounded-full bg-stone-400 motion-safe:animate-bounce"
            style={{ animationDelay: `${dot * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white p-0.5 shadow-sm">
      <Image src="/favicon.ico" alt="" width={24} height={24} className="rounded-full" />
    </span>
  );
}

function AgentAvatar() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-white">
      A
    </span>
  );
}

function UserAvatar({ initial }: { initial: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-stone-600 to-stone-800 text-xs font-semibold text-white">
      {initial}
    </span>
  );
}

export function MessageBubble({
  message,
  userInitial,
  onOpenImage,
  onQuickAction,
}: {
  message: ChatMessage;
  userInitial: string;
  onOpenImage: (url: string) => void;
  /** A button fires another message (`payload` as the real input) or just
   *  links out (`url`) — `support-chat.tsx`'s `onQuickAction` tells them apart. */
  onQuickAction: (button: { text: string; payload?: string; url?: string }) => void;
}) {
  if (message.role === "notice") {
    return (
      <div className="flex justify-center">
        <p className="rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white">
          {message.text}
        </p>
      </div>
    );
  }

  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <p className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">
          <span className="size-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
          {message.text}
        </p>
      </div>
    );
  }

  const isUser = message.role === "user";
  const isAgent = message.role === "agent";

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div className={cn("flex items-end gap-2", isUser && "flex-row-reverse")}>
        {isUser ? (
          <UserAvatar initial={userInitial} />
        ) : isAgent ? (
          <AgentAvatar />
        ) : (
          <BotAvatar />
        )}
        <div
          className={cn(
            "max-w-[220px] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "rounded-tr-sm bg-gradient-to-br from-stone-800 to-stone-900 text-white"
              : isAgent
                ? "rounded-tl-sm bg-primary text-white"
                : "rounded-tl-sm border border-stone-100 bg-white text-stone-800",
          )}
        >
          {message.text && (
            <div
              className="[&_a]:underline [&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
              style={{ whiteSpace: "pre-line" }}
              // The backend sends real HTML (line breaks, links, lists) —
              // there is no raw-markdown or plain-text alternative path to
              // fall back to here.
              dangerouslySetInnerHTML={{ __html: message.text }}
            />
          )}
          {message.mediaUrl && (
            <ChatAttachment message={message} onOpenImage={onOpenImage} />
          )}
        </div>
      </div>
      {!isUser && !!message.buttons?.length && (
        <div className="grid w-full max-w-[260px] grid-cols-2 gap-2 pl-9">
          {message.buttons.map((button, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onQuickAction(button)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-stone-900 shadow-sm transition-all hover:border-primary hover:bg-amber-50 hover:text-primary hover:shadow-md active:scale-95"
            >
              {button.text}
            </button>
          ))}
        </div>
      )}
      <p className="px-9 text-[10px] text-stone-400">
        {formatChatTime(message.timestamp)}
        {message.edited && " · edited"}
      </p>
    </div>
  );
}

function ChatAttachment({
  message,
  onOpenImage,
}: {
  message: ChatMessage;
  onOpenImage: (url: string) => void;
}) {
  const url = message.mediaUrl as string;

  if (message.mediaType === "video") {
    return (
      <div className="mt-2 space-y-1">
        <video controls className="max-w-full rounded-lg" src={url} />
        <button
          type="button"
          onClick={() => void downloadChatFile(url)}
          className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
        >
          Download video
        </button>
      </div>
    );
  }

  if (isPdfAttachment(message)) {
    return (
      <div className="mt-2 space-y-1">
        <iframe src={getPdfPreviewUrl(url)} className="h-72 w-full rounded-lg border-0" title="Attachment preview" />
        <div className="flex gap-3 text-xs">
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 opacity-80 hover:opacity-100">
            Open full
          </a>
          <button
            type="button"
            onClick={() => void downloadChatFile(url)}
            className="underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            Download
          </button>
        </div>
      </div>
    );
  }

  // Anything else the backend classified as an image.
  return (
    <button
      type="button"
      onClick={() => onOpenImage(url)}
      className="mt-2 block overflow-hidden rounded-lg"
    >
      {/* Remote, variably-sized attachments — not worth a fixed intrinsic
          size `next/image` would need. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Attachment" className="max-h-48 max-w-full object-cover" />
    </button>
  );
}

export function MediaLightbox({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-label="Image preview"
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/90 p-6"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void downloadChatFile(url);
          }}
          aria-label="Download image"
          className="btn-soft-close-inverse size-8 rounded-full bg-white/10"
        >
          <Download className="size-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="grid size-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="size-4" />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Attachment preview"
        className="max-h-full max-w-full object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
