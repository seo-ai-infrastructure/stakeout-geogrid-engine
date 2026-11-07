import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkScreenDump, screenProbeCommands } from "../apps/worker/src/screenPreflight.ts";

const exec = promisify(execFile);
async function main() {
const root = await mkdtemp(join(tmpdir(), "stakeout-screen-"));
try {
  const bin = join(root, "bin");
  await mkdir(bin);
  // A slow reader must outlast a synchronous API response without being lost.
  await writeFile(join(bin, "DuoPlusDumpUI"), '#!/bin/sh\nsleep 0.3\nprintf "<hierarchy><node /></hierarchy>" > "$1"\n', { mode: 0o755 });
  await writeFile(join(bin, "uiautomator"), '#!/bin/sh\nprintf "<hierarchy><node text=\\"fallback\\" /></hierarchy>" > "$2"\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  let launches = 0;
  const run = async (_ids: string[], command: string) => {
    assert.ok(Buffer.byteLength(command) <= 1000, "Every request fits the provider command limit");
    if (command.includes("nohup")) launches++;
    const result = await exec("sh", ["-c", command.replaceAll("/data/local/tmp/rt", join(root, "rt"))], { env, timeout: 250 });
    return result.stdout;
  };
  const timing = { now: Date.now, sleep: () => new Promise<void>(r => setTimeout(r, 50)) };
  assert.match(await checkScreenDump("UXsp5", run, timing), /complete DuoPlus XML/);
  assert.equal(launches, 1);

  // A successful exit with truncated XML must invoke the second reader.
  await writeFile(join(bin, "DuoPlusDumpUI"), '#!/bin/sh\nprintf "<hierarchy><node" > "$1"\n', { mode: 0o755 });
  assert.match(await checkScreenDump("UXsp5", run, timing), /complete uiautomator XML/);

  // A lost launch acknowledgement must not duplicate the background operation.
  const before = launches;
  assert.match(await checkScreenDump("UXsp5", async (ids, command) => {
    const output = await run(ids, command);
    if (command.includes("nohup")) throw new Error("lost acknowledgement");
    return output;
  }, timing), /complete uiautomator XML/);
  assert.equal(launches - before, 1);

  await writeFile(join(bin, "uiautomator"), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.match(await checkScreenDump("UXsp5", run, timing), /^FAIL: neither/);

  let elapsed = 0;
  assert.match(await checkScreenDump("UXsp5", async () => "", {
    now: () => elapsed, sleep: async ms => { elapsed += ms; },
  }), /^FAIL: screen check did not finish/);
  assert.ok(elapsed <= 46_000, "An unreadable phone cannot hang startup");
  assert.throws(() => screenProbeCommands("bad;id"), /Invalid/);
  console.log("PASS: asynchronous screen checks, complete XML, fallback, lost acknowledgement, failure and bounded timeout");
} finally { await rm(root, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
