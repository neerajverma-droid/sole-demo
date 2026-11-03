"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Layers,
  Loader2,
  Mail,
  MessageSquareText,
  Palette,
  Paperclip,
  Play,
  RotateCcw,
  Save,
  ScrollText,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import { SendReportDialog } from "@/components/reports/send-report-dialog";
import {
  useChangePackStatus,
  useOpenPackDownload,
  useDuplicatePack,
  useGeneratePack,
  usePackGeneration,
  usePackTemplates,
  useRemoveAttachment,
  useSendPack,
  useUploadAttachment,
} from "@/hooks/use-report-packs";
import { apiErrorMessage } from "@/lib/api-error";
import { sendReportOpenAtom } from "@/lib/atoms";
import {
  canEdit,
  CUSTOM_PERIOD,
  DISCLAIMER_PLACEHOLDER,
  fetchTemplate,
  formatRangeLabel,
  formattingOf,
  isGenerating,
  NAME_MAX,
  nextStep,
  PACK_ROUTES,
  preferencesFrom,
  presetRange,
  pruneOrphanedComments,
  reportTitle,
  STARTER_SOURCE,
  TEMPLATE_SOURCE,
  toPackInput,
  type PackCatalogue,
  type PackInput,
  type PackStep,
  type ReportPack,
  type TemplateSource,
} from "@/lib/report-packs";
import type { ReportPeriod } from "@/lib/report-periods";
import { CoverLogoField } from "./cover-logo-field";
import {
  EDITOR_LAYOUT,
  EDITOR_SIDEBAR,
  EditorSection,
  useViewportFill,
} from "./editor-section";
import { InlineEmpty, PeriodFields, TemplateSourceSelect } from "./pack-fields";
import { PackPreview } from "./pack-preview";
import { PackStatusBadge } from "./pack-status-badge";
import { PagesList } from "./pages-list";
import { BrandingFields, ReportPreferenceFields } from "./preference-fields";

const STEP_HINT: Record<PackStep, string> = {
  save: "Save your changes, then generate a preview PDF to check it.",
  preview:
    "Check the preview on the right, then generate a preview PDF before approving.",
  regenerate:
    "The pack has changed since the last preview PDF. Regenerate it before approving.",
  approve:
    "Happy with the preview? Approve it to lock the figures for publishing.",
  publish:
    "Approved and locked. Publish to build the final PDF, or reopen it to make changes.",
  published:
    "Published and final. Email it, download it, or save it as a new pack for the next period.",
};

