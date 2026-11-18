import { PartnerDetailScreen } from "@/components/admin/partners/partner-detail-screen";

export const metadata = { title: "Partner · Sole Admin" };

export default async function AdminPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PartnerDetailScreen id={id} />;
}
