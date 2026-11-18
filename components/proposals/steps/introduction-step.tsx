"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/documents/field";
import { IntroBlocksEditor } from "@/components/proposals/intro-blocks-editor";
import { SIGNATURE_FONT_CLASS, SIGNATURE_SIZES } from "@/components/proposals/proposal-document";
import { SenderSelect, type SenderOption } from "@/components/proposals/steps/content-steps";
import { StepFooter, StepHeader } from "@/components/proposals/steps/step-parts";
import {
  type IntroductionData,
  type MergeValues,
  type SignatureSize,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

export function IntroductionStep({
  data,
  onChange,
  onImageUpload,
  onSave,
  onBack,
  saving,
  senders,
  mergeValues,
  templatePicker,
}: {
  data: IntroductionData;
  onChange: (updater: (prev: IntroductionData) => IntroductionData) => void;
  onImageUpload: (blockId: string, file: File) => void;
  onSave: () => void;
  onBack: () => void;
  saving: boolean;
  senders: SenderOption[];
  mergeValues: MergeValues;
  /** The "Template" dropdown that fills this step from a saved template. */
  templatePicker?: React.ReactNode;
}) {
  const signature = data.signature;
  const setSignature = (patch: Partial<IntroductionData["signature"]>) =>
    onChange((prev) => ({ ...prev, signature: { ...prev.signature, ...patch } }));

  return (
    <section className="space-y-5">
      <StepHeader
        title="Introduction"
        description="Give your client a clear and friendly introduction to your proposal."
      />

      {templatePicker}

      <Field label="Display message from">
        <SenderSelect
          options={senders}
          value={data.message_from}
          onChange={(value) => onChange((prev) => ({ ...prev, message_from: value }))}
        />
      </Field>

      <IntroBlocksEditor
        blocks={data.blocks}
        onBlocksChange={(updater) => onChange((prev) => ({ ...prev, blocks: updater(prev.blocks) }))}
        onImageUpload={onImageUpload}
        mergeValues={mergeValues}
      />

      <div className="space-y-3 border-t border-border pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="intro-signature">Signature</Label>
            <p className="text-xs text-muted-foreground">
              Sign-off at the end of the introduction. Type the name — we&apos;ll
              render it in a signature font.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch
              id="intro-signature"
              checked={signature.showing}
              onCheckedChange={(checked) => setSignature({ showing: checked })}
            />
            <span className="text-xs text-muted-foreground">
              {signature.showing ? "Showing" : "Hidden"}
            </span>
          </div>
        </div>

        {signature.showing && (
          <>
            <Input
              value={signature.name}
              placeholder="Your name"
              aria-label="Signature name"
              onChange={(event) => setSignature({ name: event.target.value })}
            />
            <div className="flex items-center gap-2">
              <span className="mr-1 text-xs text-muted-foreground">Size</span>
              {(["small", "medium", "large"] as SignatureSize[]).map((size) => (
                <Button
                  key={size}
                  type="button"
                  size="sm"
                  variant={signature.size === size ? "secondary" : "outline"}
                  aria-pressed={signature.size === size}
                  className={cn("capitalize", signature.size === size && "ring-1 ring-foreground/40")}
                  onClick={() => setSignature({ size })}
                >
                  {size}
                </Button>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-5 py-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Preview
              </p>
              <p
                className={cn(
                  SIGNATURE_FONT_CLASS,
                  "leading-tight",
                  SIGNATURE_SIZES[signature.size] ?? SIGNATURE_SIZES.medium,
                )}
              >
                {signature.name || "Your signature"}
              </p>
            </div>
          </>
        )}
      </div>

      <StepFooter
        saving={saving}
        nextLabel="Services"
        onSave={onSave}
        backLabel="General"
        onBack={onBack}
      />

    </section>
  );
}
