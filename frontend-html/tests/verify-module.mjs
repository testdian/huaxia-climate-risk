/**
 * 气候风险压测模块 — 综合验证（Playwright）
 */
import { chromium } from 'playwright';

const BASE = process.env.CRST_BASE || 'http://localhost:8766';
const URL = `${BASE}/index-full.html`;
const issues = [];
const ok = [];

function pass(msg) { ok.push(msg); }
function fail(msg) { issues.push(msg); }

async function waitToast(page, text, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const t = (await page.locator('#toast').textContent().catch(() => '')) || '';
    if (await page.locator('#toast').isVisible() && t.includes(text)) return t;
    await page.waitForTimeout(150);
  }
  throw new Error(`toast 未出现「${text}」，最后内容：${await page.locator('#toast').textContent()}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(e.message));

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForFunction(() => typeof window.CRST_APP !== 'undefined');
  pass('页面加载与 CRST_APP 初始化');

  const pages = [
    ['data-process', '数据处理'],
    ['stress-trans', '压测方法1'],
    ['results', '压测结果分析'],
    ['exports', '导出记录'],
    ['factors', '因子'],
    ['mappings', '映射'],
    ['airport-throughput', '机场吞吐量'],
    ['menu-perms', '菜单权限'],
  ];
  for (const [p, hint] of pages) {
    const link = page.locator(`#menu a[data-page="${p}"], [data-nav-page="${p}"]`).first();
    await link.click();
    await page.waitForTimeout(250);
    const title = (await page.locator('.page-title').first().textContent()) || '';
    if (title.includes(hint) || (p === 'factors' && title.includes('因子')) || (p === 'mappings' && title.includes('映射')) || (p === 'data-process' && title.includes('数据处理'))) {
      pass(`菜单「${p}」可打开`);
    } else {
      fail(`菜单「${p}」标题异常：${title.trim()}`);
    }
  }

  const scenariosMenuCount = await page.locator('#menu a[data-page="scenarios"]').count();
  if (scenariosMenuCount === 0) pass('「场景计算方法配置」菜单已移除');
  else fail('「场景计算方法配置」菜单应已移除');

  const appReportMenuCount = await page.locator('[data-nav-page="app-report"]').count();
  if (appReportMenuCount === 0) pass('「应用报送」独立菜单已移除');
  else fail('「应用报送」独立菜单应已移除');

  await page.click('[data-nav-page="data-process"]');
  const subnavCount = await page.locator('.module-subnav-btn').count();
  if (subnavCount === 4) pass('数据处理模块为 4 个子 Tab');
  else fail(`数据处理子 Tab 应为 4 个，实际 ${subnavCount}`);

  await page.locator('table tbody tr').first().locator('button:has-text("处理")').click();
  await page.waitForTimeout(400);
  if (await page.locator('.page-title:has-text("压测结果分析")').isVisible()) {
    pass('已完成任务「处理」进入压测结果分析');
  } else {
    fail('已完成任务处理入口未进入结果分析');
  }

  if (await page.locator('button:has-text("导出明细")').isVisible()) pass('结果分析页可导出明细');
  else fail('结果分析页缺少导出明细');

  if (await page.locator('button:has-text("应用报送")').isVisible()) pass('结果分析页可打开应用报送');
  else fail('结果分析页缺少应用报送入口');

  await page.click('button:has-text("应用报送")');
  await page.waitForTimeout(300);
  const regulatoryModal = page.locator('#modalRegulatoryReport');
  if (await regulatoryModal.evaluate((el) => el.classList.contains('show'))) {
    pass('应用报送打开外部监管报送弹窗');
  } else {
    fail('应用报送未打开监管报送弹窗');
  }
  await page.click('#modalRegulatoryReport button:has-text("关闭")');
  await page.waitForTimeout(200);

  if (await page.locator('button:has-text("一键下发预警")').isVisible()) pass('结果分析页可一键下发预警');
  else fail('结果分析页缺少一键下发预警');

  await page.click('[data-nav-page="exports"]');
  const b1 = await page.locator('.export-filter-bar .filter-actions button').nth(0).boundingBox();
  const b2 = await page.locator('.export-filter-bar .filter-actions button').nth(1).boundingBox();
  if (b1 && b2 && Math.abs(b1.y - b2.y) < 5) pass('导出记录筛选按钮同一行');
  else fail('导出记录筛选按钮未同一行');

  await page.click('[data-nav-page="data-process"]');
  const taskName = `验证_${Date.now()}`;
  await page.click('button:has-text("新建任务")');
  await page.fill('#d_taskName', taskName);
  await page.selectOption('#d_reportYear', '2026');
  await page.selectOption('#d_loanType', 'CORPORATE');
  await page.selectOption('#d_loanRegion', 'DOMESTIC');
  await page.click('.task-flow-card .btn-primary');
  await waitToast(page, '创建');

  await page.click('.module-subnav-btn:has-text("财务数据")');
  await page.click('button:has-text("同步贷款数据")');
  await waitToast(page, '贷款数据', 8000);
  await page.click('button:has-text("同步财务数据")');
  await waitToast(page, '同步完成', 8000);
  const disambigBtn = page.locator('button:has-text("行业甄别确认")');
  if (await disambigBtn.isVisible()) {
    await disambigBtn.click();
    await page.waitForFunction(() => document.getElementById('modalIndustryDisambig')?.classList.contains('show'));
    const notes = page.locator('.disambig-note');
    const noteCount = await notes.count();
    for (let i = 0; i < noteCount; i += 1) {
      await notes.nth(i).fill('验证脚本甄别依据');
    }
    await page.click('#modalIndustryDisambig .btn-primary');
    await waitToast(page, '甄别');
    pass('行业歧义甄别后可继续');
  }
  const abnormalDelete = page.locator('table tbody button.btn-link:has-text("删除")');
  if (await abnormalDelete.count() > 0) {
    await abnormalDelete.first().click();
    await waitToast(page, '清理');
    pass('同步后删除无法处理企业后可继续');
  }
  if (await page.locator('button:has-text("导入处理结果")').isVisible()) {
    await page.click('button:has-text("导入处理结果")');
    await page.click('button:has-text("选择 Excel 文件")');
    await page.click('#modalDataProcessImport .btn-primary');
    await waitToast(page, '导入', 5000);
    pass('导入处理结果');
  }
  const completeModal = page.locator('#modalDataProcessComplete');
  if (await completeModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.click('#modalDataProcessComplete .btn-primary');
    pass('数据处理完成弹窗');
  }
  if (await page.locator('.bank-basic-info-section').isVisible()) pass('参试银行基础信息表已展示');
  else fail('缺少参试银行基础信息表');

  await page.click('[data-nav-page="stress-trans"]');
  await page.click('button:has-text("新建压测任务")');
  await page.waitForTimeout(500);
  await page.click('#modalCreateStressJob .btn-primary');
  await waitToast(page, '压测', 5000);
  await page.click('button:has-text("执行压测")');
  await waitToast(page, '完成', 8000);
  pass('新建压测任务并执行压测');

  if (await page.locator('.analysis-panel--default-monitor').isVisible()) pass('压测完成后进入结果分析页');
  else fail('压测完成后未进入结果分析页');

  await page.click('button:has-text("导出明细")');
  await page.waitForFunction(() => {
    const el = document.getElementById('modalExportDetail');
    return el && el.classList.contains('show');
  }, { timeout: 3000 });
  await page.click('#modalExportDetail .btn-primary');
  await waitToast(page, '导出');
  pass('导出明细弹窗与留痕正常');

  await page.click('button:has-text("应用报送")');
  await page.waitForTimeout(300);
  await page.click('#modalRegulatoryReport button:has-text("生成监管报送 Excel")');
  await waitToast(page, '监管报送');
  pass('应用报送生成监管 Excel');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);

  await page.click('#menu a[data-page="airport-throughput"]');
  if (await page.locator('table tbody').textContent().then((t) => t.includes('华南机场'))) {
    pass('机场吞吐量维护页有 Mock 数据');
  } else {
    fail('机场吞吐量维护页缺少 Mock 数据');
  }

  if (!jsErrors.length) pass('全程无 JS 运行时错误');
  else fail(`JS 运行时错误：${jsErrors.join(' | ')}`);
} catch (e) {
  fail(`验证中断：${e.message}`);
} finally {
  await browser.close();
}

console.log('\n=== 气候风险压测模块验证 ===\n');
ok.forEach((m) => console.log('  ✓', m));
if (issues.length) {
  console.log('\n问题：');
  issues.forEach((m) => console.log('  ✗', m));
  process.exit(1);
}
console.log(`\n共 ${ok.length} 项通过，未发现阻塞性问题。\n`);
