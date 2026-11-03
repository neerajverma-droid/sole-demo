import { CountryDetailScreen } from "@/components/admin/countries/country-detail-screen";

export const metadata = { title: "Country · Sole Admin" };

export default async function AdminCountryPage({
  params,
}: {
  params: Promise<{ iso2: string }>;
}) {
  const { iso2 } = await params;
  return <CountryDetailScreen iso2={iso2.toUpperCase()} />;
}
