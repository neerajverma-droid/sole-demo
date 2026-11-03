"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/settings/section-card";
import { useSession } from "@/components/auth/session-provider";
import { apiErrorMessage } from "@/lib/api-error";
import { deleteAccount } from "@/lib/account";
import { CANCELLATION_OTHER, CANCELLATION_REASONS } from "@/lib/subscription";
import { cn } from "@/lib/utils";

/** What has to be typed on the final step — deliberately exact, not a toggle. */
const CONFIRM_PHRASE = "DELETE";

/**
 * Closing the account.
 *
 * Deliberately its own tab rather than a row under Security — this is the one
 * irreversible-from-here action on the whole settings screen, so it gets its
 * own red-flagged destination instead of hiding under something people open
 * for routine reasons.
 */
export function DangerZoneSection() {
  const [open, setOpen] = React.useState(false);

  return (
    <SectionCard
      title="Delete zone"
      description="Permanently delete your account and everything in it."
    >
      <div className="flex flex-wrap items-center justify-start gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.03] p-[15px]">
        <p className="flex items-center gap-2.5 text-sm">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
            aria-hidden
          >
            <Trash2 className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">Delete account</span>
            <span className="block text-xs text-muted-foreground">
              Cancels every subscription and removes your businesses,
              invoices and data. Support can recover it afterwards — you
              can&apos;t from here.
            </span>
          </span>
        </p>
       <div className="flex w-full  justify-end" >
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          <Trash2 />
          Delete account
        </Button>
       </div>
      </div>

      <DeleteAccountDialog open={open} onOpenChange={setOpen} />
    </SectionCard>
  );
}

/**
 * Why, then confirm by typing — the same "why" step
 * `subscription-section.tsx`'s `CancelDialog` runs before a plan
 * cancellation, posting to the same `cancel-feedback` endpoint with
 * `type: "delete_account"`, plus a typed confirmation step because this one
 * can't be undone by resubscribing.
 */
function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { signOut } = useSession();

  const [step, setStep] = React.useState<"reason" | "confirm">("reason");
  const [reason, setReason] = React.useState<string>(CANCELLATION_REASONS[0]);
  const [otherText, setOtherText] = React.useState("");
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const reset = () => {
    setStep("reason");
    setReason(CANCELLATION_REASONS[0]);
    setOtherText("");
    setConfirmText("");
  };

  const reasonBlocked = reason === CANCELLATION_OTHER && !otherText.trim();
  const confirmBlocked = confirmText !== CONFIRM_PHRASE;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Not while the delete is in flight — closing wouldn't stop it.
        if (!next && deleting) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <AlertDialogContent>
        {step === "reason" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Before you go</AlertDialogTitle>
              <AlertDialogDescription>
                Tell us why you&apos;re leaving — it helps us fix what&apos;s
                not working for everyone else.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3">
              <p className="text-sm font-medium">Why are you deleting your account?</p>
              <ul className="space-y-1.5">
                {CANCELLATION_REASONS.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => {
                        setReason(option);
                        if (option !== CANCELLATION_OTHER) setOtherText("");
                      }}
                      aria-pressed={reason === option}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        reason === option
                          ? "border-primary bg-primary/5 font-medium"
                          : "hover:border-muted-foreground/40",
                      )}
                    >
                      {option}
                    </button>
                  </li>
                ))}
              </ul>

              {reason === CANCELLATION_OTHER && (
                <Input
                  value={otherText}
                  placeholder="Tell us what happened"
                  onChange={(event) => setOtherText(event.target.value)}
                />
              )}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Keep my account</AlertDialogCancel>
              <AlertDialogAction
                disabled={reasonBlocked}
                onClick={(event) => {
                  // One AlertDialog, two steps — don't let this press close it.
                  event.preventDefault();
                  setStep("confirm");
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    Every business, invoice, quote and receipt you&apos;ve
                    entered goes with it, and any active subscription is
                    cancelled immediately.
                  </p>
                  <p>
                    This isn&apos;t something you can undo yourself — you
                    would need to contact support to recover it.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                Type <span className="font-mono">{CONFIRM_PHRASE}</span> to confirm
              </p>
              <Input
                autoFocus
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={CONFIRM_PHRASE}
                disabled={deleting}
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={deleting}
                onClick={(event) => {
                  event.preventDefault();
                  setStep("reason");
                }}
              >
                Back
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting || confirmBlocked}
                onClick={async (event) => {
                  // Prevent the AlertDialog from auto-closing on click.
                  event.preventDefault();
                  setDeleting(true);
                  try {
                    const message = await deleteAccount(reason, otherText);
                    toast.success(message || "Your account has been deleted");
                    await signOut({ reason: "account_deleted" });
                  } catch (error) {
                    toast.error(
                      apiErrorMessage(error, "Couldn't delete your account."),
                    );
                    setDeleting(false);
                  }
                }}
              >
                {deleting && <Loader2 className="animate-spin" aria-hidden />}
                {deleting ? "Deleting…" : "Delete account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
