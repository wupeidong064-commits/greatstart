function time(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return '时间待确认';
  const sh = new Date(date.getTime() + 8 * 3600000);
  const pad = n => String(n).padStart(2, '0');
  return `${sh.getUTCFullYear()}-${pad(sh.getUTCMonth() + 1)}-${pad(sh.getUTCDate())} ${pad(sh.getUTCHours())}:${pad(sh.getUTCMinutes())}`;
}
function balance(value) { return Number.isFinite(value) ? String(value) : '待同步'; }
function log(row) {
  const names = { deduct: '课时扣减', refund: '退费扣回', void: '成单作废扣回', add: '增加 / 返还', reversal: '课时返还', return: '课时返还' };
  const sign = ['deduct', 'refund', 'void'].includes(row.type) ? '−' : ['add', 'return', 'reversal'].includes(row.type) ? '+' : '';
  return { ...row, label: row.type === 'add' && row.reversalOfId ? '更正返还' : names[row.type] || '课时调整', value: Number.isFinite(row.lessons) ? sign + row.lessons : '待同步', date: row.businessDate || time(row.createdAt) };
}
function schedule(row) {
  const names = { scheduled: '待上课', completed: '已完成', cancelled: '已取消', canceled: '已取消', rescheduled: '已调课' };
  return { ...row, name: row.class && row.class.name || '课程', date: time(row.startTime), end: time(row.endTime), statusText: names[row.status] || '状态待确认', changed: ['cancelled', 'canceled', 'rescheduled'].includes(row.status), teacherName: row.teacher && row.teacher.name || '待确认', venue: [row.campus && row.campus.name, row.classroom].filter(Boolean).join(' · ') || '地点待确认' };
}
module.exports = { time, balance, log, schedule };
