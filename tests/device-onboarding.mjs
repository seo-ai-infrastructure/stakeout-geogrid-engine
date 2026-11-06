import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = readFileSync(new URL('../apps/worker/device/run_pin.sh', import.meta.url), 'utf8');
const helpers = script.slice(script.indexOf('splitnodes() {'), script.indexOf('# ---- step 2:'));
const dir = mkdtempSync(join(tmpdir(), 'stakeout-onboarding-'));
try {
  // Reproduce a cold launch: two empty activities, welcome page, then home.
  const scenario = `
APP=chrome
RT="$1"
N=0
dump() {
  N=$((N+1))
  case $N in
    1|2) printf '<hierarchy><node resource-id="" text="" /></hierarchy>' > "$1" ;;
    3) printf '<hierarchy><node resource-id="com.android.chrome:id/signin_fre_dismiss_button" text="Use without an account" bounds="[72,1523][1008,1667]" /></hierarchy>' > "$1" ;;
    *) printf '<hierarchy><node resource-id="com.android.chrome:id/search_box_text" text="Search or type URL" /></hierarchy>' > "$1" ;;
  esac
}
sleep() { :; }
input() { echo "input $*"; }
dismiss_fre
echo dumps=$N
`;
  const result = spawnSync('sh', ['-c', helpers + scenario, 'test', dir], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /input tap 540 1595/);
  assert.match(result.stdout, /dumps=4/);
  assert.equal((result.stdout.match(/input tap/g) ?? []).length, 1);
  const blank = spawnSync('sh', ['-c', helpers + `
APP=chrome; RT="$1"; N=0
dump() { N=$((N+1)); printf '<hierarchy />' > "$1"; }
sleep() { :; }
dismiss_fre
echo dumps=$N
`, 'test', dir], { encoding: 'utf8', timeout: 5000 });
  assert.equal(blank.status, 0, blank.stderr);
  assert.match(blank.stdout, /dumps=10/);
  console.log('device onboarding regressions passed');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
