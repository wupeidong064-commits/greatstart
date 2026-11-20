import { Drawer } from './overlays';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Form, Input, InputNumber, Radio, Select, Spin, message } from 'antd';
import { Banknote, RefreshCw } from 'lucide-react';
import { isAxiosError } from 'axios';
import api from '../services/api';
import {
  clearPricingRequest,
  confirmedPricing,
  parsePricing,
  persistPricingRequest,
  readPricingRequest,
  validPrice,
  type PricingBasis,
  type PricingBatch,
  type PricingRequest,
} from '../utils/lessonPricing';
import '../pages/CashflowSummary.css';
import './StudentLessonPricing.css';

type FormFields = { basisType: PricingBasis; amount?: number; orderId?: string; notes: string };
const money = (value: number | null) =>
  value === null
    ? '待核'
    : '¥' + value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lessons = (value: number | null) => (value === null ? '—' : value + ' 节');
const codeLabel = (id: string) => (id.length > 16 ? id.slice(0, 8) + '…' + id.slice(-4) : id);
const definite = new Set([
  'BATCH_ALREADY_PRICED',
  'BATCH_NOT_ELIGIBLE',
  'PRICING_ORDER_MISMATCH',
  'INVALID_PRICING',
  'INVALID_PRICE',
  'FORBIDDEN',
]);
const errorMessage = (error: unknown) =>
  isAxiosError(error) && typeof error.response?.data?.error?.message === 'string'
    ? error.response.data.error.message
    : error instanceof Error
      ? error.message
      : '请求失败，请重试';
const errorCode = (error: unknown) =>
  isAxiosError(error) ? error.response?.data?.error?.code : undefined;

