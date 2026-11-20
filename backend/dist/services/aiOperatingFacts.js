"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evidenceUnit = evidenceUnit;
exports.fullMonth = fullMonth;
exports.entityDisplayNames = entityDisplayNames;
exports.evaluateMonthlyTarget = evaluateMonthlyTarget;
exports.comparablePeriods = comparablePeriods;
exports.compareOperatingFacts = compareOperatingFacts;
exports.buildOperatingSnapshot = buildOperatingSnapshot;
exports.operatingSnapshotVersion = operatingSnapshotVersion;
exports.renderOperatingFacts = renderOperatingFacts;
const crypto_1 = require("crypto");
const catalog = {
    用户给定续费率目标: ['target.user.renewalRate', '%'],
    本期到期学员续费率: ['retention.dueRate', '%'],
    新签金额: ['sales.new', '元'],
    续费金额: ['sales.renewal', '元'],
    已通过退费金额: ['cash.refunds', '元'],
    净成单额: ['cash.netSales', '元'],
    金额合计: ['cash.income', '元'],
    总成单额: ['cash.income', '元'],
    新单数: ['sales.newCount', '单'],
    新签单: ['sales.newCount', '单'],
    续费单: ['sales.renewalCount', '单'],
    续费单数: ['sales.renewalCount', '单'],
    出勤率: ['lessons.rate', '%'],
    应到: ['lessons.due', '人次'],
    实到: ['lessons.actual', '人次'],
    场次: ['lessons.sessions', '场'],
    实际授课场次: ['lessons.sessions', '场'],
    未归属授课场次: ['lessons.unassigned', '场'],
    当前负责班级数: ['classes.current', '个'],
    实际课消金额: ['lessons.consumption', '元'],
    净扣课: ['lessons.deduction', '课时'],
    实收: ['payments.amount', '元'],
    去重学员人数: ['students.distinct', '人'],
    记录数: ['records.count', '条'],
    排课应到人次: ['schedule.expected', '人次'],
    阈值: ['attendance.threshold', '%'],
};
function evidenceUnit(key) {
    if (key === '目标完成率' || key === '环比百分比')
        return '%';
    if (key === '实际金额' || key === '目标金额')
        return '元';
    return catalog[key]?.[1] || '';
}
const labels = {
    student_attendance: '学员出勤',
    renewal_rate: '到期学员续费率',
    monthly_target_comparison: '月度目标比较',
    cost_and_income: '成单与退费',
    signup_renewal: '报名与续费',
    class_attendance: '班级出勤',
    teacher_performance: '老师授课',
    low_attendance_students: '低出勤学员',
    low_attendance_classes: '低出勤班级',
    weekly_report_data: '按班经营数据',
    weekly_comparison: '经营比较',
    business_records: '业务明细',
    new_student_attendance: '新报学员到课',
    experience_overview: '体验课',
    actual_consumption: '实际课消',
    uploaded_file: '上传资料',
};
const round = (n) => Number(n.toFixed(2));
const text = (v) => String(v ?? '待核')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
const numeric = (v) => typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && /^-?\d+(\.\d+)?%$/.test(v)
        ? Number(v.slice(0, -1))
        : null;
