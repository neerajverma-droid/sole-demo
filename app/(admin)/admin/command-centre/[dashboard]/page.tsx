import { notFound } from "next/navigation";

import { AdminScreenPlaceholder } from "@/components/admin/shell/admin-screen-placeholder";
import {
  COMMAND_CENTRE_DASHBOARDS,
  findCommandCentreDashboard,
} from "@/lib/admin/access";

/** One route for every dashboard; a slug that isn't one is a 404, not a stub. */
export function generateStaticParams() {
  return COMMAND_CENTRE_DASHBOARDS.map((dashboard) => ({ dashboard: dashboard.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dashboard: string }>;
}) {
  const { dashboard } = await params;
  const found = findCommandCentreDashboard(dashboard);
  return { title: `${found?.label ?? "Command Centre"} · Sole Admin` };
}

export default async function AdminDashboardDetailPage({
  params,
}: {
  params: Promise<{ dashboard: string }>;
}) {
  const { dashboard } = await params;
  if (!findCommandCentreDashboard(dashboard)) notFound();
  return <AdminScreenPlaceholder navId={`cc-${dashboard}`} />;
}
