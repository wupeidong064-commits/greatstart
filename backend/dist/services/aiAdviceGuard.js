"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isManagementAdvice = isManagementAdvice;
exports.guardManagementAdvice = guardManagementAdvice;
/** Advice requests are buffered so unsupported grouped counts are never streamed first. */
function isManagementAdvice(question) {
    return /薪资|薪酬|工资|绩效|激励|考核|目标/.test(question)
        && /建议|调整|制定|设计|方案|如何|怎么|目标/.test(question);
}
function guardManagementAdvice(answer, evidence) {
    let text = answer.trim();
    const attendance = evidence.find(card => card.tool === 'low_attendance_students' && !card.error && Array.isArray(card.rows));
    if (attendance) {
        // Grouped headcounts paired with percentages can be wrong even when each number
        // exists somewhere in the evidence. Do not trust model arithmetic on preview rows.
        const count = '(?:\\d+|[零一二两三四五六七八九十百]+)\\s*(?:名|人|个|条|位)';
        const percent = '(?:\\d+(?:\\.\\d+)?\\s*[%％]|百分之[零一二两三四五六七八九十百\\d.]+)';
        const grouped = new RegExp(`(?:${count}[^\\n]*${percent}|${percent}[^\\n]*${count})`);
        let removed = false;
        text = text.split('\n').filter(line => {
            if (!grouped.test(line))
                return true;
            removed = true;
            return false;
        }).join('\n').trim();
        if (removed) {
            const counts = new Map();
            for (const row of attendance.rows) {
                const rate = row['出勤率'];
                if (typeof rate === 'number' && Number.isFinite(rate))
                    counts.set(rate, (counts.get(rate) || 0) + 1);
            }
            const range = attendance.timeRange ? `（${attendance.timeRange.start}至${attendance.timeRange.end}）` : '';
            const distribution = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([rate, n]) => `${rate}%：${n}条`).join('；');
            text += `\n\n低出勤记录${range}的出勤率分布：${distribution || '暂无可计算记录'}。按学员与班级逐条统计，同一学员可能有多条记录。`;
        }
    }
    if (!/AI\s*建议仅供参考/i.test(text))
        text += '\n\nAI 建议仅供参考。';
    return text.trim();
}
//# sourceMappingURL=aiAdviceGuard.js.map