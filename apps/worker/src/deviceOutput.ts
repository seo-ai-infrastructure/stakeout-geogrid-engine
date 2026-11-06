import { createHash } from "node:crypto";

/** Reject partial/corrupt command-API transfers before storing an artifact. */
export function decodePulledFile(parts: string[], expectedBytes: number, expectedMd5: string): Buffer {
  const data = Buffer.from(parts.join(""), "base64");
  if (data.length !== expectedBytes) throw new Error("Device file transfer size mismatch");
  if (!/^[a-f0-9]{32}$/i.test(expectedMd5) || createHash("md5").update(data).digest("hex") !== expectedMd5.toLowerCase()) {
    throw new Error("Device file transfer checksum mismatch");
  }
  return data;
}

/** Normalize the provider response without serializing metadata or credentials. */
export function normalizeOutput(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(normalizeOutput).join("\n");
  const o = data as Record<string, unknown>;
  if (o.success === false) throw new Error("Device command failed");
  for (const k of ["content", "output", "result", "stdout", "data", "msg"]) {
    if (typeof o[k] === "string") return o[k] as string;
    if (Array.isArray(o[k])) return normalizeOutput(o[k]);
  }
  // Current API responses are keyed by image ID, each with success/content.
  const nested = Object.values(o).filter(v => v && typeof v === "object");
  return nested.length ? nested.map(normalizeOutput).join("\n") : "";
}

