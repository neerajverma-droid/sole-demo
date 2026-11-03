"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { CustomerAreasCard } from "@/components/dashboard/customer-areas-card";

export default function ClickProbe() {
  const [status, setStatus] = React.useState("INIT");
  const { setTheme } = useTheme();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const theme = params.get("theme");
    if (theme) setTheme(theme);

    const start = setTimeout(() => {
      const row = document.querySelector<HTMLButtonElement>(
        'button[aria-label*="% of invoiced"]',
      );
      if (!row) {
        setStatus("NO_ROW_FOUND");
        return;
      }

      // A real gesture, not element.click() — this is what goes through
      // Radix's tooltip pointer handlers.
      const rect = row.getBoundingClientRect();
      const at = {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
      };
      row.dispatchEvent(new PointerEvent("pointerover", at));
      row.dispatchEvent(new PointerEvent("pointermove", at));
      row.dispatchEvent(new PointerEvent("pointerdown", at));
      row.dispatchEvent(new MouseEvent("mousedown", at));
      row.dispatchEvent(new PointerEvent("pointerup", at));
      row.dispatchEvent(new MouseEvent("mouseup", at));
      row.dispatchEvent(new MouseEvent("click", at));

      setTimeout(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const focused = document.activeElement;
        const inPanel = Boolean(dialog && focused && dialog.contains(focused));
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

        if (params.get("close") === "esc" && dialog) {
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
        }
        if (params.get("close") === "overlay" && dialog) {
          const overlay = dialog.previousElementSibling;
          overlay?.dispatchEvent(new PointerEvent("pointerdown", at));
          overlay?.dispatchEvent(new MouseEvent("mousedown", at));
          overlay?.dispatchEvent(new PointerEvent("pointerup", at));
          overlay?.dispatchEvent(new MouseEvent("mouseup", at));
          overlay?.dispatchEvent(new MouseEvent("click", at));
        }

        setTimeout(() => {
          const after = document.querySelector('[role="dialog"]');
          setStatus(
            [
              dialog ? "OPENED" : "DID_NOT_OPEN",
              `cursor=${getComputedStyle(row).cursor}`,
              `focus-trapped=${inPanel}`,
              `reduced-motion=${reduced}`,
              `animation=${dialog ? getComputedStyle(dialog).animationName : "n/a"}`,
              `after-${params.get("close") ?? "none"}=${after ? "still-open" : "closed"}`,
            ].join(" | "),
          );
        }, 600);
      }, 500);
    }, 400);
    return () => clearTimeout(start);
  }, []);

  return (
    <div>
      <p id="status" className="text-xs">
        {status}
      </p>
      <CustomerAreasCard />
    </div>
  );
}
