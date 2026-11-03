"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { Loader2, Mail, UserPlus } from "lucide-react";
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
import { Field } from "@/components/documents/field";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { inviteAccountantOpenAtom } from "@/lib/atoms";
import { inviteIssues } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { useOnboardingStore } from "@/stores/onboarding";

/**
 * Inviting an accountant, lifted out of the onboarding step that used to ask
 * for it before the person had seen their own numbers.
 *
 * Same field, same validation, same explanation of what the accountant gets —
 * it's a dialog now rather than a screen of its own, because from the
 * get-started list it's one question rather than a stage of anything.
 *
 * Mounted once beside the header that opens it, so the item works from whatever
 * page the person happens to be on.
 */
export function InviteAccountantDialog() {
  const [open, setOpen] = useAtom(inviteAccountantOpenAtom);
  const complete = useOnboardingStore((state) => state.complete);

  const [email, setEmail] = React.useState("");
  const [edited, setEdited] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  // An empty field is nothing to validate — it's someone who changed their mind.
  const issues = email.trim() ? inviteIssues(email) : [];
  const issue = edited ? issues[0]?.message : undefined;

  const send = async () => {
    setEdited(true);
    if (!email.trim() || issues.length > 0 || sending) return;

    setSending(true);
    try {
      await api.post(apiRoutes.accountants.sendInvite, {
        email: email.trim(),
      });
      toast.success("Invitation sent", {
        description: `${email.trim()} can now access your books.`,
      });
      complete("accountant");
      setOpen(false);
      setEmail("");
      setEdited(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Couldn't send the invitation. Try again.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite your accountant</DialogTitle>
          <DialogDescription>
            Give them access to your books so they can review your coding and
            lodge on your behalf.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Field
            label="Accountant's email"
            htmlFor="invite-accountant"
            error={issue}
            hint={issue ? undefined : "They'll get an email invitation."}
          >
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="invite-accountant"
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => {
                  setEdited(true);
                  setEmail(event.target.value);
                }}
                placeholder="accountant@firm.com.au"
                aria-invalid={!!issue}
                className={cn(
                  "h-10 pl-9",
                  issue && "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>
          </Field>

          <div className="space-y-3 rounded-lg border border-dashed border-border surface-subtle p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="size-4 text-primary" aria-hidden />
              What they&apos;ll be able to do
            </p>
            <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li>See your transactions, invoices and expenses</li>
              <li>Correct how things are categorised</li>
              <li>Prepare and lodge your BAS</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              They can&apos;t change your bank connections or your plan.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={sending || !email.trim()}>
              {sending && <Loader2 className="animate-spin" aria-hidden />}
              {sending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
