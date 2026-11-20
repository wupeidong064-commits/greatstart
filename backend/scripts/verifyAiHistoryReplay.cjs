// Independent replay database and mock provider. Cut the SSE connection after its first header event.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  net = require('node:net'),
  crypto = require('node:crypto'),
  { spawn } = require('node:child_process'),
  assert = require('node:assert/strict');
const state = path.join(os.homedir(), '.local/state/greatstart-ai-history-v1/replay'),
  a = JSON.parse(fs.readFileSync(path.join(state, 'access.json')));
assert.equal(new URL(a.databaseUrl).hostname, '127.0.0.1');
assert.equal(new URL(a.databaseUrl).pathname, '/buzzer_ai_history_v1_replay');
const p = new (require('@prisma/client').PrismaClient)({
  datasources: { db: { url: a.databaseUrl } },
});
let child;
const nap = (ms) => new Promise((r) => setTimeout(r, ms)),
  parse = (t) =>
    t
      .split('\n')
      .filter((s) => s.startsWith('data:'))
      .map((s) => JSON.parse(s.slice(5)));
async function main() {
  const sock = net.createServer();
  await new Promise((r) => sock.listen(0, '127.0.0.1', r));
  const port = sock.address().port;
  await new Promise((r) => sock.close(r));
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: a.databaseUrl,
    DATABASE_DIRECT_URL: a.databaseUrl,
    AI_ACCEPTANCE_BUSINESS_DAY: '2026-11-16',
    JWT_SECRET: crypto.randomBytes(38).toString('hex'),
    AI_PROVIDER: 'mock',
    AI_LIVE_TEST_MODE: '',
    ARK_API_KEY: '',
    GLM_API_KEY: '',
    DOTENV_CONFIG_PATH: '/dev/null',
    AI_MOCK_INTENT_DELAY_MS: '60',
    NODE_ENV: 'test',
  };
  child = spawn(process.execPath, ['--require', 'tsx/cjs', 'src/index.ts'], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: 'ignore',
  });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 110; i++) {
    try {
      if ((await fetch(base + '/health')).ok) break;
    } catch {}
    await nap(100);
  }
  const log = await (
    await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(a.accounts.manager),
    })
  ).json();
  const headers = { Authorization: 'Bearer ' + log.data.token, 'Content-Type': 'application/json' },
    content = '想调整薪资结构，你有什么建议？';
  const post = (body, signal) =>
    fetch(base + '/api/ai/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, ...body }),
      signal,
    });
  const requestId = crypto.randomUUID(),
    abort = new AbortController(),
    stream = await post({ requestId }, abort.signal);
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader(),
    decoder = new TextDecoder();
  let raw = '';
  while (!raw.includes('\n\n')) {
    const chunk = await reader.read();
    assert(!chunk.done);
    raw += decoder.decode(chunk.value, { stream: true });
  }
  const first = parse(raw),
    conversationId = first.find((e) => e.conversationId).conversationId;
  assert(!first.some((e) => e.delta));
  abort.abort();
  let row;
  for (let i = 0; i < 100; i++) {
    row = await p.aiMessage.findUnique({ where: { requestId } });
    if (row?.status === 'stopped') break;
    await nap(100);
  }
  assert.equal(row.status, 'stopped');
  assert.equal(row.content, '');
  const digest = async () => ({
    messages: await p.aiMessage.count({ where: { conversationId } }),
    bills: await p.aiTaskBill.count({ where: { conversationId } }),
  });
  const stopped = await digest();
  const retryId = crypto.randomUUID();
  const retry = parse(await (await post({ requestId: retryId, conversationId })).text());
  const doneText = retry.map((e) => e.delta || '').join('');
  assert(retry.some((e) => e.done));
  assert(doneText.trim().length > 0);
  const done = await digest(),
    replay = parse(await (await post({ requestId: retryId, conversationId })).text());
  const final = await digest();
  assert(replay.some((e) => e.replay));
  assert.equal(replay.map((e) => e.delta || '').join(''), doneText);
  assert.deepEqual(final, done);
  assert.equal(await p.aiMessage.count({ where: { role: 'user', conversationId } }), 1);
  assert.equal(done.messages, stopped.messages + 1);
  const history = await (
    await fetch(base + '/api/ai/conversations/' + conversationId + '/messages', { headers })
  ).json();
  assert(history.data.messages.some((m) => m.content === doneText));
  const report = {
    mock: true,
    providerNetworkCalls: 0,
    stoppedAfterHeader: true,
    displayedBeforeStop: '',
    storedStoppedContent: row.content,
    retryReusedUserMessage: true,
    exactReplay: true,
    readbackEqualsDisplay: true,
    afterStop: stopped,
    afterRetry: done,
    afterReplay: final,
  };
  fs.writeFileSync(
    path.resolve(__dirname, '../../docs/acceptance/2026-11-16-ai-history-campus/mock-stream.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  console.log(report);
}
main()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    child?.kill('SIGTERM');
    await p.$disconnect();
  });
