// Explicitly use --generate for the authorized one-shot run. --verify reads existing reports only.
// Request IDs and the fixture database are fixed; no retries under a new identity.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const F = require('./aiHistoryFixture.cjs');
const state = path.join(os.homedir(), '.local/state/greatstart-ai-history-v1');
const a = JSON.parse(fs.readFileSync(path.join(state, 'access.json')));
const output = path.resolve(
  __dirname,
  '../../docs/acceptance/2026-11-16-ai-history-campus/structured-reports'
);
const ledger = () =>
  JSON.parse(fs.readFileSync(path.join(state, 'live/budget/supplier-budget.private.json'))).calls;
const base = 'http://127.0.0.1:5458';
const setup = {
  daily: ['2026-09-30', '2026-09-30', '请生成2026-09-30的运营日报，提供网页、Word和Excel。'],
  weekly: [
    '2026-10-12',
    '2026-10-18',
    '请生成2026-10-12至2026-10-18的运营周报，提供网页、Word和Excel。',
  ],
  monthly: [
    '2026-10-01',
    '2026-10-31',
    '请生成2026-10-01至2026-10-31的运营月报，提供网页、Word和Excel。',
  ],
};
const args = process.argv.slice(2);
assert(
  args.length <= 2 &&
    ['--generate', '--verify', '--repair', '--verify-repair'].includes(args[0]) &&
    (!args[1] || Object.hasOwn(setup, args[1])),
  'Use --generate|--verify [daily|weekly|monthly]'
);
const repair = ['--repair', '--verify-repair'].includes(args[0]);
const generate = ['--generate', '--repair'].includes(args[0]);
let cacheServer;
const store = (file, record) => fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
const parseEvents = (raw) =>
  raw
    .split('\n')
    .filter((s) => s.startsWith('data:'))
    .map((s) => JSON.parse(s.slice(5)));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
