"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adviceActionCatalog = void 0;
exports.adviceTopic = adviceTopic;
exports.renderOperatingAdvice = renderOperatingAdvice;
// The intent model may order registered actions. It cannot insert a salary,
// an achieved result, a person's name, or a comparison into a recommendation.
const actions = {
    compensation: {
        workload: '把固定岗位职责、实际授课和招生协作分开。固定部分覆盖备课、教研和家校沟通，授课部分按已完成课次核算，代课计给实际授课人。',
        attribution: '先约定续费归属和协作分配，再核算激励。对交接班、多人跟进和退费分别列例，请老师用同一份规则复算。',
        trial: '先拿一个完整月份做新旧方案并行试算。逐人列出固定收入、授课报酬、激励和总额，请负责人核对差额及校区总预算，再确定比例。',
    },
    teacher: {
        attendance: '把实际授课、应到和实到列入个人目标表。按班查看未到原因，记录回访结果，每周复核同一口径的实到和应到。',
        renewal: '月初列出本月到期且由本人负责跟进的学员，逐一确认续费意向。先核实到期分母和销售归属，再议定个人续费率目标。',
        review: '月末按实际授课人复核已完成场次，代课与交接单列。负责人和老师一起核对目标表，记录哪些差异来自排课变化。',
    },
    sales: {
        funnel: '把待跟进、已约体验、实际到场和已确认成单分开。选一个环节明确负责人、下一次联系时间和复核日期。',
        renewal: '先列出期间内到期的学员并确认跟进归属，再用同一批学员核算续费率。逐项复核未联系和已联系待确认的记录。',
    },
    attendance: {
        followup: '按班列出需跟进的学员，向授课老师核实请假、调课和缺席原因。记录下次到课安排，在下一次已完成场次后复核。',
        roster: '对照每场有效报名、代课和串课记录复核应到人次，再与签到明细核对实到。班级人数与课次人次分开记录。',
    },
    operations: {
        owner: '选定要改善的一项业务指标，指定负责人，把本期基线、拟采取的行动和复核日期记在同一张表上。',
        review: '在下一个可比期间按相同范围复核结果，分别记录执行情况、人员变动及仍需核实的原因。',
    },
};
exports.adviceActionCatalog = Object.entries(actions)
    .flatMap(([topic, entries]) => Object.entries(entries).map(([id, description]) => topic + '.' + id + '=' + description))
    .join('\n');
function adviceTopic(intent, question, previous) {
    if (intent.reuseSnapshot ||
        (intent.fileRequested && !['mixed', 'advice'].includes(intent.purpose || '')) ||
        (!['advice', 'mixed'].includes(intent.purpose || '') &&
            !(/薪资|薪酬|工资|表现|绩效|激励|考核|目标/.test(question) &&
                /建议|调整|制[订定]|设[定计]|拟定|订个|怎么定|如何定|规划/.test(question)) &&
            !(previous &&
                !['facts', 'comparison', 'report'].includes(intent.purpose || '') &&
                /^(?:那|然后|接着|具体|继续|展开|再说|细说|怎么落地|如何执行)/.test(question))))
        return;
    if (/薪资|薪酬|工资/.test(question) || intent.subject === 'compensation')
        return 'compensation';
    if (/老师|教师|教练/.test(question) || intent.subject === 'teacher')
        return 'teacher';
    if (intent.subject === 'sales')
        return 'sales';
    if (intent.subject === 'attendance' || intent.subject === 'class' || intent.subject === 'student')
        return 'attendance';
    return previous || 'operations';
}
function renderOperatingAdvice(topic, ids, calendar, snapshot) {
    const catalog = actions[topic];
    const choices = [
        ...new Set(ids
            .filter((id) => id.startsWith(topic + '.'))
            .map((id) => id.slice(topic.length + 1))
            .filter((key) => Object.prototype.hasOwnProperty.call(catalog, key))),
    ];
    const ordered = choices.length
        ? [...new Set([...choices, ...(topic === 'compensation' ? ['workload', 'trial'] : [])])]
        : Object.keys(catalog);
    const paragraphs = [
        calendar.target
            ? '建议执行期：' + calendar.target.start + ' 至 ' + calendar.target.end
            : '建议做法',
    ];
    if (topic === 'teacher' && calendar.target) {
        // Look up each teacher's own complete attendance numerator/denominator.
        // The suggested target is a draft with an explicit baseline and review condition.
        for (const fact of snapshot.facts.filter((f) => f.metric === 'lessons.rate' && f.entityName && f.period)) {
            let specific = '先核实下月排课和应到名单，待有可比的已完成课次后再确定出勤率目标。';
            const due = fact.denominator, actual = fact.numerator;
            if (fact.coverage === 'complete' && due && actual !== undefined) {
                const proposed = Math.min(due, actual + 1);
                specific =
                    '若下月应到仍为 ' +
                        due +
                        ' 人次，可先试行实到 ' +
                        proposed +
                        ' 人次的目标（' +
                        proposed +
                        ' ÷ ' +
                        due +
                        ' ≈ ' +
                        Math.round((100 * proposed) / due) +
                        '%）。' +
                        (actual < due ? '从缺席记录中选一人跟进下次到课。' : '继续逐场核对签到。') +
                        '排课或应到人数有变时重新试算。';
            }
            paragraphs.push(fact.entityName + '：' + specific);
        }
    }
    paragraphs.push(...ordered.map((key, i) => i + 1 + '. ' + catalog[key]));
    paragraphs.push('AI 建议仅供参考。');
    return paragraphs.join('\n\n');
}
//# sourceMappingURL=aiOperatingAdvice.js.map