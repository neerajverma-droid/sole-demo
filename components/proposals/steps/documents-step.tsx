"use client";

import * as React from "react";
import { Eye, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StepFooter, StepHeader } from "@/components/proposals/steps/step-parts";
import { apiErrorMessage } from "@/lib/api-error";
import {
  deleteProposalDocumentApi,
  documentFileIssue,
  fetchProposalDocumentBlob,
  formatFileSize,
  type ProposalDocument,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

/**
 * Supporting PDFs. Each upload persists at once, then waits in a preview
 * until it's confirmed — discarding it there deletes what was uploaded, as
 * does removing one from the list, so nothing is left orphaned in storage.
 */
export function DocumentsStep({
  proposalId,
  documents,
  onChange,
  onUpload,
  onSave,
  saving,
}: {
  proposalId: string | null;
  documents: ProposalDocument[];
  onChange: (documents: ProposalDocument[]) => void;
  onUpload: (file: File) => Promise<ProposalDocument>;
  onSave: () => void;
  saving: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [queue, setQueue] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [staged, setStaged] = React.useState<ProposalDocument | null>(null);
  const [viewingIndex, setViewingIndex] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // One file at a time: upload, then hold it for review before the next.
  React.useEffect(() => {
    if (uploading || staged || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setUploading(true);
    onUpload(next)
      .then(setStaged)
      .catch((error) => toast.error(apiErrorMessage(error, `Failed to upload ${next.name}`)))
      .finally(() => setUploading(false));
  }, [queue, uploading, staged, onUpload]);

  const enqueue = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((file) => {
      const issue = documentFileIssue(file);
      if (issue) toast.error(issue);
      return !issue;
    });
    if (files.length) setQueue((prev) => [...prev, ...files]);
  };

  const remove = async (index: number) => {
    const document = documents[index];
    if (!document?.id || !proposalId) {
      onChange(documents.filter((_, at) => at !== index));
      return;
    }
    setDeletingId(document.id);
    try {
      await deleteProposalDocumentApi(proposalId, document.id);
      onChange(documents.filter((_, at) => at !== index));
    } catch (error) {
      toast.error(apiErrorMessage(error, `Failed to delete ${document.name || "this document"}`));
    } finally {
      setDeletingId(null);
    }
  };

  const active = viewingIndex !== null ? documents[viewingIndex] : staged;

  const cancelPreview = async () => {
    if (viewingIndex === null && staged?.id && proposalId) {
      // Best-effort — closing shouldn't hang on cleanup.
      deleteProposalDocumentApi(proposalId, staged.id).catch(() => {});
    }
    setStaged(null);
    setViewingIndex(null);
  };

  const confirmPreview = () => {
    if (viewingIndex !== null) {
      setViewingIndex(null);
      return;
    }
    if (staged) {
      onChange([...documents, staged]);
      setStaged(null);
    }
  };

  return (
    <section className="space-y-4">
      <StepHeader title="Add. Docs." description="Attach optional supporting documents for this proposal." />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          enqueue(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border bg-muted/40",
        )}
      >
        <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Drag &amp; drop a PDF, or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            browse file
          </button>
        </p>
        <p className="text-xs text-muted-foreground">Max 10MB · PDF only</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            enqueue(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {documents.map((document, index) => (
          <div key={`${document.file_url || document.name}-${index}`} className="flex items-center gap-3 px-3 py-2.5">
            <FileText className="size-[18px] shrink-0 text-red-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{document.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(document.file_size)}</p>
            </div>
            {document.file_url && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Preview document"
                onClick={() => setViewingIndex(index)}
              >
                <Eye />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Delete document"
              disabled={deletingId === document.id}
              onClick={() => remove(index)}
            >
              {deletingId === document.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </div>
        ))}
        {(uploading || queue.length > 0) && (
          <div className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="size-[18px] animate-spin" aria-hidden />
            Uploading…
          </div>
        )}
        {documents.length === 0 && !uploading && queue.length === 0 && (
          <p className="px-3 py-7 text-center text-sm text-muted-foreground">No additional documents added.</p>
        )}
      </div>

      <StepFooter saving={saving} nextLabel="Terms & Sign" onSave={onSave} />

      <PdfPreviewDialog
        proposalId={proposalId}
        document={active}
        onCancel={cancelPreview}
        onDone={confirmPreview}
      />
    </section>
  );
}

/** The uploaded PDF in the browser's own viewer, read through the backend proxy. */
function PdfPreviewDialog({
  proposalId,
  document,
  onCancel,
  onDone,
}: {
  proposalId: string | null;
  document: ProposalDocument | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const fileUrl = document?.file_url;
  const mime = document?.mime_type;

  React.useEffect(() => {
    if (!fileUrl || !proposalId) return;
    let cancelled = false;
    let objectUrl = "";
    setLoading(true);
    setFailed(false);
    setUrl("");
    fetchProposalDocumentBlob(proposalId, { file_url: fileUrl, mime_type: mime ?? "" })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(`${objectUrl}#toolbar=0&navpanes=0`);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl, mime, proposalId]);

  return (
    <Dialog open={document != null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="truncate">{document?.name}</DialogTitle>
        </DialogHeader>
        <div className="relative flex-1 bg-muted">
          {loading ? (
            <div className="grid h-full place-items-center">
              <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : failed ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">Couldn&apos;t load this PDF for preview.</p>
          ) : (
            url && <iframe src={url} title={document?.name || "Document preview"} className="size-full border-0" />
          )}
        </div>
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
