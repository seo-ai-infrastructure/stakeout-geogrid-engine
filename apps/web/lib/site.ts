/** Brand and legal details shown on the landing, pricing and legal pages (set in Vercel). */
export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "GeoGrid Engine",
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || "",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "",
  jurisdiction: process.env.NEXT_PUBLIC_LEGAL_JURISDICTION || "",
  sampleReportUrl: process.env.NEXT_PUBLIC_SAMPLE_REPORT_URL || "",
  legalUpdated: "November 5, 2026",
};

/** The company as named in legal text; falls back to the brand until NEXT_PUBLIC_LEGAL_NAME is set. */
export const operator = () => site.legalName || site.name;

export const missingLegalDetails = () =>
  [
    ["NEXT_PUBLIC_LEGAL_NAME", site.legalName],
    ["NEXT_PUBLIC_SUPPORT_EMAIL", site.supportEmail],
    ["NEXT_PUBLIC_LEGAL_JURISDICTION", site.jurisdiction],
  ]
    .filter(([, v]) => !v || /your company|yourdomain|\.\.\.|example\.com/i.test(v))
    .map(([k]) => k);
