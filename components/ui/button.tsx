import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,transform] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90 active:scale-[0.97]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:scale-[0.97]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * The portal's button surfaces, all in app/globals.css: "Soft lit" for blue
 * buttons (`btn-soft-lit`), its outline partner for white ones
 * (`btn-soft-outline`), and the same two in red for destructive actions
 * (`btn-soft-destructive`, `btn-soft-danger`).
 *
 * Left off wherever the caller styles the button itself in some other way: a
 * gradient, a form trigger built on CONTROL_SURFACE_TRIGGER, its own
 * background, border colour or shadow keeps exactly the look it asked for
 * (restating the outline's own `bg-background` / `bg-card` doesn't count).
 * Red is the exception — a delete or void button gets the red surface rather
 * than none.
 */
const RED = /(?:^|\s)(?:[\w-]+:)*(?:text-destructive|border-destructive|bg-destructive)/
const SELF_STYLED =
  /(?:^|\s)(?:[\w-]+:)*(?:from-|shadow-|bg-(?!destructive|background\b|card\b)|border-(?!input\b|destructive))/

export function buttonSurface(
  variant: VariantProps<typeof buttonVariants>["variant"],
  className?: string
): string | undefined {
  const classes = className ?? ""
  if (SELF_STYLED.test(classes)) return undefined
  const red = RED.test(classes)
  const isDefault = variant === "default" || variant === undefined || variant === null
  if (variant === "destructive") return "btn-soft-destructive"
  if (isDefault) return red ? "btn-soft-destructive" : "btn-soft-lit"
  if (variant === "outline") return red ? "btn-soft-danger" : "btn-soft-outline"
  return undefined
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          buttonSurface(variant, className)
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
