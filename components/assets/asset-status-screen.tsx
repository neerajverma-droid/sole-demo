"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Info, Loader2, ShieldAlert, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import {
  ASSET_STATUS_REASONS,
  formatAssetDate,
  type AssetStatusReason,
} from "@/lib/assets";
import {
  useAssetStatusQuery,
  useDeleteAssetStatusMutation,
  useMarkAssetReturnedMutation,
  useReportAssetStatusMutation,
} from "@/hooks/use-asset-status-query";
import { useAssetInsuranceQuery } from "@/hooks/use-asset-insurance-query";
import { useAssetsQuery } from "@/hooks/use-assets-query";
import { useAssetsStore } from "@/stores/assets";
import { cn } from "@/lib/utils";

const ASSETS_ROOT = "/assets";

/**
 * Report an asset lost, damaged or stolen — and the way back from that,
 * marking it returned.
 *
 * Two screens folded into one, the way Disposal and Depreciation each carry
 * both a setup form and a read-only summary: a report already on file shows
 * a status card with "Mark as returned" and "Remove report" instead of the
 * form, since re-filling in what's already been said isn't the job here —
 * undoing it, or clearing it, is.
 */
export function AssetStatusScreen({ assetId }: { assetId: string }) {
  const router = useRouter();
  // Hydrates the register on a direct/refreshed visit to this route.
  useAssetsQuery();
  const assets = useAssetsStore((state) => state.assets);
  const { data: report, isLoading: loadingReport } = useAssetStatusQuery(assetId);
  const { data: insurance = [] } = useAssetInsuranceQuery(assetId);
  const reportStatus = useReportAssetStatusMutation(assetId);
  const markReturned = useMarkAssetReturnedMutation(assetId);
  const deleteStatus = useDeleteAssetStatusMutation(assetId);

  const asset = assets.find((entry) => entry.id === assetId);
  const assetHref = `${ASSETS_ROOT}/${assetId}`;
  const hasInsurance = insurance.length > 0;

  const [reason, setReason] = React.useState<AssetStatusReason>(
    "Lost or damaged",
  );
  const [referenceNo, setReferenceNo] = React.useState("");
  const [policeReportNo, setPoliceReportNo] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [sendInsuranceReport, setSendInsuranceReport] = React.useState(false);
  const [confirmingReturn, setConfirmingReturn] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  if (!asset) {
    return (
      <div className="mx-auto max-w-3xl">
        <Empty>
          <EmptyMedia>
            <ShieldAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Asset not found</EmptyTitle>
            <EmptyDescription>
              It may have been deleted from the register.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" asChild>
              <Link href={ASSETS_ROOT}>Back to assets</Link>
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  /** A report that's still in effect — returned or never filed both fall through to the form. */
  const active = !!report && !report.isReturned;
  const stolenBlocked = reason === "Stolen" && !hasInsurance;

  const submit = async () => {
    try {
      await reportStatus.mutateAsync({
        reason,
        referenceNo,
        policeReportNo,
        notes,
        sendInsuranceReport,
      });
      toast.success(`${asset.name} reported ${reason.toLowerCase()}`);
      router.push(assetHref);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't report this asset",
      );
    }
  };

  const returnIt = async () => {
    try {
      await markReturned.mutateAsync();
      toast.success(`${asset.name} marked as returned`);
      setConfirmingReturn(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't mark this asset returned",
      );
    }
  };

  const removeReport = async () => {
    try {
      await deleteStatus.mutateAsync();
      toast.success("Report removed");
      setConfirmingRemove(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't remove this report",
      );
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={assetHref}>
            <ArrowLeft />
            {asset.name}
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {asset.name} — lost, damaged or stolen
          </h1>
          <p className="text-sm text-muted-foreground">
            {asset.category}
            {report?.isReturned && " · previously reported, since returned"}
          </p>
        </div>
      </div>

      {loadingReport ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : active && report ? (
        <StatusSummary
          report={report}
          onReturn={() => setConfirmingReturn(true)}
          onRemove={() => setConfirmingRemove(true)}
        />
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-[14px] border border-primary/20 bg-primary/5 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Reporting an asset here doesn&apos;t remove it from the
              register — it flags it, so the register still shows what you
              own even while something&apos;s missing. Use &ldquo;Record
              disposal&rdquo; instead for something sold, scrapped or written
              off for good.
            </p>
          </div>

          <FormSection
            icon={TriangleAlert}
            title="Report details"
            description="What happened, and anything worth keeping on file about it."
          >
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">What happened</legend>
                <RadioGroup
                  value={reason}
                  onValueChange={(value) => setReason(value as AssetStatusReason)}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {ASSET_STATUS_REASONS.map((option) => {
                    const chosen = reason === option;
                    return (
                      <Label
                        key={option}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-[14px] border p-4 font-normal leading-normal transition-colors",
                          chosen
                            ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                            : "border-border hover:border-primary/40 hover:bg-muted/40",
                        )}
                      >
                        <RadioGroupItem value={option} />
                        <span className="text-sm font-medium">{option}</span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </fieldset>

              {stolenBlocked && (
                <div className="flex items-start gap-3 rounded-[14px] border border-warning/30 bg-warning/5 p-4">
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-warning"
                    aria-hidden
                  />
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    This asset needs an insurance policy on file before it can
                    be reported stolen.{" "}
                    <Link
                      href={`${assetHref}/insurance`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Add insurance
                    </Link>{" "}
                    first.
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Reference no." htmlFor="status-reference">
                  <Input
                    id="status-reference"
                    value={referenceNo}
                    onChange={(event) => setReferenceNo(event.target.value)}
                    placeholder="Optional"
                  />
                </Field>

                {reason === "Stolen" && (
                  <Field label="Police report no." htmlFor="status-police-report">
                    <Input
                      id="status-police-report"
                      value={policeReportNo}
                      onChange={(event) => setPoliceReportNo(event.target.value)}
                      placeholder="Optional"
                    />
                  </Field>
                )}
              </div>

              <Field label="Notes" htmlFor="status-notes">
                <Textarea
                  id="status-notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>

              {hasInsurance && (
                <Label className="flex cursor-pointer items-start gap-3 font-normal">
                  <Checkbox
                    checked={sendInsuranceReport}
                    onCheckedChange={(checked) =>
                      setSendInsuranceReport(checked === true)
                    }
                    className="mt-0.5"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">
                      Email the insurer a report
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Sent to the email on file for this asset&apos;s policy.
                    </span>
                  </span>
                </Label>
              )}
            </div>
          </FormSection>
        </>
      )}

      {!active && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Button variant="outline" asChild>
            <Link href={assetHref}>Cancel</Link>
          </Button>
          <Button
            disabled={stolenBlocked || reportStatus.isPending}
            onClick={submit}
          >
            {reportStatus.isPending && <Loader2 className="size-4 animate-spin" />}
            {reportStatus.isPending ? "Reporting…" : "Report asset"}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmingReturn} onOpenChange={setConfirmingReturn}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {asset.name} as returned?</AlertDialogTitle>
            <AlertDialogDescription>
              The report stays on file for your records, but the asset goes
              back to showing as normal on the register.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={returnIt} disabled={markReturned.isPending}>
              {markReturned.isPending && <Loader2 className="size-4 animate-spin" />}
              {markReturned.isPending ? "Saving…" : "Mark as returned"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this report?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the report entirely rather than marking it
              returned. Use this if it was reported by mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={removeReport}
              disabled={deleteStatus.isPending}
            >
              {deleteStatus.isPending && <Loader2 className="size-4 animate-spin" />}
              {deleteStatus.isPending ? "Removing…" : "Remove report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusSummary({
  report,
  onReturn,
  onRemove,
}: {
  report: {
    reason: AssetStatusReason;
    referenceNo: string;
    policeReportNo: string;
    notes: string;
    reportedDate: string;
  };
  onReturn: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-4 rounded-[14px] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
            aria-hidden
          >
            <ShieldAlert className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              Reported {report.reason.toLowerCase()}
            </p>
            {report.reportedDate && (
              <p className="text-xs text-muted-foreground tabular">
                {formatAssetDate(report.reportedDate)}
              </p>
            )}
          </div>
        </div>
        <Badge variant="destructive" className="shrink-0">
          {report.reason}
        </Badge>
      </div>

      {(report.referenceNo || report.policeReportNo || report.notes) && (
        <dl className="space-y-2 border-t border-border pt-3 text-sm">
          {report.referenceNo && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-xs text-muted-foreground">Reference no.</dt>
              <dd className="text-right tabular">{report.referenceNo}</dd>
            </div>
          )}
          {report.policeReportNo && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-xs text-muted-foreground">
                Police report no.
              </dt>
              <dd className="text-right tabular">{report.policeReportNo}</dd>
            </div>
          )}
          {report.notes && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              {report.notes}
            </p>
          )}
        </dl>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={onRemove}>
          Remove report
        </Button>
        <Button size="sm" onClick={onReturn}>
          <Undo2 />
          Mark as returned
        </Button>
      </div>
    </div>
  );
}
