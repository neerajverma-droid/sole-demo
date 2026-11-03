"use client";

import * as React from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { cn } from "@/lib/utils";

/**
 * The password input, shared by every screen that takes one — sign in, sign up,
 * reset. One component so the show/hide toggle, the icons and the error
 * treatment can't drift between them.
 *
 * The toggle is a real button inside the field rather than a checkbox beside it,
 * and it announces its state, so the visibility of what you typed is never a
 * mystery to a screen reader.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder = "Enter your password",
  autoComplete = "current-password",
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  autoComplete?: string;
  /** Anything under the field — a strength meter, a Forgot password link. */
  children?: React.ReactNode;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          className={cn(
            "h-10 pl-9 pr-10",
            error && "border-destructive focus-visible:ring-destructive",
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {children}
    </Field>
  );
}
