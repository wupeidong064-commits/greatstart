import type { Evidence } from './aiTools';
import type { BusinessPeriod } from './aiBusinessCalendar';

// A reference to the previous class standings keeps the period even when the last turn drilled into one class.
export function previousClassStandings(q: string, previous: Evidence[]): BusinessPeriod | undefined {
  const text = q.normalize('NFKC').replace(/[\s，。,.?!？！]/g, '');
  if (!/并列(?:第[一1]|最高)|排(?:在)?第[一1]/.test(text) || !text.includes('班')) return;
  const unexplained = text.replace(/刚才|上面|还是|所以|这次|那么|请问|出勤率|到课率|并列|排在|第一|第1|最高|有|是|那|这|哪些|哪|些|几个|几|个|班级|班|的|吗|呢|啊|呀|排/g, '');
  if (unexplained) return;
  const [card] = previous;
  if (previous.length !== 1 || card?.tool !== 'class_attendance' || card.error || !card.timeRange) return;
  return card.timeRange;
}

export function renderClassStandings(card: Evidence | undefined): string {
  if (card?.tool !== 'class_attendance' || card.error || !card.timeRange || card.filters?.classId || card.filters?.className)
    return '未取得该期间完整的班级出勤数据，暂时无法核对排名。';
  const valid = card.rows.flatMap(row => typeof row.name === 'string' && typeof row.应到 === 'number' &&
    row.应到 > 0 && typeof row.实到 === 'number' ? [{name:row.name, due:row.应到, actual:row.实到}] : []);
  const best = valid.reduce<typeof valid[number] | undefined>((top,row) =>
    !top || row.actual * top.due > top.actual * row.due ? row : top, undefined);
  if (!best) return '这段期间没有可核对的应到人次，无法比较班级出勤率。';
  const peers = valid.filter(row => row.actual * best.due === best.actual * row.due);
  const place = peers.length === 1 ? '出勤率第一的是' : '有 ' + peers.length + ' 个班出勤率并列第一，分别是';
  return card.timeRange.start + ' 至 ' + card.timeRange.end + '，' + place +
    peers.map(row=>row.name + '（' + row.actual + '／' + row.due + '）').join('、') +
    '，出勤率为 ' + Math.round(best.actual / best.due * 1000)/10 + '%。';
}
