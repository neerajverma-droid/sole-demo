"use client";

import { Check, Circle } from "lucide-react";
import { passwordRules, passwordStrength } from "@/lib/auth";
import { cn } from "@/lib/utils";


const TONES = [
  "bg-destructive",
  "bg-destructive",
  "bg-warning",
  "bg-success",
  "bg-success",
];

export function PasswordStrengthMeter({ value }: { value: string }) {
  const strength = passwordStrength(value);
  const rules = passwordRules(value);

  return (
    <div className="space-y-3 pt-1">
      <div className="space-y-1.5">
        <div className="flex gap-1" aria-hidden>
          {[0, 1, 2, 3].map((segment) => (
            <span
              key={segment}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                value && segment < strength.score
                  ? TONES[strength.score]
                  : "bg-muted",
              )}
            />
          ))}
        </div>
        {value && (
          <p className="text-xs text-muted-foreground">
            Password strength:{" "}
            <span className="font-medium text-foreground">
              {strength.label}
            </span>
          </p>
        )}
      </div>

      <ul className="space-y-1">
        {rules.map((rule) => (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-2 text-xs",
              rule.met ? "text-success" : "text-muted-foreground",
            )}
          >
            {rule.met ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className={cn(rule.met && "text-muted-foreground")}>
              {rule.label}
            </span>
            <span className="sr-only">{rule.met ? "met" : "not met yet"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
