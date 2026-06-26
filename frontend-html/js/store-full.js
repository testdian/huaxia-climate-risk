/**
 * 气候风险压测 — 完整版原型数据与状态常量
 */
window.CRST_STORE = (function () {
  const STATUS_MAP = {
    DRAFT: { text: '草稿', cls: 'tag-default' },
    SYNCING: { text: '数据同步中', cls: 'tag-processing' },
    PENDING_DISAMBIG: { text: '待甄别确认', cls: 'tag-warning' },
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
    EXCLUDED: { text: '已排除', cls: 'tag-default' },
    EXCLUDED_NO_REPORT: { text: '财报缺失-不参与压测', cls: 'tag-error' },
  };

  /** v0.4：05/07 财报口径选项 */
  const DATA_CALIBER_OPTIONS = ['05财报', '07财报', '两种口径均输出'];

  /** v0.4：压测场景类型（影响财报缺失处理策略） */
  const SCENE_TYPE_OPTIONS = [
    { value: 'REGULATORY', label: '外部监管场景' },
    { value: 'INTERNAL', label: '内部汇总场景' },
  ];

  /** 压测目的（流程图步骤1） */
  const STRESS_PURPOSE_OPTIONS = [
    { value: 'PBOC', label: '人民银行气候风险压测' },
    { value: 'ESG', label: 'ESG/TCFD 报告' },
    { value: 'CUSTOM', label: '自定义' },
  ];

  /** 导出记录来源类型 */
  const EXPORT_SOURCE_LABELS = {
    DATA_PROCESS: '数据处理',
    STRESS_TRANS: '现有政策压测',
    STRESS_PHYS: '温室世界压测',
    STRESS_COMP: '有序转型压测',
    RESULTS: '结果分析',
    REPORT: '监管报送',
  };

  /** v0.4：行业歧义规则库（GN02a） */
  const INDUSTRY_AMBIGUITY_RULES = [
    {
      code: 'HY-01',
      gbCode: 'C3041',
      gbName: '平板玻璃制造',
      options: ['平板玻璃', '平板玻璃（仅浮法）'],
      hint: '桌面调研确认企业实际生产工艺（浮法 vs 其他）',
    },
    {
      code: 'HY-02',
      gbCode: 'C2511',
      gbName: '原油加工及石油制品制造',
      options: ['开采原油加工炼化', '采购原油加工炼化'],
      hint: '调研企业是否自有上游采矿业务',
    },
    {
      code: 'HY-03',
      gbCode: 'C2211',
      gbName: '造纸（木竹浆/非木竹浆/机制纸）',
      options: ['造纸（生活用纸）', '造纸（其他）'],
      hint: '调研企业主要产品类别',
    },
  ];

  const LOAN_CLASSIFICATION_LABELS = {
    NORMAL: '正常',
    ATTENTION: '关注',
    SUBSTANDARD: '次级',
    DOUBTFUL: '可疑',
    LOSS: '损失',
  };

  const CONFIG_STATUS = {
    ENABLED: { text: '已启用', cls: 'tag-success' },
    DISABLED: { text: '已停用', cls: 'tag-default' },
    DRAFT: { text: '草稿', cls: 'tag-default' },
    PUBLISHED: { text: '已生效', cls: 'tag-success' },
  };

  const genCode = (prefix) => prefix + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(Math.floor(Math.random() * 900) + 100);

  /** 压测演示样本企业（用于财务记录与压测结果生成） */
  const DEMO_STRESS_COMPANIES = [
    { companyName: '华东化工有限公司', branchName: '上海分行', branchCode: '3100', standardIndustry: '化工', gbIndustryCode: 'C2614', customerId: 'CUST-1001', revenueBase: 120000, pdBase: 0.012, loanBalance: 50000, prevStatus: 'NORMAL', defaultTier: 0 },
    { companyName: '北方钢铁集团', branchName: '北京分行', branchCode: '1100', standardIndustry: '钢铁', gbIndustryCode: 'C3110', customerId: 'CUST-1002', revenueBase: 98000, pdBase: 0.018, loanBalance: 80000, prevStatus: 'NORMAL', defaultTier: 2 },
    { companyName: '华南电力股份', branchName: '广州分行', branchCode: '4400', standardIndustry: '电力', gbIndustryCode: 'D4411', customerId: 'CUST-1003', revenueBase: 150000, pdBase: 0.035, loanBalance: 120000, prevStatus: 'ATTENTION', defaultTier: 1 },
    { companyName: '东海石化炼化', branchName: '宁波分行', branchCode: '3302', standardIndustry: '石化', gbIndustryCode: 'C2511', customerId: 'CUST-1004', revenueBase: 210000, pdBase: 0.015, loanBalance: 95000, prevStatus: 'NORMAL', defaultTier: 1 },
    { companyName: '中原建材集团', branchName: '郑州分行', branchCode: '4101', standardIndustry: '建材', gbIndustryCode: 'C3011', customerId: 'CUST-1005', revenueBase: 86000, pdBase: 0.022, loanBalance: 42000, prevStatus: 'NORMAL', defaultTier: 0 },
    { companyName: '西部有色金属', branchName: '昆明分行', branchCode: '5301', standardIndustry: '有色', gbIndustryCode: 'C3216', customerId: 'CUST-1006', revenueBase: 132000, pdBase: 0.019, loanBalance: 68000, prevStatus: 'NORMAL', defaultTier: 2 },
    { companyName: '华北造纸股份', branchName: '天津分行', branchCode: '1200', standardIndustry: '造纸', gbIndustryCode: 'C2221', customerId: 'CUST-1007', revenueBase: 74000, pdBase: 0.028, loanBalance: 36000, prevStatus: 'ATTENTION', defaultTier: 1 },
    { companyName: '西南平板玻璃', branchName: '成都分行', branchCode: '5100', standardIndustry: '平板玻璃', gbIndustryCode: 'C3041', customerId: 'CUST-1008', revenueBase: 56000, pdBase: 0.021, loanBalance: 28000, prevStatus: 'NORMAL', defaultTier: 0 },
    { companyName: '华中煤炭能源', branchName: '武汉分行', branchCode: '4201', standardIndustry: '煤炭', gbIndustryCode: 'B0610', customerId: 'CUST-1009', revenueBase: 118000, pdBase: 0.025, loanBalance: 72000, prevStatus: 'NORMAL', defaultTier: 2 },
    { companyName: '长三角汽车制造', branchName: '南京分行', branchCode: '3201', standardIndustry: '汽车', gbIndustryCode: 'C3611', customerId: 'CUST-1010', revenueBase: 165000, pdBase: 0.014, loanBalance: 88000, prevStatus: 'NORMAL', defaultTier: 0 },
    { companyName: '渤海港口物流', branchName: '大连分行', branchCode: '2102', standardIndustry: '交通运输', gbIndustryCode: 'G5531', customerId: 'CUST-1011', revenueBase: 92000, pdBase: 0.017, loanBalance: 45000, prevStatus: 'NORMAL', defaultTier: 0 },
    { companyName: '闽粤新能源科技', branchName: '厦门分行', branchCode: '3502', standardIndustry: '新能源', gbIndustryCode: 'C3825', customerId: 'CUST-1012', revenueBase: 78000, pdBase: 0.011, loanBalance: 52000, prevStatus: 'NORMAL', defaultTier: 0 },
  ];

  function demoCompanyToFinancialRecord(c, id, overrides) {
    return {
      id,
      companyName: c.companyName,
      customerId: c.customerId,
      creditNo: `LN-202501-${String(id).padStart(4, '0')}`,
      unifiedSocialCreditCode: `9144030010000${String(id).padStart(5, '0')}`,
      branchName: c.branchName,
      branchCode: c.branchCode,
      loanRegion: 'DOMESTIC',
      loanClassification: c.prevStatus === 'ATTENTION' ? 'ATTENTION' : 'NORMAL',
      pdValue: c.pdBase,
      apiIndustry: `${c.gbIndustryCode} ${c.standardIndustry}`,
      standardIndustry: c.standardIndustry,
      gbIndustryCode: c.gbIndustryCode,
      emissionFactorCode: `EMISSION_${c.gbIndustryCode}`,
      revenue: c.revenueBase,
      costIncomeRatio: 0.82 + (id % 5) * 0.02,
      assetLiabilityRatio: 0.58 + (id % 4) * 0.06,
      dataAvailability: 'USABLE',
      availabilityReason: '数据完整',
      dataSource: '接口原始',
      prevStatus: c.prevStatus || 'NORMAL',
      postStatus: c.prevStatus || 'NORMAL',
      ...overrides,
    };
  }

  function buildStressDemoResults(config) {
    const {
      companies = DEMO_STRESS_COMPANIES,
      yearStart = 2026,
      yearEnd = 2040,
      yearStep = 1,
      scenarioCodes = null,
      impactBase = 0.06,
      seed = 0,
    } = config || {};
    const allScenarios = [
      { code: 'BASELINE', name: '现有政策（基准）', weight: 1 },
      { code: 'GREENHOUSE_WORLD', name: '温室世界', weight: 1.28 },
      { code: 'ORDERLY_TRANSITION', name: '有序转型', weight: 1.52 },
    ];
    const scenarioList = scenarioCodes
      ? allScenarios.filter((s) => scenarioCodes.includes(s.code))
      : allScenarios;
    const rows = [];
    for (let y = yearStart; y <= yearEnd; y += yearStep) {
      companies.forEach((c, ci) => {
        scenarioList.forEach((sc, si) => {
          const base = c.revenueBase + seed * 500;
          const yearFactor = (y - yearStart) * 0.0011;
          const impact = Math.min(0.42, (impactBase + si * 0.018 + ci * 0.004 + yearFactor) * sc.weight);
          const impactRate = Math.round(impact * 10000) / 10000;
          const revenueAfter = Math.round(base * (1 - impact * 0.42));
          const carbonCost = Math.round(base * impact * 0.26 + ci * 120);
          const eclBefore = Math.round(1800 + ci * 480 + si * 220 + seed * 10);
          const eclAfter = Math.round(eclBefore * (1 + Math.min(impact * 1.8, 0.55)));
          const operatingExpense = Math.round(revenueAfter * (0.78 + (ci % 4) * 0.03));
          const netProfitAfter = Math.round(revenueAfter - operatingExpense - carbonCost);
          const tier = c.defaultTier || 0;
          const defaultFlag = (tier >= 3 && y >= 2032)
            || (tier >= 2 && sc.code === 'ORDERLY_TRANSITION' && y >= 2034)
            || (tier >= 1 && sc.code === 'GREENHOUSE_WORLD' && y >= 2038)
            || (tier >= 2 && sc.code === 'GREENHOUSE_WORLD' && y >= 2040);
          rows.push({
            companyName: c.companyName,
            branchName: c.branchName,
            standardIndustry: c.standardIndustry,
            scenarioCode: sc.code,
            scenarioName: sc.name,
            testYear: y,
            customerId: c.customerId,
            revenueBefore: base,
            revenueAfter,
            operatingExpense,
            netProfitAfter,
            carbonEmission: Math.round(720 + ci * 95 + (y - 2026) * 8 + si * 40),
            carbonCost,
            eclBefore,
            eclAfter,
            impactRate,
            defaultFlag,
            defaultReason: defaultFlag ? (netProfitAfter < 0 ? '压测后净利润为负' : '触发违约判定规则') : '',
            measureCaliber: ci % 2 === 0 ? '05财报' : '07财报',
            prevStatus: c.prevStatus || 'NORMAL',
            postStatus: defaultFlag ? 'DEFAULT' : (c.prevStatus || 'NORMAL'),
            pdBefore: c.pdBase,
            pdAfter: defaultFlag ? Math.min(1, Math.round((c.pdBase * 3 + impact) * 10000) / 10000) : c.pdBase,
            loanAmount: c.loanBalance,
            assetLiabilityRatioBefore: 0.58 + (ci % 4) * 0.06,
            assetLiabilityRatioAfter: defaultFlag ? 1.05 + ci * 0.02 : 0.6 + (ci % 3) * 0.05,
          });
        });
      });
    }
    return rows;
  }

  function demoCreditRow(c, idx) {
    return {
      companyName: c.companyName,
      customerId: c.customerId,
      loanAccountNo: `LN-202501-${String(idx).padStart(4, '0')}`,
      contractNo: `HT-202501-${String(idx).padStart(4, '0')}`,
      loanBalance: c.loanBalance,
      productType: idx % 3 === 0 ? '项目贷款' : '流动资金贷款',
      currency: 'CNY',
      startDate: '2023-06-01',
      maturityDate: '2028-06-01',
      remainingTenor: 28 + (idx % 6),
      rating: idx % 4 === 0 ? 'A' : 'AA-',
      classification: c.prevStatus === 'ATTENTION' ? '关注' : '正常',
      guaranteeType: idx % 2 === 0 ? '抵押' : '保证',
      branchCode: c.branchCode,
    };
  }

  function demoEclRow(c, idx) {
    return {
      companyName: c.companyName,
      customerId: c.customerId,
      loanAccountNo: `LN-202501-${String(idx).padStart(4, '0')}`,
      pd: c.pdBase,
      lgd: 0.42 + (idx % 3) * 0.04,
      ead: Math.round(c.loanBalance * 0.92),
      stage: c.prevStatus === 'ATTENTION' ? '二阶段' : '一阶段',
      eclAmount: Math.round(c.loanBalance * c.pdBase * 0.4),
      modelVersion: 'ECL-V3.2',
      measurementDate: '2025-03-31',
    };
  }

  let nextId = { task: 12, factor: 10, mapping: 10, scenario: 10, export: 25, log: 100, carbon: 10 };

  let tasks = [
    {
      id: 1,
      taskCode: 'CRST20250604001',
      taskName: '2025年一季度气候风险压测',
      reportPeriodStart: '2025-01-01',
      reportPeriodEnd: '2025-03-31',
      dataCaliber: '两种口径均输出',
      sceneType: 'REGULATORY',
      stressPurpose: 'PBOC',
      syncFilters: { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 },
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
      riskWarningIssuedAt: '2025-06-03 19:00:00',
      regulatoryReportGeneratedAt: '2025-06-03 19:15:00',
      createdAt: '2025-06-01 10:00:00',
      updatedAt: '2025-06-03 18:00:00',
    },
    {
      id: 2,
      taskCode: 'CRST20250604002',
      taskName: '高耗能行业专项压测',
      reportPeriodStart: '2024-10-01',
      reportPeriodEnd: '2024-12-31',
      dataCaliber: '05财报',
      sceneType: 'INTERNAL',
      stressPurpose: 'PBOC',
      syncFilters: { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 },
      description: '高耗能行业专项',
      status: 'PENDING_DISAMBIG',
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
      dataCaliber: '两种口径均输出',
      sceneType: 'REGULATORY',
      syncFilters: { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 },
      description: '',
      status: 'DRAFT',
      createdAt: '2025-06-04 08:00:00',
      updatedAt: '2025-06-04 08:00:00',
    },
    {
      id: 4,
      taskCode: 'CRST20250604004',
      taskName: '2024年度气候风险压测',
      reportPeriodStart: '2024-01-01',
      reportPeriodEnd: '2024-12-31',
      dataCaliber: '05财报',
      sceneType: 'REGULATORY',
      stressPurpose: 'PBOC',
      syncFilters: { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 },
      description: '年度例行压测',
      status: 'COMPLETED',
      factorVersion: 'F-V1.0',
      mappingVersion: 'M-V1.0',
      scenarioVersion: 'S-V1.0',
      syncStats: { total: 96, success: 94, fail: 2 },
      adminConfirmedAt: '2025-05-28 14:00:00',
      avgConfirmedAt: '2025-05-28 16:00:00',
      creditFetched: true,
      eclFetched: true,
      regulatoryReportGeneratedAt: '2025-05-29 11:20:00',
      createdAt: '2025-05-20 09:00:00',
      updatedAt: '2025-05-29 11:20:00',
    },
    {
      id: 5,
      taskCode: 'CRST20250604005',
      taskName: '东部制造业专项（待压测）',
      reportPeriodStart: '2025-01-01',
      reportPeriodEnd: '2025-06-30',
      dataCaliber: '07财报',
      sceneType: 'INTERNAL',
      stressPurpose: 'ESG',
      syncFilters: { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 },
      description: '制造业转型风险专项',
      status: 'READY_STRESS',
      factorVersion: 'F-V1.0',
      mappingVersion: 'M-V1.0',
      scenarioVersion: 'S-V1.0',
      syncStats: { total: 86, success: 84, fail: 2 },
      adminConfirmedAt: '2025-06-04 14:00:00',
      avgConfirmedAt: '2025-06-04 15:30:00',
      createdAt: '2025-06-04 10:00:00',
      updatedAt: '2025-06-04 15:30:00',
    },
    {
      id: 6,
      taskCode: 'CRST20250604006',
      taskName: '高碳行业组合压测（进行中）',
      reportPeriodStart: '2024-07-01',
      reportPeriodEnd: '2025-06-30',
      dataCaliber: '两种口径均输出',
      sceneType: 'REGULATORY',
      stressPurpose: 'PBOC',
      syncFilters: { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 },
      description: '',
      status: 'PROCESSING',
      factorVersion: 'F-V1.0',
      mappingVersion: 'M-V1.0',
      scenarioVersion: 'S-V1.0',
      syncStats: { total: 112, success: 110, fail: 2 },
      adminConfirmedAt: '2025-06-04 16:00:00',
      createdAt: '2025-06-04 13:00:00',
      updatedAt: '2025-06-04 16:10:00',
    },
  ];

  let recordsByTask = {
    1: DEMO_STRESS_COMPANIES.map((c, i) => demoCompanyToFinancialRecord(c, i + 1)),
    2: [
      { id: 4, companyName: '西南平板玻璃销售公司', customerId: 'CUST-2001', creditNo: 'LN-202402-0101', unifiedSocialCreditCode: '91510100100000004M', branchName: '成都分行', branchCode: '5100', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.021, apiIndustry: 'C3041 平板玻璃制造', gbIndustryCode: 'C3041', standardIndustry: '平板玻璃', ambiguityCode: 'HY-01', ambiguityConfirmed: false, revenue: 56000, costIncomeRatio: 0.85, dataAvailability: 'USABLE', availabilityReason: '待行业甄别', dataSource: '接口原始' },
      { id: 5, companyName: '华东原油加工有限公司', customerId: 'CUST-2002', creditNo: 'LN-202402-0102', unifiedSocialCreditCode: '91440300100000005N', branchName: '深圳分行', branchCode: '4403', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.015, apiIndustry: 'C2511 原油加工及石油制品制造', gbIndustryCode: 'C2511', standardIndustry: '开采原油加工炼化', ambiguityCode: 'HY-02', ambiguityConfirmed: false, revenue: 210000, costIncomeRatio: 0.91, dataAvailability: 'USABLE', availabilityReason: '待行业甄别', dataSource: '接口原始' },
      { id: 6, companyName: '华北造纸集团', customerId: 'CUST-2003', creditNo: 'LN-202402-0103', unifiedSocialCreditCode: '91610100100000006P', branchName: '西安分行', branchCode: '6100', loanRegion: 'DOMESTIC', loanClassification: 'SUBSTANDARD', pdValue: 0.85, apiIndustry: 'C2221 机制纸及纸板制造', gbIndustryCode: 'C2221', standardIndustry: '造纸（其他）', ambiguityCode: 'HY-03', ambiguityConfirmed: false, revenue: 78000, costIncomeRatio: 0.87, dataAvailability: 'USABLE', availabilityReason: '待行业甄别', dataSource: '接口原始' },
      { id: 7, companyName: '境外能源贸易公司', customerId: 'CUST-2004', creditNo: 'LN-202402-0104', unifiedSocialCreditCode: 'HK9999000000007Q', branchName: '香港分行', branchCode: '8100', loanRegion: 'OVERSEAS', loanClassification: 'NORMAL', pdValue: 0.028, apiIndustry: '石油贸易', standardIndustry: '石油', revenue: 95000, costIncomeRatio: 0.88, dataAvailability: 'USABLE', availabilityReason: '数据完整', dataSource: '接口原始' },
      { id: 8, companyName: '已违约客户示例', customerId: 'CUST-2005', creditNo: 'LN-202402-0105', unifiedSocialCreditCode: '91440300100000008R', branchName: '深圳分行', branchCode: '4403', loanRegion: 'DOMESTIC', loanClassification: 'LOSS', pdValue: 1, apiIndustry: 'C2614 有机化学原料制造', gbIndustryCode: 'C2614', standardIndustry: '化工', revenue: 12000, costIncomeRatio: 0.95, dataAvailability: 'USABLE', availabilityReason: '数据完整', dataSource: '接口原始' },
      { id: 9, companyName: '财报缺失企业', customerId: 'CUST-2006', creditNo: 'LN-202402-0106', unifiedSocialCreditCode: '91440300100000009S', branchName: '深圳分行', branchCode: '4403', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.04, apiIndustry: 'C3110 炼铁', gbIndustryCode: 'C3110', standardIndustry: '钢铁', revenue: null, costIncomeRatio: null, dataAvailability: 'NEED_AVG', availabilityReason: '财报缺失', dataSource: '接口原始', reportMissing: true },
    ],
    4: DEMO_STRESS_COMPANIES.slice(0, 10).map((c, i) => demoCompanyToFinancialRecord(c, i + 1, { costIncomeRatio: 0.84 + (i % 3) * 0.02 })),
    5: DEMO_STRESS_COMPANIES.slice(2, 10).map((c, i) => demoCompanyToFinancialRecord(c, i + 1)),
    6: DEMO_STRESS_COMPANIES.slice(0, 8).map((c, i) => demoCompanyToFinancialRecord(c, i + 1, {
      dataAvailability: i === 5 ? 'NEED_AVG' : 'USABLE',
      availabilityReason: i === 5 ? '关键指标缺失' : '数据完整',
    })),
  };

  let avgByTask = {
    1: [
      { industry: '电力', sampleCount: 12, avgRevenue: 145000, avgEbitda: 28000, calcBasis: '已确认可使用样本', calcTime: '2025-06-02 16:00:00', status: 'CONFIRMED' },
      { industry: '化工', sampleCount: 8, avgRevenue: 118000, avgEbitda: 22000, calcBasis: '已确认可使用样本', calcTime: '2025-06-02 16:05:00', status: 'CONFIRMED' },
    ],
    4: [
      { industry: '钢铁', sampleCount: 6, avgRevenue: 102000, avgEbitda: 18500, calcBasis: '已确认可使用样本', calcTime: '2025-05-28 15:40:00', status: 'CONFIRMED' },
    ],
    5: [
      { industry: '汽车', sampleCount: 5, avgRevenue: 158000, avgEbitda: 31000, calcBasis: '已确认可使用样本', calcTime: '2025-06-04 15:20:00', status: 'CONFIRMED' },
    ],
  };

  let creditByTask = {
    1: DEMO_STRESS_COMPANIES.slice(0, 10).map((c, i) => demoCreditRow(c, i + 1)),
    4: DEMO_STRESS_COMPANIES.slice(0, 8).map((c, i) => demoCreditRow(c, i + 1)),
  };

  let eclByTask = {
    1: DEMO_STRESS_COMPANIES.slice(0, 10).map((c, i) => demoEclRow(c, i + 1)),
    4: DEMO_STRESS_COMPANIES.slice(0, 8).map((c, i) => demoEclRow(c, i + 1)),
  };

  let resultsByTask = {
    1: buildStressDemoResults({ companies: DEMO_STRESS_COMPANIES }),
    4: buildStressDemoResults({ companies: DEMO_STRESS_COMPANIES.slice(0, 10), seed: 2, impactBase: 0.055 }),
  };

  let taskLogs = {
    1: [
      { time: '2025-06-03 19:15:00', action: '应用报送：生成监管报送 Excel 文件包', operator: '总行管理员' },
      { time: '2025-06-03 19:00:00', action: '应用报送：向 1 户企业所在分行下发风险预警', operator: '总行管理员' },
      { time: '2025-06-03 18:00:00', action: '压测结果：场景压测完成，已生成 540 行结果（2026-2040年，3个情景）', operator: '系统' },
      { time: '2025-06-03 17:45:00', action: '场景压测：开始执行（3个情景，2026-2040年）', operator: '总行管理员' },
      { time: '2025-06-03 17:30:00', action: '场景压测：调取 ECL 系统数据', operator: '总行管理员' },
      { time: '2025-06-03 17:28:00', action: '场景压测：调取信贷系统数据', operator: '总行管理员' },
      { time: '2025-06-02 16:30:00', action: '数据处理：确认处理结果，进入场景压测', operator: '总行管理员' },
      { time: '2025-06-02 16:15:00', action: '数据同步与确认：行业均值已填充至 1 条样本', operator: '总行管理员' },
      { time: '2025-06-02 16:00:00', action: '数据同步与确认：计算行业平均值', operator: '总行管理员' },
      { time: '2025-06-02 15:00:00', action: '数据同步与确认：确认数据清单', operator: '总行管理员' },
      { time: '2025-06-02 14:05:00', action: '数据同步与确认：财务数据同步完成，待确认清单', operator: '系统' },
      { time: '2025-06-02 14:00:00', action: '数据同步与确认：开始同步财务数据', operator: '总行管理员' },
      { time: '2025-06-01 10:00:00', action: '创建任务：保存任务', operator: '总行管理员' },
    ],
    2: [
      { time: '2025-06-04 09:10:00', action: '数据同步与确认：财务数据同步完成，识别 3 条行业歧义客户，待甄别确认', operator: '系统' },
      { time: '2025-06-04 09:05:00', action: '数据同步与确认：开始同步财务数据（境内贷款，PD≤0.99）', operator: '总行管理员' },
      { time: '2025-06-03 11:20:00', action: '创建任务：保存任务', operator: '总行管理员' },
    ],
    4: [
      { time: '2025-05-29 11:20:00', action: '应用报送：生成监管报送 Excel 文件包', operator: '总行管理员' },
      { time: '2025-05-29 10:00:00', action: '压测结果：场景压测完成，已生成 450 行结果（2026-2040年，3个情景）', operator: '系统' },
      { time: '2025-05-28 16:00:00', action: '数据处理：确认处理结果，进入压测方法', operator: '总行管理员' },
      { time: '2025-05-28 14:00:00', action: '数据同步与确认：确认数据清单', operator: '总行管理员' },
      { time: '2025-05-20 09:00:00', action: '创建任务：保存任务', operator: '总行管理员' },
    ],
    5: [
      { time: '2025-06-04 15:30:00', action: '数据处理：确认处理结果，任务待压测', operator: '总行管理员' },
      { time: '2025-06-04 14:00:00', action: '数据同步与确认：确认数据清单', operator: '总行管理员' },
      { time: '2025-06-04 10:00:00', action: '创建任务：保存任务', operator: '总行管理员' },
    ],
    6: [
      { time: '2025-06-04 16:10:00', action: '数据处理：行业均值补算进行中', operator: '总行管理员' },
      { time: '2025-06-04 16:00:00', action: '数据同步与确认：确认数据清单', operator: '总行管理员' },
      { time: '2025-06-04 13:00:00', action: '创建任务：保存任务', operator: '总行管理员' },
    ],
  };

  /** v0.4：投融资碳核算报告法碳排放量维护 */
  let carbonEmissionRows = [
    { id: 1, companyName: '华东化工有限公司', creditNo: 'LN-202501-0001', year: 2024, carbonEmission: 125000, calcMethod: '报告法', dataSource: '企业自主申报', remark: '', updatedAt: '2025-06-04' },
    { id: 2, companyName: '北方钢铁集团', creditNo: 'LN-202501-0002', year: 2024, carbonEmission: 980000, calcMethod: '报告法', dataSource: '第三方核查', remark: '', updatedAt: '2025-06-04' },
    { id: 3, companyName: '华南电力股份', creditNo: 'LN-202501-0003', year: 2024, carbonEmission: 1560000, calcMethod: '报告法', dataSource: '企业自主申报', remark: '', updatedAt: '2025-06-04' },
    { id: 4, companyName: '东海石化炼化', creditNo: 'LN-202501-0004', year: 2024, carbonEmission: 890000, calcMethod: '报告法', dataSource: '第三方核查', remark: '', updatedAt: '2025-06-04' },
    { id: 5, companyName: '中原建材集团', creditNo: 'LN-202501-0005', year: 2024, carbonEmission: 420000, calcMethod: '报告法', dataSource: '企业自主申报', remark: '', updatedAt: '2025-06-04' },
    { id: 6, companyName: '西部有色金属', creditNo: 'LN-202501-0006', year: 2024, carbonEmission: 310000, calcMethod: '报告法', dataSource: '手工维护', remark: '', updatedAt: '2025-06-04' },
    { id: 7, companyName: '华北造纸股份', creditNo: 'LN-202501-0007', year: 2024, carbonEmission: 185000, calcMethod: '报告法', dataSource: '企业自主申报', remark: '', updatedAt: '2025-06-04' },
    { id: 8, companyName: '华南机场运营有限公司', creditNo: 'LN-202501-0005', year: 2024, carbonEmission: 42000, calcMethod: '报告法', dataSource: '手工维护', remark: '与吞吐量口径交叉校验', updatedAt: '2025-06-04' },
  ];

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
      id: 1,
      sourceKey: 'task-1',
      exportKind: 'SUMMARY',
      taskCode: 'CRST20250604001',
      taskName: '2025年一季度气候风险压测',
      sourceType: 'RESULTS',
      exportType: '表格',
      fileFormat: 'Excel',
      scope: '汇总结果（按行业）',
      filter: '场景=全部，年份=2040年，维度=行业，口径=全部',
      fields: '行业,样本数,平均影响率,碳费用合计(万),ECL增量合计(万),违约数',
      filterSnapshot: { context: 'analysis', year: 2040, scenarioCode: '', dim: 'industry', caliber: '' },
      fieldKeys: [],
      operator: '总行管理员',
      exportedAt: '2025-06-03 19:00:00',
      downloadFileName: '2025年一季度气候风险压测20250603190000.xlsx',
    },
    {
      id: 2,
      sourceKey: 'task-1',
      exportKind: 'REPORT',
      taskCode: 'CRST20250604001',
      taskName: '2025年一季度气候风险压测',
      sourceType: 'REPORT',
      exportType: '文件包',
      fileFormat: 'Excel/Word',
      scope: '外部监管报送-人民银行模板',
      filter: '监管口径：S-V1.0；情景：全部已选情景',
      fields: '汇总表.xlsx, 明细表.xlsx, 风险提示清单.xlsx, 口径说明.docx',
      filterSnapshot: { context: 'taskDetail', taskId: 1, filter: { keyword: '', scenarioCode: '', year: '', industry: '', branch: '', defaultOnly: '', summaryDim: 'industry' } },
      fieldKeys: [],
      operator: '总行管理员',
      exportedAt: '2025-06-03 19:15:00',
      downloadFileName: '2025年一季度气候风险压测20250603191500.xlsx',
    },
    {
      id: 3,
      sourceKey: 'task-4',
      exportKind: 'SUMMARY',
      taskCode: 'CRST20250604004',
      taskName: '2024年度气候风险压测',
      sourceType: 'RESULTS',
      exportType: '表格',
      fileFormat: 'Excel',
      scope: '汇总结果（按行业）',
      filter: '场景=全部，年份=2040年，维度=行业，口径=全部',
      fields: '行业,样本数,平均影响率,碳费用合计(万),ECL增量合计(万),违约数',
      filterSnapshot: { context: 'analysis', year: 2040, scenarioCode: '', dim: 'industry', caliber: '' },
      fieldKeys: [],
      operator: '总行管理员',
      exportedAt: '2025-05-29 10:30:00',
      downloadFileName: '2024年度气候风险压测20250529103000.xlsx',
    },
    {
      id: 4,
      sourceKey: 'job-102',
      exportKind: 'DETAIL',
      taskCode: 'ST-TRANS-20250604002',
      taskName: '高耗能行业-现有政策压测（导入）',
      sourceType: 'STRESS_TRANS',
      exportType: '表格',
      fileFormat: 'Excel',
      scope: '压测明细（按筛选与所选字段）',
      filter: '场景=BASELINE，年份=全部，行业=全部，分行=全部，关键词=无，违约样本=全部',
      fields: '公司,情景,年份,影响率,碳排放费用(万),ECL(前),ECL(后),违约',
      filterSnapshot: { context: 'taskDetail', taskId: 2, filter: { keyword: '', scenarioCode: 'BASELINE', year: '', industry: '', branch: '', defaultOnly: '', summaryDim: 'industry' } },
      fieldKeys: ['companyName', 'scenarioName', 'testYear', 'impactRate', 'carbonCost', 'eclBefore', 'eclAfter', 'defaultFlag'],
      operator: '总行管理员',
      exportedAt: '2025-06-04 15:00:00',
      downloadFileName: '高耗能行业现有政策压测20250604150000.xlsx',
    },
    {
      id: 5,
      sourceKey: 'job-103',
      exportKind: 'SUMMARY',
      taskCode: 'ST-TRANS-20250604003',
      taskName: '2024年度三情景压测（引用）',
      sourceType: 'STRESS_TRANS',
      exportType: '表格',
      fileFormat: 'Excel',
      scope: '汇总结果（按分行）',
      filter: '场景=全部，年份=全部，维度=分行，口径=全部',
      fields: '分行,样本数,平均影响率,碳费用合计(万),ECL增量合计(万),违约数',
      filterSnapshot: { context: 'analysis', year: '', scenarioCode: '', dim: 'branch', caliber: '' },
      fieldKeys: [],
      operator: '总行管理员',
      exportedAt: '2025-05-29 11:10:00',
      downloadFileName: '2024年度三情景压测20250529111000.xlsx',
    },
    {
      id: 6,
      sourceKey: 'task-2',
      exportKind: 'OFFLINE',
      taskCode: 'CRST20250604002',
      taskName: '高耗能行业专项压测',
      sourceType: 'DATA_PROCESS',
      exportType: '表格',
      fileFormat: 'Excel',
      scope: '待线下处理清单（无法处理/需补算/待甄别）',
      filter: '共 4 条；无法处理 1 条；需计算 1 条；待甄别 3 条',
      fields: '记录ID,公司,客户号,信贷编号,分行,接口行业,国标代码,标准行业(可填),系统状态,原因,收入(万)(可填),成本收入比(可填),旅客吞吐量(可填),备注(可填)',
      filterSnapshot: { context: 'dataProcessOffline', taskId: 2, count: 4 },
      fieldKeys: [],
      operator: '总行管理员',
      exportedAt: '2025-06-04 09:20:00',
      downloadFileName: '高耗能行业专项压测20250604092000.xlsx',
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

  const STRESS_JOB_STATUS = {
    DRAFT: { text: '草稿', cls: 'tag-default' },
    READY: { text: '待压测', cls: 'tag-processing' },
    STRESSING: { text: '压测中', cls: 'tag-processing' },
    COMPLETED: { text: '已完成', cls: 'tag-success' },
  };

  const STRESS_DATA_SOURCE = {
    REF: { text: '引用数据处理', cls: 'tag-processing' },
    IMPORT: { text: '导入数据', cls: 'tag-default' },
  };

  let nextStressJobId = 310;

  function cloneFinancialRecords(source, count) {
    if (!source?.length || count <= 0) return [];
    const out = [];
    for (let i = 0; i < count; i++) {
      const tpl = source[i % source.length];
      const seq = i + 1;
      out.push({
        ...JSON.parse(JSON.stringify(tpl)),
        id: seq,
        companyName: count > source.length && i >= source.length
          ? `${tpl.companyName.replace(/（样本\d+）$/, '')}（样本${seq}）`
          : tpl.companyName,
        customerId: tpl.customerId ? `${String(tpl.customerId).replace(/-\d{3}$/, '')}-${String(seq).padStart(3, '0')}` : `CUST-${seq}`,
        creditNo: tpl.creditNo ? `${tpl.creditNo}-${String(seq).padStart(3, '0')}` : `LN-IMP-${String(seq).padStart(5, '0')}`,
      });
    }
    return out;
  }

  function countUsableFinancialRecords(recs) {
    return (recs || []).filter((r) => {
      if (r.excluded || r.dataAvailability === 'ABNORMAL' || r.dataAvailability === 'EXCLUDED' || r.dataAvailability === 'EXCLUDED_NO_REPORT') return false;
      return r.dataAvailability === 'USABLE' || r.dataAvailability === 'NEED_AVG';
    }).length;
  }

  let stressJobs = [
    {
      id: 101,
      methodKey: 'trans',
      jobName: '2025Q1现有政策压测（引用）',
      jobCode: 'ST-TRANS-20250601001',
      dataSource: 'REF',
      sourceTaskId: 1,
      sourceTaskName: '2025年一季度气候风险压测',
      recordCount: 128,
      usableCount: 125,
      reportPeriodStart: '2025-01-01',
      reportPeriodEnd: '2025-03-31',
      dataCaliber: '两种口径均输出',
      status: 'COMPLETED',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: true,
      eclFetched: true,
      selectedScenarioCodes: ['BASELINE'],
      createdAt: '2025-06-02 17:00:00',
      updatedAt: '2025-06-03 18:00:00',
    },
    {
      id: 102,
      methodKey: 'trans',
      jobName: '高耗能行业-现有政策压测（导入）',
      jobCode: 'ST-TRANS-20250604002',
      dataSource: 'IMPORT',
      sourceTaskId: null,
      sourceTaskName: null,
      recordCount: 856,
      usableCount: 842,
      reportPeriodStart: '2024-10-01',
      reportPeriodEnd: '2024-12-31',
      dataCaliber: '05财报',
      status: 'COMPLETED',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: true,
      eclFetched: true,
      selectedScenarioCodes: ['BASELINE'],
      createdAt: '2025-06-04 10:30:00',
      updatedAt: '2025-06-04 14:50:00',
    },
    {
      id: 103,
      methodKey: 'trans',
      jobName: '2024年度三情景压测（引用）',
      jobCode: 'ST-TRANS-20250604003',
      dataSource: 'REF',
      sourceTaskId: 4,
      sourceTaskName: '2024年度气候风险压测',
      recordCount: 96,
      usableCount: 94,
      reportPeriodStart: '2024-01-01',
      reportPeriodEnd: '2024-12-31',
      dataCaliber: '05财报',
      status: 'COMPLETED',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: true,
      eclFetched: true,
      selectedScenarioCodes: ['BASELINE', 'GREENHOUSE_WORLD', 'ORDERLY_TRANSITION'],
      createdAt: '2025-05-28 17:00:00',
      updatedAt: '2025-05-29 10:00:00',
    },
    {
      id: 104,
      methodKey: 'trans',
      jobName: '东部制造业专项（待执行）',
      jobCode: 'ST-TRANS-20250604004',
      dataSource: 'REF',
      sourceTaskId: 5,
      sourceTaskName: '东部制造业专项（待压测）',
      recordCount: 86,
      usableCount: 84,
      reportPeriodStart: '2025-01-01',
      reportPeriodEnd: '2025-06-30',
      dataCaliber: '07财报',
      status: 'READY',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: false,
      eclFetched: false,
      createdAt: '2025-06-04 16:00:00',
      updatedAt: '2025-06-04 16:00:00',
    },
    {
      id: 201,
      methodKey: 'phys',
      jobName: '2025Q1温室世界压测',
      jobCode: 'ST-PHYS-20250602001',
      dataSource: 'REF',
      sourceTaskId: 1,
      sourceTaskName: '2025年一季度气候风险压测',
      recordCount: 128,
      usableCount: 125,
      reportPeriodStart: '2025-01-01',
      reportPeriodEnd: '2025-03-31',
      dataCaliber: '两种口径均输出',
      status: 'COMPLETED',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: true,
      eclFetched: true,
      selectedScenarioCodes: ['GREENHOUSE_WORLD'],
      createdAt: '2025-06-03 09:00:00',
      updatedAt: '2025-06-03 16:30:00',
    },
    {
      id: 202,
      methodKey: 'phys',
      jobName: '2024年度温室世界压测',
      jobCode: 'ST-PHYS-20250604005',
      dataSource: 'REF',
      sourceTaskId: 4,
      sourceTaskName: '2024年度气候风险压测',
      recordCount: 96,
      usableCount: 94,
      reportPeriodStart: '2024-01-01',
      reportPeriodEnd: '2024-12-31',
      dataCaliber: '05财报',
      status: 'COMPLETED',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: true,
      eclFetched: true,
      selectedScenarioCodes: ['GREENHOUSE_WORLD'],
      createdAt: '2025-05-29 09:00:00',
      updatedAt: '2025-05-29 11:00:00',
    },
    {
      id: 203,
      methodKey: 'phys',
      jobName: '高碳组合物理风险（草稿）',
      jobCode: 'ST-PHYS-20250604006',
      dataSource: 'REF',
      sourceTaskId: 6,
      sourceTaskName: '高碳行业组合压测（进行中）',
      recordCount: 112,
      usableCount: 110,
      reportPeriodStart: '2024-07-01',
      reportPeriodEnd: '2025-06-30',
      dataCaliber: '两种口径均输出',
      status: 'DRAFT',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: false,
      eclFetched: false,
      createdAt: '2025-06-04 17:00:00',
      updatedAt: '2025-06-04 17:00:00',
    },
    {
      id: 301,
      methodKey: 'comp',
      jobName: '2025Q1有序转型压测',
      jobCode: 'ST-COMP-20250602002',
      dataSource: 'REF',
      sourceTaskId: 1,
      sourceTaskName: '2025年一季度气候风险压测',
      recordCount: 128,
      usableCount: 125,
      reportPeriodStart: '2025-01-01',
      reportPeriodEnd: '2025-03-31',
      dataCaliber: '两种口径均输出',
      status: 'COMPLETED',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: true,
      eclFetched: true,
      selectedScenarioCodes: ['ORDERLY_TRANSITION'],
      createdAt: '2025-06-03 11:00:00',
      updatedAt: '2025-06-03 17:45:00',
    },
    {
      id: 302,
      methodKey: 'comp',
      jobName: '2024年度有序转型压测',
      jobCode: 'ST-COMP-20250604007',
      dataSource: 'REF',
      sourceTaskId: 4,
      sourceTaskName: '2024年度气候风险压测',
      recordCount: 96,
      usableCount: 94,
      reportPeriodStart: '2024-01-01',
      reportPeriodEnd: '2024-12-31',
      dataCaliber: '05财报',
      status: 'COMPLETED',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: true,
      eclFetched: true,
      selectedScenarioCodes: ['ORDERLY_TRANSITION'],
      createdAt: '2025-05-29 13:00:00',
      updatedAt: '2025-05-29 15:20:00',
    },
    {
      id: 303,
      methodKey: 'comp',
      jobName: '有序转型压测（草稿）',
      jobCode: 'ST-COMP-20250604001',
      dataSource: 'REF',
      sourceTaskId: 1,
      sourceTaskName: '2025年一季度气候风险压测',
      recordCount: 128,
      usableCount: 125,
      reportPeriodStart: '2025-01-01',
      reportPeriodEnd: '2025-03-31',
      dataCaliber: '两种口径均输出',
      status: 'DRAFT',
      factorVersion: 'F-V1.0',
      scenarioVersion: 'S-V1.0',
      creditFetched: false,
      eclFetched: false,
      createdAt: '2025-06-04 11:00:00',
      updatedAt: '2025-06-04 11:00:00',
    },
  ];

  const _baseRecords = recordsByTask[1] || [];
  const _importCompanies = DEMO_STRESS_COMPANIES.slice(0, 10);
  let stressRecordsByJob = {
    101: cloneFinancialRecords(_baseRecords, 128),
    102: cloneFinancialRecords(_baseRecords, 856),
    103: cloneFinancialRecords(recordsByTask[4] || _baseRecords, 96),
    104: cloneFinancialRecords(recordsByTask[5] || _baseRecords, 86),
    201: cloneFinancialRecords(_baseRecords, 128),
    202: cloneFinancialRecords(recordsByTask[4] || _baseRecords, 96),
    203: cloneFinancialRecords(recordsByTask[6] || _baseRecords, 112),
    301: cloneFinancialRecords(_baseRecords, 128),
    302: cloneFinancialRecords(recordsByTask[4] || _baseRecords, 96),
    303: cloneFinancialRecords(_baseRecords, 128),
  };

  let stressCreditByJob = {
    101: creditByTask[1] ? JSON.parse(JSON.stringify(creditByTask[1])) : [],
    102: _importCompanies.map((c, i) => demoCreditRow(c, i + 1)),
    103: creditByTask[4] ? JSON.parse(JSON.stringify(creditByTask[4])) : [],
    201: creditByTask[1] ? JSON.parse(JSON.stringify(creditByTask[1])) : [],
    202: creditByTask[4] ? JSON.parse(JSON.stringify(creditByTask[4])) : [],
    301: creditByTask[1] ? JSON.parse(JSON.stringify(creditByTask[1])) : [],
    302: creditByTask[4] ? JSON.parse(JSON.stringify(creditByTask[4])) : [],
  };
  let stressEclByJob = {
    101: eclByTask[1] ? JSON.parse(JSON.stringify(eclByTask[1])) : [],
    102: _importCompanies.map((c, i) => demoEclRow(c, i + 1)),
    103: eclByTask[4] ? JSON.parse(JSON.stringify(eclByTask[4])) : [],
    201: eclByTask[1] ? JSON.parse(JSON.stringify(eclByTask[1])) : [],
    202: eclByTask[4] ? JSON.parse(JSON.stringify(eclByTask[4])) : [],
    301: eclByTask[1] ? JSON.parse(JSON.stringify(eclByTask[1])) : [],
    302: eclByTask[4] ? JSON.parse(JSON.stringify(eclByTask[4])) : [],
  };
  let stressResultsByJob = {
    101: buildStressDemoResults({ companies: DEMO_STRESS_COMPANIES, scenarioCodes: ['BASELINE'] }),
    102: buildStressDemoResults({ companies: _importCompanies, scenarioCodes: ['BASELINE'], seed: 5, impactBase: 0.065 }),
    103: buildStressDemoResults({ companies: DEMO_STRESS_COMPANIES.slice(0, 10), seed: 2, impactBase: 0.055 }),
    201: buildStressDemoResults({ companies: DEMO_STRESS_COMPANIES, scenarioCodes: ['GREENHOUSE_WORLD'] }),
    202: buildStressDemoResults({ companies: DEMO_STRESS_COMPANIES.slice(0, 10), scenarioCodes: ['GREENHOUSE_WORLD'], seed: 3 }),
    301: buildStressDemoResults({ companies: DEMO_STRESS_COMPANIES, scenarioCodes: ['ORDERLY_TRANSITION'] }),
    302: buildStressDemoResults({ companies: DEMO_STRESS_COMPANIES.slice(0, 10), scenarioCodes: ['ORDERLY_TRANSITION'], seed: 4 }),
  };

  let stressJobLogs = {
    101: [
      { time: '2025-06-03 18:00:00', action: '场景压测：压测执行完成，180 行结果', operator: '总行管理员' },
      { time: '2025-06-03 17:28:00', action: '场景压测：调取信贷/ECL 数据', operator: '总行管理员' },
      { time: '2025-06-02 17:00:00', action: '新建压测任务：引用数据处理任务「2025年一季度气候风险压测」，128 条', operator: '总行管理员' },
    ],
    102: [
      { time: '2025-06-04 14:50:00', action: '场景压测：压测执行完成，150 行结果', operator: '总行管理员' },
      { time: '2025-06-04 11:00:00', action: '场景压测：调取信贷/ECL 数据', operator: '总行管理员' },
      { time: '2025-06-04 10:30:00', action: '新建压测任务：导入财务数据 856 条', operator: '总行管理员' },
    ],
    103: [
      { time: '2025-05-29 10:00:00', action: '场景压测：压测执行完成，450 行结果', operator: '总行管理员' },
      { time: '2025-05-28 17:00:00', action: '新建压测任务：引用数据处理任务「2024年度气候风险压测」，96 条', operator: '总行管理员' },
    ],
    104: [
      { time: '2025-06-04 16:00:00', action: '新建压测任务：引用数据处理任务「东部制造业专项（待压测）」，86 条', operator: '总行管理员' },
    ],
    201: [
      { time: '2025-06-03 16:30:00', action: '场景压测：压测执行完成，180 行结果', operator: '总行管理员' },
      { time: '2025-06-03 10:00:00', action: '场景压测：调取信贷/ECL 数据', operator: '总行管理员' },
      { time: '2025-06-03 09:00:00', action: '新建压测任务：引用数据处理任务，128 条', operator: '总行管理员' },
    ],
    202: [
      { time: '2025-05-29 11:00:00', action: '场景压测：压测执行完成，150 行结果', operator: '总行管理员' },
      { time: '2025-05-29 09:00:00', action: '新建压测任务：引用数据处理任务「2024年度气候风险压测」，96 条', operator: '总行管理员' },
    ],
    301: [
      { time: '2025-06-03 17:45:00', action: '场景压测：压测执行完成，180 行结果', operator: '总行管理员' },
      { time: '2025-06-03 12:00:00', action: '场景压测：调取信贷/ECL 数据', operator: '总行管理员' },
      { time: '2025-06-03 11:00:00', action: '新建压测任务：引用数据处理任务，128 条', operator: '总行管理员' },
    ],
    302: [
      { time: '2025-05-29 15:20:00', action: '场景压测：压测执行完成，150 行结果', operator: '总行管理员' },
      { time: '2025-05-29 13:00:00', action: '新建压测任务：引用数据处理任务「2024年度气候风险压测」，96 条', operator: '总行管理员' },
    ],
  };

  function addStressJobLog(jobId, action, operator) {
    if (!stressJobLogs[jobId]) stressJobLogs[jobId] = [];
    stressJobLogs[jobId].unshift({
      time: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
      action,
      operator: operator || '总行管理员',
    });
  }

  function allocStressJobId() {
    nextStressJobId += 1;
    return nextStressJobId;
  }

  return {
    STATUS_MAP,
    AVAIL_MAP,
    CONFIG_STATUS,
    DATA_CALIBER_OPTIONS,
    SCENE_TYPE_OPTIONS,
    STRESS_PURPOSE_OPTIONS,
    EXPORT_SOURCE_LABELS,
    INDUSTRY_AMBIGUITY_RULES,
    LOAN_CLASSIFICATION_LABELS,
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
    carbonEmissionRows,
    nextId,
    genCode,
    addLog,
    getPublishedScenarioVersion,
    getActiveFactorVersion,
    getFactorVersionCatalog,
    suggestFactorVersionByReportEnd,
    formatFactorVersionDisplay,
    getActiveMappingVersion,
    STRESS_JOB_STATUS,
    STRESS_DATA_SOURCE,
    stressJobs,
    stressRecordsByJob,
    stressCreditByJob,
    stressEclByJob,
    stressResultsByJob,
    stressJobLogs,
    nextStressJobId,
    cloneFinancialRecords,
    countUsableFinancialRecords,
    addStressJobLog,
    allocStressJobId,
    CARBON: typeof window !== 'undefined' ? window.CRST_CARBON : null,
  };
})();
