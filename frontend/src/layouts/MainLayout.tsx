import { Layout, Menu, Typography } from 'antd';
import {
  ApartmentOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { tokens } from '../theme/tokens';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/tasks', icon: <ExperimentOutlined />, label: '压测任务管理' },
  { key: '/results', icon: <BarChartOutlined />, label: '压测结果分析' },
  {
    key: 'config',
    icon: <DatabaseOutlined />,
    label: '基础配置',
    children: [
      { key: '/config/factors', icon: <PartitionOutlined />, label: '因子库管理' },
      { key: '/config/industry-mapping', icon: <ApartmentOutlined />, label: '行业映射关系' },
    ],
  },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const selected = location.pathname.startsWith('/config')
    ? location.pathname
    : location.pathname.startsWith('/results')
      ? '/results'
      : '/tasks';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={tokens.layout.sidebarWidth} theme="dark">
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          气候风险压测
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          defaultOpenKeys={['config']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            borderBottom: `1px solid ${tokens.color.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: tokens.layout.headerHeight,
          }}
        >
          <Typography.Text type="secondary">气候风险压测系统</Typography.Text>
          <Typography.Text>总行管理员</Typography.Text>
        </Header>
        <Content style={{ margin: 16, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
