import { AuthGuard } from "@/components/auth/auth-guard";

/**
 * Full-screen work surfaces — no sidebar, no top bar. The proposal builder
 * and its preview take the whole window, as they do in sole-webapp, and
 * bring their own header with a way back. The route group keeps that
 * separation without adding a segment to the URL.
 */
export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <main className="h-dvh w-full overflow-hidden bg-background">{children}</main>
    </AuthGuard>
  );
}
