/**
 * 气候风险压测 — 完整版原型数据与状态常量
 */
window.CRST_STORE = (function () {
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

  const CONFIG_STATUS = {
    ENABLED: { text: '已启用', cls: 'tag-success' },
    DISABLED: { text: '已停用', cls: 'tag-default' },
    DRAFT: { text: '草稿', cls: 'tag-default' },
    PUBLISHED: { text: '已生效', cls: 'tag-success' },
  };

  let nextId = { task: 10, factor: 10, mapping: 10, scenario: 10, export: 10, log: 100 };

  const genCode = (prefix) => prefix + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(Math.floor(Math.random() * 900) + 100);

  let tasks = [
    {
      id: 1,
      taskCode: 'CRST20250604001',
      taskName: '2025年一季度气候风险压测',
      reportPeriodStart: '2025-01-01',
      reportPeriodEnd: '2025-03-31',
      dataCaliber: '合并报表',
      description: '季度例行压测',
      status: 'COMPLETED',
      factorVersion: 'F-V1.0',
      mappingVersion: 'M-V1.0',
      scenarioVersion: 'S-V1.0',
      syncStats: { total: 128, success: 125, fail: 3 },
      adminConfirmedAt: '2025-06-02 15:00:00',
      avgConfirmedAt: '2025-06-02 16:30:00',
      creditFetched: true,
      eclFetched: true,
      createdAt: '2025-06-01 10:00:00',
      updatedAt: '2025-06-03 18:00:00',
    },
    {
      id: 2,
      taskCode: 'CRST20250604002',
      taskName: '高耗能行业专项压测',
      reportPeriodStart: '2024-10-01',
      reportPeriodEnd: '2024-12-31',
      dataCaliber: '母公司',
      description: '高耗能行业专项',
      status: 'PENDING_CONFIRM',
      factorVersion: 'F-V1.0',
      mappingVersion: 'M-V1.0',
      scenarioVersion: 'S-V1.0',
      syncStats: { total: 45, success: 43, fail: 2 },
      createdAt: '2025-06-03 11:20:00',
      updatedAt: '2025-06-04 09:10:00',
    },
    {
      id: 3,
      taskCode: 'CRST20250604003',
      taskName: '2024年度气候风险压测（草稿）',
      reportPeriodStart: '2024-01-01',
      reportPeriodEnd: '2024-12-31',
      dataCaliber: '合并报表',
      description: '',
      status: 'DRAFT',
      createdAt: '2025-06-04 08:00:00',
      updatedAt: '2025-06-04 08:00:00',
    },
  ];

  let recordsByTask = {
    1: [
      { id: 1, companyName: '华东化工有限公司', customerId: 'CUST-1001', unifiedSocialCreditCode: '91310000100000001X', branchName: '上海分行', branchCode: '3100', apiIndustry: 'C2614 有机化学原料制造', standardIndustry: '化工', gbIndustryCode: 'C2614', emissionFactorCode: 'EMISSION_C2614', revenue: 120000, costIncomeRatio: 0.88, dataAvailability: 'USABLE', availabilityReason: '数据完整', dataSource: '接口原始' },
      { id: 2, companyName: '北方钢铁集团', customerId: 'CUST-1002', unifiedSocialCreditCode: '91110000100000002Y', branchName: '北京分行', branchCode: '1100', apiIndustry: 'C3110 炼铁', standardIndustry: '钢铁', gbIndustryCode: 'C3110', emissionFactorCode: 'EMISSION_STEEL', revenue: 98000, costIncomeRatio: 0.9, dataAvailability: 'USABLE', availabilityReason: '数据完整', dataSource: '接口原始' },
      { id: 3, companyName: '华南电力股份', customerId: 'CUST-1003', unifiedSocialCreditCode: '91440000100000003Z', branchName: '广州分行', branchCode: '4400', apiIndustry: 'D4411 火力发电', standardIndustry: '电力', gbIndustryCode: 'D4411', emissionFactorCode: 'EMISSION_D4411', revenue: 150000, costIncomeRatio: 0.82, dataAvailability: 'NEED_AVG', availabilityReason: '关键指标缺失', dataSource: '待补算' },
    ],
    2: [
      { id: 4, companyName: '西南运输公司', customerId: 'CUST-2001', unifiedSocialCreditCode: '91510100100000004M', branchName: '成都分行', branchCode: '5100', apiIndustry: '交通运输', standardIndustry: '交通运输', dataAvailability: 'USABLE', availabilityReason: '数据完整', dataSource: '接口原始' },
      { id: 5, companyName: '未知行业企业', customerId: 'CUST-2002', unifiedSocialCreditCode: '91440300100000005N', branchName: '深圳分行', branchCode: '4403', apiIndustry: '其他行业', standardIndustry: '', dataAvailability: 'ABNORMAL', availabilityReason: '行业未映射', dataSource: '-' },
      { id: 6, companyName: '西北建材公司', customerId: 'CUST-2003', unifiedSocialCreditCode: '91610100100000006P', branchName: '西安分行', branchCode: '6100', apiIndustry: '制造业-建材', standardIndustry: '建材', dataAvailability: 'NEED_AVG', availabilityReason: '部分字段缺失', dataSource: '待补算' },
    ],
  };

  let avgByTask = {
    1: [
      { industry: '电力', sampleCount: 12, avgRevenue: 145000, avgEbitda: 28000, calcBasis: '已确认可使用样本', calcTime: '2025-06-02 16:00:00', status: 'CONFIRMED' },
    ],
  };

  let creditByTask = {
    1: [
      { companyName: '华东化工有限公司', customerId: 'CUST-1001', loanAccountNo: 'LN-202501-0001', contractNo: 'HT-202501-0001', loanBalance: 50000, productType: '流动资金贷款', currency: 'CNY', startDate: '2024-01-15', maturityDate: '2027-01-15', remainingTenor: 22, rating: 'AA-', classification: '正常', guaranteeType: '抵押', branchCode: '3100' },
      { companyName: '北方钢铁集团', customerId: 'CUST-1002', loanAccountNo: 'LN-202501-0002', contractNo: 'HT-202501-0002', loanBalance: 80000, productType: '项目贷款', currency: 'CNY', startDate: '2023-09-01', maturityDate: '2028-09-01', remainingTenor: 31, rating: 'A+', classification: '正常', guaranteeType: '保证', branchCode: '1100' },
    ],
  };

  let eclByTask = {
    1: [
      { companyName: '华东化工有限公司', customerId: 'CUST-1001', loanAccountNo: 'LN-202501-0001', pd: 0.012, lgd: 0.45, ead: 48000, stage: '一阶段', eclAmount: 2400, modelVersion: 'ECL-V3.2', measurementDate: '2025-03-31' },
      { companyName: '北方钢铁集团', customerId: 'CUST-1002', loanAccountNo: 'LN-202501-0002', pd: 0.018, lgd: 0.5, ead: 76000, stage: '一阶段', eclAmount: 1960, modelVersion: 'ECL-V3.2', measurementDate: '2025-03-31' },
    ],
  };

  let resultsByTask = {
    1: (function buildDemoResults() {
      const companies = [
        { companyName: '华东化工有限公司', branchName: '上海分行', standardIndustry: '化工' },
        { companyName: '北方钢铁集团', branchName: '北京分行', standardIndustry: '钢铁' },
        { companyName: '华南电力股份', branchName: '广州分行', standardIndustry: '电力' },
      ];
      const scenarioList = [
        { code: 'BASELINE', name: '现有政策（基准）' },
        { code: 'GREENHOUSE_WORLD', name: '温室世界' },
        { code: 'ORDERLY_TRANSITION', name: '有序转型' },
      ];
      const rows = [];
      for (let y = 2026; y <= 2040; y += 2) {
        companies.forEach((c, ci) => {
          scenarioList.forEach((sc, si) => {
            const base = 100000 + ci * 18000;
            const impact = 0.07 + si * 0.025 + (y - 2026) * 0.0015;
            const eclBefore = 2200 + ci * 600;
            rows.push({
              ...c,
              scenarioCode: sc.code,
              scenarioName: sc.name,
              testYear: y,
              revenueBefore: base,
              revenueAfter: Math.round(base * (1 - impact * 0.45)),
              carbonEmission: Math.round(800 + ci * 120 + y * 2),
              carbonCost: Math.round(base * impact * 0.28),
              eclBefore,
              eclAfter: Math.round(eclBefore * (1 + Math.min(impact * 2, 0.5))),
              impactRate: Math.round(impact * 10000) / 10000,
              defaultFlag: ci === 1 && y >= 2036 && sc.code === 'ORDERLY_TRANSITION',
            });
          });
        });
      }
      return rows;
    })(),
  };

  let taskLogs = {
    1: [
      { time: '2025-06-01 10:00:00', action: '创建任务', operator: '总行管理员' },
      { time: '2025-06-02 14:00:00', action: '同步财务数据完成', operator: '系统' },
      { time: '2025-06-02 15:00:00', action: '确认数据清单', operator: '总行管理员' },
      { time: '2025-06-03 18:00:00', action: '压测完成', operator: '系统' },
    ],
    2: [
      { time: '2025-06-03 11:20:00', action: '创建任务', operator: '总行管理员' },
      { time: '2025-06-04 09:10:00', action: '同步财务数据完成', operator: '系统' },
    ],
  };

  let factors = [];
  let scenarios = [];
  let mappings = [];

  if (typeof window !== 'undefined' && window.CRST_CARBON) {
    factors = window.CRST_CARBON.buildFactorLibraryRows();
    scenarios = window.CRST_CARBON.buildScenarioRows().map((s) => {
      const tr = window.CRST_CARBON.TRANSITION_SCENARIOS?.[s.scenarioCode];
      return {
        ...s,
        formulaVersion: s.formulaVersion || s.version,
        testYear: s.testYear ?? 2040,
        freeQuota2025: s.freeQuota2025 ?? tr?.freeQuota2025,
        freeQuota2040: s.freeQuota2040 ?? tr?.freeQuota2040,
        carbonPrice2025: s.carbonPrice2025 ?? tr?.carbonPrice2025,
        carbonPrice2040: s.carbonPrice2040 ?? tr?.carbonPrice2040,
      };
    });
    mappings = [
      ...window.CRST_CARBON.buildGbMappings(),
      { id: 900, apiIndustry: '制造业-化工', standardIndustry: '化工', gbCode: 'C2614', mappingType: '多对一', status: 'ENABLED', version: 'V2.0-行内方法', updatedAt: '2025-06-04' },
      { id: 901, apiIndustry: '制造业-钢铁', standardIndustry: '钢铁', gbCode: 'C3110', mappingType: '多对一', status: 'ENABLED', version: 'V2.0-行内方法', updatedAt: '2025-06-04' },
      { id: 902, apiIndustry: '电力热力', standardIndustry: '电力', gbCode: 'D4411', mappingType: '多对一', status: 'ENABLED', version: 'V2.0-行内方法', updatedAt: '2025-06-04' },
    ];
  }

  let exportLogs = [
    {
      id: 1, taskCode: 'CRST20250604001', taskName: '2025年一季度气候风险压测',
      exportType: '表格', fileFormat: 'Excel', scope: '行业汇总',
      fields: '行业,公司数,平均影响率,ECL变化', operator: '总行管理员', exportedAt: '2025-06-03 19:00:00',
      downloadFileName: '2025年一季度气候风险压测20250603190000.xlsx',
    },
    {
      id: 2, taskCode: 'CRST20250604001', taskName: '2025年一季度气候风险压测',
      exportType: '图表', fileFormat: 'PDF', scope: '分行维度',
      fields: '分行,平均影响率,排名', operator: '总行管理员', exportedAt: '2025-06-03 19:15:00',
      downloadFileName: '2025年一季度气候风险压测20250603191500.xlsx',
    },
  ];

  function addLog(taskId, action) {
    if (!taskLogs[taskId]) taskLogs[taskId] = [];
    taskLogs[taskId].unshift({
      time: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
      action,
      operator: '总行管理员',
    });
  }

  function getPublishedScenarioVersion() {
    const pub = scenarios.filter((s) => s.status === 'PUBLISHED');
    return pub.length ? pub[0].version : '-';
  }

  /** 因子库版本目录：一套版本对应一组行业排放因子等参数，与生效年度关联 */
  const FACTOR_VERSION_CATALOG = [
    { version: 'V2.0-行内方法', effectiveYear: 2025, label: 'V2.0-行内方法（2025）' },
    { version: 'V1.0', effectiveYear: 2024, label: 'V1.0（2024）' },
  ];

  function getFactorVersionCatalog() {
    return FACTOR_VERSION_CATALOG;
  }

  function suggestFactorVersionByReportEnd(endDate) {
    const y = endDate ? parseInt(String(endDate).slice(0, 4), 10) : NaN;
    if (!Number.isNaN(y)) {
      const hit = FACTOR_VERSION_CATALOG.find((c) => c.effectiveYear === y);
      if (hit) return hit.version;
    }
    const en = factors.filter((f) => f.status === 'ENABLED');
    return en.length ? en[0].version : FACTOR_VERSION_CATALOG[0].version;
  }

  function getActiveFactorVersion() {
    const en = factors.filter((f) => f.status === 'ENABLED');
    return en.length ? en[0].version : '-';
  }

  function formatFactorVersionDisplay(version) {
    if (!version) return '-';
    const item = FACTOR_VERSION_CATALOG.find((c) => c.version === version || version === 'F-' + c.version);
    const v = item ? item.version : String(version).replace(/^F-/, '');
    return item ? item.label : v;
  }

  function getActiveMappingVersion() {
    return mappings.some((m) => m.status === 'ENABLED') ? 'V2.0-行内方法' : '-';
  }

  return {
    STATUS_MAP,
    AVAIL_MAP,
    CONFIG_STATUS,
    tasks,
    recordsByTask,
    avgByTask,
    creditByTask,
    eclByTask,
    resultsByTask,
    taskLogs,
    factors,
    scenarios,
    mappings,
    exportLogs,
    nextId,
    genCode,
    addLog,
    getPublishedScenarioVersion,
    getActiveFactorVersion,
    getFactorVersionCatalog,
    suggestFactorVersionByReportEnd,
    formatFactorVersionDisplay,
    getActiveMappingVersion,
    CARBON: typeof window !== 'undefined' ? window.CRST_CARBON : null,
  };
})();
