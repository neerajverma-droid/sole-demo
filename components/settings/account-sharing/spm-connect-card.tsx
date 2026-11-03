"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Loader2, Plug, ShieldAlert } from "lucide-react";

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
import { InfoTip } from "@/components/ui/info-tip";
import {
  SkeletonActionCell,
  SkeletonBadgeCell,
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SectionCard } from "@/components/settings/section-card";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  useGenerateSpmKey,
  useRevokeSpmConnection,
  useRevokeSpmKey,
  useSpmKeysQuery,
} from "@/hooks/use-spm-connect-query";
import { formatEventDateTime } from "@/lib/datetime";
import type { SpmGeneratedKey } from "@/lib/spm-connect";

/** One row to confirm revoking — a key kills every connection it issued. */
type RevokeTarget = { type: "key" | "connection"; id: number };

/**
 * Generate a secret key, hand it to the accountant's Sole SPM portal, and they
 * connect directly — no invite flow, no permission matrix. Separate from the
 * Access Details list above because it's a different trust model: one shared
 * secret rather than a named, scoped invitation.
 */
export function SpmConnectCard() {
  const { country } = useCountryContext();
  const query = useSpmKeysQuery();
  const generate = useGenerateSpmKey();
  const revokeKey = useRevokeSpmKey();
  const revokeConnection = useRevokeSpmConnection();

  const [generatedKey, setGeneratedKey] = React.useState<SpmGeneratedKey | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<RevokeTarget | null>(null);

  const keys = query.data?.keys ?? [];
  const connections = query.data?.connections ?? [];
  const hasActiveKey = keys.some((key) => key.status === "active");

  const handleGenerate = async () => {
    const result = await generate.mutateAsync();
    setGeneratedKey(result);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    if (revokeTarget.type === "key") {
      await revokeKey.mutateAsync(revokeTarget.id);
    } else {
      await revokeConnection.mutateAsync(revokeTarget.id);
    }
    setRevokeTarget(null);
  };

  const revoking = revokeKey.isPending || revokeConnection.isPending;

  return (
    <SectionCard
      title="Connect to external accountants via Sole SPM"
      description="Generate a secret key and share it with your accountant's Sole SPM portal. They connect directly — revoke a key or an individual connection any time and access stops immediately."
      action={
        <Button
          size="sm"
          disabled={generate.isPending}
          onClick={() => void handleGenerate()}
        >
          {generate.isPending && <Loader2 className="animate-spin" aria-hidden />}
          <KeyRound />
          {generate.isPending
            ? "Generating…"
            : hasActiveKey
              ? "Regenerate key"
              : "Connect"}
        </Button>
      }
    >
      {hasActiveKey && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Regenerating replaces your current active key — the old key stops
          working right away.
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            <TableHead className={HUG_COLUMN}>Status</TableHead>
            <TableHead className={HUG_COLUMN}>Last used</TableHead>
            <TableHead className={HUG_COLUMN}>Expires</TableHead>
            <TableHead className={HUG_COLUMN}>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isPending ? (
            <SkeletonRows
              count={2}
              render={() => (
                <>
                  <SkeletonTextCell width="w-40" />
                  <SkeletonBadgeCell />
                  <SkeletonTextCell width="w-24" />
                  <SkeletonTextCell width="w-16" />
                  <SkeletonActionCell />
                </>
              )}
            />
          ) : keys.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No SPM keys yet. Generate one to connect your accountant.
              </TableCell>
            </TableRow>
          ) : (
            keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell>
                  <p className="font-mono text-sm">{key.keyMasked}</p>
                  {key.name && (
                    <p className="text-xs text-muted-foreground">{key.name}</p>
                  )}
                </TableCell>
                <TableCell className={HUG_COLUMN}>
                  <Badge variant={key.status === "active" ? "success" : "danger"}>
                    {key.status === "active" ? "Active" : "Revoked"}
                  </Badge>
                </TableCell>
                <TableCell className={HUG_COLUMN}>
                  {formatEventDateTime(key.lastUsedAt, {
                    timeZone: country.timezone,
                    style: "compact",
                    fallback: "N/A",
                  })}
                </TableCell>
                <TableCell className={HUG_COLUMN}>
                  {key.expiresAt
                    ? formatEventDateTime(key.expiresAt, {
                        timeZone: country.timezone,
                        style: "compact",
                      })
                    : "Never"}
                </TableCell>
                <TableCell className={HUG_COLUMN}>
                  {key.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRevokeTarget({ type: "key", id: key.id })}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {connections.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Plug className="size-3.5 text-muted-foreground" aria-hidden />
            Active SPM connections
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Accountant</TableHead>
                <TableHead className={HUG_COLUMN}>Connected</TableHead>
                <TableHead className={HUG_COLUMN}>Last access</TableHead>
                <TableHead className={HUG_COLUMN}>IP</TableHead>
                <TableHead className={HUG_COLUMN}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell>
                    <p className="text-sm">
                      {connection.spmName || connection.spmEmail || "Sole SPM"}
                    </p>
                    {connection.spmEmail && connection.spmName && (
                      <p className="text-xs text-muted-foreground">
                        {connection.spmEmail}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className={HUG_COLUMN}>
                    {formatEventDateTime(connection.connectedAt, {
                      timeZone: country.timezone,
                      style: "compact",
                    })}
                  </TableCell>
                  <TableCell className={HUG_COLUMN}>
                    {formatEventDateTime(connection.lastAccessAt, {
                      timeZone: country.timezone,
                      style: "compact",
                    })}
                  </TableCell>
                  <TableCell className={HUG_COLUMN}>
                    {connection.ipAddress || "N/A"}
                  </TableCell>
                  <TableCell className={HUG_COLUMN}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setRevokeTarget({ type: "connection", id: connection.id })
                      }
                    >
                      Disconnect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <GeneratedKeyDialog
        generatedKey={generatedKey}
        onClose={() => setGeneratedKey(null)}
      />

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revokeTarget?.type === "key" ? "Revoke SPM key?" : "Revoke SPM connection?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.type === "key"
                ? "This key will stop working immediately and any accountant connected with it will lose access."
                : "This connection will be disconnected immediately and its access token invalidated."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revoking}
              onClick={(event) => {
                event.preventDefault();
                void confirmRevoke();
              }}
            >
              {revoking && <Loader2 className="animate-spin" aria-hidden />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

function GeneratedKeyDialog({
  generatedKey,
  onClose,
}: {
  generatedKey: SpmGeneratedKey | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (generatedKey) setCopied(false);
  }, [generatedKey]);

  const copy = async () => {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey.secretKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API may be blocked — the key is still selectable by hand.
    }
  };

  return (
    <Dialog open={generatedKey !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            Your SPM secret key
            <InfoTip text="Share this only with your accountant's Sole SPM portal. They use it to connect directly to your Sole account." />
          </DialogTitle>
          <DialogDescription className="text-destructive">
            Copy this key now — for your security it will not be shown again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-stretch gap-2">
          <code className="flex-1 break-all rounded-md border bg-muted/40 px-3 py-3 font-mono text-sm">
            {generatedKey?.secretKey}
          </code>
          <Button type="button" onClick={() => void copy()} className="shrink-0">
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        {generatedKey?.expiresAt && (
          <p className="text-xs text-muted-foreground">
            Expires: {new Date(generatedKey.expiresAt).toLocaleString()}
          </p>
        )}

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
