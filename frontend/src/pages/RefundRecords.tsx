import { Modal, Popconfirm } from '../components/overlays';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';
import { refundConfirmStorageKey, readPendingRefundConfirm, savePendingRefundConfirm, sameRefundConfirmPayload, type PendingRefundConfirm } from '../utils/refundConfirmRequest';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';

const { RangePicker } = DatePicker;

// 2026-11-08 用户拍板：退费记录从「现金流收入总结」卡片迁至学员管理子菜单独立页（原卡片位置太隐蔽）。
// 流程不变：退费依靠线下流程办理，办结后在此登记——提交后一步「确认及通过」，
// 通过即扣课时、移除学员所在班级报名并标记退费；误登记可取消并整体回滚。
const refundStatusMeta: Record<string, { text: string; color: string }> = {
  approved: { text: '已通过', color: 'green' },
  pending: { text: '待审批（旧流程）', color: 'orange' },
  rejected: { text: '已驳回', color: 'red' },
  cancelled: { text: '已取消', color: 'default' },
};

type Quote = {
  studentId:string; lessonsToRefund:number; remainingLessons:number; paidRemainingLessons:number; giftRemainingLessons:number;
  unpricedRemainingLessons:number; unpricedLessons:number; giftLessons:number; knownAmount:number; maxAmount:number|null;
  allocations:{lotId:string;lessons:number;amountCents:number|null}[];
};
const errorText = (err:any, fallback:string) => err?.response?.data?.error?.message || err?.message || fallback;
const scopeKey = (u:ReturnType<typeof useAuthStore.getState>['user']) => JSON.stringify(u && [u.id,u.organizationId,u.campusId,u.role]);
type RefundRecordsProps = { embedded?: boolean; student?: { id: string; name: string; remainingLessons: number }; onClose?: () => void; onConfirmed?: () => void };
const RefundPage = ({ embedded = false, student: initialStudent, onClose, onConfirmed }: RefundRecordsProps) => {
  const { user } = useAuthStore();
  const token = useAuthStore(state => state.token);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManage = normalizedRole === 'admin' || normalizedRole === 'manager';
  const canRegister = canManage || normalizedRole === 'coach';
  const allowedRoles = ['admin', 'manager', 'sales', 'teacher', 'coach'];

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // 2026-11-08 用户拍板：与现金流收入总结·退费板块同源同口径——汇总随时间段联动，两边数字一致
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([dayjs().startOf('month'), dayjs()]);
  const [summary, setSummary] = useState<{ approvedCount: number; approvedAmount: number; approvedLessons: number; cancelledCount: number; cancelledAmount: number } | null>(null);
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const confirmationOpen = useRef(false);
  const [pendingRefund, setPendingRefund] = useState<PendingRefundConfirm | null>(null);
  const [studentOptions, setStudentOptions] = useState<any[]>([]);
  const [pickedStudent, setPickedStudent] = useState<any>(null);
  const [quote,setQuote] = useState<Quote|null>(null);
  const [quoteError,setQuoteError] = useState('');
  const [quoteLoading,setQuoteLoading] = useState(false);
  const [page,setPage] = useState(1), [total,setTotal] = useState(0);
  const [listError,setListError] = useState('');
  const [form] = Form.useForm();
  const searchTimer = useRef<number | null>(null);
  const listSeq = useRef(0), searchSeq = useRef(0), quoteSeq = useRef(0);
  const dialog = useRef<ReturnType<typeof Modal.confirm>|null>(null);
  const active = useRef(true);
  const identity = JSON.stringify([scopeKey(user), token]);
  const isCurrent = () => active.current && JSON.stringify([scopeKey(useAuthStore.getState().user), useAuthStore.getState().token]) === identity;
  useLayoutEffect(()=>{
    active.current=true;
    return ()=>{
      active.current=false;
      listSeq.current++; searchSeq.current++; quoteSeq.current++;
      if(searchTimer.current) window.clearTimeout(searchTimer.current);
      dialog.current?.destroy();
    };
  },[]);

  const fetchRecords = async () => {
    if (embedded) return;
    const seq = ++listSeq.current;
    setLoading(true); setRecords([]); setSummary(null); setListError(''); setTotal(0);
    try {
      const r = await api.get('/refunds', {params:{page,pageSize:10,...(dateRange ?
        { startDate:dateRange[0].format('YYYY-MM-DD'),endDate:dateRange[1].format('YYYY-MM-DD') } : {})}});
      if (seq!==listSeq.current || !isCurrent()) return;
      if (!r.data?.summary || !r.data?.pagination || !Array.isArray(r.data?.data)) throw Error('退费记录响应不完整');
      if(page>1 && page>r.data.pagination.totalPages) {setPage(Math.max(1,r.data.pagination.totalPages));return;}
      setRecords(r.data.data); setSummary(r.data.summary); setTotal(r.data.pagination.total);
    } catch (e) {
      if(seq===listSeq.current && isCurrent()) setListError(errorText(e,'退费记录加载失败，请刷新重试'));
    } finally {
      if(seq===listSeq.current && isCurrent()) setLoading(false);
    }
  };
  const refreshRecords=useRef(fetchRecords);
  useLayoutEffect(()=>{refreshRecords.current=fetchRecords;},[dateRange,page]);
  useEffect(()=>{fetchRecords();},[dateRange,page]);

  const searchStudents = (keyword:string) => {
    const seq=++searchSeq.current;
    if(searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current=window.setTimeout(async()=>{
      try {
        const r=await api.get('/students',{params:{search:keyword || undefined,pageSize:20}});
        if(seq===searchSeq.current && isCurrent()) setStudentOptions((r.data || []).filter((s:any)=>s.status!=='refunded'));
      } catch(e) {
        if(seq===searchSeq.current && isCurrent()) {setStudentOptions([]);message.error(errorText(e,'学员搜索失败'));}
      }
    },300);
  };
  const setSuggestedAmount = (q:Quote) => {
    const fee=Number(form.getFieldValue('feeRate')) || 0;
    form.setFieldValue('amountToRefund',q.maxAmount===null || !q.lessonsToRefund ? undefined :
      Math.round(Math.round(q.maxAmount*100)*(1000-Math.round(fee*10))/1000)/100);
  };
  const fetchQuote = async (studentId:string,lessons?:number) => {
    const seq=++quoteSeq.current;
    setQuote(null); setQuoteError(''); setQuoteLoading(true); form.setFieldValue('amountToRefund',undefined);
    try {
      const r=await api.get('/refunds/quote',{params:{studentId,lessonsToRefund:lessons}});
      if(seq!==quoteSeq.current || !isCurrent()) return;
      const q=r.data as Quote;
      if(q.studentId!==studentId || (lessons!==undefined && q.lessonsToRefund!==lessons) ||
         !Number.isInteger(q.remainingLessons) || !(q.maxAmount===null || Number.isFinite(q.maxAmount))) throw Error('退费报价响应不完整');
      setQuote(q); form.setFieldValue('lessonsToRefund',q.lessonsToRefund);
      setPickedStudent((s:any)=>s?.id===studentId ? {...s,remainingLessons:q.remainingLessons} : s);
      setSuggestedAmount(q);
    } catch(e) {
      if(seq===quoteSeq.current && isCurrent()) setQuoteError(errorText(e,'退费报价加载失败'));
    } finally {
      if(seq===quoteSeq.current && isCurrent()) setQuoteLoading(false);
    }
  };
  const closeEntry=()=>{
    quoteSeq.current++; searchSeq.current++;
    if(searchTimer.current) window.clearTimeout(searchTimer.current);
    setEntryModalVisible(false);
    onClose?.();
  };
  const restorePending = (pending: PendingRefundConfirm) => {
    setPendingRefund(pending);
    const student = { id: pending.payload.studentId, name: pending.studentName, remainingLessons: pending.remainingLessons };
    setPickedStudent(student);
    setStudentOptions(current => [student, ...current.filter(s => s.id !== student.id)]);
    form.setFieldsValue({ ...pending.payload, refundDate: dayjs(pending.payload.refundDate), feeRate: pending.feeRate });
  };
  const openEntryModal = () => {
    if (!user || submitLock.current) return;
    try {
      const pending = readPendingRefundConfirm(refundConfirmStorageKey(user.organizationId, user.id));
      form.resetFields();
      setQuote(null); setQuoteError(''); setQuoteLoading(false);
      setPendingRefund(pending);
      if (pending) restorePending(pending);
      else if (initialStudent) {
        setPickedStudent(initialStudent);
        setStudentOptions([initialStudent]);
        form.setFieldsValue({ studentId: initialStudent.id, refundDate: dayjs(), feeRate: 0 });
        void fetchQuote(initialStudent.id);
      } else {
        form.setFieldsValue({ refundDate: dayjs(), feeRate: 0 });
        setPickedStudent(null);
        searchStudents('');
      }
      setEntryModalVisible(true);
    } catch (error: any) { message.error(error.message || '无法读取待确认退费记录'); }
  };

  useEffect(() => { if (embedded && initialStudent && canRegister) openEntryModal(); }, []);

  const handleStudentPicked = (studentId:string) => {
    const student=studentOptions.find(s=>s.id===studentId);
    if(!student) return;
    setPickedStudent(student);
    form.setFieldValue('lessonsToRefund',student.remainingLessons);
    fetchQuote(studentId);
  };
  const handleSubmit = (values: any) => {
    if (!user || submitLock.current || confirmationOpen.current) return;
    const storageKey = refundConfirmStorageKey(user.organizationId, user.id);
    const payload = {
      studentId: values.studentId, amountToRefund: values.amountToRefund,
      lessonsToRefund: values.lessonsToRefund ?? 0, reason: values.reason.trim(),
      refundDate: values.refundDate.format('YYYY-MM-DD'),
    };
    let pending: PendingRefundConfirm | null;
    try {
      pending = readPendingRefundConfirm(storageKey);
      if (pending && !sameRefundConfirmPayload(pending.payload, payload)) {
        restorePending(pending);
        message.warning('上次退费结果待确认，已恢复原参数；请先重试确认，再登记新退费');
        return;
      }
    } catch (error: any) { message.error(error.message); return; }
    const student = studentOptions.find((s) => s.id === values.studentId);
    const lessons = values.lessonsToRefund ?? 0;
    const fee = Number(values.feeRate) || 0;
    if (!pending && (!quote || quote.studentId!==values.studentId || quote.lessonsToRefund!==lessons || quote.maxAmount===null || values.amountToRefund>quote.maxAmount)) {
      message.error('请核对本次课时与可退上限后提交'); return;
    }
    const calcDetail = '本次登记 ¥'+Number(values.amountToRefund).toFixed(2)+'。';
    confirmationOpen.current = true;
    dialog.current=Modal.confirm({
      afterClose: () => { confirmationOpen.current = false; },
      title: `确认通过「${student?.name || '该学员'}」的退费？`,
      content: `${calcDetail}确认后系统将：扣减课时 ${lessons} 节、移除该学员所在班级的全部在读报名、学员状态标记为退费。实际打款按线下流程办理；${canManage ? '误登记可在退费记录中取消并整体回滚。' : '误登记请联系管理员取消。'}`,
      okText: '确认通过',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (!isCurrent() || submitLock.current) return;
        submitLock.current = true;
        setSubmitting(true);
        try {
          const request: PendingRefundConfirm = pending || {
            payload: { requestId: crypto.randomUUID(), ...payload },
            studentName: student?.name || '该学员', remainingLessons: pickedStudent?.remainingLessons ?? lessons,
            feeRate: fee,
          };
          savePendingRefundConfirm(storageKey, request);
          restorePending(request);
          await api.post('/refunds/confirm', request.payload);
          sessionStorage.removeItem(storageKey);
          if (!isCurrent()) return;
          setPendingRefund(null);
          message.success('本次退费操作已确认（原操作回执），退费记录将刷新当前状态');
          onConfirmed?.();
          closeEntry();
          refreshRecords.current();
        } catch (e: any) {
          if (!isCurrent()) return;
          if ([400,404,409].includes(e.response?.status) && e.response?.data?.error?.code !== 'IDEMPOTENCY_CONFLICT') {
            sessionStorage.removeItem(storageKey);
            setPendingRefund(null);
            fetchQuote(payload.studentId,payload.lessonsToRefund);
          }
          message.error(e.response?.data?.error?.message || e.message || '退费结果待确认，请重试原操作');
        } finally {
          submitLock.current = false;
          if (isCurrent()) setSubmitting(false);
        }
      },
    });
  };

  const handleCancel = async (row: any) => {
    try {
      const r = await api.post(`/refunds/${row.id}/cancel`);
      if (!isCurrent()) return;
      const detail = r.data || {};
      const restored = detail.restoredClasses?.length ? `已恢复班级：${detail.restoredClasses.join('、')}。` : '';
      message.success(`退费已取消。${restored}`);
      refreshRecords.current();
    } catch (e: any) {
      if (isCurrent()) message.error(errorText(e,'取消失败，请重试'));
    }
  };

  const refundEntryModal = (
      <Modal
        title="登记退费（确认即通过）"
        open={entryModalVisible}
        onCancel={() => { if (!submitLock.current) closeEntry(); }}
        maskClosable={!submitting}
        keyboard={!submitting}
        cancelButtonProps={{ disabled: submitting }}
        okButtonProps={{ disabled: submitting || (!pendingRefund && (!quote || quote.maxAmount===null || quoteLoading)) }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText={pendingRefund ? '重试并确认原退费' : '提交并确认'}
        cancelText="取消"
        width={520}
      >
        {pendingRefund && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="已有退费操作待确认"
          description="上次请求可能已完成退费。关闭或刷新后仍恢复原操作，请重试确认原结果后再登记新退费；原参数已锁定。" />}
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="实际退款按线下流程办理，此处仅登记结果。提交后需再次确认；通过时自动扣减课时、移除班级报名并标记学员退费。" />
        <Form
          form={form}
          disabled={submitting || !!pendingRefund}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={(changed) => {
            if ('lessonsToRefund' in changed && pickedStudent) {
              if(Number.isInteger(changed.lessonsToRefund)) fetchQuote(pickedStudent.id,changed.lessonsToRefund);
              else {quoteSeq.current++;setQuote(null);setQuoteLoading(false);form.setFieldValue('amountToRefund',undefined);}
            } else if ('feeRate' in changed && quote) setSuggestedAmount(quote);
          }}
        >
          <Form.Item name="studentId" label="学员" rules={[{ required: true, message: '请搜索并选择学员' }]}>
            <Select
              disabled={embedded || submitting || !!pendingRefund}
              showSearch
              filterOption={false}
              onSearch={searchStudents}
              onChange={handleStudentPicked}
              placeholder="输入姓名/电话搜索学员"
              notFoundContent={null}
              options={studentOptions.map((s) => ({
                value: s.id,
                label: `${s.name} · 剩余 ${s.remainingLessons ?? 0} 节${s.parentPhone || s.phone ? ` · ${s.parentPhone || s.phone}` : ''}`,
              }))}
            />
          </Form.Item>
          {!pendingRefund && quoteLoading && <Alert type="info" message="正在核对购课批次…" />}
          {!pendingRefund && quoteError && <Alert type="error" message={quoteError} action={<Button onClick={()=>fetchQuote(pickedStudent.id,form.getFieldValue('lessonsToRefund'))}>重试报价</Button>} />}
          {!pendingRefund && quote && <Alert type={quote.maxAmount===null?'warning':'info'} style={{marginBottom:16}} showIcon
            message={quote.maxAmount===null?'退费金额待核，请核对历史购课与课消记录':`本次可退上限 ¥${quote.maxAmount.toFixed(2)}`}
            description={<>{`剩余付费 ${quote.paidRemainingLessons} 节、赠课 ${quote.giftRemainingLessons} 节、待核 ${quote.unpricedRemainingLessons} 节。`}
              {quote.allocations.length>0 && <div>本次按购课先后折算：{quote.allocations.map(p=>`${p.lessons} 节 ${p.amountCents===null?'待核':'¥'+(p.amountCents/100).toFixed(2)}`).join('，')}。</div>}</>} />}
          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item
              name="lessonsToRefund"
              label="退回课时"
              extra="不允许部分退费，必须退回全部剩余课时，确认后整体退班。"
              rules={[{ required: true, message: '请核对全部剩余课时' }]}
            >
              {/* 2026-11-08 复查：上限=选中学员当前剩余课时，防止手滑多填（服务端仍有余额护栏） */}
              <InputNumber disabled min={0} max={pickedStudent ? (pickedStudent.remainingLessons ?? 0) : undefined} precision={0} style={{ width: '100%' }} addonAfter="节" />
            </Form.Item>
            <Form.Item name="feeRate" label="手续费" extra="按百分比扣减，默认 0 不扣" initialValue={0} rules={[{ required: true, message: '请输入手续费比例' }]}>
              <InputNumber min={0} max={100} precision={1} style={{ width: '100%' }} addonAfter="%" />
            </Form.Item>
          </div>
          <Form.Item
            name="amountToRefund"
            label="退费金额（元）"
            extra="有课时按批次金额与手续费预填，可在本次上限内调整。"
            rules={[{ required: true, message: '请输入退费金额' }]}
          >
            <InputNumber min={0} max={pendingRefund ? undefined : quote?.maxAmount ?? undefined} precision={2} style={{ width: '100%' }} prefix="¥" />
          </Form.Item>
          <Form.Item name="refundDate" label="退费日期" rules={[{ required: true, message: '请选择退费日期' }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" disabledDate={(d) => d && d.isAfter(dayjs().endOf('day'))} />
          </Form.Item>
          <Form.Item name="reason" label="退费原因" rules={[{ required: true, whitespace: true, message: '请输入退费原因' }]}>
            <Input.TextArea rows={2} maxLength={2000} placeholder="线下流程的退费原因 / 凭据摘要" />
          </Form.Item>
        </Form>
      </Modal>
  );

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Alert message="权限受限" description="您没有权限访问退费记录页面，如需访问请联系系统管理员" type="warning" showIcon />
      </div>
    );
  }

  if (embedded) return refundEntryModal;

  return (
    <div>
      <div className="biz-page-head">
        <div className="biz-head-copy"><h1>退费记录</h1><p>{canManage ? '线下流程办结后在此登记：确认即通过，可取消回滚。' : '登记本人负责学员的退费，查看已办理的退费记录。'}</p></div>
      </div>

      {/* 2026-11-08 用户拍板：删除页面上的流程/口径说明，四个汇总大卡收成一条工具栏（汇总+筛选+操作一行放下） */}
      <div style={{ background: 'var(--card2)', padding: '12px 16px', borderRadius: 8, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={24} wrap style={{ fontSize: 14 }}>
          <span style={{ color: 'var(--tx2)' }}>已通过退费 <b style={{ color: 'var(--tx)', fontSize: 14 }}>{summary ? summary.approvedCount : '—'}</b> 笔</span>
          <span style={{ color: 'var(--tx2)' }}>退费金额 <b style={{ color: 'var(--tx)', fontSize: 14 }}>{summary ? `¥${Number(summary.approvedAmount).toFixed(2)}` : '—'}</b></span>
          <span style={{ color: 'var(--tx2)' }}>冲减课时 <b style={{ color: 'var(--tx)', fontSize: 14 }}>{summary ? summary.approvedLessons : '—'}</b> 节</span>
          <span style={{ color: 'var(--tx2)' }}>已取消 <b style={{ fontSize: 14 }}>{summary ? summary.cancelledCount : '—'}</b> 笔</span>
        </Space>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {listSeq.current++; setPage(1); setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null);}}
            format="YYYY-MM-DD"
            allowClear
            presets={[
              { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
              { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
              { label: '近三个月', value: [dayjs().subtract(3, 'month'), dayjs()] },
              { label: '全部', value: null as unknown as [dayjs.Dayjs, dayjs.Dayjs] },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchRecords()}>刷新</Button>
          {canRegister && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openEntryModal}>登记退费</Button>
          )}
        </Space>
      </div>

      {listError && <Alert type="error" showIcon message={listError} action={<Button onClick={fetchRecords}>重试</Button>} />}
      <div className="bz-table-wrap">
        <Table
          dataSource={records}
          loading={loading}
          rowKey="id"
          pagination={{ current:page,total,pageSize:10,showSizeChanger:false,onChange:p=>{listSeq.current++;setPage(p);},showTotal: (total) => `共 ${total} 条退费记录` }}
          locale={{ emptyText: listError ? '记录加载失败' : '暂无退费记录' }}
          columns={[
            { title: '学员', dataIndex: 'studentName', key: 'studentName', width: 100 },
            { title: '金额', dataIndex: 'amountToRefund', key: 'amount', width: 100, render: (v: any) => `¥${Number(v).toFixed(2)}` },
            { title: '课时', dataIndex: 'lessonsToRefund', key: 'lessons', width: 80, render: (v: number) => (v ? `${v} 节` : '—') },
            { title: '原因', dataIndex: 'reason', key: 'reason', ellipsis: true },
            {
              title: '状态', dataIndex: 'status', key: 'status', width: 130,
              render: (s: string) => {
                const meta = refundStatusMeta[s] || { text: s, color: 'default' };
                return <Tag color={meta.color}>{meta.text}</Tag>;
              },
            },
            { title: '登记时间', dataIndex: 'createdAt', key: 'createdAt', width: 110, render: (d: string) => (d ? dayjs(d).format('YYYY-MM-DD') : '-') },
            { title: '操作人', key: 'operator', width: 100, render: (_: any, row: any) => row.submittedByName || row.reviewedByName || '-' },
            {
              title: '操作', key: 'op', width: 80, fixed: 'right' as const,
              render: (_: any, row: any) =>
                canManage && row.status === 'approved' ? (
                  <Popconfirm
                    title="取消该退费？"
                    description="将整体恢复退费前的课时、学员状态与报名。原班已满或停用时需要先处理。"
                    onConfirm={() => handleCancel(row)}
                  >
                    <Button size="small" danger>取消</Button>
                  </Popconfirm>
                ) : '-',
            },
          ]}
        />
      </div>

      {refundEntryModal}
    </div>
  );
};

export default function RefundRecords(props: RefundRecordsProps) {
  const identity=useAuthStore(state=>JSON.stringify([scopeKey(state.user),state.token]));
  return <RefundPage key={identity} {...props} />;
}
