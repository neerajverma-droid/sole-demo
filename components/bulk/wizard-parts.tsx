"use client";

import * as React from "react";
import { Check, FileText, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * The pieces every bulk-import wizard on the platform shares. Lifted out of the
 * Transactions wizard so Products doesn't become a third copy of the same
 * stepper, dropzone and field list.
 */

export function WizardStepper({
  steps,
  current,
}: {
  steps: readonly string[];
  current: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-5 py-3 shadow-sm">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular",
                  done || active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" aria-hidden /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active
                    ? "font-medium"
                    : done
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && <Separator className="w-6 shrink-0" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function WizardSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The columns an importer understands, with the required ones called out. */
export function FieldDocsList({
  fields,
}: {
  fields: readonly { name: string; desc: string; required: boolean }[];
}) {
  return (
    <ul className="divide-y rounded-lg border border-border">
      {fields.map((field) => (
        <li
          key={field.name}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {field.name}
              {field.required && (
                <span className="ml-0.5 text-destructive" aria-hidden>
                  *
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{field.desc}</p>
          </div>
          <Badge variant={field.required ? "default" : "secondary"}>
            {field.required ? "Required" : "Optional"}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Browse-or-drop, with the chosen file summarised in place. */
export function WizardDropzone({
  file,
  rowCount,
  parseError,
  onFile,
  onRemove,
  accept = ".csv,text/csv",
  hint = "CSV up to 5 MB",
  fileMeta,
}: {
  /**
   * `size` is omitted for a file this page never received bytes for — an
   * already-saved logo, known only by URL — rather than faked as 0, which
   * would render as "0 B".
   */
  file: { name: string; size?: number; url?: string } | null;
  rowCount: number;
  parseError: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  accept?: string;
  hint?: string;
  /**
   * Replaces the row count beside the filename, for a dropzone that isn't
   * taking a CSV — an image has no rows, and "0 rows found" under a logo reads
   * as a parse that failed.
   */
  fileMeta?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  if (file) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          {file.url ? (
            // An actual preview rather than the generic file icon — only
            // ever passed a url for an image (a logo), never for the CSV
            // imports this same dropzone also renders.
            <img
              src={file.url}
              alt=""
              className="size-10 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span
              className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
              aria-hidden
            >
              <FileText className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground tabular">
              {typeof file.size === "number" && formatBytes(file.size)}
              {fileMeta
                ? `${typeof file.size === "number" ? " · " : ""}${fileMeta}`
                : parseError
                  ? ""
                  : ` · ${rowCount} rows found`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={onRemove}
          >
            <X />
            Remove
          </Button>
        </div>
        {parseError && <p className="text-sm text-destructive">{parseError}</p>}
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const dropped = event.dataTransfer.files?.[0];
        if (dropped) onFile(dropped);
      }}
      className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:border-primary/40"
    >
      <span
        className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"
        aria-hidden
      >
        <Upload className="size-5" />
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          Browse
        </Button>
        <p className="text-sm text-muted-foreground">
          or drag &amp; drop a file
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onFile(chosen);
          event.target.value = "";
        }}
      />
    </div>
  );
}

/*
 * `downloadCsv` used to live here as well as in `lib/file-parser.ts`. The two
 * differed — only the lib one wrote the byte-order mark Excel needs to read a
 * UTF-8 export as UTF-8 — so this copy is gone and everything uses that one.
 */
