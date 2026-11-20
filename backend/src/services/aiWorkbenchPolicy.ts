import type { AiIntent } from './aiIntent';
import { BUSINESS_DOMAINS, BusinessDomain } from './aiDataDictionary';
import { resolveBusinessCalendar, isCalendarOnlyFollowup } from './aiBusinessCalendar';
import { AI_TOOLS } from './aiTools';

export const SCOPE_REPLY =
  '我只处理本机构的课务、招生、学员和经营分析。可以问：本月成单和退费各多少？';
const RELATED =
  /课务|经营|招生|鱼池|线索|体验|成单|新签|续费|报名|退费|现金流|课消|课时|扣课|出勤|到课|上课|签到|请假|缺课|班级|学员|学生|家长|老师|教练|员工|工作人员|排课|课表|调班|交接|跟进|待办|积分|机构|校区|课程|缴费|赠课|流水|通知|净收入|每周规则|未分班|召回|归档|流失/;
const UNRELATED = /股票|炒股|投资建议|推荐.*手机|旅游|旅行攻略|天气|彩票|比特币|写.*情书/;
const FOLLOW =
  /刚才|上个|上个月|上月|上周|改成|只看|那份|这些|怎么来|来源|导出|Excel|Word|DOCX|XLSX|报告|名单|汇报/i;
