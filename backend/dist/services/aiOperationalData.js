"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationalRange = operationalRange;
exports.attendanceFollowup = attendanceFollowup;
exports.experienceOverview = experienceOverview;
exports.classStudentChanges = classStudentChanges;
exports.teacherPerformance = teacherPerformance;
exports.studentAttendance = studentAttendance;
const attendanceStatsService_1 = require("./attendanceStatsService");
const aiOperatingFacts_1 = require("./aiOperatingFacts");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const experienceScope_1 = require("../utils/experienceScope");
const database_1 = __importDefault(require("../config/database"));
const currentEnrollment_1 = require("./currentEnrollment");
const DAY = 86400000;
function operationalRange(ctx, params, days = 30) {
    const end = String(params.endDate || ctx.today);
    const start = String(params.startDate || new Date(new Date(end + 'T00:00:00Z').getTime() - (days - 1) * DAY).toISOString().slice(0, 10));
    return { start, end, from: new Date(start + 'T00:00:00+08:00'), to: new Date(new Date(end + 'T00:00:00+08:00').getTime() + DAY) };
}
function evidence(ctx, tool, title, range, columns, rows, totals, caliber, missing = []) {
    return { evidenceId: (0, crypto_1.randomUUID)(), tool, title, unit: '', timeRange: { start: range.start, end: range.end },
        generatedAt: new Date().toISOString(), filters: { campusId: ctx.campusId },
        columns: columns.map(key => ({ key, label: key })), rows, totals, caliber, missing, error: null,
        modelText: JSON.stringify({ 期间: { start: range.start, end: range.end }, 汇总: totals, 明细预览: rows.slice(0, 8), 口径: caliber, 提示: missing }).slice(0, 3000) };
}
/** 完成场次按课程日期归集，保留同一学员在不同班级的记录。 */
async function attendanceFollowup(ctx, params, byClass) {
    if (!ctx.campusId)
        throw new Error('请先选择校区');
    const range = operationalRange(ctx, params, byClass ? 14 : 30);
    const threshold = Number(params.threshold ?? 60);
    const inclusive = params.thresholdMode === 'lte';
    const qualifies = (rate) => rate !== null && (inclusive ? rate <= threshold : rate < threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)
        throw new Error('出勤率阈值应为 0 至 100');
    const classes = await database_1.default.class.findMany({ where: { organizationId: ctx.organizationId, campusId: ctx.campusId, status: 'active' }, select: { id: true, name: true, teacher: { select: { id: true, organizationId: true, campusId: true, name: true } } } });
    const ids = classes.map(c => c.id);
    const [sessions, enrollments, attendances, currentStudents] = await Promise.all([
        database_1.default.schedule.findMany({ where: { organizationId: ctx.organizationId, campusId: ctx.campusId, classId: { in: ids }, status: 'completed', startTime: { gte: range.from, lt: range.to } }, select: { id: true, classId: true, startTime: true, endTime: true } }),
        database_1.default.enrollment.findMany({ where: { organizationId: ctx.organizationId, classId: { in: ids } }, select: { status: true, endedAt: true, classId: true, studentId: true, enrolledAt: true, student: { select: { name: true } } } }),
        database_1.default.attendance.findMany({ where: { organizationId: ctx.organizationId, classId: { in: ids }, schedule: { organizationId: ctx.organizationId, campusId: ctx.campusId, status: 'completed', startTime: { gte: range.from, lt: range.to } } }, select: { scheduleId: true, classId: true, studentId: true, status: true, isTemporary: true, student: { select: { name: true } } } }),
        database_1.default.student.findMany({ where: {
                organizationId: ctx.organizationId, campusId: ctx.campusId, status: 'active',
                OR: [{ renewalStatus: null }, { renewalStatus: { not: 'no_renewal' } }],
                enrollments: { some: (0, currentEnrollment_1.currentEnrollmentWhere)(ctx) },
            }, select: { id: true } }),
    ]);
    const currentStudentIds = new Set(currentStudents.map(student => student.id));
    const rows = [];
    for (const cls of classes) {
        const roster = enrollments.filter(e => e.classId === cls.id);
        const lessons = sessions.filter(s => s.classId === cls.id);
        const teacher = cls.teacher?.organizationId === ctx.organizationId && cls.teacher?.campusId === ctx.campusId ? cls.teacher : null;
        const names = new Map([...roster, ...attendances.filter(a => a.classId === cls.id)].map(e => [e.studentId, e.student.name]));
        const facts = (0, attendanceStatsService_1.computeStudentSessions)({ schedules: lessons, enrollments: roster, attendances: attendances.filter(a => a.classId === cls.id) });
        const studentRow = (f) => ({ studentId: f.studentId, classId: cls.id, teacherId: teacher?.id ?? null, 姓名: names.get(f.studentId) || '学员', 班级: cls.name, 负责老师: teacher?.name || '待分配', 应到: f.expected, 实到: f.present, 缺席: f.expected - f.present, 出勤率: f.rate, 含临时串课: f.isTemporary ? '是' : '否' });
        // 班级出勤保留发生时的全部有效历史；名单仅限当前仍在读且已入班的学员。
        const students = facts.map(studentRow);
        const low = facts.filter(f => currentStudentIds.has(f.studentId) && qualifies(f.rate)).map(studentRow);
        if (!byClass) {
            rows.push(...low);
            continue;
        }
        const expected = students.reduce((n, s) => n + s.应到, 0);
        const present = students.reduce((n, s) => n + s.实到, 0);
        const rate = expected ? Math.round(present / expected * 100) : null;
        if (qualifies(rate))
            rows.push({ classId: cls.id, teacherId: teacher?.id ?? null, 班级: cls.name, 负责老师: teacher?.name || '待分配', 学员数: new Set(roster.filter(e => e.status === 'active' && !e.endedAt).map(e => e.studentId)).size, 临时串课人次: new Set(attendances.filter(a => a.classId === cls.id && a.isTemporary).map(a => a.scheduleId + ':' + a.studentId)).size, 已完成场次: lessons.length, 应到: expected, 实到: present, 出勤率: rate, 低出勤学员数: low.length });
    }
    rows.sort((a, b) => Number(a.出勤率) - Number(b.出勤率) || String(a.classId).localeCompare(String(b.classId)) || String(a.studentId).localeCompare(String(b.studentId)));
    const rates = new Map();
    for (const row of rows)
        rates.set(Number(row.出勤率), (rates.get(Number(row.出勤率)) ?? 0) + 1);
    const totals = { 记录数: rows.length, 阈值: threshold };
    if (!byClass)
        totals.去重学员人数 = new Set(rows.map(row => row.studentId)).size;
    for (const [rate, count] of rates)
        totals[`出勤率 ${rate}% 的记录数`] = count;
    return evidence(ctx, byClass ? 'low_attendance_classes' : 'low_attendance_students', byClass ? '低出勤班级' : '低出勤学员', range, byClass ? ['班级', '负责老师', '学员数', '临时串课人次', '已完成场次', '应到', '实到', '出勤率', '低出勤学员数'] : ['姓名', '班级', '负责老师', '应到', '实到', '缺席', '出勤率', '含临时串课'], rows, totals, `出勤率按整数显示值分组；已完成课程按课程日期统计；正式名单按有效入班时段；已保存串课只计对应场次应到；出勤含到课和迟到；出勤率${inclusive ? '不高于' : '低于'}${threshold}%；零课次不列入；低出勤学员仅含当前在读且已入班者，未入班、已确定不续费、流失及归档者不列入；班级历史出勤不因当前离班而重写；同一学员按班分别列示；学员数为当前有效正式报名去重人数，临时串课人次单列`);
}
/** 尚无独立校区字段时，按关联班级或无班记录的负责员工校区归属，不扩大至机构全部。 */
async function experienceOverview(ctx, params) {
    if (!ctx.campusId)
        throw new Error('请先选择校区');
    const range = operationalRange(ctx, params, 7);
    const unconverted = params.unconvertedOnly === 'true';
    const where = { ...(0, experienceScope_1.experienceScopeWhere)(ctx.organizationId, ctx.campusId), scheduleDate: { gte: range.start, lte: range.end }, ...(unconverted ? { status: { in: ['completed', 'unconverted', 'noshow', 'no-show'] } } : {}) };
    const found = await database_1.default.experienceLesson.findMany({ where, orderBy: [{ scheduleDate: 'asc' }, { id: 'asc' }], take: 5001 });
    if (found.length > 5000)
        throw new Error('超过 5000 条，请缩小日期范围后重试');
    // Cached display strings may be stale or name a different campus. Resolve only scoped IDs.
    const classIds = [...new Set(found.map(row => row.classId).filter((id) => Boolean(id)))];
    const userIds = [...new Set(found.flatMap(row => [row.assigneeId, row.teachingTeacherId]).filter((id) => Boolean(id)))];
    const [linkedClasses, linkedUsers] = await Promise.all([
        database_1.default.class.findMany({ where: { id: { in: classIds }, organizationId: ctx.organizationId, campusId: ctx.campusId }, select: { id: true, name: true } }),
        database_1.default.user.findMany({ where: { id: { in: userIds }, organizationId: ctx.organizationId, campusId: ctx.campusId }, select: { id: true, name: true } }),
    ]);
    const classNames = new Map(linkedClasses.map(row => [row.id, row.name.trim()]));
    const userNames = new Map(linkedUsers.map(row => [row.id, row.name.trim()]));
    const linkedName = (id, safeNames, absent, unknown) => id ? safeNames.get(id) || unknown : absent;
    const names = { pending: '待上课', completed: '已到场未成单', converted: '已成单', unconverted: '未成单', noshow: '未到场', 'no-show': '未到场', cancelled: '已取消', canceled: '已取消' };
    const rows = found.map(r => ({ 姓名: r.studentName, 体验日期: r.scheduleDate, 时间: r.startTime || '', 班级: linkedName(r.classId, classNames, '未关联班级', '班级未知'), 授课老师: linkedName(r.teachingTeacherId, userNames, '未关联授课老师', '授课老师未知'), 负责人: linkedName(r.assigneeId, userNames, '未关联负责人', '负责人未知'), 状态: names[r.status] || r.status, 备注: r.notes || '' }));
    const converted = found.filter(r => r.status === 'converted').length;
    const arrived = found.filter(r => ['completed', 'converted', 'unconverted'].includes(r.status)).length;
    return evidence(ctx, 'experience_overview', unconverted ? '体验课未成单名单' : '体验课情况', range, ['姓名', '体验日期', '时间', '班级', '授课老师', '负责人', '状态', '备注'], rows, { 登记数: found.filter(r => !['cancelled', 'canceled'].includes(r.status)).length, 已取消数: found.filter(r => ['cancelled', 'canceled'].includes(r.status)).length, 到场数: arrived, 成单数: converted, 未到场数: found.filter(r => ['noshow', 'no-show'].includes(r.status)).length, 到场成单率: arrived ? Math.round(converted / arrived * 100) : null }, '登记数为有效未取消的体验邀约，取消单独列示；按体验日期统计；按关联班级或未分班记录的负责人校区归属；未成单名单包含到场未报名及未到场，待上课单独列示', ['未关联班级且无本校区负责人的记录暂不纳入', '班级、授课老师与负责人按本校区真实关联取名；未关联与名称未知分别标注，不回退到可能过期的冗余名称', '备注仅为现有备注，不推定为最近跟进记录']);
}
/** 班级学员变化监测：与课消收入总结页「班级学员变化监测」同口径；期初/流失/净变化证据不足时留空，不当作 0。 */
async function classStudentChanges(ctx, params) {
    if (!ctx.campusId)
        throw new Error('请先选择校区');
    const range = operationalRange(ctx, params, 30);
    const classes = await database_1.default.class.findMany({
        where: { organizationId: ctx.organizationId, campusId: ctx.campusId, status: 'active' },
        include: { teacher: { select: { id: true, name: true, campusId: true, organizationId: true } } },
    });
    const ids = classes.map(c => c.id);
    const enrollments = ids.length ? await database_1.default.enrollment.findMany({
        where: { organizationId: ctx.organizationId, classId: { in: ids }, student: { organizationId: ctx.organizationId, campusId: ctx.campusId } },
        include: { student: { select: { status: true } } },
    }) : [];
    const rows = classes.map(cls => {
        const own = enrollments.filter(e => e.classId === cls.id);
        const current = new Set(own.filter(e => e.status === 'active' && e.student.status === 'active').map(e => e.studentId)).size;
        const added = new Set(own.filter(e => e.enrolledAt >= range.from && e.enrolledAt < range.to).map(e => e.studentId)).size;
        return {
            班级: cls.name,
            班级代码: cls.code,
            负责老师: cls.teacher && cls.teacher.campusId === ctx.campusId && cls.teacher.organizationId === ctx.organizationId ? cls.teacher.name : '未分配',
            当前在读人数: current,
            班级容量: cls.capacity,
            '满班率(%)': cls.capacity > 0 ? Math.round((current / cls.capacity) * 1000) / 10 : null,
            区间入班人数: added,
            期初人数: null,
            流失人数: null,
            净变化: null,
        };
    });
    return evidence(ctx, 'class_student_changes', '班级学员变化监测', range, ['班级', '班级代码', '负责老师', '当前在读人数', '班级容量', '满班率(%)', '区间入班人数', '期初人数', '流失人数', '净变化'], rows, {
        活跃班级数: rows.length,
        区间入班合计: rows.reduce((n, r) => n + r.区间入班人数, 0),
        期初人数: null,
        流失人数: null,
        净变化: null,
    }, '当前在读 = 报名状态与学员状态均为有效；入班按报名建档时间落在区间内并按学员去重；满班率 = 当前在读 ÷ 班级容量；按当前活跃班级列示；期初人数、流失与净变化缺少历史快照证据时留空，不当作 0', ['期初人数、流失与净变化缺少历史快照证据，不可核定，留空不当作 0', '负责老师按报名所属机构与校区归属取名；跨校区老师显示未分配']);
}
// Historical work belongs to the teacher on each occurrence. Current class responsibility is a separate snapshot.
async function teacherPerformance(ctx, params) {
    if (!ctx.campusId)
        throw new Error('请先选择校区');
    const scope = { organizationId: ctx.organizationId, campusId: ctx.campusId };
    const period = operationalRange(ctx, params);
    return database_1.default.$transaction(async (tx) => {
        const classId = typeof params.classId === 'string' ? params.classId : null;
        const className = typeof params.className === 'string' ? params.className.trim() : null;
        const classes = await tx.class.findMany({ where: { ...scope, ...(classId ? { id: classId } : {}), ...(className ? { name: className } : {}) }, select: { id: true, name: true, teacherId: true, status: true } });
        if ((classId || className) && classes.length !== 1)
            return evidence(ctx, 'teacher_performance', '老师授课与班级职责', period, [], [], {}, '仅匹配授权范围内的班级。', [classes.length ? '存在多个同名班级，请提供完整班级编号。' : '当前范围未找到该班级，请核对班名或编号。']);
        const classIds = classes.map(c => c.id);
        const sessions = await tx.schedule.findMany({ where: { ...scope, classId: { in: classIds }, status: 'completed', startTime: { gte: period.from, lt: period.to } }, select: { id: true, classId: true, teacherId: true, startTime: true, endTime: true } });
        const active = classes.filter(c => c.status === 'active');
        const ids = [...new Set([...sessions, ...active].map(s => s.teacherId).filter((id) => !!id))];
        const [staff, enrollments, attendances] = await Promise.all([
            tx.user.findMany({ where: { ...scope, isPlatformAdmin: false, OR: [{ id: { in: ids } }, { role: { in: ['teacher', 'coach'] }, isActive: true }] }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
            tx.enrollment.findMany({ where: { organizationId: ctx.organizationId, classId: { in: classIds } }, select: { classId: true, studentId: true, enrolledAt: true, endedAt: true, status: true } }),
            tx.attendance.findMany({ where: { organizationId: ctx.organizationId, scheduleId: { in: sessions.map(s => s.id) } }, select: { classId: true, scheduleId: true, studentId: true, status: true, isTemporary: true } }),
        ]);
        const teacherId = typeof params.teacherId === 'string' ? params.teacherId : '';
        const teacherName = typeof params.teacherName === 'string' ? params.teacherName.trim() : '';
        const classTeachers = new Set(ids);
        const teachers = staff.filter(t => (!(classId || className) || classTeachers.has(t.id)) && (!teacherId || t.id === teacherId) && (!teacherName || t.name === teacherName));
        if (!teachers.length && (teacherId || teacherName))
            return evidence(ctx, 'teacher_performance', '老师授课与班级职责', period, [], [], {}, '仅按当前授权范围内的人员匹配。', ['未找到符合姓名或编号的可识别老师，请核对姓名、编号或校区。']);
        const classNames = new Map(classes.map(c => [c.id, c.name]));
        const teacherClasses = new Map();
        for (const row of [...active.map(c => ({ teacherId: c.teacherId, classId: c.id })), ...sessions]) {
            if (!row.teacherId)
                continue;
            const group = teacherClasses.get(row.teacherId) || new Set();
            const label = classNames.get(row.classId);
            if (label)
                group.add(label);
            teacherClasses.set(row.teacherId, group);
        }
        const displayNames = (0, aiOperatingFacts_1.entityDisplayNames)(staff.map(t => ({ ...t, classes: [...(teacherClasses.get(t.id) || [])] })));
        const rows = teachers.map(t => {
            const own = sessions.filter(s => s.teacherId === t.id);
            const attendance = (0, attendanceStatsService_1.computeSessionAttendance)({ schedules: own, enrollments, attendances });
            return { teacherId: t.id, 老师: displayNames.get(t.id) || t.name, 当前负责班级数: active.filter(c => c.teacherId === t.id).length,
                实际授课场次: own.length, 应到: attendance.expected, 实到: attendance.present, 出勤率: attendance.rate };
        });
        const known = new Set(teachers.map(t => t.id));
        const scopedSessions = teacherId || teacherName ? sessions.filter(s => s.teacherId && known.has(s.teacherId)) : sessions;
        const unassigned = scopedSessions.filter(s => !s.teacherId || !known.has(s.teacherId)).length;
        const all = (0, attendanceStatsService_1.computeSessionAttendance)({ schedules: scopedSessions, enrollments, attendances });
        return evidence(ctx, 'teacher_performance', (classId || className ? classes[0].name + ' · ' : '') + '老师授课与班级职责', period, ['老师', '当前负责班级数', '实际授课场次', '应到', '实到', '出勤率'], rows, { 实际授课场次: scopedSessions.length, 应到: all.expected, 实到: all.present, 出勤率: all.rate, 未归属授课场次: unassigned }, '授课按已完成场次的实际授课老师统计；应到按当场有效报名和已保存的串课，实到含迟到；出勤率取整。当前负责班级数按查询日的有效班级统计。', [...(teacherName && teachers.length > 1 ? ['当前范围有多位同名老师，已按班级和编号尾号分别列示。可用班级或完整人员编号确认。'] : []), '个人续费率缺少到期学员分母。订单销售归属与授课、班级职责分别核算。']);
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
}
async function studentAttendance(ctx, params) {
    if (!ctx.campusId)
        throw new Error('请先选择校区');
    const scope = { organizationId: ctx.organizationId, campusId: ctx.campusId };
    const period = operationalRange(ctx, params);
    const classId = typeof params.classId === 'string' ? params.classId : null;
    const className = typeof params.className === 'string' ? params.className.trim() : null;
    const studentId = typeof params.studentId === 'string' ? params.studentId : null;
    const name = typeof params.studentName === 'string' ? params.studentName.trim() : null;
    const ranking = String(params.ranking || 'none');
    const sortBy = ranking.endsWith('_rate') ? '出勤率' : '实到';
    const highest = ranking.startsWith('highest');
    return database_1.default.$transaction(async (tx) => {
        const classes = await tx.class.findMany({ where: { ...scope, ...(classId ? { id: classId } : {}), ...(className ? { name: className } : {}) }, select: { id: true, name: true } });
        if ((classId || className) && classes.length !== 1)
            return evidence(ctx, 'student_attendance', '学员历史出勤', period, [], [], {}, '仅匹配授权范围内的班级。', [classes.length ? '存在多个同名班级，请提供完整班级编号。' : '当前范围未找到该班级，请核对班名或编号。']);
        const classIds = classes.map(c => c.id);
        const students = await tx.student.findMany({ where: { ...scope, ...(name ? { name } : {}), ...(studentId ? { id: studentId } : {}),
                ...((classId || className) ? { OR: [{ enrollments: { some: { classId: { in: classIds }, organizationId: ctx.organizationId } } }, { attendances: { some: { classId: { in: classIds }, organizationId: ctx.organizationId, isTemporary: true } } }] } : {}) },
            select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 5001 });
        if (students.length > 5000)
            throw new Error('学员超过 5000 名，请指定姓名或缩小范围');
        const studentIds = students.map(s => s.id);
        const [sessions, enrollments, attendances] = await Promise.all([
            tx.schedule.findMany({ where: { ...scope, classId: { in: classIds }, status: 'completed', startTime: { gte: period.from, lt: period.to } },
                select: { id: true, classId: true, startTime: true, endTime: true } }),
            tx.enrollment.findMany({ where: { organizationId: ctx.organizationId, classId: { in: classIds }, studentId: { in: studentIds } },
                select: { classId: true, studentId: true, status: true, enrolledAt: true, endedAt: true } }),
            tx.attendance.findMany({ where: { organizationId: ctx.organizationId, classId: { in: classIds }, studentId: { in: studentIds },
                    schedule: { ...scope, status: 'completed', startTime: { gte: period.from, lt: period.to } } },
                select: { scheduleId: true, classId: true, studentId: true, status: true, isTemporary: true } }),
        ]);
        const facts = (0, attendanceStatsService_1.computeStudentSessions)({ schedules: sessions, enrollments, attendances });
        const byStudent = new Map();
        for (const f of facts) {
            const own = byStudent.get(f.studentId) || [];
            own.push(f);
            byStudent.set(f.studentId, own);
        }
        const classNames = new Map(classes.map(c => [c.id, c.name]));
        const displayNames = (0, aiOperatingFacts_1.entityDisplayNames)(students.map(student => ({ ...student,
            classes: (byStudent.get(student.id) || []).filter(f => f.expected > 0).map(f => classNames.get(f.classId) || '班级') })));
        const rows = students.filter(s => name || studentId || byStudent.get(s.id)?.some(f => f.expected > 0)).map(s => {
            const own = (byStudent.get(s.id) || []).filter(f => f.expected > 0).sort((a, b) => a.classId.localeCompare(b.classId));
            const due = own.reduce((sum, f) => sum + f.expected, 0), present = own.reduce((sum, f) => sum + f.present, 0);
            const label = displayNames.get(s.id) || s.name;
            return { studentId: s.id, 姓名: label, 应到: due, 实到: present, 出勤率: due ? Math.round(100 * present / due) : null,
                班级明细: own.map(f => (classNames.get(f.classId) || '班级') + '：应到 ' + f.expected + '，实到 ' + f.present).join('；') || '期间无应到课次',
                classes: own.map(f => ({ classId: f.classId, expected: f.expected, present: f.present })), 排序结论: '' };
        });
        if (ranking !== 'none') {
            rows.sort((a, b) => {
                if (!a.应到 || !b.应到)
                    return Number(!a.应到) - Number(!b.应到) || a.studentId.localeCompare(b.studentId);
                return (highest ? -1 : 1) * (Number(a[sortBy]) - Number(b[sortBy])) || a.studentId.localeCompare(b.studentId);
            });
            const best = rows.find(r => r.应到 > 0);
            if (best)
                for (const row of rows)
                    if (row.应到 > 0 && row[sortBy] === best[sortBy])
                        row.排序结论 = sortBy + (highest ? '最高' : '最低') + '（并列同值均列出）';
        }
        const missing = ['无应到课次者单列，缺分母时不比较出勤率或授课机会。'];
        if (name && students.length > 1)
            missing.push('匹配到多位同名学员，可用班级或完整学员编号进一步确认。');
        if (!rows.length)
            missing.push('当前授权范围内未找到符合条件的学员出勤明细。');
        const due = rows.reduce((s, r) => s + r.应到, 0), present = rows.reduce((s, r) => s + r.实到, 0);
        const leaders = rows.filter(r => r.排序结论);
        const totals = { 学员人数: rows.length, 应到: due, 实到: present, 出勤率: due ? Math.round(100 * present / due) : null };
        if (leaders.length) {
            totals[sortBy + (highest ? '最高' : '最低') + '学员人数'] = leaders.length;
            totals[sortBy + (highest ? '最高' : '最低') + '值'] = leaders[0][sortBy];
        }
        return evidence(ctx, 'student_attendance', '学员历史出勤', period, ['姓名', '应到', '实到', '出勤率', '班级明细', ...(ranking !== 'none' ? ['排序结论'] : [])], rows, totals, '按已完成场次及有效报名、已保存串课逐场核算，实到含迟到。按学员编号合计多个班级；出勤率按实到除以应到四舍五入至整数，百分比按显示值排名。', missing);
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
}
//# sourceMappingURL=aiOperationalData.js.map