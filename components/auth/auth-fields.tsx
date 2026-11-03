"use client";

import { Mail } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { emailError } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** The address field both /login and /register open with. */
export function EmailField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <Field label="Email" htmlFor="email" error={error}>
      <div className="relative">
        <Mail
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="you@business.com.au"
          aria-invalid={!!error}
          className={cn(
            "h-10 pl-9",
            error && "border-destructive focus-visible:ring-destructive",
          )}
        />
      </div>
    </Field>
  );
}

/** The "or" rule between the email form and the social buttons. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        or
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

/** A secondary action written as a text link under the main button. */
export const TEXT_ACTION_CLASS =
  "rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline";

/** A malformed address, or none at all. */
export function requiredEmailIssue(value: string): string | undefined {
  return (
    emailError(value) ??
    (value.trim() ? undefined : "Enter your email address.")
  );
}
