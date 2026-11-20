import { Modal } from '../components/overlays';
/**
 * 平台端机构 AI 管理：开通/停用、人工入账、赠送、流水。
 * 首版人工入账如实标注；所有调整留操作人+原因+时间（服务端流水）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Table, Tag, Button, InputNumber, Input, Select, message, Typography, Space, Alert, Spin } from 'antd';
import { RefreshCw, Plus } from 'lucide-react';
import api from '../services/api';
import { fmtCredits } from '../utils/aiCredits';
import { announceCreditUpdate } from '../services/creditRefresh';

interface AcctRow {
  id: string;
  organizationId: string;
  organizationName: string;
  campusName: string;
  status: string;
  balanceMicros: number;
  reservedMicros: number;
}
interface LedgerRow {
  id: string;
  type: string;
  micros: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = { topup: '充值', grant: '赠送', settle: 'AI 消费', adjust: '调整' };

const AdminAiCampuses: React.FC = () => {
  const [accounts, setAccounts] = useState<AcctRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [selected, setSelected] = useState<AcctRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topup, setTopup] = useState<any>(null);
  const [pkg, setPkg] = useState<Record<string, any>>({});
  const [organizations, setOrganizations] = useState<{ id: string; name: string; code: string }[]>([]);
  const [opening, setOpening] = useState(false);
  const [organizationId, setOrganizationId] = useState<string>();
  const [pending, setPending] = useState(false);
  const operationBusy = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, p] = (await Promise.all([
        api.get('/ai-credits/admin/accounts'),
        api.get('/ai-credits/packages'),
      ])) as any[];
      setAccounts(a?.data ?? a ?? []);
      setPkg(p?.data?.packages ?? {});
      const rows: { id: string; name: string; code: string }[] = [];
      for (let page = 1; ; page++) {
        const response: any = await api.get('/organizations', { params: { page, pageSize: 100 } });
        const batch = response.data || [];
        rows.push(...batch);
        if (batch.length < 100) break;
      }
      setOrganizations(rows);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadLedger = async (accountId: string) => {
    try {
      const r: any = await api.get('/ai-credits/admin/ledger', { params: { accountId } });
      setLedger(r?.data ?? r ?? []);
    } catch {
      setLedger([]);
    }
  };

  const callAdmin = async (url: string, body: any, okMsg: string) => {
    if (operationBusy.current) return false;
    operationBusy.current = true;
    setPending(true);
    try {
      const r: any = await api.post(url, body);
      const d = r?.data ?? r;
      announceCreditUpdate();
      message.success(d?.duplicate ? '重复请求已忽略（未重复入账）' : okMsg);
      await load();
      if (selected) loadLedger(selected.id);
      return true;
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '操作失败');
      return false;
    } finally { operationBusy.current = false; setPending(false); }
  };

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (error) return <Alert type="warning" showIcon message="加载失败" description={error} />;

  return (
    <div>
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>机构 AI 管理</Typography.Title>
        <Space><Button icon={<Plus size={16} />} onClick={() => { setOrganizationId(undefined); setOpening(true); }}>开通机构 AI</Button><Button icon={<RefreshCw size={16} />} onClick={load}>刷新</Button></Space>
      </Space>
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="由平台人工开通机构 AI，确认收款后登记积分入账。" />

      <Card size="small" title="机构账户" style={{ marginBottom: 16 }}>
        <Table
          rowKey="id" size="small" dataSource={accounts} pagination={false}
          onRow={(r) => ({ onClick: () => { setSelected(r); loadLedger(r.id); } })}
          columns={[
            { title: '机构', dataIndex: 'organizationName', key: 'org' },
            { title: '状态', dataIndex: 'status', width: 90, render: (s: string) => (s === 'active' ? <Tag color="green">已开通</Tag> : <Tag>已停用</Tag>) },
            { title: '总余额', dataIndex: 'balanceMicros', width: 110, render: (m: number) => fmtCredits(m) },
            { title: '预留中', dataIndex: 'reservedMicros', width: 100, render: (m: number) => fmtCredits(m) },
            {
              title: '操作', key: 'op', width: 320,
              render: (_: any, r: AcctRow) => (
                <Space wrap>
                  {r.status === 'active' ? (
                    <>
                      <Button size="small" type="primary" disabled={pending}
                        onClick={(e) => { e.stopPropagation(); setTopup({ account: r, credits: null, yuan: null, reason: '', key: crypto.randomUUID() }); }}>
                        人工入账
                      </Button>
                      <Button size="small" disabled={pending}
                        onClick={(e) => { e.stopPropagation(); callAdmin('/ai-credits/admin/adjust', { accountId: r.id, credits: 100, reason: '平台赠送', idempotencyKey: crypto.randomUUID() }, '已赠送 100 积分'); }}>
                        赠送 100
                      </Button>
                      <Button size="small" danger disabled={pending}
                        onClick={(e) => { e.stopPropagation(); callAdmin('/ai-credits/admin/disable', { accountId: r.id, reason: '平台停用（页面操作）' }, '已停用'); }}>
                        停用
                      </Button>
                    </>
                  ) : (
                    <Button size="small" type="primary" disabled={pending}
                      onClick={(e) => { e.stopPropagation(); callAdmin('/ai-credits/admin/enable', { accountId: r.id }, '已恢复原账户'); }}>
                      重新启用
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card size="small" title={selected ? `积分流水 · ${selected.organizationName}` : '积分流水（点击上方账户查看）'}>
        <Table
          rowKey="id" size="small" dataSource={ledger} pagination={{ pageSize: 6 }}
          columns={[
            { title: '时间', dataIndex: 'createdAt', width: 170, render: (t: string) => new Date(t).toLocaleString('zh-CN') },
            { title: '类型', dataIndex: 'type', width: 90, render: (t: string) => TYPE_LABEL[t] ?? t },
            { title: '积分', dataIndex: 'micros', width: 110, render: (m: number) => fmtCredits(m) },
            { title: '余额', dataIndex: 'balanceAfter', width: 110, render: (m: number) => fmtCredits(m) },
            { title: '说明', dataIndex: 'reason', ellipsis: true },
          ]}
        />
      </Card>

      <Modal
        title={topup ? `人工入账 · ${topup.account.organizationName}` : ''}
        open={!!topup}
        onCancel={() => setTopup(null)}
        onOk={async () => {
          if (!topup.reason?.trim()) { message.error('请填写原因'); return; }
          const payload: any = { accountId: topup.account.id, reason: topup.reason, idempotencyKey: topup.key };
          if (topup.credits != null) payload.credits = topup.credits;
          if (topup.yuan != null) payload.yuanAmount = topup.yuan;
          if (topup.credits == null && !topup.packageCode) {
            message.error('请选择套餐或填写自定义积分'); return;
          }
          if (topup.packageCode) payload.packageCode = topup.packageCode;
          if (await callAdmin('/ai-credits/admin/topup', payload, '入账成功')) setTopup(null);
        }}
        okText="确认入账"
        cancelText="取消"
        confirmLoading={pending}
      >
        <Typography.Paragraph type="secondary">
          选择套餐或自定义积分；原因必填（随流水留档：操作人+原因+时间）。
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            {Object.entries(pkg).map(([code, p]: any) => (
              <Button key={code}
                type={topup?.packageCode === code ? 'primary' : 'default'}
                onClick={() => setTopup((prev: any) => ({ ...prev, packageCode: code, credits: null, yuan: p.priceYuan }))}>
                {p.name} ¥{p.priceYuan} → {p.credits.toLocaleString()} 积分
              </Button>
            ))}
          </Space>
          <InputNumber style={{ width: '100%' }} min={0.0001} placeholder="自定义积分（选填，与套餐二选一）"
            value={topup?.credits} onChange={(v) => setTopup((prev: any) => ({ ...prev, packageCode: null, credits: v }))} />
          <InputNumber style={{ width: '100%' }} min={0} placeholder="实收金额 ¥（选填，仅记账）"
            value={topup?.yuan} onChange={(v) => setTopup((prev: any) => ({ ...prev, yuan: v }))} />
          <Input placeholder="原因（必填，如：线下收款 ¥68 开基础包）"
            value={topup?.reason} onChange={(e) => setTopup((prev: any) => ({ ...prev, reason: e.target.value }))} />
        </Space>
      </Modal>
      <Modal title="开通机构 AI" open={opening} onCancel={() => setOpening(false)} confirmLoading={pending}
        okText="确认开通" cancelText="取消" okButtonProps={{ disabled: !organizationId }}
        onOk={async () => { if (organizationId && await callAdmin('/ai-credits/admin/open', { organizationId }, '机构 AI 已开通')) setOpening(false); }}>
        <p>选择机构后开通 AI 账户，积分由该机构管理员共享。</p>
        <Select aria-label="选择开通机构" placeholder="请选择机构" style={{ width: '100%' }} showSearch optionFilterProp="label"
          value={organizationId} onChange={setOrganizationId}
          options={organizations.filter(org => !accounts.some(account => account.organizationId === org.id)).map(org => ({ value: org.id, label: `${org.name}（${org.code}）` }))} />
      </Modal>
    </div>
  );
};

export default AdminAiCampuses;
