// Exercises the public streaming endpoint of the dedicated seeded campus. Run with --live.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:5458';
const accessPath = path.join(os.homedir(), '.local/state/greatstart-ai-history-v1/access.json');
const output = path.resolve(__dirname, '../../docs/acceptance/2026-11-16-ai-history-campus');
async function main() {
  assert(process.argv.includes('--live'), 'Explicit --live is required for metered inference');
  const { accounts, databaseUrl } = JSON.parse(fs.readFileSync(accessPath));
  assert.equal(new URL(databaseUrl).pathname, '/buzzer_ai_history_v1');
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(accounts.manager),
  });
  const token = (await login.json()).data?.token;
  assert(token && login.ok, '校区登录失败');
  const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
  async function get(route) {
    const r = await fetch(base + route, { headers });
    assert.equal(r.status, 200);
    return (await r.json()).data;
  }
  const budget = async () => (await get('/api/ai/quota')).testBudget;
  const before = await budget();
  assert(before.remainingCny > 0 && before.limitCny === 5 && !before.blockedReason);
  const results = [];
  const at = new Date().toISOString();
  async function chat(content, expected, conversationId, requestId = randomUUID()) {
    const r = await fetch(base + '/api/ai/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, conversationId, requestId }),
      signal: AbortSignal.timeout(120000),
    });
    const raw = await r.text();
    assert.equal(r.status, 200, 'chat ' + r.status);
    const events = raw
      .split('\n')
      .filter((s) => s.startsWith('data:'))
      .map((s) => JSON.parse(s.slice(5)));
    const answer = events.map((e) => e.delta || '').join('');
    const id = events.find((e) => e.conversationId)?.conversationId;
    const passed = Object.fromEntries(
      Object.entries(expected).map(([name, check]) => [name, check(answer, events)])
    );
    const row = {
      content,
      answer,
      files: events.flatMap((e) => (e.fileCard ? [e.fileCard] : [])),
      conversationId: id,
      requestId,
      passed,
      done: events.some((e) => e.done),
      errors: events.flatMap((e) => (e.error ? [e.error] : [])),
    };
    results.push(row);
    console.log(JSON.stringify({ content, passed, done: row.done, errors: row.errors }));
    return row;
  }
  const notice = (s) => (s.match(/AI\s*建议仅供参考/g) || []).length === 1;
  const tests = {
    salary: {
      notice,
      trial: (s) => /试算/.test(s),
      action: (s) => /授课/.test(s) && /激励/.test(s),
    },
    goals: {
      notice,
      observation: (s) => s.includes('2026-10-01') && s.includes('2026-10-31'),
      target: (s) => s.includes('2026-12-01') && s.includes('2026-12-31'),
      teacher: (s) => s.includes('乔') && s.includes('温'),
      noAssessment: (s) => !/规模.*偏低|明显偏低/.test(s),
    },
    low: {
      distribution: (s) => /0%／5 条/.test(s) && /50%／3 条/.test(s),
      students: (s) => /去重学员人数：7人/.test(s),
    },
    short: {
      date: (s) => s.includes('2026-10-18') && s.includes('2026-11-16'),
      net: (s) => s.includes('960.03'),
    },
    long: {
      date: (s) => s.includes('2026-10-16') && s.includes('2026-11-16'),
      net: (s) => s.includes('2060.03'),
    },
  };
  try {
    const salary = await chat('想调整薪资结构，你有什么建议', tests.salary);
    const goals = await chat(
      '我想你可以针对老师的表现，制定下个月的目标',
      tests.goals,
      salary.conversationId
    );
    const replay = await chat(
      goals.content,
      { identical: (s) => s === goals.answer, replay: (_, ev) => ev.some((e) => e.replay) },
      goals.conversationId,
      goals.requestId
    );
    const history = await get('/api/ai/conversations/' + replay.conversationId + '/messages');
    replay.passed.refresh =
      history.messages.filter((m) => m.role === 'assistant' && m.content === goals.answer)
        .length === 1;
    const copy = await chat(
      '把刚才的建议导出Word和Excel',
      { notice, period: (s) => s.includes('2026-12-01') },
      goals.conversationId
    );
    copy.passed.bothFiles = copy.files.length === 2;
    for (const file of copy.files) {
      const r = await fetch(base + file.downloadUrl, { headers });
      assert(r.ok);
      const bytes = Buffer.from(await r.arrayBuffer());
      let body;
      if (file.fileName.endsWith('.xlsx')) {
        const book = new (require('exceljs').Workbook)();
        await book.xlsx.load(bytes);
        body = JSON.stringify(book.getWorksheet('管理建议')?.getSheetValues() || []);
      } else body = new (require('adm-zip'))(bytes).readAsText('word/document.xml');
      copy.passed[file.fileName] = notice(body) && body.includes('2026-12-01');
    }
    await chat('请把10月低出勤学员按出勤率分组，告诉我记录数和去重人数。', tests.low);
    await chat('近30天的净成单额是多少？新签、续费和退费也分别列出。', tests.short);
    await chat('2026-10-16至2026-11-16的净成单额是多少？', tests.long);
    await chat('10月有几单续费？单凭这个数能判断续费规模偏低吗？', {
      actual: (s) => /续费单(?:数)?：2单/.test(s),
      noAssessment: (s) => !/(?:续费规模|业绩)(?:明显|相对)?偏低/.test(s),
      basis: (s) => /缺|基准|未|无法/.test(s),
    });
  } finally {
    const evidence = { at, before, after: await budget(), results };
    const dest = path.join(output, 'chat-' + at.replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(dest, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
    console.log(dest);
  }
  assert(
    results.every((r) => Object.values(r.passed).every(Boolean) && r.done && !r.errors.length),
    '问答验收未通过，见原始记录'
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
