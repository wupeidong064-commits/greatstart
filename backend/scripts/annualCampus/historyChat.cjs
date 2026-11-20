// Historical holdouts from a manually checked class register and two named source orders.
const { login, load, save } = require('./check.cjs'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
async function main() {
  const b = 'http://127.0.0.1:4372',
    t = (await login(b, load('base').accounts.main)).token,
    results = [];
  for (const [content, expectations] of [
    ['2025年12月29日至2026年1月4日，本校区净成单额是多少元？', [/净成单额[：:]3120(?:\.00)?元/]],
    ['2025年11月，林桥运动19班应到几人、实到几人？', [/应到[：:]8人次/, /实到[：:]6人次/]],
  ]) {
    const requestId = randomUUID(),
      resp = await fetch(b + '/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t },
        body: JSON.stringify({ requestId, content }),
      });
    assert.equal(resp.status, 200);
    const ev = (await resp.text())
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => JSON.parse(l.slice(5)));
    const answer = ev.map((e) => e.delta || '').join('');
    const verified =
      ev.some((e) => e.done) && expectations.every((r) => r.test(answer.replace(/[,，*\s]/g, '')));
    results.push({
      content,
      answer,
      requestId,
      conversationId: ev.find((e) => e.conversationId)?.conversationId,
      verified,
    });
    console.log(verified, answer.slice(0, 150));
  }
  save('historical-chat.json', results);
  assert(results.every((r) => r.verified));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
