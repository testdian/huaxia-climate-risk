const STATUS_MAP = {
  DRAFT: { text: '草稿', cls: 'tag-default' },
  SYNCING: { text: '数据同步中', cls: 'tag-processing' },
  PENDING_CONFIRM: { text: '待确认', cls: 'tag-warning' },
  PROCESSING: { text: '数据处理中', cls: 'tag-processing' },
  READY_STRESS: { text: '待压测', cls: 'tag-processing' },
  STRESSING: { text: '压测中', cls: 'tag-processing' },
  COMPLETED: { text: '已完成', cls: 'tag-success' },
  ARCHIVED: { text: '已归档', cls: 'tag-default' },
};

const AVAIL_MAP = {
  USABLE: { text: '可直接使用', cls: 'tag-success' },
  NEED_AVG: { text: '需行业均值', cls: 'tag-warning' },
  ABNORMAL: { text: '异常/无法处理', cls: 'tag-error' },
};

const SCENARIO_OPTIONS = [
  { code: 'TRANSITION', name: '转型风险', factorKey: '转型风险' },
  { code: 'PHYSICAL', name: '物理风险', factorKey: '物理风险' },
  { code: 'COMPREHENSIVE', name: '综合风险', factorKey: '综合风险' },
];

let tasks = [
  {
    id: 1,
    taskCode: 'CRST20250604001',
    taskName: '2025年一季度气候风险压测',
    reportYear: 2025,
    loanType: 'CORPORATE',
    loanRegion: 'DOMESTIC',
    description: '季度例行压测',
    status: 'COMPLETED',
    createdAt: '2025-06-04 10:00:00',
  },
  {
    id: 2,
    taskCode: 'CRST20250604002',
    taskName: '高耗能行业专项压测',
    reportYear: 2024,
    loanType: 'CORPORATE',
    loanRegion: 'DOMESTIC',
    description: '高耗能行业专项',
    status: 'PENDING_CONFIRM',
    createdAt: '2025-06-04 11:20:00',
  },
];

let recordsByTask = {
  1: [
    { id: 1, companyName: '华东化工有限公司', branchName: '上海分行', apiIndustry: '制造业-化工', standardIndustry: '化工', dataAvailability: 'USABLE', availabilityReason: '数据完整' },
    { id: 2, companyName: '北方钢铁集团', branchName: '北京分行', apiIndustry: '制造业-钢铁', standardIndustry: '钢铁', dataAvailability: 'USABLE', availabilityReason: '数据完整' },
    { id: 3, companyName: '华南电力股份', branchName: '广州分行', apiIndustry: '电力热力', standardIndustry: '电力', dataAvailability: 'NEED_AVG', availabilityReason: '关键指标缺失，需行业均值补算' },
  ],
  2: [
    { id: 4, companyName: '西南运输公司', branchName: '成都分行', apiIndustry: '交通运输', standardIndustry: '交通运输', dataAvailability: 'USABLE', availabilityReason: '数据完整' },
    { id: 5, companyName: '未知行业企业', branchName: '深圳分行', apiIndustry: '其他行业', standardIndustry: '', dataAvailability: 'ABNORMAL', availabilityReason: '行业未映射' },
  ],
};

let resultsByTask = {
  1: [
    { companyName: '华东化工有限公司', branchName: '上海分行', standardIndustry: '化工', scenarioName: '转型风险', metricRevenueBefore: 120000, metricRevenueAfter: 105600, metricEclBefore: 2400, metricEclAfter: 2688, impactRate: 0.12 },
    { companyName: '北方钢铁集团', branchName: '北京分行', standardIndustry: '钢铁', scenarioName: '转型风险', metricRevenueBefore: 98000, metricRevenueAfter: 83300, metricEclBefore: 1960, metricEclAfter: 2254, impactRate: 0.15 },
    { companyName: '华南电力股份', branchName: '广州分行', standardIndustry: '电力', scenarioName: '物理风险', metricRevenueBefore: 150000, metricRevenueAfter: 138000, metricEclBefore: 3000, metricEclAfter: 3240, impactRate: 0.08 },
  ],
};

const industryMappings = [
  { apiIndustry: '制造业-化工', standardIndustry: '化工', status: 'ENABLED' },
  { apiIndustry: '制造业-钢铁', standardIndustry: '钢铁', status: 'ENABLED' },
  { apiIndustry: '电力热力', standardIndustry: '电力', status: 'ENABLED' },
  { apiIndustry: '交通运输', standardIndustry: '交通运输', status: 'ENABLED' },
];

