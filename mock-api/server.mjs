import http from 'http';
import { URL } from 'url';

let taskSeq = 1;
let recordSeq = 1;
let resultSeq = 1;

const tasks = [];
const records = new Map();
const results = new Map();

const industryMappings = [
  { id: 1, apiIndustry: '制造业-化工', standardIndustry: '化工', status: 'ENABLED' },
  { id: 2, apiIndustry: '制造业-钢铁', standardIndustry: '钢铁', status: 'ENABLED' },
  { id: 3, apiIndustry: '电力热力', standardIndustry: '电力', status: 'ENABLED' },
  { id: 4, apiIndustry: '交通运输', standardIndustry: '交通运输', status: 'ENABLED' },
];

const factors = [
  { id: 1, factorCode: 'TRANS_CHEM_01', factorName: '化工转型风险因子', industry: '化工', scenarioType: 'TRANSITION', factorValue: 0.12, unit: 'ratio', status: 'ENABLED' },
  { id: 2, factorCode: 'TRANS_PHYS_01', factorName: '电力物理风险因子', industry: '电力', scenarioType: 'PHYSICAL', factorValue: 0.08, unit: 'ratio', status: 'ENABLED' },
  { id: 3, factorCode: 'COMP_01', factorName: '综合风险因子', industry: null, scenarioType: 'COMPREHENSIVE', factorValue: 0.1, unit: 'ratio', status: 'ENABLED' },
];

const mapping = Object.fromEntries(industryMappings.map((m) => [m.apiIndustry, m.standardIndustry]));

function ok(data) {
  return JSON.stringify({ code: 0, message: 'success', data });
}

