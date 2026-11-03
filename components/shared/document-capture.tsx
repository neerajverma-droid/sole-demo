"use client";

import * as React from "react";
import { Check, Loader2, Sparkles, Trash2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { formatBytes } from "@/lib/expenses";
import { toIsoDate } from "@/lib/invoices";
import {
  CAPTURE_ACCEPT,
  LOW_CONFIDENCE,
  captureFileIssue,
  type CaptureEditor,
  deleteCaptureUpload,
  uploadCaptureFile,
  type CaptureUpload,
} from "@/lib/ocr-capture";

/**
 * sole-ocr's extract and upload routes answer `{ success: false, error }`,
 * not the `{ message }` that `apiErrorMessage` reads — and the plan-limit
 * reason ("Invoice limit reached…") is exactly what the user needs to see.
 */
function captureErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: string; message?: string }
      | undefined;
    return data?.error || data?.message || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export type DocumentCaptureHandle = {
  /** Opens the file picker. */
  open: () => void;
  /** Takes a file that was dropped somewhere else (a chooser card). */
  take: (file: File | undefined) => void;
};

type Phase = "idle" | "uploading" | "processing" | "extracted";

/**
 * The upload-and-read step shared by Create invoice and Create expense:
 * sole-webapp's `InvoiceUploadComponent` / `ExpenseUploadComponent`, minus the
 * Material UI. The host owns the entry point (a method card that calls
 * `open()` or `take()` on the handle) and what the reading becomes; this owns
 * the file, the two backend calls, and the progress, result and discard UI.
 *
 * Nothing is shown until a file is chosen, so it can sit under the chooser's
 * cards without adding a second upload target to the page.
 */
