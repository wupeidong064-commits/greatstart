import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Input, message, Space, Tag } from 'antd';
import { BookOpen, Copy, Download, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { Modal } from '../components/overlays';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { connectionConfig, integrationEndpoint, integrationManual, integrationTools } from './integrationGuide';
import './data-interface.css';

type KeyStatus = { revision: string | null; status: 'missing' | 'active' | 'revoked' | 'unavailable'; keyPrefix: string | null; createdAt: string | null; lastUsedAt: string | null };
const statusLabel = { missing: '尚未生成', active: '已启用', revoked: '已停用', unavailable: '已失效，请重新生成' };
const errorMessage = (e: any) => e?.response?.data?.error?.message || e?.message || '操作失败，请重试';

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
  else {
    const field = document.createElement('textarea');
    field.value = text; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.appendChild(field);
    try { field.select(); if (!document.execCommand('copy')) throw new Error('请手动选中并复制'); }
    finally { field.remove(); }
  }
}

const DataDescription = () => {
  const user = useAuthStore(s => s.user), token = useAuthStore(s => s.token);
  const scope = `${user?.id}:${user?.organizationId}:${user?.campusId}:${token}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const requestSequence = useRef(0), busy = useRef(false), mounted = useRef(true);
  const [data, setData] = useState<KeyStatus | null>(null);
  const [reading, setReading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<'generate' | 'revoke' | null>(null);
  const [secret, setSecret] = useState('');
  const endpoint = integrationEndpoint(), manual = integrationManual(endpoint);
  const load = useCallback(async () => {
    const request = ++requestSequence.current, ownScope = scope;
    setReading(true); setError('');
    try {
      const result = await api.get('/integration-key');
      if (!mounted.current || ownScope !== currentScope.current || request !== requestSequence.current) return;
      const status = result.data as KeyStatus;
      if (!status || !(status.status in statusLabel)) throw new Error('接入配置格式异常');
      setData(status);
    } catch (e) {
      if (mounted.current && ownScope === currentScope.current && request === requestSequence.current) { setData(null); setError(errorMessage(e)); }
    } finally { if (mounted.current && ownScope === currentScope.current && request === requestSequence.current) setReading(false); }
  }, [scope]);
  useEffect(() => {
    mounted.current = true; setData(null); setSecret(''); setConfirmation(null); void load();
    return () => { mounted.current = false; ++requestSequence.current; };
  }, [load]);
  const copy = async (text: string) => {
    try { await copyText(text); message.success('已复制'); } catch (e) { message.error(errorMessage(e)); }
  };
  const mutate = async (action: 'generate' | 'revoke') => {
    if (busy.current || !data || reading) return;
    const ownScope = scope;
    busy.current = true; setSaving(true); setError(''); setSecret('');
    try {
      const payload = { expectedRevision: data.revision };
      const result = action === 'generate' ? await api.post('/integration-key', payload) : await api.delete('/integration-key', { data: payload });
      if (!mounted.current || ownScope !== currentScope.current) return;
      const next = result.data;
      if (!next || !(next.status in statusLabel) || (action === 'generate' && !/^bzsk_[a-f0-9]{64}$/.test(next.plaintext || '')))
        throw new Error('操作结果未确认，请刷新配置；需要时重新生成密钥');
      const { plaintext: oneTimeSecret, ...metadata } = next;
      setData(metadata); setConfirmation(null);
      if (action === 'generate') setSecret(oneTimeSecret);
      else message.success('接入已停用，旧密钥已失效');
    } catch (e: any) {
      if (mounted.current && ownScope === currentScope.current) {
        setConfirmation(null); await load();
        if (!mounted.current || ownScope !== currentScope.current) return;
        setError(e?.response ? errorMessage(e) : '操作结果未确认，已重新读取配置。若密钥已生成但未取得，请重新生成；旧密钥将失效。');
      }
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([manual], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = '蜂鸣课务_数据接口使用说明.md'; a.click(); URL.revokeObjectURL(url);
  };
  const timestamp = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '暂无';
  return <div className="data-interface">
    <header className="data-interface-heading">
      <div><h1><BookOpen size={20} />数据接口说明</h1><p>将蜂鸣课务连接到自己的 AI 助手，按本机构真实数据进行查询与分析。</p></div>
      <Space wrap><Button icon={<Copy size={16} />} onClick={() => copy(manual)}>复制说明书</Button><Button icon={<Download size={16} />} onClick={download}>下载说明书</Button></Space>
    </header>
    <Card title={<span className="data-interface-title"><KeyRound size={18} />接入配置</span>} extra={<Tag color="purple">免费 · 只读</Tag>} loading={reading}>
      {error && <Alert type="error" message={error} action={<Button size="small" onClick={load} disabled={saving}>刷新配置</Button>} />}
      <div className="data-interface-field"><label htmlFor="mcp-endpoint">MCP 接入地址</label><div className="data-interface-input"><Input id="mcp-endpoint" value={endpoint} readOnly /><Button aria-label="复制接入地址" icon={<Copy size={16} />} onClick={() => copy(endpoint)}>复制</Button></div></div>
      <div className="data-interface-field"><label htmlFor="mcp-key">API Key <span className="data-interface-muted">{data ? statusLabel[data.status] : '配置未读取'}</span></label>
        <Input id="mcp-key" value={data?.keyPrefix ? `${data.keyPrefix}••••••••••••••••` : ''} placeholder="点击下方按钮生成并保存接入密钥" readOnly />
      </div>
      <Space wrap className="data-interface-actions">
        <Button type="primary" icon={<KeyRound size={16} />} disabled={!data || reading} loading={saving} onClick={() => data?.revision ? setConfirmation('generate') : mutate('generate')}>{data?.revision ? '重新生成密钥' : '生成并保存密钥'}</Button>
        <Button disabled={!data || data.status !== 'active' || saving || reading} onClick={() => setConfirmation('revoke')}>停用接入</Button>
        <Button icon={<RefreshCw size={16} />} onClick={load} disabled={saving || reading}>刷新状态</Button>
      </Space>
      <p className="data-interface-muted">每机构一把密钥，生成后自动保存。完整密钥仅生成时展示，请复制保管；重新生成后旧密钥失效。</p>
      {data?.createdAt && <p className="data-interface-muted">生成时间：{timestamp(data.createdAt)} · 最近访问：{timestamp(data.lastUsedAt)}（北京时间）</p>}
    </Card>
    <Card title="三步连接 AI 助手">
      <ol><li>在本页生成密钥，并复制接入地址。</li><li>在支持 HTTP MCP 和自定义请求头的 AI 工具中添加服务，填写地址；认证填入 <code>Authorization: Bearer 你的密钥</code>。</li><li>连接后询问“列出学员”或“查询本月销售统计”，助手按需调用下方工具。</li></ol>
      <div className="data-interface-code-heading"><span>通用 MCP 配置参考</span><Button size="small" icon={<Copy size={14} />} onClick={() => copy(connectionConfig(endpoint))}>复制配置模板</Button></div>
      <pre>{connectionConfig(endpoint)}</pre>
      <p className="data-interface-muted">不同客户端的配置格式可能不同。模板中的密钥需自行替换；复制说明书到普通聊天框不会自动建立连接。</p>
      {['127.0.0.1', 'localhost', '[::1]'].includes(new URL(endpoint).hostname) && <Alert type="info" message="当前是本机测试地址，本机客户端可连接；云端 AI 需要可访问的 HTTPS 部署地址。" />}
    </Card>
    <Card title="工具与数据口径">
      <p>共 5 个只读工具。参数均为可选；无需传机构或校区，查询范围由密钥决定。金额单位为元，日期按北京时间解释。</p>
      <div className="data-interface-tools">{integrationTools.map(tool => <article key={tool.name}>
        <h3>{tool.title}<code>{tool.name}</code></h3><dl><dt>参数</dt><dd>{tool.parameters}</dd><dt>返回字段</dt><dd>{tool.returns}</dd><dt>统计口径</dt><dd>{tool.note}</dd></dl>
      </article>)}</div>
    </Card>
    <Card title={<span className="data-interface-title"><ShieldCheck size={18} />使用范围与排查</span>}>
      <ul><li>密钥仅用于本 MCP 接口，不能登录系统、修改业务、执行 SQL 或查询其他机构。</li>
        <li>每机构每分钟最多 60 次接入请求，同一来源 IP 每分钟最多 180 次；查询不消耗蜂鸣 AI 积分，外部模型费用由所用 AI 工具决定。</li>
        <li>生成者停用、取消管理员权限、修改密码或机构范围变化后，密钥失效，可由当前管理员重新生成。</li>
        <li>401：密钥缺失或失效；403：权限或机构范围不可用；429：稍后重试；工具参数错误返回 JSON-RPC -32602。</li>
        <li>工具返回在 result.content 的 text 字段中，是 JSON 字符串。isError=true 或 errors 非空时，按提示核实，不能把查询失败当成 0。</li>
      </ul>
      <p className="data-interface-muted">完整握手与 curl 示例包含在可复制、下载的说明书中。列表有条数上限，需要时按姓名缩小查询范围。</p>
    </Card>
    <Modal title={confirmation === 'revoke' ? '停用外部 AI 接入' : '重新生成接入密钥'} open={!!confirmation}
      onCancel={() => setConfirmation(null)} onOk={() => confirmation && mutate(confirmation)} confirmLoading={saving}
      okText={confirmation === 'revoke' ? '确认停用' : '确认重新生成'}>
      <p>{confirmation === 'revoke' ? '停用后，使用当前密钥的外部 AI 将无法继续查询。需要时可以重新生成密钥。' : '重新生成后，旧密钥立即失效，已连接的 AI 工具需要更新密钥。'}</p>
    </Modal>
    <Modal title="密钥已生成并保存" open={!!secret} footer={<Button type="primary" onClick={() => setSecret('')}>已复制并妥善保存</Button>} onCancel={() => setSecret('')}>
      <p>完整密钥仅在本次展示。请复制到自己的 AI 工具，关闭后无法再次查看。</p>
      <Input.TextArea aria-label="新生成的 API Key" readOnly value={secret} autoSize={{ minRows: 2, maxRows: 4 }} />
      <Space wrap style={{ marginTop: 16 }}><Button icon={<Copy size={16} />} onClick={() => copy(secret)}>复制密钥</Button><Button onClick={() => copy(connectionConfig(endpoint, secret))}>复制完整接入配置</Button></Space>
    </Modal>
  </div>;
};
export default DataDescription;
