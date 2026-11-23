import type { AiIntent } from './aiIntent';
import { BUSINESS_DOMAINS, BusinessDomain } from './aiDataDictionary';
import { resolveBusinessCalendar, isCalendarOnlyFollowup, withoutPeriodMentions } from './aiBusinessCalendar';
import { businessToday } from './aiOperatingPlan';
import { rankScopeFor } from './aiQueryBinding';
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
  if (/授课老师|授课教师|代课老师/.test(q) && /负责老师|负责[人这]|班主任|主责/.test(q) && /能.*当|是否.*等同|同一回事|区别/.test(q))
    return {parsedOk:true,purpose:'explanation',reply:'请查看班级资料中的负责老师。当堂授课人记录谁实际上了这节课，班级主责记录谁负责跟进；遇到代课，两人可能不同。'};
  if (/利润/.test(q) && /当成?|等同|就是|等于/.test(q) && /净额|净成单/.test(q+(lastAnswer||'')))
    return {parsedOk:true,purpose:'explanation',reply:'不能。净成单额只扣除了已确认退费，利润还需要核对已履约收入和工资、房租等完整成本。'};
  if (/推算|算出|推[断出]/.test(q) && /工资|薪酬/.test(q) && /这|据此|仅凭/.test(q))
    return {parsedOk:true,purpose:'explanation',reply:'仅凭这些经营数字无法推算老师工资。还需要个人有效授课、业绩归属和本机构约定的薪酬规则。'};
  if (/能确定|能证明|证实|需要核实|还得.*核实/.test(q) && /缺勤|出勤|实到/.test(lastAnswer||'') && /原因|教学|核实/.test(q))
    return {parsedOk:true,purpose:'explanation',reply:'出勤记录能证实实到和应到的人次差异。教学质量、请假、调课或漏签都需要核对课次记录并回访，单凭出勤变化无法判定原因。'};
  if (/成交|成单/.test(q) && /实收|到账/.test(q) && /课消/.test(q) && /意思|含义|区别|定义|什么是/.test(q))
    return {parsedOk:true,purpose:'explanation',reply:'成交额按已确认订单统计，实收按实际到账日期统计，课消金额按已经上掉的课时和对应购课批次的价格统计。比如本月签单并付清、下月开始上课，本月有成交和实收，下月上课扣课后才产生课消。'};
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
            ...(specificDomain === 'students' && /流失/.test(q) ? { status: '流失' } : {}),
            ...(specificDomain === 'students' && /归档/.test(q) ? { status: '已归档' } : {}),
          },
        },
      ],
      ...(isFileRequest(q)
        ? { fileRequested: true, fileTool: 'business_records', fileFormats: requestedFormats(q) }
        : {}),
    };
  if (/出勤率?\s*(?:低于|不高于|不超过|不到|不满|未满)\s*\d+/.test(q) && /学员|学生/.test(q) && !/老师|教练|班级/.test(q)) {
    name = 'low_attendance_students';
    delete params.startDate;
    delete params.endDate;
  } else if (/出勤率?\s*(?:低于|不高于|不超过|不到|不满|未满)\s*\d+/.test(q) && /班级|各班|班/.test(q)) {
    name = 'low_attendance_classes';
    delete params.startDate;
    delete params.endDate;
  } else if (/低出勤/.test(q)) {
    name = /班级/.test(q) ? 'low_attendance_classes' : 'low_attendance_students';
    delete params.startDate;
    delete params.endDate;
  } else if (/体验/.test(q)) {
    name = 'experience_overview';
    if (/未成单|待跟进/.test(q)) params.unconvertedOnly = 'true';
  } else if (/退费明细|退费状态/.test(q)) {
    name = 'business_records';
    params.domain = 'refunds';
  } else if (courseRankingIntent(q)) {
    return courseRankingIntent(q)!;
  } else if (/快上完课|该续费|该提醒|续费名单|快要上完/.test(q)) name = 'renewal_candidates';
  else if (/退费|退款|退了|退多少|已退|净成单|现金|收入/.test(q)) name = 'cost_and_income';
  else if (/成单|新签|续费/.test(q)) name = 'signup_renewal';
  else if ((/谁.{0,10}(?:第一|最高|最低|最差|最好|最后|倒数)|哪个(?:老师|教练|教师).{0,10}(?:第一|最高|最低|最差|最好|排名|排行)|(?:第一|最高|最低|最差|最好|较好|最后)(?:的)?(?:老师|教练)?[^。]{0,4}是谁|(?:老师|教练|教师)[^。]{0,8}(?:排名|排行)/.test(q))
    && /出勤|课消|成单|核销/.test(q) && !/学员|学生|班级|各班|课程|学科|科目|哪门/.test(q)) {
    name = 'teacher_performance_ranking';
    if (/课消|核销/.test(q)) params.metric = 'consumption';
    else if (/成单|成交/.test(q)) params.metric = 'sales';
    if (/最低|最差|表现最差|垫底|倒数|排在最后|排最后|谁最后|最后一名|末位/.test(q)) params.direction = 'min';
    const scope = rankScopeFor(q);
    if (scope === 'teachers') params.scope = 'teachers';
  }
  else if (/环比|同比|对比/.test(q) && !/(?:比较|更|较)好|更好|较好|哪家强|谁更高/.test(q)) name = 'weekly_comparison';
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
  if (name === 'business_records' && params.domain === 'students') {
    if (/流失/.test(q)) params.status = '流失';
    if (/归档/.test(q)) params.status = '已归档';
  }
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
  const m = /([\u4e00-\u9fa5·]{2,6})[和与跟]([\u4e00-\u9fa5·]{2,6}?)(?=[是的呢，,。？?!！]|各自|分别|$)/.exec(text);
  if (!m) return undefined;
  const a = m[1], b = m[2];
  if (!/各自|分别|是不是同一|是同一|两个人|同一个人|谁的|谁更|哪位/.test(text) && !/出勤|到课/.test(text.slice(m.index + m[0].length))) return undefined;
  if (/课程|班级|机构|校区|老师|教练/.test(a + b)) return undefined;
  return { parsedOk: true, tools: [{ name: 'student_attendance', params: { studentName: a + '、' + b } }] };
}

