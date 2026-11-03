import { AdminScreenPlaceholder } from "@/components/admin/shell/admin-screen-placeholder";

export const metadata = { title: "Tenant · Sole Admin" };

export default async function AdminTenantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminScreenPlaceholder
      navId="tenants"
      title={`Tenant #${id}`}
      description="Overview, stats, members, new users, subscriptions and branding for this tenant."
    />
  );
}
