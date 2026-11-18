"use client";

import * as React from "react";
import { KeyRound, Loader2, MoreHorizontal, Plus, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { SecretRevealDialog } from "@/components/admin/partners/secret-reveal-dialog";
import { useIssueKeyMutation, useKeyActionMutation } from "@/hooks/use-admin-partners-query";
import { formatAdminDate } from "@/lib/admin/format";
import {
  DEFAULT_SCOPES,
  PARTNER_SCOPES,
  partnerErrorMessage,
  scopeLabel,
  type IssuedSecret,
  type KeyEnv,
  type PartnerDetail,
  type PartnerKey,
} from "@/lib/admin/partners";
import { cn } from "@/lib/utils";

const HUG = "w-px whitespace-nowrap";

type Pending = { key: PartnerKey; action: "promote" | "revoke" } | null;

/** A partner's API keys: issue, rotate (two secrets valid), promote, revoke. */
export function PartnerKeysCard({ partner }: { partner: PartnerDetail }) {
  const action = useKeyActionMutation(partner.id);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [issued, setIssued] = React.useState<{ secret: IssuedSecret; title: string } | null>(null);
  const [pending, setPending] = React.useState<Pending>(null);

  const rotate = (key: PartnerKey) =>
    action.mutate(
      { keyId: key.id, action: "rotate" },
      {
        onSuccess: (result) =>
          setIssued({ secret: result as IssuedSecret, title: `New secret for ${key.label || key.clientId}` }),
        onError: (error) => toast.error(partnerErrorMessage(error, "The key couldn't be rotated.")),
      },
    );

  const confirm = () => {
    if (!pending) return;
    action.mutate(
      { keyId: pending.key.id, action: pending.action },
      {
        onSuccess: () => {
          toast.success(pending.action === "revoke" ? "Key revoked" : "Rotation complete");
          setPending(null);
        },
        onError: (error) => toast.error(partnerErrorMessage(error, "That didn't work. Try again.")),
      },
    );
  };

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-medium">API keys</h2>
        </div>
        <Button size="sm" onClick={() => setIssueOpen(true)} disabled={partner.status === "suspended"}>
          <Plus />
          Issue key
        </Button>
      </div>

      {partner.keys.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No keys yet. Issue a sandbox key so the partner can start integrating.
        </p>
      ) : (
        <Table>
          <TableHeader className="surface-subtle">
            <TableRow>
              <TableHead className="pl-4">Key</TableHead>
              <TableHead className={HUG}>Env</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead className={HUG}>Status</TableHead>
              <TableHead className={HUG}>Last used</TableHead>
              <TableHead className={`${HUG} pr-4`}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partner.keys.map((key) => (
              <TableRow key={key.id} className={cn(key.status === "revoked" && "opacity-60")}>
                <TableCell className="pl-4">
                  <p className="text-sm font-medium">{key.label || "Untitled key"}</p>
                  <p className="font-mono text-xs text-muted-foreground">{key.clientId}</p>
                  {key.rotationPending && <p className="text-xs text-warning">New secret waiting to be promoted</p>}
                </TableCell>
                <TableCell className={HUG}>
                  <StatusPill label={key.env === "live" ? "Live" : "Sandbox"} tone={key.env === "live" ? "success" : "info"} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{key.scopes.map(scopeLabel).join(", ") || "–"}</TableCell>
                <TableCell className={HUG}>
                  <StatusPill label={key.status === "revoked" ? "Revoked" : "Active"} tone={key.status === "revoked" ? "neutral" : "success"} />
                </TableCell>
                <TableCell className={`${HUG} text-sm text-muted-foreground`}>{formatAdminDate(key.lastUsedAt)}</TableCell>
                <TableCell className={`${HUG} pr-4`}>
                  {key.status === "active" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${key.clientId}`} disabled={action.isPending}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <MenuAction icon={<RefreshCw />} label="Rotate secret" onSelect={() => rotate(key)} />
                        <MenuAction
                          icon={<ShieldCheck />}
                          label="Promote new secret"
                          onSelect={() => setPending({ key, action: "promote" })}
                          disabledReason={key.rotationPending ? undefined : "Rotate the secret first."}
                        />
                        <MenuAction icon={<ShieldOff />} label="Revoke key" destructive onSelect={() => setPending({ key, action: "revoke" })} />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <IssueKeyDialog
        partner={partner}
        open={issueOpen}
        onOpenChange={setIssueOpen}
        onIssued={(secret) => {
          setIssueOpen(false);
          setIssued({ secret, title: "New key credentials" });
        }}
      />

      <SecretRevealDialog issued={issued?.secret ?? null} title={issued?.title} onClose={() => setIssued(null)} />

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && !action.isPending && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.action === "revoke" ? "Revoke this key?" : "Promote the new secret?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "revoke"
                ? "The partner's calls with this key stop working straight away, and its tokens end. This can't be undone; issue a new key instead."
                : "The old secret stops working. Only do this once the partner confirms it's using the new one."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirm();
              }}
              disabled={action.isPending}
              className={pending?.action === "revoke" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {action.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {pending?.action === "revoke" ? "Revoke key" : "Promote"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function IssueKeyDialog({
  partner,
  open,
  onOpenChange,
  onIssued,
}: {
  partner: PartnerDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: (secret: IssuedSecret) => void;
}) {
  const issue = useIssueKeyMutation(partner.id);
  const [env, setEnv] = React.useState<KeyEnv>("sandbox");
  const [label, setLabel] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(DEFAULT_SCOPES);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setEnv("sandbox");
    setLabel("");
    setScopes(partner.billingEnabled ? [...DEFAULT_SCOPES, "billing:write", "billing:manage"] : DEFAULT_SCOPES);
    setError(null);
    issue.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    if (scopes.length === 0) return setError("Choose at least one permission.");
    issue.mutate(
      { env, scopes, label },
      {
        onSuccess: onIssued,
        onError: (err) => setError(partnerErrorMessage(err, "The key couldn't be issued.")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !issue.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Issue a key for {partner.name}</DialogTitle>
          <DialogDescription>The secret is shown once, right after this.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <AuthError message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Environment" htmlFor="key-env" hint={partner.status !== "live" ? "Live keys need go-live first." : undefined}>
              <Select value={env} onValueChange={(value) => setEnv(value as KeyEnv)}>
                <SelectTrigger id="key-env">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                  <SelectItem value="live" disabled={partner.status !== "live"}>
                    Live
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Label" htmlFor="new-key-label">
              <Input id="new-key-label" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="Production server" />
            </Field>
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">Permissions</legend>
            {PARTNER_SCOPES.map((scope) => {
              const id = `issue-scope-${scope.key}`;
              return (
                <label key={scope.key} htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-md border p-2.5 hover:bg-muted/40">
                  <Checkbox
                    id={id}
                    checked={scopes.includes(scope.key)}
                    onCheckedChange={(value) =>
                      setScopes((current) => (value === true ? [...new Set([...current, scope.key])] : current.filter((s) => s !== scope.key)))
                    }
                  />
                  <span className="text-sm">{scope.label}</span>
                </label>
              );
            })}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={issue.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={issue.isPending}>
            {issue.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Issue key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
