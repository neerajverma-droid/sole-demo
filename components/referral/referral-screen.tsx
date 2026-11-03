"use client";

import * as React from "react";
import { Gift, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import { Field } from "@/components/documents/field";
import { PageHeader } from "@/components/layout/page-header";
import {
  useReferralInvitesQuery,
  useSendReferralInviteMutation,
} from "@/hooks/use-referral-query";
import { REFERRAL_STATUS_COPY, referralEmailIssue } from "@/lib/referral";

/**
 * Refer & Earn — invite a friend to Sole, see what became of it.
 *
 * No "copy your link" box: see `lib/referral.ts`'s file doc for why — the
 * backend only ever hands out a referral code as a side effect of actually
 * emailing someone, so typing an email in is the one way this works.
 */
export function ReferralScreen() {
  const invitesQuery = useReferralInvitesQuery();
  const sendInvite = useSendReferralInviteMutation();

  const [email, setEmail] = React.useState("");
  const [edited, setEdited] = React.useState(false);

  const issue = edited ? referralEmailIssue(email) : undefined;

  const send = async () => {
    setEdited(true);
    if (referralEmailIssue(email)) return;

    try {
      await sendInvite.mutateAsync(email);
      toast.success("Invite sent", {
        description: `${email.trim()} will get an email with your link.`,
      });
      setEmail("");
      setEdited(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't send that invite.",
      );
    }
  };

  const invites = invitesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Gift}
        title="Refer & Earn $50"
        description="Invite another business owner to Sole. Once they subscribe, you're credited $50."
      />

      <Card className="p-5">
        <Field label="Invite by email" htmlFor="referral-email" error={issue}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="referral-email"
                type="email"
                value={email}
                placeholder="friend@business.com.au"
                className="pl-9"
                aria-invalid={!!issue}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setEdited(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
            </div>
            <Button
              onClick={() => void send()}
              disabled={sendInvite.isPending}
              className="sm:w-auto"
            >
              {sendInvite.isPending && (
                <Loader2 className="animate-spin" aria-hidden />
              )}
              Send invite
            </Button>
          </div>
        </Field>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Your invites
        </h2>

        {invitesQuery.isPending ? (
          <Shimmer className="h-40 w-full" />
        ) : invites.length === 0 ? (
          <Empty>
            <EmptyMedia>
              <Gift aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No invites sent yet</EmptyTitle>
            <EmptyDescription>
              Invite the first business owner above — you&apos;ll see them here
              the moment it&apos;s sent.
            </EmptyDescription>
          </Empty>
        ) : (
          <ul className="divide-y rounded-md border">
            {invites.map((invite) => {
              const status = REFERRAL_STATUS_COPY[invite.status];
              return (
                <li
                  key={invite.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {invite.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {invite.invitedOn
                        ? `Invited ${invite.invitedOn}`
                        : "Invited"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {invite.amount > 0 && (
                      <p className="text-sm font-semibold text-success tabular">
                        +${invite.amount.toFixed(2)}
                      </p>
                    )}
                    <Badge variant={status.tone}>{status.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
