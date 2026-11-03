"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/documents/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { reputationErrorMessage, saveReputationSettings } from "@/lib/reputation-api";
import {
  buildSettingsPayload,
  DELAY_OPTIONS,
  normalizeGoogleUrl,
  settingsDraft,
  type ReputationSettings,
  type SettingsDraft,
} from "@/lib/reputation";
import { cn } from "@/lib/utils";

function SettingRow({
  title,
  hint,
  htmlFor,
  children,
  className,
}: {
  title: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-4", className)}>
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {title}
        </label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function ReputationSettingsTab({
  settings,
  loading,
  onSaved,
}: {
  settings: ReputationSettings | undefined;
  loading: boolean;
  onSaved: (settings: ReputationSettings) => void;
}) {
  const [draft, setDraft] = React.useState<SettingsDraft | null>(settings ? settingsDraft(settings) : null);
  const [urlError, setUrlError] = React.useState<string | undefined>();
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (settings) setDraft(settingsDraft(settings));
  }, [settings]);

  if (loading || !settings || !draft) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const update = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const delayOptions = DELAY_OPTIONS.some((option) => option.hours === draft.delayHours)
    ? DELAY_OPTIONS
    : [...DELAY_OPTIONS, { hours: draft.delayHours, label: `After ${draft.delayHours} hours` }];

  const save = async () => {
    const url = normalizeGoogleUrl(draft.googleUrl);
    if (!url.ok) {
      setUrlError("Enter a valid URL, e.g. https://g.page/r/…/review");
      return;
    }
    setUrlError(undefined);
    setSaving(true);
    try {
      const saved = await saveReputationSettings(buildSettingsPayload(settings, draft, url.value));
      onSaved(saved);
      toast.success("Reputation settings saved");
    } catch (error) {
      toast.error(reputationErrorMessage(error, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <SettingRow
          title="Reputation management"
          htmlFor="reputation-enabled"
          hint="Send automated rating requests for selected jobs upon completion and route happy clients to public reviews."
        >
          <Switch id="reputation-enabled" checked={draft.isEnabled} onCheckedChange={(checked) => update("isEnabled", checked)} />
        </SettingRow>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-semibold">Public review links</h3>
        <div className="mt-4">
          <Field
            label="Google review link"
            htmlFor="reputation-google-url"
            error={urlError}
            hint="Where 4–5★ clients are sent. If blank, they'll only see a thank-you screen."
          >
            <Input
              id="reputation-google-url"
              value={draft.googleUrl}
              onChange={(event) => {
                update("googleUrl", event.target.value);
                if (urlError) setUrlError(undefined);
              }}
              placeholder="https://g.page/r/…/review"
              aria-invalid={!!urlError}
              className={cn(urlError && "border-destructive focus-visible:ring-destructive")}
            />
          </Field>
        </div>
        <SettingRow
          className="mt-5 border-t border-border pt-5"
          title="Offer “Share on your socials”"
          htmlFor="reputation-share-socials"
          hint="After a happy rating — and for clients who've already left a Google review — let them share on LinkedIn, X, Facebook or WhatsApp."
        >
          <Switch
            id="reputation-share-socials"
            checked={draft.shareSocials}
            onCheckedChange={(checked) => update("shareSocials", checked)}
          />
        </SettingRow>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-semibold">Sending</h3>
        <SettingRow className="mt-4" title="Delay after job completion" htmlFor="reputation-delay">
          <Select value={String(draft.delayHours)} onValueChange={(value) => update("delayHours", Number(value))}>
            <SelectTrigger id="reputation-delay" className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {delayOptions.map((option) => (
                <SelectItem key={option.hours} value={String(option.hours)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          className="mt-5 border-t border-border pt-5"
          title="Star threshold for public review"
          hint="Ratings at or above this go to a Google review; below go to the private form and a follow-up."
        >
          <div className="inline-flex rounded-md border border-input bg-muted/50 p-0.5" role="radiogroup" aria-label="Star threshold">
            {([4, 5] as const).map((threshold) => (
              <button
                key={threshold}
                type="button"
                role="radio"
                aria-checked={draft.publicThreshold === threshold}
                onClick={() => update("publicThreshold", threshold)}
                className={cn(
                  "rounded px-3 py-1 text-sm transition-colors",
                  draft.publicThreshold === threshold
                    ? "bg-background font-semibold text-foreground shadow-sm"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {threshold === 4 ? "4★+" : "5★ only"}
              </button>
            ))}
          </div>
        </SettingRow>
        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </section>
    </div>
  );
}