async function run(kind, headers) {
  const [start, end, question] = setup[kind],
    dir = repair ? path.join(output, 'corrected', kind) : path.join(output, kind),
    requestId = F.id((repair ? 'structured-cached-actions-v1-' : 'structured-official-v1-') + kind);
  fs.mkdirSync(dir, { recursive: true });
  const frozen = F.expected(start, end),
    journal = path.join(dir, 'request.json'),
    dispatchFile = path.join(dir, 'delivery.json');
  if (!fs.existsSync(journal)) {
    assert(generate, 'No stored run available');
    const expected = { ...frozen, start, end };
    store(path.join(dir, 'expected.json'), expected);
    store(journal, {
      requestId,
      question,
      start,
      end,
      preLedgerCalls: ledger().length,
      beganAt: new Date().toISOString(),
    });
  }
  let delivery;
  if (fs.existsSync(dispatchFile)) delivery = JSON.parse(fs.readFileSync(dispatchFile));
  else {
    assert(
      generate,
      'Missing original SSE delivery. Use --generate with the same request ID for an idempotent readback.'
    );
    const res = await fetch((repair ? 'http://127.0.0.1:4369' : base) + '/api/ai/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: question, requestId }),
      signal: AbortSignal.timeout(150000),
    });
    const raw = await res.text();
    fs.writeFileSync(path.join(state, 'live', kind + '-structured-sse.private'), raw, {
      mode: 0o600,
    });
    assert.equal(res.status, 200);
    const events = parseEvents(raw),
      cards = events.filter((e) => e.fileCard).map((e) => e.fileCard);
    delivery = {
      reportId: cards[0]?.fileId.replace(/-(html|xlsx|docx)$/, ''),
      conversationId: events.find((e) => e.conversationId)?.conversationId,
      answer: events.map((e) => e.delta || '').join(''),
      cards,
      done: events.some((e) => e.done),
      replay: events.some((e) => e.replay),
    };
    store(dispatchFile, delivery);
  }
  assert.equal(delivery.cards.length, 3, delivery.answer);
  const get = async (route) => {
    assert(route.startsWith('/api/ai/'));
    const res = await fetch(base + route, { headers });
    assert.equal(res.status, 200, route);
    return res;
  };
  const report = (await (await get('/api/ai/pilot-reports/' + delivery.reportId)).json()).data;
  const n = report.content.narrative,
    f = report.content.facts,
    m = report.content.meta;
  const before = JSON.parse(fs.readFileSync(journal)).preLedgerCalls;
  const receipts = ledger()
    .slice(before)
    .filter(
      (e) =>
        e.purpose === 'operating_report' &&
        n.usage &&
        e.usage?.prompt_tokens === n.usage.prompt_tokens &&
        e.usage?.completion_tokens === n.usage.completion_tokens
    )
    .map((e) => ({
      id: e.id,
      model: e.returnedModel,
      status: e.status,
      input: e.usage.prompt_tokens,
      output: e.usage.completion_tokens,
      cached: e.usage.prompt_tokens_details?.cached_tokens || 0,
      estimatedCny: e.estimatedNanoCny / 1e9,
    }));
  const accounting = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json')));
  const numbers = {
    'cash.income': accounting.gross / 100,
    'cash.refunds': accounting.refund / 100,
    'cash.netSales': accounting.net / 100,
    'sales.new': accounting.signup / 100,
    'sales.renewal': accounting.renewal / 100,
    'lessons.due': accounting.due,
    'lessons.actual': accounting.arrived,
  };
  const factsChecks = Object.fromEntries(
    Object.entries(numbers).map(([k, v]) => [k, f.metrics[k]?.value === v])
  );
  const sources = new Set(f.sources.map((s) => s.id));
  const cited = [
    ...new Set(
      [...(n.sections || []), ...(n.risks || []), ...(n.actions || [])].flatMap(
        (s) => s.sourceIds || []
      )
    ),
  ];
  const files = {};
  for (const card of delivery.cards) {
    const format = card.fileName.split('.').pop();
    assert(['html', 'docx', 'xlsx'].includes(format));
    const bytes = Buffer.from(await (await get(card.downloadUrl)).arrayBuffer());
    assert(bytes.length > 1000);
    fs.writeFileSync(path.join(dir, kind + '.' + format), bytes);
    files[format] = { size: bytes.length, sha256: sha(bytes) };
  }
  const verified =
    m.analysisComplete === true && n.verified === true && n.quality?.status === 'passed';
  const selection = n.quality?.selection;
  const bindings = selection?.bindings || [];
  const sameSet = (x, y) =>
    JSON.stringify([...new Set(x)].sort()) === JSON.stringify([...new Set(y)].sort());
  const bindingOk =
    bindings.length > 0 &&
    bindings.every(
      (b) =>
        b.metricIds.length > 0 &&
        b.metricIds.every((id) => f.metrics[id] && Number.isFinite(f.metrics[id].value)) &&
        sameSet(
          b.sourceIds,
          b.metricIds.flatMap((id) => f.metrics[id].sourceIds)
        ) &&
        b.sourceIds.every((s) => sources.has(s))
    );
  let revision = null;
  if (repair) {
    const original = JSON.parse(fs.readFileSync(path.join(output, kind, 'check.json')));
    const previous = (await (await get('/api/ai/pilot-reports/' + original.reportId)).json()).data
      .content.facts;
    const changed = [...new Set([...Object.keys(previous), ...Object.keys(f)])].filter(
      (key) => !require('node:util').isDeepStrictEqual(previous[key], f[key])
    );
    revision = {
      originalReportId: original.reportId,
      originalDigest: original.digest,
      originalFactHash: original.factHash,
      changedFactFields: changed,
      databaseObservation: f.databaseObservation,
    };
  }
  const checks = {
    protocol:
      n.validationMode === 'bound_database_facts' &&
      selection?.protocol === 'database-report-selections-v1',
    authorizedMetricBindings: bindingOk,
    selectedKnown:
      !!selection?.highlights.length &&
      [...selection.highlights, ...selection.actions].every((id) =>
        bindings.some((b) => b.id === id)
      ),
    pendingHumanReview: n.reviewed === false && m.humanAccepted === false,
    actualReportReady: report.status === 'ready',
    period: report.content.period.start === start && report.content.period.end === end,
    syntheticOrganization: m.orgId === a.organizationId,
    mode: m.sourceKind === 'database',
    supplierEvidence: repair
      ? receipts.length === 0 &&
        n.cacheHit === true &&
        n.digest === revision.originalDigest &&
        revision.changedFactFields.every((key) => key === 'databaseObservation') &&
        f.databaseObservation?.asOf === '2026-11-16'
      : receipts.length === 1 && receipts[0].status === 'received',
    actionBindings:
      !!selection?.actions.length &&
      n.actions.length === selection.actions.length &&
      n.actions.every(
        (action) => action.sourceIds.length && action.sourceIds.every((s) => sources.has(s))
      ),
    fullAnalysis: verified,
    knownSources: cited.length > 0 && cited.every((s) => sources.has(s)),
    noPlaceholders: !/[{}]{2}/.test(JSON.stringify(n.summary)),
    completeText:
      Array.isArray(n.summary) &&
      n.summary.length > 0 &&
      (n.sections || []).some((s) => s.paragraphs?.length),
    adviceNotice: (delivery.answer.match(/AI 建议仅供参考。/g) || []).length === 1,
    ...factsChecks,
  };
  const record = {
    kind,
    requestId,
    reportId: delivery.reportId,
    conversationId: delivery.conversationId,
    period: { start, end },
    expected: accounting,
    checks,
    receipts,
    analysisComplete: m.analysisComplete,
    narrativeVerified: n.verified,
    stage: m.analysisStage,
    quality: n.quality,
    sourceKind: m.sourceKind,
    model: m.model,
    cacheHit: n.cacheHit ?? false,
    digest: n.digest || null,
    factHash: m.factHash,
    revision,
    citedSourceIds: cited,
    sources: f.sources.map((s) => ({ id: s.id, label: s.label, row: s.row })),
    summary: n.summary,
    sections: n.sections,
    risks: n.risks,
    actions: n.actions,
    files,
  };
  store(path.join(dir, 'check.json'), record);
  let formatPass = true;
  try {
    execFileSync(
      '/usr/bin/python3',
      [
        path.join(__dirname, 'verifyAiHistoryReport.py'),
        kind,
        repair ? 'structured-corrected' : 'structured',
      ],
      { stdio: 'inherit' }
    );
  } catch {
    formatPass = false;
  }
  console.log(kind, JSON.stringify({ checks, receipts, formatPass }));
  return Object.values(checks).every(Boolean) && formatPass;
}
(async () => {
  assert.equal(new URL(a.databaseUrl).pathname, '/buzzer_ai_history_v1');
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(a.accounts.manager),
  });
  assert.equal(login.status, 200);
  const { data } = await login.json();
  assert.equal(data.user.campusId, a.campusId);
  const headers = { Authorization: 'Bearer ' + data.token, 'Content-Type': 'application/json' };
  const q = (await (await fetch(base + '/api/ai/quota', { headers })).json()).data;
  assert(
    q.chatAvailable &&
      q.pricingReady &&
      q.testBudget.limitCny === 5 &&
      q.model === 'doubao-seed-2-1-lite-260915' &&
      !q.testBudget.blockedReason
  );
  if (args[0] === '--repair') {
    const sock = require('node:net').createServer();
    await new Promise((r, j) => {
      sock.once('error', j);
      sock.listen(4369, '127.0.0.1', r);
    });
    await new Promise((r) => sock.close(r));
    cacheServer = require('node:child_process').spawn(
      process.execPath,
      [path.join(__dirname, 'startAiHistoryCampus.cjs'), 'serve-cache-only'],
      { stdio: 'ignore' }
    );
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        ready = (await fetch('http://127.0.0.1:4369/health')).ok;
      } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(ready, 'Offline replay backend did not start');
  }
  let pass = true;
  for (const kind of args[1] ? [args[1]] : Object.keys(setup)) {
    try {
      if (!(await run(kind, headers))) pass = false;
    } catch (e) {
      console.error(kind, e.message);
      pass = false;
    }
  }
  if (!pass) process.exitCode = 1;
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => cacheServer?.kill('SIGTERM'));
