"use client";

import * as React from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";
import {
  EMAIL_FILE_ACCEPT,
  MAX_EMAIL_FILES,
  attachmentProblem,
  formatFileSize,
  uploadEmailAttachmentApi,
} from "@/lib/proposal-templates";
import type { EmailFile } from "@/lib/proposals";

/**
 * Files sent with a proposal email, as sole-pm's: "Attach files" uploads
 * them straight away; the list is what gets saved on the template, or sent
 * with the proposal.
 */
export function EmailAttachmentsField({
  value,
  onChange,
  disabled,
}: {
  value: EmailFile[];
  onChange: (files: EmailFile[]) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  const pick = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (!files.length) return;

    const problem = attachmentProblem(value, files);
    if (problem) {
      toast.error(problem);
      return;
    }

    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(uploadEmailAttachmentApi));
      onChange([...value, ...uploaded]);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not upload the file."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((file, index) => (
            <li
              key={`${file.url}-${index}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={file.url} target="_blank" rel="noreferrer" className="truncate hover:underline" title={file.name}>
                  {file.name}
                </a>
                {file.size != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                )}
              </span>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onChange(value.filter((_, at) => at !== index))}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading || value.length >= MAX_EMAIL_FILES}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
          {uploading ? "Uploading…" : "Attach files"}
        </Button>
        <span className="text-xs text-muted-foreground">Up to {MAX_EMAIL_FILES} files, 10 MB in total.</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={EMAIL_FILE_ACCEPT}
        onChange={(event) => void pick(event.target.files)}
      />
    </div>
  );
}
