import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminGuard } from "@/components/admin/shell/admin-guard";
import { AdminSidebar } from "@/components/admin/shell/admin-sidebar";
import { AdminTopBar } from "@/components/admin/shell/admin-top-bar";

/**
 * The admin shell.
 *
 * Its own route group rather than a section of `(app)`: nothing in the product
 * shell — trial banner, activation nudge, support chat, tours, first-run
 * survey — is about an admin, and all of it assumes a business is open.
 *
 * The guard wraps the whole shell, not just `<main>`, so the rail never draws
 * rows for an account that turns out not to be allowed them.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <SidebarProvider>
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopBar />
          {/* Bottom padding keeps a table's pager clear of the fixed scroll-to-top button. */}
          <main className="w-full flex-1 bg-muted/30 p-4 pb-24 md:p-7 md:pb-24">
            <div className="animate-rise">{children}</div>
          </main>
        </div>
      </SidebarProvider>
    </AdminGuard>
  );
}
