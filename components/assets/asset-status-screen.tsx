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
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Info,
  Loader2,
  Pencil,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from "lucide-react";
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
  assetMoney,
  formatAssetDate,
  type AssetInsurance,
  type AssetStatusReason,
} from "@/lib/assets";
import {
  useAssetStatusQuery,
  useDeleteAssetStatusMutation,
  useMarkAssetReturnedMutation,
  useReportAssetStatusMutation,
} from "@/hooks/use-asset-status-query";
import { apiErrorMessage } from "@/lib/api-error";
import { useAssetInsuranceQuery } from "@/hooks/use-asset-insurance-query";
import { useRegisterAsset } from "@/hooks/use-asset-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { cn } from "@/lib/utils";

const ASSETS_ROOT = "/assets";

/** Australia's Police Assistance Line — non-emergency reports such as theft. */
const AU_POLICE_ASSISTANCE_LINE = { display: "131 444", tel: "131444" };

/**
 * The policy a report is made against: the one ending last, as the server
 * picks it (`getLatestInsurance` orders by end_date desc).
 */
function latestPolicy(policies: AssetInsurance[]): AssetInsurance | null {
  if (policies.length === 0) return null;
  return [...policies].sort((a, b) => (b.endDate || "").localeCompare(a.endDate || ""))[0];
}

/**
 * Report an asset lost, damaged or stolen — and the way back from that,
 * marking it returned.
 *
 * A report on file shows as a summary with Edit, Mark as returned and Remove;
 * Edit (or a report that has since been returned) brings the form back,
 * prefilled. Saving a report pauses the asset's depreciation; returning or
 * removing it resumes it.
 */
