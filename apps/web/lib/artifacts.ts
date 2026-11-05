/** Build a public URL for an R2 object key (keys are stored, domains are config). */
export function artifactUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN ?? "").replace(/\/$/, "");
  return base ? `${base}/${key}` : null;
}

export type RankBand = "top" | "mid" | "low" | "none" | "pending" | "failed";
export function rankBand(status: string, rank: number | null): RankBand {
  if (status === "FAILED") return "failed";
  if (status !== "COMPLETED") return "pending";
  if (rank == null) return "none";
  if (rank <= 3) return "top";
  if (rank <= 10) return "mid";
  return "low";
}
