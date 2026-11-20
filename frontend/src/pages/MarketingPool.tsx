import { Modal } from '../components/overlays';
import { Alert, Table, Button, Space, message, Form, Input, InputNumber, DatePicker, Select, Dropdown } from 'antd';
import { Plus as PlusOutlined, Pencil as EditOutlined, Trash2 as DeleteOutlined, Search as SearchOutlined } from 'lucide-react';
import './CashflowSummary.css';
import './CashflowPages.css';
import { MoreHorizontal, Fish } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { dataService } from '../services/dataService';
import { normalizeRole } from '../utils/dataFilter';
import { useAuthStore } from '../store/authStore';
import { useBzExpand, bzExpandable, bzRowClass } from '../hooks/useBzExpand';
import { useBusinessRefresh } from '../hooks/useBusinessRefresh';
import dayjs from 'dayjs';
import { registrationStorageKey, readPendingRegistration, createPendingRegistration, clearPendingRegistration, isDefinitiveRegistrationFailure, type PendingRegistration } from '../utils/registrationRequest';
import './MarketingPool.css';

// 统一的来源选项
const SOURCE_OPTIONS = [
  { value: 'meituan', label: '美团', color: 'yellow' },
  { value: 'groundPromotion', label: '地推', color: 'green' },
  { value: 'telemarketing', label: '电销', color: 'blue' },
  { value: 'walkIn', label: '上门', color: 'orange' },
  { value: 'referral', label: '转介绍', color: 'purple' },
  { value: 'crossIndustry', label: '异业', color: 'cyan' },
];

const leadStatus: Record<string, { text: string; tone: string }> = {
  new: { text: '待跟进', tone: 'tone-acc' }, contacted: { text: '已联系', tone: 'tone-acc' }, visited: { text: '已到访', tone: 'tone-warn' },
  converted: { text: '已成单', tone: 'tone-ok' }, lost: { text: '已流失', tone: 'tone-mute' },
};
const marketingSession = () => { const s = useAuthStore.getState(); return JSON.stringify([s.token, s.user?.id, s.user?.organizationId, s.user?.campusId, s.user?.role, s.user?.managementLevel]); };

interface StaffUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

