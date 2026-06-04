import { useEffect, useState } from 'react';
import { Card, Col, Row, Select, Table, message } from 'antd';
import ReactECharts from 'echarts-for-react';
import { taskApi } from '../../api/taskApi';
import type { StressTask } from '../../api/types';
import { tokens } from '../../theme/tokens';

export default function ResultAnalysisPage() {
  const [tasks, setTasks] = useState<StressTask[]>([]);
  const [taskId, setTaskId] = useState<number>();
  const [dimension, setDimension] = useState<'industry' | 'branch'>('industry');
  const [summary, setSummary] = useState<{ name: string; impactRate: number; count: number }[]>([]);

  useEffect(() => {
    taskApi.list().then(setTasks).catch((e) => message.error(String(e)));
  }, []);

  useEffect(() => {
    if (!taskId) return;
    taskApi
      .summary(taskId, dimension)
      .then((data: { name: string; impactRate: number; count: number }[]) => setSummary(data))
      .catch((e) => message.error(String(e)));
  }, [taskId, dimension]);

  const chartOption = {
    color: [tokens.color.primary],
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: summary.map((s) => s.name) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(1)}%` } },
    series: [{ type: 'bar', data: summary.map((s) => s.impactRate) }],
  };

  return (
    <div className="page-card">
      <h3>压测结果分析</h3>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="选择任务"
            style={{ width: 280 }}
            options={tasks.map((t) => ({ label: t.taskName, value: t.id }))}
            onChange={setTaskId}
          />
        </Col>
        <Col>
          <Select
            value={dimension}
            style={{ width: 160 }}
            onChange={setDimension}
            options={[
              { label: '行业维度', value: 'industry' },
              { label: '分行维度', value: 'branch' },
            ]}
          />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={14}>
          <Card title="平均影响率">
            <ReactECharts option={chartOption} style={{ height: 320 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="汇总明细">
            <Table
              rowKey="name"
              size="small"
              pagination={false}
              dataSource={summary}
              columns={[
                { title: dimension === 'industry' ? '行业' : '分行', dataIndex: 'name' },
                { title: '公司数', dataIndex: 'count' },
                {
                  title: '平均影响率',
                  dataIndex: 'impactRate',
                  render: (v: number) => `${(v * 100).toFixed(2)}%`,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
