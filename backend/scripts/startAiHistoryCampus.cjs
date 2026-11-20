// Local acceptance launcher. Source credentials are read in memory on the backend only.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  net = require('node:net');
const { pathToFileURL } = require('node:url'),
  { randomBytes } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process'),
  assert = require('node:assert/strict');
const backend = path.resolve(__dirname, '..'),
  frontend = path.resolve(backend, '../frontend');
// Annual snapshots and writable copies have separate databases, runtime directories and ports.
const annualCopy = process.env.GREATSTART_ANNUAL_COPY;
if (annualCopy && !/^[a-z][a-z0-9]{0,15}$/.test(annualCopy)) throw Error('Invalid annual fixture name');
const state = annualCopy
  ? path.join(os.homedir(), '.local/state/greatstart-annual-v1', annualCopy)
  : path.join(os.homedir(), '.local/state/greatstart-ai-history-v1');
const source = path.join(os.homedir(), '.local/share/greatstart-ai-workbench/2026-11-15-live5199');
const runtime = path.join(state, 'live'),
  db = annualCopy ? 'buzzer_annual_v1_' + annualCopy : 'buzzer_ai_history_v1',
  model = 'doubao-seed-2-1-lite-260915';
const ports = annualCopy ? require('./annualCampus/runtime.cjs').ports(annualCopy) : { backend: 4358, frontend: 5458 },
  base = (k) => 'http://127.0.0.1:' + ports[k];
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function writePrivateOnce(file, object) {
  try {
    fs.writeFileSync(file, JSON.stringify(object, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    assert.deepEqual(read(file), object, 'Private scope differs; inspect ' + file);
  }
}
function access() {
  const a = read(path.join(state, 'access.json'));
  assert.equal(
    a.databaseUrl,
    'postgresql://' + encodeURIComponent(os.userInfo().username) + '@127.0.0.1:5432/' + db
  );
  return a;
}
function scope() {
  const original = read(path.join(source, 'live-scope.private.json'));
  assert.equal(original.authorized, true);
  assert.equal(original.maxCostCny, 5);
  assert.equal(original.model, model);
  const ledger = read(path.join(source, 'budget/supplier-budget.private.json'));
  assert.equal(ledger.approvalId, original.approvalId);
  assert.equal(
    fs.realpathSync(path.join(runtime, 'budget')),
    fs.realpathSync(path.join(source, 'budget'))
  );
  return { ...original, database: db };
}
async function prepare() {
  const a = access();
  fs.mkdirSync(path.join(runtime, 'data/rework'), { recursive: true, mode: 0o700 });
  try {
    fs.symlinkSync(path.join(source, 'budget'), path.join(runtime, 'budget'), 'dir');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  const approved = scope();
  writePrivateOnce(path.join(runtime, 'live-scope.private.json'), approved);
  // Report generation has a distinct org-scoped approval. It uses the same provider cap and only this synthetic organization.
  writePrivateOnce(path.join(runtime, 'data/rework/live-approval.private.json'), {
    ...approved,
    allowedOrganizationIds: [a.organizationId],
  });
  const jwt = path.join(runtime, 'jwt.private');
  try {
    fs.writeFileSync(jwt, randomBytes(36).toString('hex'), { mode: 0o600, flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  const { PrismaClient } = require('@prisma/client'),
    p = new PrismaClient({ datasources: { db: { url: a.databaseUrl } } });
  try {
    const org = await p.organization.findUnique({ where: { id: a.organizationId } });
    assert.equal(org?.code, annualCopy ? 'ANNUAL_V1_main' : 'AI_HISTORY_V1');
    const id = require('./aiHistoryFixture.cjs').id('arkPrice');
    const price = {
      id,
      model,
      inputMicrosPer1k: 800,
      outputMicrosPer1k: 2700,
      effectiveFrom: new Date('2026-11-14T00:00:00+08:00'),
      note: '火山方舟官方常规在线文本价，2026-11-14核验；输入0.8元/M、输出2.7元/M；缓存抵扣与现金账单单列',
    };
    const row = await p.aiModelPrice.upsert({
      where: { id },
      create: price,
      update: { note: price.note },
    });
    for (const k of ['model', 'inputMicrosPer1k', 'outputMicrosPer1k'])
      assert.equal(row[k], price[k]);
  } finally {
    await p.$disconnect();
  }
}
async function serveBackend(cacheOnly = false) {
  const listenPort = cacheOnly ? 4369 : ports.backend;
  const a = access(),
    approved = scope();
  assert.deepEqual(approved, read(path.join(runtime, 'live-scope.private.json')));
  const supplier = read(path.join(source, 'env.private.json'));
  assert.ok(supplier.ARK_API_KEY);
  assert.equal(supplier.ARK_MODEL, model);
  assert.equal(supplier.ARK_BASE_URL, 'https://ark.cn-beijing.volces.com/api/v3');
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: '/dev/null',
    DATABASE_URL: a.databaseUrl,
    DATABASE_DIRECT_URL: a.databaseUrl,
    JWT_SECRET: fs.readFileSync(path.join(runtime, 'jwt.private'), 'utf8'),
    AI_PROVIDER: 'ark',
    ARK_API_KEY: supplier.ARK_API_KEY,
    ARK_BASE_URL: supplier.ARK_BASE_URL,
    ARK_MODEL: model,
    GLM_API_KEY: '',
    AI_LIVE_TEST_MODE: '1',
    AI_EXPECTED_DATABASE: db,
    AI_ACCEPTANCE_BUSINESS_DAY: '2026-11-16',
    AI_WORKBENCH_RUNTIME_DIR: runtime,
    AI_REPORTS_DIR: path.join(runtime, 'reports'),
    AI_REPORT_OUTPUT_DIR: path.join(runtime, 'reports/pilot'),
    AI_UPLOADS_DIR: path.join(runtime, 'uploads'),
    AVATAR_STORAGE_DIR: path.join(runtime, 'avatars'),
    RAG_ENABLED: 'false',
    AI_CHAT_RATE_LIMIT: '100',
    ALLOWED_ORIGINS: base('frontend'),
    PORT: String(listenPort),
  });
  const guard = require('../src/services/aiLiveBudget.cjs').installFromEnv();
  assert.equal(guard.status().approvalId, approved.approvalId);
  // This invalid payload is rejected locally by the installed outbound guard, before any reservation or network.
  await assert.rejects(
    () => guard.fetch(supplier.ARK_BASE_URL + '/chat/completions', { body: '{}' }),
    (e) => e.notSent === true && e.code === 'AI_TEST_BUDGET'
  );
  if (cacheOnly) {
    global.fetch = async () => {
      const e = Error('Provider requests are disabled for offline replay');
      e.notSent = true;
      throw e;
    };
  }
  const originalListen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (port, ...args) {
    if (String(port) === String(listenPort) && typeof args[0] === 'function')
      return originalListen.call(this, Number(port), '127.0.0.1', ...args);
    return originalListen.call(this, port, ...args);
  };
  process.chdir(backend);
  require('tsx/cjs');
  require('../src/index.ts');
}
async function serveFrontend() {
  process.chdir(frontend);
  Object.assign(process.env, {
    NODE_ENV: 'development',
    VITE_PORT: String(ports.frontend),
    VITE_API_BASE: '/api',
    VITE_PROXY_TARGET: base('backend'),
    VITE_CACHE_DIR: path.join(runtime, 'vite-cache'),
  });
  const { createServer } = await import(
    pathToFileURL(path.join(frontend, 'node_modules/vite/dist/node/index.js')).href
  );
  const vite = await createServer({
    root: frontend,
    server: { host: '127.0.0.1', strictPort: true },
    envDir: path.join(runtime, 'frontend-env'),
  });
  await vite.listen();
}
function ownedPid(kind) {
  const file = path.join(runtime, kind + '.pid');
  if (!fs.existsSync(file)) return null;
  const pid = Number(fs.readFileSync(file, 'utf8'));
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;
  try {
    const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
    }).trim();
    const command = __filename + ' serve-' + kind;
    if (!annualCopy) return cmd.endsWith(command) ? pid : null;
    if (cmd.endsWith(command + ' ' + db + ' ' + ports[kind])) return pid;
    // Adopt an already running annual launcher from before profile tags only on its own port.
    if (!cmd.endsWith(command)) return null;
    const listener = execFileSync('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP:' + ports[kind], '-sTCP:LISTEN', '-t'], {encoding:'utf8'});
    return listener.trim() === String(pid) ? pid : null;
  } catch {
    return null;
  }
}
async function start(kind) {
  if (ownedPid(kind)) return;
  const socket = net.createServer();
  await new Promise((r, j) => {
    socket.once('error', j);
    socket.listen(ports[kind], '127.0.0.1', r);
  });
  await new Promise((r) => socket.close(r));
  const log = fs.openSync(path.join(runtime, kind + '.log'), 'a', 0o600);
  try {
    const child = spawn(process.execPath, [__filename, 'serve-' + kind, ...(annualCopy ? [db, String(ports[kind])] : [])], {
      detached: true,
      stdio: ['ignore', log, log],
      env: Object.fromEntries(
        ['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR', 'LC_ALL', 'GREATSTART_ANNUAL_COPY', 'GREATSTART_ANNUAL_SLOT']
          .filter((k) => process.env[k])
          .map((k) => [k, process.env[k]])
      ),
    });
    fs.writeFileSync(path.join(runtime, kind + '.pid'), String(child.pid), { mode: 0o600 });
    child.unref();
  } finally {
    fs.closeSync(log);
  }
}
async function main() {
  const action = process.argv[2] || 'start';
  if (action === 'serve-backend') return serveBackend();
  if (action === 'serve-cache-only') return serveBackend(true);
  if (action === 'serve-frontend') return serveFrontend();
  if (action === 'stop' && annualCopy) {
    for (const kind of ['frontend', 'backend']) {
      const pid = ownedPid(kind);
      if (pid) {
        process.kill(pid,'SIGTERM');
        for(let i=0;i<60 && ownedPid(kind);i++)await sleep(100);
        assert.ok(!ownedPid(kind),'Annual service did not stop');
      }
    }
    return;
  }
  if (!['start', 'restart-backend', 'status'].includes(action))
    throw Error('Use start, status, or restart-backend');
  if (action !== 'status') {
    await prepare();
    if (action === 'restart-backend') {
      const pid = ownedPid('backend');
      if (pid) {
        process.kill(pid, 'SIGTERM');
        for (let i = 0; i < 50 && ownedPid('backend'); i++) await sleep(100);
        assert.ok(!ownedPid('backend'), 'Existing isolated backend is still running');
      }
    }
    for (let retry = 0; ; retry++) {
      try {
        await start('backend');
        break;
      } catch (e) {
        if (action !== 'restart-backend' || e.code !== 'EADDRINUSE' || retry >= 20) throw e;
        await sleep(100);
      }
    }
    await start('frontend');
  }
  for (const kind of ['backend', 'frontend']) {
    let ready = false;
    for (let i = 0; i < (action === 'status' ? 1 : 100); i++) {
      try {
        ready =
          !!ownedPid(kind) && (await fetch(base(kind) + (kind === 'backend' ? '/health' : '/'))).ok;
      } catch {}
      if (ready) break;
      await sleep(100);
    }
    if (!ready) throw Error(kind + ' unavailable, see ' + path.join(runtime, kind + '.log'));
    console.log(kind + ' ' + base(kind) + ' ready');
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
