// Create once, or create another independently migrated copy with --copy <lowercase suffix>.
// Deliberately never drops a database, truncates tables, or imports the normal backend .env.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client'),
  bcrypt = require('bcryptjs');
const F = require('./aiHistoryFixture.cjs');
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--copy' && /^[a-z0-9]{1,20}$/.test(args[1])))
  throw Error('Expected --copy <lowercase suffix>');
const db = 'buzzer_ai_history_v1' + (args.length ? '_' + args[1] : '');
const url = 'postgresql://' + encodeURIComponent(os.userInfo().username) + '@127.0.0.1:5432/' + db;
const env = { ...process.env, DATABASE_URL: url, DATABASE_DIRECT_URL: url };
const state = path.join(
  os.homedir(),
  '.local/state/greatstart-ai-history-v1',
  ...(args.length ? [args[1]] : [])
);
const access = path.join(state, 'access.json');
const p = new PrismaClient({ datasources: { db: { url } } });
const date = (d, h = 12) => new Date(d + 'T' + String(h).padStart(2, '0') + ':00:00+08:00');
const { id } = F,
  organizationId = id('org'),
  scoped = (k) => ({ organizationId, campusId: id(k) });
const stable = date('2026-08-01'),
  time = { createdAt: stable, updatedAt: stable };
