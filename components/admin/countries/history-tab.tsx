"use client";

import * as React from "react";
import { History, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import {
  useAdminCountryAuditQuery,
  useRollbackCountryMutation,
} from "@/hooks/use-admin-countries-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatAdminDate } from "@/lib/admin/format";
import type { CountryVersion } from "@/lib/admin/countries";

const ACTION_LABELS: Record<string, string> = {
  stage: "Staged a settings change",
  discard_draft: "Discarded the draft",
  publish: "Published",
  rollback: "Rolled back",
  set_status: "Changed the status",
  create_country: "Added the country",
  add_rate: "Scheduled a rate",
  update_rate: "Edited a rate",
  delete_rate: "Removed a rate",
  end_date_rate: "Ended a rate period",
  clear_default_rate: "Moved the standard rate",
  add_threshold: "Scheduled a threshold",
  update_threshold: "Edited a threshold",
  delete_threshold: "Removed a threshold",
  end_date_threshold: "Ended a threshold period",
  backdate_override: "Back-dated a change",
};

/**
 * Every published version, and the audit trail behind them.
 *
 * Rollback restores a version's *future-dated* rows only — a period that has
 * already begun is left exactly as it was, because returns have been filed on
 * it. The confirmation says so, since "roll back" otherwise sounds like undo.
 */
export function HistoryTab({
  iso2,
  country,
  versions,
  isSuperAdmin,
}: {
  iso2: string;
  country: string;
  versions: CountryVersion[];
  isSuperAdmin: boolean;
}) {
  const audit = useAdminCountryAuditQuery(iso2);
  const [restoring, setRestoring] = React.useState<CountryVersion | null>(null);
  const current = versions[0]?.version ?? 0;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="border-b border-border pb-2 text-sm font-semibold">Published versions</h3>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">This country has never been published.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {versions.map((version) => (
              <li key={version.version} className="flex items-start justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Version {version.version}
                    {version.version === current ? (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                        current
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">{version.changeNote}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatAdminDate(version.publishedAt)}
                  </p>
                </div>
                {version.version !== current ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRestoring(version)}
                    disabled={!isSuperAdmin}
                    title={isSuperAdmin ? undefined : "Only a super admin can roll a country back."}
                  >
                    <Undo2 />
                    Restore
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 border-b border-border pb-2 text-sm font-semibold">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Audit trail
        </h3>
        {audit.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : audit.isError ? (
          <AuthError message={apiErrorMessage(audit.error, "The audit log couldn't be loaded.")} />
        ) : (audit.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {(audit.data ?? []).map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                {entry.changeNote ? (
                  <span className="text-muted-foreground">— {entry.changeNote}</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {entry.actorEmail ?? "system"} · {formatAdminDate(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RollbackDialog
        iso2={iso2}
        country={country}
        version={restoring}
        onClose={() => setRestoring(null)}
      />
    </div>
  );
}

function RollbackDialog({
  iso2,
  country,
  version,
  onClose,
}: {
  iso2: string;
  country: string;
  version: CountryVersion | null;
  onClose: () => void;
}) {
  const rollback = useRollbackCountryMutation(iso2);
  const [note, setNote] = React.useState("");
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!version) return;
    setNote(`Rolled back to version ${version.version}`);
    setServerError(null);
  }, [version]);

  return (
    <AlertDialog open={version !== null} onOpenChange={(open) => !open && !rollback.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore version {version?.version} of {country}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its settings come back, and so do any rates and thresholds it had that have not started
            yet. Periods already in effect are left alone — returns have been filed on them. The
            restore is itself a new version, so nothing is lost.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <Field label="Note" htmlFor="rollback-note" hint="Kept with the new version.">
            <Textarea
              id="rollback-note"
              rows={2}
              value={note}
              onChange={(event) => {
                setServerError(null);
                setNote(event.target.value);
              }}
            />
          </Field>
          {serverError ? <AuthError message={serverError} /> : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={rollback.isPending}>Cancel</AlertDialogCancel>
          <Button
            disabled={rollback.isPending}
            onClick={() => {
              if (!version) return;
              rollback.mutate(
                { version: version.version, changeNote: note },
                {
                  onSuccess: (result) => {
                    toast.success(`${country} restored`, {
                      description: `Now at version ${result.version}.`,
                    });
                    onClose();
                  },
                  onError: (error) =>
                    setServerError(apiErrorMessage(error, "The rollback didn't complete.")),
                },
              );
            }}
          >
            {rollback.isPending ? "Restoring…" : `Restore version ${version?.version}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
