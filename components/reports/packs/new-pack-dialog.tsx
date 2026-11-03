"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreatePack,
  usePackTemplates,
  useReportCatalogue,
} from "@/hooks/use-report-packs";
import { apiErrorMessage } from "@/lib/api-error";
import {
  CUSTOM_PERIOD,
  DEFAULT_PERIOD,
  fetchTemplate,
  fromStarter,
  fromTemplate,
  NAME_MAX,
  PACK_ROUTES,
  presetRange,
  STARTER_SOURCE,
  TEMPLATE_SOURCE,
  type StarterTemplate,
  type TemplateSource,
} from "@/lib/report-packs";
import type { ReportPeriod } from "@/lib/report-periods";
import { PeriodFields, TemplateSourceSelect } from "./pack-fields";

export function NewPackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const templates = usePackTemplates();
  const catalogue = useReportCatalogue();
  const create = useCreatePack();

  const starters = catalogue.data?.starterTemplates ?? [];
  const yours = templates.data?.templates ?? [];

  const [chosen, setChosen] = React.useState<TemplateSource | "">("");
  const [pickedPeriod, setPickedPeriod] = React.useState<ReportPeriod | null>(
    null,
  );
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [typedName, setTypedName] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const starterFor = (value: string): StarterTemplate | undefined =>
    value.startsWith(STARTER_SOURCE)
      ? starters.find((starter) => `${STARTER_SOURCE}${starter.key}` === value)
      : undefined;

  const sourceName = (value: string) => {
    if (value.startsWith(TEMPLATE_SOURCE))
      return (
        yours.find((template) => `${TEMPLATE_SOURCE}${template.id}` === value)
          ?.name ?? ""
      );
    return starterFor(value)?.name ?? "";
  };

  React.useEffect(() => {
    if (!open) {
      setChosen("");
      setPickedPeriod(null);
      setFrom("");
      setTo("");
      setTypedName(null);
    }
  }, [open]);

  const firstSource: TemplateSource | "" = yours[0]
    ? `${TEMPLATE_SOURCE}${yours[0].id}`
    : starters[0]
      ? `${STARTER_SOURCE}${starters[0].key}`
      : "";
  const source = chosen || firstSource;
  const period =
    pickedPeriod ??
    (starterFor(source)?.periodPreset as ReportPeriod | undefined) ??
    DEFAULT_PERIOD;
  const suggestedName = source
    ? `${sourceName(source)} — ${period === CUSTOM_PERIOD ? "custom period" : period}`.slice(
        0,
        NAME_MAX,
      )
    : "";
  const name = typedName ?? suggestedName;

  const chooseSource = (value: TemplateSource) => {
    setChosen(value);
    const preset = starterFor(value)?.periodPreset as ReportPeriod | undefined;
    if (preset) setPickedPeriod(preset);
  };

  const range = period === CUSTOM_PERIOD ? { from, to } : presetRange(period);
  const valid = Boolean(
    source && name.trim() && range.from && range.to && range.from < range.to,
  );

  const submit = async () => {
    if (!valid || !source) return;
    setCreating(true);
    try {
      const preset = period === CUSTOM_PERIOD ? undefined : period;
      const input = source.startsWith(TEMPLATE_SOURCE)
        ? fromTemplate(
            await fetchTemplate(Number(source.slice(TEMPLATE_SOURCE.length))),
            { ...range, preset },
          )
        : fromStarter(starterFor(source) as StarterTemplate, {
            ...range,
            preset,
          });
      const pack = await create.mutateAsync({ ...input, name: name.trim() });
      onOpenChange(false);
      router.push(PACK_ROUTES.pack(pack.id));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not create the pack."));
    } finally {
      setCreating(false);
    }
  };

  const loading = templates.isLoading || catalogue.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New report pack</DialogTitle>
          <DialogDescription>
            Pick what goes in it and the period it covers. You can change
            anything afterwards.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4" role="status" aria-label="Loading">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pack-source">Start from</Label>
              <TemplateSourceSelect
                id="new-pack-source"
                value={source}
                onChange={chooseSource}
                templates={yours}
                starters={starters}
                placeholder="Choose a template"
              />
              {starterFor(source) && (
                <p className="text-xs text-muted-foreground">
                  {starterFor(source)?.description}
                </p>
              )}
            </div>

            <PeriodFields
              idPrefix="new-pack"
              period={period}
              onPeriodChange={setPickedPeriod}
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
            />

            <div className="space-y-2">
              <Label htmlFor="new-pack-name">Name</Label>
              <Input
                id="new-pack-name"
                value={name}
                onChange={(event) => setTypedName(event.target.value)}
                maxLength={NAME_MAX}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || creating}>
            {creating && <Loader2 className="animate-spin" />}
            Create pack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
