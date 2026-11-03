"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { SOLE_PAY_LOGO_SRC } from "@/lib/payments";

const PAYMENTS_HREF = "/payments";

/**
 * Link an existing SolePay (Payrix) account by entering credentials.
 *
 * Mirrors sole-webapp's "Link your Existing SolePay Account" panel:
 * - User Name field (pre-filled with a placeholder from the API if available)
 * - Secret Key field with show/hide toggle
 * - Cancel → back to Payments
 * - Submit → POST to `/user-config/payrix/account`
 *
 * Only one linked account is supported at a time — use "Replace" to swap in
 * new credentials rather than "Link another account" (sole-webapp behaviour).
 */
export function SolePayLinkScreen() {
  const router = useRouter();

  const [username, setUsername] = React.useState("");
  const [secretKey, setSecretKey] = React.useState("");
  const [showSecret, setShowSecret] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  /* ------------------------------------------------------------------ */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      toast.error("Please enter your User Name.");
      return;
    }
    if (!secretKey.trim()) {
      toast.error("Please enter your Secret Key.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ success?: boolean; message?: string }>(
        apiRoutes.userConfig.payrixAccount,
        { username: username.trim(), secret_key: secretKey.trim() },
      );

      if (res.data?.success) {
        toast.success("SolePay account linked successfully.");
        router.push(PAYMENTS_HREF);
      } else {
        toast.error(
          res.data?.message ||
            "Could not link your SolePay account. Please check your credentials.",
        );
      }
    } catch {
      toast.error(
        "Could not link your SolePay account. Please check your credentials and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------ */

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back nav */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={PAYMENTS_HREF}>
            <ArrowLeft />
            Payments
          </Link>
        </Button>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Link your Existing SolePay Account
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your credentials to connect an existing SolePay merchant
            account to this business. This will replace any currently linked
            account.
          </p>
        </div>
      </div>

      {/* Form card */}
      <Card className="rounded-[14px]">
        <CardContent className="pt-6">
          {/* Card header — logo + title (mirrors sole-webapp's panel header) */}
          <div className="mb-6 flex items-center gap-3 pb-5 border-b border-border">
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card">
              <Image
                src={SOLE_PAY_LOGO_SRC}
                alt=""
                width={56}
                height={56}
                unoptimized
                aria-hidden
                className="size-10 object-contain"
              />
            </span>
            <div>
              <p className="text-sm font-semibold">Automated Payments</p>
              <p className="text-xs text-muted-foreground">
                Link your Existing SolePay Account
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Two-column fields — matches sole-webapp layout */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* User Name */}
              <div className="space-y-2">
                <Label htmlFor="solepay-username">
                  User Name
                  <span className="ml-0.5 text-destructive" aria-hidden>
                    *
                  </span>
                </Label>
                <Input
                  id="solepay-username"
                  type="text"
                  autoComplete="username"
                  placeholder="e.g. 90720.1731"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                  aria-required
                />
              </div>

              {/* Secret Key */}
              <div className="space-y-2">
                <Label htmlFor="solepay-secret-key">
                  Secret Key
                  <span className="ml-0.5 text-destructive" aria-hidden>
                    *
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="solepay-secret-key"
                    type={showSecret ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your secure authentication key"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    disabled={submitting}
                    aria-required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showSecret ? "Hide secret key" : "Show secret key"}
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {showSecret ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions — Cancel on the left, Submit on the right (sole-webapp order) */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => router.push(PAYMENTS_HREF)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Linking…
                  </>
                ) : (
                  <>
                    <Link2 className="size-4" aria-hidden />
                    Submit
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Forgot password note — mirrors sole-webapp */}
          <div className="mt-6 border-t border-border pt-5 text-center">
            <p className="text-sm font-medium text-foreground">
              Forgot password?
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Note: This will redirect you to SolePay password reset page
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
