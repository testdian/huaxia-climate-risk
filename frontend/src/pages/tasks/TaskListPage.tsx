import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Space, Table, Tag, DatePicker, message } from 'antd';
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
    const [start, end] = values.reportPeriod;
    await taskApi.create({
      taskName: values.taskName,
      reportPeriodStart: start.format('YYYY-MM-DD'),
      reportPeriodEnd: end.format('YYYY-MM-DD'),
      dataCaliber: values.dataCaliber,
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
            title: '报告期',
            render: (_, r) => `${r.reportPeriodStart} ~ ${r.reportPeriodEnd}`,
            width: 220,
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
          <Form.Item name="reportPeriod" label="报告期时间范围" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="dataCaliber" label="数据口径">
            <Input placeholder="待业务确认可选项" />
          </Form.Item>
          <Form.Item name="description" label="任务说明">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
