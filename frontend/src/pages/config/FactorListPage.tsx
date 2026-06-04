import { useEffect, useState } from 'react';
import { Button, Table, message } from 'antd';
import client from '../../api/client';
import type { StressFactor } from '../../api/types';

export default function FactorListPage() {
  const [data, setData] = useState<StressFactor[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    client
      .get<StressFactor[]>('/config/factors')
      .then(setData)
      .catch((e) => message.error(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page-card">
      <div className="page-toolbar">
        <h3 style={{ margin: 0 }}>因子库管理</h3>
        <Button onClick={load}>刷新</Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: '因子编码', dataIndex: 'factorCode' },
          { title: '因子名称', dataIndex: 'factorName' },
          { title: '适用行业', dataIndex: 'industry' },
          { title: '场景类型', dataIndex: 'scenarioType' },
          { title: '因子值', dataIndex: 'factorValue' },
          { title: '单位', dataIndex: 'unit' },
          { title: '状态', dataIndex: 'status' },
        ]}
      />
    </div>
  );
}
