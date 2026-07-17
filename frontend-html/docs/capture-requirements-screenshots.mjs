/**
 * 抓取需求说明书截图
 * 运行: node docs/capture-requirements-screenshots.mjs
 */
import { chromium } from '../tests/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'requirements-screenshots');
const BASE = process.env.CRST_BASE || 'http://localhost:8765';
const URL = `${BASE}/index-full.html`;

fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  const target = opts.selector ? page.locator(opts.selector).first() : page.locator('#content');
  if (opts.selector) {
    await target.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(opts.wait ?? 600);
  if (opts.fullPage) {
    await page.screenshot({ path: file, fullPage: true });
  } else if (opts.selector) {
    await target.screenshot({ path: file });
  } else {
    await target.screenshot({ path: file });
  }
  console.log('saved', name);
}

async function nav(page, pageId, taskId, tab) {
  await page.evaluate(({ pageId, taskId, tab }) => {
    window.CRST_APP.navigate(pageId, taskId, tab);
  }, { pageId, taskId, tab });
  await page.waitForTimeout(500);
}

async function enableHiddenMenus(page) {
  await page.evaluate(() => {
    const vis = window.CRST_APP?.getMenuVisibility?.() || {};
    vis['calc-doc'] = true;
    localStorage.setItem('crst-menu-visibility', JSON.stringify({ ...vis, 'menu-perms': true }));
    window.CRST_APP.applyMenuVisibility?.(vis);
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.CRST_APP !== 'undefined');
  await enableHiddenMenus(page);

  // 数据处理
  await nav(page, 'data-process');
  await shot(page, '01-data-process-list');

  await page.click('button:has-text("新建任务")');
  await page.waitForSelector('.task-flow-card');
  await shot(page, '02-data-process-create');

  await page.evaluate(() => window.CRST_APP.backToDataProcessList());
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    window.CRST_APP.viewTaskInModule(1);
  });
  await page.waitForSelector('.customer-basic-info-section, .sync-summary-text');
  await shot(page, '03-data-process-financial-sync');

  await page.evaluate(() => {
    window.CRST_APP.navigate('data-process', 1, 1);
  });
  await page.waitForTimeout(500);
  await shot(page, '04-data-process-customer-table', { selector: '.customer-basic-info-section' });

  const bankBasic = page.locator('.bank-basic-info-section');
  if (await bankBasic.count()) {
    await shot(page, '05-data-process-bank-basic', { selector: '.bank-basic-info-section' });
  }
  const bankCapital = page.locator('.bank-capital-metrics-section');
  if (await bankCapital.count()) {
    await shot(page, '06-data-process-bank-capital', { selector: '.bank-capital-metrics-section' });
  }

  const internalPd = page.locator('.internal-pd-section');
  if (await internalPd.count()) {
    await shot(page, '07-data-process-internal-pd', { selector: '.internal-pd-section' });
  }

  // 情景分析
  await nav(page, 'scenario-analysis');
  await shot(page, '08-scenario-analysis-list');

  await page.evaluate(() => window.CRST_APP.openStressJob(101, 'scenario-analysis'));
  await page.waitForSelector('.stress-param-card, .step-panel');
  await page.waitForTimeout(800);
  await shot(page, '09-scenario-analysis-params', { selector: '.stress-param-layout' });

  // 财务传导
  await page.evaluate(() => window.CRST_APP.setStressJobStep(1));
  await page.waitForTimeout(600);
  await nav(page, 'stress-fin-trans', 101, 1);
  await page.waitForTimeout(800);
  await shot(page, '10-stress-fin-trans');

  // PD/LGD
  await nav(page, 'stress-pd-lgd', 101, 2);
  await page.waitForTimeout(800);
  await shot(page, '11-stress-pd-lgd');

  // 不良和拨备
  await nav(page, 'stress-npl-prov', 101, 3);
  await page.waitForTimeout(800);
  await shot(page, '12-stress-npl-prov');

  // 压测结果分析
  await nav(page, 'results');
  await page.waitForSelector('.analysis-panel, .page-title');
  await shot(page, '13-results-analysis');

  // 导出记录
  await nav(page, 'exports');
  await shot(page, '14-exports');

  // 基础配置
  await nav(page, 'factors');
  await shot(page, '15-factors');

  await page.click('button:has-text("新增因子")');
  await page.waitForSelector('#modalFactor');
  await shot(page, '16-factor-modal', { selector: '#modalFactor .modal' });
  await page.evaluate(() => window.CRST_APP.hideModal());

  await nav(page, 'mappings');
  await shot(page, '17-mappings');

  await nav(page, 'airport-throughput');
  await shot(page, '18-airport-throughput');

  await nav(page, 'calc-doc');
  await page.waitForTimeout(400);
  await shot(page, '19-calc-doc');

  // 菜单权限
  await nav(page, 'menu-perms');
  await shot(page, '20-menu-perms');

  await browser.close();
  console.log('All screenshots saved to', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