/** 组合条件（复验必修 C3）：承接低出勤名单，按剩余课时阈值求交集。 */
export function lowAttendanceRenewalIntent(q: string, previous: any[]): AiIntent | undefined {
  if (!/剩\s*\d+\s*节|\d+\s*节以内|剩\d+节|余额.{0,6}以内|课时.{0,6}以内/.test(q.replace(/\s+/g, ''))) return undefined;
  const prev = previous.find(c => c && !c.error && c.tool === 'low_attendance_students' && Array.isArray(c.rows));
  if (!prev) return undefined;
  const m = /(\d+)\s*节以内|剩\s*(\d+)\s*节/.exec(q.replace(/\s+/g, ''));
  const maxRemaining = Math.min(Number(m?.[1] ?? m?.[2] ?? 3), 50);
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prev.filters || {})) {
    if (['startDate', 'endDate', 'threshold', 'thresholdMode', 'classId', 'className'].includes(k) && v != null) params[k] = v;
  }
  params.maxRemaining = maxRemaining;
  return { parsedOk: true, tools: [{ name: 'low_attendance_students', params }] };
}

/** 点名学员余额（复验必修 C1/N3，mock 与真实共用）：余额问法 + 2-4 字姓名 → search_students。
 * 明确单日按课时账回放该日余额；无日期或「现在」按当前快照；省略型追问复用上一轮余额卡对象。 */
