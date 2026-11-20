"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportDatabaseSource = reportDatabaseSource;
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
const attendanceStatsService_1 = require("./attendanceStatsService");
const consumptionValuation_1 = require("./consumptionValuation");
const cashflowSummaryService_1 = require("./cashflowSummaryService");
const errorHandler_1 = require("../middleware/errorHandler");
const aiOperatingFacts_1 = require("./aiOperatingFacts");
const managementAccess_1 = require("./managementAccess");
const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const day = (d) => new Date(+d + 8 * 3600000).toISOString().slice(0, 10);
/** Read current authorized business records through the existing attendance/FIFO rules. */
async function reportDatabaseSource(owner, p) {
    if (!owner.campusId)
        throw new errorHandler_1.ApiError('报告需要明确的授权校区', 403, 'REPORT_SCOPE');
    const scope = { organizationId: owner.organizationId, campusId: owner.campusId }, monthStart = p.start.slice(0, 7) + '-01';
    const start = new Date(p.start + 'T00:00:00+08:00'), end = new Date(p.end + 'T23:59:59.999+08:00');
    const data = await database_1.default.$transaction(async (tx) => {
        const actor = await tx.user.findFirst({ where: { id: owner.userId, ...scope, isActive: true, isPlatformAdmin: false }, select: { role: true, managementLevel: true, isPlatformAdmin: true } });
        if (!actor || !['admin', 'manager'].includes((0, managementAccess_1.effectiveRole)(actor)))
            throw new errorHandler_1.ApiError('当前账号已无报告权限', 403, 'REPORT_SCOPE');
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const classes = await tx.class.findMany({ where: scope, select: { id: true, name: true } }), classIds = classes.map(c => c.id);
        const orders = await tx.conversion.findMany({ where: { organizationId: scope.organizationId, approvalStatus: 'confirmed', conversionDate: { gte: monthStart, lte: p.end }, OR: [{ class: scope }, { classId: null, student: scope }, { classId: null, studentId: null, sales: scope }] }, select: { id: true, conversionDate: true, price: true, courseType: true, studentName: true, classId: true, sales: { select: { name: true } } }, take: 5001, orderBy: { id: 'asc' } });
        if (orders.length > 5000)
            throw new errorHandler_1.ApiError('本月成单超过5000条，请缩小报告期间或分批处理', 413, 'REPORT_LIMIT');
        if (orders.some(o => o.price === null))
            throw new errorHandler_1.ApiError('期间已确认成单有缺失价格，先补充金额或明确已知金额口径，未按零生成报告', 422, 'REPORT_MISSING_PRICE');
        const schedules = await tx.schedule.findMany({ where: { ...scope, classId: { in: classIds }, startTime: { gte: start, lte: end }, status: { notIn: ['cancelled', 'canceled'] } }, select: { id: true, classId: true, startTime: true, endTime: true, status: true, teacher: { select: { id: true, name: true, campusId: true, organizationId: true } } }, take: 5001 });
        if (schedules.length > 5000)
            throw new errorHandler_1.ApiError('场次超过5000条，请拆分报告', 413, 'REPORT_LIMIT');
        const completed = schedules.filter(s => s.status === 'completed'), ids = completed.map(s => s.id);
        const [enrollments, attendances, refunds, valuation] = await Promise.all([
            tx.enrollment.findMany({ where: { organizationId: scope.organizationId, classId: { in: classIds } }, select: { classId: true, studentId: true, enrolledAt: true, endedAt: true, status: true } }),
            tx.attendance.findMany({ where: { organizationId: scope.organizationId, scheduleId: { in: ids } }, select: { studentId: true, scheduleId: true, classId: true, status: true, isTemporary: true } }),
            tx.refund.findMany({ where: { organizationId: scope.organizationId, student: scope, status: 'approved', reviewedAt: { gte: start, lte: end } }, select: { id: true, studentName: true, reviewedAt: true, amountToRefund: true } }),
            (0, consumptionValuation_1.readConsumptionValuation)(tx, scope, schedules.map(s => s.id), { start, end })
        ]);
        const attendance = (selected) => (0, attendanceStatsService_1.computeSessionAttendance)({ schedules: selected, enrollments, attendances });
        const all = attendance(completed), isWeekend = (s) => [0, 6].includes(new Date(day(s.startTime) + 'T00:00:00Z').getUTCDay()), weekday = attendance(completed.filter(s => !isWeekend(s))), weekend = attendance(completed.filter(isWeekend));
        const groups = new Map();
        for (const schedule of schedules) {
            const person = schedule.teacher;
            const key = person && person.organizationId === scope.organizationId && person.campusId === scope.campusId ? person.id : '';
            const group = groups.get(key) || [];
            group.push(schedule);
            groups.set(key, group);
        }
        const coaches = [...groups].map(([teacherId, own]) => {
            const a = attendance(own.filter(s => s.status === 'completed')), name = teacherId ? own[0].teacher.name : '未归属授课人';
            return { teacherId: teacherId || null, name, roster: null, due: a.expected, actual: a.present, rate: a.rate,
                consumption: money(own.reduce((n, s) => n + (valuation.bySchedule.get(s.id)?.cents || 0), 0) / 100) };
        });
        const classNames = new Map(classes.map(c => [c.id, c.name]));
        const displayNames = (0, aiOperatingFacts_1.entityDisplayNames)(coaches.filter(c => c.teacherId).map(c => ({ id: c.teacherId, name: c.name,
            classes: (groups.get(c.teacherId) || []).map(s => classNames.get(s.classId) || '班级') })));
        for (const c of coaches)
            if (c.teacherId)
                c.name = displayNames.get(c.teacherId);
        return { orders, refunds, valuation, all, weekday, weekend, coaches, completed: completed.length, recordCount: schedules.length };
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
    const rows = [], add = (kind, payload, source, first = p.start, last = p.end) => rows.push({ kind, period_label: first + '~' + last, status: 'confirmed_fact', source_label: source, payload: { ...payload, _prov: { file: source, sheet: '只读业务查询', row: payload.recordId || null, scope, period: { start: first, end: last } } } });
    const renew = (s) => ['续费', '续报', 'renewal'].includes(s || '');
    for (const o of data.orders)
        add('cash_line', { date: o.conversionDate, dept: (renew(o.courseType) ? '续费' : '新签') + '-' + (o.studentName || '未关联学员'), amount: Number(o.price), venue: '当前授权校区', method: '成单价格口径，非支付流水', closer: o.sales?.name || null, recordId: o.id }, '业务系统/已确认成单', monthStart, p.end);
    const current = data.orders.filter(o => o.conversionDate >= p.start), newOrders = current.filter(o => !renew(o.courseType)), renewals = current.filter(o => renew(o.courseType));
    const gross = money(current.reduce((n, o) => n + Number(o.price), 0)), refund = money(data.refunds.reduce((n, r) => n + Number(r.amountToRefund), 0));
    for (const r of data.refunds)
        add('refund_line', { date: day(r.reviewedAt), amount: Number(r.amountToRefund), name: r.studentName, recordId: r.id }, '业务系统/已确认退费');
    const sourceIds = ['业务系统/已确认成单', '业务系统/已确认退费'];
    add('report_cash_summary', { newSign: money(newOrders.reduce((n, o) => n + Number(o.price), 0)), newCount: newOrders.length, renewal: money(renewals.reduce((n, o) => n + Number(o.price), 0)), renewalCount: renewals.length, cash: { sourceCaliber: 'confirmed_orders', covered: true, income: gross, count: current.length, expenses: null, net: null, fileIncome: money(data.orders.reduce((n, o) => n + Number(o.price), 0)), fileCount: data.orders.length, outsideAmount: money(data.orders.filter(o => o.conversionDate < p.start).reduce((n, o) => n + Number(o.price), 0)), refundsKnown: true, refunds: refund, knownRefunds: refund, netAfterKnownRefunds: money(gross - refund), byType: [{ type: '新签', amount: money(newOrders.reduce((n, o) => n + Number(o.price), 0)), count: newOrders.length }, { type: '续费', amount: money(renewals.reduce((n, o) => n + Number(o.price), 0)), count: renewals.length }] }, missing: ['现金按系统已确认成单价减已确认退费核算，不等同payments历史缴费；完整成本、历史花名册和主管日报另行提供。'] }, sourceIds.join('＋'));
    const sections = {}, venue = '当前授权校区';
    for (const [key, a] of [['总数据', data.all], ['周中数据', data.weekday], ['周末数据', data.weekend]]) {
        sections[key] = { 应到: { [venue]: a.expected, 合计: a.expected }, 实到: { [venue]: a.present, 合计: a.present }, 总消课金额: { [venue]: key === '总数据' ? data.valuation.actualConsumptionAmount : null, 合计: key === '总数据' ? data.valuation.actualConsumptionAmount : null } };
    }
    add('weekly_summary', { caliber: 'database_fifo', current: { period: p.start + '~' + p.end, sections } }, '业务系统/逐场出勤与FIFO课消');
    const attributed = money(data.coaches.reduce((n, c) => n + c.consumption, 0));
    if (Math.abs(attributed - data.valuation.actualConsumptionAmount) < .011)
        for (const c of data.coaches)
            add('coach_summary', c, '业务系统/授课人场次汇总');
    add('source_coverage', { income: true, expense: false, refund: true, issues: ['资料范围为当前授权校区；已取消场次不计，出勤仅计已完成场次，课消复用FIFO和原额更正；缺价历史课消遵循系统按0计规则。', ...(Math.abs(attributed - data.valuation.actualConsumptionAmount) >= .011 ? ['存在未关联授课人的课消，未强行分摊到个人。'] : [])] }, '业务系统/查询范围', monthStart, p.end);
    // Independent existing business-page summary detects accidental scope or period drift.
    const summary = await (0, cashflowSummaryService_1.getCashflowSummary)(scope, { startDate: p.start, endDate: p.end });
    if (Math.abs(summary.totals.grossAmount - gross) > .011 || Math.abs(Number(summary.refund.amount) - refund) > .011 || summary.totals.orderCount !== current.length)
        throw new errorHandler_1.ApiError('报告金额与业务页同期间汇总不一致，已停止生成', 422, 'REPORT_DB_RECONCILIATION');
    return rows;
}
//# sourceMappingURL=reportDatabaseSource.js.map