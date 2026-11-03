"use client";

import * as React from "react";
import { Mail, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { RichTextEditor } from "@/components/proposals/rich-text-editor";
import {
  StepFooter,
  StepHeader,
  ToggleCard,
  useTouched,
} from "@/components/proposals/steps/step-parts";
import {
  EMAIL_PATTERN,
  termsIssues,
  thankYouIssues,
  type MergeValues,
  type NotificationData,
  type TermsData,
  type ThankYouData,
} from "@/lib/proposals";

export type SenderOption = { label: string; value: string };

/** "Message from" — the signed-in user's own address. */
export function SenderSelect({
  options,
  value,
  onChange,
}: {
  options: SenderOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const all =
    value && !options.some((option) => option.value === value)
      ? [...options, { label: value, value }]
      : options;
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select email address" />
      </SelectTrigger>
      <SelectContent>
        {all.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TermsStep({
  terms,
  onChange,
  onSave,
  saving,
  mergeValues,
  editorKey,
}: {
  terms: TermsData;
  onChange: (patch: Partial<TermsData>) => void;
  onSave: () => void;
  saving: boolean;
  mergeValues: MergeValues;
  editorKey: string;
}) {
  const { show, submit } = useTouched();
  const issues = termsIssues(terms);
  const save = () => {
    submit();
    if (Object.keys(issues).length) return;
    onSave();
  };

  return (
    <section className="space-y-4">
      <StepHeader
        title="Terms & Sign"
        description="Add the agreement terms and choose whether the client signature is required."
      />
      <Field
        label="Title"
        htmlFor="terms_title"
        required
        error={show("title") ? issues.title : undefined}
      >
        <Input
          id="terms_title"
          value={terms.title}
          placeholder="Terms & Conditions"
          aria-invalid={show("title") && Boolean(issues.title)}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </Field>
      <Field label="Terms content" required error={show("body") ? issues.body : undefined}>
        <RichTextEditor
          key={editorKey}
          initialValue={terms.body}
          placeholder="Add the confirmation of agreement and service terms."
          mergeValues={mergeValues}
          invalid={show("body") && Boolean(issues.body)}
          minHeight={260}
          onChange={(html) => onChange({ body: html })}
        />
      </Field>
      <ToggleCard
        id="require_signature"
        label="Require signature"
        description="When enabled, the client must sign before accepting."
        checked={terms.require_signature}
        onCheckedChange={(checked) => onChange({ require_signature: checked })}
      />
      {terms.require_signature && (
        <Field
          label="Signer label"
          htmlFor="signer_label"
          required
          error={show("signer_label") ? issues.signer_label : undefined}
        >
          <Input
            id="signer_label"
            value={terms.signer_label}
            placeholder="Client signature"
            aria-invalid={show("signer_label") && Boolean(issues.signer_label)}
            onChange={(event) => onChange({ signer_label: event.target.value })}
          />
        </Field>
      )}
      <StepFooter saving={saving} nextLabel="Notification" onSave={save} />
    </section>
  );
}

export function NotificationStep({
  notification,
  onChange,
  onSave,
  saving,
  senders,
  clientEmail,
  mergeValues,
  editorKey,
}: {
  notification: NotificationData;
  onChange: (patch: Partial<NotificationData>) => void;
  onSave: () => void;
  saving: boolean;
  senders: SenderOption[];
  clientEmail?: string;
  mergeValues: MergeValues;
  editorKey: string;
}) {
  const [cc, setCc] = React.useState("");
  const [ccError, setCcError] = React.useState("");
  const enabled = notification.send_notification !== false;
  const ccEmails = notification.cc_emails ?? [];

  const addCc = () => {
    const email = cc.trim();
    if (!email) return;
    if (!EMAIL_PATTERN.test(email)) {
      setCcError("Enter a valid email address");
      return;
    }
    if (!ccEmails.includes(email)) onChange({ cc_emails: [...ccEmails, email] });
    setCc("");
    setCcError("");
  };

  return (
    <section className="space-y-4">
      <StepHeader
        title="Notification & Email"
        description="Review how your proposal email will appear to the client before sending."
      />

      <ToggleCard
        id="send_notification"
        label="Email"
        description="Sent automatically when you click Send in the top bar."
        checked={enabled}
        onCheckedChange={(checked) => onChange({ send_notification: checked })}
      >
        {enabled && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <Field label="Message from">
              <SenderSelect
                options={senders}
                value={notification.message_from}
                onChange={(value) => onChange({ message_from: value })}
              />
            </Field>

            <Field label="Recipients" error={ccError || undefined}>
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  <Mail className="size-3.5" aria-hidden />
                  <span className="truncate">{clientEmail || "No client email on file"}</span>
                  <span className="ml-auto shrink-0 text-xs">Primary recipient</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={cc}
                    type="email"
                    placeholder="Add a CC email address"
                    aria-label="CC email address"
                    className="bg-background"
                    onChange={(event) => {
                      setCc(event.target.value);
                      setCcError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCc();
                      }
                    }}
                  />
                  <Button type="button" disabled={!cc.trim()} onClick={addCc}>
                    <Plus />
                    Add
                  </Button>
                </div>
              </div>
            </Field>

            {ccEmails.length > 0 && (
              <ul className="space-y-2">
                {ccEmails.map((email, index) => (
                  <li
                    key={`${email}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-background p-2 pl-3"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <Mail className="size-3.5 text-muted-foreground" aria-hidden />
                      <span className="truncate">{email}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onChange({ cc_emails: ccEmails.filter((_, at) => at !== index) })
                      }
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <RichTextEditor
              key={editorKey}
              initialValue={notification.email_body}
              mergeValues={mergeValues}
              minHeight={300}
              onChange={(html) => onChange({ email_body: html })}
            />
          </div>
        )}
      </ToggleCard>

      <StepFooter saving={saving} nextLabel="Thank You" onSave={onSave} />
    </section>
  );
}

export function ThankYouStep({
  data,
  onChange,
  onSave,
  saving,
}: {
  data: ThankYouData;
  onChange: (patch: Partial<ThankYouData>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { show, submit } = useTouched();
  const issues = thankYouIssues(data);
  const save = () => {
    submit();
    if (Object.keys(issues).length) return;
    onSave();
  };

  return (
    <section className="space-y-4">
      <StepHeader
        title="Thank You"
        description="Configure the screen shown after the client accepts the proposal."
      />
      <Field label="Title" htmlFor="thank_you_title" required error={show("title") ? issues.title : undefined}>
        <Input
          id="thank_you_title"
          value={data.title}
          placeholder="Thank you"
          aria-invalid={show("title") && Boolean(issues.title)}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </Field>
      <Field
        label="Message"
        htmlFor="thank_you_message"
        required
        error={show("message") ? issues.message : undefined}
      >
        <Textarea
          id="thank_you_message"
          className="min-h-32"
          value={data.message}
          placeholder="Thanks for accepting this proposal."
          aria-invalid={show("message") && Boolean(issues.message)}
          onChange={(event) => onChange({ message: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="Button label"
          htmlFor="button_label"
          error={show("button_label") ? issues.button_label : undefined}
        >
          <Input
            id="button_label"
            value={data.button_label}
            placeholder="Visit website"
            aria-invalid={show("button_label") && Boolean(issues.button_label)}
            onChange={(event) => onChange({ button_label: event.target.value })}
          />
        </Field>
        <Field label="Button URL" htmlFor="button_url">
          <Input
            id="button_url"
            value={data.button_url}
            placeholder="https://example.com"
            onChange={(event) => onChange({ button_url: event.target.value })}
          />
        </Field>
      </div>
      <StepFooter saving={saving} nextLabel="Save" onSave={save} />
    </section>
  );
}
