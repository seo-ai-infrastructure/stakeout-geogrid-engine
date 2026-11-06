import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import GeoGrid from "@/components/GeoGrid";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await requireUser()) redirect("/sign-in");
  const { id } = await params;
  return <GeoGrid scanId={id} />;
}
