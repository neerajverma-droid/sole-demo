"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2, Mail, Plus, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { Field } from "@/components/documents/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailAttachmentsField } from "@/components/proposals/email-attachments-field";
import { ProposalEmailPreview } from "@/components/proposals/proposal-email-preview";
import { RichTextEditor } from "@/components/proposals/rich-text-editor";
import { useAccountIdentity } from "@/hooks/use-account-identity";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useProposalDetailQuery, useSendReminderMutation } from "@/hooks/use-proposals-query";
import { apiErrorMessage } from "@/lib/api-error";
import { templateQueryOptions } from "@/lib/proposal-templates";
import {
  EMAIL_PATTERN,
  builderStateFromProposal,
  defaultReminderDraft,
  defaultReminderTemplate,
  emptyReminderDraft,
  fetchTemplatesOfType,
  mergeValues as buildMergeValues,
  previewFromProposal,
  renderMergeTags,
  reminderFromTemplate,
  reminderIssues,
  reminderTemplateGroups,
  type ReminderDraft,
} from "@/lib/proposals";

/**
 * "Send reminder" for a proposal the client hasn't answered: prefilled from
 * a Reminder email template (Sole's "Friendly Reminder" unless another is
 * picked), every field editable before it goes. The client gets a fresh
 * link to the same proposal; the first email's link keeps working.
 */
