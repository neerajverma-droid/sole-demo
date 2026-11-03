"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleCheck,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { WizardStepper } from "@/components/bulk/wizard-parts";
import {
  useConnectMicrokeeperMutation,
  useDisconnectMicrokeeperMutation,
  useVerifyMicrokeeperMutation,
} from "@/hooks/use-payroll-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  MICROKEEPER_KEY_LENGTH,
  MICROKEEPER_REGISTER_URL,
  payrollDateTime,
  titleCase,
  validateMicrokeeperKey,
  type MicrokeeperConnection,
} from "@/lib/payroll";

const STEPS = ["Account", "Find your keys", "Enter keys"] as const;

const MICROKEEPER_URL = "https://microkeeper.com.au/";

/** sole-webapp's four instructions, word for word. */
const KEY_STEPS = [
  {
    title: "Open Global Settings",
    body: "In Microkeeper, go to Settings → General → Global Settings.",
  },
  {
    title: "Open Developers",
    body: "Choose Developers from the left sidebar.",
  },
  {
    title: "Copy the Business API Key",
    body: "Create or copy the 32-character Business key (mk_biz_key).",
  },
  {
    title: "Copy the Developer API Key",
    body: "Create or copy the 32-character Developer key (mk_dev_key).",
  },
] as const;

/**
 * Connects the business to Microkeeper, which runs the actual payroll.
 *
 * The same flow as sole-webapp's `MicrokeeperConnectDialog`: three steps for a
 * first connection — an account, where to find the two API keys, then the
 * keys themselves — and, once connected, a status view to verify the stored
 * keys, replace them, or disconnect. Replacing keys skips straight to the key
 * step and Back returns to the status view, as it does there.
 */