function fail(message) {
  return JSON.stringify({ code: -1, message, data: null });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function buildMockRecords(taskId) {
  const seeds = [
    ['C001', '华东化工有限公司', '上海分行', '制造业-化工', 120000, 'USABLE', '数据完整'],
    ['C002', '北方钢铁集团', '北京分行', '制造业-钢铁', 98000, 'USABLE', '数据完整'],
    ['C003', '华南电力股份', '广州分行', '电力热力', 150000, 'NEED_AVG', '关键指标缺失，需行业均值补算'],
    ['C004', '西南运输公司', '成都分行', '交通运输', 45000, 'USABLE', '数据完整'],
    ['C005', '未知行业企业', '深圳分行', '其他行业', 30000, 'ABNORMAL', '行业未映射'],
  ];
  return seeds.map((s) => {
    const std = mapping[s[3]] || null;
    return {
      id: recordSeq++,
      taskId,
      companyCode: s[0],
      companyName: s[1],
      branchName: s[2],
      apiIndustry: s[3],
      standardIndustry: std,
      dataAvailability: std ? s[5] : 'ABNORMAL',
      availabilityReason: std ? s[6] : '行业未映射',
      dataSource: s[5] === 'USABLE' ? 'API' : null,
      revenue: s[5] === 'NEED_AVG' ? null : s[4],
      confirmed: false,
      included: true,
    };
  });
}

function calcIndustryAvg(list) {
  const avg = {};
  list.filter((r) => r.revenue && r.standardIndustry).forEach((r) => {
    if (!avg[r.standardIndustry]) avg[r.standardIndustry] = { sum: 0, n: 0 };
    avg[r.standardIndustry].sum += r.revenue;
    avg[r.standardIndustry].n += 1;
  });
  Object.keys(avg).forEach((k) => {
    avg[k] = avg[k].sum / avg[k].n;
  });
  list.forEach((r) => {
    if (r.dataAvailability === 'NEED_AVG' && r.standardIndustry && avg[r.standardIndustry]) {
      r.revenue = avg[r.standardIndustry];
      r.dataAvailability = 'USABLE';
      r.dataSource = 'INDUSTRY_AVG';
      r.availabilityReason = '已使用行业均值补算';
      r.confirmed = true;
    }
  });
}

function runStress(taskId, scenarios) {
  const list = (records.get(taskId) || []).filter((r) => r.included && r.dataAvailability !== 'ABNORMAL');
  const scenarioNames = { TRANSITION: '转型风险', PHYSICAL: '物理风险', COMPREHENSIVE: '综合风险' };
  const factorMap = { TRANSITION: 0.12, PHYSICAL: 0.08, COMPREHENSIVE: 0.1 };
  const out = [];
  list.forEach((r) => {
    const revenue = r.revenue || 0;
    const eclBefore = revenue * 0.02;
    scenarios.forEach((sc) => {
      const impact = factorMap[sc] || 0.1;
      out.push({
        id: resultSeq++,
        taskId,
        companyCode: r.companyCode,
        companyName: r.companyName,
        branchName: r.branchName,
        standardIndustry: r.standardIndustry,
        scenarioCode: sc,
        scenarioName: scenarioNames[sc] || sc,
        metricRevenueBefore: revenue,
        metricRevenueAfter: Math.round(revenue * (1 - impact)),
        metricEclBefore: Math.round(eclBefore),
        metricEclAfter: Math.round(eclBefore * (1 + impact)),
        impactRate: impact,
      });
    });
  });
  results.set(taskId, out);
  return out;
}

function summary(taskId, dimension) {
  const list = results.get(taskId) || [];
  const grouped = {};
  list.forEach((r) => {
    const key = dimension === 'branch' ? r.branchName || '未知分行' : r.standardIndustry || '未知行业';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });
  return Object.entries(grouped).map(([name, arr]) => ({
    name,
    count: arr.length,
    impactRate: arr.reduce((s, x) => s + x.impactRate, 0) / arr.length,
  }));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost:8080');
  const path = url.pathname;
  const body = req.method === 'POST' ? await readBody(req) : {};

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (path === '/api/tasks' && req.method === 'GET') {
      res.end(ok(tasks));
      return;
    }
    if (path === '/api/tasks' && req.method === 'POST') {
      const t = {
        id: taskSeq++,
        taskCode: `CRST${Date.now()}`,
        taskName: body.taskName,
        reportPeriodStart: body.reportPeriodStart,
        reportPeriodEnd: body.reportPeriodEnd,
        dataCaliber: body.dataCaliber,
        description: body.description,
        status: 'DRAFT',
        createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };
      tasks.unshift(t);
      res.end(ok(t));
      return;
    }
    const taskMatch = path.match(/^\/api\/tasks\/(\d+)$/);
    if (taskMatch && req.method === 'GET') {
      const t = tasks.find((x) => x.id === Number(taskMatch[1]));
      if (!t) {
        res.writeHead(404);
        res.end(fail('任务不存在'));
        return;
      }
      res.end(ok(t));
      return;
    }
    const syncMatch = path.match(/^\/api\/tasks\/(\d+)\/sync$/);
    if (syncMatch && req.method === 'POST') {
      const id = Number(syncMatch[1]);
      const t = tasks.find((x) => x.id === id);
      if (t) {
        t.status = 'PENDING_CONFIRM';
        records.set(id, buildMockRecords(id));
      }
      res.end(ok(null));
      return;
    }
    const recordsMatch = path.match(/^\/api\/tasks\/(\d+)\/records$/);
    if (recordsMatch && req.method === 'GET') {
      res.end(ok(records.get(Number(recordsMatch[1])) || []));
      return;
    }
    const confirmMatch = path.match(/^\/api\/tasks\/(\d+)\/records\/confirm$/);
    if (confirmMatch && req.method === 'POST') {
      const id = Number(confirmMatch[1]);
      const list = records.get(id) || [];
      list.forEach((r) => {
        if (r.dataAvailability !== 'ABNORMAL') r.confirmed = true;
      });
      const t = tasks.find((x) => x.id === id);
      if (t) t.status = 'PROCESSING';
      res.end(ok(null));
      return;
    }
    const avgMatch = path.match(/^\/api\/tasks\/(\d+)\/calc-industry-avg$/);
    if (avgMatch && req.method === 'POST') {
      const id = Number(avgMatch[1]);
      const list = records.get(id) || [];
      calcIndustryAvg(list);
      const t = tasks.find((x) => x.id === id);
      if (t) t.status = 'READY_STRESS';
      res.end(ok(null));
      return;
    }
    const stressMatch = path.match(/^\/api\/tasks\/(\d+)\/stress$/);
    if (stressMatch && req.method === 'POST') {
      const id = Number(stressMatch[1]);
      const t = tasks.find((x) => x.id === id);
      if (t) t.status = 'COMPLETED';
      runStress(id, body.scenarios || ['TRANSITION']);
      res.end(ok(null));
      return;
    }
    const resultsMatch = path.match(/^\/api\/tasks\/(\d+)\/results$/);
    if (resultsMatch && req.method === 'GET') {
      res.end(ok(results.get(Number(resultsMatch[1])) || []));
      return;
    }
    const summaryMatch = path.match(/^\/api\/tasks\/(\d+)\/summary$/);
    if (summaryMatch && req.method === 'GET') {
      const dim = url.searchParams.get('dimension') || 'industry';
      res.end(ok(summary(Number(summaryMatch[1]), dim)));
      return;
    }
    if (path === '/api/config/industry-mappings') {
      res.end(ok(industryMappings));
      return;
    }
    if (path === '/api/config/factors') {
      res.end(ok(factors);
      return;
    }
    res.writeHead(404);
    res.end(fail('Not Found'));
  } catch (e) {
    res.writeHead(500);
    res.end(fail(e.message));
  }
});

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`Mock API running at http://localhost:${PORT}`);
});
