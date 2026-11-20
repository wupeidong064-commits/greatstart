// Real Chromium, production HTTP handlers and the budgeted AI provider. Repeat using a fresh copy.
const { chromium, expect } = require('../../../frontend/node_modules/@playwright/test');
const { PrismaClient } = require('@prisma/client'),
  fs = require('node:fs'),
  assert = require('node:assert/strict'),
  path = require('node:path');
const { id, last, register } = require('./register.cjs'),
  { load, request, login, dir, save } = require('./check.cjs');
const copy = process.argv[2] || 'flow',
  step = Number(process.argv[3]);
assert(copy !== 'base' && Number.isInteger(step) && step >= 1 && step <= 5);
const ports = require('./runtime.cjs').ports(copy);
const a = load(copy),
  origin = 'http://127.0.0.1:' + ports.frontend,
  api = 'http://127.0.0.1:' + ports.backend,
  p = new PrismaClient({ datasources: { db: { url: a.databaseUrl } } });
const name = '展翼验收学员',
  cls = '展翼新班',
  clock = new Date(Date.now() + 8 * 3600000),
  day = clock.toISOString().slice(0, 10);
const expected = require(path.join(dir, 'expected.json'))[day.slice(0, 7)] || {
  newAmount: 0,
  renewAmount: 0,
  refund: 0,
};
const boundary =
  clock.getUTCHours() >= 23 ? new Date(+clock + 86400000).toISOString().slice(0, 10) : day;
const lessonDay =
  step === 1 ? boundary : require(path.join(dir, copy + '-1-result.json')).lessonDay || last;
const zh = (d) =>
  d.replace(/^(\d+)-(\d+)-(\d+)$/, (_, y, m, n) => y + '年' + Number(m) + '月' + Number(n) + '日');
const registerRows = register();
const ownStudents = new Set(
  registerRows.student.filter((s) => s.campusId === a.campusId).map((s) => s.id)
);
const dailyOrders = registerRows.conversion.filter(
  (o) =>
    ownStudents.has(o.studentId) && o.conversionDate === day && o.approvalStatus === 'confirmed'
);
const totalsForDay = dailyOrders
  .filter((o) => o.courseType === '续费')
  .reduce((n, o) => n + Number(o.price), 0);
const baselineNet =
  dailyOrders.reduce((n, o) => n + Number(o.price), 0) -
  registerRows.refund
    .filter((r) => r.reviewedAt.toISOString().slice(0, 10) === day)
    .reduce((n, r) => n + r.amountToRefund, 0);
