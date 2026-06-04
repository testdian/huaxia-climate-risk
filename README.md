# 气候风险压测模块（可运行骨架）

技术栈：React + Ant Design + Java Spring Boot + MySQL

## 在线预览（HTML 完整版原型）

- **完整版**：https://testdian.github.io/huaxia-climate-risk/index-full.html
- **仓库**：https://github.com/testdian/huaxia-climate-risk

纯静态 Mock 数据，无需后端。由 GitHub Pages 自动部署 `frontend-html/`。

## UI 主色

- 主色采用「查询」按钮取样：`#34776B`
- 不使用设计规范中的 brand-1 `#00BF8F`
- 详见 `docs/UI设计规范-气候风险压测.md`

## 环境安装

本机需安装：**Java 17**、**Maven**、**Node.js**；MySQL 可用 Docker，也可用开发模式跳过。

详细步骤见：**[docs/环境安装指南-macOS.md](docs/环境安装指南-macOS.md)**

## 启动步骤

### 方式 A：开发模式（无需 Docker / MySQL，推荐先跑通）

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

### 方式 B：完整环境（Docker + MySQL）

```bash
cd climate-risk-stress-test
docker compose up -d
cd backend
mvn spring-boot:run
```

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

## 访问地址

| 服务 | 地址 |
|------|------|
| **前端页面** | http://localhost:5173 |
| **HTML 原型（完整版，无需后端）** | http://localhost:8765/index-full.html |
| **后端 API** | http://localhost:8080/api/tasks |
| H2 控制台（仅 dev） | http://localhost:8080/h2-console |

HTML 原型启动与链接说明见：**[frontend-html/本地预览链接.md](frontend-html/本地预览链接.md)**

## 功能说明（当前版本）

- 压测任务：新建、列表、详情（步骤条 + Tab）
- 数据同步：Mock 财务数据 + 行业映射 + 自动分流
- 数据处理：行业均值补算（代码占位逻辑）
- 场景压测：转型/物理/综合（代码实现占位公式，待业务文档确认）
- 结果分析：行业/分行维度汇总图表
- 基础配置：因子库、行业映射（只读列表）

## 待接入（未实现）

- 绿金系统统一登录/权限/日志（按约定由主系统承接）
- 财务/信贷/ECL 真实接口
- 场景计算方法配置界面（当前公式在 `StressCalculationService` 代码中）
