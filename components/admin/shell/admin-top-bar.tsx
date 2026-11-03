"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * The admin header: the mobile rail trigger and the theme toggle.
 *
 * Deliberately not the product `TopBar`, which mounts the subscription query,
 * the command palette and notifications — all of them about a business, and an
 * admin session usually has none.
 */
export function AdminTopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-7">
      <SidebarTrigger className="md:hidden" />
      <p className="text-sm font-medium text-muted-foreground">
        Sole platform administration
      </p>
      <div className="flex-1" />
      <ThemeToggle />
    </header>
  );
}