export function studentBalanceIntent(q: string, previous: any[] = []): AiIntent | undefined {
  const text = q.trim().replace(/不查老师|不要查?老师|不看老师|不管老师|不问老师/g, '');
  if (!/还剩|余额|剩余课时|剩多少|还剩多少|剩几节|几节课|剩下|还有(?:多少|几)(?:节|课时)/.test(text)) return undefined;
  if (/出勤|成单|续费|退费|课消|班级|排名|哪个班|其他机构|删除|修改/.test(text)) return undefined;
  const m = /([\u4e00-\u9fa5·]{2,4}?)(?:现在|目前|当前)?(?:的课时)?(?=还有(?:多少|几)(?:节|课时)|还剩|的余额|的剩余|剩多少|剩几节|余额)/.exec(text);
  let name = m ? m[1] : undefined;
  if (name && /^(?:学员|学生|老师|教练|班级|现在|当前|目前|还剩|余额|剩余|课时|多少|几节|剩下|还有|月|日|号|那|这|请|帮)/.test(name)) name = undefined;
  return balanceToolPlan(text, name, previous);
}

function balanceToolPlan(text: string, name: string | undefined, previous: any[]): AiIntent | undefined {
  const today = businessToday();
  const calendar = resolveBusinessCalendar({ question: text, today });
  if (calendar.clarification) return { parsedOk: true, reply: calendar.clarification };
  const singleDate = calendar.explicit && calendar.observation.start === calendar.observation.end ? calendar.observation.start : undefined;
  if (singleDate && singleDate > businessToday())
    return { parsedOk: true, reply: '指定日期在当前业务日期之后，余额无法核实。请给出今天或更早的日期，或直接问当前余额。' };
  let keyword = name;
  if (!keyword && (singleDate || calendar.explicit)) keyword = balanceNameIn(text);
  if (!keyword) {
    const prev = previous.find(c => c && c.tool === 'search_students' && !c.error && Array.isArray(c.rows));
    const prevKeyword = prev && prev.filters ? prev.filters.keyword : undefined;
    keyword = typeof prevKeyword === 'string' && prevKeyword ? prevKeyword : undefined;
    if (!keyword) return undefined;
  }
  const params: Record<string, unknown> = { keyword };
  if (singleDate) params.balanceAsOfDate = singleDate;
  return { parsedOk: true, tools: [{ name: 'search_students', params }] };
}

/** 时点余额的姓名兜底（N3）：仅在问题带明确日期且首轮捕获失败时使用。
 * CJK 连续段按填充词（查/一/下/在/的/请/帮/看/问/于）切开，取首个非称谓/量词的 2-4 字段。 */
function balanceNameIn(text: string) {
  const parts = text.split(/[查在的请帮看问于一下]/);
  const bad = /^(?:学员|学生|老师|教练|班级|现在|当前|目前|还剩|余额|剩余|课时|多少|几节|剩下|还有|月|日|号|昨|今|明|那|^这|请|帮|查|谁|哪|他|她|它)/;
  for (const p of parts) {
    for (const c of p.matchAll(/[\u4e00-\u9fa5·]{2,4}/g)) {
      const cand = c[0];
      if (!bad.test(cand)) return cand;
      break; // 每段只试首个 2-4 字段，避免长填充段切出的伪名
    }
  }
  return undefined;
}

/** 课程/学科/哪门 + 排名词 + 成单：如实说明暂无课程/学科成单口径（换对象重选路径）。 */
export function courseRankingIntent(q: string): AiIntent | undefined {
  if (!/课程|学科|科目|哪门/.test(q)) return undefined;
  if (!/最高|最低|第一|最好|最差|排名|排行/.test(q)) return undefined;
  if (!/成单|成交|销售额/.test(q)) return undefined;
  return { parsedOk: true, reply: '系统暂无按课程或学科统计成单额的现成口径。老师排名只用于教学人员或明确放开后的全员排名，不适用于课程、学科维度；可以先查某班级或某课程的学员成单明细，或按老师、销售对比成单额。' };
}

