"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BulkImportResult, BulkResultRow } from "@/lib/bulk-import";
import { cn } from "@/lib/utils";

/**
 * What an import actually did, said plainly.
 *
 * The port of sole-webapp's `BulkImportResultsModal`. It exists because a
 * count alone lies by omission: a file whose every row matched a contact
 * that already exists reports "0 imported", which reads as a failure when
 * nothing went wrong. The banner names the outcome, the three tiles break it
 * down, and the table says which row was which — so "why didn't my 3 rows
 * import?" is answered on screen instead of in a support thread.
 *
 * Tone comes from the counts, never from the request's `success` flag: that
 * flag stays true for every per-row outcome, created, skipped and failed
 * alike.
 */
type Tone = "success" | "info" | "warning" | "error";

function resultTone({ created, skipped, failed }: BulkImportResult): Tone {
  if (failed > 0 && created === 0 && skipped === 0) return "error";
  if (failed > 0) return "warning";
  if (created > 0) return "success";
  return "info";
}

const TONE_ICON: Record<Tone, LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

const TONE_BANNER: Record<Tone, string> = {
  success: "border-success/30 bg-success/5 text-foreground",
  info: "border-warning/30 bg-warning/5 text-foreground",
  warning: "border-warning/40 bg-warning/10 text-foreground",
  error: "border-destructive/30 bg-destructive/5 text-foreground",
};

const TONE_ICON_COLOR: Record<Tone, string> = {
  success: "text-success",
  info: "text-warning",
  warning: "text-warning",
  error: "text-destructive",
};

const STATUS_BADGE: Record<
  BulkResultRow["status"],
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  success: { label: "Created", variant: "success" },
  skipped: { label: "Already exists", variant: "warning" },
  failed: { label: "Failed", variant: "destructive" },
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function bannerCopy(
  result: BulkImportResult,
  noun: string,
  nounPlural: string,
): { tone: Tone; lead: string; detail: string } {
  const { created, skipped, failed } = result;
  const tone = resultTone(result);

  if (tone === "success") {
    return {
      tone,
      lead: `${plural(created, noun)} imported.`,
      detail:
        skipped > 0
          ? `${plural(skipped, "row")} skipped because they already existed.`
          : "Every row imported cleanly.",
    };
  }

  if (tone === "info") {
    // The case the counts alone get wrong: nothing was created, but nothing
    // went wrong either.
    return {
      tone,
      lead: `No new ${nounPlural} added.`,
      detail: `All ${plural(skipped, "row")} matched ${
        skipped === 1 ? "a record" : "records"
      } that already exist.`,
    };
  }

  if (tone === "warning") {
    return {
      tone,
      lead: `${created} created, ${skipped} skipped, ${failed} failed.`,
      detail: `Fix the failed row${failed === 1 ? "" : "s"} and re-upload just ${
        failed === 1 ? "it" : "those"
      }.`,
    };
  }

  return {
    tone,
    lead: "Nothing imported.",
    detail: "Every row failed — check the file and try again.",
  };
}

export function BulkResultsDialog({
  open,
  onOpenChange,
  result,
  fileName,
  noun,
  nounPlural,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: BulkImportResult | null;
  fileName?: string;
  noun: string;
  nounPlural: string;
  /** Runs when Done is pressed — usually closes the importer behind this. */
  onDone: () => void;
}) {
  if (!result) return null;

  const { tone, lead, detail } = bannerCopy(result, noun, nounPlural);
  const ToneIcon = TONE_ICON[tone];
  const total = result.created + result.skipped + result.failed;
  const rows = result.rows ?? [];

  const tiles = [
    { key: "created", label: "Created", value: result.created, icon: CheckCircle2, tone: "success" },
    { key: "skipped", label: "Skipped", value: result.skipped, icon: Info, tone: "warning" },
    { key: "failed", label: "Failed", value: result.failed, icon: XCircle, tone: "destructive" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b p-6 text-left">
          <DialogTitle>Import results</DialogTitle>
          <DialogDescription>
            {fileName ? `${fileName} · ` : ""}
            {plural(total, "row")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
              TONE_BANNER[tone],
            )}
          >
            <ToneIcon
              className={cn("size-5 shrink-0", TONE_ICON_COLOR[tone])}
              aria-hidden
            />
            <p>
              <span className="font-semibold">{lead}</span> {detail}
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-3">
            {tiles.map((tile) => {
              const active = tile.value > 0;
              const Icon = tile.icon;
              return (
                <div
                  key={tile.key}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3.5",
                    active && tile.tone === "success" && "border-success/30 bg-success/5",
                    active && tile.tone === "warning" && "border-warning/30 bg-warning/5",
                    active &&
                      tile.tone === "destructive" &&
                      "border-destructive/30 bg-destructive/5",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full bg-muted",
                      active && tile.tone === "success" && "bg-success/10 text-success",
                      active && tile.tone === "warning" && "bg-warning/10 text-warning",
                      active &&
                        tile.tone === "destructive" &&
                        "bg-destructive/10 text-destructive",
                      !active && "text-muted-foreground/40",
                    )}
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <dd
                      className={cn(
                        "text-2xl font-semibold leading-none tabular",
                        !active && "text-muted-foreground/40",
                      )}
                    >
                      {tile.value}
                    </dd>
                    <dt className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {tile.label}
                    </dt>
                  </div>
                </div>
              );
            })}
          </dl>

          {/* Only when the server said something per row. Invoices, expenses
              and assets answer with a bare count, and an empty table under
              the tiles would read as "nothing happened". */}
          {rows.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>{noun[0].toUpperCase() + noun.slice(1)}</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.failed;
                    return (
                      <TableRow key={`${row.row}-${index}`}>
                        <TableCell className="align-top text-xs text-muted-foreground tabular">
                          {row.row}
                        </TableCell>
                        <TableCell className="align-top font-medium">
                          {row.identifier || "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {row.message || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/40 p-4">
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
