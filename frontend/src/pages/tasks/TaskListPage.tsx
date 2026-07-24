import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Table, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { taskApi } from '../../api/taskApi';
import type { StressTask } from '../../api/types';

const statusMap: Record<string, { color: string; text: string }> = {
  DRAFT: { color: 'default', text: '草稿' },
  SYNCING: { color: 'processing', text: '数据同步中' },
  PENDING_CONFIRM: { color: 'warning', text: '待确认' },
  PROCESSING: { color: 'processing', text: '数据处理中' },
  READY_STRESS: { color: 'blue', text: '待压测' },
  STRESSING: { color: 'processing', text: '压测中' },
  COMPLETED: { color: 'success', text: '已完成' },
  ARCHIVED: { color: 'default', text: '已归档' },
};

const reportYearOptions = Array.from({ length: 74 }, (_, index) => {
  const year = 2026 + index;
  return { label: String(year), value: year };
});

const loanTypeOptions = [
  { label: '对公', value: 'CORPORATE' },
  { label: '个人', value: 'PERSONAL' },
];

const loanRegionOptions = [
  { label: '境内', value: 'DOMESTIC' },
  { label: '境外', value: 'OVERSEAS' },
];

export default function TaskListPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StressTask[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const list = await taskApi.list();
      setData(list);
    } catch (e: unknown) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    const values = await form.validateFields();
    await taskApi.create({
      taskName: values.taskName,
      reportYear: values.reportYear,
      loanType: values.loanType,
      loanRegion: values.loanRegion,
      description: values.description,
    });
    message.success('任务创建成功');
    setOpen(false);
    form.resetFields();
    load();
  };

  return (
    <div className="page-card">
      <div className="page-toolbar">
        <h3 style={{ margin: 0 }}>压测任务管理</h3>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新建任务
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: '任务编号', dataIndex: 'taskCode', width: 160 },
          { title: '任务名称', dataIndex: 'taskName' },
          {
            title: '报告年度',
            dataIndex: 'reportYear',
            width: 120,
          },
          {
            title: '贷款类型',
            dataIndex: 'loanType',
            width: 120,
            render: (v: string) => (v === 'CORPORATE' ? '对公' : v === 'PERSONAL' ? '个人' : v),
          },
          {
            title: '贷款地区',
            dataIndex: 'loanRegion',
            width: 220,
            render: (v: string) => (v === 'DOMESTIC' ? '境内' : v === 'OVERSEAS' ? '境外' : v),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 120,
            render: (s: string) => {
              const m = statusMap[s] || { color: 'default', text: s };
              return <Tag color={m.color}>{m.text}</Tag>;
            },
          },
          { title: '创建时间', dataIndex: 'createdAt', width: 180 },
          {
            title: '操作',
            width: 120,
            render: (_, r) => (
              <Button type="link" onClick={() => navigate(`/tasks/${r.id}`)}>
                查看
              </Button>
            ),
          },
        ]}
      />
      <Modal title="新建气候风险压测任务" open={open} onOk={onCreate} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="taskName" label="任务名称" rules={[{ required: true }]}>
            <Input placeholder="请输入" />
          </Form.Item>
          <Form.Item name="reportYear" label="报告年度" rules={[{ required: true }]}>
            <Select placeholder="请选择年度" options={reportYearOptions} />
          </Form.Item>
          <Form.Item name="loanType" label="贷款类型" rules={[{ required: true }]}>
            <Select placeholder="请选择贷款类型" options={loanTypeOptions} />
          </Form.Item>
          <Form.Item name="loanRegion" label="贷款地区" rules={[{ required: true }]}>
            <Select placeholder="请选择贷款地区" options={loanRegionOptions} />
          </Form.Item>
          <Form.Item name="description" label="任务说明">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
