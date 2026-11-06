"use client";

import { usePathname } from "next/navigation";

export default function ServiceNotice({ message }: { message: string }) {
  const pathname = usePathname();
  // The public demo provides its own sandbox banner. Operational routes retain the service status.
  if (pathname?.replace(/\/$/, "") === "/demo/demographics") return null;
  return <div className="service-notice" role="status">{message}</div>;
}
