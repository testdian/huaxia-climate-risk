/**
 * 华夏银行 — 碳排放费用与转型风险压测计算逻辑
 * 来源：华夏银行碳排放费用计算逻辑整理.docx
 */
window.CRST_CARBON = (function () {
  /** 行业碳排放因子（吨 CO₂e / 百万元），除机场外 */
  const INDUSTRY_EMISSION_FACTORS = [
    { code: 'EMISSION_D4411', name: '火力发电-燃煤', gbCode: 'D4411', industry: '电力', subType: '燃煤发电', value: 1974.5277, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_D4412', name: '火力发电-热电', gbCode: 'D4412', industry: '电力', subType: '热电联产', value: 1387.5118, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_GRID_S', name: '电网-南方线损', gbCode: 'D4420', industry: '电力', subType: '南方电网线损', value: 33.4663, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_GRID_O', name: '电网-其他地区线损', gbCode: 'D4420', industry: '电力', subType: '其他地区电网线损', value: 44.24, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_G5631', name: '机场吞吐量', gbCode: 'G5631', industry: '航空', subType: '机场', value: 33.8408, unit: 'tCO2e/万人次' },
    { code: 'EMISSION_C2511_A', name: '石化-开采炼化', gbCode: 'C2511', industry: '石化', subType: '自行开采原油并加工', value: 56.284, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_C2511_B', name: '石化-采购炼化', gbCode: 'C2511', industry: '石化', subType: '采购原油并加工', value: 92.6849, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_C3041_A', name: '平板玻璃-浮法', gbCode: 'C3041', industry: '建材', subType: '浮法工艺', value: 219.0277, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_C3041_B', name: '平板玻璃-综合', gbCode: 'C3041', industry: '建材', subType: '平板玻璃和其他', value: 73.7087, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_PAPER_A', name: '造纸-生活用纸', gbCode: 'C2221', industry: '造纸', subType: '生活用纸', value: 62.9665, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_PAPER_B', name: '造纸-其他', gbCode: 'C2211', industry: '造纸', subType: '其他造纸', value: 185.7315, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_C261_IN', name: '化工-无机原料', gbCode: 'C2611', industry: '化工', subType: 'C2611-C2613', value: 674.777, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_C2614', name: '化工-有机原料', gbCode: 'C2614', industry: '化工', subType: '有机化学原料', value: 150.2545, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_C262', name: '化工-肥料', gbCode: 'C2621', industry: '化工', subType: '肥料制造', value: 399.9215, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_C263', name: '化工-农药', gbCode: 'C2631', industry: '化工', subType: '农药制造', value: 94.6547, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_CHEM_O', name: '化工-其他', gbCode: 'C2651', industry: '化工', subType: 'C265/C2619', value: 197.3447, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_C3011', name: '水泥制造', gbCode: 'C3011', industry: '建材', subType: '水泥', value: 2001.1126, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_STEEL', name: '钢铁', gbCode: 'C3110', industry: '钢铁', subType: '炼铁炼钢压延', value: 358.347, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_CU', name: '铜冶炼', gbCode: 'C3211', industry: '有色', subType: '铜冶炼', value: 23.0207, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_AL', name: '铝冶炼', gbCode: 'C3216', industry: '有色', subType: '铝冶炼', value: 491.0012, unit: 'tCO2e/百万元' },
    { code: 'EMISSION_AVIATION', name: '航空燃油', gbCode: 'G5611', industry: '航空', subType: '航空运输', value: 162.7595, unit: 'tCO2e/百万元' },
  ];

  /** GB/T 4754 高碳行业分类 */
  const HIGH_CARBON_INDUSTRY_CLASS = [
    { gbCode: 'D4411', name: '火力发电', category: '电力' },
    { gbCode: 'D4412', name: '热电联产', category: '电力' },
    { gbCode: 'D4420', name: '电力供应', category: '电力' },
    { gbCode: 'C3011', name: '水泥制造', category: '建材' },
    { gbCode: 'C3041', name: '平板玻璃制造', category: '建材' },
    { gbCode: 'C3110', name: '炼铁', category: '钢铁' },
    { gbCode: 'C3120', name: '炼钢', category: '钢铁' },
    { gbCode: 'C3130', name: '钢压延加工', category: '钢铁' },
    { gbCode: 'C3216', name: '铝冶炼', category: '有色' },
    { gbCode: 'C3211', name: '铜冶炼', category: '有色' },
    { gbCode: 'C2511', name: '原油加工及石油制品制造', category: '石化' },
    { gbCode: 'C2611', name: '无机酸制造', category: '化工' },
    { gbCode: 'C2614', name: '有机化学原料制造', category: '化工' },
    { gbCode: 'C2621', name: '氮肥制造', category: '化工' },
    { gbCode: 'C2631', name: '化学农药制造', category: '化工' },
    { gbCode: 'C2651', name: '初级形态塑料及合成树脂制造', category: '化工' },
    { gbCode: 'C2211', name: '木竹浆制造', category: '造纸' },
    { gbCode: 'C2221', name: '机制纸及纸板制造', category: '造纸' },
    { gbCode: 'G5611', name: '航空旅客运输', category: '航空' },
    { gbCode: 'G5631', name: '机场', category: '航空' },
  ];

  /** 转型情景：免费配额比例（文档表） */
  const TRANSITION_SCENARIOS = {
    BASELINE: {
      code: 'BASELINE',
      name: '现有政策（基准）',
      freeQuota2025: 1.0,
      freeQuota2040: 0.75,
      carbonPrice2025: 80,
      carbonPrice2040: 150,
    },
    GREENHOUSE_WORLD: {
      code: 'GREENHOUSE_WORLD',
      name: '温室世界',
      freeQuota2025: 1.0,
      freeQuota2040: 0.85,
      carbonPrice2025: 80,
      carbonPrice2040: 120,
    },
    ORDERLY_TRANSITION: {
      code: 'ORDERLY_TRANSITION',
      name: '有序转型',
      freeQuota2025: 1.0,
      freeQuota2040: 0.55,
      carbonPrice2025: 80,
      carbonPrice2040: 200,
    },
  };

  const CCUS_INDUSTRIES = ['电力', '建材', '石化', '造纸', '有色', '钢铁'];
  const CCUS_PRICE_CAP = 500;
  const TAX_RATE = 0.75;
  const HIGH_CARBON_CATEGORIES = ['电力', '建材', '钢铁', '石化', '化工', '造纸', '航空', '有色'];

  /** 细分测试行业 → 排放因子编码（行业甄别后） */
  const TEST_INDUSTRY_FACTOR_CODES = {
    平板玻璃: 'EMISSION_C3041_B',
    '平板玻璃（仅浮法）': 'EMISSION_C3041_A',
    开采原油加工炼化: 'EMISSION_C2511_A',
    采购原油加工炼化: 'EMISSION_C2511_B',
    '造纸（生活用纸）': 'EMISSION_PAPER_A',
    '造纸（其他）': 'EMISSION_PAPER_B',
    机场企业: 'EMISSION_G5631',
    机场: 'EMISSION_G5631',
  };

  function normalizeFactorLib(factorLibrary) {
    return (factorLibrary || INDUSTRY_EMISSION_FACTORS).map((f) => ({
      code: f.code || f.factorCode,
      name: f.name || f.factorName,
      industry: f.industry,
      subType: f.subType,
      gbCode: f.gbCode,
      value: f.value ?? f.factorValue,
      unit: f.unit,
      status: f.status,
    })).filter((f) => f.code && f.status !== 'DISABLED');
  }

  function resolveRecordIndustryMajor(record) {
    const IS = typeof window !== 'undefined' ? window.CRST_INDUSTRY_SELECTOR : null;
    if (IS?.resolveTestIndustryMajor) {
      return IS.resolveTestIndustryMajor(record.standardIndustry, record.gbIndustryCode);
    }
    return record.standardIndustry || '';
  }

  function findEmissionFactor(record, factorLibrary) {
    const lib = normalizeFactorLib(factorLibrary);
    const pool = lib.length ? lib : INDUSTRY_EMISSION_FACTORS;
    if (record.emissionFactorCode) {
      const f = pool.find((x) => (x.code || x.factorCode) === record.emissionFactorCode);
      if (f) return f;
    }
    const granularCode = TEST_INDUSTRY_FACTOR_CODES[record.standardIndustry];
    if (granularCode) {
      const f = pool.find((x) => (x.code || x.factorCode) === granularCode);
      if (f) return f;
    }
    if (record.gbIndustryCode) {
      const gbMatches = pool.filter((x) => x.gbCode === record.gbIndustryCode);
      if (gbMatches.length === 1) return gbMatches[0];
      if (gbMatches.length > 1 && record.standardIndustry) {
        const subHit = gbMatches.find((x) => x.subType && record.standardIndustry.includes(String(x.subType).slice(0, 2)));
        if (subHit) return subHit;
      }
      if (gbMatches.length > 1) return gbMatches[0];
    }
    const major = resolveRecordIndustryMajor(record);
    if (major) {
      const majorMatches = pool.filter((x) => x.industry === major);
      if (majorMatches.length === 1) return majorMatches[0];
      if (majorMatches.length > 1 && record.gbIndustryCode) {
        const gbHit = majorMatches.find((x) => x.gbCode === record.gbIndustryCode);
        if (gbHit) return gbHit;
      }
    }
    return pool.find((x) => (x.code || x.factorCode) === 'EMISSION_CHEM_O') || pool[0];
  }

  /** 企业碳排放因子 = 基期排放量 / 营业收入（百万元） */
  function companyEmissionFactor(baseEmission, revenue) {
    if (!revenue || revenue <= 0) return null;
    return baseEmission / revenue;
  }

  function calcEmission(revenue, emissionFactor, record, factorLibrary) {
    if (record.baseCarbonEmission != null && record.basePeriodRevenue) {
      const ef = companyEmissionFactor(record.baseCarbonEmission, record.basePeriodRevenue);
      return revenue * ef;
    }
    const f = emissionFactor || findEmissionFactor(record, factorLibrary);
    if (!f) return 0;
    if (f.unit === 'tCO2e/万人次' && record.passengerThroughput) {
      return record.passengerThroughput * f.value;
    }
    return revenue * f.value;
  }

  /** 碳排放费用（万元），碳价单位：元/吨 */
  function calcCarbonCost(emissionTon, freeQuotaRatio, carbonPriceYuan, record) {
    const payableRatio = 1 - freeQuotaRatio;
    let price = carbonPriceYuan;
    const ind = resolveRecordIndustryMajor(record) || findEmissionFactor(record, options?.factorLibrary)?.industry;
    const ccusEligible = CCUS_INDUSTRIES.includes(ind) && record.baseNetProfitPositive !== false;
    if (ccusEligible && price >= CCUS_PRICE_CAP) price = CCUS_PRICE_CAP;
    return (emissionTon * payableRatio * price) / 10000;
  }

  /** 线性插值：起始年—结束年免费配额 */
  function interpolateQuotaRange(startYear, endYear, quotaStart, quotaEnd, testYear) {
    if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || startYear === endYear) {
      return quotaStart;
    }
    if (testYear <= startYear) return quotaStart;
    if (testYear >= endYear) return quotaEnd;
    const t = (testYear - startYear) / (endYear - startYear);
    return quotaStart + t * (quotaEnd - quotaStart);
  }

  /** 线性插值 2025-2040 免费配额 */
  function interpolateQuota(scenario, testYear) {
    return interpolateQuotaRange(2025, 2040, scenario.freeQuota2025, scenario.freeQuota2040, testYear);
  }

  function interpolateCarbonPrice(scenario, testYear) {
    if (testYear <= 2025) return scenario.carbonPrice2025;
    if (testYear >= 2040) return scenario.carbonPrice2040;
    const t = (testYear - 2025) / (2040 - 2025);
    return scenario.carbonPrice2025 + t * (scenario.carbonPrice2040 - scenario.carbonPrice2025);
  }

  /**
   * 单公司单情景压测（简化一期：基期收入 → 2040 测试年）
   */
  function runCompanyStress(record, scenarioCode, options) {
    const scenario = TRANSITION_SCENARIOS[scenarioCode] || TRANSITION_SCENARIOS.BASELINE;
    const testYear = options?.testYear ?? 2040;
    const revenueGrowth = options?.revenueGrowth ?? options?.industryGrowthRate ?? 0.02;

    const revenue0 = record.revenue ?? record.avgRevenue ?? 100000;
    let revenue = revenue0;
    for (let y = 2026; y <= testYear; y++) revenue *= 1 + revenueGrowth;

    const emission = calcEmission(revenue, null, record, options?.factorLibrary);
    const freeQuota = options?.freeQuotaRatio ?? interpolateQuota(scenario, testYear);
    const carbonPrice = options?.carbonPrice ?? interpolateCarbonPrice(scenario, testYear);
    const carbonCost = calcCarbonCost(emission, freeQuota, carbonPrice, record);

    const costIncomeRatio = record.costIncomeRatio ?? 0.85;
    const isHighCarbon = HIGH_CARBON_CATEGORIES.includes(resolveRecordIndustryMajor(record));
    const operatingExpense = isHighCarbon
      ? revenue * costIncomeRatio + carbonCost
      : revenue * costIncomeRatio;

    const profitBeforeTax = revenue - operatingExpense;
    const netProfit = profitBeforeTax > 0 ? profitBeforeTax * TAX_RATE : profitBeforeTax;

    const eclBefore = record.eclAmount ?? revenue0 * 0.02;
    const impactRate = revenue0 > 0 ? carbonCost / revenue0 : 0;
    const revenueAfter = revenue - carbonCost;
    const eclAfter = eclBefore * (1 + Math.min(impactRate * 2, 0.5));

    const alr0 = record.assetLiabilityRatio ?? 0.65;
    const defaultFlag = checkDefault(alr0, netProfit, record.totalAssets);

    return {
      scenarioCode: scenario.code,
      scenarioName: scenario.name,
      testYear,
      revenueBefore: Math.round(revenue0),
      revenueAfter: Math.round(revenueAfter),
      carbonEmission: Math.round(emission * 100) / 100,
      carbonCost: Math.round(carbonCost * 100) / 100,
      freeQuotaRatio: Math.round(freeQuota * 10000) / 10000,
      carbonPrice,
      netProfitAfter: Math.round(netProfit * 100) / 100,
      eclBefore: Math.round(eclBefore),
      eclAfter: Math.round(eclAfter),
      impactRate: Math.round(impactRate * 10000) / 10000,
      defaultFlag,
      emissionFactorUsed: findEmissionFactor(record, options?.factorLibrary)?.code
        || findEmissionFactor(record, options?.factorLibrary)?.factorCode,
    };
  }

  function checkDefault(alr0, netProfit, totalAssets) {
    if (totalAssets === 0) return true;
    const alr1 = alr0 + (netProfit < 0 ? 0.15 : -0.02);
    if (alr0 < 1 && alr1 >= 1) return true;
    if (alr0 >= 1 && alr1 >= alr0 * 1.2) return true;
    return false;
  }

  function buildFactorLibraryRows() {
    return INDUSTRY_EMISSION_FACTORS.map((f, i) => ({
      id: i + 1,
      factorCode: f.code,
      factorName: f.name,
      industry: f.industry,
      subType: f.subType,
      scenarioType: 'EMISSION',
      factorValue: f.value,
      unit: f.unit,
      gbCode: f.gbCode,
      version: 'V2.0-行内方法',
      status: 'ENABLED',
      effectiveFrom: '2025-01-01',
      updatedAt: '2025-06-04',
    }));
  }

  function buildScenarioRows() {
    return [
      {
        id: 1,
        scenarioCode: 'BASELINE',
        scenarioName: '现有政策（基准）',
        scenarioType: 'TRANSITION',
        formula: '碳排放费用_t = 碳排放量_t × (1 - 免费配额比例_t) × 碳价_t；营业支出_t = 营业收入_t × 成本收入比 + 碳排放费用_t',
        inputFields: 'revenue, industryEmissionFactor, freeQuotaRatio, carbonPrice, costIncomeRatio',
        outputFields: 'carbonEmission, carbonCost, netProfit, eclAfter, defaultFlag',
        version: 'V2.0-行内方法',
        status: 'PUBLISHED',
        publishedAt: '2025-06-04',
      },
      {
        id: 2,
        scenarioCode: 'GREENHOUSE_WORLD',
        scenarioName: '温室世界',
        scenarioType: 'TRANSITION',
        formula: '2040免费配额85%；碳排放量_t = 营业收入_t × 行业因子',
        inputFields: 'revenue, industryEmissionFactor, freeQuotaRatio(2040=0.85)',
        outputFields: 'carbonCost, netProfit, impactRate',
        version: 'V2.0-行内方法',
        status: 'PUBLISHED',
        publishedAt: '2025-06-04',
      },
      {
        id: 3,
        scenarioCode: 'ORDERLY_TRANSITION',
        scenarioName: '有序转型',
        scenarioType: 'TRANSITION',
        formula: '2040免费配额55%；碳价与配额按测试年线性插值',
        inputFields: 'revenue, industryEmissionFactor, freeQuotaRatio(2040=0.55)',
        outputFields: 'carbonCost, netProfit, impactRate',
        version: 'V2.0-行内方法',
        status: 'PUBLISHED',
        publishedAt: '2025-06-04',
      },
    ];
  }

  function buildGbMappings() {
    return HIGH_CARBON_INDUSTRY_CLASS.map((c, i) => ({
      id: i + 1,
      apiIndustry: `${c.gbCode} ${c.name}`,
      standardIndustry: c.category,
      gbCode: c.gbCode,
      mappingType: 'GB/T4754',
      status: 'ENABLED',
      version: 'V2.0-行内方法',
      updatedAt: '2025-06-04',
    }));
  }

  return {
    INDUSTRY_EMISSION_FACTORS,
    HIGH_CARBON_INDUSTRY_CLASS,
    TRANSITION_SCENARIOS,
    findEmissionFactor,
    calcEmission,
    calcCarbonCost,
    interpolateQuota,
    interpolateQuotaRange,
    interpolateCarbonPrice,
    runCompanyStress,
    buildFactorLibraryRows,
    buildScenarioRows,
    buildGbMappings,
    isHighCarbonIndustry: (ind, gbCode) => {
      const IS = typeof window !== 'undefined' ? window.CRST_INDUSTRY_SELECTOR : null;
      const major = IS?.resolveTestIndustryMajor ? IS.resolveTestIndustryMajor(ind, gbCode) : ind;
      return HIGH_CARBON_CATEGORIES.includes(major);
    },
  };
})();
