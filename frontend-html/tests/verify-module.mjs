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

async function isModalOpen(page, id) {
  return page.locator(`#${id}`).evaluate((el) => el.classList.contains('show'));
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
    ['tasks', '压测任务'],
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
    if (title.includes(hint) || (p === 'factors' && title.includes('因子')) || (p === 'mappings' && title.includes('映射'))) {
      pass(`菜单「${p}」可打开`);
    } else {
      fail(`菜单「${p}」标题异常：${title.trim()}`);
    }
  }

  const scenariosHidden = await page.locator('#menu a[data-page="scenarios"]').evaluate(
    (el) => el.closest('li').style.display === 'none'
  );
  if (scenariosHidden) pass('「场景计算方法配置」默认隐藏');
  else fail('「场景计算方法配置」应默认隐藏');

  await page.click('#menu a[data-page="tasks"]');
  await page.locator('table tbody tr').first().locator('button:has-text("查看")').click();
  await page.waitForSelector('.step-nav-item');
  const stepCount = await page.locator('.step-nav-item').count();
  if (stepCount === 6) pass('任务详情为 6 步流程');
  else fail(`步骤条应为 6 步，实际 ${stepCount}`);

  await page.click('.step-nav-item[data-step="4"]');
  if (await page.locator('button:has-text("导出明细")').isVisible()) pass('压测结果步可导出明细');
  else fail('压测结果步缺少导出明细');

  await page.click('button:has-text("下一步：应用报送")');
  await page.waitForTimeout(300);
  if ((await page.locator('.step-panel-title').textContent())?.includes('应用报送')) pass('可进入应用报送');
  else fail('无法进入应用报送');

  if (await page.locator('button:has-text("下发风险预警")').isEnabled()) pass('已完成任务可下发风险预警');
  else fail('已完成任务下发风险预警被禁用');

  await page.click('#menu a[data-page="exports"]');
  const b1 = await page.locator('.export-filter-bar .filter-actions button').nth(0).boundingBox();
  const b2 = await page.locator('.export-filter-bar .filter-actions button').nth(1).boundingBox();
  if (b1 && b2 && Math.abs(b1.y - b2.y) < 5) pass('导出记录筛选按钮同一行');
  else fail('导出记录筛选按钮未同一行');

  await page.click('#menu a[data-page="tasks"]');
  const taskName = `验证_${Date.now()}`;
  await page.click('button:has-text("新建任务")');
  await page.fill('#d_taskName', taskName);
  await page.fill('#d_start', '2025-01-01');
  await page.fill('#d_end', '2025-03-31');
  await page.selectOption('#d_caliber', '合并报表');
  await page.click('.task-flow-card .btn-primary');
  await waitToast(page, '创建');

  await page.click('.step-nav-item[data-step="1"]');
  await page.click('button:has-text("同步财务数据")');
  await waitToast(page, '财务数据同步完成', 8000);
  const abnormalDelete = page.locator('table tbody button.btn-link:has-text("删除")');
  if (await abnormalDelete.count() > 0) {
    await abnormalDelete.first().click();
    await waitToast(page, '清理');
    pass('同步后删除无法处理企业后可继续');
  }
  await page.locator('button:has-text("下一步：确认清单")').waitFor({ state: 'visible', timeout: 5000 });
  await page.click('button:has-text("下一步：确认清单")');
  await waitToast(page, '清单');
  await page.click('button:has-text("计算行业平均值")');
  await waitToast(page, '填充');
  await page.click('button:has-text("填充数据到样本")');
  await waitToast(page, '场景压测');
  await page.click('button:has-text("下一步：进入场景压测")');
  await waitToast(page, '场景压测');
  await page.click('button:has-text("调取信贷系统")');
  await waitToast(page, '信贷');
  await page.click('button:has-text("调取ECL系统")');
  await waitToast(page, 'ECL');
  await page.click('button:has-text("重新执行压测")');
  await waitToast(page, '完成', 8000);
  pass('新建任务全流程至压测完成');

  await page.click('.step-nav-item[data-step="4"]');
  const detailRows = await page.locator('.result-section table tbody tr').count();
  if (detailRows > 0) pass(`压测结果页有数据（${detailRows} 行）`);
  else fail('压测完成后结果页无数据');

  await page.click('button:has-text("导出明细")');
  await page.waitForFunction(() => {
    const el = document.getElementById('modalExportDetail');
    return el && el.classList.contains('show');
  }, { timeout: 3000 });
  await page.click('#modalExportDetail .btn-primary');
  await waitToast(page, '导出');
  pass('导出明细弹窗与留痕正常');

  await page.click('button:has-text("下一步：应用报送")');
  await page.click('button:has-text("生成监管报送 Excel")');
  await waitToast(page, '监管报送');
  pass('应用报送生成监管 Excel');

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
