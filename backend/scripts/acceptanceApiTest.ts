/**
 * 蜂鸣功能验收 · API 对账测试（真实后端 + 真实数据）
 *
 * 前置：
 *   1. 本机 Postgres 运行中，backend/.env 的 DATABASE_URL 指向它
 *   2. 后端已启动（NODE_ENV=development，端口 3000）
 *   3. 已执行 ACCEPT_TEST_PASSWORD=<密码> npx tsx scripts/testCampusInit.ts init
 *
 * 用法：
 *   ACCEPT_TEST_PASSWORD=<密码> npx tsx scripts/acceptanceApiTest.ts
 *
 * 说明：本脚本为本地验收工具，目标地址固定为环回 http://localhost:3000，
 * 不接受任意来源的 URL 输入。断言的预期值来源 docs/acceptance/expected-ledger.md
 * （由初始化脚本按后端口径独立验算），结果写入 docs/acceptance/api-evidence.md。
 * 预期值绑定初始化基准日；跨基准日重跑 init 后请同步更新 EXPECTS。
 */
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000'; // 固定环回地址（本地验收后端）
const PW = process.env.ACCEPT_TEST_PASSWORD ?? '';
if (!PW) {
  console.error('请设置 ACCEPT_TEST_PASSWORD');
  process.exit(1);
}

/* ===== 预期值（对应 expected-ledger.md 基准日 2026-10-31，口径：低出勤分母按入班时间裁剪 / 待续费=active+未标不续费+剩余≤10） ===== */
const EXPECTS: Record<string, any> = {
  lowClasses: { count: 2, idx: [3, 5] },
  lowStudents: { count: 6, nos: [4, 5, 6, 7, 8, 9] },
  continuousLeave: { count: 6, nos: [4, 5, 6, 7, 8, 9] },
  renewal: 6,
  experienceUnconverted: 4,
  rosterCount: 27,
  activeStudents: 27,
  todaySchedules: 1,
  weekConsumption: 37,
  cashflowMonth: { newCount: 20, renewalAmount: 4800, refundCount: 1 },
};

interface Row { name: string; expected: string; actual: string; pass: boolean; note?: string }
const results: Row[] = [];
function rec(name: string, expected: string, actual: string, pass: boolean, note?: string) {
  results.push({ name, expected, actual, pass, note });
  console.log(`${pass ? '✅' : '❌'} ${name} | 预期 ${expected} | 实际 ${actual}${note ? ' | ' + note : ''}`);
}

