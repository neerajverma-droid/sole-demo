"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Handshake, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { PageHeader } from "@/components/layout/page-header";
import {
  PartnerDetailsFields,
  PartnerLinksFields,
  PartnerPlansFields,
} from "@/components/admin/partners/partner-form-fields";
import { SecretRevealDialog } from "@/components/admin/partners/secret-reveal-dialog";
import {
  useCreatePartnerMutation,
  useIssueKeyMutation,
} from "@/hooks/use-admin-partners-query";
import {
  DEFAULT_SCOPES,
  EMPTY_PARTNER_FORM,
  PARTNER_SCOPES,
  SOURCE_OPTIONS,
  parseReturnUrls,
  partnerErrorMessage,
  partnerFieldErrors,
  partnerFormIssues,
  type IssuedSecret,
  type Partner,
  type PartnerForm,
  type PartnerFormIssues,
  type PartnerFormStep,
} from "@/lib/admin/partners";
import { cn } from "@/lib/utils";

type Step = PartnerFormStep | "review" | "key";

const STEPS: { id: Step; label: string; description: string }[] = [
  { id: "details", label: "Details", description: "Who the partner is" },
  { id: "plans", label: "Billing & limits", description: "Who can pay, and caps" },
  { id: "links", label: "Links & branding", description: "Return addresses and emails" },
  { id: "review", label: "Review", description: "Create in sandbox" },
  { id: "key", label: "API key", description: "Issue the first credentials" },
];

/** Which step owns each field, so a server error sends the admin back to the right step. */
const FIELD_STEP: Partial<Record<keyof PartnerFormIssues, PartnerFormStep>> = {
  name: "details",
  slug: "details",
  sourcePartner: "details",
  maxSponsored: "plans",
  returnUrls: "links",
  branding: "links",
  logoUrl: "links",
  supportEmail: "links",
  website: "links",
};

/**
 * Super admin › Partners › New partner.
 *
 * A partner is created in **sandbox**: it can get sandbox keys and test against
 * Sole, but can't take live payments until someone approves go-live on its page.
 * The last step issues the first sandbox key; its secret is shown once, then the
 * flow lands on the partner's page.
 */
