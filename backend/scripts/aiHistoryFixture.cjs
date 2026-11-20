// Versioned synthetic source ledger. Dates are Shanghai business days, money is integer cents.
const crypto = require('node:crypto');
const id = (key) => {
  const h = crypto
    .createHash('sha256')
    .update('greatstart-ai-history-v1/' + key)
    .digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '4' + h.slice(13, 16),
    '8' + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
};
const org = 'org',
  campus = 'main',
  comparison = 'control';
const users = {
  manager: '验收校长',
  controlManager: '对照校长',
  coachA: '乔老师',
  coachB: '温老师',
  seller: '卫顾问',
  controlCoach: '对照老师',
};
const classes = {
  A: ['晨光班', 'coachA'],
  B: ['星河班', 'coachB'],
  Z: ['待开新班', 'coachB'],
  X: ['外校对照班', 'controlCoach'],
};
const roster = { A: [1, 2, 3, 4, 5], B: [1, 6, 7, 8, 9], X: [12], Z: [] };
const students = [
  '',
  '夏禾',
  '夏禾',
  '秋语',
  '小澄',
  '晓星',
  '小满',
  '小岚',
  '朝阳',
  '小溪',
  '未分班学员',
  '秋季转班学员',
  '对照学员',
];
// Before October student 11 studied in A, then transferred to B. Student 1 attends both throughout.
const sessions = [];
function session(day, cls, teacher, expected, arrived, status = 'completed') {
  sessions.push({ day, cls, teacher, expected, arrived, status });
}
for (const day of [
  '2026-09-01',
  '2026-09-30',
  '2026-10-16',
  '2026-10-18',
  '2026-11-01',
  '2026-11-16',
]) {
  const sep = day.startsWith('2026-09'),
    oct = day.startsWith('2026-10');
  const a = [...roster.A, ...(sep ? [11] : [])],
    b = [...roster.B, ...(sep ? [] : [11])];
  const first = day.endsWith('-16');
  session(day, 'A', sep ? 'coachB' : 'coachA', a, sep ? a : oct ? (first ? [4, 5] : [5]) : [5]);
  session(day, 'B', 'coachB', b, sep ? [1, 6, 7] : oct ? (first ? [7, 8, 9, 11] : [9, 11]) : [11]);
}
session('2026-10-18', 'X', 'controlCoach', [12], [12]);
session('2026-12-02', 'Z', 'coachB', [], [], 'scheduled');
session('2026-10-31', 'A', 'coachA', [], [], 'cancelled');
// Each entry contains day, contract class, buyer, salesperson, order kind, price in cents, approval state.
const orders = [
  ['2026-09-01', 'A', 1, 'seller', '新签', 120001],
  ['2026-09-30', null, 10, 'seller', '新签', 79999],
  ['2026-10-01', 'A', 2, 'coachA', '新签', 120000],
  ['2026-10-16', 'B', 6, 'seller', '续费', 50000],
  ['2026-10-17', null, 10, 'seller', '新签', 60000],
  ['2026-10-18', 'A', 1, 'seller', 'renewal', 50000],
  ['2026-10-31', 'B', 8, 'coachB', '新签', 30001],
  ['2026-10-31', 'A', 4, 'coachA', '新签', 9999999999, 'voided'],
  ['2026-10-31', 'X', 12, 'controlCoach', '新签', 777777],
  ['2026-11-01', 'A', 2, 'coachA', '续报', 24000],
  ['2026-11-16', null, 10, 'seller', '新签', 1],
  ['2026-11-17', 'B', 8, 'seller', '新签', 33333],
  ['2026-11-10', 'A', 3, 'coachA', '新签', 82000, 'pending'],
];
const refunds = [
  ['2026-09-30', 1, 0, 1000, 'approved'],
  ['2026-10-01', 1, 0, 3000, 'approved'],
  ['2026-10-31', 2, 2, 3999, 'approved'],
  ['2026-11-01', 2, 2, 4000, 'approved'],
  ['2026-10-25', 2, 2, 9999, 'rejected'],
  ['2026-10-31', 12, 8, 12345, 'approved'],
];
const ranges = [
  ['sept', '2026-09-01', '2026-09-30'],
  ['oct', '2026-10-01', '2026-10-31'],
  ['novToDate', '2026-11-01', '2026-11-16'],
  ['last30', '2026-10-18', '2026-11-16'],
  ['explicit32', '2026-10-16', '2026-11-16'],
  ['target', '2026-12-01', '2026-12-31'],
  ['controlOct', '2026-10-01', '2026-10-31', true],
];
// Independent oracle uses the signed register and explicit expected seats on each occurrence.
// It imports neither Prisma nor application services, and never reads their responses.
function expected(start, end, external = false) {
  const within = (day) => day >= start && day <= end;
  const signed = orders.filter(
    ([d, cls, , , , , status]) =>
      within(d) && (cls === 'X') === external && (!status || status === 'confirmed')
  );
  const values = (rows) => rows.reduce((sum, r) => sum + r[5], 0);
  const fresh = signed.filter((r) => r[4] === '新签'),
    renew = signed.filter((r) => r[4] !== '新签');
  const refund = refunds
    .filter(
      ([d, student, , , status]) =>
        within(d) && (student === 12) === external && status === 'approved'
    )
    .reduce((s, r) => s + r[3], 0);
  const sales = {};
  for (const row of signed) sales[row[3]] = (sales[row[3]] || 0) + row[5];
  const people = new Map(),
    teaching = {};
  let due = 0,
    arrived = 0;
  for (const s of sessions.filter(
    (s) => within(s.day) && (s.cls === 'X') === external && s.status === 'completed'
  )) {
    due += s.expected.length;
    arrived += s.arrived.length;
    const t = (teaching[s.teacher] ||= { due: 0, arrived: 0 });
    t.due += s.expected.length;
    t.arrived += s.arrived.length;
    for (const n of s.expected) {
      const k = s.cls + '-' + n,
        p = people.get(k) || { student: n, cls: s.cls, due: 0, arrived: 0 };
      p.due++;
      p.arrived += Number(s.arrived.includes(n));
      people.set(k, p);
    }
  }
  const low = [...people.values()].filter((p) => Math.round((p.arrived / p.due) * 100) < 60);
  const distribution = {};
  for (const p of low) {
    const rate = Math.round((100 * p.arrived) / p.due);
    distribution[rate] = (distribution[rate] || 0) + 1;
  }
  return {
    signupCount: fresh.length,
    renewalCount: renew.length,
    signup: values(fresh),
    renewal: values(renew),
    refund,
    gross: values(signed),
    net: values(signed) - refund,
    sales,
    teaching,
    due,
    arrived,
    low,
    uniqueLow: new Set(low.map((p) => p.student)).size,
    distribution,
  };
}
module.exports = {
  id,
  org,
  campus,
  comparison,
  users,
  classes,
  students,
  roster,
  sessions,
  orders,
  refunds,
  ranges,
  expected,
};
