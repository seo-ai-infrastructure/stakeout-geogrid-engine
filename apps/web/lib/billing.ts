import { z } from "zod";

/** Sellable catalog, configured by env so prices change without a deploy of code. */
const Pack = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  credits: z.number().int().positive(),
  price: z.string().regex(/^\d+\.\d{2}$/),
  label: z.string().min(1),
  /** display name on the pricing page, e.g. "Agency" */
  name: z.string().optional(),
});
const Plan = z.object({
  planId: z.string().min(3),
  credits: z.number().int().positive(),
  price: z.string().regex(/^\d+\.\d{2}$/),
  label: z.string().min(1),
});
export type CreditPack = z.infer<typeof Pack>;
export type CreditPlan = z.infer<typeof Plan>;

function parseList<T>(raw: string | undefined, schema: z.ZodType<T>): T[] {
  if (!raw?.trim()) return [];
  try {
    return z.array(schema).parse(JSON.parse(raw));
  } catch (e) {
    console.error("billing catalog env is invalid", e);
    return [];
  }
}

export const currency = () => process.env.PAYPAL_CURRENCY ?? "USD";
export const packs = (): CreditPack[] => {
  if (process.env.PAYPAL_PACKS_JSON) return parseList(process.env.PAYPAL_PACKS_JSON, Pack);
  return [500, 750, 3000, 7500].flatMap(credits => {
    const cents = Number(process.env[`PAYPAL_PACK_${credits}_USD_CENTS`]);
    return Number.isSafeInteger(cents) && cents > 0 ? [{ id: `pack_${credits}`, credits, price: (cents / 100).toFixed(2), label: `${credits.toLocaleString("en-US")} credits`, name: `${credits.toLocaleString("en-US")} credits` }] : [];
  });
};
export const plans = () => parseList(process.env.PAYPAL_PLANS_JSON, Plan);
export const findPack = (id: string) => packs().find((p) => p.id === id);
export const findPlan = (planId: string) => plans().find((p) => p.planId === planId);

/** custom_id format on one-time orders: "<userId>:<packId>" (PayPal limit 127 chars). */
export const orderCustomId = (userId: string, packId: string) => `${userId}:${packId}`;
export function parseOrderCustomId(customId: string | undefined): { userId: string; packId: string } | null {
  if (!customId) return null;
  const i = customId.lastIndexOf(":");
  if (i <= 0) return null;
  return { userId: customId.slice(0, i), packId: customId.slice(i + 1) };
}

/** "$49" / "$149.50" (or "49.00 EUR") for display. */
export function money(amount: number | string, cur = currency()): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const s = Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur === "USD" ? `$${s}` : `${s} ${cur}`;
}

/** Price per credit, to the cent ("$0.15"). */
export const perCredit = (p: CreditPack) => money(Number(p.price) / p.credits);

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
