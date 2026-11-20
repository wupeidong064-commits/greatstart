import { useOverlaySubmit, Modal } from '../components/overlays';
import { Alert, Card, Table, Input, Space, Tag, message, Select, DatePicker, Button, Form } from 'antd';
import { SearchOutlined, PlusOutlined, FilterOutlined, UserOutlined } from '@ant-design/icons';
import { useState, useEffect, useRef } from 'react';
import { useBusinessRefresh } from '../hooks/useBusinessRefresh';
import api from '../services/api';
import { dataService } from '../services/dataService';
import dayjs from 'dayjs';
import ArchiveStudentAction from '../components/ArchiveStudentAction';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';

interface StaffUser {
  id: string;
  name: string;
}

const LostStudents = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const session = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.role, user?.managementLevel]);
  const activeSession = useRef(session); activeSession.current = session;
  const listRequest = useRef(0);
  const candidateRequest = useRef(0);
  const role = user?.role ? normalizeRole(user.role) : null;
  const canArchive = role === 'admin' || role === 'manager';
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [submitLostForm, lostFormSubmitting] = useOverlaySubmit((values: any) => handleSubmit(values));
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [showRecallableOnly, setShowRecallableOnly] = useState(false);
  const [activeStudents, setActiveStudents] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const selectedEnrollmentId = Form.useWatch('enrollmentId', form);
  const [teacherList, setTeacherList] = useState<StaffUser[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);

  useEffect(() => {
    setData([]); setSelectedTeacher(null);
    setModalVisible(false); setActiveStudents([]); setSelectedStudent(null); form.resetFields();
    return () => { listRequest.current++; candidateRequest.current++; };
  }, [session]);

  useEffect(() => {
    fetchLostStudents();
  }, [pagination.current, pagination.pageSize, searchText, showRecallableOnly, selectedTeacher, session]);

  useEffect(() => {
    fetchTeacherList();
  }, []);

  const fetchLostStudents = async () => {
    const request = ++listRequest.current, key = session;
    const isCurrent = () => request === listRequest.current && key === activeSession.current;
    setLoading(true);
    try {
      const params: any = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        status: 'lost',
        recallableOnly: showRecallableOnly || undefined,
      };

      // 回访归属由服务端判断；不能隐式要求仍有本人负责的在班报名。

      // 如果有手动选择的老师筛选（admin/manager 使用）
      if (selectedTeacher) {
        params.teacherId = selectedTeacher;
      }

      const response = await api.get('/students', { params });
      if (!isCurrent()) return;

      // 解析notes中的删除原因和召回时间
      const processedData = (response.data || []).map((student: any) => {
        const notes = student.notes || '';
        let deleteReason = '';
        let expectedRecallDate = null;

        // 解析删除原因
        const reasonMatch = notes.match(/删除原因:([^,]*)/);
        if (reasonMatch) {
          deleteReason = reasonMatch[1];
        }

        // 解析预计召回时间
        const dateMatch = notes.match(/预计召回时间:([^,]*)/);
        if (dateMatch) {
          expectedRecallDate = dateMatch[1];
        }

        return {
          ...student,
          deleteReason,
          expectedRecallDate,
        };
      });

      setData(processedData);
      setPagination({
        ...pagination,
        total: response.pagination?.total || 0,
      });
    } catch (error: any) {
      if (isCurrent()) { console.error('获取流失学员失败:', error); message.error(error.message || '获取流失学员失败'); }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useBusinessRefresh(() => { if (user?.organizationId && user.campusId) void fetchLostStudents(); });

  const handleDeleteReasonChange = async (studentId: string, deleteReason: string) => {
    try {
      await api.put(`/students/${studentId}`, { deleteReason });
      message.success('更新成功');
      fetchLostStudents();
    } catch (error: any) {
      message.error(error.message || '更新失败');
    }
  };

  const handleRecallDateChange = async (studentId: string, date: dayjs.Dayjs | null) => {
    try {
      await api.put(`/students/${studentId}`, {
        expectedRecallDate: date ? date.format('YYYY-MM-DD') : null,
      });
      message.success('更新成功');
      fetchLostStudents();
    } catch (error: any) {
      message.error(error.message || '更新失败');
    }
  };

  const handleRecall = async (studentId: string) => {
    Modal.confirm({
      title: '确认召回',
      content: '确定要将该学员召回吗？召回后学员状态恢复活跃；班级花名册不会自动恢复，需重新加入班级后才回到基本盘人数。',
      onOk: async () => {
        try {
          await api.put(`/students/${studentId}`, { status: 'active' });
          message.success('召回成功：学员已恢复活跃，请到班级名单重新加入');
          fetchLostStudents();
        } catch (error: any) {
          message.error(error.message || '召回失败');
        }
      },
    });
  };

  const removableEnrollments = (student: any) => (student?.enrollments || []).filter((e: any) =>
    e.status === 'active' && (canArchive || e.class?.teacherId === user?.id));

  // 与正式退班操作共用在读责任口径，含停课班；老师仅能选择本人负责班级。
  const fetchActiveStudents = async () => {
    const request = ++candidateRequest.current, key = session;
    const isCurrent = () => request === candidateRequest.current && key === activeSession.current;
    setStudentsLoading(true); setActiveStudents([]);
    try {
      let students: any[] = [], page = 1, total = 0;
      do {
        const response = await api.get('/students', { params: { page, pageSize: 1000, lossCandidates: true } });
        if (!isCurrent()) return;
        const rows = response.data || [];
        students = students.concat(rows); total = response.pagination?.total ?? students.length;
        if (!rows.length) break;
        page++;
      } while (students.length < total);
      setActiveStudents(students.filter(student => removableEnrollments(student).length > 0));
    } catch (error: any) {
      if (isCurrent()) message.error(error.response?.data?.error?.message || error.message || '获取负责学员失败');
    } finally {
      if (isCurrent()) setStudentsLoading(false);
    }
  };

  const handleAdd = () => {
    form.resetFields();
    setSelectedStudent(null);
    fetchActiveStudents();
    setModalVisible(true);
  };

  // 选择学员时获取其详细信息
  const handleStudentSelect = (studentId: string) => {
    const student = activeStudents.find((s: any) => s.id === studentId);
    setSelectedStudent(student);
    const enrollments = removableEnrollments(student);
    form.setFieldValue('enrollmentId', enrollments.length === 1 ? enrollments[0].id : undefined);
  };

  const fetchTeacherList = async () => {
    try {
      const data = await dataService.getTeachers();
      setTeacherList(data);
    } catch (error: any) {
      console.error('获取老师列表失败:', error);
    }
  };

  const handleTeacherFilter = (teacherId: string | null) => {
    setSelectedTeacher(teacherId);
    setPagination({ ...pagination, current: 1 });
  };

  const handleSubmit = async (values: any) => {
    const key = session;
    try {
      if (!values.studentId) {
        message.error('请选择学员');
        return;
      }

      const student = activeStudents.find(s => s.id === values.studentId);
      if (!removableEnrollments(student).some((e: any) => e.id === values.enrollmentId)) {
        message.error('请选择要退出的本人负责班级');
        return;
      }
      const response = await api.post(`/enrollments/${values.enrollmentId}/remove-as-lost`, {
        deleteReason: values.deleteReason,
        expectedRecallDate: values.expectedRecallDate?.format('YYYY-MM-DD'),
      });
      if (key !== activeSession.current) return;
      message.success(response.data?.mode === 'class-only' ? '已退出所选班级，学员仍在其他班级在读' : '已退出班级并转入流失学员库');
      setModalVisible(false);
      form.resetFields();
      setSelectedStudent(null);
      fetchLostStudents();
    } catch (error: any) {
      if (key === activeSession.current) message.error(error.response?.data?.error?.message || error.message || '操作失败');
    }
  };


  const columns = [
    {
      title: '学员姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (name: string) => (
        <span>
          <UserOutlined style={{ marginRight: 8, color: 'var(--tx3)' }} />
          {name}
        </span>
      ),
    },
    {
      title: '联系电话',
      key: 'phone',
      width: 140,
      render: (_: any, record: any) => (
        <span>
          {record.phone || record.parentPhone || '-'}
        </span>
      ),
    },
    {
      // 2026-11-08 修复：列表接口不返回 className/teacherName，旧写法永远显示空。
      // 现从已结束报名里取最近一次（后端在 lost 查询时附带已结束报名）。
      title: '原所在班级',
      key: 'className',
      width: 150,
      render: (_: any, record: any) => {
        const latest = [...(record.enrollments || [])]
          .filter((e: any) => e.status !== 'active')
          .sort((a: any, b: any) => new Date(b.endedAt || 0).getTime() - new Date(a.endedAt || 0).getTime())[0];
        return latest?.class?.name || '-';
      },
    },
    {
      title: '原班级老师',
      key: 'teacherName',
      width: 120,
      render: (_: any, record: any) => {
        const latest = [...(record.enrollments || [])]
          .filter((e: any) => e.status !== 'active')
          .sort((a: any, b: any) => new Date(b.endedAt || 0).getTime() - new Date(a.endedAt || 0).getTime())[0];
        return latest?.class?.teacher?.name || '-';
      },
    },
    {
      title: '回访老师',
      key: 'recallTeacher',
      width: 120,
      render: (_: any, record: any) => record.recallTeacher?.name || <span style={{ color: 'var(--tx2)' }}>待分配</span>,
    },
    {
      title: '删除原因',
      dataIndex: 'deleteReason',
      key: 'deleteReason',
      width: 130,
      render: (reason: string, record: any) => (
        <Select
          value={reason || undefined}
          style={{ width: '100%' }}
          onChange={(value) => handleDeleteReasonChange(record.id, value)}
          options={[
            { label: '时间问题', value: '时间问题' },
            { label: '生病问题', value: '生病问题' },
          ]}
          placeholder="请选择"
        />
      ),
    },
    {
      title: '预计召回时间',
      dataIndex: 'expectedRecallDate',
      key: 'expectedRecallDate',
      width: 160,
      render: (date: string | null, record: any) => {
        const isOverdue = date && dayjs(date).isBefore(dayjs(), 'day');
        const isNearby = date && dayjs(date).diff(dayjs(), 'day') <= 7 && !isOverdue;
        
        return (
          <Space direction="vertical" size={4}>
            <DatePicker
              value={date ? dayjs(date) : null}
              onChange={(d) => handleRecallDateChange(record.id, d)}
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
              placeholder="选择日期"
              allowClear
            />
            {isOverdue && <Tag color="red">已到召回时间</Tag>}
            {isNearby && <Tag color="orange">即将可召回</Tag>}
          </Space>
        );
      },
    },
    {
      title: '流失时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 120,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" onClick={() => handleRecall(record.id)} style={{ color: 'var(--ok)' }}>召回</Button>
          {canArchive && <ArchiveStudentAction student={record} onArchived={fetchLostStudents} />}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="responsive-page-heading" style={{ marginBottom: 16 }}>
        <h1>流失学员库</h1>
        <Space>
          <Select
            placeholder="按老师筛选"
            allowClear
            style={{ width: 180 }}
            value={selectedTeacher}
            onChange={(value) => handleTeacherFilter(value)}
          >
            {teacherList.map(teacher => (
              <Select.Option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </Select.Option>
            ))}
          </Select>
          <Input.Search
            placeholder="搜索学员姓名/电话"
            allowClear
            style={{ width: 250 }}
            prefix={<SearchOutlined />}
            onSearch={(value) => {
              setSearchText(value);
              setPagination({ ...pagination, current: 1 });
            }}
          />
          <Button
            type={showRecallableOnly ? 'primary' : 'default'}
            icon={<FilterOutlined />}
            onClick={() => {
              setShowRecallableOnly(!showRecallableOnly);
              setPagination({ ...pagination, current: 1 });
            }}
          >
            {showRecallableOnly ? '取消筛选' : '可召回学员筛选'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加流失学员
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          pagination={{
            ...pagination,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            },
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title={
          <span>
            <PlusOutlined style={{ marginRight: 8 }} />
            添加流失学员
          </span>
        }
        open={modalVisible}
        confirmLoading={lostFormSubmitting}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={450}
      >
        
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message={canArchive ? '选择在读学员并办理退班' : '可直接选择自己负责的在读学员'}
          description="提交后同步退出所选班级；退出最后一个在读班时进入流失学员库。仍在其他班上课的学员保持在读。" />
        <Form form={form} onFinish={submitLostForm} layout="vertical">
          <Form.Item
            name="studentId"
            label={canArchive ? '选择学员' : '选择学员（本人负责）'}
            rules={[{ required: true, message: '请选择要标记为流失的学员' }]}
          >
            <Select 
              placeholder="输入姓名搜索学员"
              showSearch
              loading={studentsLoading}
              disabled={studentsLoading || lostFormSubmitting}
              notFoundContent={studentsLoading ? '正在加载负责学员…' : '暂无可办理退班的学员'}
              size="large"
              optionFilterProp="label"
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              onChange={handleStudentSelect}
              options={activeStudents.map((student: any) => {
                // 获取学员当前班级
                const className = removableEnrollments(student).map((e: any) => e.class?.name).filter(Boolean).join('、');
                return {
                  label: `${student.name} - ${className}`,
                  value: student.id,
                };
              })}
            />
          </Form.Item>

          {selectedStudent && (
            <Form.Item name="enrollmentId" label="退出班级" rules={[{ required: true, message: '请选择要退出的班级' }]}>
              <Select placeholder="请选择要退出的班级" disabled={lostFormSubmitting}
                options={removableEnrollments(selectedStudent).map((e: any) => ({ value: e.id, label: e.class?.name }))} />
            </Form.Item>
          )}

          {/* 显示选中学员的信息 */}
          {selectedStudent && (
            <div style={{ 
              padding: 12, 
              background: 'var(--ok-bg)', 
              border: '1px solid var(--ok-line)',
              borderRadius: 6,
              marginBottom: 16
            }}>
              <div style={{ marginBottom: 8 }}>
                <strong>学员信息：</strong>
              </div>
              <div>姓名：{selectedStudent.name}</div>
              <div>电话：{selectedStudent.phone || selectedStudent.parentPhone || '-'}</div>
              <div>
                当前班级：
                {(() => {
                  return selectedStudent.enrollments?.map((e: any) => e.class?.name).filter(Boolean).join('、') || '未分配';
                })()}
              </div>
              <div style={{ marginTop: 8, color: 'var(--bad)', fontSize: 12 }}>
                {!selectedEnrollmentId ? '请选择本次要退出的班级。'
                  : selectedStudent.enrollments?.some((e: any) => e.id !== selectedEnrollmentId)
                  ? '退出所选班级后，其他在读班级保留，学员暂不进入流失库。'
                  : '退出最后一个在读班后进入流失库，由离班老师继续回访；召回后需重新安排班级。'}
              </div>
            </div>
          )}

          <Form.Item 
            name="deleteReason" 
            label="流失原因" 
            rules={[{ required: true, message: '请选择流失原因' }]}
            initialValue="时间问题"
          >
            <Select 
              placeholder="请选择流失原因" 
              size="large"
            >
              <Select.Option value="时间问题">
                <Tag color="blue">时间问题</Tag>
              </Select.Option>
              <Select.Option value="生病问题">
                <Tag color="orange">生病问题</Tag>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item 
            name="expectedRecallDate" 
            label="预计召回时间"
            rules={[{ required: true, message: '请选择预计召回时间' }]}
          >
            <DatePicker 
              format="YYYY-MM-DD" 
              style={{ width: '100%' }} 
              placeholder="选择预计召回时间"
              size="large"
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LostStudents;
