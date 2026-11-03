"use client";

/**
 * The frame every public "pay this invoice" screen sits in -- header badge,
 * payment-information summary, and the SolePay footer. Styled with
 * sole-webapp's own component library, but the layout (brand mark + "Secure
 * Hosted Payment" badge up top, amount front and centre, footer branding) is
 * the one spm's own `/worldpay/*` client-pay screens use -- see
 * `apps/biz-client/.../worldpay/card/page.tsx` for the reference this was
 * built from.
 */
import * as React from "react";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { SOLE_PAY_LOGO_SRC } from "@/lib/payments";

export function PayPageHeader({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-card px-6 py-5 shadow-sm">
      <Image
        src={SOLE_PAY_LOGO_SRC}
        alt="SolePay"
        width={120}
        height={32}
        unoptimized
        className="h-8 w-auto object-contain"
      />
      <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5">
        <ShieldCheck className="size-3.5 text-primary" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          {eyebrow}
        </span>
      </div>
    </div>
  );
}

export function PaymentInformationCard({
  invoiceId,
  amount,
  description,
}: {
  invoiceId: string;
  amount: number;
  description: string;
}) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="pt-6">
        <h2 className="mb-6 flex items-center gap-2 text-xl font-bold">
          <span className="h-6 w-1 rounded-full bg-primary" aria-hidden />
          Payment information
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Invoice</p>
            <p className="font-mono text-sm font-medium">{invoiceId || "-"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Description</p>
            <p className="text-sm">{description}</p>
          </div>
          <div className="md:col-span-2">
            <p className="mb-1 text-xs text-muted-foreground">Amount due</p>
            <p className="text-2xl font-bold text-primary">
              AUD ${amount.toFixed(2)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PayPageFooter() {
  return (
    <div className="rounded-2xl border bg-muted/40 p-6">
      <div className="flex flex-col items-center justify-center gap-3">
        <Image
          src={SOLE_PAY_LOGO_SRC}
          alt="SolePay"
          width={120}
          height={32}
          unoptimized
          className="h-9 w-auto object-contain"
        />
        <p className="text-[10px] tracking-wide text-muted-foreground">
          SECURE PAYMENT PROCESSING
        </p>
      </div>
    </div>
  );
}

export function PayPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">{children}</div>
    </div>
  );
}

/** One state every screen needs: the link didn't resolve to a payable invoice. */
export function PayPageProblem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <PayPageShell>
      <PayPageHeader eyebrow="SolePay" />
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="space-y-2 pt-6 text-center">
          <p className="text-lg font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
      <PayPageFooter />
    </PayPageShell>
  );
}

export function PayPageLoading() {
  return (
    <PayPageShell>
      <div className="h-[86px] animate-pulse rounded-2xl border bg-card" />
      <div className="h-[220px] animate-pulse rounded-2xl border bg-card" />
      <div className="h-[320px] animate-pulse rounded-2xl border bg-card" />
    </PayPageShell>
  );
}

export function PayPageSuccess({ amount }: { amount: number }) {
  return (
    <PayPageShell>
      <PayPageHeader eyebrow="SolePay" />
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="space-y-2 pt-6 text-center">
          <p className="text-lg font-semibold text-success">
            Payment successful
          </p>
          <p className="text-sm text-muted-foreground">
            AUD ${amount.toFixed(2)} has been paid. You can close this page.
          </p>
        </CardContent>
      </Card>
      <PayPageFooter />
    </PayPageShell>
  );
}
