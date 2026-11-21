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
/** 安全探针：索取系统提示词/内部配置的请求一律明确拒绝，不泄露配置。 */
export function securityProbeIntent(q: string): AiIntent | undefined {
  if (!/系统提示词|你的提示词|提示词发给我|system prompt|你的(?:系统)?指令|内部(?:系统)?配置|你的(?:系统)?设定/i.test(q.trim())) return undefined;
  return { parsedOk: true, purpose: 'explanation',
    reply: '系统提示词和内部配置不对外提供。我可以帮你查询本机构获准的课务、学员、出勤和经营数据。' };
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
export function isExplanationRequest(q: string) {
  return /什么意思|是啥意思|怎么理解|如何理解|解释(?:一下|下)?(?:刚才|上面|这句话|这句|那个提示|为什么说)|说(?:得)?(?:简单|通俗|白话)一点|有何区别|有什么区别|什么是/.test(q)
    && !/顺便|再帮我查|再算下|同时(?:算|查)|并(?:查|算|统计)|也查/.test(q);
}

export function explanationIntent(q: string, lastAnswer?: string): AiIntent | undefined {
  if (!isExplanationRequest(q)) return undefined;
  const refersBack = /这|那|上面|刚才|前面/.test(q);
  const source = refersBack && !/净成单|课消|确认收入|利润/.test(q) ? q + (lastAnswer || '') : q;
  if (/确认收入缺少可靠计价依据/.test(source))
    return { parsedOk: true, purpose: 'explanation', reply: '这句话是经营对比报告里的说明。报表没有列实际课消金额和利润。净成单额可以查，按已确认新签加续费减退费。上掉的课值多少钱，可以单独查实际课消金额，按原购课批次计价。利润需要工资、房租等完整成本，目前缺少这些数据。' };
  if (/净成单/.test(source) && /课消|利润/.test(source))
    return { parsedOk: true, purpose: 'explanation', reply: '净成单额是已确认的新签加续费再减退费。实际课消金额是已经上掉的课按原购课批次计算的金额。利润还要扣除完整成本。比如 1,000 元买 10 节课，本期成交且无退费，净成单额是 1,000 元；本期上了 3 节，实际课消是 300 元。' };
  if (/净成单/.test(source))
    return { parsedOk: true, purpose: 'explanation', reply: '净成单额等于已确认的新签金额加续费金额，再减已确认退费。按各笔业务的日期统计，作废成单不计入。' };
  return undefined;
}

export function generalAttendanceAdvice(q: string): AiIntent | undefined {
  if (!/出勤|到课/.test(q) || !/怎么排查|如何排查|怎么分析|如何分析|怎么处理/.test(q)
    || /数据|本机构|本校区|我们|这周|本周|上周|上月|刚才|上述|查一下|查出/.test(q)) return undefined;
  return { parsedOk: true, purpose: 'advice', reply: '先按班级和课次核对实到与应到，区分是排课量变了，还是缺勤增加了。然后找连续两次以上未到的学员，核对请假、调课与错记，再联系家长确认原因。下一周按同样口径复查，看看调整后实到是否回升。' };
}

export function criticalMetricClarification(q: string): AiIntent | undefined {
  if (/定义|区别|口径|理解|公式/.test(q) || isExplanationRequest(q)) return undefined;
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
  } else if (/快上完课|该续费|该提醒|续费名单|快要上完/.test(q)) name = 'renewal_candidates';
  else if (/退费|退款|退了|退多少|已退|净成单|现金|收入/.test(q)) name = 'cost_and_income';
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
/** 双学员出勤对比（盲测遗留 S21R1）：“温语夏和苏语夏…各自出勤”→ 一张卡并列两人。 */
export function duoStudentAttendanceIntent(q: string): AiIntent | undefined {
  const text = q.trim();
  if (!/出勤|到课/.test(text) || /老师|教练|班级|其他机构|删除|修改/.test(text)) return undefined;
  const m = /([\u4e00-\u9fa5·]{2,6})[和与跟]([\u4e00-\u9fa5·]{2,6})/.exec(text);
  if (!m) return undefined;
  const a = m[1], b = m[2];
  if (!/各自|分别|是不是同一|是同一|两个人|同一个人|谁的|谁更|哪位/.test(text) && !/出勤|到课/.test(text.slice(m.index + m[0].length))) return undefined;
  if (/课程|班级|机构|校区|老师|教练/.test(a + b)) return undefined;
  return { parsedOk: true, tools: [{ name: 'student_attendance', params: { studentName: a + '、' + b } }] };
}

/** 裸实体追问兜底：实体名必须出现在上一轮业务卡行内才接管，避免误触新问题。 */
export function entitySwapFollowupIntent(question: string, previous: any[]): AiIntent | undefined {
  const text = question.trim();
  if (text.length > 26) return undefined;
  if (!/[呢？?]|数字|怎么样|应到|实到|出勤/.test(text)) return undefined;
  if (/成单|退费|课消金额|余额|课时数|利润|收入|排名|新签|续费名单|转化|体验课|现金流|满班|对比|合计|比例|为什么|原因|哪些老师|哪位老师/.test(text)) return undefined;
  const prev = previous.find(c => c && !c.error && Array.isArray(c.rows) && c.rows.length);
  const toolDef = prev ? AI_TOOLS.find(t => t.name === prev.tool) : undefined;
  if (!prev || !toolDef) return undefined;
  const entityFields = ['班级', '姓名', '老师', '名称'] as const;
  let entity: string | null = null;
  let entityField: (typeof entityFields)[number] | null = null;
  for (const row of prev.rows.slice(0, 50)) {
    for (const f of entityFields) {
      const v = row[f];
      if (typeof v === 'string' && v.length >= 2 && v.length <= 20 && text.includes(v)) { entity = v; entityField = f; break; }
    }
    if (entity) break;
  }
  if (!entity) return undefined;
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prev.filters || {})) {
    if (Object.prototype.hasOwnProperty.call(toolDef.paramsSchema, k) && v != null) params[k] = v;
  }
  if (prev.timeRange?.start && prev.timeRange?.end
    && Object.prototype.hasOwnProperty.call(toolDef.paramsSchema, 'startDate')) {
    params.startDate = prev.timeRange.start;
    params.endDate = prev.timeRange.end;
  }
  if (entityField === '班级' || (/班$/.test(entity) && Boolean(toolDef.paramsSchema.className))) {
    if (!toolDef.paramsSchema.className && !toolDef.paramsSchema.classId) return undefined;
    if (toolDef.paramsSchema.className) params.className = entity;
    if (toolDef.paramsSchema.classId && !params.classId) {
      const hit = prev.rows.find((r: any) => r.班级 === entity && typeof r.classId === 'string');
      if (hit) params.classId = hit.classId;
    }
  } else if (entityField === '姓名' && toolDef.paramsSchema.studentName) {
    params.studentName = entity;
  } else if (entityField === '老师' && toolDef.paramsSchema.teacherName) {
    if (!/老师|教练|顾问/.test(entity)) return undefined;
    params.teacherName = entity;
  } else if (entityField === '名称' && /班$/.test(entity) && toolDef.paramsSchema.className) {
    params.className = entity;
  } else {
    return undefined;
  }
  return { parsedOk: true, tools: [{ name: prev.tool, params }] };
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
    if (dateOnly) delete params.direction; // 纯改期追问重置排名方向，方向词只描述当前轮
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
  if (/净成单额/.test(q) && !/老师|教练|班级|学员|利润|区别|定义|口径|什么意思/.test(q)
    && !/老师|教练|班级|学员/.test(q)) {
    const calendar=resolveBusinessCalendar({question:q,today});
    if(calendar.clarification)return {parsedOk:true,reply:calendar.clarification};
    return {parsedOk:true,tools:[{name:'cost_and_income',params:{startDate:calendar.observation.start,endDate:calendar.observation.end}}]};
  }
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
