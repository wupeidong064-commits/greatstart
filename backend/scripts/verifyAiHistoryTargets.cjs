// No model. Repeat for both independent seed builds. Each expected row is actual, goal, difference, percent.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
const { id } = require('./aiHistoryFixture.cjs'),
  args = process.argv.slice(2);
assert(['', 'replay'].includes(args.join(' ')));
const copy = args[0],
  state = path.join(os.homedir(), '.local/state/greatstart-ai-history-v1', copy || '');
const a = JSON.parse(fs.readFileSync(path.join(state, 'access.json')));
assert.equal(new URL(a.databaseUrl).hostname, '127.0.0.1');
assert.equal(new URL(a.databaseUrl).pathname, '/buzzer_ai_history_v1' + (copy ? '_replay' : ''));
Object.assign(process.env, {
  DATABASE_URL: a.databaseUrl,
  DATABASE_DIRECT_URL: a.databaseUrl,
  AI_PROVIDER: 'mock',
  AI_LIVE_TEST_MODE: '',
  NODE_ENV: 'test',
  DOTENV_CONFIG_PATH: '/dev/null',
});
require('tsx/cjs');
const { runPlannedTools } = require('../src/services/aiTools.ts'),
  p = require('../src/config/database.ts').default;
const cases = [
  [
    'achieved-and-zero',
    'main',
    '2026-09-01',
    '2026-09-30',
    [
      [2000, 1600, 400, 125],
      [0, 0, 0, null],
    ],
  ],
  [
    'configured-partial-period',
    'main',
    '2026-09-01',
    '2026-09-15',
    [
      [1200.01, 1600, null, null],
      [0, 0, null, null],
    ],
  ],
  [
    'no-goal-despite-neighbor',
    'main',
    '2026-10-01',
    '2026-10-31',
    [
      [2100.01, null, null, null],
      [1000, null, null, null],
    ],
  ],
  [
    'below-goal-control',
    'control',
    '2026-10-01',
    '2026-10-31',
    [
      [7777.77, 8000, -222.23, 97.22],
      [0, 900, -900, 0],
    ],
  ],
];
(async () => {
  const results = {};
  for (const [label, k, startDate, endDate, want] of cases) {
    const [ev] = await runPlannedTools(
      {
        organizationId: a.organizationId,
        campusId: id(k),
        userId: id(k === 'main' ? 'manager' : 'controlManager'),
        today: '2026-11-16',
      },
      [{ name: 'monthly_target_comparison', params: { startDate, endDate } }]
    );
    assert.equal(ev.error, null);
    const rows = ev.rows.map((r) => [r.实际金额, r.目标金额, r.差额, r.目标完成率]);
    assert.deepEqual(rows, want, label);
    for (const r of ev.rows) {
      if (label === 'no-goal-despite-neighbor') assert.equal(r.目标记录, null);
      else assert.equal(r.目标记录, id('target-' + k + startDate.slice(0, 7)));
    }
    if (label === 'achieved-and-zero') assert.match(ev.rows[1].说明, /目标为零/);
    results[label] = { startDate, endDate, expected: want, observed: ev.rows };
  }
  const name = copy ? 'target-comparison-replay.json' : 'target-comparison.json';
  fs.writeFileSync(
    path.resolve(__dirname, '../../docs/acceptance/2026-11-16-ai-history-campus', name),
    JSON.stringify({ modelCalls: 0, scope: copy ? 'replay' : 'primary', cases: results }, null, 2) +
      '\n'
  );
  console.log(name, Object.keys(results).length, 'passed');
})()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
