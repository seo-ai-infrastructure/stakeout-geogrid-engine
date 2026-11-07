import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = readFileSync(new URL('../apps/worker/device/run_pin.sh', import.meta.url), 'utf8');
const prepare = script.slice(script.indexOf('# ---- step 2:'), script.indexOf('# ---- step 3:'));
const dir = mkdtempSync(join(tmpdir(), 'stakeout-session-'));
try {
const result = spawnSync('sh', ['-c', `
PKG=com.google.android.apps.maps; APP=maps; D="$1"
am() { echo "am $*" >&3; }
pm() { echo "pm $*" >&3; }
${prepare}
`, 'test', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
assert.equal(result.status, 0, result.stderr);
const events = result.output[3];
assert.match(events, /am force-stop com.google.android.apps.maps/);
assert.doesNotMatch(events, /pm clear|com.google.android.gms|com.android.chrome/);
assert.match(events, /pm grant com.google.android.apps.maps android.permission.ACCESS_FINE_LOCATION/);
assert.match(readFileSync(join(dir, 'meta.txt'), 'utf8'), /session_policy=preserve/);
console.log('PASS: selected app restarts, profile data survives, other apps are untouched');
} finally { rmSync(dir, { recursive: true, force: true }); }
