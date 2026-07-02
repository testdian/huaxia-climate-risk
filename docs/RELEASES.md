# 生产环境发布记录（HTML 完整版原型）

在线地址（GitHub Pages）：https://testdian.github.io/huaxia-climate-risk/index-full.html

仓库：https://github.com/testdian/huaxia-climate-risk

部署方式：推送 `main` 分支后，GitHub Actions 工作流 [deploy-pages.yml](../.github/workflows/deploy-pages.yml) 自动将 `frontend-html/` 发布到 Pages。

---

## v2.0.0（当前）

- **Git 标签**：`v2.0`
- **版本文件**：`frontend-html/VERSION` → `2.0.0`
- **主要变更**：
  - 压测结果分析：监管汇总表、违约判定条件、违约客户监控（柱状图 + 明细表）
  - 一键下发预警 / 导出违约客户监控 Excel
  - 应用报送改为弹窗（外部监管报送）；移除独立「应用报送」菜单
  - 数据处理：客户基础信息表状态列、一键处理、两张基础信息表流程
  - 移除场景计算方法配置菜单、压测结果口径筛选、部分冗余图表与导出汇总
  - 风险预警弹窗改为纯文本预览

## v1.0.0（回滚基线）

- **Git 标签**：`v1.0`
- **对应提交**：`4af1bc9` — *同步完整版原型至生产：独立应用报送、结果分析精简与导出增强。*
- **说明**：v2.0 发布前的生产基线，可用于回滚对照。

---

## 回滚到 v1.0

在仓库根目录执行（需有 `main` 推送权限）：

```bash
# 方式一：仅回滚 frontend-html 目录（推荐，保留 main 上其他提交）
git fetch origin --tags
git checkout v1.0 -- frontend-html
git commit -m "rollback: 生产 frontend-html 回退至 v1.0"
git push origin main
```

```bash
# 方式二：将整个 main 指回 v1.0 提交（慎用，会丢失其后所有提交）
git fetch origin --tags
git checkout main
git reset --hard v1.0
git push origin main --force
```

回滚后 Actions 会自动重新部署；约 1～3 分钟生效。

## 回滚到 v2.0

若将来在更高版本上需要回到 v2.0：

```bash
git fetch origin --tags
git checkout v2.0 -- frontend-html
git commit -m "rollback: 生产 frontend-html 回退至 v2.0"
git push origin main
```

## 查看版本与标签

```bash
git tag -l 'v*'
git show v2.0 --stat
cat frontend-html/VERSION
```