/** 学员出勤排名（复验必修 G1）：学员/学生 + 出勤率 + 最高最低 → student_attendance 排名，不走老师排名。 */
export function studentRankingIntent(q: string): AiIntent | undefined {
  const text = q.replace(/不查老师|不要查?老师|不看老师|不管老师|不问老师|不包括老师|除了老师/g, '');
  if (!/学员|学生|同学/.test(text) || /老师|教师|教练|其他机构|删除|修改/.test(text)) return undefined;
  if (!/出勤|到课/.test(text) || !/最低|最高|最好|最差|最后|倒数|第一|垫底|排名|排行/.test(text)) return undefined;
  const ranking = /最低|最差|最后|倒数|垫底/.test(q) ? 'lowest_rate' : 'highest_rate';
  return { parsedOk: true, purpose: 'facts', subject: 'student', tools: [{ name: 'student_attendance', params: { ranking } }] };
}

/** 裸实体追问兜底：实体名必须出现在上一轮业务卡行内才接管，避免误触新问题。 */
export function entitySwapFollowupIntent(question: string, previous: any[]): AiIntent | undefined {
  const text = question.trim();
  if (text.length > 26) return undefined;
  if (!/[呢？?]|数字|怎么样|应到|实到|出勤/.test(text)) return undefined;
  // 带明确日期的问题是新查询而非承接（复验：改查 12 月 31 日余额不该沿用上一轮快照卡）。
  if (resolveBusinessCalendar({ question: text, today: businessToday() }).explicit) return undefined;
  if (/成单|退费|课消金额|余额|课时数|利润|收入|排名|新签|续费名单|转化|体验课|现金流|满班|对比|合计|比例|为什么|原因|哪些老师|哪位老师/.test(text)) return undefined;
  const prev = previous.find(c => c && !c.error && Array.isArray(c.rows) && c.rows.length);
  const toolDef = prev ? AI_TOOLS.find(t => t.name === prev.tool) : undefined;
  if (!prev || !toolDef) return undefined;
  const entityFields = ['班级', '姓名', '老师', '名称', 'name'] as const;
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
  } else if (entityField === 'name') {
    // 行字段 name 的含义随工具而定：班级行工具→班级参数；学员行工具→学员参数。
    const classRowTools = ['class_attendance', 'low_attendance_classes', 'weekly_report_data', 'class_student_changes'];
    const studentRowTools = ['search_students', 'student_attendance', 'renewal_candidates', 'low_attendance_students', 'new_student_attendance'];
    if (classRowTools.includes(prev.tool) && (toolDef.paramsSchema.classId || toolDef.paramsSchema.className)) {
      if (toolDef.paramsSchema.classId) {
        const hit = prev.rows.find((r: any) => r.name === entity && typeof r.id === 'string');
        if (hit) params.classId = hit.id;
      }
      if (toolDef.paramsSchema.className) params.className = entity;
    } else if (studentRowTools.includes(prev.tool) && (toolDef.paramsSchema.studentName || toolDef.paramsSchema.keyword)) {
      if (toolDef.paramsSchema.studentName) params.studentName = entity;
      else params.keyword = entity;
    } else {
      return undefined;
    }
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
    // 纯改期追问只替换日期，其余条件（含排名方向）承接上一轮；明确改方向才改写。
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
  if (/成单|成交/.test(q) && /多少|几笔|几单/.test(q)) {
    try {
      const body = withoutPeriodMentions(q, today);
      const rest = body.replace(/这一周|这一期|这个月|这一天|本机构|本校区|请问|请|帮我|查一下|查查|查询|统计|成单|成交|总金额|总额|金额|一共|总共|共有|多少|几笔|几单|钱|元|笔|单|的|是|有|呢|了|[？?，,、。\s]/g, '');
      if (!rest) {
        const cal = resolveBusinessCalendar({ question:q, today });
        if (cal.clarification) return { parsedOk:true, reply:cal.clarification };
        return { parsedOk:true, tools:[{name:'signup_renewal',params:{startDate:cal.observation.start,endDate:cal.observation.end}}] };
      }
    } catch { /* Standard calendar binding provides the detailed clarification. */ }
  }
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
