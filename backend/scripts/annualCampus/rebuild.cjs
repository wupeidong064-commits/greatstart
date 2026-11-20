// Rebuild a fresh working copy, verify against the frozen baseline and run the five browser operations.
const path = require('node:path'),
  fs = require('node:fs'),
  os = require('node:os'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const copy = process.argv[2],
  slot = process.argv[3] || '1';
assert(/^[a-z][a-z0-9]{0,15}$/.test(copy || '') && copy !== 'base', '请输入新的验收副本短名');
require('./runtime.cjs').ports(copy, slot);
assert(slot !== '0', '0 号端口留给长期业务副本');
assert(
  !fs.existsSync(path.join(os.homedir(), '.local/state/greatstart-annual-v1', copy, 'access.json')),
  '请为新一轮使用新的短名'
);
const env = { ...process.env, GREATSTART_ANNUAL_COPY: copy, GREATSTART_ANNUAL_SLOT: slot };
const run = (script, args, custom = env) =>
  execFileSync(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: 'inherit',
    env: custom,
  });
const launcher = '../startAiHistoryCampus.cjs';
run('seed.cjs', ['base']);
run(launcher, ['start'], { ...env, GREATSTART_ANNUAL_COPY: 'base' });
run('seed.cjs', [copy]);
try {
  run(launcher, ['start']);
  run('check.cjs', [copy]);
  for (let i = 1; i <= 5; i++) run('journey.cjs', [copy, String(i)]);
} finally {
  run(launcher, ['stop']);
}
