"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, LayoutTemplate, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SalesSection } from "@/components/sales-settings/tab-shell";
import { isNdisBusinessProfile, useActiveBusiness } from "@/hooks/use-active-business";
import {
  fetchSalesTemplates,
  fetchTemplatePreviewHtml,
  templatesFor,
  type SalesTemplate,
  type SalesTemplateGroup,
} from "@/lib/sales-templates";
import type { SalesSettings } from "@/lib/sales-settings";
import { cn } from "@/lib/utils";

/** Which group label, and which group backs it, for each kind — matches sole-webapp's tab layout exactly. */
const GROUPS_FOR: Record<
  "Invoice" | "Quote",
  { label: string; group: SalesTemplateGroup }[]
> = {
  Invoice: [
    { label: "General Style", group: "General" },
    { label: "NDIS Style", group: "NDIS" },
    { label: "Classic Template", group: "Classic" },
  ],
  Quote: [
    { label: "General Styles", group: "General" },
    { label: "Classic Styles", group: "Classic" },
    { label: "NDIS Styles", group: "NDIS" },
  ],
};

/**
 * Tabs 6 and 7. Real templates from `/template/list` — sole-webapp's own
 * gallery — rather than the fictional local style catalog this tab used to
 * render. General and Classic both write to the one `invoiceStyle`/
 * `quoteStyle` slot (the backend keeps them in the same field); NDIS is its
 * own slot, and its whole section only appears for an NDIS business, same as
 * `Branding.js`'s `isNdis` gate.
 */
export function StylingTab({
  kind,
  values,
  patch,
}: {
  kind: "Invoice" | "Quote";
  values: SalesSettings;
  patch: (next: Partial<SalesSettings>) => void;
}) {
  const { business } = useActiveBusiness();
  const isNdis = isNdisBusinessProfile(business);
  const [previewing, setPreviewing] = React.useState<SalesTemplate | null>(
    null,
  );
  const [previewHtml, setPreviewHtml] = React.useState("");
  const [previewLoading, setPreviewLoading] = React.useState(false);
  /**
   * The server's template renders at its own fixed (print) canvas width,
   * unrelated to the dialog's — sole-webapp's own preview happens to render at
   * a size close to its dialog, but ours doesn't, so the content has to be
   * scaled to the stage rather than shown at its literal size (which left most
   * of a wide dialog blank). `scale` is purely a paint-time transform, so it
   * doesn't change the element's own layout box; `height` is measured
   * separately and applied to the wrapper so the dialog reserves exactly the
   * scaled height rather than the unscaled one.
   */
  const [fit, setFit] = React.useState({ scale: 1, height: 0 });
  const stageOuterRef = React.useRef<HTMLDivElement>(null);
  const stageInnerRef = React.useRef<HTMLDivElement>(null);

  const isInvoice = kind === "Invoice";
  const templatesQuery = useQuery({
    queryKey: ["sales-templates"],
    queryFn: fetchSalesTemplates,
  });
  const templates = templatesQuery.data ?? [];
  const loading = templatesQuery.isLoading;

  const selectedId = (group: SalesTemplateGroup): string =>
    group === "NDIS"
      ? isInvoice
        ? values.ndisInvoiceStyle
        : values.ndisQuoteStyle
      : isInvoice
        ? values.invoiceStyle
        : values.quoteStyle;

  const select = (template: SalesTemplate) => {
    if (template.group === "NDIS") {
      patch(
        isInvoice
          ? { ndisInvoiceStyle: template.id }
          : { ndisQuoteStyle: template.id },
      );
    } else {
      patch(isInvoice ? { invoiceStyle: template.id } : { quoteStyle: template.id });
    }
  };

  const openPreview = async (template: SalesTemplate) => {
    setPreviewing(template);
    setPreviewLoading(true);
    setFit({ scale: 1, height: 0 });
    try {
      const html = await fetchTemplatePreviewHtml(
        template.id,
        isInvoice ? "invoice" : "quote",
      );
      setPreviewHtml(html);
    } catch {
      setPreviewHtml("<p>Template preview not available</p>");
    } finally {
      setPreviewLoading(false);
    }
  };

  React.useLayoutEffect(() => {
    const outer = stageOuterRef.current;
    const inner = stageInnerRef.current;
    if (previewLoading || !previewHtml || !outer || !inner) return;

    const measure = () => {
      const naturalWidth = inner.scrollWidth;
      const naturalHeight = inner.scrollHeight;
      const outerWidth = outer.clientWidth;
      if (!naturalWidth || !outerWidth) return;
      // Always fit the stage's width exactly — scaling up as well as down —
      // so the document fills the frame the way sole-webapp's own preview does,
      // rather than floating small inside a mostly-blank box.
      const scale = outerWidth / naturalWidth;
      setFit({ scale, height: naturalHeight * scale });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [previewHtml, previewLoading]);

  const groups = GROUPS_FOR[kind].filter(
    (entry) => entry.group !== "NDIS" || isNdis,
  );

  return (
    <div className="space-y-4">
      {groups.map((entry) => {
        const groupTemplates = templatesFor(templates, entry.group, kind.toLowerCase() as "invoice" | "quote");
        const selected = selectedId(entry.group);

        return (
          <SalesSection
            key={entry.label}
            icon={LayoutTemplate}
            title={entry.label}
            description={
              loading
                ? "Loading templates…"
                : `${groupTemplates.length} ${groupTemplates.length === 1 ? "style" : "styles"} available.`
            }
          >
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading templates…
              </div>
            ) : groupTemplates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No templates available at the moment.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groupTemplates.map((template) => (
                  <StyleCard
                    key={template.id}
                    template={template}
                    active={template.id === selected}
                    onSelect={() => select(template)}
                    onPreview={() => openPreview(template)}
                  />
                ))}
              </div>
            )}
          </SalesSection>
        );
      })}

      <Dialog
        open={previewing !== null}
        onOpenChange={(open) => !open && setPreviewing(null)}
      >
        <DialogContent className="max-h-[96vh] w-[95vw] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{previewing?.name} preview</DialogTitle>
          </DialogHeader>
          {previewing && (
            <>
              <div
                ref={stageOuterRef}
                className="max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-white shadow-sm"
                style={
                  !previewLoading && fit.height
                    ? { height: fit.height }
                    : undefined
                }
              >
                {previewLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading preview…
                  </div>
                ) : (
                  <div
                    ref={stageInnerRef}
                    style={{
                      transform: `scale(${fit.scale})`,
                      transformOrigin: "top left",
                    }}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>
              <Button
                onClick={() => {
                  select(previewing);
                  setPreviewing(null);
                }}
                disabled={previewing.id === selectedId(previewing.group)}
              >
                {previewing.id === selectedId(previewing.group)
                  ? "Already selected"
                  : "Select this style"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StyleCard({
  template,
  active,
  onSelect,
  onPreview,
}: {
  template: SalesTemplate;
  active: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-3 shadow-sm transition-colors",
        active ? "border-primary/40 bg-primary/[0.02]" : "border-border bg-card",
      )}
    >
      <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20 p-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={template.image}
          alt={template.name}
          className="size-full object-contain"
        />
        {active && (
          <Badge className="absolute right-1.5 top-1.5 gap-1 text-[10px] uppercase tracking-wide">
            <Check className="size-3" aria-hidden />
            Selected
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{template.name}</p>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="outline" size="sm" onClick={onPreview}>
            <Eye />
            Preview
          </Button>
          <Button size="sm" onClick={onSelect} disabled={active}>
            {active ? "Selected" : "Select"}
          </Button>
        </div>
      </div>
    </div>
  );
}
