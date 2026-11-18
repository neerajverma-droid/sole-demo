"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Copy,
  Eye,
  FileText,
  LayoutTemplate,
  Mail,
  Paperclip,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterPill } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import {
  templateHoverAction,
  templateMenuItems,
  type TemplateCardAction,
  type TemplateMenuItem,
} from "@/lib/proposal-builder-logic";
import { TemplateGridSkeleton } from "@/components/proposals/proposal-template-cards";
import { useInvalidateProposals } from "@/hooks/use-proposals-query";
import { apiErrorMessage } from "@/lib/api-error";
import { DEFAULT_TEMPLATES_FILTER, templatesFiltersAtom, type TemplatesFilter } from "@/lib/atoms";
import {
  TEMPLATE_KIND_META,
  deleteTemplateApi,
  duplicateTemplateApi,
  forgetTemplate,
  refreshTemplate,
  renameIssue,
  renameTemplateApi,
  proposalTemplateBuilderUrl,
  templateEditorUrl,
  templatePreviewUrl,
  templatesListUrl,
} from "@/lib/proposal-templates";
import {
  EMAIL_CATEGORIES,
  TEMPLATE_KINDS,
  createProposalFromTemplateApi,
  emailCategoryLabel,
  fetchTemplatesOfType,
  filterProposalTemplates,
  formatProposalDate,
  templateSummary,
  type ProposalTemplate,
  type TemplateKind,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

type Owner = TemplatesFilter["owner"];

const MENU_ENTRIES: Record<TemplateMenuItem, { label: string; icon: React.ComponentType }> = {
  preview: { label: "Preview", icon: Eye },
  use: { label: "Use this template", icon: ArrowRight },
  edit: { label: "Edit template", icon: PencilLine },
  duplicate: { label: "Duplicate", icon: Copy },
  "duplicate-edit": { label: "Duplicate & edit", icon: PencilLine },
  rename: { label: "Rename", icon: PencilLine },
  delete: { label: "Delete", icon: Trash2 },
};

const templatesKey = (kind: TemplateKind) =>
  // The proposal kind shares the New proposal picker's cache.
  kind === "PROPOSAL" ? ["proposal-templates"] : ["proposal-templates", kind];

/**
 * Proposal templates, one tab per kind: whole proposals, and the
 * introduction, terms and thank-you sections the builder can drop in. Your
 * own come first; Sole's system ones are read-only, so you work from a copy.
 * Each tab is its own URL, so it can be linked to and survives a refresh.
 */
export function ProposalTemplatesScreen({ kind }: { kind: TemplateKind }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const invalidateProposals = useInvalidateProposals();
  const meta = TEMPLATE_KIND_META[kind];
  const isProposal = kind === "PROPOSAL";

  const [filters, setFilters] = useAtom(templatesFiltersAtom);
  const { owner, query, category } = filters[kind] ?? DEFAULT_TEMPLATES_FILTER;
  const setFilter = (patch: Partial<TemplatesFilter>) =>
    setFilters((all) => ({ ...all, [kind]: { ...(all[kind] ?? DEFAULT_TEMPLATES_FILTER), ...patch } }));
  // Email tab only: sent with the proposal, reminder, or thank-you.
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<ProposalTemplate | null>(null);
  const [deleting, setDeleting] = React.useState<ProposalTemplate | null>(null);

  const templatesQuery = useQuery({
    queryKey: templatesKey(kind),
    queryFn: () => fetchTemplatesOfType(kind),
  });
  const templates = React.useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const isEmail = kind === "EMAIL";
  const inCategory =
    isEmail && category !== "all" ? templates.filter((template) => template.emailCategory === category) : templates;
  const matches = filterProposalTemplates(inCategory, query);
  const mine = matches.filter((template) => !template.isSystem);
  const system = matches.filter((template) => template.isSystem);
  const allMine = templates.filter((template) => !template.isSystem).length;
  const allSystem = templates.length - allMine;
  const searching = query.trim().length > 0 || (isEmail && category !== "all");

  const reload = () => queryClient.invalidateQueries({ queryKey: templatesKey(kind) });
  const toggleOwner = (next: Exclude<Owner, "all">) => setFilter({ owner: owner === next ? "all" : next });

  const newTemplate = () => {
    if (isProposal) {
      router.push(proposalTemplateBuilderUrl());
    } else {
      router.push(templateEditorUrl(kind));
    }
  };

  // Every kind previews full-page, in this tab, as the client receives it.
  const preview = (template: ProposalTemplate) => router.push(templatePreviewUrl(template.id));

  const run = async (template: ProposalTemplate, action: () => Promise<void>) => {
    if (busyId) return;
    setBusyId(template.id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  const applyTemplate = (template: ProposalTemplate) =>
    run(template, async () => {
      try {
        const id = await createProposalFromTemplateApi(template.id);
        invalidateProposals();
        router.push(`/proposals/${id}`);
      } catch (error) {
        toast.error(apiErrorMessage(error, "Failed to create proposal from template"));
      }
    });

  // System templates are read-only, so a copy is how you start from one.
  const duplicate = (template: ProposalTemplate, thenEdit: boolean) =>
    run(template, async () => {
      try {
        const id = await duplicateTemplateApi(template.id);
        toast.success(`Created your own editable copy of “${template.name}”.`);
        await reload();
        if (thenEdit && id) router.push(isProposal ? proposalTemplateBuilderUrl(id) : templateEditorUrl(kind, id));
      } catch (error) {
        toast.error(apiErrorMessage(error, "Unable to duplicate this template."));
      }
    });

  const showMine = owner !== "system" && (mine.length > 0 || !searching);
  const showSystem = owner !== "mine" && system.length > 0;

  const editTemplate = (template: ProposalTemplate) =>
    router.push(isProposal ? proposalTemplateBuilderUrl(template.id) : templateEditorUrl(kind, template.id));

  const runCardAction = (template: ProposalTemplate, action: TemplateCardAction) => {
    if (action === "create") void applyTemplate(template);
    else if (action === "duplicate") void duplicate(template, false);
    else editTemplate(template);
  };

  const runMenuItem = (template: ProposalTemplate, item: TemplateMenuItem) => {
    switch (item) {
      case "preview":
        return preview(template);
      case "use":
        return void applyTemplate(template);
      case "edit":
        return editTemplate(template);
      case "duplicate":
        return void duplicate(template, false);
      case "duplicate-edit":
        return void duplicate(template, true);
      case "rename":
        return setRenaming(template);
      case "delete":
        return setDeleting(template);
    }
  };

  const tile = (template: ProposalTemplate, tone: "primary" | "success") => (
    <TemplateTile
      key={template.id}
      template={template}
      tone={tone}
      busy={busyId === template.id}
      disabled={busyId !== null}
      onPreview={() => preview(template)}
      action={{
        label: templateHoverAction(template).label,
        onClick: () => runCardAction(template, templateHoverAction(template).action),
      }}
      menu={templateMenuItems(template).map((item) => {
        const entry = MENU_ENTRIES[item];
        const Icon = entry.icon;
        return (
          <React.Fragment key={item}>
            {item === "delete" && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className={item === "delete" ? "text-destructive focus:text-destructive" : undefined}
              onSelect={() => runMenuItem(template, item)}
            >
              <Icon />
              {entry.label}
            </DropdownMenuItem>
          </React.Fragment>
        );
      })}
    />
  );

  return (
    <div className="space-y-[15px]">
      <PageHeader icon={LayoutTemplate} title="Proposal templates" description={meta.description}>
        <Button onClick={newTemplate}>
          <Plus />
          New template
        </Button>
      </PageHeader>

      <Tabs value={kind} onValueChange={(next) => router.push(templatesListUrl(next as TemplateKind))}>
        {/* Five tabs don't fit a phone: the strip scrolls sideways, edge to edge. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList aria-label="Template types" className="w-max justify-start">
            {TEMPLATE_KINDS.map((entry) => (
              <TabsTrigger key={entry.type} value={entry.type}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-col gap-[15px] sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setFilter({ query: event.target.value })}
            placeholder="Search templates..."
            aria-label="Search templates"
            className="px-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setFilter({ query: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by owner">
          <FilterPill active={owner === "mine"} onSelect={() => toggleOwner("mine")}>
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            My templates
            <span className="tabular text-muted-foreground">{allMine}</span>
          </FilterPill>
          <FilterPill active={owner === "system"} onSelect={() => toggleOwner("system")}>
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            System templates
            <span className="tabular text-muted-foreground">{allSystem}</span>
          </FilterPill>
        </div>
        {isEmail && (
          <div className="flex flex-wrap gap-2 sm:border-l sm:border-border sm:pl-[15px]" role="group" aria-label="Filter by use">
            {EMAIL_CATEGORIES.map((entry) => (
              <FilterPill
                key={entry.value}
                active={category === entry.value}
                onSelect={() => setFilter({ category: category === entry.value ? "all" : entry.value })}
              >
                {entry.label}
                <span className="tabular text-muted-foreground">
                  {templates.filter((template) => template.emailCategory === entry.value).length}
                </span>
              </FilterPill>
            ))}
          </div>
        )}
      </div>

      {/* Skeleton cards on the first load and on every reload (after a
          duplicate, rename or delete) — never a dimmed, stale grid. */}
      {templatesQuery.isLoading || templatesQuery.isFetching ? (
        <TemplateGridSkeleton
          count={10}
          edge
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        />
      ) : templatesQuery.isError ? (
        <Notice>
          Couldn&apos;t load {meta.singular.toLowerCase()} templates.{" "}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => reload()}>
            Try again
          </button>
        </Notice>
      ) : searching && matches.length === 0 ? (
        <Notice>
          {query.trim()
            ? <>No templates match &ldquo;{query.trim()}&rdquo;.</>
            : <>No {emailCategoryLabel(category).toLowerCase()} emails yet.</>}
        </Notice>
      ) : (
        <div className="space-y-[15px]">
          {showMine && (
            <Section title="My templates" count={mine.length} tone="primary">
              {mine.length === 0 ? <AddTemplateCard onClick={newTemplate} /> : mine.map((template) => tile(template, "primary"))}
            </Section>
          )}
          {showSystem && (
            <Section title="System templates" count={system.length} tone="success">
              {system.map((template) => tile(template, "success"))}
            </Section>
          )}
          {!showMine && !showSystem && <Notice>No {meta.singular.toLowerCase()} templates here yet.</Notice>}
        </div>
      )}

      <RenameDialog template={renaming} onClose={() => setRenaming(null)} onRenamed={reload} />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && busyId === null && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{deleting?.name}&rdquo;? Proposals that already used it aren&apos;t affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busyId !== null}
              onClick={(event) => {
                event.preventDefault();
                const target = deleting;
                if (!target) return;
                void run(target, async () => {
                  try {
                    await deleteTemplateApi(target.id);
                    forgetTemplate(queryClient, target.id);
                    toast.success(`“${target.name}” deleted.`);
                    setDeleting(null);
                    await reload();
                  } catch (error) {
                    toast.error(apiErrorMessage(error, "Unable to delete this template."));
                  }
                });
              }}
            >
              {busyId !== null && <Loader2 className="animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{children}</div>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: "primary" | "success";
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <span className={cn("size-1.5 rounded-full", tone === "primary" ? "bg-primary" : "bg-success")} aria-hidden />
        {title}
        <span className="font-normal normal-case tracking-normal text-muted-foreground">
          {count} {count === 1 ? "template" : "templates"}
        </span>
      </h2>
      <Grid>{children}</Grid>
    </section>
  );
}

/** My templates' "empty" card: the size of a template card, one click to start one. */
function AddTemplateCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card/60 p-3 text-center transition-colors hover:border-primary hover:bg-card"
    >
      <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Plus className="size-3.5" />
      </span>
      <span className="text-[13px] font-medium">Add template</span>
      <span className="text-xs text-muted-foreground">Start from scratch, or duplicate a system template below.</span>
    </button>
  );
}

/**
 * A template card, as sole-pm's: click anywhere to preview. On hover (or
 * keyboard focus) the description and footer give way to Preview and the
 * card's main action, in the same grid cell so the card never resizes.
 */
function TemplateTile({
  template,
  tone,
  busy,
  disabled,
  onPreview,
  action,
  menu,
}: {
  template: ProposalTemplate;
  tone: "primary" | "success";
  busy: boolean;
  disabled: boolean;
  onPreview: () => void;
  /** The second hover button — Create proposal, Edit or Duplicate. */
  action: { label: string; onClick: () => void };
  menu: React.ReactNode;
}) {
  // An email card leads with its subject — what the client sees first.
  const summary = template.type === "EMAIL" && template.subject ? template.subject : templateSummary(template);
  const Icon = template.type === "EMAIL" ? Mail : FileText;

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Preview ${template.name}`}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onPreview()}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview();
        }
      }}
      className={cn(
        "group relative flex min-h-[104px] cursor-pointer flex-col gap-2 rounded-lg border border-l-[3px] border-border bg-card p-3 shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        tone === "primary" ? "border-l-primary" : "border-l-success",
        busy && "ring-1 ring-primary",
        disabled && !busy && "cursor-not-allowed",
      )}
    >
      <span className="flex min-w-0 items-center gap-2 pr-7">
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md",
            tone === "primary" ? "bg-primary/10 text-primary" : "bg-success/10 text-success",
          )}
          aria-hidden
        >
          <Icon className="size-3.5" />
        </span>
        <span className="truncate text-[13px] font-medium" title={template.name}>
          {template.name}
        </span>
      </span>

      {/* The details and the hover actions share one grid cell. */}
      <div className="grid flex-1">
        <div
          style={{ gridArea: "1 / 1" }}
          className={cn(
            "flex flex-col gap-1.5 transition-opacity",
            !busy &&
              "group-hover:pointer-events-none group-hover:opacity-0 group-focus-within:pointer-events-none group-focus-within:opacity-0",
          )}
        >
          <span
            className={cn("line-clamp-2 text-xs leading-snug", summary ? "text-muted-foreground" : "text-muted-foreground/70")}
          >
            {summary || "No description."}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-1.5 text-[11px]">
            {busy ? (
              <span className="flex items-center gap-1.5 font-medium text-primary">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Working…
              </span>
            ) : (
              <>
                {template.type === "PROPOSAL" && (
                  <span className="rounded bg-muted px-1.5 py-px font-medium tabular">
                    {template.serviceCount} {template.serviceCount === 1 ? "service" : "services"}
                  </span>
                )}
                {template.emailCategory && (
                  <span className="rounded bg-muted px-1.5 py-px font-medium">{emailCategoryLabel(template.emailCategory)}</span>
                )}
                {template.attachmentCount > 0 && (
                  <span
                    className="flex items-center gap-1 rounded bg-muted px-1.5 py-px font-medium tabular"
                    title={`${template.attachmentCount} attachment${template.attachmentCount > 1 ? "s" : ""}`}
                  >
                    <Paperclip className="size-3" aria-hidden />
                    {template.attachmentCount}
                  </span>
                )}
                {template.updatedAt && (
                  <span className="text-muted-foreground">Updated {formatProposalDate(template.updatedAt)}</span>
                )}
              </>
            )}
          </span>
        </div>

        {!busy && (
          <div
            style={{ gridArea: "1 / 1" }}
            className="pointer-events-none flex items-center justify-center gap-2 rounded bg-card opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          >
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onPreview();
              }}
              className="h-6 rounded-full bg-primary px-3.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Preview
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                action.onClick();
              }}
              className="h-6 rounded-full border border-primary bg-card px-3.5 text-[10px] font-bold uppercase tracking-wide text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              {action.label}
            </button>
          </div>
        )}
      </div>

      <div className="absolute right-1.5 top-1.5" onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 sm:size-7 text-muted-foreground"
              aria-label={`Actions for ${template.name}`}
              disabled={disabled}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function RenameDialog({
  template,
  onClose,
  onRenamed,
}: {
  template: ProposalTemplate | null;
  onClose: () => void;
  onRenamed: () => Promise<unknown> | void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (template) {
      setName(template.name);
      setError("");
    }
  }, [template]);

  const save = async () => {
    if (!template) return;
    const issue = renameIssue(name, template.type);
    if (issue) {
      setError(issue);
      return;
    }
    setSaving(true);
    try {
      await renameTemplateApi(template.id, name);
      void refreshTemplate(queryClient, template.id);
      toast.success("Template renamed.");
      await onRenamed();
      onClose();
    } catch (renameError) {
      setError(apiErrorMessage(renameError, "Unable to rename this template."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={template !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
          <DialogDescription>Only the name changes; the content stays as it is.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={name}
            autoFocus
            aria-label="Template name"
            aria-invalid={Boolean(error) || undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => event.key === "Enter" && save()}
          />
          {error && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
