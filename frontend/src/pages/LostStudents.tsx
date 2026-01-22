import { Card, Table, Input, Space, Tag, message, Select, DatePicker, Button, Modal, Form } from 'antd';
import { SearchOutlined, PlusOutlined, FilterOutlined, UserOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { memfireDB } from '../services/memfireDB';
import { useAuthStore } from '../store/authStore';
import dayjs from 'dayjs';

interface StaffUser {
  id: string;
  name: string;
}

const LostStudents = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [showRecallableOnly, setShowRecallableOnly] = useState(false);
  const [activeStudents, setActiveStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [teacherList, setTeacherList] = useState<StaffUser[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    fetchLostStudents();
  }, [pagination.current, pagination.pageSize, searchText, showRecallableOnly, selectedTeacher]);

  useEffect(() => {
    fetchTeacherList();
  }, []);

  const fetchLostStudents = async () => {
    setLoading(true);
    try {
      const response = await memfireDB.lostStudents.list({
        page: pagination.current,
        pageSize: pagination.pageSize,
        keyword: searchText || undefined,
        teacherId: selectedTeacher || undefined,
      });
      
      // 解析notes中的删除原因和召回时间
      let processedData = response.data.map((student: any) => {
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

      // 如果启用可召回筛选，只显示召回时间已到或即将到来的学员
      if (showRecallableOnly) {
        processedData = processedData.filter((student: any) => {
          if (!student.expectedRecallDate) {
            return false;
          }
          // 召回时间已到或7天内即将到达
          const recallDate = dayjs(student.expectedRecallDate);
          return recallDate.isBefore(dayjs().add(7, 'day'));
        });
      }
      
      setData(processedData);
      setPagination({
        ...pagination,
        total: response.pagination.total,
      });
    } catch (error: any) {
      console.error('获取流失学员失败:', error);
      message.error(error.message || '获取流失学员失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReasonChange = async (studentId: string, deleteReason: string) => {
    try {
      const updateData: any = { deleteReason };
      await memfireDB.lostStudents.updateLostInfo(studentId, updateData);
      message.success('更新成功');
      fetchLostStudents();
    } catch (error: any) {
      message.error(error.message || '更新失败');
    }
  };

  const handleRecallDateChange = async (studentId: string, date: dayjs.Dayjs | null) => {
    try {
      await memfireDB.lostStudents.updateLostInfo(studentId, {
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
      content: '确定要将该学员召回吗？召回后学员状态将变为活跃。',
      onOk: async () => {
        try {
          await memfireDB.lostStudents.recall(studentId);
          message.success('召回成功');
          fetchLostStudents();
        } catch (error: any) {
          message.error(error.message || '召回失败');
        }
      },
    });
  };

  // 获取活跃学员列表
  const fetchActiveStudents = async () => {
    try {
      const response = await memfireDB.students.list({ pageSize: 1000 });
      // 只获取活跃状态的学员
      const active = (response.data || []).filter((s: any) => s.status === 'active');
      setActiveStudents(active);
    } catch (error: any) {
      console.error('获取活跃学员失败:', error);
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
  };

  const fetchTeacherList = async () => {
    try {
      const users = await memfireDB.users.listTeachers();
      setTeacherList(users || []);
    } catch (error: any) {
      console.error('获取教练列表失败:', error);
    }
  };

  const handleTeacherFilter = (teacherId: string | null) => {
    setSelectedTeacher(teacherId);
    setPagination({ ...pagination, current: 1 });
  };

  const handleSubmit = async (values: any) => {
    try {
      if (!values.studentId) {
        message.error('请选择学员');
        return;
      }

      await memfireDB.lostStudents.markAsLost({
        studentId: values.studentId,
        deleteReason: values.deleteReason,
        expectedRecallDate: values.expectedRecallDate?.format('YYYY-MM-DD'),
      });
      
      message.success('已将学员标记为流失，并从班级中移除');
      setModalVisible(false);
      form.resetFields();
      setSelectedStudent(null);
      fetchLostStudents();
    } catch (error: any) {
      message.error(error.message || '操作失败');
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
          <UserOutlined style={{ marginRight: 8, color: '#999' }} />
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
      title: '原所在班级',
      dataIndex: 'className',
      key: 'className',
      width: 150,
    },
    {
      title: '负责教练',
      dataIndex: 'teacherName',
      key: 'teacherName',
      width: 120,
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
        <Button 
          type="link" 
          onClick={() => handleRecall(record.id)}
          style={{ color: '#52c41a' }}
        >
          召回
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>流失学员库</h1>
        <Space>
          <Select
            placeholder="按教练筛选"
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
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={450}
      >
        
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item 
            name="studentId" 
            label="选择学员" 
            rules={[{ required: true, message: '请选择要标记为流失的学员' }]}
          >
            <Select 
              placeholder="输入姓名搜索学员"
              showSearch
              size="large"
              optionFilterProp="label"
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              onChange={handleStudentSelect}
              options={activeStudents.map((student: any) => {
                // 获取学员当前班级
                const activeEnrollment = student.enrollments?.find((e: any) => e.status === 'active');
                const className = activeEnrollment?.class?.name || '未分配班级';
                return {
                  label: `${student.name} - ${className}`,
                  value: student.id,
                };
              })}
            />
          </Form.Item>

          {/* 显示选中学员的信息 */}
          {selectedStudent && (
            <div style={{ 
              padding: 12, 
              background: '#f6ffed', 
              border: '1px solid #b7eb8f',
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
                  const enrollment = selectedStudent.enrollments?.find((e: any) => e.status === 'active');
                  return enrollment?.class?.name || '未分配';
                })()}
              </div>
              <div style={{ marginTop: 8, color: '#ff4d4f', fontSize: 12 }}>
                ⚠️ 标记为流失后，该学员将从班级中移除
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