export function PartnerOnboarding() {
  const router = useRouter();
  const create = useCreatePartnerMutation();

  const [step, setStep] = React.useState<Step>("details");
  const [form, setForm] = React.useState<PartnerForm>(EMPTY_PARTNER_FORM);
  const [touched, setTouched] = React.useState<Partial<Record<PartnerFormStep, boolean>>>({});
  const [serverIssues, setServerIssues] = React.useState<PartnerFormIssues>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [partner, setPartner] = React.useState<Partner | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const formStep = step === "details" || step === "plans" || step === "links" ? step : undefined;
  const issues: PartnerFormIssues = {
    ...(formStep && touched[formStep] ? partnerFormIssues(form, formStep) : {}),
    ...serverIssues,
  };

  const update = (patch: Partial<PartnerForm>) => {
    setServerIssues({});
    setServerError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const next = () => {
    if (formStep) {
      setTouched((t) => ({ ...t, [formStep]: true }));
      if (Object.keys(partnerFormIssues(form, formStep)).length > 0) return;
    }
    setStep(STEPS[stepIndex + 1].id);
  };

  const back = () => setStep(STEPS[Math.max(0, stepIndex - 1)].id);

  const submit = () => {
    const all = partnerFormIssues(form);
    if (Object.keys(all).length > 0) {
      setTouched({ details: true, plans: true, links: true });
      const first = Object.keys(all)[0] as keyof PartnerFormIssues;
      setStep(FIELD_STEP[first] ?? "details");
      return;
    }
    create.mutate(form, {
      onSuccess: (created) => {
        toast.success(`${created.name} created in sandbox`);
        setPartner(created);
        setStep("key");
      },
      onError: (error) => {
        const fields = partnerFieldErrors(error);
        setServerIssues(fields);
        setServerError(partnerErrorMessage(error, "The partner couldn't be created. Try again."));
        const first = Object.keys(fields)[0] as keyof PartnerFormIssues | undefined;
        if (first && FIELD_STEP[first]) setStep(FIELD_STEP[first]!);
        else if (/slug/i.test(partnerErrorMessage(error, ""))) setStep("details");
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-[15px]">
      <PageHeader icon={Handshake} title="New partner" description="Onboard an integration partner in a few steps.">
        <Button variant="ghost" asChild>
          <Link href="/admin/partners">Cancel</Link>
        </Button>
      </PageHeader>

      <ol className="grid grid-cols-5 gap-2" aria-label="Onboarding steps">
        {STEPS.map((s, index) => {
          const done = index < stepIndex;
          const current = index === stepIndex;
          return (
            <li key={s.id} className="min-w-0" aria-current={current ? "step" : undefined}>
              <div className={cn("h-1 rounded-full", done || current ? "bg-primary" : "bg-muted")} />
              <p className={cn("mt-2 truncate text-xs font-medium", current ? "text-foreground" : "text-muted-foreground")}>
                {done ? <Check className="mr-1 inline size-3 text-primary" aria-hidden /> : null}
                {s.label}
              </p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{s.description}</p>
            </li>
          );
        })}
      </ol>

      <Card className="p-5">
        {step === "details" && <PartnerDetailsFields form={form} issues={issues} onChange={update} />}
        {step === "plans" && <PartnerPlansFields form={form} issues={issues} onChange={update} />}
        {step === "links" && <PartnerLinksFields form={form} issues={issues} onChange={update} />}
        {step === "review" && (
          <div className="space-y-4">
            <AuthError message={serverError} />
            <ReviewSummary form={form} onEdit={setStep} />
          </div>
        )}
        {step === "key" && partner && <FirstKeyStep partner={partner} onDone={() => router.push(`/admin/partners/${partner.id}`)} />}

        {step !== "key" && (
          <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
            <Button variant="ghost" onClick={back} disabled={stepIndex === 0 || create.isPending}>
              <ArrowLeft />
              Back
            </Button>
            {step === "review" ? (
              <Button onClick={submit} disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Create partner
              </Button>
            ) : (
              <Button onClick={next}>
                Continue
                <ArrowRight />
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function ReviewSummary({ form, onEdit }: { form: PartnerForm; onEdit: (step: Step) => void }) {
  const urls = parseReturnUrls(form.returnUrls);

  const rows: { step: PartnerFormStep; title: string; items: [string, string][] }[] = [
    {
      step: "details",
      title: "Details",
      items: [
        ["Name", form.name],
        ["Slug", form.slug],
        ["Type", SOURCE_OPTIONS.find((o) => o.value === form.sourcePartner)?.label ?? form.sourcePartner],
      ],
    },
    {
      step: "plans",
      title: "Billing & limits",
      items: [
        ["Accountant-paid billing", form.billingEnabled ? "On" : "Off"],
        ["Paid clients per accountant", form.maxSponsored ? form.maxSponsored : "No limit"],
      ],
    },
    {
      step: "links",
      title: "Links & branding",
      items: [
        ["Return addresses", urls.length ? urls.join(", ") : "None"],
        ["Display name", form.branding.displayName || form.name],
        ["Support email", form.branding.supportEmail || "–"],
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The partner starts in <strong className="text-foreground">sandbox</strong>: it can test with sandbox keys but
        can&apos;t take live payments until you approve go-live on its page.
      </p>
      {rows.map((row) => (
        <section key={row.step} className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h3 className="text-sm font-medium">{row.title}</h3>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onEdit(row.step)}>
              Edit
            </Button>
          </div>
          <dl className="divide-y">
            {row.items.map(([label, value]) => (
              <div key={label} className="grid grid-cols-3 gap-2 px-4 py-2 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="col-span-2 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/** Issue the first sandbox key, show its secret once, then go to the partner's page. */
function FirstKeyStep({ partner, onDone }: { partner: Partner; onDone: () => void }) {
  const issue = useIssueKeyMutation(partner.id);
  const [scopes, setScopes] = React.useState<string[]>(
    partner.billingEnabled ? [...DEFAULT_SCOPES, "billing:write", "billing:manage"] : DEFAULT_SCOPES,
  );
  const [label, setLabel] = React.useState("Sandbox");
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<IssuedSecret | null>(null);

  const toggle = (scope: string, on: boolean) =>
    setScopes((current) => (on ? [...new Set([...current, scope])] : current.filter((s) => s !== scope)));

  const onIssue = () => {
    if (scopes.length === 0) {
      setError("Choose at least one permission.");
      return;
    }
    setError(null);
    issue.mutate(
      { env: "sandbox", scopes, label },
      {
        onSuccess: setIssued,
        onError: (err) => setError(partnerErrorMessage(err, "The key couldn't be issued. Try again.")),
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 text-primary" aria-hidden />
        <div>
          <h2 className="font-medium">Issue {partner.name}&apos;s first sandbox key</h2>
          <p className="text-sm text-muted-foreground">
            The partner swaps these credentials for short-lived tokens. Choose only what it needs; you can issue more
            keys later. Live keys become available after go-live.
          </p>
        </div>
      </div>

      <AuthError message={error} />

      <Field label="Label" htmlFor="key-label" hint="So you can tell keys apart, e.g. Sandbox or Staging server.">
        <Input id="key-label" value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} className="sm:w-72" />
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Permissions</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PARTNER_SCOPES.map((scope) => {
            const id = `scope-${scope.key}`;
            const needsBilling = scope.key.startsWith("billing:");
            return (
              <label
                key={scope.key}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40",
                  needsBilling && !partner.billingEnabled && "opacity-60",
                )}
              >
                <Checkbox id={id} checked={scopes.includes(scope.key)} onCheckedChange={(value) => toggle(scope.key, value === true)} />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{scope.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {scope.description}
                    {needsBilling && !partner.billingEnabled ? " Billing is off for this partner." : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button variant="ghost" onClick={onDone} disabled={issue.isPending}>
          Skip for now
        </Button>
        <Button onClick={onIssue} disabled={issue.isPending}>
          {issue.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Issue sandbox key
        </Button>
      </div>

      <SecretRevealDialog
        issued={issued}
        title={`${partner.name}'s sandbox credentials`}
        onClose={() => {
          setIssued(null);
          onDone();
        }}
      />
    </div>
  );
}
