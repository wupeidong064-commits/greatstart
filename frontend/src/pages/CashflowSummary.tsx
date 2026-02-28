import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, DatePicker, Space, Spin, Select, Modal, Button, Table } from 'antd';
import { DollarOutlined, UserAddOutlined, TeamOutlined, RiseOutlined, SyncOutlined, RollbackOutlined, UnorderedListOutlined } from '@ant-design/icons';
import api from '../services/api';
import { dataService } from '../services/dataService';
import dayjs from 'dayjs';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';

const { RangePicker } = DatePicker;
const { Option } = Select;

const CashflowSummary = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [summaryData, setSummaryData] = useState<any>({
    newSignup: {
      totalLeads: 0,
      attendedExperience: 0,
      conversions: 0,
      conversionRate: 0,
    },
    renewal: {
      count: 0,
      amount: 0,
      totalEligible: 0,
      renewalRate: 0,
    },
    refund: {
      count: 0,
      amount: 0,
      refundRate: 0,
      students: [],
    },
  });
  const { user } = useAuthStore();

  useEffect(() => {
    fetchStaffList();
  }, []);

  // sales 角色自动选择自己
  useEffect(() => {
    if (user && normalizeRole(user.role) === 'sales') {
      setSelectedStaff(user.id);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [dateRange, selectedStaff]);

  const fetchStaffList = async () => {
    try {
      const data = await dataService.getTeachers();
      setStaffList(data);
    } catch (error) {
      console.error('获取人员列表失败:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/cashflow-summary', {
        params: {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD'),
          staffId: selectedStaff || undefined,
        },
      });
      // axios拦截器返回response.data，后端sendSuccess包装在data字段中
      const result = response?.data || response || {};
      setSummaryData(result || {
        newSignup: {
          totalLeads: 0,
          attendedExperience: 0,
          conversions: 0,
          conversionRate: 0,
        },
        renewal: {
          count: 0,
          amount: 0,
          totalEligible: 0,
          renewalRate: 0,
        },
        refund: {
          count: 0,
          amount: 0,
          refundRate: 0,
          students: [],
        },
      });
    } catch (error: any) {
      console.error('获取现金流总结失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]]);
    }
  };

  const isSales = user && normalizeRole(user.role) === 'sales';

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>现金流收入总结</h2>
        <Space>
          {!isSales && (
            <Select
              placeholder="按人员筛选"
              allowClear
              style={{ width: 200 }}
              value={selectedStaff}
              onChange={setSelectedStaff}
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                ((option?.children as unknown as string) || '')?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {staffList.map(staff => (
                <Option key={staff.id} value={staff.id}>
                  {staff.name}
                </Option>
              ))}
            </Select>
          )}
          <RangePicker
            value={dateRange}
            onChange={handleDateChange}
            format="YYYY-MM-DD"
            allowClear={false}
          />
        </Space>
      </div>

      <>
      <Spin spinning={loading}>
        {/* 新签板块 */}
        <Card
          title={
            <span>
              <UserAddOutlined style={{ marginRight: 8 }} />
              新签板块
            </span>
          }
          style={{ marginBottom: 24 }}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="添加数（线索）"
                  value={summaryData.newSignup.totalLeads}
                  prefix={<TeamOutlined />}
                  suffix="个"
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="到场数（体验课）"
                  value={summaryData.newSignup.attendedExperience}
                  prefix={<UserAddOutlined />}
                  suffix="人"
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="成单数"
                  value={summaryData.newSignup.conversions}
                  prefix={<DollarOutlined />}
                  suffix="单"
                  valueStyle={{ color: '#faad14' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="成单率"
                  value={summaryData.newSignup.conversionRate}
                  prefix={<RiseOutlined />}
                  suffix="%"
                  valueStyle={{ color: '#f5222d' }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  成单数 / 体验课登记总数
                </div>
              </Card>
            </Col>
          </Row>
        </Card>

        {/* 续费板块 */}
        <Card
          title={
            <span>
              <SyncOutlined style={{ marginRight: 8 }} />
              续费板块
            </span>
          }
        >
          <Row gutter={16}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="续费数"
                  value={summaryData.renewal.count}
                  prefix={<TeamOutlined />}
                  suffix="单"
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="续费金额"
                  value={summaryData.renewal.amount}
                  prefix="¥"
                  precision={2}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="应续费总人数"
                  value={summaryData.renewal.totalEligible}
                  prefix={<UserAddOutlined />}
                  suffix="人"
                  valueStyle={{ color: '#faad14' }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  当前待续费 + 已续费
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="续费率"
                  value={summaryData.renewal.renewalRate}
                  prefix={<RiseOutlined />}
                  suffix="%"
                  valueStyle={{ color: '#f5222d' }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  已续费学员数 / 应续费总人数
                </div>
              </Card>
            </Col>
          </Row>
        </Card>

        {/* 退费板块 */}
        <Card
          title={
            <span>
              <RollbackOutlined style={{ marginRight: 8 }} />
              退费板块
            </span>
          }
        >
          <Row gutter={16}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="退费人数"
                  value={summaryData.refund.count}
                  prefix={<UserAddOutlined />}
                  suffix="人"
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="退费金额"
                  value={summaryData.refund.amount}
                  prefix="¥"
                  precision={2}
                  valueStyle={{ color: '#ff7875' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="退费率"
                  value={summaryData.refund.refundRate}
                  prefix={<RiseOutlined />}
                  suffix="%"
                  valueStyle={{ color: '#faad14' }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  退费人数 / 总成单人数
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <div style={{ padding: '16px 0', textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 16, color: '#666' }}>退费学员详情</div>
                  <Button
                    type="primary"
                    icon={<UnorderedListOutlined />}
                    onClick={() => setRefundModalVisible(true)}
                    disabled={!summaryData.refund.students || summaryData.refund.students.length === 0}
                  >
                    查看列表 ({summaryData.refund.count}人)
                  </Button>
                </div>
              </Card>
            </Col>
          </Row>
        </Card>
      </Spin>

      {/* 退费学员列表弹窗 */}
      <Modal
        title={
          <span>
            <RollbackOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />
            退费学员列表
          </span>
        }
        open={refundModalVisible}
        onCancel={() => setRefundModalVisible(false)}
        footer={null}
        width={600}
      >
        <Table
          dataSource={summaryData.refund.students || []}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          size="small"
          locale={{ emptyText: '暂无退费学员' }}
          columns={[
            {
              title: '学员姓名',
              dataIndex: 'name',
              key: 'name',
              width: 120,
            },
            {
              title: '退费日期',
              dataIndex: 'refundDate',
              key: 'refundDate',
              width: 120,
              render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
            },
            {
              title: '退费原因',
              dataIndex: 'refundReason',
              key: 'refundReason',
              render: (reason: string) => reason || '-',
            },
          ]}
        />
      </Modal>
      </>
    </div>
  );
};

export default CashflowSummary;

