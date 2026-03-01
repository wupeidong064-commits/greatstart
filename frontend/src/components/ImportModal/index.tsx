/**
 * 批量导入组件
 * 支持学员和班级的 Excel 批量导入
 */

import { useState } from 'react';
import {
  Modal,
  Steps,
  Upload,
  Button,
  Table,
  Alert,
  Radio,
  Space,
  message,
  Tag,
  Progress,
  Typography,
  Divider,
  Checkbox,
} from 'antd';
import {
  UploadOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import api from '../../services/api';

const { Text } = Typography;

// 导入类型
type ImportType = 'students' | 'classes' | 'leads' | 'experiences';

// 重复处理策略
type DuplicateStrategy = 'skip' | 'update';

// 预览数据项
interface PreviewItem {
  row: number;
  data: Record<string, any>;
  isValid: boolean;
  errors: string[];
  isDuplicate?: boolean;
}

// 重复数据项
interface DuplicateItem {
  row: number;
  data: Record<string, any>;
  existingRecord: Record<string, any>;
}

// 预览结果
interface PreviewResult {
  total: number;
  valid: number;
  invalid: number;
  preview: PreviewItem[];
  duplicates: DuplicateItem[];
}

// 导入结果
interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  details: Array<{
    row: number;
    status: 'created' | 'updated' | 'skipped' | 'failed';
    message?: string;
  }>;
}

