/**
 * 气候风险压测 — 完整版原型（含 CRUD 与状态流转）
 */
(function () {
  const S = window.CRST_STORE;
  const {
    STATUS_MAP, AVAIL_MAP, CONFIG_STATUS,
    DATA_CALIBER_OPTIONS, SCENE_TYPE_OPTIONS, STRESS_PURPOSE_OPTIONS, EXPORT_SOURCE_LABELS, INDUSTRY_AMBIGUITY_RULES, LOAN_CLASSIFICATION_LABELS,
    STRESS_JOB_STATUS, STRESS_DATA_SOURCE,
    tasks, recordsByTask, avgByTask, creditByTask, eclByTask, resultsByTask, taskLogs,
    stressJobs, stressRecordsByJob, stressCreditByJob, stressEclByJob, stressResultsByJob, stressJobLogs,
    nextStressJobId, cloneFinancialRecords, countUsableFinancialRecords, addStressJobLog, allocStressJobId,
    factors, scenarios, mappings, exportLogs, carbonEmissionRows, nextId, genCode, addLog,
    getPublishedScenarioVersion, getActiveFactorVersion, getActiveMappingVersion,
    getFactorVersionCatalog, suggestFactorVersionByReportEnd, formatFactorVersionDisplay,
  } = S;

  let currentPage = 'data-process';
  let currentTaskId = null;
  let taskDraftMode = false;
  let taskEditMode = false;
  let taskViewMode = false;
  let detailStep = 0;
  /** 压测任务详情步骤：0数据处理 1财务传导 2PD/LGD 3不良拨备 */
  let stressJobDetailStep = 1;
  /** 数据处理模块内子步骤：0任务概览 1财务数据（详情页 Tab） */
  let dataProcessTab = 0;
  /** 数据处理：true=任务列表，false=任务详情 */
  let dataProcessListMode = true;
  /** 压测流水线：true=任务列表，false=压测详情 */
  let stressJobListMode = true;
  let currentStressJobId = null;
  let pendingCreateStressJob = null;
  let createStressJobFromPage = 'scenario-analysis';
  const STRESS_IMPORT_FILE_SPECS = [
    { key: 'customerBasic', label: '高碳行业客户基础信息表', fileName: '高碳行业客户基础信息表.xlsx' },
    { key: 'internalPd', label: '无财务数据客户内部 PD/LGD', fileName: '无财务数据客户内部PD_LGD.xlsx' },
    { key: 'bankBasic', label: '参试银行基础信息表', fileName: '参试银行基础信息表.xlsx' },
    { key: 'bankCapital', label: '参试银行资本与拨备监管指标', fileName: '参试银行资本与拨备监管指标.xlsx' },
  ];
  let stressImportFiles = {};
  /** 财务传导结果：jobId -> { scenarioCode, years, rows } */
  let stressFinTransByJob = {};
  const stressJobFilters = { name: '', status: '', sourceTaskId: '', periodStart: '', periodEnd: '' };
  /** 压测流水线步骤页（左侧菜单 ②③④） */
  const STRESS_STEP_PAGES = {
    'scenario-analysis': { pageId: 'scenario-analysis', stepIndex: 1, title: '情景分析', listTitle: '气候风险压测 — 情景分析' },
    'stress-fin-trans': { pageId: 'stress-fin-trans', stepIndex: 1, title: '财务传导', listTitle: '气候风险压测 — 财务传导' },
    'stress-pd-lgd': { pageId: 'stress-pd-lgd', stepIndex: 2, title: 'PD/LGD计算', listTitle: 'PD/LGD计算' },
    'stress-npl-prov': { pageId: 'stress-npl-prov', stepIndex: 3, title: '不良和拨备计算', listTitle: '不良和拨备计算' },
  };
  const STRESS_JOB_STEP_LABELS = ['数据处理', '财务传导', 'PD/LGD计算', '不良和拨备计算'];
  const STRESS_SCENARIO_OPTIONS = [
    { code: 'BASELINE', label: '现有政策' },
    { code: 'GREENHOUSE_WORLD', label: '温室世界' },
    { code: 'ORDERLY_TRANSITION', label: '有序转型' },
  ];
  /** 当前模块上下文（流程拆分到各一级菜单） */
  let moduleContext = null;
  const MODULE_FLOW_PAGES = new Set(['data-process', 'scenario-analysis', 'stress-fin-trans', 'stress-pd-lgd', 'stress-npl-prov']);
  const TAB_TO_STEP = { overview: 0, sync: 1, process: 2, external: 3, stress: 3, result: 4, log: 5 };
  let taskFilters = { name: '', reportYear: '', loanType: '', loanRegion: '' };
  const LIST_PAGE_SIZES = [10, 20, 50, 100];
  const listPagers = {};
  /** 任务详情同步清单状态筛选：taskId -> '' | USABLE | NEED_AVG | ABNORMAL */
  const syncListFilters = {};
  /** 任务详情压测结果筛选：taskId -> filters */
  const taskResultFilters = {};
  let exportFilters = { fileName: '', moduleName: '' };

  const EXPORT_MODULE_OPTIONS = [
    '数据处理',
    '情景分析',
    '压测结果分析',
    '财务传导',
    '不良和拨备计算',
    'PD/LGD计算',
  ];
  let carbonEmissionEditId = null;
  let pendingRiskPushTaskId = null;
  let pendingRiskPushWarnings = null;
  let pendingRegulatoryReportTaskId = null;
  const SYNC_STATUS_TEXT = {
    USABLE: '可使用',
    NEED_AVG: '需计算',
    ABNORMAL: '无法处理',
    EXCLUDED: '已排除',
    EXCLUDED_NO_REPORT: '已排除逐户判定',
  };
  const LOAN_REGION_LABELS = { DOMESTIC: '境内', OVERSEAS: '境外' };
  const BAD_LOAN_CLASSES = new Set(['SUBSTANDARD', 'DOUBTFUL', 'LOSS']);
  let modalState = null;
  let pendingDataProcessImportTaskId = null;
  let dataProcessImportFilePicked = false;
  let pendingBankBasicImportTaskId = null;
  let pendingBankCapitalEditTaskId = null;
  let pendingGhgEditTaskId = null;
  let pendingInternalPdImportTaskId = null;
  let internalPdImportFilePicked = false;
  let bankBasicImportFilePicked = false;
  let pendingConfirmDeleteFn = null;
  let toastTimer = null;
  let taskLogDrawerOpen = false;
  /** 基本信息 — 涉及行业级联选择状态 */
  let industryPickerState = null;

  let airportThroughputRows = [
    { id: 1, airportName: '华南机场运营有限公司', airportCode: 'CAN', year: 2024, passengerThroughput: 6350, cargoThroughput: 205, source: '机场运营数据接口', status: 'ENABLED', updatedAt: '2025-06-04' },
    { id: 2, airportName: '华东枢纽机场股份', airportCode: 'SHA', year: 2024, passengerThroughput: 4720, cargoThroughput: 168, source: '手工维护', status: 'ENABLED', updatedAt: '2025-06-04' },
  ];
  let nextAirportThroughputId = 10;
  let airportThroughputEditId = null;

  const TASK_EDITABLE = ['DRAFT', 'SYNCING', 'PENDING_DISAMBIG', 'PENDING_CONFIRM', 'PROCESSING', 'READY_STRESS', 'STRESSING', 'COMPLETED'];
  const STEP_ORDER = ['DRAFT', 'SYNCING', 'PENDING_DISAMBIG', 'PENDING_CONFIRM', 'PROCESSING', 'READY_STRESS', 'STRESSING', 'COMPLETED', 'ARCHIVED'];
  const STEP_LABELS = ['创建任务', '数据同步与确认', '数据处理', '场景压测', '压测结果', '应用报送'];

  const REGULATORY_REPORT_FILES = [
    { name: '压力测试结果汇总表.xlsx', desc: '按人民银行模板汇总的压测结果指标' },
    { name: '违约调整明细表.xlsx', desc: '高碳行业客户违约调整明细（现有政策/温室世界/有序转型）' },
  ];

  const REGULATORY_SCENARIO_COLS = [
    { code: 'BASELINE', label: '现有政策' },
    { code: 'GREENHOUSE_WORLD', label: '温室世界' },
    { code: 'ORDERLY_TRANSITION', label: '有序转型' },
  ];

  const DEFAULT_CRITERIA_RULES = [
    '对于基期资产负债率低于100%的企业，如在测试过程中资产负债率超过100%，则判定违约，对应贷款计入不良贷款；',
    '对于基期资产负债率大于等于100%的企业，如在测试过程中资产负债率增幅超过20%，则判定违约，对应贷款计入不良贷款；',
    '当企业资产总计等于0时，判定违约，对应贷款计入不良贷款。',
  ];

  function getResultDefaultCriteria(t) {
    const c = t?.resultDefaultCriteria || {};
    return {
      assetLiabilityRatio: c.assetLiabilityRatio ?? 0.65,
      baseNetProfit: c.baseNetProfit ?? 0,
    };
  }

  function evalDefaultFromRules(r, rec, criteria) {
    const totalAssets = rec?.totalAssets ?? r.totalAssets;
    if (totalAssets === 0) {
      return {
        defaultFlag: true,
        defaultReason: '资产总计=0',
        assetLiabilityRatioBefore: r.assetLiabilityRatioBefore ?? rec?.assetLiabilityRatio ?? criteria.assetLiabilityRatio,
        assetLiabilityRatioAfter: r.assetLiabilityRatioAfter ?? 1,
        alrIncreasePct: 0,
        postStatus: 'SUBSTANDARD',
      };
    }
    const alr0 = r.assetLiabilityRatioBefore ?? rec?.assetLiabilityRatio ?? criteria.assetLiabilityRatio ?? 0.65;
    const netProfitAfter = r.netProfitAfter ?? calcResultFinancials(r).netProfit ?? criteria.baseNetProfit ?? 0;
    const alr1 = r.assetLiabilityRatioAfter ?? (alr0 + (netProfitAfter < 0 ? 0.15 : -0.02));
    const alrIncreasePct = alr0 >= 1 ? (alr1 - alr0) / alr0 : 0;
    let defaultFlag = false;
    let defaultReason = '';
    if (alr0 < 1 && alr1 >= 1) {
      defaultFlag = true;
      defaultReason = '压测后资产负债率>100%（基期<100%）';
    } else if (alr0 >= 1 && alr1 >= alr0 * 1.2) {
      defaultFlag = true;
      defaultReason = '压测后资产负债率增幅>20%（基期≥100%）';
    }
    return {
      defaultFlag,
      defaultReason,
      assetLiabilityRatioBefore: alr0,
      assetLiabilityRatioAfter: alr1,
      alrIncreasePct,
      postStatus: defaultFlag ? 'SUBSTANDARD' : (r.prevStatus || 'NORMAL'),
    };
  }

  function recalcResultsDefaultFlags(taskId) {
    const t = getTask(taskId);
    if (!t) return;
    const criteria = getResultDefaultCriteria(t);
    const recMap = Object.fromEntries((recordsByTask[taskId] || []).map((rec) => [rec.companyName, rec]));
    (resultsByTask[taskId] || []).forEach((r) => {
      const rec = recMap[r.companyName] || {};
      Object.assign(r, evalDefaultFromRules(r, rec, criteria));
    });
  }

  function renderDefaultCriteriaPanel(taskId) {
    const t = getTask(taskId);
    if (!t) return '';
    const criteria = getResultDefaultCriteria(t);
    const alrPct = (criteria.assetLiabilityRatio * 100).toFixed(2);
    return `
      <section class="default-criteria-panel">
        <h4 class="default-criteria-title">客户违约判定条件</h4>
        <ol class="default-criteria-rules">
          ${DEFAULT_CRITERIA_RULES.map((rule) => `<li>${esc(rule)}</li>`).join('')}
        </ol>
        <div class="default-criteria-form">
          <label class="default-criteria-field">
            <span class="default-criteria-label">基期资产负债率 (%)</span>
            <input class="input default-criteria-input" type="number" step="0.01" min="0" id="defaultCriteriaAlr_${taskId}" value="${alrPct}" />
          </label>
          <label class="default-criteria-field">
            <span class="default-criteria-label">基期净利润 (万元)</span>
            <input class="input default-criteria-input" type="number" step="0.01" id="defaultCriteriaNetProfit_${taskId}" value="${criteria.baseNetProfit}" />
          </label>
          <button type="button" class="btn btn-primary" onclick="CRST_APP.applyResultDefaultCriteria(${taskId})">应用并重算违约</button>
        </div>
      </section>`;
  }

  function applyResultDefaultCriteria(taskId) {
    const t = getTask(taskId);
    if (!t) return;
    const alrPct = parseFloat(document.getElementById(`defaultCriteriaAlr_${taskId}`)?.value);
    const netProfit = parseFloat(document.getElementById(`defaultCriteriaNetProfit_${taskId}`)?.value);
    if (Number.isNaN(alrPct) || Number.isNaN(netProfit)) {
      toast('请填写有效的资产负债率与基期净利润', 'error');
      return;
    }
    t.resultDefaultCriteria = {
      assetLiabilityRatio: alrPct / 100,
      baseNetProfit: netProfit,
    };
    recalcResultsDefaultFlags(taskId);
    t.updatedAt = nowStr();
    addLog(taskId, '更新客户违约判定条件并重算违约标记');
    toast('已应用违约判定条件并重算结果');
    render();
  }

  /** 压测结果分析 / 不良和拨备计算 — 人民银行压力测试结果汇总表模板 */
  const PBOC_SUMMARY_TITLE_BY_SCENARIO = {
    BASELINE: '压力测试结果汇总表（现有政策）',
    GREENHOUSE_WORLD: '压力测试结果汇总表（温室世界）',
    ORDERLY_TRANSITION: '压力测试结果汇总表（有序转型）',
  };
  const PBOC_CCUS_TRIO = ['npl_no_ccus', 'npl_ccus', 'provision_ccus'];
  const PBOC_BASIC_PAIR = ['npl', 'provision'];
  const PBOC_SUMMARY_FOOTNOTE = '填报说明：\n1.高碳行业分类与《国民经济行业分类》（GB/T 4754-2017）对应关系参见《高碳行业对照表》；\n2.对于火电、水泥、石化、造纸、金属冶炼、平板玻璃制造等可使用CCUS技术的行业，需分别计算使用CCUS和不使用CCUS技术的不良贷款余额，当年新提取的贷款损失准备按使用CCUS情况计算。';
  const PBOC_INDUSTRY_ROW_SPECS = [
    { major: '电力', sub: '火力发电\n(不含热电联产)', metrics: PBOC_CCUS_TRIO, matchKey: '火力发电' },
    { major: '电力', sub: '热电联产', metrics: PBOC_BASIC_PAIR, matchKey: '热电联产' },
    { major: '电力', sub: '电力供应\n(输配电等)', metrics: PBOC_BASIC_PAIR, matchKey: '电力供应' },
    { major: '建材', sub: '水泥制造', metrics: PBOC_CCUS_TRIO, matchKey: '水泥制造' },
    { major: '建材', sub: '平板玻璃', metrics: PBOC_CCUS_TRIO, matchKey: '平板玻璃' },
    { major: '建材', sub: '平板玻璃\n(仅浮法)', metrics: PBOC_CCUS_TRIO, matchKey: '平板玻璃（仅浮法）' },
    { major: '钢铁', sub: '', metrics: PBOC_CCUS_TRIO, matchKey: '钢铁' },
    { major: '有色金属\n冶炼', sub: '铝冶炼', metrics: PBOC_CCUS_TRIO, matchKey: '铝冶炼' },
    { major: '有色金属\n冶炼', sub: '铜冶炼', metrics: PBOC_CCUS_TRIO, matchKey: '铜冶炼' },
    { major: '石化', sub: '开采原油\n加工炼化', metrics: PBOC_CCUS_TRIO, matchKey: '开采原油加工炼化' },
    { major: '石化', sub: '石油开采', metrics: PBOC_BASIC_PAIR, matchKey: '石油开采' },
    { major: '石化', sub: '煤炭加工\n转化', metrics: PBOC_CCUS_TRIO, matchKey: '煤炭加工转化' },
    { major: '化工', sub: '基础化学原料\n制造', metrics: PBOC_BASIC_PAIR, matchKey: '基础化学原料制造' },
    { major: '化工', sub: '肥料制造', metrics: PBOC_CCUS_TRIO, matchKey: '肥料制造' },
    { major: '化工', sub: '农药制造', metrics: PBOC_CCUS_TRIO, matchKey: '农药制造' },
    { major: '化工', sub: '化工（其他）', metrics: PBOC_CCUS_TRIO, matchKey: '化工（其他）' },
    { major: '造纸', sub: '造纸\n(生活用纸)', metrics: PBOC_CCUS_TRIO, matchKey: '造纸（生活用纸）' },
    { major: '造纸', sub: '造纸（其他）', metrics: PBOC_CCUS_TRIO, matchKey: '造纸（其他）' },
    { major: '航空', sub: '航空客货运输', metrics: PBOC_BASIC_PAIR, matchKey: '航空客货运输' },
    { major: '航空', sub: '机场', metrics: PBOC_BASIC_PAIR, matchKey: '机场' },
    { major: '其他行业', sub: '', metrics: PBOC_BASIC_PAIR, matchOther: true },
    { major: '个人贷款', sub: '', metrics: PBOC_BASIC_PAIR, matchPersonal: true },
  ];
  const PBOC_GREEN_SUMMARY = [
    { label: '不良贷款余额（所有行业均不使用CCUS）', key: 'total_npl_no_ccus' },
    { label: '当年新提取的贷款损失准备（所有行业均不使用CCUS）', key: 'total_prov_no_ccus' },
    { label: '不良贷款余额（部分行业使用CCUS）', key: 'total_npl_partial_ccus' },
    { label: '当年新提取的贷款损失准备（部分行业使用CCUS）', key: 'total_prov_partial_ccus' },
    { label: '加权平均违约损失率（对公）', key: 'wavg_lgd_corp', isPct: true },
    { label: '加权平均违约损失率（个人）', key: 'wavg_lgd_personal', isPct: true },
  ];
  const PBOC_OVERALL_SUMMARY = [
    { label: '核心一级资本净额', key: 'core_t1_capital' },
    { label: '核心一级资本充足率', key: 'core_t1_ratio', isPct: true },
    { label: '一级资本净额', key: 't1_capital' },
    { label: '一级资本充足率', key: 't1_ratio', isPct: true },
    { label: '资本净额', key: 'total_capital' },
    { label: '资本充足率', key: 'car', isPct: true },
    { label: '信用风险加权资产合计', key: 'rwa' },
    { label: '应用资本底线及校准后的风险加权资产合计', key: 'rwa_stress' },
  ];
  const PBOC_EXTRA_INDUSTRY_MATCHERS = {
    石油开采: (r) => /^B07/.test(r.gbIndustryCode || '') || r.standardIndustry === '石油开采',
    煤炭加工转化: (r) => /^C252/.test(r.gbIndustryCode || '') || /煤炭加工/.test(r.standardIndustry || ''),
  };
  const CCUS_ELIGIBLE_INDUSTRIES = ['电力', '建材', '石化', '造纸', '有色', '钢铁'];

  function buildPbocIndustryGroups(specs) {
    const groups = [];
    const map = new Map();
    specs.forEach((spec) => {
      if (!map.has(spec.major)) {
        const group = { major: spec.major, rows: [] };
        map.set(spec.major, group);
        groups.push(group);
      }
      map.get(spec.major).rows.push({
        sub: spec.sub || '',
        metrics: spec.metrics,
        matchKey: spec.matchKey,
        matchOther: spec.matchOther,
        matchPersonal: spec.matchPersonal,
      });
    });
    return groups;
  }

  function getStressSummaryTemplate(scenarioCode, job) {
    const baseYear = job ? (getTaskReportYear(job) || 2025) : 2025;
    return {
      scenarioCode: scenarioCode || 'BASELINE',
      title: PBOC_SUMMARY_TITLE_BY_SCENARIO[scenarioCode] || PBOC_SUMMARY_TITLE_BY_SCENARIO.BASELINE,
      unit: '单位：万元/%',
      baseYear,
      yearFrom: baseYear + 1,
      yearTo: 2040,
      industryGroups: buildPbocIndustryGroups(PBOC_INDUSTRY_ROW_SPECS),
      greenSummary: PBOC_GREEN_SUMMARY,
      overallSummary: PBOC_OVERALL_SUMMARY,
      footnote: PBOC_SUMMARY_FOOTNOTE,
    };
  }

  const SUMMARY_METRIC_LABELS = {
    npl_no_ccus: '不良贷款余额（不使用CCUS）',
    npl_ccus: '不良贷款余额（使用CCUS）',
    provision_ccus: '当年新提取的贷款损失准备（使用CCUS）',
    npl: '不良贷款余额',
    provision: '当年新提取的贷款损失准备',
  };

  function matchHighCarbonIndustryRecord(record) {
    return BANK_BASIC_HIGH_CARBON_ROWS.some((row) => row.match(record));
  }

  function matchPbocSummaryRow(record, rowSpec, job) {
    if (!record) return false;
    if (rowSpec.matchPersonal) return job?.loanType === 'PERSONAL';
    if (rowSpec.matchOther) return job?.loanType !== 'PERSONAL' && !matchHighCarbonIndustryRecord(record);
    if (rowSpec.matchKey) {
      const hc = BANK_BASIC_HIGH_CARBON_ROWS.find((row) => row.label === rowSpec.matchKey);
      if (hc?.match(record)) return true;
      const extra = PBOC_EXTRA_INDUSTRY_MATCHERS[rowSpec.matchKey];
      return extra ? extra(record) : false;
    }
    return false;
  }

  function isCcusEligibleRecord(record) {
    const ind = record?.standardIndustry || '';
    return CCUS_ELIGIBLE_INDUSTRIES.some((x) => ind.includes(x) || ind === x);
  }

  function tag(status, map) {
    const m = map[status] || { cls: 'tag-default', text: status };
    return `<span class="tag ${m.cls}">${m.text}</span>`;
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (type || 'success');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function nowStr() {
    return new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
  }

  /** 导出记录文件名：任务名称 + yyyyMMddHHmmss + .xlsx */
  function formatExportTimestamp(exportedAt) {
    const s = String(exportedAt || '');
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (m) return `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}`;
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function buildExportTitleFileName(title, ext = 'xlsx') {
    const safeTitle = String(title || '导出').replace(/[\\/:*?"<>|]/g, '_').trim() || '导出';
    const normalizedExt = String(ext || 'xlsx').replace(/^\./, '').toLowerCase();
    return `${safeTitle}.${normalizedExt}`;
  }

  function buildExportDownloadFileName(title, ext = 'xlsx') {
    return buildExportTitleFileName(title, ext);
  }

  function getExportDownloadFileName(e) {
    if (e.downloadFileName) return e.downloadFileName;
    const ext = String(e.fileFormat || 'Excel').toUpperCase() === 'PNG' ? 'png' : 'xlsx';
    return buildExportTitleFileName(e.scope || e.taskName, ext);
  }

  /** 压测结果明细表 — 可导出字段（与列表列一致） */
  const RESULT_DETAIL_EXPORT_FIELDS = [
    { key: 'companyName', label: '公司' },
    { key: 'branchName', label: '分行' },
    { key: 'standardIndustry', label: '行业' },
    { key: 'scenarioName', label: '情景' },
    { key: 'testYear', label: '年份' },
    { key: 'revenueGrowth', label: '收入增长率' },
    { key: 'costIncomeRatio', label: '成本收入比' },
    { key: 'assetLiabilityRatio', label: '资产负债率' },
    { key: 'policyIntensity', label: '政策强度' },
    { key: 'physicalLossRatio', label: '物理损失率' },
    { key: 'greenInvestmentRatio', label: '绿色投资占比' },
    { key: 'freeQuotaRatio', label: '免费配额比例' },
    { key: 'carbonPrice', label: '碳价(元/吨)' },
    { key: 'carbonEmission', label: '碳排放量(吨)' },
    { key: 'carbonCost', label: '碳排放费用(万)' },
    { key: 'revenueBefore', label: '收入(前)' },
    { key: 'revenueAfter', label: '收入(后)' },
    { key: 'operatingExpense', label: '营业支出(后)' },
    { key: 'netProfitAfter', label: '净利润(后)' },
    { key: 'eclBefore', label: 'ECL(前)' },
    { key: 'eclAfter', label: 'ECL(后)' },
    { key: 'impactRate', label: '影响率' },
    { key: 'defaultFlag', label: '违约' },
  ];

  /** 数据处理 — 待线下处理清单导出字段（与导入模板一致） */
  const DATA_PROCESS_OFFLINE_EXPORT_FIELDS = [
    { key: 'id', label: '记录ID' },
    { key: 'companyName', label: '公司' },
    { key: 'customerId', label: '客户号' },
    { key: 'creditNo', label: '信贷编号' },
    { key: 'branchName', label: '分行' },
    { key: 'apiIndustry', label: '接口行业' },
    { key: 'gbIndustryCode', label: '国标代码' },
    { key: 'standardIndustry', label: '标准行业(可填)' },
    { key: 'dataAvailability', label: '系统状态' },
    { key: 'availabilityReason', label: '原因' },
    { key: 'revenue', label: '收入(万)(可填)' },
    { key: 'costIncomeRatio', label: '成本收入比(可填)' },
    { key: 'passengerThroughput', label: '旅客吞吐量(可填)' },
    { key: 'remark', label: '备注(可填)' },
  ];

  /** 参试银行基础信息表 — 列定义 */
  const BANK_BASIC_INFO_COLUMNS = [
    { key: 'loanBalance', label: '贷款余额（万元）' },
    { key: 'nplBalance', label: '不良贷款余额（万元）' },
    { key: 'overdue90Balance', label: '逾期90天以上贷款余额（万元）' },
    { key: 'impairmentProvision', label: '减值准备（万元）' },
    { key: 'avgLoanTerm', label: '平均贷款期限（年）' },
    { key: 'avgRemainingTerm', label: '平均贷款剩余期限（年）' },
    { key: 'customerCount', label: '客户数量（个）' },
    { key: 'finCustomerCount', label: '其中：有财务数据客户数量' },
    { key: 'finLoanRatio', label: '有财务数据客户贷款占比（%）', isPct: true },
  ];

  /** 高碳行业明细行（人行口径） */
  const BANK_BASIC_HIGH_CARBON_ROWS = [
    { label: '火力发电', match: (r) => r.gbIndustryCode === 'D4411' || r.standardIndustry === '火力发电' || (r.standardIndustry === '电力' && !r.gbIndustryCode) },
    { label: '热电联产', match: (r) => r.gbIndustryCode === 'D4412' || r.standardIndustry === '热电联产' },
    { label: '电力供应', match: (r) => r.gbIndustryCode === 'D4420' || r.standardIndustry === '电力供应' },
    { label: '水泥制造', match: (r) => r.gbIndustryCode === 'C3011' || r.standardIndustry === '水泥制造' || r.standardIndustry === '建材' },
    { label: '平板玻璃', match: (r) => r.standardIndustry === '平板玻璃' && r.standardIndustry !== '平板玻璃（仅浮法）' },
    { label: '平板玻璃（仅浮法）', match: (r) => r.standardIndustry === '平板玻璃（仅浮法）' },
    { label: '钢铁', match: (r) => /^C31/.test(r.gbIndustryCode || '') || r.standardIndustry === '钢铁' },
    { label: '铝冶炼', match: (r) => r.gbIndustryCode === 'C3216' || r.standardIndustry === '铝冶炼' || r.standardIndustry === '有色' },
    { label: '铜冶炼', match: (r) => r.gbIndustryCode === 'C3211' || r.standardIndustry === '铜冶炼' },
    { label: '开采原油加工炼化', match: (r) => r.standardIndustry === '开采原油加工炼化' },
    { label: '采购原油加工炼化', match: (r) => r.standardIndustry === '采购原油加工炼化' || (r.standardIndustry === '石化' && r.gbIndustryCode === 'C2511') },
    { label: '基础化学原料制造', match: (r) => /^C261/.test(r.gbIndustryCode || '') && !/^C262|^C263/.test(r.gbIndustryCode || '') },
    { label: '肥料制造', match: (r) => /^C262/.test(r.gbIndustryCode || '') || r.standardIndustry === '肥料制造' },
    { label: '农药制造', match: (r) => /^C263/.test(r.gbIndustryCode || '') || r.standardIndustry === '农药制造' },
    { label: '化工（其他）', match: (r) => r.standardIndustry === '化工' || r.standardIndustry === '化工（其他）' || /^C265/.test(r.gbIndustryCode || '') },
    { label: '造纸（生活用纸）', match: (r) => r.standardIndustry === '造纸（生活用纸）' },
    { label: '造纸（其他）', match: (r) => r.standardIndustry === '造纸（其他）' || r.standardIndustry === '造纸' },
    { label: '航空客货运输', match: (r) => /^G561/.test(r.gbIndustryCode || '') || r.standardIndustry === '航空客货运输' },
    { label: '机场', match: (r) => r.gbIndustryCode === 'G5631' || r.standardIndustry === '机场' || r.standardIndustry === '机场企业' },
  ];

  const BANK_BASIC_CAPITAL_ROWS = [
    { key: 'coreTier1Capital', label: '核心一级资本净额（万元）' },
    { key: 'tier1Capital', label: '一级资本净额（万元）' },
    { key: 'totalCapital', label: '资本净额（万元）' },
    { key: 'rwaTotal', label: '应用资本底线及校准后的风险加权资产合计（万元）' },
    { key: 'addCapitalReq', label: '附加资本要求（%）', isPct: true },
    { key: 'provisionRatioReq', label: '贷款拨备率监管要求（%）', isPct: true },
    { key: 'coverageRatioReq', label: '拨备覆盖率监管要求（%）', isPct: true },
  ];

  function canExportTaskResults(t) {
    return t && ['COMPLETED', 'ARCHIVED'].includes(t.status);
  }

  function canUseApplicationReport(t) {
    if (!canExportTaskResults(t) || t.status === 'ARCHIVED') return false;
    if (!(resultsByTask[t.id] || []).length) return false;
    if (taskEditMode && isStressOnlyEditTask(t) && detailStep === 3) return false;
    return true;
  }

  function goToApplicationReport(id) {
    openRegulatoryReportModal(id);
  }

  function openRegulatoryReportModal(taskId) {
    const t = getTask(taskId);
    if (!canUseApplicationReport(t)) {
      toast('请先完成压测并生成压测结果', 'error');
      return;
    }
    window._appReportTaskId = taskId;
    pendingRegulatoryReportTaskId = taskId;
    addLog(taskId, '打开外部监管报送');
    const body = document.getElementById('regulatoryReportModalBody');
    if (body) body.innerHTML = renderRegulatoryReportCard(taskId);
    showModal('modalRegulatoryReport');
  }

  function getSummaryExportFieldLabels(taskId) {
    const dim = getTaskResultFilter(taskId).summaryDim === 'branch' ? '分行' : '行业';
    return [dim, '样本数', '平均影响率', '碳费用合计(万)', 'ECL增量合计(万)', '违约数'];
  }

  function triggerExportFileDownload(fileName, textContent) {
    const blob = new Blob(
      [textContent],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  const EXPORT_KIND_LABELS = {
    SUMMARY: '汇总表',
    DETAIL: '明细表',
    REPORT: '监管报送包',
    OFFLINE: '待处理清单',
    STRESS_SUMMARY: '压力测试结果汇总表',
    DEFAULT_MONITOR: '违约客户监控',
  };

  function exportKindLabel(kind) {
    return EXPORT_KIND_LABELS[kind] || kind || '-';
  }

  function parseExportSourceKey(sourceKey) {
    const m = String(sourceKey || '').match(/^(task|job)-(\d+)$/);
    if (!m) return null;
    return { isJob: m[1] === 'job', id: +m[2], key: sourceKey };
  }

  function normalizeExportSourceKey(ref) {
    if (ref == null || ref === '') return window._resultSourceKey || '';
    if (typeof ref === 'number') return `task-${ref}`;
    const s = String(ref);
    if (s.includes('-')) return s;
    return `task-${s}`;
  }

  function stressJobSourceType(methodKey) {
    return { trans: 'STRESS_TRANS', phys: 'STRESS_PHYS', comp: 'STRESS_COMP' }[methodKey] || 'RESULTS';
  }

  function getExportMeta(sourceKey) {
    const parsed = parseExportSourceKey(sourceKey);
    if (!parsed) return null;
    if (parsed.isJob) {
      const j = getStressJob(parsed.id);
      if (!j) return null;
      return {
        parsed,
        entity: j,
        taskName: j.jobName,
        taskCode: j.jobCode,
        sourceType: stressJobSourceType(j.methodKey),
        rawResults: stressResultsByJob[parsed.id] || [],
      };
    }
    const t = getTask(parsed.id);
    if (!t) return null;
    return {
      parsed,
      entity: t,
      taskName: t.taskName,
      taskCode: t.taskCode,
      sourceType: 'RESULTS',
      rawResults: resultsByTask[parsed.id] || [],
    };
  }

  function canExportSourceKey(sourceKey) {
    const meta = getExportMeta(sourceKey);
    if (!meta || !meta.rawResults.length) return false;
    if (meta.parsed.isJob) return meta.entity.status === 'COMPLETED';
    return canExportTaskResults(meta.entity);
  }

  function buildAnalysisFilterDesc() {
    const year = window._resultYear;
    const yearLabel = year === '' || year == null ? '全部' : `${year}年`;
    const dim = window._resultDim === 'branch' ? '分行' : '行业';
    return `场景=${window._resultScenarioCode || '全部'}，年份=${yearLabel}，维度=${dim}`;
  }

  function getFilteredResultsFromSnapshot(rawResults, snapshot) {
    if (!rawResults?.length) return [];
    const snap = snapshot || { context: 'analysis' };
    if (snap.context === 'taskDetail') {
      return applyTaskResultFilter(rawResults, snap.filter || getTaskResultFilter(snap.taskId));
    }
    const year = snap.year === '' || snap.year == null ? null : +snap.year;
    if (snap.context === 'defaultMonitor' || snap.context === 'stressSummary') {
      return filterAnalysisResults(rawResults, year, snap.scenarioFilter || snap.scenarioCode || '');
    }
    let list = filterAnalysisResults(rawResults, year, snap.scenarioCode || '');
    return list;
  }

  function getExportContext(sourceKey) {
    const meta = getExportMeta(sourceKey);
    if (!meta) return null;
    const useAnalysis = currentPage === 'results' && window._resultSourceKey === sourceKey;
    let filtered;
    let filterDesc;
    let filterSnapshot;
    let summaryDim;
    if (useAnalysis) {
      const year = window._resultYear === '' || window._resultYear == null ? null : window._resultYear;
      filtered = filterAnalysisResults(meta.rawResults, year, window._resultScenarioCode || '');
      summaryDim = window._resultDim || 'industry';
      filterDesc = buildAnalysisFilterDesc();
      filterSnapshot = buildAnalysisExportSnapshot();
    } else {
      const filterTaskId = meta.parsed.isJob ? (meta.entity.sourceTaskId || meta.parsed.id) : meta.parsed.id;
      const f = getTaskResultFilter(filterTaskId);
      filtered = applyTaskResultFilter(meta.rawResults, f);
      summaryDim = f.summaryDim || 'industry';
      filterDesc = buildTaskResultFilterDesc(filterTaskId);
      filterSnapshot = { context: 'taskDetail', taskId: filterTaskId, filter: { ...f } };
    }
    const summaryDimLabel = summaryDim === 'branch' ? '分行' : '行业';
    return {
      ...meta,
      filtered,
      filterDesc,
      filterSnapshot,
      summaryDim,
      summaryDimLabel,
      summaryFieldLabels: [summaryDimLabel, '样本数', '平均影响率', '碳费用合计(万)', 'ECL增量合计(万)', '违约数'],
    };
  }

  function buildSummaryExportText(ctx) {
    const rows = summarizeTaskResults(ctx.filtered, ctx.summaryDim);
    const lines = [
      '汇总导出（Excel）',
      `任务：${ctx.taskName}`,
      `范围：汇总结果（按${ctx.summaryDimLabel}）`,
      `筛选条件：${ctx.filterDesc}`,
      '',
      ctx.summaryFieldLabels.join('\t'),
      ...rows.map((r) => [
        r.key,
        r.count,
        `${r.avgImpactPct.toFixed(2)}%`,
        Math.round(r.sumCarbonCost),
        Math.round(r.sumEclDelta),
        r.defaultCount,
      ].join('\t')),
    ];
    return lines.join('\n');
  }

  function buildDetailExportText(ctx, fieldKeys) {
    const keys = fieldKeys?.length ? fieldKeys : RESULT_DETAIL_EXPORT_FIELDS.map((f) => f.key);
    const labels = keys.map((k) => RESULT_DETAIL_EXPORT_FIELDS.find((f) => f.key === k)?.label || k);
    const formatCell = (r, key) => {
      if (key === 'impactRate') return `${((r.impactRate || 0) * 100).toFixed(2)}%`;
      if (key === 'defaultFlag') return r.defaultFlag ? '违约' : '正常';
      return r[key] ?? '';
    };
    const lines = [
      '明细导出（Excel）',
      `任务：${ctx.taskName}`,
      '范围：压测明细（按筛选与所选字段）',
      `筛选条件：${ctx.filterDesc}`,
      '',
      labels.join('\t'),
      ...ctx.filtered.map((r) => keys.map((k) => formatCell(r, k)).join('\t')),
    ];
    return lines.join('\n');
  }

  function buildAnalysisExportSnapshot(extra = {}) {
    return {
      context: 'analysis',
      year: window._resultYear ?? '',
      scenarioCode: window._resultScenarioCode || '',
      dim: window._resultDim || 'industry',
      ...extra,
    };
  }

  function buildStressSummaryExportText(scenarioCode, results, taskName, job) {
    const tpl = getStressSummaryTemplate(scenarioCode, job);
    const ctx = getSummaryJobContext(job);
    const years = summaryYearColumns(tpl);
    const yearLabels = years.map((y) => (y === tpl.baseYear ? `${y}年（基准）` : `${y}年`));
    const flatRows = [];
    tpl.industryGroups.forEach((group) => {
      group.rows.forEach((row) => {
        row.metrics.forEach((metricKey) => {
          flatRows.push({
            major: group.major,
            sub: row.sub,
            rowSpec: row,
            metricKey,
            metric: SUMMARY_METRIC_LABELS[metricKey],
          });
        });
      });
    });
    const dataLines = flatRows.map((row) => {
      const cells = years.map((y) => formatSummaryCell(aggregateSummaryMetricRows(results, tpl, y, row.rowSpec, row.metricKey, ctx)));
      return [row.major, row.sub, row.metric, ...cells].join('\t');
    });
    (tpl.greenSummary || []).forEach((item) => {
      const cells = years.map((y) => formatSummaryCell(computeSummaryPortfolioMetric(results, tpl, y, item.key, ctx), item.isPct));
      dataLines.push(['', '', item.label, ...cells].join('\t'));
    });
    (tpl.overallSummary || []).forEach((item, idx) => {
      const cells = years.map((y) => formatSummaryCell(computeSummaryPortfolioMetric(results, tpl, y, item.key, ctx), item.isPct));
      dataLines.push([idx === 0 ? '整体情况' : '', '', item.label, ...cells].join('\t'));
    });
    return [
      `${tpl.title}（Excel）`,
      `任务：${taskName || '-'}`,
      tpl.unit,
      '',
      ['行业名称（大类）', '子行业', '项目', ...yearLabels].join('\t'),
      ...dataLines,
      '',
      tpl.footnote,
    ].join('\n');
  }

  function exportStressSummaryTable() {
    const { src, res, taskId } = resolveResultSource();
    const sourceKey = src?.key || window._resultSourceKey;
    if (!canExportSourceKey(sourceKey)) { toast('请先完成压测后再导出', 'error'); return; }
    const activeScenarioCode = resolveResultScenarioCode(src, res);
    const job = src?.isJob ? getStressJob(src.id) : (taskId ? getTask(taskId) : null);
    const tpl = getStressSummaryTemplate(activeScenarioCode, job);
    const scenarioRes = res.filter((r) => r.scenarioCode === activeScenarioCode);
    const exportResults = scenarioRes.length ? scenarioRes : res;
    const filterDesc = buildAnalysisFilterDesc();
    const filterSnapshot = buildAnalysisExportSnapshot({
      context: 'stressSummary',
      scenarioCode: activeScenarioCode,
      scenarioFilter: window._resultScenarioCode || '',
    });
    const { downloadFileName } = appendExportLog({
      sourceKey,
      scope: tpl.title,
      fields: ['行业名称（大类）', '子行业', '项目', ...summaryYearColumns(tpl).map((y) => `${y}年`)].join(', '),
      filterDesc,
      sourceType: getExportMeta(sourceKey)?.sourceType || 'RESULTS',
      exportKind: 'STRESS_SUMMARY',
      filterSnapshot,
      downloadFileName: buildExportTitleFileName(tpl.title),
    });
    if (taskId) addLog(taskId, `压测结果：导出${tpl.title}`);
    triggerExportFileDownload(downloadFileName, buildStressSummaryExportText(activeScenarioCode, exportResults, getExportMeta(sourceKey)?.taskName, job));
    toast(`已导出${tpl.title}，已写入导出记录`);
  }

  function exportNplProvSummaryTable(scenarioCode) {
    const state = resolveNplProvViewState();
    const job = state.job;
    if (!job) { toast('请先选择压测任务', 'error'); return; }
    const code = scenarioCode || state.scenarioFilter || job.selectedScenarioCodes?.[0] || 'BASELINE';
    const results = stressResultsByJob[job.id] || [];
    const scenarioRes = results.filter((r) => r.scenarioCode === code);
    const exportResults = scenarioRes.length ? scenarioRes : buildNplProvResultsFromPreview(job, getNplProvPreviewRows(job));
    if (!exportResults.length) { toast('暂无不良和拨备汇总数据', 'error'); return; }
    const tpl = getStressSummaryTemplate(code, job);
    triggerExportFileDownload(buildExportTitleFileName(tpl.title), buildStressSummaryExportText(code, exportResults, job.jobName, job));
    addStressJobLog(job.id, `不良和拨备计算：导出${tpl.title}`);
    toast(`已导出${tpl.title}`);
  }

  function buildDefaultAdjustmentExportText(taskId, results, jobId) {
    const rows = buildDefaultAdjustmentDetailRows(taskId, results, jobId);
    const header = '序号\t客户名称\t统一社会信用代码\t所属行业\t贷款余额(万元)\t现有政策(违约年份/否)\t温室世界(违约年份/否)\t有序转型(违约年份/否)';
    const dataLines = rows.map((row) => [
      row.index,
      row.companyName,
      row.creditCode,
      row.industry,
      row.loanBalance,
      row.baseline,
      row.greenhouse,
      row.orderly,
    ].join('\t'));
    return [
      '违约调整明细表',
      '填报说明：本表仅填写高碳行业违约调整明细；高碳行业分类与《国民经济行业分类》(GB/T 4754-2017) 对应关系参见《高碳行业对照表》。',
      '',
      header,
      ...dataLines,
    ].join('\n');
  }

  function exportDefaultAdjustmentTable() {
    const { src, res, taskId } = resolveResultSource();
    const sourceKey = src?.key || window._resultSourceKey;
    if (!canExportSourceKey(sourceKey)) { toast('请先完成压测后再导出', 'error'); return; }
    if (!taskId && !src?.isJob) { toast('暂无关联数据处理任务', 'error'); return; }
    const jobId = src?.isJob ? src.id : null;
    const filterDesc = buildAnalysisFilterDesc();
    const filterSnapshot = buildAnalysisExportSnapshot({ context: 'defaultAdjustment' });
    const { downloadFileName } = appendExportLog({
      sourceKey,
      scope: '违约调整明细表',
      fields: '序号, 客户名称, 统一社会信用代码, 所属行业, 贷款余额, 现有政策, 温室世界, 有序转型',
      filterDesc,
      sourceType: getExportMeta(sourceKey)?.sourceType || 'RESULTS',
      exportKind: 'DEFAULT_ADJUSTMENT',
      filterSnapshot,
      downloadFileName: buildExportTitleFileName('违约调整明细表'),
    });
    if (taskId) addLog(taskId, '压测结果：导出违约调整明细表');
    triggerExportFileDownload(downloadFileName, buildDefaultAdjustmentExportText(taskId, res, jobId));
    toast('已导出违约调整明细表，已写入导出记录');
  }

  function buildReportExportText(ctx, e) {
    const taskId = e.filterSnapshot?.taskId;
    const t = taskId ? getTask(taskId) : null;
    const body = t ? buildRegulatoryReportPackText(taskId, t) : [
      '监管报送文件包（Excel）',
      `任务：${ctx?.taskName || e.taskName}`,
      `筛选/口径：${e.filter || '-'}`,
      `包含文件：${REGULATORY_REPORT_FILES.map((f) => f.name).join('、')}`,
    ].join('\n');
    return body;
  }

  function buildRegulatoryReportPackText(taskId, t) {
    const results = resultsByTask[taskId] || [];
    const summary = summarizeTaskResults(results, 'industry');
    const summaryBlock = [
      '【压力测试结果汇总表】',
      '行业\t样本数\t平均影响率\t碳费用合计(万)\tECL增量合计(万)\t违约数',
      ...summary.map((s) => `${s.key}\t${s.count}\t${s.avgImpactPct.toFixed(2)}%\t${s.sumCarbonCost}\t${s.sumEclDelta}\t${s.defaultCount}`),
    ];
    const detailBlock = [
      '',
      '【违约调整明细表】',
      '填报说明：本表仅填写高碳行业违约调整明细；高碳行业分类与《国民经济行业分类》(GB/T 4754-2017) 对应关系参见《高碳行业对照表》。',
      '序号\t客户名称\t统一社会信用代码\t所属行业\t贷款余额(万元)\t现有政策(违约年份/否)\t温室世界(违约年份/否)\t有序转型(违约年份/否)',
      ...buildDefaultAdjustmentExportRows(taskId, results, null),
    ];
    return [
      '监管报送文件包（Excel）',
      `任务：${t?.taskName || taskId}`,
      `生成时间：${nowStr()}`,
      '',
      ...summaryBlock,
      ...detailBlock,
    ].join('\n');
  }

  function buildDefaultAdjustmentDetailRows(taskId, results, jobId) {
    const isHighCarbon = window.CRST_CARBON?.isHighCarbonIndustry?.bind(window.CRST_CARBON);
    const recMap = Object.fromEntries((recordsByTask[taskId] || []).map((r) => [r.companyName, r]));
    if (jobId) {
      (stressRecordsByJob[jobId] || []).forEach((r) => {
        if (!recMap[r.companyName]) recMap[r.companyName] = r;
      });
    }
    const credits = jobId ? (stressCreditByJob[jobId] || []) : (creditByTask[taskId] || []);
    const creditMap = Object.fromEntries(credits.map((c) => [c.companyName, c]));
    const scenarioCell = (name, code) => {
      const hit = results.filter((r) => r.companyName === name && r.scenarioCode === code && r.defaultFlag)
        .sort((a, b) => (a.testYear || 0) - (b.testYear || 0))[0];
      return hit?.testYear ?? '否';
    };
    const companies = [...new Set(results.map((r) => r.companyName))].filter((name) => {
      const ind = results.find((r) => r.companyName === name)?.standardIndustry;
      return !isHighCarbon || isHighCarbon(ind);
    });
    return companies.map((name, i) => {
      const rec = recMap[name] || {};
      const credit = creditMap[name] || {};
      const ind = results.find((r) => r.companyName === name)?.standardIndustry || rec.standardIndustry || '-';
      const loan = credit.loanBalance ?? rec.loanBalance ?? '-';
      return {
        index: i + 1,
        companyName: name,
        creditCode: rec.unifiedSocialCreditCode || rec.customerId || '-',
        industry: formatCustomerIndustryLabel(rec) || ind,
        loanBalance: loan,
        baseline: scenarioCell(name, 'BASELINE'),
        greenhouse: scenarioCell(name, 'GREENHOUSE_WORLD'),
        orderly: scenarioCell(name, 'ORDERLY_TRANSITION'),
      };
    });
  }

  function buildFinTransDefaultAdjustmentRows(job) {
    if (!job) return [];
    const isHighCarbon = window.CRST_CARBON?.isHighCarbonIndustry?.bind(window.CRST_CARBON);
    const recs = (stressRecordsByJob[job.id] || entityRecords(job.id, job))
      .filter((r) => !r.excluded && r.standardIndustry);
    const recMap = Object.fromEntries(recs.map((r) => [r.companyName, r]));
    const credits = stressCreditByJob[job.id] || entityCredits(job.id, job);
    const creditMap = Object.fromEntries(credits.map((c) => [c.companyName, c]));
    const criteriaSource = (job.dataSource === 'REF' && job.sourceTaskId) ? getTask(job.sourceTaskId) : job;
    const criteria = getResultDefaultCriteria(criteriaSource || job);
    const scenarios = job.selectedScenarioCodes?.length
      ? job.selectedScenarioCodes
      : STRESS_SCENARIO_OPTIONS.map((s) => s.code);
    const scenarioDefaultYear = (companyName, scenarioCode) => {
      const finData = getFinTransAlrTableDataForScenario(job, scenarioCode);
      if (!finData?.rows?.length) return '否';
      const row = finData.rows.find((r) => r.companyName === companyName);
      if (!row) return '否';
      const rec = recMap[companyName] || {};
      const alr0 = rec.assetLiabilityRatio ?? criteria.assetLiabilityRatio;
      for (const y of finData.years) {
        const alr1 = row.alrByYear[y];
        if (alr1 == null) continue;
        const eval = evalDefaultFromRules({
          assetLiabilityRatioBefore: alr0,
          assetLiabilityRatioAfter: alr1,
        }, rec, criteria);
        if (eval.defaultFlag) return y;
      }
      return '否';
    };
    const companies = [...new Set(recs.map((r) => r.companyName))]
      .filter((name) => {
        const ind = recMap[name]?.standardIndustry;
        return !isHighCarbon || isHighCarbon(ind);
      });
    return companies.map((name, i) => {
      const rec = recMap[name] || {};
      const credit = creditMap[name] || {};
      return {
        index: i + 1,
        companyName: name,
        creditCode: rec.unifiedSocialCreditCode || rec.customerId || '-',
        industry: formatCustomerIndustryLabel(rec) || rec.standardIndustry || '-',
        loanBalance: credit.loanBalance ?? rec.loanBalance ?? '-',
        baseline: scenarios.includes('BASELINE') ? scenarioDefaultYear(name, 'BASELINE') : '否',
        greenhouse: scenarios.includes('GREENHOUSE_WORLD') ? scenarioDefaultYear(name, 'GREENHOUSE_WORLD') : '否',
        orderly: scenarios.includes('ORDERLY_TRANSITION') ? scenarioDefaultYear(name, 'ORDERLY_TRANSITION') : '否',
      };
    });
  }

  function exportFinTransDefaultAdjustmentTable() {
    const state = resolveFinTransViewState();
    const job = state.job;
    if (!job) { toast('暂无财务传导结果', 'error'); return; }
    const rows = buildFinTransDefaultAdjustmentRows(job);
    const sourceKey = `job-${job.id}`;
    const filterDesc = buildAnalysisFilterDesc();
    const filterSnapshot = buildAnalysisExportSnapshot({ context: 'finTransDefaultAdjustment', jobId: job.id });
    const text = [
      '违约调整明细表',
      '填报说明：本表仅填写高碳行业违约调整明细；高碳行业分类与《国民经济行业分类》(GB/T 4754-2017) 对应关系参见《高碳行业对照表》。',
      '',
      '序号\t客户名称\t统一社会信用代码\t所属行业\t贷款余额(万元)\t现有政策(违约年份/否)\t温室世界(违约年份/否)\t有序转型(违约年份/否)',
      ...rows.map((row) => [row.index, row.companyName, row.creditCode, row.industry, row.loanBalance, row.baseline, row.greenhouse, row.orderly].join('\t')),
    ].join('\n');
    const { downloadFileName } = appendExportLog({
      sourceKey,
      scope: '违约调整明细表（财务传导）',
      fields: '序号, 客户名称, 统一社会信用代码, 所属行业, 贷款余额, 现有政策, 温室世界, 有序转型',
      filterDesc,
      sourceType: 'RESULTS',
      exportKind: 'DEFAULT_ADJUSTMENT',
      filterSnapshot,
      moduleName: '财务传导',
      downloadFileName: buildExportTitleFileName('违约调整明细表'),
    });
    addStressJobLog(job.id, '财务传导：导出违约调整明细表');
    triggerExportFileDownload(downloadFileName, text);
    toast('已导出违约调整明细表，已写入导出记录');
  }

  function buildDefaultAdjustmentExportRows(taskId, results, jobId) {
    return buildDefaultAdjustmentDetailRows(taskId, results, jobId).map((row) => [
      row.index,
      row.companyName,
      row.creditCode,
      row.industry,
      row.loanBalance,
      row.baseline,
      row.greenhouse,
      row.orderly,
    ].join('\t'));
  }

  function appendExportLog(opts) {
    const {
      sourceKey,
      scope,
      fields,
      filterDesc,
      sourceType,
      exportKind,
      fieldKeys,
      filterSnapshot,
      taskCode,
      taskName,
      exportType,
      fileFormat,
      downloadFileName: customDownloadFileName,
    } = opts;
    const meta = getExportMeta(sourceKey);
    const exportedAt = nowStr();
    const resolvedName = taskName || meta?.taskName || '压测结果';
    const defaultExt = (fileFormat || '').toUpperCase() === 'PNG' ? 'png' : 'xlsx';
    const downloadFileName = customDownloadFileName || buildExportTitleFileName(scope || resolvedName, defaultExt);
    const entry = {
      id: ++nextId.export,
      sourceKey,
      exportKind: exportKind || 'DETAIL',
      taskCode: taskCode || meta?.taskCode || '-',
      taskName: resolvedName,
      sourceType: sourceType || meta?.sourceType || 'RESULTS',
      moduleName: resolveExportModuleName({ moduleName: opts.moduleName, sourceType, exportKind, scope, filterSnapshot }),
      exportType: exportType || (exportKind === 'REPORT' ? '文件包' : '表格'),
      fileFormat: fileFormat || (exportKind === 'REPORT' ? 'Excel' : 'Excel'),
      scope,
      fields,
      filter: filterDesc || '',
      filterSnapshot: filterSnapshot || null,
      fieldKeys: fieldKeys || [],
      operator: '总行管理员',
      exportedAt,
      downloadFileName,
    };
    exportLogs.unshift(entry);
    return { downloadFileName, exportedAt, taskName: resolvedName, entry };
  }

  function buildExportFileContent(e) {
    const meta = getExportMeta(e.sourceKey);
    if (!meta && e.exportKind !== 'OFFLINE') {
      return `导出文件：${getExportDownloadFileName(e)}\n任务：${e.taskName}\n`;
    }
    if (e.exportKind === 'OFFLINE' && e.filterSnapshot?.context === 'dataProcessOffline') {
      const taskId = e.filterSnapshot.taskId;
      const records = getDataProcessExportRecords(taskId);
      if (records.length) return buildDataProcessOfflineExportText(taskId, records);
      return [
        '待线下处理清单（Excel）',
        `任务：${e.taskName}`,
        `导出时条数：${e.filterSnapshot.count || '-'}（当前任务中已无待处理数据，以下为导出记录摘要）`,
        e.filter || '',
      ].join('\n');
    }
    if (!meta) {
      return `导出文件：${getExportDownloadFileName(e)}\n任务：${e.taskName}\n`;
    }
    if (e.exportKind === 'REPORT') {
      return buildReportExportText(meta, e);
    }
    if (e.exportKind === 'STRESS_SUMMARY') {
      const snap = e.filterSnapshot || {};
      const filtered = getFilteredResultsFromSnapshot(meta.rawResults, snap);
      const scenarioCode = snap.scenarioCode || 'BASELINE';
      const scenarioResults = filtered.filter((r) => r.scenarioCode === scenarioCode);
      return buildStressSummaryExportText(scenarioCode, scenarioResults.length ? scenarioResults : filtered, e.taskName);
    }
    if (e.exportKind === 'DEFAULT_MONITOR') {
      const filtered = getFilteredResultsFromSnapshot(meta.rawResults, e.filterSnapshot);
      return buildDefaultMonitorExportText(collectRiskWarningsFromResults(filtered), e.taskName);
    }
    const filtered = getFilteredResultsFromSnapshot(meta.rawResults, e.filterSnapshot);
    const summaryDim = e.filterSnapshot?.dim || 'industry';
    const summaryDimLabel = summaryDim === 'branch' ? '分行' : '行业';
    const ctx = {
      ...meta,
      filtered,
      filterDesc: e.filter,
      summaryDim,
      summaryDimLabel,
      summaryFieldLabels: [summaryDimLabel, '样本数', '平均影响率', '碳费用合计(万)', 'ECL增量合计(万)', '违约数'],
    };
    if (e.exportKind === 'SUMMARY') return buildSummaryExportText(ctx);
    return buildDetailExportText(ctx, e.fieldKeys);
  }

  function getTask(id) {
    return tasks.find((t) => t.id === id);
  }

  function getTaskUpdatedBy(t) {
    if (!t) return '-';
    if (t.updatedBy) return t.updatedBy;
    const logs = taskLogs[t.id] || [];
    return logs[0]?.operator || '总行管理员';
  }

  function getStressJobUpdatedBy(j) {
    if (!j) return '-';
    if (j.updatedBy) return j.updatedBy;
    const logs = stressJobLogs[j.id] || [];
    return logs[0]?.operator || '总行管理员';
  }

  function getStressJob(id) {
    return stressJobs.find((j) => j.id === id);
  }

  function getStressStepMeta(pageId) {
    return STRESS_STEP_PAGES[pageId] || null;
  }

  function isScenarioAnalysisPage(page) {
    return (page || currentPage) === 'scenario-analysis';
  }

  function isStressModulePage(page) {
    const p = page || currentPage;
    return isStressStepPage(p) || isScenarioAnalysisPage(p);
  }

  function isStressStepPage(page) {
    const p = page || currentPage;
    return p === 'stress-fin-trans' || p === 'stress-pd-lgd' || p === 'stress-npl-prov';
  }

  function isStressResultViewPage(pageId) {
    const p = pageId || currentPage;
    return p === 'stress-fin-trans' || p === 'stress-pd-lgd' || p === 'stress-npl-prov';
  }

  function presetStressResultViewJob(pageId, jobId) {
    if (!jobId) return;
    if (pageId === 'stress-fin-trans') window._finTransJobKey = `job-${jobId}`;
    if (pageId === 'stress-pd-lgd') window._pdLgdJobKey = `job-${jobId}`;
    if (pageId === 'stress-npl-prov') window._nplProvJobKey = `job-${jobId}`;
  }

  function stressStepPageForIndex(stepIndex) {
    if (stepIndex <= 1) return 'stress-fin-trans';
    if (stepIndex === 2) return 'stress-pd-lgd';
    return 'stress-npl-prov';
  }

  function scenarioLabel(code) {
    return STRESS_SCENARIO_OPTIONS.find((s) => s.code === code)?.label
      || REGULATORY_SCENARIO_COLS.find((s) => s.code === code)?.label
      || code;
  }

  function renderScenarioTags(codes) {
    const list = (codes || []).length ? codes : STRESS_SCENARIO_OPTIONS.map((s) => s.code);
    return esc(list.map((c) => scenarioLabel(c)).join(' '));
  }

  function isFinTransDone(t) {
    return !!(t?.finTransDone || t?.status === 'COMPLETED' || t?.creditFetched);
  }

  function stressJobProgressStep(t) {
    if (!t) return 0;
    if (t.status === 'COMPLETED') return STRESS_JOB_STEP_LABELS.length;
    if (t.creditFetched && t.eclFetched) return 3;
    if (isFinTransDone(t)) return 2;
    return 1;
  }

  function resolveEntity(id) {
    return getStressJob(id) || getTask(id);
  }

  function isStressJobEntity(entity) {
    return !!(entity && entity.methodKey);
  }

  function entityRecords(id, entity) {
    if (entity && isStressJobEntity(entity)) return stressRecordsByJob[id] || [];
    return recordsByTask[id] || [];
  }

  function entityCredits(id, entity) {
    if (entity && isStressJobEntity(entity)) return stressCreditByJob[id] || [];
    return creditByTask[id] || [];
  }

  function entityEcls(id, entity) {
    if (entity && isStressJobEntity(entity)) return stressEclByJob[id] || [];
    return eclByTask[id] || [];
  }

  function entityResults(id, entity) {
    if (entity && isStressJobEntity(entity)) return stressResultsByJob[id] || [];
    return resultsByTask[id] || [];
  }

  function scenariosForJob() {
    return scenarios.filter((s) => s.status === 'PUBLISHED');
  }

  function getProcessedDataTasks() {
    return tasks.filter((t) => ['COMPLETED', 'ARCHIVED'].includes(t.status));
  }

  function getTaskRecordCountForRef(task) {
    const recs = recordsByTask[task.id] || [];
    const total = task.syncStats?.total;
    if (total && total > recs.length) return total;
    return recs.length || countUsableFinancialRecords(recs);
  }

  function stressJobStatusTag(status) {
    const m = STRESS_JOB_STATUS[status] || { cls: 'tag-default', text: status };
    return `<span class="tag ${m.cls}">${m.text}</span>`;
  }

  function stressDataSourceTag(source) {
    const m = STRESS_DATA_SOURCE[source] || { text: source };
    return esc(m.text);
  }

  function filterStressJobList() {
    const f = stressJobFilters || {};
    return stressJobs.filter((j) => {
      if (f.name && !j.jobName.toLowerCase().includes(f.name.trim().toLowerCase())) return false;
      if (f.status && j.status !== f.status) return false;
      if (f.sourceTaskId && String(j.sourceTaskId || '') !== String(f.sourceTaskId)) return false;
      if (f.periodStart && j.reportPeriodEnd < f.periodStart) return false;
      if (f.periodEnd && j.reportPeriodStart > f.periodEnd) return false;
      return true;
    });
  }

  function stepIndex(status) {
    const map = {
      DRAFT: 0, SYNCING: 1, PENDING_DISAMBIG: 1, PENDING_CONFIRM: 1, PROCESSING: 2,
      READY_STRESS: 3, STRESSING: 3, COMPLETED: 5, ARCHIVED: 5,
    };
    return map[status] ?? 0;
  }

  function loanClassLabel(code) {
    return LOAN_CLASSIFICATION_LABELS[code] || code || '-';
  }

  function loanRegionLabel(code) {
    return LOAN_REGION_LABELS[code] || code || '-';
  }

  function sceneTypeLabel(value) {
    return SCENE_TYPE_OPTIONS.find((o) => o.value === value)?.label || value || '-';
  }

  function stressPurposeLabel(value) {
    return STRESS_PURPOSE_OPTIONS.find((o) => o.value === value)?.label || value || '-';
  }

  function renderFieldTipBubble(text) {
    return `<span class="field-tip" tabindex="0" role="note" aria-label="${esc(text)}">
      <span class="field-tip-icon" aria-hidden="true">?</span>
      <span class="field-tip-bubble">${esc(text)}</span>
    </span>`;
  }

  const STRESS_PURPOSE_FIELD_TIP = '除「人民银行气候风险压测」外，其他选项本期仅占位，暂不实现。';

  function getIndustrySelector() {
    return window.CRST_INDUSTRY_SELECTOR;
  }

  function getTestIndustryMajors() {
    return getIndustrySelector()?.getTestIndustryMajors?.()
      || ['电力', '建材', '钢铁', '有色', '石化', '化工', '造纸', '航空'];
  }

  function resolveTestIndustryMajor(standardIndustry, gbIndustryCode) {
    const IS = getIndustrySelector();
    if (IS?.resolveTestIndustryMajor) {
      return IS.resolveTestIndustryMajor(standardIndustry, gbIndustryCode);
    }
    return standardIndustry || '';
  }

  function getEnabledEmissionFactors() {
    return factors.filter((f) => f.status === 'ENABLED' && f.scenarioType === 'EMISSION');
  }

  function initIndustryPickerFromTask(t) {
    const IS = getIndustrySelector();
    if (!IS) return;
    const purpose = t?.stressPurpose || 'PBOC';
    let selected;
    if (t?.selectedIndustryCodes?.length) {
      selected = new Set(t.selectedIndustryCodes);
    } else if (purpose === 'PBOC') {
      selected = new Set(IS.getPbocDefaultCodes());
    } else {
      selected = new Set();
    }
    industryPickerState = {
      purpose,
      selected,
      activeIds: [null, null, null, null],
      search: '',
    };
  }

  function ensureIndustryPickerInit(t) {
    if (!industryPickerState) initIndustryPickerFromTask(t);
  }

  function getTaskIndustrySummary(t) {
    const IS = getIndustrySelector();
    if (!IS) return '-';
    const codes = t?.selectedIndustryCodes?.length
      ? t.selectedIndustryCodes
      : (t?.stressPurpose === 'PBOC' ? IS.getPbocDefaultCodes() : []);
    return codes.length ? IS.formatSelectedSummary(codes) : '-';
  }

  function getNodeCheckState(node) {
    const IS = getIndustrySelector();
    if (!IS || !node || !industryPickerState) return 'none';
    const leaves = node.leaf ? [node.code] : IS.collectLeaves(node);
    if (!leaves.length) return 'none';
    const sel = industryPickerState.selected;
    const n = leaves.filter((c) => sel.has(c)).length;
    if (n === 0) return 'none';
    if (n === leaves.length) return 'all';
    return 'partial';
  }

  function getIndustryColumnNodes(colIndex) {
    const IS = getIndustrySelector();
    if (!IS || !industryPickerState) return [];
    const kw = industryPickerState.search.trim().toLowerCase();
    if (kw) {
      if (colIndex !== 0) return [];
      return IS.PBOC_INDUSTRY_LEAVES.filter((x) =>
        x.name.includes(kw)
        || x.code.toLowerCase().includes(kw)
        || IS.formatCodeDisplay(x.code).includes(kw)
      ).map((x) => ({ id: x.code, leaf: true, code: x.code, name: x.name }));
    }
    if (colIndex === 0) return IS.INDUSTRY_SELECTOR_TREE;
    const parentId = industryPickerState.activeIds[colIndex - 1];
    if (!parentId) return [];
    const parent = IS.findNodeById(IS.INDUSTRY_SELECTOR_TREE, parentId);
    return parent?.children || [];
  }

  function renderIndustryColumn(colIndex) {
    const IS = getIndustrySelector();
    const nodes = getIndustryColumnNodes(colIndex);
    if (!nodes.length) {
      return '<div class="industry-picker-col"><div class="industry-picker-empty">—</div></div>';
    }
    return `<div class="industry-picker-col">${nodes.map((node) => {
      const state = getNodeCheckState(node);
      const active = industryPickerState.activeIds[colIndex] === node.id ? ' active' : '';
      const hasChildren = !node.leaf && node.children?.length;
      const checkCls = state === 'all' ? 'checked' : state === 'partial' ? 'indeterminate' : '';
      const label = node.leaf
        ? esc(IS.formatCodeDisplay(node.code) + node.name)
        : esc(node.name);
      const leafArg = node.leaf ? 'true' : 'false';
      return `<div class="industry-picker-item${active}" onclick="CRST_APP.onIndustryItemClick(${colIndex}, '${node.id}', ${leafArg})">
        <span class="industry-picker-check ${checkCls}" onclick="event.stopPropagation(); CRST_APP.onIndustryCheckClick('${node.id}', ${leafArg})"></span>
        <span class="industry-picker-label">${label}</span>
        ${hasChildren ? '<span class="industry-picker-arrow">›</span>' : ''}
      </div>`;
    }).join('')}</div>`;
  }

  function renderIndustryPicker(opts = {}) {
    ensureIndustryPickerInit(null);
    const IS = getIndustrySelector();
    if (!IS || !industryPickerState) return '';
    const readonly = !!opts.readonly;
    const summary = IS.formatSelectedSummary([...industryPickerState.selected]);
    const count = industryPickerState.selected.size;
    const disabledCls = readonly ? ' is-disabled' : '';
    const cols = [0, 1, 2, 3].map(renderIndustryColumn).join('');
    return `
      <div class="form-row industry-picker-wrap">
        <label><span class="req">*</span>涉及行业</label>
        <div class="industry-picker${disabledCls}" id="industryPickerRoot">
          <div class="industry-picker-selected-label">已选行业</div>
          <textarea class="textarea industry-picker-summary" id="industryPickerSummary" readonly>${esc(summary)}</textarea>
          <div class="industry-picker-toolbar">
            <input class="input" id="industryPickerSearch" placeholder="输入行业名称或代码，搜索并勾选" value="${esc(industryPickerState.search)}" ${readonly ? 'disabled' : 'oninput="CRST_APP.onIndustrySearchInput(this.value)"'} />
            <button type="button" class="btn btn-default" ${readonly ? 'disabled' : 'onclick="CRST_APP.onIndustrySelectAll()"'}>行业全选</button>
            <button type="button" class="btn btn-default" ${readonly ? 'disabled' : 'onclick="CRST_APP.onIndustryClearAll()"'}>清空</button>
            <span class="industry-picker-count" id="industryPickerCount">已选 ${count} 项</span>
          </div>
          <div class="industry-picker-columns" id="industryPickerColumns">${cols}</div>
        </div>
      </div>`;
  }

  function refreshIndustryPickerUI() {
    const IS = getIndustrySelector();
    if (!IS || !industryPickerState) return;
    const summary = document.getElementById('industryPickerSummary');
    const countEl = document.getElementById('industryPickerCount');
    const cols = document.getElementById('industryPickerColumns');
    if (summary) summary.value = IS.formatSelectedSummary([...industryPickerState.selected]);
    if (countEl) countEl.textContent = `已选 ${industryPickerState.selected.size} 项`;
    if (cols) cols.innerHTML = [0, 1, 2, 3].map(renderIndustryColumn).join('');
  }

  function readSelectedIndustryCodes() {
    return industryPickerState ? [...industryPickerState.selected] : [];
  }

  function onStressPurposeChange() {
    const IS = getIndustrySelector();
    if (!IS || !industryPickerState) return;
    const purpose = document.getElementById('d_stressPurpose')?.value || 'PBOC';
    industryPickerState.purpose = purpose;
    if (purpose === 'PBOC') {
      industryPickerState.selected = new Set(IS.getPbocDefaultCodes());
    } else {
      industryPickerState.selected = new Set();
    }
    industryPickerState.activeIds = [null, null, null, null];
    industryPickerState.search = '';
    const searchEl = document.getElementById('industryPickerSearch');
    if (searchEl) searchEl.value = '';
    refreshIndustryPickerUI();
  }

  function onIndustrySearchInput(value) {
    if (!industryPickerState) return;
    industryPickerState.search = value || '';
    industryPickerState.activeIds = [null, null, null, null];
    refreshIndustryPickerUI();
  }

  function onIndustrySelectAll() {
    const IS = getIndustrySelector();
    if (!IS || !industryPickerState) return;
    IS.getAllSelectableLeaves().forEach((code) => industryPickerState.selected.add(code));
    refreshIndustryPickerUI();
  }

  function onIndustryClearAll() {
    if (!industryPickerState) return;
    industryPickerState.selected.clear();
    refreshIndustryPickerUI();
  }

  function onIndustryCheckClick(nodeId, isLeaf) {
    const IS = getIndustrySelector();
    if (!IS || !industryPickerState) return;
    let codes;
    if (isLeaf) {
      codes = [nodeId];
    } else {
      const node = IS.findNodeById(IS.INDUSTRY_SELECTOR_TREE, nodeId);
      codes = IS.collectLeaves(node);
    }
    if (!codes.length) return;
    const allSelected = codes.every((c) => industryPickerState.selected.has(c));
    if (allSelected) codes.forEach((c) => industryPickerState.selected.delete(c));
    else codes.forEach((c) => industryPickerState.selected.add(c));
    refreshIndustryPickerUI();
  }

  function onIndustryItemClick(colIndex, nodeId, isLeaf) {
    if (!industryPickerState) return;
    if (isLeaf) {
      onIndustryCheckClick(nodeId, true);
      return;
    }
    industryPickerState.activeIds[colIndex] = nodeId;
    for (let i = colIndex + 1; i < 4; i++) industryPickerState.activeIds[i] = null;
    refreshIndustryPickerUI();
  }

  function exportSourceLabel(type) {
    return EXPORT_SOURCE_LABELS[type] || type || '-';
  }

  function resolveExportModuleName(opts) {
    if (opts?.moduleName) return opts.moduleName;
    const ctx = opts?.filterSnapshot?.context;
    const scope = opts?.scope || '';
    if (ctx === 'dataProcessOffline' || opts?.sourceType === 'DATA_PROCESS') return '数据处理';
    if (ctx === 'finTransDefaultAdjustment' || scope.includes('财务传导')) return '财务传导';
    if (ctx === 'pdLgd' || scope.includes('PD/LGD')) return 'PD/LGD计算';
    if (ctx === 'nplProv' || scope.includes('不良') || scope.includes('拨备')) return '不良和拨备计算';
    if (['STRESS_TRANS', 'STRESS_PHYS', 'STRESS_COMP'].includes(opts?.sourceType)) return '情景分析';
    if (opts?.sourceType === 'RESULTS' || opts?.sourceType === 'REPORT') return '压测结果分析';
    if (['stressSummary', 'defaultMonitor', 'defaultAdjustment', 'analysisTable', 'analysisChart', 'taskDetail', 'analysis'].includes(ctx)) {
      return '压测结果分析';
    }
    return '压测结果分析';
  }

  function getExportModuleName(e) {
    return e?.moduleName || resolveExportModuleName(e);
  }

  function defaultReasonText(r) {
    if (!r?.defaultFlag) return '';
    if (r.defaultReason) return r.defaultReason;
    if ((r.totalAssets || 0) <= 0) return '资产总计≤0';
    const alr0 = r.assetLiabilityRatioBefore ?? r.assetLiabilityRatio ?? 0.65;
    if (alr0 < 1 && (r.assetLiabilityRatioAfter ?? 1) > 1) return '压测后资产负债率>100%（基期<100%）';
    if (alr0 >= 1 && (r.alrIncreasePct || 0) > 0.2) return '压测后资产负债率增幅>20%（基期≥100%）';
    return '触发违约判定规则';
  }

  function renderDefaultCell(r) {
    if (!r.defaultFlag) return '<span class="tag tag-success">正常</span>';
    const tip = defaultReasonText(r);
    return `<span class="tag tag-error" title="${esc(tip)}">违约</span>`;
  }

  function enrichStressResult(out, record, params) {
    const alr0 = record.assetLiabilityRatio ?? params.assetLiabilityRatio ?? 0.65;
    const alrAfter = alr0 + (out.netProfitAfter < 0 ? 0.15 : -0.02);
    const alrIncreasePct = alr0 >= 1 ? (alrAfter - alr0) / alr0 : 0;
    let defaultReason = '';
    if (out.defaultFlag) {
      if ((record.totalAssets || 0) <= 0) defaultReason = '资产总计≤0';
      else if (alr0 < 1 && alrAfter >= 1) defaultReason = '压测后资产负债率>100%（基期<100%）';
      else if (alr0 >= 1 && alrAfter >= alr0 * 1.2) defaultReason = '压测后资产负债率增幅>20%（基期≥100%）';
      else defaultReason = '触发违约判定规则';
    }
    const revenue = (out.revenueAfter || 0) + (out.carbonCost || 0);
    const isHighCarbon = window.CRST_CARBON?.isHighCarbonIndustry?.(record.standardIndustry, record.gbIndustryCode);
    const operatingExpense = isHighCarbon
      ? revenue * (params.costIncomeRatio ?? 0.85) + (out.carbonCost || 0)
      : revenue * (params.costIncomeRatio ?? 0.85);
    return {
      ...out,
      operatingExpense: Math.round(operatingExpense * 100) / 100,
      defaultReason,
      assetLiabilityRatioBefore: alr0,
      assetLiabilityRatioAfter: alrAfter,
      alrIncreasePct,
    };
  }

  function mockAdjustedPd(basePd, impactRate) {
    return Math.min(1, Math.round((basePd || 0.02) * (1 + (impactRate || 0) * 2) * 10000) / 10000);
  }

  function renderPdAdjustPanel(entityId, t, results) {
    if (t.status !== 'COMPLETED' || !results.length) return '';
    const enabled = !!t.pdAdjustEnabled;
    const samples = results.slice(0, 5);
    const eclMap = {};
    entityEcls(entityId, t).forEach((e) => { eclMap[e.companyName] = e; });
    const rows = samples.map((r) => {
      const ecl = eclMap[r.companyName];
      const pdBefore = ecl?.pd ?? '-';
      const pdAfter = enabled ? mockAdjustedPd(ecl?.pd, r.impactRate) : pdBefore;
      return `<tr><td>${esc(r.companyName)}</td><td>${pdBefore}</td><td>${enabled ? `<strong>${pdAfter}</strong>` : pdBefore}</td><td>${((r.impactRate || 0) * 100).toFixed(2)}%</td></tr>`;
    }).join('');
    return `
      <div class="pd-adjust-panel info-panel">
        <h4 class="step-subtitle">PD 上调</h4>
        <label class="pd-adjust-toggle">
          <input type="checkbox" ${enabled ? 'checked' : ''} onchange="CRST_APP.togglePdAdjust(${entityId}, this.checked)" />
          <span>压测完成后按影响率上调 PD</span>
        </label>
        ${enabled ? `<div class="table-wrap"><table><thead><tr><th>公司</th><th>PD(前)</th><th>PD(调后)</th><th>影响率</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      </div>`;
  }

  function togglePdAdjust(id, enabled) {
    const t = resolveEntity(id);
    if (!t || t.status !== 'COMPLETED') return;
    t.pdAdjustEnabled = enabled;
    t.updatedAt = nowStr();
    if (isStressJobEntity(t)) addStressJobLog(id, enabled ? '场景压测：开启 PD 上调' : '场景压测：关闭 PD 上调');
    else addLog(id, enabled ? '场景压测：开启 PD 上调' : '场景压测：关闭 PD 上调');
    render();
  }

  function setIncludeInternalSummary(taskId, recId, include) {
    const t = getTask(taskId);
    const recs = recordsByTask[taskId] || [];
    const rec = recs.find((r) => r.id === recId);
    if (!t || !rec || !rec.reportMissing) return;
    rec.includeInternalSummary = include;
    applyReportMissingRules(t, [rec]);
    t.updatedAt = nowStr();
    addLog(taskId, `数据同步与确认：${rec.companyName} ${include ? '纳入' : '不纳入'}内部汇总`);
    render();
  }

  function getAmbiguityRule(code) {
    return INDUSTRY_AMBIGUITY_RULES.find((r) => r.code === code);
  }

  function detectAmbiguityForRecord(r) {
    if (r.ambiguityCode) return getAmbiguityRule(r.ambiguityCode);
    const gb = r.gbIndustryCode || '';
    return INDUSTRY_AMBIGUITY_RULES.find((rule) => gb.startsWith(rule.gbCode.slice(0, 4)) || gb === rule.gbCode);
  }

  function getPendingDisambigRecords(recs) {
    return (recs || []).filter((r) => {
      if (r.excluded) return false;
      const rule = detectAmbiguityForRecord(r);
      if (!rule) return false;
      if (!r.ambiguityCode) r.ambiguityCode = rule.code;
      return !r.ambiguityConfirmed;
    });
  }

  function allDisambigConfirmed(recs) {
    return getPendingDisambigRecords(recs).length === 0;
  }

  function getActiveSyncRecords(recs) {
    return (recs || []).filter((r) => r.dataAvailability !== 'EXCLUDED' && r.dataAvailability !== 'EXCLUDED_NO_REPORT' && !r.excluded);
  }

  function applyReportMissingRules(task, recs) {
    (recs || []).forEach((r) => {
      if (!r.reportMissing || r.excluded) return;
      if (task.sceneType === 'REGULATORY') {
        r.dataAvailability = 'EXCLUDED_NO_REPORT';
        r.availabilityReason = '财报缺失-不参与压测（监管场景）';
        r.dataSource = '已排除';
      } else if (r.includeInternalSummary === false) {
        r.dataAvailability = 'EXCLUDED_NO_REPORT';
        r.availabilityReason = '财报缺失-不纳入内部汇总';
        r.dataSource = '已排除';
      } else {
        r.includeInternalSummary = true;
        r.dataAvailability = 'NEED_AVG';
        r.availabilityReason = '财报缺失-内部汇总按行业均值补全';
        r.dataSource = '待补算';
      }
    });
  }

  function countSyncStatus(recs) {
    const active = getActiveSyncRecords(recs);
    return {
      usable: active.filter((r) => effectiveSyncStatus(r) === 'USABLE').length,
      needAvg: active.filter((r) => effectiveSyncStatus(r) === 'NEED_AVG').length,
      abnormal: active.filter((r) => effectiveSyncStatus(r) === 'ABNORMAL').length,
      excluded: (recs || []).filter((r) => r.excluded || r.dataAvailability === 'EXCLUDED' || r.dataAvailability === 'EXCLUDED_NO_REPORT').length,
    };
  }

  function getTaskFactorVersionOptions() {
    const set = new Set(getFactorVersionCatalog().map((c) => c.version));
    tasks.forEach((t) => {
      if (t.factorVersion) set.add(String(t.factorVersion).replace(/^F-/, ''));
    });
    return [...set].sort();
  }

  function renderFactorVersionSelect(selected, disabled) {
    const catalog = getFactorVersionCatalog();
    const sel = selected || catalog[0]?.version || '';
    const opts = catalog.map((c) =>
      `<option value="${esc(c.version)}" ${sel === c.version ? 'selected' : ''}>${esc(c.label)}</option>`
    ).join('');
    return `<select class="select" id="d_factorVersion" ${disabled ? 'disabled' : ''} onchange="CRST_APP.onTaskReportEndChange()">${opts}</select>`;
  }

  function filterTaskList() {
    const kw = taskFilters.name.trim().toLowerCase();
    return tasks.filter((t) => {
      if (kw && !t.taskName.toLowerCase().includes(kw)) return false;
      if (taskFilters.reportYear && String(getTaskReportYear(t)) !== taskFilters.reportYear) return false;
      if (taskFilters.loanType && t.loanType !== taskFilters.loanType) return false;
      if (taskFilters.loanRegion && t.loanRegion !== taskFilters.loanRegion) return false;
      return true;
    });
  }

  function paginateList(list, page, pageSize) {
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return { items: list.slice(start, start + pageSize), page: p, totalPages, total };
  }

  function getListPager(key) {
    if (!listPagers[key]) listPagers[key] = { page: 1, size: 10 };
    return listPagers[key];
  }

  function setListPage(key, p) {
    const pager = getListPager(key);
    pager.page = Math.max(1, parseInt(p, 10) || 1);
    render();
  }

  function setListPageSize(key, size) {
    const pager = getListPager(key);
    pager.size = parseInt(size, 10) || 10;
    pager.page = 1;
    render();
  }

  function sliceListPage(key, list) {
    const pager = getListPager(key);
    const pg = paginateList(list, pager.page, pager.size);
    listPagers[key].page = pg.page;
    return pg;
  }

  function renderPaginationBar(state, listKey) {
    const { page, totalPages, pageSize, total } = state;
    const prevDis = page <= 1 ? 'disabled' : '';
    const nextDis = page >= totalPages ? 'disabled' : '';
    const pageNums = [];
    const win = 2;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - win && i <= page + win)) pageNums.push(i);
    }
    let pageBtns = '';
    let last = 0;
    pageNums.forEach((i) => {
      if (last && i - last > 1) pageBtns += '<span class="page-ellipsis">…</span>';
      pageBtns += `<button type="button" class="page-btn ${i === page ? 'active' : ''}" onclick="CRST_APP.setListPage('${listKey}', ${i})">${i}</button>`;
      last = i;
    });
    if (!pageBtns && totalPages >= 1) {
      pageBtns = `<button type="button" class="page-btn active" onclick="CRST_APP.setListPage('${listKey}', 1)">1</button>`;
    }
    const sizeOpts = LIST_PAGE_SIZES.map((n) =>
      `<option value="${n}" ${pageSize === n ? 'selected' : ''}>${n} 条/页</option>`
    ).join('');
    return `
      <div class="pagination pagination-hxb">
        <button type="button" class="page-btn page-prev" ${prevDis} onclick="CRST_APP.setListPage('${listKey}', ${page - 1})" aria-label="上一页">&lt;</button>
        ${pageBtns}
        <button type="button" class="page-btn page-next" ${nextDis} onclick="CRST_APP.setListPage('${listKey}', ${page + 1})" aria-label="下一页">&gt;</button>
        <div class="page-size-wrap">
          <select class="page-size-select" onchange="CRST_APP.setListPageSize('${listKey}', this.value)" aria-label="每页条数">${sizeOpts}</select>
        </div>
        <span class="page-total-hint">共 ${total} 条</span>
      </div>`;
  }

  function renderListPagination(listKey, pg) {
    const pager = getListPager(listKey);
    return renderPaginationBar(
      { page: pg.page, totalPages: pg.totalPages, pageSize: pager.size, total: pg.total },
      listKey
    );
  }

  /** 列表（无分页） */
  function renderTable(list, theadHtml, rowMapper, emptyColspan) {
    const rows = list.map(rowMapper).join('')
      || `<tr><td colspan="${emptyColspan}" class="empty">暂无数据</td></tr>`;
    return `<div class="table-wrap"><table><thead>${theadHtml}</thead><tbody>${rows}</tbody></table></div>`;
  }

  /** 列表（无分页，可选 table-wrap 类名） */
  function renderFullTable(list, theadHtml, rowMapper, emptyColspan, wrapClass) {
    const rows = (list || []).map(rowMapper).join('')
      || `<tr><td colspan="${emptyColspan}" class="empty">暂无数据</td></tr>`;
    const wrapCls = wrapClass ? `table-wrap ${wrapClass}` : 'table-wrap';
    return `<div class="${wrapCls}"><table><thead>${theadHtml}</thead><tbody>${rows}</tbody></table></div>`;
  }

  /** 列表 + 统一分页（listKey 全局唯一，如 tasks / factors / task-1-sync） */
  function renderPagedTable(listKey, list, theadHtml, rowMapper, emptyColspan, wrapClass) {
    const pg = sliceListPage(listKey, list);
    const rows = pg.items.map(rowMapper).join('')
      || `<tr><td colspan="${emptyColspan}" class="empty">暂无数据</td></tr>`;
    const wrapCls = wrapClass ? `table-wrap ${wrapClass}` : 'table-wrap';
    return `
      <div class="${wrapCls}"><table><thead>${theadHtml}</thead><tbody>${rows}</tbody></table></div>
      ${renderListPagination(listKey, pg)}`;
  }

  function readTaskFiltersFromDom() {
    return {
      name: document.getElementById('tf_name')?.value || '',
      reportYear: document.getElementById('tf_report_year')?.value || '',
      loanType: document.getElementById('tf_loan_type')?.value || '',
      loanRegion: document.getElementById('tf_loan_region')?.value || '',
    };
  }

  function searchTasks() {
    taskFilters = readTaskFiltersFromDom();
    getListPager('tasks').page = 1;
    render();
  }

  function resetTaskFilters() {
    taskFilters = { name: '', reportYear: '', loanType: '', loanRegion: '' };
    getListPager('tasks').page = 1;
    render();
  }

  function canEditTask(t) {
    return TASK_EDITABLE.includes(t.status);
  }

  /** 已完成任务：仅允许改场景压测（情景勾选与参数），其余步骤只读 */
  function isStressOnlyEditTask(t) {
    return t && t.status === 'COMPLETED';
  }

  /** 已完成任务点「查看」：压测结果步可筛选、导出（与编辑态该步能力一致） */
  function isCompletedTaskViewMode(t) {
    return taskViewMode && t && t.status === 'COMPLETED';
  }

  function showTaskResultTools(t) {
    return !taskViewMode || isCompletedTaskViewMode(t);
  }

  function hasTaskLoanDataSynced(t) {
    if (!t) return false;
    if (t.status !== 'DRAFT') return true;
    return !!t.loanDataSynced && (recordsByTask[t.id] || []).length > 0;
  }

  function hasTaskGelanDataSynced(t) {
    if (!t) return false;
    if (t.status !== 'DRAFT') return true;
    return !!t.gelanDataSynced;
  }

  function hasTaskFinancialDataSynced(t) {
    if (!t) return false;
    return t.status !== 'DRAFT';
  }

  function canEditTaskBasicInfo(t) {
    return canEditTask(t) && !hasTaskFinancialDataSynced(t);
  }

  function canEditTaskNameOnly(t) {
    return canEditTask(t) && hasTaskFinancialDataSynced(t);
  }

  function editTaskEntryStep(t) {
    if (isStressOnlyEditTask(t)) return 3;
    return viewTaskDefaultStep(t);
  }

  function canEditStressSection(t, step) {
    if (!t || taskViewMode || t.status === 'ARCHIVED') return false;
    if (!isStressJobEntity(t)) {
      if (step !== 3) return false;
      if (t.status === 'COMPLETED') return taskEditMode;
      return t.status === 'READY_STRESS';
    }
    if (step === 1) {
      if (t.status === 'COMPLETED') return taskEditMode;
      return t.status === 'READY';
    }
    if (step === 2) {
      if (!isFinTransDone(t) && t.status !== 'COMPLETED') return false;
      if (t.status === 'COMPLETED') return taskEditMode;
      return t.status === 'READY' || isFinTransDone(t);
    }
    if (step === 3) {
      if ((!t.creditFetched || !t.eclFetched) && t.status !== 'COMPLETED') return false;
      if (t.status === 'COMPLETED') return taskEditMode;
      return t.status === 'READY' || (t.creditFetched && t.eclFetched);
    }
    return false;
  }

  function canDeleteTask(t) {
    return !!t;
  }

  function taskActions(t) {
    const btns = [];
    btns.push(`<button class="btn btn-link" onclick="CRST_APP.viewTaskInModule(${t.id})">查看</button>`);
    if (canEditTask(t)) btns.push(`<button class="btn btn-link" onclick="CRST_APP.editTask(${t.id})">编辑</button>`);
    btns.push(`<button class="btn btn-link" onclick="CRST_APP.deleteTask(${t.id})">删除</button>`);
    return btns.join('');
  }

  function resolveDetailStep(tab) {
    if (tab == null || tab === '') return null;
    if (typeof tab === 'number') return tab;
    return TAB_TO_STEP[tab] ?? 0;
  }

  function viewTaskDefaultStep(t) {
    if (t.status === 'PROCESSING') return 1;
    return stepIndex(t.status);
  }

  /** 进入任务详情时默认 Tab：有同步数据则与「新建后」一致进入财务数据页 */
  function dataProcessDefaultTab(t) {
    if (!t) return 0;
    const recs = recordsByTask[t.id] || [];
    if (hasTaskFinancialDataSynced(t) || t.loanDataSynced || recs.length > 0) return 1;
    return 0;
  }

  function navigateDataProcessTask(id, tab) {
    const step = tab === 0 ? 0 : 1;
    dataProcessTab = tab;
    detailStep = step;
    navigate('data-process', id, step);
  }

  function countNeedAvg(recs) {
    return recs.filter((r) => effectiveSyncStatus(r) === 'NEED_AVG').length;
  }

  function isAirportEnterprise(r) {
    if (!r) return false;
    if (r.standardIndustry === '机场企业' || r.standardIndustry === '机场') return true;
    if (r.gbIndustryCode === 'G5631' || r.emissionFactorCode === 'EMISSION_G5631') return true;
    const api = String(r.apiIndustry || '');
    return api.includes('机场') || api.includes('G5631');
  }

  function getTaskReportYear(t) {
    if (t?.reportYear != null && t.reportYear !== '') return Number(t.reportYear);
    const y = parseInt(String(t?.reportPeriodEnd || '').slice(0, 4), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
  }

  function buildTaskReportYearFilterOptions(selectedYear = '') {
    const years = new Set(
      tasks.map((t) => getTaskReportYear(t)).filter((y) => Number.isFinite(y))
    );
    if (selectedYear) years.add(Number(selectedYear));
    if (!years.size) {
      const base = new Date().getFullYear();
      for (let y = base - 2; y <= base + 5; y += 1) years.add(y);
    }
    return [
      '<option value="">全部</option>',
      ...[...years].sort((a, b) => b - a).map((y) =>
        `<option value="${y}" ${selectedYear === String(y) ? 'selected' : ''}>${y}</option>`
      ),
    ].join('');
  }

  function taskReportPeriodRange(t) {
    const y = getTaskReportYear(t);
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }

  function getTaskDataYears(t) {
    const basicYear = getTaskReportYear(t);
    return { basicYear, financialYear: basicYear - 1 };
  }

  const BRANCH_PROVINCE_MAP = {
    上海分行: '上海市', 北京分行: '北京市', 广州分行: '广东省', 深圳分行: '广东省',
    成都分行: '四川省', 西安分行: '陕西省', 香港分行: '香港特别行政区', 宁波分行: '浙江省',
    郑州分行: '河南省', 昆明分行: '云南省', 天津分行: '天津市', 武汉分行: '湖北省',
    南京分行: '江苏省', 大连分行: '辽宁省', 厦门分行: '福建省',
  };

  function provinceFromBranch(branchName) {
    if (!branchName) return '-';
    return BRANCH_PROVINCE_MAP[branchName] || String(branchName).replace(/分行$/, '');
  }

  function fmtFinAmount(v) {
    if (v == null || v === '') return '-';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function buildFinancialStatement(revenue, costIncomeRatio) {
    if (revenue == null) return null;
    const rev = Number(revenue);
    const cir = costIncomeRatio ?? 0.85;
    const cost = Math.round(rev * cir);
    const profit = rev - cost;
    const net = Math.round(profit * 0.75);
    const totalAssets = Math.round(rev * 2.4);
    const monetary = Math.round(totalAssets * 0.12);
    const notesRecv = Math.round(totalAssets * 0.06);
    const acctRecv = Math.round(totalAssets * 0.14);
    const inventory = Math.round(totalAssets * 0.1);
    const currentAssets = Math.round(totalAssets * 0.52);
    const fixedAssets = Math.round(totalAssets * 0.48);
    const liabilities = Math.round(totalAssets * 0.62);
    const equity = totalAssets - liabilities;
    const paidIn = Math.round(equity * 0.45);
    return {
      totalAssets,
      monetaryFunds: monetary,
      notesReceivable: notesRecv,
      accountsReceivable: acctRecv,
      inventory,
      totalCurrentAssets: currentAssets,
      fixedAssets,
      totalLiabilities: liabilities,
      ownersEquity: equity,
      paidInCapital: paidIn,
      operatingRevenue: rev,
      operatingCost: cost,
      totalProfit: Math.round(profit),
      netProfit: net,
    };
  }

  function enrichLoanSyncRecordFields(record, reportYear) {
    if (!record) return record;
    const basicYear = reportYear;
    const financialYear = reportYear - 1;
    record.basicInfoYear = basicYear;
    record.financialYear = financialYear;
    record.emissionYear = financialYear;
    record.province = record.province || provinceFromBranch(record.branchName);
    record.creditCustomerNo = record.creditCustomerNo
      || (record.customerId ? record.customerId.replace(/^CUST-/, 'CC-') : `CC-${record.id}`);
    record.coreAccountNo = record.coreAccountNo || `CORE-${String(record.id).padStart(10, '0')}`;
    record.loanBalance = record.loanBalance ?? Math.round((record.revenue || 80000) * 0.42);
    record.loanTermYears = record.loanTermYears ?? 5;
    record.loanRemainingTermYears = record.loanRemainingTermYears ?? 3;
    record.provisionAmount = record.provisionAmount ?? Math.round((record.loanBalance || 0) * 0.025 * 100) / 100;
    record.industryName = record.industryName
      || record.standardIndustry
      || String(record.apiIndustry || '').replace(/^[A-Z0-9]+\s*/, '')
      || '-';
    return record;
  }

  function clearFinancialSyncRecordFields(record) {
    if (!record) return record;
    [
      'totalAssets', 'monetaryFunds', 'notesReceivable', 'accountsReceivable', 'inventory',
      'totalCurrentAssets', 'fixedAssets', 'totalLiabilities', 'ownersEquity', 'paidInCapital',
      'operatingRevenue', 'operatingCost', 'totalProfit', 'netProfit',
    ].forEach((key) => { record[key] = null; });
    if (!record.ghgFromGelan && !record.ghgManualOverride) {
      record.ghgAccounted = null;
      record.ghgEmissions = null;
    }
    record.financialDataSynced = false;
    return record;
  }

  function enrichGelanSyncRecordFields(record, index) {
    if (!record || record.excluded || record.ghgManualOverride) return record;
    const seed = (record.id || 0) * 17 + (index || 0) * 3;
    const matched = seed % 100 < 68;
    record.gelanMatched = matched;
    if (!matched) {
      record.ghgFromGelan = false;
      record.ghgAccounted = null;
      record.ghgEmissions = null;
      return record;
    }
    record.ghgFromGelan = true;
    const disclosed = seed % 10 !== 0;
    record.ghgAccounted = disclosed;
    if (disclosed) {
      const base = record.loanBalance || record.revenue || 50000;
      record.ghgEmissions = Math.round(base * (0.0016 + (seed % 7) * 0.00015) * 100) / 100;
    } else {
      record.ghgEmissions = null;
    }
    return record;
  }

  function enrichFinancialSyncRecordFields(record) {
    if (!record) return record;
    const preserveGhg = record.ghgManualOverride === true || record.ghgFromGelan === true;
    const savedGhgAccounted = preserveGhg ? record.ghgAccounted : null;
    const savedGhgEmissions = preserveGhg ? record.ghgEmissions : null;
    clearFinancialSyncRecordFields(record);
    if (record.reportMissing || effectiveSyncStatus(record) === 'NEED_AVG') {
      if (preserveGhg) {
        record.ghgAccounted = savedGhgAccounted;
        record.ghgEmissions = savedGhgEmissions;
      }
      return record;
    }
    const fin = buildFinancialStatement(record.revenue, record.costIncomeRatio);
    if (fin) {
      Object.assign(record, fin);
      record.revenue = fin.operatingRevenue;
      record.financialDataSynced = true;
      if (preserveGhg) {
        record.ghgAccounted = savedGhgAccounted;
        record.ghgEmissions = savedGhgEmissions;
      } else if (!record.ghgFromGelan) {
        record.ghgAccounted = null;
        record.ghgEmissions = null;
      }
    }
    return record;
  }

  function enrichSyncRecordFields(record, reportYear) {
    enrichLoanSyncRecordFields(record, reportYear);
    enrichFinancialSyncRecordFields(record);
    return record;
  }

  function ensureTaskRecordsEnriched(taskId, t) {
    const recs = recordsByTask[taskId];
    if (!recs?.length) return;
    const reportYear = getTaskReportYear(t);
    recs.forEach((r) => {
      enrichLoanSyncRecordFields(r, reportYear);
      if (hasTaskFinancialDataSynced(t)) {
        if (!r.financialDataSynced) enrichFinancialSyncRecordFields(r);
      } else {
        clearFinancialSyncRecordFields(r);
      }
    });
    t.basicInfoYear = reportYear;
    t.financialDataYear = reportYear - 1;
  }

  function formatCustomerIndustryLabel(r) {
    const major = resolveTestIndustryMajor(r.standardIndustry, r.gbIndustryCode);
    const sub = r.industryName || r.standardIndustry || '未映射';
    if (major && sub && major !== sub && !String(sub).startsWith(major)) {
      return `${major}-${sub}`;
    }
    return sub;
  }

  function recordLacksFinancialData(r, t) {
    if (!hasTaskFinancialDataSynced(t)) return false;
    if (r.reportMissing) return true;
    if (effectiveSyncStatus(r) === 'NEED_AVG' && !r.financialDataSynced) return true;
    if (r.totalAssets == null && r.operatingRevenue == null && (r.revenue == null || r.revenue === '')) return true;
    if (r.financialDataSynced) return false;
    if (r.revenue != null && r.revenue !== '') return false;
    if (r.totalAssets != null) return false;
    if (effectiveSyncStatus(r) === 'USABLE' && r.costIncomeRatio != null) return false;
    return false;
  }

  function isInternalPdRecordReady(r, srcTask) {
    if (r.internalPdSynced) return true;
    if (srcTask?.internalPdDataSynced) return true;
    if (r.baselinePd != null || r.baselinePd0 != null) return true;
    return false;
  }

  function getInternalPdEligibleRecords(taskId, t) {
    return (recordsByTask[taskId] || []).filter((r) => !r.excluded && recordLacksFinancialData(r, t));
  }

  function mockHasInternalRatingModel(record) {
    const key = record.creditCustomerNo || record.customerId || String(record.id);
    let sum = 0;
    for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
    return sum % 3 !== 0;
  }

  function enrichInternalPdFields(record) {
    const hasModel = mockHasInternalRatingModel(record);
    record.hasInternalRatingModel = hasModel;
    record.baselinePd = null;
    record.baselinePd0 = null;
    record.baselineLgd0 = null;
    if (hasModel) {
      record.internalRatingModel = ['对公内评-V2.1', '对公内评-V3.0', '零售内评-V1.2'][record.id % 3];
      const base = record.pdValue ?? (0.008 + (record.id % 7) * 0.004);
      record.baselinePd = Math.round(Math.min(0.99, base) * 10000) / 10000;
    } else {
      record.internalRatingModel = null;
      record.baselinePd0 = Math.round((0.012 + (record.id % 5) * 0.006) * 10000) / 10000;
      record.baselineLgd0 = Math.round((0.38 + (record.id % 4) * 0.05) * 10000) / 10000;
    }
    record.internalPdSynced = true;
    return record;
  }

  function formatPdMetric(v) {
    if (v == null || v === '' || !Number.isFinite(v)) return '-';
    return `${(v * 100).toFixed(2)}%`;
  }

  function renderBasicInfoCells(r) {
    return `
      <td>${esc(r.creditCustomerNo || '-')}</td>
      <td>${esc(r.coreAccountNo || '-')}</td>
      <td>${esc(r.companyName)}</td>
      <td>${esc(r.unifiedSocialCreditCode || '-')}</td>
      <td>${esc(r.province || provinceFromBranch(r.branchName))}</td>
      <td>${esc(formatCustomerIndustryLabel(r))}</td>
      <td>${fmtFinAmount(r.loanBalance)}</td>
      <td>${r.loanTermYears ?? '-'}</td>
      <td>${r.loanRemainingTermYears ?? '-'}</td>
      <td>${esc(loanClassLabel(r.loanClassification))}</td>
      <td>${fmtFinAmount(r.provisionAmount)}</td>`;
  }

  function renderInternalPdTableHead(t) {
    const { basicYear } = getTaskDataYears(t);
    return `<thead>
      <tr class="fin-sync-group-row">
        <th rowspan="2" class="th-sub">序号</th>
        <th rowspan="2" class="th-sub">客户号</th>
        <th colspan="11" class="th-group-basic">基本情况（${basicYear}年）</th>
        <th rowspan="2" class="th-sub">基期违约率PD</th>
        <th rowspan="2" class="th-sub">基期PD0</th>
        <th rowspan="2" class="th-sub">基期LGD0</th>
      </tr>
      <tr class="fin-sync-sub-row">
        <th class="th-sub">信贷客户编号</th>
        <th class="th-sub">核心账号</th>
        <th class="th-sub">客户名称</th>
        <th class="th-sub">统一社会信用代码</th>
        <th class="th-sub">所在地区（省/自治区/直辖市）</th>
        <th class="th-sub">所属行业</th>
        <th class="th-sub">贷款余额（万元）</th>
        <th class="th-sub">贷款期限（年）</th>
        <th class="th-sub">贷款剩余期限（年）</th>
        <th class="th-sub">贷款五级分类</th>
        <th class="th-sub">拨备计提金额（万元）</th>
      </tr>
    </thead>`;
  }

  function renderInternalPdRow(r, idx) {
    const synced = !!r.internalPdSynced;
    const pdCell = synced && r.hasInternalRatingModel ? formatPdMetric(r.baselinePd) : '-';
    const pd0Cell = synced && !r.hasInternalRatingModel ? formatPdMetric(r.baselinePd0) : '-';
    const lgd0Cell = synced && !r.hasInternalRatingModel ? formatPdMetric(r.baselineLgd0) : '-';
    return `<tr>
      <td>${idx + 1}</td>
      <td>${esc(r.customerId || '-')}</td>
      ${renderBasicInfoCells(r)}
      <td class="num">${pdCell}</td>
      <td class="num">${pd0Cell}</td>
      <td class="num">${lgd0Cell}</td>
    </tr>`;
  }

  function renderInternalPdSection(t, list, opts = {}) {
    if (!hasTaskFinancialDataSynced(t)) return '';
    const eligible = (list || []).filter((r) => !r.excluded && recordLacksFinancialData(r, t));
    if (!eligible.length) return '';
    const readonly = opts.readonly || (taskViewMode && !taskEditMode);
    const exportTaskId = opts.exportTaskId ?? t.id;
    const rows = eligible.map((r, i) => renderInternalPdRow(r, i)).join('');
    const emptyHint = t.internalPdDataSynced
      ? ''
      : '<p class="flow-hint internal-pd-empty-hint">请点击上方「同步内部PD数据」，为无财报客户补录 PD/LGD 指标。</p>';
    const toolbarActions = `
      <div class="toolbar-btn-group toolbar-btn-group--end internal-pd-toolbar-actions">
        <button type="button" class="btn btn-default" onclick="CRST_APP.exportInternalPdData(${exportTaskId})">导出内部PD/LGD数据</button>
        ${readonly ? '' : `<button type="button" class="btn btn-default" onclick="CRST_APP.openInternalPdImportModal(${exportTaskId})">导入内部PD/LGD数据</button>`}
      </div>`;
    return `
      <div class="internal-pd-section">
        <div class="internal-pd-section-header">
          <h4 class="step-subtitle">无财务数据客户内部 PD/LGD</h4>
          ${toolbarActions}
        </div>
        <p class="flow-hint">通过信贷客户编号匹配内评模型获取基期违约率 PD；无内评模型时通过核心账号从减估值系统匹配基期 PD0、LGD0（两类指标互斥）。</p>
        ${emptyHint}
        <div class="table-wrap fin-sync-table internal-pd-table">
          <table>${renderInternalPdTableHead(t)}<tbody>${rows}</tbody></table>
        </div>
        ${t.internalPdDataSynced && !readonly ? `<p class="flow-hint">已同步 ${eligible.filter((r) => r.internalPdSynced).length} 户无财报客户的内部 PD/LGD 数据。</p>` : ''}
      </div>`;
  }

  const INTERNAL_PD_EXPORT_HEADERS = [
    '序号', '客户号', '信贷客户编号', '核心账号', '客户名称', '统一社会信用代码', '所在地区', '所属行业',
    '贷款余额（万元）', '贷款期限（年）', '贷款剩余期限（年）', '贷款五级分类', '拨备计提金额（万元）',
    '基期违约率PD', '基期PD0', '基期LGD0',
  ];

  function buildInternalPdExportText(taskId, records, t) {
    const task = t || getTask(taskId);
    const { basicYear } = getTaskDataYears(task || {});
    const lines = [
      '无财务数据客户内部 PD/LGD',
      `任务：${task?.taskName || taskId}`,
      `基本情况：${basicYear}年`,
      '说明：基期违约率PD 与 基期PD0/基期LGD0 互斥，不可同时填写。',
      '',
      INTERNAL_PD_EXPORT_HEADERS.join('\t'),
    ];
    records.forEach((r, i) => {
      lines.push([
        i + 1,
        r.customerId || '',
        r.creditCustomerNo || '',
        r.coreAccountNo || '',
        r.companyName || '',
        r.unifiedSocialCreditCode || '',
        r.province || provinceFromBranch(r.branchName),
        formatCustomerIndustryLabel(r),
        r.loanBalance ?? '',
        r.loanTermYears ?? '',
        r.loanRemainingTermYears ?? '',
        loanClassLabel(r.loanClassification),
        r.provisionAmount ?? '',
        r.baselinePd ?? '',
        r.baselinePd0 ?? '',
        r.baselineLgd0 ?? '',
      ].join('\t'));
    });
    return lines.join('\n');
  }

  function parseInternalPdImportMetric(val) {
    if (val == null || val === '' || val === '-') return null;
    const s = String(val).trim().replace(/%/g, '');
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return null;
    return n > 1 ? n / 100 : n;
  }

  function applyInternalPdImportToRecord(record, data) {
    const pd = parseInternalPdImportMetric(data.baselinePd);
    const pd0 = parseInternalPdImportMetric(data.baselinePd0);
    const lgd0 = parseInternalPdImportMetric(data.baselineLgd0);
    if (pd != null && pd0 == null && lgd0 == null) {
      record.hasInternalRatingModel = true;
      record.internalRatingModel = record.internalRatingModel || '对公内评-导入';
      record.baselinePd = Math.min(0.99, Math.round(pd * 10000) / 10000);
      record.baselinePd0 = null;
      record.baselineLgd0 = null;
    } else if (pd == null && pd0 != null && lgd0 != null) {
      record.hasInternalRatingModel = false;
      record.internalRatingModel = null;
      record.baselinePd = null;
      record.baselinePd0 = Math.min(0.99, Math.round(pd0 * 10000) / 10000);
      record.baselineLgd0 = Math.min(1, Math.round(lgd0 * 10000) / 10000);
    } else if (pd != null) {
      record.hasInternalRatingModel = true;
      record.internalRatingModel = record.internalRatingModel || '对公内评-导入';
      record.baselinePd = Math.min(0.99, Math.round(pd * 10000) / 10000);
      record.baselinePd0 = null;
      record.baselineLgd0 = null;
    }
    record.internalPdSynced = true;
    record.internalPdManualOverride = true;
    return record;
  }

  function exportInternalPdData(taskId) {
    const t = getTask(taskId);
    const recs = getInternalPdEligibleRecords(taskId, t);
    if (!recs.length) { toast('暂无可导出的无财报客户', 'info'); return; }
    triggerExportFileDownload(
      `无财务数据客户内部PD_LGD_${t?.taskName || taskId}.txt`,
      buildInternalPdExportText(taskId, recs, t),
    );
    addLog(taskId, `数据处理：导出内部PD/LGD数据 ${recs.length} 条`);
    toast(`已导出内部 PD/LGD 数据 ${recs.length} 条`);
  }

  function openInternalPdImportModal(taskId) {
    const t = getTask(taskId);
    if (!hasTaskFinancialDataSynced(t)) {
      toast('请先同步财务数据', 'error');
      return;
    }
    if (!getInternalPdEligibleRecords(taskId, t).length) {
      toast('暂无无财报客户可导入', 'info');
      return;
    }
    pendingInternalPdImportTaskId = taskId;
    internalPdImportFilePicked = false;
    const hint = document.getElementById('internal_pd_import_hint');
    if (hint) hint.textContent = '未选择文件';
    showModal('modalInternalPdImport');
  }

  function mockPickInternalPdImportFile() {
    internalPdImportFilePicked = true;
    const hint = document.getElementById('internal_pd_import_hint');
    if (hint) hint.textContent = '已选择：无财务数据客户内部PD_LGD导入模板.xlsx';
  }

  function confirmInternalPdImport() {
    const taskId = pendingInternalPdImportTaskId;
    if (!taskId) return;
    if (!internalPdImportFilePicked) { toast('请先选择 Excel 文件', 'error'); return; }
    const t = getTask(taskId);
    const eligible = getInternalPdEligibleRecords(taskId, t);
    if (!eligible.length) {
      hideModal();
      pendingInternalPdImportTaskId = null;
      internalPdImportFilePicked = false;
      toast('暂无无财报客户可导入', 'info');
      render();
      return;
    }
    let updated = 0;
    eligible.forEach((r, i) => {
      const basePd = r.baselinePd ?? 0.012;
      const basePd0 = r.baselinePd0 ?? 0.018;
      const baseLgd0 = r.baselineLgd0 ?? 0.45;
      if (i % 2 === 0) {
        applyInternalPdImportToRecord(r, {
          baselinePd: Math.min(0.99, Math.round((basePd + 0.003 + i * 0.001) * 10000) / 10000),
          baselinePd0: null,
          baselineLgd0: null,
        });
      } else {
        applyInternalPdImportToRecord(r, {
          baselinePd: null,
          baselinePd0: Math.min(0.99, Math.round((basePd0 + 0.004 + i * 0.001) * 10000) / 10000),
          baselineLgd0: Math.min(1, Math.round((baseLgd0 + 0.02) * 10000) / 10000),
        });
      }
      updated++;
    });
    t.internalPdDataSynced = true;
    t.updatedAt = nowStr();
    addLog(taskId, `数据处理：导入内部PD/LGD数据，覆盖 ${updated} 条`);
    hideModal();
    pendingInternalPdImportTaskId = null;
    internalPdImportFilePicked = false;
    toast(`已导入并覆盖 ${updated} 条内部 PD/LGD 数据`);
    render();
  }

  function finSyncTableColspan(opts) {
    let n = 28 + (opts.showCustomerId ? 1 : 0);
    if (opts.showStatusCols !== false) n += 2;
    if (opts.showOpCol) n += 1;
    if (opts.showInternalCol) n += 1;
    return n;
  }

  function renderFinancialSyncTableHead(t, opts) {
    const { basicYear, financialYear } = getTaskDataYears(t);
    const showStatus = opts.showStatusCols !== false;
    const metaCells = showStatus ? [
      '<th rowspan="2" class="th-sub th-group-meta">状态</th>',
      '<th rowspan="2" class="th-sub th-group-meta">原因</th>',
    ] : [];
    if (opts.showOpCol) metaCells.push('<th rowspan="2" class="th-sub">操作</th>');
    if (opts.showInternalCol) metaCells.push('<th rowspan="2" class="th-sub">纳入内部汇总</th>');
    const customerIdHead = opts.showCustomerId
      ? '<th rowspan="2" class="th-sub">客户号</th>' : '';
    const ghgDisclosureLabel = opts.regulatoryView ? '披露温室气体排放情况（是/否）' : '核算温室气体排放情况（是/否）';
    return `<thead>
      <tr class="fin-sync-group-row">
        <th rowspan="2" class="th-sub">序号</th>
        ${customerIdHead}
        <th colspan="11" class="th-group-basic">基本情况（${basicYear}年）</th>
        <th colspan="14" class="th-group-fin">财务状况（${financialYear}年）</th>
        <th colspan="2" class="th-group-ghg">温室气体排放情况（${financialYear}年）</th>
        ${metaCells.join('')}
      </tr>
      <tr class="fin-sync-sub-row">
        <th class="th-sub">信贷客户编号</th>
        <th class="th-sub">核心账号</th>
        <th class="th-sub">客户名称</th>
        <th class="th-sub">统一社会信用代码</th>
        <th class="th-sub">所在地区（省/自治区/直辖市）</th>
        <th class="th-sub">所属行业</th>
        <th class="th-sub">贷款余额（万元）</th>
        <th class="th-sub">贷款期限（年）</th>
        <th class="th-sub">贷款剩余期限（年）</th>
        <th class="th-sub">贷款五级分类</th>
        <th class="th-sub">拨备计提金额（万元）</th>
        <th class="th-sub">资产总额（万元）</th>
        <th class="th-sub">其中：货币资金（万元）</th>
        <th class="th-sub">应收票据（万元）</th>
        <th class="th-sub">应收账款（万元）</th>
        <th class="th-sub">存货（万元）</th>
        <th class="th-sub">流动资产合计（万元）</th>
        <th class="th-sub">固定资产（万元）</th>
        <th class="th-sub">负债总额（万元）</th>
        <th class="th-sub">所有者权益（万元）</th>
        <th class="th-sub">其中：实收资本（万元）</th>
        <th class="th-sub">营业收入（万元）</th>
        <th class="th-sub">营业成本（万元）</th>
        <th class="th-sub">利润总额（万元）</th>
        <th class="th-sub">净利润（万元）</th>
        <th class="th-sub">${ghgDisclosureLabel}</th>
        <th class="th-sub">温室气体排放量（吨CO2当量）</th>
      </tr>
    </thead>`;
  }

  function renderFinancialSyncRow(r, idx, t, opts) {
    const rowClassFn = opts.rowClass || (() => '');
    const finVisible = hasTaskFinancialDataSynced(t);
    const ghgVisible = hasTaskGelanDataSynced(t) || finVisible;
    const finCell = (value) => (finVisible ? fmtFinAmount(value) : '');
    const ghgYesNo = !ghgVisible
      ? ''
      : (r.ghgAccounted == null ? '-' : (r.ghgAccounted ? '是' : '否'));
    const ghgAmount = !ghgVisible
      ? ''
      : (r.ghgAccounted && r.ghgEmissions != null ? fmtFinAmount(r.ghgEmissions) : '-');
    const showStatus = opts.showStatusCols !== false;
    const customerIdCell = opts.showCustomerId
      ? `<td>${esc(r.customerId || '-')}</td>` : '';
    return `<tr class="${rowClassFn(r)}">
      <td>${idx + 1}</td>
      ${customerIdCell}
      <td>${esc(r.creditCustomerNo || '-')}</td>
      <td>${esc(r.coreAccountNo || '-')}</td>
      <td>${esc(r.companyName)}</td>
      <td>${esc(r.unifiedSocialCreditCode || '-')}</td>
      <td>${esc(r.province || provinceFromBranch(r.branchName))}</td>
      <td>${esc(formatCustomerIndustryLabel(r))}</td>
      <td>${fmtFinAmount(r.loanBalance)}</td>
      <td>${r.loanTermYears ?? '-'}</td>
      <td>${r.loanRemainingTermYears ?? '-'}</td>
      <td>${esc(loanClassLabel(r.loanClassification))}</td>
      <td>${fmtFinAmount(r.provisionAmount)}</td>
      <td>${finCell(r.totalAssets)}</td>
      <td>${finCell(r.monetaryFunds)}</td>
      <td>${finCell(r.notesReceivable)}</td>
      <td>${finCell(r.accountsReceivable)}</td>
      <td>${finCell(r.inventory)}</td>
      <td>${finCell(r.totalCurrentAssets)}</td>
      <td>${finCell(r.fixedAssets)}</td>
      <td>${finCell(r.totalLiabilities)}</td>
      <td>${finCell(r.ownersEquity)}</td>
      <td>${finCell(r.paidInCapital)}</td>
      <td>${finCell(r.operatingRevenue ?? r.revenue)}</td>
      <td>${finCell(r.operatingCost)}</td>
      <td>${finCell(r.totalProfit)}</td>
      <td>${finCell(r.netProfit)}</td>
      <td>${ghgYesNo}</td>
      <td>${ghgAmount}</td>
      ${showStatus ? `<td>${syncStatusLabel(effectiveSyncStatus(r))}</td><td>${esc(r.availabilityReason)}</td>` : ''}
      ${opts.showOpCol ? `<td>${r.dataAvailability === 'ABNORMAL'
        ? `<button class="btn btn-link" onclick="CRST_APP.excludeRecord(${t.id},${r.id})">删除</button>` : '-'}</td>` : ''}
      ${opts.showInternalCol ? `<td>${r.reportMissing
        ? `<label class="inline-check"><input type="checkbox" ${r.includeInternalSummary !== false ? 'checked' : ''} onchange="CRST_APP.setIncludeInternalSummary(${t.id}, ${r.id}, this.checked)" /> 纳入</label>`
        : '-'}</td>` : ''}
    </tr>`;
  }

  function renderFinancialSyncTable(list, t, opts, emptyText) {
    const colspan = finSyncTableColspan(opts);
    const empty = emptyText || '暂无数据';
    const rows = list.map((r, i) => renderFinancialSyncRow(r, i, t, opts)).join('')
      || `<tr><td colspan="${colspan}" class="empty">${esc(empty)}</td></tr>`;
    return `<div class="table-wrap fin-sync-table"><table>${renderFinancialSyncTableHead(t, opts)}<tbody>${rows}</tbody></table></div>`;
  }

  const CUSTOMER_BASIC_INFO_EXPORT_HEADERS = [
    '序号', '客户号', '信贷客户编号', '核心账号', '客户名称', '统一社会信用代码', '所在地区', '所属行业',
    '贷款余额（万元）', '贷款期限（年）', '贷款剩余期限（年）', '贷款五级分类', '拨备计提金额（万元）',
    '资产总额（万元）', '货币资金（万元）', '应收票据（万元）', '应收账款（万元）',
    '存货（万元）', '流动资产合计（万元）', '固定资产（万元）', '负债总额（万元）',
    '所有者权益（万元）', '实收资本（万元）', '营业收入（万元）', '营业成本（万元）',
    '利润总额（万元）', '净利润（万元）', '披露温室气体排放情况', '温室气体排放量（吨CO2当量）',
  ];

  function buildCustomerBasicInfoExportText(taskId, records) {
    const t = getTask(taskId);
    const { basicYear, financialYear } = getTaskDataYears(t || {});
    const lines = [
      '高碳行业客户基础信息表',
      `任务：${t?.taskName || taskId}`,
      `基本情况：${basicYear}年；财务状况/温室气体：${financialYear}年`,
      '',
      CUSTOMER_BASIC_INFO_EXPORT_HEADERS.join('\t'),
    ];
    (records || []).forEach((r, i) => {
      lines.push([
        i + 1,
        r.customerId || '',
        r.creditCustomerNo || '',
        r.coreAccountNo || '',
        r.companyName || '',
        r.unifiedSocialCreditCode || '',
        r.province || provinceFromBranch(r.branchName),
        formatCustomerIndustryLabel(r),
        r.loanBalance ?? '',
        r.loanTermYears ?? '',
        r.loanRemainingTermYears ?? '',
        loanClassLabel(r.loanClassification),
        r.provisionAmount ?? '',
        r.totalAssets ?? '',
        r.monetaryFunds ?? '',
        r.notesReceivable ?? '',
        r.accountsReceivable ?? '',
        r.inventory ?? '',
        r.totalCurrentAssets ?? '',
        r.fixedAssets ?? '',
        r.totalLiabilities ?? '',
        r.ownersEquity ?? '',
        r.paidInCapital ?? '',
        r.operatingRevenue ?? r.revenue ?? '',
        r.operatingCost ?? '',
        r.totalProfit ?? '',
        r.netProfit ?? '',
        r.ghgAccounted ? '是' : '否',
        r.ghgAccounted && r.ghgEmissions != null ? r.ghgEmissions : '',
      ].join('\t'));
    });
    return lines.join('\n');
  }

  function exportCustomerBasicInfo(taskId) {
    const recs = (recordsByTask[taskId] || []).filter((r) => !r.excluded);
    if (!recs.length) { toast('暂无可导出客户数据', 'info'); return; }
    const t = getTask(taskId);
    triggerExportFileDownload(
      `高碳行业客户基础信息表_${t?.taskName || taskId}.txt`,
      buildCustomerBasicInfoExportText(taskId, recs),
    );
    addLog(taskId, `数据处理：导出客户基础信息表 ${recs.length} 条`);
    toast(`已导出客户基础信息 ${recs.length} 条`);
  }

  function renderCustomerBasicInfoSection(t, list, opts = {}) {
    const regulatoryView = !!opts.regulatoryView;
    const showStatusCols = opts.showStatusCols !== false;
    const tableOpts = {
      ...opts,
      regulatoryView,
      showStatusCols,
      showCustomerId: opts.showCustomerId !== false,
      showOpCol: !!opts.showOpCol,
      showInternalCol: !!opts.showInternalCol,
    };
    const table = renderFinancialSyncTable(
      list,
      t,
      tableOpts,
      opts.emptyText || '请先同步数据',
    );
    const readonly = opts.readonly || (taskViewMode && !taskEditMode);
    const showToolbar = opts.showToolbar !== false && list.length;
    const exportTaskId = opts.exportTaskId ?? t.id;
    const showGhgEditBtn = !readonly
      && hasTaskGelanDataSynced(t)
      && t.status !== 'COMPLETED'
      && t.status !== 'ARCHIVED';
    const toolbar = showToolbar ? `
      <div class="toolbar step-toolbar-top customer-basic-toolbar">
        <div class="toolbar-btn-group toolbar-btn-group--start">
          ${showGhgEditBtn ? `<button type="button" class="btn btn-default" onclick="CRST_APP.openGhgEmissionEditModal(${exportTaskId})">编辑温室气体排放数据</button>` : ''}
        </div>
        <div class="toolbar-btn-group toolbar-btn-group--end">
          <button type="button" class="btn btn-default" onclick="CRST_APP.exportCustomerBasicInfo(${exportTaskId})">导出客户基础信息</button>
          ${readonly ? '' : `<button type="button" class="btn btn-default" onclick="CRST_APP.openDataProcessImportModal(${exportTaskId})">导入客户基础信息</button>`}
        </div>
      </div>` : '';
    const pendingDisambigCount = opts.pendingDisambigCount || 0;
    const viewOnly = opts.viewOnly || (taskViewMode && !taskEditMode);
    const showDisambigFooter = pendingDisambigCount > 0 && (!readonly || viewOnly);
    const disambigFooter = showDisambigFooter ? `
      <div class="customer-basic-table-footer step-footer-hint">
        <span class="step-footer-msg">识别到 <strong>${pendingDisambigCount}</strong> 条行业歧义客户，请先完成甄别确认。</span>
        ${viewOnly ? '' : `<button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.openIndustryDisambigModal(${exportTaskId})">行业甄别确认</button>`}
      </div>` : '';
    const dataQualityFooter = opts.dataQualityHint && (!readonly || viewOnly) ? `
      <div class="customer-basic-table-footer customer-basic-table-footer--message step-footer-hint">
        <span class="step-footer-msg">${opts.dataQualityHint}</span>
      </div>` : '';
    return `
      <div class="customer-basic-info-section">
        <h4 class="step-subtitle">高碳行业客户基础信息表</h4>
        ${toolbar}
        ${table}
        ${disambigFooter}${dataQualityFooter}
      </div>`;
  }

  function renderReferencedDataProcessTables(job, jobRecs) {
    const source = getTask(job.sourceTaskId);
    if (!source) return '';
    const tableTask = {
      ...source,
      reportYear: job.reportYear || source.reportYear,
    };
    const recs = jobRecs?.length ? jobRecs : (recordsByTask[job.sourceTaskId] || []);
    return `
      <div class="referenced-data-process-wrap">
        <h3 class="step-panel-title">引用数据处理结果</h3>
        <p class="flow-hint">来源任务：<strong>${esc(source.taskName)}</strong>。以下为同步的客户基础信息与参试银行基础信息。</p>
        ${renderCustomerBasicInfoSection(tableTask, recs, {
          regulatoryView: true,
          showStatusCols: false,
          readonly: true,
          showToolbar: true,
          exportTaskId: source.id,
        })}
        ${renderInternalPdSection(tableTask, recs, { readonly: true, exportTaskId: source.id })}
        ${renderBankBasicInfoTable(tableTask)}
        ${renderBankCapitalMetricsSection(source)}
      </div>
      <hr class="section-divider" />`;
  }

  function lookupAirportThroughput(companyName, year) {
    const enabled = airportThroughputRows.filter((x) => x.status === 'ENABLED');
    const matchName = (x) => x.airportName === companyName
      || companyName.includes(x.airportName)
      || x.airportName.includes(companyName);
    const exact = enabled.find((x) => matchName(x) && x.year === year);
    if (exact) return exact;
    return enabled.filter(matchName).sort((a, b) => b.year - a.year)[0] || null;
  }

  function applyAirportThroughputToRecord(r, t) {
    if (!isAirportEnterprise(r)) return;
    const hit = lookupAirportThroughput(r.companyName, getTaskReportYear(t));
    if (hit) {
      r.passengerThroughput = hit.passengerThroughput;
      r.cargoThroughput = hit.cargoThroughput;
      r.airportCode = hit.airportCode;
      r.throughputSource = hit.source;
      r.throughputFetched = true;
      if (r.dataAvailability === 'ABNORMAL' && String(r.availabilityReason || '').includes('旅客吞吐量')) {
        r.dataAvailability = r.revenue != null ? 'USABLE' : 'NEED_AVG';
        r.availabilityReason = r.dataAvailability === 'NEED_AVG' ? '关键指标缺失，需行业均值补算' : '财务与旅客吞吐量完整';
        r.dataSource = '接口原始；机场吞吐量维护表';
      } else if (r.dataAvailability === 'USABLE') {
        r.availabilityReason = '财务与旅客吞吐量完整';
        r.dataSource = r.dataSource && !r.dataSource.includes('机场吞吐量')
          ? `${r.dataSource}；机场吞吐量维护表` : (r.dataSource || '机场吞吐量维护表');
      }
    } else {
      r.throughputFetched = false;
      r.dataAvailability = 'ABNORMAL';
      r.availabilityReason = '旅客吞吐量未维护，请在「机场吞吐量维护」补录后重新同步';
      r.dataSource = '待调取';
    }
  }

  function fetchAirportThroughputForTask(taskId) {
    const t = getTask(taskId);
    const recs = recordsByTask[taskId] || [];
    const airportRecs = recs.filter(isAirportEnterprise);
    let success = 0;
    let fail = 0;
    airportRecs.forEach((r) => {
      applyAirportThroughputToRecord(r, t);
      if (r.throughputFetched) success += 1;
      else fail += 1;
    });
    return { total: airportRecs.length, success, fail };
  }

  function refreshSyncStats(taskId) {
    const t = getTask(taskId);
    const recs = recordsByTask[taskId] || [];
    if (!t) return;
    const fail = recs.filter((r) => effectiveSyncStatus(r) === 'ABNORMAL').length;
    t.syncStats = { total: recs.length, fail, success: recs.length - fail };
  }

  function scenarioCarbonDefaults(scenarioCode, startYear, endYear) {
    const carbon = window.CRST_CARBON;
    if (!carbon?.TRANSITION_SCENARIOS || !carbon.interpolateQuotaRange) {
      return { freeQuotaStart: 1, freeQuotaEnd: 0.75, carbonPrice: 120 };
    }
    const sc = carbon.TRANSITION_SCENARIOS[scenarioCode] || carbon.TRANSITION_SCENARIOS.BASELINE;
    const pub = scenarios.find((s) => s.scenarioCode === scenarioCode);
    const tableStart = pub?.freeQuota2025 ?? sc.freeQuota2025;
    const tableEnd = pub?.freeQuota2040 ?? sc.freeQuota2040;
    const start = Number.isFinite(startYear) ? startYear : 2025;
    const end = Number.isFinite(endYear) ? endYear : 2040;
    return {
      freeQuotaStart: Math.round(carbon.interpolateQuotaRange(2025, 2040, tableStart, tableEnd, start) * 10000) / 10000,
      freeQuotaEnd: Math.round(carbon.interpolateQuotaRange(2025, 2040, tableStart, tableEnd, end) * 10000) / 10000,
      carbonPrice: Math.round(carbon.interpolateCarbonPrice(sc, end) * 100) / 100,
    };
  }

  function interpolateStressFreeQuota(p, testYear) {
    const carbon = window.CRST_CARBON;
    const start = p.startYear;
    const end = p.endYear;
    const quotaStart = p.freeQuotaStart ?? p.freeQuota2025 ?? 1;
    const quotaEnd = p.freeQuotaEnd ?? p.freeQuota2040 ?? quotaStart;
    if (carbon?.interpolateQuotaRange && Number.isFinite(start) && Number.isFinite(end)) {
      return carbon.interpolateQuotaRange(start, end, quotaStart, quotaEnd, testYear);
    }
    return quotaStart;
  }

  function stressCalcOptions(p, testYear) {
    const growth = p.industryGrowthRate ?? p.revenueGrowth ?? 0.02;
    return {
      testYear,
      revenueGrowth: growth,
      industryGrowthRate: growth,
      freeQuotaRatio: Math.round(interpolateStressFreeQuota(p, testYear) * 10000) / 10000,
      carbonPrice: p.carbonPrice,
    };
  }

  function defaultStressParams(t, scenarioCode) {
    const reportYear = getTaskReportYear(t);
    const startYear = Number.isFinite(reportYear) ? Math.max(reportYear + 1, 2026) : 2026;
    const endYear = 2040;
    const carbonDef = scenarioCarbonDefaults(scenarioCode, startYear, endYear);
    const common = {
      startYear,
      endYear,
      industryGrowthRate: 0.02,
      revenueGrowth: 0.02,
      costIncomeRatio: 0.85,
      ...carbonDef,
      assetLiabilityRatio: 0.65,
      baseNetProfitPositive: true,
    };
    if (scenarioCode === 'GREENHOUSE_WORLD') {
      return { ...common, physicalLossRatio: 0.08 };
    }
    if (scenarioCode === 'ORDERLY_TRANSITION') {
      return { ...common, greenInvestmentRatio: 0.05 };
    }
    return { ...common, policyIntensity: 1 };
  }

  function defaultStressCommonParams(t) {
    const p = defaultStressParams(t, 'BASELINE');
    return {
      startYear: p.startYear,
      endYear: p.endYear,
      industryGrowthRate: p.industryGrowthRate,
      revenueGrowth: p.revenueGrowth,
      freeQuotaStart: p.freeQuotaStart ?? p.freeQuotaRatio ?? 1,
      freeQuotaEnd: p.freeQuotaEnd ?? p.freeQuotaRatio ?? 0.75,
    };
  }

  function getStressCommonParams(t) {
    const defaults = defaultStressCommonParams(t || {});
    const saved = t?.stressCommonParams;
    if (saved && Object.keys(saved).length) {
      return { ...defaults, ...saved };
    }
    const firstCode = t?.selectedScenarioCodes?.[0] || 'BASELINE';
    const fromScenario = t?.stressScenarioParams?.[firstCode];
    if (fromScenario) {
      return {
        ...defaults,
        startYear: fromScenario.startYear ?? defaults.startYear,
        endYear: fromScenario.endYear ?? defaults.endYear,
        industryGrowthRate: fromScenario.industryGrowthRate ?? fromScenario.revenueGrowth ?? defaults.industryGrowthRate,
        revenueGrowth: fromScenario.industryGrowthRate ?? fromScenario.revenueGrowth ?? defaults.revenueGrowth,
        freeQuotaStart: fromScenario.freeQuotaStart ?? fromScenario.freeQuotaRatio ?? defaults.freeQuotaStart,
        freeQuotaEnd: fromScenario.freeQuotaEnd ?? defaults.freeQuotaEnd,
      };
    }
    return defaults;
  }

  function pickScenarioSpecificParams(p) {
    const out = {};
    ['carbonPrice', 'assetLiabilityRatio', 'baseNetProfitPositive', 'costIncomeRatio', 'policyIntensity', 'physicalLossRatio', 'greenInvestmentRatio'].forEach((key) => {
      if (p[key] != null) out[key] = p[key];
    });
    return out;
  }

  function getScenarioStressParams(t, scenarioCode) {
    if (!t.stressScenarioParams) t.stressScenarioParams = {};
    const common = getStressCommonParams(t);
    const merged = {
      ...defaultStressParams(t, scenarioCode),
      ...common,
      ...(t.stressScenarioParams[scenarioCode] || {}),
      ...common,
    };
    if (merged.freeQuotaStart == null && merged.freeQuotaRatio != null) {
      merged.freeQuotaStart = merged.freeQuotaRatio;
      merged.freeQuotaEnd = merged.freeQuotaRatio;
    }
    merged.revenueGrowth = merged.industryGrowthRate ?? merged.revenueGrowth;
    return merged;
  }

  function scenarioInputId(taskId, scenarioCode, field) {
    return `sp_${taskId}_${scenarioCode}_${field}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  function commonScenarioInputId(taskId, field) {
    return `sp_${taskId}_common_${field}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  function parseInputNumber(id, required) {
    const raw = document.getElementById(id)?.value?.trim() ?? '';
    if (raw === '') return required ? NaN : null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : NaN;
  }

  function validateStressCommonParams(p) {
    if (!Number.isInteger(p.startYear) || !Number.isInteger(p.endYear)) {
      return { ok: false, msg: '请填写有效的起止年份' };
    }
    if (p.endYear < p.startYear) return { ok: false, msg: '结束年份不能小于起始年份' };
    if (p.endYear > 2050) return { ok: false, msg: '结束年份建议不超过2050' };
    if (!Number.isFinite(p.freeQuotaStart) || p.freeQuotaStart < 0 || p.freeQuotaStart > 1) {
      return { ok: false, msg: '起始年免费配额比例需在 0~1 之间' };
    }
    if (!Number.isFinite(p.freeQuotaEnd) || p.freeQuotaEnd < 0 || p.freeQuotaEnd > 1) {
      return { ok: false, msg: '结束年免费配额比例需在 0~1 之间' };
    }
    return { ok: true, params: p };
  }

  function validateStressParams(p, scenarioCode) {
    const commonCheck = validateStressCommonParams(p);
    if (!commonCheck.ok) return commonCheck;
    if (!Number.isFinite(p.carbonPrice) || p.carbonPrice < 0) {
      return { ok: false, msg: '碳价需为非负数' };
    }
    if (!Number.isFinite(p.assetLiabilityRatio) || p.assetLiabilityRatio < 0 || p.assetLiabilityRatio > 2) {
      return { ok: false, msg: '资产负债率需在 0~2 之间' };
    }
    if (scenarioCode === 'BASELINE') {
      if (!Number.isFinite(p.policyIntensity) || p.policyIntensity < 0.5 || p.policyIntensity > 2) {
        return { ok: false, msg: '基准情景的政策执行强度建议在 0.5~2' };
      }
    } else if (scenarioCode === 'GREENHOUSE_WORLD') {
      if (!Number.isFinite(p.physicalLossRatio) || p.physicalLossRatio < 0 || p.physicalLossRatio > 0.5) {
        return { ok: false, msg: '温室世界的物理损失率需在 0~0.5' };
      }
    } else if (scenarioCode === 'ORDERLY_TRANSITION') {
      if (!Number.isFinite(p.greenInvestmentRatio) || p.greenInvestmentRatio < 0 || p.greenInvestmentRatio > 0.5) {
        return { ok: false, msg: '有序转型的绿色投资占比需在 0~0.5' };
      }
    }
    return { ok: true, params: p };
  }

  function readStressCommonParamsFromDom(taskId) {
    const t = resolveEntity(taskId);
    const saved = getStressCommonParams(t);
    const startEl = document.getElementById(commonScenarioInputId(taskId, 'start'));
    if (!startEl) return { ok: true, params: saved };
    const p = {
      startYear: parseInputNumber(commonScenarioInputId(taskId, 'start'), true),
      endYear: parseInputNumber(commonScenarioInputId(taskId, 'end'), true),
      industryGrowthRate: saved.industryGrowthRate ?? saved.revenueGrowth ?? 0.02,
      freeQuotaStart: parseInputNumber(commonScenarioInputId(taskId, 'freeQuotaStart'), true),
      freeQuotaEnd: parseInputNumber(commonScenarioInputId(taskId, 'freeQuotaEnd'), true),
    };
    p.revenueGrowth = p.industryGrowthRate;
    return validateStressCommonParams(p);
  }

  function readStressParamsFromDom(taskId, scenarioCode) {
    const t = resolveEntity(taskId);
    const commonParsed = readStressCommonParamsFromDom(taskId);
    if (!commonParsed.ok) return commonParsed;
    const saved = t ? getScenarioStressParams(t, scenarioCode) : defaultStressParams({}, scenarioCode);
    const p = {
      ...saved,
      ...commonParsed.params,
      revenueGrowth: commonParsed.params.industryGrowthRate ?? commonParsed.params.revenueGrowth ?? saved.revenueGrowth,
    };
    if (scenarioCode === 'BASELINE' && document.getElementById(scenarioInputId(taskId, scenarioCode, 'policyIntensity'))) {
      p.policyIntensity = parseInputNumber(scenarioInputId(taskId, scenarioCode, 'policyIntensity'), true);
    } else if (scenarioCode === 'GREENHOUSE_WORLD' && document.getElementById(scenarioInputId(taskId, scenarioCode, 'physicalLossRatio'))) {
      p.physicalLossRatio = parseInputNumber(scenarioInputId(taskId, scenarioCode, 'physicalLossRatio'), true);
    } else if (scenarioCode === 'ORDERLY_TRANSITION' && document.getElementById(scenarioInputId(taskId, scenarioCode, 'greenInvestmentRatio'))) {
      p.greenInvestmentRatio = parseInputNumber(scenarioInputId(taskId, scenarioCode, 'greenInvestmentRatio'), true);
    }
    const result = validateStressParams(p, scenarioCode);
    if (!result.ok && t && !isFinTransDone(t)) {
      return { ok: false, msg: '请先在「财务传导」步骤完成情景参数录入' };
    }
    return result;
  }

  function selectedScenarioCodes(taskId) {
    const fromDom = Array.from(document.querySelectorAll(`input[name="sc_${taskId}"]:checked`)).map((el) => el.value);
    if (fromDom.length) return fromDom;
    const t = resolveEntity(taskId);
    return t?.selectedScenarioCodes?.length ? [...t.selectedScenarioCodes] : [];
  }

  function persistStressParamsFromDom(taskId, t, codes) {
    const selectedCodes = codes || selectedScenarioCodes(taskId);
    if (!selectedCodes.length) return { ok: false, msg: '请至少选择一个压测情景' };
    if (!t.stressScenarioParams) t.stressScenarioParams = {};
    const commonParsed = readStressCommonParamsFromDom(taskId);
    if (!commonParsed.ok) return { ok: false, msg: commonParsed.msg };
    t.stressCommonParams = commonParsed.params;
    const paramsMap = {};
    for (const code of selectedCodes) {
      const parsed = readStressParamsFromDom(taskId, code);
      if (!parsed.ok) return { ok: false, msg: `${scenarioLabel(code)}：${parsed.msg}` };
      t.stressScenarioParams[code] = pickScenarioSpecificParams(parsed.params);
      paramsMap[code] = parsed.params;
    }
    return { ok: true, paramsMap, selectedCodes };
  }

  function saveStressDraftsFromDom(taskId, t) {
    if (!t) return;
    persistStressParamsFromDom(taskId, t);
    t.selectedScenarioCodes = selectedScenarioCodes(taskId);
  }

  function onStressScenarioToggle(taskId) {
    const t = getTask(taskId);
    if (!t) return;
    saveStressDraftsFromDom(taskId, t);
    t.selectedScenarioCodes = selectedScenarioCodes(taskId);
    render();
  }

  function applyScenarioAdjustment(out, scenarioCode, p) {
    const adj = { ...out };
    if (scenarioCode === 'BASELINE') {
      const mul = p.policyIntensity ?? 1;
      adj.carbonCost = adj.carbonCost * mul;
      adj.revenueAfter = adj.revenueAfter - (adj.carbonCost - out.carbonCost);
    } else if (scenarioCode === 'GREENHOUSE_WORLD') {
      const loss = p.physicalLossRatio ?? 0;
      adj.revenueAfter = adj.revenueAfter * (1 - loss);
      adj.eclAfter = adj.eclAfter * (1 + loss * 1.2);
    } else if (scenarioCode === 'ORDERLY_TRANSITION') {
      const inv = p.greenInvestmentRatio ?? 0;
      adj.carbonCost = adj.carbonCost * (1 - inv * 0.6);
      adj.revenueAfter = adj.revenueAfter * (1 - inv * 0.1);
    }
    adj.impactRate = adj.revenueBefore > 0 ? Math.max(0, adj.carbonCost / adj.revenueBefore) : 0;
    adj.eclAfter = Math.max(0, adj.eclAfter);
    adj.revenueAfter = Math.max(0, adj.revenueAfter);
    return adj;
  }

  function buildScenarioExtraParamRow(entityId, code, p, scenarioReadonly) {
    const dis = scenarioReadonly ? 'disabled' : '';
    if (code === 'BASELINE') {
      return `<div class="form-row"><label>政策执行强度系数</label><input class="input" id="${scenarioInputId(entityId, code, 'policyIntensity')}" type="number" step="0.01" value="${p.policyIntensity}" ${dis} /></div>`;
    }
    if (code === 'GREENHOUSE_WORLD') {
      return `<div class="form-row"><label>物理损失率</label><input class="input" id="${scenarioInputId(entityId, code, 'physicalLossRatio')}" type="number" step="0.0001" value="${p.physicalLossRatio}" ${dis} /></div>`;
    }
    if (code === 'ORDERLY_TRANSITION') {
      return `<div class="form-row"><label>绿色投资占比</label><input class="input" id="${scenarioInputId(entityId, code, 'greenInvestmentRatio')}" type="number" step="0.0001" value="${p.greenInvestmentRatio}" ${dis} /></div>`;
    }
    return '';
  }

  function buildStressCommonParamFieldsHtml(entityId, p, scenarioReadonly) {
    const dis = scenarioReadonly ? 'disabled' : '';
    return `
      <div class="form-row"><label>起始年份</label><input class="input" id="${commonScenarioInputId(entityId, 'start')}" type="number" value="${p.startYear}" ${dis} /></div>
      <div class="form-row"><label>结束年份</label><input class="input" id="${commonScenarioInputId(entityId, 'end')}" type="number" value="${p.endYear}" ${dis} /></div>
      <div class="form-row"><label>免费配额比例（${p.startYear}年）</label><input class="input" id="${commonScenarioInputId(entityId, 'freeQuotaStart')}" type="number" step="0.0001" min="0" max="1" value="${p.freeQuotaStart ?? p.freeQuotaRatio ?? 1}" ${dis} /></div>
      <div class="form-row"><label>免费配额比例（${p.endYear}年）</label><input class="input" id="${commonScenarioInputId(entityId, 'freeQuotaEnd')}" type="number" step="0.0001" min="0" max="1" value="${p.freeQuotaEnd ?? p.freeQuotaRatio ?? 0.75}" ${dis} /></div>
      <div class="form-row form-row--hint"><span class="flow-hint">免费配额在 ${p.startYear}—${p.endYear} 年间线性变化</span></div>`;
  }

  function buildStressCommonParamCardHtml(t, entityId, scenarioReadonly) {
    const p = getStressCommonParams(t);
    return `
      <div class="card stress-param-card stress-param-card--common">
        <h4 class="stress-param-card-title">公共参数</h4>
        <p class="flow-hint stress-param-common-hint">以下参数在三种压测情景间共用，只需录入一份。</p>
        <div class="form-grid-2 stress-param-form-grid">
          ${buildStressCommonParamFieldsHtml(entityId, p, scenarioReadonly)}
        </div>
      </div>`;
  }

  function buildScenarioSpecificParamFieldsHtml(entityId, code, p, scenarioReadonly) {
    return buildScenarioExtraParamRow(entityId, code, p, scenarioReadonly);
  }

  function buildScenarioParamCardHtml(t, entityId, code, sc, scenarioReadonly) {
    const p = getScenarioStressParams(t, code);
    return `
      <div class="card stress-param-card">
        <h4 class="stress-param-card-title">${esc(sc.scenarioName)}参数</h4>
        <div class="form-grid-2 stress-param-form-grid">
          ${buildScenarioSpecificParamFieldsHtml(entityId, code, p, scenarioReadonly)}
        </div>
      </div>`;
  }

  /** 行业均值已填充后视为可使用（兼容历史数据未改 dataAvailability 的情况） */
  function isRecordAvgFilled(r) {
    return r.dataAvailability === 'USABLE' && r.dataSource === '行业均值补算'
      || (r.dataAvailability === 'NEED_AVG' && (r.dataSource === '行业均值补算'
        || (r.availabilityReason && r.availabilityReason.includes('已用行业均值填充'))));
  }

  function effectiveSyncStatus(r) {
    if (r.excluded || r.dataAvailability === 'EXCLUDED' || r.dataAvailability === 'EXCLUDED_NO_REPORT') {
      return r.dataAvailability === 'EXCLUDED_NO_REPORT' ? 'EXCLUDED_NO_REPORT' : 'EXCLUDED';
    }
    if (isRecordAvgFilled(r)) return 'USABLE';
    return r.dataAvailability;
  }

  function syncStatusLabel(avail) {
    return SYNC_STATUS_TEXT[avail] || avail || '-';
  }

  function avgFillStatusTag(filled) {
    return filled
      ? '<span class="tag tag-success">已填充</span>'
      : '<span class="tag tag-warning">未填充</span>';
  }

  function isOfflineProcessRecord(r) {
    if (r.excluded || r.dataAvailability === 'EXCLUDED' || r.dataAvailability === 'EXCLUDED_NO_REPORT') return false;
    const st = effectiveSyncStatus(r);
    if (st === 'ABNORMAL' || st === 'NEED_AVG') return true;
    if (r.ambiguityCode && !r.ambiguityConfirmed) return true;
    return false;
  }

  function getOfflineProcessRecords(taskId) {
    return (recordsByTask[taskId] || []).filter(isOfflineProcessRecord);
  }

  function getDataProcessExportRecords(taskId) {
    return recordsByTask[taskId] || [];
  }

  function activeDataProcessRecords(recs) {
    return (recs || []).filter((r) => !r.excluded && effectiveSyncStatus(r) !== 'EXCLUDED' && effectiveSyncStatus(r) !== 'EXCLUDED_NO_REPORT');
  }

  function allDataProcessRecordsUsable(recs) {
    const active = activeDataProcessRecords(recs);
    return active.length > 0 && active.every((r) => effectiveSyncStatus(r) === 'USABLE');
  }

  function isHighCarbonBankRowMatched(r) {
    return BANK_BASIC_HIGH_CARBON_ROWS.some((row) => row.match(r));
  }

  function aggregateBankBasicMetrics(recs) {
    const nplClasses = new Set(['SUBSTANDARD', 'DOUBTFUL', 'LOSS']);
    let loanBalance = 0;
    let nplBalance = 0;
    let overdue90Balance = 0;
    let impairmentProvision = 0;
    let termSum = 0;
    let remainSum = 0;
    let termWeight = 0;
    const customerSet = new Set();
    const finCustomerSet = new Set();
    let finLoan = 0;
    recs.forEach((r) => {
      const lb = Number(r.loanBalance) || 0;
      loanBalance += lb;
      const term = Number(r.loanTermYears);
      const remain = Number(r.loanRemainingTermYears);
      if (lb > 0) {
        if (Number.isFinite(term)) termSum += term * lb;
        if (Number.isFinite(remain)) remainSum += remain * lb;
        termWeight += lb;
      }
      customerSet.add(r.companyName || r.customerId || r.id);
      if (r.revenue != null || r.operatingRevenue != null) {
        finCustomerSet.add(r.companyName || r.customerId || r.id);
        finLoan += lb;
      }
      if (nplClasses.has(r.loanClassification)) {
        nplBalance += lb;
        impairmentProvision += lb * 0.15;
        if (['DOUBTFUL', 'LOSS'].includes(r.loanClassification)) overdue90Balance += lb * 0.65;
        else overdue90Balance += lb * 0.25;
      }
    });
    return {
      loanBalance: Math.round(loanBalance),
      nplBalance: Math.round(nplBalance),
      overdue90Balance: Math.round(overdue90Balance),
      impairmentProvision: Math.round(impairmentProvision),
      avgLoanTerm: termWeight > 0 ? Math.round((termSum / termWeight) * 100) / 100 : null,
      avgRemainingTerm: termWeight > 0 ? Math.round((remainSum / termWeight) * 100) / 100 : null,
      customerCount: customerSet.size,
      finCustomerCount: finCustomerSet.size,
      finLoanRatio: loanBalance > 0 ? Math.round((finLoan / loanBalance) * 1000) / 10 : null,
    };
  }

  function sumBankBasicMetrics(list) {
    const base = aggregateBankBasicMetrics([]);
    if (!list.length) return base;
    const summed = list.reduce((acc, item) => {
      BANK_BASIC_INFO_COLUMNS.forEach((col) => {
        if (col.isPct) return;
        const v = item.metrics?.[col.key];
        if (v != null && Number.isFinite(v)) acc[col.key] = (acc[col.key] || 0) + v;
      });
      return acc;
    }, { ...base });
    summed.avgLoanTerm = null;
    summed.avgRemainingTerm = null;
    summed.finLoanRatio = summed.loanBalance > 0
      ? Math.round(((summed.finCustomerCount || 0) / Math.max(1, summed.customerCount || 1)) * 1000) / 10
      : null;
    return summed;
  }

  function defaultBankBasicCapitalMetrics() {
    return {
      coreTier1Capital: 8200000,
      tier1Capital: 9100000,
      totalCapital: 10500000,
      rwaTotal: 68000000,
      addCapitalReq: 0,
      provisionRatioReq: 2.5,
      coverageRatioReq: 150,
    };
  }

  function getTaskBankCapital(t) {
    if (!t?.bankBasicInfo?.capital) return null;
    return { ...defaultBankBasicCapitalMetrics(), ...t.bankBasicInfo.capital };
  }

  function ensureBankCapitalMetricsFromLoanSync(t) {
    if (!t) return;
    if (!t.bankBasicInfo) t.bankBasicInfo = {};
    if (!t.bankBasicInfo.capital) {
      t.bankBasicInfo.capital = defaultBankBasicCapitalMetrics();
    }
    t.bankBasicInfo.capitalSyncedAt = nowStr();
  }

  const BANK_CAPITAL_EDITABLE_KEYS = ['provisionRatioReq', 'coverageRatioReq'];

  function buildBankBasicInfoFromRecords(taskId, recs, t) {
    const eligible = activeDataProcessRecords(recs);
    const domesticCorp = eligible.filter((r) => (r.loanRegion || 'DOMESTIC') === 'DOMESTIC' && t?.loanType !== 'PERSONAL');
    const overseas = eligible.filter((r) => r.loanRegion === 'OVERSEAS');
    const highCarbonRows = BANK_BASIC_HIGH_CARBON_ROWS.map((def) => {
      const matched = domesticCorp.filter((r) => def.match(r));
      return { label: def.label, section: 'highCarbon', metrics: aggregateBankBasicMetrics(matched) };
    });
    const highCarbonMatched = new Set();
    domesticCorp.forEach((r) => {
      if (isHighCarbonBankRowMatched(r)) highCarbonMatched.add(r.id);
    });
    const otherIndustryRecs = domesticCorp.filter((r) => !highCarbonMatched.has(r.id));
    const highCarbonRecs = domesticCorp.filter((r) => isHighCarbonBankRowMatched(r));
    const highCarbonSubtotal = aggregateBankBasicMetrics(highCarbonRecs);
    const otherIndustry = { label: '其他行业', section: 'summary', metrics: aggregateBankBasicMetrics(otherIndustryRecs), highlight: true };
    const corpDomesticTotal = { label: '对公贷款合计（境内贷款）', section: 'summary', metrics: aggregateBankBasicMetrics(domesticCorp), highlight: true };
    const personalMortgage = { label: '住房抵押贷款', section: 'personal', metrics: aggregateBankBasicMetrics([]) };
    const personalOther = { label: '其他', section: 'personal', metrics: aggregateBankBasicMetrics([]) };
    const personalSubtotal = sumBankBasicMetrics([personalMortgage, personalOther]);
    personalSubtotal.label = '小计';
    personalSubtotal.section = 'personal';
    const overseasRow = { label: '境外贷款', section: 'summary', metrics: aggregateBankBasicMetrics(overseas), highlight: true };
    const totalMetrics = aggregateBankBasicMetrics(eligible);
    const rows = [
      { label: '各项贷款', section: 'total', metrics: totalMetrics, bold: true },
      ...highCarbonRows,
      { label: '高碳行业小计', section: 'highCarbonSubtotal', metrics: highCarbonSubtotal, bold: true },
      otherIndustry,
      corpDomesticTotal,
      { label: '个人贷款', section: 'personalHeader', isGroup: true },
      personalMortgage,
      personalOther,
      { ...personalSubtotal, bold: true },
      overseasRow,
    ];
    return {
      rows,
      capital: { ...(t?.bankBasicInfo?.capital || defaultBankBasicCapitalMetrics()) },
      dataCutoffDate: `${getTaskReportYear(t)}-12-31`,
      generatedAt: nowStr(),
    };
  }

  function syncBankBasicInfoFromRecords(taskId) {
    const t = getTask(taskId);
    if (!t || !hasTaskFinancialDataSynced(t)) return false;
    const recs = recordsByTask[taskId] || [];
    if (!recs.length) return false;
    ensureBankCapitalMetricsFromLoanSync(t);
    const built = buildBankBasicInfoFromRecords(taskId, recs, t);
    if (!t.bankBasicInfo) t.bankBasicInfo = {};
    t.bankBasicInfo.rows = built.rows;
    t.bankBasicInfo.dataCutoffDate = built.dataCutoffDate;
    t.bankBasicInfo.generatedAt = built.generatedAt;
    if (!t.bankBasicInfo.capital) t.bankBasicInfo.capital = built.capital;
    return true;
  }

  function formatBankBasicCell(val, isPct) {
    if (val == null || val === '') return '-';
    if (isPct) return `${Number(val).toFixed(1)}%`;
    return Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function renderBankCapitalMetricsSection(t) {
    if (!t?.loanDataSynced) return '';
    ensureBankCapitalMetricsFromLoanSync(t);
    const capital = getTaskBankCapital(t);
    if (!capital) return '';
    const rows = BANK_BASIC_CAPITAL_ROWS.map((row) => {
      const val = capital[row.key];
      const editableMark = BANK_CAPITAL_EDITABLE_KEYS.includes(row.key)
        ? ' <span class="bank-capital-editable-tag">可编辑</span>' : '';
      return `<tr class="bank-basic-row-capital"><td>${esc(row.label)}${editableMark}</td><td>${formatBankBasicCell(val, row.isPct)}</td></tr>`;
    }).join('');
    const readonly = taskViewMode && !taskEditMode;
    const toolbarActions = `
      <div class="toolbar-btn-group toolbar-btn-group--end bank-capital-toolbar-actions">
        <button type="button" class="btn btn-default" onclick="CRST_APP.exportBankCapitalMetrics(${t.id})">导出资本与拨备监管指标</button>
      </div>`;
    const editToolbar = readonly ? '' : `
      <div class="toolbar step-toolbar-top bank-capital-edit-toolbar">
        <button type="button" class="btn btn-default" onclick="CRST_APP.openBankCapitalEditModal(${t.id})">编辑数据</button>
      </div>`;
    return `
      <div class="bank-capital-metrics-section">
        <div class="bank-capital-metrics-section-header">
          <h4 class="step-subtitle">参试银行资本与拨备监管指标</h4>
          ${toolbarActions}
        </div>
        <p class="flow-hint">以下指标在同步贷款数据时从信贷系统获取；「贷款拨备率监管要求」「拨备覆盖率监管要求」支持手动调整。</p>
        ${editToolbar}
        <div class="table-wrap bank-capital-metrics-table">
          <table>
            <thead><tr><th>指标名称</th><th>数值</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderBankBasicInfoTable(t) {
    if (!hasTaskFinancialDataSynced(t)) return '';
    syncBankBasicInfoFromRecords(t.id);
    const info = t?.bankBasicInfo;
    if (!info?.rows?.length) return '';
    const colHeaders = BANK_BASIC_INFO_COLUMNS.map((c) => `<th>${esc(c.label)}</th>`).join('');
    const bodyRows = info.rows.map((row) => {
      if (row.isGroup) {
        return `<tr class="bank-basic-group-row"><td colspan="${BANK_BASIC_INFO_COLUMNS.length + 1}">${esc(row.label)}</td></tr>`;
      }
      const cls = [row.bold ? 'bank-basic-row-bold' : '', row.highlight ? 'bank-basic-row-highlight' : ''].filter(Boolean).join(' ');
      const cells = BANK_BASIC_INFO_COLUMNS.map((c) =>
        `<td>${formatBankBasicCell(row.metrics?.[c.key], c.isPct)}</td>`).join('');
      return `<tr class="${cls}"><td>${esc(row.label)}</td>${cells}</tr>`;
    }).join('');
    const toolbarActions = `
      <div class="toolbar-btn-group toolbar-btn-group--end bank-basic-info-toolbar-actions">
        <button type="button" class="btn btn-default" onclick="CRST_APP.exportBankBasicInfo(${t.id})">导出参试银行基础信息</button>
      </div>`;
    return `
      <div class="bank-basic-info-section">
        <div class="bank-basic-info-section-header">
          <h4 class="step-subtitle">参试银行基础信息表</h4>
          ${toolbarActions}
        </div>
        <p class="flow-hint bank-basic-info-hint">同步财务数据后根据当前客户清单动态汇总；行业甄别、一键处理或导入补录后数值随之更新。</p>
        <div class="table-wrap bank-basic-info-table">
          <table>
            <thead>
              <tr><th>项目名称</th>${colHeaders}</tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function buildBankBasicInfoExportText(taskId) {
    const t = getTask(taskId);
    const info = t?.bankBasicInfo;
    if (!info) return '';
    const header = ['项目名称', ...BANK_BASIC_INFO_COLUMNS.map((c) => c.label)];
    const lines = [header.join('\t')];
    info.rows.forEach((row) => {
      if (row.isGroup) return;
      lines.push([
        row.label,
        ...BANK_BASIC_INFO_COLUMNS.map((c) => row.metrics?.[c.key] ?? ''),
      ].join('\t'));
    });
    const capitalLines = ['', '参试银行资本与拨备监管指标', '指标名称\t数值'];
    BANK_BASIC_CAPITAL_ROWS.forEach((row) => {
      const val = info.capital?.[row.key];
      capitalLines.push([row.label, val != null ? val : ''].join('\t'));
    });
    return [
      '参试银行基础信息表',
      `任务：${t.taskName}`,
      `数据截止日期：${info.dataCutoffDate || ''}`,
      '',
      ...lines,
      ...capitalLines,
    ].join('\n');
  }

  function tryFinalizeDataProcess(taskId, options = {}) {
    const t = getTask(taskId);
    if (!t || t.status === 'COMPLETED' || t.status === 'ARCHIVED') return false;
    const recs = recordsByTask[taskId] || [];
    if (!allDataProcessRecordsUsable(recs)) return false;
    syncBankBasicInfoFromRecords(taskId);
    t.status = 'COMPLETED';
    t.dataProcessCompletedAt = nowStr();
    t.updatedAt = nowStr();
    addLog(taskId, '数据处理：全部样本可使用，已生成客户基础信息与参试银行基础信息表');
    if (options.showModal !== false) showModal('modalDataProcessComplete');
    else toast('数据处理完毕，已生成参试银行基础信息表');
    return true;
  }

  function formatOfflineExportCell(r, key) {
    if (key === 'remark') return '';
    if (key === 'dataAvailability') return syncStatusLabel(effectiveSyncStatus(r));
    if (key === 'revenue' || key === 'costIncomeRatio' || key === 'passengerThroughput') {
      return r[key] != null ? r[key] : '';
    }
    return r[key] ?? '';
  }

  function buildDataProcessOfflineExportText(taskId, records) {
    const t = getTask(taskId);
    const stats = countSyncStatus(records);
    const disambig = records.filter((r) => r.ambiguityCode && !r.ambiguityConfirmed).length;
    const labels = DATA_PROCESS_OFFLINE_EXPORT_FIELDS.map((f) => f.label);
    const keys = DATA_PROCESS_OFFLINE_EXPORT_FIELDS.map((f) => f.key);
    return [
      '财务数据清单（Excel）',
      `任务：${t?.taskName || taskId}`,
      `导出条数：${records.length}（可使用 ${stats.usable}；需计算 ${stats.needAvg}；无法处理 ${stats.abnormal}；待甄别 ${disambig}；已排除 ${stats.excluded}）`,
      '说明：导出全部同步数据；待处理项可在线下补全「标准行业/收入/成本收入比/旅客吞吐量」等可填列后，通过「导入处理结果」回传。',
      '',
      labels.join('\t'),
      ...records.map((r) => keys.map((k) => formatOfflineExportCell(r, k)).join('\t')),
    ].join('\n');
  }

  function canUseDataProcessOfflineTools(t, readonly) {
    if (!t || readonly) return false;
    return ['SYNCING', 'PENDING_DISAMBIG', 'PROCESSING', 'COMPLETED'].includes(t.status);
  }

  function exportDataProcessOffline(taskId) {
    const records = getDataProcessExportRecords(taskId);
    if (!records.length) { toast('当前无可导出数据', 'info'); return; }
    const t = getTask(taskId);
    const stats = countSyncStatus(records);
    const disambig = records.filter((r) => r.ambiguityCode && !r.ambiguityConfirmed).length;
    const sourceKey = `task-${taskId}`;
    const scope = '全部财务同步数据';
    const fields = DATA_PROCESS_OFFLINE_EXPORT_FIELDS.map((f) => f.label).join(',');
    const filterDesc = `共 ${records.length} 条；可使用 ${stats.usable} 条；需计算 ${stats.needAvg} 条；无法处理 ${stats.abnormal} 条；待甄别 ${disambig} 条；已排除 ${stats.excluded} 条`;
    const { downloadFileName } = appendExportLog({
      sourceKey,
      scope,
      fields,
      filterDesc,
      sourceType: 'DATA_PROCESS',
      exportKind: 'OFFLINE',
      filterSnapshot: { context: 'dataProcessOffline', taskId, count: records.length, scope: 'all' },
    });
    addLog(taskId, `数据处理：导出全部财务数据 ${records.length} 条`);
    triggerExportFileDownload(downloadFileName, buildDataProcessOfflineExportText(taskId, records));
    toast(`已导出 ${records.length} 条，可在导出记录中查看或再次下载`);
  }

  function applyRecordUsableFixes(r, i) {
    if (!r.standardIndustry || effectiveSyncStatus(r) === 'ABNORMAL') {
      const map = mappings.find((m) => m.apiIndustry === r.apiIndustry && m.status === 'ENABLED');
      r.standardIndustry = map?.standardIndustry || r.standardIndustry || String(r.apiIndustry || '').replace(/^[\w.]+\s*/, '') || '其他';
    }
    if (r.revenue == null) r.revenue = 72000 + i * 4100;
    if (r.costIncomeRatio == null) r.costIncomeRatio = 0.84;
    if (isAirportEnterprise(r) && !r.throughputFetched) {
      r.passengerThroughput = 860 + i * 120;
      r.throughputFetched = true;
    }
    if (r.ambiguityCode) r.ambiguityConfirmed = true;
    r.dataAvailability = 'USABLE';
  }

  function openDataProcessImportModal(taskId) {
    pendingDataProcessImportTaskId = taskId;
    dataProcessImportFilePicked = false;
    const hint = document.getElementById('dp_import_file_hint');
    if (hint) hint.textContent = '未选择文件';
    showModal('modalDataProcessImport');
  }

  function mockPickDataProcessImportFile() {
    dataProcessImportFilePicked = true;
    const hint = document.getElementById('dp_import_file_hint');
    if (hint) hint.textContent = '已选择：气候风险财务数据待处理清单导入模板.xlsx';
  }

  function confirmDataProcessImport() {
    const taskId = pendingDataProcessImportTaskId;
    if (!taskId) return;
    if (!dataProcessImportFilePicked) { toast('请先选择 Excel 文件', 'error'); return; }
    const t = getTask(taskId);
    const targets = getOfflineProcessRecords(taskId);
    if (!targets.length) {
      hideModal();
      pendingDataProcessImportTaskId = null;
      dataProcessImportFilePicked = false;
      if (tryFinalizeDataProcess(taskId, { showModal: true })) return;
      toast('当前无待导入的处理数据', 'info');
      render();
      return;
    }
    let fixed = 0;
    targets.forEach((r, i) => {
      applyRecordUsableFixes(r, i);
      r.availabilityReason = '线下补录导入';
      r.dataSource = 'Excel导入';
      fixed += 1;
    });
    refreshSyncStats(taskId);
    t.updatedAt = nowStr();
    if (t.status === 'PENDING_DISAMBIG' && !getPendingDisambigRecords(recordsByTask[taskId] || []).length) {
      t.status = 'PROCESSING';
    }
    addLog(taskId, `数据处理：导入线下处理结果，更新 ${fixed} 条`);
    hideModal();
    pendingDataProcessImportTaskId = null;
    dataProcessImportFilePicked = false;
    toast(`已导入 ${fixed} 条处理结果`);
    tryFinalizeDataProcess(taskId, { showModal: true });
    render();
  }

  function onGhgAccountedSelectChange(recId, value) {
    const input = document.querySelector(`.ghg-emissions-input[data-rec-id="${recId}"]`);
    if (!input) return;
    const disabled = value === 'N';
    input.disabled = disabled;
    if (disabled) input.value = '';
  }

  function openGhgEmissionEditModal(taskId) {
    const t = getTask(taskId);
    if (!t || !hasTaskGelanDataSynced(t)) {
      toast('请先同步格澜数据', 'error');
      return;
    }
    pendingGhgEditTaskId = taskId;
    const recs = activeDataProcessRecords(recordsByTask[taskId] || []);
    const body = document.getElementById('ghgEmissionEditBody');
    if (!body) return;
    body.innerHTML = recs.length
      ? `<p class="modal-desc">可编辑各客户的「核算温室气体排放情况（是/否）」与「温室气体排放量（吨CO2当量）」。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>客户名称</th><th>客户号</th><th>核算温室气体排放情况（是/否）</th><th>温室气体排放量（吨CO2当量）</th></tr></thead>
            <tbody>${recs.map((r) => {
              const accountedVal = r.ghgAccounted === true ? 'Y' : (r.ghgAccounted === false ? 'N' : '');
              const emissionsDisabled = r.ghgAccounted === false;
              return `<tr>
                <td>${esc(r.companyName)}</td>
                <td>${esc(r.customerId || '-')}</td>
                <td><select class="select ghg-accounted-select" data-rec-id="${r.id}" onchange="CRST_APP.onGhgAccountedSelectChange(${r.id}, this.value)">
                  <option value="" ${accountedVal === '' ? 'selected' : ''}>-</option>
                  <option value="Y" ${accountedVal === 'Y' ? 'selected' : ''}>是</option>
                  <option value="N" ${accountedVal === 'N' ? 'selected' : ''}>否</option>
                </select></td>
                <td><input class="input ghg-emissions-input" data-rec-id="${r.id}" type="number" step="0.01" min="0" value="${r.ghgEmissions != null ? r.ghgEmissions : ''}" ${emissionsDisabled ? 'disabled' : ''} /></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>`
      : '<div class="empty">暂无可编辑客户</div>';
    showModal('modalGhgEmissionEdit');
  }

  function saveGhgEmissionEdits() {
    const taskId = pendingGhgEditTaskId;
    if (!taskId) return;
    const t = getTask(taskId);
    const recs = recordsByTask[taskId] || [];
    let updated = 0;
    document.querySelectorAll('.ghg-accounted-select').forEach((sel) => {
      const recId = parseInt(sel.dataset.recId, 10);
      const rec = recs.find((r) => r.id === recId);
      if (!rec) return;
      const input = document.querySelector(`.ghg-emissions-input[data-rec-id="${recId}"]`);
      const val = sel.value;
      if (val === 'Y') {
        rec.ghgAccounted = true;
        const em = parseFloat(input?.value);
        rec.ghgEmissions = Number.isFinite(em) ? Math.round(em * 100) / 100 : null;
      } else if (val === 'N') {
        rec.ghgAccounted = false;
        rec.ghgEmissions = null;
      } else {
        rec.ghgAccounted = null;
        rec.ghgEmissions = null;
      }
      rec.ghgManualOverride = true;
      updated++;
    });
    if (t) t.updatedAt = nowStr();
    addLog(taskId, `数据处理：编辑温室气体排放数据 ${updated} 条`);
    pendingGhgEditTaskId = null;
    hideModal();
    toast(`已保存 ${updated} 条温室气体排放数据`);
    render();
  }

  function oneClickProcessCustomerData(taskId) {
    const t = getTask(taskId);
    if (!t) return;
    const recs = recordsByTask[taskId] || [];
    if (!recs.length) { toast('暂无客户数据', 'info'); return; }
    const targets = activeDataProcessRecords(recs).filter((r) => effectiveSyncStatus(r) !== 'USABLE');
    if (!targets.length) {
      if (tryFinalizeDataProcess(taskId, { showModal: true })) return;
      toast('全部样本已为可使用状态', 'info');
      render();
      return;
    }
    if (!confirm(`确认将 ${targets.length} 条样本一键标记为「可使用」？`)) return;
    targets.forEach((r, i) => {
      applyRecordUsableFixes(r, i);
      r.availabilityReason = '一键处理';
      r.dataSource = '一键处理';
    });
    refreshSyncStats(taskId);
    t.updatedAt = nowStr();
    if (t.status === 'PENDING_DISAMBIG' && !getPendingDisambigRecords(recs).length) {
      t.status = 'PROCESSING';
    }
    addLog(taskId, `数据处理：一键处理 ${targets.length} 条样本为可使用`);
    toast(`已将 ${targets.length} 条样本标记为可使用`);
    tryFinalizeDataProcess(taskId, { showModal: true });
    render();
  }

  function buildBankCapitalMetricsExportText(taskId) {
    const t = getTask(taskId);
    if (!t?.loanDataSynced) return '';
    ensureBankCapitalMetricsFromLoanSync(t);
    const capital = getTaskBankCapital(t);
    if (!capital) return '';
    const lines = [
      '参试银行资本与拨备监管指标',
      `任务：${t.taskName || taskId}`,
      '',
      '指标名称\t数值',
      ...BANK_BASIC_CAPITAL_ROWS.map((row) => {
        const val = capital[row.key];
        const text = row.isPct && val != null ? `${Number(val).toFixed(1)}%` : (val ?? '');
        return [row.label, text].join('\t');
      }),
    ];
    return lines.join('\n');
  }

  function exportBankCapitalMetrics(taskId) {
    const t = getTask(taskId);
    if (!t?.loanDataSynced) {
      toast('请先同步贷款数据', 'error');
      return;
    }
    ensureBankCapitalMetricsFromLoanSync(t);
    const text = buildBankCapitalMetricsExportText(taskId);
    if (!text) {
      toast('暂无可导出指标', 'info');
      return;
    }
    triggerExportFileDownload(`参试银行资本与拨备监管指标_${t.taskName || taskId}.txt`, text);
    addLog(taskId, '数据处理：导出参试银行资本与拨备监管指标');
    toast('资本与拨备监管指标已导出');
  }

  function exportBankBasicInfo(taskId) {
    const t = getTask(taskId);
    if (!hasTaskFinancialDataSynced(t)) { toast('请先同步财务数据', 'error'); return; }
    syncBankBasicInfoFromRecords(taskId);
    if (!t?.bankBasicInfo?.rows?.length) { toast('暂无可导出基础信息', 'info'); return; }
    const text = buildBankBasicInfoExportText(taskId);
    triggerExportFileDownload(`参试银行基础信息表_${t.taskName || taskId}.txt`, text);
    addLog(taskId, '数据处理：导出参试银行基础信息表');
    toast('基础信息表已导出');
  }

  function openBankCapitalEditModal(taskId) {
    const t = getTask(taskId);
    if (!t?.loanDataSynced) {
      toast('请先同步贷款数据', 'error');
      return;
    }
    ensureBankCapitalMetricsFromLoanSync(t);
    pendingBankCapitalEditTaskId = taskId;
    const capital = getTaskBankCapital(t);
    const body = document.getElementById('bankCapitalEditBody');
    if (!body || !capital) return;
    const readonlyHtml = BANK_BASIC_CAPITAL_ROWS
      .filter((row) => !BANK_CAPITAL_EDITABLE_KEYS.includes(row.key))
      .map((row) => `<tr>
        <td>${esc(row.label)}</td>
        <td class="bank-capital-readonly-val">${formatBankBasicCell(capital[row.key], row.isPct)}</td>
      </tr>`).join('');
    const editableHtml = BANK_BASIC_CAPITAL_ROWS
      .filter((row) => BANK_CAPITAL_EDITABLE_KEYS.includes(row.key))
      .map((row) => `<tr>
        <td>${esc(row.label)}</td>
        <td><input class="input bank-capital-edit-input" id="bank_capital_${row.key}" type="number" step="0.1" min="0"
          value="${capital[row.key] != null ? capital[row.key] : ''}" /></td>
      </tr>`).join('');
    body.innerHTML = `
      <p class="modal-desc">同步贷款数据时获取的资本指标为只读；贷款拨备率与拨备覆盖率监管要求可手动调整。</p>
      <div class="table-wrap bank-capital-edit-table">
        <table>
          <thead><tr><th>指标名称</th><th>数值</th></tr></thead>
          <tbody>${readonlyHtml}${editableHtml}</tbody>
        </table>
      </div>`;
    showModal('modalBankCapitalEdit');
  }

  function saveBankCapitalEdits() {
    const taskId = pendingBankCapitalEditTaskId;
    if (!taskId) return;
    const t = getTask(taskId);
    if (!t) return;
    ensureBankCapitalMetricsFromLoanSync(t);
    const provEl = document.getElementById('bank_capital_provisionRatioReq');
    const covEl = document.getElementById('bank_capital_coverageRatioReq');
    const prov = parseFloat(provEl?.value);
    const cov = parseFloat(covEl?.value);
    if (!Number.isFinite(prov) || prov < 0) {
      toast('请输入有效的贷款拨备率监管要求', 'error');
      return;
    }
    if (!Number.isFinite(cov) || cov < 0) {
      toast('请输入有效的拨备覆盖率监管要求', 'error');
      return;
    }
    t.bankBasicInfo.capital.provisionRatioReq = Math.round(prov * 10) / 10;
    t.bankBasicInfo.capital.coverageRatioReq = Math.round(cov * 10) / 10;
    t.updatedAt = nowStr();
    addLog(taskId, `数据处理：更新拨备监管要求（拨备率 ${t.bankBasicInfo.capital.provisionRatioReq}%，覆盖率 ${t.bankBasicInfo.capital.coverageRatioReq}%）`);
    pendingBankCapitalEditTaskId = null;
    hideModal();
    toast('资本与拨备监管指标已保存');
    render();
  }

  function openBankBasicImportModal(taskId) {
    pendingBankBasicImportTaskId = taskId;
    bankBasicImportFilePicked = false;
    const hint = document.getElementById('bank_basic_import_hint');
    if (hint) hint.textContent = '未选择文件';
    showModal('modalBankBasicImport');
  }

  function mockPickBankBasicImportFile() {
    bankBasicImportFilePicked = true;
    const hint = document.getElementById('bank_basic_import_hint');
    if (hint) hint.textContent = '已选择：参试银行基础信息表.xlsx';
  }

  function confirmBankBasicImport() {
    const taskId = pendingBankBasicImportTaskId;
    if (!taskId) return;
    if (!bankBasicImportFilePicked) { toast('请先选择 Excel 文件', 'error'); return; }
    const t = getTask(taskId);
    const recs = recordsByTask[taskId] || [];
    if (!t.bankBasicInfo) t.bankBasicInfo = buildBankBasicInfoFromRecords(taskId, recs, t);
    t.bankBasicInfo.capital = {
      ...defaultBankBasicCapitalMetrics(),
      coreTier1Capital: 8350000,
      tier1Capital: 9250000,
      totalCapital: 10650000,
    };
    t.bankBasicInfo.importedAt = nowStr();
    t.updatedAt = nowStr();
    addLog(taskId, '数据处理：导入参试银行基础信息表');
    hideModal();
    pendingBankBasicImportTaskId = null;
    bankBasicImportFilePicked = false;
    toast('基础信息表已导入');
    render();
  }

  function filterSyncRecords(recs, taskId) {
    const status = syncListFilters[taskId] || '';
    if (!status) return recs;
    return recs.filter((r) => effectiveSyncStatus(r) === status);
  }

  function setSyncStatusFilter(taskId, status) {
    syncListFilters[taskId] = status || '';
    render();
  }

  function getTaskResultFilter(taskId) {
    if (!taskResultFilters[taskId]) {
      taskResultFilters[taskId] = {
        keyword: '',
        scenarioCode: '',
        year: '',
        industry: '',
        branch: '',
        defaultOnly: '',
        summaryDim: 'industry',
      };
    }
    return taskResultFilters[taskId];
  }

  function setTaskResultFilter(taskId, key, value) {
    const f = getTaskResultFilter(taskId);
    f[key] = value == null ? '' : String(value);
    if (key !== 'summaryDim') {
      const pager = getListPager(`task-${taskId}-result`);
      pager.page = 1;
    }
    render();
  }

  function resetTaskResultFilter(taskId) {
    taskResultFilters[taskId] = {
      keyword: '',
      scenarioCode: '',
      year: '',
      industry: '',
      branch: '',
      defaultOnly: '',
      summaryDim: 'industry',
    };
    getListPager(`task-${taskId}-result`).page = 1;
    render();
  }

  function applyTaskResultFilter(list, f) {
    const kw = (f.keyword || '').trim().toLowerCase();
    return list.filter((r) => {
      if (kw) {
        const hay = `${r.companyName || ''} ${r.branchName || ''} ${r.standardIndustry || ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (f.scenarioCode && r.scenarioCode !== f.scenarioCode) return false;
      if (f.year && String(r.testYear) !== String(f.year)) return false;
      if (f.industry && resolveTestIndustryMajor(r.standardIndustry, r.gbIndustryCode) !== f.industry) return false;
      if (f.branch && r.branchName !== f.branch) return false;
      if (f.defaultOnly === 'Y' && !r.defaultFlag) return false;
      return true;
    });
  }

  function buildTaskResultFilterDesc(taskId) {
    const f = getTaskResultFilter(taskId);
    return `场景=${f.scenarioCode || '全部'}，年份=${f.year || '全部'}，行业=${f.industry || '全部'}，分行=${f.branch || '全部'}，关键词=${f.keyword || '无'}，违约样本=${f.defaultOnly === 'Y' ? '是' : '全部'}`;
  }

  function summarizeTaskResults(list, dim) {
    const map = {};
    list.forEach((r) => {
      const key = dim === 'branch' ? (r.branchName || '-') : (r.standardIndustry || '-');
      if (!map[key]) {
        map[key] = {
          key,
          count: 0,
          sumImpact: 0,
          sumCarbonCost: 0,
          sumEclDelta: 0,
          defaultCount: 0,
        };
      }
      map[key].count++;
      map[key].sumImpact += r.impactRate || 0;
      map[key].sumCarbonCost += r.carbonCost || 0;
      map[key].sumEclDelta += (r.eclAfter || 0) - (r.eclBefore || 0);
      if (r.defaultFlag) map[key].defaultCount++;
    });
    return Object.values(map).map((x) => ({
      ...x,
      avgImpactPct: x.count ? (x.sumImpact / x.count) * 100 : 0,
    })).sort((a, b) => b.avgImpactPct - a.avgImpactPct);
  }

  function summarizeEmissionResults(list, dim) {
    const map = {};
    list.forEach((r) => {
      const key = dim === 'branch' ? (r.branchName || '-') : (r.standardIndustry || '-');
      if (!map[key]) map[key] = { key, count: 0, sumEmission: 0, sumCarbonCost: 0 };
      map[key].count++;
      map[key].sumEmission += r.carbonEmission || 0;
      map[key].sumCarbonCost += r.carbonCost || 0;
    });
    return Object.values(map).sort((a, b) => b.sumCarbonCost - a.sumCarbonCost);
  }

  function summarizePortfolioCredit(list, taskId) {
    const branchMap = {};
    list.forEach((r) => {
      const key = r.branchName || '-';
      if (!branchMap[key]) {
        branchMap[key] = { dim: key, count: 0, eclBefore: 0, eclAfter: 0, defaultCount: 0 };
      }
      branchMap[key].count++;
      branchMap[key].eclBefore += r.eclBefore || 0;
      branchMap[key].eclAfter += r.eclAfter || 0;
      if (r.defaultFlag) branchMap[key].defaultCount++;
    });
    const branches = Object.values(branchMap);
    const total = branches.reduce((acc, b) => ({
      dim: '总行',
      count: acc.count + b.count,
      eclBefore: acc.eclBefore + b.eclBefore,
      eclAfter: acc.eclAfter + b.eclAfter,
      defaultCount: acc.defaultCount + b.defaultCount,
    }), { dim: '总行', count: 0, eclBefore: 0, eclAfter: 0, defaultCount: 0 });
    const toRow = (x) => ({
      ...x,
      eclDelta: x.eclAfter - x.eclBefore,
      provision: Math.round((x.eclAfter - x.eclBefore) * 1.05),
    });
    return [toRow(total), ...branches.map(toRow).sort((a, b) => b.eclDelta - a.eclDelta)];
  }

  function getSyncRecordForResult(taskId, companyName) {
    return (recordsByTask[taskId] || []).find((r) => r.companyName === companyName);
  }

  function emissionCalcBasisLabel(r, taskId) {
    const rec = getSyncRecordForResult(taskId, r.companyName);
    if (rec && isAirportEnterprise(rec) && rec.passengerThroughput) {
      return `排放因子 × 旅客吞吐量（${Number(rec.passengerThroughput).toLocaleString()} 万人次）`;
    }
    if (rec && isAirportEnterprise(rec)) return '排放因子 × 旅客吞吐量';
    return '排放因子 × 营业收入';
  }

  function calcResultFinancials(r) {
    const revenue = (r.revenueAfter || 0) + (r.carbonCost || 0);
    const operatingExpense = revenue * (r.costIncomeRatio ?? 0.85) + (r.carbonCost || 0);
    return {
      revenue,
      operatingExpense,
      netProfit: r.netProfitAfter ?? 0,
    };
  }

  function getEclMeta(taskId, companyName) {
    return (eclByTask[taskId] || []).find((e) => e.companyName === companyName);
  }

  function renderTaskResultFilterBar(t, filter, scenarioOpts, yearOpts, industryOpts, branchOpts) {
    return `<div class="filter-bar">
      <input class="input" style="min-width:180px" placeholder="公司/分行/行业关键词" value="${esc(filter.keyword)}" oninput="CRST_APP.setTaskResultFilter(${t.id}, 'keyword', this.value)" />
      <select class="select" onchange="CRST_APP.setTaskResultFilter(${t.id}, 'scenarioCode', this.value)">
        <option value="">全部情景</option>
        ${scenarioOpts.map((s) => `<option value="${esc(s.code)}" ${filter.scenarioCode === s.code ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
      <select class="select" onchange="CRST_APP.setTaskResultFilter(${t.id}, 'year', this.value)">
        <option value="">全部年份</option>
        ${yearOpts.map((y) => `<option value="${y}" ${String(filter.year) === String(y) ? 'selected' : ''}>${y}年</option>`).join('')}
      </select>
      <select class="select" onchange="CRST_APP.setTaskResultFilter(${t.id}, 'industry', this.value)">
        <option value="">全部行业</option>
        ${industryOpts.map((v) => `<option value="${esc(v)}" ${filter.industry === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
      <select class="select" onchange="CRST_APP.setTaskResultFilter(${t.id}, 'branch', this.value)">
        <option value="">全部分行</option>
        ${branchOpts.map((v) => `<option value="${esc(v)}" ${filter.branch === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
      <select class="select" onchange="CRST_APP.setTaskResultFilter(${t.id}, 'defaultOnly', this.value)">
        <option value="" ${filter.defaultOnly !== 'Y' ? 'selected' : ''}>全部样本</option>
        <option value="Y" ${filter.defaultOnly === 'Y' ? 'selected' : ''}>仅违约样本</option>
      </select>
      <button class="btn btn-default" onclick="CRST_APP.resetTaskResultFilter(${t.id})">重置筛选</button>
    </div>`;
  }

  function collectRiskWarningsFromResults(res) {
    const items = computeIndustryDefaultMonitor(res || [], null);
    const map = new Map();
    items.flatMap((i) => i.rows).forEach((r) => {
      const prev = map.get(r.companyName);
      if (!prev || (r.testYear || 9999) < (prev.testYear || 9999)) map.set(r.companyName, r);
    });
    return [...map.values()].sort((a, b) => {
      const bc = (a.branchName || '').localeCompare(b.branchName || '', 'zh-CN');
      return bc !== 0 ? bc : (a.testYear || 0) - (b.testYear || 0);
    });
  }

  function getFilteredAnalysisResults() {
    const { res } = resolveResultSource();
    const yearSel = window._resultYear;
    const year = yearSel === '' || yearSel == null ? null : yearSel;
    const scenarioCode = window._resultScenarioCode || '';
    return filterAnalysisResults(res, year, scenarioCode);
  }

  function getRiskWarningRows(taskId) {
    if (pendingRiskPushWarnings?.length && pendingRiskPushTaskId === taskId) {
      return pendingRiskPushWarnings;
    }
    return collectRiskWarningsFromResults(resultsByTask[taskId] || []);
  }

  function riskWarningMessage(r) {
    const branch = r.branchName || 'XX分行';
    const year = r.testYear || 'XXXX';
    return `${branch}${r.companyName}预计在${year}年转不良贷款`;
  }

  function riskHintText(r) {
    if (r.defaultFlag) return riskWarningMessage(r);
    return '风险提示';
  }

  function hasAvgCalculated(taskId) {
    return (avgByTask[taskId] || []).length > 0;
  }

  function isAvgDataFilled(taskId) {
    const recs = recordsByTask[taskId] || [];
    return !recs.some((r) => effectiveSyncStatus(r) === 'NEED_AVG');
  }

  const MENU_TREE = [
    { page: 'data-process', label: '数据处理' },
    { page: 'scenario-analysis', label: '情景分析' },
    { page: 'results', label: '压测结果分析' },
    { page: 'stress-fin-trans', label: '财务传导' },
    { page: 'stress-npl-prov', label: '不良和拨备计算' },
    { page: 'stress-pd-lgd', label: 'PD/LGD计算' },
    { page: 'exports', label: '导出记录' },
    {
      key: 'config',
      label: '基础配置',
      children: [
        { page: 'factors', label: '因子库管理' },
        { page: 'mappings', label: '行业映射关系' },
        { page: 'airport-throughput', label: '机场吞吐量维护' },
      ],
    },
  ];

  const MENU_REGISTRY = MENU_TREE.flatMap((n) =>
    n.children
      ? n.children.map((c) => ({ ...c, group: n.label, section: n.key }))
      : [{ ...n, group: n.label, section: n.page }]
  );

  const MENU_PERM_KEY = 'crst-menu-visibility';

  function getDefaultMenuVisibility() {
    return Object.fromEntries(MENU_REGISTRY.map((m) => [m.page, true]));
  }

  function getMenuVisibility() {
    try {
      const raw = localStorage.getItem(MENU_PERM_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.tasks !== undefined && parsed['data-process'] === undefined) {
          parsed['data-process'] = parsed.tasks;
        }
        return { ...getDefaultMenuVisibility(), ...parsed };
      }
    } catch (_) {}
    return getDefaultMenuVisibility();
  }

  function saveMenuVisibility(vis) {
    try { localStorage.setItem(MENU_PERM_KEY, JSON.stringify(vis)); } catch (_) {}
    applyMenuVisibility(vis);
  }

  function applyMenuVisibility(vis) {
    const v = vis || getMenuVisibility();
    MENU_REGISTRY.forEach(({ page }) => {
      const link = document.querySelector(`#menu a[data-page="${page}"]`)
        || document.querySelector(`.menu-level-1[data-nav-page="${page}"]`);
      const li = link?.closest('li');
      const sec = link?.closest('.menu-section');
      const show = v[page] !== false;
      if (sec && sec.classList.contains('menu-section--nav')) {
        sec.style.display = show ? '' : 'none';
      } else if (li) {
        li.style.display = show ? '' : 'none';
        li.classList.toggle('menu-hidden', !show);
      }
    });
    document.querySelectorAll('#menu .menu-section:not(.menu-section--nav)').forEach((sec) => {
      const subItems = sec.querySelectorAll('.menu-sub > li');
      const anyVisible = Array.from(subItems).some((li) => li.style.display !== 'none');
      sec.style.display = anyVisible ? '' : 'none';
    });
  }

  function firstVisibleMenuPage() {
    const v = getMenuVisibility();
    const found = MENU_REGISTRY.find((m) => v[m.page] !== false);
    return found ? found.page : 'data-process';
  }

  const PAGE_SECTION = {
    'data-process': 'data-process',
    'scenario-analysis': 'scenario-analysis',
    'stress-fin-trans': 'stress-fin-trans',
    'stress-pd-lgd': 'stress-pd-lgd',
    'stress-npl-prov': 'stress-npl-prov',
    results: 'results',
    exports: 'exports',
    'task-detail': 'data-process',
    factors: 'config', mappings: 'config',
    'airport-throughput': 'config',
  };

  function syncMenuSections(page) {
    const sectionKey = PAGE_SECTION[page];
    document.querySelectorAll('.menu-section').forEach((sec) => {
      const isTarget = sectionKey && sec.dataset.section === sectionKey;
      const hasActive = sec.querySelector(`a[data-page="${page}"]`);
      if (isTarget || hasActive) sec.classList.add('open');
      const btn = sec.querySelector('.menu-level-1');
      if (btn) btn.setAttribute('aria-expanded', sec.classList.contains('open') ? 'true' : 'false');
    });
  }

  function navigate(page, taskId, tab, opts = {}) {
    if (page === 'task-detail' || page === 'tasks') page = 'data-process';
    const vis = getMenuVisibility();
    const meta = MENU_REGISTRY.find((m) => m.page === page);
    if (meta && vis[page] === false) {
      toast('该菜单当前不可用', 'error');
      page = firstVisibleMenuPage();
    }
    currentPage = page;
    if (!MODULE_FLOW_PAGES.has(page)) {
      taskDraftMode = false;
      taskEditMode = false;
      taskViewMode = false;
      moduleContext = null;
      currentStressJobId = null;
      stressJobListMode = true;
    } else if (page === 'data-process') {
      moduleContext = { modulePage: page };
      currentStressJobId = null;
      stressJobListMode = true;
      if (taskId != null) {
        dataProcessListMode = false;
        taskDraftMode = false;
      } else if (opts.draft) {
        dataProcessListMode = false;
        taskDraftMode = true;
        currentTaskId = null;
        dataProcessTab = 0;
        detailStep = 0;
      } else {
        dataProcessListMode = true;
        dataProcessTab = 0;
        currentTaskId = null;
        taskDraftMode = false;
        taskEditMode = false;
        taskViewMode = false;
        detailStep = 0;
      }
    } else if (isStressModulePage(page)) {
      taskDraftMode = false;
      if (isStressResultViewPage(page)) {
        if (taskId != null && getStressJob(taskId)) presetStressResultViewJob(page, taskId);
        currentStressJobId = null;
        stressJobListMode = true;
        moduleContext = { modulePage: page };
      } else if (taskId != null && getStressJob(taskId)) {
        currentStressJobId = taskId;
        stressJobListMode = false;
        stressJobDetailStep = getStressStepMeta(page)?.stepIndex ?? 1;
        moduleContext = { modulePage: page, stressJobId: taskId, embedded: true };
      } else if (taskId != null && getTask(taskId)) {
        pendingCreateStressJob = { sourceTaskId: taskId, fromPage: page };
        currentStressJobId = null;
        stressJobListMode = true;
        moduleContext = { modulePage: page };
      } else {
        if (page !== currentPage) {
          currentStressJobId = null;
          stressJobListMode = true;
        }
        moduleContext = { modulePage: page };
      }
    }
    if (!isTaskManagementPage(page)) {
      closeTaskLogDrawer();
    }
    if (taskId != null) {
      if (page === 'data-process') {
        currentTaskId = taskId;
        if (!opts.draft) taskDraftMode = false;
      } else if (!(isStressModulePage(page) && getStressJob(taskId))) {
        currentTaskId = taskId;
        taskDraftMode = false;
      }
    }
    const step = resolveDetailStep(tab);
    if (step != null) {
      if (page === 'data-process') {
        dataProcessTab = step === 0 ? 0 : 1;
        detailStep = step > 1 ? 1 : step;
      } else if (isStressModulePage(page) && taskId != null && getStressJob(taskId)) {
        stressJobDetailStep = step;
      } else if (isStressModulePage(page) && currentStressJobId && step != null) {
        stressJobDetailStep = step;
      } else {
        detailStep = step;
      }
    }
    document.querySelectorAll('#menu a[data-page]').forEach((a) => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    document.querySelectorAll('.menu-level-1[data-nav-page]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.navPage === page);
    });
    syncMenuSections(page);
    if (page === 'data-process' && currentTaskId && !taskDraftMode) {
      syncDataProcessTaskViewState(getTask(currentTaskId));
      if (taskEditMode) taskViewMode = false;
    }
    render();
  }

  function renderSteps(status, selectedStep) {
    if (moduleContext?.embedded || isDataProcessModule() || currentPage === 'data-process') return '';
    const progressIdx = stepIndex(status);
    const sel = selectedStep ?? progressIdx;
    const completedToEnd = progressIdx >= STEP_LABELS.length - 1;
    return STEP_LABELS.map((label, i) => {
      const done = i < progressIdx || (completedToEnd && i === progressIdx);
      const active = i === sel;
      const line = i < STEP_LABELS.length - 1 ? '<div class="step-line"></div>' : '';
      return `<div class="step step-nav-item ${done ? 'done' : ''} ${active ? 'active' : ''}" data-step="${i}" role="button" tabindex="0" onclick="CRST_APP.setDetailStep(${i})" title="查看：${label}">
        <div class="step-icon">${done ? '✓' : i + 1}</div>
        <span class="step-label">${label}</span>${line}
      </div>`;
    }).join('');
  }

  function isDataProcessModule() {
    return moduleContext?.modulePage === 'data-process' || currentPage === 'data-process';
  }

  function isStressJobDetailContext() {
    return !!(moduleContext?.stressJobId
      || (currentStressJobId && !stressJobListMode && isStressModulePage()));
  }

  function getActiveDetailStep() {
    if (isStressJobDetailContext()) return stressJobDetailStep;
    if (isDataProcessModule()) return mapDataProcessTabToDetailStep(dataProcessTab);
    return detailStep;
  }

  /** B2：切换数据处理任务时同步 Tab 步骤与只读态 */
  function syncDataProcessTaskViewState(t) {
    if (!t) {
      taskViewMode = false;
      return;
    }
    if (taskEditMode) {
      taskViewMode = false;
    } else if (!taskViewMode) {
      taskViewMode = ['COMPLETED', 'ARCHIVED'].includes(t.status);
    }
    detailStep = dataProcessTab === 0 ? 0 : 1;
  }

  function renderStressJobSteps(selectedStep) {
    const job = currentStressJobId ? getStressJob(currentStressJobId) : null;
    const progressIdx = job ? stressJobProgressStep(job) : 0;
    const sel = selectedStep ?? progressIdx;
    return STRESS_JOB_STEP_LABELS.map((label, i) => {
      const done = i < progressIdx || (job?.status === 'COMPLETED' && i <= 3);
      const active = i === sel;
      const line = i < STRESS_JOB_STEP_LABELS.length - 1 ? '<div class="step-line"></div>' : '';
      return `<div class="step step-nav-item ${done ? 'done' : ''} ${active ? 'active' : ''}" data-step="${i}" role="button" tabindex="0" onclick="CRST_APP.setStressJobStep(${i})" title="查看：${label}">
        <div class="step-icon">${done ? '✓' : i + 1}</div>
        <span class="step-label">${label}</span>${line}
      </div>`;
    }).join('');
  }

  function renderStressJobListBackButton() {
    if (!isStressJobDetailContext()) return '';
    return `<button type="button" class="btn btn-default btn-back-list" onclick="CRST_APP.backToStressJobList('${esc(currentPage)}')">返回</button>`;
  }

  function renderTaskFlowCard(status, panelHtml, selectedStep) {
    const hideSteps = isDataProcessModule() || currentPage === 'data-process'
      || isScenarioAnalysisPage()
      || (moduleContext?.embedded && !isStressJobDetailContext());
    let stepsHtml = '';
    if (!hideSteps) {
      stepsHtml = isStressJobDetailContext()
        ? `<div class="steps steps-nav">${renderStressJobSteps(selectedStep)}</div>`
        : `<div class="steps steps-nav">${renderSteps(status, selectedStep)}</div>`;
    }
    return `
      <div class="card task-flow-card">
        ${stepsHtml}
        <div class="step-panel">${panelHtml}</div>
      </div>`;
  }

  /* —— 压测任务列表 —— */
  function renderTasks() {
    const filtered = filterTaskList();
    const table = renderPagedTable('tasks', filtered,
      '<tr><th>任务名称</th><th>基准年度</th><th>贷款类型</th><th>贷款地区</th><th>更新人</th><th>更新时间</th><th>操作</th></tr>',
      (t) => `<tr>
        <td>${esc(t.taskName)}</td>
        <td>${t.reportYear || '-'}</td>
        <td>${t.loanType === 'CORPORATE' ? '对公' : t.loanType === 'PERSONAL' ? '个人' : '-'}</td>
        <td>${t.loanRegion === 'DOMESTIC' ? '境内' : t.loanRegion === 'OVERSEAS' ? '境外' : '-'}</td>
        <td>${esc(getTaskUpdatedBy(t))}</td>
        <td>${esc(t.updatedAt || t.createdAt || '-')}</td>
        <td><div class="action-group">${taskActions(t)}</div></td>
      </tr>`, 7);

    const yearFilterOpts = buildTaskReportYearFilterOptions(taskFilters.reportYear);
    const loanTypeFilterOpts = [
      '<option value="">全部</option>',
      `<option value="CORPORATE" ${taskFilters.loanType === 'CORPORATE' ? 'selected' : ''}>对公</option>`,
      `<option value="PERSONAL" ${taskFilters.loanType === 'PERSONAL' ? 'selected' : ''}>个人</option>`,
    ].join('');
    const loanRegionFilterOpts = [
      '<option value="">全部</option>',
      `<option value="DOMESTIC" ${taskFilters.loanRegion === 'DOMESTIC' ? 'selected' : ''}>境内</option>`,
      `<option value="OVERSEAS" ${taskFilters.loanRegion === 'OVERSEAS' ? 'selected' : ''}>境外</option>`,
    ].join('');

    return `
      <div class="card">
        <div class="toolbar">
          <h2 class="page-title">数据处理任务</h2>
          <button class="btn btn-primary" onclick="CRST_APP.startCreateTask()">新建任务</button>
        </div>
        <div class="task-filter-bar">
          <div class="filter-item">
            <label>任务名称</label>
            <input class="input" id="tf_name" placeholder="模糊搜索" value="${esc(taskFilters.name)}" onkeydown="if(event.key==='Enter')CRST_APP.searchTasks()" />
          </div>
          <div class="filter-item">
            <label>基准年度</label>
            <select class="select" id="tf_report_year">${yearFilterOpts}</select>
          </div>
          <div class="filter-item">
            <label>贷款类型</label>
            <select class="select" id="tf_loan_type">${loanTypeFilterOpts}</select>
          </div>
          <div class="filter-item">
            <label>贷款地区</label>
            <select class="select" id="tf_loan_region">${loanRegionFilterOpts}</select>
          </div>
          <div class="filter-item filter-actions">
            <button type="button" class="btn btn-primary" onclick="CRST_APP.searchTasks()">查询</button>
            <button type="button" class="btn btn-default" onclick="CRST_APP.resetTaskFilters()">重置</button>
          </div>
        </div>
        ${table}
      </div>`;
  }

  function renderTaskFormFields(t, opts) {
    const readonly = !!opts?.readonly;
    const nameOnly = !!opts?.nameOnly;
    const displayOnly = readonly || nameOnly;
    const roName = readonly ? 'disabled' : '';
    const roOther = displayOnly ? 'disabled' : '';
    if (!displayOnly) ensureIndustryPickerInit(t);
    const stressPurpose = t?.stressPurpose || industryPickerState?.purpose || 'PBOC';
    if (industryPickerState && !displayOnly) industryPickerState.purpose = stressPurpose;
    const purposeOpts = STRESS_PURPOSE_OPTIONS.map((o) =>
      `<option value="${o.value}" ${stressPurpose === o.value ? 'selected' : ''}>${esc(o.label)}</option>`
    ).join('');
    const yearOpts = Array.from({ length: 74 }, (_, i) => {
      const y = 2026 + i;
      return `<option value="${y}" ${(Number(t?.reportYear) || 2026) === y ? 'selected' : ''}>${y}</option>`;
    }).join('');
    const loanTypeOpts = [
      `<option value="CORPORATE" ${(!t?.loanType || t?.loanType === 'CORPORATE') ? 'selected' : ''}>对公</option>`,
      `<option value="PERSONAL" ${t?.loanType === 'PERSONAL' ? 'selected' : ''}>个人</option>`,
    ].join('');
    const loanRegionOpts = [
      `<option value="DOMESTIC" ${(!t?.loanRegion || t?.loanRegion === 'DOMESTIC') ? 'selected' : ''}>境内</option>`,
      `<option value="OVERSEAS" ${t?.loanRegion === 'OVERSEAS' ? 'selected' : ''}>境外</option>`,
    ].join('');
    const req = displayOnly ? '' : '<span class="req">*</span>';
    const industryBlock = displayOnly
      ? `
      <div class="form-row">
        <label>压测目的</label>
        <input class="input" value="${esc(stressPurposeLabel(t?.stressPurpose || 'PBOC'))}" disabled />
      </div>
      <div class="form-row">
        <label>涉及行业</label>
        <textarea class="textarea" disabled>${esc(getTaskIndustrySummary(t))}</textarea>
      </div>`
      : `
      <div class="form-row">
        <label class="form-label-with-tip"><span class="form-label-text">${req}压测目的</span>${renderFieldTipBubble(STRESS_PURPOSE_FIELD_TIP)}</label>
        <select class="select" id="d_stressPurpose" ${roOther} onchange="CRST_APP.onStressPurposeChange()">${purposeOpts}</select>
      </div>
      ${renderIndustryPicker({ readonly })}`;
    const basicInfoBlock = displayOnly
      ? `
      <div class="form-grid-2">
        <div class="form-row">
          <label>基准年度</label>
          <input class="input" value="${esc(String(getTaskReportYear(t)))}" disabled />
        </div>
        <div class="form-row">
          <label>贷款类型</label>
          <input class="input" value="${esc(t?.loanType === 'PERSONAL' ? '个人' : '对公')}" disabled />
        </div>
      </div>
      <div class="form-row">
        <label>贷款地区</label>
        <input class="input" value="${esc(t?.loanRegion === 'OVERSEAS' ? '境外' : '境内')}" disabled />
      </div>`
      : `
      <div class="form-grid-2">
        <div class="form-row">
          <label>${req}基准年度</label>
          <select class="select" id="d_reportYear" ${roOther}>${yearOpts}</select>
        </div>
        <div class="form-row">
          <label>${req}贷款类型</label>
          <select class="select" id="d_loanType" ${roOther}>${loanTypeOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <label>${req}贷款地区</label>
        <select class="select" id="d_loanRegion" ${roOther}>${loanRegionOpts}</select>
      </div>`;
    return `
      <div class="form-row">
        <label>${req}任务名称</label>
        <input class="input" id="d_taskName" placeholder="请输入任务名称" value="${esc(t?.taskName || '')}" ${roName} />
      </div>
      ${basicInfoBlock}
      ${industryBlock}
      <div class="form-row">
        <label>任务说明</label>
        <textarea class="textarea" id="d_desc" placeholder="压测目标、范围说明等" ${roOther}>${esc(t?.description || '')}</textarea>
      </div>`;
  }

  function onTaskReportEndChange() {}

  function renderTaskLogList(entityId, isJob) {
    const logs = isJob ? (stressJobLogs[entityId] || []) : (taskLogs[entityId] || []);
    if (!logs.length) {
      return '<div class="drawer-empty">暂无操作记录</div>';
    }
    return `<ul class="task-log-list">${logs.map((l) => `
      <li class="task-log-item">
        <div class="task-log-meta">
          <span class="task-log-time">${esc(l.time)}</span>
          <span class="task-log-operator">${esc(l.operator)}</span>
        </div>
        <div class="task-log-action">${esc(l.action)}</div>
      </li>`).join('')}</ul>`;
  }

  function isTaskManagementPage(page) {
    return MODULE_FLOW_PAGES.has(page) || page === 'task-detail';
  }

  function viewTaskInModule(id) {
    const t = getTask(id);
    if (!t) return;
    taskEditMode = false;
    taskViewMode = true;
    dataProcessListMode = false;
    syncDataProcessTaskViewState(t);
    navigateDataProcessTask(id, dataProcessDefaultTab(t));
  }

  function openTaskInModule(id) {
    const t = getTask(id);
    if (!t) return;
    const step = viewTaskDefaultStep(t);
    taskEditMode = false;
    if (step <= 2) {
      dataProcessListMode = false;
      syncDataProcessTaskViewState(t);
      navigateDataProcessTask(id, dataProcessDefaultTab(t));
    } else if (step === 3) {
      taskViewMode = false;
      stressJobListMode = true;
      pendingCreateStressJob = { sourceTaskId: id, fromPage: 'scenario-analysis' };
      navigate('scenario-analysis');
    } else {
      taskViewMode = false;
      window._resultSourceKey = `task-${id}`;
      window._resultTaskId = id;
      navigate('results');
    }
  }

  function openTaskLogDrawer(taskId) {
    const id = taskId != null ? taskId : (currentStressJobId || currentTaskId);
    const job = id != null ? getStressJob(id) : null;
    const isJob = !!job;
    if (!isTaskManagementPage(currentPage) || !id || (currentPage === 'data-process' && taskDraftMode)) return;
    if (isStressModulePage(currentPage) && stressJobListMode) return;
    taskLogDrawerOpen = true;
    const body = document.getElementById('taskLogDrawerBody');
    const sub = document.getElementById('taskLogDrawerSub');
    const t = job || getTask(id);
    if (sub && t) sub.textContent = isJob ? `压测任务：${t.jobName}` : `任务：${t.taskName}`;
    if (body) body.innerHTML = renderTaskLogList(id, isJob);
    document.getElementById('taskLogDrawerMask')?.classList.add('open');
    document.getElementById('taskLogDrawer')?.classList.add('open');
    document.body.classList.add('drawer-open');
  }

  function closeTaskLogDrawer() {
    taskLogDrawerOpen = false;
    document.getElementById('taskLogDrawerMask')?.classList.remove('open');
    document.getElementById('taskLogDrawer')?.classList.remove('open');
    document.body.classList.remove('drawer-open');
  }

  function syncTaskLogUi() {
    if (!isTaskManagementPage(currentPage)) {
      closeTaskLogDrawer();
      return;
    }
    if (taskLogDrawerOpen && (currentStressJobId || currentTaskId) && !taskDraftMode) {
      const body = document.getElementById('taskLogDrawerBody');
      const sub = document.getElementById('taskLogDrawerSub');
      const id = currentStressJobId || currentTaskId;
      const job = getStressJob(id);
      const ent = job || getTask(id);
      if (sub && ent) sub.textContent = job ? `压测任务：${ent.jobName}` : `任务：${ent.taskName}`;
      if (body) body.innerHTML = renderTaskLogList(id, !!job);
    }
  }

  function renderTaskFormActions(cancelFn, saveLabel) {
    return `
      <div class="toolbar step-panel-actions">
        <button class="btn btn-default" onclick="${cancelFn}">取消</button>
        <button class="btn btn-primary" onclick="CRST_APP.saveTask()">${saveLabel}</button>
      </div>`;
  }

  function renderTaskCreatePage() {
    const panel = `
      <h3 class="step-panel-title">创建任务 — 基本信息</h3>
      ${renderTaskFormFields(null, { readonly: false })}
      ${renderTaskFormActions('CRST_APP.cancelCreateTask()', '保存任务')}`;
    return `
      <div class="breadcrumb">
        <a onclick="CRST_APP.backToDataProcessList()">数据处理</a> / 新建任务
      </div>
      ${renderTaskFlowCard('DRAFT', panel, 0)}`;
  }

  function getTaskSyncFilters(t) {
    if (!t.syncFilters) t.syncFilters = { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 };
    return t.syncFilters;
  }

  function renderSyncFilterPanel(t, readonly) {
    const f = getTaskSyncFilters(t);
    const ro = readonly ? 'disabled' : '';
    const regionOpts = [
      { value: 'DOMESTIC', label: '境内' },
      { value: 'OVERSEAS', label: '境外' },
    ].map((o) => `<option value="${o.value}" ${f.loanRegion === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
    const classChecks = Object.entries(LOAN_CLASSIFICATION_LABELS).map(([code, label]) =>
      `<label class="inline-check"><input type="checkbox" name="sf_class_${t.id}" value="${code}" ${f.loanClasses?.includes(code) ? 'checked' : ''} ${ro} /> ${label}</label>`
    ).join('');
    return `
      <div class="sync-filter-panel">
        <h4 class="step-subtitle">筛选条件（v0.4）</h4>
        <div class="form-grid-2">
          <div class="form-row">
            <label><span class="req">*</span>贷款地域范围</label>
            <select class="select" id="sf_region_${t.id}" ${ro}>${regionOpts}</select>
          </div>
          <div class="form-row">
            <label>PD值上限</label>
            <input class="input" id="sf_pdmax_${t.id}" type="number" step="any" min="0" max="1" value="${f.pdMax ?? 0.99}" ${ro} />
          </div>
        </div>
        <div class="form-row">
          <label>贷款五级分类</label>
          <div class="inline-check-group">${classChecks || '<span class="text-secondary">全部</span>'}</div>
        </div>
        ${!readonly ? `<div class="form-row">
          <label>特殊客户排除</label>
          <button type="button" class="btn btn-default" onclick="CRST_APP.openExcludeCustomerModal(${t.id})">排除特殊客户</button>
        </div>
        <div class="sync-filter-footer">
          <button type="button" class="btn btn-default" onclick="CRST_APP.saveSyncFilters(${t.id})">保存筛选条件</button>
        </div>` : ''}
      </div>`;
  }

  function saveSyncFilters(taskId) {
    const t = getTask(taskId);
    if (!t) return;
    const f = getTaskSyncFilters(t);
    f.loanRegion = document.getElementById(`sf_region_${taskId}`)?.value || 'DOMESTIC';
    f.pdMax = parseFloat(document.getElementById(`sf_pdmax_${taskId}`)?.value);
    if (!Number.isFinite(f.pdMax)) f.pdMax = 0.99;
    else f.pdMax = Math.max(0, Math.min(1, f.pdMax));
    f.loanClasses = [...document.querySelectorAll(`input[name="sf_class_${taskId}"]:checked`)].map((el) => el.value);
    t.updatedAt = nowStr();
    addLog(taskId, `数据同步与确认：更新筛选条件（${loanRegionLabel(f.loanRegion)}，PD≤${f.pdMax}）`);
    toast('筛选条件已保存');
    render();
  }

  function openExcludeCustomerModal(taskId) {
    modalState = { type: 'exclude', taskId };
    const recs = getActiveSyncRecords(recordsByTask[taskId] || []);
    const body = document.getElementById('excludeCustomerBody');
    if (!body) return;
    body.innerHTML = recs.length
      ? `<div class="table-wrap"><table><thead><tr><th><input type="checkbox" onchange="CRST_APP.toggleExcludeAll(this.checked)" /></th><th>公司</th><th>五级分类</th><th>PD值</th><th>地域</th></tr></thead><tbody>${
        recs.map((r) => `<tr>
          <td><input type="checkbox" class="exclude-row-check" data-rec-id="${r.id}" ${BAD_LOAN_CLASSES.has(r.loanClassification) || r.pdValue >= 1 ? 'checked' : ''} /></td>
          <td>${esc(r.companyName)}</td>
          <td>${esc(loanClassLabel(r.loanClassification))}</td>
          <td>${r.pdValue != null ? r.pdValue : '-'}</td>
          <td>${esc(loanRegionLabel(r.loanRegion))}</td>
        </tr>`).join('')
      }</tbody></table></div>`
      : '<div class="empty">暂无可排除客户</div>';
    showModal('modalExcludeCustomer');
  }

  function toggleExcludeAll(checked) {
    document.querySelectorAll('.exclude-row-check').forEach((el) => { el.checked = checked; });
  }

  function confirmExcludeCustomers() {
    const taskId = modalState?.taskId;
    if (!taskId) return;
    const reason = document.getElementById('excludeReason')?.value?.trim() || '管理员手工排除';
    const recs = recordsByTask[taskId] || [];
    let n = 0;
    document.querySelectorAll('.exclude-row-check:checked').forEach((el) => {
      const rec = recs.find((r) => r.id === parseInt(el.dataset.recId, 10));
      if (!rec || rec.excluded) return;
      rec.excluded = true;
      rec.dataAvailability = 'EXCLUDED';
      rec.availabilityReason = reason;
      rec.dataSource = '已排除';
      n++;
    });
    refreshSyncStats(taskId);
    addLog(taskId, `数据同步与确认：排除 ${n} 条特殊客户（${reason}）`);
    hideModal();
    toast(n ? `已排除 ${n} 条客户` : '未选择排除客户');
    render();
  }

  function openIndustryDisambigModal(taskId) {
    modalState = { type: 'disambig', taskId };
    const recs = getPendingDisambigRecords(recordsByTask[taskId] || []);
    const body = document.getElementById('disambigBody');
    if (!body) return;
    body.innerHTML = recs.map((r) => {
      const rule = getAmbiguityRule(r.ambiguityCode) || detectAmbiguityForRecord(r);
      const opts = (rule?.options || [r.standardIndustry]).map((o) =>
        `<option value="${esc(o)}" ${r.standardIndustry === o ? 'selected' : ''}>${esc(o)}</option>`
      ).join('');
      return `<div class="disambig-row" data-rec-id="${r.id}">
        <div class="disambig-head"><strong>${esc(r.companyName)}</strong> · ${esc(r.creditNo || r.customerId || '-')}</div>
        <div class="form-grid-2">
          <div class="form-row"><label>歧义类型</label><span>${esc(rule?.code || '-')} ${esc(rule?.gbName || '')}</span></div>
          <div class="form-row"><label>测试行业类别</label><select class="select disambig-industry" data-rec-id="${r.id}">${opts}</select></div>
        </div>
        <div class="form-row"><label>甄别依据</label><input class="input disambig-note" data-rec-id="${r.id}" placeholder="${esc(rule?.hint || '桌面调研说明')}" value="${esc(r.disambigNote || '')}" /></div>
      </div>`;
    }).join('') || '<div class="empty">暂无待甄别客户</div>';
    showModal('modalIndustryDisambig');
  }

  function saveIndustryDisambig() {
    const taskId = modalState?.taskId;
    if (!taskId) return;
    const t = getTask(taskId);
    const recs = recordsByTask[taskId] || [];
    document.querySelectorAll('.disambig-industry').forEach((sel) => {
      const recId = parseInt(sel.dataset.recId, 10);
      const rec = recs.find((r) => r.id === recId);
      if (!rec) return;
      const prev = rec.standardIndustry;
      rec.standardIndustry = sel.value;
      rec.ambiguityConfirmed = true;
      rec.availabilityReason = '行业甄别已确认';
      const noteEl = document.querySelector(`.disambig-note[data-rec-id="${recId}"]`);
      rec.disambigNote = noteEl?.value?.trim() || '';
      addLog(taskId, `行业甄别：${rec.companyName} ${prev} → ${rec.standardIndustry}`);
    });
    if (allDisambigConfirmed(recs)) {
      t.status = 'PROCESSING';
      addLog(taskId, '行业甄别：全部完成');
    }
    t.updatedAt = nowStr();
    hideModal();
    toast('甄别结果已保存');
    tryFinalizeDataProcess(taskId);
    render();
  }

  /* —— 压测任务四步详情 —— */
  function buildStressScenarioSection(t, entityId, readonly, stepIndex = 1) {
    const stressEditable = canEditStressSection(t, stepIndex);
    const scenarioReadonly = !stressEditable;
    const pubScenarios = scenariosForJob();
    const defaultCodes = pubScenarios.map((s) => s.scenarioCode);
    const selectedCodes = t.selectedScenarioCodes?.length
      ? t.selectedScenarioCodes.filter((c) => pubScenarios.some((s) => s.scenarioCode === c))
      : defaultCodes;
    const checks = pubScenarios.map((s) =>
      `<label><input type="checkbox" name="sc_${entityId}" value="${esc(s.scenarioCode)}" ${selectedCodes.includes(s.scenarioCode) ? 'checked' : ''} onchange="CRST_APP.onStressScenarioToggle(${entityId})" ${scenarioReadonly ? 'disabled' : ''} /> ${esc(s.scenarioName)}</label>`
    ).join('');
    const commonParamHtml = selectedCodes.length
      ? buildStressCommonParamCardHtml(t, entityId, scenarioReadonly)
      : '';
    return { checks, commonParamHtml, scenarioCardHtml: '', selectedCodes, stressEditable };
  }

  function renderStressJobDataBanner(t) {
    return `
      <div class="desc-grid stress-data-banner" style="margin-bottom:16px">
        <div class="desc-item"><span class="k">数据来源</span><span>${stressDataSourceTag(t.dataSource)} ${t.dataSource === 'REF' ? esc(t.sourceTaskName || '-') : 'Excel 导入'}</span></div>
        <div class="desc-item"><span class="k">数据条数</span><span>${t.recordCount?.toLocaleString()} 条（可用 ${t.usableCount?.toLocaleString()}）</span></div>
        <div class="desc-item"><span class="k">压测情景</span><span>${renderScenarioTags(t.selectedScenarioCodes)}</span></div>
        <div class="desc-item"><span class="k">报告期</span><span>${t.reportPeriodStart || '-'} ~ ${t.reportPeriodEnd || '-'}</span></div>
      </div>`;
  }

  function renderStressJobStepPanel(t, step, ctx) {
    const { entityId, recs, results, stressEditOnly } = ctx;
    const dataBanner = renderStressJobDataBanner(t);
    const refDataSection = t.dataSource === 'REF' && t.sourceTaskId
      ? renderReferencedDataProcessTables(t, recs)
      : '';

    if (step === 0) {
      return `
        ${dataBanner}
        <h3 class="step-panel-title">数据处理（引用）</h3>
        <p class="stress-step-hint">本步展示引用的数据处理任务产出。如需修改基础数据，请返回「数据处理」模块。</p>
        ${refDataSection || '<div class="empty">暂无引用数据</div>'}
        <div class="step-footer">
          <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.setStressJobStep(1)">下一步：财务传导</button>
        </div>`;
    }

    if (step === 1) {
      const { checks, commonParamHtml, scenarioCardHtml, stressEditable } = buildStressScenarioSection(t, entityId, ctx.readonly);
      const finDone = isFinTransDone(t);
      if (isScenarioAnalysisPage()) {
        return `
        <h4 class="step-subtitle step-panel-title-divider">压测情景</h4>
        <div class="checkbox-group scenario-checkbox-group">${checks || '<span class="scenario-check-empty">无已生效压测情景，请联系管理员配置。</span>'}</div>
        ${commonParamHtml || ''}
        ${scenarioCardHtml || ''}
        <div class="toolbar step-panel-actions step-panel-actions--with-back" style="margin-top:12px">
          ${renderStressJobListBackButton()}
          ${stressEditOnly ? '<button class="btn btn-default" onclick="CRST_APP.cancelEditTask()">取消编辑</button>' : ''}
          ${stressEditable ? `<button class="btn btn-primary" onclick="CRST_APP.runScenarioStress(${entityId})">${finDone || t.status === 'COMPLETED' ? '重新执行压测' : '执行压测'}</button>` : ''}
        </div>`;
      }
      return `
        ${dataBanner}
        <h3 class="step-panel-title">财务传导</h3>
        <p class="stress-step-hint">选择压测情景并录入参数，将碳排放/碳费用传导至企业收入、成本与净利润。三种情景在本步骤内多选，不再拆分菜单。</p>
        ${refDataSection}
        <h4 class="step-subtitle step-panel-title-divider">压测情景</h4>
        <div class="checkbox-group scenario-checkbox-group">${checks || '<span class="scenario-check-empty">无已生效压测情景，请联系管理员配置。</span>'}</div>
        ${commonParamHtml || ''}
        ${scenarioCardHtml || ''}
        ${stressEditable ? `<div class="toolbar step-panel-actions" style="margin-top:12px">
          ${stressEditOnly ? '<button class="btn btn-default" onclick="CRST_APP.cancelEditTask()">取消编辑</button>' : ''}
          <button class="btn btn-primary" onclick="CRST_APP.runFinTrans(${entityId})">${finDone ? '重新执行财务传导' : '执行财务传导'}</button>
        </div>` : ''}
        ${finDone ? `
        <section class="result-section fin-trans-output-section" style="margin-top:20px">
          ${renderDefaultAdjustmentDetailTable(null, [], {
            rows: buildFinTransDefaultAdjustmentRows(t),
            showExport: !ctx.readonly,
            exportHandler: 'CRST_APP.exportFinTransDefaultAdjustmentTable()',
          })}
        </section>
        <div class="step-footer">
          <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.setStressJobStep(2)">下一步：PD/LGD 计算</button>
        </div>` : ''}`;
    }

    if (step === 2) {
      if (!isFinTransDone(t)) {
        return `${dataBanner}<div class="empty">请先完成「财务传导」步骤</div>
          <div class="step-footer"><button type="button" class="btn btn-default" onclick="CRST_APP.setStressJobStep(1)">返回财务传导</button></div>`;
      }
      if (!t.creditFetched) fetchCredit(entityId, { silent: true });
      if (!t.eclFetched) fetchEcl(entityId, { silent: true });
      const pdDone = t.creditFetched && t.eclFetched;
      const pdLgdState = pdDone ? {
        sources: [],
        job: t,
        data: buildPdLgdDisplayData(t, ''),
        displayYears: buildPdLgdDisplayData(t, '').years || getFinTransYearSpan(t, finTransPrimaryScenarioCode(t)),
      } : null;
      return `
        ${dataBanner}
        <h3 class="step-panel-title">PD/LGD 计算</h3>
        ${pdDone
    ? renderPdLgdAnalysisContent(t, pdLgdState, {
      showFilterBar: false,
      industryMultTableId: `pd-lgd-step-mult-${entityId}`,
      noFinTableId: `pd-lgd-step-nofin-${entityId}`,
      eclCustomerTableId: `pd-lgd-step-ecl-${entityId}`,
      industryEclTableId: `pd-lgd-step-ind-ecl-${entityId}`,
      yearlyTableId: `pd-lgd-step-yearly-${entityId}`,
    })
    : `<p class="stress-step-hint">基于逐户压测结果计算行业 PD/LGD 乘数，补录无财报客户 PD/LGD，并按 ECL = PD × LGD × EAD 计量后汇总至行业。</p>
          <div class="empty" style="padding:24px 0">请先执行 PD/LGD 计算，生成信贷台账与 ECL 计量结果。</div>`}
        ${canEditStressSection(t, 2) ? `<div class="toolbar step-panel-actions" style="margin-top:12px">
          <button class="btn btn-primary" onclick="CRST_APP.runPdLgdCalc(${entityId})">${pdDone ? '重新执行 PD/LGD 计算' : '执行 PD/LGD 计算'}</button>
        </div>` : ''}
        ${pdDone ? `<div class="step-footer">
          <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.setStressJobStep(3)">下一步：不良和拨备计算</button>
        </div>` : ''}`;
    }

    if (step === 3) {
      if (!t.creditFetched || !t.eclFetched) {
        return `${dataBanner}<div class="empty">请先完成「PD/LGD 计算」步骤</div>
          <div class="step-footer"><button type="button" class="btn btn-default" onclick="CRST_APP.setStressJobStep(2)">返回 PD/LGD 计算</button></div>`;
      }
      const runBtnLabel = t.status === 'COMPLETED' ? '重新执行不良与拨备计算' : '执行不良与拨备计算';
      const previewRows = getNplProvPreviewRows(t, results);
      const { previewSummary } = renderNplProvPreviewTable(t, previewRows, `npl-prov-detail-${entityId}`);
      const summaryResults = results?.length ? results : buildNplProvResultsFromPreview(t, previewRows);
      const summaryScenarios = (t.selectedScenarioCodes?.length ? t.selectedScenarioCodes : ['BASELINE'])
        .filter((code) => summaryResults.some((r) => r.scenarioCode === code) || previewRows.some((r) => r.scenarioCode === code));
      const summaryTables = summaryScenarios.length
        ? summaryScenarios.map((code) => {
          const scenarioRes = summaryResults.filter((r) => r.scenarioCode === code);
          return renderStressSummaryRegulatoryTable(code, scenarioRes.length ? scenarioRes : summaryResults, {
            job: t,
            showExport: t.status === 'COMPLETED',
            exportHandler: `CRST_APP.exportNplProvSummaryTable('${code}')`,
          });
        }).join('')
        : '';
      return `
        ${dataBanner}
        <h3 class="step-panel-title">不良和拨备计算</h3>
        <p class="stress-step-hint">依据财务传导后的资产负债率识别违约客户并计入不良；按人民银行《压力测试结果汇总表》模板，分行业汇总不良贷款余额与当年新提取的贷款损失准备。</p>
        ${canEditStressSection(t, 3) ? `<div class="toolbar step-panel-actions" style="margin-top:12px">
          ${stressEditOnly ? '<button class="btn btn-default" onclick="CRST_APP.cancelEditTask()">取消编辑</button>' : ''}
          <button class="btn btn-primary" onclick="CRST_APP.runStress(${entityId})">${runBtnLabel}</button>
        </div>` : ''}
        ${previewSummary}
        <section class="result-section" style="margin-top:16px">
          <div class="result-section-hd"><h4 class="result-section-title">压力测试结果汇总表</h4></div>
          ${summaryTables || '<div class="empty" style="padding:16px 0">尚未生成不良/拨备结果，请执行本步计算。</div>'}
        </section>
        ${t.status === 'COMPLETED' && !stressEditOnly ? `<div class="step-footer">
          <button type="button" class="btn btn-primary" onclick="CRST_APP.viewStressResults(${entityId})">查看压测结果分析</button>
          ${isStressJobEntity(t) ? `<button type="button" class="btn btn-default" onclick="CRST_APP.editStressJob(${entityId})">编辑并重新压测</button>` : ''}
        </div>` : ''}`;
    }

    return '<div class="empty">未知步骤</div>';
  }

  /* —— 任务详情（完整流程） —— */
  function renderTaskDetail() {
    if (taskDraftMode && isDataProcessModule()) return renderTaskCreatePage();

    const stressJobId = moduleContext?.stressJobId || (currentStressJobId && !stressJobListMode ? currentStressJobId : null);
    const t = stressJobId ? getStressJob(stressJobId) : getTask(currentTaskId);
    if (!t) return '<div class="card empty">任务不存在</div>';

    const entityId = t.id;
    const isJob = isStressJobEntity(t);
    const activeStep = isJob
      ? stressJobDetailStep
      : (isDataProcessModule() ? mapDataProcessTabToDetailStep(dataProcessTab) : detailStep);

    const recs = entityRecords(entityId, t);
    const syncStatusCounts = countSyncStatus(recs);
    const usable = syncStatusCounts.usable;
    const needAvg = syncStatusCounts.needAvg;
    const abnormal = syncStatusCounts.abnormal;
    const avgs = isJob ? [] : (avgByTask[entityId] || []);
    const results = entityResults(entityId, t);
    const stressEditOnly = taskEditMode && (isJob ? t.status === 'COMPLETED' : isStressOnlyEditTask(t));
    const completedTaskView = isCompletedTaskViewMode(t);
    const resultTools = showTaskResultTools(t);
    const readonly = t.status === 'ARCHIVED' || (taskViewMode && !completedTaskView)
      || (!isJob && ['COMPLETED'].includes(t.status) && !taskEditMode && !completedTaskView && activeStep < 4)
      || (isJob && ['COMPLETED'].includes(t.status) && !taskEditMode && !completedTaskView)
      || (stressEditOnly && (isJob ? ![1, 2, 3].includes(activeStep) : activeStep !== 3 && activeStep !== 4 && activeStep !== 5));
    const stressEditHint = '';
    const stressEditActiveHint = '';

    let panel = '';
    if (isJob) {
      panel = renderStressJobStepPanel(t, activeStep, {
        entityId, recs, results, readonly, stressEditOnly, completedTaskView, resultTools,
      });
    } else if (activeStep === 0) {
      if (taskEditMode && canEditTask(t)) {
        const nameOnly = hasTaskFinancialDataSynced(t);
        panel = `
          <h3 class="step-panel-title">编辑任务 — 基本信息</h3>
          ${nameOnly ? '<p class="flow-hint" style="margin-bottom:12px">已同步财务数据，仅可修改任务名称</p>' : ''}
          ${renderTaskFormFields(t, { readonly: false, nameOnly })}
          ${renderTaskFormActions('CRST_APP.cancelEditTask()', '保存修改')}`;
      } else {
        panel = `
          <h3 class="step-panel-title">${taskViewMode ? '查看任务 — 基本信息' : '任务概览'}</h3>
          ${renderTaskFormFields(t, { readonly: true })}`;
      }
    } else if (activeStep === 1) {
      panel = `${stressEditHint}<h3 class="step-panel-title">${isDataProcessModule() ? '财务数据处理' : '数据同步与确认'}</h3>`;
      const viewOnly = taskViewMode && !taskEditMode;
      const syncDisabled = !['DRAFT', 'SYNCING', 'PENDING_DISAMBIG', 'PROCESSING'].includes(t.status) || readonly || viewOnly;
      const pendingDisambig = t.status === 'PENDING_DISAMBIG' && !readonly && !viewOnly;
      const dataProcessing = ['PROCESSING', 'COMPLETED'].includes(t.status);
      const pendingDisambigCount = getPendingDisambigRecords(recs).length;
      const syncStats = countSyncStatus(recs);
      const allUsable = allDataProcessRecordsUsable(recs);

      ensureTaskRecordsEnriched(entityId, t);
      const { basicYear, financialYear } = getTaskDataYears(t);
      const syncStatusFilter = syncListFilters[t.id] || '';
      const filteredRecs = taskViewMode ? recs : filterSyncRecords(recs, t.id);
      const statusFilterOpts = [
        { value: '', label: '全部' },
        { value: 'USABLE', label: '可使用' },
        { value: 'NEED_AVG', label: '需计算' },
        { value: 'ABNORMAL', label: '无法处理' },
        { value: 'EXCLUDED', label: '已排除' },
        { value: 'EXCLUDED_NO_REPORT', label: '已排除逐户判定' },
      ].map((o) => `<option value="${o.value}" ${syncStatusFilter === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
      const showSyncOpCol = (dataProcessing || pendingDisambig || t.status === 'SYNCING') && !taskViewMode && syncStats.abnormal > 0;
      const showInternalSummaryCol = t.sceneType === 'INTERNAL' && !taskViewMode && !dataProcessing;
      const rowClass = (r) => {
        if (r.dataAvailability === 'EXCLUDED_NO_REPORT') return 'row-danger';
        if (r.excluded || r.dataAvailability === 'EXCLUDED') return 'row-muted';
        if (r.ambiguityCode && !r.ambiguityConfirmed) return 'row-warning';
        return '';
      };
      const airportRecs = recs.filter(isAirportEnterprise);
      const airportFetchedCount = airportRecs.filter((r) => r.throughputFetched).length;
      const airportMissingCount = airportRecs.length - airportFetchedCount;
      const airportHint = airportMissingCount > 0
        ? `（含 ${airportMissingCount} 条机场企业旅客吞吐量未调取，请先在「机场吞吐量维护」补录后重新同步）` : '';
      const dataQualityHint = recs.length && !allUsable && !pendingDisambig
        ? `尚有无法使用数据${syncStats.abnormal ? `（无法处理 <strong>${syncStats.abnormal}</strong> 条）` : ''}${syncStats.needAvg ? `（需计算 <strong>${syncStats.needAvg}</strong> 条）` : ''}${airportHint}，请在列表中删除无法处理记录或通过客户基础信息表工具栏导入补录。`
        : '';
      const customerBasicSection = renderCustomerBasicInfoSection(t, recs.length ? filteredRecs : [], {
        showOpCol: showSyncOpCol,
        showInternalCol: showInternalSummaryCol,
        regulatoryView: t.status === 'COMPLETED' || t.status === 'ARCHIVED',
        rowClass,
        showToolbar: recs.length > 0,
        emptyText: t.loanDataSynced ? (t.gelanDataSynced ? '请先同步财务数据' : '请先同步格澜数据') : '请先同步贷款数据',
        pendingDisambigCount: pendingDisambig ? pendingDisambigCount : (viewOnly ? getPendingDisambigRecords(recs).length : 0),
        dataQualityHint,
        viewOnly,
      });
      const totalCount = t.syncStats?.total ?? recs.length;
      const airportSummary = airportRecs.length
        ? `；机场企业 ${airportRecs.length} 条（吞吐量已调取 ${airportFetchedCount} 条）` : '';
      const syncSummaryText = `同步条数：${totalCount}条；可使用：${syncStats.usable}条；需计算：${syncStats.needAvg}条；无法处理：${syncStats.abnormal}条；已排除：${syncStats.excluded}条${airportSummary}`;

      let stepFooter = '';
      if (!taskViewMode && t.status === 'COMPLETED' && t.bankBasicInfo) {
        stepFooter = `
          <div class="step-footer step-footer-hint">
            <span class="step-footer-msg">数据处理已完成，已生成客户基础信息与参试银行基础信息表。可在压测方法模块引用本任务数据。</span>
          </div>`;
      }

      panel += `
        <p class="sync-summary-text">${syncSummaryText}</p>
        <div class="toolbar step-toolbar-top">
          <button type="button" class="btn btn-primary" ${syncDisabled || t.loanDataSynced ? 'disabled' : ''} onclick="CRST_APP.syncLoanData(${t.id})">同步贷款数据</button>
          <button type="button" class="btn btn-primary" ${syncDisabled || !t.loanDataSynced || t.gelanDataSynced ? 'disabled' : ''} onclick="CRST_APP.syncGelanData(${t.id})">同步格澜数据</button>
          <button type="button" class="btn btn-primary" ${syncDisabled || !t.loanDataSynced || !t.gelanDataSynced || hasTaskFinancialDataSynced(t) ? 'disabled' : ''} onclick="CRST_APP.syncFinancial(${t.id})">同步财务数据</button>
          <button type="button" class="btn btn-primary" ${syncDisabled || !hasTaskFinancialDataSynced(t) || !getInternalPdEligibleRecords(t.id, t).length || t.internalPdDataSynced ? 'disabled' : ''} onclick="CRST_APP.syncInternalPdData(${t.id})">同步内部PD数据</button>
        </div>
        <div class="sync-list-filter">
          <label class="sync-list-filter-label" for="sync_status_${t.id}">状态</label>
          <select class="select sync-status-select" id="sync_status_${t.id}" ${viewOnly ? 'disabled' : ''} onchange="CRST_APP.setSyncStatusFilter(${t.id}, this.value)">${statusFilterOpts}</select>
        </div>
        ${customerBasicSection}
        ${renderInternalPdSection(t, recs)}
        ${renderBankBasicInfoTable(t)}
        ${renderBankCapitalMetricsSection(t)}
        ${stepFooter}`;
    } else if (activeStep === 2) {
      const processRow = (a) => `<tr>
        <td>${esc(a.industry)}</td><td>${a.sampleCount}</td><td>${a.avgRevenue?.toLocaleString()}</td>
        <td>${a.avgEbitda?.toLocaleString()}</td><td>${esc(a.calcBasis || '已确认可使用样本')}</td><td>${esc(a.calcTime || '-')}</td><td>${avgFillStatusTag(a.status === 'CONFIRMED')}</td>
      </tr>`;
      panel = `
        ${stressEditHint}
        <h3 class="step-panel-title">数据处理</h3>
        ${renderTable(avgs, '<tr><th>标准行业</th><th>样本数</th><th>均值-收入</th><th>均值-EBITDA</th><th>计算依据</th><th>计算时间</th><th>状态</th></tr>', processRow, 7)}`;
    } else if (activeStep === 3) {
      const readyForStress = isJob ? t.status === 'READY' : t.status === 'READY_STRESS';
      const stressDisabled = !canEditStressSection(t, 3);
      const { checks, commonParamHtml, scenarioCardHtml, stressEditable } = buildStressScenarioSection(t, entityId, readonly, 3);
      const dataBanner = isJob ? `
        <div class="desc-grid stress-data-banner" style="margin-bottom:16px">
          <div class="desc-item"><span class="k">数据来源</span><span>${stressDataSourceTag(t.dataSource)} ${t.dataSource === 'REF' ? esc(t.sourceTaskName || '-') : 'Excel 导入'}</span></div>
          <div class="desc-item"><span class="k">数据条数</span><span>${t.recordCount?.toLocaleString()} 条（可用 ${t.usableCount?.toLocaleString()}）</span></div>
          <div class="desc-item"><span class="k">基准年度</span><span>${t.reportYear || '-'}</span></div>
          <div class="desc-item"><span class="k">贷款类型</span><span>${t.loanType === 'CORPORATE' ? '对公' : t.loanType === 'PERSONAL' ? '个人' : '-'}</span></div>
        </div>` : '';
      if (!stressEditOnly && !isJob && readyForStress) {
        if (!t.creditFetched) fetchCredit(entityId, { silent: true });
        if (!t.eclFetched) fetchEcl(entityId, { silent: true });
      }
      const showCreditEclSection = !stressEditOnly && !isJob;
      const creditRows = entityCredits(entityId, t);
      const eclRows = entityEcls(entityId, t);
      const creditRow = (c) => `<tr>
        <td>${esc(c.customerId || '-')}</td><td>${esc(c.loanAccountNo || '-')}</td><td>${esc(c.contractNo || '-')}</td>
        <td>${c.loanBalance?.toLocaleString()}</td><td>${esc(c.productType || '-')}</td><td>${esc(c.currency || '-')}</td>
        <td>${esc(c.startDate || '-')}</td><td>${esc(c.maturityDate || '-')}</td><td>${esc(c.remainingTenor || '-')}</td>
        <td>${esc(c.rating)}</td><td>${esc(c.classification)}</td><td>${esc(c.guaranteeType)}</td><td>${esc(c.branchCode || '-')}</td></tr>`;
      const eclRow = (e) => `<tr>
        <td>${esc(e.customerId || '-')}</td><td>${esc(e.loanAccountNo || '-')}</td>
        <td>${e.pd}</td><td>${e.lgd}</td><td>${e.ead?.toLocaleString()}</td><td>${esc(e.stage)}</td>
        <td>${e.eclAmount?.toLocaleString()}</td><td>${esc(e.modelVersion || '-')}</td><td>${esc(e.measurementDate || '-')}</td></tr>`;
      const runBtnLabel = t.status === 'COMPLETED' ? '重新执行压测' : '执行压测';
      const refDataSection = isJob && t.dataSource === 'REF' && t.sourceTaskId
        ? renderReferencedDataProcessTables(t, recs)
        : '';
      panel = `
        ${refDataSection}
        ${dataBanner}
        ${stressEditOnly ? stressEditActiveHint : ''}
        ${showCreditEclSection ? `${renderTable(creditRows, '<tr><th>客户号</th><th>借据号</th><th>合同号</th><th>贷款余额(万)</th><th>产品类型</th><th>币种</th><th>起息日</th><th>到期日</th><th>剩余期限(月)</th><th>评级</th><th>五级分类</th><th>担保方式</th><th>分行代码</th></tr>', creditRow, 13)}
        <div style="margin-top:16px">
        ${renderTable(eclRows, '<tr><th>客户号</th><th>借据号</th><th>PD</th><th>LGD</th><th>EAD</th><th>减值阶段</th><th>ECL金额</th><th>模型版本</th><th>计量日期</th></tr>', eclRow, 9)}
        </div>` : ''}
        <h3 class="step-panel-title step-panel-title-divider">场景压测</h3>
        <div class="checkbox-group scenario-checkbox-group">${checks || '<span class="scenario-check-empty">无已生效压测情景，请联系管理员配置。</span>'}</div>
        ${commonParamHtml || ''}
        ${scenarioCardHtml || ''}
        ${stressEditable ? `<div class="toolbar step-panel-actions" style="margin-top:12px">
          ${stressEditOnly ? '<button class="btn btn-default" onclick="CRST_APP.cancelEditTask()">取消编辑</button>' : ''}
          <button class="btn btn-primary" ${stressDisabled ? 'disabled' : ''} onclick="CRST_APP.runStress(${entityId})">${runBtnLabel}</button>
        </div>` : ''}
        ${renderPdAdjustPanel(entityId, t, results)}
        ${t.status === 'COMPLETED' && !stressEditOnly ? `<div class="step-footer">
          <button type="button" class="btn btn-default" onclick="CRST_APP.viewStressResults(${entityId})">查看压测结果</button>
          ${isJob ? `<button type="button" class="btn btn-default" onclick="CRST_APP.editStressJob(${entityId})">编辑并重新压测</button>` : ''}
        </div>` : ''}`;
    } else if (activeStep === 4) {
      const filter = getTaskResultFilter(t.id);
      const scenarioOpts = [...new Set(results.map((r) => r.scenarioCode).filter(Boolean))]
        .map((code) => ({ code, name: results.find((r) => r.scenarioCode === code)?.scenarioName || code }));
      const yearOpts = [...new Set(results.map((r) => r.testYear).filter(Boolean))].sort((a, b) => a - b);
      const industryOpts = [...new Set(results.map((r) => r.standardIndustry).filter(Boolean))].sort();
      const branchOpts = [...new Set(results.map((r) => r.branchName).filter(Boolean))].sort();
      const filtered = applyTaskResultFilter(results, filter);
      const exportDisabled = t.status !== 'COMPLETED' && t.status !== 'ARCHIVED';
      const filterBar = resultTools ? renderTaskResultFilterBar(t, filter, scenarioOpts, yearOpts, industryOpts, branchOpts) : '';
      const emptyHint = !results.length
        ? '<div class="empty" style="padding:24px 0">暂无压测结果，请先在「场景压测」步骤执行压测。</div>'
        : '';
      const summaryDimCol = filter.summaryDim === 'branch' ? '分行' : '行业';
      const summaryRows = summarizeTaskResults(filtered, filter.summaryDim || 'industry');
      const summaryTable = renderTable(summaryRows,
        `<tr><th>${summaryDimCol}</th><th>样本数</th><th>平均影响率</th><th>碳费用合计(万)</th><th>ECL增量合计(万)</th><th>违约数</th></tr>`,
        (s) => `<tr><td>${esc(s.key)}</td><td>${s.count}</td><td>${s.avgImpactPct.toFixed(2)}%</td><td>${s.sumCarbonCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td>${s.sumEclDelta.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td>${s.defaultCount}</td></tr>`,
        6
      );
      const portfolioRows = summarizePortfolioCredit(filtered, t.id);
      const portfolioTable = renderTable(portfolioRows,
        '<tr><th>维度</th><th>样本数</th><th>碳费用合计(万)</th><th>ECL增量(万)</th><th>拨备增量(万)</th><th>违约数</th></tr>',
        (p) => {
          const carbonSum = filtered.filter((r) => (p.dim === '总行' ? true : r.branchName === p.dim))
            .reduce((s, r) => s + (r.carbonCost || 0), 0);
          return `<tr><td>${esc(p.dim)}</td><td>${p.count}</td><td>${carbonSum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td>${p.eclDelta.toLocaleString()}</td><td>${p.provision.toLocaleString()}</td><td>${p.defaultCount}</td></tr>`;
        },
        6
      );
      const resultRow = (r) => {
        const fin = calcResultFinancials(r);
        return `<tr>
          <td>${esc(r.companyName)}</td><td>${esc(r.branchName)}</td><td>${esc(r.standardIndustry)}</td>
          <td>${esc(r.scenarioName)}</td><td>${esc(r.testYear || '-')}</td>
          <td>${esc(emissionCalcBasisLabel(r, t.id))}</td>
          <td>${r.carbonEmission != null ? r.carbonEmission.toLocaleString() : '-'}</td>
          <td>${r.carbonCost != null ? r.carbonCost.toLocaleString() : '-'}</td>
          <td>${(r.revenueBefore ?? fin.revenue - (r.carbonCost || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td>${(r.revenueAfter ?? fin.revenue - (r.carbonCost || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td>${(r.operatingExpense ?? fin.operatingExpense).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td>${fin.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td>${r.eclBefore?.toLocaleString()}</td><td>${r.eclAfter?.toLocaleString()}</td>
          <td>${(r.impactRate * 100).toFixed(2)}%</td>
          <td>${renderDefaultCell(r)}</td></tr>`;
      };
      panel = `
        ${stressEditHint}
        <h3 class="step-panel-title">压测结果</h3>
        ${filterBar}
        ${emptyHint || `
        <section class="result-section">
          <div class="result-section-hd"><h4 class="result-section-title">组合指标</h4></div>
          ${portfolioTable}
        </section>
        <section class="result-section">
          <div class="result-section-hd">
            <h4 class="result-section-title">汇总结果</h4>
            ${resultTools ? `<div class="result-section-actions">
              <select class="select" onchange="CRST_APP.setTaskResultFilter(${t.id}, 'summaryDim', this.value)">
                <option value="industry" ${filter.summaryDim !== 'branch' ? 'selected' : ''}>按行业汇总</option>
                <option value="branch" ${filter.summaryDim === 'branch' ? 'selected' : ''}>按分行汇总</option>
              </select>
              <button class="btn btn-default" ${exportDisabled ? 'disabled' : ''} onclick="CRST_APP.exportResultsSummary(${t.id})">导出汇总</button>
            </div>` : ''}
          </div>
          ${summaryTable}
        </section>
        <section class="result-section">
          <div class="result-section-hd">
            <h4 class="result-section-title">压测明细</h4>
            ${resultTools ? `<div class="result-section-actions">
              <button class="btn btn-primary" ${exportDisabled ? 'disabled' : ''} onclick="CRST_APP.openExportDetailModal(${t.id})">导出明细</button>
            </div>` : ''}
          </div>
          ${renderPagedTable(`task-${t.id}-result`, filtered,
            '<tr><th>公司</th><th>分行</th><th>行业</th><th>情景</th><th>年份</th><th>测算口径</th><th>碳排放量(吨)</th><th>碳费用(万)</th><th>收入(前)</th><th>收入(后)</th><th>营业支出(后)</th><th>净利润(后)</th><th>ECL(前)</th><th>ECL(后)</th><th>影响率</th><th>违约</th></tr>',
            resultRow, 16)}
        </section>
        ${canUseApplicationReport(t) && !stressEditOnly ? `
        <div class="step-footer">
          <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.setDetailStep(5)">下一步：应用报送</button>
        </div>` : ''}`}`;
    } else if (activeStep === 5) {
      panel = `
        ${stressEditHint}
        <h3 class="step-panel-title">应用报送</h3>
        ${renderApplicationReportBody(t.id)}`;
    }

    if (moduleContext?.embedded) {
      return renderTaskFlowCard(t.status, panel, activeStep);
    }
    const breadcrumbActions = renderTaskBreadcrumbActions(t, t.id, { completedTaskView });
    return `
      <div class="breadcrumb-row">
        <div class="breadcrumb">
          <a onclick="CRST_APP.backToDataProcessList()">数据处理</a> / ${esc(t.taskName)}
        </div>
        ${breadcrumbActions}
      </div>
      ${renderTaskFlowCard(t.status, panel, activeStep)}`;
  }

  /* —— 结果分析 —— */
  const SCENARIO_CHART_COLORS = {
    BASELINE: '#4a7cb8',
    GREENHOUSE_WORLD: '#e67e22',
    ORDERLY_TRANSITION: '#9b59b6',
  };

  const ANALYSIS_PALETTE = [
    '#4a7cb8', '#e67e22', '#9b59b6', '#1abc9c', '#e74c3c', '#f1c40f', '#5d6d7e', '#d35400',
  ];

  function analysisColor(i) {
    return ANALYSIS_PALETTE[i % ANALYSIS_PALETTE.length];
  }

  function scenarioChartColor(code) {
    return SCENARIO_CHART_COLORS[code] || analysisColor(0);
  }

  function sortScenarioCodes(codes) {
    const order = ['BASELINE', 'GREENHOUSE_WORLD', 'ORDERLY_TRANSITION'];
    return [...codes].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  function scenarioDisplayName(code, list) {
    const row = list.find((r) => (r.scenarioCode || r.scenarioName) === code);
    return row?.scenarioName || code;
  }

  function filterAnalysisResults(res, year, scenarioCode) {
    return res.filter((r) => {
      if (year && r.testYear !== year) return false;
      if (scenarioCode && r.scenarioCode !== scenarioCode) return false;
      return true;
    });
  }

  function computeAnalysisKpis(list) {
    const companies = new Set(list.map((r) => r.companyName));
    const n = list.length;
    const avgImpact = n ? list.reduce((s, r) => s + (r.impactRate || 0), 0) / n : 0;
    const eclDelta = list.reduce((s, r) => s + ((r.eclAfter || 0) - (r.eclBefore || 0)), 0);
    const carbonCost = list.reduce((s, r) => s + (r.carbonCost || 0), 0);
    const defaults = list.filter((r) => r.defaultFlag).length;
    return {
      sampleCount: n,
      companyCount: companies.size,
      avgImpactPct: Math.round(avgImpact * 1000) / 10,
      eclDelta: Math.round(eclDelta),
      carbonCost: Math.round(carbonCost),
      defaults,
      defaultRatePct: n ? Math.round((defaults / n) * 1000) / 10 : 0,
    };
  }

  function aggregateAnalysisByDim(list, dim) {
    const keyField = dim === 'branch' ? 'branchName' : 'standardIndustry';
    const map = {};
    list.forEach((r) => {
      const k = r[keyField] || '-';
      if (!map[k]) map[k] = { count: 0, sumImpact: 0, sumCarbon: 0, sumEclDelta: 0, defaults: 0 };
      map[k].count++;
      map[k].sumImpact += r.impactRate || 0;
      map[k].sumCarbon += r.carbonCost || 0;
      map[k].sumEclDelta += (r.eclAfter || 0) - (r.eclBefore || 0);
      if (r.defaultFlag) map[k].defaults++;
    });
    return Object.entries(map).map(([name, v]) => ({
      name,
      count: v.count,
      impactPct: v.count ? Math.round((v.sumImpact / v.count) * 1000) / 10 : 0,
      carbonCost: Math.round(v.sumCarbon),
      eclDelta: Math.round(v.sumEclDelta),
      defaults: v.defaults,
    }));
  }

  function computeTrendByYearScenario(list) {
    const map = {};
    const scenarioSet = new Set();
    list.forEach((r) => {
      if (!r.testYear) return;
      const sc = r.scenarioCode || r.scenarioName || '未知';
      scenarioSet.add(sc);
      if (!map[r.testYear]) map[r.testYear] = {};
      if (!map[r.testYear][sc]) map[r.testYear][sc] = { sum: 0, count: 0 };
      map[r.testYear][sc].sum += r.impactRate || 0;
      map[r.testYear][sc].count++;
    });
    return {
      years: Object.keys(map).map(Number).sort((a, b) => a - b),
      scenarios: sortScenarioCodes([...scenarioSet]),
      map,
    };
  }

  function computeScenarioComparison(list) {
    const map = {};
    list.forEach((r) => {
      const sc = r.scenarioCode || r.scenarioName || '未知';
      if (!map[sc]) map[sc] = { sum: 0, count: 0, name: r.scenarioName || sc };
      map[sc].sum += r.impactRate || 0;
      map[sc].count++;
    });
    return sortScenarioCodes(Object.keys(map)).map((code) => ({
      name: map[code].name,
      code,
      impactPct: map[code].count ? Math.round((map[code].sum / map[code].count) * 1000) / 10 : 0,
    }));
  }

  function renderHBarChart(items, opts) {
    const { valueKey, labelKey, format, colorFn, tone } = opts;
    if (!items.length) return '<div class="empty">暂无数据</div>';
    const max = Math.max(...items.map((i) => i[valueKey]), 0.0001);
    const fmt = format || ((v) => String(v));
    const pickColor = colorFn || ((_, i) => analysisColor(i));
    return `<div class="chart-hbar${tone ? ` chart-hbar--${tone}` : ''}">${items.map((item, i) => {
      const pct = Math.max(4, (item[valueKey] / max) * 100);
      const color = pickColor(item, i);
      return `<div class="hbar-row">
        <span class="hbar-label" title="${esc(item[labelKey])}">${esc(item[labelKey])}</span>
        <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="hbar-val">${fmt(item[valueKey])}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function renderScenarioDonut(items) {
    if (!items.length) return '<div class="empty">暂无数据</div>';
    const total = items.reduce((s, x) => s + x.impactPct, 0) || 1;
    let acc = 0;
    const stops = items.map((item) => {
      const pct = (item.impactPct / total) * 100;
      const start = acc;
      acc += pct;
      return `${scenarioChartColor(item.code)} ${start}% ${acc}%`;
    }).join(', ');
    const legend = items.map((item) => `
      <li><i style="background:${scenarioChartColor(item.code)}"></i>
        <span class="donut-legend-name">${esc(item.name)}</span>
        <span class="donut-legend-val">${item.impactPct}%</span></li>`).join('');
    return `<div class="chart-donut-wrap">
      <div class="chart-donut" style="background:conic-gradient(${stops})"></div>
      <ul class="chart-donut-legend">${legend}</ul>
    </div>`;
  }

  function renderTrendLineChart(trend, list) {
    const { years, scenarios, map } = trend;
    if (!years.length) return '<div class="empty">暂无数据</div>';
    const W = Math.max(520, years.length * 52);
    const H = 220;
    const padL = 48;
    const padR = 20;
    const padT = 18;
    const padB = 36;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    let yMax = 0.0001;
    years.forEach((y) => {
      scenarios.forEach((sc) => {
        const cell = map[y]?.[sc];
        if (cell?.count) yMax = Math.max(yMax, cell.sum / cell.count);
      });
    });
    const xAt = (xi) => (years.length > 1 ? padL + (xi / (years.length - 1)) * plotW : padL + plotW / 2);
    const yAt = (val) => padT + plotH - (val / yMax) * plotH;
    const grid = [0, 0.5, 1].map((t) => {
      const y = yAt(yMax * t);
      const label = `${(yMax * t * 100).toFixed(1)}%`;
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="chart-grid-line"/>
        <text x="${padL - 8}" y="${y + 4}" class="chart-axis-text" text-anchor="end">${label}</text>`;
    }).join('');
    const series = scenarios.map((sc) => {
      const color = scenarioChartColor(sc);
      const pts = years.map((y, xi) => {
        const cell = map[y]?.[sc];
        const val = cell?.count ? cell.sum / cell.count : 0;
        return `${xAt(xi)},${yAt(val)}`;
      }).join(' ');
      const dots = years.map((y, xi) => {
        const cell = map[y]?.[sc];
        const val = cell?.count ? cell.sum / cell.count : 0;
        return `<circle cx="${xAt(xi)}" cy="${yAt(val)}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
      }).join('');
      return `<polyline class="chart-line-path" points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
    }).join('');
    const xLabels = years.map((y, xi) =>
      `<text x="${xAt(xi)}" y="${H - 10}" class="chart-axis-text" text-anchor="middle">${y}</text>`
    ).join('');
    const legend = scenarios.map((sc) =>
      `<span class="chart-legend-item"><i style="background:${scenarioChartColor(sc)}"></i>${esc(scenarioDisplayName(sc, list))}</span>`
    ).join('');
    return `<div class="chart-legend">${legend}</div>
      <div class="chart-line-wrap"><svg viewBox="0 0 ${W} ${H}" class="chart-line-svg" preserveAspectRatio="xMidYMid meet">${grid}${series}${xLabels}</svg></div>`;
  }

  function computeYearScenarioDetail(list) {
    const map = {};
    list.forEach((r) => {
      if (!r.testYear) return;
      const sc = r.scenarioCode || r.scenarioName || '未知';
      const key = `${r.testYear}|${sc}`;
      if (!map[key]) {
        map[key] = {
          year: r.testYear,
          scenarioCode: sc,
          scenarioName: r.scenarioName || sc,
          count: 0,
          sumImpact: 0,
          sumCarbon: 0,
          sumEclDelta: 0,
          defaults: 0,
        };
      }
      const cell = map[key];
      cell.count++;
      cell.sumImpact += r.impactRate || 0;
      cell.sumCarbon += r.carbonCost || 0;
      cell.sumEclDelta += (r.eclAfter || 0) - (r.eclBefore || 0);
      if (r.defaultFlag) cell.defaults++;
    });
    return Object.values(map).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return sortScenarioCodes([a.scenarioCode, b.scenarioCode]).indexOf(a.scenarioCode)
        - sortScenarioCodes([a.scenarioCode, b.scenarioCode]).indexOf(b.scenarioCode);
    });
  }

  function renderYearScenarioPivotTable(trend, list) {
    const { years, scenarios, map } = trend;
    if (!years.length) return '<div class="empty">暂无逐年结果</div>';
    const thead = `<tr><th>情景</th>${years.map((y) => `<th>${y}年</th>`).join('')}</tr>`;
    const tbody = scenarios.map((sc) => {
      const cells = years.map((y) => {
        const cell = map[y]?.[sc];
        const pct = cell?.count ? Math.round((cell.sum / cell.count) * 1000) / 10 : null;
        return `<td>${pct != null ? `${pct}%` : '-'}</td>`;
      }).join('');
      return `<tr><td>${esc(scenarioDisplayName(sc, list))}</td>${cells}</tr>`;
    }).join('');
    return `<div class="table-wrap year-scenario-table"><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
  }

  function renderYearScenarioDetailTable(list) {
    const rows = computeYearScenarioDetail(list);
    if (!rows.length) return '<div class="empty">暂无逐年结果</div>';
    return renderPagedTable('results-year-detail', rows,
      '<tr><th>年份</th><th>情景</th><th>样本数</th><th>平均影响率</th><th>碳费用合计(万)</th><th>ECL增量合计(万)</th><th>违约数</th></tr>',
      (r) => `<tr>
        <td>${r.year}</td>
        <td>${esc(r.scenarioName)}</td>
        <td>${r.count}</td>
        <td>${r.count ? (Math.round((r.sumImpact / r.count) * 1000) / 10) : 0}%</td>
        <td>${Math.round(r.sumCarbon).toLocaleString()}</td>
        <td>${Math.round(r.sumEclDelta).toLocaleString()}</td>
        <td>${r.defaults}</td>
      </tr>`,
      7);
  }

  function renderMetricCompareBars(items, metrics) {
    if (!items.length) return '<div class="empty">暂无数据</div>';
    const slice = items.slice(0, 6);
    const max = {};
    metrics.forEach((m) => {
      max[m.key] = Math.max(...slice.map((i) => i[m.key]), 0.0001);
    });
    const formatTip = (m, raw) => {
      if (m.key === 'impactPct') return `${m.label}：${raw}%`;
      return `${m.label}：${Number(raw).toLocaleString()} 万`;
    };
    const legend = metrics.map((m) =>
      `<span class="chart-legend-item"><i style="background:${m.color}"></i>${esc(m.label)}</span>`
    ).join('');
    const cols = slice.map((item) => {
      const bars = metrics.map((m) => {
        const raw = item[m.key];
        const h = Math.max(4, (raw / max[m.key]) * 130);
        return `<div class="bar bar-mini" style="height:${h}px;background:${m.color}" title="${esc(formatTip(m, raw))}"></div>`;
      }).join('');
      return `<div class="bar-group-wrap">
        <div class="bar-group">${bars}</div>
        <div class="bar-label">${esc(item.name)}</div>
      </div>`;
    }).join('');
    return `<div class="chart-legend">${legend}</div>
      <div class="chart-bar chart-bar-grouped chart-metric-vbar">${cols}</div>`;
  }

  function topByMetric(dimRows, metricKey, n) {
    return [...dimRows].sort((a, b) => b[metricKey] - a[metricKey]).slice(0, n);
  }

  /**
   * 构建结果分析可选来源列表，合并 已完成数据处理任务 和 已完成压测方法独立任务
   * 返回 [{ key: 'task-123'|'job-456', label, isJob, id, taskId? }]
   */
  function buildResultSources() {
    const sources = [];
    tasks
      .filter((t) => ['COMPLETED', 'ARCHIVED'].includes(t.status) && (resultsByTask[t.id] || []).length)
      .forEach((t) => sources.push({ key: `task-${t.id}`, label: t.taskName, isJob: false, id: t.id }));
    stressJobs
      .filter((j) => j.status === 'COMPLETED' && (stressResultsByJob[j.id] || []).length)
      .forEach((j) => {
        const scenarioText = (j.selectedScenarioCodes || []).map((c) => scenarioLabel(c)).join('、') || '多情景';
        sources.push({
          key: `job-${j.id}`,
          label: `[${scenarioText}] ${j.jobName}`,
          isJob: true,
          id: j.id,
          sourceTaskId: j.sourceTaskId,
        });
      });
    return sources;
  }

  function resolveResultSource() {
    const sources = buildResultSources();
    const curKey = window._resultSourceKey;
    const found = sources.find((s) => s.key === curKey);
    const src = found || sources[0];
    if (!src) return { sources, src: null, res: [], taskId: null };
    const res = src.isJob
      ? (stressResultsByJob[src.id] || [])
      : (resultsByTask[src.id] || []);
    const taskId = src.isJob ? src.sourceTaskId : src.id;
    return { sources, src, res, taskId };
  }

  function resolveResultScenarioCode(src, res) {
    if (src?.isJob) {
      const job = getStressJob(src.id);
      return job?.selectedScenarioCodes?.[0] || res[0]?.scenarioCode || 'BASELINE';
    }
    const filter = window._resultScenarioCode;
    if (filter) return filter;
    const codes = [...new Set(res.map((r) => r.scenarioCode).filter(Boolean))];
    if (codes.length === 1) return codes[0];
    return 'BASELINE';
  }

  function summaryYearColumns(tpl) {
    const cols = [tpl.baseYear];
    for (let y = tpl.yearFrom; y <= tpl.yearTo; y++) cols.push(y);
    return cols;
  }

  function getSummaryJobContext(job) {
    if (!job) return null;
    const recs = stressRecordsByJob[job.id] || entityRecords(job.id, job);
    const credits = stressCreditByJob[job.id] || entityCredits(job.id, job);
    const ecls = stressEclByJob[job.id] || entityEcls(job.id, job);
    return {
      job,
      capital: getJobBankBasicCapital(job),
      recMap: Object.fromEntries(recs.map((r) => [r.companyName, r])),
      creditMap: Object.fromEntries(credits.map((c) => [c.companyName, c])),
      eclMap: Object.fromEntries(ecls.map((e) => [e.companyName, e])),
    };
  }

  function enrichSummaryResults(results, ctx) {
    if (!ctx) return results;
    return results.map((r) => {
      const rec = ctx.recMap[r.companyName] || {};
      return {
        ...r,
        loanAmount: r.loanAmount ?? ctx.creditMap[r.companyName]?.loanBalance ?? rec.loanBalance ?? 0,
        gbIndustryCode: r.gbIndustryCode ?? rec.gbIndustryCode,
        standardIndustry: r.standardIndustry ?? rec.standardIndustry,
      };
    });
  }

  function buildCompanyDefaultIndex(results, scenarioCode, ctx) {
    const enriched = enrichSummaryResults(results, ctx);
    const byCompany = new Map();
    enriched.filter((r) => r.scenarioCode === scenarioCode).forEach((r) => {
      if (!r.defaultFlag) return;
      const prev = byCompany.get(r.companyName);
      if (!prev || (r.testYear || 9999) < (prev.firstYear || 9999)) {
        const rec = ctx?.recMap?.[r.companyName] || { standardIndustry: r.standardIndustry, gbIndustryCode: r.gbIndustryCode };
        byCompany.set(r.companyName, {
          firstYear: r.testYear,
          loanAmount: r.loanAmount || 0,
          record: rec,
          ccusEligible: isCcusEligibleRecord(rec),
        });
      }
    });
    return byCompany;
  }

  function buildNplProvResultsFromPreview(job, previewRows) {
    return (previewRows || []).map((r) => ({
      companyName: r.companyName,
      branchName: r.branchName,
      standardIndustry: r.standardIndustry,
      gbIndustryCode: r.gbIndustryCode,
      scenarioCode: r.scenarioCode,
      testYear: r.testYear,
      defaultFlag: true,
      loanAmount: r.loanAmount || 0,
    }));
  }

  function aggregateSummaryMetricRows(results, tpl, year, rowSpec, metricKey, ctx) {
    if (!results?.length) return null;
    const defaultIndex = buildCompanyDefaultIndex(results, tpl.scenarioCode, ctx);
    const matched = [...defaultIndex.values()].filter((info) => matchPbocSummaryRow(info.record, rowSpec, ctx?.job));
    if (!matched.length) return null;
    if (year === tpl.baseYear) return null;
    let sum = 0;
    matched.forEach((info) => {
      const { firstYear, loanAmount, ccusEligible } = info;
      if (firstYear == null || year < firstYear || !loanAmount) return;
      switch (metricKey) {
        case 'npl':
        case 'npl_no_ccus':
          sum += loanAmount;
          break;
        case 'npl_ccus':
          sum += ccusEligible ? Math.round(loanAmount * 0.88) : loanAmount;
          break;
        case 'provision':
          if (year === firstYear) sum += calcNplProvisionAmount(loanAmount, ctx?.capital);
          break;
        case 'provision_ccus':
          if (year === firstYear) {
            const base = ccusEligible ? Math.round(loanAmount * 0.88) : loanAmount;
            sum += calcNplProvisionAmount(base, ctx?.capital);
          }
          break;
        default:
          break;
      }
    });
    return sum > 0 ? sum : null;
  }

  function formatSummaryCell(val, isPct) {
    if (val == null || val === '') return '-';
    if (isPct) return `${(Math.round(val * 1000) / 10).toFixed(1)}%`;
    return Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function computeSummaryPortfolioMetric(results, tpl, year, key, ctx) {
    if (year === tpl.baseYear && !['core_t1_capital', 't1_capital', 'total_capital', 'rwa', 'rwa_stress'].includes(key)) {
      return null;
    }
    const defaultIndex = buildCompanyDefaultIndex(results, tpl.scenarioCode, ctx);
    const allDefaults = [...defaultIndex.values()];
    const totalLoan = enrichSummaryResults(results, ctx)
      .filter((r) => r.scenarioCode === tpl.scenarioCode && r.testYear === year)
      .reduce((s, r) => s + (r.loanAmount || r.revenueBefore || 0), 0);
    const nplNo = allDefaults
      .filter((info) => year >= (info.firstYear || 9999))
      .reduce((s, info) => s + (info.loanAmount || 0), 0);
    const nplPartial = allDefaults
      .filter((info) => year >= (info.firstYear || 9999))
      .reduce((s, info) => s + (info.ccusEligible ? Math.round((info.loanAmount || 0) * 0.88) : (info.loanAmount || 0)), 0);
    const provNo = allDefaults
      .filter((info) => info.firstYear === year)
      .reduce((s, info) => s + calcNplProvisionAmount(info.loanAmount, ctx?.capital), 0);
    const provPartial = allDefaults
      .filter((info) => info.firstYear === year)
      .reduce((s, info) => {
        const base = info.ccusEligible ? Math.round((info.loanAmount || 0) * 0.88) : (info.loanAmount || 0);
        return s + calcNplProvisionAmount(base, ctx?.capital);
      }, 0);
    const corpLgd = Object.values(ctx?.eclMap || {}).filter((e) => ctx?.job?.loanType !== 'PERSONAL');
    const personalLgd = Object.values(ctx?.eclMap || {}).filter(() => ctx?.job?.loanType === 'PERSONAL');
    const avgLgd = (rows) => {
      if (!rows.length) return null;
      return rows.reduce((s, e) => s + (e.lgd || 0), 0) / rows.length;
    };
    const capital = ctx?.capital || getJobBankBasicCapital(ctx?.job);
    const eclDelta = enrichSummaryResults(results, ctx)
      .filter((r) => r.scenarioCode === tpl.scenarioCode && r.testYear === year)
      .reduce((s, r) => s + Math.max(0, (r.eclAfter || 0) - (r.eclBefore || 0)), 0);
    const yearIdx = year >= tpl.baseYear + 1 ? (year - (tpl.baseYear + 1)) : 0;
    const carBase = 12.8 - eclDelta / 500000;
    const map = {
      total_npl_no_ccus: nplNo,
      total_npl_partial_ccus: nplPartial,
      total_prov_no_ccus: provNo,
      total_prov_partial_ccus: provPartial,
      wavg_lgd_corp: avgLgd(corpLgd),
      wavg_lgd_personal: avgLgd(personalLgd),
      core_t1_capital: capital.coreTier1Capital ?? Math.round(8200000 - eclDelta * 0.6),
      core_t1_ratio: Math.max(8.5, carBase - 0.4),
      t1_capital: capital.tier1Capital ?? Math.round(9100000 - eclDelta * 0.55),
      t1_ratio: Math.max(9.5, carBase - 0.2),
      total_capital: capital.totalCapital ?? Math.round(10500000 - eclDelta * 0.5),
      car: Math.max(10.5, carBase),
      rwa: capital.rwaTotal ?? Math.round(68000000 + eclDelta * 0.3),
      rwa_stress: Math.round((capital.rwaTotal ?? 68000000) + eclDelta * 0.25),
    };
    if (key === 'npl_ratio_ccus') return totalLoan > 0 ? nplPartial / totalLoan : 0;
    if (key === 'provision_coverage') return nplPartial > 0 ? provPartial / nplPartial : 0;
    return map[key] ?? null;
  }

  function renderStressSummaryRegulatoryTable(scenarioCode, results, opts = {}) {
    const job = opts.job || null;
    const tpl = getStressSummaryTemplate(scenarioCode, job);
    const ctx = getSummaryJobContext(job);
    const years = summaryYearColumns(tpl);
    const flatRows = [];
    tpl.industryGroups.forEach((group) => {
      let rowCount = 0;
      group.rows.forEach((row) => { rowCount += row.metrics.length; });
      let majorEmitted = false;
      group.rows.forEach((row) => {
        row.metrics.forEach((metricKey) => {
          flatRows.push({
            major: group.major,
            majorRowspan: !majorEmitted ? rowCount : 0,
            sub: row.sub,
            subRowspan: row.metrics.length,
            metric: SUMMARY_METRIC_LABELS[metricKey],
            metricKey,
            rowSpec: row,
            isFirstMetricInSub: row.metrics[0] === metricKey,
          });
          majorEmitted = true;
        });
      });
    });
    const yearHeaders = years.map((y) => `<th>${y === tpl.baseYear ? `${y}年<br>（基准）` : `${y}年`}</th>`).join('');
    const bodyRows = flatRows.map((row) => {
      const cells = years.map((y) => {
        const val = aggregateSummaryMetricRows(results, tpl, y, row.rowSpec, row.metricKey, ctx);
        return `<td class="num">${formatSummaryCell(val)}</td>`;
      }).join('');
      const majorCell = row.majorRowspan
        ? `<td rowspan="${row.majorRowspan}" class="summary-major">${esc(row.major).replace(/\n/g, '<br>')}</td>`
        : '';
      const subCell = row.isFirstMetricInSub
        ? `<td rowspan="${row.subRowspan}" class="summary-sub">${row.sub ? esc(row.sub).replace(/\n/g, '<br>') : ''}</td>`
        : '';
      return `<tr>${majorCell}${subCell}<td class="summary-metric">${esc(row.metric)}</td>${cells}</tr>`;
    }).join('');
    const greenRows = (tpl.greenSummary || []).map((item) => {
      const cells = years.map((y) => `<td class="num">${formatSummaryCell(computeSummaryPortfolioMetric(results, tpl, y, item.key, ctx), item.isPct)}</td>`).join('');
      return `<tr class="summary-row-green"><td colspan="2"></td><td class="summary-metric">${esc(item.label)}</td>${cells}</tr>`;
    }).join('');
    const overallRows = (tpl.overallSummary || []).map((item, idx) => {
      const cells = years.map((y) => `<td class="num">${formatSummaryCell(computeSummaryPortfolioMetric(results, tpl, y, item.key, ctx), item.isPct)}</td>`).join('');
      const majorCell = idx === 0
        ? `<td rowspan="${tpl.overallSummary.length}" class="summary-major">整体情况</td>`
        : '';
      return `<tr class="summary-row-orange">${majorCell}<td></td><td class="summary-metric">${esc(item.label)}</td>${cells}</tr>`;
    }).join('');
    const exportHandler = opts.exportHandler || 'CRST_APP.exportStressSummaryTable()';
    return `
      <div class="stress-summary-table-wrap">
        <div class="stress-summary-table-head">
          <h3 class="stress-summary-table-title">${esc(tpl.title)}</h3>
          <div class="stress-summary-table-actions">
            <span class="stress-summary-table-unit">${esc(tpl.unit)}</span>
            ${opts.showExport ? `<button type="button" class="btn btn-default btn-sm" onclick="${exportHandler}">导出数据</button>` : ''}
          </div>
        </div>
        <div class="table-wrap stress-summary-table-scroll">
          <table class="stress-summary-table">
            <thead>
              <tr>
                <th>行业名称（大类）</th><th>子行业</th><th>项目</th>${yearHeaders}
              </tr>
            </thead>
            <tbody>${bodyRows}${greenRows}${overallRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderDefaultAdjustmentDetailTable(taskId, results, opts = {}) {
    const rows = opts.rows ?? buildDefaultAdjustmentDetailRows(taskId, results, opts.jobId);
    const exportHandler = opts.exportHandler || 'CRST_APP.exportDefaultAdjustmentTable()';
    const bodyRows = rows.length
      ? rows.map((row) => `<tr>
          <td>${row.index}</td>
          <td>${esc(row.companyName)}</td>
          <td>${esc(row.creditCode)}</td>
          <td>${esc(row.industry)}</td>
          <td>${typeof row.loanBalance === 'number' ? row.loanBalance.toLocaleString() : esc(row.loanBalance)}</td>
          <td>${esc(row.baseline)}</td>
          <td>${esc(row.greenhouse)}</td>
          <td>${esc(row.orderly)}</td>
        </tr>`).join('')
      : '<tr><td colspan="8" class="empty-cell">暂无高碳行业违约调整明细</td></tr>';
    return `
      <div class="default-adjustment-table-wrap">
        <div class="stress-summary-table-head">
          <h3 class="stress-summary-table-title">违约调整明细表</h3>
          <div class="stress-summary-table-actions">
            ${opts.showExport ? `<button type="button" class="btn btn-default btn-sm" onclick="${exportHandler}">导出数据</button>` : ''}
          </div>
        </div>
        <div class="table-wrap default-adjustment-table-scroll">
          <table class="default-adjustment-table">
            <thead>
              <tr>
                <th rowspan="2">序号</th>
                <th rowspan="2">客户名称</th>
                <th rowspan="2">统一社会信用代码</th>
                <th rowspan="2">所属行业</th>
                <th rowspan="2">贷款余额（万元）</th>
                <th colspan="3">违约调整（违约年份/否）</th>
              </tr>
              <tr>
                <th>现有政策</th>
                <th>温室世界</th>
                <th>有序转型</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  const ANALYSIS_HIGH_CARBON_MAJORS = ['电力', '建材', '钢铁', '石化', '化工', '造纸', '航空', '有色'];
  const ANALYSIS_NPL_CLASSES = new Set(['SUBSTANDARD', 'DOUBTFUL', 'LOSS']);
  const ANALYSIS_NORMAL_ATT_CLASSES = new Set(['NORMAL', 'ATTENTION']);
  const ANALYSIS_METRIC_TABLE_HEAD = `
    <th class="num">基期客户数</th>
    <th class="num">基期贷款余额（万元）</th>
    <th class="num">基期不良贷款率</th>
    <th class="num">新增违约客户数</th>
    <th class="num">新增违约贷款金额（万元）</th>
    <th class="num">不良贷款余额（万元）</th>
    <th class="num">不良贷款率</th>
    <th class="num">不良贷款生成率</th>`;
  const ANALYSIS_METRIC_EXPORT_HEADERS = [
    '基期客户数',
    '基期贷款余额（万元）',
    '基期不良贷款率',
    '新增违约客户数',
    '新增违约贷款金额（万元）',
    '不良贷款余额（万元）',
    '不良贷款率',
    '不良贷款生成率',
  ];
  const analysisExportRegistry = {};

  function clearAnalysisExportRegistry() {
    Object.keys(analysisExportRegistry).forEach((k) => { delete analysisExportRegistry[k]; });
  }

  function registerAnalysisTableExport(id, title, headers, rows) {
    analysisExportRegistry[id] = { type: 'table', title, headers, rows };
  }

  function registerAnalysisChartExport(id, title, chartDomId) {
    analysisExportRegistry[id] = { type: 'chart', title, chartDomId };
  }

  function analysisMetricsExportCells(m) {
    return [
      formatAnalysisCount(m.baselineCount),
      formatAnalysisAmt(m.baselineLoan),
      formatAnalysisPct(m.baselineNplRatio),
      formatAnalysisCount(m.newDefaultCount),
      formatAnalysisAmt(m.newDefaultLoan),
      formatAnalysisAmt(m.nplBalance),
      formatAnalysisPct(m.nplRatio),
      formatAnalysisPct(m.nplGenerationRate),
    ];
  }

  function renderAnalysisExportActions(exportId, kind) {
    if (!exportId) return '';
    const label = kind === 'chart' ? '导出图片' : '导出 Excel';
    return `<div class="analysis-panel-actions">
      <button type="button" class="btn btn-default btn-sm" onclick="CRST_APP.exportAnalysisPanel('${exportId}')">${label}</button>
    </div>`;
  }

  function buildAnalysisTableExportText(meta) {
    return [
      meta.title,
      meta.headers.join('\t'),
      ...(meta.rows || []).map((row) => row.join('\t')),
    ].join('\n');
  }

  function downloadSvgChartAsPng(svgEl, fileName, onDone) {
    let source = new XMLSerializer().serializeToString(svgEl);
    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
      source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    const vb = svgEl.viewBox.baseVal;
    const w = vb.width || 800;
    const h = vb.height || 240;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          if (onDone) onDone(false);
          return;
        }
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        if (onDone) onDone(true);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (onDone) onDone(false);
    };
    img.src = url;
  }

  function exportAnalysisPanel(exportId) {
    const meta = analysisExportRegistry[exportId];
    if (!meta) {
      toast('导出数据不可用，请刷新页面后重试', 'error');
      return;
    }
    const { src } = resolveResultSource();
    const sourceKey = src?.key || window._resultSourceKey || '';
    if (meta.type === 'table') {
      if (!meta.rows?.length) {
        toast('当前表格暂无数据', 'info');
        return;
      }
      const downloadFileName = buildExportTitleFileName(meta.title);
      appendExportLog({
        sourceKey,
        scope: meta.title,
        fields: meta.headers.join(', '),
        filterDesc: buildAnalysisFilterDesc(),
        sourceType: 'RESULTS',
        exportKind: 'DETAIL',
        filterSnapshot: buildAnalysisExportSnapshot({ context: 'analysisTable', exportId }),
        downloadFileName,
      });
      triggerExportFileDownload(downloadFileName, buildAnalysisTableExportText(meta));
      toast('已导出 Excel');
      return;
    }
    const svg = document.getElementById(meta.chartDomId);
    if (!svg) {
      toast('未找到图表，请刷新页面后重试', 'error');
      return;
    }
    const downloadFileName = buildExportTitleFileName(meta.title, 'png');
    downloadSvgChartAsPng(svg, downloadFileName, (ok) => {
      if (!ok) {
        toast('图表导出失败', 'error');
        return;
      }
      appendExportLog({
        sourceKey,
        scope: meta.title,
        fields: '趋势图 PNG',
        filterDesc: buildAnalysisFilterDesc(),
        sourceType: 'RESULTS',
        exportKind: 'DETAIL',
        filterSnapshot: buildAnalysisExportSnapshot({ context: 'analysisChart', exportId }),
        downloadFileName,
        fileFormat: 'PNG',
      });
      toast('已导出图片');
    });
  }

  function formatAnalysisCount(v) {
    return Number(v || 0).toLocaleString();
  }

  function formatAnalysisAmt(v) {
    return Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function formatAnalysisPct(v) {
    if (v == null || !Number.isFinite(v)) return '-';
    return `${(v * 100).toFixed(2)}%`;
  }

  function analysisLoanClass(rec) {
    return rec.loanClassification || rec.prevStatus || 'NORMAL';
  }

  function analysisIsNplClass(cls) {
    return ANALYSIS_NPL_CLASSES.has(cls);
  }

  function resolveCustomerHighCarbonMeta(rec) {
    const carbon = window.CRST_CARBON;
    const IS = window.CRST_INDUSTRY_SELECTOR;
    const ind = rec.standardIndustry || '';
    const gb = rec.gbIndustryCode || '';
    const major = IS?.resolveTestIndustryMajor?.(ind, gb) || ind;
    const isHighCarbon = carbon?.isHighCarbonIndustry?.(ind, gb) || ANALYSIS_HIGH_CARBON_MAJORS.includes(major);
    if (!isHighCarbon) return { isHighCarbon: false, major: null, sub: null, region: rec.branchName || '-' };
    const hcClass = carbon?.HIGH_CARBON_INDUSTRY_CLASS || [];
    const hit = hcClass.find((c) => c.gbCode === gb)
      || hcClass.find((c) => gb && gb.startsWith(String(c.gbCode).slice(0, 4)));
    if (hit) return { isHighCarbon: true, major: hit.category, sub: hit.name, region: rec.branchName || '-' };
    const bankRow = BANK_BASIC_HIGH_CARBON_ROWS.find((row) => row.match(rec));
    if (bankRow) {
      const mappedMajor = ANALYSIS_HIGH_CARBON_MAJORS.find((m) => major.includes(m) || m === major) || major;
      return { isHighCarbon: true, major: mappedMajor, sub: bankRow.label, region: rec.branchName || '-' };
    }
    return { isHighCarbon: true, major: ANALYSIS_HIGH_CARBON_MAJORS.includes(major) ? major : '其他', sub: ind || major, region: rec.branchName || '-' };
  }

  function buildResultsAnalysisPortfolio(src, taskId) {
    const entity = src?.isJob ? getStressJob(src.id) : (taskId ? getTask(taskId) : null);
    const entityId = src?.isJob ? src.id : taskId;
    const recs = entityRecords(entityId, entity).filter((r) => r.dataAvailability !== 'ABNORMAL' && !r.excluded);
    const creditMap = Object.fromEntries(entityCredits(entityId, entity).map((c) => [c.companyName, c]));
    return recs.map((rec) => {
      const credit = creditMap[rec.companyName] || {};
      const hc = resolveCustomerHighCarbonMeta(rec);
      return {
        companyName: rec.companyName,
        branchName: rec.branchName || credit.branchName || '-',
        region: hc.region,
        standardIndustry: rec.standardIndustry || '-',
        gbIndustryCode: rec.gbIndustryCode,
        loanBalance: credit.loanBalance ?? rec.loanBalance ?? 0,
        loanClassification: analysisLoanClass(rec),
        prevStatus: rec.prevStatus || analysisLoanClass(rec),
        isHighCarbon: hc.isHighCarbon,
        highCarbonMajor: hc.major,
        highCarbonSub: hc.sub,
      };
    });
  }

  function buildCompanyDefaultYearMap(results, scenarioCode) {
    const map = new Map();
    (results || []).filter((r) => !scenarioCode || r.scenarioCode === scenarioCode).forEach((r) => {
      if (!r.defaultFlag || !r.companyName) return;
      const prev = map.get(r.companyName);
      if (!prev || (r.testYear || 9999) < prev) map.set(r.companyName, r.testYear);
    });
    return map;
  }

  function computeAnalysisGroupMetrics(customers, results, opts = {}) {
    const { scenarioCode = '', analysisYear = null } = opts;
    const scenRes = (results || []).filter((r) => !scenarioCode || r.scenarioCode === scenarioCode);
    const years = [...new Set(scenRes.map((r) => r.testYear).filter(Boolean))].sort((a, b) => a - b);
    const endYear = analysisYear || years[years.length - 1] || null;
    const defaultYearMap = buildCompanyDefaultYearMap(scenRes, scenarioCode);
    const baselineCustomers = customers.length;
    const baselineLoan = customers.reduce((s, c) => s + (c.loanBalance || 0), 0);
    const baselineNpl = customers
      .filter((c) => analysisIsNplClass(c.loanClassification))
      .reduce((s, c) => s + (c.loanBalance || 0), 0);
    const baselineNplRatio = baselineLoan > 0 ? baselineNpl / baselineLoan : 0;
    const startNormalAttentionLoan = customers
      .filter((c) => ANALYSIS_NORMAL_ATT_CLASSES.has(c.prevStatus || c.loanClassification || 'NORMAL'))
      .reduce((s, c) => s + (c.loanBalance || 0), 0);
    const newDefaultCustomers = customers.filter((c) => {
      const dy = defaultYearMap.get(c.companyName);
      if (!dy) return false;
      if (analysisYear != null) return dy === analysisYear;
      return ANALYSIS_NORMAL_ATT_CLASSES.has(c.prevStatus || c.loanClassification || 'NORMAL');
    });
    const newDefaultCount = newDefaultCustomers.length;
    const newDefaultLoan = newDefaultCustomers.reduce((s, c) => s + (c.loanBalance || 0), 0);
    const nplBalance = customers.reduce((s, c) => {
      const dy = defaultYearMap.get(c.companyName);
      if (analysisIsNplClass(c.loanClassification)) return s + (c.loanBalance || 0);
      if (dy != null && (endYear == null || dy <= endYear)) return s + (c.loanBalance || 0);
      return s;
    }, 0);
    const nplRatio = baselineLoan > 0 ? nplBalance / baselineLoan : 0;
    const nplGenerationRate = startNormalAttentionLoan > 0 ? (nplBalance - baselineNpl) / startNormalAttentionLoan : 0;
    return {
      baselineCustomers,
      baselineLoan,
      baselineNplRatio,
      newDefaultCount,
      newDefaultLoan,
      nplBalance,
      nplRatio,
      nplGenerationRate,
    };
  }

  function renderAnalysisMetricCells(m) {
    return `
      <td class="num">${formatAnalysisCount(m.baselineCustomers)}</td>
      <td class="num">${formatAnalysisAmt(m.baselineLoan)}</td>
      <td class="num">${formatAnalysisPct(m.baselineNplRatio)}</td>
      <td class="num">${formatAnalysisCount(m.newDefaultCount)}</td>
      <td class="num">${formatAnalysisAmt(m.newDefaultLoan)}</td>
      <td class="num">${formatAnalysisAmt(m.nplBalance)}</td>
      <td class="num">${formatAnalysisPct(m.nplRatio)}</td>
      <td class="num">${formatAnalysisPct(m.nplGenerationRate)}</td>`;
  }

  function renderAnalysisMetricTablePanel(title, exportId, rows, rowMapper, emptyColspan = 10) {
    const thead = rowMapper.head || `<tr><th>行业</th>${ANALYSIS_METRIC_TABLE_HEAD}</tr>`;
    return `
      <div class="analysis-panel analysis-panel--metric-table">
        <div class="analysis-panel-hd">
          <h3 class="analysis-panel-title">${esc(title)}</h3>
          ${renderAnalysisExportActions(exportId, 'table')}
        </div>
        ${renderFullTable(rows, thead, rowMapper.body, emptyColspan, 'analysis-metric-table-scroll')}
      </div>`;
  }

  function renderAnalysisCustomerTablePanel(title, exportId, rows, theadHtml, rowMapper, emptyColspan) {
    return `
      <div class="analysis-panel analysis-panel--metric-table">
        <div class="analysis-panel-hd">
          <h3 class="analysis-panel-title">${esc(title)}</h3>
          ${renderAnalysisExportActions(exportId, 'table')}
        </div>
        ${renderFullTable(rows, theadHtml, rowMapper, emptyColspan, 'analysis-metric-table-scroll')}
      </div>`;
  }

  function buildAnalysisHighCarbonDetailRows(portfolio, results, opts) {
    const carbon = window.CRST_CARBON;
    const hcClass = carbon?.HIGH_CARBON_INDUSTRY_CLASS || [];
    const groups = [];
    const groupMap = new Map();
    hcClass.forEach((item) => {
      if (!groupMap.has(item.category)) {
        const g = { major: item.category, subs: [] };
        groupMap.set(item.category, g);
        groups.push(g);
      }
      groupMap.get(item.category).subs.push(item.name);
    });
    const rows = [];
    groups.forEach((group) => {
      group.subs.forEach((subName) => {
        const customers = portfolio.filter((c) => c.isHighCarbon && c.highCarbonSub === subName && c.highCarbonMajor === group.major);
        const metrics = computeAnalysisGroupMetrics(customers, results, opts);
        rows.push({ major: group.major, sub: subName, metrics });
      });
    });
    return rows;
  }

  function buildAnalysisNonHighCarbonIndustries(portfolio) {
    const map = new Map();
    portfolio.filter((c) => !c.isHighCarbon).forEach((c) => {
      const ind = c.standardIndustry || '未分类';
      if (!map.has(ind)) map.set(ind, []);
      map.get(ind).push(c);
    });
    return [...map.entries()].map(([name, customers]) => ({ name, customers }));
  }

  function buildAnalysisHighCarbonRegionRows(portfolio, results, opts) {
    const map = new Map();
    portfolio.filter((c) => c.isHighCarbon).forEach((c) => {
      const region = c.region || c.branchName || '未分类';
      if (!map.has(region)) map.set(region, []);
      map.get(region).push(c);
    });
    return [...map.entries()]
      .map(([region, customers]) => ({ region, metrics: computeAnalysisGroupMetrics(customers, results, opts) }))
      .sort((a, b) => b.metrics.baselineLoan - a.metrics.baselineLoan);
  }

  function buildAnalysisTopDefaultCustomers(portfolio, results, opts, limit, highCarbon) {
    const defaultYearMap = buildCompanyDefaultYearMap(results, opts.scenarioCode);
    return portfolio
      .filter((c) => c.isHighCarbon === highCarbon)
      .filter((c) => {
        const dy = defaultYearMap.get(c.companyName);
        return dy && ANALYSIS_NORMAL_ATT_CLASSES.has(c.prevStatus || c.loanClassification || 'NORMAL');
      })
      .map((c) => ({
        companyName: c.companyName,
        loanBalance: c.loanBalance,
        industry: c.isHighCarbon ? (c.highCarbonSub || c.standardIndustry) : c.standardIndustry,
        region: c.region || c.branchName,
        defaultYear: defaultYearMap.get(c.companyName),
      }))
      .sort((a, b) => (b.loanBalance || 0) - (a.loanBalance || 0))
      .slice(0, limit);
  }

  function buildAnalysisMajorTrendSeries(portfolio, results, majors, metricKey, opts) {
    const scenRes = (results || []).filter((r) => !opts.scenarioCode || r.scenarioCode === opts.scenarioCode);
    const years = [...new Set(scenRes.map((r) => r.testYear).filter(Boolean))].sort((a, b) => a - b);
    return majors.map((major, idx) => {
      const customers = portfolio.filter((c) => c.isHighCarbon && c.highCarbonMajor === major);
      return {
        name: major,
        color: analysisColor(idx),
        points: years.map((year) => {
          const m = computeAnalysisGroupMetrics(customers, results, { ...opts, analysisYear: year });
          return { year, value: m[metricKey] || 0 };
        }),
      };
    });
  }

  function buildAnalysisIndustryTrendSeries(industryGroups, results, metricKey, opts) {
    return industryGroups.map((group, idx) => ({
      name: group.name,
      color: analysisColor(idx),
      points: [...new Set((results || []).map((r) => r.testYear).filter(Boolean))].sort((a, b) => a - b)
        .map((year) => ({
          year,
          value: computeAnalysisGroupMetrics(group.customers, results, { ...opts, analysisYear: year })[metricKey] || 0,
        })),
    }));
  }

  function renderAnalysisMultiLineChart(seriesList, opts = {}) {
    const yFormat = opts.yFormat || formatAnalysisPct;
    const allYears = [...new Set(seriesList.flatMap((s) => s.points.map((p) => p.year)))].sort((a, b) => a - b);
    if (!allYears.length || !seriesList.length) return '<div class="empty">暂无趋势数据</div>';
    let yMax = 0.0001;
    seriesList.forEach((s) => s.points.forEach((p) => { yMax = Math.max(yMax, p.value || 0); }));
    const W = Math.max(640, allYears.length * 56);
    const H = 240;
    const padL = 56;
    const padR = 16;
    const padT = 20;
    const padB = 38;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const xAt = (xi) => (allYears.length > 1 ? padL + (xi / (allYears.length - 1)) * plotW : padL + plotW / 2);
    const yAt = (val) => padT + plotH - ((val || 0) / yMax) * plotH;
    const grid = [0, 0.5, 1].map((t) => {
      const y = yAt(yMax * t);
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="chart-grid-line"/>
        <text x="${padL - 8}" y="${y + 4}" class="chart-axis-text" text-anchor="end">${esc(yFormat(yMax * t))}</text>`;
    }).join('');
    const series = seriesList.map((s) => {
      const pointMap = Object.fromEntries(s.points.map((p) => [p.year, p.value]));
      const pts = allYears.map((y, xi) => `${xAt(xi)},${yAt(pointMap[y] || 0)}`).join(' ');
      const dots = allYears.map((y, xi) => {
        const val = pointMap[y] || 0;
        return `<circle cx="${xAt(xi)}" cy="${yAt(val)}" r="4" fill="${s.color}" stroke="#fff" stroke-width="1.5">
          <title>${esc(s.name)} · ${y}年 · ${yFormat(val)}</title></circle>`;
      }).join('');
      return `<polyline class="chart-line-path" points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
    }).join('');
    const xLabels = allYears.map((y, xi) =>
      `<text x="${xAt(xi)}" y="${H - 10}" class="chart-axis-text" text-anchor="middle">${y}</text>`
    ).join('');
    const legend = seriesList.map((s) =>
      `<span class="chart-legend-item"><i style="background:${s.color}"></i>${esc(s.name)}</span>`
    ).join('');
    return `<div class="analysis-trend-chart">
      <div class="chart-legend">${legend}</div>
      <div class="chart-line-wrap analysis-trend-chart-wrap"><svg${opts.chartDomId ? ` id="${opts.chartDomId}"` : ''} viewBox="0 0 ${W} ${H}" class="chart-line-svg" preserveAspectRatio="xMidYMid meet">${grid}${series}${xLabels}</svg></div>
    </div>`;
  }

  function renderAnalysisTrendPanel(title, seriesList, yFormat, exportId) {
    const chartDomId = exportId ? `analysis-chart-${exportId}` : '';
    if (exportId) registerAnalysisChartExport(exportId, title, chartDomId);
    return `
      <div class="analysis-panel analysis-panel--trend-chart">
        <div class="analysis-panel-hd">
          <h3 class="analysis-panel-title">${esc(title)}</h3>
          ${renderAnalysisExportActions(exportId, 'chart')}
        </div>
        ${renderAnalysisMultiLineChart(seriesList, { yFormat, chartDomId })}
      </div>`;
  }

  function buildResultsAnalysisContent(portfolio, results, opts) {
    clearAnalysisExportRegistry();
    const nonHcIndustries = buildAnalysisNonHighCarbonIndustries(portfolio);
    const top5Loan = [...nonHcIndustries].sort((a, b) =>
      computeAnalysisGroupMetrics(b.customers, results, opts).baselineLoan
      - computeAnalysisGroupMetrics(a.customers, results, opts).baselineLoan
    ).slice(0, 5);
    const top5NplRise = [...nonHcIndustries]
      .map((g) => {
        const m = computeAnalysisGroupMetrics(g.customers, results, opts);
        return { ...g, nplRise: (m.nplRatio || 0) - (m.baselineNplRatio || 0) };
      })
      .sort((a, b) => b.nplRise - a.nplRise)
      .slice(0, 5);

    const table1Rows = buildAnalysisHighCarbonDetailRows(portfolio, results, opts);
    const table4Rows = buildAnalysisHighCarbonRegionRows(portfolio, results, opts);
    const table5Rows = buildAnalysisTopDefaultCustomers(portfolio, results, opts, 10, true);
    const table6Rows = buildAnalysisTopDefaultCustomers(portfolio, results, opts, 10, false);

    const chart1Series = buildAnalysisMajorTrendSeries(portfolio, results, ANALYSIS_HIGH_CARBON_MAJORS, 'nplRatio', opts);
    const chart2Series = buildAnalysisMajorTrendSeries(portfolio, results, ANALYSIS_HIGH_CARBON_MAJORS, 'nplGenerationRate', opts);
    const chart3Series = buildAnalysisIndustryTrendSeries(top5Loan, results, 'nplRatio', opts);
    const chart4Series = buildAnalysisIndustryTrendSeries(top5Loan, results, 'nplGenerationRate', opts);

    const table1Title = '表 1：高碳行业明细统计表（行业维度 - 高碳）';
    registerAnalysisTableExport(
      'analysis-t1',
      table1Title,
      ['行业名称（大类）', '子行业', ...ANALYSIS_METRIC_EXPORT_HEADERS],
      table1Rows.map((r) => [r.major, r.sub, ...analysisMetricsExportCells(r.metrics)]),
    );

    const table2Title = '表 2：非高碳行业 - 贷款余额 TOP5 统计表（行业维度 - 非高碳）';
    const table2ExportRows = top5Loan.map((g) => ({
      name: g.name,
      metrics: computeAnalysisGroupMetrics(g.customers, results, opts),
    }));
    registerAnalysisTableExport(
      'analysis-t2',
      table2Title,
      ['行业', ...ANALYSIS_METRIC_EXPORT_HEADERS],
      table2ExportRows.map((r) => [r.name, ...analysisMetricsExportCells(r.metrics)]),
    );

    const table3Title = '表 3：非高碳行业 - 不良贷款率上升最快 TOP5 统计表（行业维度 - 非高碳）';
    const table3ExportRows = top5NplRise.map((g) => ({
      name: g.name,
      metrics: computeAnalysisGroupMetrics(g.customers, results, opts),
    }));
    registerAnalysisTableExport(
      'analysis-t3',
      table3Title,
      ['行业', ...ANALYSIS_METRIC_EXPORT_HEADERS],
      table3ExportRows.map((r) => [r.name, ...analysisMetricsExportCells(r.metrics)]),
    );

    const table4Title = '表 4：高碳行业分地区统计表（地区维度）';
    registerAnalysisTableExport(
      'analysis-t4',
      table4Title,
      ['地区', ...ANALYSIS_METRIC_EXPORT_HEADERS],
      table4Rows.map((r) => [r.region, ...analysisMetricsExportCells(r.metrics)]),
    );

    const table5Title = '表 5：高碳行业压力情景违约预测前 10 大客户清单（客户维度 - 高碳）';
    registerAnalysisTableExport(
      'analysis-t5',
      table5Title,
      ['客户名称', '贷款余额（万元）', '所属行业', '所属地区', '预测违约年份'],
      table5Rows.map((r) => [
        r.companyName,
        formatAnalysisAmt(r.loanBalance),
        r.industry,
        r.region,
        r.defaultYear ? `${r.defaultYear}年` : '-',
      ]),
    );

    const table6Title = '表 6：非高碳行业压力情景违约预测前 10 大客户清单（客户维度 - 非高碳）';
    registerAnalysisTableExport(
      'analysis-t6',
      table6Title,
      ['客户名称', '贷款余额（万元）', '所属行业', '所属地区', '预测违约年份'],
      table6Rows.map((r) => [
        r.companyName,
        formatAnalysisAmt(r.loanBalance),
        r.industry,
        r.region,
        r.defaultYear ? `${r.defaultYear}年` : '-',
      ]),
    );

    const table1 = renderAnalysisMetricTablePanel(
      table1Title,
      'analysis-t1',
      table1Rows,
      {
        head: `<tr><th>行业名称（大类）</th><th>子行业</th>${ANALYSIS_METRIC_TABLE_HEAD}</tr>`,
        body: (r) => `<tr><td>${esc(r.major)}</td><td>${esc(r.sub)}</td>${renderAnalysisMetricCells(r.metrics)}</tr>`,
      },
      10,
    );

    const table2 = renderAnalysisMetricTablePanel(
      table2Title,
      'analysis-t2',
      table2ExportRows,
      {
        head: `<tr><th>行业</th>${ANALYSIS_METRIC_TABLE_HEAD}</tr>`,
        body: (r) => `<tr><td>${esc(r.name)}</td>${renderAnalysisMetricCells(r.metrics)}</tr>`,
      },
      9,
    );

    const table3 = renderAnalysisMetricTablePanel(
      table3Title,
      'analysis-t3',
      table3ExportRows,
      {
        head: `<tr><th>行业</th>${ANALYSIS_METRIC_TABLE_HEAD}</tr>`,
        body: (r) => `<tr><td>${esc(r.name)}</td>${renderAnalysisMetricCells(r.metrics)}</tr>`,
      },
      9,
    );

    const table4 = renderAnalysisMetricTablePanel(
      table4Title,
      'analysis-t4',
      table4Rows,
      {
        head: `<tr><th>地区</th>${ANALYSIS_METRIC_TABLE_HEAD}</tr>`,
        body: (r) => `<tr><td>${esc(r.region)}</td>${renderAnalysisMetricCells(r.metrics)}</tr>`,
      },
      9,
    );

    const customerTableHead = '<tr><th>客户名称</th><th>贷款余额（万元）</th><th>所属行业</th><th>所属地区</th><th>预测违约年份</th></tr>';
    const customerRow = (r) => `<tr><td>${esc(r.companyName)}</td><td class="num">${formatAnalysisAmt(r.loanBalance)}</td><td>${esc(r.industry)}</td><td>${esc(r.region)}</td><td>${r.defaultYear ? `${r.defaultYear}年` : '-'}</td></tr>`;

    const table5 = renderAnalysisCustomerTablePanel(
      table5Title,
      'analysis-t5',
      table5Rows,
      customerTableHead,
      customerRow,
      5,
    );

    const table6 = renderAnalysisCustomerTablePanel(
      table6Title,
      'analysis-t6',
      table6Rows,
      customerTableHead,
      customerRow,
      5,
    );

    const charts = [
      renderAnalysisTrendPanel(
        '图 1：8 大高碳行业不良贷款率趋势图',
        chart1Series,
        formatAnalysisPct,
        'analysis-c1',
      ),
      renderAnalysisTrendPanel(
        '图 2：8 大高碳行业不良贷款生成率趋势图',
        chart2Series,
        formatAnalysisPct,
        'analysis-c2',
      ),
      renderAnalysisTrendPanel(
        '图 3：非高碳行业贷款余额 TOP5 行业不良贷款率趋势图',
        chart3Series,
        formatAnalysisPct,
        'analysis-c3',
      ),
      renderAnalysisTrendPanel(
        '图 4：非高碳行业贷款余额 TOP5 行业不良贷款生成率趋势图',
        chart4Series,
        formatAnalysisPct,
        'analysis-c4',
      ),
    ].join('');

    return `
      <div class="analysis-section analysis-section--tables">
        ${table1}${table2}${table3}${table4}${table5}${table6}
      </div>
      <div class="analysis-section analysis-section--charts">
        ${charts}
      </div>`;
  }

  function renderResults() {
    const { sources, src, res, taskId } = resolveResultSource();
    const filteredRes = filterAnalysisResults(res, null, '');
    const defaultMonitorCustomers = collectRiskWarningsFromResults(filteredRes);
    const srcKey = src?.key || '';
    const canExport = src && canExportSourceKey(srcKey);
    const reportTask = taskId ? getTask(taskId) : null;
    const canAppReport = reportTask && !src?.isJob && canUseApplicationReport(reportTask);
    const canPushWarning = !!(taskId || src?.sourceTaskId) && defaultMonitorCustomers.length > 0;
    const pushWarningTaskId = taskId || src?.sourceTaskId;
    const portfolio = src ? buildResultsAnalysisPortfolio(src, taskId) : [];
    const analysisOpts = {
      scenarioCode: '',
      analysisYear: null,
    };
    const analysisContent = res.length && portfolio.length
      ? buildResultsAnalysisContent(portfolio, res, analysisOpts)
      : (res.length ? '<div class="empty" style="padding:24px 0">暂无可用客户样本，无法生成统计分析表。</div>' : '');

    return `
      <div class="card">
        <div class="toolbar"><h2 class="page-title">压测结果分析</h2></div>
        ${renderStressResultJobFilterBar({
          sources,
          srcKey,
          onChange: 'CRST_APP.setResultSource(this.value)',
          emptyLabel: '暂无已完成结果',
          extraHtml: canAppReport ? `<button type="button" class="btn btn-primary" onclick="CRST_APP.goToApplicationReport(${taskId})">应用报送</button>` : '',
        })}

        <div class="analysis-panel analysis-panel--default-monitor">
          <div class="analysis-panel-hd">
            <h3 class="analysis-panel-title">违约客户监控 — 行业新增不良/违约户</h3>
            <div class="analysis-panel-actions">
              ${defaultMonitorCustomers.length ? `<button type="button" class="btn btn-default" onclick="CRST_APP.exportDefaultMonitorData()">导出数据</button>` : ''}
              ${canPushWarning ? `<button type="button" class="btn btn-primary" onclick="CRST_APP.oneClickIssueResultRiskWarnings(${pushWarningTaskId})">一键下发预警</button>` : ''}
            </div>
          </div>
          ${renderDefaultMonitorChart(defaultMonitorCustomers)}
        </div>

        ${analysisContent}
      </div>`;
  }

  /* —— 因子库 —— */
  function factorActions(f) {
    return [
      `<button class="btn btn-link" onclick="CRST_APP.viewFactor(${f.id})">查看</button>`,
      `<button class="btn btn-link" onclick="CRST_APP.editFactor(${f.id})">编辑</button>`,
      `<button class="btn btn-link" onclick="CRST_APP.deleteFactor(${f.id})">删除</button>`,
    ].join('');
  }

  function renderFactors() {
    const table = renderPagedTable('factors', factors,
      '<tr><th>因子名称</th><th>数值</th><th>单位</th><th>行业名称</th><th>更新人</th><th>更新时间</th><th>操作</th></tr>',
      (f) => `<tr>
      <td>${esc(f.factorName)}</td>
      <td class="num">${f.factorValue}</td>
      <td>${esc(f.unit)}</td>
      <td>${esc(f.industry || '-')}</td>
      <td>${esc(f.updatedBy || '总行管理员')}</td>
      <td>${esc(f.updatedAt || '-')}</td>
      <td><div class="action-group">${factorActions(f)}</div></td>
    </tr>`, 7);
    return `
      <div class="card">
        <div class="toolbar">
          <h2 class="page-title">因子库管理</h2>
          <button class="btn btn-primary" onclick="CRST_APP.openFactorModal('create')">新增因子</button>
        </div>
        ${table}
      </div>`;
  }

  /* —— 场景计算方法 —— */
  function scenarioActions(s) {
    const btns = [`<button class="btn btn-link" onclick="CRST_APP.viewScenario(${s.id})">查看</button>`];
    if (s.status === 'DRAFT') {
      btns.push(`<button class="btn btn-link" onclick="CRST_APP.editScenario(${s.id})">编辑</button>`);
      btns.push(`<button class="btn btn-link" onclick="CRST_APP.publishScenario(${s.id})">发布生效</button>`);
      btns.push(`<button class="btn btn-link" onclick="CRST_APP.deleteScenario(${s.id})">删除</button>`);
    } else if (s.status === 'PUBLISHED') {
      btns.push(`<button class="btn btn-link" onclick="CRST_APP.disableScenario(${s.id})">停用</button>`);
    } else {
      btns.push(`<button class="btn btn-link" onclick="CRST_APP.publishScenario(${s.id})">重新启用</button>`);
    }
    return btns.join('');
  }

  function renderScenarios() {
    const transitionMap = window.CRST_CARBON?.TRANSITION_SCENARIOS || {};
    const table = renderPagedTable('scenarios', scenarios,
      '<tr><th>场景编码</th><th>场景名称</th><th>免费配额2025</th><th>免费配额2040</th><th>碳价2025</th><th>碳价2040</th><th>测试年</th><th>计算公式</th><th>公式版本</th><th>状态</th><th>生效时间</th><th>操作</th></tr>',
      (s) => {
        const tr = transitionMap[s.scenarioCode];
        const quota2025 = s.freeQuota2025 ?? tr?.freeQuota2025;
        const quota2040 = s.freeQuota2040 ?? tr?.freeQuota2040;
        const price2025 = s.carbonPrice2025 ?? tr?.carbonPrice2025;
        const price2040 = s.carbonPrice2040 ?? tr?.carbonPrice2040;
        return `<tr>
      <td>${esc(s.scenarioCode)}</td><td>${esc(s.scenarioName)}</td>
      <td>${quota2025 != null ? (quota2025 * 100).toFixed(2) + '%' : '-'}</td>
      <td>${quota2040 != null ? (quota2040 * 100).toFixed(2) + '%' : '-'}</td>
      <td>${price2025 != null ? price2025 : '-'}</td>
      <td>${price2040 != null ? price2040 : '-'}</td>
      <td>${s.testYear ?? '-'}</td>
      <td title="${esc(s.formula)}">${esc(s.formula.slice(0, 24))}…</td>
      <td>${esc(s.formulaVersion || s.version)}</td><td>${tag(s.status, CONFIG_STATUS)}</td><td>${s.publishedAt || '-'}</td>
      <td><div class="action-group">${scenarioActions(s)}</div></td>
    </tr>`;
      }, 12);
    return `
      <div class="card">
        <div class="toolbar">
          <h2 class="page-title">场景计算方法配置</h2>
          <button class="btn btn-primary" onclick="CRST_APP.openScenarioModal('create')">新增场景</button>
        </div>
        ${table}
      </div>`;
  }

  /* —— 行业映射 —— */
  function getMappingGbIndustryName(m) {
    return m?.gbIndustryName || String(m?.apiIndustry || '').replace(/^[A-Z0-9]+\s*/, '') || '-';
  }

  function getMappingIndustryMajor(m) {
    return m?.industryMajor || m?.standardIndustry || '-';
  }

  function getMappingTestIndustryCategory(m) {
    return m?.testIndustryCategory || '-';
  }

  function mappingActions(m) {
    return `
      <button class="btn btn-link" onclick="CRST_APP.viewMapping(${m.id})">查看</button>
      <button class="btn btn-link" onclick="CRST_APP.editMapping(${m.id})">编辑</button>
      <button class="btn btn-link" onclick="CRST_APP.deleteMapping(${m.id})">删除</button>`;
  }

  function renderMappings() {
    const table = renderPagedTable('mappings', mappings,
      '<tr><th>国民经济行业代码<br><span class="th-sub">（GB/T 4754-2017）</span></th><th>国民经济行业类别</th><th>行业大类</th><th>测试行业类别</th><th>更新人</th><th>更新时间</th><th>操作</th></tr>',
      (m) => `<tr>
      <td>${esc(m.gbCode || '-')}</td>
      <td>${esc(getMappingGbIndustryName(m))}</td>
      <td>${esc(getMappingIndustryMajor(m))}</td>
      <td>${esc(getMappingTestIndustryCategory(m))}</td>
      <td>${esc(m.updatedBy || '总行管理员')}</td>
      <td>${esc(m.updatedAt || '-')}</td>
      <td><div class="action-group">${mappingActions(m)}</div></td>
    </tr>`, 7);
    return `
      <div class="card">
        <div class="toolbar">
          <h2 class="page-title">行业映射关系</h2>
          <button class="btn btn-primary" onclick="CRST_APP.openMappingModal('create')">新增映射</button>
        </div>
        ${table}
      </div>`;
  }

  function airportThroughputActions(r) {
    const btns = [`<button class="btn btn-link" onclick="CRST_APP.editAirportThroughput(${r.id})">编辑</button>`];
    btns.push(`<button class="btn btn-link" onclick="CRST_APP.deleteAirportThroughput(${r.id})">删除</button>`);
    return btns.join('');
  }

  function renderAirportThroughput() {
    const editing = airportThroughputRows.find((r) => r.id === airportThroughputEditId);
    const table = renderPagedTable('airport-throughput', airportThroughputRows,
      '<tr><th>机场企业</th><th>机场代码</th><th>年份</th><th>旅客吞吐量(万人次)</th><th>货邮吞吐量(万吨)</th><th>数据来源</th><th>更新时间</th><th>操作</th></tr>',
      (r) => `<tr>
        <td>${esc(r.airportName)}</td><td>${esc(r.airportCode)}</td><td>${esc(r.year)}</td>
        <td>${Number(r.passengerThroughput).toLocaleString()}</td><td>${Number(r.cargoThroughput).toLocaleString()}</td>
        <td>${esc(r.source)}</td><td>${esc(r.updatedAt)}</td>
        <td><div class="action-group">${airportThroughputActions(r)}</div></td>
      </tr>`, 8);
    return `
      <div class="card">
        <div class="toolbar">
          <h2 class="page-title">机场吞吐量维护</h2>
        </div>
        <div class="form-grid-2">
          <div class="form-row"><label><span class="req">*</span>机场企业</label><input class="input" id="ap_name" value="${esc(editing?.airportName || '')}" placeholder="如 华南机场运营有限公司" /></div>
          <div class="form-row"><label><span class="req">*</span>机场代码</label><input class="input" id="ap_code" value="${esc(editing?.airportCode || '')}" placeholder="如 CAN" /></div>
          <div class="form-row"><label><span class="req">*</span>年份</label><input class="input" id="ap_year" type="number" value="${esc(editing?.year || 2024)}" /></div>
          <div class="form-row"><label><span class="req">*</span>旅客吞吐量（万人次）</label><input class="input" id="ap_passenger" type="number" step="0.01" value="${esc(editing?.passengerThroughput ?? '')}" /></div>
          <div class="form-row"><label>货邮吞吐量（万吨）</label><input class="input" id="ap_cargo" type="number" step="0.01" value="${esc(editing?.cargoThroughput ?? '')}" /></div>
          <div class="form-row"><label>数据来源</label><input class="input" id="ap_source" value="${esc(editing?.source || '机场运营数据接口')}" /></div>
        </div>
        <div class="toolbar step-panel-actions">
          <button class="btn btn-primary" onclick="CRST_APP.saveAirportThroughput()">${editing ? '保存修改' : '保存记录'}</button>
          ${editing ? '<button class="btn btn-default" onclick="CRST_APP.resetAirportThroughputForm()">取消编辑</button>' : ''}
        </div>
        ${table}
      </div>`;
  }

  /* —— 导出记录 —— */
  function filterExportList() {
    const kw = exportFilters.fileName.trim();
    return exportLogs.filter((e) => {
      const fileName = getExportDownloadFileName(e);
      if (kw && !fileName.includes(kw) && !(e.taskName || '').includes(kw)) return false;
      if (exportFilters.moduleName && getExportModuleName(e) !== exportFilters.moduleName) return false;
      return true;
    });
  }

  function searchExports() {
    exportFilters.fileName = document.getElementById('ef_file')?.value?.trim() || '';
    exportFilters.moduleName = document.getElementById('ef_module')?.value || '';
    getListPager('exports').page = 1;
    render();
  }

  function resetExportFilters() {
    exportFilters = { fileName: '', moduleName: '' };
    getListPager('exports').page = 1;
    render();
  }

  function renderExports() {
    const filtered = filterExportList();
    const moduleOpts = EXPORT_MODULE_OPTIONS.map((name) =>
      `<option value="${esc(name)}" ${exportFilters.moduleName === name ? 'selected' : ''}>${esc(name)}</option>`
    ).join('');
    const table = renderPagedTable('exports', filtered,
      '<tr><th>模块名称</th><th>文件名称</th><th>导出人</th><th>导出时间</th><th>操作</th></tr>',
      (e) => {
        const fileName = getExportDownloadFileName(e);
        return `<tr>
      <td>${esc(getExportModuleName(e))}</td>
      <td class="export-download-cell"><span class="export-download-name" data-tip="${esc(fileName)}" title="${esc(fileName)}">${esc(fileName)}</span></td>
      <td>${esc(e.operator)}</td>
      <td>${e.exportedAt}</td>
      <td class="table-actions">
        <button class="btn btn-link" onclick="CRST_APP.downloadExport(${e.id})">下载</button>
      </td>
    </tr>`;
      }, 5, 'table-exports-wrap');
    return `
      <div class="card">
        <div class="toolbar"><h2 class="page-title">导出记录</h2></div>
        <div class="filter-bar export-filter-bar">
          <select class="select" id="ef_module">
            <option value="">全部模块</option>
            ${moduleOpts}
          </select>
          <input class="input" id="ef_file" placeholder="文件名称（模糊搜索）" value="${esc(exportFilters.fileName)}" onkeydown="if(event.key==='Enter')CRST_APP.searchExports()" />
          <button type="button" class="btn btn-primary" onclick="CRST_APP.searchExports()">查询</button>
          <button type="button" class="btn btn-default" onclick="CRST_APP.resetExportFilters()">重置</button>
        </div>
        ${table}
      </div>`;
  }

  function mapDataProcessTabToDetailStep(tab) {
    return tab === 1 ? 1 : 0;
  }

  function setDataProcessTab(tab) {
    dataProcessTab = tab;
    if (tab >= 1 && currentTaskId) {
      syncDataProcessTaskViewState(getTask(currentTaskId));
    } else if (tab === 0) {
      detailStep = 0;
    }
    render();
  }

  function selectModuleTask(id, modulePage) {
    if (!id) {
      currentTaskId = null;
      taskViewMode = false;
      render();
      return;
    }
    currentTaskId = id;
    taskDraftMode = false;
    taskEditMode = false;
    syncDataProcessTaskViewState(getTask(id));
    navigate(modulePage, id, dataProcessTab === 0 ? 0 : 1);
  }

  function renderModuleTaskPicker(modulePage) {
    const list = tasks.filter((t) => t.status !== 'ARCHIVED');
    return `<select class="select module-task-picker" onchange="CRST_APP.selectModuleTask(+this.value, '${modulePage}')">
      <option value="">选择任务</option>
      ${list.map((t) => `<option value="${t.id}" ${currentTaskId === t.id ? 'selected' : ''}>${esc(t.taskName)}</option>`).join('')}
    </select>`;
  }

  function renderDataProcessSubnav() {
    const tabs = [
      { id: 0, label: '任务概览' },
      { id: 1, label: '财务数据' },
    ];
    return `<div class="module-subnav">${tabs.map((t) =>
      `<button type="button" class="module-subnav-btn ${dataProcessTab === t.id ? 'active' : ''}" onclick="CRST_APP.setDataProcessTab(${t.id})">${t.label}</button>`
    ).join('')}</div>`;
  }

  function backToDataProcessList() {
    navigate('data-process');
  }

  function canShowOneClickProcessBtn(t) {
    if (!t || t.status === 'ARCHIVED') return false;
    const readonly = (taskViewMode && !taskEditMode)
      || (t.status === 'COMPLETED' && !taskEditMode);
    return !readonly;
  }

  function renderOneClickProcessFab(taskId, t) {
    if (!canShowOneClickProcessBtn(t)) return '';
    return `<button type="button" class="btn-fab btn-fab-prototype" title="一键处理" aria-label="一键处理" onclick="CRST_APP.oneClickProcessCustomerData(${taskId})"><span class="btn-fab-text">一键</span></button>`;
  }

  function renderTaskLogButton(taskId, t, opts = {}) {
    return '';
  }

  function renderTaskBreadcrumbActions(t, taskId, opts = {}) {
    const id = taskId ?? t?.id;
    const oneClick = renderOneClickProcessFab(id, t);
    const logBtn = renderTaskLogButton(id, t, opts);
    if (!oneClick && !logBtn) return '';
    return `<div class="breadcrumb-actions">${oneClick}${logBtn}</div>`;
  }

  function renderDataProcessModule() {
    moduleContext = { modulePage: 'data-process', embedded: false };

    if (taskDraftMode) {
      return `<div class="module-page">${renderTaskCreatePage()}</div>`;
    }

    if (dataProcessListMode || !currentTaskId) {
      return `<div class="module-page">${renderTasks()}</div>`;
    }

    const t = getTask(currentTaskId);
    if (!t) {
      return `<div class="module-page"><div class="card empty">任务不存在</div></div>`;
    }

    syncDataProcessTaskViewState(t);
    moduleContext.embedded = true;
    const detail = renderTaskDetail();
    moduleContext.embedded = false;
    const breadcrumbActions = renderTaskBreadcrumbActions(t, currentTaskId, { alwaysShowLog: true });

    return `
      <div class="module-page">
        <div class="breadcrumb-row">
          <div class="breadcrumb">
            <a onclick="CRST_APP.backToDataProcessList()">数据处理</a> / ${esc(t.taskName)}
          </div>
          ${breadcrumbActions}
        </div>
        ${renderDataProcessSubnav()}
        ${detail}
      </div>`;
  }

  function formatAlrPercent(v) {
    if (v == null || !Number.isFinite(v)) return '-';
    return `${(v * 100).toFixed(2)}%`;
  }

  function finTransPrimaryScenarioCode(job) {
    const codes = job.selectedScenarioCodes?.length
      ? job.selectedScenarioCodes
      : STRESS_SCENARIO_OPTIONS.map((s) => s.code);
    return codes[0];
  }

  function getFinTransYearSpan(job, scenarioCode) {
    const p = getScenarioStressParams(job, scenarioCode);
    let start = p.startYear;
    let end = p.endYear;
    (job.selectedScenarioCodes || [scenarioCode]).forEach((code) => {
      const sp = getScenarioStressParams(job, code);
      start = Math.min(start, sp.startYear);
      end = Math.max(end, sp.endYear);
    });
    const years = [];
    for (let y = start; y <= end; y++) years.push(y);
    return years;
  }

  function deriveFinTransTableFromResults(job, scenarioCode) {
    const results = stressResultsByJob[job.id] || [];
    const filtered = results.filter((r) => r.scenarioCode === scenarioCode);
    if (!filtered.length) return null;
    const years = [...new Set(filtered.map((r) => r.testYear))].sort((a, b) => a - b);
    const byCompany = new Map();
    filtered.forEach((r) => {
      if (!byCompany.has(r.companyName)) {
        byCompany.set(r.companyName, { companyName: r.companyName, alrByYear: {} });
      }
      byCompany.get(r.companyName).alrByYear[r.testYear] = r.assetLiabilityRatioAfter;
    });
    return { scenarioCode, years, rows: [...byCompany.values()] };
  }

  function getJobBankBasicCapital(job) {
    const defaults = defaultBankBasicCapitalMetrics();
    if (job?.dataSource === 'REF' && job.sourceTaskId) {
      const src = getTask(job.sourceTaskId);
      if (src?.bankBasicInfo?.capital) return { ...defaults, ...src.bankBasicInfo.capital };
    }
    if (job?.bankBasicInfo?.capital) return { ...defaults, ...job.bankBasicInfo.capital };
    return defaults;
  }

  /** 当年新转不良占用准备：不良余额 × 贷款拨备率（参试银行基础信息） */
  function calcNplProvisionAmount(nplBalance, capital) {
    const ratio = (capital?.provisionRatioReq ?? 2.5) / 100;
    return Math.round((nplBalance || 0) * ratio);
  }

  function computeFinTransResultsForScenario(jobId, scenarioCode) {
    const t = getStressJob(jobId);
    if (!t) return null;
    const carbon = window.CRST_CARBON;
    if (!carbon) return null;
    const p = getScenarioStressParams(t, scenarioCode);
    const years = [];
    for (let y = p.startYear; y <= p.endYear; y++) years.push(y);
    const recs = (stressRecordsByJob[jobId] || entityRecords(jobId, t))
      .filter((r) => r.dataAvailability !== 'ABNORMAL' && r.standardIndustry);
    const sampleLimit = recs.length > 100 ? 100 : recs.length;
    const sampled = recs.slice(0, sampleLimit);
    const enabledFactors = getEnabledEmissionFactors();
    const rows = sampled.map((r) => {
      const alrByYear = {};
      const enriched = {
        ...r,
        costIncomeRatio: r.costIncomeRatio ?? p.costIncomeRatio,
        assetLiabilityRatio: r.assetLiabilityRatio ?? p.assetLiabilityRatio,
        baseNetProfitPositive: p.baseNetProfitPositive,
      };
      years.forEach((y) => {
        const out0 = carbon.runCompanyStress(enriched, scenarioCode, {
          ...stressCalcOptions(p, y),
          factorLibrary: enabledFactors,
        });
        const out = enrichStressResult(applyScenarioAdjustment(out0, scenarioCode, p), enriched, p);
        alrByYear[y] = out.assetLiabilityRatioAfter;
      });
      return { companyName: r.companyName, alrByYear };
    });
    const payload = { scenarioCode, years, rows };
    stressFinTransByJob[jobId] = payload;
    return payload;
  }

  function computeFinTransResults(jobId) {
    const t = getStressJob(jobId);
    if (!t) return null;
    return computeFinTransResultsForScenario(jobId, finTransPrimaryScenarioCode(t));
  }

  function getFinTransAlrTableDataForScenario(job, scenarioCode) {
    const fromResults = deriveFinTransTableFromResults(job, scenarioCode);
    if (fromResults?.rows?.length) return fromResults;
    const cached = stressFinTransByJob[job.id];
    if (cached?.scenarioCode === scenarioCode && cached.rows?.length) return cached;
    if (job.finTransDone) {
      const computed = computeFinTransResultsForScenario(job.id, scenarioCode);
      if (computed?.rows?.length) return computed;
    }
    return { scenarioCode, years: getFinTransYearSpan(job, scenarioCode), rows: [] };
  }

  function getFinTransAlrTableData(job) {
    const scenarioCode = finTransPrimaryScenarioCode(job);
    return getFinTransAlrTableDataForScenario(job, scenarioCode);
  }

  function getNplProvPreviewRows(job, results) {
    const res = results || stressResultsByJob[job.id] || [];
    const criteriaSource = (job.dataSource === 'REF' && job.sourceTaskId) ? getTask(job.sourceTaskId) : job;
    const criteria = getResultDefaultCriteria(criteriaSource || job);
    const recMap = Object.fromEntries((stressRecordsByJob[job.id] || entityRecords(job.id, job)).map((r) => [r.companyName, r]));
    const map = new Map();
    if (res.length) {
      res.forEach((r) => {
        const rec = recMap[r.companyName] || {};
        const eval = r.defaultFlag != null ? r : { ...r, ...evalDefaultFromRules(r, rec, criteria) };
        if (!eval.defaultFlag) return;
        const key = `${r.companyName}::${r.scenarioCode || ''}`;
        const prev = map.get(key);
        if (!prev || (eval.testYear || 9999) < (prev.testYear || 9999)) {
          map.set(key, { ...r, ...eval, loanAmount: r.loanAmount ?? rec.loanBalance ?? 0 });
        }
      });
      return [...map.values()].sort((a, b) => {
        const bc = (a.branchName || '').localeCompare(b.branchName || '', 'zh-CN');
        return bc !== 0 ? bc : (a.testYear || 0) - (b.testYear || 0);
      });
    }
    return computeNplProvRowsFromFinTrans(job);
  }

  function computeNplProvRowsFromFinTrans(job) {
    const recs = stressRecordsByJob[job.id] || entityRecords(job.id, job);
    const recMap = Object.fromEntries(recs.map((r) => [r.companyName, r]));
    const creditMap = Object.fromEntries((stressCreditByJob[job.id] || entityCredits(job.id, job)).map((c) => [c.companyName, c]));
    const criteriaSource = (job.dataSource === 'REF' && job.sourceTaskId) ? getTask(job.sourceTaskId) : job;
    const criteria = getResultDefaultCriteria(criteriaSource || job);
    const scenarios = job.selectedScenarioCodes?.length ? job.selectedScenarioCodes : [finTransPrimaryScenarioCode(job)];
    const carbon = window.CRST_CARBON;
    const enabledFactors = getEnabledEmissionFactors();
    const rows = [];
    scenarios.forEach((scenarioCode) => {
      const finData = getFinTransAlrTableDataForScenario(job, scenarioCode);
      if (!finData?.rows?.length) return;
      const p = getScenarioStressParams(job, scenarioCode);
      finData.rows.forEach((row) => {
        const rec = recMap[row.companyName] || {};
        const alr0 = rec.assetLiabilityRatio ?? criteria.assetLiabilityRatio;
        let defaultYear = null;
        let alrAfter = null;
        finData.years.forEach((y) => {
          const alr1 = row.alrByYear[y];
          if (alr1 == null || defaultYear != null) return;
          const eval = evalDefaultFromRules({
            assetLiabilityRatioBefore: alr0,
            assetLiabilityRatioAfter: alr1,
          }, rec, criteria);
          if (eval.defaultFlag) {
            defaultYear = y;
            alrAfter = alr1;
          }
        });
        if (defaultYear == null) return;
        const credit = creditMap[row.companyName];
        const loanAmount = credit?.loanBalance ?? rec.loanBalance ?? 0;
        let carbonCost = 0;
        if (carbon) {
          const enriched = {
            ...rec,
            costIncomeRatio: rec.costIncomeRatio ?? p.costIncomeRatio,
            assetLiabilityRatio: alr0,
            baseNetProfitPositive: p.baseNetProfitPositive,
          };
          const out0 = carbon.runCompanyStress(enriched, scenarioCode, {
            ...stressCalcOptions(p, defaultYear),
            factorLibrary: enabledFactors,
          });
          carbonCost = out0.carbonCost || 0;
        }
        rows.push({
          companyName: row.companyName,
          branchName: rec.branchName,
          standardIndustry: rec.standardIndustry,
          scenarioCode,
          scenarioName: scenarioLabel(scenarioCode),
          testYear: defaultYear,
          carbonCost,
          loanAmount,
          assetLiabilityRatioBefore: alr0,
          assetLiabilityRatioAfter: alrAfter,
          defaultFlag: true,
        });
      });
    });
    return rows.sort((a, b) => {
      const bc = (a.branchName || '').localeCompare(b.branchName || '', 'zh-CN');
      return bc !== 0 ? bc : (a.testYear || 0) - (b.testYear || 0);
    });
  }

  function hasNplProvResultData(job) {
    return getNplProvPreviewRows(job).length > 0;
  }

  function renderNplProvPreviewTable(job, previewRows, tableId) {
    const capital = getJobBankBasicCapital(job);
    const nplBalanceSum = previewRows.reduce((s, r) => s + (r.loanAmount || 0), 0);
    const provSum = previewRows.reduce((s, r) => s + calcNplProvisionAmount(r.loanAmount, capital), 0);
    const previewSummary = previewRows.length
      ? `<div class="desc-grid" style="margin-bottom:12px">
          <div class="desc-item"><span class="k">违约客户数</span><span>${previewRows.length} 户</span></div>
          <div class="desc-item"><span class="k">不良贷款余额合计</span><span>${nplBalanceSum.toLocaleString()} 万元</span></div>
          <div class="desc-item"><span class="k">当年新提取贷款损失准备</span><span>${provSum.toLocaleString()} 万元</span></div>
          <div class="desc-item"><span class="k">涉及情景</span><span>${renderScenarioTags([...new Set(previewRows.map((r) => r.scenarioCode).filter(Boolean))])}</span></div>
          <div class="desc-item desc-item--wide"><span class="k">拨备计算参数</span><span>贷款拨备率 ${(capital.provisionRatioReq ?? 2.5).toFixed(1)}% · 拨备覆盖率 ${(capital.coverageRatioReq ?? 150).toFixed(1)}%（来自数据处理参试银行基础信息）</span></div>
        </div>`
      : '';
    return { previewSummary };
  }

  function renderNplProvSummaryTables(job, scenarioFilter) {
    const results = stressResultsByJob[job.id] || [];
    const previewRows = getNplProvPreviewRows(job);
    const summaryResults = results.length ? results : buildNplProvResultsFromPreview(job, previewRows);
    if (!summaryResults.length) return '';
    const scenarios = scenarioFilter
      ? [scenarioFilter]
      : (job.selectedScenarioCodes?.length ? job.selectedScenarioCodes : [...new Set(summaryResults.map((r) => r.scenarioCode).filter(Boolean))]);
    return scenarios.map((code) => {
      const scenarioRes = summaryResults.filter((r) => r.scenarioCode === code);
      if (!scenarioRes.length) return '';
      return renderStressSummaryRegulatoryTable(code, scenarioRes, {
        job,
        showExport: true,
        exportHandler: `CRST_APP.exportNplProvSummaryTable('${code}')`,
      });
    }).filter(Boolean).join('');
  }

  function buildStressJobResultLabel(job) {
    const scenarioText = (job.selectedScenarioCodes || []).map((c) => scenarioLabel(c)).join('、') || '多情景';
    return `[${scenarioText}] ${job.jobName}`;
  }

  function buildFinTransJobSources() {
    return stressJobs
      .filter((j) => hasFinTransResultData(j))
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
      .map((j) => ({ key: `job-${j.id}`, id: j.id, label: buildStressJobResultLabel(j), job: j }));
  }

  function getFinTransScenarioOptions(job) {
    const codes = job.selectedScenarioCodes?.length
      ? job.selectedScenarioCodes
      : STRESS_SCENARIO_OPTIONS.map((s) => s.code);
    return codes.filter((code) => getFinTransAlrTableDataForScenario(job, code).rows.length > 0);
  }

  function buildFinTransDisplayData(job, scenarioCode) {
    const scenarios = getFinTransScenarioOptions(job);
    if (!scenarios.length) return { years: [], rows: [], allScenarios: false };
    if (scenarioCode) {
      const data = getFinTransAlrTableDataForScenario(job, scenarioCode);
      return { ...data, allScenarios: false };
    }
    let years = [];
    const rows = [];
    scenarios.forEach((code) => {
      const d = getFinTransAlrTableDataForScenario(job, code);
      if (!d.rows.length) return;
      if (d.years.length > years.length) years = d.years;
      d.rows.forEach((r) => {
        rows.push({ ...r, scenarioCode: code, scenarioName: scenarioLabel(code) });
      });
    });
    return { years, rows, allScenarios: true };
  }

  function resolveFinTransViewState() {
    const sources = buildFinTransJobSources();
    const curKey = window._finTransJobKey;
    const found = sources.find((s) => s.key === curKey) || sources[0];
    const job = found?.job || null;
    const scenarioFilter = window._finTransScenarioCode ?? '';
    const data = job ? buildFinTransDisplayData(job, scenarioFilter || '') : { years: [], rows: [], allScenarios: false };
    const years = data.years || [];
    const yearSel = window._finTransYear;
    const year = yearSel === '' || yearSel == null ? null : Number(yearSel);
    const displayYears = year != null && years.includes(year) ? [year] : years;
    const scenarioOpts = job ? getFinTransScenarioOptions(job) : [];
    return {
      sources,
      job,
      srcKey: found?.key || '',
      scenarioFilter,
      scenarioOpts,
      data,
      displayYears,
      year,
      years,
    };
  }

  function renderStressResultJobFilterBar({ sources, srcKey, onChange, emptyLabel, extraHtml = '' }) {
    return `<div class="filter-bar stress-result-filter-bar">
      <select class="select" onchange="${onChange}">
        ${sources.length
    ? sources.map((s) => `<option value="${esc(s.key)}" ${srcKey === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')
    : `<option value="">${esc(emptyLabel)}</option>`}
      </select>
      ${extraHtml}
    </div>`;
  }

  function renderFinTransFilterBar(state) {
    const { sources, srcKey } = state;
    return renderStressResultJobFilterBar({
      sources,
      srcKey,
      onChange: 'CRST_APP.setFinTransJob(this.value)',
      emptyLabel: '暂无财务传导结果',
    });
  }

  function getNplProvTableDataForScenario(job, scenarioCode) {
    const capital = getJobBankBasicCapital(job);
    const spanYears = getFinTransYearSpan(job, scenarioCode);
    const previewRows = getNplProvPreviewRows(job).filter((r) => r.scenarioCode === scenarioCode);
    if (!previewRows.length) {
      return { scenarioCode, years: spanYears, rows: [] };
    }
    const results = (stressResultsByJob[job.id] || []).filter((r) => r.scenarioCode === scenarioCode);
    const rows = previewRows.map((preview) => {
      const loanAmount = preview.loanAmount || 0;
      const defaultYears = results
        .filter((r) => r.companyName === preview.companyName && r.defaultFlag)
        .map((r) => r.testYear)
        .filter(Boolean);
      const firstDefaultYear = defaultYears.length
        ? Math.min(...defaultYears)
        : preview.testYear;
      const nplByYear = {};
      const provByYear = {};
      spanYears.forEach((y) => {
        if (firstDefaultYear != null && y >= firstDefaultYear) {
          nplByYear[y] = loanAmount;
          provByYear[y] = y === firstDefaultYear ? calcNplProvisionAmount(loanAmount, capital) : 0;
        }
      });
      return { companyName: preview.companyName, nplByYear, provByYear };
    });
    return { scenarioCode, years: spanYears, rows };
  }

  function getNplProvScenarioOptions(job) {
    const codes = job.selectedScenarioCodes?.length
      ? job.selectedScenarioCodes
      : STRESS_SCENARIO_OPTIONS.map((s) => s.code);
    return codes.filter((code) => getNplProvTableDataForScenario(job, code).rows.length > 0);
  }

  function buildNplProvDisplayData(job, scenarioCode) {
    const scenarios = getNplProvScenarioOptions(job);
    if (!scenarios.length) {
      const code = finTransPrimaryScenarioCode(job);
      return { ...getNplProvTableDataForScenario(job, code), allScenarios: false };
    }
    if (scenarioCode) {
      return { ...getNplProvTableDataForScenario(job, scenarioCode), allScenarios: false };
    }
    let years = [];
    const rows = [];
    scenarios.forEach((code) => {
      const d = getNplProvTableDataForScenario(job, code);
      if (!d.rows.length) return;
      if (d.years.length > years.length) years = d.years;
      d.rows.forEach((r) => {
        rows.push({ ...r, scenarioCode: code, scenarioName: scenarioLabel(code) });
      });
    });
    return { years, rows, allScenarios: true };
  }

  function buildNplProvJobSources() {
    return stressJobs
      .filter((j) => hasNplProvResultData(j))
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
      .map((j) => ({ key: `job-${j.id}`, id: j.id, label: buildStressJobResultLabel(j), job: j }));
  }

  function resolveNplProvViewState() {
    const sources = buildNplProvJobSources();
    const curKey = window._nplProvJobKey;
    const found = sources.find((s) => s.key === curKey) || sources[0];
    const job = found?.job || null;
    const scenarioFilter = window._nplProvScenarioCode ?? '';
    const data = job ? buildNplProvDisplayData(job, scenarioFilter || '') : { years: [], rows: [], allScenarios: false };
    const years = data.years || [];
    const yearSel = window._nplProvYear;
    const year = yearSel === '' || yearSel == null ? null : Number(yearSel);
    const displayYears = year != null && years.includes(year) ? [year] : years;
    const scenarioOpts = job ? getNplProvScenarioOptions(job) : [];
    return {
      sources,
      job,
      srcKey: found?.key || '',
      scenarioFilter,
      scenarioOpts,
      data,
      displayYears,
      year,
      years,
    };
  }

  function renderNplProvFilterBar(state) {
    const { sources, srcKey } = state;
    return renderStressResultJobFilterBar({
      sources,
      srcKey,
      onChange: 'CRST_APP.setNplProvJob(this.value)',
      emptyLabel: '暂无不良和拨备结果',
    });
  }

  function hasPdLgdResultData(job) {
    if (getPdLgdScenarioOptions(job).length) return true;
    const ecls = stressEclByJob[job.id] || [];
    return ecls.length > 0 || !!(job.creditFetched && job.eclFetched);
  }

  function getPdLgdPreviewRows(job) {
    const eclMap = {};
    (stressEclByJob[job.id] || entityEcls(job.id, job)).forEach((e) => {
      eclMap[e.companyName] = e;
    });
    const recMap = Object.fromEntries((stressRecordsByJob[job.id] || entityRecords(job.id, job)).map((r) => [r.companyName, r]));
    const results = stressResultsByJob[job.id] || [];
    const pdAdjust = !!job.pdAdjustEnabled || results.length > 0;

    if (results.length) {
      return results.filter((r) => eclMap[r.companyName]).map((r) => {
        const ecl = eclMap[r.companyName];
        const rec = recMap[r.companyName] || {};
        const pdBefore = r.pdBefore ?? ecl.pd;
        const pdAfter = r.pdAfter ?? ((pdAdjust && r.impactRate != null)
          ? mockAdjustedPd(ecl.pd, r.impactRate)
          : pdBefore);
        return {
          companyName: r.companyName,
          branchName: r.branchName || rec.branchName,
          standardIndustry: r.standardIndustry || rec.standardIndustry,
          scenarioCode: r.scenarioCode,
          scenarioName: r.scenarioName || scenarioLabel(r.scenarioCode),
          testYear: r.testYear,
          pdBefore,
          pdAfter,
          lgd: ecl.lgd,
          ead: ecl.ead,
          eclAmount: ecl.eclAmount,
          impactRate: r.impactRate,
        };
      });
    }

    return Object.values(eclMap).map((e) => {
      const rec = recMap[e.companyName] || {};
      const code = job.selectedScenarioCodes?.[0] || 'BASELINE';
      return {
        companyName: e.companyName,
        branchName: rec.branchName,
        standardIndustry: rec.standardIndustry,
        scenarioCode: code,
        scenarioName: scenarioLabel(code),
        testYear: null,
        pdBefore: e.pd,
        pdAfter: e.pd,
        lgd: e.lgd,
        ead: e.ead,
        eclAmount: e.eclAmount,
        impactRate: null,
      };
    });
  }

  function buildPdLgdJobSources() {
    return stressJobs
      .filter((j) => hasPdLgdResultData(j))
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
      .map((j) => ({ key: `job-${j.id}`, id: j.id, label: buildStressJobResultLabel(j), job: j }));
  }

  function getPdLgdTableDataForScenario(job, scenarioCode) {
    const eclMap = {};
    (stressEclByJob[job.id] || entityEcls(job.id, job)).forEach((e) => {
      eclMap[e.companyName] = e;
    });
    const spanYears = getFinTransYearSpan(job, scenarioCode);
    const previewRows = getPdLgdPreviewRows(job).filter((r) => r.scenarioCode === scenarioCode);
    if (!previewRows.length) {
      const fallbackRows = Object.values(eclMap).map((e) => ({
        companyName: e.companyName,
        pdByYear: Object.fromEntries(spanYears.map((y) => [y, e.pd])),
        lgdByYear: Object.fromEntries(spanYears.map((y) => [y, e.lgd])),
      }));
      return { scenarioCode, years: spanYears, rows: fallbackRows };
    }
    const resultYears = [...new Set(previewRows.map((r) => r.testYear).filter(Boolean))].sort((a, b) => a - b);
    const years = resultYears.length ? resultYears : spanYears;
    const byCompany = new Map();
    previewRows.forEach((r) => {
      if (!byCompany.has(r.companyName)) {
        byCompany.set(r.companyName, { companyName: r.companyName, pdByYear: {}, lgdByYear: {} });
      }
      const row = byCompany.get(r.companyName);
      const pd = r.pdAfter ?? r.pdBefore ?? eclMap[r.companyName]?.pd;
      const lgd = r.lgd ?? eclMap[r.companyName]?.lgd;
      if (r.testYear != null) {
        row.pdByYear[r.testYear] = pd;
        row.lgdByYear[r.testYear] = lgd;
      }
    });
    byCompany.forEach((row) => {
      const ecl = eclMap[row.companyName];
      years.forEach((y) => {
        if (row.pdByYear[y] == null && ecl?.pd != null) row.pdByYear[y] = ecl.pd;
        if (row.lgdByYear[y] == null && ecl?.lgd != null) row.lgdByYear[y] = ecl.lgd;
      });
    });
    return { scenarioCode, years, rows: [...byCompany.values()] };
  }

  function getPdLgdScenarioOptions(job) {
    const codes = job.selectedScenarioCodes?.length
      ? job.selectedScenarioCodes
      : STRESS_SCENARIO_OPTIONS.map((s) => s.code);
    return codes.filter((code) => getPdLgdTableDataForScenario(job, code).rows.length > 0);
  }

  function buildPdLgdDisplayData(job, scenarioCode) {
    const scenarios = getPdLgdScenarioOptions(job);
    if (!scenarios.length) {
      const code = finTransPrimaryScenarioCode(job);
      return { ...getPdLgdTableDataForScenario(job, code), allScenarios: false };
    }
    if (scenarioCode) {
      const data = getPdLgdTableDataForScenario(job, scenarioCode);
      return { ...data, allScenarios: false };
    }
    let years = [];
    const rows = [];
    scenarios.forEach((code) => {
      const d = getPdLgdTableDataForScenario(job, code);
      if (!d.rows.length) return;
      if (d.years.length > years.length) years = d.years;
      d.rows.forEach((r) => {
        rows.push({ ...r, scenarioCode: code, scenarioName: scenarioLabel(code) });
      });
    });
    return { years, rows, allScenarios: true };
  }

  function getPdLgdSourceTask(job) {
    if (job?.dataSource === 'REF' && job.sourceTaskId) return getTask(job.sourceTaskId);
    return null;
  }

  function filterPdLgdPreviewRows(rows, { scenarioCode, year }) {
    return rows.filter((r) => {
      if (scenarioCode && r.scenarioCode !== scenarioCode) return false;
      if (year != null && r.testYear != null && r.testYear !== year) return false;
      return true;
    });
  }

  function dedupePdLgdPreviewByLatestYear(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const key = `${r.companyName}|${r.scenarioCode || ''}`;
      const prev = map.get(key);
      if (!prev || (r.testYear || 0) >= (prev.testYear || 0)) map.set(key, r);
    });
    return [...map.values()];
  }

  function formatPdLgdMultiplier(v) {
    if (v == null || !Number.isFinite(v)) return '-';
    return v.toFixed(4);
  }

  function formatEclAmount(v) {
    if (v == null || !Number.isFinite(v)) return '-';
    return Math.round(v).toLocaleString();
  }

  function buildPdLgdIndustryMultiplierRows(previewRows) {
    const byIndustry = new Map();
    previewRows.forEach((r) => {
      const industry = r.standardIndustry || '未分类';
      if (!byIndustry.has(industry)) {
        byIndustry.set(industry, {
          industry,
          pdBeforeSum: 0,
          pdAfterSum: 0,
          lgdBeforeSum: 0,
          lgdAfterSum: 0,
          weightSum: 0,
          count: 0,
        });
      }
      const g = byIndustry.get(industry);
      const weight = r.ead > 0 ? r.ead : 1;
      const pdBefore = r.pdBefore ?? 0;
      const pdAfter = r.pdAfter ?? pdBefore;
      const lgd = r.lgd ?? 0.45;
      g.pdBeforeSum += pdBefore * weight;
      g.pdAfterSum += pdAfter * weight;
      g.lgdBeforeSum += lgd * weight;
      g.lgdAfterSum += lgd * weight;
      g.weightSum += weight;
      g.count += 1;
    });
    return [...byIndustry.values()]
      .map((g) => {
        const pdBefore = g.weightSum > 0 ? g.pdBeforeSum / g.weightSum : 0;
        const pdAfter = g.weightSum > 0 ? g.pdAfterSum / g.weightSum : 0;
        const lgdBefore = g.weightSum > 0 ? g.lgdBeforeSum / g.weightSum : 0;
        const lgdAfter = g.weightSum > 0 ? g.lgdAfterSum / g.weightSum : 0;
        return {
          industry: g.industry,
          customerCount: g.count,
          pdBefore,
          pdAfter,
          pdMultiplier: pdBefore > 0 ? pdAfter / pdBefore : null,
          lgdBefore,
          lgdAfter,
          lgdMultiplier: lgdBefore > 0 ? lgdAfter / lgdBefore : null,
        };
      })
      .sort((a, b) => b.customerCount - a.customerCount);
  }

  function buildPdLgdEclCustomerRows(previewRows, job) {
    const srcTask = getPdLgdSourceTask(job);
    const recMap = Object.fromEntries((stressRecordsByJob[job.id] || entityRecords(job.id, job)).map((r) => [r.companyName, r]));
    const srcRecMap = srcTask
      ? Object.fromEntries((recordsByTask[srcTask.id] || []).map((r) => [r.companyName, r]))
      : {};
    return previewRows.map((r) => {
      const pdBefore = r.pdBefore ?? 0;
      const pdAfter = r.pdAfter ?? pdBefore;
      const lgd = r.lgd ?? 0.45;
      const ead = r.ead ?? 0;
      const eclBefore = pdBefore * lgd * ead;
      const eclAfter = pdAfter * lgd * ead;
      const rec = recMap[r.companyName] || {};
      const srcRec = srcRecMap[r.companyName] || rec;
      const noFin = srcTask ? recordLacksFinancialData(srcRec, srcTask) : false;
      let pdSource = '财报传导';
      if (noFin) {
        pdSource = isInternalPdRecordReady(srcRec, srcTask)
          ? (srcRec.hasInternalRatingModel ? '内评 PD' : '减估值 PD0/LGD0')
          : '无财报·待数据处理同步';
      }
      return {
        ...r,
        industry: r.standardIndustry || rec.standardIndustry || '未分类',
        pdBefore,
        pdAfter,
        lgd,
        ead,
        eclBefore,
        eclAfter,
        eclDelta: eclAfter - eclBefore,
        pdSource,
        noFinReport: noFin,
      };
    });
  }

  function buildPdLgdIndustryEclSummaryRows(eclRows) {
    const byIndustry = new Map();
    eclRows.forEach((r) => {
      const industry = r.industry || '未分类';
      if (!byIndustry.has(industry)) {
        byIndustry.set(industry, {
          industry,
          eclBeforeSum: 0,
          eclAfterSum: 0,
          eadSum: 0,
          count: 0,
        });
      }
      const g = byIndustry.get(industry);
      g.eclBeforeSum += r.eclBefore || 0;
      g.eclAfterSum += r.eclAfter || 0;
      g.eadSum += r.ead || 0;
      g.count += 1;
    });
    return [...byIndustry.values()]
      .map((g) => ({
        industry: g.industry,
        customerCount: g.count,
        eadSum: g.eadSum,
        eclBeforeSum: g.eclBeforeSum,
        eclAfterSum: g.eclAfterSum,
        eclDeltaSum: g.eclAfterSum - g.eclBeforeSum,
        weightedPdBefore: g.eadSum > 0
          ? eclRows.filter((r) => (r.industry || '未分类') === g.industry)
            .reduce((s, r) => s + (r.pdBefore || 0) * (r.ead || 0), 0) / g.eadSum
          : null,
        weightedPdAfter: g.eadSum > 0
          ? eclRows.filter((r) => (r.industry || '未分类') === g.industry)
            .reduce((s, r) => s + (r.pdAfter || 0) * (r.ead || 0), 0) / g.eadSum
          : null,
      }))
      .sort((a, b) => b.eclAfterSum - a.eclAfterSum);
  }

  function buildPdLgdNoFinReportRows(job) {
    const srcTask = getPdLgdSourceTask(job);
    if (!srcTask) return [];
    const jobNames = new Set((stressRecordsByJob[job.id] || entityRecords(job.id, job)).map((r) => r.companyName));
    return getInternalPdEligibleRecords(srcTask.id, srcTask)
      .filter((r) => jobNames.has(r.companyName))
      .map((r) => {
        const synced = isInternalPdRecordReady(r, srcTask);
        const pd = r.hasInternalRatingModel ? r.baselinePd : r.baselinePd0;
        const lgd = r.hasInternalRatingModel ? null : r.baselineLgd0;
        return {
          companyName: r.companyName,
          customerId: r.customerId || r.creditCustomerNo || '-',
          industry: r.standardIndustry || '-',
          pd: synced ? pd : null,
          lgd: synced ? lgd : null,
          pdSource: r.hasInternalRatingModel ? '内评模型 PD' : '减估值 PD0',
          lgdSource: r.hasInternalRatingModel ? '—' : '减估值 LGD0',
          synced,
        };
      });
  }

  function buildPdLgdAnalysisBundle(job, { scenarioCode, year } = {}) {
    const allPreview = getPdLgdPreviewRows(job);
    let filtered = filterPdLgdPreviewRows(allPreview, { scenarioCode, year });
    if (year == null) filtered = dedupePdLgdPreviewByLatestYear(filtered);
    const industryMultipliers = buildPdLgdIndustryMultiplierRows(filtered);
    const eclCustomers = buildPdLgdEclCustomerRows(filtered, job);
    const industryEclSummary = buildPdLgdIndustryEclSummaryRows(eclCustomers);
    const noFinReportRows = buildPdLgdNoFinReportRows(job);
    return {
      filteredPreview: filtered,
      industryMultipliers,
      eclCustomers,
      industryEclSummary,
      noFinReportRows,
    };
  }

  const pdLgdExportRegistry = {};

  function clearPdLgdExportRegistry() {
    Object.keys(pdLgdExportRegistry).forEach((k) => { delete pdLgdExportRegistry[k]; });
  }

  function registerPdLgdTableExport(id, title, headers, rows) {
    pdLgdExportRegistry[id] = { title, headers, rows: rows || [] };
  }

  function buildPdLgdTableExportText(meta) {
    return [
      meta.title,
      meta.headers.join('\t'),
      ...(meta.rows || []).map((row) => row.join('\t')),
    ].join('\n');
  }

  function exportPdLgdTable(exportId) {
    const meta = pdLgdExportRegistry[exportId];
    if (!meta) {
      toast('导出数据不可用，请刷新页面后重试', 'error');
      return;
    }
    if (!meta.rows?.length) {
      toast('当前表格暂无数据', 'info');
      return;
    }
    const downloadFileName = buildExportTitleFileName(meta.title);
    triggerExportFileDownload(downloadFileName, buildPdLgdTableExportText(meta));
    toast('已导出 Excel');
  }

  function renderPdLgdBlockHead(title, exportId) {
    return `<div class="pd-lgd-result-head">
      <h4 class="pd-lgd-result-title">${esc(title)}</h4>
      <div class="pd-lgd-result-actions">
        <button type="button" class="btn btn-default btn-sm" onclick="CRST_APP.exportPdLgdTable('${exportId}')">导出数据</button>
      </div>
    </div>`;
  }

  function pdLgdExportId(job, suffix, opts = {}) {
    const base = opts[`${suffix}TableId`] || opts[`${suffix}ExportId`] || `pd-lgd-${suffix}-${job.id}`;
    return `pd-lgd-exp-${base}`;
  }

  function buildPdLgdYearlyExportMeta(data, displayYears, showScenario) {
    const years = displayYears || data.years || [];
    const rows = data.rows || [];
    const headers = ['客户名称'];
    if (showScenario) headers.push('情景');
    years.forEach((y) => {
      headers.push(`${y}年PD`, `${y}年LGD`);
    });
    const exportRows = rows.map((r) => {
      const row = [r.companyName];
      if (showScenario) row.push(r.scenarioName || scenarioLabel(r.scenarioCode));
      years.forEach((y) => {
        row.push(formatPdValue(r.pdByYear?.[y]));
        row.push(formatPdValue(r.lgdByYear?.[y]));
      });
      return row;
    });
    return { headers, exportRows };
  }

  function buildPdLgdIndustryMultExportRows(rows) {
    return (rows || []).map((r) => [
      r.industry,
      r.customerCount,
      formatPdValue(r.pdBefore),
      formatPdValue(r.pdAfter),
      formatPdLgdMultiplier(r.pdMultiplier),
      formatPdValue(r.lgdBefore),
      formatPdValue(r.lgdAfter),
      formatPdLgdMultiplier(r.lgdMultiplier),
    ]);
  }

  function buildPdLgdNoFinExportRows(rows) {
    return (rows || []).map((r) => [
      r.companyName,
      r.customerId,
      r.industry,
      r.pdSource,
      formatPdValue(r.pd),
      r.lgdSource,
      r.lgd != null ? formatPdValue(r.lgd) : '—',
    ]);
  }

  function buildPdLgdEclCustomerExportRows(rows, showScenario) {
    return (rows || []).map((r) => {
      const base = [
        r.companyName,
        ...(showScenario ? [r.scenarioName || scenarioLabel(r.scenarioCode)] : []),
        r.industry,
        r.pdSource,
        formatPdValue(r.pdBefore),
        formatPdValue(r.pdAfter),
        formatPdValue(r.lgd),
        formatEclAmount(r.ead),
        formatEclAmount(r.eclBefore),
        formatEclAmount(r.eclAfter),
        formatEclAmount(r.eclDelta),
        r.testYear != null ? `${r.testYear}年` : '—',
      ];
      return base;
    });
  }

  function buildPdLgdIndustryEclExportRows(rows) {
    return (rows || []).map((r) => [
      r.industry,
      r.customerCount,
      formatEclAmount(r.eadSum),
      formatPdValue(r.weightedPdBefore),
      formatPdValue(r.weightedPdAfter),
      formatEclAmount(r.eclBeforeSum),
      formatEclAmount(r.eclAfterSum),
      formatEclAmount(r.eclDeltaSum),
    ]);
  }

  function renderPdLgdIndustryMultiplierTable(job, rows) {
    const thead = '<tr><th>行业</th><th class="num">客户数</th><th class="num">基期 PD</th><th class="num">压测后 PD</th><th class="num">PD 乘数</th><th class="num">基期 LGD</th><th class="num">压测后 LGD</th><th class="num">LGD 乘数</th></tr>';
    if (!rows.length) {
      return `<div class="table-wrap"><table><thead>${thead}</thead><tbody><tr><td colspan="8" class="empty-cell">当前筛选下暂无行业乘数数据</td></tr></tbody></table></div>`;
    }
    return renderFullTable(rows, thead,
      (r) => `<tr>
        <td>${esc(r.industry)}</td>
        <td class="num">${r.customerCount}</td>
        <td class="num">${formatPdValue(r.pdBefore)}</td>
        <td class="num">${formatPdValue(r.pdAfter)}</td>
        <td class="num">${formatPdLgdMultiplier(r.pdMultiplier)}</td>
        <td class="num">${formatPdValue(r.lgdBefore)}</td>
        <td class="num">${formatPdValue(r.lgdAfter)}</td>
        <td class="num">${formatPdLgdMultiplier(r.lgdMultiplier)}</td>
      </tr>`,
      8);
  }

  function renderPdLgdNoFinReportTable(job, rows) {
    const thead = '<tr><th>客户名称</th><th>客户号</th><th>所属行业</th><th>PD 来源</th><th class="num">PD</th><th>LGD 来源</th><th class="num">LGD</th></tr>';
    if (!rows.length) {
      return `<div class="table-wrap"><table><thead>${thead}</thead><tbody><tr><td colspan="7" class="empty-cell">暂无无财报客户</td></tr></tbody></table></div>`;
    }
    return renderFullTable(rows, thead,
      (r) => `<tr>
        <td>${esc(r.companyName)}</td>
        <td>${esc(r.customerId)}</td>
        <td>${esc(r.industry)}</td>
        <td>${esc(r.pdSource)}</td>
        <td class="num">${formatPdValue(r.pd)}</td>
        <td>${esc(r.lgdSource)}</td>
        <td class="num">${r.lgd != null ? formatPdValue(r.lgd) : '—'}</td>
      </tr>`,
      7);
  }

  function renderPdLgdEclCustomerTable(job, rows, opts = {}) {
    const showScenario = opts.showScenario !== false;
    const scenarioHead = showScenario ? '<th>情景</th>' : '';
    const thead = `<tr><th>客户名称</th>${scenarioHead}<th>所属行业</th><th>PD 来源</th><th class="num">PD(前)</th><th class="num">PD(后)</th><th class="num">LGD</th><th class="num">EAD</th><th class="num">ECL(前)</th><th class="num">ECL(后)</th><th class="num">ECL 变化</th><th>年份</th></tr>`;
    const colCount = 11 + (showScenario ? 1 : 0);
    if (!rows.length) {
      return `<div class="table-wrap"><table><thead>${thead}</thead><tbody><tr><td colspan="${colCount}" class="empty-cell">当前筛选下暂无 ECL 数据</td></tr></tbody></table></div>`;
    }
    return renderFullTable(rows, thead,
      (r) => {
        const scCell = showScenario ? `<td>${esc(r.scenarioName || scenarioLabel(r.scenarioCode))}</td>` : '';
        const srcTag = r.noFinReport
          ? `<span class="tag tag-default">${esc(r.pdSource)}</span>`
          : esc(r.pdSource);
        return `<tr>
          <td>${esc(r.companyName)}</td>
          ${scCell}
          <td>${esc(r.industry)}</td>
          <td>${srcTag}</td>
          <td class="num">${formatPdValue(r.pdBefore)}</td>
          <td class="num">${formatPdValue(r.pdAfter)}</td>
          <td class="num">${formatPdValue(r.lgd)}</td>
          <td class="num">${formatEclAmount(r.ead)}</td>
          <td class="num">${formatEclAmount(r.eclBefore)}</td>
          <td class="num">${formatEclAmount(r.eclAfter)}</td>
          <td class="num">${formatEclAmount(r.eclDelta)}</td>
          <td>${r.testYear != null ? `${r.testYear}年` : '—'}</td>
        </tr>`;
      },
      colCount);
  }

  function renderPdLgdIndustryEclSummaryTable(job, rows) {
    const thead = '<tr><th>行业</th><th class="num">客户数</th><th class="num">EAD 合计</th><th class="num">加权 PD(前)</th><th class="num">加权 PD(后)</th><th class="num">ECL(前) 合计</th><th class="num">ECL(后) 合计</th><th class="num">ECL 变化</th></tr>';
    if (!rows.length) {
      return `<div class="table-wrap"><table><thead>${thead}</thead><tbody><tr><td colspan="8" class="empty-cell">当前筛选下暂无行业 ECL 汇总</td></tr></tbody></table></div>`;
    }
    return renderFullTable(rows, thead,
      (r) => `<tr>
        <td>${esc(r.industry)}</td>
        <td class="num">${r.customerCount}</td>
        <td class="num">${formatEclAmount(r.eadSum)}</td>
        <td class="num">${formatPdValue(r.weightedPdBefore)}</td>
        <td class="num">${formatPdValue(r.weightedPdAfter)}</td>
        <td class="num">${formatEclAmount(r.eclBeforeSum)}</td>
        <td class="num">${formatEclAmount(r.eclAfterSum)}</td>
        <td class="num">${formatEclAmount(r.eclDeltaSum)}</td>
      </tr>`,
      8);
  }

  function renderPdLgdAnalysisContent(job, state, opts = {}) {
    clearPdLgdExportRegistry();
    const { displayYears, data } = state;
    const bundle = buildPdLgdAnalysisBundle(job, { scenarioCode: '', year: null });
    const showScenarioInEcl = bundle.eclCustomers.some((r) => r.scenarioCode);
    const showScenarioInYearly = data?.allScenarios;
    const yearlyTitle = '客户 PD/LGD 年度明细';
    const industryMultTitle = '行业 PD/LGD 乘数';
    const noFinTitle = '无财报客户 PD/LGD';
    const eclCustomerTitle = '客户 ECL 明细';
    const industryEclTitle = '行业 ECL 汇总';

    const yearlyExportId = pdLgdExportId(job, 'yearly', opts);
    const industryMultExportId = pdLgdExportId(job, 'industryMult', opts);
    const noFinExportId = pdLgdExportId(job, 'noFin', opts);
    const eclCustomerExportId = pdLgdExportId(job, 'eclCustomer', opts);
    const industryEclExportId = pdLgdExportId(job, 'industryEcl', opts);

    if (data?.rows?.length) {
      const yearlyExport = buildPdLgdYearlyExportMeta(data, displayYears, showScenarioInYearly);
      registerPdLgdTableExport(yearlyExportId, yearlyTitle, yearlyExport.headers, yearlyExport.exportRows);
    } else {
      registerPdLgdTableExport(yearlyExportId, yearlyTitle, ['客户名称'], []);
    }
    registerPdLgdTableExport(
      industryMultExportId,
      industryMultTitle,
      ['行业', '客户数', '基期 PD', '压测后 PD', 'PD 乘数', '基期 LGD', '压测后 LGD', 'LGD 乘数'],
      buildPdLgdIndustryMultExportRows(bundle.industryMultipliers),
    );
    registerPdLgdTableExport(
      noFinExportId,
      noFinTitle,
      ['客户名称', '客户号', '所属行业', 'PD 来源', 'PD', 'LGD 来源', 'LGD'],
      buildPdLgdNoFinExportRows(bundle.noFinReportRows),
    );
    registerPdLgdTableExport(
      eclCustomerExportId,
      eclCustomerTitle,
      [
        '客户名称',
        ...(showScenarioInEcl ? ['情景'] : []),
        '所属行业', 'PD 来源', 'PD(前)', 'PD(后)', 'LGD', 'EAD', 'ECL(前)', 'ECL(后)', 'ECL 变化', '年份',
      ],
      buildPdLgdEclCustomerExportRows(bundle.eclCustomers, showScenarioInEcl),
    );
    registerPdLgdTableExport(
      industryEclExportId,
      industryEclTitle,
      ['行业', '客户数', 'EAD 合计', '加权 PD(前)', '加权 PD(后)', 'ECL(前) 合计', 'ECL(后) 合计', 'ECL 变化'],
      buildPdLgdIndustryEclExportRows(bundle.industryEclSummary),
    );

    const yearlyTable = data?.rows?.length
      ? renderPdLgdYearlyTable(job, data, {
        displayYears,
        showScenarioColumn: showScenarioInYearly,
      })
      : '';
    const yearlySection = yearlyTable ? `
      <section class="pd-lgd-result-block">
        ${renderPdLgdBlockHead(yearlyTitle, yearlyExportId)}
        ${yearlyTable}
      </section>` : '';
    return `
      ${opts.showFilterBar !== false ? renderPdLgdFilterBar(state) : ''}

      ${yearlySection}

      <section class="pd-lgd-result-block">
        ${renderPdLgdBlockHead(industryMultTitle, industryMultExportId)}
        ${renderPdLgdIndustryMultiplierTable(job, bundle.industryMultipliers)}
      </section>

      <section class="pd-lgd-result-block">
        ${renderPdLgdBlockHead(noFinTitle, noFinExportId)}
        ${renderPdLgdNoFinReportTable(job, bundle.noFinReportRows)}
      </section>

      <section class="pd-lgd-result-block">
        ${renderPdLgdBlockHead(eclCustomerTitle, eclCustomerExportId)}
        ${renderPdLgdEclCustomerTable(job, bundle.eclCustomers, {
      showScenario: showScenarioInEcl,
    })}
      </section>

      <section class="pd-lgd-result-block">
        ${renderPdLgdBlockHead(industryEclTitle, industryEclExportId)}
        ${renderPdLgdIndustryEclSummaryTable(job, bundle.industryEclSummary)}
      </section>`;
  }

  function resolvePdLgdViewState() {
    const sources = buildPdLgdJobSources();
    const curKey = window._pdLgdJobKey;
    const found = sources.find((s) => s.key === curKey) || sources[0];
    const job = found?.job || null;
    const data = job ? buildPdLgdDisplayData(job, '') : { years: [], rows: [], allScenarios: false };
    const years = data.years || [];
    const displayYears = years;
    return {
      sources,
      job,
      srcKey: found?.key || '',
      data,
      displayYears,
      years,
    };
  }

  function renderPdLgdFilterBar(state) {
    const { sources, srcKey } = state;
    return renderStressResultJobFilterBar({
      sources,
      srcKey,
      onChange: 'CRST_APP.setPdLgdJob(this.value)',
      emptyLabel: '暂无 PD/LGD 结果',
    });
  }

  function formatPdValue(v) {
    if (v == null || v === '' || !Number.isFinite(v)) return '-';
    return (v * 100).toFixed(2) + '%';
  }

  function renderPdLgdYearlyTable(job, data, opts = {}) {
    const years = opts.displayYears || data.years || [];
    const rows = data.rows || [];
    const showScenario = opts.showScenarioColumn ?? !!data.allScenarios;
    const scenarioHead = showScenario ? '<th rowspan="2">情景</th>' : '';
    const yearGroupHead = years.map((y) => `<th colspan="2" class="num">${y}年</th>`).join('');
    const yearSubHead = years.map(() => '<th class="num">PD</th><th class="num">LGD</th>').join('');
    const thead = `<tr><th rowspan="2">客户名称</th>${scenarioHead}${yearGroupHead}</tr><tr>${yearSubHead}</tr>`;
    const colCount = 1 + (showScenario ? 1 : 0) + years.length * 2;
    if (!rows.length || !years.length) {
      return `<div class="table-wrap"><table><thead>${thead}</thead><tbody><tr><td colspan="${Math.max(6, colCount)}" class="empty-cell">当前筛选下暂无 PD/LGD 数据</td></tr></tbody></table></div>`;
    }
    return renderFullTable(rows, thead,
      (r) => {
        const scCell = showScenario ? `<td>${esc(r.scenarioName || scenarioLabel(r.scenarioCode))}</td>` : '';
        const yearCells = years.map((y) =>
          `<td class="num">${formatPdValue(r.pdByYear?.[y])}</td><td class="num">${formatPdValue(r.lgdByYear?.[y])}</td>`).join('');
        return `<tr><td>${esc(r.companyName)}</td>${scCell}${yearCells}</tr>`;
      },
      Math.max(6, colCount));
  }

  function renderPdLgdResultsPage() {
    const state = resolvePdLgdViewState();
    const { sources, job } = state;
    if (!sources.length) {
      return `
        <div class="card">
          <div class="toolbar"><h2 class="page-title">PD/LGD计算</h2></div>
          <div class="empty fin-trans-empty">暂无 PD/LGD 计算结果。请先在压测任务中完成「PD/LGD 计算」步骤。</div>
        </div>`;
    }
    if (!job) {
      return `
        <div class="card">
          <div class="toolbar"><h2 class="page-title">PD/LGD计算</h2></div>
          <div class="empty fin-trans-empty">请选择压测任务查看 PD/LGD 结果。</div>
        </div>`;
    }
    return `
      <div class="card pd-lgd-page">
        <div class="toolbar"><h2 class="page-title">PD/LGD计算</h2></div>
        ${renderPdLgdFilterBar(state)}
        ${renderPdLgdAnalysisContent(job, state, { showFilterBar: false })}
      </div>`;
  }

  function hasFinTransResultData(job) {
    return getFinTransAlrTableData(job).rows.length > 0;
  }

  function renderFinTransAlrTable(job, data, opts = {}) {
    const years = opts.displayYears || data.years || [];
    const rows = data.rows || [];
    const showScenario = opts.showScenarioColumn ?? !!data.allScenarios;
    if (!rows.length || !years.length) {
      return '<div class="empty" style="padding:24px 0">当前筛选下暂无数据</div>';
    }
    const scenarioHead = showScenario ? '<th>情景</th>' : '';
    const yearHead = years.map((y) => `<th class="num">${y}年</th>`).join('');
    const tableId = opts.tableId || `fin-trans-alr-${job.id}`;
    const colCount = years.length + 1 + (showScenario ? 1 : 0);
    return renderPagedTable(tableId, rows,
      `<tr><th>客户名称</th>${scenarioHead}${yearHead}</tr>`,
      (r) => {
        const scCell = showScenario ? `<td>${esc(r.scenarioName || scenarioLabel(r.scenarioCode))}</td>` : '';
        return `<tr><td>${esc(r.companyName)}</td>${scCell}${years.map((y) => `<td class="num">${formatAlrPercent(r.alrByYear[y])}</td>`).join('')}</tr>`;
      },
      Math.max(6, colCount));
  }

  function renderFinTransResultsPage() {
    const state = resolveFinTransViewState();
    const { sources, job } = state;
    if (!sources.length) {
      return `
        <div class="card">
          <div class="toolbar"><h2 class="page-title">财务传导</h2></div>
          <div class="empty fin-trans-empty">暂无财务传导结果。请先在「情景分析」中配置压测情景并执行财务传导。</div>
        </div>`;
    }
    const adjustmentTable = job
      ? renderDefaultAdjustmentDetailTable(null, [], {
        rows: buildFinTransDefaultAdjustmentRows(job),
        showExport: true,
        exportHandler: 'CRST_APP.exportFinTransDefaultAdjustmentTable()',
      })
      : '<div class="empty" style="padding:24px 0">暂无违约调整明细</div>';
    return `
      <div class="card">
        <div class="toolbar"><h2 class="page-title">财务传导</h2></div>
        ${renderFinTransFilterBar(state)}
        ${adjustmentTable}
      </div>`;
  }

  function formatNplProvAmount(val) {
    if (val == null || val === '' || !Number.isFinite(val) || val === 0) return '-';
    return Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function renderNplProvYearlyTable(job, data, opts = {}) {
    const years = opts.displayYears || data.years || [];
    const rows = data.rows || [];
    const showScenario = opts.showScenarioColumn ?? !!data.allScenarios;
    if (!rows.length || !years.length) {
      return '<div class="empty" style="padding:24px 0">当前筛选下暂无不良和拨备数据</div>';
    }
    const scenarioHead = showScenario ? '<th rowspan="2">情景</th>' : '';
    const yearGroupHead = years.map((y) => `<th colspan="2" class="num">${y}年</th>`).join('');
    const yearSubHead = years.map(() => '<th class="num">不良贷款余额（万元）</th><th class="num">拨备计提金额（万元）</th>').join('');
    const tableId = opts.tableId || `npl-prov-${job.id}`;
    const colCount = 1 + (showScenario ? 1 : 0) + years.length * 2;
    return renderPagedTable(tableId, rows,
      `<tr><th rowspan="2">客户名称</th>${scenarioHead}${yearGroupHead}</tr><tr>${yearSubHead}</tr>`,
      (r) => {
        const scCell = showScenario ? `<td>${esc(r.scenarioName || scenarioLabel(r.scenarioCode))}</td>` : '';
        const yearCells = years.map((y) =>
          `<td class="num">${formatNplProvAmount(r.nplByYear?.[y])}</td><td class="num">${formatNplProvAmount(r.provByYear?.[y])}</td>`).join('');
        return `<tr><td>${esc(r.companyName)}</td>${scCell}${yearCells}</tr>`;
      },
      Math.max(6, colCount));
  }

  function renderNplProvResultsPage() {
    const state = resolveNplProvViewState();
    const { sources, job } = state;
    if (!sources.length) {
      return `
        <div class="card">
          <div class="toolbar"><h2 class="page-title">不良和拨备计算</h2></div>
          <div class="empty fin-trans-empty">暂无不良和拨备计算结果。请先在「情景分析」完成压测，并确保数据处理中已录入贷款拨备率与拨备覆盖率。</div>
        </div>`;
    }
    const tables = job
      ? renderNplProvSummaryTables(job, '')
      : '';
    return `
      <div class="card">
        <div class="toolbar"><h2 class="page-title">不良和拨备计算</h2></div>
        ${renderNplProvFilterBar(state)}
        ${tables || '<div class="empty" style="padding:24px 0">当前筛选下暂无不良和拨备汇总数据</div>'}
      </div>`;
  }

  function stressJobListActions(j) {
    return [
      `<button type="button" class="btn btn-link" onclick="CRST_APP.viewStressJob(${j.id})">查看</button>`,
      `<button type="button" class="btn btn-link" onclick="CRST_APP.editStressJob(${j.id})">编辑</button>`,
      `<button type="button" class="btn btn-link" onclick="CRST_APP.deleteStressJob(${j.id})">删除</button>`,
      `<button type="button" class="btn btn-link" onclick="CRST_APP.viewStressResults(${j.id})">查看结果</button>`,
      `<button type="button" class="btn btn-link" onclick="CRST_APP.viewStressJobOriginalData(${j.id})">查看原始数据</button>`,
    ].join('');
  }

  function renderStressJobList(pageId, title) {
    const filtered = filterStressJobList();
    const f = stressJobFilters;
    const taskOpts = [...tasks]
      .sort((a, b) => String(a.taskName).localeCompare(String(b.taskName), 'zh-CN'))
      .map((t) => `<option value="${t.id}" ${String(f.sourceTaskId) === String(t.id) ? 'selected' : ''}>${esc(t.taskName)}</option>`)
      .join('');
    const table = renderPagedTable('stress-jobs-all', filtered,
      '<tr><th>压测任务名称</th><th>压测情景</th><th>数据来源</th><th>关联数据任务</th><th>数据条数</th><th>更新人</th><th>更新时间</th><th>操作</th></tr>',
      (j) => `<tr>
        <td>${esc(j.jobName)}</td>
        <td>${renderScenarioTags(j.selectedScenarioCodes)}</td>
        <td>${stressDataSourceTag(j.dataSource)}</td>
        <td>${j.dataSource === 'REF' ? esc(j.sourceTaskName || '-') : '-'}</td>
        <td>${(j.recordCount || 0).toLocaleString()}</td>
        <td>${esc(getStressJobUpdatedBy(j))}</td>
        <td>${esc(j.updatedAt || j.createdAt)}</td>
        <td><div class="action-group action-group--nowrap">${stressJobListActions(j)}</div></td>
      </tr>`, 8, 'stress-job-list-table');
    return `
      <div class="card">
        <div class="toolbar">
          <h2 class="page-title">${title}</h2>
          <button class="btn btn-primary" onclick="CRST_APP.openCreateStressJobModal('${pageId}')">新建压测任务</button>
        </div>
        ${pageId !== 'scenario-analysis' ? `<p class="stress-step-hint">${'同一压测任务可在左侧步骤菜单间切换，按「数据处理 → 财务传导 → PD/LGD → 不良拨备」流水线推进；情景在本任务内多选。'}</p>` : ''}
        <div class="task-filter-bar">
          <div class="filter-item">
            <label>压测任务名称</label>
            <input class="input" id="sf_name_all" placeholder="模糊搜索" value="${esc(f.name)}" onkeydown="if(event.key==='Enter')CRST_APP.searchStressJobs()" />
          </div>
          <div class="filter-item">
            <label>关联数据任务</label>
            <select class="select" id="sf_task_all">
              <option value="">全部</option>
              ${taskOpts}
            </select>
          </div>
          <div class="filter-item filter-actions">
            <button type="button" class="btn btn-primary" onclick="CRST_APP.searchStressJobs()">查询</button>
            <button type="button" class="btn btn-default" onclick="CRST_APP.resetStressJobFilters()">重置</button>
          </div>
        </div>
        ${table}
      </div>`;
  }

  function renderStressStepModule(pageId) {
    if (pageId === 'stress-fin-trans') {
      moduleContext = { modulePage: pageId, embedded: false };
      return `<div class="module-page">${renderFinTransResultsPage()}</div>`;
    }
    if (pageId === 'stress-pd-lgd') {
      moduleContext = { modulePage: pageId, embedded: false };
      return `<div class="module-page">${renderPdLgdResultsPage()}</div>`;
    }
    if (pageId === 'stress-npl-prov') {
      moduleContext = { modulePage: pageId, embedded: false };
      return `<div class="module-page">${renderNplProvResultsPage()}</div>`;
    }
    const meta = getStressStepMeta(pageId);
    const title = meta?.listTitle || meta?.title || '气候风险压测';
    moduleContext = { modulePage: pageId, embedded: false };
    let body;
    if (stressJobListMode || !currentStressJobId) {
      body = renderStressJobList(pageId, title);
      if (pendingCreateStressJob) {
        setTimeout(() => openCreateStressJobModal(pageId, pendingCreateStressJob.sourceTaskId), 0);
        pendingCreateStressJob = null;
      }
    } else {
      const job = getStressJob(currentStressJobId);
      if (!job) {
        stressJobListMode = true;
        currentStressJobId = null;
        body = renderStressJobList(pageId, title);
      } else {
        moduleContext = { modulePage: pageId, stressJobId: job.id, embedded: true };
        stressJobDetailStep = meta?.stepIndex ?? 1;
        taskViewMode = job.status === 'COMPLETED' && !taskEditMode;
        const panel = renderTaskDetail();
        moduleContext.embedded = false;
        body = `
          <div class="breadcrumb-row">
            <div class="breadcrumb">
              <a onclick="CRST_APP.backToStressJobList('${pageId}')">${esc(meta?.title || '压测')}</a> / ${esc(job.jobName)}
            </div>
          </div>
          ${panel}`;
      }
    }
    return `<div class="module-page">${body}</div>`;
  }

  function searchStressJobs() {
    stressJobFilters.name = document.getElementById('sf_name_all')?.value || '';
    stressJobFilters.status = '';
    stressJobFilters.sourceTaskId = document.getElementById('sf_task_all')?.value || '';
    stressJobFilters.periodStart = '';
    stressJobFilters.periodEnd = '';
    getListPager('stress-jobs-all').page = 1;
    render();
  }

  function resetStressJobFilters() {
    stressJobFilters.name = '';
    stressJobFilters.status = '';
    stressJobFilters.sourceTaskId = '';
    stressJobFilters.periodStart = '';
    stressJobFilters.periodEnd = '';
    getListPager('stress-jobs-all').page = 1;
    render();
  }

  function openStressJob(jobId, pageId, opts = {}) {
    if (isStressResultViewPage(pageId)) {
      presetStressResultViewJob(pageId, jobId);
      navigate(pageId || 'stress-fin-trans');
      return;
    }
    currentStressJobId = jobId;
    stressJobListMode = false;
    taskDraftMode = false;
    if (opts.editMode) {
      taskEditMode = true;
      taskViewMode = false;
    } else {
      taskEditMode = false;
      taskViewMode = getStressJob(jobId)?.status === 'COMPLETED';
    }
    const meta = getStressStepMeta(pageId || 'stress-fin-trans');
    navigate(pageId || 'stress-fin-trans', jobId, meta?.stepIndex ?? 1);
  }

  function backToStressJobList(pageId) {
    stressJobListMode = true;
    currentStressJobId = null;
    taskEditMode = false;
    taskViewMode = false;
    navigate(pageId);
  }

  function viewStressJob(jobId) {
    if (!getStressJob(jobId)) return;
    openStressJob(jobId, 'scenario-analysis');
  }

  function buildStressJobImportExportText(job, records) {
    const labels = DATA_PROCESS_OFFLINE_EXPORT_FIELDS.map((f) => f.label);
    const keys = DATA_PROCESS_OFFLINE_EXPORT_FIELDS.map((f) => f.key);
    return [
      '气候风险压测财务数据（原始导入数据）',
      `压测任务：${job.jobName}`,
      `导出条数：${records.length}`,
      '',
      labels.join('\t'),
      ...records.map((r) => keys.map((k) => formatOfflineExportCell(r, k)).join('\t')),
    ].join('\n');
  }

  function viewStressJobOriginalData(jobId) {
    const j = getStressJob(jobId);
    if (!j) { toast('任务不存在', 'error'); return; }
    if (j.dataSource === 'REF') {
      if (!j.sourceTaskId) { toast('未关联数据处理任务', 'error'); return; }
      const source = getTask(j.sourceTaskId);
      if (!source) { toast('关联的数据处理任务不存在', 'error'); return; }
      taskEditMode = false;
      taskViewMode = true;
      dataProcessListMode = false;
      syncDataProcessTaskViewState(source);
      navigateDataProcessTask(j.sourceTaskId, 1);
      return;
    }
    const records = stressRecordsByJob[jobId] || [];
    if (!records.length) { toast('暂无原始导入数据', 'info'); return; }
    triggerExportFileDownload(
      buildExportTitleFileName('气候风险压测原始数据'),
      buildStressJobImportExportText(j, records),
    );
    addStressJobLog(jobId, `导出原始导入数据 ${records.length} 条`);
    toast(`已下载原始数据 ${records.length} 条`);
  }

  function editStressJob(jobId) {
    if (!getStressJob(jobId)) return;
    const pageId = isScenarioAnalysisPage() ? 'scenario-analysis' : stressStepPageForIndex(stressJobDetailStep || 1);
    openStressJob(jobId, pageId, { editMode: true });
  }

  function viewStressResults(jobId) {
    const j = getStressJob(jobId);
    if (j) {
      window._resultStressJobId = jobId;
      window._resultSourceKey = `job-${jobId}`;
    }
    window._resultTaskId = j?.sourceTaskId || null;
    navigate('results');
  }

  function deleteStressJob(jobId) {
    const j = getStressJob(jobId);
    if (!j) { toast('任务不存在', 'error'); return; }
    openConfirmDeleteModal({
      title: '删除压测任务确认',
      messageHtml: `请您确认是否删除该压测任务：<strong>${esc(j.jobName || '-')}</strong>？`,
      onConfirm: () => {
        const idx = stressJobs.findIndex((x) => x.id === jobId);
        if (idx >= 0) stressJobs.splice(idx, 1);
        delete stressRecordsByJob[jobId];
        delete stressCreditByJob[jobId];
        delete stressEclByJob[jobId];
        delete stressResultsByJob[jobId];
        delete stressFinTransByJob[jobId];
        delete stressJobLogs[jobId];
        if (window._resultSourceKey === `job-${jobId}`) window._resultSourceKey = '';
        if (window._finTransJobKey === `job-${jobId}`) window._finTransJobKey = '';
        if (window._pdLgdJobKey === `job-${jobId}`) window._pdLgdJobKey = '';
        if (window._nplProvJobKey === `job-${jobId}`) window._nplProvJobKey = '';
        if (currentStressJobId === jobId) backToStressJobList(currentPage);
        else render();
        toast('已删除');
      },
    });
  }

  function resetStressImportFiles() {
    stressImportFiles = {};
    STRESS_IMPORT_FILE_SPECS.forEach((spec) => {
      const hint = document.getElementById(`sj_import_hint_${spec.key}`);
      const row = document.getElementById(`sj_import_row_${spec.key}`);
      const btn = row?.querySelector('.btn-upload');
      if (hint) {
        hint.textContent = '';
        hint.hidden = true;
      }
      if (row) row.classList.remove('is-uploaded');
      if (btn) btn.textContent = '选择文件';
    });
  }

  function validateStressImportFiles() {
    const missing = STRESS_IMPORT_FILE_SPECS.filter((spec) => !stressImportFiles[spec.key]);
    if (!missing.length) return { ok: true };
    return { ok: false, msg: `请上传：${missing.map((s) => s.label).join('、')}` };
  }

  function openCreateStressJobModal(fromPage, presetSourceTaskId) {
    createStressJobFromPage = fromPage || 'scenario-analysis';
    resetStressImportFiles();
    document.getElementById('sj_name').value = '';
    const processed = getProcessedDataTasks();
    const sel = document.getElementById('sj_ref_task');
    if (processed.length) {
      sel.innerHTML = processed.map((t) => {
        const cnt = getTaskRecordCountForRef(t);
        return `<option value="${t.id}" ${presetSourceTaskId === t.id ? 'selected' : ''}>${esc(t.taskName)}（${cnt.toLocaleString()} 条，${getTaskReportYear(t)}年）</option>`;
      }).join('');
      document.querySelector('input[name="sj_source"][value="REF"]').checked = true;
    } else {
      sel.innerHTML = '<option value="">暂无已完成数据处理的任务</option>';
      document.querySelector('input[name="sj_source"][value="IMPORT"]').checked = true;
    }
    onStressJobSourceChange();
    showModal('modalCreateStressJob');
  }

  function onStressJobSourceChange() {
    const src = document.querySelector('input[name="sj_source"]:checked')?.value || 'REF';
    document.getElementById('sj_ref_panel').style.display = src === 'REF' ? '' : 'none';
    document.getElementById('sj_import_panel').style.display = src === 'IMPORT' ? '' : 'none';
  }

  function mockPickStressImportFile(key) {
    const spec = STRESS_IMPORT_FILE_SPECS.find((s) => s.key === key);
    if (!spec) return;
    stressImportFiles[key] = spec.fileName;
    const hint = document.getElementById(`sj_import_hint_${key}`);
    const row = document.getElementById(`sj_import_row_${key}`);
    const btn = row?.querySelector('.btn-upload');
    if (hint) {
      hint.textContent = spec.fileName;
      hint.hidden = false;
    }
    if (row) row.classList.add('is-uploaded');
    if (btn) btn.textContent = '重新选择';
  }

  function confirmCreateStressJob() {
    const fromPage = createStressJobFromPage || 'scenario-analysis';
    const name = document.getElementById('sj_name')?.value?.trim();
    if (!name) { toast('请填写压测任务名称', 'error'); return; }
    const src = document.querySelector('input[name="sj_source"]:checked')?.value || 'REF';
    const jobId = allocStressJobId();
    let job;
    if (src === 'REF') {
      const taskId = parseInt(document.getElementById('sj_ref_task')?.value, 10);
      const source = getTask(taskId);
      if (!source) { toast('请选择数据处理任务', 'error'); return; }
      const baseRecs = recordsByTask[taskId] || [];
      const count = getTaskRecordCountForRef(source);
      const cloned = cloneFinancialRecords(baseRecs.length ? baseRecs : mockSyncRecords(taskId, source), count);
      stressRecordsByJob[jobId] = cloned;
      const sourcePeriod = taskReportPeriodRange(source);
      job = {
        id: jobId,
        methodKey: 'pipeline',
        jobName: name,
        jobCode: genCode('ST-JOB'),
        dataSource: 'REF',
        sourceTaskId: taskId,
        sourceTaskName: source.taskName,
        recordCount: count,
        usableCount: countUsableFinancialRecords(cloned),
        reportYear: getTaskReportYear(source),
        loanType: source.loanType,
        loanRegion: source.loanRegion,
        reportPeriodStart: sourcePeriod.start,
        reportPeriodEnd: sourcePeriod.end,
        dataCaliber: '05财报',
        status: 'READY',
        factorVersion: source.factorVersion,
        scenarioVersion: source.scenarioVersion || getPublishedScenarioVersion(),
        creditFetched: false,
        eclFetched: false,
        finTransDone: false,
        createdAt: nowStr(),
        updatedAt: nowStr(),
      };
      addStressJobLog(jobId, `新建压测任务：引用数据处理任务「${source.taskName}」，复制 ${count.toLocaleString()} 条财务数据`);
    } else {
      const importCheck = validateStressImportFiles();
      if (!importCheck.ok) { toast(importCheck.msg, 'error'); return; }
      const end = `${new Date().getFullYear()}-12-31`;
      const start = `${new Date().getFullYear()}-01-01`;
      const count = 500;
      const tpl = cloneFinancialRecords(mockSyncRecords(0, { syncFilters: { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 } }), Math.min(count, 5000));
      stressRecordsByJob[jobId] = tpl;
      job = {
        id: jobId,
        methodKey: 'pipeline',
        jobName: name,
        jobCode: genCode('ST-JOB'),
        dataSource: 'IMPORT',
        sourceTaskId: null,
        sourceTaskName: null,
        recordCount: tpl.length,
        usableCount: countUsableFinancialRecords(tpl),
        reportPeriodStart: start,
        reportPeriodEnd: end,
        dataCaliber: '05财报',
        importFiles: { ...stressImportFiles },
        status: 'READY',
        factorVersion: suggestFactorVersionByReportEnd(end),
        scenarioVersion: getPublishedScenarioVersion(),
        creditFetched: false,
        eclFetched: false,
        finTransDone: false,
        createdAt: nowStr(),
        updatedAt: nowStr(),
      };
      addStressJobLog(jobId, `新建压测任务：导入 4 份 Excel（客户基础 ${tpl.length.toLocaleString()} 条）`);
    }
    job.selectedScenarioCodes = STRESS_SCENARIO_OPTIONS.map((s) => s.code);
    stressJobs.unshift(job);
    hideModal();
    toast('压测任务已创建');
    openStressJob(jobId, fromPage);
  }

  function computeIndustryDefaultMonitor(res, year) {
    const map = new Map();
    res.filter((r) => {
      if (year && r.testYear !== year) return false;
      const prev = r.prevStatus || 'NORMAL';
      const post = r.postStatus || (r.defaultFlag ? 'DEFAULT' : 'NORMAL');
      return (prev === 'NORMAL' || prev === 'ATTENTION') && (post === 'DEFAULT' || post === 'SUBSTANDARD' || post === 'DOUBTFUL' || post === 'LOSS' || r.defaultFlag);
    }).forEach((r) => {
      const ind = r.standardIndustry || '未分类';
      if (!map.has(ind)) map.set(ind, []);
      map.get(ind).push(r);
    });
    return [...map.entries()].map(([name, rows]) => ({ name, count: rows.length, rows })).sort((a, b) => b.count - a.count);
  }

  function renderRegulatoryReportCard(taskId) {
    const t = getTask(taskId);
    if (!t) return '<div class="empty">任务不存在</div>';
    const results = resultsByTask[taskId] || [];
    if (!results.length) {
      return '<div class="empty" style="padding:24px 0">暂无压测结果，请先在压测方法中完成压测。</div>';
    }
    const regulatoryAt = t.regulatoryReportGeneratedAt;
    const reportDisabled = !canUseApplicationReport(t);
    return `
      <div class="application-card application-card--regulatory application-card--standalone">
        <h4 class="application-card-title">外部监管报送</h4>
        <div class="toolbar application-card-actions">
          <button type="button" class="btn btn-primary" ${reportDisabled ? 'disabled' : ''} onclick="CRST_APP.generateRegulatoryReport(${taskId})">生成监管报送 Excel</button>
        </div>
        ${regulatoryAt ? `<p class="flow-hint">最近生成：${esc(regulatoryAt)}</p>` : ''}
        <h5 class="application-subtitle">报送文件包</h5>
        <ul class="application-file-list">
          ${REGULATORY_REPORT_FILES.map((f) => `<li><strong>${esc(f.name)}</strong><span>${esc(f.desc)}</span></li>`).join('')}
        </ul>
      </div>`;
  }

  function renderApplicationReportInternalCard(taskId) {
    const t = getTask(taskId);
    if (!t) return '<div class="empty">任务不存在</div>';
    const results = resultsByTask[taskId] || [];
    if (!results.length) {
      return '<div class="empty" style="padding:24px 0">暂无压测结果，请先在压测方法中完成压测。</div>';
    }
    const warnings = getRiskWarningRows(taskId);
    const ranking = computeIndustryBadLoanRanking(results, window._appReportYear || null);
    const warnedAt = t.riskWarningIssuedAt;
    const reportDisabled = !canUseApplicationReport(t);
    return `
      <div class="application-card application-card--internal application-card--standalone">
        <h4 class="application-card-title">内部管理应用</h4>
        <div class="toolbar application-card-actions">
          <button type="button" class="btn btn-primary" ${reportDisabled ? 'disabled' : ''} onclick="CRST_APP.openRiskPushModal(${taskId})">下发风险预警</button>
          <button type="button" class="btn btn-default" ${reportDisabled ? 'disabled' : ''} onclick="CRST_APP.openRegulatoryReportModal(${taskId})">外部监管报送</button>
        </div>
        ${warnedAt ? `<p class="flow-hint">最近下发：${esc(warnedAt)}；共 ${warnings.length} 户</p>` : ''}
        <h5 class="application-subtitle">行业客户不良排行榜</h5>
        ${ranking.length
          ? renderTable(ranking.slice(0, 8),
            '<tr><th>行业</th><th>新增不良/违约户</th><th>操作</th></tr>',
            (d) => `<tr><td>${esc(d.name)}</td><td>${d.count}</td><td><button class="btn btn-link" onclick="CRST_APP.openDefaultDrill('${esc(d.name)}', ${taskId})">查看客户清单</button></td></tr>`,
            3)
          : '<p class="flow-hint">暂无新增不良/违约样本</p>'}
      </div>`;
  }

  function renderApplicationReportBody(taskId) {
    return renderApplicationReportInternalCard(taskId);
  }

  function computeIndustryBadLoanRanking(res, year) {
    return computeIndustryDefaultMonitor(res, year);
  }

  function buildDefaultMonitorIndustrySummary(customerRows) {
    const map = new Map();
    (customerRows || []).forEach((r) => {
      const ind = r.standardIndustry || '未分类';
      if (!map.has(ind)) map.set(ind, []);
      map.get(ind).push(r);
    });
    return [...map.entries()]
      .map(([name, rows]) => ({ name, count: rows.length, rows }))
      .sort((a, b) => b.count - a.count);
  }

  function renderDefaultMonitorChart(customerRows) {
    if (!customerRows?.length) return '<div class="empty">当前筛选下无新增不良/违约样本</div>';
    const items = buildDefaultMonitorIndustrySummary(customerRows);
    const topItems = items.slice(0, 10);
    const max = Math.max(...topItems.map((d) => d.count), 1);
    const cols = topItems.map((d, i) => {
      const h = Math.max(4, (d.count / max) * 130);
      const color = analysisColor(i);
      return `<div class="bar-group-wrap">
        <div class="bar-group">
          <span class="chart-bar-val">${d.count}</span>
          <div class="bar bar-mini" style="height:${h}px;background:${color}" title="${esc(d.name)}：${d.count}户"></div>
        </div>
        <div class="bar-label">${esc(d.name)}</div>
      </div>`;
    }).join('');
    const sortedRows = [...customerRows].sort((a, b) => {
      const ic = (a.standardIndustry || '').localeCompare(b.standardIndustry || '', 'zh-CN');
      if (ic !== 0) return ic;
      return (a.testYear || 0) - (b.testYear || 0);
    });
    const table = renderFullTable(sortedRows,
      '<tr><th>行业</th><th>新增不良/违约户名称</th><th>所在分行</th><th>预计违约年份</th></tr>',
      (r) => `<tr>
        <td>${esc(r.standardIndustry || '未分类')}</td>
        <td>${esc(r.companyName)}</td>
        <td>${esc(r.branchName || '-')}</td>
        <td>${r.testYear != null ? `${r.testYear}年` : '-'}</td>
      </tr>`,
      4,
      'analysis-metric-table-scroll');
    return `
      <div class="default-monitor-chart">${cols ? `<div class="chart-bar chart-bar-grouped default-monitor-vbar">${cols}</div>` : ''}</div>
      <div class="default-monitor-table">${table}</div>`;
  }

  function buildDefaultMonitorExportText(rows, taskName) {
    const sorted = [...rows].sort((a, b) => {
      const ic = (a.standardIndustry || '').localeCompare(b.standardIndustry || '', 'zh-CN');
      if (ic !== 0) return ic;
      return (a.testYear || 0) - (b.testYear || 0);
    });
    return [
      '违约客户监控清单（Excel）',
      `任务：${taskName || '-'}`,
      '',
      '行业\t新增不良/违约户名称\t所在分行\t预计违约年份',
      ...sorted.map((r) => [
        r.standardIndustry || '未分类',
        r.companyName || '',
        r.branchName || '-',
        r.testYear != null ? r.testYear : '',
      ].join('\t')),
    ].join('\n');
  }

  function exportDefaultMonitorData() {
    const { src, taskId } = resolveResultSource();
    const sourceKey = src?.key || window._resultSourceKey;
    if (!sourceKey) { toast('请先选择压测结果', 'error'); return; }
    const filtered = getFilteredAnalysisResults();
    const rows = collectRiskWarningsFromResults(filtered);
    if (!rows.length) { toast('当前筛选下无待导出数据', 'info'); return; }
    const t = taskId ? getTask(taskId) : null;
    const taskName = t?.taskName || src?.label || '压测结果';
    const scope = '违约客户监控 — 行业新增不良/违约户';
    const filterDesc = buildAnalysisFilterDesc();
    const filterSnapshot = buildAnalysisExportSnapshot({ context: 'defaultMonitor' });
    const { downloadFileName } = appendExportLog({
      sourceKey,
      scope,
      fields: '行业,新增不良/违约户名称,所在分行,预计违约年份',
      filterDesc,
      sourceType: getExportMeta(sourceKey)?.sourceType || 'RESULTS',
      exportKind: 'DEFAULT_MONITOR',
      filterSnapshot,
      downloadFileName: buildExportTitleFileName(scope),
    });
    triggerExportFileDownload(downloadFileName, buildDefaultMonitorExportText(rows, taskName));
    if (taskId) addLog(taskId, `压测结果：导出${scope} ${rows.length} 条`);
    toast(`已导出${scope} ${rows.length} 条，已写入导出记录`);
  }

  function openDefaultDrill(industry, taskId) {
    let res;
    if (taskId) {
      res = resultsByTask[taskId] || [];
    } else {
      res = resolveResultSource().res;
    }
    const yearSel = window._resultYear;
    const year = yearSel === '' || yearSel == null ? null : yearSel;
    const scenarioCode = window._resultScenarioCode || '';
    const filtered = filterAnalysisResults(res, year, scenarioCode);
    const items = computeIndustryDefaultMonitor(filtered, null);
    const hit = items.find((d) => d.name === industry);
    document.getElementById('defaultDrillTitle').textContent = `${industry} — 新增不良/违约客户清单`;
    const body = document.getElementById('defaultDrillBody');
    body.innerHTML = hit?.rows?.length
      ? renderTable(hit.rows,
        '<tr><th>客户名称</th><th>客户号</th><th>分行</th><th>贷款金额(万)</th><th>压测前状态</th><th>压测后状态</th><th>PD前</th><th>PD后</th><th>ECL变化</th></tr>',
        (r) => `<tr><td>${esc(r.companyName)}</td><td>${esc(r.customerId || '-')}</td><td>${esc(r.branchName)}</td><td>${(r.loanAmount || 0).toLocaleString()}</td><td>${esc(loanClassLabel(r.prevStatus))}</td><td>${esc(loanClassLabel(r.postStatus || (r.defaultFlag ? 'DEFAULT' : 'NORMAL')))}</td><td>${r.pdBefore ?? '-'}</td><td>${r.pdAfter ?? '-'}</td><td>${((r.eclAfter || 0) - (r.eclBefore || 0)).toLocaleString()}</td></tr>`,
        9)
      : '<div class="empty">暂无客户</div>';
    showModal('modalDefaultDrill');
  }

  function renderCarbonEmission() {
    const editing = carbonEmissionRows.find((r) => r.id === carbonEmissionEditId);
    const table = renderPagedTable('carbon-emission', carbonEmissionRows,
      '<tr><th>企业名称</th><th>信贷编号</th><th>年份</th><th>碳排放量(吨CO₂e)</th><th>核算方法</th><th>数据来源</th><th>备注</th><th>更新时间</th><th>操作</th></tr>',
      (r) => `<tr>
        <td>${esc(r.companyName)}</td><td>${esc(r.creditNo)}</td><td>${r.year}</td>
        <td>${Number(r.carbonEmission).toLocaleString()}</td><td>${esc(r.calcMethod)}</td><td>${esc(r.dataSource || '-')}</td><td>${esc(r.remark || '-')}</td><td>${esc(r.updatedAt)}</td>
        <td><div class="action-group"><button class="btn btn-link" onclick="CRST_APP.editCarbonEmission(${r.id})">编辑</button><button class="btn btn-link" onclick="CRST_APP.deleteCarbonEmission(${r.id})">删除</button></div></td>
      </tr>`, 9);
    return `
      <div class="card">
        <div class="toolbar"><h2 class="page-title">投融资碳核算碳排放量</h2><button class="btn btn-default" onclick="CRST_APP.resetCarbonEmissionForm()">新增记录</button></div>
        <div class="form-grid-2">
          <div class="form-row"><label><span class="req">*</span>企业名称</label><input class="input" id="ce_name" value="${esc(editing?.companyName || '')}" /></div>
          <div class="form-row"><label><span class="req">*</span>信贷编号</label><input class="input" id="ce_credit" value="${esc(editing?.creditNo || '')}" /></div>
          <div class="form-row"><label><span class="req">*</span>年份</label><input class="input" id="ce_year" type="number" value="${esc(editing?.year || 2024)}" /></div>
          <div class="form-row"><label><span class="req">*</span>碳排放量(吨CO₂e)</label><input class="input" id="ce_amount" type="number" value="${esc(editing?.carbonEmission ?? '')}" /></div>
          <div class="form-row"><label>核算方法</label><input class="input" id="ce_method" value="${esc(editing?.calcMethod || '报告法')}" /></div>
          <div class="form-row"><label>数据来源</label><input class="input" id="ce_source" value="${esc(editing?.dataSource || '')}" /></div>
          <div class="form-row form-row-span2"><label>备注</label><input class="input" id="ce_remark" value="${esc(editing?.remark || '')}" /></div>
        </div>
        <div class="toolbar step-panel-actions"><button class="btn btn-primary" onclick="CRST_APP.saveCarbonEmission()">${editing ? '保存修改' : '保存记录'}</button></div>
        ${table}
      </div>`;
  }

  function resetCarbonEmissionForm() { carbonEmissionEditId = null; render(); }
  function editCarbonEmission(id) { carbonEmissionEditId = id; render(); }
  function saveCarbonEmission() {
    const payload = {
      companyName: document.getElementById('ce_name')?.value?.trim(),
      creditNo: document.getElementById('ce_credit')?.value?.trim(),
      year: parseInt(document.getElementById('ce_year')?.value, 10),
      carbonEmission: parseFloat(document.getElementById('ce_amount')?.value),
      calcMethod: document.getElementById('ce_method')?.value?.trim() || '报告法',
      dataSource: document.getElementById('ce_source')?.value?.trim() || '',
      remark: document.getElementById('ce_remark')?.value?.trim() || '',
      updatedAt: nowStr(),
    };
    if (!payload.companyName || !payload.creditNo || !payload.year || !Number.isFinite(payload.carbonEmission)) {
      toast('请填写必填项', 'error'); return;
    }
    if (carbonEmissionEditId) Object.assign(carbonEmissionRows.find((r) => r.id === carbonEmissionEditId), payload);
    else carbonEmissionRows.unshift({ id: ++nextId.carbon, ...payload });
    carbonEmissionEditId = null;
    toast('已保存'); render();
  }
  function deleteCarbonEmission(id) {
    const row = carbonEmissionRows.find((r) => r.id === id);
    if (!row) return;
    openConfirmDeleteModal({
      title: '删除记录确认',
      messageHtml: `请您确认是否删除该碳排放记录：<strong>${esc(row.companyName || '-')}</strong>？`,
      onConfirm: () => {
        carbonEmissionRows.splice(carbonEmissionRows.findIndex((r) => r.id === id), 1);
        toast('已删除');
        render();
      },
    });
  }

  function setAppReportTask(id) { window._appReportTaskId = id; render(); }

  function buildRiskPushPreviewHtml(t, warnings) {
    const byBranch = new Map();
    warnings.forEach((w) => {
      const branch = w.branchName || 'XX分行';
      if (!byBranch.has(branch)) byBranch.set(branch, []);
      byBranch.get(branch).push(w);
    });
    const branchBlocks = [...byBranch.entries()].map(([branch, rows]) => {
      const lines = rows.map((w) => `<p class="risk-push-line">${esc(riskWarningMessage(w))}</p>`).join('');
      return `<div class="risk-push-branch"><p class="risk-push-branch-name">${esc(branch)}（${rows.length} 户）</p>${lines}</div>`;
    }).join('');
    return `
      <div class="risk-push-preview">
        <p class="risk-push-summary">气候风险预警 · ${esc(t?.taskName || '压测结果')} · 共 ${warnings.length} 户</p>
        <div class="risk-push-preview-scroll">${branchBlocks || '<p class="risk-push-line">暂无预警</p>'}</div>
      </div>`;
  }

  function showRiskPushModal(taskId, warnings) {
    const t = getTask(taskId);
    pendingRiskPushTaskId = taskId;
    pendingRiskPushWarnings = warnings;
    document.getElementById('wecomPreview').innerHTML = buildRiskPushPreviewHtml(t, warnings);
    showModal('modalRiskPush');
  }

  function oneClickIssueResultRiskWarnings(taskId) {
    const resolvedTaskId = taskId || resolveResultSource().taskId;
    if (!resolvedTaskId) { toast('请先选择关联任务结果', 'error'); return; }
    const filtered = getFilteredAnalysisResults();
    const warnings = collectRiskWarningsFromResults(filtered);
    if (!warnings.length) { toast('当前筛选下无待下发的不良/违约客户', 'info'); return; }
    showRiskPushModal(resolvedTaskId, warnings);
  }

  function openRiskPushModal(taskId) {
    const t = getTask(taskId);
    if (!canExportTaskResults(t)) { toast('请先完成压测', 'error'); return; }
    pendingRiskPushWarnings = null;
    const warnings = getRiskWarningRows(taskId);
    if (!warnings.length) { toast('当前无触发违约判定的企业', 'info'); return; }
    showRiskPushModal(taskId, warnings);
  }

  function confirmIssueRiskWarnings() {
    const taskId = pendingRiskPushTaskId;
    if (!taskId) return;
    const t = getTask(taskId);
    const warnings = pendingRiskPushWarnings?.length
      ? pendingRiskPushWarnings
      : getRiskWarningRows(taskId);
    const branchCount = new Set(warnings.map((w) => w.branchName || 'XX分行')).size;
    t.riskWarningIssuedAt = nowStr();
    t.riskPushChannels = [];
    t.updatedAt = nowStr();
    addLog(taskId, `压测结果：向 ${branchCount} 个分行下发 ${warnings.length} 条风险预警`);
    pendingRiskPushWarnings = null;
    hideModal();
    toast(`已向 ${branchCount} 个分行下发 ${warnings.length} 条预警`);
    render();
  }

  function render() {
    const el = document.getElementById('content');
    const pages = {
      'data-process': renderDataProcessModule,
      'scenario-analysis': () => renderStressStepModule('scenario-analysis'),
      'stress-fin-trans': () => renderStressStepModule('stress-fin-trans'),
      'stress-pd-lgd': () => renderStressStepModule('stress-pd-lgd'),
      'stress-npl-prov': () => renderStressStepModule('stress-npl-prov'),
      results: renderResults,
      exports: renderExports,
      factors: renderFactors,
      mappings: renderMappings,
      'airport-throughput': renderAirportThroughput,
      'carbon-emission': renderCarbonEmission,
    };
    el.innerHTML = (pages[currentPage] || renderDataProcessModule)();
    syncAppHeaderVersion();
    syncTaskLogUi();
  }

  function resetAirportThroughputForm() {
    airportThroughputEditId = null;
    render();
  }

  function editAirportThroughput(id) {
    airportThroughputEditId = id;
    render();
  }

  function saveAirportThroughput() {
    const airportName = document.getElementById('ap_name').value.trim();
    const airportCode = document.getElementById('ap_code').value.trim().toUpperCase();
    const year = parseInt(document.getElementById('ap_year').value, 10);
    const passengerThroughput = parseFloat(document.getElementById('ap_passenger').value);
    const cargoThroughput = parseFloat(document.getElementById('ap_cargo').value) || 0;
    const source = document.getElementById('ap_source').value.trim() || '手工维护';
    if (!airportName || !airportCode || !year || !Number.isFinite(passengerThroughput)) {
      toast('请填写机场企业、机场代码、年份和旅客吞吐量', 'error');
      return;
    }
    const payload = {
      airportName,
      airportCode,
      year,
      passengerThroughput,
      cargoThroughput,
      source,
      status: 'ENABLED',
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    if (airportThroughputEditId) {
      Object.assign(airportThroughputRows.find((r) => r.id === airportThroughputEditId), payload);
      toast('机场吞吐量已更新');
    } else {
      airportThroughputRows.unshift({ id: ++nextAirportThroughputId, ...payload });
      toast('机场吞吐量已新增');
    }
    airportThroughputEditId = null;
    render();
  }

  function deleteAirportThroughput(id) {
    const row = airportThroughputRows.find((r) => r.id === id);
    if (!row) return;
    openConfirmDeleteModal({
      title: '删除记录确认',
      messageHtml: `请您确认是否删除该机场吞吐量记录：<strong>${esc(row.airportName || '-')}</strong>？`,
      onConfirm: () => {
        airportThroughputRows.splice(airportThroughputRows.findIndex((r) => r.id === id), 1);
        if (airportThroughputEditId === id) airportThroughputEditId = null;
        toast('已删除');
        render();
      },
    });
  }

  /* —— 任务 CRUD & 状态机 —— */
  function startCreateTask() {
    initIndustryPickerFromTask(null);
    navigate('data-process', null, 0, { draft: true });
  }

  function editTask(id) {
    const t = getTask(id);
    if (!canEditTask(t)) { toast('当前状态不可编辑', 'error'); return; }
    initIndustryPickerFromTask(t);
    taskDraftMode = false;
    taskEditMode = true;
    taskViewMode = false;
    dataProcessListMode = false;
    const tab = dataProcessDefaultTab(t);
    navigateDataProcessTask(id, tab);
  }

  function cancelCreateTask() {
    backToDataProcessList();
  }

  function cancelEditTask() {
    taskEditMode = false;
    taskViewMode = false;
    render();
  }

  function readTaskFormFields() {
    return {
      name: document.getElementById('d_taskName')?.value.trim() || '',
      reportYear: document.getElementById('d_reportYear')?.value || '2026',
      loanType: document.getElementById('d_loanType')?.value || 'CORPORATE',
      loanRegion: document.getElementById('d_loanRegion')?.value || 'DOMESTIC',
      stressPurpose: document.getElementById('d_stressPurpose')?.value || industryPickerState?.purpose || 'PBOC',
      selectedIndustryCodes: readSelectedIndustryCodes(),
      desc: document.getElementById('d_desc')?.value || '',
    };
  }

  function saveTask() {
    const { name, reportYear, loanType, loanRegion, stressPurpose, selectedIndustryCodes, desc } = readTaskFormFields();

    if (taskDraftMode) {
      if (!name || !reportYear || !loanType || !loanRegion) { toast('请填写必填项', 'error'); return; }
      if (!selectedIndustryCodes.length) { toast('请至少选择一个涉及行业', 'error'); return; }
      const createdId = ++nextId.task;
      tasks.unshift({
        id: createdId,
        taskCode: genCode('CRST'),
        taskName: name,
        reportYear: Number(reportYear),
        loanType,
        loanRegion,
        stressPurpose,
        selectedIndustryCodes,
        description: desc,
        syncFilters: { loanRegion, loanClasses: [], pdMax: 0.99 },
        status: 'DRAFT',
        createdAt: nowStr(),
        updatedAt: nowStr(),
        updatedBy: '总行管理员',
      });
      addLog(createdId, '创建任务：保存任务');
      taskDraftMode = false;
      detailStep = 1;
      dataProcessListMode = false;
      dataProcessTab = 1;
      toast('任务已创建，请进行数据同步与确认');
      navigate('data-process', createdId, 1);
      return;
    }

    if (taskEditMode) {
      const t = getTask(currentTaskId);
      if (!t || !canEditTask(t)) { toast('当前状态不可编辑', 'error'); return; }
      if (!name) { toast('请填写任务名称', 'error'); return; }
      t.taskName = name;
      if (!hasTaskFinancialDataSynced(t)) {
        if (!reportYear || !loanType || !loanRegion) { toast('请填写必填项', 'error'); return; }
        if (!selectedIndustryCodes.length) { toast('请至少选择一个涉及行业', 'error'); return; }
        t.reportYear = Number(reportYear);
        t.loanType = loanType;
        t.loanRegion = loanRegion;
        t.stressPurpose = stressPurpose;
        t.selectedIndustryCodes = selectedIndustryCodes;
        t.description = desc;
        if (!t.syncFilters) t.syncFilters = { loanRegion, loanClasses: [], pdMax: 0.99 };
        else t.syncFilters.loanRegion = loanRegion;
      }
      t.updatedAt = nowStr();
      t.updatedBy = '总行管理员';
      addLog(t.id, hasTaskFinancialDataSynced(t) ? '编辑任务：修改任务名称' : '编辑任务：修改基本信息');
      taskEditMode = false;
      taskViewMode = false;
      dataProcessListMode = false;
      const tab = dataProcessDefaultTab(t);
      toast('任务已更新');
      navigateDataProcessTask(t.id, tab);
      return;
    }
  }

  function purgeTaskRelatedData(taskId) {
    delete recordsByTask[taskId];
    delete avgByTask[taskId];
    delete creditByTask[taskId];
    delete eclByTask[taskId];
    delete resultsByTask[taskId];
    delete taskLogs[taskId];
    delete syncListFilters[taskId];
    delete taskResultFilters[taskId];
  }

  function openConfirmDeleteModal({ title, messageHtml, onConfirm }) {
    pendingConfirmDeleteFn = onConfirm;
    const titleEl = document.getElementById('confirmDeleteTitle');
    const messageEl = document.getElementById('confirmDeleteMessage');
    if (titleEl) titleEl.textContent = title || '删除确认';
    if (messageEl) messageEl.innerHTML = messageHtml || '确认删除？';
    showModal('modalConfirmDelete');
  }

  function executeConfirmDelete() {
    const fn = pendingConfirmDeleteFn;
    pendingConfirmDeleteFn = null;
    hideModal();
    if (fn) fn();
  }

  function cancelConfirmDelete() {
    pendingConfirmDeleteFn = null;
    hideModal();
  }

  function deleteTask(id) {
    const t = getTask(id);
    if (!t) return;
    openConfirmDeleteModal({
      title: '删除任务确认',
      messageHtml: `请您确认是否删除该数据处理任务：<strong>${esc(t.taskName || '-')}</strong>？`,
      onConfirm: () => {
        const i = tasks.findIndex((x) => x.id === id);
        if (i < 0) return;
        purgeTaskRelatedData(id);
        tasks.splice(i, 1);
        if (currentTaskId === id) {
          currentTaskId = null;
          dataProcessListMode = true;
        }
        toast('已删除');
        render();
      },
    });
  }

  function getTaskSelectedIndustryCodes(t) {
    const IS = getIndustrySelector();
    if (!IS) return [];
    return t?.selectedIndustryCodes?.length
      ? t.selectedIndustryCodes
      : (t?.stressPurpose === 'PBOC' ? IS.getPbocDefaultCodes() : []);
  }

  function recordMatchesTaskIndustries(record, t) {
    const codes = getTaskSelectedIndustryCodes(t);
    if (!codes.length) return true;
    const gb = record.gbIndustryCode || '';
    if (gb && codes.some((c) => gb === c || gb.startsWith(c) || c.startsWith(gb))) return true;
    const major = resolveTestIndustryMajor(record.standardIndustry, record.gbIndustryCode);
    const IS = getIndustrySelector();
    if (IS?.PBOC_INDUSTRY_LEAVES && major) {
      return codes.some((c) => {
        const leaf = IS.PBOC_INDUSTRY_LEAVES.find((x) => x.code === c);
        return leaf && (leaf.category === major || leaf.name === major || major.includes(leaf.category));
      });
    }
    return false;
  }

  function filterSyncRecordsByTaskOverview(rows, t) {
    let filtered = rows.slice();
    if (t?.loanRegion) filtered = filtered.filter((r) => r.loanRegion === t.loanRegion);
    if (t?.loanType === 'PERSONAL') filtered = filtered.filter(() => false);
    filtered = filtered.filter((r) => recordMatchesTaskIndustries(r, t));
    return filtered;
  }

  function getSyncRecordTemplates() {
    return [
      { companyName: '华东化工有限公司', customerId: 'CUST-1001', creditNo: 'LN-202501-0001', unifiedSocialCreditCode: '91310000100000001X', branchName: '上海分行', branchCode: '3100', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.012, apiIndustry: 'C2614 有机化学原料制造', gbIndustryCode: 'C2614', emissionFactorCode: 'EMISSION_C2614', standardIndustry: '化工', revenue: 120000, costIncomeRatio: 0.88 },
      { companyName: '北方钢铁集团', customerId: 'CUST-1002', creditNo: 'LN-202501-0002', unifiedSocialCreditCode: '91110000100000002Y', branchName: '北京分行', branchCode: '1100', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.018, apiIndustry: 'C3110 炼铁', gbIndustryCode: 'C3110', emissionFactorCode: 'EMISSION_STEEL', standardIndustry: '钢铁', revenue: 98000, costIncomeRatio: 0.9 },
      { companyName: '华南电力股份', customerId: 'CUST-1003', creditNo: 'LN-202501-0003', unifiedSocialCreditCode: '91440000100000003Z', branchName: '广州分行', branchCode: '4400', loanRegion: 'DOMESTIC', loanClassification: 'ATTENTION', pdValue: 0.035, apiIndustry: 'D4411 火力发电', gbIndustryCode: 'D4411', emissionFactorCode: 'EMISSION_D4411', standardIndustry: '电力', revenue: 150000, costIncomeRatio: 0.82 },
      { companyName: '华南机场运营有限公司', customerId: 'CUST-1005', creditNo: 'LN-202501-0005', unifiedSocialCreditCode: '91440000100000005A', branchName: '广州分行', branchCode: '4400', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.019, apiIndustry: 'G5631 机场', gbIndustryCode: 'G5631', emissionFactorCode: 'EMISSION_G5631', standardIndustry: '机场企业', revenue: 88000, costIncomeRatio: 0.78 },
      { companyName: '西南平板玻璃销售公司', customerId: 'CUST-2001', creditNo: 'LN-202402-0101', unifiedSocialCreditCode: '91510100100000004M', branchName: '成都分行', branchCode: '5100', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.021, apiIndustry: 'C3041 平板玻璃制造', gbIndustryCode: 'C3041', standardIndustry: '平板玻璃', ambiguityCode: 'HY-01', revenue: 56000, costIncomeRatio: 0.85 },
      { companyName: '华东原油加工有限公司', customerId: 'CUST-2002', creditNo: 'LN-202402-0102', unifiedSocialCreditCode: '91440300100000005N', branchName: '深圳分行', branchCode: '4403', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.015, apiIndustry: 'C2511 原油加工及石油制品制造', gbIndustryCode: 'C2511', standardIndustry: '开采原油加工炼化', ambiguityCode: 'HY-02', revenue: 210000, costIncomeRatio: 0.91 },
      { companyName: '华北造纸集团', customerId: 'CUST-2003', creditNo: 'LN-202402-0103', unifiedSocialCreditCode: '91610100100000006P', branchName: '西安分行', branchCode: '6100', loanRegion: 'DOMESTIC', loanClassification: 'SUBSTANDARD', pdValue: 0.85, apiIndustry: 'C2221 机制纸及纸板制造', gbIndustryCode: 'C2221', standardIndustry: '造纸（其他）', ambiguityCode: 'HY-03', revenue: 78000, costIncomeRatio: 0.87 },
      { companyName: '境外能源贸易公司', customerId: 'CUST-2004', creditNo: 'LN-202402-0104', unifiedSocialCreditCode: 'HK9999000000007Q', branchName: '香港分行', branchCode: '8100', loanRegion: 'OVERSEAS', loanClassification: 'NORMAL', pdValue: 0.028, apiIndustry: '石油贸易', standardIndustry: '石油', revenue: 95000, costIncomeRatio: 0.88 },
      { companyName: '已违约客户示例', customerId: 'CUST-2005', creditNo: 'LN-202402-0105', unifiedSocialCreditCode: '91440300100000008R', branchName: '深圳分行', branchCode: '4403', loanRegion: 'DOMESTIC', loanClassification: 'LOSS', pdValue: 1, apiIndustry: 'C2614 有机化学原料制造', gbIndustryCode: 'C2614', standardIndustry: '化工', revenue: 12000, costIncomeRatio: 0.95 },
      { companyName: '未知行业企业', customerId: 'CUST-1004', creditNo: 'LN-202501-0004', unifiedSocialCreditCode: '91440300100000004K', branchName: '深圳分行', branchCode: '4403', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.04, apiIndustry: '其他行业' },
      { companyName: '财报缺失企业', customerId: 'CUST-2006', creditNo: 'LN-202402-0106', unifiedSocialCreditCode: '91440300100000009S', branchName: '深圳分行', branchCode: '4403', loanRegion: 'DOMESTIC', loanClassification: 'NORMAL', pdValue: 0.04, apiIndustry: 'C3110 炼铁', gbIndustryCode: 'C3110', standardIndustry: '钢铁', reportMissing: true, includeInternalSummary: true, revenue: null, costIncomeRatio: null },
    ];
  }

  function buildSyncRecordsFromTemplates(taskId, t, options = {}) {
    const templates = getSyncRecordTemplates();
    let rows = templates.map((tpl, i) => {
      const map = mappings.find((m) => m.apiIndustry === tpl.apiIndustry && m.status === 'ENABLED');
      const std = tpl.standardIndustry || (map ? map.standardIndustry : '');
      let avail = 'USABLE';
      let reason = tpl.ambiguityCode ? '待行业甄别' : '贷款数据已同步';
      if (!std) { avail = 'ABNORMAL'; reason = '行业未映射'; }
      else if (tpl.reportMissing) { avail = 'NEED_AVG'; reason = '财报缺失'; }
      else if (i === 2 && !tpl.ambiguityCode) { avail = 'NEED_AVG'; reason = '关键指标缺失，需行业均值补算'; }
      return {
        id: taskId * 100 + i,
        ...tpl,
        standardIndustry: std,
        dataAvailability: avail,
        availabilityReason: reason,
        dataSource: options.loanOnly ? '信贷系统' : (avail === 'USABLE' ? '接口原始' : '待补算'),
        ambiguityConfirmed: !tpl.ambiguityCode,
      };
    });
    rows = filterSyncRecordsByTaskOverview(rows, t);
    const reportYear = getTaskReportYear(t);
    return rows.map((r) => {
      enrichLoanSyncRecordFields(r, reportYear);
      if (!options.loanOnly) enrichFinancialSyncRecordFields(r);
      else clearFinancialSyncRecordFields(r);
      return r;
    });
  }

  function mockLoanSyncRecords(taskId, t) {
    return buildSyncRecordsFromTemplates(taskId, t, { loanOnly: true });
  }

  function startSyncLoan(id) {
    const t = getTask(id);
    if (!t || t.status !== 'DRAFT' || t.loanDataSynced) return;
    const loanTypeLabel = t.loanType === 'PERSONAL' ? '个人' : '对公';
    const regionLabel = t.loanRegion === 'OVERSEAS' ? '境外' : '境内';
    t.updatedAt = nowStr();
    addLog(id, `数据同步与确认：开始同步贷款数据（${regionLabel}，${t.reportYear || '-'}年，${loanTypeLabel}，${getTaskIndustrySummary(t)}）`);
    render();
    setTimeout(() => {
      if (t.loanType === 'PERSONAL') {
        toast('当前任务为个人贷款类型，暂无可同步的对公样本', 'error');
        addLog(id, '数据同步与确认：个人贷款类型暂无可同步样本');
        render();
        return;
      }
      recordsByTask[id] = mockLoanSyncRecords(id, t);
      const recs = recordsByTask[id];
      if (!recs.length) {
        toast('未匹配到符合任务概览条件的贷款数据', 'error');
        addLog(id, '数据同步与确认：未匹配到符合条件的贷款数据');
        render();
        return;
      }
      t.loanDataSynced = true;
      t.basicInfoYear = getTaskReportYear(t);
      t.financialDataYear = t.basicInfoYear - 1;
      ensureBankCapitalMetricsFromLoanSync(t);
      refreshSyncStats(id);
      t.updatedAt = nowStr();
      addLog(id, `数据同步与确认：贷款数据同步完成（${recs.length} 条）`);
      toast(`贷款数据同步完成（${recs.length} 条）`);
      if (currentPage === 'data-process' && currentTaskId === id) detailStep = 1;
      render();
    }, 800);
  }

  function startSyncGelan(id) {
    const t = getTask(id);
    if (!t || t.status !== 'DRAFT' || t.gelanDataSynced) return;
    if (!t.loanDataSynced || !(recordsByTask[id] || []).length) {
      toast('请先同步贷款数据', 'error');
      return;
    }
    t.updatedAt = nowStr();
    addLog(id, '数据同步与确认：开始同步格澜数据（温室气体排放）');
    render();
    setTimeout(() => {
      const recs = recordsByTask[id] || [];
      let matched = 0;
      recs.forEach((r, i) => {
        if (r.excluded) return;
        enrichGelanSyncRecordFields(r, i);
        if (r.gelanMatched) matched += 1;
      });
      t.gelanDataSynced = true;
      t.updatedAt = nowStr();
      addLog(id, `数据同步与确认：格澜数据同步完成（${matched}/${recs.length} 条匹配到温室气体排放数据）`);
      toast(`格澜数据同步完成（${matched}/${recs.length} 条已获取温室气体数据）`);
      if (currentPage === 'data-process' && currentTaskId === id) detailStep = 1;
      render();
    }, 800);
  }

  function startSync(id) {
    const t = getTask(id);
    if (t.status !== 'DRAFT') return;
    if (!t.loanDataSynced || !(recordsByTask[id] || []).length) {
      toast('请先同步贷款数据', 'error');
      return;
    }
    if (!t.gelanDataSynced) {
      toast('请先同步格澜数据', 'error');
      return;
    }
    t.status = 'SYNCING';
    t.updatedAt = nowStr();
    addLog(id, '数据同步与确认：开始同步财务数据');
    render();
    setTimeout(() => {
      if (!t.factorVersion) {
        const period = taskReportPeriodRange(t);
        t.factorVersion = suggestFactorVersionByReportEnd(period.end);
      }
      t.basicInfoYear = getTaskReportYear(t);
      t.financialDataYear = t.basicInfoYear - 1;
      t.mappingVersion = 'M-' + getActiveMappingVersion();
      t.scenarioVersion = 'S-' + getPublishedScenarioVersion();
      const recs = recordsByTask[id] || [];
      recs.forEach((r) => enrichFinancialSyncRecordFields(r));
      applyReportMissingRules(t, recs);
      const airportStats = fetchAirportThroughputForTask(id);
      refreshSyncStats(id);
      const pendingDisambig = getPendingDisambigRecords(recs);
      t.status = pendingDisambig.length ? 'PENDING_DISAMBIG' : 'PROCESSING';
      t.updatedAt = nowStr();
      addLog(id, pendingDisambig.length
        ? `数据同步与确认：财务数据同步完成，识别 ${pendingDisambig.length} 条行业歧义客户，待甄别确认`
        : '数据同步与确认：财务数据同步完成');
      if (airportStats.total) {
        addLog(id, `数据同步与确认：机场企业旅客吞吐量调取成功 ${airportStats.success} 条，待维护 ${airportStats.fail} 条`);
      }
      toast(pendingDisambig.length
        ? `同步完成，${pendingDisambig.length} 条行业歧义待甄别`
        : airportStats.fail
          ? `财务数据同步完成；${airportStats.fail} 条机场企业旅客吞吐量待维护`
          : '财务数据同步完成');
      syncBankBasicInfoFromRecords(id);
      if (!pendingDisambig.length) tryFinalizeDataProcess(id, { showModal: true });
      if (currentPage === 'data-process' && currentTaskId === id) detailStep = 1;
      render();
    }, 800);
  }

  function startSyncInternalPd(id) {
    const t = getTask(id);
    if (!t || t.internalPdDataSynced) return;
    if (!hasTaskFinancialDataSynced(t)) {
      toast('请先同步财务数据', 'error');
      return;
    }
    const eligible = getInternalPdEligibleRecords(id, t);
    if (!eligible.length) {
      toast('当前无缺少财务数据的客户', 'info');
      return;
    }
    t.updatedAt = nowStr();
    addLog(id, `数据同步与确认：开始同步内部PD数据（${eligible.length} 户无财报客户）`);
    render();
    setTimeout(() => {
      let modelCount = 0;
      let fallbackCount = 0;
      eligible.forEach((r) => {
        enrichInternalPdFields(r);
        if (r.hasInternalRatingModel) modelCount += 1;
        else fallbackCount += 1;
      });
      t.internalPdDataSynced = true;
      t.updatedAt = nowStr();
      addLog(id, `数据同步与确认：内部PD数据同步完成（内评模型 ${modelCount} 户，减估值 PD0/LGD0 ${fallbackCount} 户）`);
      toast(`内部PD数据同步完成（${eligible.length} 户）`);
      render();
    }, 600);
  }

  function syncAirportThroughput(id) {
    const t = getTask(id);
    if (!['SYNCING', 'PENDING_DISAMBIG', 'PROCESSING'].includes(t.status)) {
      toast('请先同步财务数据', 'error');
      return;
    }
    const stats = fetchAirportThroughputForTask(id);
    if (!stats.total) {
      toast('当前清单无机场企业', 'info');
      return;
    }
    refreshSyncStats(id);
    t.updatedAt = nowStr();
    addLog(id, `数据同步与确认：调取旅客吞吐量，成功 ${stats.success} 条，待维护 ${stats.fail} 条`);
    toast(stats.fail
      ? `旅客吞吐量调取完成，${stats.fail} 条未在维护表中找到`
      : '旅客吞吐量已全部调取');
    render();
  }

  function mockSyncRecords(taskId, t) {
    return buildSyncRecordsFromTemplates(taskId, t, { loanOnly: false });
  }

  function confirmList(id) {
    const t = getTask(id);
    if (t.status !== 'PENDING_CONFIRM') return;
    const recs = recordsByTask[id] || [];
    if (!allDisambigConfirmed(recs)) {
      toast('尚有行业歧义客户未完成甄别', 'error');
      t.status = 'PENDING_DISAMBIG';
      render();
      return;
    }
    if (recs.some((r) => !r.excluded && effectiveSyncStatus(r) === 'ABNORMAL')) {
      toast('存在无法处理数据，请在列表中删除后再确认', 'error');
      return;
    }
    t.status = 'PROCESSING';
    t.adminConfirmedAt = nowStr();
    t.updatedAt = nowStr();
    addLog(id, '数据同步与确认：确认数据清单');
    const needN = countNeedAvg(recs);
    if (needN > 0 && computeIndustryAvg(id)) {
      addLog(id, '数据同步与确认：计算行业平均值');
    }
    toast(needN ? '清单已确认，请填充数据到样本' : '清单已确认，可直接进入场景压测');
    detailStep = 1;
    render();
  }

  function excludeRecord(taskId, recId) {
    const recs = recordsByTask[taskId];
    const i = recs.findIndex((r) => r.id === recId);
    const companyName = i >= 0 ? recs[i].companyName : '';
    if (i >= 0) recs.splice(i, 1);
    addLog(taskId, `数据同步与确认：删除同步企业「${companyName || recId}」`);
    const t = getTask(taskId);
    if (t?.syncStats) {
      t.syncStats.total = recs.length;
      t.syncStats.fail = recs.filter((r) => r.dataAvailability === 'ABNORMAL').length;
      t.syncStats.success = recs.length - t.syncStats.fail;
    }
    const left = recs.filter((r) => r.dataAvailability === 'ABNORMAL').length;
    toast(left ? '已删除，请继续处理其余无法处理数据' : '无法处理数据已清理完毕');
    tryFinalizeDataProcess(taskId, { showModal: true });
    render();
  }

  function computeIndustryAvg(id) {
    const t = getTask(id);
    if (!t) return false;
    const recs = recordsByTask[id] || [];
    const industries = [...new Set(recs.filter((r) => r.dataAvailability === 'NEED_AVG').map((r) => r.standardIndustry))];
    if (!industries.length) return false;
    avgByTask[id] = industries.map((ind) => {
      const basis = recs.filter((r) => r.standardIndustry === ind && r.dataAvailability === 'USABLE');
      const n = basis.length || 1;
      const sumRev = basis.reduce((s, r) => s + (r.revenue || 0), 0);
      const sumEbit = basis.reduce((s, r) => s + (r.ebitda || r.revenue * 0.18 || 0), 0);
      return {
        industry: ind,
        sampleCount: basis.length + recs.filter((r) => r.standardIndustry === ind && r.dataAvailability === 'NEED_AVG').length,
        avgRevenue: Math.round(sumRev / n) || 120000 + Math.floor(Math.random() * 30000),
        avgEbitda: Math.round(sumEbit / n) || 22000 + Math.floor(Math.random() * 8000),
        calcBasis: '已确认可使用样本',
        calcTime: nowStr(),
        status: 'DRAFT',
      };
    });
    t.updatedAt = nowStr();
    return true;
  }

  function calcIndustryAvg(id) {
    const t = getTask(id);
    if (t.status !== 'PROCESSING') { toast('请先确认清单', 'error'); return; }
    if (!computeIndustryAvg(id)) {
      toast('无需行业均值补算', 'error');
      return;
    }
    addLog(id, '数据同步与确认：计算行业平均值');
    toast('行业平均值已计算，请填充至样本');
    render();
  }

  function fillIndustryData(id) {
    const t = getTask(id);
    if (t.status !== 'PROCESSING') return;
    if (!hasAvgCalculated(id) && !computeIndustryAvg(id)) {
      toast('暂无待补算样本', 'error');
      return;
    }
    const avgMap = Object.fromEntries((avgByTask[id] || []).map((a) => [a.industry, a]));
    let n = 0;
    (recordsByTask[id] || []).filter((r) => r.dataAvailability === 'NEED_AVG').forEach((r) => {
      const a = avgMap[r.standardIndustry];
      if (!a) return;
      r.revenue = a.avgRevenue;
      r.ebitda = a.avgEbitda;
      r.dataAvailability = 'USABLE';
      r.dataSource = '行业均值补算';
      r.availabilityReason = '已用行业均值填充';
      n++;
    });
    (avgByTask[id] || []).forEach((a) => { a.status = 'CONFIRMED'; });
    t.updatedAt = nowStr();
    addLog(id, `数据同步与确认：行业均值已填充至 ${n} 条样本`);
    toast('数据填充完成，可完成数据处理');
    render();
  }

  function confirmAvg(id) {
    const t = getTask(id);
    if (t.status !== 'PROCESSING') return;
    const recs = recordsByTask[id] || [];
    if (countNeedAvg(recs) > 0 && !isAvgDataFilled(id)) {
      toast('请先完成行业均值计算与填充', 'error');
      return;
    }
    (avgByTask[id] || []).forEach((a) => { a.status = 'CONFIRMED'; });
    t.status = 'READY_STRESS';
    t.avgConfirmedAt = nowStr();
    t.updatedAt = nowStr();
    addLog(id, '数据处理：确认处理结果，进入压测流水线');
    toast('数据处理已完成，可在「情景分析」新建压测任务并引用本任务数据');
    pendingCreateStressJob = { sourceTaskId: id, fromPage: 'scenario-analysis' };
    stressJobListMode = true;
    currentStressJobId = null;
    navigate('scenario-analysis');
  }

  function fetchCredit(id, options = {}) {
    const t = resolveEntity(id);
    if (!t) return;
    const isJob = isStressJobEntity(t);
    const recs = entityRecords(id, t);
    const creditData = recs.filter((r) => r.dataAvailability !== 'ABNORMAL').slice(0, Math.min(50, recs.length)).map((r) => ({
      companyName: r.companyName,
      customerId: r.customerId || '',
      loanAccountNo: `LN-${id}-${Math.floor(100000 + Math.random() * 900000)}`,
      contractNo: `HT-${id}-${Math.floor(10000 + Math.random() * 90000)}`,
      loanBalance: 40000 + Math.floor(Math.random() * 50000),
      productType: '流动资金贷款',
      currency: 'CNY',
      startDate: '2024-01-15',
      maturityDate: '2027-01-15',
      remainingTenor: 18 + Math.floor(Math.random() * 24),
      rating: 'A',
      classification: '正常',
      guaranteeType: '抵押',
      branchName: r.branchName,
      branchCode: r.branchCode || '',
    }));
    if (isJob) {
      stressCreditByJob[id] = creditData;
      if (!options.silent) addStressJobLog(id, `场景压测：调取信贷系统数据（${creditData.length} 条）`);
    } else {
      creditByTask[id] = creditData;
      if (!options.silent) addLog(id, '场景压测：调取信贷系统数据');
    }
    t.creditFetched = true;
    t.updatedAt = nowStr();
    if (!options.silent) {
      toast('信贷数据已获取');
      render();
    }
  }

  function fetchEcl(id, options = {}) {
    const t = resolveEntity(id);
    if (!t) return;
    const isJob = isStressJobEntity(t);
    const recs = entityRecords(id, t);
    const eclData = recs.filter((r) => r.dataAvailability !== 'ABNORMAL').slice(0, Math.min(50, recs.length)).map((r) => ({
      companyName: r.companyName,
      customerId: r.customerId || '',
      loanAccountNo: `LN-${id}-${Math.floor(100000 + Math.random() * 900000)}`,
      pd: 0.015,
      lgd: 0.45,
      ead: 38000,
      stage: '一阶段',
      eclAmount: 2000 + Math.floor(Math.random() * 1000),
      modelVersion: 'ECL-V3.2',
      measurementDate: nowStr().slice(0, 10),
    }));
    if (isJob) {
      stressEclByJob[id] = eclData;
      if (!options.silent) addStressJobLog(id, `场景压测：调取 ECL 系统数据（${eclData.length} 条）`);
    } else {
      eclByTask[id] = eclData;
      if (!options.silent) addLog(id, '场景压测：调取 ECL 系统数据');
    }
    t.eclFetched = true;
    t.updatedAt = nowStr();
    if (!options.silent) {
      toast('ECL数据已获取');
      render();
    }
  }

  function ensureCreditEclFetched(id) {
    const t = resolveEntity(id);
    if (!t) return false;
    if (!t.creditFetched) fetchCredit(id, { silent: true });
    if (!t.eclFetched) fetchEcl(id, { silent: true });
    return !!(t.creditFetched && t.eclFetched);
  }

  function runScenarioStress(id) {
    const t = resolveEntity(id);
    if (!t || !isStressJobEntity(t)) return;
    const canRun = canEditStressSection(t, 1) || (t.status === 'COMPLETED' && taskEditMode);
    if (!canRun) {
      toast('当前不可执行压测', 'error');
      return;
    }
    const selectedCodes = selectedScenarioCodes(id);
    if (!selectedCodes.length) { toast('请至少选择一个压测情景', 'error'); return; }
    t.selectedScenarioCodes = selectedCodes;
    const saved = persistStressParamsFromDom(id, t, selectedCodes);
    if (!saved.ok) { toast(saved.msg, 'error'); return; }
    t.finTransDone = true;
    t.updatedAt = nowStr();
    computeFinTransResults(id);
    fetchCredit(id, { silent: true });
    fetchEcl(id, { silent: true });
    addStressJobLog(id, `情景分析：开始执行压测（${selectedCodes.length} 个情景）`);
    runStress(id, { skipPermissionCheck: true, navigateToResults: true });
  }

  function runFinTrans(id) {
    const t = resolveEntity(id);
    if (!t || !isStressJobEntity(t)) return;
    if (!canEditStressSection(t, 1)) {
      toast('当前不可编辑财务传导', 'error');
      return;
    }
    const selectedCodes = selectedScenarioCodes(id);
    if (!selectedCodes.length) { toast('请至少选择一个压测情景', 'error'); return; }
    t.selectedScenarioCodes = selectedCodes;
    const saved = persistStressParamsFromDom(id, t, selectedCodes);
    if (!saved.ok) { toast(saved.msg, 'error'); return; }
    t.finTransDone = true;
    t.updatedAt = nowStr();
    computeFinTransResults(id);
    addStressJobLog(id, `财务传导：完成 ${selectedCodes.length} 个情景的参数录入与传导计算`);
    toast('财务传导已完成');
    render();
  }

  function runPdLgdCalc(id) {
    const t = resolveEntity(id);
    if (!t || !isStressJobEntity(t)) return;
    if (!isFinTransDone(t)) { toast('请先完成财务传导', 'error'); return; }
    if (!canEditStressSection(t, 2)) {
      toast('当前不可编辑 PD/LGD 计算', 'error');
      return;
    }
    fetchCredit(id, { silent: false });
    fetchEcl(id, { silent: false });
    t.updatedAt = nowStr();
    addStressJobLog(id, 'PD/LGD 计算：已调取信贷台账并完成 ECL 计量');
    toast('PD/LGD 计算已完成');
    render();
  }

  function setStressJobStep(step) {
    if (!currentStressJobId) return;
    stressJobDetailStep = step;
    const pageId = stressStepPageForIndex(step <= 1 ? 1 : step);
    if (currentPage !== pageId) {
      navigate(pageId, currentStressJobId, step);
    } else {
      render();
    }
  }

  function renderReleaseNotesHtml() {
    const data = window.CRST_RELEASE_NOTES;
    if (!data?.versions?.length) return '<div class="empty">暂无更新说明</div>';
    const sorted = [...data.versions].sort((a, b) => {
      const ta = new Date(a.updatedAt || a.date || 0).getTime();
      const tb = new Date(b.updatedAt || b.date || 0).getTime();
      return tb - ta;
    });
    return sorted.map((v) => {
      const reqPoints = (v.requirementPoints || v.items || []).map((item) => `<li>${esc(item)}</li>`).join('');
      const menus = (v.menus || []).map((m) => `<span class="release-note-tag">${esc(m)}</span>`).join('');
      const features = (v.features || []).map((f) => `<span class="release-note-tag release-note-tag--feature">${esc(f)}</span>`).join('');
      const screenshots = (v.screenshots || []).map((shot) => {
        const src = typeof shot === 'string' ? shot : shot.src;
        const caption = typeof shot === 'string' ? '' : (shot.caption || '');
        if (!src) return '';
        return `<figure class="release-note-shot">
          <img src="${esc(src)}" alt="${esc(caption || v.title || '页面截图')}" loading="lazy" />
          ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
        </figure>`;
      }).join('');
      return `
      <section class="release-note-block">
        <div class="release-note-head">
          <span class="release-note-version ${v.version === data.current ? 'is-current' : ''}">v${esc(v.version)}${v.version === data.current ? '（当前）' : ''}</span>
          <span class="release-note-date">${esc(v.updatedAt || v.date || '')}</span>
        </div>
        <h4 class="release-note-title">${esc(v.title || '')}</h4>
        ${v.description ? `<div class="release-note-section"><div class="release-note-label">文字描述</div><p class="release-note-text">${esc(v.description)}</p></div>` : ''}
        ${v.bodyText ? `<div class="release-note-section"><div class="release-note-label">需求说明书正文</div><div class="release-note-text release-note-body-text">${esc(v.bodyText)}</div></div>` : ''}
        ${reqPoints ? `<div class="release-note-section"><div class="release-note-label">需求点</div><ul class="release-note-list">${reqPoints}</ul></div>` : ''}
        ${menus ? `<div class="release-note-section"><div class="release-note-label">菜单名称</div><div class="release-note-tags">${menus}</div></div>` : ''}
        ${features ? `<div class="release-note-section"><div class="release-note-label">功能名称</div><div class="release-note-tags">${features}</div></div>` : ''}
        ${v.summary ? `<p class="release-note-summary">${esc(v.summary)}</p>` : ''}
        ${screenshots ? `<div class="release-note-section"><div class="release-note-label">页面截图</div>${screenshots}</div>` : ''}
      </section>`;
    }).join('');
  }

  function openReleaseNotes() {
    const body = document.getElementById('releaseNotesBody');
    if (body) body.innerHTML = renderReleaseNotesHtml();
    showModal('modalReleaseNotes');
  }

  function syncAppHeaderVersion() {
    const badge = document.getElementById('appVersionBadge');
    const ver = window.CRST_RELEASE_NOTES?.current || '1.0';
    if (badge) badge.textContent = `v${ver}`;
  }

  function runStress(id, options = {}) {
    const t = resolveEntity(id);
    if (!t) return;
    const isJob = isStressJobEntity(t);
    const allowedStatus = isJob ? ['READY', 'COMPLETED'] : ['READY_STRESS', 'COMPLETED'];
    if (!allowedStatus.includes(t.status)) {
      toast('当前状态不可执行压测', 'error');
      return;
    }
    if (t.status === 'COMPLETED' && !taskEditMode && !options.skipPermissionCheck) {
      toast('请通过「编辑」进入场景压测后再调整并重新执行', 'error');
      return;
    }
    if (!options.skipPermissionCheck && !canEditStressSection(t, isStressJobEntity(t) ? 3 : 3)) {
      toast(isStressJobEntity(t) ? '当前不可编辑不良与拨备计算' : '当前不可编辑场景压测', 'error');
      return;
    }
    ensureCreditEclFetched(id);
    const carbon = window.CRST_CARBON;
    if (!carbon) { toast('计算逻辑模块未加载', 'error'); return; }

    const selectedCodes = selectedScenarioCodes(id);
    const defaultScenarios = scenariosForJob();
    const scenarioCodes = selectedCodes.length
      ? selectedCodes
      : defaultScenarios.map((s) => s.scenarioCode);
    if (!scenarioCodes.length) { toast('请至少选择一个压测场景', 'error'); return; }
    const saved = persistStressParamsFromDom(id, t, scenarioCodes);
    if (!saved.ok) { toast(saved.msg, 'error'); return; }
    const scenarioParamsMap = saved.paramsMap;
    t.selectedScenarioCodes = scenarioCodes;
    const minStart = Math.min(...Object.values(scenarioParamsMap).map((p) => p.startYear));
    const maxEnd = Math.max(...Object.values(scenarioParamsMap).map((p) => p.endYear));

    t.status = isJob ? 'STRESSING' : 'STRESSING';
    const logStart = isJob ? `不良和拨备计算：开始执行（${scenarioCodes.length}个情景，${minStart}-${maxEnd}年）` : `场景压测：开始执行（${scenarioCodes.length}个情景，${minStart}-${maxEnd}年）`;
    if (isJob) addStressJobLog(id, logStart);
    else addLog(id, logStart);
    render();
    setTimeout(() => {
      const recs = entityRecords(id, t);
      const eclMap = {};
      entityEcls(id, t).forEach((e) => { eclMap[e.companyName] = e.eclAmount; });

      const calcRecs = recs.filter((r) => r.dataAvailability !== 'ABNORMAL' && r.standardIndustry);
      const sampleLimit = isJob && calcRecs.length > 100 ? 100 : calcRecs.length;
      const sampled = calcRecs.slice(0, sampleLimit);
      const creditMap = {};
      entityCredits(id, t).forEach((c) => { creditMap[c.companyName] = c; });

      const list = [];
      const enabledFactors = getEnabledEmissionFactors();
      sampled.forEach((r) => {
        scenarioCodes.forEach((code) => {
          const p = scenarioParamsMap[code];
          const enriched = {
            ...r,
            eclAmount: eclMap[r.companyName] ?? r.eclAmount,
            costIncomeRatio: r.costIncomeRatio ?? p.costIncomeRatio,
            assetLiabilityRatio: r.assetLiabilityRatio ?? p.assetLiabilityRatio,
            baseNetProfitPositive: p.baseNetProfitPositive,
          };
          for (let y = p.startYear; y <= p.endYear; y++) {
            const out0 = carbon.runCompanyStress(enriched, code, {
              ...stressCalcOptions(p, y),
              factorLibrary: enabledFactors,
            });
            const out = enrichStressResult(applyScenarioAdjustment(out0, code, p), enriched, p);
            list.push({
              companyName: r.companyName,
              branchName: r.branchName,
              standardIndustry: r.standardIndustry,
              gbIndustryCode: r.gbIndustryCode,
              loanAmount: creditMap[r.companyName]?.loanBalance ?? r.loanBalance ?? 0,
              scenarioCode: out.scenarioCode,
              scenarioName: out.scenarioName,
              testYear: y,
              revenueGrowth: p.industryGrowthRate ?? p.revenueGrowth,
              industryGrowthRate: p.industryGrowthRate ?? p.revenueGrowth,
              costIncomeRatio: p.costIncomeRatio,
              assetLiabilityRatio: p.assetLiabilityRatio,
              policyIntensity: p.policyIntensity,
              physicalLossRatio: p.physicalLossRatio,
              greenInvestmentRatio: p.greenInvestmentRatio,
              revenueBefore: out.revenueBefore,
              revenueAfter: out.revenueAfter,
              operatingExpense: out.operatingExpense,
              carbonEmission: out.carbonEmission,
              carbonCost: out.carbonCost,
              eclBefore: out.eclBefore,
              eclAfter: out.eclAfter,
              impactRate: out.impactRate,
              netProfitAfter: out.netProfitAfter,
              defaultFlag: out.defaultFlag,
              defaultReason: out.defaultReason,
              assetLiabilityRatioBefore: out.assetLiabilityRatioBefore,
              assetLiabilityRatioAfter: out.assetLiabilityRatioAfter,
              freeQuotaRatio: out.freeQuotaRatio,
              carbonPrice: out.carbonPrice,
            });
          }
        });
      });

      list.sort((a, b) => {
        if (a.companyName !== b.companyName) return a.companyName.localeCompare(b.companyName, 'zh-CN');
        if (a.scenarioCode !== b.scenarioCode) return a.scenarioCode.localeCompare(b.scenarioCode);
        return (a.testYear || 0) - (b.testYear || 0);
      });

      if (isJob) {
        stressResultsByJob[id] = list;
      } else {
        resultsByTask[id] = list;
      }
      window._resultYear = maxEnd;
      t.scenarioVersion = getPublishedScenarioVersion();
      t.status = 'COMPLETED';
      t.updatedAt = nowStr();
      const logDone = `压测结果：场景压测完成，已生成 ${list.length} 行结果（${minStart}-${maxEnd}年，${scenarioCodes.length}个情景${sampleLimit < calcRecs.length ? `；抽样 ${sampleLimit}/${calcRecs.length} 条` : ''}）`;
      if (isJob) {
        addStressJobLog(id, logDone);
        taskEditMode = false;
        taskViewMode = true;
        toast('压测已完成');
        window._resultStressJobId = id;
        window._resultSourceKey = `job-${id}`;
        window._resultTaskId = t.sourceTaskId || null;
        if (options.navigateToResults) {
          navigate('results');
        } else {
          render();
        }
      } else {
        addLog(id, logDone);
        if (taskEditMode && isStressOnlyEditTask(t)) {
          taskEditMode = false;
          addLog(id, '场景压测：已完成任务参数调整后重新压测');
        }
        toast('压测已完成（已输出逐年结果）');
        window._resultSourceKey = `task-${id}`;
        window._resultTaskId = id;
        navigate('results');
      }
    }, 800);
  }

  /* —— 因子 CRUD —— */
  function renderFactorModalBody(f, readonly) {
    if (readonly) {
      return `
        <div class="form-row">
          <label>因子名称</label>
          <input class="input" value="${esc(f?.factorName || '')}" disabled />
        </div>
        <div class="form-row">
          <label>数值</label>
          <input class="input" value="${esc(f?.factorValue ?? '')}" disabled />
        </div>
        <div class="form-row">
          <label>单位</label>
          <input class="input" value="${esc(f?.unit || '')}" disabled />
        </div>
        <div class="form-row">
          <label>行业名称</label>
          <input class="input" value="${esc(f?.industry || '')}" disabled />
        </div>`;
    }
    const majors = getTestIndustryMajors();
    const indOpts = `<option value="">请选择行业名称</option>${majors.map((m) =>
      `<option value="${esc(m)}" ${f?.industry === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}`;
    const unit = f?.unit || 'tCO2e/百万元';
    return `
        <div class="form-row">
          <label><span class="req">*</span>因子名称</label>
          <input class="input" id="f_name" placeholder="如 化工-有机化学原料" value="${esc(f?.factorName || '')}" />
        </div>
        <div class="form-row">
          <label><span class="req">*</span>数值</label>
          <input class="input" id="f_val" type="number" step="0.0001" placeholder="如 150.2545" value="${esc(f?.factorValue ?? '')}" />
        </div>
        <div class="form-row">
          <label><span class="req">*</span>单位</label>
          <select class="select" id="f_unit">
            <option value="tCO2e/百万元" ${unit === 'tCO2e/百万元' ? 'selected' : ''}>tCO2e/百万元</option>
            <option value="tCO2e/万人次" ${unit === 'tCO2e/万人次' ? 'selected' : ''}>tCO2e/万人次</option>
            <option value="ratio" ${unit === 'ratio' ? 'selected' : ''}>ratio</option>
            <option value="percent" ${unit === 'percent' ? 'selected' : ''}>percent</option>
          </select>
        </div>
        <div class="form-row">
          <label><span class="req">*</span>行业名称</label>
          <select class="select" id="f_ind">${indOpts}</select>
        </div>`;
  }

  function openFactorModal(mode, id) {
    const f = id ? factors.find((x) => x.id === id) : null;
    modalState = { type: 'factor', mode, id };
    const titles = { create: '新增因子', view: '查看因子', edit: '编辑因子' };
    const readonly = mode === 'view';
    document.querySelector('#modalFactor .modal-hd').textContent = titles[mode] || '因子';
    const bd = document.querySelector('#modalFactor .modal-bd');
    if (bd) {
      bd.classList.toggle('is-readonly', readonly);
      bd.innerHTML = renderFactorModalBody(f, readonly);
    }
    document.querySelector('#modalFactor .modal-ft .btn-primary').style.display = readonly ? 'none' : '';
    showModal('modalFactor');
  }

  function saveFactor() {
    const name = document.getElementById('f_name').value.trim();
    const industry = document.getElementById('f_ind').value;
    const unit = document.getElementById('f_unit').value;
    const factorValue = parseFloat(document.getElementById('f_val').value);
    if (!name || !industry || !unit || !Number.isFinite(factorValue)) {
      toast('请填写必填项', 'error');
      return;
    }
    const majors = getTestIndustryMajors();
    if (!majors.includes(industry)) { toast('行业名称需与测试行业口径一致', 'error'); return; }
    const existing = modalState.id ? factors.find((x) => x.id === modalState.id) : null;
    const payload = {
      factorName: name,
      factorValue,
      unit,
      industry,
      factorCode: existing?.factorCode || `EMISSION_${industry}_${Date.now()}`,
      gbCode: existing?.gbCode || '',
      subType: existing?.subType || '',
      scenarioType: existing?.scenarioType || 'EMISSION',
      version: existing?.version || 'V2.0-行内方法',
      status: existing?.status || 'ENABLED',
      effectiveFrom: existing?.effectiveFrom || new Date().toISOString().slice(0, 10),
      updatedBy: '总行管理员',
      updatedAt: nowStr(),
    };
    if (modalState.mode === 'create') {
      factors.unshift({ id: ++nextId.factor, ...payload });
      toast('因子已新增');
    } else {
      Object.assign(existing, payload);
      toast('因子已更新');
    }
    hideModal();
    render();
  }

  function deleteFactor(id) {
    const f = factors.find((x) => x.id === id);
    if (!f) return;
    openConfirmDeleteModal({
      title: '删除因子确认',
      messageHtml: `请您确认是否删除该因子：<strong>${esc(f.factorName || '-')}</strong>？`,
      onConfirm: () => {
        const i = factors.findIndex((x) => x.id === id);
        if (i >= 0) factors.splice(i, 1);
        toast('已删除');
        render();
      },
    });
  }

  /* —— 场景 CRUD —— */
  function openScenarioModal(mode, id) {
    const s = id ? scenarios.find((x) => x.id === id) : null;
    modalState = { type: 'scenario', mode, id };
    const titles = { create: '新增场景', view: '查看场景', edit: '编辑场景' };
    document.querySelector('#modalScenario .modal-hd').textContent = titles[mode] || '场景';
    const readonly = mode === 'view';
    ['s_code', 's_name', 's_type', 's_formula_version', 's_test_year', 's_quota_2025', 's_quota_2040', 's_price_2025', 's_price_2040', 's_formula', 's_in', 's_out'].forEach((fid) => {
      const el = document.getElementById(fid);
      if (el) el.disabled = readonly;
    });
    const transition = window.CRST_CARBON?.TRANSITION_SCENARIOS?.[s?.scenarioCode];
    document.getElementById('s_code').value = s?.scenarioCode || '';
    document.getElementById('s_name').value = s?.scenarioName || '';
    document.getElementById('s_type').value = s?.scenarioType || 'TRANSITION';
    document.getElementById('s_formula_version').value = s?.formulaVersion || s?.version || 'V2.0-行内方法';
    document.getElementById('s_test_year').value = s?.testYear ?? 2040;
    document.getElementById('s_quota_2025').value = s?.freeQuota2025 ?? transition?.freeQuota2025 ?? '';
    document.getElementById('s_quota_2040').value = s?.freeQuota2040 ?? transition?.freeQuota2040 ?? '';
    document.getElementById('s_price_2025').value = s?.carbonPrice2025 ?? transition?.carbonPrice2025 ?? '';
    document.getElementById('s_price_2040').value = s?.carbonPrice2040 ?? transition?.carbonPrice2040 ?? '';
    document.getElementById('s_formula').value = s?.formula || '';
    document.getElementById('s_in').value = s?.inputFields || '';
    document.getElementById('s_out').value = s?.outputFields || '';
    document.querySelector('#modalScenario .modal-ft .btn-primary').style.display = readonly ? 'none' : '';
    showModal('modalScenario');
  }

  function saveScenario() {
    const code = document.getElementById('s_code').value.trim();
    const name = document.getElementById('s_name').value.trim();
    const formula = document.getElementById('s_formula').value.trim();
    if (!code || !name || !formula) { toast('请填写必填项', 'error'); return; }
    const numOrNull = (id) => {
      const raw = document.getElementById(id).value;
      if (raw === '') return null;
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : null;
    };
    const payload = {
      scenarioCode: code,
      scenarioName: name,
      scenarioType: document.getElementById('s_type').value,
      formulaVersion: document.getElementById('s_formula_version').value.trim() || 'V2.0-行内方法',
      testYear: parseInt(document.getElementById('s_test_year').value, 10) || 2040,
      freeQuota2025: numOrNull('s_quota_2025'),
      freeQuota2040: numOrNull('s_quota_2040'),
      carbonPrice2025: numOrNull('s_price_2025'),
      carbonPrice2040: numOrNull('s_price_2040'),
      formula,
      inputFields: document.getElementById('s_in').value,
      outputFields: document.getElementById('s_out').value,
      version: document.getElementById('s_formula_version').value.trim() || 'V2.0-行内方法',
      status: 'DRAFT',
      publishedAt: null,
    };
    if (modalState.mode === 'create') {
      scenarios.unshift({ id: ++nextId.scenario, ...payload });
      toast('场景已新增（草稿）');
    } else {
      Object.assign(scenarios.find((x) => x.id === modalState.id), payload);
      toast('场景已更新');
    }
    hideModal();
    render();
  }

  function publishScenario(id) {
    scenarios.filter((s) => s.status === 'PUBLISHED' && s.scenarioType === scenarios.find((x) => x.id === id).scenarioType)
      .forEach((s) => { s.status = 'DISABLED'; });
    const s = scenarios.find((x) => x.id === id);
    s.status = 'PUBLISHED';
    s.publishedAt = nowStr();
    toast('场景已发布生效');
    render();
  }

  function disableScenario(id) {
    scenarios.find((x) => x.id === id).status = 'DISABLED';
    toast('场景已停用');
    render();
  }

  function deleteScenario(id) {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    if (s.status !== 'DRAFT') { toast('仅草稿可删除', 'error'); return; }
    openConfirmDeleteModal({
      title: '删除场景确认',
      messageHtml: `请您确认是否删除该场景：<strong>${esc(s.scenarioName || '-')}</strong>？`,
      onConfirm: () => {
        scenarios.splice(scenarios.indexOf(s), 1);
        toast('已删除');
        render();
      },
    });
  }

  /* —— 映射 CRUD —— */
  function renderMappingModalBody(m, readonly) {
    if (readonly) {
      return `
        <div class="form-row">
          <label>国民经济行业代码（GB/T 4754-2017）</label>
          <input class="input" value="${esc(m?.gbCode || '')}" disabled />
        </div>
        <div class="form-row">
          <label>国民经济行业类别</label>
          <input class="input" value="${esc(getMappingGbIndustryName(m))}" disabled />
        </div>
        <div class="form-row">
          <label>行业大类</label>
          <input class="input" value="${esc(getMappingIndustryMajor(m))}" disabled />
        </div>
        <div class="form-row">
          <label>测试行业类别</label>
          <input class="input" value="${esc(getMappingTestIndustryCategory(m))}" disabled />
        </div>`;
    }
    return `
        <div class="form-row">
          <label><span class="req">*</span>国民经济行业代码（GB/T 4754-2017）</label>
          <input class="input" id="m_gb" placeholder="如 C2614" value="${esc(m?.gbCode || '')}" />
        </div>
        <div class="form-row">
          <label><span class="req">*</span>国民经济行业类别</label>
          <input class="input" id="m_api" placeholder="如 有机化学原料制造" value="${esc(m ? getMappingGbIndustryName(m) : '')}" />
        </div>
        <div class="form-row">
          <label><span class="req">*</span>行业大类</label>
          <input class="input" id="m_std" placeholder="如 化工" value="${esc(m ? getMappingIndustryMajor(m) : '')}" />
        </div>
        <div class="form-row">
          <label><span class="req">*</span>测试行业类别</label>
          <input class="input" id="m_test" placeholder="如 基础化学原料制造" value="${esc(m?.testIndustryCategory || '')}" />
        </div>`;
  }

  function openMappingModal(mode, id) {
    const m = id ? mappings.find((x) => x.id === id) : null;
    modalState = { type: 'mapping', mode, id };
    const titles = { create: '新增行业映射', view: '查看映射', edit: '编辑映射' };
    const readonly = mode === 'view';
    document.querySelector('#modalMapping .modal-hd').textContent = titles[mode] || '行业映射';
    const bd = document.querySelector('#modalMapping .modal-bd');
    if (bd) {
      bd.classList.toggle('is-readonly', readonly);
      bd.innerHTML = renderMappingModalBody(m, readonly);
    }
    document.querySelector('#modalMapping .modal-ft .btn-primary').style.display = readonly ? 'none' : '';
    showModal('modalMapping');
  }

  function saveMapping() {
    const gbCode = document.getElementById('m_gb').value.trim();
    const gbIndustryName = document.getElementById('m_api').value.trim();
    const industryMajor = document.getElementById('m_std').value.trim();
    const testIndustryCategory = document.getElementById('m_test').value.trim();
    if (!gbCode || !gbIndustryName || !industryMajor || !testIndustryCategory) {
      toast('请填写必填项', 'error');
      return;
    }
    const payload = {
      gbCode,
      gbIndustryName,
      industryMajor,
      testIndustryCategory,
      apiIndustry: `${gbCode} ${gbIndustryName}`,
      standardIndustry: industryMajor,
      mappingType: modalState.id
        ? (mappings.find((x) => x.id === modalState.id)?.mappingType || '多对一')
        : '多对一',
      version: 'V1.0',
      status: 'ENABLED',
      updatedBy: '总行管理员',
      updatedAt: nowStr(),
    };
    if (modalState.mode === 'create') {
      mappings.unshift({ id: ++nextId.mapping, ...payload });
      toast('映射已新增');
    } else {
      Object.assign(mappings.find((x) => x.id === modalState.id), payload);
      toast('映射已更新');
    }
    hideModal();
    render();
  }

  function deleteMapping(id) {
    const m = mappings.find((x) => x.id === id);
    if (!m) return;
    openConfirmDeleteModal({
      title: '删除映射确认',
      messageHtml: `请您确认是否删除该行业映射：<strong>${esc(m.gbIndustryName || m.apiIndustry || '-')}</strong>？`,
      onConfirm: () => {
        mappings.splice(mappings.findIndex((x) => x.id === id), 1);
        toast('已删除');
        render();
      },
    });
  }

  function issueRiskWarnings(taskId) {
    openRiskPushModal(taskId);
  }

  function generateRegulatoryReport(taskId) {
    const t = getTask(taskId);
    if (!canExportTaskResults(t)) { toast('请先完成压测', 'error'); return; }
    const sourceKey = `task-${taskId}`;
    const scope = '外部监管报送';
    const fields = REGULATORY_REPORT_FILES.map((f) => f.name).join(', ');
    const filterDesc = `监管口径：${t.scenarioVersion || '-'}；情景：${(t.selectedScenarioCodes || []).join('、') || '全部已选情景'}`;
    const { downloadFileName, taskName } = appendExportLog({
      sourceKey,
      scope,
      fields,
      filterDesc,
      sourceType: 'REPORT',
      exportKind: 'REPORT',
      filterSnapshot: { context: 'taskDetail', taskId, filter: { ...getTaskResultFilter(taskId) } },
    });
    t.regulatoryReportGeneratedAt = nowStr();
    t.updatedAt = nowStr();
    addLog(taskId, '应用报送：生成监管报送 Excel 文件包');
    triggerExportFileDownload(
      downloadFileName,
      buildReportExportText(getExportMeta(sourceKey), { taskName, filter: filterDesc })
    );
    toast('监管报送文件包已生成，已写入导出记录');
    const bodyEl = document.getElementById('regulatoryReportModalBody');
    if (bodyEl && pendingRegulatoryReportTaskId === taskId) {
      bodyEl.innerHTML = renderRegulatoryReportCard(taskId);
    }
    render();
  }

  /* —— 导出 —— */
  function exportResultsSummary(ref) {
    const sourceKey = normalizeExportSourceKey(ref);
    if (!canExportSourceKey(sourceKey)) { toast('请先完成压测后再导出', 'error'); return; }
    const ctx = getExportContext(sourceKey);
    if (!ctx) { toast('导出来源无效', 'error'); return; }
    const scope = `汇总结果（按${ctx.summaryDimLabel}）`;
    const fields = ctx.summaryFieldLabels.join(',');
    const { downloadFileName } = appendExportLog({
      sourceKey,
      scope,
      fields,
      filterDesc: ctx.filterDesc,
      sourceType: ctx.sourceType,
      exportKind: 'SUMMARY',
      filterSnapshot: ctx.filterSnapshot,
    });
    if (ctx.parsed.isJob) addStressJobLog(ctx.parsed.id, `压测结果：导出汇总（${scope}）`);
    else addLog(ctx.parsed.id, `压测结果：导出汇总结果（${scope}，筛选条件：${ctx.filterDesc}）`);
    triggerExportFileDownload(downloadFileName, buildSummaryExportText(ctx));
    toast('汇总表已导出，已写入导出记录');
  }

  function openExportDetailModal(ref) {
    const sourceKey = normalizeExportSourceKey(ref);
    if (!canExportSourceKey(sourceKey)) { toast('请先完成压测后再导出', 'error'); return; }
    modalState = { type: 'exportDetail', sourceKey };
    const fieldBox = document.getElementById('ed_fields');
    if (fieldBox) {
      fieldBox.innerHTML = RESULT_DETAIL_EXPORT_FIELDS.map((f) =>
        `<label class="export-field-item"><input type="checkbox" name="ed_field" value="${esc(f.key)}" checked /> ${esc(f.label)}</label>`
      ).join('');
    }
    showModal('modalExportDetail');
  }

  function toggleExportDetailFields(checked) {
    document.querySelectorAll('#ed_fields input[name="ed_field"]').forEach((el) => {
      el.checked = checked;
    });
  }

  function doExportDetail() {
    const sourceKey = modalState?.sourceKey;
    if (!sourceKey || !canExportSourceKey(sourceKey)) { toast('请先完成压测后再导出', 'error'); return; }
    const ctx = getExportContext(sourceKey);
    if (!ctx) { toast('导出来源无效', 'error'); return; }
    const selected = Array.from(document.querySelectorAll('#ed_fields input[name="ed_field"]:checked'));
    if (!selected.length) { toast('请至少选择一个导出字段', 'error'); return; }
    const fieldKeys = selected.map((el) => el.value);
    const labels = fieldKeys.map((k) => RESULT_DETAIL_EXPORT_FIELDS.find((f) => f.key === k)?.label || k);
    const fields = labels.join(',');
    const scope = '压测结果明细';
    const { downloadFileName } = appendExportLog({
      sourceKey,
      scope,
      fields,
      filterDesc: ctx.filterDesc,
      sourceType: ctx.sourceType,
      exportKind: 'DETAIL',
      fieldKeys,
      filterSnapshot: ctx.filterSnapshot,
    });
    if (ctx.parsed.isJob) addStressJobLog(ctx.parsed.id, `压测结果：导出明细（${fields}）`);
    else addLog(ctx.parsed.id, `压测结果：导出压测明细（${fields}，筛选条件：${ctx.filterDesc}）`);
    hideModal();
    triggerExportFileDownload(downloadFileName, buildDetailExportText(ctx, fieldKeys));
    toast('明细表已导出，已写入导出记录');
  }

  function openExportSource(sourceKey, sourceType) {
    if (!sourceKey) return;
    const parsed = parseExportSourceKey(sourceKey);
    if (sourceType === 'DATA_PROCESS' && parsed && !parsed.isJob) {
      dataProcessListMode = false;
      openTaskInModule(parsed.id);
      setDataProcessTab(1);
      return;
    }
    window._resultSourceKey = sourceKey;
    navigate('results');
  }

  function downloadExport(id) {
    const e = exportLogs.find((x) => x.id === id);
    if (!e) { toast('导出记录不存在', 'error'); return; }
    const fileName = getExportDownloadFileName(e);
    triggerExportFileDownload(fileName, buildExportFileContent(e));
    toast(`已开始下载：${fileName}`);
  }

  function showModal(id) {
    document.getElementById(id).classList.add('show');
  }
  function hideModal() {
    document.querySelectorAll('.modal-mask').forEach((m) => m.classList.remove('show'));
    const saveBtn = document.getElementById('modalSaveBtn');
    if (saveBtn) saveBtn.style.display = '';
  }

  document.getElementById('menu').addEventListener('click', (e) => {
    const level1 = e.target.closest('.menu-level-1');
    if (level1) {
      const navPage = level1.dataset.navPage;
      if (navPage) {
        if (navPage === 'data-process') {
          backToDataProcessList();
        } else if (isStressResultViewPage(navPage)) {
          navigate(navPage);
        } else {
          navigate(navPage);
        }
        return;
      }
      const section = level1.closest('.menu-section');
      section.classList.toggle('open');
      level1.setAttribute('aria-expanded', section.classList.contains('open') ? 'true' : 'false');
      return;
    }
    const a = e.target.closest('a[data-page]');
    if (!a) return;
    navigate(a.dataset.page);
  });

  function setSiderCollapsed(collapsed) {
    const app = document.getElementById('appRoot');
    if (!app) return;
    app.classList.toggle('sider-collapsed', collapsed);
    const btn = document.getElementById('siderToggle');
    const title = collapsed ? '展开菜单' : '收起菜单';
    if (btn) { btn.title = title; btn.setAttribute('aria-label', title); }
    try { localStorage.setItem('crst-sider-collapsed', collapsed ? '1' : '0'); } catch (_) {}
  }

  function toggleSider() {
    const app = document.getElementById('appRoot');
    setSiderCollapsed(!app.classList.contains('sider-collapsed'));
  }

  document.getElementById('siderToggle')?.addEventListener('click', toggleSider);
  try {
    if (localStorage.getItem('crst-sider-collapsed') === '1') setSiderCollapsed(true);
  } catch (_) {}

  window.CRST_APP = {
    navigate, render,
    setDetailStep: (step) => {
      if (isStressJobDetailContext()) {
        setStressJobStep(step);
        return;
      }
      if (isDataProcessModule() && step > 1) {
        if (step >= 3) {
          navigate(step === 3 ? 'stress-fin-trans' : step === 4 ? 'results' : 'results', currentTaskId, step);
          return;
        }
        step = 1;
      }
      detailStep = step;
      if (currentPage === 'data-process') {
        dataProcessTab = step === 0 ? 0 : 1;
        if (currentTaskId && dataProcessTab >= 1) syncDataProcessTaskViewState(getTask(currentTaskId));
      }
      render();
    },
    setDetailTab: (tab) => { detailStep = resolveDetailStep(tab) ?? 0; render(); },
    searchTasks, resetTaskFilters, searchExports, resetExportFilters, setListPage, setListPageSize,
    setResultTask: (id) => { window._resultSourceKey = `task-${id}`; window._resultTaskId = id; getListPager('results').page = 1; render(); },
    setResultSource: (key) => { window._resultSourceKey = key; window._resultYear = ''; window._resultScenarioCode = ''; getListPager('results').page = 1; render(); },
    setResultDim: (d) => { window._resultDim = d; getListPager('results').page = 1; render(); },
    setResultYear: (y) => { window._resultYear = y === '' ? '' : y; getListPager('results').page = 1; render(); },
    setResultScenario: (c) => { window._resultScenarioCode = c || ''; getListPager('results').page = 1; render(); },
    setFinTransJob: (key) => { window._finTransJobKey = key; getListPager('fin-trans-alr-view').page = 1; render(); },
    setFinTransYear: (y) => { window._finTransYear = y === '' ? '' : y; getListPager('fin-trans-alr-view').page = 1; render(); },
    setFinTransScenario: (c) => { window._finTransScenarioCode = c || ''; getListPager('fin-trans-alr-view').page = 1; render(); },
    setPdLgdJob: (key) => { window._pdLgdJobKey = key; getListPager('pd-lgd-view').page = 1; render(); },
    setPdLgdYear: (y) => { window._pdLgdYear = y === '' ? '' : y; getListPager('pd-lgd-view').page = 1; render(); },
    setPdLgdScenario: (c) => { window._pdLgdScenarioCode = c || ''; getListPager('pd-lgd-view').page = 1; render(); },
    setNplProvJob: (key) => { window._nplProvJobKey = key; getListPager('npl-prov-view').page = 1; render(); },
    setNplProvYear: (y) => { window._nplProvYear = y === '' ? '' : y; getListPager('npl-prov-view').page = 1; render(); },
    setNplProvScenario: (c) => { window._nplProvScenarioCode = c || ''; getListPager('npl-prov-view').page = 1; render(); },
    setAppReportTask,
    setTaskResultFilter, resetTaskResultFilter,
    onStressScenarioToggle,
    viewTask: (id, tab) => viewTaskInModule(id),
    viewTaskInModule,
    openTaskInModule,
    backToDataProcessList,
    setDataProcessTab,
    selectModuleTask,
    searchStressJobs, resetStressJobFilters,
    openStressJob, backToStressJobList, openCreateStressJobModal, setStressJobStep,
    onStressJobSourceChange, mockPickStressImportFile, confirmCreateStressJob,
    editStressJob, viewStressJob, viewStressResults, viewStressJobOriginalData, deleteStressJob,
    runFinTrans, runScenarioStress, runPdLgdCalc, openReleaseNotes,
    editTask,
    confirmDeleteTask: executeConfirmDelete, cancelDeleteTask: cancelConfirmDelete,
    executeConfirmDelete, cancelConfirmDelete,
    startCreateTask, cancelCreateTask, cancelEditTask, onTaskReportEndChange, saveTask, deleteTask,
    onStressPurposeChange, onIndustrySearchInput, onIndustrySelectAll, onIndustryClearAll, onIndustryCheckClick, onIndustryItemClick,
    startSync, syncAirportThroughput, confirmList, excludeRecord, setSyncStatusFilter,
    saveSyncFilters, openExcludeCustomerModal, toggleExcludeAll, confirmExcludeCustomers,
    openIndustryDisambigModal, saveIndustryDisambig,
    exportDataProcessOffline, openDataProcessImportModal, mockPickDataProcessImportFile, confirmDataProcessImport,
    oneClickProcessCustomerData,
    openGhgEmissionEditModal, onGhgAccountedSelectChange, saveGhgEmissionEdits,
    exportCustomerBasicInfo,
    exportInternalPdData, openInternalPdImportModal, mockPickInternalPdImportFile, confirmInternalPdImport,
    exportBankBasicInfo, exportBankCapitalMetrics, openBankBasicImportModal, mockPickBankBasicImportFile, confirmBankBasicImport,
    openBankCapitalEditModal, saveBankCapitalEdits,
    calcIndustryAvg, fillIndustryData, confirmAvg, fetchCredit, fetchEcl, runStress,
    goToApplicationReport, openRegulatoryReportModal,
    togglePdAdjust, setIncludeInternalSummary,
    openFactorModal, saveFactor, viewFactor: (id) => openFactorModal('view', id),
    editFactor: (id) => openFactorModal('edit', id), deleteFactor,
    openScenarioModal, saveScenario, viewScenario: (id) => openScenarioModal('view', id),
    editScenario: (id) => openScenarioModal('edit', id), publishScenario, disableScenario, deleteScenario,
    openMappingModal, saveMapping, viewMapping: (id) => openMappingModal('view', id),
    editMapping: (id) => openMappingModal('edit', id), deleteMapping,
    resetAirportThroughputForm, editAirportThroughput, saveAirportThroughput, deleteAirportThroughput,
    resetCarbonEmissionForm, editCarbonEmission, saveCarbonEmission, deleteCarbonEmission,
    exportResultsSummary, exportStressSummaryTable, exportNplProvSummaryTable, exportDefaultAdjustmentTable, exportFinTransDefaultAdjustmentTable, exportDefaultMonitorData, exportAnalysisPanel, exportPdLgdTable, openExportDetailModal, toggleExportDetailFields, doExportDetail,
    issueRiskWarnings, openRiskPushModal, oneClickIssueResultRiskWarnings, confirmIssueRiskWarnings, openDefaultDrill,
    applyResultDefaultCriteria,
    generateRegulatoryReport, openExportSource,
    downloadExport, syncLoanData: startSyncLoan, syncGelanData: startSyncGelan, syncFinancial: startSync, syncInternalPdData: startSyncInternalPd, hideModal,
    openTaskLogDrawer, closeTaskLogDrawer,
    toggleSider, setSiderCollapsed,
  };

  applyMenuVisibility();
  const initVis = getMenuVisibility();
  if (initVis[currentPage] === false) currentPage = firstVisibleMenuPage();
  render();
})();
