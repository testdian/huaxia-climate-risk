# 生产环境发布记录（HTML 完整版原型）

在线地址（GitHub Pages）：https://testdian.github.io/huaxia-climate-risk/index-full.html

仓库：https://github.com/testdian/huaxia-climate-risk

部署方式：推送 `main` 分支后，GitHub Actions 工作流 [deploy-pages.yml](../.github/workflows/deploy-pages.yml) 自动将 `frontend-html/` 发布到 Pages。

---

## 版本记录

### v1.0（2026-07-17）

- 菜单重构：数据处理 → 情景分析 → 财务传导 → PD/LGD → 不良拨备 → 结果分析
- 数据处理：贷款/财务/内部PD 分步同步、客户基础信息表、参试银行基础信息与资本指标
- 压测流水线：情景参数录入与碳费用预览、各步骤执行与结果分析
- 更新说明 v1.0 附需求说明书正文（`js/release-notes.js` 可编辑）

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