interface ImportModalProps {
  visible: boolean;
  type: ImportType;
  onClose: () => void;
  onSuccess: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({
  visible,
  type,
  onClose,
  onSuccess,
}) => {
  // 步骤
  const [currentStep, setCurrentStep] = useState(0);

  // 文件
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  // 预览数据
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 策略选择
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [createMissingClasses, setCreateMissingClasses] = useState(true);

  // 导入结果
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // 类型标签
  const typeLabels: Record<ImportType, string> = {
    students: '学员',
    classes: '班级',
    leads: '鱼池',
    experiences: '体验课',
  };
  const typeLabel = typeLabels[type];

  // 下载模板
  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get(`/import/template/${type}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${typeLabel}导入模板.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success('模板下载成功');
    } catch (error: any) {
      console.error('下载模板失败:', error);
      message.error(error.message || '下载模板失败');
    }
  };

  // 上传并预览
  const handleUploadAndPreview = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择文件');
      return;
    }

    const file = fileList[0].originFileObj;
    if (!file) {
      message.error('文件读取失败');
      return;
    }

    setPreviewLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await api.post('/import/preview', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setPreviewData(response.data);
      setCurrentStep(1);
      message.success('文件解析成功');
    } catch (error: any) {
      console.error('预览失败:', error);
      message.error(error.response?.data?.error?.message || error.message || '预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  // 执行导入
  const handleExecuteImport = async () => {
    if (!previewData) return;

    // 过滤出有效数据
    const validData = previewData.preview
      .filter((item) => item.isValid)
      .map((item) => item.data);

    if (validData.length === 0) {
      message.warning('没有有效数据可导入');
      return;
    }

    setImporting(true);
    setImportProgress(0);

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setImportProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const response = await api.post('/import/execute', {
        type,
        data: validData,
        duplicateStrategy,
        createMissingClasses,
        duplicates: previewData.duplicates,
      });

      clearInterval(progressInterval);
      setImportProgress(100);

      setImportResult(response.data);
      setCurrentStep(2);

      if (response.data.success) {
        message.success('导入完成');
        onSuccess();
      } else {
        message.warning('导入部分失败，请查看详情');
      }
    } catch (error: any) {
      console.error('导入失败:', error);
      message.error(error.response?.data?.error?.message || error.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  // 重置状态
  const handleReset = () => {
    setCurrentStep(0);
    setFileList([]);
    setPreviewData(null);
    setImportResult(null);
    setImportProgress(0);
    setDuplicateStrategy('skip');
    setCreateMissingClasses(true);
  };

  // 关闭弹窗
  const handleClose = () => {
    handleReset();
    onClose();
  };

  // 预览表格列配置
  const previewColumns = type === 'students'
    ? [
        { title: '行号', dataIndex: 'row', key: 'row', width: 60 },
        { title: '学员姓名', dataIndex: ['data', 'name'], key: 'name', width: 80 },
        { title: '性别', dataIndex: ['data', 'gender'], key: 'gender', width: 50, render: (v: string) => v === 'M' ? '男' : v === 'F' ? '女' : '-' },
        { title: '联系电话', dataIndex: ['data', 'phone'], key: 'phone', width: 100 },
        { title: '家长电话', dataIndex: ['data', 'parentPhone'], key: 'parentPhone', width: 100 },
        { title: '班级编码', dataIndex: ['data', 'classCode'], key: 'classCode', width: 80 },
        { title: '开卡时间', dataIndex: ['data', 'cardOpenDate'], key: 'cardOpenDate', width: 90 },
        { title: '已购', dataIndex: ['data', 'purchasedLessons'], key: 'purchasedLessons', width: 60 },
        { title: '已消', dataIndex: ['data', 'consumedLessons'], key: 'consumedLessons', width: 60 },
        { title: '剩余', dataIndex: ['data', 'remainingLessons'], key: 'remainingLessons', width: 60 },
        { title: '缴费', dataIndex: ['data', 'totalPayment'], key: 'totalPayment', width: 70, render: (v: number) => v ? `¥${v}` : '-' },
        { title: '销售', dataIndex: ['data', 'salesName'], key: 'salesName', width: 70 },
        { title: '最后上课', dataIndex: ['data', 'lastClassDate'], key: 'lastClassDate', width: 90 },
        {
          title: '状态',
          key: 'status',
          width: 80,
          render: (_: any, record: PreviewItem) => {
            if (!record.isValid) {
              return <Tag color="red">数据错误</Tag>;
            }
            if (record.isDuplicate) {
              return <Tag color="orange">重复</Tag>;
            }
            return <Tag color="green">正常</Tag>;
          },
        },
        {
          title: '错误信息',
          dataIndex: 'errors',
          key: 'errors',
          width: 150,
          render: (errors: string[]) => errors?.length > 0 ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              {errors.join('; ')}
            </Text>
          ) : '-',
        },
      ]
    : type === 'classes'
    ? [
        { title: '行号', dataIndex: 'row', key: 'row', width: 60 },
        { title: '班级名称', dataIndex: ['data', 'name'], key: 'name' },
        { title: '班级编码', dataIndex: ['data', 'code'], key: 'code' },
        { title: '课程类型', dataIndex: ['data', 'courseType'], key: 'courseType' },
        { title: '班级水平', dataIndex: ['data', 'level'], key: 'level' },
        { title: '容量', dataIndex: ['data', 'capacity'], key: 'capacity' },
        { title: '负责教练', dataIndex: ['data', 'teacherName'], key: 'teacherName' },
        {
          title: '状态',
          key: 'status',
          render: (_: any, record: PreviewItem) => {
            if (!record.isValid) {
              return <Tag color="red">数据错误</Tag>;
            }
            if (record.isDuplicate) {
              return <Tag color="orange">重复</Tag>;
            }
            return <Tag color="green">正常</Tag>;
          },
        },
        {
          title: '错误信息',
          dataIndex: 'errors',
          key: 'errors',
          render: (errors: string[]) => errors?.length > 0 ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              {errors.join('; ')}
            </Text>
          ) : '-',
        },
      ]
    : type === 'leads'
    ? [
        { title: '行号', dataIndex: 'row', key: 'row', width: 60 },
        { title: '客户姓名', dataIndex: ['data', 'customerName'], key: 'customerName', width: 100 },
        { title: '年龄', dataIndex: ['data', 'age'], key: 'age', width: 60 },
        { title: '联系方式', dataIndex: ['data', 'contact'], key: 'contact', width: 120 },
        { title: '备注', dataIndex: ['data', 'notes'], key: 'notes', width: 150 },
        { title: '最近联系', dataIndex: ['data', 'lastContactAt'], key: 'lastContactAt', width: 100 },
        { title: '负责人', dataIndex: ['data', 'assigneeName'], key: 'assigneeName', width: 80 },
        {
          title: '状态',
          key: 'status',
          width: 80,
          render: (_: any, record: PreviewItem) => {
            if (!record.isValid) {
              return <Tag color="red">数据错误</Tag>;
            }
            if (record.isDuplicate) {
              return <Tag color="orange">重复</Tag>;
            }
            return <Tag color="green">正常</Tag>;
          },
        },
        {
          title: '错误信息',
          dataIndex: 'errors',
          key: 'errors',
          width: 150,
          render: (errors: string[]) => errors?.length > 0 ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              {errors.join('; ')}
            </Text>
          ) : '-',
        },
      ]
    : [ // experiences
        { title: '行号', dataIndex: 'row', key: 'row', width: 60 },
        { title: '学员姓名', dataIndex: ['data', 'studentName'], key: 'studentName', width: 80 },
        { title: '年龄', dataIndex: ['data', 'age'], key: 'age', width: 50 },
        { title: '联系方式', dataIndex: ['data', 'contact'], key: 'contact', width: 100 },
        { title: '来源', dataIndex: ['data', 'source'], key: 'source', width: 80 },
        { title: '班级', dataIndex: ['data', 'className'], key: 'className', width: 100 },
        { title: '预约日期', dataIndex: ['data', 'scheduleDate'], key: 'scheduleDate', width: 90 },
        { title: '授课教练', dataIndex: ['data', 'teachingTeacherName'], key: 'teachingTeacherName', width: 80 },
        { title: '负责人', dataIndex: ['data', 'assigneeName'], key: 'assigneeName', width: 70 },
        { title: '状态', dataIndex: ['data', 'status'], key: 'status', width: 70 },
        {
          title: '导入状态',
          key: 'importStatus',
          width: 80,
          render: (_: any, record: PreviewItem) => {
            if (!record.isValid) {
              return <Tag color="red">数据错误</Tag>;
            }
            return <Tag color="green">正常</Tag>;
          },
        },
        {
          title: '错误信息',
          dataIndex: 'errors',
          key: 'errors',
          width: 150,
          render: (errors: string[]) => errors?.length > 0 ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              {errors.join('; ')}
            </Text>
          ) : '-',
        },
      ];

  // 结果表格列配置
  const resultColumns = [
    { title: '行号', dataIndex: 'row', key: 'row', width: 60 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusConfig: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
          created: { color: 'green', text: '创建成功', icon: <CheckCircleOutlined /> },
          updated: { color: 'blue', text: '更新成功', icon: <CheckCircleOutlined /> },
          skipped: { color: 'default', text: '已跳过', icon: <ExclamationCircleOutlined /> },
          failed: { color: 'red', text: '失败', icon: <CloseCircleOutlined /> },
        };
        const config = statusConfig[status] || { color: 'default', text: status, icon: null };
        return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>;
      },
    },
    { title: '详情', dataIndex: 'message', key: 'message' },
  ];

  return (
    <Modal
      title={`批量导入${typeLabel}`}
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={900}
      destroyOnClose
    >
      <Steps
        current={currentStep}
        items={[
          { title: '上传文件', description: '选择 Excel 文件' },
          { title: '数据预览', description: '检查数据' },
          { title: '导入结果', description: '查看结果' },
        ]}
        style={{ marginBottom: 24 }}
      />

      {/* 步骤1：上传文件 */}
      {currentStep === 0 && (
        <div>
          <Alert
            message="导入说明"
            description={
              <div>
                <p>1. 请先下载导入模板，按照模板格式填写数据</p>
                <p>2. 上传的文件必须是 Excel 格式（.xlsx 或 .xls）</p>
                <p>3. 单次导入最多支持 1000 行数据</p>
                <p>4. 文件大小不能超过 5MB</p>
              </div>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownloadTemplate}
            style={{ marginBottom: 16 }}
          >
            下载{typeLabel}导入模板
          </Button>

          <Upload
            accept=".xlsx,.xls"
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList }) => setFileList(fileList.slice(-1))}
            maxCount={1}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>

          {fileList.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Text>已选择文件：{fileList[0].name}</Text>
            </div>
          )}

          <Divider />

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleClose}>取消</Button>
              <Button
                type="primary"
                loading={previewLoading}
                onClick={handleUploadAndPreview}
                disabled={fileList.length === 0}
              >
                下一步：预览数据
              </Button>
            </Space>
          </div>
        </div>
      )}

      {/* 步骤2：数据预览 */}
      {currentStep === 1 && previewData && (
        <div>
          <Alert
            message={
              <Space>
                <span>共 {previewData.total} 条数据</span>
                <Tag color="green">有效 {previewData.valid} 条</Tag>
                {previewData.invalid > 0 && <Tag color="red">无效 {previewData.invalid} 条</Tag>}
                {previewData.duplicates.length > 0 && <Tag color="orange">重复 {previewData.duplicates.length} 条</Tag>}
              </Space>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          {previewData.duplicates.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>重复数据处理方式：</Text>
              <Radio.Group
                value={duplicateStrategy}
                onChange={(e) => setDuplicateStrategy(e.target.value)}
                style={{ marginLeft: 16 }}
              >
                <Radio value="skip">跳过（保留原数据）</Radio>
                <Radio value="update">覆盖更新</Radio>
              </Radio.Group>
            </div>
          )}

          {type === 'students' && (
            <div style={{ marginBottom: 16 }}>
              <Checkbox
                checked={createMissingClasses}
                onChange={(e) => setCreateMissingClasses(e.target.checked)}
              >
                班级编码不存在时自动创建班级
              </Checkbox>
            </div>
          )}

          <Table
            columns={previewColumns}
            dataSource={previewData.preview}
            rowKey="row"
            scroll={{ x: 800, y: 300 }}
            pagination={{ pageSize: 10 }}
            size="small"
          />

          <Divider />

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCurrentStep(0)}>上一步</Button>
              <Button
                type="primary"
                loading={importing}
                onClick={handleExecuteImport}
                disabled={previewData.valid === 0}
              >
                {importing ? `导入中 ${importProgress}%` : '确认导入'}
              </Button>
            </Space>
          </div>
        </div>
      )}

      {/* 步骤3：导入结果 */}
      {currentStep === 2 && importResult && (
        <div>
          {importResult.success ? (
            <Alert
              message="导入完成"
              description={
                <Space size="large">
                  <span>创建：<strong>{importResult.summary.created}</strong> 条</span>
                  {importResult.summary.updated > 0 && (
                    <span>更新：<strong>{importResult.summary.updated}</strong> 条</span>
                  )}
                  {importResult.summary.skipped > 0 && (
                    <span>跳过：<strong>{importResult.summary.skipped}</strong> 条</span>
                  )}
                  {importResult.summary.failed > 0 && (
                    <span>失败：<strong>{importResult.summary.failed}</strong> 条</span>
                  )}
                </Space>
              }
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
          ) : (
            <Alert
              message="导入部分失败"
              description={`成功 ${importResult.summary.created + importResult.summary.updated} 条，失败 ${importResult.summary.failed} 条`}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {importing && (
            <Progress percent={importProgress} style={{ marginBottom: 16 }} />
          )}

          {importResult.details.length > 0 && (
            <Table
              columns={resultColumns}
              dataSource={importResult.details}
              rowKey="row"
              scroll={{ y: 300 }}
              pagination={{ pageSize: 10 }}
              size="small"
            />
          )}

          <Divider />

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleReset}>继续导入</Button>
              <Button type="primary" onClick={handleClose}>
                完成
              </Button>
            </Space>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ImportModal;
