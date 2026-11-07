import assert from "node:assert/strict";
import { startupCandidates, startupCapacity } from "../apps/worker/src/startupPolicy.ts";
const now = 1_794_040_000_000;
const valid = { id: "UXsp5", status: 2, adb_status: 1, expired_at: String(now / 1000 + 3600), group: [{ name: "Stakeout Workers Basic" }] };
const choose = (rows: Record<string, unknown>[], ids = ["UXsp5"], group = "Stakeout Workers Basic", capacity = 1) => startupCandidates(rows, ids, group, capacity, now);
assert.deepEqual(choose([valid]), ["UXsp5"]);
assert.deepEqual(choose([valid], []), []);
assert.deepEqual(choose([valid], ["UXsp5"], ""), []);
assert.deepEqual(choose([valid], ["UXsp5"], "Stakeout Workers Basic", 0), []);
for (const override of [{ status: 1 }, { status: 10 }, { status: 11 }, { status: 3 }, { adb_status: 0 }, { id: "other" }, { group: [] }, { group: [{ name: "Personal" }] }, { expired_at: undefined }, { expired_at: String(now / 1000 - 1) }]) {
  assert.deepEqual(choose([{ ...valid, ...override }]), [], JSON.stringify(override));
}
assert.equal(startupCapacity([{ free_status: 1, expired_at: valid.expired_at }, { free_status: 0, expired_at: valid.expired_at }, { free_status: 1, expired_at: 1 }], now), 1);
assert.equal(startupCapacity([], now), 0);
console.log("PASS: startup restricted to allowlist, group, stopped devices, active subscriptions and available prepaid slots");
