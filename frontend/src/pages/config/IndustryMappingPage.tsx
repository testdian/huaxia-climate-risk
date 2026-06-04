import { useEffect, useState } from 'react';
import { Button, Table, message } from 'antd';
import client from '../../api/client';
import type { IndustryMapping } from '../../api/types';

export default function IndustryMappingPage() {
  const [data, setData] = useState<IndustryMapping[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    client
      .get<IndustryMapping[]>('/config/industry-mappings')
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
        <h3 style={{ margin: 0 }}>行业映射关系</h3>
        <Button onClick={load}>刷新</Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: '接口行业', dataIndex: 'apiIndustry' },
          { title: '标准行业', dataIndex: 'standardIndustry' },
          { title: '状态', dataIndex: 'status' },
        ]}
      />
    </div>
  );
}