const periodText = (p) => (p ? p.start + ' 至 ' + p.end : '');
function fullMonth(p) {
    return (p.start.endsWith('-01') &&
        p.start.slice(0, 7) === p.end.slice(0, 7) &&
        new Date(Date.parse(p.end) + 86400000).getUTCDate() === 1);
}
/** Abbreviations are display labels only. Joins, ranking and saved references retain the complete ID. */
function entityDisplayNames(people) {
    const byName = new Map();
    for (const person of people) {
        const group = byName.get(person.name) || [];
        group.push(person);
        byName.set(person.name, group);
    }
    const result = new Map();
    for (const [name, group] of byName) {
        if (group.length === 1) {
            result.set(group[0].id, name);
            continue;
        }
        let length = 5;
        const max = group.reduce((n, p) => Math.max(n, p.id.length), 0);
        while (length < max && new Set(group.map((p) => p.id.slice(-length))).size < group.length)
            length++;
        for (const p of group) {
            const names = [...new Set(p.classes || [])].sort();
            const classes = names.slice(0, 2).join('、') + (names.length > 2 ? '等' + names.length + '班' : '');
            result.set(p.id, name + '（' + [classes, '编号尾号 ' + p.id.slice(-length)].filter(Boolean).join('，') + '）');
        }
    }
    return result;
}
function evaluateMonthlyTarget(actual, goal, period, today, covered) {
    if (typeof goal !== 'number' || !Number.isFinite(goal) || goal < 0)
        return { difference: null, percent: null, note: '缺少同范围已确认的月度目标' };
    if (!fullMonth(period) || period.end >= today)
        return {
            difference: null,
            percent: null,
            note: '观察期尚未覆盖完整已结束月份，仅展示月度目标',
        };
    if (!covered)
        return { difference: null, percent: null, note: '有已确认订单未登记价格，仅列已知金额' };
    return {
        difference: round(actual - goal),
        percent: goal === 0 ? null : round((actual / goal) * 100),
        note: goal === 0 ? '目标为零，仅比较差额' : '实际金额与同月已确认目标比较',
    };
}
function comparablePeriods(current, previous) {
    return (previous.start <= previous.end &&
        current.start <= current.end &&
        previous.end < current.start &&
        (Date.parse(previous.end) - Date.parse(previous.start) ===
            Date.parse(current.end) - Date.parse(current.start) ||
            (fullMonth(current) && fullMonth(previous))));
}
function compareOperatingFacts(current, previous) {
    if (current.kind !== 'metric' ||
        previous.kind !== 'metric' ||
        current.coverage !== 'complete' ||
        previous.coverage !== 'complete' ||
        current.metric !== previous.metric ||
        current.unit !== previous.unit ||
        current.entityId !== previous.entityId ||
        current.scopeKey !== previous.scopeKey ||
        current.campusId !== previous.campusId ||
        !current.period ||
        !previous.period ||
        !comparablePeriods(current.period, previous.period) ||
        typeof current.value !== 'number' ||
        typeof previous.value !== 'number')
        return null;
    const delta = round(current.value - previous.value);
    return {
        delta,
        unit: current.unit === '%' ? '个百分点' : current.unit,
        percent: previous.value === 0 || current.unit === '%' ? null : round((delta / previous.value) * 100),
        direction: delta > 0 ? '增加' : delta < 0 ? '减少' : '持平',
    };
}
function publicNotes(c) {
    if (c.tool === 'campus_overview' && c.missing.length)
        return ['部分概览指标未取得数据，缺项已标注。'];
    return c.missing.filter((note) => !/Prisma|SQL|Context|LessonLog|\w+Id\b|\berror\b/i.test(note));
}
function buildOperatingSnapshot(cards) {
    const facts = [];
    for (const c of cards) {
        const filters = c.filters || {};
        const scope = Object.entries(filters)
            .filter(([k]) => ![
            'startDate',
            'endDate',
            'comparisonStartDate',
            'comparisonEndDate',
            'previousStart',
            'previousEnd',
        ].includes(k))
            .sort(([a], [b]) => a.localeCompare(b));
        const scopeKey = JSON.stringify([c.tool, scope]);
        const department = String(filters.classId || filters.campusId || 'organization');
        const add = (suffix, label, details = {}) => {
            const f = {
                id: c.evidenceId + '/' + suffix,
                kind: 'metric',
                metric: suffix,
                entityId: department,
                entityName: '',
                campusId: typeof filters.campusId === 'string' ? filters.campusId : null,
                scopeKey,
                period: c.timeRange,
                source: c.evidenceId,
                sourceTitle: c.error ? labels[c.tool] || '业务数据' : c.title,
                asOf: c.businessAsOf || c.generatedAt,
                label,
                value: null,
                unit: '',
                coverage: 'complete',
                formula: '',
                ...details,
            };
            facts.push(f);
            return f;
        };
        const title = c.error ? labels[c.tool] || '业务数据' : c.title;
        if (c.error) {
            add('failed', title + '本次查询未完成，相关指标待核。', {
                kind: 'missing',
                coverage: 'failed',
            });
            continue;
        }
        const totals = c.totals || {};
        const rows = c.rows || [];
        const truncated = c.missing.some((note) => /仅显示前|截断返回|结果不全/.test(note));
        const partialPrice = c.missing.some((note) => note.includes('未登记价格'));
        const metric = (key, v, data = {}, suffix = key) => {
            const [code, unit] = catalog[key] || [
                c.tool + '.' + key,
                key.includes('金额') ? '元' : key.includes('人数') ? '人' : key.endsWith('率') ? '%' : '',
            ];
            const n = numeric(v);
            return add(suffix, key === 'count' ? '返回记录数' : key, {
                metric: code,
                unit,
                value: n ?? (typeof v === 'string' && v !== '不可计算' ? v : null),
                formula: c.caliber,
                coverage: v === null || v === '不可计算'
                    ? 'missing'
                    : truncated || (partialPrice && unit === '元')
                        ? 'partial'
                        : 'complete',
                ...data,
            });
        };
        const weightedRate = (r) => {
            const due = numeric(r.应到), present = numeric(r.实到);
            if (due === null || present === null)
                return {};
            return {
                numerator: present,
                denominator: due,
                formula: '实到人次 ÷ 应到人次，四舍五入至整数百分比',
                value: due > 0 ? Math.round((100 * present) / due) : null,
                coverage: (due > 0 ? 'complete' : 'zero_denominator'),
            };
        };
        if (c.tool === 'monthly_target_comparison') {
            for (const row of rows) {
                const key = String(row.指标), actual = metric(key, row.实际金额, {}, key + '/actual');
                const goal = metric(key, row.目标金额, {
                    metric: 'target.' + actual.metric,
                    label: key + '月度目标',
                    formula: '目标来源：' + text(row.目标来源),
                    coverage: row.目标金额 === null ? 'missing' : 'complete',
                }, key + '/target');
                const detail = row.目标金额 === null
                    ? '当前已知金额 ' + actual.value + ' 元；' + text(row.说明)
                    : '当前已知金额 ' +
                        actual.value +
                        ' 元，月度目标 ' +
                        goal.value +
                        ' 元（' +
                        text(row.目标来源) +
                        '）' +
                        (row.差额 === null
                            ? '；' + text(row.说明)
                            : '，差额 ' +
                                row.差额 +
                                ' 元' +
                                (row.目标完成率 === null
                                    ? '（目标为零）'
                                    : '，目标完成率 ' + row.目标完成率 + '%'));
                add(key + '/comparison', key, {
                    kind: 'comparison',
                    metric: actual.metric,
                    value: detail,
                    refs: [actual.id, goal.id],
                });
            }
        }
        else if (c.tool === 'weekly_comparison') {
            for (const row of rows) {
                const key = String(row.指标);
                const before = { start: String(filters.previousStart), end: String(filters.previousEnd) };
                const coverage = row.覆盖 === '仅已登记价格' ? { coverage: 'partial' } : {};
                const current = metric(key, row.本期, coverage, key + '/current');
                const prior = metric(key, row.上期, { period: before, ...coverage }, key + '/prior');
                const diff = compareOperatingFacts(current, prior);
                const status = diff
                    ? (diff.delta === 0 ? '持平' : diff.direction + Math.abs(diff.delta) + diff.unit) +
                        (diff.percent !== null
                            ? '（变化率 ' + diff.percent + '%）'
                            : prior.value === 0
                                ? '（基期为零，无法计算增长百分比）'
                                : '')
                    : '缺少可比基准';
                add(key + '/comparison', key, {
                    kind: 'comparison',
                    metric: current.metric,
                    value: `${periodText(before)} 为 ${prior.value ?? '待核'}${prior.value === null ? '' : prior.unit}，${periodText(c.timeRange)} 为 ${current.value ?? '待核'}${current.value === null ? '' : current.unit}，${status}`,
                    refs: [current.id, prior.id],
                });
            }
        }
        else {
            for (const [key, value] of Object.entries(totals)) {
                if (/^出勤率 .+ 的记录数$/.test(key))
                    continue;
                metric(key, value, key === '出勤率' ? weightedRate(totals) : {});
            }
        }
        if (/^low_attendance_(classes|students)$/.test(c.tool)) {
            const bins = new Map();
            for (const row of rows) {
                const rate = numeric(row.出勤率);
                if (rate !== null)
                    bins.set(rate, (bins.get(rate) || 0) + 1);
            }
            if (!truncated && rows.length === totals.记录数)
                add('distribution', '按显示出勤率分组', {
                    kind: 'distribution',
                    bins: [...bins].sort(([a], [b]) => a - b).map(([rate, count]) => ({ rate, count })),
                    formula: '全量明细按整数出勤率分组；按学员与班级分别计条。',
                });
        }
        if (c.tool === 'student_attendance') {
            const ranked = rows.filter((row) => row.排序结论 && typeof row.studentId === 'string');
            const refs = [];
            for (const row of rows) {
                if (typeof row.studentId !== 'string')
                    continue;
                const entity = { entityId: row.studentId, entityName: text(row.姓名), detailOnly: true };
                for (const key of ['应到', '实到', '出勤率']) {
                    const fact = metric(key, row[key], { ...entity, ...(key === '出勤率' ? weightedRate(row) : {}) }, row.studentId + '/' + key);
                    if (row.排序结论 && String(row.排序结论).startsWith(key))
                        refs.push(fact.id);
                }
            }
            if (ranked.length) {
                const key = String(ranked[0].排序结论).startsWith('出勤率') ? '出勤率' : '实到';
                const label = String(ranked[0].排序结论).split('（')[0];
                const names = ranked
                    .slice(0, 20)
                    .map((row) => text(row.姓名))
                    .join('、');
                add('ranking', label, {
                    kind: 'comparison',
                    metric: catalog[key][0],
                    refs,
                    value: names +
                        (ranked.length > 20 ? '等 ' + ranked.length + ' 人' : '') +
                        '，' +
                        key +
                        ' ' +
                        ranked[0][key] +
                        catalog[key][1] +
                        '（按有应到场次的学员比较）',
                });
            }
        }
        if (c.tool === 'new_student_attendance' && filters.asOfDate)
            add('cutoff', '到课观察截止日', { value: text(filters.asOfDate) });
        if (c.tool === 'teacher_performance') {
            const names = entityDisplayNames(rows
                .filter((row) => typeof row.teacherId === 'string')
                .map((row) => ({ id: String(row.teacherId), name: text(row.老师) })));
            for (const row of rows) {
                if (typeof row.teacherId !== 'string')
                    continue;
                const entity = { entityId: row.teacherId, entityName: names.get(row.teacherId) };
                for (const key of ['实际授课场次', '应到', '实到', '出勤率', '当前负责班级数'])
                    metric(key, row[key], {
                        ...entity,
                        ...(key === '出勤率' ? weightedRate(row) : {}),
                        ...(key === '当前负责班级数' ? { period: null } : {}),
                    }, row.teacherId + '/' + key);
            }
        }
        else if (!['weekly_comparison', 'monthly_target_comparison'].includes(c.tool) &&
            c.columns.length) {
            const visible = c.columns.filter((column) => column.key !== 'id' && !column.key.endsWith('Id'));
            const detail = rows
                .slice(0, 20)
                .map((row) => visible.map((column) => {
                const v = row[column.key];
                if (filters.domain === 'schedules' && ['startTime', 'endTime'].includes(column.key) && typeof v === 'string' && Number.isFinite(Date.parse(v))) {
                    return column.label + ' ' + new Date(Date.parse(v) + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') + '（北京时间）';
                }
                return column.label + ' ' + text(v);
            }).join('，'));
            const title = rows.length > detail.length
                ? '明细（展示前 ' + detail.length + ' 条，共 ' + rows.length + ' 条）'
                : '明细';
            add('rows', title, {
                kind: 'list',
                rows: detail,
                showByDefault: [
                    'student_attendance',
                    'new_student_attendance',
                    'search_classes',
                    'search_students',
                ].includes(c.tool) || Boolean(filters.keyword) || (filters.domain === 'schedules' && Boolean(filters.classId)),
                coverage: truncated ? 'partial' : 'complete',
            });
        }
        for (const [index, note] of publicNotes(c).entries())
            add('note/' + index, note, { kind: 'missing', coverage: 'missing' });
    }
    return { version: operatingSnapshotVersion(cards), facts };
}
function operatingSnapshotVersion(cards) {
    // Digest only the persisted business snapshot. Model previews may differ on a replay;
    // JSONB also changes object key ordering when storage returns the same data.
    const canonical = (value) => Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([k, v]) => [k, canonical(v)]))
            : value;
    return (0, crypto_1.createHash)('sha256')
        .update(JSON.stringify(canonical(cards.map((c) => ({
        evidenceId: c.evidenceId,
        tool: c.tool,
        title: c.title,
        timeRange: c.timeRange,
        generatedAt: c.generatedAt,
        businessAsOf: c.businessAsOf,
        filters: c.filters,
        columns: c.columns,
        rows: c.rows,
        totals: c.totals,
        missing: c.missing,
        caliber: c.caliber,
        error: c.error,
        unit: c.unit,
    })))))
        .digest('hex');
}
function renderOperatingFacts(snapshot, opts = {}) {
    const selected = opts.factIds?.length ? new Set(opts.factIds) : null;
    const metricSources = new Set(snapshot.facts.filter((f) => f.kind === 'metric').map((f) => f.source));
    const compared = new Set(snapshot.facts.filter((f) => f.kind === 'comparison').flatMap((f) => f.refs || []));
    const shown = snapshot.facts.filter((f) => (!selected || selected.has(f.id) || f.kind === 'missing') &&
        (!f.detailOnly || selected?.has(f.id)) &&
        (f.kind !== 'list' ||
            f.showByDefault ||
            opts.includeRows ||
            selected?.has(f.id) ||
            !metricSources.has(f.source)) &&
        !(f.kind === 'metric' && compared.has(f.id) && !selected?.has(f.id)));
    const groups = new Map();
    for (const f of shown) {
        const period = periodText(f.period);
        const asOf = f.asOf && Number.isFinite(Date.parse(f.asOf))
            ? new Date(Date.parse(f.asOf) + 28800000).toISOString().slice(0, 10)
            : '';
        const scopeDate = !period && !f.period && f.kind !== 'missing' && asOf ? '截至 ' + asOf : period;
        const group = [f.sourceTitle.replace(/（\d{4}-\d{2}-\d{2}.*?）$/, ''), f.entityName, scopeDate]
            .filter(Boolean)
            .join(' · ');
        const lines = groups.get(group) || [];
        if (f.kind === 'distribution')
            lines.push(f.label +
                '：' +
                (f.bins?.map((b) => b.rate + '%／' + b.count + ' 条').join('，') || '无符合条件的记录') +
                '。');
        else if (f.kind === 'list')
            lines.push(f.label + '：\n' + (f.rows?.map((row) => '• ' + row).join('\n') || '没有符合条件的记录。'));
        else if (f.kind === 'missing')
            lines.push(f.label);
        else
            lines.push(f.label +
                '：' +
                (f.value === null
                    ? f.coverage === 'zero_denominator'
                        ? '应到为零，无法计算'
                        : '缺少数据'
                    : f.value + f.unit) +
                (f.denominator !== undefined && f.denominator > 0
                    ? '（' + f.numerator + '／' + f.denominator + ' 人次）'
                    : '') +
                (f.coverage === 'partial' ? '（仅已覆盖记录）' : '') +
                '。');
        groups.set(group, lines);
    }
    if (opts.compare && !shown.some((f) => f.kind === 'comparison')) {
        const byMetric = new Map();
        for (const fact of shown) {
            if (fact.kind !== 'metric' || !fact.period)
                continue;
            const key = JSON.stringify([
                fact.scopeKey,
                fact.campusId,
                fact.entityId,
                fact.metric,
                fact.unit,
            ]);
            const list = byMetric.get(key) || [];
            list.push(fact);
            byMetric.set(key, list);
        }
        const comparisons = [];
        for (const group of byMetric.values()) {
            // A requested pair is normally two observations. For a longer series show
            // each change against its nearest preceding comparable period, once.
            const ordered = group
                .filter((f) => f.coverage === 'complete' && typeof f.value === 'number')
                .sort((a, b) => a.period.start.localeCompare(b.period.start));
            const byEnd = [...ordered].sort((a, b) => a.period.end.localeCompare(b.period.end));
            const previous = new Map();
            const bucket = (p) => String(Date.parse(p.end) - Date.parse(p.start));
            let index = 0;
            for (const current of ordered) {
                const period = current.period;
                while (index < byEnd.length && byEnd[index].period.end < period.start) {
                    const item = byEnd[index++], p = item.period;
                    previous.set(bucket(p), item);
                    if (fullMonth(p))
                        previous.set('month', item);
                }
                const sameLength = previous.get(bucket(period));
                const month = fullMonth(period) ? previous.get('month') : undefined;
                const prior = month && (!sameLength || month.period.end > sameLength.period.end) ? month : sameLength;
                if (!prior)
                    continue;
                const difference = compareOperatingFacts(current, prior);
                if (!difference)
                    continue;
                comparisons.push([current.entityName, current.label].filter(Boolean).join(' · ') +
                    '：' +
                    periodText(period) +
                    ' 为 ' +
                    current.value +
                    current.unit +
                    '，' +
                    periodText(prior.period) +
                    ' 为 ' +
                    prior.value +
                    prior.unit +
                    '，' +
                    difference.direction +
                    (difference.delta === 0 ? '' : Math.abs(difference.delta) + difference.unit) +
                    (difference.percent === null
                        ? prior.value === 0
                            ? '（基期为零，无法计算增长百分比）'
                            : ''
                        : '（变化率 ' + difference.percent + '%）') +
                    '。');
            }
        }
        groups.set('比较依据', comparisons.length ? comparisons : ['尚无同指标、同归属的可比期间或已核实目标。']);
    }
    return [...groups]
        .map(([title, lines]) => [title, ...lines].filter(Boolean).join('\n'))
        .join('\n\n');
}
//# sourceMappingURL=aiOperatingFacts.js.map