// Versioned synthetic business register. All business identifiers and times are reproducible.
// Legacy default preserves historical evidence. New acceptance uses profile=single-v1.
const { createHash } = require('node:crypto');
const id = (key) => {
  const h = createHash('sha256')
    .update('annual-v1/' + key)
    .digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '4' + h.slice(13, 16),
    'a' + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
};
const at = (day, h = 8) => new Date(day + 'T' + String(h).padStart(2, '0') + ':00:00+08:00');
const first = '2025-11-01',
  last = '2026-11-16',
  handover = '2026-07-01';
const date = (d) => d.toISOString().slice(0, 10);
const plus = (day, n) => date(new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000));
const groups = {
  main: ['林桥运动教育', '林桥全年校区'],
  sister: ['林桥运动教育', '林桥东区'],
  other: ['青田教育', '青田校区'],
  edge: ['边界样本机构', '边界实验校区'],
};
function register(options = {}) {
  const single = options.profile === 'single-v1';
  const fixtures = single ? {...groups, sister:['林桥东区教育（独立机构）','默认业务范围']} : groups;
  const tables = {};
  const put = (t, key, day, data, h = 8) => {
    const r = { id: id(key), createdAt: at(day, h), updatedAt: at(day, h), ...data };
    (tables[t] ??= []).push(r);
    return r;
  };
  const org = (k) => id('org-' + (!single && k === 'sister' ? 'main' : k)),
    scope = (k) => ({ organizationId: org(k), campusId: id('campus-' + k) });
  for (const [k, [on, cn]] of Object.entries(fixtures)) {
    if (single || k !== 'sister')
      put('organization', 'org-' + k, first, { name: on, code: 'ANNUAL_V1_' + k });
    put('campus', 'campus-' + k, first, { organizationId: org(k), name: single ? '默认业务范围' : cn, code: k });
    for (let j = 0; j < (k === 'main' ? 10 : 1); j++)
      put('user', k + '-u' + j, first, {
        ...scope(k),
        email: k + j + '@annual.invalid',
        name:
          j === 0
            ? (single ? on + '管理员' : cn + '经理')
            : ['', '林舟', '周禾', '宋岩', '许秋', '陈澄', '江帆', '叶宁', '方青', '陆远'][j],
        role: j === 0 ? 'staff' : j === 8 ? 'sales' : 'coach',
        managementLevel: j === 0 ? 'manager' : 'none',
        isActive: j !== 9,
      });
    if (k === 'main') continue;
    const s = put('student', k + '-student', first, {
      ...scope(k),
      name: cn + '对照学员',
      salesId: id(k + '-u0'),
    });
    put('conversion', k + '-order', '2026-11-13', {
      organizationId: org(k),
      studentId: s.id,
      studentName: s.name,
      salesId: id(k + '-u0'),
      contact: '00000000000',
      courseType: '新签',
      price: k === 'edge' ? '99999999.99' : k === 'other' ? '823' : '397',
      conversionDate: '2026-11-13',
      approvalStatus: k === 'edge' ? 'voided' : 'confirmed',
    });
    if (k === 'edge')
      put('conversion', 'edge-malformed', '2026-11-13', {
        organizationId: org(k),
        studentName: '缺失关联记录',
        contact: '',
        courseType: '新签',
        price: 1,
        conversionDate: '2026-02-31',
        approvalStatus: 'pending',
      });
  }
  const tenant = scope('main'),
    o = { organizationId: org('main') },
    user = (j) => id('main-u' + j),
    cl = (j) => id('class' + j);
  const classes = [],
    people = [],
    ranges = [];
  const coach = (j, day) => (j === 1 ? (day < handover ? 9 : 1) : 1 + ((j - 1) % 7));
  for (let j = 1; j <= 20; j++) {
    const begin = j === 20 ? last : first;
    classes[j] = put('class', 'class' + j, begin, {
      ...tenant,
      code: 'LQ' + String(j).padStart(2, '0'),
      name: j === 20 ? '展翼新班' : '林桥运动' + String(j).padStart(2, '0') + '班',
      courseType: '综合体能',
      teacherId: user(coach(j, last)),
      status: j === 19 ? 'inactive' : 'active',
      startDate: at(begin),
      endDate: j === 19 ? at('2026-09-01') : null,
    });
  }
  put('resourceTransfer', 'handover', handover, {
    ...o,
    fromTeacherId: user(9),
    fromTeacherName: '陆远',
    toTeacherId: user(1),
    toTeacherName: '林舟',
    operatedBy: user(0),
    status: 'completed',
    transferDetails: { classes: [{ id: cl(1), name: classes[1].name }] },
    notes: '陆远离职，林桥运动01班交由林舟，已结课保留原授课人。',
  });
  const months = Array.from({ length: 13 }, (_, i) =>
    date(new Date(Date.UTC(2025, 10 + i, 1))).slice(0, 7)
  );
  const name = (n) =>
    ['沈', '夏', '许', '陶', '周', '叶', '陆', '陈', '李', '林'][n % 10] +
    ['嘉', '清', '嘉', '和', '知', '景', '之', '亦', '予', '明', '如', '子', '一', '思', '以'][
      Math.floor((n - 1) / 10)
    ] +
    ['安', '禾', '桐', '晴', '远', '文', '宁'][n % 7];
  const addRange = (n, j, from, to, status) => {
    ranges.push({ n, j, from, to });
    put('enrollment', 'en' + n + '-' + j, from, {
      ...o,
      studentId: id('s' + n),
      classId: cl(j),
      enrolledBy: user(0),
      enrolledAt: at(from),
      endedAt: to ? at(to, 0) : null,
      status: status || 'active',
    });
  };
  function credit(n, day, renew = false) {
    const p = people[n],
      units = 16,
      unit = 8000 + (n % 5) * 500,
      key = 'order' + n + '-' + p.lots.length,
      price = (units * unit) / 100;
    const active = ranges.find((r) => r.n === n && r.from <= day && (!r.to || day < r.to));
    const trial = !renew && n % 4 === 0;
    const order = put('conversion', key, day, {
      ...o,
      studentId: p.row.id,
      studentName: p.row.name,
      contact: p.row.phone,
      classId: active ? cl(active.j) : null,
      className: active ? classes[active.j].name : null,
      salesId: user(8),
      salesName: '方青',
      courseType: renew ? '续费' : '新签',
      totalLessons: units,
      price,
      paymentMethod: 'wechat',
      paymentStatus: 'paid',
      approvalStatus: 'confirmed',
      conversionDate: day,
      experienceLessonId: trial ? id('trial' + n) : null,
    });
    const log = put('lessonLog', 'credit' + key, day, {
      ...o,
      studentId: p.row.id,
      studentName: p.row.name,
      type: 'add',
      lessons: units,
      lessonSource: 'paid',
      operatorId: user(8),
      businessDate: day,
      conversionId: order.id,
      creditAmountCents: units * unit,
      notes: renew ? '续费入账' : '新签入账',
    });
    p.lots.push({ id: log.id, unit, used: 0, total: units });
    p.row.remainingLessons += units;
    p.row.purchasedLessons += units;
    p.row.totalPayment += price;
  }
  for (let n = 1; n <= 150; n++) {
    const cohort = n <= 54 ? 0 : Math.ceil((n - 54) / 8),
      start = months[cohort] + '-' + String(3 + (n % 9)).padStart(2, '0'),
      j = 1 + ((n - 1) % 19);
    const row = put('student', 's' + n, start, {
      ...tenant,
      name: name(n),
      phone: '13988' + String(n).padStart(6, '0'),
      salesId: user(8),
      recordedAge: 6 + (n % 7),
      totalPayment: 0,
      remainingLessons: 0,
      purchasedLessons: 0,
      consumedLessons: 0,
      cardOpenDate: at(start),
      status: 'active',
    });
    people[n] = { row, start, lots: [] };
    if (n % 4 === 0)
      put('experienceLesson', 'trial' + n, plus(start, -1), {
        ...o,
        studentName: row.name,
        contact: row.phone,
        classId: cl(j === 19 && start >= '2026-09-01' ? 18 : j),
        teachingTeacherId: user(coach(j, plus(start, -1))),
        assigneeId: user(8),
        scheduleDate: plus(start, -1),
        status: 'converted',
        convertedAt: start,
      });
    if (n % 31 !== 0) {
      const stopped = j === 19 && start < '2026-09-01',
        switched = n === 1,
        exit = n === 2 || n === 3,
        end = switched ? '2026-03-01' : exit ? '2026-05-01' : stopped ? '2026-09-01' : null;
      addRange(
        n,
        j === 19 && !stopped ? 18 : j,
        start,
        end,
        switched || stopped ? 'transferred' : exit ? 'cancelled' : null
      );
      if (switched || stopped) addRange(n, switched ? 2 : 18, end, null);
      if (n % 27 === 0) addRange(n, j === 8 ? 9 : 8, start, null);
    }
    credit(n, start);
  }
  for (let m = 0; m < 13; m++)
    put('experienceLesson', 'unconverted' + m, months[m] + '-12', {
      ...o,
      studentName: '体验访客' + (m + 1),
      contact: '1389900' + String(m + 1).padStart(4, '0'),
      classId: cl(1),
      assigneeId: user(8),
      teachingTeacherId: user(coach(1, months[m] + '-12')),
      scheduleDate: months[m] + '-12',
      status: 'completed',
    });
  const pendingMakeups = new Map();
  for (let day = first; day <= last; day = plus(day, 1)) {
    for (let j = 1; j < 20; j++) {
      if (j === 19 && day >= '2026-09-01') continue;
      const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
      if (weekday !== j % 7) continue;
      const h = 9 + 2 * Math.floor((j - 1) / 7),
        t = user(coach(j, day)),
        key = 'session' + day + '-' + j;
      const seats = ranges.filter((r) => r.j === j && r.from <= day && (!r.to || day < r.to));
      if (!seats.length) continue;
      const sched = put(
        'schedule',
        key,
        day,
        {
          ...tenant,
          classId: cl(j),
          teacherId: t,
          startTime: at(day, h),
          endTime: at(day, h + 1),
          classroom: '体能室' + j,
          status: 'completed',
        },
        h
      );
      const makeup = [...pendingMakeups.entries()].find(
        ([n, miss]) =>
          miss.day < day &&
          day <= plus(miss.day, 6) &&
          miss.j !== j &&
          !seats.some((seat) => seat.n === n) &&
          ranges.some((r) => r.n === n && r.from <= day && (!r.to || day < r.to))
      );
      if (makeup) seats.push({ n: makeup[0], makeupOf: makeup[1].id });
      for (const { n, makeupOf } of seats) {
        const p = people[n],
          v = (n * 11 + Math.floor(Date.parse(day) / 86400000)) % 23;
        const status = makeupOf ? 'present' : v === 0 ? 'leave' : v === 3 ? 'absent' : 'present';
        if (status === 'leave') pendingMakeups.set(n, { id: sched.id, j, day });
        if (makeupOf) pendingMakeups.delete(n);
        put(
          'attendance',
          key + 'at' + n,
          day,
          {
            ...o,
            scheduleId: sched.id,
            classId: cl(j),
            studentId: p.row.id,
            checkedInBy: t,
            status,
            checkInTime: at(day, h),
            isTemporary: Boolean(makeupOf),
            notes: makeupOf ? '补课，原请假场次 ' + makeupOf : null,
          },
          h
        );
        if (status !== 'present') continue;
        if (p.row.remainingLessons <= 2) credit(n, day, true);
        const lot = p.lots.find((l) => l.used < l.total);
        put(
          'lessonLog',
          key + 'ded' + n,
          day,
          {
            ...o,
            studentId: p.row.id,
            studentName: p.row.name,
            scheduleId: sched.id,
            type: 'deduct',
            lessons: 1,
            businessDate: day,
            operatorId: t,
            lessonSource: 'paid',
            allocations: [{ lotId: lot.id, start: lot.used++, lessons: 1, amountCents: lot.unit }],
            notes: '场次签到扣课',
          },
          h
        );
        p.row.consumedLessons++;
        p.row.remainingLessons--;
        p.row.lastClassDate = at(day, h);
      }
    }
  }
  for (const n of [2, 3]) {
    const p = people[n],
      day = '2026-05-01';
    p.row.status = n === 2 ? 'refunded' : 'lost';
    if (n === 3) {
      Object.assign(p.row, {
        renewalStatus: 'no_renewal',
        noRenewalDate: at(day),
        noRenewalReason: '家庭迁居',
      });
      continue;
    }
    const allocations = p.lots
      .filter((l) => l.used < l.total)
      .map((l) => ({
        lotId: l.id,
        start: l.used,
        lessons: l.total - l.used,
        amountCents: (l.total - l.used) * l.unit,
      }));
    const amount = allocations.reduce((s, l) => s + l.amountCents, 0) / 100,
      units = p.row.remainingLessons;
    put('refund', 'refund' + n, day, {
      ...o,
      studentId: p.row.id,
      studentName: p.row.name,
      amountToRefund: amount,
      lessonsToRefund: units,
      reason: '搬迁退班',
      status: 'approved',
      submittedById: user(0),
      reviewedAt: at(day),
      reviewedById: user(0),
    });
    put('lessonLog', 'refundlog' + n, day, {
      ...o,
      studentId: p.row.id,
      studentName: p.row.name,
      type: 'refund',
      refundId: id('refund' + n),
      businessDate: day,
      operatorId: user(0),
      lessons: units,
      allocations,
      notes: '退费确认',
    });
    Object.assign(p.row, {
      remainingLessons: 0,
      purchasedLessons: p.row.purchasedLessons - units,
      refundDate: at(day),
      refundReason: '搬迁退班',
    });
  }
  put('schedule', 'future-slot', plus(last, 1), {
    ...tenant,
    classId: cl(20),
    teacherId: user(coach(20, last)),
    startTime: at(plus(last, 1), 15),
    endTime: at(plus(last, 1), 16),
    status: 'scheduled',
    classroom: '展翼馆',
  });
  return tables;
}
module.exports = { register, id, groups, last, first, at };
