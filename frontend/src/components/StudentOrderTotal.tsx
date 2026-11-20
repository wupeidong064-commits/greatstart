import { useEffect, useState } from 'react';
import { Button } from 'antd';
import api from '../services/api';

/** Order value comes from conversions, not the separate payment ledger. */
export default function StudentOrderTotal({ studentId }: { studentId: string }) {
  const [data, setData] = useState<{ amount: number; count: number; pricedCount: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setStatus('loading');
    api.get('/conversions/summary', { params: { studentId } }).then(response => {
      if (!active) return;
      const value = response.data;
      if (value?.amount == null || value?.count == null || value?.pricedCount == null || !Number.isFinite(Number(value.amount))) throw new Error('成单金额数据不完整');
      setData({ amount: Number(value.amount), count: Number(value.count), pricedCount: Number(value.pricedCount) });
      setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [studentId, retry]);
  if (status === 'loading') return <span>加载中…</span>;
  if (status === 'error') return <Button size="small" type="link" onClick={() => setRetry(value => value + 1)}>加载失败，重试</Button>;
  if (!data?.count) return <span>暂无成单</span>;
  if (!data.pricedCount) return <span>未填写金额</span>;
  return <span>¥{data.amount.toFixed(2)}{data.pricedCount < data.count ? '（部分未填写）' : ''}</span>;
}
