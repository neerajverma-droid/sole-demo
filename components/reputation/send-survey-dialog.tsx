"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/documents/field";
import { ProjectClientSelect } from "@/components/projects/project-client-select";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/reputation/reputation-ui";
import { reputationErrorMessage, sendManualSurvey } from "@/lib/reputation-api";
import { htmlHasText, surveyRequestMessage, type ReputationSurvey } from "@/lib/reputation";
import type { ProjectClient } from "@/lib/projects";

export function SendSurveyDialog({
  open,
  onOpenChange,
  surveys,
  surveysLoading,
  onSent,
  initialClient = null,
  referenceId = null,
  referenceName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surveys: ReputationSurvey[];
  surveysLoading: boolean;
  onSent: () => void;
  /** Pre-fills the client, editable from there — sending from an invoice knows who to ask. */
  initialClient?: ProjectClient | null;
  /** What this survey is rating — an invoice, a job — instead of a generic request. */
  referenceId?: string | null;
  referenceName?: string;
}) {
  const active = React.useMemo(() => surveys.filter((survey) => survey.status === "active"), [surveys]);
  const [client, setClient] = React.useState<ProjectClient | null>(initialClient);
  const [surveyId, setSurveyId] = React.useState("");
  const [message, setMessage] = React.useState(surveyRequestMessage());
  const [edited, setEdited] = React.useState(false);
  const [attempted, setAttempted] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setClient(initialClient);
    setMessage(surveyRequestMessage(initialClient?.name ?? ""));
    setEdited(false);
    setAttempted(false);
    setSending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setSurveyId((current) => (active.some((survey) => survey.id === current) ? current : active[0]?.id ?? ""));
  }, [open, active]);

  const chooseClient = (next: ProjectClient | null) => {
    setClient(next);
    if (!edited) setMessage(surveyRequestMessage(next?.name ?? ""));
  };

  const clientError = !attempted
    ? undefined
    : !client
      ? "Select a client"
      : !client.email
        ? "This client has no email address — add one to their contact first"
        : undefined;
  const surveyError = attempted && !surveyId ? "Select a survey" : undefined;
  const messageError = attempted && !htmlHasText(message) ? "Enter an email message" : undefined;

  const submit = async () => {
    setAttempted(true);
    if (!client?.email || !surveyId || !htmlHasText(message)) return;
    setSending(true);
    try {
      await sendManualSurvey({
        surveyId,
        clientId: client.clientId ?? client.contactId,
        clientEmail: client.email,
        clientName: client.name,
        customMessage: message,
        referenceId,
        referenceName,
      });
      toast.success(`Review request sent to ${client.name}`);
      onSent();
      onOpenChange(false);
    } catch (error) {
      toast.error(reputationErrorMessage(error, "Failed to send the survey. Please try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send survey manually</DialogTitle>
          <DialogDescription>Select a client to send an ad-hoc survey request.</DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-4">
          <Field label="Client" htmlFor="send-survey-client" required error={clientError}>
            <ProjectClientSelect id="send-survey-client" value={client} onChange={chooseClient} invalid={!!clientError} />
          </Field>

          <Field
            label="Survey template"
            htmlFor="send-survey-template"
            required
            error={surveyError}
            hint={!surveysLoading && active.length === 0 ? "No active surveys — activate one on the Surveys tab first." : undefined}
          >
            <Select value={surveyId || undefined} onValueChange={setSurveyId} disabled={surveysLoading || active.length === 0}>
              <SelectTrigger id="send-survey-template" aria-invalid={!!surveyError}>
                <SelectValue placeholder={surveysLoading ? "Loading surveys…" : "No active surveys available"} />
              </SelectTrigger>
              <SelectContent>
                {active.map((survey) => (
                  <SelectItem key={survey.id} value={survey.id}>
                    {survey.name || "Untitled survey"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Email message" htmlFor="send-survey-message" required error={messageError}>
            <RichTextEditor
              id="send-survey-message"
              value={message}
              onChange={(html) => {
                setEdited(true);
                setMessage(html);
              }}
              invalid={!!messageError}
            />
          </Field>
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={sending} onClick={() => void submit()}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {sending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
