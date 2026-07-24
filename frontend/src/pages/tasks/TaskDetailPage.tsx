import { useEffect, useState } from 'react';
import {
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { taskApi } from '../../api/taskApi';
import type { CompanyFinancialRecord, StressResult, StressTask } from '../../api/types';

const availabilityMap = {
  USABLE: { color: 'success', text: '可直接使用' },
  NEED_AVG: { color: 'warning', text: '需行业均值' },
  ABNORMAL: { color: 'error', text: '异常/无法处理' },
};

const scenarios = [
  { code: 'TRANSITION', name: '转型风险' },
  { code: 'PHYSICAL', name: '物理风险' },
  { code: 'COMPREHENSIVE', name: '综合风险' },
];

export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const taskId = Number(id);
  const [task, setTask] = useState<StressTask | null>(null);
  const [records, setRecords] = useState<CompanyFinancialRecord[]>([]);
  const [results, setResults] = useState<StressResult[]>([]);
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>(['TRANSITION']);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, r, res] = await Promise.all([
        taskApi.get(taskId),
        taskApi.records(taskId).catch(() => []),
        taskApi.results(taskId).catch(() => []),
      ]);
      setTask(t);
      setRecords(r);
      setResults(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [taskId]);

  const stepIndex =
    task?.status === 'DRAFT'
      ? 0
      : ['SYNCING', 'PENDING_CONFIRM'].includes(task?.status || '')
        ? 1
        : task?.status === 'PROCESSING'
          ? 2
          : ['READY_STRESS', 'STRESSING'].includes(task?.status || '')
            ? 3
            : 4;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { title: <a onClick={() => navigate('/tasks')}>压测任务</a> },
          { title: task?.taskName || '任务详情' },
        ]}
      />
      <Card loading={loading}>
        <Descriptions column={3} bordered size="small">
          <Descriptions.Item label="任务编号">{task?.taskCode}</Descriptions.Item>
          <Descriptions.Item label="报告年度">{task?.reportYear}</Descriptions.Item>
          <Descriptions.Item label="贷款类型">
            {task?.loanType === 'CORPORATE' ? '对公' : task?.loanType === 'PERSONAL' ? '个人' : task?.loanType}
          </Descriptions.Item>
          <Descriptions.Item label="贷款地区">
            {task?.loanRegion === 'DOMESTIC' ? '境内' : task?.loanRegion === 'OVERSEAS' ? '境外' : task?.loanRegion}
          </Descriptions.Item>
          <Descriptions.Item label="状态">{task?.status}</Descriptions.Item>
        </Descriptions>
        <Steps
          style={{ marginTop: 24 }}
          current={stepIndex}
          items={[
            { title: '创建任务' },
            { title: '数据同步确认' },
            { title: '数据处理' },
            { title: '场景压测' },
            { title: '完成' },
          ]}
        />
      </Card>
      <Card>
        <Tabs
          items={[
            {
              key: 'sync',
              label: '数据同步与确认',
              children: (
                <>
                  <Space style={{ marginBottom: 16 }}>
                    <Button type="primary" onClick={() => taskApi.sync(taskId).then(load)}>
                      同步财务数据
                    </Button>
                    <Button onClick={() => taskApi.confirmRecords(taskId, { recordIds: [], action: 'CONFIRM_ALL' }).then(load)}>
                      确认清单
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    dataSource={records}
                    size="small"
                    columns={[
                      { title: '公司', dataIndex: 'companyName' },
                      { title: '分行', dataIndex: 'branchName' },
                      { title: '接口行业', dataIndex: 'apiIndustry' },
                      { title: '标准行业', dataIndex: 'standardIndustry' },
                      {
                        title: '分流',
                        dataIndex: 'dataAvailability',
                        render: (v: keyof typeof availabilityMap) => {
                          const m = availabilityMap[v];
                          return <Tag color={m.color}>{m.text}</Tag>;
                        },
                      },
                      { title: '原因', dataIndex: 'availabilityReason' },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'process',
              label: '数据处理',
              children: (
                <Button type="primary" onClick={() => taskApi.calcIndustryAvg(taskId).then(load)}>
                  计算行业平均值并确认
                </Button>
              ),
            },
            {
              key: 'stress',
              label: '场景压测',
              children: (
                <>
                  <Checkbox.Group
                    options={scenarios.map((s) => ({ label: s.name, value: s.code }))}
                    value={selectedScenarios}
                    onChange={(v) => setSelectedScenarios(v as string[])}
                    style={{ marginBottom: 16 }}
                  />
                  <Button
                    type="primary"
                    onClick={() =>
                      taskApi.runStress(taskId, selectedScenarios).then(() => {
                        message.success('压测执行完成');
                        load();
                      })
                    }
                  >
                    执行压测
                  </Button>
                </>
              ),
            },
            {
              key: 'result',
              label: '压测结果',
              children: (
                <Table
                  rowKey="id"
                  dataSource={results}
                  columns={[
                    { title: '公司', dataIndex: 'companyName' },
                    { title: '分行', dataIndex: 'branchName' },
                    { title: '行业', dataIndex: 'standardIndustry' },
                    { title: '场景', dataIndex: 'scenarioName' },
                    { title: '收入(前)', dataIndex: 'metricRevenueBefore' },
                    { title: '收入(后)', dataIndex: 'metricRevenueAfter' },
                    { title: 'ECL(前)', dataIndex: 'metricEclBefore' },
                    { title: 'ECL(后)', dataIndex: 'metricEclAfter' },
                    {
                      title: '影响率',
                      dataIndex: 'impactRate',
                      render: (v: number) => (v != null ? `${(v * 100).toFixed(2)}%` : '-'),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
