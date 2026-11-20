export const integrationTools = [
  { name: 'get_context_summary', title: '经营概览', parameters: '无', returns: 'activeClasses、activeStudents、monthOrderCount、monthOrderAmount、monthNewOrderCount、monthRenewalOrderCount、lowAttendanceStudents、generatedAt、errors',
    note: '在册人数为活跃班级内有效报名去重。成单仅包含已确认订单，作废单不计；金额未扣退款，不代表净现金流。快照最多缓存60秒；查询失败的指标为null，并附errors，不能按0解释。' },
  { name: 'list_teachers', title: '工作人员', parameters: 'search：姓名，可选，最多100字', returns: 'teachers[]：id、name、role、phone、email、isActive；count',
    note: '仅本机构在职工作人员，排除家长和平台账号；最多100条。role是岗位原始值，不能据此推断管理权限。' },
  { name: 'list_students', title: '学员名单', parameters: 'search：姓名，可选，最多100字；limit：整数1–50，默认20', returns: 'students[]：id、name、phone、status、createdAt；count、note',
    note: '按创建时间倒序，包括不同状态的学员；count仅为本次返回条数，不代表全机构总人数。超过上限时按姓名缩小范围。' },
  { name: 'get_low_attendance_students', title: '低出勤学员', parameters: 'days：整数1–90，默认30；threshold：整数1–99，默认60（%）', returns: 'students[]：studentId、studentName、phone、className、teacherName、scheduleCount、presentCount、attendanceRate；total、days、threshold、startDate、endDate、caliber',
    note: '按上海日历统计近N天的实到/应到课次，限定有效入班期间，包含已过期未点名及临时串课；无应到课次不列入。仅当前在读学员，每学员×班级一行，低于阈值才列入；按出勤率升序，最多50条，total是筛选后总行数。' },
  { name: 'get_sales_statistics', title: '销售统计', parameters: 'startDate、endDate：YYYY-MM-DD，可选；包含首尾日期，起始不能晚于结束', returns: 'statistics[]：teacherId、teacherName、role、orderCount、orderAmount、missingPriceCount、newOrderCount、newOrderAmount、newMissingPriceCount、renewalOrderCount、renewalOrderAmount、renewalMissingPriceCount；total、startDate、endDate、caliber',
    note: '仅已确认成单，按成单业务日期过滤，按salesId归属（teacherId沿用历史命名，表示销售归属人员）。包含离职人员历史成单，排除作废；所有金额为已知价格合计，缺价单计入单数但不计金额，真实0元不算缺价，不自动补价。missingPriceCount为每名人员的缺价单数，newMissingPriceCount和renewalMissingPriceCount分别为新签及续费缺价单数；缺价时金额不代表完整销售额。未扣退款，不等于净收入或实际课消。最多100名人员，total为人员总数。' },
];

export function integrationEndpoint() {
  const base = new URL(import.meta.env.VITE_API_BASE || '/api', window.location.origin);
  base.pathname = base.pathname.replace(/\/$/, '') + '/mcp';
  base.search = ''; base.hash = '';
  return base.href;
}

export function connectionConfig(endpoint: string, key = '<你的 API Key>') {
  return JSON.stringify({ mcpServers: { 'buzzer-course': { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
}

export function integrationManual(endpoint: string) {
  const curl = (body: unknown) => `curl '${endpoint}' \\\n  -H 'Authorization: Bearer <你的 API Key>' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Accept: application/json, text/event-stream' \\\n  --data '${JSON.stringify(body)}'`;
  return [
    '# 蜂鸣课务数据接口使用说明', '版本：1.0',
    `## 接入\nMCP地址：${endpoint}\n传输：Streamable HTTP（无状态，JSON响应）\n认证：Authorization: Bearer <你的 API Key>\n请求头：Content-Type: application/json；Accept: application/json, text/event-stream`,
    '在支持HTTP MCP和自定义请求头的AI应用中填写地址与密钥。不同客户端配置格式可能不同；以下是通用参考。普通聊天框里粘贴说明不会自动完成连接。', connectionConfig(endpoint),
    '## 密钥\n机构管理员在本页生成并保存密钥。每机构一把，完整密钥仅生成时展示，请复制保管。刷新后只显示前缀，遗失可重新生成。重新生成或停用后旧密钥失效。生成者停用、取消管理权限、改密或机构范围变化后密钥失效。密钥仅用于本MCP入口，不能登录或调用其他业务接口。',
    '## 可查询工具', ...integrationTools.map(t => `### ${t.name} — ${t.title}\n参数：${t.parameters}\n返回：${t.returns}\n口径：${t.note}`),
    '## 调用示例\n先完成MCP initialize握手，再发送tools/list或tools/call；支持MCP的客户端通常自动处理握手。',
    curl({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'example', version: '1.0' } } }),
    curl({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_students', arguments: { limit: 20 } } }),
    '工具返回在result.content的text字段中，是JSON字符串；isError=true表示查询失败，不能当成空数据。',
    '## 使用范围与错误\n仅查询密钥所属机构，无写入、删除、任意SQL或跨机构查询。每机构每分钟60次请求（含握手和工具发现）；同一来源IP每分钟180次。MCP查询不消耗蜂鸣AI积分；外部模型费用由客户自己的AI工具决定。',
    '401：密钥缺失、错误或已失效；403：不是管理员或机构范围不可用；429：请求过于频繁；JSON-RPC -32602：工具名或参数无效。工具isError=true：业务查询失败，请稍后重试。',
    '本机localhost/127.0.0.1地址只能由本机客户端访问。云端AI需要可访问的HTTPS部署地址。列表有条数上限，不保证全量导出；日期、金额和缺失值必须按各工具口径解读，不编造未返回的数据。',
  ].join('\n\n') + '\n';
}
