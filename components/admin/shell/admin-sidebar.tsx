"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, type LucideIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { NavGroupLabel } from "@/components/layout/nav-row";
import { LogoutDialog } from "@/components/layout/logout-dialog";
import { SoleLogo } from "@/components/layout/sole-logo";
import { useSession } from "@/components/auth/session-provider";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { activeAdminNavId, visibleAdminNav } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

/**
 * The admin rail.
 *
 * Built from the same shadcn sidebar and section labels as the product rail,
 * so the two read as one app — but without its pins, ordering or "More"
 * catalogue, none of which mean anything to an admin. Rows come from
 * `visibleAdminNav`, which already dropped what this admin can't open.
 */
export function AdminSidebar() {
  const pathname = usePathname() ?? "";
  const { access } = useAdminAccess();
  const { user } = useSession();
  const [logoutOpen, setLogoutOpen] = React.useState(false);

  const sections = React.useMemo(() => visibleAdminNav(access), [access]);
  const activeId = activeAdminNavId(pathname, sections);

  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Admin";

  return (
    <Sidebar>
      <SidebarHeader className="h-14 flex-row items-center gap-2 border-b px-4">
        <SoleLogo />
        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-destructive">
          Admin
        </span>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2 pb-4">
        <nav aria-label="Admin">
          {sections.map((section) => (
            <div key={section.section}>
              <NavGroupLabel>{section.section}</NavGroupLabel>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <AdminNavRow
                      label={item.label}
                      href={item.href}
                      icon={item.icon}
                      active={item.id === activeId}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {access.isSuperAdmin ? "Super admin" : "Admin"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            aria-label="Log out"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </SidebarFooter>

      <LogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </Sidebar>
  );
}

/**
 * One admin row, drawn to match `NavRow`'s active and hover states.
 *
 * Not `NavRow` itself: that row requires a pin by design ("every row has
 * one"), and admin rows have nothing to pin to.
 */
function AdminNavRow({
  label,
  href,
  icon: Icon,
  active,
}: {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-md py-2 pl-3 pr-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-indigo-50 text-primary hover:bg-indigo-100 dark:bg-primary/15 dark:hover:bg-primary/20"
          : "hover:bg-accent",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate text-sm">{label}</span>
      {active ? (
        <span
          className="absolute right-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-l-full bg-primary"
          aria-hidden
        />
      ) : null}
    </Link>
  );
}
