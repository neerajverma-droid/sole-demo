"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { EmailAttachmentsField } from "@/components/proposals/email-attachments-field";
import { IntroBlocksEditor } from "@/components/proposals/intro-blocks-editor";
import { ProposalEmailPreview } from "@/components/proposals/proposal-email-preview";
import { EditorImageUploadContext, RichTextEditor } from "@/components/proposals/rich-text-editor";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { apiErrorMessage } from "@/lib/api-error";
import {
  SUBJECT_MAX,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_KIND_META,
  TEMPLATE_NAME_MAX,
  createTemplateApi,
  emptyTemplateForm,
  refreshTemplate,
  templateQueryOptions,
  formFromTemplate,
  previewFromSectionTemplate,
  templateIssues,
  templatesListUrl,
  updateTemplateApi,
  uploadTemplateImageApi,
  type SectionKind,
  type TemplateForm,
} from "@/lib/proposal-templates";
import { EMAIL_CATEGORIES, type EmailCategory, type IntroBlock } from "@/lib/proposals";
import { cn } from "@/lib/utils";

/** Merge fields stay as their {{tags}} in a template; each proposal fills them in. */
const NO_VALUES = {};

// The email editor's two columns on wide screens: each its own scroll area, the
// height of the window below the top bar and the editor's header, and a wheel
// at either end doesn't carry on into the page. The bottom padding lets the
// last field and the end of the email scroll clear of the floating Ask Sole button.
const SIDE_SCROLL = "xl:max-h-[calc(100dvh-13rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:pb-24";

/**
 * Create or edit one of your own introduction, terms or thank-you
 * templates — no client or proposal involved. System templates can't be
 * edited; the templates page duplicates them first.
 *   id absent → new template  (POST /proposal/templates)
 *   id        → edit your own (PUT  /proposal/templates/:id — planned)
 */
