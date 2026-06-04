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
    await expect(page.locator('.sider-logo')).toContainText('气候风险压测');
    await expect(page.locator('#menu a[data-page="tasks"]')).toBeVisible();
    await expect(page.locator('.header')).toContainText('总行管理员');
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
    await page.fill('#d_start', '2025-01-01');
    await page.fill('#d_end', '2025-03-31');
    await page.selectOption('#d_caliber', '合并报表');
    await page.click('.task-flow-card .btn-primary');

    await expect(page.locator('#toast')).toContainText('任务已创建', { timeout: 3000 });
    await expect(page.locator('.breadcrumb')).toContainText(taskName);

    await page.click('.step-nav-item[data-step="1"]');
    await page.click('button:has-text("同步财务数据")');
    await expect(page.locator('#toast')).toContainText('同步完成', { timeout: 5000 });

    await page.click('button:has-text("下一步：确认清单")');
    await expect(page.locator('#toast')).toContainText('清单已确认', { timeout: 3000 });

    await page.click('button:has-text("计算行业平均值")');
    await expect(page.locator('#toast')).toContainText('填充', { timeout: 3000 });

    await page.click('button:has-text("填充数据到样本")');
    await expect(page.locator('#toast')).toContainText('场景压测', { timeout: 3000 });

    await page.click('button:has-text("下一步：进入场景压测")');
    await expect(page.locator('#toast')).toContainText('场景压测', { timeout: 3000 });

    await page.click('.step-nav-item[data-step="3"]');
    await page.click('button:has-text("调取信贷系统")');
    await expect(page.locator('#toast')).toContainText('信贷', { timeout: 3000 });
    await page.click('button:has-text("调取ECL系统")');
    await expect(page.locator('#toast')).toContainText('ECL', { timeout: 3000 });

    await page.click('button:has-text("执行压测")');
    await expect(page.locator('#toast')).toContainText('压测已完成', { timeout: 5000 });

    await page.click('.step-nav-item[data-step="4"]');
    await expect(page.locator('table tbody tr').first()).not.toContainText('暂无压测结果');

    await page.click('button:has-text("导出结果")');
    await page.click('#modalExport .btn-primary');
    await expect(page.locator('#toast')).toContainText('留痕', { timeout: 3000 });

    await page.click('#menu a[data-page="exports"]');
    await expect(page.locator('table tbody')).toContainText('Excel');
  });

  test('基础配置 CRUD 抽检', async ({ page }) => {
    await page.click('#menu a[data-page="factors"]');
    await page.click('button:has-text("新增因子")');
    await page.fill('#f_code', 'E2E_TEST_01');
    await page.fill('#f_name', 'E2E测试因子');
    await page.fill('#f_ind', '测试');
    await page.fill('#f_val', '0.05');
    await page.locator('#modalFactor .btn-primary').click();
    await expect(page.locator('#toast')).toContainText('新增', { timeout: 3000 });
    await expect(page.locator('table')).toContainText('E2E_TEST_01');

    await page.click('#menu a[data-page="scenarios"]');
    await expect(page.locator('table')).toContainText('转型风险');

    await page.click('#menu a[data-page="mappings"]');
    await page.click('button:has-text("新增映射")');
    await page.fill('#m_api', 'E2E-行业');
    await page.fill('#m_std', '测试行业');
    await page.locator('#modalMapping .btn-primary').click();
    await expect(page.locator('table')).toContainText('E2E-行业');
  });

  test('草稿任务可编辑删除', async ({ page }) => {
    const name = `草稿测试_${Date.now()}`;
    await page.click('button:has-text("新建任务")');
    await page.fill('#d_taskName', name);
    await page.fill('#d_start', '2024-01-01');
    await page.fill('#d_end', '2024-12-31');
    await page.click('.task-flow-card .btn-primary');
    await page.locator('.breadcrumb a').first().click();

    const row = page.locator(`table tbody tr:has-text("${name}")`);
    await expect(row.locator('button:has-text("编辑")')).toBeVisible();
    await row.locator('button:has-text("编辑")').click();
    await expect(page.locator('.step-panel-title:has-text("编辑任务")')).toBeVisible();
    await expect(page.locator('#d_taskName')).toHaveValue(name);
    await expect(row.locator('button:has-text("删除")')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await row.locator('button:has-text("删除")').click();
    await expect(page.locator('table tbody')).not.toContainText(name, { timeout: 3000 });
  });
});
