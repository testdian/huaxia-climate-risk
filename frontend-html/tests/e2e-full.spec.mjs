/**
 * 完整版原型：全流程 E2E + UI Token 抽检
 * 运行: npx playwright test tests/e2e-full.spec.mjs --config=tests/playwright.config.mjs
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.CRST_BASE || 'http://localhost:8765';
const URL = `${BASE}/index-full.html`;

const SPEC = {
  primary: '#34776b',
  sidebarBg: '#1a3d37',
  pageBg: '#f8f9fa',
  textPrimary: '#142528',
  forbidden: ['#00bf8f', '#00BF8F'],
};

test.describe('气候风险压测完整版', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.CRST_APP !== 'undefined');
  });

  test('页面加载与菜单', async ({ page }) => {
    await expect(page.locator('.sider-logo')).toContainText('华夏银行绿金系统');
    await expect(page.locator('[data-nav-page="data-process"]')).toBeVisible();
    await expect(page.locator('[data-nav-page="stress-trans"]')).toBeVisible();
    await expect(page.locator('[data-nav-page="results"]')).toBeVisible();
    await expect(page.locator('.footer')).toBeVisible();
  });

  test('UI 设计规范 Token 抽检', async ({ page }) => {
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const primaryBtn = document.querySelector('.btn-primary');
      const sider = document.querySelector('.sider');
      const body = document.body;
      return {
        cssPrimary: cs.getPropertyValue('--primary').trim(),
        btnBg: primaryBtn ? getComputedStyle(primaryBtn).backgroundColor : '',
        siderBg: sider ? getComputedStyle(sider).backgroundColor : '',
        bodyBg: getComputedStyle(body).backgroundColor,
        bodyFont: getComputedStyle(body).fontFamily,
        btnMinWidth: primaryBtn ? getComputedStyle(primaryBtn).minWidth : '',
        btnRadius: primaryBtn ? getComputedStyle(primaryBtn).borderRadius : '',
      };
    });

    expect(tokens.cssPrimary).toBe('#34776b');
    expect(tokens.bodyFont.toLowerCase()).toMatch(/pingfang|microsoft yahei|roboto/);
    expect(parseInt(tokens.btnMinWidth, 10)).toBeGreaterThanOrEqual(70);

    const pageHtml = await page.content();
    SPEC.forbidden.forEach((c) => expect(pageHtml.toLowerCase()).not.toContain(c.toLowerCase()));
  });

  test('全流程：新建任务 → 同步 → 确认 → 均值 → 信贷ECL → 压测 → 导出', async ({ page }) => {
    const taskName = `E2E全流程_${Date.now()}`;

    await page.click('button:has-text("新建任务")');
    await page.waitForSelector('.task-flow-card');
    await page.fill('#d_taskName', taskName);
    await page.selectOption('#d_reportYear', '2026');
    await page.selectOption('#d_loanType', 'CORPORATE');
    await page.selectOption('#d_loanRegion', 'DOMESTIC');
    await page.click('.task-flow-card .btn-primary');

    await expect(page.locator('#toast')).toContainText('任务已创建', { timeout: 3000 });
    await expect(page.locator('.breadcrumb')).toContainText(taskName);

  await page.click('.module-subnav-btn:has-text("财务数据")');
    await page.click('button:has-text("同步贷款数据")');
    await page.waitForTimeout(1200);
    await page.click('button:has-text("同步格澜数据")');
    await page.waitForTimeout(1200);
    await page.click('button:has-text("同步财务数据")');
    await expect(page.locator('#toast')).toContainText('同步完成', { timeout: 5000 });

    const disambigBtn = page.locator('button:has-text("行业甄别确认")');
    if (await disambigBtn.isVisible()) {
      await disambigBtn.click();
      await page.locator('.disambig-note').first().fill('E2E甄别');
      await page.click('#modalIndustryDisambig .btn-primary');
      await expect(page.locator('#toast')).toContainText('甄别', { timeout: 3000 });
    }
    const deleteBtn = page.locator('table tbody button.btn-link:has-text("删除")');
    while (await deleteBtn.count() > 0) {
      await deleteBtn.first().click();
      await page.waitForTimeout(300);
    }
    if (await page.locator('button:has-text("导入处理结果")').isVisible()) {
      await page.click('button:has-text("导入处理结果")');
      await page.click('button:has-text("选择 Excel 文件")');
      await page.click('#modalDataProcessImport .btn-primary');
      await page.waitForTimeout(500);
    }

    await page.click('[data-nav-page="stress-trans"]');
    await page.click('button:has-text("新建压测任务")');
    await page.waitForTimeout(400);
    await page.click('#modalCreateStressJob .btn-primary');
    await expect(page.locator('#toast')).toContainText('压测', { timeout: 5000 });
    await page.click('button:has-text("执行压测")');
    await expect(page.locator('#toast')).toContainText('压测已完成', { timeout: 8000 });

    await page.click('[data-nav-page="results"]');
    await expect(page.locator('.kpi-row')).toBeVisible();

    await page.click('button:has-text("导出明细")');
    await page.click('#modalExportDetail .btn-primary');
    await expect(page.locator('#toast')).toContainText('留痕', { timeout: 3000 });

    await page.click('[data-nav-page="exports"]');
    await expect(page.locator('table tbody')).toContainText('Excel');
  });

  test('基础配置 CRUD 抽检', async ({ page }) => {
    await page.click('#menu a[data-page="factors"]');
    await page.click('button:has-text("新增因子")');
    await page.fill('#f_name', 'E2E测试因子');
    await page.selectOption('#f_ind', '化工');
    await page.fill('#f_val', '0.05');
    await page.locator('#modalFactor .btn-primary').click();
    await expect(page.locator('#toast')).toContainText('新增', { timeout: 3000 });
    await expect(page.locator('table')).toContainText('E2E测试因子');

    await page.click('#menu a[data-page="mappings"]');
    await page.click('button:has-text("新增映射")');
    await page.fill('#m_gb', 'C9999');
    await page.fill('#m_api', 'E2E-行业');
    await page.fill('#m_std', '测试行业');
    await page.fill('#m_test', 'E2E-测试类别');
    await page.locator('#modalMapping .btn-primary').click();
    await expect(page.locator('table')).toContainText('E2E-行业');
  });

  test('草稿任务可编辑删除', async ({ page }) => {
    const name = `草稿测试_${Date.now()}`;
    await page.click('button:has-text("新建任务")');
    await page.fill('#d_taskName', name);
    await page.selectOption('#d_reportYear', '2026');
    await page.selectOption('#d_loanType', 'CORPORATE');
    await page.selectOption('#d_loanRegion', 'DOMESTIC');
    await page.click('.task-flow-card .btn-primary');
    await page.locator('.breadcrumb a').first().click();
    await expect(page.locator('h2.page-title')).toContainText('数据处理任务');

    const row = page.locator(`table tbody tr:has-text("${name}")`);
    await row.locator('button:has-text("编辑")').click();
    await expect(page.locator('.module-subnav-btn.active')).toContainText('基本信息');
    await expect(page.locator('.step-panel-title:has-text("编辑任务")')).toBeVisible();
    await expect(page.locator('#d_reportYear')).toBeEnabled();
    await expect(page.locator('#d_taskName')).toHaveValue(name);

    await page.locator('.breadcrumb a').first().click();
    await expect(row.locator('button:has-text("删除")')).toBeVisible();
    await row.locator('button:has-text("删除")').click();
    await page.click('#modalConfirmDelete .btn-primary');
    await expect(page.locator('table tbody')).not.toContainText(name, { timeout: 3000 });
  });
});
