"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { NAME_MAX, type TemplateAccess } from "@/lib/report-packs";

export type TemplateDetails = {
  name: string;
  description: string;
  access: TemplateAccess;
};

const ACCESS_OPTIONS: {
  value: TemplateAccess;
  label: string;
  detail: string;
}[] = [
  {
    value: "business",
    label: "This business",
    detail: "Use it for packs in the business you're working in now.",
  },
  {
    value: "tenant",
    label: "All of my businesses",
    detail: "Use the same template in every business you manage.",
  },
];

const ACCESS_HELP =
  "Where this template can be used. It doesn't change who can open a pack, or a PDF you've already sent.";

export function TemplateSaveDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  submitLabel: string;
  initial: TemplateDetails;
  onSubmit: (details: TemplateDetails) => Promise<void>;
}) {
  const [details, setDetails] = React.useState<TemplateDetails>(initial);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setDetails(initial);
  }, [open, initial]);

  const valid = details.name.trim().length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await onSubmit({
        ...details,
        name: details.name.trim(),
        description: details.description.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Give the template a name your team will recognise.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              autoFocus
              value={details.name}
              onChange={(event) =>
                setDetails((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Month end pack"
              maxLength={NAME_MAX}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-description">
              Description{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Textarea
              id="template-description"
              value={details.description}
              onChange={(event) =>
                setDetails((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="What this template is for, and who its packs go to."
              maxLength={500}
              rows={2}
            />
          </div>

          <div className="space-y-2.5">
            <Label className="flex items-center gap-1.5">
              Where it can be used
              <InfoTip text={ACCESS_HELP} />
            </Label>
            <RadioGroup
              value={details.access}
              onValueChange={(next) =>
                setDetails((current) => ({
                  ...current,
                  access: next as TemplateAccess,
                }))
              }
              className="gap-2"
            >
              {ACCESS_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  htmlFor={`template-access-${option.value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem
                    id={`template-access-${option.value}`}
                    value={option.value}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {option.detail}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