export function PackEditor({
  pack,
  catalogue,
  onSave,
  saving,
}: {
  pack: ReportPack;
  catalogue: PackCatalogue;
  onSave: (draft: PackInput) => Promise<ReportPack>;
  saving: boolean;
}) {
  const router = useRouter();
  const templates = usePackTemplates();
  const generate = useGeneratePack();
  const download = useOpenPackDownload();
  const changeStatus = useChangePackStatus();
  const duplicate = useDuplicatePack();
  const upload = useUploadAttachment();
  const removeFile = useRemoveAttachment();
  const sendPack = useSendPack();
  const openSendDialog = useSetAtom(sendReportOpenAtom);

  const [draft, setDraft] = React.useState<PackInput>(() => toPackInput(pack));
  const [confirmPublish, setConfirmPublish] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [period, setPeriod] = React.useState<ReportPeriod>(
    (pack.period_preset as ReportPeriod) || CUSTOM_PERIOD,
  );
  const [dirty, setDirty] = React.useState(false);
  const { guardNavigate, dialog: unsavedDialog } = useUnsavedChanges(dirty);
  const fill = useViewportFill();

  const updateDraft = React.useCallback(
    (updater: (current: PackInput) => PackInput) => {
      setDraft((current) => pruneOrphanedComments(updater(current)));
      setDirty(true);
    },
    [],
  );

  const set = <K extends keyof PackInput>(key: K, value: PackInput[K]) =>
    updateDraft((current) => ({ ...current, [key]: value }));

  const generation = usePackGeneration(
    pack.id,
    isGenerating(pack) || generate.isPending,
  );
  const liveGenerationStatus =
    generation.data?.generation_status ?? pack.generation_status;
  const busy =
    liveGenerationStatus === "queued" || liveGenerationStatus === "running";
  const editable = canEdit({
    status: pack.status,
    generation_status: liveGenerationStatus,
  });
  const status = pack.status;
  const step = nextStep(pack, dirty);

  const formatting = formattingOf(draft);

  const applyPeriod = (next: ReportPeriod) => {
    setPeriod(next);
    if (next === CUSTOM_PERIOD) {
      set("period_preset", null);
      return;
    }
    const range = presetRange(next);
    updateDraft((current) => ({
      ...current,
      period_preset: next,
      period_from: range.from,
      period_to: range.to,
    }));
  };

  const applySource = async (value: TemplateSource) => {
    if (value.startsWith(STARTER_SOURCE)) {
      const starter = catalogue.starterTemplates.find(
        (entry) => `${STARTER_SOURCE}${entry.key}` === value,
      );
      if (!starter) return;
      updateDraft((current) => ({
        ...current,
        template_id: null,
        reports: starter.reports,
      }));
      toast.success(`Applied "${starter.name}".`);
      return;
    }

    const id = Number(value.slice(TEMPLATE_SOURCE.length));
    if (!Number.isFinite(id) || id <= 0) return;
    setApplying(true);
    try {
      const template = await fetchTemplate(id);
      updateDraft((current) => ({
        ...current,
        template_id: template.id,
        reports: template.reports ?? [],
        orientation: template.orientation,
        negative_format: template.negative_format,
        disclaimer_text: template.disclaimer_text,
        cover_image_url: template.cover_image_url ?? current.cover_image_url,
        ...preferencesFrom(template),
      }));
      toast.success(
        `Applied "${template.name}" — ${(template.reports ?? []).length} reports.`,
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not apply that template."));
    } finally {
      setApplying(false);
    }
  };

  const resetPages = async () => {
    if (!draft.template_id) return;
    setApplying(true);
    try {
      const template = await fetchTemplate(draft.template_id);
      updateDraft((current) => ({
        ...current,
        reports: template.reports ?? [],
        cover_enabled: true,
        include_toc: true,
      }));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not reset the pages."));
    } finally {
      setApplying(false);
    }
  };

  const save = async () => {
    try {
      const saved = await onSave(draft);
      setDraft((current) => ({ ...current, version: saved.version }));
      setDirty(false);
      toast.success("Pack saved.");
      return saved;
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save the pack."));
      throw error;
    }
  };

  const run = async (publish: boolean) => {
    if (dirty) {
      try {
        await save();
      } catch {
        return;
      }
    }
    try {
      await generate.mutateAsync({ id: pack.id, publish });
      toast.success(
        publish ? "Publishing the pack…" : "Building the preview PDF…",
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not start generating."));
    }
  };

  const setStatus = async (next: "draft" | "approved") => {
    try {
      await changeStatus.mutateAsync({ id: pack.id, status: next });
      toast.success(
        next === "approved"
          ? "Pack approved. It's ready to publish."
          : "Pack reopened for changes.",
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not change the status."));
    }
  };

  const saveAsNew = async () => {
    try {
      const copy = await duplicate.mutateAsync(pack.id);
      toast.success("Saved as a new draft.");
      router.push(PACK_ROUTES.pack(copy.id));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not copy the pack."));
    }
  };

  const onUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await upload.mutateAsync({ id: pack.id, file });
      toast.success("File attached.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not attach that file."));
    }
  };

  const commentFor = (reportKey: string | null) =>
    draft.comments?.find((comment) => comment.report_key === reportKey);

  const setComment = (reportKey: string | null, body: string) =>
    updateDraft((current) => {
      const comments = current.comments ?? [];
      const existing = comments.find(
        (comment) => comment.report_key === reportKey,
      );
      const others = comments.filter(
        (comment) => comment.report_key !== reportKey,
      );
      if (body.trim() === "") return { ...current, comments: others };
      const display = existing?.display ?? ("below_report" as const);
      return {
        ...current,
        comments: [...others, { report_key: reportKey, body, display }],
      };
    });

  const setCommentOnOwnPage = (reportKey: string, ownPage: boolean) =>
    updateDraft((current) => ({
      ...current,
      comments: (current.comments ?? []).map((comment) =>
        comment.report_key === reportKey
          ? {
              ...comment,
              display: ownPage
                ? ("own_page" as const)
                : ("below_report" as const),
            }
          : comment,
      ),
    }));

  const frontMatter = [
    draft.cover_enabled && "cover",
    draft.include_toc && "contents",
  ]
    .filter(Boolean)
    .join(" and ");
  const pagesSummary = `${frontMatter ? `${frontMatter[0].toUpperCase()}${frontMatter.slice(1)}, ` : ""}${draft.reports.length} ${draft.reports.length === 1 ? "report" : "reports"}`;
  const preferencesSummary = [
    formatting.negative_format === "brackets" ? "Brackets" : "Minus sign",
    formatting.show_cents ? "cents" : "whole dollars",
    formatting.hide_zero_balances ? "zero balances hidden" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const brandingSummary = [
    `Logo ${formatting.logo_position === "center" ? "centred" : formatting.logo_position}`,
    formatting.logo_on_every_page ? "on every page" : null,
    formatting.confidential ? "Confidential" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const commentCount = draft.comments?.length ?? 0;
  const commentarySummary =
    commentCount === 0
      ? "No notes"
      : `${commentCount} ${commentCount === 1 ? "note" : "notes"}`;

  return (
    <div className="space-y-5 pb-16 xl:pb-0">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={guardNavigate(PACK_ROUTES.list)}
      >
        <ArrowLeft />
        Report packs
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{pack.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <PackStatusBadge
              status={pack.status}
              generationStatus={liveGenerationStatus}
            />
            <span>{formatRangeLabel(draft.period_from, draft.period_to)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "draft" && (
            <>
              <Button
                variant="outline"
                onClick={save}
                disabled={!editable || saving || !dirty}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => run(false)}
                disabled={busy || saving}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Play />}
                {pack.pdf_url
                  ? "Regenerate preview PDF"
                  : "Generate preview PDF"}
              </Button>
            </>
          )}

          {status === "approved" && (
            <Button
              variant="outline"
              onClick={() => setStatus("draft")}
              disabled={busy || changeStatus.isPending}
            >
              <RotateCcw />
              Reopen
            </Button>
          )}

          {pack.pdf_url && (
            <Button
              variant="outline"
              onClick={() => download.open(pack.id)}
              disabled={busy || download.isPending}
            >
              <Download />
              {status === "published" ? "Download PDF" : "Download preview"}
            </Button>
          )}

          {status === "draft" && (
            <Button
              onClick={() => setStatus("approved")}
              disabled={step !== "approve" || busy || changeStatus.isPending}
              title={step !== "approve" ? STEP_HINT[step] : undefined}
            >
              <CheckCircle2 />
              Approve
            </Button>
          )}

          {status === "approved" && (
            <Button onClick={() => setConfirmPublish(true)} disabled={busy}>
              <Send />
              Publish
            </Button>
          )}

          {status === "published" && (
            <>
              <Button
                variant="outline"
                onClick={saveAsNew}
                disabled={duplicate.isPending}
              >
                {duplicate.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Copy />
                )}
                Save as new pack
              </Button>
              <Button onClick={() => openSendDialog(true)}>
                <Mail />
                Email
              </Button>
            </>
          )}
        </div>
      </header>

      {!busy && liveGenerationStatus !== "failed" && (
        <p className="text-sm text-muted-foreground">{STEP_HINT[step]}</p>
      )}

      {liveGenerationStatus === "failed" && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <div>
            <AlertTitle>The last PDF build failed</AlertTitle>
            <AlertDescription>
              {generation.data?.generation_error ??
                pack.generation_error ??
                "Try generating it again."}
            </AlertDescription>
          </div>
        </Alert>
      )}

      <div ref={fill.ref} style={fill.style} className={EDITOR_LAYOUT}>
        <div className={EDITOR_SIDEBAR}>
          <EditorSection
            icon={FileText}
            title="Pack details"
            defaultOpen
            summary={period === CUSTOM_PERIOD ? "Custom period" : period}
          >
            <div className="space-y-2">
              <Label htmlFor="pack-name">Name</Label>
              <Input
                id="pack-name"
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
                disabled={!editable}
                maxLength={NAME_MAX}
              />
            </div>

            <PeriodFields
              idPrefix="pack"
              period={period}
              onPeriodChange={applyPeriod}
              from={draft.period_from}
              to={draft.period_to}
              onFromChange={(next) => set("period_from", next)}
              onToChange={(next) => set("period_to", next)}
              disabled={!editable}
            />

            <div className="space-y-2">
              <Label htmlFor="pack-description">Description</Label>
              <Textarea
                id="pack-description"
                value={draft.description ?? ""}
                onChange={(event) => set("description", event.target.value)}
                placeholder="What this pack is for, and who it goes to."
                disabled={!editable}
                maxLength={500}
                rows={2}
              />
            </div>
          </EditorSection>

          <EditorSection
            icon={Layers}
            title="Pages"
            defaultOpen
            description="Add, reorder and remove what goes in the pack."
            summary={pagesSummary}
          >
            <div className="space-y-2">
              <Label htmlFor="pack-template">Apply a template</Label>
              <TemplateSourceSelect
                id="pack-template"
                value=""
                onChange={applySource}
                templates={templates.data?.templates ?? []}
                starters={catalogue.starterTemplates}
                placeholder={
                  applying ? "Applying…" : "Replace the pages with a template's"
                }
                disabled={!editable || applying}
              />
            </div>

            <PagesList
              catalogue={catalogue.reports}
              reports={draft.reports}
              onReportsChange={(next) => set("reports", next)}
              coverEnabled={draft.cover_enabled ?? true}
              onCoverChange={(next) => set("cover_enabled", next)}
              tocEnabled={draft.include_toc ?? true}
              onTocChange={(next) => set("include_toc", next)}
              onReset={draft.template_id ? resetPages : undefined}
              resetting={applying}
              disabled={!editable}
            />
          </EditorSection>

          {draft.cover_enabled && (
            <EditorSection
              icon={ScrollText}
              title="Cover page"
              summary={draft.cover_title || draft.name}
            >
              <div className="space-y-2">
                <Label htmlFor="cover-title">Title</Label>
                <Input
                  id="cover-title"
                  value={draft.cover_title ?? ""}
                  onChange={(event) => set("cover_title", event.target.value)}
                  placeholder={draft.name}
                  disabled={!editable}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cover-subtitle">Description</Label>
                <Textarea
                  id="cover-subtitle"
                  value={draft.cover_subtitle ?? ""}
                  onChange={(event) =>
                    set("cover_subtitle", event.target.value)
                  }
                  disabled={!editable}
                  maxLength={500}
                  rows={2}
                />
              </div>
              <CoverLogoField
                idPrefix="pack-logo"
                value={draft.cover_image_url}
                defaultLogoUrl={catalogue.defaultLogoUrl}
                onChange={(next) => set("cover_image_url", next)}
                disabled={!editable}
              />
            </EditorSection>
          )}

          {draft.include_toc && (
            <EditorSection
              icon={BookOpen}
              title="Table of contents"
              summary={draft.toc_style === "plain" ? "Plain" : "Dotted leader"}
            >
              <div className="space-y-2">
                <Label htmlFor="toc-style">Style</Label>
                <Select
                  value={draft.toc_style ?? "dotted"}
                  onValueChange={(next) =>
                    set("toc_style", next as PackInput["toc_style"])
                  }
                  disabled={!editable}
                >
                  <SelectTrigger id="toc-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dotted">Dotted leader</SelectItem>
                    <SelectItem value="plain">Plain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </EditorSection>
          )}

          <EditorSection
            icon={Paperclip}
            title="File upload"
            description="PDFs and images are added at the back of the pack."
            summary={
              pack.attachments.length === 0
                ? "Nothing attached"
                : `${pack.attachments.length} attached`
            }
          >
            <div className="space-y-3">
              {pack.attachments.length === 0 && (
                <InlineEmpty
                  icon={<Paperclip />}
                  title="Nothing attached"
                  description="PDFs and images you attach are added at the back of the pack."
                />
              )}
              {pack.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <Paperclip className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {attachment.file_name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${attachment.file_name}`}
                    disabled={!editable}
                    onClick={() =>
                      removeFile
                        .mutateAsync({
                          id: pack.id,
                          attachmentId: attachment.id,
                        })
                        .catch((error) =>
                          toast.error(
                            apiErrorMessage(error, "Could not remove it."),
                          ),
                        )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <input
                id="pack-attachment"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="sr-only"
                onChange={onUpload}
                disabled={!editable || upload.isPending}
              />
              <Button
                asChild
                variant="outline"
                disabled={!editable || upload.isPending}
              >
                <label htmlFor="pack-attachment" className="cursor-pointer">
                  {upload.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Paperclip />
                  )}
                  Attach a file
                </label>
              </Button>
            </div>
          </EditorSection>

          <EditorSection
            icon={Settings2}
            title="Report preferences"
            summary={preferencesSummary}
          >
            <ReportPreferenceFields
              idPrefix="pack"
              value={formatting}
              onChange={(patch) =>
                updateDraft((current) => ({ ...current, ...patch }))
              }
              disabled={!editable}
            />
          </EditorSection>

          <EditorSection
            icon={Palette}
            title="Branding"
            summary={brandingSummary}
          >
            <BrandingFields
              idPrefix="pack"
              value={formatting}
              onChange={(patch) =>
                updateDraft((current) => ({ ...current, ...patch }))
              }
              disabled={!editable}
            />
          </EditorSection>

          <EditorSection
            icon={MessageSquareText}
            title="Commentary"
            description="Leave a box empty to leave it out."
            summary={commentarySummary}
          >
            <div className="space-y-2">
              <Label htmlFor="comment-overall">Overall commentary</Label>
              <Textarea
                id="comment-overall"
                value={commentFor(null)?.body ?? ""}
                onChange={(event) => setComment(null, event.target.value)}
                disabled={!editable}
                rows={4}
                placeholder="A summary of the period — printed as its own Commentary page."
              />
            </div>

            {draft.reports.map((key) => {
              const comment = commentFor(key);
              const title = reportTitle(catalogue.reports, key);
              return (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`comment-${key}`}>{title}</Label>
                  <Textarea
                    id={`comment-${key}`}
                    value={comment?.body ?? ""}
                    onChange={(event) => setComment(key, event.target.value)}
                    disabled={!editable}
                    rows={3}
                    placeholder={`A note on the ${title}…`}
                  />
                  {comment && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`comment-own-page-${key}`}
                        checked={comment.display === "own_page"}
                        onCheckedChange={(next) =>
                          setCommentOnOwnPage(key, next)
                        }
                        disabled={!editable}
                      />
                      <Label
                        htmlFor={`comment-own-page-${key}`}
                        className="text-sm font-normal text-muted-foreground"
                      >
                        Print on its own page after the report
                      </Label>
                    </div>
                  )}
                </div>
              );
            })}
          </EditorSection>

          <EditorSection
            icon={ScrollText}
            title="Disclaimer"
            description="Printed on its own page at the back."
            summary={draft.disclaimer_text ? "Included" : "None"}
          >
            <Textarea
              value={draft.disclaimer_text ?? ""}
              onChange={(event) => set("disclaimer_text", event.target.value)}
              disabled={!editable}
              rows={4}
              placeholder={DISCLAIMER_PLACEHOLDER}
            />
          </EditorSection>
        </div>

        <div className="min-w-0 xl:h-full">
          <PackPreview
            input={draft}
            packId={pack.id}
            catalogue={catalogue.reports}
            attachments={pack.attachments}
          />
        </div>
      </div>

      <AlertDialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this pack?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishing builds the final PDF and locks the pack. Its figures
              will not change afterwards, even if the books do.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmPublish(false);
                void run(true);
              }}
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {status === "published" && (
        <SendReportDialog
          description="Email the published PDF. Recipients get the pack as it was published, and a large file is sent as a secure download link instead of an attachment."
          report={{
            title: pack.name,
            period: pack.period_preset ?? "Custom range",
            rangeLabel: formatRangeLabel(pack.period_from, pack.period_to),
            range: { from: pack.period_from, to: pack.period_to },
          }}
          onSend={async ({ recipients, note }) => {
            await sendPack.mutateAsync({
              id: pack.id,
              recipients,
              note: note || undefined,
            });
          }}
        />
      )}

      {unsavedDialog}
    </div>
  );
}