export function SendReminderDialog({
  proposalId,
  onOpenChange,
}: {
  /** The proposal to remind about; null keeps the dialog closed. */
  proposalId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={proposalId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {/* Keyed, so each proposal starts from its own fresh draft. */}
        {proposalId && <ReminderForm key={proposalId} proposalId={proposalId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReminderForm({ proposalId, onDone }: { proposalId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const identity = useAccountIdentity();
  const send = useSendReminderMutation();

  const proposalQuery = useProposalDetailQuery(proposalId);
  const templatesQuery = useQuery({
    // Shared with the templates page's Email tab.
    queryKey: ["proposal-templates", "EMAIL"],
    queryFn: () => fetchTemplatesOfType("EMAIL"),
  });

  const [draft, setDraft] = React.useState<ReminderDraft>(emptyReminderDraft);
  const [errors, setErrors] = React.useState<ReturnType<typeof reminderIssues>>({});
  const [loadingTemplate, setLoadingTemplate] = React.useState(false);
  const [cc, setCc] = React.useState("");
  // Bumped when a template lands, so the editor reseeds.
  const [editorVersion, setEditorVersion] = React.useState(0);
  const prefilled = React.useRef(false);
  // Edit the reminder, or see it as the client will.
  const [view, setView] = React.useState<"edit" | "preview">("edit");

  const state = React.useMemo(
    () => (proposalQuery.data ? builderStateFromProposal(proposalQuery.data) : null),
    [proposalQuery.data],
  );
  const client = state?.client ?? null;
  const values = React.useMemo(
    () =>
      buildMergeValues(
        client,
        {
          name: business?.name || "",
          email: business?.email || identity.email || "",
          phone: business?.countryCode && business?.mobile ? `${business.countryCode}${business.mobile}` : "",
        },
        { name: state?.general.proposal_name },
      ),
    [client, business, identity.email, state?.general.proposal_name],
  );

  // The reminder exactly as it's sent: the proposal's own details, this draft's text
  // with its merge fields filled in, and the reminder's wording around it.
  const emailPreview = React.useMemo(() => {
    if (!proposalQuery.data) return null;
    const base = previewFromProposal(proposalQuery.data);
    return {
      ...base,
      emailKind: "reminder" as const,
      sender: { name: identity.name || values.firm_name, email: values.firm_email },
      notification: {
        ...base.notification,
        send_notification: true,
        subject: renderMergeTags(draft.subject, values),
        email_body: renderMergeTags(draft.email_body, values),
        cc_emails: draft.cc_emails,
        attachments: draft.attachments,
      },
    };
  }, [proposalQuery.data, draft, values, identity.name]);

  const templates = React.useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const groups = reminderTemplateGroups(templates);

  const applyTemplate = React.useCallback(
    async (id: string) => {
      setLoadingTemplate(true);
      try {
        // The list has names only; the content is GET /templates/:id (cached once opened).
        const template = await queryClient.fetchQuery(templateQueryOptions(id));
        setDraft((current) => reminderFromTemplate(current, template));
        setEditorVersion((version) => version + 1);
        setErrors({});
      } catch (error) {
        toast.error(apiErrorMessage(error, "Couldn't load that template."));
      } finally {
        setLoadingTemplate(false);
      }
    },
    [queryClient],
  );

  // Prefill once: from the default reminder template, else the built-in
  // reminder text (no Reminder template, or the list couldn't load).
  React.useEffect(() => {
    if (prefilled.current || templatesQuery.isLoading) return;
    prefilled.current = true;
    const choice = templatesQuery.data ? defaultReminderTemplate(templatesQuery.data) : null;
    if (choice) {
      void applyTemplate(choice.id);
    } else {
      setDraft(defaultReminderDraft());
      setEditorVersion((version) => version + 1);
    }
  }, [templatesQuery.isLoading, templatesQuery.data, applyTemplate]);

  const patch = (next: Partial<ReminderDraft>) => setDraft((current) => ({ ...current, ...next }));

  const addCc = () => {
    const email = cc.trim();
    if (!email) return;
    if (!EMAIL_PATTERN.test(email)) {
      setErrors((current) => ({ ...current, cc: "Enter a valid email address." }));
      return;
    }
    if (!draft.cc_emails.includes(email)) patch({ cc_emails: [...draft.cc_emails, email] });
    setCc("");
    setErrors((current) => ({ ...current, cc: undefined }));
  };

  const submit = async () => {
    const issues = reminderIssues(draft);
    setErrors(issues);
    if (Object.keys(issues).length) return;
    try {
      const result = await send.mutateAsync({ id: proposalId, draft });
      toast.success(`Reminder sent to ${result.clientEmail || client?.email || "the client"}.`);
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error, "The reminder could not be sent."));
    }
  };

  const loading = proposalQuery.isLoading || templatesQuery.isLoading || (loadingTemplate && !draft.templateId);
  const busy = send.isPending;

  return (
    <>
      <DialogHeader className="border-b border-border px-4 py-4 pr-12 text-left sm:px-6">
        <DialogTitle className="flex items-center gap-2">
          <BellRing className="size-4 text-primary" aria-hidden />
          Send reminder
        </DialogTitle>
        <DialogDescription className="truncate">
          {state?.general.proposal_name || "This proposal"} — the client gets a fresh link to it with this email.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {loading ? (
          <div className="space-y-4" role="status" aria-label="Loading reminder">
            <Shimmer className="h-9 w-full rounded-md" />
            <Shimmer className="h-9 w-full rounded-md" />
            <Shimmer className="h-9 w-full rounded-md" />
            <Shimmer className="h-56 w-full rounded-md" />
          </div>
        ) : (
          <>
            <Tabs value={view} onValueChange={(next) => setView(next as "edit" | "preview")}>
              <TabsList aria-label="Reminder view">
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </Tabs>

            {view === "preview" && emailPreview ? (
              <ProposalEmailPreview preview={emailPreview} />
            ) : (
            <>
            <Field label="Template">
              <Select
                value={draft.templateId ?? ""}
                disabled={busy || loadingTemplate || groups.length === 0}
                onValueChange={(id) => void applyTemplate(id)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={groups.length ? "Select template" : "No email templates yet"} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.options.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {loadingTemplate && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Loading template…
                </p>
              )}
            </Field>

            <Field label="To">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate">
                  {client?.email ? (
                    <>
                      {client.name ? `${client.name} · ` : ""}
                      {client.email}
                    </>
                  ) : (
                    <span className="text-warning">No client email on file</span>
                  )}
                </span>
              </div>
            </Field>

            <Field label="CC" error={errors.cc}>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={cc}
                    placeholder="Add a CC email address"
                    aria-label="CC email address"
                    disabled={busy}
                    onChange={(event) => setCc(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCc();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" disabled={busy || !cc.trim()} onClick={addCc}>
                    <Plus />
                    Add
                  </Button>
                </div>
                {draft.cc_emails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.cc_emails.map((email) => (
                      <span
                        key={email}
                        className="flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs"
                      >
                        <span className="truncate">{email}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${email}`}
                          disabled={busy}
                          className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-background"
                          onClick={() => patch({ cc_emails: draft.cc_emails.filter((other) => other !== email) })}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Field>

            <Field label="Subject" required error={errors.subject}>
              <Input
                value={draft.subject}
                maxLength={255}
                disabled={busy}
                aria-invalid={Boolean(errors.subject) || undefined}
                onChange={(event) => {
                  patch({ subject: event.target.value });
                  if (errors.subject) setErrors((current) => ({ ...current, subject: undefined }));
                }}
              />
            </Field>

            <Field label="Attachments">
              <EmailAttachmentsField
                value={draft.attachments}
                disabled={busy}
                onChange={(attachments) => patch({ attachments })}
              />
            </Field>

            <Field label="Message" required error={errors.email_body}>
              <RichTextEditor
                key={editorVersion}
                initialValue={draft.email_body}
                mergeValues={values}
                minHeight={240}
                invalid={Boolean(errors.email_body)}
                onChange={(html) => {
                  patch({ email_body: html });
                  if (errors.email_body) setErrors((current) => ({ ...current, email_body: undefined }));
                }}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              The “Review your proposal” button is added below your message. Switch to Preview to see the email as
              your client will.
            </p>
            </>
            )}
          </>
        )}
      </div>

      <DialogFooter className="flex-row justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
        <Button variant="outline" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={busy || loading || loadingTemplate || !client?.email} onClick={submit}>
          {busy ? <Loader2 className="animate-spin" /> : <BellRing />}
          {busy ? "Sending…" : "Send reminder"}
        </Button>
      </DialogFooter>
    </>
  );
}