export function businessScope(
  question: string,
  hasPrevious: boolean,
  hasUploads = false
): 'business' | 'unrelated' | 'clarify' {
  if (RELATED.test(question) || (hasUploads && !UNRELATED.test(question))) return 'business';
  if (hasPrevious && FOLLOW.test(question) && !UNRELATED.test(question)) return 'business';
  if (UNRELATED.test(question)) return 'unrelated';
  if (/赚|利润|收入|收款/.test(question)) return 'business';
  // Keywords identify obvious topics; absence of one is not a rejection reason.
  // The bounded intent model can resolve natural language and ask a specific question.
  return 'business';
}
export function workbenchHelpIntent(q: string, hasUploads = false): AiIntent | undefined {
  if (/^(?:你好|您好|谢谢|你是谁|你叫什么|你是什么助手|你能做什么|你有什么功能|怎么使用你|你可以做什么)[呀啊呢吗！!？?。\s]*$/.test(q.trim()))
    return { parsedOk: true, reply: '我是蜂鸣 AI，可以查询本机构获准的课务、学员、出勤和经营数据，提供管理建议，承接上一条结果制表、导出 Excel 或 Word，也可分析上传资料。工作台不通过聊天录入或修改业务数据，实际登记请使用对应业务页面。' };
  if (/导入|上传/.test(q) && /可以|能否|怎么|如何|支持|入口|在哪|帮我/.test(q)
    && !/分析|对比|比对|核对|统计|汇总|成单了|新签了/.test(q))
    return { parsedOk: true, reply: /学员管理|学员档案|学生档案/.test(q)
      ? '工作台不通过聊天或附件创建学员档案。学员建档请到“学员管理 → 新增学员”，新签请到“成单信息”办理；页面按当前权限执行。上传附件用于分析和报告，不会写入业务档案。'
      : (hasUploads ? '已附上的文件可以直接用于分析；' : '可以，点击输入框左下角的“附件”，上传 Excel、CSV 或 Word；') + '用于运营报告时，点击附件的“用于运营报告 · 核对并导入资料”，核对日期和内容后确认。这是报告分析资料，不会写入体验课、学员或成单记录；工作台文字业务录入已关闭。' };
  return undefined;
}
export function naturalAttendanceIntent(q: string, today: string): AiIntent | undefined {
  if (!/无人|没人|没有人|有没有人|有人|多少人|几个人/.test(q) || !/上课|到课|来过|签到/.test(q)
    || /学员|学生|老师|教练|新报|新签|删除|修改|其他机构|下周|明天|安排|排课/.test(q)) return undefined;
  const calendar = resolveBusinessCalendar({question:q,today});
  if (calendar.clarification) return { parsedOk:true, reply:calendar.clarification };
  const period = calendar.observation;
  return { parsedOk: true, tools: [{ name: 'class_attendance', params: { startDate: period.start, endDate: period.end } }] };
}
export function requestedFormats(question: string): Array<'xlsx' | 'docx'> {
  const out: Array<'xlsx' | 'docx'> = [];
  if (/Excel|xlsx|表格文件|电子表格/i.test(question)) out.push('xlsx');
  if (/Word|docx|文档/i.test(question)) out.push('docx');
  return out.length ? out : ['xlsx'];
}
export function isFileRequest(q: string) {
  return !/不用导出|不要导出|不需要文件|只在对话|仅在对话/.test(q)
    && /导出|制表|(?:做成|整理成|转成|生成).*(?:表格|表|文件|报告|文档)|做.*(?:Excel|Word)|(?:Excel|Word|xlsx|docx)/i.test(q);
}
/** Financial ambiguity must be resolved before querying, for every provider. */
export function criticalMetricClarification(q: string): AiIntent | undefined {
  if (/定义|区别|口径|理解|公式/.test(q)) return undefined;
  if (/赚|利润/.test(q) && !/净成单|实际课消/.test(q))
    return { parsedOk: true, reply: '你指净成单额（新签加续费减已确认退费），还是扣除完整成本后的利润？当前系统未采集完整成本，请先明确指标。' };
  if (/收入/.test(q) && !/净成单|现金流|成单|退费|课消|历史缴费/.test(q))
    return { parsedOk: true, reply: '你指新签续费减退费的净成单额、历史缴费，还是实际课消金额？请选择一个口径。' };
  return undefined;
}
/** App follow-up semantics: the sale cohort is dated, attendance is observed through today. */
export function newStudentAttendanceIntent(q: string, today: string): AiIntent | undefined {
  if (!/新报|新签|新报名|新生|新入学/.test(q) || !/上过课|上课|到课|来过|没来|出勤/.test(q)
    || /删除|修改|SQL|密码|密钥|其他机构|绕过|定义|区别|口径|出勤率/.test(q)) return undefined;
  const negative = /还没|没.*(?:来|上过|到课)|未.*(?:来过|上过|到课)|尚无.*到课|从未/.test(q);
  const calendar = resolveBusinessCalendar({question:q,today,intent:{tools:[{name:'new_student_attendance',params:{}}]}});
  if (calendar.clarification) return { parsedOk:true, reply:calendar.clarification };
  const period = calendar.observation;
  return { parsedOk: true, tools: [{ name: 'new_student_attendance', params: {
    startDate: period.start, endDate: period.end, asOfDate: calendar.asOfDate,
    attendanceState: negative ? 'not_attended' : /已经|已到|来过|到过/.test(q) ? 'attended' : 'all',
  } }], ...(isFileRequest(q) ? { fileRequested: true, fileTool: 'new_student_attendance', fileFormats: requestedFormats(q) } : {}) };
}
/** Resolve explicit business concepts without treating their Chinese labels as DB statuses. */
export function normalizeBusinessFilters(q: string, intent: AiIntent): AiIntent {
  if (intent.reply || !intent.tools) return intent;
  return { ...intent, tools: intent.tools.map(t => {
    if (t.name !== 'business_records') return t;
    const params = { ...t.params };
    if (params.domain === 'enrollments' && /当前|现在|在读|有效/.test(q) && /报名|在读/.test(q) && !/新增|新入|区间|历史|退班/.test(q)) {
      params.view = 'current'; delete params.startDate; delete params.endDate;
      if (params.status === 'active' || params.status === '有效') delete params.status;
    }
    if (params.domain === 'students' && /未分班|未入班/.test(q)) {
      params.unassigned = 'true';
      if (['未分班','未入班','unassigned'].includes(String(params.status))) delete params.status;
    }
    return { ...t, params };
  }) };
}
export function classClarificationPlan(q: string, intent: AiIntent, today: string): AiIntent {
  if (intent.tools?.some(t => t.name === 'new_student_attendance')) return intent;
  if (!/出勤|到课/.test(q)) return intent;
  const calendar = resolveBusinessCalendar({question:q,today});
  if (calendar.clarification) return { parsedOk:true, reply:calendar.clarification };
  const period = calendar.observation;
  return { ...intent, tools: [{ name: 'class_attendance', params: { startDate: period.start, endDate: period.end } }] };
}
/** Deterministic baseline for mock only. Real-model classification is separately verified. */
export function localBusinessIntent(q: string, today: string): AiIntent {
  if (/删除|修改.*数据|执行.*(?:SQL|命令)|绕过权限|密码|密钥|其他机构/.test(q))
    return {
      parsedOk: true,
      reply: 'AI仅提供本机构获准数据的只读分析，不执行修改，也不提供密钥或其他机构数据。',
    };
  if (/收入/.test(q) && !/净成单|现金流|成单|退费|课消|历史缴费/.test(q))
    return {
      parsedOk: true,
      reply: '你指新签续费减退费的净成单额、历史缴费，还是实际课消金额？请选择一个口径。',
    };
  if (/净成单/.test(q) && /定义|公式|理解|口径/.test(q))
    return {
      parsedOk: true,
      reply:
        '净成单额=已确认新签金额+已确认续费金额-已确认退费金额。按各自业务日期统计，作废不计；不等同利润或历史缴费。',
    };
  if (/赚|利润/.test(q))
    return {
      parsedOk: true,
      reply:
        '你指净成单额（新签加续费减已确认退费），还是扣除完整成本后的利润？当前系统未采集完整成本。',
    };
  const calendar = resolveBusinessCalendar({question:q,today});
  if (calendar.clarification) return { parsedOk:true, reply:calendar.clarification };
  const period = calendar.observation;
  const params: Record<string, unknown> = { startDate: period.start, endDate: period.end };
  let name = 'campus_overview';
  const specificDomain = (
    [
      'enrollments',
      'credit_ledger',
      'credit_bills',
      'management_events',
      'batch_pricing',
    ] as BusinessDomain[]
  ).find((k) => BUSINESS_DOMAINS[k].aliases.split(' ').some((a) => q.includes(a)));
  if (specificDomain)
    return {
      parsedOk: true,
      tools: [
        {
          name: 'business_records',
          params: {
            ...params,
            domain: specificDomain,
            ...(specificDomain === 'enrollments' && /当前|现在|在读/.test(q)
              ? { view: 'current' }
              : {}),
          },
        },
      ],
      ...(isFileRequest(q)
        ? { fileRequested: true, fileTool: 'business_records', fileFormats: requestedFormats(q) }
        : {}),
    };
  if (/低出勤/.test(q)) {
    name = /班级/.test(q) ? 'low_attendance_classes' : 'low_attendance_students';
    delete params.startDate;
    delete params.endDate;
  } else if (/体验/.test(q)) {
    name = 'experience_overview';
    if (/未成单|待跟进/.test(q)) params.unconvertedOnly = 'true';
  } else if (/退费明细|退费状态/.test(q)) {
    name = 'business_records';
    params.domain = 'refunds';
  } else if (/退费|退款|退了|退多少|已退|净成单|现金|收入/.test(q)) name = 'cost_and_income';
  else if (/成单|新签|续费/.test(q)) name = 'signup_renewal';
  else if (/环比|比较|对比/.test(q)) name = 'weekly_comparison';
  else if (/实际课消|课消.*金额|课消多少钱/.test(q)) name = 'actual_consumption';
  else if (/出勤|到课/.test(q)) name = 'class_attendance';
  else if (/扣课|课消/.test(q)) name = 'net_deduction';
  else if (/满班率|基本盘|班级.*变化/.test(q)) name = 'class_student_changes';
  else {
    const domain = (Object.keys(BUSINESS_DOMAINS) as BusinessDomain[]).find((k) =>
      BUSINESS_DOMAINS[k].aliases.split(' ').some((a) => q.includes(a))
    );
    if (domain) {
      name = 'business_records';
      params.domain = domain;
      if (/未分班/.test(q)) params.unassigned = 'true';
      if (domain === 'enrollments' && /当前|现在|在读/.test(q)) params.view = 'current';
    } else if (/班级/.test(q)) {
      name = 'search_classes';
      delete params.startDate;
      delete params.endDate;
    } else if (/周报|报告/.test(q)) name = 'weekly_report_data';
  }
  if (/低出勤/.test(q) && /本月|上月|上个月|上周|本周|\d{4}-\d{2}-\d{2}/.test(q))
    Object.assign(params, { startDate: period.start, endDate: period.end });
  return {
    parsedOk: true,
    tools: [{ name, params }],
    ...(isFileRequest(q)
      ? { fileRequested: true, fileTool: name, fileFormats: requestedFormats(q) }
      : {}),
  };
}
export function isPurePresentationRequest(text: string) {
  const remaining = text.replace(/(?:请|麻烦|帮我|建议|小表|那张|针对|刚才的?|之前的?|上条的?|上一条的?|这份|这个|这些|这组|那份|这数|结果|数据|把|将|做成|做|制作|整理成|转成|导出|生成|制表|表格|清单|报告|表|文件|文档|不用导出|不需要文件|不用|只在对话|仅在对话|展示|Excel|Word|docx|xlsx|和|并|成|[，,。！!？?\s])/gi,'');
  return /表格|制表|导出|Excel|Word|docx|xlsx/i.test(text) && !remaining;
}
/** Restore only structured, owned evidence, never assistant prose or another conversation. */
export function inheritPreviousIntent(
  q: string,
  intent: AiIntent,
  previous: any[],
  today: string
): AiIntent {
  if (intent.reply || /删除|修改.*数据|SQL|绕过|其他机构|密码|密钥|股票|旅游|手机/.test(q)) return intent;
  const text = q.trim();
  const cards = previous.filter(c => c && c.tool !== 'report_file' && !c.error && Array.isArray(c.rows));
  if (!cards.length) return intent;
  // Removing only known formatting words leaves any new name, metric or scope visible.
  const pureExport = isPurePresentationRequest(text);
  const dateOnly = isCalendarOnlyFollowup(text);
  const unassigned = /^(?:请|帮我)?只看未分班(?:的)?(?:学员)?[。！!？?]*$/.test(text);
  if (!pureExport && !dateOnly && !unassigned) return intent;

  const calendar = resolveBusinessCalendar({question:q,today,intent});
  if (calendar.clarification) return {parsedOk:true,reply:calendar.clarification};
  if (unassigned && (cards.length !== 1 || cards[0].tool !== 'business_records' || cards[0].filters?.domain !== 'students'))
    return {parsedOk:true,reply:'你要未分班学员名单，还是未分班成单金额？请明确后查询。'};

  const tools = [];
  for (const card of cards) {
    const definition = AI_TOOLS.find(t=>t.name===card.tool);
    if (!definition) {
      if (card.tool === 'uploaded_file' && pureExport) continue;
      if (card.tool === 'uploaded_file' && dateOnly) return {parsedOk:true,reply:'该上传快照没有按业务日期建立索引。请提供新期间的资料再对照。'};
      return intent;
    }
    const params: Record<string,unknown> = {};
    for (const [key,value] of Object.entries(card.filters || {})) {
      if (Object.prototype.hasOwnProperty.call(definition.paramsSchema,key) && value != null) params[key]=value;
    }
    const domain = BUSINESS_DOMAINS[params.domain as BusinessDomain];
    const dated = !!definition.paramsSchema.startDate && (card.tool !== 'business_records' || (domain?.date && params.view!=='current'));
    if (dateOnly && !dated)
      return {parsedOk:true,reply:'上一轮包含仅能查询当前状态的资料，无法还原指定期间。请明确要按日期统计的业务指标。'};
    if (dated) {
      const period = dateOnly ? calendar.observation : card.timeRange;
      if (period?.start && period?.end) Object.assign(params,{startDate:period.start,endDate:period.end});
    }
    if (unassigned) params.unassigned='true';
    tools.push({name:card.tool,params});
  }
  return { ...intent, parsedOk:true, tools, reuseSnapshot:pureExport,
    ...(isFileRequest(q) ? {fileRequested:true,fileTool:tools[0]?.name || cards[0].tool,fileFormats:requestedFormats(q)} : {}) };
}

