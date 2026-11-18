"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCw, Send, ShieldAlert, Webhook } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Shimmer } from "@/components/ui/shimmer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, HUG_COLUMN } from "@/components/ui/table";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { StatusPill } from "@/components/admin/shared/status-pill";
import {
  useGenerateWebhookSecretMutation,
  usePartnerWebhookDeliveriesQuery,
  usePartnerWebhookQuery,
  useRedeliverWebhookMutation,
  useSendTestWebhookMutation,
  useUpdatePartnerWebhookMutation,
} from "@/hooks/use-admin-partner-webhook-query";
import { formatAdminDate } from "@/lib/admin/format";
import { partnerErrorMessage } from "@/lib/admin/partners";
import {
  DELIVERY_STATUS_COPY,
  WEBHOOK_EVENT_COPY,
  describeAttempt,
  formFromWebhook,
  webhookFormIssues,
  type WebhookForm,
  type WebhookSettings,
} from "@/lib/admin/partner-webhooks";

/**
 * Where Sole sends a partner's events (sign-ups, payments…), the secret they're
 * signed with, a test button and the delivery log. Everything a new partner
 * needs to receive events is set here; no code change.
 */
export function PartnerWebhookCard({ partnerId }: { partnerId: string }) {
  const query = usePartnerWebhookQuery(partnerId);

  return (
    <Card className="space-y-6 p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Webhook className="size-4" aria-hidden />
        </div>
        <div>
          <h2 className="font-medium">Webhook</h2>
          <p className="text-sm text-muted-foreground">
            Sole posts this partner&apos;s events here, signed with HMAC-SHA256 in the{" "}
            <code className="text-xs">X-Sole-Signature</code> header.
          </p>
        </div>
      </div>

      {query.isLoading ? (
        <Shimmer className="h-48 w-full" />
      ) : query.isError || !query.data ? (
        <AuthError message={partnerErrorMessage(query.error, "The webhook settings couldn't be loaded.")} />
      ) : (
        <WebhookSettingsForm partnerId={partnerId} webhook={query.data} />
      )}

      <DeliveryLog partnerId={partnerId} />
    </Card>
  );
}

