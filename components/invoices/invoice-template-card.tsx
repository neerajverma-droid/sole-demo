"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Sparkles, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";
import {
  ACCENT_CLASS,
  deleteInvoiceDefaultApi,
  templateHref,
  type InvoiceTemplate,
} from "@/lib/invoice-templates";
import { cn } from "@/lib/utils";
import { useInvoicesStore } from "@/stores/invoices";

/** Fixed widths — a random pattern would differ between server and client. */
const SKELETON_WIDTHS = ["w-full", "w-5/6", "w-4/6", "w-3/6"];

export function InvoiceTemplateCard({
  template,
  onPreview,
}: {
  template: InvoiceTemplate;
  onPreview: (template: InvoiceTemplate) => void;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const deleteTemplate = useMutation({
    mutationFn: () => deleteInvoiceDefaultApi(template.id),
    onSuccess: async () => {
      setConfirmDelete(false);
      toast.success("Template deleted");
      await queryClient.invalidateQueries({ queryKey: ["invoice-defaults"] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Couldn't delete that template.")),
  });

  const favourites = useInvoicesStore((state) => state.favouriteTemplates);
  const toggleFavourite = useInvoicesStore(
    (state) => state.toggleFavouriteTemplate,
  );
  const isFavourite = favourites.includes(template.id);
  const lines = template.items.length;

  return (
    <div className="group relative rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md">
      <div className="relative">
        {/* Miniature invoice: accent bar, body lines, total block. */}
        <div className="rounded-lg bg-muted/40 p-4">
          <div
            className={cn(
              "h-2 w-1/3 rounded-sm",
              ACCENT_CLASS[template.accent],
            )}
            aria-hidden
          />
          <div className="mt-3 space-y-1.5" aria-hidden>
            {template.items.slice(0, 4).map((_item, index) => (
              <div
                // Decorative skeleton bars, not real content — a template's
                // items here may share a blank description until it's
                // actually opened, so the index is what's stable and unique.
                key={index}
                className={cn(
                  "h-1.5 rounded-full bg-muted-foreground/20",
                  SKELETON_WIDTHS[index % SKELETON_WIDTHS.length],
                )}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-end" aria-hidden>
            <div className="space-y-1">
              <div className="ml-auto h-1.5 w-10 rounded-full bg-muted-foreground/20" />
              <div className="ml-auto h-2.5 w-16 rounded-sm bg-muted-foreground/30" />
            </div>
          </div>
        </div>

        {!template.standard && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${template.name}`}
            title="Delete template"
            className="absolute right-12 top-2 z-10 grid size-8 place-items-center rounded-md border border-border bg-background/90 text-muted-foreground opacity-0 outline-none transition-all hover:bg-background hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
          >
            <Trash2 className="size-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => toggleFavourite(template.id)}
          aria-pressed={isFavourite}
          aria-label={
            isFavourite
              ? `Remove ${template.name} from favourites`
              : `Add ${template.name} to favourites`
          }
          className={cn(
            "absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-md border border-border bg-background/90 outline-none transition-all hover:bg-background focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100",
            // A starred template keeps its star showing; the rest appear on hover.
            isFavourite ? "opacity-100" : "opacity-0",
          )}
        >
          <Star
            className={cn(
              "size-4",
              isFavourite
                ? "fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          />
        </button>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{template.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Who the template belongs to: Sole's shared set, or one this
              account saved. The shared set can be used or copied, never
              edited — the tooltip says so. */}
          {template.standard ? (
            <Badge
              variant="secondary"
              className="text-[10px] uppercase tracking-wide"
              title="Standard template — shared with every account. Use it or save your own copy; it can't be edited."
            >
              Standard
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-orange-500/30 bg-orange-500/[0.08] text-[10px] uppercase tracking-wide text-orange-600 dark:text-orange-400"
              title="Saved by you — only your account sees it."
            >
              User
            </Badge>
          )}
          {/* The scope label the server sends — General, or the industry
              the template was written for. Not the template's editor type:
              an NDIS-layout template can belong to any industry. */}
          <Badge
            variant="outline"
            title={template.category}
            className="max-w-full border-primary/30 bg-primary/[0.06] text-[10px] uppercase tracking-wide text-primary"
          >
            <span className="truncate">{template.category}</span>
          </Badge>
        </div>
        {/* What it's for, in its own words — not the name said twice. */}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {template.summary}
        </p>
        {/* The line count stands in for the fake dollar total the reference
            showed — a template has no amount until it's filled in. */}
        <p className="text-xs text-muted-foreground/80">
          {lines} {lines === 1 ? "line" : "lines"}
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <Button asChild size="sm" className="flex-1">
          <Link href={templateHref(template)}>
            <Sparkles />
            Use this
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onPreview(template)}
        >
          <Eye />
          Preview
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{template.name}&rdquo; will be removed. Invoices already
              created from it aren&apos;t affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTemplate.isPending}
              onClick={(event) => {
                // Stay open until the request settles.
                event.preventDefault();
                deleteTemplate.mutate();
              }}
            >
              {deleteTemplate.isPending && (
                <Loader2 className="animate-spin" aria-hidden />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
