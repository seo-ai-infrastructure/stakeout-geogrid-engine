import assert from "node:assert/strict";
import { validateSavedProxy } from "../apps/worker/src/savedProxy.ts";
import type { ProxyCheck } from "../apps/worker/src/duoplus.ts";

async function main() {
const target = { city: "Mount Juliet", stateCode: "TN", zip: "37122", ispId: "" };
const valid: ProxyCheck = { ok: true, ip: "192.0.2.1", country: "us", region: "tennessee", city: "mount juliet", raw: {} };
let calls = 0;
const check = async (id: string) => { assert.equal(id, "saved-proxy"); calls++; return valid; };
assert.equal(await validateSavedProxy("saved-proxy", target, check), valid);
assert.equal(await validateSavedProxy("saved-proxy", target, check), valid);
assert.equal(calls, 2, "Every pin must recheck its saved exit");
for (const mismatch of [
  { ok: false }, { ip: undefined }, { country: undefined }, { country: "ca" },
  { region: "Florida" }, { region: "" }, { city: "Nashville" }, { city: "" },
]) {
  await assert.rejects(validateSavedProxy("saved-proxy", target, async () => ({ ...valid, ...mismatch })));
}
await assert.rejects(validateSavedProxy("saved-proxy", { ...target, ispId: "123" }, check), /ISP/);
await assert.rejects(validateSavedProxy("saved-proxy", { ...target, city: "" }, check), /city/);
await assert.rejects(validateSavedProxy("saved-proxy", { ...target, stateCode: "ZZ" }, check), /state/);
await assert.rejects(validateSavedProxy("saved-proxy", target, async () => { throw new Error("provider unavailable"); }), /provider unavailable/);
console.log("PASS: saved proxy checks reject unavailable, unverified, out-of-area and unverifiable ISP exits; every pin rechecks");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
