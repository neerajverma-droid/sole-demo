"use client";

import * as React from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  formatBytes,
  isImageReceipt,
  type ExpenseReceipt,
} from "@/lib/expenses";
import { cn } from "@/lib/utils";

/** localStorage isn't involved, but a file still shouldn't be unbounded. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** What this attachment is doing right now, for a caller backed by a real
 *  upload/delete endpoint rather than only a local preview. */
export type AttachmentUploadStatus = "idle" | "uploading" | "deleting";

/**
 * The attachment dropzone and its preview — the one common component for
 * attaching a file to anything in this app (an expense receipt, a liability
 * or equity document), rather than a per-module copy that drifts. The size
 * cap and the noun are parameters rather than constants: a liability's
 * document is larger than a receipt and isn't called one, and that
 * difference isn't worth a second dropzone kept in step with this one.
 */
export function AttachmentUpload({
  receipt,
  onChange,
  onFileSelected,
  maxBytes = MAX_ATTACHMENT_BYTES,
  noun = "receipt",
  onRemove,
  busy = false,
  status = "idle",
  pendingName,
  accept = "image/png,image/jpeg,application/pdf",
  acceptLabel = "images or PDF",
  removable = true,
  replaceLabel = "Replace",
}: {
  receipt: ExpenseReceipt | null;
  onChange: (next: ExpenseReceipt | null) => void;
  /** The raw browser file behind a selection, for a caller that needs to
   *  actually upload it somewhere rather than only preview it locally. */
  onFileSelected?: (file: File) => void;
  maxBytes?: number;
  /** What to call the thing in the copy — "receipt", "document". */
  noun?: string;
  /**
   * Fires with the raw `File` alongside `onChange`'s local preview — for a
   * caller that uploads it for real (an existing expense's attachment)
   * instead of only keeping it client-side (a still-unsaved form draft).
   */
  /** Overrides `onChange(null)` for a caller that deletes the attachment for real. */
  onRemove?: () => void;
  /** Disables every control while a real upload/remove call is in flight. */
  /* Set by a caller whose pick or removal is a real network round-trip —
   * swaps the dropzone/preview for a spinner rather than the instant local
   * preview reading as saved before the server has actually seen it.
   */
  busy?: boolean;
  status?: AttachmentUploadStatus;
  /** The file mid-upload, shown beside the spinner while `status` is "uploading". */
  pendingName?: string;
  /** The picker's file types — receipts by default; a profile photo is images only. */
  accept?: string;
  /** How those types read under the dropzone ("images or PDF"). */
  acceptLabel?: string;
  /** False for something that can only be swapped, never cleared (a profile photo). */
  removable?: boolean;
  /** The swap button's label — "Replace" by default. */
  replaceLabel?: string;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const maxLabel = `${Math.round(maxBytes / (1024 * 1024))} MB`;

  const onFile = (file: File) => {
    if (file.size > maxBytes) {
      toast.error(`That ${noun} is too large`, {
        description: `Use a file under ${maxLabel}.`,
      });
      return;
    }
    onFileSelected?.(file);
    const reader = new FileReader();
    reader.onload = () =>
      onChange({
        dataUrl: String(reader.result),
        name: file.name,
        size: file.size,
      });
    reader.onerror = () => toast.error("That file could not be read");
    reader.readAsDataURL(file);
  };

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept={accept}
      className="sr-only"
      disabled={busy}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onFile(file);
        event.target.value = "";
      }}
    />
  );

  if (status !== "idle") {
    return (
      <div
        className="flex items-center gap-3 rounded-md border border-border p-3"
        role="status"
        aria-live="polite"
      >
        <span
          className="grid size-12 shrink-0 place-items-center rounded-md border surface-subtle"
          aria-hidden
        >
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {status === "uploading" ? "Uploading…" : "Removing…"}
          </p>
          {status === "uploading" && pendingName && (
            <p className="truncate text-xs text-muted-foreground">
              {pendingName}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (receipt) {
    const sizeLabel = formatBytes(receipt.size);
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
        <span
          className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border surface-subtle"
          aria-hidden
        >
          {isImageReceipt(receipt) ? (
            // A data URL from the user's own file, or the real server URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={receipt.dataUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <FileText className="size-5 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{receipt.name}</p>
          {(sizeLabel || !isImageReceipt(receipt)) && (
            <p className="text-xs text-muted-foreground tabular">
              {sizeLabel}
              {!isImageReceipt(receipt) && (sizeLabel ? " · PDF" : "PDF")}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : replaceLabel}
        </Button>
        {removable && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={busy}
            onClick={() => (onRemove ? onRemove() : onChange(null))}
          >
            <X />
            Remove
          </Button>
        )}
        {input}
      </div>
    );
  }

  return (
    /*
      The whole zone opens the picker, since that's what a dashed rectangle
      with a Browse button in it looks like it does. It stays a plain div
      rather than a role="button": the Browse button inside it is the real,
      keyboard-reachable control, and nesting one button inside another is
      invalid whether the outer one is a <button> or wears the role.
    */
    <div
      onClick={() => !busy && fileRef.current?.click()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (busy) return;
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-border surface-subtle px-6 py-8 text-center transition-colors",
        busy
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:border-primary/40",
      )}
    >
      <span
        className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"
        aria-hidden
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Upload className="size-5" />
        )}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          // Stops the zone's own handler firing a second picker behind this one.
          onClick={(event) => {
            event.stopPropagation();
            fileRef.current?.click();
          }}
        >
          Browse
        </Button>
        <p className="text-sm text-muted-foreground">
          or drag &amp; drop a {noun}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Max {maxLabel} · {acceptLabel}
      </p>
      {input}
    </div>
  );
}