function WebhookSettingsForm({ partnerId, webhook }: { partnerId: string; webhook: WebhookSettings }) {
  const update = useUpdatePartnerWebhookMutation(partnerId);
  const generate = useGenerateWebhookSecretMutation(partnerId);
  const test = useSendTestWebhookMutation(partnerId);

  const original = React.useMemo(() => formFromWebhook(webhook), [webhook]);
  const [form, setForm] = React.useState<WebhookForm>(original);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = React.useState(false);
  const [secret, setSecret] = React.useState<string | null>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  React.useEffect(() => {
    if (!dirty) setForm(original);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original]);

  const issues = submitted ? webhookFormIssues(form, webhook.hasSecret) : {};
  const onChange = (patch: Partial<WebhookForm>) => {
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const toggleEvent = (type: string, on: boolean) =>
    onChange({ events: on ? [...new Set([...form.events, type])] : form.events.filter((t) => t !== type) });

  const save = () => {
    setSubmitted(true);
    if (Object.keys(webhookFormIssues(form, webhook.hasSecret)).length > 0) return;
    update.mutate(form, {
      onSuccess: () => {
        toast.success("Webhook settings saved");
        setSubmitted(false);
      },
      onError: (err) => setError(partnerErrorMessage(err, "The webhook settings couldn't be saved.")),
    });
  };

  const makeSecret = () => {
    setConfirmRotate(false);
    generate.mutate(undefined, {
      onSuccess: (data) => setSecret(data.secret),
      onError: (err) => toast.error(partnerErrorMessage(err, "The secret couldn't be generated.")),
    });
  };

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: ({ attempt }) =>
        attempt.delivered ? toast.success(`Test event ${describeAttempt(attempt).toLowerCase()}`) : toast.error(describeAttempt(attempt)),
      onError: (err) => toast.error(partnerErrorMessage(err, "The test event couldn't be sent.")),
    });

  return (
    <div className="space-y-6">
      <AuthError message={error} />

      <Field label="Endpoint URL" htmlFor="webhook-url" hint="https only. http://localhost works while developing." error={issues.url}>
        <Input
          id="webhook-url"
          value={form.url}
          onChange={(event) => onChange({ url: event.target.value })}
          placeholder="https://partner.example.com/api/events/sole"
          inputMode="url"
          autoComplete="off"
        />
      </Field>

      <div className="space-y-3">
        <p className="text-sm font-medium">Events</p>
        <div className="flex items-center gap-2">
          <Checkbox
            id="webhook-all-events"
            checked={form.allEvents}
            onCheckedChange={(value) => onChange({ allEvents: value === true })}
          />
          <Label htmlFor="webhook-all-events" className="font-normal">
            Send every event, including ones added later
          </Label>
        </div>
        {!form.allEvents && (
          <div className="grid gap-2 sm:grid-cols-2">
            {webhook.availableEvents.map((type) => (
              <label key={type} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <Checkbox checked={form.events.includes(type)} onCheckedChange={(value) => toggleEvent(type, value === true)} />
                <span>
                  <code className="text-xs">{type}</code>
                  <span className="block text-muted-foreground">{WEBHOOK_EVENT_COPY[type] ?? ""}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {issues.events && <p className="text-sm text-destructive">{issues.events}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex items-center gap-2 text-sm">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-medium">Signing secret</span>
          <StatusPill label={webhook.hasSecret ? "Set" : "Not set"} tone={webhook.hasSecret ? "success" : "neutral"} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (webhook.hasSecret ? setConfirmRotate(true) : makeSecret())}
          disabled={generate.isPending}
        >
          {generate.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw />}
          {webhook.hasSecret ? "Rotate secret" : "Generate secret"}
        </Button>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Switch id="webhook-enabled" checked={form.enabled} onCheckedChange={(value) => onChange({ enabled: value })} />
          <Label htmlFor="webhook-enabled">Send events to this partner</Label>
        </div>
        {issues.enabled && <p className="text-sm text-destructive">{issues.enabled}</p>}
      </div>

      <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
        <Button variant="outline" onClick={sendTest} disabled={test.isPending || !webhook.url || !webhook.hasSecret || dirty}>
          {test.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send />}
          Send test event
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setForm(original)} disabled={!dirty || update.isPending}>
            Discard changes
          </Button>
          <Button onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Save webhook
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate the signing secret?</AlertDialogTitle>
            <AlertDialogDescription>
              The old secret stops working straight away. Deliveries will fail verification until the partner stores the
              new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                makeSecret();
              }}
            >
              Rotate secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WebhookSecretDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  );
}

/** The signing secret, shown once. Can't be dismissed until the admin confirms it's stored; dropped on close. */
function WebhookSecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const [stored, setStored] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setStored(false);
    setCopied(false);
  }, [secret]);

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  };

  return (
    <Dialog open={Boolean(secret)} onOpenChange={(open) => !open && stored && onClose()}>
      <DialogContent
        className="sm:max-w-lg"
        onEscapeKeyDown={(event) => !stored && event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Copy the webhook signing secret</DialogTitle>
          <DialogDescription>
            The partner uses it to check each event really came from Sole. It&apos;s shown now and never again; if it&apos;s
            lost, rotate it.
          </DialogDescription>
        </DialogHeader>
        {secret && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs">{secret}</code>
              <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy signing secret">
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
            <p className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Don&apos;t paste it into chat, email threads or tickets. Store it in the partner&apos;s secret manager.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox id="webhook-secret-stored" checked={stored} onCheckedChange={(value) => setStored(value === true)} />
              <Label htmlFor="webhook-secret-stored" className="text-sm font-normal">
                I&apos;ve stored the secret somewhere safe
              </Label>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose} disabled={!stored}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The last 25 events sent to this partner, with retries and a manual redeliver. */
function DeliveryLog({ partnerId }: { partnerId: string }) {
  const query = usePartnerWebhookDeliveriesQuery(partnerId);
  const redeliver = useRedeliverWebhookMutation(partnerId);
  const deliveries = query.data ?? [];

  const resend = (id: string) =>
    redeliver.mutate(id, {
      onSuccess: ({ attempt }) => (attempt.delivered ? toast.success(describeAttempt(attempt)) : toast.error(describeAttempt(attempt))),
      onError: (err) => toast.error(partnerErrorMessage(err, "The event couldn't be redelivered.")),
    });

  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-medium">Recent deliveries</p>
      {query.isLoading ? (
        <Shimmer className="h-24 w-full" />
      ) : deliveries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing sent yet. Use &quot;Send test event&quot; to check the endpoint.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={HUG_COLUMN}>Sent</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className={HUG_COLUMN}>Status</TableHead>
              <TableHead>Response</TableHead>
              <TableHead className={HUG_COLUMN}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => {
              const pill = DELIVERY_STATUS_COPY[delivery.status];
              const busy = redeliver.isPending && redeliver.variables === delivery.id;
              return (
                <TableRow key={delivery.id}>
                  <TableCell className={HUG_COLUMN}>{formatAdminDate(delivery.createdAt)}</TableCell>
                  <TableCell>
                    <code className="text-xs">{delivery.type}</code>
                  </TableCell>
                  <TableCell className={HUG_COLUMN}>
                    <StatusPill label={pill.label} tone={pill.tone} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {delivery.status === "delivered"
                      ? `HTTP ${delivery.lastStatusCode ?? "2xx"}`
                      : delivery.lastError ?? "Waiting for the first attempt"}
                    {delivery.attempts > 1 && ` · ${delivery.attempts} attempts`}
                  </TableCell>
                  <TableCell className={HUG_COLUMN}>
                    {delivery.status !== "pending" && (
                      <Button variant="ghost" size="sm" onClick={() => resend(delivery.id)} disabled={busy}>
                        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw />}
                        Redeliver
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
