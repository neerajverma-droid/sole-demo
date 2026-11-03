"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuthError, useResendCooldown } from "@/components/auth/auth-states";
import { TEXT_ACTION_CLASS } from "@/components/auth/auth-fields";
import { CodeInput } from "@/components/auth/code-input";
import { authErrorAtom, authPendingAtom } from "@/lib/atoms";
import type { AuthUser } from "@/lib/api/types";
import {
  CODE_LENGTH,
  maskEmail,
  requestOtp,
  verifyOtp,
  type RequestOtpParams,
} from "@/lib/auth";

/**
 * Sending and re-sending an emailed code, for a screen that offers one.
 *
 * `request` is the call that opened the code step — resending repeats it
 * exactly, sign-up extras and all — and is null while the screen is still on
 * its own form.
 */
export function useEmailCode() {
  const cooldown = useResendCooldown();
  const [request, setRequest] = React.useState<RequestOtpParams | null>(null);
  /** Set when a code was already in the inbox, so the step isn't a dead end. */
  const [notice, setNotice] = React.useState("");
  /** Announced rather than shown: nothing visible changes when a code goes out. */
  const [statusLine, setStatusLine] = React.useState("");

  /**
   * Send a code and open the code step. Resolves to the error to show on the
   * form that asked, or null once the step is open.
   */
  const send = async (
    params: RequestOtpParams,
    resending = false,
  ): Promise<string | null> => {
    const result = await requestOtp(params);

    if (!result.ok) {
      if (!result.retryAfter) return result.message;
      // A cooldown is not a dead end: it only ever fires because a code was
      // JUST sent to this address, so the thing they need is already in their
      // inbox. Open the code step with the remaining seconds as the countdown
      // rather than asking them to wait for what they already have.
      setNotice("We already sent you a code — check your inbox.");
      cooldown.start(result.retryAfter);
    } else {
      setNotice("");
      cooldown.start(result.resendAfter);
      setStatusLine(
        `${resending ? "A new code is on its way to" : "We sent a code to"} ${maskEmail(params.email)}.`,
      );
    }

    setRequest(params);
    return null;
  };

  const close = () => {
    setRequest(null);
    setNotice("");
    setStatusLine("");
  };

  return { request, notice, statusLine, cooldown, send, close };
}

export type EmailCode = ReturnType<typeof useEmailCode>;

/**
 * The six digits, once `useEmailCode` has sent them. The same step for signing
 * in and signing up — the backend already knows which one the code is for.
 */
export function EmailCodeStep({
  code,
  submitLabel,
  onVerified,
  onChangeEmail,
  children,
}: {
  code: EmailCode;
  submitLabel: string;
  /** A session now exists. Expected to navigate away. */
  onVerified: (user: AuthUser | null) => Promise<void>;
  onChangeEmail: () => void;
  /** Any other way out, under the resend row. */
  children?: React.ReactNode;
}) {
  const [pending, setPending] = useAtom(authPendingAtom);
  const [error, setError] = useAtom(authErrorAtom);
  const [value, setValue] = React.useState("");
  const { request, cooldown } = code;

  const verify = async (digits: string) => {
    if (!request || digits.length < CODE_LENGTH || pending) return;
    setPending(true);
    setError(null);

    const result = await verifyOtp(request.email, digits);
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      // Clearing starts the next attempt at the first box rather than making
      // someone delete six digits by hand.
      setValue("");
      return;
    }

    // Left pending on purpose: the redirect is in flight, and dropping the
    // spinner would flash the form back on the way out.
    await onVerified(result.user);
  };

  const resend = async () => {
    if (!request || cooldown.cooling || pending) return;
    setPending(true);
    setError(null);
    const message = await code.send(request, true);
    if (message) setError(message);
    setPending(false);
  };

  if (!request) return null;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void verify(value);
      }}
    >
      <AuthError message={error} />

      <div className="space-y-2">
        <CodeInput
          value={value}
          onChange={(next) => {
            setValue(next);
            if (error) setError(null);
          }}
          // Six digits is the whole form — waiting for a click would be asking
          // for a step the person has already finished.
          onComplete={(next) => void verify(next)}
          invalid={!!error}
          disabled={pending}
          label="Six-digit code"
        />
        <p className="text-sm text-muted-foreground">
          {code.notice || (
            <>
              We sent a code to{" "}
              <span className="font-medium text-foreground">
                {maskEmail(request.email)}
              </span>
            </>
          )}
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-10 w-full"
        disabled={pending || value.length < CODE_LENGTH}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Verifying…" : submitLabel}
      </Button>

      <div className="flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={onChangeEmail}
          disabled={pending}
          className={TEXT_ACTION_CLASS}
        >
          Change email
        </button>
        <button
          type="button"
          onClick={() => void resend()}
          disabled={cooldown.cooling || pending}
          className={TEXT_ACTION_CLASS}
        >
          {cooldown.cooling
            ? `Resend code in ${cooldown.seconds}s`
            : "Resend code"}
        </button>
      </div>

      {children}
    </form>
  );
}
