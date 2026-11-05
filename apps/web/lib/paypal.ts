/**
 * Minimal PayPal REST client (Orders v2, Subscriptions v1, Webhooks v1).
 * No SDK: three endpoints and an OAuth token are all this app needs.
 * Uses relative imports only so scripts/ can reuse it outside Next.js.
 */
export const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(`PayPal ${status}: ${String(body.name ?? "")} ${String(body.message ?? "")} debug_id=${String(body.debug_id ?? "")}`.trim());
    this.name = "PayPalError";
  }
  get issue(): string | undefined {
    const d = (this.body.details as Array<{ issue?: string }> | undefined)?.[0];
    return d?.issue;
  }
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new PayPalError(res.status, json as Record<string, unknown>);
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3000) * 1000 };
  return cached.token;
}

/** body may be an object (JSON-encoded here) or an already-encoded string (used for webhook verification). */
export async function paypal<T = Record<string, unknown>>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown; requestId?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;
  const res = await fetch(`${PAYPAL_BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  if (!res.ok) throw new PayPalError(res.status, json);
  return json as T;
}

type Link = { href: string; rel: string };
export const approveLink = (links: Link[] | undefined) =>
  links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href ?? null;

/* ------------------------------------------------------------------ */
/* Shapes we read (only the fields we use)                              */
/* ------------------------------------------------------------------ */

export type Capture = {
  id: string;
  status: string; // COMPLETED | PENDING | DECLINED | ...
  custom_id?: string;
  amount?: { value: string; currency_code: string };
};

export type Order = {
  id: string;
  status: string; // CREATED | APPROVED | COMPLETED | ...
  links?: Link[];
  purchase_units?: Array<{ custom_id?: string; payments?: { captures?: Capture[] } }>;
};

export type Subscription = {
  id: string;
  status: string; // APPROVAL_PENDING | ACTIVE | SUSPENDED | CANCELLED | EXPIRED
  plan_id: string;
  custom_id?: string;
  links?: Link[];
};

/**
 * Postback verification. PayPal signs the exact bytes it sent, so the raw body is
 * spliced into the request verbatim instead of being parsed and re-serialised.
 */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not set");
  const h = (k: string) => JSON.stringify(headers.get(k) ?? "");
  const body =
    `{"auth_algo":${h("paypal-auth-algo")},"cert_url":${h("paypal-cert-url")},` +
    `"transmission_id":${h("paypal-transmission-id")},"transmission_sig":${h("paypal-transmission-sig")},` +
    `"transmission_time":${h("paypal-transmission-time")},"webhook_id":${JSON.stringify(webhookId)},` +
    `"webhook_event":${rawBody}}`;
  const res = await paypal<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", { body });
  return res.verification_status === "SUCCESS";
}
