/**
 * 独立 E2E 脚本（无需本地安装 @playwright/test）
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const BASE = process.env.CRST_BASE || 'http://localhost:8765';
const URL = `${BASE}/index-full.html`;

const results = { pass: [], fail: [], warn: [] };

function ok(name) { results.pass.push(name); console.log(`  ✓ ${name}`); }
function fail(name, msg) { results.fail.push({ name, msg }); console.log(`  ✗ ${name}: ${msg}`); }
function warn(name, msg) { results.warn.push({ name, msg }); console.log(`  ⚠ ${name}: ${msg}`); }

async function waitToast(page, text, timeout = 5000) {
  await page.waitForTimeout(400);
  const toast = page.locator('#toast');
  await expectToastText(page, text, timeout);
}

async function expectToastText(page, text, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const t = (await page.locator('#toast').textContent()) || '';
    if (page.locator('#toast').isVisible() && t.includes(text)) return;
    await page.waitForTimeout(150);
  }
  const last = await page.locator('#toast').textContent();
  throw new Error(`toast 期望含「${text}」，实际「${last}」`);
}

async function main() {
  console.log('\n=== 气候风险压测 完整版 E2E ===\n');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('无法启动 Chromium，请先运行: npx playwright install chromium');
    process.exit(2);
  }

  const page = await browser.newPage();
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForFunction(() => typeof window.CRST_APP !== 'undefined', { timeout: 10000 });
    ok('页面加载 & CRST_APP 初始化');

    // UI 规范抽检
    const ui = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const btn = document.querySelector('.btn-primary');
      const sider = document.querySelector('.sider');
      return {
        primary: cs.getPropertyValue('--primary').trim(),
        font: getComputedStyle(document.body).fontFamily,
        btnMinW: btn ? getComputedStyle(btn).minWidth : '0',
        btnRadius: btn ? getComputedStyle(btn).borderRadius : '',
        siderBg: sider ? getComputedStyle(sider).backgroundColor : '',
        hasFooter: !!document.querySelector('.footer'),
        sidebarW: sider ? getComputedStyle(sider).width : '',
      };
    });
    if (ui.primary === '#34776b') ok('CSS 主色 --primary = #34776B');
    else fail('主色 Token', ui.primary);
    if (/pingfang|microsoft yahei/i.test(ui.font)) ok('字体族含 PingFang/YaHei');
    else warn('字体', ui.font);
    if (parseInt(ui.btnMinW, 10) >= 70) ok('主按钮 min-width ≥ 70px');
    else warn('主按钮宽度', ui.btnMinW);
    if (ui.hasFooter) ok('底栏存在');
    else warn('布局', '缺少 footer 底栏');
    if (ui.sidebarW === '220px') ok('侧栏宽度 220px');
    else warn('侧栏宽度', ui.sidebarW);

    const html = await page.content();
    if (!/00bf8f/i.test(html)) ok('未使用禁用色 #00BF8F');
    else fail('禁用色', '页面含 #00BF8F');

    // 全流程
    const taskName = `E2E_${Date.now()}`;
    await page.click('button:has-text("新建任务")');
    await page.waitForSelector('.task-flow-card');
    await page.fill('#d_taskName', taskName);
    await page.selectOption('#d_reportYear', '2026');
    await page.selectOption('#d_loanType', 'CORPORATE');
    await page.selectOption('#d_loanRegion', 'DOMESTIC');
    await page.click('.task-flow-card .btn-primary');
    await expectToastText(page, '创建');
    ok('新建任务');
    await page.waitForTimeout(500);

    await page.click('.module-subnav-btn:has-text("财务数据")');
    await page.click('button:has-text("同步贷款数据")');
    await expectToastText(page, '贷款数据', 10000);
    await page.click('button:has-text("同步财务数据")');
    await expectToastText(page, '同步', 10000);
    ok('开始同步 → 待确认');

    const onDetail = await page.locator('.breadcrumb').isVisible();
    if (!onDetail) {
      await page.locator(`table tbody tr:has-text("${taskName}") button:has-text("查看")`).click();
    }
    await page.click('.step-nav-item[data-step="1"]');
    const excludeBtn = page.locator('button:has-text("删除")');
    if (await excludeBtn.count() > 0) {
      await excludeBtn.first().click();
      await expectToastText(page, '删除');
      ok('删除无法处理公司（行业未映射）');
    }
    if (await page.locator('button:has-text("导入处理结果")').isVisible()) {
      await page.click('button:has-text("导入处理结果")');
      await page.click('button:has-text("选择 Excel 文件")');
      await page.click('#modalDataProcessImport .btn-primary');
      await waitToast(page, '导入', 5000);
      ok('导入处理结果');
    }
    if (await page.locator('.bank-basic-info-section').isVisible()) ok('参试银行基础信息表已展示');

    await page.click('[data-nav-page="stress-trans"]');
    await page.click('button:has-text("新建压测任务")');
    await page.click('#modalCreateStressJob .btn-primary');
    await waitToast(page, '压测', 8000);
    await page.click('button:has-text("执行压测")');
    await waitToast(page, '完成', 8000);
    ok('执行压测 → 已完成');

    await page.click('.step-nav-item[data-step="4"]');
    const resultRows = await page.locator('.tab-panel.active table tbody tr').count();
    if (resultRows > 0) ok(`压测结果 ${resultRows} 行`);
    else fail('压测结果', '无数据行');

    await page.click('button:has-text("导出结果")');
    await page.click('#modalExport .btn-primary');
    await waitToast(page, '留痕');
    ok('导出并留痕');

    await page.click('#menu a[data-page="exports"]');
    const exportText = await page.locator('table tbody').textContent();
    if (exportText.includes('Excel')) ok('导出记录页有记录');
    else fail('导出记录', '未找到记录');

    // 配置页导航
    for (const p of ['factors', 'mappings', 'results']) {
      await page.click(`#menu a[data-page="${p}"]`);
      await page.waitForTimeout(200);
      ok(`菜单切换: ${p}`);
    }

  } catch (e) {
    fail('E2E 异常', e.message);
    await page.screenshot({ path: join(__dirname, 'e2e-failure.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log('\n--- 汇总 ---');
  console.log(`通过: ${results.pass.length}`);
  console.log(`警告: ${results.warn.length}`);
  console.log(`失败: ${results.fail.length}`);
  if (results.warn.length) results.warn.forEach((w) => console.log(`  ⚠ ${w.name}: ${w.msg}`));
  if (results.fail.length) {
    results.fail.forEach((f) => console.log(`  ✗ ${f.name}: ${f.msg}`));
    process.exit(1);
  }
  console.log('\n全部关键流程通过。\n');
}

main();
