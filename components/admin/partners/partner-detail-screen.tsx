"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Handshake, Loader2, PauseCircle, PlayCircle, Rocket, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { AuthError } from "@/components/auth/auth-states";
import { PageHeader } from "@/components/layout/page-header";
import { StatusPill } from "@/components/admin/shared/status-pill";
import {
  PartnerDetailsFields,
  PartnerLinksFields,
  PartnerPlansFields,
} from "@/components/admin/partners/partner-form-fields";
import { PartnerKeysCard } from "@/components/admin/partners/partner-keys-card";
import { PartnerWebhookCard } from "@/components/admin/partners/partner-webhook-card";
import { useAdminPartnerQuery, useUpdatePartnerMutation } from "@/hooks/use-admin-partners-query";
import {
  PARTNER_STATUS_COPY,
  formFromPartner,
  partnerBody,
  partnerErrorMessage,
  partnerFieldErrors,
  partnerFormIssues,
  type PartnerDetail,
  type PartnerForm,
  type PartnerFormIssues,
  type PartnerStatus,
} from "@/lib/admin/partners";

type StatusChange = { to: PartnerStatus; title: string; description: string; confirm: string; destructive?: boolean };

const STATUS_CHANGES: Record<"golive" | "suspend" | "reactivate", StatusChange> = {
  golive: {
    to: "live",
    title: "Approve go-live?",
    description:
      "The partner can then be issued live keys and, if accountant-paid billing is on, take live payments. Check its return addresses first.",
    confirm: "Approve go-live",
  },
  suspend: {
    to: "suspended",
    title: "Suspend this partner?",
    description:
      "Every call it makes is refused straight away, with any key. Existing clients keep their accounts. You can reactivate it later.",
    confirm: "Suspend partner",
    destructive: true,
  },
  reactivate: {
    to: "sandbox",
    title: "Reactivate in sandbox?",
    description: "The partner's sandbox keys work again. Approve go-live again when it's ready for live payments.",
    confirm: "Reactivate",
  },
};

/** Super admin › Partners › one partner: status, settings and API keys. */
export function PartnerDetailScreen({ id }: { id: string }) {
  const query = useAdminPartnerQuery(id);

  if (query.isLoading) return <Shimmer className="h-96 w-full" />;
  if (query.isError || !query.data) {
    return (
      <Empty>
        <EmptyMedia>
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>Couldn&apos;t load this partner</EmptyTitle>
        <EmptyDescription>{partnerErrorMessage(query.error, "The partner wasn't found.")}</EmptyDescription>
        <EmptyActions>
          <Button variant="outline" asChild>
            <Link href="/admin/partners">Back to partners</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }
  return <PartnerDetail partner={query.data} />;
}

function PartnerDetail({ partner }: { partner: PartnerDetail }) {
  const update = useUpdatePartnerMutation(partner.id);
  const [change, setChange] = React.useState<StatusChange | null>(null);
  const pill = PARTNER_STATUS_COPY[partner.status];

  const applyStatus = () => {
    if (!change) return;
    update.mutate(
      { status: change.to },
      {
        onSuccess: () => {
          toast.success(`${partner.name} is now ${PARTNER_STATUS_COPY[change.to].label.toLowerCase()}`);
          setChange(null);
        },
        onError: (error) => toast.error(partnerErrorMessage(error, "The status couldn't be changed.")),
      },
    );
  };

  return (
    <div className="space-y-[15px]">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/admin/partners">
          <ArrowLeft />
          Partners
        </Link>
      </Button>

      <PageHeader icon={Handshake} title={partner.name} description={`/api/partner/${partner.slug}/…`}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={pill.label} tone={pill.tone} />
          {partner.status === "sandbox" && (
            <Button onClick={() => setChange(STATUS_CHANGES.golive)}>
              <Rocket />
              Approve go-live
            </Button>
          )}
          {partner.status !== "suspended" ? (
            <Button variant="outline" onClick={() => setChange(STATUS_CHANGES.suspend)}>
              <PauseCircle />
              Suspend
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setChange(STATUS_CHANGES.reactivate)}>
              <PlayCircle />
              Reactivate
            </Button>
          )}
        </div>
      </PageHeader>

      <PartnerKeysCard partner={partner} />
      <PartnerWebhookCard partnerId={partner.id} />
      <PartnerSettingsCard partner={partner} />

      <AlertDialog open={Boolean(change)} onOpenChange={(open) => !open && !update.isPending && setChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{change?.title}</AlertDialogTitle>
            <AlertDialogDescription>{change?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                applyStatus();
              }}
              disabled={update.isPending}
              className={change?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {change?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The onboarding fields, editable together. The slug stays fixed. */
function PartnerSettingsCard({ partner }: { partner: PartnerDetail }) {
  const update = useUpdatePartnerMutation(partner.id);
  const [form, setForm] = React.useState<PartnerForm>(() => formFromPartner(partner));
  const [submitted, setSubmitted] = React.useState(false);
  const [serverIssues, setServerIssues] = React.useState<PartnerFormIssues>({});
  const [error, setError] = React.useState<string | null>(null);

  // Pick up changes from elsewhere (e.g. a status change refetch) when nothing's being edited.
  const original = React.useMemo(() => formFromPartner(partner), [partner]);
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  React.useEffect(() => {
    if (!dirty) setForm(original);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original]);

  const issues: PartnerFormIssues = { ...(submitted ? partnerFormIssues(form) : {}), ...serverIssues };
  const onChange = (patch: Partial<PartnerForm>) => {
    setServerIssues({});
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const save = () => {
    setSubmitted(true);
    if (Object.keys(partnerFormIssues(form)).length > 0) return;
    update.mutate(partnerBody(form, { includeSlug: false }), {
      onSuccess: () => {
        toast.success("Partner settings saved");
        setSubmitted(false);
      },
      onError: (err) => {
        setServerIssues(partnerFieldErrors(err));
        setError(partnerErrorMessage(err, "The settings couldn't be saved."));
      },
    });
  };

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-medium">Settings</h2>
        <p className="text-sm text-muted-foreground">What the partner may sell and how it appears to clients.</p>
      </div>
      <AuthError message={error} />
      <PartnerDetailsFields form={form} issues={issues} onChange={onChange} slugLocked />
      <PartnerPlansFields form={form} issues={issues} onChange={onChange} />
      <PartnerLinksFields form={form} issues={issues} onChange={onChange} />
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={() => setForm(original)} disabled={!dirty || update.isPending}>
          Discard changes
        </Button>
        <Button onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Save settings
        </Button>
      </div>
    </Card>
  );
}
