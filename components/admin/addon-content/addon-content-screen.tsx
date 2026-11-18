"use client";

import * as React from "react";
import { Loader2, Puzzle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import {
  useAdminAddonContentQuery,
  useRefreshAdminAddonContent,
} from "@/hooks/use-admin-addon-content-query";
import { useIndustriesQuery } from "@/hooks/use-industries-query";
import {
  ADDON_CATEGORIES,
  addonContentErrors,
  contentToForm,
  formToContent,
  updateAddonContent,
  type AddonCategory,
  type AddonContentForm,
  type AdminAddon,
} from "@/lib/admin/addon-content";
import { addonMoney } from "@/lib/addons";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import { IndustryMultiSelect } from "./industry-multi-select";

const NO_ADDONS: AdminAddon[] = [];

/**
 * Super admin › Add-ons: what the marketplace says about each add-on.
 *
 * One add-on at a time — the list on the left, its content on the right. Saves
 * to the add-on's plan rows (both billing intervals), and the marketplace picks
 * it up on its next catalogue fetch. A field left blank falls back to the web
 * app's own copy rather than showing an empty section.
 */
export function AddonContentScreen() {
  const query = useAdminAddonContentQuery();
  const refresh = useRefreshAdminAddonContent();
  const industries = useIndustriesQuery();
  const addons = query.data ?? NO_ADDONS;

  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const selected = addons.find((addon) => addon.slug === selectedSlug) ?? addons[0] ?? null;

  const [form, setForm] = React.useState<AddonContentForm | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);

  const initial = React.useMemo(
    () => (selected ? contentToForm(selected.content) : null),
    [selected],
  );
  // A different add-on, or fresh data after a save, resets the form to what's stored.
  React.useEffect(() => {
    setForm(initial);
    setShowErrors(false);
  }, [initial]);

  const dirty = !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial);
  const { guard, dialog } = useUnsavedChanges(dirty);
  const errors = form ? addonContentErrors(form) : {};
  const hasErrors = Object.keys(errors).length > 0;

  const set = <K extends keyof AddonContentForm>(key: K, value: AddonContentForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!form || !selected) return;
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      await updateAddonContent(selected.slug, formToContent(form));
      await refresh();
      toast.success(`${selected.name} saved`, {
        description: "The add-on marketplace shows it from its next load.",
      });
    } catch (error) {
      toast.error("Couldn't save that", {
        description: apiErrorMessage(error, "Nothing was changed. Try again in a moment."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Puzzle}
        title="Add-ons"
        description="What the add-on marketplace says about each add-on: its category, the industries it's for, the detail page copy and the video link."
      >
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="outline" onClick={() => setForm(initial)} disabled={saving}>
              Discard
            </Button>
          )}
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Save changes
          </Button>
        </div>
      </PageHeader>

      {query.isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load the add-ons</EmptyTitle>
          <EmptyDescription>
            {apiErrorMessage(query.error, "Refresh the page to try again.")}
          </EmptyDescription>
        </Empty>
      ) : query.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-[32rem] rounded-xl" />
        </div>
      ) : addons.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <Puzzle aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No add-ons yet</EmptyTitle>
          <EmptyDescription>
            Add-ons come from the plans seeder. Run it, then come back here to write their copy.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Add-ons" className="space-y-1">
            {addons.map((addon) => {
              const active = addon.slug === selected?.slug;
              return (
                <button
                  key={addon.slug}
                  type="button"
                  onClick={guard(() => setSelectedSlug(addon.slug))}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start justify-between gap-2 rounded-lg p-2.5 text-left outline-none",
                    "motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/[0.07] ring-1 ring-inset ring-primary/25"
                      : "hover:bg-accent/60",
                  )}
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className={cn("block truncate text-sm", active ? "font-semibold" : "font-medium")}>
                      {addon.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {categoryLabel(addon.content?.category)}
                      {addon.content?.industries?.length
                        ? ` · ${addon.content.industries.length} ${addon.content.industries.length === 1 ? "industry" : "industries"}`
                        : ""}
                    </span>
                  </span>
                  {addon.comingSoon ? (
                    <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                      Soon
                    </Badge>
                  ) : !addon.content ? (
                    <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
                      No copy
                    </Badge>
                  ) : null}
                </button>
              );
            })}
          </nav>

          {selected && form && (
            <div className="space-y-6 rounded-xl border p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-tight">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{selected.slug}</span>
                    {selected.prices.monthly != null && ` · ${addonMoney(selected.prices.monthly)}/month`}
                    {selected.prices.annual != null && ` · ${addonMoney(selected.prices.annual)}/year`}
                  </p>
                </div>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Prices come from the plans seeder and Stripe, so they aren&apos;t edited here.
                </p>
              </div>

              <section className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" htmlFor="addon-category" hint="The marketplace group it sits in.">
                  <Select
                    value={form.category}
                    onValueChange={(value) => set("category", value as AddonCategory)}
                  >
                    <SelectTrigger id="addon-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADDON_CATEGORIES.map((entry) => (
                        <SelectItem key={entry.value} value={entry.value}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="Industries"
                  htmlFor="addon-industries"
                  hint="Tagged add-ons get a “Recommended for your industry” badge and sort first. None = every industry."
                >
                  <IndustryMultiSelect
                    id="addon-industries"
                    options={industries.data ?? []}
                    loading={industries.isLoading}
                    value={form.industries}
                    onChange={(value) => set("industries", value)}
                  />
                </Field>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold">Card</h3>
                <Field label="Subtext" htmlFor="addon-subtext" hint="One line under the name in the list. Say what it's for.">
                  <Input
                    id="addon-subtext"
                    value={form.subtext}
                    maxLength={200}
                    onChange={(event) => set("subtext", event.target.value)}
                  />
                </Field>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold">Video</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Video title" htmlFor="addon-video-title" hint="Shown as “Watch: {title} in 90 seconds”.">
                    <Input
                      id="addon-video-title"
                      value={form.videoTitle}
                      maxLength={120}
                      onChange={(event) => set("videoTitle", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Video link"
                    htmlFor="addon-video-url"
                    hint="Opens in a new tab. Leave empty for the placeholder poster."
                    error={showErrors ? errors.videoUrl : undefined}
                  >
                    <Input
                      id="addon-video-url"
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={form.videoUrl}
                      maxLength={500}
                      aria-invalid={showErrors && !!errors.videoUrl}
                      onChange={(event) => set("videoUrl", event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold">Detail page</h3>
                {(
                  [
                    ["overview", "Overview", "What am I looking at?"],
                    ["whatItDoes", "What it does", "What does switching it on add?"],
                    ["whyItHelps", "Why it helps", "Why would someone bother?"],
                    ["howItWorks", "How it works", "What happens once it's on?"],
                  ] as const
                ).map(([key, label, hint]) => (
                  <Field key={key} label={label} htmlFor={`addon-${key}`} hint={hint}>
                    <Textarea
                      id={`addon-${key}`}
                      rows={3}
                      maxLength={2000}
                      value={form[key]}
                      onChange={(event) => set(key, event.target.value)}
                    />
                  </Field>
                ))}
              </section>

              <section className="space-y-4">
                <Field
                  label="Benefits"
                  htmlFor="addon-benefit-0"
                  hint="Three short lines, shown three across. Fill all three or none."
                  error={showErrors ? errors.benefits : undefined}
                >
                  <div className="grid gap-2 sm:grid-cols-3">
                    {form.benefits.map((line, index) => (
                      <Input
                        key={index}
                        id={`addon-benefit-${index}`}
                        aria-label={`Benefit ${index + 1}`}
                        value={line}
                        maxLength={200}
                        aria-invalid={showErrors && !!errors.benefits}
                        onChange={(event) => {
                          const next = [...form.benefits] as AddonContentForm["benefits"];
                          next[index] = event.target.value;
                          set("benefits", next);
                        }}
                      />
                    ))}
                  </div>
                </Field>

                <Field label="What's included" htmlFor="addon-included" hint="One item per line, up to 12.">
                  <Textarea
                    id="addon-included"
                    rows={5}
                    value={form.included}
                    onChange={(event) => set("included", event.target.value)}
                  />
                </Field>
              </section>
            </div>
          )}
        </div>
      )}

      {dialog}
    </div>
  );
}

function categoryLabel(category: unknown): string {
  return ADDON_CATEGORIES.find((entry) => entry.value === category)?.label ?? "No category";
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