export default function StudentLessonPricing({
  studentId,
  studentName,
  scopeKey,
  onClose,
}: {
  studentId: string;
  studentName: string;
  scopeKey: string;
  onClose: () => void;
}) {
  const key = 'pending-lesson-pricing:v1:' + JSON.stringify([scopeKey, studentId]);
  const [rows, setRows] = useState<PricingBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [unpricedRemaining, setUnpricedRemaining] = useState<number | null>(null);
  const [listError, setListError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [pending, setPending] = useState<PricingRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const live = useRef(true);
  const editor = useRef<HTMLElement>(null);
  const [form] = Form.useForm<FormFields>();
  const basis = Form.useWatch('basisType', form);
  const selectedOrderId = Form.useWatch('orderId', form);
  const batch = rows.find((r) => r.creditLogId === (pending?.creditLogId ?? selectedId));
  const selectedOrder = batch?.orderCandidates.find((r) => r.orderId === selectedOrderId);

  useEffect(() => {
    live.current = true;
    const sync = () => {
      try {
        setPending(readPricingRequest(key, studentId));
        setStorageError('');
      } catch (e) {
        setStorageError(errorMessage(e));
      }
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        sync();
        setReload((n) => n + 1);
      }
    };
    sync();
    window.addEventListener('storage', storageChanged);
    return () => {
      live.current = false;
      window.removeEventListener('storage', storageChanged);
    };
  }, [key, studentId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setUnpricedRemaining(null);
    setListError('');
    api
      .get<
        unknown,
        {
          success: boolean;
          data: { studentId?: string; batches?: PricingBatch[]; unpricedRemainingLessons?: number };
        }
      >('/lesson-logs/pricing', { params: { studentId }, signal: controller.signal })
      .then((response) => {
        if (response.success !== true) throw new Error('购课批次未确认，请重试');
        const batches = parsePricing(response.data, studentId);
        if (!controller.signal.aborted) {
          setRows(batches);
          const remaining = response.data?.unpricedRemainingLessons;
          setUnpricedRemaining(
            typeof remaining === 'number' && Number.isSafeInteger(remaining) && remaining >= 0
              ? remaining
              : null
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setRows([]);
          setListError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [studentId, reload]);

  useEffect(() => {
    if (selectedId || pending) editor.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, pending]);

  function choose(row: PricingBatch) {
    if (pending || lock.current || !row.canPrice || row.pricingStatus !== 'unpriced') return;
    setSelectedId(row.creditLogId);
    setActionError('');
    form.resetFields();
    form.setFieldsValue({
      basisType: row.orderCandidates.length ? 'existingOrder' : 'manualVoucher',
    });
  }

  async function submit(candidate: PricingRequest) {
    if (lock.current || storageError) return;
    lock.current = true;
    setSaving(true);
    setActionError('');
    let request: PricingRequest | undefined;
    try {
      request = persistPricingRequest(key, candidate);
      setPending(request);
      if (
        request.requestId !== candidate.requestId ||
        request.creditLogId !== candidate.creditLogId ||
        request.amount !== candidate.amount ||
        request.basisType !== candidate.basisType ||
        request.orderId !== candidate.orderId ||
        request.notes !== candidate.notes
      ) {
        setActionError('发现另一笔待确认的补价，请先核对并重试原请求。');
        return;
      }
      const response = await api.post<unknown, { success: boolean; data: unknown }>(
        '/lesson-logs/pricing',
        request
      );
      if (
        response.success !== true ||
        !confirmedPricing(response.data, request, batch?.originalLessons)
      )
        throw new Error('确认回执与原请求不一致，请重试原请求核对结果。');
      clearPricingRequest(key, request);
      if (live.current) {
        setPending(null);
        setSelectedId(undefined);
        form.resetFields();
        message.success('原购课批次金额已确认');
        setReload((n) => n + 1);
      }
    } catch (error) {
      if (request && definite.has(errorCode(error))) {
        try {
          clearPricingRequest(key, request);
        } catch (storageProblem) {
          if (live.current) setStorageError(errorMessage(storageProblem));
          return;
        }
        if (live.current) {
          setPending(null);
          setReload((n) => n + 1);
        }
      }
      if (live.current) setActionError(errorMessage(error));
    } finally {
      lock.current = false;
      if (live.current) setSaving(false);
    }
  }
  function save(values: FormFields) {
    if (!batch?.canPrice || batch.pricingStatus !== 'unpriced' || lock.current) return;
    const order = batch.orderCandidates.find((o) => o.orderId === values.orderId);
    const amount = values.basisType === 'existingOrder' ? order?.amount : values.amount;
    if (
      !validPrice(amount) ||
      (values.basisType === 'existingOrder' &&
        (!order || order.originalLessons !== batch.originalLessons))
    ) {
      setActionError('请核对原批次的总课时、整批金额和计价依据。');
      return;
    }
    void submit({
      studentId,
      creditLogId: batch.creditLogId,
      requestId: crypto.randomUUID(),
      amount,
      basisType: values.basisType,
      ...(values.basisType === 'existingOrder' ? { orderId: order!.orderId } : {}),
      notes: values.notes.trim(),
    });
  }

  return (
    <Drawer
      title={'历史课时计价 · ' + studentName}
      open
      onClose={onClose}
      closable={!saving}
      maskClosable={false}
      keyboard={!saving}
      width="min(620px, calc(var(--ui-vw, 1vw) * 100))"
      className="lp-drawer"
    >
      <div className="cfs-page lp-page">
        <div className="lp-head">
          <div>
            <h2>
              <Banknote size={17} aria-hidden="true" /> 原购课批次
            </h2>
            <p>仅用于补核旧批次的缺价记录。新签和续费金额在成单信息表登记，课时与价格自动同步。</p>
          </div>
          <Button
            aria-label="刷新购课批次"
            className="cfs-refresh"
            icon={<RefreshCw size={15} />}
            disabled={saving || loading}
            onClick={() => setReload((n) => n + 1)}
          />
        </div>
        {unpricedRemaining !== null && unpricedRemaining > 0 && (
          <p className="lp-pending-total">
            当前剩余待核 <strong>{unpricedRemaining} 节</strong>
          </p>
        )}
        {storageError && (
          <Alert type="error" showIcon message="待确认记录无法读取" description={storageError} />
        )}
        {listError && (
          <Alert
            type="error"
            showIcon
            message="购课批次加载失败"
            description={listError}
            action={
              <Button size="small" onClick={() => setReload((n) => n + 1)}>
                重试批次
              </Button>
            }
          />
        )}
        {loading ? (
          <div className="lp-loading">
            <Spin size="small" />
            正在读取原始批次
          </div>
        ) : (
          !listError &&
          (rows.length ? (
            <div className="lp-batches">
              {rows.map((r) => (
                <article
                  className={
                    'cfs-glass lp-batch' +
                    (r.creditLogId === batch?.creditLogId ? ' lp-selected' : '')
                  }
                  key={r.creditLogId}
                >
                  <div className="lp-batch-head">
                    <div>
                      <strong>{r.businessDate || r.createdAt?.slice(0, 10) || '购课批次'}</strong>
                      <small title={r.creditLogId}>批次 {codeLabel(r.creditLogId)}</small>
                    </div>
                    {r.canPrice && r.pricingStatus === 'unpriced' ? (
                      <Button
                        size="small"
                        disabled={
                          !!pending || saving || !!storageError || selectedId === r.creditLogId
                        }
                        onClick={() => choose(r)}
                      >
                        {r.creditLogId === selectedId ? '正在补价' : '补录金额'}
                      </Button>
                    ) : (
                      <span className="lp-status">
                        {r.pricingStatus === 'gift'
                          ? '赠课'
                          : r.pricingStatus === 'priced'
                            ? '已计价'
                            : '暂不可补价'}
                      </span>
                    )}
                  </div>
                  <dl>
                    <div>
                      <dt>原始课时</dt>
                      <dd>{lessons(r.originalLessons)}</dd>
                    </div>
                    <div>
                      <dt>剩余课时</dt>
                      <dd>{lessons(r.remainingLessons)}</dd>
                    </div>
                    <div>
                      <dt>已耗待核</dt>
                      <dd>{lessons(r.unpricedConsumedLessons)}</dd>
                    </div>
                    <div>
                      <dt>原批次金额</dt>
                      <dd>{money(r.amount)}</dd>
                    </div>
                  </dl>
                  {r.reason && <p>{r.reason}</p>}
                </article>
              ))}
            </div>
          ) : (
            <Empty description="暂无可追溯的原始课时批次" />
          ))
        )}
        {actionError && <Alert type="warning" showIcon message={actionError} />}
        {pending ? (
          <section ref={editor} className="lp-editor" aria-label="待确认补价">
            <h3>原补价请求待确认</h3>
            <p>
              批次 {codeLabel(pending.creditLogId)} · 整批 {money(pending.amount)} ·{' '}
              {pending.basisType === 'existingOrder' ? '已确认成单' : '原始凭证'}
            </p>
            <p className="lp-wrap">{pending.notes}</p>
            <Button
              type="primary"
              loading={saving}
              disabled={!!storageError}
              onClick={() => void submit(pending)}
            >
              重试并确认原补价
            </Button>
          </section>
        ) : (
          batch?.canPrice &&
          batch.pricingStatus === 'unpriced' && (
            <section ref={editor} className="lp-editor">
              <h3>补录原 {batch.originalLessons} 节的整批金额</h3>
              <p>
                批次 {codeLabel(batch.creditLogId)} · 当前剩余 {lessons(batch.remainingLessons)}
              </p>
              <Form
                form={form}
                layout="vertical"
                onFinish={save}
                disabled={saving || loading || !!storageError}
              >
                <Form.Item name="basisType" label="计价依据" rules={[{ required: true }]}>
                  <Radio.Group
                    onChange={() => form.setFieldsValue({ amount: undefined, orderId: undefined })}
                  >
                    <Radio.Button value="existingOrder" disabled={!batch.orderCandidates.length}>
                      已确认成单
                    </Radio.Button>
                    <Radio.Button value="manualVoucher">原始凭证</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                {basis === 'existingOrder' ? (
                  <>
                    <Form.Item
                      name="orderId"
                      label="原始成单"
                      rules={[{ required: true, message: '请选择对应的已确认成单' }]}
                    >
                      <Select
                        placeholder="选择原始成单"
                        options={batch.orderCandidates.map((o) => ({
                          value: o.orderId,
                          disabled: o.originalLessons !== batch.originalLessons,
                          label: [
                            o.conversionDate?.slice(0, 10),
                            codeLabel(o.orderId),
                            lessons(o.originalLessons),
                            money(o.amount),
                          ]
                            .filter(Boolean)
                            .join(' · '),
                        }))}
                      />
                    </Form.Item>
                    <Form.Item label={'原 ' + batch.originalLessons + ' 节整批金额'}>
                      <strong>{selectedOrder ? money(selectedOrder.amount) : '—'}</strong>
                    </Form.Item>
                  </>
                ) : (
                  <Form.Item
                    name="amount"
                    label={'原 ' + batch.originalLessons + ' 节整批金额（元）'}
                    rules={[
                      { required: true, message: '请输入凭证上的整批总金额，0 元请填 0' },
                      {
                        validator: (_, value) =>
                          value == null || validPrice(value)
                            ? Promise.resolve()
                            : Promise.reject(
                                new Error('金额应在 0 至 99,999,999.99 元之间，最多两位小数')
                              ),
                      },
                    ]}
                  >
                    <InputNumber
                      min={0}
                      max={99999999.99}
                      precision={2}
                      prefix="¥"
                      placeholder="按原始凭证填写，0 元请填 0"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                )}
                <Form.Item
                  name="notes"
                  label="凭证说明"
                  rules={[
                    { required: true, whitespace: true, message: '请填写能够核对的凭证说明' },
                  ]}
                >
                  <Input.TextArea
                    rows={2}
                    maxLength={1000}
                    placeholder="例如原订单编号或收据日期及凭证号"
                  />
                </Form.Item>
                <div className="lp-actions">
                  <Button
                    onClick={() => {
                      setSelectedId(undefined);
                      setActionError('');
                    }}
                  >
                    暂不补价
                  </Button>
                  <Button type="primary" htmlType="submit" loading={saving}>
                    确认原批次金额
                  </Button>
                </div>
              </Form>
            </section>
          )
        )}
      </div>
    </Drawer>
  );
}