/** Scope-wide order totals have one stable route; named people/classes still use entity resolution. */
export function orderMetricIntent(q:string,today:string): AiIntent | undefined {
  if (/^(?:请(?:帮我)?(?:查询|统计)?\s*)?(?:(?:本|当前)(?:机构|校区)(?:的)?\s*)?(?:全部|所有|截至目前的?)(?:有效|已确认)(?:成单|订单)(?:\s*(?:一共|总共|共)?(?:有)?(?:多少|几)(?:笔|单))?[？?，,。\s]*(?:(?:成交|成单)?总(?:额|金额)(?:是)?(?:多少(?:元)?|多少钱))?[？?。\s]*$/.test(q.trim())) {
    return {parsedOk:true,tools:[{name:'all_confirmed_orders',params:{}}]};
  }
  if (!/成单|新签|续费/.test(q) || !/总金额|总额|合计|各多少|多少钱|金额是多少/.test(q)
    || /老师|教练|班级|新班|学员现在|他|她|利润|退费|退款|新报.*上课|定义|区别|口径/.test(q)) return undefined;
  const stripped=q.replace(/\d{4}年\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}|本校区|当前校区|本机构|今天|昨天|本月|上个月|上月|本周|上周|请列出每一笔续费的学员、课时和金额|请列出|每一笔|学员|课时|金额|续费|新签|成单|总金额|总额|合计|各多少|是多少元|多少元|多少钱|是多少|统计|查询|查|请|和|与|的|[？?，,。；;\s]/g,'');
  if (stripped) return undefined;
  const calendar=resolveBusinessCalendar({question:q,today});
  if(calendar.clarification)return {parsedOk:true,reply:calendar.clarification};
  return {parsedOk:true,tools:[{name:'signup_renewal',params:{startDate:calendar.observation.start,endDate:calendar.observation.end,
    ...(/明细|每一笔|列出/.test(q)?{includeDetails:'true',orderType:/续费/.test(q)&&!/新签|成单/.test(q)?'renewal':'all'}:{})}}]};
}
