"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          // Full strength, and stated rather than inherited so the title can't
          // drift with sonner's defaults.
          title: "group-[.toast]:data-[title]:text-foreground",
          // The subtext of a message that shows for four seconds and then leaves
          // needs to clear more than the AA floor: muted-foreground sat at
          // 4.74:1 on the light surface. Dimming the foreground instead holds
          // 7.6:1 light / 12.1:1 dark — a step below the title, still solid.
          //
          // The [data-*] selectors are load-bearing, not decoration. Sonner
          // injects its own `[data-sonner-toast][data-styled=true]
          // [data-description]{color:#3f3f3f}` into <head> at runtime, which
          // ties the plain `group-[.toast]:` rule on specificity and wins on
          // source order. Pinning the attribute sonner puts on the node outranks
          // it outright, so these colours don't depend on stylesheet ordering.
          description:
            "group-[.toast]:data-[description]:text-foreground/70 dark:group-[.toast]:data-[description]:text-foreground/80",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
