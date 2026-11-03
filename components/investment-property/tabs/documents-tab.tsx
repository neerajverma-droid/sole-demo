"use client";

import * as React from "react";
import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import {
  ConfirmDeleteDialog,
  FormDialog,
  Loadable,
  ModuleCard,
  ModuleEmpty,
  invalidClass,
} from "@/components/investment-property/module-shared";
import {
  useDeleteDocumentMutation,
  useDocumentsQuery,
  useUploadDocumentMutation,
} from "@/hooks/use-property-modules-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatPropertyDate, type Property } from "@/lib/investment-property";
import {
  ACCEPT_ATTRIBUTE,
  defaultDocumentName,
  documentFileIssue,
  documentNameIssue,
  formatBytes,
  type PropertyDocument,
} from "@/lib/investment-property-documents";

function UploadDialog({
  propertyId,
  onClose,
}: {
  propertyId: string;
  onClose: () => void;
}) {
  const upload = useUploadDocumentMutation(propertyId);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState("");
  const [nameTouched, setNameTouched] = React.useState(false);
  const [attempted, setAttempted] = React.useState(false);

  const fileIssue = documentFileIssue(file);
  const nameIssue = documentNameIssue(name);

  const pick = (next: File | null) => {
    setFile(next);
    if (next && !nameTouched) setName(defaultDocumentName(next.name));
  };

  const submit = () => {
    setAttempted(true);
    if (fileIssue || nameIssue || !file || upload.isPending) return;
    upload.mutate(
      { name, file },
      {
        onSuccess: () => {
          toast.success("Document uploaded");
          onClose();
        },
        onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't upload the document.")),
      },
    );
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Upload document"
      description="Contracts, loan statements, valuations, insurance and anything else tied to this property."
      submitLabel="Upload"
      pending={upload.isPending}
      onSubmit={submit}
      size="sm"
    >
      <Field label="File" required error={attempted ? (fileIssue ?? undefined) : undefined}>
        <div
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            pick(event.dataTransfer.files?.[0] ?? null);
          }}
        >
          <Upload className="size-5 text-muted-foreground" aria-hidden />
          {file ? (
            <p className="text-sm font-medium">
              {file.name} <span className="font-normal text-muted-foreground">· {formatBytes(file.size)}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Drag a file here, or choose one</p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            {file ? "Choose a different file" : "Choose file"}
          </Button>
          <p className="text-xs text-muted-foreground">PDF, PNG, JPG or Word · up to 20 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            aria-label="Document file"
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
          />
        </div>
      </Field>
      <Field
        label="Document name"
        htmlFor="document-name"
        required
        error={attempted || nameTouched ? (nameIssue ?? undefined) : undefined}
      >
        <Input
          id="document-name"
          value={name}
          onChange={(event) => {
            setNameTouched(true);
            setName(event.target.value);
          }}
          placeholder="e.g. Contract of sale"
          aria-invalid={attempted && !!nameIssue}
          className={invalidClass(attempted ? (nameIssue ?? undefined) : undefined)}
          maxLength={255}
        />
      </Field>
    </FormDialog>
  );
}

export function DocumentsTab({ property }: { property: Property }) {
  const query = useDocumentsQuery(property.id);
  const remove = useDeleteDocumentMutation();
  const [uploading, setUploading] = React.useState(false);
  const [deleting, setDeleting] = React.useState<PropertyDocument | null>(null);

  return (
    <ModuleCard
      title="Documents"
      description="Keep the paperwork for this property in one place."
      action={
        <Button size="sm" onClick={() => setUploading(true)}>
          <Upload />
          Upload document
        </Button>
      }
    >
      <Loadable query={query} skeletonClassName="h-40">
        {(documents) =>
          documents.length === 0 ? (
            <ModuleEmpty
              icon={<FileText aria-hidden />}
              title="No documents yet"
              description="Upload contracts, statements and valuations so your accountant has them when needed."
              action={
                <Button size="sm" onClick={() => setUploading(true)}>
                  <Upload />
                  Upload document
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {documents.map((document) => (
                <li key={document.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
                    aria-hidden
                  >
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{document.name}</p>
                    <p className="text-xs text-muted-foreground tabular">
                      Uploaded {formatPropertyDate(document.uploadedAt)}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={document.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink />
                      Open
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${document.name}`}
                    onClick={() => setDeleting(document)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )
        }
      </Loadable>

      {uploading && <UploadDialog propertyId={property.id} onClose={() => setUploading(false)} />}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete document?"
        description={deleting ? `This permanently removes “${deleting.name}”. This action can't be undone.` : ""}
        confirmLabel="Delete document"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Document deleted");
              setDeleting(null);
            },
            onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't delete the document.")),
          });
        }}
      />
    </ModuleCard>
  );
}
