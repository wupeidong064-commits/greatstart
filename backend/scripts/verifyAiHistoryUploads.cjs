// Uploads, mapping, exports and request replay all enter through the campus web API.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { randomUUID } = require('node:crypto'),
  assert = require('node:assert/strict');
const Excel = require('exceljs'),
  Zip = require('adm-zip');
const base = 'http://127.0.0.1:5458',
  root = path.join(os.homedir(), '.local/state/greatstart-ai-history-v1');
const access = JSON.parse(fs.readFileSync(path.join(root, 'access.json')));
assert.equal(new URL(access.databaseUrl).pathname, '/buzzer_ai_history_v1');
async function login(account) {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(account),
  });
  assert(res.ok);
  return { authorization: 'Bearer ' + (await res.json()).data.token };
}
async function main() {
  const headers = await login(access.accounts.manager);
  const json = { ...headers, 'content-type': 'application/json' };
  const mapped = async (url, opts) => {
    const r = await fetch(base + url, opts);
    assert(r.ok, String(r.status));
    return (await r.json()).data;
  };
  const form = new FormData();
  form.append(
    'file',
    new Blob(['姓名,文件余课\n秋语,999\n夏禾,4\n仅文件学员,3\n'], { type: 'text/csv' }),
    'reconcile.csv'
  );
  const upload = await mapped('/api/ai/uploads', { method: 'POST', headers, body: form });
  await mapped('/api/ai/uploads/' + upload.id + '/mapping', {
    method: 'PUT',
    headers: json,
    body: JSON.stringify({
      mapping: [{ table: upload.tables[0].name, nameColumn: '姓名', balanceColumn: '文件余课' }],
    }),
  });
  const conversationId = (
    await mapped('/api/ai/conversations', { method: 'POST', headers: json, body: '{}' })
  ).id;
  async function chat(body) {
    const r = await fetch(base + '/api/ai/chat', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ conversationId, ...body }),
    });
    assert.equal(r.status, 200);
    const events = (await r.text())
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => JSON.parse(l.slice(5)));
    assert(events.some((e) => e.done));
    return {
      text: events.map((e) => e.delta || '').join(''),
      files: events.flatMap((e) => (e.fileCard ? [e.fileCard] : [])),
    };
  }
  const primary = await chat({
    content: '请将上传名单与系统对照，列出不一致的记录。',
    requestId: randomUUID(),
    uploadIds: [upload.id],
  });
  for (const term of ['课时不一致', '同名待确认', '仅文件存在', '999'])
    assert(primary.text.includes(term), term);
  const requestId = randomUUID(),
    content = '请导出Excel和Word';
  const exported = await chat({ requestId, content });
  assert.equal(exported.files.length, 2);
  const stored = await mapped('/api/ai/conversations/' + conversationId + '/messages', { headers });
  assert(stored.messages.some((m) => m.content === exported.text));
  const results = [];
  for (const f of exported.files) {
    const r = await fetch(base + f.downloadUrl, { headers });
    assert(r.ok);
    const buffer = Buffer.from(await r.arrayBuffer());
    let text, version;
    if (f.fileName.endsWith('.xlsx')) {
      const book = new Excel.Workbook();
      await book.xlsx.load(buffer);
      text = book.worksheets.map((sh) => JSON.stringify(sh.getSheetValues())).join(' ');
      version = book.description?.match(/[0-9a-f]{64}/)?.[0];
    } else {
      const zip = new Zip(buffer);
      text = zip.readAsText('word/document.xml');
      version = zip.readAsText('docProps/core.xml').match(/[0-9a-f]{64}/)?.[0];
    }
    for (const term of ['课时不一致', '同名待确认', '999'])
      assert(text.includes(term), f.fileName + term);
    assert(version, 'missing snapshot version');
    results.push({ file: f.fileName, version, bytes: buffer.length });
  }
  assert.equal(results[0].version, results[1].version);
  const replay = await chat({ requestId, content });
  assert.deepEqual(replay, exported);
  const other = await login(access.accounts.controlManager);
  const unauthorized = await fetch(base + '/api/ai/uploads/' + upload.id, { headers: other });
  assert([403, 404].includes(unauthorized.status));
  const out = {
    checkedAt: new Date().toISOString(),
    sameNamedStudentNotMerged: true,
    conflictPreserved: true,
    ownerOnly: unauthorized.status,
    replayMatches: true,
    refreshMatches: true,
    files: results,
  };
  fs.writeFileSync(
    path.resolve(
      __dirname,
      '../../docs/acceptance/2026-11-16-ai-history-campus/upload-export.json'
    ),
    JSON.stringify(out, null, 2) + '\n'
  );
  console.log(out);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
