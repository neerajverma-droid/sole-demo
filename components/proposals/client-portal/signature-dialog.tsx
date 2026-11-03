"use client";

import * as React from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SIGNATURE_FONT_CLASS } from "@/components/proposals/proposal-document";
import { signatureIssue } from "@/lib/proposal-portal";
import { cn } from "@/lib/utils";

/**
 * Captures the typed signature only — nothing is sent until Finish Signing
 * on the engagement letter behind it.
 */
export function SignatureDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [agreedTerms, setAgreedTerms] = React.useState(false);
  const [agreedEsign, setAgreedEsign] = React.useState(false);
  const [error, setError] = React.useState("");

  const issue = signatureIssue(name, agreedTerms, agreedEsign);

  const confirm = () => {
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    onConfirm(name.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your signature</DialogTitle>
          <DialogDescription>Type your full legal name below.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            value={name}
            autoFocus
            aria-label="Full legal name"
            placeholder="Full legal name"
            className={cn(SIGNATURE_FONT_CLASS, "h-14 text-3xl")}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") confirm();
            }}
          />

          <div className="flex items-start gap-2">
            <Checkbox
              id="signature-terms"
              checked={agreedTerms}
              onCheckedChange={(checked) => {
                setAgreedTerms(checked === true);
                setError("");
              }}
            />
            <Label htmlFor="signature-terms" className="text-xs font-normal leading-5 text-muted-foreground">
              I have read and agree to the Terms &amp; Conditions in this proposal.
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="signature-esign"
              checked={agreedEsign}
              onCheckedChange={(checked) => {
                setAgreedEsign(checked === true);
                setError("");
              }}
            />
            <Label htmlFor="signature-esign" className="text-xs font-normal leading-5 text-muted-foreground">
              I agree to sign this electronically and understand that this signature is legally binding.
            </Label>
          </div>

          {error && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={Boolean(issue)} onClick={confirm}>
            Apply signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
