"use client";

import * as React from "react";
import Link from "next/link";
import { FileX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import {
  usePackTemplate,
  useReportCatalogue,
  useReportPack,
  useUpdatePack,
} from "@/hooks/use-report-packs";
import type { PackInput } from "@/lib/report-packs";
import { EditorSkeleton } from "./editor-skeleton";
import { PackEditor } from "./pack-editor";
import { TemplateEditor } from "./template-editor";

function NotFound({ what }: { what: string }) {
  return (
    <Empty>
      <EmptyMedia>
        <FileX />
      </EmptyMedia>
      <EmptyTitle>That {what} could not be loaded</EmptyTitle>
      <EmptyDescription>
        It may have been deleted, or you may not have access to it.
      </EmptyDescription>
      <EmptyActions>
        <Button asChild variant="outline">
          <Link href="/reports/packs">Back to report packs</Link>
        </Button>
      </EmptyActions>
    </Empty>
  );
}

export function EditPackScreen({ id }: { id: number }) {
  const catalogue = useReportCatalogue();
  const pack = useReportPack(Number.isFinite(id) && id > 0 ? id : null);
  const update = useUpdatePack();

  if (catalogue.isLoading || pack.isLoading) return <EditorSkeleton />;
  if (pack.isError || !pack.data) return <NotFound what="report pack" />;

  return (
    <PackEditor
      key={pack.data.id}
      pack={pack.data}
      catalogue={catalogue.data ?? EMPTY_CATALOGUE}
      saving={update.isPending}
      onSave={(draft: PackInput) =>
        update.mutateAsync({ id: pack.data.id, input: draft })
      }
    />
  );
}

const EMPTY_CATALOGUE = {
  reports: [],
  business: { name: null, currency: "AUD", country: null },
  defaultLogoUrl: null,
  starterTemplates: [],
};

export function NewTemplateScreen() {
  const catalogue = useReportCatalogue();

  if (catalogue.isLoading) return <EditorSkeleton />;

  return (
    <TemplateEditor
      template={null}
      catalogue={catalogue.data ?? EMPTY_CATALOGUE}
    />
  );
}

export function EditTemplateScreen({ id }: { id: number }) {
  const catalogue = useReportCatalogue();
  const template = usePackTemplate(Number.isFinite(id) && id > 0 ? id : null);

  if (catalogue.isLoading || template.isLoading) return <EditorSkeleton />;
  if (template.isError || !template.data) return <NotFound what="template" />;

  return (
    <TemplateEditor
      key={template.data.id}
      template={template.data}
      catalogue={catalogue.data ?? EMPTY_CATALOGUE}
    />
  );
}
