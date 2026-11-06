import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { decodePulledFile, normalizeOutput } from "../apps/worker/src/deviceOutput.ts";

const response = { ouVAT: { success: true, content: "done\n1024\n", message: "" } };
assert.equal(normalizeOutput(response), "done\n1024\n");
assert.equal(normalizeOutput({ UXsp5: { success: true, content: "DP_OK\nUIA_OK\n" } }), "DP_OK\nUIA_OK\n");
assert.equal(normalizeOutput([{ output: "one" }, { stdout: "two" }]), "one\ntwo");
assert.equal(normalizeOutput({ message: "private provider metadata", password: "secret" }), "");
assert.throws(() => normalizeOutput({ ouVAT: { success: false, content: "", message: "private data" } }), /Device command failed/);
const file = Buffer.alloc(72_013);
for (let i = 0; i < file.length; i++) file[i] = i % 256;
const md5 = createHash("md5").update(file).digest("hex");
const chunks = [file.subarray(0, 36_000), file.subarray(36_000, 72_000), file.subarray(72_000)].map(b => b.toString("base64"));
assert.deepEqual(decodePulledFile(chunks, file.length, md5), file);
assert.throws(() => decodePulledFile(chunks.slice(0, 2), file.length, md5), /size mismatch/);
assert.throws(() => decodePulledFile([Buffer.alloc(file.length).toString("base64")], file.length, md5), /checksum mismatch/);
assert.throws(() => decodePulledFile(chunks, file.length, "invalid"), /checksum mismatch/);
console.log("PASS: device-keyed output, preserved newlines, legacy output, failed-command rejection, metadata exclusion");