export function MicrokeeperConnectDialog({
  open,
  onOpenChange,
  connection,
  businessName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: MicrokeeperConnection;
  /** Prefills the business name for a first connection. */
  businessName: string;
}) {
  const connected = connection.connected;
  const [step, setStep] = React.useState(1);
  const [replaceKeys, setReplaceKeys] = React.useState(false);
  const [name, setName] = React.useState("");
  const [devKey, setDevKey] = React.useState("");
  const [bizKey, setBizKey] = React.useState("");
  const [showKeys, setShowKeys] = React.useState(false);
  const [errors, setErrors] = React.useState<{ devKey?: string; bizKey?: string }>({});
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);

  const connectMutation = useConnectMicrokeeperMutation();
  const verifyMutation = useVerifyMicrokeeperMutation();
  const disconnectMutation = useDisconnectMicrokeeperMutation();
  const saving = connectMutation.isPending;
  const verifying = verifyMutation.isPending;
  const disconnecting = disconnectMutation.isPending;
  const busy = saving || verifying || disconnecting;

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setReplaceKeys(false);
    setName(connection.businessName || businessName);
    setDevKey("");
    setBizKey("");
    setShowKeys(false);
    setErrors({});
  }, [open, connection.businessName, businessName]);

  const statusView = connected && !replaceKeys;
  const credentialStep = step === 3 || replaceKeys;

  const close = () => {
    if (busy) return;
    onOpenChange(false);
  };

  const connect = async () => {
    const next = {
      devKey: validateMicrokeeperKey("Dev Key", devKey) ?? undefined,
      bizKey: validateMicrokeeperKey("Biz Key", bizKey) ?? undefined,
    };
    setErrors(next);
    if (next.devKey || next.bizKey) return;

    try {
      await connectMutation.mutateAsync({
        keys: { businessName: name, devKey, bizKey },
        replace: connected,
      });
      toast.success(
        connected
          ? "Microkeeper credentials updated"
          : "Microkeeper connected successfully",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to connect to Microkeeper."));
    }
  };

  const verify = async () => {
    try {
      await verifyMutation.mutateAsync();
      toast.success("Microkeeper connection verified");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Microkeeper verification failed."));
    }
  };

  const disconnect = async () => {
    try {
      await disconnectMutation.mutateAsync();
      toast.success("Microkeeper disconnected successfully");
      setConfirmDisconnect(false);
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to disconnect Microkeeper."));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="space-y-1 border-b p-6 text-left">
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-5 text-primary" aria-hidden />
              {statusView ? "Microkeeper connection" : "Connect Microkeeper"}
            </DialogTitle>
            <DialogDescription>
              {statusView
                ? "Manage the Microkeeper connection for this business."
                : "Connect Microkeeper to sync payroll and workforce information."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            {statusView ? (
              <ConnectedView connection={connection} businessName={businessName} />
            ) : credentialStep ? (
              <>
                {!replaceKeys && <WizardStepper steps={STEPS} current={2} />}
                <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
                  <StepHeading
                    eyebrow={replaceKeys ? undefined : "Step 3 of 3"}
                    title="Enter your Microkeeper API keys"
                    description="Enter the Developer and Business keys copied in the previous step."
                  />
                  <Field label="Business name" htmlFor="mk-business-name">
                    <Input
                      id="mk-business-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Business name"
                      disabled={saving}
                    />
                  </Field>
                  <KeyField
                    id="mk-dev-key"
                    label="Dev Key"
                    placeholder="Enter your Microkeeper Dev Key"
                    value={devKey}
                    onChange={(value) => {
                      setDevKey(value);
                      setErrors((current) => ({ ...current, devKey: undefined }));
                    }}
                    visible={showKeys}
                    error={errors.devKey}
                    disabled={saving}
                    toggle={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                        onClick={() => setShowKeys((shown) => !shown)}
                        aria-label={showKeys ? "Hide API keys" : "Show API keys"}
                      >
                        {showKeys ? <EyeOff /> : <Eye />}
                      </Button>
                    }
                  />
                  <KeyField
                    id="mk-biz-key"
                    label="Biz Key"
                    placeholder="Enter your Microkeeper Biz Key"
                    value={bizKey}
                    onChange={(value) => {
                      setBizKey(value);
                      setErrors((current) => ({ ...current, bizKey: undefined }));
                    }}
                    visible={showKeys}
                    error={errors.bizKey}
                    disabled={saving}
                  />
                  <p className="flex gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    A primary Microkeeper connection will be created for the
                    currently selected Sole business. The keys are encrypted
                    before storage.
                  </p>
                </section>
              </>
            ) : step === 2 ? (
              <>
                <WizardStepper steps={STEPS} current={1} />
                <StepHeading
                  eyebrow="Step 2 of 3"
                  title="How to find your API keys"
                  description="Sign in to Microkeeper and follow these steps."
                />
                <ol className="space-y-3">
                  {KEY_STEPS.map((item, index) => (
                    <li
                      key={item.title}
                      className="flex gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular">
                        {index + 1}
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <Button variant="link" className="h-auto px-0" asChild>
                  <a href={MICROKEEPER_URL} target="_blank" rel="noopener noreferrer">
                    Open Microkeeper
                    <ArrowUpRight />
                  </a>
                </Button>
              </>
            ) : (
              <>
                <WizardStepper steps={STEPS} current={0} />
                <section className="space-y-4 rounded-lg border border-border bg-card px-6 py-8 text-center shadow-sm">
                  <span
                    className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"
                    aria-hidden
                  >
                    <Link2 className="size-7" />
                  </span>
                  <StepHeading
                    centered
                    eyebrow="Step 1 of 3"
                    title="Connect Microkeeper"
                    description="Connect Microkeeper to sync payroll and workforce information."
                  />
                  <p className="rounded-md bg-muted/50 p-4 text-left text-sm text-muted-foreground">
                    Already have a Microkeeper account? Continue to find your
                    API keys. New users can register first and return to this
                    setup.
                  </p>
                  <Button variant="link" className="h-auto px-0" asChild>
                    <a href={MICROKEEPER_REGISTER_URL} target="_blank" rel="noopener noreferrer">
                      Register with Microkeeper
                      <ArrowUpRight />
                    </a>
                  </Button>
                </section>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 border-t p-4 sm:gap-2">
            {statusView ? (
              <>
                <Button
                  variant="destructive"
                  className="sm:mr-auto"
                  disabled={busy}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  <Unlink />
                  Disconnect
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setReplaceKeys(true);
                    setStep(3);
                  }}
                >
                  Update keys
                </Button>
                <Button disabled={busy} onClick={() => void verify()}>
                  {verifying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Verify connection
                </Button>
              </>
            ) : credentialStep ? (
              <>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => (replaceKeys ? setReplaceKeys(false) : setStep(2))}
                >
                  <ArrowLeft />
                  Back
                </Button>
                <Button disabled={saving} onClick={() => void connect()}>
                  {saving ? <Loader2 className="animate-spin" /> : <Link2 />}
                  {saving ? "Connecting…" : "Connect Microkeeper"}
                </Button>
              </>
            ) : (
              <>
                {step > 1 ? (
                  <Button variant="outline" onClick={() => setStep(step - 1)}>
                    <ArrowLeft />
                    Back
                  </Button>
                ) : (
                  <Button variant="outline" onClick={close}>
                    Cancel
                  </Button>
                )}
                <Button onClick={() => setStep(step + 1)}>
                  {step === 1 ? "Get started" : "Enter API keys"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDisconnect}
        onOpenChange={(next) => !disconnecting && setConfirmDisconnect(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Microkeeper?</AlertDialogTitle>
            <AlertDialogDescription>
              Employees and pay runs stop syncing until you connect again. The
              stored keys are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={disconnecting}
              onClick={(event) => {
                event.preventDefault();
                void disconnect();
              }}
            >
              {disconnecting && <Loader2 className="animate-spin" />}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ConnectedView({
  connection,
  businessName,
}: {
  connection: MicrokeeperConnection;
  businessName: string;
}) {
  return (
    <>
      <section className="rounded-lg border border-success/30 bg-success/5 p-6 text-center">
        <CircleCheck className="mx-auto size-10 text-success" aria-hidden />
        <h3 className="mt-3 text-lg font-semibold">Connected to Microkeeper</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {connection.businessName || businessName || "Current business"}
        </p>
        <Badge
          variant={connection.status === "ERROR" ? "danger" : "success"}
          className="mt-4"
        >
          {titleCase(connection.status ?? "CONNECTED")}
        </Badge>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Tile
          icon={<RefreshCw className="size-5 text-primary" aria-hidden />}
          title="Verify credentials"
          body="Confirm the stored API keys still work with Microkeeper."
        />
        <Tile
          icon={<ShieldCheck className="size-5 text-success" aria-hidden />}
          title="Encrypted storage"
          body="Your keys are encrypted and are never displayed again."
        />
      </div>

      <dl className="divide-y rounded-md border border-border text-sm">
        <Row label="Last verified">{payrollDateTime(connection.lastVerifiedAt)}</Row>
        <Row label="Last sync">{payrollDateTime(connection.lastSyncAt)}</Row>
      </dl>
      {connection.lastError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {connection.lastError}
        </p>
      )}
    </>
  );
}

function StepHeading({
  eyebrow,
  title,
  description,
  centered,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "space-y-1.5" : "space-y-1"}>
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {eyebrow}
        </p>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      <p className={centered ? "mx-auto max-w-md text-sm text-muted-foreground" : "text-sm text-muted-foreground"}>
        {description}
      </p>
    </div>
  );
}

function Tile({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      {icon}
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function KeyField({
  id,
  label,
  placeholder,
  value,
  onChange,
  visible,
  error,
  disabled,
  toggle,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  error?: string;
  disabled?: boolean;
  /** The one show/hide control, which reveals both keys — as sole-webapp's did. */
  toggle?: React.ReactNode;
}) {
  return (
    <Field
      label={label}
      htmlFor={id}
      error={error}
      hint={`${MICROKEEPER_KEY_LENGTH} letters and numbers`}
    >
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          maxLength={MICROKEEPER_KEY_LENGTH}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={!!error}
          className={toggle ? "pr-10 font-mono" : "font-mono"}
        />
        {toggle}
      </div>
    </Field>
  );
}
