"use client";

import * as React from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { IssuedSecret } from "@/lib/admin/partners";

/**
 * Shows a partner's client id and secret — the only time the secret is ever
 * visible. It can't be dismissed by clicking outside or pressing Escape until
 * the admin confirms they've stored it, and the secret is dropped from memory
 * the moment the dialog closes (the parent clears `issued`).
 */
export function SecretRevealDialog({
  issued,
  title = "Copy the partner's credentials",
  onClose,
}: {
  issued: IssuedSecret | null;
  title?: string;
  onClose: () => void;
}) {
  const [stored, setStored] = React.useState(false);
  const [copied, setCopied] = React.useState<"id" | "secret" | null>(null);

  React.useEffect(() => {
    setStored(false);
    setCopied(null);
  }, [issued]);

  const copy = async (value: string, which: "id" | "secret") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  };

  return (
    <Dialog open={Boolean(issued)} onOpenChange={(open) => !open && stored && onClose()}>
      <DialogContent
        className="sm:max-w-lg"
        onEscapeKeyDown={(event) => !stored && event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Send these to the partner over a secure channel. The secret is shown now and never again — if it&apos;s
            lost, rotate the key.
          </DialogDescription>
        </DialogHeader>

        {issued && (
          <div className="space-y-3">
            <SecretRow label="Client id" value={issued.clientId} copied={copied === "id"} onCopy={() => copy(issued.clientId, "id")} />
            <SecretRow
              label="Client secret"
              value={issued.clientSecret}
              copied={copied === "secret"}
              onCopy={() => copy(issued.clientSecret, "secret")}
            />
            <p className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Don&apos;t paste the secret into chat, email threads or tickets. Store it in the partner&apos;s secret
              manager.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox id="secret-stored" checked={stored} onCheckedChange={(value) => setStored(value === true)} />
              <Label htmlFor="secret-stored" className="text-sm font-normal">
                I&apos;ve stored the secret somewhere safe
              </Label>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} disabled={!stored}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs">{value}</code>
        <Button type="button" variant="outline" size="icon" onClick={onCopy} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}
