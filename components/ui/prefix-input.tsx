import * as React from "react"

import { CONTROL_SURFACE } from "@/components/ui/control-surface"
import { cn } from "@/lib/utils"

type PrefixInputProps = Omit<React.ComponentProps<"input">, "prefix"> & {
  /** Shown before the value — a currency symbol such as "$", "NZ$" or "R$". */
  prefix?: React.ReactNode
  /** Shown after the value, inside the field — a spinner, a unit. */
  suffix?: React.ReactNode
  /** Classes for the bordered field itself, as opposed to the text inside it. */
  wrapperClassName?: string
}

/**
 * An input with a fixed prefix — in practice, a money field.
 *
 * The prefix sits in the flow beside the text, not over it, so the value always
 * starts after however wide the symbol is. A currency symbol is dynamic (the
 * business's own, or the document's: "$", "NZ$", "AED", "R") and no fixed
 * left-padding fits all of them — a bare "$" is ~8px, "NZ$" ~26px, and it also
 * varies with the font.
 *
 * It is the same field as `Input` — one border, one focus ring, the same
 * height — drawn around the pair. The invalid state follows `aria-invalid`, as
 * everywhere else, so a caller doesn't pass destructive border classes.
 */
const PrefixInput = React.forwardRef<HTMLInputElement, PrefixInputProps>(
  ({ prefix, suffix, className, wrapperClassName, ...props }, ref) => {
    const hasPrefix = prefix !== undefined && prefix !== null && prefix !== ""
    const inner = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => inner.current as HTMLInputElement)

    return (
      <div
        className={cn(
          "flex h-9 w-full items-center rounded-md text-base transition-colors focus-within:ring-1 focus-within:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:focus-within:ring-destructive md:text-sm",
          CONTROL_SURFACE,
          wrapperClassName
        )}
      >
        {hasPrefix ? (
          <span
            // Clicking the symbol should type into the field, as it did when the
            // symbol sat over the input and let clicks through.
            onMouseDown={(event) => {
              event.preventDefault()
              inner.current?.focus()
            }}
            className="shrink-0 select-none pl-3 pr-2 text-sm text-muted-foreground"
            aria-hidden
          >
            {prefix}
          </span>
        ) : null}
        <input
          ref={inner}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent py-1 pr-3 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
            !hasPrefix && "pl-3",
            className
          )}
          {...props}
        />
        {suffix ? <span className="shrink-0 pr-3">{suffix}</span> : null}
      </div>
    )
  }
)
PrefixInput.displayName = "PrefixInput"

export { PrefixInput }
