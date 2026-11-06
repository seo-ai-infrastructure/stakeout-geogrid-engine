import assert from "node:assert/strict";
import { normalizeOutput } from "../apps/worker/src/deviceOutput.ts";

const response = { ouVAT: { success: true, content: "done\n1024\n", message: "" } };
assert.equal(normalizeOutput(response), "done\n1024\n");
assert.equal(normalizeOutput({ UXsp5: { success: true, content: "DP_OK\nUIA_OK\n" } }), "DP_OK\nUIA_OK\n");
assert.equal(normalizeOutput([{ output: "one" }, { stdout: "two" }]), "one\ntwo");
assert.equal(normalizeOutput({ message: "private provider metadata", password: "secret" }), "");
assert.throws(() => normalizeOutput({ ouVAT: { success: false, content: "", message: "private data" } }), /Device command failed/);
console.log("PASS: device-keyed output, preserved newlines, legacy output, failed-command rejection, metadata exclusion");
