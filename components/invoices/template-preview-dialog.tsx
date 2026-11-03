"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchInvoiceTemplatePreviewHtml } from "@/lib/invoice-templates";
import { sessionUserId, useSessionStore } from "@/stores/session";

/**
 * What the template looks like as a finished invoice — the server's own
 * rendering of it, shown as-is, the way sole-webapp's gallery Preview does.
 * It's markup from the API, so it sits in a sandboxed frame rather than
 * being injected into this page.
 */
export type PreviewableTemplate = {
  id: string;
  name: string;
  industryId?: number | null;
  scope?: string;
};

export function TemplatePreviewDialog({
  template,
  href,
  kind = "invoice",
  onOpenChange,
}: {
  template: PreviewableTemplate | null;
  /** Where "Use this template" goes. */
  href: string;
  /** Quotes render in their own layout, from the same endpoint. */
  kind?: "invoice" | "quote";
  onOpenChange: (open: boolean) => void;
}) {
  const userId = sessionUserId(useSessionStore((state) => state.user));
  const query = useQuery({
    queryKey: ["template-preview", kind, template?.id, template?.industryId, userId],
    queryFn: () =>
      fetchInvoiceTemplatePreviewHtml(
        template!,
        userId,
        kind === "quote" ? "quote" : undefined,
      ),
    enabled: template !== null,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Dialog open={template !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{template?.name ?? "Template preview"}</DialogTitle>
          <DialogDescription>
            {`A preview of how this template looks on ${kind === "quote" ? "a quote" : "an invoice"}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-white">
          {query.isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading preview…
            </div>
          ) : query.isError || !query.data ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {query.error?.message || "Couldn't load the preview."}
            </div>
          ) : (
            <iframe
              title={`${template?.name ?? "Template"} preview`}
              srcDoc={query.data}
              sandbox=""
              className="size-full border-0"
            />
          )}
        </div>

        {template && (
          <div className="flex justify-end">
            <Button asChild>
              <Link href={href}>
                <Sparkles />
                Use this template
              </Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
