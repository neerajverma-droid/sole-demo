"use client";

import * as React from "react";

import { CODE_LENGTH } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * The six-box verification code, shared by email verification and 2FA.
 *
 * The code is held as one string and the boxes are a view of it, which is what
 * makes paste work: pasting into any box fills the lot rather than dropping five
 * of the six digits.
 *
 * Keyboard behaviour is the whole job here — typing advances, backspace on an
 * empty box steps back and clears the one before it, and the arrows move
 * without editing. Each box is a real input with its own label, so a screen
 * reader announces which digit it's on.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  invalid,
  disabled,
  label = "Verification code",
}: {
  /** Up to six digits. */
  value: string;
  onChange: (next: string) => void;
  /** Fired once the sixth digit lands, so the form can submit itself. */
  onComplete?: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split("");

  const focusBox = (index: number) => {
    const clamped = Math.max(0, Math.min(CODE_LENGTH - 1, index));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  };

  const commit = (next: string) => {
    onChange(next);
    if (next.length === CODE_LENGTH) onComplete?.(next);
  };

  const onBoxChange = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;

    // Typing over a box replaces from that position, so correcting a middle
    // digit doesn't shunt everything along.
    const next = (
      value.slice(0, index) +
      typed +
      value.slice(index + typed.length)
    ).slice(0, CODE_LENGTH);

    commit(next);
    focusBox(index + typed.length);
  };

  const onKeyDown = (index: number, event: React.KeyboardEvent) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        commit(value.slice(0, index) + value.slice(index + 1));
        return;
      }
      // Empty box: clear the one before and step back to it.
      if (index > 0) {
        commit(value.slice(0, index - 1) + value.slice(index));
        focusBox(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  };

  const onPaste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, CODE_LENGTH);
    if (!pasted) return;
    commit(pasted);
    focusBox(pasted.length);
  };

  return (
    <div
      className="flex gap-2 sm:gap-3"
      role="group"
      aria-label={label}
      onPaste={onPaste}
    >
      {Array.from({ length: CODE_LENGTH }).map((_, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          // `text` with a numeric inputMode: `number` brings spinners and lets
          // "e" and "-" through, neither of which belongs in a digit box.
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={CODE_LENGTH}
          value={digits[index] ?? ""}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
          aria-invalid={!!invalid}
          onChange={(event) => onBoxChange(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          className={cn(
            "h-12 w-full min-w-0 rounded-md border border-input bg-transparent text-center text-lg font-semibold tabular shadow-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid && "border-destructive focus-visible:ring-destructive",
          )}
        />
      ))}
    </div>
  );
}