export function TemplateEditorScreen({ kind, templateId }: { kind: SectionKind; templateId: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const meta = TEMPLATE_KIND_META[kind];
  const { business } = useActiveBusiness();
  const listUrl = templatesListUrl(kind);
  const editing = Boolean(templateId);

  const [form, setForm] = React.useState<TemplateForm>(emptyTemplateForm);
  const [loaded, setLoaded] = React.useState(!editing);
  const [errors, setErrors] = React.useState<{ name?: string; content?: string; subject?: string }>({});
  const [saving, setSaving] = React.useState(false);
  // Bumped when saved content lands, so the rich-text editors reseed.
  const [contentVersion, setContentVersion] = React.useState(0);

  // The template being edited — GET /proposal/templates/:id.
  const templateQuery = useQuery({ ...templateQueryOptions(templateId ?? ""), enabled: editing });

  React.useEffect(() => {
    if (!editing || loaded || !templateQuery.data) return;
    const template = templateQuery.data;
    if (template.type !== kind) {
      toast.error("Template not found.");
      router.replace(listUrl);
      return;
    }
    if (template.isSystem) {
      toast.error("System templates can't be edited. Duplicate it to make your own copy.");
      router.replace(listUrl);
      return;
    }
    setForm(formFromTemplate(template));
    setContentVersion((version) => version + 1);
    setLoaded(true);
  }, [editing, loaded, templateQuery.data, kind, router, listUrl]);

  React.useEffect(() => {
    if (templateQuery.isError) {
      toast.error(apiErrorMessage(templateQuery.error, "Template not found."));
      router.replace(listUrl);
    }
  }, [templateQuery.isError, templateQuery.error, router, listUrl]);

  const patch = (next: Partial<TemplateForm>) => {
    setForm((prev) => ({ ...prev, ...next }));
  };

  const setBlocks = (updater: (blocks: IntroBlock[]) => IntroBlock[]) => {
    setForm((prev) => ({ ...prev, blocks: updater(prev.blocks) }));
    if (errors.content) setErrors((prev) => ({ ...prev, content: undefined }));
  };

  const uploadBlockImage = async (blockId: string, file: File) => {
    const patchBlock = (fields: Partial<IntroBlock>) =>
      setBlocks((blocks) => blocks.map((block) => (block.id === blockId ? { ...block, ...fields } : block)));
    patchBlock({ imageUploading: true });
    try {
      const url = await uploadTemplateImageApi(file);
      patchBlock({ imageUrl: url, imageName: file.name, imageUploading: false });
    } catch (error) {
      patchBlock({ imageUploading: false });
      toast.error(apiErrorMessage(error, "Could not upload the image."));
    }
  };

  const save = async () => {
    // An image still uploading has no URL yet — saving now would lose it.
    if (form.blocks.some((block) => block.imageUploading)) {
      toast.error("Please wait for the image to finish uploading, then save.");
      return;
    }
    const issues = templateIssues(kind, form);
    setErrors(issues);
    if (issues.name || issues.content || issues.subject) return;

    setSaving(true);
    try {
      if (templateId) await updateTemplateApi(templateId, kind, form);
      else await createTemplateApi(kind, form);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["proposal-templates", kind] }),
        ...(templateId ? [refreshTemplate(queryClient, templateId)] : []),
      ]);
      toast.success(editing ? "Template updated." : "Template created.");
      router.push(listUrl);
    } catch (error) {
      const message = apiErrorMessage(error, "Failed to save template.");
      toast.error(message);
      if (/name already exists/i.test(message)) {
        setErrors((prev) => ({ ...prev, name: "A template with this name already exists." }));
      }
    } finally {
      setSaving(false);
    }
  };

  const title = `${editing ? "Edit" : "New"} ${meta.singular.toLowerCase()} template`;

  // An email shows, beside its form, the email as the client receives it — the
  // same component as the builder's Email tab, so it matches what's sent —
  // updating as you type, merge fields filled with sample data.
  const emailPreview = React.useMemo(
    () =>
      kind === "EMAIL"
        ? previewFromSectionTemplate(
            {
              id: templateId ?? "new",
              type: "EMAIL",
              name: form.name,
              description: form.description,
              isSystem: false,
              serviceCount: 0,
              snapshot: {},
              html: form.body,
              content: null,
              updatedAt: null,
              full: true,
              summary: "",
              subject: form.subject,
              emailCategory: form.emailCategory,
              attachments: form.attachments,
              attachmentCount: form.attachments.length,
            },
            { name: business?.name || "", logo: business?.logo || "", bank: null },
          )
        : null,
    [kind, templateId, form, business],
  );

  return (
    <EditorImageUploadContext.Provider value={uploadTemplateImageApi}>
      {/* Inside the app shell, sidebar and all. The header sticks under the
          top bar so Save is always in reach on a long template. */}
      <div className={cn("mx-auto space-y-[15px]", emailPreview ? "max-w-7xl" : "max-w-4xl")}>
        <header className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center justify-between gap-[15px] border-b border-border bg-muted/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-lg md:border md:bg-background/95 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="icon" aria-label="Back to templates" onClick={() => router.push(listUrl)}>
              <ArrowLeft />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">{title}</h1>
              <p className="line-clamp-2 text-sm text-muted-foreground sm:truncate">
                {kind === "THANK_YOU"
                  ? "The page the client sees after signing."
                  : kind === "EMAIL"
                    ? "Placeholders such as {{contact_addressee}} or {{proposal_name}} are filled in when the email is sent."
                    : "Placeholders such as the client name can be added with “Add Attribute”."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" disabled={saving} onClick={() => router.push(listUrl)}>
              Cancel
            </Button>
            <Button disabled={saving || !loaded} onClick={save}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {editing ? "Save changes" : "Create template"}
            </Button>
          </div>
        </header>

          {!loaded ? (
            <div className="space-y-[15px]">
              <Shimmer className="h-28 rounded-lg" />
              <Shimmer className="h-[420px] rounded-lg" />
            </div>
          ) : (
            <div className={cn(emailPreview && "grid items-start gap-[15px] xl:grid-cols-[minmax(0,1fr)_minmax(0,600px)]")}>
            {/* Side by side, each column scrolls on its own (below the top bar and this header). */}
            <div className={cn("min-w-0 space-y-[15px]", emailPreview && SIDE_SCROLL)}>
              <div className="grid gap-[15px] rounded-lg border border-border bg-card p-5 shadow-sm lg:grid-cols-2">
                <Field label="Template name" required error={errors.name}>
                  <Input
                    value={form.name}
                    maxLength={TEMPLATE_NAME_MAX + 20}
                    placeholder={`e.g. Standard ${meta.singular.toLowerCase()}`}
                    aria-invalid={Boolean(errors.name) || undefined}
                    onChange={(event) => {
                      patch({ name: event.target.value });
                      if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                  />
                </Field>
                <Field label="Description (optional)">
                  <Input
                    value={form.description}
                    maxLength={TEMPLATE_DESCRIPTION_MAX}
                    placeholder="What is this template for?"
                    onChange={(event) => patch({ description: event.target.value })}
                  />
                </Field>
                {kind === "EMAIL" && (
                  <>
                    <Field label="Used for" required>
                      <Select
                        value={form.emailCategory}
                        onValueChange={(value) => patch({ emailCategory: value as EmailCategory })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EMAIL_CATEGORIES.map((category) => (
                            <SelectItem key={category.value} value={category.value}>
                              {category.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Subject" required error={errors.subject}>
                      <Input
                        value={form.subject}
                        maxLength={SUBJECT_MAX}
                        placeholder="Your proposal from {{firm_name}}"
                        aria-invalid={Boolean(errors.subject) || undefined}
                        onChange={(event) => {
                          patch({ subject: event.target.value });
                          if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
                        }}
                      />
                    </Field>
                  </>
                )}
              </div>

              {kind === "EMAIL" && (
                <div className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
                  <div>
                    <Label>Attachments</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sent with every proposal that uses this email, e.g. your fee schedule or a brochure.
                    </p>
                  </div>
                  <EmailAttachmentsField
                    value={form.attachments}
                    disabled={saving}
                    onChange={(attachments) => patch({ attachments })}
                  />
                </div>
              )}

              <div
                className={cn(
                  "space-y-3 rounded-lg border bg-card p-5 shadow-sm",
                  errors.content ? "border-destructive" : "border-border",
                )}
              >
                <Label>
                  {kind === "EMAIL" ? "Email body" : "Content"} <span className="text-destructive">*</span>
                </Label>

                {kind === "INTRODUCTION" && (
                  <IntroBlocksEditor
                    key={contentVersion}
                    blocks={form.blocks}
                    onBlocksChange={setBlocks}
                    onImageUpload={uploadBlockImage}
                    mergeValues={NO_VALUES}
                  />
                )}

                {(kind === "TERMS" || kind === "EMAIL") && (
                  <RichTextEditor
                    key={contentVersion}
                    initialValue={form.body}
                    mergeValues={NO_VALUES}
                    minHeight={kind === "EMAIL" ? 280 : 360}
                    invalid={Boolean(errors.content)}
                    onChange={(html) => {
                      patch({ body: html });
                      if (errors.content) setErrors((prev) => ({ ...prev, content: undefined }));
                    }}
                  />
                )}

                {kind === "THANK_YOU" && (
                  <div className="space-y-[15px]">
                    <Field label="Heading">
                      <Input
                        value={form.thankYou.title}
                        maxLength={120}
                        placeholder="Thank you for choosing us!"
                        onChange={(event) => {
                          patch({ thankYou: { ...form.thankYou, title: event.target.value } });
                          if (errors.content) setErrors((prev) => ({ ...prev, content: undefined }));
                        }}
                      />
                    </Field>
                    <Field label="Message">
                      <Textarea
                        rows={4}
                        maxLength={1000}
                        value={form.thankYou.message}
                        placeholder="Your engagement is under way…"
                        onChange={(event) => {
                          patch({ thankYou: { ...form.thankYou, message: event.target.value } });
                          if (errors.content) setErrors((prev) => ({ ...prev, content: undefined }));
                        }}
                      />
                    </Field>
                    <div className="grid gap-[15px] sm:grid-cols-2">
                      <Field label="Button label (optional)">
                        <Input
                          value={form.thankYou.button_label}
                          maxLength={60}
                          placeholder="Book a kick-off call"
                          onChange={(event) => patch({ thankYou: { ...form.thankYou, button_label: event.target.value } })}
                        />
                      </Field>
                      <Field label="Button link (optional)">
                        <Input
                          type="url"
                          value={form.thankYou.button_url}
                          placeholder="https://"
                          onChange={(event) => patch({ thankYou: { ...form.thankYou, button_url: event.target.value } })}
                        />
                      </Field>
                    </div>
                  </div>
                )}

                {errors.content && (
                  <p className="text-xs font-medium text-destructive" role="alert">
                    {errors.content}
                  </p>
                )}
              </div>
            </div>

            {emailPreview && (
              <aside className={cn("min-w-0 space-y-2", SIDE_SCROLL)} aria-label="Email preview">
                <p className="text-sm font-medium">Preview</p>
                <p className="text-xs text-muted-foreground">
                  How your client sees it. Placeholders show sample details; the real client&apos;s and proposal&apos;s
                  fill them when it&apos;s sent.
                </p>
                <ProposalEmailPreview preview={emailPreview} />
              </aside>
            )}
            </div>
          )}
      </div>
    </EditorImageUploadContext.Provider>
  );
}
