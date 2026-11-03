"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Eye, FileText, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

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
import { Shimmer } from "@/components/ui/shimmer";
import { proposalTemplatePickerOpenAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  createProposalFromTemplateApi,
  fetchProposalTemplates,
  filterProposalTemplates,
  type ProposalTemplate,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

/**
 * "New proposal": start blank, or from one of your own templates or Sole's
 * system ones — searchable, each previewable exactly as the client will see it.
 */
export function ProposalTemplatePickerDialog() {
  const router = useRouter();
  const [open, setOpen] = useAtom(proposalTemplatePickerOpenAtom);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const templatesQuery = useQuery({
    queryKey: ["proposal-templates"],
    queryFn: fetchProposalTemplates,
    enabled: open,
  });
  const templates = React.useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const matches = filterProposalTemplates(templates, query);
  const mine = matches.filter((template) => !template.isSystem);
  const system = matches.filter((template) => template.isSystem);
  const searching = query.trim().length > 0;

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // The template is applied server-side, so the builder simply opens the
  // proposal that comes back — exactly like opening any existing one.
  const applyTemplate = async (templateId: string) => {
    setApplyingId(templateId);
    try {
      const id = await createProposalFromTemplateApi(templateId);
      setOpen(false);
      router.push(`/proposals/${id}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to create proposal from template"));
    } finally {
      setApplyingId(null);
    }
  };

  const startBlank = () => {
    setOpen(false);
    router.push("/proposals/new");
  };

  const applying = applyingId !== null;

  // Its own screen, in this tab. The picker's open state is left as it is,
  // so closing the preview comes back to the picker where it was.
  const previewTemplate = (template: ProposalTemplate) =>
    router.push(`/proposals/templates/${template.id}/preview`);

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !applying && setOpen(next)}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-border px-6 py-5 text-left">
            <DialogTitle>Create a new proposal</DialogTitle>
            <DialogDescription>Pick a template — or start with a blank proposal.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-[15px] overflow-y-auto px-6 py-5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search templates..."
                aria-label="Search templates"
                className="h-10 pl-9"
              />
            </div>

            <button
              type="button"
              disabled={applying}
              onClick={startBlank}
              className="group flex w-full items-center gap-4 rounded-lg border border-dashed border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Plus className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Start from scratch</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Empty proposal — pick the client, add services, and write your own intro &amp; terms.
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
            </button>

            {templatesQuery.isLoading ? (
              <TemplateSection title="Templates" tone="primary">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Shimmer key={index} className="h-[104px] rounded-lg" />
                ))}
              </TemplateSection>
            ) : templatesQuery.isError ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Couldn&apos;t load templates.{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => templatesQuery.refetch()}
                >
                  Try again
                </button>
              </p>
            ) : searching && matches.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No templates match &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : (
              <>
                {(mine.length > 0 || !searching) && (
                  <TemplateSection title="My templates" count={mine.length} tone="primary">
                    {mine.length === 0 ? (
                      <p className="col-span-full rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        No saved templates yet. Build a proposal, then use &ldquo;Save as template&rdquo; at
                        the top of the builder.
                      </p>
                    ) : (
                      mine.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          applying={applyingId === template.id}
                          disabled={applying}
                          onSelect={() => applyTemplate(template.id)}
                          onPreview={() => previewTemplate(template)}
                        />
                      ))
                    )}
                  </TemplateSection>
                )}
                {system.length > 0 && (
                  <TemplateSection title="System templates" count={system.length} tone="success">
                    {system.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        applying={applyingId === template.id}
                        disabled={applying}
                        onSelect={() => applyTemplate(template.id)}
                        onPreview={() => previewTemplate(template)}
                      />
                    ))}
                  </TemplateSection>
                )}
              </>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" disabled={applying} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={applying} onClick={startBlank}>
              Start from scratch
              <ArrowRight />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateSection({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count?: number;
  tone: "primary" | "success";
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn("size-1.5 rounded-full", tone === "primary" ? "bg-primary" : "bg-success")} />
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular">
            {count}
          </span>
        )}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function TemplateCard({
  template,
  applying,
  disabled,
  onSelect,
  onPreview,
}: {
  template: ProposalTemplate;
  applying: boolean;
  disabled: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[104px] flex-col rounded-lg border bg-card shadow-sm transition-colors",
        applying ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40 hover:bg-primary/5",
        disabled && !applying && "opacity-50",
      )}
    >
      {/* The whole card applies the template; the eye on top of it previews. */}
      <button
        type="button"
        disabled={disabled}
        aria-busy={applying}
        onClick={onSelect}
        className="flex flex-1 flex-col gap-3 p-4 pr-12 text-left disabled:cursor-not-allowed"
      >
        <span className="line-clamp-2 font-medium leading-snug">{template.name}</span>
        <span className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {applying ? (
            <>
              <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
              <span className="font-medium text-primary">Creating proposal…</span>
            </>
          ) : (
            <>
              <FileText className="size-3.5" aria-hidden />
              {template.serviceCount} {template.serviceCount === 1 ? "service" : "services"}
            </>
          )}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-8 text-muted-foreground hover:text-foreground"
        aria-label={`Preview ${template.name}`}
        disabled={disabled}
        onClick={onPreview}
      >
        <Eye className="size-4" />
      </Button>
    </div>
  );
}
