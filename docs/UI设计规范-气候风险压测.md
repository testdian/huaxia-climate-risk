# UI 设计规范（气候风险压测模块）

基于你提供的碳云 Design System 截图整理，**主色已按「查询」按钮绿色覆盖**。

## 主色约定

| 用途 | 色值 | 说明 |
|------|------|------|
| 主色 Primary | `#34776B` | 查询按钮取样，用于主按钮、聚焦边框、步骤条、分页当前页等 |
| 主色 Hover | `#4A867B` | 悬停 |
| 主色 Active | `#2D665C` | 按下 |
| 主色浅底 | `#E8F3F1` | 选中行、分页底色等 |

**不使用**：规范中的 brand-1 `#00BF8F`、步骤条/输入框示意图中的青绿色。

## 中性色（来自 Colors 规范）

- 主文字 `#142528`
- 次文字 `#6C757D`
- 禁用 `#ADB5BD`
- 占位 `#CED4DA`
- 边框 `#DEE2E6` / `#E9ECEF`
- 页面底 `#F8F9FA`，内容区 `#FFFFFF`

## 布局（Layout / Grid）

- 侧栏 + 顶栏 + 内容区 + 底栏
- 基准宽度 1440px，大屏 1920px，最小 1280px
- 内容区 12 栅格，间距基准 16px，最小步进 4px

## 组件要点

- **Button**：主按钮实心主色；次按钮描边；圆角 S=4px / L=8px；最小宽 70px；左右内边距 16px
- **Input**：聚焦边框主色；错误红 `#C0392B`
- **Menu**：深色侧栏 `#1A3D37`，选中项背景 `#34776B`
- **Tabs**：线条式用于页级；按钮式用于模块内
- **Steps**：完成/进行中使用主色 `#34776B`
- **Breadcrumb**：分隔符 `/`，可点击父级悬停主色
- **Pagination**：当前页主色文字 + 浅绿底

## 字体（Typography）

- 中文：PingFang SC、Microsoft YaHei
- 英文/数字：Roboto、Arial、Helvetica Neue

## 代码位置

- Token：`frontend/src/theme/tokens.ts`
- Ant Design 主题：`frontend/src/theme/antdTheme.ts`
