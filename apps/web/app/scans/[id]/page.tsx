import GeoGrid from "@/components/GeoGrid";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GeoGrid scanId={id} />;
}
