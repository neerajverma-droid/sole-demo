"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarRange,
  Copy,
  Layers,
  Loader2,
  Palette,
  Save,
  ScrollText,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import { useCreateTemplate, useUpdateTemplate } from "@/hooks/use-report-packs";
import { apiErrorMessage } from "@/lib/api-error";
import {
  CUSTOM_PERIOD,
  DEFAULT_PERIOD,
  DISCLAIMER_PLACEHOLDER,
  formattingOf,
  NAME_MAX,
  PACK_ROUTES,
  preferencesFrom,
  presetRange,
  type PackCatalogue,
  type PackInput,
  type PackTemplate,
  type TemplateInput,
} from "@/lib/report-packs";
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/report-periods";
import { CoverLogoField } from "./cover-logo-field";
import {
  EDITOR_LAYOUT,
  EDITOR_SIDEBAR,
  EditorSection,
  useViewportFill,
} from "./editor-section";
import { PackPreview } from "./pack-preview";
import { BrandingFields, ReportPreferenceFields } from "./preference-fields";
import { ReportPicker } from "./report-picker";
import {
  TemplateSaveDialog,
  type TemplateDetails,
} from "./template-save-dialog";

type Content = Omit<
  TemplateInput,
  "name" | "description" | "access" | "version"
>;

const PREVIEW_PERIODS = REPORT_PERIODS.filter(
  (entry) => entry !== CUSTOM_PERIOD,
);

function contentOf(template: PackTemplate | null): Content {
  return {
    reports: template?.reports ?? [],
    orientation: template?.orientation ?? "portrait",
    negative_format: template?.negative_format ?? "brackets",
    disclaimer_text: template?.disclaimer_text ?? null,
    cover_image_url: template?.cover_image_url ?? null,
    ...preferencesFrom(template),
  };
}

