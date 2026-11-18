"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiErrorMessage } from "@/lib/api-error";
import { templateOptions } from "@/lib/proposal-builder-logic";
import { templateQueryOptions } from "@/lib/proposal-templates";
import { fetchTemplatesOfType, type EmailCategory, type ProposalTemplate, type TemplateKind } from "@/lib/proposals";

/**
 * The "Template" dropdown at the top of the Introduction, Terms & Sign and
 * Thank You steps, as sole-pm has it: your own templates first, then the
 * system ones marked "· System". Picking one fills the step from it — the
 * builder decides how (`onApply`).
 */
export function SectionTemplatePicker({
  kind,
  selectedId,
  onApply,
  emailCategory,
}: {
  kind: Exclude<TemplateKind, "PROPOSAL">;
  /** Email templates only: just the ones for this use (the list has them all). */
  emailCategory?: EmailCategory;
  /** The template the step was auto-filled from, shown until another is picked. */
  selectedId?: string;
  onApply: (template: ProposalTemplate) => void;
}) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = React.useState<string>("");
  const [applying, setApplying] = React.useState(false);
  const query = useQuery({
    // Shared with the templates page, so a template saved there shows up here.
    queryKey: ["proposal-templates", kind],
    queryFn: () => fetchTemplatesOfType(kind),
  });
  const templates = React.useMemo(
    () => (query.data ?? []).filter((template) => !emailCategory || template.emailCategory === emailCategory),
    [query.data, emailCategory],
  );
  const { mine, system } = templateOptions(templates);

  const placeholder = query.isError
      ? "Couldn't load templates"
      : templates.length === 0
        ? "No templates yet"
        : "Select template";

  return (
    <div className="space-y-2">
      <Label htmlFor={`template-${kind}`}>Template</Label>
      {query.isLoading ? (
        <Shimmer className="h-9 w-full rounded-md" role="status" aria-label="Loading templates" />
      ) : (
      <Select
        value={picked || selectedId || ""}
        disabled={query.isLoading || applying || templates.length === 0}
        onValueChange={async (id) => {
          // The list has each template's name only; its content is GET /templates/:id.
          setApplying(true);
          try {
            // From the cache when this template was opened before.
            const template = await queryClient.fetchQuery(templateQueryOptions(id));
            setPicked(id);
            onApply(template);
          } catch (error) {
            toast.error(apiErrorMessage(error, "Couldn't load that template."));
          } finally {
            setApplying(false);
          }
        }}
      >
        <SelectTrigger id={`template-${kind}`} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {mine.length > 0 && (
            <SelectGroup>
              <SelectLabel>My templates</SelectLabel>
              {mine.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {system.length > 0 && (
            <SelectGroup>
              <SelectLabel>System templates</SelectLabel>
              {system.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {applying ? (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading template…
          </>
        ) : (
          "Choosing a template replaces this step’s content."
        )}
      </p>
    </div>
  );
}
