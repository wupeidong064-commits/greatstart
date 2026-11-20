// Four real manager sessions see disjoint records and different totals for the same question.
const { randomUUID } = require('node:crypto'),
  assert = require('node:assert/strict');
const { id } = require('./register.cjs'),
  { login, load, save } = require('./check.cjs');
const origin = 'http://127.0.0.1:4372',
  scopes = ['main', 'sister', 'other', 'edge'];
const probe = (route, token) =>
  fetch(origin + '/api/' + route, { headers: { authorization: 'Bearer ' + token } });
async function main() {
  const a = load('base'),
    students = scopes.map((k) => id(k === 'main' ? 's1' : k + '-student')),
    rows = [];
  for (const [i, k] of scopes.entries()) {
    const { token } = await login(origin, a.accounts[k]);
    const statuses = [];
    for (const [j, student] of students.entries()) {
      const r = await probe('students/' + student, token);
      statuses.push(r.status);
      if (i === j) {
        assert.equal(r.status, 200);
        assert.equal((await r.json()).data.id, student);
      } else
        assert(
          [403, 404].includes(r.status),
          '学员详情的校区边界 ' + k + '/' + scopes[j] + ' ' + r.status
        );
    }
    const content = '2026年11月13日，本校区净成单额是多少元？';
    const r = await fetch(origin + '/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ content, requestId: randomUUID() }),
    });
    assert.equal(r.status, 200);
    const events = (await r.text())
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => JSON.parse(l.slice(5)));
    const answer = events.map((e) => e.delta || '').join('');
    const expected = [1360, 397, 823, 0][i];
    assert(
      new RegExp('净成单额[：: ]*' + expected + '(?:\\.00)?元').test(answer.replace(/[,，*]/g, '')),
      k + ' ' + answer
    );
    const conversationId = events.find((e) => e.conversationId).conversationId;
    rows.push({
      scope: k,
      studentDetailHttp: statuses,
      expectedNet: expected,
      conversationId,
      answer,
    });
  }
  for (const [i, k] of scopes.entries()) {
    const { token } = await login(origin, a.accounts[k]);
    const r = await probe(
      'ai/conversations/' + rows[(i + 1) % 4].conversationId + '/messages',
      token
    );
    assert([403, 404].includes(r.status));
    rows[i].otherConversationHttp = r.status;
  }
  save('scope-verification.json', rows);
  console.log(
    rows.map(({ scope, studentDetailHttp, expectedNet, otherConversationHttp }) => ({
      scope,
      studentDetailHttp,
      expectedNet,
      otherConversationHttp,
    }))
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