export function AssetStatusScreen({ assetId }: { assetId: string }) {
  const router = useRouter();
  // The register's copy, or the asset fetched on its own on a direct visit.
  const { asset, loading } = useRegisterAsset(assetId);
  const { data: report, isLoading: loadingReport } = useAssetStatusQuery(assetId);
  const { data: insurance = [] } = useAssetInsuranceQuery(assetId);
  const { country } = useCountryContext();
  const reportStatus = useReportAssetStatusMutation(assetId);
  const markReturned = useMarkAssetReturnedMutation(assetId);
  const deleteStatus = useDeleteAssetStatusMutation(assetId);

  // Back, Cancel and "done" return to the register — `/assets/:id` is the edit
  // form (it shows "Loading asset…" and isn't where these screens were opened
  // from).
  const assetHref = ASSETS_ROOT;
  const policy = latestPolicy(insurance);
  const hasInsurance = !!policy;
  const isAustralia = (country?.iso2 || "AU").toUpperCase() === "AU";

  const [reason, setReason] = React.useState<AssetStatusReason>("Lost or damaged");
  const [referenceNo, setReferenceNo] = React.useState("");
  const [policeReportNo, setPoliceReportNo] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [sendInsuranceReport, setSendInsuranceReport] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [triedSubmit, setTriedSubmit] = React.useState(false);
  const [confirmingReturn, setConfirmingReturn] = React.useState(false);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  // Prefill from the report on file, so "Edit report" changes it rather than
  // starting again.
  const loadFromReport = React.useCallback(() => {
    if (!report) return;
    setReason(report.reason);
    setReferenceNo(report.referenceNo);
    setPoliceReportNo(report.policeReportNo);
    setNotes(report.notes);
  }, [report]);
  // Only a report still in effect is edited; a returned one is history, and a
  // new report after it starts blank rather than inheriting its details.
  React.useEffect(() => {
    if (report && !report.isReturned) loadFromReport();
  }, [report, loadFromReport]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-sm text-muted-foreground">
        Loading asset…
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="mx-auto max-w-3xl">
        <Empty>
          <EmptyMedia>
            <ShieldAlert aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Asset not found</EmptyTitle>
            <EmptyDescription>It may have been deleted from the register.</EmptyDescription>
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

  /** A report that's still in effect. */
  const active = !!report && !report.isReturned;
  const showForm = !active || editing;
  const stolenBlocked = reason === "Stolen" && !hasInsurance;
  // Required for a NEW report, as on the old screens. Not when updating one
  // already on file: the server never required it, so an older report may have
  // none, and it must stay editable.
  const referenceMissing = !active && referenceNo.trim() === "";

  const submit = async () => {
    setTriedSubmit(true);
    if (referenceMissing || stolenBlocked) return;
    try {
      await reportStatus.mutateAsync({ reason, referenceNo, policeReportNo, notes, sendInsuranceReport });
      toast.success(active ? `${asset.name} report updated` : `${asset.name} reported ${reason.toLowerCase()}`);
      setEditing(false);
      router.push(assetHref);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't report this asset"));
    }
  };

  const returnIt = async () => {
    try {
      await markReturned.mutateAsync();
      toast.success(`${asset.name} marked as returned`);
      setConfirmingReturn(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't mark this asset returned"));
    }
  };

  const removeReport = async () => {
    try {
      await deleteStatus.mutateAsync();
      toast.success("Report removed");
      setConfirmingRemove(false);
      setEditing(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't remove this report"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={assetHref}>
            <ArrowLeft />
            Assets
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{asset.name} — lost, damaged or stolen</h1>
          <p className="text-sm text-muted-foreground">{asset.category}</p>
        </div>
      </div>

      {/* What a report does to depreciation — the same notice the old screen led with. */}
      <div className="flex items-start gap-3 rounded-[14px] border border-warning/30 bg-warning/5 p-4">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Marking an asset as Lost/Damaged or Stolen will{" "}
          <strong className="font-semibold text-foreground">pause all active depreciation</strong> for this asset.
          Depreciation resumes automatically when it&apos;s marked Returned.
        </p>
      </div>

      {loadingReport ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {active && report && !editing ? (
            <StatusSummary
              report={report}
              onEdit={() => setEditing(true)}
              onReturn={() => setConfirmingReturn(true)}
              onRemove={() => setConfirmingRemove(true)}
            />
          ) : null}

          {report?.isReturned ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-success/30 bg-success/5 p-4">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">Returned</p>
                  <p className="text-xs text-muted-foreground">
                    Previously reported {report.reason.toLowerCase()}
                    {report.reportedDate ? ` on ${formatAssetDate(report.reportedDate)}` : ""}.
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setConfirmingRemove(true)}>
                Remove report
              </Button>
            </div>
          ) : null}

          {showForm ? (
            <>
              {!active ? (
                <div className="flex items-start gap-3 rounded-[14px] border border-primary/20 bg-primary/5 p-4">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Reporting an asset here doesn&apos;t remove it from the register — it flags it, so the register
                    still shows what you own even while something&apos;s missing. Use &ldquo;Record disposal&rdquo;
                    instead for something sold, scrapped or written off for good.
                  </p>
                </div>
              ) : null}

              <FormSection
                icon={TriangleAlert}
                title={active ? "Update report" : "Report details"}
                tourId="asset-status-report"
                description="What happened, and anything worth keeping on file about it."
              >
                <div className="space-y-4">
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">
                      Select status <span className="text-destructive">*</span>
                    </legend>
                    <RadioGroup
                      value={reason}
                      onValueChange={(value) => setReason(value as AssetStatusReason)}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      {ASSET_STATUS_REASONS.map((option) => {
                        const chosen = reason === option;
                        const disabled = option === "Stolen" && !hasInsurance;
                        return (
                          <Label
                            key={option}
                            title={disabled ? "Add insurance first to mark as Stolen" : undefined}
                            className={cn(
                              "flex items-center gap-3 rounded-[14px] border p-4 font-normal leading-normal transition-colors",
                              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                              chosen
                                ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                                : "border-border hover:border-primary/40 hover:bg-muted/40",
                            )}
                          >
                            <RadioGroupItem value={option} disabled={disabled} />
                            <span className="text-sm font-medium">{option}</span>
                            {disabled ? <span className="ml-auto text-xs text-muted-foreground">Needs insurance</span> : null}
                          </Label>
                        );
                      })}
                    </RadioGroup>
                  </fieldset>

                  {/* Insurance on file — what a claim would be made against. */}
                  {policy ? (
                    <div className="rounded-[14px] border border-success/30 bg-success/5 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <ShieldCheck className="size-4 text-success" aria-hidden />
                        Active insurance
                        {policy.insurerName ? <span className="font-normal text-muted-foreground">· {policy.insurerName}</span> : null}
                      </p>
                      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                        <span className="flex items-center gap-1.5">
                          <CircleDollarSign className="size-4 text-success" aria-hidden />
                          Coverage:{" "}
                          <strong className="font-semibold tabular">
                            {policy.coverageAmount ? assetMoney(Number(policy.coverageAmount)) : "—"}
                          </strong>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="size-4 text-success" aria-hidden />
                          Expires:{" "}
                          <strong className="font-semibold tabular">
                            {policy.endDate ? formatAssetDate(policy.endDate) : "—"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-[14px] border border-border bg-muted/30 p-4">
                      <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        No insurance on file. Add insurance to unlock the <strong className="text-foreground">Stolen</strong>{" "}
                        option and insurance reporting.{" "}
                        <Link href={`${ASSETS_ROOT}/${assetId}/insurance`} className="font-medium text-primary underline-offset-2 hover:underline">
                          Add insurance
                        </Link>
                      </p>
                    </div>
                  )}

                  <Field
                    label="Reference no."
                    htmlFor="status-reference"
                    required
                    error={triedSubmit && referenceMissing ? "Enter a reference number." : undefined}
                  >
                    <Input
                      id="status-reference"
                      value={referenceNo}
                      onChange={(event) => setReferenceNo(event.target.value)}
                      placeholder="Enter reference number"
                    />
                  </Field>

                  {reason === "Stolen" ? (
                    <div className="space-y-3 rounded-[14px] border border-border bg-muted/30 p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Contact the police</p>
                        <p className="text-sm text-muted-foreground">
                          {isAustralia ? (
                            <>
                              Stolen tools? Let&apos;s get you sorted fast. Call the Police Assistance Line{" "}
                              <span className="font-medium text-foreground">({AU_POLICE_ASSISTANCE_LINE.display})</span> and note
                              the <strong className="text-foreground">case reference number</strong>.
                            </>
                          ) : (
                            <>
                              Report the theft to your local police and note the{" "}
                              <strong className="text-foreground">case reference number</strong> — your insurer will ask for it.
                            </>
                          )}
                        </p>
                      </div>
                      {isAustralia ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={`tel:${AU_POLICE_ASSISTANCE_LINE.tel}`}>
                            <Phone />
                            Call Police ({AU_POLICE_ASSISTANCE_LINE.display})
                          </a>
                        </Button>
                      ) : null}
                      <Field label="Police report / case number" htmlFor="status-police-report">
                        <Input
                          id="status-police-report"
                          value={policeReportNo}
                          onChange={(event) => setPoliceReportNo(event.target.value)}
                          placeholder="Enter police case / report number"
                        />
                      </Field>
                    </div>
                  ) : null}

                  {policy ? (
                    <div className="space-y-3 rounded-[14px] border border-border bg-muted/30 p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Insurance report</p>
                        <p className="text-sm text-muted-foreground">
                          Email a claim report with the asset&apos;s details, its status and the insurance cover.
                        </p>
                      </div>
                      <Label className="flex cursor-pointer items-start gap-3 font-normal">
                        <Checkbox
                          checked={sendInsuranceReport}
                          onCheckedChange={(checked) => setSendInsuranceReport(checked === true)}
                          className="mt-0.5"
                        />
                        <span className="text-sm font-medium">Send the insurance report when I save</span>
                      </Label>
                      {sendInsuranceReport ? (
                        <div className="ml-7 space-y-0.5 text-xs text-muted-foreground">
                          <p>
                            Coverage value{" "}
                            <strong className="text-foreground tabular">
                              {policy.coverageAmount ? assetMoney(Number(policy.coverageAmount)) : "—"}
                            </strong>{" "}
                            and expiry{" "}
                            <strong className="text-foreground tabular">
                              {policy.endDate ? formatAssetDate(policy.endDate) : "—"}
                            </strong>{" "}
                            will be included.
                          </p>
                          <p>
                            It&apos;s emailed to the supplier on this asset
                            {asset.supplierName ? ` (${asset.supplierName})` : ""} when you save — if they have an email on
                            file.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <Field label="Additional notes" htmlFor="status-notes">
                    <Textarea
                      id="status-notes"
                      rows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Any additional details…"
                    />
                  </Field>
                </div>
              </FormSection>
            </>
          ) : null}
        </>
      )}

      {showForm && !loadingReport ? (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          {editing ? (
            <Button
              variant="outline"
              onClick={() => {
                // Throw away unsaved edits, so Edit again starts from what's on file.
                loadFromReport();
                setTriedSubmit(false);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href={assetHref}>Cancel</Link>
            </Button>
          )}
          <Button disabled={stolenBlocked || reportStatus.isPending} onClick={submit}>
            {reportStatus.isPending && <Loader2 className="size-4 animate-spin" />}
            {reportStatus.isPending ? "Saving…" : active ? "Update report" : "Submit report"}
          </Button>
        </div>
      ) : null}

      <AlertDialog open={confirmingReturn} onOpenChange={setConfirmingReturn}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {asset.name} as returned?</AlertDialogTitle>
            <AlertDialogDescription>
              The report stays on file for your records, the asset goes back to showing as normal on the register,
              and its depreciation resumes (unless it has been disposed of).
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
              This permanently removes the {report?.reason === "Stolen" ? "Stolen" : "Lost or damaged"} report for{" "}
              {asset.name}. Use this if it was reported by mistake.{" "}
              {active ? "Depreciation will resume (unless the asset has been disposed of)." : ""}
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
  onEdit,
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
  onEdit: () => void;
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
            <p className="text-sm font-semibold">Reported {report.reason.toLowerCase()}</p>
            {report.reportedDate && (
              <p className="text-xs text-muted-foreground tabular">{formatAssetDate(report.reportedDate)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0">
            Depreciation paused
          </Badge>
          <Badge variant="destructive" className="shrink-0">
            {report.reason}
          </Badge>
        </div>
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
              <dt className="text-xs text-muted-foreground">Police report no.</dt>
              <dd className="text-right tabular">{report.policeReportNo}</dd>
            </div>
          )}
          {report.notes && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">{report.notes}</p>
          )}
        </dl>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={onRemove}>
          Remove report
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil />
          Edit report
        </Button>
        <Button size="sm" onClick={onReturn}>
          <Undo2 />
          Mark as returned
        </Button>
      </div>
    </div>
  );
}
