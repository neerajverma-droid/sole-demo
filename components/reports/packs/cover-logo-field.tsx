"use client";

import * as React from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiErrorMessage } from "@/lib/api-error";
import { uploadCoverImage } from "@/lib/report-packs";
import { cn } from "@/lib/utils";

const ACCEPT = "image/png,image/jpeg";
const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

type Source = "business" | "custom";

function LogoTile({
  url,
  empty,
  dimmed = false,
}: {
  url: string | null | undefined;
  empty: string;
  dimmed?: boolean;
}) {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [url]);

  return (
    <div
      className={cn(
        "grid h-16 w-32 shrink-0 place-items-center overflow-hidden rounded-md border bg-white p-1.5 transition-opacity",
        dimmed && "opacity-50",
      )}
    >
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="size-full object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-[11px] leading-tight text-muted-foreground">
          <ImageIcon className="size-4" aria-hidden />
          {empty}
        </span>
      )}
    </div>
  );
}

export function CoverLogoField({
  idPrefix = "logo",
  value,
  defaultLogoUrl,
  onChange,
  disabled,
}: {
  idPrefix?: string;
  value: string | null | undefined;
  defaultLogoUrl: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const [source, setSource] = React.useState<Source>(
    value ? "custom" : "business",
  );
  const [uploaded, setUploaded] = React.useState<string | null>(value ?? null);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (value) {
      setSource("custom");
      setUploaded(value);
    }
  }, [value]);

  const choose = (next: Source) => {
    setSource(next);
    if (next === "business") onChange(null);
    else if (uploaded) onChange(uploaded);
  };

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(`That logo is over ${MAX_MB} MB. Try a smaller image.`);
      return;
    }

    setUploading(true);
    try {
      const { url } = await uploadCoverImage(file);
      setUploaded(url);
      onChange(url);
      toast.success("Logo uploaded.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not upload that logo."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label>Logo</Label>
      <RadioGroup
        value={source}
        onValueChange={(next) => choose(next as Source)}
        disabled={disabled}
        className="gap-3"
      >
        <label
          htmlFor={`${idPrefix}-business`}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
            source === "business"
              ? "border-primary/40 bg-primary/5"
              : "hover:bg-muted/50",
          )}
        >
          <RadioGroupItem id={`${idPrefix}-business`} value="business" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Use business logo</p>
            <p className="text-xs text-muted-foreground">
              {defaultLogoUrl
                ? "The same logo as your invoices and quotes."
                : "None set yet — add one in Sales → Branding."}
            </p>
          </div>
          <LogoTile url={defaultLogoUrl} empty="No logo" />
        </label>

        <label
          htmlFor={`${idPrefix}-custom`}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
            source === "custom"
              ? "border-primary/40 bg-primary/5"
              : "hover:bg-muted/50",
          )}
        >
          <RadioGroupItem id={`${idPrefix}-custom`} value="custom" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-sm font-medium">Use a different logo</p>
              <p className="text-xs text-muted-foreground">
                PNG or JPEG, up to {MAX_MB} MB.
              </p>
            </div>
            {source === "custom" && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={pick}
                  disabled={disabled || uploading}
                  aria-label="Upload a logo"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || uploading}
                  onClick={(event) => {
                    event.preventDefault();
                    inputRef.current?.click();
                  }}
                >
                  {uploading ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Upload />
                  )}
                  {uploaded ? "Replace" : "Upload file"}
                </Button>
              </>
            )}
          </div>
          <LogoTile
            url={uploaded}
            empty="Not uploaded"
            dimmed={source !== "custom"}
          />
        </label>
      </RadioGroup>
    </div>
  );
}
