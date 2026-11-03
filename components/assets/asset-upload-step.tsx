"use client";

import * as React from "react";
import { Check, CloudUpload, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LOW_CONFIDENCE,
  MAX_UPLOAD_BYTES,
  assetMoney,
  assetValue,
  extractAssetApi,
  formatAssetDate,
  type AssetExtraction,
  type AssetFile,
} from "@/lib/assets";
import { formatBytes } from "@/lib/expenses";
import { toIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

const ACCEPT = "application/pdf,image/png,image/jpeg";

type Phase = "empty" | "processing" | "extracted";

/**
 * Step 1 of the capture flow: hand over a document, get the asset fields back
 * from sole-ocr's real capture service (`extractAssetApi`) — the same file
 * guards as the manual flow, the same draft shape out the other end.
 * Accepting the reading hands the fields up and moves on to Details, so from
 * step 2 the two flows are one flow.
 */
export function AssetUploadStep({
  onUse,
  onEdit,
  onSkip,
}: {
  /** Take the reading and move on to Details. */
  onUse: (extraction: AssetExtraction, file: AssetFile) => void;
  /** Take the reading but stay here, in the editable asset fields. */
  onEdit: (extraction: AssetExtraction, file: AssetFile) => void;
  /**
   * Give up on capture and type it in. Without this the step is a dead end for
   * anyone who hasn't got the document: name, cost and supplier are required
   * and live on the fields this panel is standing in front of.
   */
  onSkip: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  /** Guards against setting state from a capture call that outlived the component. */
  const cancelled = React.useRef(false);
  React.useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const [file, setFile] = React.useState<AssetFile>();
  const [phase, setPhase] = React.useState<Phase>("empty");
  const [extraction, setExtraction] = React.useState<AssetExtraction>();
  const [over, setOver] = React.useState(false);

  const take = async (chosen: File | undefined) => {
    if (!chosen) return;
    const allowed =
      chosen.type === "application/pdf" ||
      chosen.type === "image/png" ||
      chosen.type === "image/jpeg";
    if (!allowed) {
      toast.error("That file type isn't supported", {
        description: "Upload a PDF, PNG, JPG or JPEG.",
      });
      return;
    }
    if (chosen.size > MAX_UPLOAD_BYTES) {
      toast.error(`${chosen.name} is over 10MB.`);
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(chosen);
    });
    if (cancelled.current) return;

    setFile({ dataUrl, name: chosen.name, size: chosen.size });
    setPhase("processing");

    try {
      const result = await extractAssetApi(chosen, toIsoDate(new Date()));
      if (cancelled.current) return;
      setExtraction(result);
      setPhase("extracted");
    } catch (error) {
      if (cancelled.current) return;
      toast.error(
        error instanceof Error ? error.message : "Couldn't read that document",
      );
      setFile(undefined);
      setPhase("empty");
    }
  };

  const remove = () => {
    setFile(undefined);
    setExtraction(undefined);
    setPhase("empty");
  };

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-usertour="asset-upload-document"
    >
      {/* Flat indigo, not the gradient hairline: this is a step in a form, and
          the brand device belongs on a screen's hero rather than inside one. */}
      <div className="h-1 w-full bg-primary" aria-hidden />

      <div className="space-y-4 p-5">
        {file ? (
          <UploadedRow file={file} onRemove={remove} />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              take(event.dataTransfer.files[0]);
            }}
            className={cn(
              "flex w-full flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center outline-none",
              "motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              over
                ? "border-primary bg-primary/[0.06]"
                : "border-primary/40 bg-primary/[0.02] hover:border-primary hover:bg-primary/[0.04]",
            )}
          >
            <span
              className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"
              aria-hidden
            >
              <CloudUpload className="size-6" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-medium">
                Upload asset document
              </span>
              <span className="block text-sm text-muted-foreground">
                Drag and drop your receipt or document here, or click to browse.
              </span>
              <span className="block text-xs text-muted-foreground">
                PDF, PNG, JPG, JPEG (max 10MB)
              </span>
            </span>
          </button>
        )}

        {phase === "processing" && <ProcessingRow />}
        {phase === "extracted" && extraction && file && (
          <ExtractedCard
            extraction={extraction}
            onUse={() => onUse(extraction, file)}
            onEdit={() => onEdit(extraction, file)}
          />
        )}

        {phase === "empty" && (
          <p className="text-center text-xs text-muted-foreground">
            Haven&apos;t got the document?{" "}
            <button
              type="button"
              onClick={onSkip}
              className="rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              Enter the details manually
            </button>
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          tabIndex={-1}
          className="sr-only"
          aria-label="Upload asset document"
          onChange={(event) => {
            take(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>
    </div>
  );
}

/**
 * The file, once it's in. "Uploaded" is a mock: there's no storage behind this
 * yet, so the row reports what the user did rather than where the file went.
 */
function UploadedRow({
  file,
  onRemove,
}: {
  file: AssetFile;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-success/10 text-success"
        aria-hidden
      >
        <Check className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.name}</span>
        <span className="block text-xs text-muted-foreground">
          <span className="tabular">{formatBytes(file.size)}</span> · Uploaded
        </span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function ProcessingRow() {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/[0.02] p-4"
      // The reading takes a moment and nothing else on the step moves, so it's
      // announced rather than left to be noticed.
      role="status"
    >
      <Loader2
        className="size-4 shrink-0 animate-spin text-primary"
        aria-hidden
      />
      <span className="text-sm text-muted-foreground">
        Processing… extracting asset information
      </span>
    </div>
  );
}

function ExtractedCard({
  extraction,
  onUse,
  onEdit,
}: {
  extraction: AssetExtraction;
  onUse: () => void;
  onEdit: () => void;
}) {
  const { fields, confidence } = extraction;
  const low = confidence < LOW_CONFIDENCE;
  const percent = Math.round(confidence * 100);

  return (
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
            Extracted asset data
          </p>
        </div>
        {/* Amber only when the reading is actually shaky — a permanent orange
            badge trains people to ignore it. */}
        <Badge variant={low ? "warning" : "secondary"}>
          {percent}% confidence
        </Badge>
      </div>

      {low && (
        <p className="text-xs text-warning">
          Some of this was hard to read. Check the figures before you use them.
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-2">
        <ExtractedField label="Asset name" value={fields.name} />
        <ExtractedField
          label="Cost price"
          value={assetMoney(assetValue({ costPrice: fields.costPrice }))}
        />
        <ExtractedField
          label="Purchase date"
          value={formatAssetDate(fields.purchaseDate)}
        />
        <ExtractedField label="Supplier" value={fields.supplierName} />
        <ExtractedField label="Category" value={fields.category} />
        <ExtractedField label="Serial no." value={fields.serialNo} />
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onEdit}>
          Edit
        </Button>
        <Button onClick={onUse}>Use this data</Button>
      </div>
    </div>
  );
}

function ExtractedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}
