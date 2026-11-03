"use client";

import { useSetAtom } from "jotai";
import { Search } from "lucide-react";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { HeaderActions } from "@/components/layout/header-actions";
import { Notifications } from "@/components/layout/notifications";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ActiveTimerControl } from "@/components/projects/active-timer-control";
import { commandOpenAtom } from "@/lib/atoms";
import { useSubscriptionQuery } from "@/hooks/use-subscription-query";

export function TopBar() {
  const setCommandOpen = useSetAtom(commandOpenAtom);
  const { isMobile } = useSidebar();
  // Mounted here so the real plan and trial countdown are in the shared
  // store before anything below the header — the trial banner, the
  // Subscription settings section — needs to read them.
  useSubscriptionQuery();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-7">
      {/*
        The dashboard tour's sidebar step on phones, where the rail is a closed
        sheet. Only tagged while it's actually showing: hidden by `md:hidden`
        it's still in the DOM, and the tour would route a desktop user here.
      */}
      <SidebarTrigger
        className="md:hidden"
        data-usertour={isMobile ? "app-sidebar-menu" : undefined}
      />

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-9 w-full max-w-[340px] items-center gap-2 rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">
          Search or type a command
        </span>
        <kbd className="hidden shrink-0 rounded border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* The running timer, from any page — drawn only while one runs. */}
      <ActiveTimerControl className="hidden md:flex" />
      <HeaderActions />
      <ThemeToggle />
      <Notifications />
      <ProfileMenu />
    </header>
  );
}