const filename = (s) => copy + '-' + step + '-' + s;
const shot = async (page, s) => {
  await page.screenshot({ path: path.join(dir, filename(s) + '.png'), animations: 'disabled' });
};
async function run() {
  const fixed = require(path.join(dir, 'static-' + copy + '.json'));
  assert.deepEqual(fixed.hashes, require(path.join(dir, 'static-base.json')).hashes);
  if (step > 1) assert(require(path.join(dir, copy + '-' + (step - 1) + '-result.json')).verified);
  const auth = await login(api, a.accounts.main),
    browser = await chromium.launch({ headless: true }),
    ctx = await browser.newContext({
      viewport: { width: 1550, height: 1030 },
      timezoneId: 'Asia/Shanghai',
      locale: 'zh-CN',
    });
  await ctx.addInitScript((x) => {
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({ state: { user: x.user, token: x.token, isAuthenticated: true }, version: 0 })
    );
  }, auth);
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const nav = async (route) => {
    await page.goto(origin + route);
  };
  const dlg = () => page.getByRole('dialog').last();
  const select = async (input, label, type) => {
    await input.click();
    if (type) await input.fill(label);
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .filter({ hasText: label })
      .first()
      .click();
  };
  const byName = () => p.student.findFirst({ where: { campusId: a.campusId, name } });
  const once = async (test, op) => {
    if (!(await test())) {
      await op();
      await expect.poll(test).toBeTruthy();
    }
  };
  const schedule = () =>
    p.schedule.findFirst({ where: { campusId: a.campusId, classroom: '全年实测馆' } });
  const doc = { step, name, copy, day, lessonDay };
  if (step > 1)
    assert.equal(
      require(path.join(dir, copy + '-1-result.json')).day || last,
      day,
      '跨自然日请使用全新副本'
    );
  try {
    if (step === 1) {
      // The order form selects an upcoming registration slot. On later runs prepare
      // that same prerequisite on the writable copy using the public schedule handler.
      if (day > last) {
        const future = new Date(+clock + 86400000).toISOString().slice(0, 10);
        await request(api, 'schedules', auth.token, {
          classId: id('class20'),
          startTime: future + 'T15:00:00+08:00',
          endTime: future + 'T16:00:00+08:00',
          classroom: '展翼馆',
        });
      }
      await nav('/cashflow/order-info');
      await once(byName, async () => {
        await page.getByRole('button', { name: '新增成单' }).click();
        const m = dlg();
        for (const [ph, val] of [
          ['请输入学员姓名', name],
          ['年龄', '8'],
          ['请输入联系方式', '13899009951'],
          ['课时数', '4'],
          ['金额', '460'],
        ])
          await m.getByPlaceholder(ph, { exact: true }).fill(val);
        await m.locator('#scheduleId').click();
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '展翼馆' })
          .click();
        await m.getByRole('button', { name: '确认成单' }).click();
        await expect(m).not.toBeVisible();
      });
      await expect(
        page.getByRole('row').filter({ hasText: name }).filter({ hasText: cls }).first()
      ).toBeVisible();
    }
    if (step === 2 || step === 3) {
      await nav('/operation/weekly-schedule');
      if (step === 2)
        await once(schedule, async () => {
          await page.getByRole('button', { name: '新增排课' }).click();
          const m = dlg();
          await select(m.getByLabel('班级', { exact: true }), cls);
          await m.getByText('单次排课', { exact: true }).click();
          const date = m.locator('#lessonDate');
          await date.fill(lessonDay);
          await date.press('Enter');
          const times = m.locator('.ant-picker-range input');
          await times.nth(0).fill('23:00');
          await times.nth(0).press('Tab');
          await times.nth(1).fill('23:50');
          await times.nth(1).press('Enter');
          await m.getByLabel('教室', { exact: true }).fill('全年实测馆');
          await m.getByRole('button', { name: /保\s*存/ }).click();
          await expect(m).not.toBeVisible();
        });
      if (lessonDay !== day && new Date(day + 'T12:00:00Z').getUTCDay() === 0)
        await page.getByRole('button', { name: '下一周' }).click();
      const card = page
        .locator('.teaching-session-card')
        .filter({ hasText: cls })
        .filter({ hasText: '23:00' })
        .first();
      await expect(card).toBeVisible();
      if (step === 3) {
        const sid = (await schedule()).id;
        await once(
          () => p.attendance.findFirst({ where: { scheduleId: sid, studentId: stud.id } }),
          async () => {
            await card.getByRole('button', { name: '批量划课' }).click();
            const m = dlg();
            await expect(m.getByText(name, { exact: true })).toBeVisible();
            await m.getByRole('button', { name: '全部出勤' }).click();
            await m.getByRole('button', { name: '确认提交' }).click();
            await expect(m.getByText('已保存', { exact: true }).first()).toBeVisible();
          }
        );
        if (!(await dlg().isVisible()))
          await card.getByRole('button', { name: '批量划课' }).click();
        await expect(dlg().getByText(name, { exact: true })).toBeVisible();
      }
    }
    if (step === 4) {
      await nav('/cashflow/order-info');
      await once(
        () => p.conversion.findFirst({ where: { studentId: stud.id, price: 240 } }),
        async () => {
          await page.getByRole('button', { name: '新增续费' }).click();
          const m = dlg();
          await select(m.getByLabel('续费学员'), name, true);
          await m.getByLabel('续费课时', { exact: true }).fill('2');
          await m.getByLabel('续费金额', { exact: true }).fill('240');
          await m.getByRole('button', { name: '确认续费' }).click();
          await expect(m).not.toBeVisible();
        }
      );
      await expect(
        page.getByRole('row').filter({ hasText: name }).filter({ hasText: '240' }).first()
      ).toBeVisible();
    }
    if (step === 5) {
      await nav('/students/refunds');
      await once(
        () => p.refund.findFirst({ where: { studentId: stud.id, status: 'approved' } }),
        async () => {
          await page.getByRole('button', { name: /登记退费/ }).click();
          const m = dlg();
          await select(m.locator('#studentId'), name, true);
          await expect(m.locator('#lessonsToRefund')).toHaveValue('5');
          await expect(m.locator('#amountToRefund')).toHaveValue(/585/);
          await m
            .getByPlaceholder('线下流程的退费原因 / 凭据摘要')
            .fill('全年验收，剩余批次原价退费');
          await m.getByRole('button', { name: /提交并确认/ }).click();
          await page
            .getByRole('dialog')
            .filter({ hasText: '确认通过「' })
            .getByRole('button', { name: '确认通过', exact: true })
            .click();
          await expect(page.getByRole('dialog')).toHaveCount(0);
        }
      );
      await expect(
        page.getByRole('row').filter({ hasText: name }).filter({ hasText: '585' })
      ).toBeVisible();
    }
    await shot(page, 'business');
    doc.businessPage = new URL(page.url()).pathname;
    const row = await byName(),
      balances = [4, 4, 3, 5, 0];
    assert.equal(row.remainingLessons, balances[step - 1]);
    assert.equal(row.consumedLessons, step >= 3 ? 1 : 0);
    doc.studentId = row.id;
    doc.balance = row.remainingLessons;
    const ledger = await p.lessonLog.findMany({
      where: { studentId: row.id },
      orderBy: { ledgerSequence: 'asc' },
      select: {
        id: true,
        type: true,
        lessons: true,
        conversionId: true,
        scheduleId: true,
        refundId: true,
        allocations: true,
      },
    });
    assert.equal(ledger.length, [1, 1, 2, 3, 4][step - 1]);
    doc.ledger = ledger;
    const sums = [
      expected.newAmount + 460,
      expected.renewAmount + (step >= 4 ? 240 : 0),
      expected.refund + (step === 5 ? 585 : 0),
    ];
    const cash = await request(
      api,
      'cashflow-summary?startDate=' + day.slice(0, 7) + '-01&endDate=' + day,
      auth.token
    );
    assert.deepEqual([cash.newSignup.amount, cash.renewal.amount, cash.refund.amount], sums);
    doc.cash = { new: sums[0], renew: sums[1], refund: sums[2], net: cash.totals.netAmount };
    assert.equal(doc.cash.net, sums[0] + sums[1] - sums[2]);
    await nav('/cashflow/summary');
    for (const [i, test] of ['signup-amount', 'renewal-amount', 'refund-amount'].entries())
      await expect(page.getByTestId(test)).toContainText(
        sums[i].toLocaleString('zh-CN', { minimumFractionDigits: 2 })
      );
    await shot(page, 'cash');
    if (step === 2 || step === 3) {
      const sch = await schedule();
      assert.equal(sch.status, step === 2 ? 'scheduled' : 'completed');
      doc.schedule = { id: sch.id, status: sch.status };
      const c = await request(
        api,
        'attendances/class-attendance-stats?startDate=' + lessonDay + '&endDate=' + lessonDay,
        auth.token
      );
      const att = c.find((r) => r.classId === id('class20'));
      assert.deepEqual(
        [att?.expectedAttendance || 0, att?.actualAttendance || 0],
        step === 2 ? [0, 0] : [1, 1]
      );
      if (step === 3) {
        await nav('/attendances');
        await expect(page.getByText(cls, { exact: true }).first()).toBeVisible();
        await shot(page, 'attendance');
      }
    }
    const qs = [
      zh(day) + '，本校区今天新签了多少元？只报新签金额。',
      '查' + zh(lessonDay) + '展翼新班的排课，当天排了几场？请列出上课时间。',
      zh(lessonDay) + '，展翼新班应到几人、实到几人？',
      zh(day) + '本校区续费总金额是多少元？',
      zh(day) + '本校区已通过退费多少元？',
    ];
    const chatProof = await chat(qs[step - 1], page, nav);
    Object.assign(doc, chatProof);
    const compact = doc.answer.replace(/[,，\s*]/g, '');
    const checks = [
      /460(?:\.0+)?元/,
      /23[:：]00/,
      /应到.{0,16}[1一].{0,45}实到.{0,16}[1一]/s,
      new RegExp(String(totalsForDay + 240) + '(?:\\.0+)?元'),
      /585(?:\.0+)?元/,
    ];
    doc.verified =
      checks[step - 1].test(compact) && (step !== 2 || /记录数[：:]1条|1场|一场/.test(compact));
    if (doc.verified) {
      const balanceQuestion = zh(day) + '本校区净成单额是多少元？';
      const previous =
        step > 1
          ? require(path.join(dir, copy + '-' + (step - 1) + '-result.json')).netRecheck
          : null;
      const res = await fetch(api + '/api/ai/chat', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + auth.token, 'content-type': 'application/json' },
        body: JSON.stringify({
          content: balanceQuestion,
          conversationId: previous?.conversationId,
          requestId: require('node:crypto').randomUUID(),
        }),
      });
      assert.equal(res.status, 200);
      const ev = (await res.text())
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => JSON.parse(l.slice(5)));
      const netAnswer = ev.map((e) => e.delta || '').join(''),
        conversationId = ev.find((e) => e.conversationId)?.conversationId;
      const expectedNet = baselineNet + 460 + (step >= 4 ? 240 : 0) - (step === 5 ? 585 : 0);
      doc.netRecheck = {
        question: balanceQuestion,
        answer: netAnswer,
        conversationId,
        expectedNet,
      };
      doc.verified =
        ev.some((e) => e.done) &&
        (!previous || previous.conversationId === conversationId) &&
        new RegExp('净成单额[：:]' + expectedNet + '(?:\\.0+)?元').test(
          netAnswer.replace(/[,，*\s]/g, '')
        );
    }
    save(filename('result') + '.json', doc);
    assert(doc.verified, 'AI answer differs: ' + doc.answer);
    console.log(step, 'PASS', doc.balance, doc.answer.slice(0, 220));
  } catch (e) {
    console.log(
      'PAGE',
      new URL(page.url()).pathname,
      (await page.locator('body').innerText()).slice(-1050)
    );
    await shot(page, 'diagnostic');
    throw e;
  } finally {
    await browser.close();
  }
  async function chat(question, pg, go) {
    await go('/ai');
    const input = pg.getByPlaceholder(/问问你的经营数据/);
    await expect(input).toBeEnabled();
    await input.fill(question);
    const response = pg.waitForResponse(
      (r) => r.url().endsWith('/api/ai/chat') && r.request().method() === 'POST',
      { timeout: 90000 }
    );
    await pg.getByTitle('发送', { exact: true }).click();
    const r = await response;
    assert.equal(r.status(), 200);
    const raw = await r.text(),
      events = raw
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => JSON.parse(l.slice(5)));
    assert(events.some((e) => e.done));
    const answer = events.map((e) => e.delta || '').join('');
    assert(answer.length > 0);
    await expect(pg.locator('.wb-msg-ai').last()).toContainText(
      answer.replace(/[*#]/g, '').trim().slice(0, 6)
    );
    await shot(pg, 'ai');
    return {
      question,
      answer,
      conversationId: events.find((e) => e.conversationId)?.conversationId,
      requestId: r.request().postDataJSON().requestId,
    };
  }
}
let stud;
(async () => {
  stud = await p.student.findFirst({ where: { campusId: a.campusId, name } });
  await run();
})()
  .catch((e) => {
    console.error(e.message.slice(0, 1350));
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