export function DocumentCapture<E extends { confidence: number }>({
  handleRef,
  noun,
  folder,
  extract,
  fields,
  editor,
  onUse,
}: {
  handleRef: React.Ref<DocumentCaptureHandle>;
  /** "invoice" or "receipt" — the word the copy uses. */
  noun: string;
  folder: "invoice-uploads" | "expense-uploads";
  extract: (file: File, upload: CaptureUpload, today: string) => Promise<E>;
  /** The labelled values to show off the reading. */
  fields: (extraction: E) => { label: string; value: string }[];
  /** What the Edit dialog offers, and how an edit lands on the reading. */
  editor: CaptureEditor<E>;
  /** Take the reading into the form. */
  onUse: (extraction: E, file: File) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  /** Guards against setting state from a call that outlived the component. */
  const cancelled = React.useRef(false);
  React.useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const [file, setFile] = React.useState<File>();
  const [upload, setUpload] = React.useState<CaptureUpload>();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [progress, setProgress] = React.useState(0);
  const [extraction, setExtraction] = React.useState<E>();

  const take = async (chosen: File | undefined) => {
    if (!chosen) return;
    const issue = captureFileIssue(chosen);
    if (issue) {
      toast.error(issue);
      return;
    }

    // A second file replaces the first, so the first one's copy goes.
    if (upload) void deleteCaptureUpload(upload);
    setFile(chosen);
    setUpload(undefined);
    setExtraction(undefined);
    setProgress(0);
    setPhase("uploading");

    let uploaded: CaptureUpload | undefined;
    try {
      uploaded = await uploadCaptureFile(chosen, folder, setProgress);
      if (cancelled.current) return;
      setUpload(uploaded);
      setPhase("processing");
      const result = await extract(chosen, uploaded, toIsoDate(new Date()));
      if (cancelled.current) return;
      setExtraction(result);
      setPhase("extracted");
    } catch (error) {
      if (cancelled.current) return;
      toast.error(
        captureErrorMessage(error, `Couldn't read that ${noun}. Try again.`),
      );
      if (uploaded) void deleteCaptureUpload(uploaded);
      setFile(undefined);
      setUpload(undefined);
      setPhase("idle");
    }
  };

  React.useImperativeHandle(handleRef, () => ({
    open: () => inputRef.current?.click(),
    // No dependency list: `take` closes over state that changes every phase,
    // and the handle only ever needs the latest.
    take,
  }));

  const remove = () => {
    if (upload) void deleteCaptureUpload(upload);
    setFile(undefined);
    setUpload(undefined);
    setExtraction(undefined);
    setPhase("idle");
  };

  const [editing, setEditing] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>({});

  const openEditor = () => {
    if (!extraction) return;
    setValues(editor.read(extraction));
    setEditing(true);
  };

  // As sole-webapp: saving the edit is also taking the reading, so the
  // corrected values are what reach the form.
  const saveEdit = () => {
    if (!extraction || !file) return;
    const next = editor.write(extraction, values);
    setExtraction(next);
    setEditing(false);
    onUse(next, file);
  };

  const low = !!extraction && extraction.confidence < LOW_CONFIDENCE;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={CAPTURE_ACCEPT}
        tabIndex={-1}
        className="sr-only"
        aria-label={`Upload ${noun}`}
        onChange={(event) => {
          void take(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {file && (
        <div
          className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm"
          data-usertour="document-capture"
        >
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full bg-success/10 text-success"
              aria-hidden
            >
              {phase === "uploading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {file.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                <span className="tabular">{formatBytes(file.size)}</span>
                {phase === "uploading"
                  ? ` · Uploading… ${progress}%`
                  : " · Uploaded"}
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${file.name}`}
              disabled={phase === "uploading"}
              onClick={remove}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          {phase === "uploading" && (
            <Progress value={progress} aria-label="Upload progress" />
          )}

          {phase === "processing" && (
            // The reading takes a few seconds and nothing else moves, so it's
            // announced rather than left to be noticed.
            <div
              className="flex items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/[0.02] p-4"
              role="status"
            >
              <Loader2
                className="size-4 shrink-0 animate-spin text-primary"
                aria-hidden
              />
              <span className="text-sm text-muted-foreground">
                Processing… extracting {noun} data
              </span>
            </div>
          )}

          {phase === "extracted" && extraction && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
                    aria-hidden
                  >
                    <Sparkles className="size-3.5" />
                  </span>
                  <p className="text-sm font-medium text-primary-heading">
                    Extracted {noun} data
                  </p>
                </div>
                {/* Amber only when the reading is actually shaky — a permanent
                    orange badge trains people to ignore it. */}
                <Badge variant={low ? "warning" : "secondary"}>
                  {Math.round(extraction.confidence * 100)}% confidence
                </Badge>
              </div>

              {low && (
                <p className="text-xs text-warning">
                  Low confidence extraction. Check every field before you
                  continue.
                </p>
              )}

              <dl className="grid gap-3 sm:grid-cols-2">
                {fields(extraction).map(({ label, value }) => (
                  <div key={label} className="min-w-0 space-y-0.5">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="truncate text-sm font-medium">
                      {value || "Not found"}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onUse(extraction, file)}>
                  Use this data
                </Button>
                <Button variant="outline" onClick={openEditor}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={remove}>
                  Start over
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit extracted data</DialogTitle>
            <DialogDescription>
              Correct anything that was read wrongly. Saving takes you to the
              form with these values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {editor.fields.map((field) => {
              const value = values[field.key] ?? "";
              const set = (next: string) =>
                setValues((current) => ({ ...current, [field.key]: next }));
              const id = `capture-edit-${field.key}`;
              return (
                <Field key={field.key} label={field.label} htmlFor={id}>
                  {field.kind === "multiline" ? (
                    <Textarea
                      id={id}
                      rows={3}
                      value={value}
                      onChange={(event) => set(event.target.value)}
                    />
                  ) : field.kind === "date" ? (
                    <DatePicker
                      id={id}
                      label={field.label}
                      value={value}
                      onChange={set}
                    />
                  ) : (
                    <Input
                      id={id}
                      type="text"
                      inputMode={field.kind === "number" ? "decimal" : "text"}
                      value={value}
                      onChange={(event) => set(event.target.value)}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