async function seedConfirmedTargets(t) {
  for (const [key, month, newSign, renewal] of [
    ['main', '2026-09', 1600, 0],
    ['control', '2026-10', 8000, 900],
  ]) {
    const row = {
      id: id('target-' + key + month),
      ...scoped(key),
      kind: 'report_targets',
      status: 'confirmed_fact',
      periodLabel: month,
      sourceLabel: (key === 'main' ? '四季' : '青峦') + '校区签定的' + month + '经营目标',
      payload: { month, newSign, renewal, effectiveDate: month + '-01', version: '历史验收目标v1' },
      createdAt: date(month + '-01', 0),
    };
    await t.orgReportContext.upsert({ where: { id: row.id }, create: row, update: {} });
  }
}
async function main() {
  const exists = execFileSync(
    'psql',
    [
      '-X',
      '-h',
      '127.0.0.1',
      '-d',
      'postgres',
      '-Atc',
      "SELECT 1 FROM pg_database WHERE datname='" + db + "'",
    ],
    { encoding: 'utf8' }
  ).trim();
  if (exists) {
    if (
      !fs.existsSync(access) ||
      !(await p.organization.findUnique({ where: { code: 'AI_HISTORY_V1' } }))
    )
      throw Error('Existing database is not a completed owned fixture. Use a fresh --copy suffix.');
    await p.$transaction(seedConfirmedTargets);
    console.log('Existing fixture preserved: ' + db + '; local access file: ' + access);
    return;
  }
  execFileSync('createdb', ['-h', '127.0.0.1', '-p', '5432', db]);
  execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    env,
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
  });
  const accounts = {};
  for (const key of Object.keys(F.users))
    accounts[key] = {
      email: key.toLowerCase() + '@history.invalid',
      password: crypto.randomBytes(24).toString('base64url'),
    };
  const hashed = {};
  for (const [k, a] of Object.entries(accounts)) hashed[k] = await bcrypt.hash(a.password, 10);
  await p.$transaction(
    async (t) => {
      await t.organization.create({
        data: { id: organizationId, name: '四季历史验收机构', code: 'AI_HISTORY_V1', ...time },
      });
      for (const [k, name] of [
        ['main', '四季历史验收校区'],
        ['control', '青峦权限对照校区'],
      ]) {
        await t.campus.create({ data: { id: id(k), organizationId, name, code: k, ...time } });
        await t.aiCreditAccount.create({
          data: { id: id('credit' + k), ...scoped(k), balanceMicros: 1000000 },
        });
      }
      await t.aiModelPrice.create({
        data: {
          id: id('mockPrice'),
          model: 'mock-recorded-v1',
          inputMicrosPer1k: 0,
          outputMicrosPer1k: 0,
          effectiveFrom: stable,
        },
      });
      for (const [k, name] of Object.entries(F.users))
        await t.user.create({
          data: {
            id: id(k),
            ...scoped(k.startsWith('control') ? 'control' : 'main'),
            name,
            email: accounts[k].email,
            password: hashed[k],
            role: k.toLowerCase().includes('manager')
              ? 'staff'
              : k === 'seller'
                ? 'sales'
                : 'coach',
            managementLevel: k.toLowerCase().includes('manager') ? 'manager' : 'none',
            ...time,
          },
        });
      for (const [k, [name, teacher]] of Object.entries(F.classes))
        await t.class.create({
          data: {
            id: id(k),
            ...scoped(k === 'X' ? 'control' : 'main'),
            name,
            code: k,
            teacherId: id(teacher),
            courseType: '综合运动',
            ...time,
          },
        });
      for (let n = 1; n < F.students.length; n++)
        await t.student.create({
          data: {
            id: id('s' + n),
            ...scoped(n === 12 ? 'control' : 'main'),
            name: F.students[n],
            remainingLessons: n % 2 ? 4 : 12,
            salesId: id(n === 12 ? 'controlCoach' : 'seller'),
            ...time,
          },
        });
      async function enroll(cls, n, from = '2026-08-01', to) {
        await t.enrollment.create({
          data: {
            id: id('enroll' + cls + n),
            organizationId,
            classId: id(cls),
            studentId: id('s' + n),
            status: to ? 'transferred' : 'active',
            enrolledAt: date(from, 0),
            endedAt: to ? date(to, 0) : null,
            ...time,
          },
        });
      }
      for (const [cls, list] of Object.entries(F.roster))
        for (const n of list) await enroll(cls, n);
      await enroll('A', 11, '2026-08-01', '2026-10-01');
      await enroll('B', 11, '2026-10-01');
      // The independent copy deliberately changes physical insertion order.
      for (const s of args.length ? [...F.sessions].reverse() : F.sessions) {
        const scheduleId = id(s.day + s.cls);
        await t.schedule.create({
          data: {
            id: scheduleId,
            ...scoped(s.cls === 'X' ? 'control' : 'main'),
            classId: id(s.cls),
            teacherId: id(s.teacher),
            startTime: date(s.day, 9),
            endTime: date(s.day, 10),
            status: s.status,
            ...time,
          },
        });
        for (const n of args.length ? [...s.expected].reverse() : s.expected)
          await t.attendance.create({
            data: {
              id: id('at' + s.day + s.cls + n),
              organizationId,
              classId: id(s.cls),
              scheduleId,
              studentId: id('s' + n),
              status: s.arrived.includes(n) ? (n === 7 ? 'late' : 'present') : 'absent',
              createdAt: date(s.day, 9),
              updatedAt: date(s.day, 10),
            },
          });
      }
      for (const [i, [day, cls, n, seller, kind, cents, status]] of F.orders.entries())
        await t.conversion.create({
          data: {
            id: id('order' + i),
            organizationId,
            studentId: id('s' + n),
            studentName: F.students[n],
            contact: '00000000000',
            classId: cls ? id(cls) : null,
            className: cls ? F.classes[cls][0] : null,
            salesId: id(seller),
            salesName: F.users[seller],
            courseType: kind,
            approvalStatus: status || 'confirmed',
            conversionDate: day,
            price: (cents / 100).toFixed(2),
            createdAt: date(day),
            updatedAt: date(day),
          },
        });
      for (const [i, [day, n, order, cents, status]] of F.refunds.entries())
        await t.refund.create({
          data: {
            id: id('refund' + i),
            organizationId,
            studentId: id('s' + n),
            studentName: F.students[n],
            conversionId: id('order' + order),
            amountToRefund: (cents / 100).toFixed(2),
            lessonsToRefund: 1,
            reason: '合成样本',
            status,
            reviewedAt: date(day, 0),
            submittedById: id(n === 12 ? 'controlManager' : 'manager'),
            createdAt: date(day, 0),
            updatedAt: date(day, 0),
          },
        });
      await seedConfirmedTargets(t);
    },
    { timeout: 30000 }
  );
  fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  const credentials = {
    databaseUrl: url,
    organizationId,
    campusId: id('main'),
    controlCampusId: id('control'),
    accounts,
  };
  const tmp = access + '.' + crypto.randomUUID();
  fs.writeFileSync(tmp, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, access);
  console.log('Created ' + db + '; private access file: ' + access);
}
main()
  .then(() => require('./aiHistoryLifecycle.cjs').seedLifecycle(p,JSON.parse(fs.readFileSync(access,'utf8'))))
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
