"use client";

import * as React from "react";
import { Crop, ImageIcon, Palette, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { SalesSection } from "@/components/sales-settings/tab-shell";
import {
  hexColorError,
  normaliseHex,
  type SalesSettings,
} from "@/lib/sales-settings";
import { cn } from "@/lib/utils";

const MAX_LOGO_BYTES = 512 * 1024;

export function BrandingTab({
  values,
  patch,
}: {
  values: SalesSettings;
  patch: (next: Partial<SalesSettings>) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  /** The image waiting to be cropped — nothing is saved until it's confirmed. */
  const [pending, setPending] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(100);

  const onFile = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("That logo is too large", {
        description: "Use an image under 512 KB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPending(String(reader.result));
      setZoom(100);
    };
    reader.onerror = () => toast.error("That image could not be read");
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <SalesSection
        icon={ImageIcon}
        title="Business logo"
        description="Printed at the top of every invoice and quote. Crop it before saving so it sits the way you want."
      >
        {pending ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border surface-subtle p-4">
              {/* The crop frame: a fixed window the image is scaled inside. */}
              <div className="grid size-40 place-items-center overflow-hidden rounded-lg border border-border bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pending}
                  alt="Logo being cropped"
                  className="size-full object-contain"
                  style={{ transform: `scale(${zoom / 100})` }}
                />
              </div>
              <div className="w-full max-w-xs space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Crop className="size-3.5" aria-hidden />
                    Zoom
                  </span>
                  <span className="tabular">{zoom}%</span>
                </div>
                {/* Native range rather than a new dependency for one control.
                    `accent-primary` paints it with the brand colour in both themes. */}
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  aria-label="Zoom"
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  patch({ logo: pending });
                  setPending(null);
                  toast.success("Logo cropped — save to keep it");
                }}
              >
                Use this crop
              </Button>
            </div>
          </div>
        ) : values.logo ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <span
              className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border surface-subtle"
              aria-hidden
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={values.logo}
                alt="Your logo"
                className="size-full object-contain p-1"
              />
            </span>
            <p className="min-w-0 flex-1 text-sm font-medium">Logo set</p>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => patch({ logo: null })}
            >
              <X />
              Remove
            </Button>
          </div>
        ) : (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) onFile(dropped);
            }}
            className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border surface-subtle px-6 py-8 text-center transition-colors hover:border-primary/40"
          >
            <span
              className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"
              aria-hidden
            >
              <Upload className="size-5" />
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Browse
              </Button>
              <p className="text-sm text-muted-foreground">
                or drag &amp; drop your logo
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              PNG or JPG under 512 KB · you&apos;ll crop it next
            </p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) onFile(chosen);
            event.target.value = "";
          }}
        />
      </SalesSection>

      <SalesSection
        icon={Palette}
        title="Colours"
        description="Brand colour is used for headings and the accent rule; content colour is the body text."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label="Brand colour"
            value={values.brandColor}
            onChange={(next) => patch({ brandColor: next })}
          />
          <ColorField
            label="Content colour"
            value={values.contentColor}
            onChange={(next) => patch({ contentColor: next })}
          />
        </div>
      </SalesSection>
    </div>
  );
}

/**
 * A swatch beside a hex input. The swatch is a native colour picker, so the two
 * drive each other rather than the hex field being the only way in.
 */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const issue = hexColorError(value);

  return (
    <Field label={label} error={issue}>
      <div className="flex items-center gap-2">
        <label
          className="relative size-10 shrink-0 overflow-hidden rounded-md border border-border"
          style={{ backgroundColor: issue ? "transparent" : normaliseHex(value) }}
        >
          <span className="sr-only">{label} swatch</span>
          <input
            type="color"
            value={normaliseHex(value)}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${label} picker`}
          />
        </label>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#4D4DFE"
          aria-invalid={!!issue}
          className={cn(
            "tabular",
            issue && "border-destructive focus-visible:ring-destructive",
          )}
        />
      </div>
    </Field>
  );
}