const factors = [
  { factorCode: 'TRANS_CHEM_01', factorName: '化工转型风险因子', industry: '化工', scenarioType: '转型风险', factorValue: 0.12, unit: 'ratio', status: 'ENABLED' },
  { factorCode: 'TRANS_STEEL_01', factorName: '钢铁转型风险因子', industry: '钢铁', scenarioType: '转型风险', factorValue: 0.15, unit: 'ratio', status: 'ENABLED' },
  { factorCode: 'PHYS_POWER_01', factorName: '电力物理风险因子', industry: '电力', scenarioType: '物理风险', factorValue: 0.08, unit: 'ratio', status: 'ENABLED' },
  { factorCode: 'COMP_TRANS_01', factorName: '综合风险因子', industry: '-', scenarioType: '综合风险', factorValue: 0.1, unit: 'ratio', status: 'ENABLED' },
];

function getTask(id) {
  return tasks.find((t) => t.id === Number(id));
}

function nextTaskId() {
  return tasks.length ? Math.max(...tasks.map((t) => t.id)) + 1 : 1;
}

function nextRecordId() {
  const all = Object.values(recordsByTask).flat();
  return all.length ? Math.max(...all.map((r) => r.id)) + 1 : 1;
}

function formatMoney(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function formatPct(n) {
  if (n == null) return '-';
  return (Number(n) * 100).toFixed(2) + '%';
}

function mapApiIndustry(apiIndustry) {
  const m = industryMappings.find((x) => x.apiIndustry === apiIndustry && x.status === 'ENABLED');
  return m ? m.standardIndustry : '';
}

function classifyRecord(apiIndustry, standardIndustry) {
  if (!standardIndustry) {
    return { dataAvailability: 'ABNORMAL', availabilityReason: '行业未映射' };
  }
  return { dataAvailability: 'USABLE', availabilityReason: '数据完整' };
}

function ensureRecordsForTask(taskId) {
  if (recordsByTask[taskId]) return recordsByTask[taskId];
  let rid = nextRecordId();
  const seed = [
    { companyName: '华东化工有限公司', branchName: '上海分行', apiIndustry: '制造业-化工' },
    { companyName: '北方钢铁集团', branchName: '北京分行', apiIndustry: '制造业-钢铁' },
    { companyName: '华南电力股份', branchName: '广州分行', apiIndustry: '电力热力' },
  ];
  recordsByTask[taskId] = seed.map((row) => {
    const standardIndustry = mapApiIndustry(row.apiIndustry);
    const extra = classifyRecord(row.apiIndustry, standardIndustry);
    if (row.apiIndustry === '电力热力') {
      extra.dataAvailability = 'NEED_AVG';
      extra.availabilityReason = '关键指标缺失，需行业均值补算';
    }
    return { id: rid++, ...row, standardIndustry: standardIndustry || '-', ...extra };
  });
  return recordsByTask[taskId];
}

function getFactor(industry, scenarioName) {
  return factors.find(
    (f) =>
      f.status === 'ENABLED' &&
      f.scenarioType === scenarioName &&
      (f.industry === industry || f.industry === '-')
  );
}

function syncTask(taskId) {
  const task = getTask(taskId);
  if (!task) return { ok: false, message: '任务不存在' };
  if (!['DRAFT', 'SYNCING'].includes(task.status)) {
    return { ok: false, message: '当前状态不可同步' };
  }
  task.status = 'SYNCING';
  ensureRecordsForTask(taskId);
  recordsByTask[taskId] = recordsByTask[taskId].map((r) => {
    const standardIndustry = mapApiIndustry(r.apiIndustry) || r.standardIndustry;
    const mapped = classifyRecord(r.apiIndustry, standardIndustry && standardIndustry !== '-' ? standardIndustry : '');
    return { ...r, standardIndustry: standardIndustry || '-', ...mapped };
  });
  task.status = 'PENDING_CONFIRM';
  return { ok: true, message: '财务数据已同步，请确认清单' };
}

function confirmRecords(taskId) {
  const task = getTask(taskId);
  if (!task) return { ok: false, message: '任务不存在' };
  if (task.status !== 'PENDING_CONFIRM') {
    return { ok: false, message: '请先完成数据同步' };
  }
  const recs = recordsByTask[taskId] || [];
  if (recs.some((r) => r.dataAvailability === 'ABNORMAL')) {
    return { ok: false, message: '存在异常分流记录，请先维护行业映射' };
  }
  task.status = recs.some((r) => r.dataAvailability === 'NEED_AVG') ? 'PROCESSING' : 'READY_STRESS';
  return { ok: true, message: '清单已确认' };
}

function calcIndustryAvg(taskId) {
  const task = getTask(taskId);
  if (!task) return { ok: false, message: '任务不存在' };
  if (!['PROCESSING', 'READY_STRESS'].includes(task.status)) {
    return { ok: false, message: '当前状态不可进行数据处理' };
  }
  const recs = recordsByTask[taskId] || [];
  recordsByTask[taskId] = recs.map((r) =>
    r.dataAvailability === 'NEED_AVG'
      ? { ...r, dataAvailability: 'USABLE', availabilityReason: '已用行业均值补算' }
      : r
  );
  task.status = 'READY_STRESS';
  return { ok: true, message: '行业平均值已计算并确认' };
}

function runStress(taskId, scenarioCodes) {
  const task = getTask(taskId);
  if (!task) return { ok: false, message: '任务不存在' };
  if (!['READY_STRESS', 'STRESSING', 'COMPLETED'].includes(task.status)) {
    return { ok: false, message: '请先完成数据处理' };
  }
  if (!scenarioCodes.length) {
    return { ok: false, message: '请至少选择一个压测场景' };
  }
  const recs = (recordsByTask[taskId] || []).filter((r) => r.dataAvailability === 'USABLE');
  if (!recs.length) {
    return { ok: false, message: '无可用企业数据' };
  }

  task.status = 'STRESSING';
  const selected = SCENARIO_OPTIONS.filter((s) => scenarioCodes.includes(s.code));
  const rows = [];
  recs.forEach((r) => {
    selected.forEach((sc) => {
      const factor = getFactor(r.standardIndustry, sc.factorKey);
      const rate = factor ? factor.factorValue : 0.1;
      const revenueBefore = 100000 + r.id * 5000;
      const revenueAfter = Math.round(revenueBefore * (1 - rate));
      const eclBefore = Math.round(revenueBefore * 0.02);
      const eclAfter = Math.round(eclBefore * (1 + rate * 0.5));
      rows.push({
        companyName: r.companyName,
        branchName: r.branchName,
        standardIndustry: r.standardIndustry,
        scenarioName: sc.name,
        metricRevenueBefore: revenueBefore,
        metricRevenueAfter: revenueAfter,
        metricEclBefore: eclBefore,
        metricEclAfter: eclAfter,
        impactRate: rate,
      });
    });
  });
  resultsByTask[taskId] = rows;
  task.status = 'COMPLETED';
  return { ok: true, message: '压测执行完成' };
}

function computeSummary(taskId, dimension) {
  const results = resultsByTask[taskId] || [];
  if (!results.length) return [];
  const key = dimension === 'branch' ? 'branchName' : 'standardIndustry';
  const groups = {};
  results.forEach((r) => {
    const name = r[key] || '未知';
    if (!groups[name]) groups[name] = { impacts: [], count: 0 };
    groups[name].impacts.push(r.impactRate);
    groups[name].count += 1;
  });
  return Object.entries(groups)
    .map(([name, g]) => ({
      name,
      count: g.count,
      impactRate: g.impacts.reduce((a, b) => a + b, 0) / g.impacts.length,
    }))
    .sort((a, b) => b.impactRate - a.impactRate);
}

function createTask(payload) {
  const { taskName, reportYear, loanType, loanRegion, description } = payload;
  if (!taskName || !reportYear || !loanType || !loanRegion) {
    return { ok: false, message: '请填写必填项' };
  }
  const id = nextTaskId();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  tasks.unshift({
    id,
    taskCode: 'CRST' + now.getTime(),
    taskName,
    reportYear: Number(reportYear),
    loanType,
    loanRegion,
    description: description || '',
    status: 'DRAFT',
    createdAt,
  });
  return { ok: true, id };
}

function getStepIndex(status) {
  const map = {
    DRAFT: 0,
    SYNCING: 1,
    PENDING_CONFIRM: 1,
    PROCESSING: 2,
    READY_STRESS: 3,
    STRESSING: 3,
    COMPLETED: 4,
    ARCHIVED: 4,
  };
  return map[status] ?? 0;
}
