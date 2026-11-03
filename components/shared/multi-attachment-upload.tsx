"use client";

/**
 * Multiple receipts/documents on one record — sole-webapp's own
 * `components/Common/UploadMultiple.js` (the FilePond-based picker the real
 * expense form actually uses), ported without the FilePond dependency: a
 * plain dropzone + row list, same limits and same behaviour split between
 * "picked locally, not yet real" and "already uploaded".
 *
 * Deliberately a separate component from `AttachmentUpload` rather than a
 * `multiple` mode bolted onto it — that one's single-slot shape (`receipt:
 * ExpenseReceipt | null`) is shared with the liability/equity document
 * editors, which only ever take one file each; changing its contract would
 * ripple into both for a feature they don't need.
 */
import * as React from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/expenses";
import { cn } from "@/lib/utils";

/** sole-webapp's own FilePond config: `maxFiles={5}`, `maxFileSize="20MB"`. */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_FILE_BYTES = 20 * 1024 * 1024;

export type MultiAttachmentRow = {
  /** The real document id once uploaded, or a stable local key before then —
   *  whichever it is, the only thing this component needs it for is a React
   *  key and a handle to pass back to `onRemove`. */
  key: string;
  name: string;
  /** Unknown for a row read back from the server without a size column. */
  size?: number;
  /** A data URL (freshly picked) or the real server URL (already uploaded) —
   *  either way, directly usable as an `<img src>`. */
  url: string;
  status: "idle" | "uploading" | "deleting";
};

function isImageUrl(url: string): boolean {
  if (url.startsWith("data:image")) return true;
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
}

export function MultiAttachmentUpload({
  rows,
  onAdd,
  onRemove,
  onOpen,
  maxFiles = MAX_ATTACHMENTS,
  maxBytes = MAX_ATTACHMENT_FILE_BYTES,
  noun = "receipt",
  disabled = false,
}: {
  rows: MultiAttachmentRow[];
  /** Already filtered to however many files actually fit under `maxFiles` —
   *  the caller decides what uploading (or staging) each of them means. */
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  /** Opens a row full-size/in a new tab — absent for a row that can't be
   *  (nothing to preview locally before it's uploaded, say). */
  onOpen?: (row: MultiAttachmentRow) => void;
  maxFiles?: number;
  maxBytes?: number;
  /** What to call one of these in the copy — "receipt", "document". */
  noun?: string;
  disabled?: boolean;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const maxLabel = `${Math.round(maxBytes / (1024 * 1024))}MB`;
  const atLimit = rows.length >= maxFiles;

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const room = maxFiles - rows.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${maxFiles} files.`);
      return;
    }

    const accepted: File[] = [];
    for (const file of incoming.slice(0, room)) {
      if (file.size > maxBytes) {
        toast.error(`"${file.name}" is too large`, {
          description: `Use a file under ${maxLabel}.`,
        });
        continue;
      }
      accepted.push(file);
    }
    if (incoming.length > room) {
      toast.error(`Only ${maxFiles} files can be attached at once — the rest were skipped.`);
    }
    if (accepted.length > 0) onAdd(accepted);
  };

  const input = (
    <input
      ref={fileRef}
      type="file"
      multiple
      accept="image/*,application/pdf"
      className="sr-only"
      disabled={disabled || atLimit}
      onChange={(event) => {
        if (event.target.files?.length) addFiles(event.target.files);
        event.target.value = "";
      }}
    />
  );

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => {
            const busy = row.status !== "idle";
            return (
              <li
                key={row.key}
                className="flex items-center gap-3 rounded-md border border-border p-3"
              >
                <span
                  className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border surface-subtle"
                  aria-hidden
                >
                  {isImageUrl(row.url) ? (
                    // A data URL from the user's own file, or the real server URL.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.url} alt="" className="size-full object-cover" />
                  ) : (
                    <FileText className="size-5 text-muted-foreground" />
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onOpen?.(row)}
                  disabled={!onOpen || busy}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  {!!row.size && (
                    <p className="text-xs text-muted-foreground tabular">
                      {formatBytes(row.size)}
                    </p>
                  )}
                </button>
                {busy ? (
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground"
                    disabled={disabled}
                    onClick={() => onRemove(row.key)}
                    aria-label={`Remove ${row.name}`}
                  >
                    <X />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!atLimit && (
        <div
          onClick={() => !disabled && fileRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (disabled) return;
            if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-border surface-subtle px-4 py-3 text-center transition-colors",
            disabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer hover:border-primary/40",
          )}
        >
          <span
            className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary"
            aria-hidden
          >
            <Upload className="size-4" />
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                fileRef.current?.click();
              }}
            >
              Browse
            </Button>
            <p className="text-sm text-muted-foreground">
              or drag &amp; drop {noun}s
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Up to {maxFiles} files · max {maxLabel} each · images or PDF
          </p>
          {input}
        </div>
      )}
    </div>
  );
}
