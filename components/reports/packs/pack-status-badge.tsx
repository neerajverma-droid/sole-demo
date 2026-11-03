"use client";

import { Badge } from "@/components/ui/badge";
import {
  statusLabel,
  type GenerationStatus,
  type PackStatus,
} from "@/lib/report-packs";

const STATUS_TONE: Record<PackStatus, "secondary" | "warning" | "success"> = {
  draft: "secondary",
  approved: "warning",
  published: "success",
};

export function PackStatusBadge({
  status,
  generationStatus,
}: {
  status: PackStatus;
  generationStatus: GenerationStatus;
}) {
  if (generationStatus === "failed") {
    return <Badge variant="danger">Generation failed</Badge>;
  }

  return <Badge variant={STATUS_TONE[status]}>{statusLabel(status)}</Badge>;
}