async function login(email: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await r.json();
  return { ok: r.ok && j?.success, token: j?.data?.token as string, user: j?.data?.user };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
async function get(token: string, url: string) {
  const r = await fetch(`${BASE}${url}`, { headers: auth(token) });
  let j: any = null;
  try { j = await r.json(); } catch { /* html 404 等 */ }
  return { status: r.status, json: j };
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function main() {
  /* ---------- 1. 真实登录（全部角色 + 错误密码） ---------- */
  const admin = await login('accept-admin@accept.buzzer.test');
  rec('登录·校区管理员', '成功+token+机构', admin.ok && admin.token && admin.user?.organizationId ? '成功' : '失败', admin.ok && !!admin.token);
  const teacher = await login('accept-t1@accept.buzzer.test');
  rec('登录·老师(t1)', '成功', teacher.ok ? '成功' : '失败', teacher.ok);
  const sales = await login('accept-s1@accept.buzzer.test');
  rec('登录·销售(s1)', '成功', sales.ok ? '成功' : '失败', sales.ok);
  const parent = await login('accept-parent@accept.buzzer.test');
  rec('登录·家长', '成功', parent.ok ? '成功' : '失败', parent.ok);
  const iso = await login('iso-admin@iso.buzzer.test');
  rec('登录·隔离机构管理员', '成功', iso.ok ? '成功' : '失败', iso.ok);
  const bad = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'accept-admin@accept.buzzer.test', password: 'WrongPass1' }),
  });
  rec('登录·错误密码被拒', '401', String(bad.status), bad.status === 401);
  if (!admin.ok || !iso.ok) { console.error('关键账号登录失败，终止'); process.exit(1); }

  const T = admin.token!;

  /* ---------- 2. 四类首页待处理提醒 ---------- */
  const lc = await get(T, '/api/attendances/low-attendance-classes');
  const lcList: any[] = Array.isArray(lc.json?.data) ? lc.json.data : [];
  const lcNos = lcList.map((x: any) => String(x?.class?.code?.replace('ACC-C', ''))).sort();
  rec('低出勤班级', `数量${EXPECTS.lowClasses.count}（班${EXPECTS.lowClasses.idx.join('/')}）`,
    `数量${lcList.length}（班${lcNos.join('/')}）`,
    lc.status === 200 && lcList.length === EXPECTS.lowClasses.count && EXPECTS.lowClasses.idx.every((i: number) => lcNos.includes(String(i))),
    `rate=${lcList.map((x) => x.attendanceRate + '%').join(',')}`);

  const ls = await get(T, '/api/attendances/low-attendance-students?days=30&threshold=60');
  const lsList: any[] = Array.isArray(ls.json?.data) ? ls.json.data : [];
  const lsNos = lsList.map((x: any) => Number((x.studentName || '').replace('验收学员', '')));
  rec('低出勤学员(30天/60%)', `数量${EXPECTS.lowStudents.count}`,
    `数量${lsList.length}（${lsList.map((x) => `${x.studentName}@${x.attendanceRate}%`).slice(0, 12).join(',')}）`,
    ls.status === 200 && lsList.length === EXPECTS.lowStudents.count && EXPECTS.lowStudents.nos.every((n: number) => lsNos.includes(n)),
    '基准日 10-31：E13 报名前的周日课已出窗（分母 0）退出名单');

  const cl = await get(T, '/api/attendances/continuous-leave');
  const clList: any[] = Array.isArray(cl.json?.data) ? cl.json.data : [];
  const clNos = clList.map((x: any) => Number((x.studentName || '').replace('验收学员', '')));
  rec('连续请假/缺勤', `数量${EXPECTS.continuousLeave.count}`,
    `数量${clList.length}（${clList.map((x) => `${x.studentName}连续${x.continuousAbsentCount}`).join(',')}）`,
    cl.status === 200 && clList.length === EXPECTS.continuousLeave.count && EXPECTS.continuousLeave.nos.every((n: number) => clNos.includes(n)));

  const rn = await get(T, '/api/students?page=1&pageSize=1&status=active&maxRemainingLessons=10&excludeNoRenewal=true');
  rec('待续费学员(active+未标不续费+剩余≤10)', `total=${EXPECTS.renewal}`, `total=${rn.json?.pagination?.total}`,
    rn.json?.pagination?.total === EXPECTS.renewal, '与首页提醒及续费页同口径（P1-04）');
  const rnOld = await get(T, '/api/students?page=1&pageSize=100&maxRemainingLessons=10');
  const rnOldNames = (rnOld.json?.data ?? []).map((s: any) => s.name);
  const stillOld = rnOldNames.filter((n: string) => /验收学员(25|26|27)/.test(n));
  rec('旧口径名单含退费/流失（口径对照观察）', '含25/26/27（无 status 过滤时）', stillOld.length >= 2 ? `含${stillOld.join(',')}` : String(stillOld),
    stillOld.length >= 2, '说明此前 9 人旧口径混入非在读；新口径已排除');

  const ex = await get(T, '/api/experience-lessons/unconverted');
  const exList: any[] = Array.isArray(ex.json?.data) ? ex.json.data : ex.json?.data?.items ?? [];
  rec('体验课未成单回访', `数量${EXPECTS.experienceUnconverted}`, `数量${Array.isArray(exList) ? exList.length : JSON.stringify(ex.json).slice(0, 40)}`,
    ex.status === 200 && Array.isArray(exList) && exList.length === EXPECTS.experienceUnconverted);

  /* ---------- 3. 汇总口径 ---------- */
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  const today = fmt(new Date());
  const cs = await get(T, `/api/consumption/statistics?startDate=${fmt(monday)}&endDate=${today}`);
  rec('在册学员(baseCount)', String(EXPECTS.rosterCount), String(cs.json?.data?.baseCount), cs.json?.data?.baseCount === EXPECTS.rosterCount);
  const wk = cs.json?.data?.totalAttendance;
  rec('本周课消人次', `>=台账基准${EXPECTS.weekConsumption}`, String(wk),
    typeof wk === 'number' && wk >= EXPECTS.weekConsumption,
    '今日若有新增点名会高于基准值（口径=记录时间在本周的 present|late）');

  const monthStart = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-01`;
  const cf = await get(T, `/api/cashflow-summary?startDate=${monthStart}&endDate=${today}`);
  const d = cf.json?.data ?? {};
  const cfPass =
    d?.newSignup?.conversions === EXPECTS.cashflowMonth.newCount &&
    Number(d?.renewal?.amount) === EXPECTS.cashflowMonth.renewalAmount &&
    d?.refund?.count === EXPECTS.cashflowMonth.refundCount;
  rec('现金流月汇总', `新签${EXPECTS.cashflowMonth.newCount}单 续费¥${EXPECTS.cashflowMonth.renewalAmount} 退费${EXPECTS.cashflowMonth.refundCount}人`,
    `新签${d?.newSignup?.conversions}单 续费¥${d?.renewal?.amount} 退费${d?.refund?.count}人`, !!cfPass,
    `待续费≤4人数(续费率分母)=${d?.renewal?.totalEligible}`);

  const sch = await get(T, `/api/schedules?startDate=${today}&endDate=${today}&page=1&pageSize=50`);
  const schTotal = sch.json?.pagination?.total ?? (Array.isArray(sch.json?.data) ? sch.json.data.length : -1);
  rec('今日排课', String(EXPECTS.todaySchedules), String(schTotal), schTotal === EXPECTS.todaySchedules,
    '首页今日课表数据源');

  /* ---------- 4. 机构/校区隔离（后端拒绝，而非菜单隐藏） ---------- */
  const stList = await get(T, '/api/students?page=1&pageSize=200');
  const names: string[] = (stList.json?.data ?? []).map((s: any) => s.name);
  rec('学员列表不含隔离机构学员', '无「隔离学员01」', names.includes('隔离学员01') ? '出现❗' : '未出现',
    !names.includes('隔离学员01'), `列表${names.length}人`);

  const isoStu = await get(iso.token!, '/api/students?page=1&pageSize=10');
  const isoStudentId = (isoStu.json?.data ?? []).find((s: any) => s.name === '隔离学员01')?.id;
  if (isoStudentId) {
    const cross = await get(T, `/api/students/${isoStudentId}`);
    rec('跨机构单查学员被拒', '403/404', String(cross.status), cross.status === 403 || cross.status === 404,
      cross.json?.error?.message ?? '');
    const crossCls = await get(T, '/api/classes?page=1&pageSize=200&search=ISO');
    const isoInList = (crossCls.json?.data ?? []).some((c: any) => c.code === 'ISO-C1');
    rec('班级列表不含隔离机构班级', '未出现', isoInList ? '出现❗' : '未出现', !isoInList);
    const isoView = await get(iso.token!, '/api/students?page=1&pageSize=200');
    const isoSeesAccept = (isoView.json?.data ?? []).some((s: any) => s.name?.startsWith('验收学员'));
    rec('隔离机构看不到验收校区学员', '不可见', isoSeesAccept ? '可见❗' : '不可见', !isoSeesAccept);
  } else {
    rec('跨机构单查学员被拒', '403/404', '未取得隔离学员id，跳过', false, '前置失败');
  }

  /* ---------- 5. 角色数据范围 ---------- */
  const tView = await get(teacher.token!, '/api/students?page=1&pageSize=200');
  rec('老师可见本机构学员', '>0', String((tView.json?.data ?? []).length), (tView.json?.data ?? []).length > 0);
  const sView = await get(sales.token!, '/api/leads?page=1&pageSize=100');
  rec('销售可读线索列表', '200', String(sView.status), sView.status === 200);

  const pStu = await get(parent.token!, '/api/parent/students');
  const pList: any[] = Array.isArray(pStu.json?.data) ? pStu.json.data : [];
  const onlyLinked = pList.length >= 1 && pList.every((s: any) => s.name === '验收学员01');
  rec('家长仅见关联学员', '200 且仅验收学员01', `${pStu.status}（${pList.map((s: any) => s.name).join(',') || 0}人）`,
    pStu.status === 200 && onlyLinked, '/api/parent/students，parentPhone 匹配');
  const pBad = await get(T, '/api/parent/students');
  rec('管理员访问家长接口受限', '非200或空', `${pBad.status}`, pBad.status !== 200 || !pBad.json?.data?.length,
    '验证 /api/parent 仅供 parent 角色');

  /* ---------- 6. 越权写操作被拒 + 家长沙箱负例（P0-01） ---------- */
  const fakeStudent = await fetch(`${BASE}/api/students`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(parent.token!) },
    body: JSON.stringify({ name: '越权测试', organizationId: admin.user.organizationId }),
  });
  rec('家长创建学员被拒(403)', '403', String(fakeStudent.status), fakeStudent.status === 403,
    'requireMinRole(staff) 修复后家长角色被明确拒绝');

  const parentDenied: [string, string][] = [
    ['学员列表', '/api/students?pageSize=100'],
    ['班级列表', '/api/classes'],
    ['成单列表', '/api/conversions'],
    ['全量导出', '/api/students/export/excel'],
    ['AI 经营快照', '/api/ai/context-summary'],
    ['现金流汇总', '/api/cashflow-summary'],
    ['周报', '/api/statistics/weekly-summary'],
    ['月报', '/api/statistics/monthly-summary'],
  ];
  const denyResults: string[] = [];
  let denyAll = true;
  for (const [name, url] of parentDenied) {
    const r = await get(parent.token!, url);
    const ok = r.status === 403;
    denyAll = denyAll && ok;
    denyResults.push(`${name}=${r.status}`);
  }
  rec('家长通用/经营接口全量 403（沙箱）', '8 项全部 403', denyResults.join(' '), denyAll,
    'parentSandbox 中间件；白名单=/api/auth、/api/parent、GET 机构名');
  const parentOk = await get(parent.token!, '/api/parent/students');
  rec('家长白名单接口仍可用', '200', String(parentOk.status), parentOk.status === 200);

  // 转班接口明确 501（不再返回伪成功）
  const transfer = await fetch(`${BASE}/api/enrollments/transfer`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(T) },
    body: JSON.stringify({}),
  });
  rec('enrollments/transfer 明确 501', '501', String(transfer.status), transfer.status === 501,
    '未实现功能不再伪装成功（P2）');

  /* ---------- 7. 其他关键业务接口可用性 ---------- */
  for (const [name, url] of [
    ['蜜月期学员', '/api/honeymoon/students'],
    ['学员低出勤页(student侧)', '/api/students/low-attendance'],
    ['成单列表', '/api/conversions?page=1&pageSize=50'],
    ['体验课列表', '/api/experience-lessons?page=1&pageSize=50'],
    ['AI 经营速览', '/api/ai/context-summary'],
    ['课消班级增减', '/api/consumption/class-student-changes'],
    ['老师列表', '/api/users/teachers'],
  ] as const) {
    const r = await get(T, url);
    rec(`${name} 可用`, '200', String(r.status), r.status === 200);
  }

  /* ---------- 8. dashboard（rbac 注入机构后的隔离观察） ---------- */
  const dash = await get(T, '/api/statistics/dashboard');
  rec('statistics/dashboard 机构隔离', `totalStudents=${EXPECTS.activeStudents}`, String(dash.json?.data?.overview?.totalStudents),
    dash.status === 200 && dash.json?.data?.overview?.totalStudents === EXPECTS.activeStudents,
    'requireOrganizationAccess 中间件注入 req.body.organizationId，GET 也按机构过滤（非缺陷）');

  /* ---------- 输出证据文件 ---------- */
  const pass = results.filter((r) => r.pass).length;
  const L = [
    `# API 对账证据（真实后端 · 真实数据）`,
    ``,
    `- 执行时间：${new Date().toISOString()}`,
    `- 后端：${BASE}（NODE_ENV=development，本机 Postgres）`,
    `- 预期来源：docs/acceptance/expected-ledger.md（基准日 2026-10-30）`,
    `- 结果：**${pass}/${results.length} 通过**`,
    ``,
    `| # | 检查项 | 预期 | 实际 | 结果 | 备注 |`,
    `|---|---|---|---|---|---|`,
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? '✅' : '❌'} | ${r.note ?? ''} |`),
  ];
  const outDir = path.resolve(__dirname, '../../docs/acceptance');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'api-evidence.md'), L.join('\n'), 'utf-8');
  console.log(`\n=== ${pass}/${results.length} 通过，证据已写入 docs/acceptance/api-evidence.md ===`);
  process.exit(pass === results.length ? 0 : 2);
}

main().catch((e) => { console.error('执行异常:', e); process.exit(1); });
