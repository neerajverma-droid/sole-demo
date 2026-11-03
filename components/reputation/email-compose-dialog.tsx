"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/documents/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/reputation/reputation-ui";
import { reputationErrorMessage } from "@/lib/reputation-api";
import { htmlHasText } from "@/lib/reputation";

export type EmailComposeRequest = {
  title: string;
  description: string;
  recipientName: string;
  recipientEmail: string;
  initialMessage: string;
  sendLabel: string;
  successMessage: string;
  send: (html: string) => Promise<void>;
};

export function EmailComposeDialog({
  open,
  request,
  onClose,
  onSent,
}: {
  open: boolean;
  request: EmailComposeRequest | null;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [message, setMessage] = React.useState("");
  const [attempted, setAttempted] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!open || !request) return;
    setMessage(request.initialMessage);
    setAttempted(false);
    setSending(false);
  }, [open, request]);

  const empty = !htmlHasText(message);

  const submit = async () => {
    if (!request) return;
    setAttempted(true);
    if (empty) return;
    setSending(true);
    try {
      await request.send(message);
      toast.success(request.successMessage);
      onSent?.();
      onClose();
    } catch (error) {
      toast.error(reputationErrorMessage(error, "Failed to send the email. Please try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">To: </span>
            <span className="font-medium">{request?.recipientName || "Client"}</span>
            {request?.recipientEmail && <span className="text-muted-foreground"> · {request.recipientEmail}</span>}
          </div>
          <Field label="Email message" htmlFor="reputation-compose-message" required error={attempted && empty ? "Enter an email message" : undefined}>
            <RichTextEditor id="reputation-compose-message" value={message} onChange={setMessage} invalid={attempted && empty} />
          </Field>
        </div>
        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {sending ? "Sending…" : request?.sendLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
