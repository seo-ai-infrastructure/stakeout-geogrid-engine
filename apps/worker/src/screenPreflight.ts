import { randomUUID } from "node:crypto";

type RunCommand = (imageIds: string[], command: string) => Promise<string>;
type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };
const clock: Clock = { now: Date.now, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) };

/** Dumps can exceed the provider's 10-second synchronous command budget. */
export function screenProbeCommands(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid screen probe ID");
  const base = `/data/local/tmp/rt/screen-${id}`;
  const script = `command -v timeout >/dev/null || { echo NO_TIMEOUT > ${base}.status; exit 1; }; ` +
    `for tool in DuoPlusDumpUI uiautomator; do rm -f ${base}.xml; ` +
    `if [ "$tool" = uiautomator ]; then timeout 15 uiautomator dump ${base}.xml; ` +
    `else timeout 15 DuoPlusDumpUI ${base}.xml; fi; ` +
    `[ -s ${base}.xml ] && grep -q "<hierarchy" ${base}.xml && grep -q "</hierarchy>" ${base}.xml ` +
    `&& { echo "$tool" > ${base}.status; exit 0; }; done; echo FAIL > ${base}.status`;
  return {
    launch: `mkdir -p /data/local/tmp/rt; nohup sh -c '${script}' > ${base}.log 2>&1 < /dev/null &`,
    poll: `cat ${base}.status 2>/dev/null`,
    cleanup: `rm -f ${base}.xml ${base}.status ${base}.log`,
  };
}

export async function checkScreenDump(imageId: string, run: RunCommand, timing: Clock = clock): Promise<string> {
  const commands = screenProbeCommands(randomUUID().slice(0, 8));
  const deadline = timing.now() + 45_000;
  // A lost acknowledgement does not mean the background probe failed to launch.
  // Poll its unique status file; never launch a second probe on a timeout.
  await run([imageId], commands.launch).catch(() => {});
  let finished = false;
  try {
    while (timing.now() < deadline) {
      await timing.sleep(2000);
      let status = "";
      try { status = (await run([imageId], commands.poll)).trim(); } catch { continue; }
      if (!status) continue;
      finished = true;
      if (status === "DuoPlusDumpUI") return "PASS (complete DuoPlus XML)";
      if (status === "uiautomator") return "PASS (complete uiautomator XML)";
      if (status === "NO_TIMEOUT") return "FAIL: timeout tool is required for bounded screen checks";
      return "FAIL: neither screen reader produced complete XML";
    }
    return "FAIL: screen check did not finish within 45 seconds";
  } finally {
    if (finished) await run([imageId], commands.cleanup).catch(() => {});
  }
}