export function TemplateEditor({
  template,
  catalogue,
}: {
  template: PackTemplate | null;
  catalogue: PackCatalogue;
}) {
  const router = useRouter();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const [content, setContent] = React.useState<Content>(() =>
    contentOf(template),
  );
  const [version, setVersion] = React.useState(template?.version);
  const [dirty, setDirty] = React.useState(false);
  const [dialog, setDialog] = React.useState<"create" | "copy" | null>(null);
  const [previewPeriod, setPreviewPeriod] =
    React.useState<ReportPeriod>(DEFAULT_PERIOD);
  const { guardNavigate, dialog: unsavedDialog } = useUnsavedChanges(dirty);
  const fill = useViewportFill();

  const details = React.useMemo<TemplateDetails>(
    () => ({
      name: template?.name ?? "",
      description: template?.description ?? "",
      access: template?.access === "tenant" ? "tenant" : "business",
    }),
    [template],
  );

  const copyDetails = React.useMemo<TemplateDetails>(
    () => ({
      ...details,
      name: details.name ? `${details.name} (copy)`.slice(0, NAME_MAX) : "",
    }),
    [details],
  );

  const patch = (next: Partial<Content>) => {
    setContent((current) => ({ ...current, ...next }));
    setDirty(true);
  };

  const formatting = formattingOf(content);

  const ensureReports = () => {
    if (content.reports.length > 0) return true;
    toast.error("Add at least one report before saving.");
    return false;
  };

  const saveExisting = async () => {
    if (!template || !ensureReports()) return;
    try {
      const saved = await update.mutateAsync({
        id: template.id,
        input: {
          ...content,
          name: details.name,
          description: details.description,
          access: details.access,
          version,
        },
      });
      setVersion(saved.version);
      setDirty(false);
      toast.success("Template saved.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save the template."));
    }
  };

  const createFrom = async (next: TemplateDetails) => {
    const copying = dialog === "copy";
    try {
      await create.mutateAsync({
        ...content,
        name: next.name,
        description: next.description || null,
        access: next.access,
      });
      setDirty(false);
      setDialog(null);
      toast.success(copying ? "Saved as a new template." : "Template created.");
      router.push(PACK_ROUTES.templates);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not save the template."));
    }
  };

  const range = presetRange(previewPeriod);
  const previewInput: PackInput = {
    name: "Management report pack",
    cover_title: null,
    period_preset: previewPeriod,
    period_from: range.from,
    period_to: range.to,
    reports: content.reports,
    cover_enabled: true,
    include_toc: true,
    toc_style: "dotted",
    orientation: content.orientation,
    negative_format: content.negative_format,
    disclaimer_text: content.disclaimer_text,
    cover_image_url: content.cover_image_url,
    ...preferencesFrom(content),
  };

  const saving = create.isPending || update.isPending;
  const reportCount = content.reports.length;

  return (
    <div className="space-y-5 pb-16 xl:pb-0">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={guardNavigate(PACK_ROUTES.templates)}
      >
        <ArrowLeft />
        Templates
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {template ? template.name : "New template"}
          </h1>
          <p className="text-sm text-muted-foreground">
            The recipe a pack is built from: which reports, in what order, and
            how they look.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={previewPeriod}
            onValueChange={(next) => setPreviewPeriod(next as ReportPeriod)}
          >
            <SelectTrigger
              aria-label="Preview with"
              className="w-fit gap-2 bg-background"
            >
              <CalendarRange className="size-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PREVIEW_PERIODS.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {template ? (
            <>
              <Button
                variant="outline"
                onClick={() => ensureReports() && setDialog("copy")}
                disabled={saving}
              >
                <Copy />
                Save as
              </Button>
              <Button onClick={saveExisting} disabled={saving || !dirty}>
                {update.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save />
                )}
                Save
              </Button>
            </>
          ) : (
            <Button
              onClick={() => ensureReports() && setDialog("create")}
              disabled={saving}
            >
              <Save />
              Save template
            </Button>
          )}
        </div>
      </header>

      <div ref={fill.ref} style={fill.style} className={EDITOR_LAYOUT}>
        <div className={EDITOR_SIDEBAR}>
          <EditorSection
            icon={Layers}
            title="Pages"
            defaultOpen
            description="Every pack built from this template starts with these, in this order. A cover and contents page are added automatically."
            summary={`${reportCount} ${reportCount === 1 ? "report" : "reports"}`}
          >
            <ReportPicker
              catalogue={catalogue.reports}
              value={content.reports}
              onChange={(next) => patch({ reports: next })}
            />
          </EditorSection>

          <EditorSection
            icon={Settings2}
            title="Report preferences"
            defaultOpen
          >
            <ReportPreferenceFields
              idPrefix="template"
              value={formatting}
              onChange={patch}
            />
          </EditorSection>

          <EditorSection
            icon={Palette}
            title="Styling"
            defaultOpen
            description="How packs built from this template look."
          >
            <CoverLogoField
              idPrefix="template-logo"
              value={content.cover_image_url}
              defaultLogoUrl={catalogue.defaultLogoUrl}
              onChange={(next) => patch({ cover_image_url: next })}
            />
            <BrandingFields
              idPrefix="template"
              value={formatting}
              onChange={patch}
            />
          </EditorSection>

          <EditorSection
            icon={ScrollText}
            title="Disclaimer"
            description="A full page at the back of every pack built from this template. Leave it empty for none."
            summary={content.disclaimer_text ? "Included" : "None"}
          >
            <Textarea
              value={content.disclaimer_text ?? ""}
              onChange={(event) =>
                patch({ disclaimer_text: event.target.value })
              }
              placeholder={DISCLAIMER_PLACEHOLDER}
              rows={5}
            />
          </EditorSection>
        </div>

        <div className="min-w-0 xl:h-full">
          <PackPreview
            input={previewInput}
            packId={null}
            catalogue={catalogue.reports}
          />
        </div>
      </div>

      <TemplateSaveDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog === "copy" ? "Save as a new template" : "Save template"}
        submitLabel={dialog === "copy" ? "Save as new" : "Save template"}
        initial={dialog === "copy" ? copyDetails : details}
        onSubmit={createFrom}
      />

      {unsavedDialog}
    </div>
  );
}
