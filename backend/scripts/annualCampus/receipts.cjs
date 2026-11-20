// Attribute only this fixture's calls by provider usage and the outbound reservation timestamp.
const { PrismaClient } = require('@prisma/client'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { load, save } = require('./check.cjs');
const ledger = JSON.parse(
  fs.readFileSync(
    path.join(
      os.homedir(),
      '.local/state/greatstart-annual-v1/base/live/budget/supplier-budget.private.json'
    )
  )
).calls;
async function main() {
  const calls = [];
  for (const copy of process.argv.slice(2)) {
    const p = new PrismaClient({ datasources: { db: { url: load(copy).databaseUrl } } });
    try {
      const replies = await p.aiMessage.findMany({
        where: { role: 'assistant' },
        select: { conversationId: true, requestId: true, usageJson: true },
      });
      for (const msg of replies) {
        const u = msg.usageJson;
        assert.equal(u.synthetic, false);
        for (const c of u.calls) {
          assert.equal(c.provider, 'ark');
          assert.equal(c.usageSource, 'provider_reported');
          const hit = ledger.filter(
            (l) =>
              l.purpose === c.purpose &&
              l.returnedModel === c.usage.actualModel &&
              l.usage?.prompt_tokens === c.usage.promptTokens &&
              l.usage?.completion_tokens === c.usage.completionTokens &&
              Math.abs(Date.parse(l.at) - Date.parse(c.startedAt)) < 10000
          );
          assert.equal(hit.length, 1);
          const x = hit[0];
          assert.equal(x.httpStatus, 200);
          calls.push({
            copy,
            conversationId: msg.conversationId,
            requestId: msg.requestId,
            id: x.id,
            purpose: x.purpose,
            model: x.returnedModel,
            input: x.usage.prompt_tokens,
            output: x.usage.completion_tokens,
            estimatedNanoCny: x.estimatedNanoCny,
          });
        }
      }
    } finally {
      await p.$disconnect();
    }
  }
  assert.equal(new Set(calls.map((c) => c.id)).size, calls.length);
  const stats = {
    count: calls.length,
    estimatedCny: calls.reduce((n, c) => n + c.estimatedNanoCny, 0) / 1e9,
  };
  save('provider-receipts.json', { ...stats, calls });
  console.log(stats);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