const MarketingPool = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [form] = Form.useForm();
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string | undefined>(undefined);
  const [followupState, setFollowupState] = useState<'all' | 'pending' | 'converted' | 'lost'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [lastContactDateRange, setLastContactDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);
  const submitLock = useRef(false);
  const listRequest = useRef(0);


  // 批量选择相关状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 行展开（bz-table 单行展开状态机）
  const bz = useBzExpand();

  // 权限检查
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore(state => state.token);
  const sessionKey = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.role, user?.managementLevel]);
  const mountedSession = useRef<string | null>(sessionKey); mountedSession.current = sessionKey;
  const isSessionCurrent = (key: string) => mountedSession.current === key && marketingSession() === key;
  const listKey = JSON.stringify([sessionKey, pagination.current, pagination.pageSize, selectedAssignee, followupState, lastContactDateRange, appliedSearch]);
  const currentListKey = useRef(listKey); currentListKey.current = listKey;
  const staffRequest = useRef(0);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManageAll = normalizedRole === 'admin' || normalizedRole === 'manager';

  useEffect(() => {
    listRequest.current += 1;
    setData([]);
    setStaffList([]);
    setLoading(false);
    setModalVisible(false);
    setPendingRegistration(null);
    mountedSession.current = sessionKey;
    return () => { mountedSession.current = null; listRequest.current++; staffRequest.current++; };
  }, [sessionKey]);

  useEffect(() => {
    if (!user?.organizationId || !user.campusId) return;
    fetchData();
  }, [pagination.current, pagination.pageSize, selectedAssignee, followupState, lastContactDateRange, appliedSearch, sessionKey]);

  useEffect(() => { if (user?.organizationId) fetchStaffList(); }, [sessionKey]);

  // 获取工作人员列表（用于负责人选择，使用缓存）
  const fetchStaffList = async () => {
    const request = ++staffRequest.current, key = sessionKey;
    try {
      const data = await dataService.getStaffList();
      if (request === staffRequest.current && isSessionCurrent(key)) setStaffList(data);
    } catch (error) {
      if (request === staffRequest.current && isSessionCurrent(key)) console.error('获取工作人员列表失败');
    }
  };

  const fetchData = async () => {
    const request = ++listRequest.current, key = sessionKey, query = listKey;
    if (!user?.organizationId || !user.campusId) return;
    setLoading(true);
    try {
      // 对于 admin 和 manager，支持按负责人筛选
      const params: any = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        followupState,
      };

      // 非管理人员只能看到自己负责的线索（防止翘单）
      if (!canManageAll && user?.id) {
        params.assigneeId = user.id;
      } else if (selectedAssignee) {
        // 管理人员可以按负责人筛选
        params.assigneeId = selectedAssignee;
      }

      // 如果有搜索关键词，添加搜索条件
      if (appliedSearch) {
        params.search = appliedSearch;
      }

      // 最近联系时间范围筛选
      if (lastContactDateRange && lastContactDateRange[0] && lastContactDateRange[1]) {
        params.lastContactAtStart = lastContactDateRange[0].startOf('day').toISOString();
        params.lastContactAtEnd = lastContactDateRange[1].endOf('day').toISOString();
      }

      const response = await api.get('/leads', { params });
      if (request !== listRequest.current || query !== currentListKey.current || !isSessionCurrent(key)) return;
      setData(response.data || []);
      const returnedPagination = response.pagination;
      if (returnedPagination) {
        setPagination(previous => ({
          ...previous,
          total: returnedPagination.total || 0,
        }));
      }
    } catch (error: any) {
      if (request === listRequest.current && query === currentListKey.current && isSessionCurrent(key)) { console.error('获取线索列表失败'); message.error(error.response?.data?.error?.message || error.message || '获取线索列表失败'); }
    } finally {
      if (request === listRequest.current && query === currentListKey.current && isSessionCurrent(key)) setLoading(false);
    }
  };

  useBusinessRefresh(() => { if (user?.organizationId && user.campusId) { void fetchData(); void fetchStaffList(); } });

  // 重置筛选
  const handleResetFilter = () => {
    setSelectedAssignee(undefined);
    setFollowupState('all');
    setSearchKeyword('');
    setAppliedSearch('');
    setLastContactDateRange(null);
    setPagination({ ...pagination, current: 1 });
  };

  const handleAdd = () => {
    if (!user || submitLock.current) return;
    try {
      const pending = readPendingRegistration(registrationStorageKey('lead', user));
    setEditingRecord(null);
    setPendingRegistration(pending);
    form.resetFields();
    if (pending) {
      form.setFieldsValue(pending.payload);
      setModalVisible(true);
      return;
    }
    // 非管理人员默认分配给自己
    if (!canManageAll && user?.id) {
      form.setFieldsValue({ assigneeId: user.id });
    }
    setModalVisible(true);
    } catch (error: any) { message.error(error.message || '无法恢复待确认登记'); }
  };

  const handleEdit = (record: any) => {
    if (submitLock.current) return;
    // 非管理人员只能编辑自己负责的线索
    if (!canManageAll && record.assigneeId !== user?.id) {
      message.warning('您只能编辑自己负责的线索');
      return;
    }
    setPendingRegistration(null);
    setEditingRecord(record);
    form.resetFields();
    form.setFieldsValue({
      ...record,
      lastContactAt: record.lastContactAt ? dayjs(record.lastContactAt) : undefined,
      assigneeId: record.assigneeId || undefined,
    });
    setModalVisible(true);
  };

  const handleUpdateContactTime = async (id: string) => {
    try {
      await api.put(`/leads/${id}/contact`);
      dataService.onLeadChanged();
      message.success('已更新最近联系时间');
      fetchData();
    } catch (error: any) {
      message.error(error.message || '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    // 先获取线索详情，检查权限
    const record = data.find(item => item.id === id);
    if (!canManageAll && record?.assigneeId !== user?.id) {
      message.warning('您只能删除自己负责的线索');
      return;
    }

    Modal.confirm({
      title: '确认删除',
      okText: '确认删除',
      okButtonProps: { danger: true },
      content: '确定要删除该线索吗？',
      onOk: async () => {
        try {
          await api.delete(`/leads/${id}`);
          dataService.onLeadChanged();
          message.success('删除成功');
          fetchData();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  // 批量删除线索
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的线索');
      return;
    }

    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 条线索吗？此操作不可恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          let successCount = 0;
          let failCount = 0;

          for (const id of selectedRowKeys) {
            try {
              await api.delete(`/leads/${id}`);
              successCount++;
            } catch {
              failCount++;
            }
          }

          if (failCount === 0) {
            message.success(`成功删除 ${successCount} 条线索`);
          } else {
            message.warning(`成功删除 ${successCount} 条，失败 ${failCount} 条`);
          }

          setSelectedRowKeys([]);
          dataService.onLeadChanged();
          fetchData();
        } catch (error: any) {
          console.error('批量删除失败:', error);
          message.error(error.message || '批量删除失败');
        }
      },
    });
  };

  const handleSubmit = async (values: any) => {
    if (submitLock.current || !user) return;
    submitLock.current = true;
    setSubmitting(true);
    let storageKey: string | null = null;
    try {
      // 获取选中的负责人信息
      const selectedStaff = staffList.find(s => s.id === values.assigneeId);

      if (editingRecord) {
        // 编辑时包含最近联系时间和负责人
        const submitData = {
          customerName: values.customerName,
          age: values.age ?? null,
          contact: values.contact,
          source: values.source || null,
          notes: values.notes || null,
          lastContactAt: values.lastContactAt ? values.lastContactAt.toISOString() : undefined,
          assigneeId: values.assigneeId || null,
          assigneeName: selectedStaff?.name || null,
        };
        await api.put(`/leads/${editingRecord.id}`, submitData);
        message.success('更新成功');
      } else {
        // 新增时提交：姓名、年龄、联系方式、来源、备注、负责人
        const submitData = {
          customerName: values.customerName,
          age: values.age ?? null,
          contact: values.contact,
          source: values.source || null,
          notes: values.notes || null,
          assigneeId: values.assigneeId || null,
          assigneeName: selectedStaff?.name || null,
        };
        storageKey = registrationStorageKey('lead', user);
        const pending = pendingRegistration || createPendingRegistration(storageKey, submitData);
        setPendingRegistration(pending);
        await api.post('/leads', { ...pending.payload, requestId: pending.requestId }, { headers: { 'Idempotency-Key': pending.requestId } });
        clearPendingRegistration(storageKey);
        setPendingRegistration(null);
        message.success('线索已登记');
      }
      dataService.onLeadChanged();
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      console.error('提交失败:', error);
      if (storageKey && isDefinitiveRegistrationFailure(error)) {
        clearPendingRegistration(storageKey);
        setPendingRegistration(null);
      }
      const detail = error.response?.data?.error?.message || error.message || '操作失败';
      message.error(storageKey && !isDefinitiveRegistrationFailure(error) ? `${detail}。登记结果待确认，请重试原登记。` : detail);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const handleTableChange = (newPagination: any) => {
    setPagination({
      ...pagination,
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    });
  };

  const applySearch = () => {
    const next = searchKeyword.trim();
    if (next === appliedSearch && pagination.current === 1) fetchData();
    setAppliedSearch(next);
    setPagination(previous => ({ ...previous, current: 1 }));
  };

  // 姓名与电话共用一列；备注在主行预览，展开仍可阅读完整跟进记录。
  const columns = [
    {
      title: '姓名 / 电话',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 190,
      fixed: 'left' as const,
      render: (text: string, record: any) => (
        <div className="marketing-contact-cell"><div className="marketing-name-status"><button
          type="button"
          className="bz-student"
          title="查看详情"
          onClick={(e) => { e.stopPropagation(); bz.toggleExpand(record.id); }}
        >
          {text || '-'}
        </button><span className={`bz-tag ${(leadStatus[record.status] || { tone: 'tone-mute' }).tone}`}>{leadStatus[record.status]?.text || record.status || '状态未填写'}</span></div><span className="marketing-phone">{record.contact || '暂无电话'}</span></div>
      ),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      width: 250,
      render: (notes: string, record: any) => notes ? <button type="button" className="marketing-notes-preview" title={notes} onClick={(event) => { event.stopPropagation(); bz.toggleExpand(record.id); }}>{notes}</button> : <span className="bz-locked">暂无备注</span>,
    },
    {
      title: '跟进人 / 历史归属',
      dataIndex: 'assigneeName',
      key: 'assigneeName',
      width: 140,
      render: (name: string, record: any) => <div>{name || <span className="bz-locked">未分配</span>}{['converted', 'lost'].includes(record.status) && <div className="marketing-owner-note" title="该记录已结束跟进，保留历史负责人，不属于待交接资源">历史归属</div>}</div>,
    },
    {
      title: '最近联系',
      dataIndex: 'lastContactAt',
      key: 'lastContactAt',
      width: 150,
      render: (date: string) => {
        if (!date) {
          // 从未联系是鱼池里最需要处理的信号，用需跟进色明示
          return <span style={{ color: 'var(--warn)', fontSize: 12, fontWeight: 600 }}>从未联系</span>;
        }
        const d = dayjs(date);
        return (
          <div className="bz-time">
            <span className="bz-time-top">{d.format('M月D日 HH:mm')}</span>
            <span className="bz-time-sub">{d.format('YYYY年')}</span>
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      fixed: 'right' as const,
      className: 'bz-cell-act',
      render: (_: any, record: any) => (
        <Space size={4}>
          <button
            type="button"
            className="bz-act"
            onClick={(e) => { e.stopPropagation(); handleUpdateContactTime(record.id); }}
          >
            更新联系
          </button>
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: [
                { key: 'edit', icon: <EditOutlined size={16} />, label: '编辑', onClick: () => handleEdit(record) },
                { key: 'delete', icon: <DeleteOutlined size={16} />, label: '删除', danger: true, onClick: () => handleDelete(record.id) },
              ],
            }}
          >
            <button type="button" className="bz-more" aria-label="更多操作" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal size={16} />
            </button>
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div className="cfs-page cashflow-page marketing-pool" data-testid="cashflow-marketing">
      <div className="cfs-heading cashflow-heading">
        <div className="biz-head-copy">
          <h1>营销与销售（鱼池）</h1>
          <p>电话与备注直接可见，展开可查看完整跟进记录。</p>
        </div>
        <div className="biz-head-actions">
          <Button type="primary" icon={<PlusOutlined size={16} />} onClick={handleAdd}>
            新增线索
          </Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <section className="cfs-glass cashflow-toolbar" aria-label="线索筛选">
          <Select aria-label="线索查看范围" style={{ width: 170 }} value={followupState} options={[{value:'all',label:'全部线索'},{value:'pending',label:'待跟进线索'},{value:'converted',label:'已成单'},{value:'lost',label:'已流失'}]} onChange={value => { setFollowupState(value); setPagination(previous => ({...previous,current:1})); }} />
          {canManageAll && <Select
            placeholder="筛选负责人"
            allowClear
            showSearch
            optionFilterProp="children"
            style={{ width: 200 }}
            value={selectedAssignee}
            onChange={(value) => {
              setSelectedAssignee(value);
              setPagination({ ...pagination, current: 1 });
            }}
            filterOption={(input, option) =>
              (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
            }
          >
            {staffList.map(staff => (
              <Select.Option key={staff.id} value={staff.id}>
                {staff.name}
              </Select.Option>
            ))}
          </Select>}
          <DatePicker.RangePicker
            placeholder={['最近联系开始日期', '最近联系结束日期']}
            value={lastContactDateRange}
            onChange={(dates) => {
              setLastContactDateRange(dates);
              setPagination({ ...pagination, current: 1 });
            }}
            style={{ width: 280 }}
            allowClear
          />
          <Input
            placeholder="搜索姓名或联系方式"
            allowClear
            prefix={<SearchOutlined size={16} />}
            style={{ width: 250 }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onPressEnter={applySearch}
          />
          <Button onClick={applySearch} icon={<SearchOutlined size={16} />}>
            搜索
          </Button>
          <Button onClick={handleResetFilter}>
            重置
          </Button>
        </section>

      {/* 批量操作栏 */}
      {selectedRowKeys.length > 0 && (
        <div className="cashflow-selection-bar">
          <span>已选择 <strong>{selectedRowKeys.length}</strong> 条线索</span>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          <Button size="small" danger onClick={handleBatchDelete}>批量删除</Button>
        </div>
      )}

      <div className="bz-table-wrap">
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          expandable={bzExpandable<any>(bz, (record) => (
            <>
              <dl className="bz-x-grid">
                <div className="bz-x-item">
                  <dt>联系电话</dt>
                  <dd>{record.contact || '-'}</dd>
                </div>
                <div className="bz-x-item">
                  <dt>来源</dt>
                  <dd>{record.source ? (SOURCE_OPTIONS.find(opt => opt.value === record.source)?.label || record.source) : '-'}</dd>
                </div>
                <div className="bz-x-item">
                  <dt>年龄</dt>
                  <dd>{record.age ? `${record.age} 岁` : '-'}</dd>
                </div>
                <div className="bz-x-item">
                  <dt>最近联系</dt>
                  <dd>
                    {record.lastContactAt
                      ? dayjs(record.lastContactAt).format('YYYY-MM-DD HH:mm')
                      : <span className="bz-na">从未联系</span>}
                  </dd>
                </div>
              </dl>
              <dl className="bz-x-follow">
                <dt>备注 / 跟进记录</dt>
                <dd className={record.notes ? undefined : 'bz-x-follow-empty'}>
                  {record.notes
                    ? `${record.lastContactAt ? `${dayjs(record.lastContactAt).format('M月D日')} · ` : '从未联系 · '}${record.notes}`
                    : '暂无备注；「更新联系」会记录最近联系时间'}
                </dd>
              </dl>
            </>
          ))}
          rowClassName={(record: any) => bzRowClass(bz, record)}
          locale={{
            emptyText: (
              <div className="bz-empty">
                <Fish size={28} />
                <p>鱼池暂无线索</p>
                <span>点击右上角「新增线索」开始蓄水。</span>
              </div>
            ),
          }}
          rowSelection={{
            selectedRowKeys,
            onChange: (newSelectedRowKeys: React.Key[]) => {
              setSelectedRowKeys(newSelectedRowKeys);
            },
            selections: [
              Table.SELECTION_ALL,
              Table.SELECTION_INVERT,
              Table.SELECTION_NONE,
            ],
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          onChange={handleTableChange}
          tableLayout="fixed"
          scroll={{ x: 960 }}
        />
      </div>
      <Modal
        title={editingRecord ? '编辑线索' : '新增线索'}
        open={modalVisible}
        onCancel={() => { if (!submitLock.current) setModalVisible(false); }}
        onOk={() => pendingRegistration && !editingRecord ? handleSubmit(pendingRegistration.payload) : form.submit()}
        okText={submitting ? '正在保存' : pendingRegistration && !editingRecord ? '重试原登记' : editingRecord ? '保存' : '确认登记'}
        confirmLoading={submitting}
        cancelButtonProps={{ disabled: submitting }}
        closable={!submitting}
        maskClosable={!submitting}
        keyboard={!submitting}
        width={600}
      >
        {pendingRegistration && !editingRecord && !submitting && <Alert type="info" showIcon message="原登记结果待确认" description="已保留原内容。点击「重试原登记」核对并完成，重复请求不会新增第二条。" style={{ marginBottom: 16 }} />}
        <Form form={form} onFinish={handleSubmit} layout="vertical" disabled={submitting || !!pendingRegistration && !editingRecord}>
          <Form.Item name="customerName" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item name="age" label="年龄">
            <InputNumber min={0} max={150} placeholder="请输入年龄" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="contact" label="联系方式" rules={[{ required: true, message: '请输入联系方式' }]}>
            <Input placeholder="请输入联系方式（手机号）" />
          </Form.Item>
          <Form.Item name="source" label="来源">
            <Select placeholder="请选择来源" allowClear>
              {SOURCE_OPTIONS.map(opt => (
                <Select.Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {/* 非管理人员不能修改负责人，防止翘单 */}
          {canManageAll ? (
            <Form.Item name="assigneeId" label="负责人">
              <Select
                placeholder="选择负责人"
                allowClear
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                }
              >
                {staffList.map(staff => (
                  <Select.Option key={staff.id} value={staff.id}>
                    {staff.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            <Form.Item name="assigneeId" label="负责人">
              <Select disabled value={user?.id}>
                <Select.Option key={user?.id} value={user?.id}>
                  {user?.name} (自己)
                </Select.Option>
              </Select>
            </Form.Item>
          )}
          {editingRecord && (
            <Form.Item name="lastContactAt" label="最近联系时间">
              <DatePicker 
                showTime
                format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }} 
                placeholder="选择最近联系时间"
              />
            </Form.Item>
          )}
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={4} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MarketingPool;

