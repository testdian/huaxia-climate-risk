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
  /** 压测方法模块内步骤（与数据处理 detailStep 隔离，默认场景压测） */
  let stressJobDetailStep = 3;
  /** 数据处理模块内子步骤：0任务概览 1财务数据（详情页 Tab） */
  let dataProcessTab = 0;
  /** 数据处理：true=任务列表，false=任务详情 */
  let dataProcessListMode = true;
  /** 压测方法模块：true=任务列表，false=压测详情 */
  let stressJobListMode = true;
  let currentStressJobId = null;
  let pendingCreateStressJob = null;
  let createStressJobMethodKey = 'trans';
  let stressImportFilePicked = false;
  const stressJobFilters = {
    trans: { name: '', status: '', dataSource: '', periodStart: '', periodEnd: '' },
    phys: { name: '', status: '', dataSource: '', periodStart: '', periodEnd: '' },
    comp: { name: '', status: '', dataSource: '', periodStart: '', periodEnd: '' },
  };
  const STRESS_METHODS = {
    trans: { key: 'trans', pageId: 'stress-trans', title: '压测方法1-现有政策（基准）', shortTitle: '现有政策', scenarioCode: 'BASELINE' },
    phys: { key: 'phys', pageId: 'stress-phys', title: '压测方法2-温室世界', shortTitle: '温室世界', scenarioCode: 'GREENHOUSE_WORLD' },
    comp: { key: 'comp', pageId: 'stress-comp', title: '压测方法3-有序转型', shortTitle: '有序转型', scenarioCode: 'ORDERLY_TRANSITION' },
  };
  /** 当前模块上下文（流程拆分到各一级菜单） */
  let moduleContext = null;
  const MODULE_FLOW_PAGES = new Set(['data-process', 'stress-trans', 'stress-phys', 'stress-comp']);
  const TAB_TO_STEP = { overview: 0, sync: 1, process: 2, external: 3, stress: 3, result: 4, log: 5 };
  let taskFilters = { name: '', periodStart: '', periodEnd: '', status: '', factorVersion: '' };
  const LIST_PAGE_SIZES = [10, 20, 50, 100];
  const listPagers = {};
  /** 任务详情同步清单状态筛选：taskId -> '' | USABLE | NEED_AVG | ABNORMAL */
  const syncListFilters = {};
  /** 任务详情压测结果筛选：taskId -> filters */
  const taskResultFilters = {};
  let exportFilters = { taskName: '', scope: '', sourceType: '' };
  let carbonEmissionEditId = null;
  let pendingRiskPushTaskId = null;
  const SYNC_STATUS_TEXT = {
    USABLE: '可使用',
    NEED_AVG: '需计算',
    ABNORMAL: '无法处理',
    EXCLUDED: '已排除',
    EXCLUDED_NO_REPORT: '财报缺失-不参与',
  };
  const LOAN_REGION_LABELS = { DOMESTIC: '境内', OVERSEAS: '境外' };
  const BAD_LOAN_CLASSES = new Set(['SUBSTANDARD', 'DOUBTFUL', 'LOSS']);
  let modalState = null;
  let pendingDataProcessImportTaskId = null;
  let dataProcessImportFilePicked = false;
  let pendingDeleteTaskId = null;
  let toastTimer = null;
  let taskLogDrawerOpen = false;

  let airportThroughputRows = [
    { id: 1, airportName: '华南机场运营有限公司', airportCode: 'CAN', year: 2024, passengerThroughput: 6350, cargoThroughput: 205, source: '机场运营数据接口', status: 'ENABLED', updatedAt: '2025-06-04' },
    { id: 2, airportName: '华东枢纽机场股份', airportCode: 'SHA', year: 2024, passengerThroughput: 4720, cargoThroughput: 168, source: '手工维护', status: 'ENABLED', updatedAt: '2025-06-04' },
  ];
  let nextAirportThroughputId = 10;
  let airportThroughputEditId = null;

  const TASK_EDITABLE = ['DRAFT', 'SYNCING', 'PENDING_DISAMBIG', 'PENDING_CONFIRM', 'PROCESSING', 'READY_STRESS', 'STRESSING', 'COMPLETED'];
  const TASK_DELETABLE = ['DRAFT'];
  const STEP_ORDER = ['DRAFT', 'SYNCING', 'PENDING_DISAMBIG', 'PENDING_CONFIRM', 'PROCESSING', 'READY_STRESS', 'STRESSING', 'COMPLETED', 'ARCHIVED'];
  const STEP_LABELS = ['创建任务', '数据同步与确认', '数据处理', '场景压测', '压测结果', '应用报送'];

  const REGULATORY_REPORT_FILES = [
    { name: '汇总表.xlsx', desc: '按人民银行模板汇总的压测结果指标' },
    { name: '明细表.xlsx', desc: '客户/敞口级明细数据' },
    { name: '风险提示清单.xlsx', desc: '触发阈值的客户风险提示清单' },
    { name: '口径说明.docx', desc: '报送数据口径与例外说明' },
  ];

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

  function buildExportDownloadFileName(taskName, exportedAt) {
    const safeName = String(taskName || '导出').replace(/[\\/:*?"<>|]/g, '_').trim() || '导出';
    return `${safeName}${formatExportTimestamp(exportedAt)}.xlsx`;
  }

  function getExportDownloadFileName(e) {
    return e.downloadFileName || buildExportDownloadFileName(e.taskName, e.exportedAt);
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
    const t = getTask(id);
    if (!canUseApplicationReport(t)) {
      toast('请先完成压测并生成压测结果', 'error');
      return;
    }
    window._appReportTaskId = id;
    addLog(id, '进入应用报送');
    navigate('app-report');
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
    return `场景=${window._resultScenarioCode || '全部'}，年份=${yearLabel}，维度=${dim}，口径=${window._resultCaliber || '全部'}`;
  }

  function getFilteredResultsFromSnapshot(rawResults, snapshot) {
    if (!rawResults?.length) return [];
    const snap = snapshot || { context: 'analysis' };
    if (snap.context === 'taskDetail') {
      return applyTaskResultFilter(rawResults, snap.filter || getTaskResultFilter(snap.taskId));
    }
    const year = snap.year === '' || snap.year == null ? null : +snap.year;
    let list = filterAnalysisResults(rawResults, year, snap.scenarioCode || '');
    if (snap.caliber) list = list.filter((r) => r.measureCaliber === snap.caliber);
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
      if (window._resultCaliber) filtered = filtered.filter((r) => r.measureCaliber === window._resultCaliber);
      summaryDim = window._resultDim || 'industry';
      filterDesc = buildAnalysisFilterDesc();
      filterSnapshot = {
        context: 'analysis',
        year: window._resultYear ?? '',
        scenarioCode: window._resultScenarioCode || '',
        dim: summaryDim,
        caliber: window._resultCaliber || '',
      };
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

  function buildReportExportText(ctx, e) {
    const files = REGULATORY_REPORT_FILES.map((f) => f.name).join('、');
    return [
      '监管报送文件包（Excel / Word）',
      `任务：${ctx?.taskName || e.taskName}`,
      `筛选/口径：${e.filter || '-'}`,
      `包含文件：${files}`,
      '',
      ...REGULATORY_REPORT_FILES.map((f) => `${f.name}\t${f.desc}`),
      '',
      '说明：符合人民银行气候风险宏观情景压力测试报送要求，支持指标与明细追溯。',
    ].join('\n');
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
    } = opts;
    const meta = getExportMeta(sourceKey);
    const exportedAt = nowStr();
    const resolvedName = taskName || meta?.taskName || '压测结果';
    const downloadFileName = buildExportDownloadFileName(resolvedName, exportedAt);
    const entry = {
      id: ++nextId.export,
      sourceKey,
      exportKind: exportKind || 'DETAIL',
      taskCode: taskCode || meta?.taskCode || '-',
      taskName: resolvedName,
      sourceType: sourceType || meta?.sourceType || 'RESULTS',
      exportType: exportType || (exportKind === 'REPORT' ? '文件包' : '表格'),
      fileFormat: fileFormat || (exportKind === 'REPORT' ? 'Excel/Word' : 'Excel'),
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
      const records = getOfflineProcessRecords(taskId);
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

  function getStressJob(id) {
    return stressJobs.find((j) => j.id === id);
  }

  function getStressMethodMeta(pageId) {
    return Object.values(STRESS_METHODS).find((m) => m.pageId === pageId);
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

  function getMethodScenarioCode(methodKey) {
    return STRESS_METHODS[methodKey]?.scenarioCode || 'BASELINE';
  }

  function scenariosForMethod(methodKey) {
    const code = getMethodScenarioCode(methodKey);
    return scenarios.filter((s) => s.status === 'PUBLISHED' && s.scenarioCode === code);
  }

  function getProcessedDataTasks() {
    return tasks.filter((t) => ['READY_STRESS', 'STRESSING', 'COMPLETED'].includes(t.status));
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
    const m = STRESS_DATA_SOURCE[source] || { cls: 'tag-default', text: source };
    return `<span class="tag ${m.cls}">${m.text}</span>`;
  }

  function filterStressJobList(methodKey) {
    const f = stressJobFilters[methodKey] || {};
    return stressJobs.filter((j) => {
      if (j.methodKey !== methodKey) return false;
      if (f.name && !j.jobName.toLowerCase().includes(f.name.trim().toLowerCase())) return false;
      if (f.status && j.status !== f.status) return false;
      if (f.dataSource && j.dataSource !== f.dataSource) return false;
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

  function exportSourceLabel(type) {
    return EXPORT_SOURCE_LABELS[type] || type || '-';
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
    let defaultReason = '';
    if (out.defaultFlag) {
      if ((record.totalAssets || 0) <= 0) defaultReason = '资产总计≤0';
      else if (alr0 < 1 && alrAfter >= 1) defaultReason = '压测后资产负债率>100%（基期<100%）';
      else if (alr0 >= 1 && alrAfter >= alr0 * 1.2) defaultReason = '压测后资产负债率增幅>20%（基期≥100%）';
      else defaultReason = '触发违约判定规则';
    }
    const revenue = (out.revenueAfter || 0) + (out.carbonCost || 0);
    const isHighCarbon = window.CRST_CARBON?.isHighCarbonIndustry?.(record.standardIndustry);
    const operatingExpense = isHighCarbon
      ? revenue * (params.costIncomeRatio ?? 0.85) + (out.carbonCost || 0)
      : revenue * (params.costIncomeRatio ?? 0.85);
    return {
      ...out,
      operatingExpense: Math.round(operatingExpense * 100) / 100,
      defaultReason,
      assetLiabilityRatioBefore: alr0,
      assetLiabilityRatioAfter: alrAfter,
    };
  }

  function buildCarbonStressPreview(entityId, t) {
    const carbon = window.CRST_CARBON;
    if (!carbon) return null;
    const recs = entityRecords(entityId, t).filter((r) => {
      const st = effectiveSyncStatus(r);
      return st !== 'ABNORMAL' && st !== 'EXCLUDED' && st !== 'EXCLUDED_NO_REPORT' && r.standardIndustry;
    });
    if (!recs.length) return null;
    const sample = recs[0];
    const methodKey = isStressJobEntity(t) ? t.methodKey : moduleContext?.methodKey;
    const codes = methodKey
      ? [getMethodScenarioCode(methodKey)]
      : selectedScenarioCodes(entityId);
    const code = codes[0] || t.selectedScenarioCodes?.[0] || 'BASELINE';
    let p = getScenarioStressParams(t, code);
    const parsed = readStressParamsFromDom(entityId, code);
    if (parsed.ok) p = parsed.params;
    const testYear = p.endYear || 2040;
    const enriched = {
      ...sample,
      costIncomeRatio: sample.costIncomeRatio ?? p.costIncomeRatio,
      assetLiabilityRatio: sample.assetLiabilityRatio ?? p.assetLiabilityRatio,
      baseNetProfitPositive: p.baseNetProfitPositive,
    };
    const out0 = carbon.runCompanyStress(enriched, code, { testYear, revenueGrowth: p.revenueGrowth });
    const out = applyScenarioAdjustment(out0, code, p);
    const CCUS_IND = ['电力', '建材', '石化', '造纸', '有色', '钢铁'];
    const ccusEligible = CCUS_IND.includes(sample.standardIndustry) && p.baseNetProfitPositive !== false;
    const ccusApplied = ccusEligible && out.carbonPrice >= 500;
    const basisTaskId = isStressJobEntity(t) ? t.sourceTaskId : entityId;
    return {
      sampleName: sample.companyName,
      scenarioName: out.scenarioName,
      testYear,
      emission: out.carbonEmission,
      freeQuotaRatio: out.freeQuotaRatio,
      carbonPrice: out.carbonPrice,
      carbonCost: out.carbonCost,
      ccusEligible,
      ccusApplied,
      emissionBasis: basisTaskId ? emissionCalcBasisLabel({ companyName: sample.companyName }, basisTaskId) : '排放因子 × 营业收入',
    };
  }

  function renderCarbonPreviewCard(entityId, t) {
    const preview = buildCarbonStressPreview(entityId, t);
    if (!preview) {
      return '';
    }
    return `
      <div class="carbon-preview-card">
        <h4 class="carbon-preview-title">碳排放费用计算预览（${esc(preview.sampleName)} · ${esc(preview.scenarioName)} · ${preview.testYear}年）</h4>
        <div class="desc-grid carbon-preview-grid">
          <div class="desc-item"><span class="k">测算口径</span><span>${esc(preview.emissionBasis)}</span></div>
          <div class="desc-item"><span class="k">碳排放量</span><span>${preview.emission?.toLocaleString()} 吨</span></div>
          <div class="desc-item"><span class="k">免费配额比例</span><span>${(preview.freeQuotaRatio * 100).toFixed(2)}%</span></div>
          <div class="desc-item"><span class="k">碳价（插值）</span><span>${preview.carbonPrice} 元/吨</span></div>
          <div class="desc-item"><span class="k">CCUS 适用</span><span>${preview.ccusEligible ? (preview.ccusApplied ? '是（碳价≥500，按500封顶）' : '是（按实际碳价）') : '否'}</span></div>
          <div class="desc-item"><span class="k">碳排放费用</span><span><strong>${preview.carbonCost?.toLocaleString()} 万</strong></span></div>
        </div>
      </div>`;
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
      if (taskFilters.periodStart && t.reportPeriodEnd < taskFilters.periodStart) return false;
      if (taskFilters.periodEnd && t.reportPeriodStart > taskFilters.periodEnd) return false;
      if (taskFilters.status && t.status !== taskFilters.status) return false;
      if (taskFilters.factorVersion) {
        const fv = t.factorVersion || '';
        if (taskFilters.factorVersion === '__none__') return !fv;
        return fv === taskFilters.factorVersion;
      }
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
      periodStart: document.getElementById('tf_period_start')?.value || '',
      periodEnd: document.getElementById('tf_period_end')?.value || '',
      status: document.getElementById('tf_status')?.value ?? '',
      factorVersion: document.getElementById('tf_factor')?.value || '',
    };
  }

  function searchTasks() {
    taskFilters = readTaskFiltersFromDom();
    getListPager('tasks').page = 1;
    render();
  }

  function resetTaskFilters() {
    taskFilters = { name: '', periodStart: '', periodEnd: '', status: '', factorVersion: '' };
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

  function canEditTaskBasicInfo(t) {
    return canEditTask(t) && t.status === 'DRAFT';
  }

  function editTaskEntryStep(t) {
    if (isStressOnlyEditTask(t)) return 3;
    return viewTaskDefaultStep(t);
  }

  function canEditStressSection(t, step) {
    if (!t || taskViewMode || t.status === 'ARCHIVED') return false;
    if (step !== 3) return false;
    if (isStressJobEntity(t)) {
      if (t.status === 'COMPLETED') return taskEditMode;
      return t.status === 'READY';
    }
    if (t.status === 'COMPLETED') return taskEditMode;
    return t.status === 'READY_STRESS';
  }

  function canDeleteTask(t) {
    return TASK_DELETABLE.includes(t.status);
  }

  function taskActions(t) {
    const btns = [];
    btns.push(`<button class="btn btn-link" onclick="CRST_APP.viewTaskInModule(${t.id})">查看</button>`);
    if (canEditTask(t)) btns.push(`<button class="btn btn-link" onclick="CRST_APP.editTask(${t.id})">编辑</button>`);
    if (canDeleteTask(t)) btns.push(`<button class="btn btn-link" onclick="CRST_APP.deleteTask(${t.id})">删除</button>`);
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
    const y = parseInt(String(t?.reportPeriodEnd || '').slice(0, 4), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
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

  function defaultStressParams(t, scenarioCode) {
    const reportYear = parseInt(String(t?.reportPeriodEnd || '').slice(0, 4), 10);
    const startYear = Number.isFinite(reportYear) ? Math.max(reportYear + 1, 2026) : 2026;
    const common = {
      startYear,
      endYear: 2040,
      revenueGrowth: 0.02,
      costIncomeRatio: 0.85,
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

  function getScenarioStressParams(t, scenarioCode) {
    if (!t.stressScenarioParams) t.stressScenarioParams = {};
    return {
      ...defaultStressParams(t, scenarioCode),
      ...(t.stressScenarioParams[scenarioCode] || {}),
    };
  }

  function scenarioInputId(taskId, scenarioCode, field) {
    return `sp_${taskId}_${scenarioCode}_${field}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  function parseInputNumber(id, required) {
    const raw = document.getElementById(id)?.value?.trim() ?? '';
    if (raw === '') return required ? NaN : null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : NaN;
  }

  function readStressParamsFromDom(taskId, scenarioCode) {
    const p = {
      startYear: parseInputNumber(scenarioInputId(taskId, scenarioCode, 'start'), true),
      endYear: parseInputNumber(scenarioInputId(taskId, scenarioCode, 'end'), true),
      revenueGrowth: parseInputNumber(scenarioInputId(taskId, scenarioCode, 'growth'), true),
      costIncomeRatio: parseInputNumber(scenarioInputId(taskId, scenarioCode, 'cost'), true),
      assetLiabilityRatio: parseInputNumber(scenarioInputId(taskId, scenarioCode, 'alr'), true),
      baseNetProfitPositive: (document.getElementById(scenarioInputId(taskId, scenarioCode, 'np'))?.value || 'Y') === 'Y',
    };
    if (!Number.isInteger(p.startYear) || !Number.isInteger(p.endYear)) {
      return { ok: false, msg: '请填写有效的起止年份' };
    }
    if (p.endYear < p.startYear) return { ok: false, msg: '结束年份不能小于起始年份' };
    if (p.endYear > 2050) return { ok: false, msg: '结束年份建议不超过2050' };
    if (!Number.isFinite(p.revenueGrowth) || p.revenueGrowth < -0.5 || p.revenueGrowth > 0.5) {
      return { ok: false, msg: '收入年增长率建议在 -0.5~0.5' };
    }
    if (!Number.isFinite(p.costIncomeRatio) || p.costIncomeRatio <= 0 || p.costIncomeRatio > 2) {
      return { ok: false, msg: '成本收入比需在 0~2 之间' };
    }
    if (!Number.isFinite(p.assetLiabilityRatio) || p.assetLiabilityRatio < 0 || p.assetLiabilityRatio > 2) {
      return { ok: false, msg: '资产负债率需在 0~2 之间' };
    }
    if (scenarioCode === 'BASELINE') {
      p.policyIntensity = parseInputNumber(scenarioInputId(taskId, scenarioCode, 'policyIntensity'), true);
      if (!Number.isFinite(p.policyIntensity) || p.policyIntensity < 0.5 || p.policyIntensity > 2) {
        return { ok: false, msg: '基准情景的政策执行强度建议在 0.5~2' };
      }
    } else if (scenarioCode === 'GREENHOUSE_WORLD') {
      p.physicalLossRatio = parseInputNumber(scenarioInputId(taskId, scenarioCode, 'physicalLossRatio'), true);
      if (!Number.isFinite(p.physicalLossRatio) || p.physicalLossRatio < 0 || p.physicalLossRatio > 0.5) {
        return { ok: false, msg: '温室世界的物理损失率需在 0~0.5' };
      }
    } else if (scenarioCode === 'ORDERLY_TRANSITION') {
      p.greenInvestmentRatio = parseInputNumber(scenarioInputId(taskId, scenarioCode, 'greenInvestmentRatio'), true);
      if (!Number.isFinite(p.greenInvestmentRatio) || p.greenInvestmentRatio < 0 || p.greenInvestmentRatio > 0.5) {
        return { ok: false, msg: '有序转型的绿色投资占比需在 0~0.5' };
      }
    }
    return { ok: true, params: p };
  }

  function selectedScenarioCodes(taskId) {
    return Array.from(document.querySelectorAll(`input[name="sc_${taskId}"]:checked`)).map((el) => el.value);
  }

  function saveStressDraftsFromDom(taskId, t) {
    if (!t) return;
    if (!t.stressScenarioParams) t.stressScenarioParams = {};
    selectedScenarioCodes(taskId).forEach((code) => {
      const parsed = readStressParamsFromDom(taskId, code);
      if (parsed.ok) t.stressScenarioParams[code] = parsed.params;
    });
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

  function summarizeOfflineProcessRecords(records) {
    const abnormal = records.filter((r) => effectiveSyncStatus(r) === 'ABNORMAL').length;
    const needAvg = records.filter((r) => effectiveSyncStatus(r) === 'NEED_AVG').length;
    const disambig = records.filter((r) => r.ambiguityCode && !r.ambiguityConfirmed).length;
    return { abnormal, needAvg, disambig };
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
    const summary = summarizeOfflineProcessRecords(records);
    const labels = DATA_PROCESS_OFFLINE_EXPORT_FIELDS.map((f) => f.label);
    const keys = DATA_PROCESS_OFFLINE_EXPORT_FIELDS.map((f) => f.key);
    return [
      '待线下处理清单（Excel）',
      `任务：${t?.taskName || taskId}`,
      `导出条数：${records.length}（无法处理 ${summary.abnormal}；需计算 ${summary.needAvg}；待甄别 ${summary.disambig}）`,
      '说明：请在线下补全「标准行业/收入/成本收入比/旅客吞吐量」等可填列后，通过「导入处理结果」回传。',
      '',
      labels.join('\t'),
      ...records.map((r) => keys.map((k) => formatOfflineExportCell(r, k)).join('\t')),
    ].join('\n');
  }

  function canUseDataProcessOfflineTools(t, readonly) {
    if (!t || readonly || taskViewMode) return false;
    return ['SYNCING', 'PENDING_DISAMBIG', 'PENDING_CONFIRM', 'PROCESSING'].includes(t.status);
  }

  function exportDataProcessOffline(taskId) {
    const records = getOfflineProcessRecords(taskId);
    if (!records.length) { toast('当前无待线下处理数据', 'info'); return; }
    const t = getTask(taskId);
    const summary = summarizeOfflineProcessRecords(records);
    const sourceKey = `task-${taskId}`;
    const scope = '待线下处理清单（无法处理/需补算/待甄别）';
    const fields = DATA_PROCESS_OFFLINE_EXPORT_FIELDS.map((f) => f.label).join(',');
    const filterDesc = `共 ${records.length} 条；无法处理 ${summary.abnormal} 条；需计算 ${summary.needAvg} 条；待甄别 ${summary.disambig} 条`;
    const { downloadFileName } = appendExportLog({
      sourceKey,
      scope,
      fields,
      filterDesc,
      sourceType: 'DATA_PROCESS',
      exportKind: 'OFFLINE',
      filterSnapshot: { context: 'dataProcessOffline', taskId, count: records.length },
    });
    addLog(taskId, `数据处理：导出待线下处理清单 ${records.length} 条`);
    triggerExportFileDownload(downloadFileName, buildDataProcessOfflineExportText(taskId, records));
    toast(`已导出 ${records.length} 条，可在导出记录中查看或再次下载`);
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
    if (!targets.length) { toast('当前无待导入的处理数据', 'info'); hideModal(); return; }
    let fixed = 0;
    targets.forEach((r, i) => {
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
      r.availabilityReason = '线下补录导入';
      r.dataSource = 'Excel导入';
      fixed += 1;
    });
    refreshSyncStats(taskId);
    t.updatedAt = nowStr();
    if (t.status === 'PENDING_DISAMBIG' && !getPendingDisambigRecords(recordsByTask[taskId] || []).length) {
      t.status = 'PENDING_CONFIRM';
    }
    addLog(taskId, `数据处理：导入线下处理结果，更新 ${fixed} 条`);
    hideModal();
    pendingDataProcessImportTaskId = null;
    dataProcessImportFilePicked = false;
    toast(`已导入 ${fixed} 条处理结果，请核对清单后继续`);
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
      if (f.industry && r.standardIndustry !== f.industry) return false;
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
      provision: Math.round(x.eclAfter * 1.05),
      car: Math.max(8, 12.8 - (x.eclAfter - x.eclBefore) / 500000).toFixed(2) + '%',
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

  function getRiskWarningRows(taskId) {
    const list = applyTaskResultFilter(resultsByTask[taskId] || [], getTaskResultFilter(taskId));
    const map = new Map();
    list.forEach((r) => {
      const triggered = r.defaultFlag || (r.impactRate || 0) >= 0.12;
      if (!triggered) return;
      const prev = map.get(r.companyName);
      if (!prev || (r.impactRate || 0) > (prev.impactRate || 0)) map.set(r.companyName, r);
    });
    return [...map.values()].sort((a, b) => (b.impactRate || 0) - (a.impactRate || 0));
  }

  function riskHintText(r) {
    if (r.defaultFlag) return '资产负债率触发违约阈值';
    if ((r.impactRate || 0) >= 0.12) return '气候转型影响率超预警线';
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
    { page: 'stress-trans', label: '压测方法1-现有政策（基准）' },
    { page: 'stress-phys', label: '压测方法2-温室世界' },
    { page: 'stress-comp', label: '压测方法3-有序转型' },
    { page: 'results', label: '压测结果分析' },
    { page: 'app-report', label: '应用报送' },
    { page: 'exports', label: '导出记录' },
    {
      key: 'config',
      label: '基础配置',
      children: [
        { page: 'factors', label: '因子库管理' },
        { page: 'scenarios', label: '场景计算方法配置' },
        { page: 'mappings', label: '行业映射关系' },
        { page: 'airport-throughput', label: '机场吞吐量维护' },
        { page: 'carbon-emission', label: '投融资碳核算碳排放量' },
        { page: 'calc-doc', label: '计算方法说明' },
      ],
    },
    { page: 'menu-perms', label: '菜单权限', locked: true },
  ];

  const MENU_REGISTRY = MENU_TREE.flatMap((n) =>
    n.children
      ? n.children.map((c) => ({ ...c, group: n.label, section: n.key }))
      : [{ ...n, group: n.label, section: n.page }]
  );

  const MENU_PERM_KEY = 'crst-menu-visibility';
  const MENU_HIDDEN_BY_DEFAULT = new Set(['scenarios', 'calc-doc']);

  function getDefaultMenuVisibility() {
    return Object.fromEntries(
      MENU_REGISTRY.map((m) => [m.page, !MENU_HIDDEN_BY_DEFAULT.has(m.page)])
    );
  }

  function getMenuVisibility() {
    try {
      const raw = localStorage.getItem(MENU_PERM_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.tasks !== undefined && parsed['data-process'] === undefined) {
          parsed['data-process'] = parsed.tasks;
        }
        return { ...getDefaultMenuVisibility(), ...parsed, 'menu-perms': true };
      }
    } catch (_) {}
    return getDefaultMenuVisibility();
  }

  function saveMenuVisibility(vis) {
    const next = { ...vis, 'menu-perms': true };
    try { localStorage.setItem(MENU_PERM_KEY, JSON.stringify(next)); } catch (_) {}
    applyMenuVisibility(next);
  }

  function applyMenuVisibility(vis) {
    const v = vis || getMenuVisibility();
    MENU_REGISTRY.forEach(({ page, locked }) => {
      const link = document.querySelector(`#menu a[data-page="${page}"]`)
        || document.querySelector(`.menu-level-1[data-nav-page="${page}"]`);
      const li = link?.closest('li');
      const sec = link?.closest('.menu-section');
      const show = locked || v[page] !== false;
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
    const found = MENU_REGISTRY.find((m) => !m.locked && v[m.page] !== false);
    return found ? found.page : 'menu-perms';
  }

  const PAGE_SECTION = {
    'data-process': 'data-process',
    'stress-trans': 'stress-trans',
    'stress-phys': 'stress-phys',
    'stress-comp': 'stress-comp',
    results: 'results',
    'app-report': 'app-report',
    exports: 'exports',
    'task-detail': 'data-process',
    factors: 'config', scenarios: 'config', mappings: 'config',
    'airport-throughput': 'config', 'carbon-emission': 'config', 'calc-doc': 'config',
    'menu-perms': 'perms',
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
    if (meta && !meta.locked && vis[page] === false) {
      toast('该菜单已隐藏，请在菜单权限中开启', 'error');
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
    } else {
      const meta = getStressMethodMeta(page);
      if (taskId != null && getStressJob(taskId)) {
        currentStressJobId = taskId;
        stressJobListMode = false;
        moduleContext = { modulePage: page, methodKey: meta?.key, stressJobId: taskId, embedded: true };
      } else if (taskId != null && getTask(taskId)) {
        pendingCreateStressJob = { methodKey: meta?.key || 'trans', sourceTaskId: taskId };
        currentStressJobId = null;
        stressJobListMode = true;
        moduleContext = { modulePage: page, methodKey: meta?.key };
      } else {
        if (page !== currentPage) {
          currentStressJobId = null;
          stressJobListMode = true;
        }
        moduleContext = { modulePage: page, methodKey: meta?.key };
      }
    }
    if (!isTaskManagementPage(page)) {
      closeTaskLogDrawer();
    }
    if (taskId != null) {
      currentTaskId = taskId;
      if (!taskDraftMode) taskDraftMode = false;
    }
    const step = resolveDetailStep(tab);
    if (step != null) {
      if (page === 'data-process') {
        dataProcessTab = step === 0 ? 0 : 1;
        detailStep = step > 1 ? 1 : step;
      } else if (isStressMethodPage(page) && taskId != null && getStressJob(taskId)) {
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

  function isStressMethodPage(page) {
    const p = page || currentPage;
    return p === 'stress-trans' || p === 'stress-phys' || p === 'stress-comp';
  }

  function isStressJobDetailContext() {
    return !!(moduleContext?.stressJobId
      || (currentStressJobId && !stressJobListMode && isStressMethodPage()));
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
      taskViewMode = ['COMPLETED', 'ARCHIVED', 'READY_STRESS'].includes(t.status);
    }
    detailStep = dataProcessTab === 0 ? 0 : 1;
  }

  function renderTaskFlowCard(status, panelHtml, selectedStep) {
    const hideSteps = moduleContext?.embedded || isDataProcessModule() || currentPage === 'data-process';
    const stepsHtml = hideSteps ? '' : `<div class="steps steps-nav">${renderSteps(status, selectedStep)}</div>`;
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
      '<tr><th>任务名称</th><th>报告期</th><th>压测目的</th><th>任务状态</th><th>因子版本</th><th>创建时间</th><th>操作</th></tr>',
      (t) => `<tr>
        <td>${esc(t.taskName)}</td>
        <td>${t.reportPeriodStart} ~ ${t.reportPeriodEnd}</td>
        <td>${esc(stressPurposeLabel(t.stressPurpose))}</td>
        <td>${tag(t.status, STATUS_MAP)}</td>
        <td>${esc(formatFactorVersionDisplay(t.factorVersion))}</td>
        <td>${t.createdAt}</td>
        <td><div class="action-group">${taskActions(t)}</div></td>
      </tr>`, 7);

    const statusFilterOpts = Object.entries(STATUS_MAP).map(([code, meta]) =>
      `<option value="${code}" ${taskFilters.status === code ? 'selected' : ''}>${meta.text}</option>`
    ).join('');
    const factorOpts = [
      '<option value="">全部</option>',
      '<option value="__none__"' + (taskFilters.factorVersion === '__none__' ? ' selected' : '') + '>未绑定</option>',
      ...getFactorVersionCatalog().map((c) =>
        `<option value="${esc(c.version)}" ${taskFilters.factorVersion === c.version ? 'selected' : ''}>${esc(c.label)}</option>`
      ),
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
            <label>报告期</label>
            <div class="filter-date-range">
              <input class="input" id="tf_period_start" type="date" value="${esc(taskFilters.periodStart)}" title="开始日期" />
              <span class="filter-date-sep">至</span>
              <input class="input" id="tf_period_end" type="date" value="${esc(taskFilters.periodEnd)}" title="结束日期" />
            </div>
          </div>
          <div class="filter-item">
            <label>任务状态</label>
            <select class="select" id="tf_status">
              <option value="">全部</option>
              ${statusFilterOpts}
            </select>
          </div>
          <div class="filter-item">
            <label>因子版本</label>
            <select class="select" id="tf_factor">${factorOpts}</select>
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
    const ro = readonly ? 'disabled' : '';
    const caliberOpts = ['<option value="">请选择</option>']
      .concat(DATA_CALIBER_OPTIONS.map((c) => `<option value="${c}" ${t?.dataCaliber === c ? 'selected' : ''}>${c}</option>`))
      .join('');
    const sceneOpts = SCENE_TYPE_OPTIONS.map((o) =>
      `<option value="${o.value}" ${(t?.sceneType || 'REGULATORY') === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    const purposeOpts = STRESS_PURPOSE_OPTIONS.map((o) =>
      `<option value="${o.value}" ${(t?.stressPurpose || 'PBOC') === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    const factorSel = t?.factorVersion
      ? String(t.factorVersion).replace(/^F-/, '')
      : suggestFactorVersionByReportEnd(t?.reportPeriodEnd);
    const factorLocked = readonly || (t && t.status !== 'DRAFT');
    return `
      <div class="form-row">
        <label><span class="req">*</span>任务名称</label>
        <input class="input" id="d_taskName" placeholder="请输入任务名称" value="${esc(t?.taskName || '')}" ${ro} />
      </div>
      <div class="form-grid-2">
        <div class="form-row">
          <label><span class="req">*</span>报告期开始</label>
          <input class="input" id="d_start" type="date" value="${esc(t?.reportPeriodStart || '')}" ${ro} />
        </div>
        <div class="form-row">
          <label><span class="req">*</span>报告期结束</label>
          <input class="input" id="d_end" type="date" value="${esc(t?.reportPeriodEnd || '')}" onchange="CRST_APP.onTaskReportEndChange()" ${ro} />
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-row">
          <label>数据口径</label>
          <select class="select" id="d_caliber" ${ro}>${caliberOpts}</select>
        </div>
        <div class="form-row">
          <label>场景类型</label>
          <select class="select" id="d_sceneType" ${ro}>${sceneOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <label><span class="req">*</span>压测目的</label>
        <select class="select" id="d_stressPurpose" ${ro}>${purposeOpts}</select>
      </div>
      <div class="form-row">
        <label><span class="req">*</span>因子版本</label>
        ${renderFactorVersionSelect(factorSel, factorLocked)}
      </div>
      <div class="form-row">
        <label>任务说明</label>
        <textarea class="textarea" id="d_desc" placeholder="压测目标、范围说明等" ${ro}>${esc(t?.description || '')}</textarea>
      </div>`;
  }

  function onTaskReportEndChange() {
    const end = document.getElementById('d_end')?.value;
    const sel = document.getElementById('d_factorVersion');
    if (end && sel && !sel.disabled) {
      sel.value = suggestFactorVersionByReportEnd(end);
    }
  }

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
    const step = viewTaskDefaultStep(t);
    dataProcessTab = step <= 0 ? 0 : step <= 2 ? 1 : 0;
    navigate('data-process', id, dataProcessTab === 0 ? 0 : 1);
  }

  function openTaskInModule(id) {
    const t = getTask(id);
    if (!t) return;
    const step = viewTaskDefaultStep(t);
    taskEditMode = false;
    if (step <= 2) {
      dataProcessListMode = false;
      dataProcessTab = step <= 0 ? 0 : 1;
      syncDataProcessTaskViewState(t);
      navigate('data-process', id, dataProcessTab === 0 ? 0 : 1);
    } else if (step === 3) {
      taskViewMode = false;
      stressJobListMode = true;
      pendingCreateStressJob = { methodKey: 'trans', sourceTaskId: id };
      navigate('stress-trans');
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
    if (['stress-trans', 'stress-phys', 'stress-comp'].includes(currentPage) && stressJobListMode) return;
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
            <input class="input" id="sf_pdmax_${t.id}" type="number" step="0.01" min="0" max="1" value="${f.pdMax ?? 0.99}" ${ro} />
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
      t.status = 'PENDING_CONFIRM';
      addLog(taskId, '行业甄别：全部完成，进入待确认');
    }
    t.updatedAt = nowStr();
    hideModal();
    toast('甄别结果已保存');
    render();
  }

  /* —— 任务详情（完整流程） —— */
  function renderTaskDetail() {
    if (taskDraftMode) return renderTaskCreatePage();

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
    const credits = entityCredits(entityId, t);
    const ecls = entityEcls(entityId, t);
    const results = entityResults(entityId, t);
    const stressEditOnly = taskEditMode && (isJob ? t.status === 'COMPLETED' : isStressOnlyEditTask(t));
    const completedTaskView = isCompletedTaskViewMode(t);
    const resultTools = showTaskResultTools(t);
    const readonly = t.status === 'ARCHIVED' || (taskViewMode && !completedTaskView)
      || (['COMPLETED'].includes(t.status) && !taskEditMode && !completedTaskView && activeStep < 4)
      || (stressEditOnly && activeStep !== 3 && activeStep !== 4 && activeStep !== 5);
    const stressEditHint = '';
    const stressEditActiveHint = '';

    let panel = '';
    if (activeStep === 0) {
      if (taskEditMode && canEditTaskBasicInfo(t)) {
        panel = `
          <h3 class="step-panel-title">编辑任务 — 基本信息</h3>
          ${renderTaskFormFields(t, { readonly: false })}
          ${renderTaskFormActions('CRST_APP.cancelEditTask()', '保存修改')}`;
      } else if (taskViewMode || stressEditOnly) {
        panel = `
          <h3 class="step-panel-title">查看任务 — 基本信息</h3>
          ${renderTaskFormFields(t, { readonly: true })}`;
      } else {
        panel = `
          <h3 class="step-panel-title">任务概览</h3>
          <div class="desc-grid">
            <div class="desc-item"><span class="k">报告期</span><span>${t.reportPeriodStart} ~ ${t.reportPeriodEnd}</span></div>
            <div class="desc-item"><span class="k">任务状态</span><span>${tag(t.status, STATUS_MAP)}</span></div>
            <div class="desc-item"><span class="k">数据口径</span><span>${esc(t.dataCaliber || '-')}</span></div>
            <div class="desc-item"><span class="k">场景类型</span><span>${esc(sceneTypeLabel(t.sceneType))}</span></div>
            <div class="desc-item"><span class="k">压测目的</span><span>${esc(stressPurposeLabel(t.stressPurpose))}</span></div>
            <div class="desc-item"><span class="k">因子版本</span><span>${esc(formatFactorVersionDisplay(t.factorVersion))}</span></div>
            <div class="desc-item"><span class="k">映射版本</span><span>${esc(t.mappingVersion || getActiveMappingVersion())}</span></div>
            <div class="desc-item"><span class="k">场景公式版本</span><span>${esc(t.scenarioVersion || getPublishedScenarioVersion())}</span></div>
            <div class="desc-item"><span class="k">任务说明</span><span>${esc(t.description || '-')}</span></div>
            <div class="desc-item"><span class="k">更新时间</span><span>${t.updatedAt || t.createdAt}</span></div>
          </div>
          ${canEditTaskBasicInfo(t) && !readonly
            ? `<div class="toolbar" style="margin-top:12px"><button class="btn btn-default" onclick="CRST_APP.editTask(${t.id})">编辑基本信息</button></div>`
            : ''}`;
      }
    } else if (activeStep === 1) {
      panel = `${stressEditHint}<h3 class="step-panel-title">${isDataProcessModule() ? '财务数据处理' : '数据同步与确认'}</h3>`;
      const syncDisabled = !['DRAFT', 'SYNCING', 'PENDING_DISAMBIG', 'PENDING_CONFIRM'].includes(t.status) || readonly;
      const pendingDisambig = t.status === 'PENDING_DISAMBIG' && !readonly;
      const pendingConfirm = t.status === 'PENDING_CONFIRM' && !readonly;
      const processing = t.status === 'PROCESSING' && !readonly;
      const pendingDisambigCount = getPendingDisambigRecords(recs).length;
      const canConfirmList = pendingConfirm && recs.length > 0 && abnormal === 0;
      const needAvgCount = countNeedAvg(recs);
      const avgDone = hasAvgCalculated(t.id);
      const fillDone = isAvgDataFilled(t.id);
      const syncStats = countSyncStatus(recs);

      const airportRecs = recs.filter(isAirportEnterprise);
      const airportFetchedCount = airportRecs.filter((r) => r.throughputFetched).length;
      const airportMissingCount = airportRecs.length - airportFetchedCount;
      const showAirportCols = airportRecs.length > 0;
      const syncStatusFilter = syncListFilters[t.id] || '';
      const filteredRecs = taskViewMode ? recs : filterSyncRecords(recs, t.id);
      const statusFilterOpts = [
        { value: '', label: '全部' },
        { value: 'USABLE', label: '可使用' },
        { value: 'NEED_AVG', label: '需计算' },
        { value: 'ABNORMAL', label: '无法处理' },
        { value: 'EXCLUDED', label: '已排除' },
        { value: 'EXCLUDED_NO_REPORT', label: '财报缺失' },
      ].map((o) => `<option value="${o.value}" ${syncStatusFilter === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
      const showSyncOpCol = (pendingConfirm || pendingDisambig) && !taskViewMode;
      const showInternalSummaryCol = pendingConfirm && t.sceneType === 'INTERNAL' && !taskViewMode;
      const rowClass = (r) => {
        if (r.dataAvailability === 'EXCLUDED_NO_REPORT') return 'row-danger';
        if (r.excluded || r.dataAvailability === 'EXCLUDED') return 'row-muted';
        if (r.ambiguityCode && !r.ambiguityConfirmed) return 'row-warning';
        return '';
      };
      const recRowMapper = (r) => `<tr class="${rowClass(r)}">
        <td>${esc(r.companyName)}</td><td>${esc(r.branchName)}</td>
        <td>${esc(r.customerId || '-')}</td><td>${esc(r.creditNo || '-')}</td>
        <td>${esc(loanRegionLabel(r.loanRegion))}</td>
        <td>${esc(loanClassLabel(r.loanClassification))}</td>
        <td>${r.pdValue != null ? r.pdValue : '-'}</td>
        <td>${esc(r.apiIndustry)}</td><td>${esc(r.gbIndustryCode || '-')}</td><td>${esc(r.standardIndustry || '未映射')}</td>
        ${showAirportCols ? `<td>${isAirportEnterprise(r) ? '是' : '否'}</td><td>${isAirportEnterprise(r)
          ? (r.throughputFetched ? Number(r.passengerThroughput).toLocaleString() : '<span class="tag tag-error">未调取</span>')
          : '-'}</td>` : ''}
        <td>${syncStatusLabel(effectiveSyncStatus(r))}</td>
        <td>${esc(r.availabilityReason)}</td><td>${esc(r.dataSource || '-')}</td>
        ${processing ? `<td>${r.revenue != null ? r.revenue.toLocaleString() : '-'}</td>` : ''}
        ${showSyncOpCol ? `<td>${r.dataAvailability === 'ABNORMAL'
          ? `<button class="btn btn-link" onclick="CRST_APP.excludeRecord(${t.id},${r.id})">删除</button>` : '-'}</td>` : ''}
        ${showInternalSummaryCol ? `<td>${r.reportMissing
          ? `<label class="inline-check"><input type="checkbox" ${r.includeInternalSummary !== false ? 'checked' : ''} onchange="CRST_APP.setIncludeInternalSummary(${t.id}, ${r.id}, this.checked)" /> 纳入</label>`
          : '-'}</td>` : ''}
      </tr>`;
      const syncColspan = 14 + (showAirportCols ? 2 : 0) + (processing ? 1 : 0) + (showSyncOpCol ? 1 : 0) + (showInternalSummaryCol ? 1 : 0);
      const syncThead = `<tr>
          <th>公司</th><th>分行</th><th>客户号</th><th>信贷编号</th><th>地域</th><th>五级分类</th><th>PD值</th>
          <th>接口行业</th><th>国标代码</th><th>标准行业</th>
          ${showAirportCols ? '<th>机场企业</th><th>旅客吞吐量(万人次)</th>' : ''}
          <th>状态</th><th>原因</th><th>数据来源</th>
          ${processing ? '<th>收入(万)</th>' : ''}
          ${showSyncOpCol ? '<th>操作</th>' : ''}
          ${showInternalSummaryCol ? '<th>纳入内部汇总</th>' : ''}
        </tr>`;
      const syncTable = renderTable(filteredRecs, syncThead, recRowMapper, syncColspan);
      const totalCount = t.syncStats?.total ?? recs.length;
      const airportSummary = airportRecs.length
        ? `；机场企业 ${airportRecs.length} 条（吞吐量已调取 ${airportFetchedCount} 条）` : '';
      const syncSummaryText = `同步条数：${totalCount}条；可使用：${syncStats.usable}条；需计算：${syncStats.needAvg}条；无法处理：${syncStats.abnormal}条；已排除：${syncStats.excluded}条${airportSummary}`;
      const offlineRecords = getOfflineProcessRecords(t.id);
      const offlineCount = offlineRecords.length;
      const showOfflineTools = canUseDataProcessOfflineTools(t, readonly) && recs.length;

      let stepFooter = '';
      if (!taskViewMode && pendingDisambig) {
        stepFooter = `
          <div class="step-footer step-footer-hint">
            <span class="step-footer-msg">识别到 <strong>${pendingDisambigCount}</strong> 条行业歧义客户，请先完成甄别确认。</span>
            <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.openIndustryDisambigModal(${t.id})">行业甄别确认</button>
          </div>`;
      } else if (!taskViewMode && pendingConfirm) {
        if (canConfirmList) {
          stepFooter = `
            <div class="step-footer">
              <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.confirmList(${t.id})">下一步：确认清单</button>
            </div>`;
        } else if (abnormal > 0) {
          const airportHint = airportMissingCount > 0
            ? `（含 ${airportMissingCount} 条机场企业旅客吞吐量未调取，请先在「机场吞吐量维护」补录后重新同步）` : '';
          stepFooter = `
            <div class="step-footer step-footer-hint">
              <span class="step-footer-msg">尚有 <strong>${abnormal}</strong> 条无法处理数据${airportHint}，可<strong>导出待处理清单</strong>线下补录后导入，或在列表中删除后再进入下一步</span>
              <button type="button" class="btn btn-default" onclick="CRST_APP.exportDataProcessOffline(${t.id})">导出待处理清单</button>
              <button type="button" class="btn btn-default" onclick="CRST_APP.openDataProcessImportModal(${t.id})">导入处理结果</button>
            </div>`;
        }
      } else if (!taskViewMode && processing) {
        if (needAvgCount === 0 || fillDone) {
          stepFooter = `
            <div class="step-footer">
              <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.confirmAvg(${t.id})">完成数据处理，进入压测方法</button>
            </div>`;
        } else if (!avgDone) {
          stepFooter = `
            <div class="step-footer">
              <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.calcIndustryAvg(${t.id})">计算行业平均值</button>
            </div>`;
        } else if (!fillDone) {
          stepFooter = `
            <div class="step-footer">
              <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.fillIndustryData(${t.id})">填充数据到样本</button>
            </div>`;
        }
      }

      let avgSection = '';
      if (processing && avgDone) {
        const avgRowMapper = (a) => {
          const basis = recs.filter((r) => r.standardIndustry === a.industry && r.dataAvailability === 'USABLE').length;
          return `<tr>
            <td>${esc(a.industry)}</td><td>${basis + (recs.filter((r) => r.standardIndustry === a.industry && r.dataAvailability === 'NEED_AVG').length)}</td>
            <td>${a.avgRevenue?.toLocaleString()}</td><td>${a.avgEbitda?.toLocaleString()}</td>
            <td>${esc(a.calcBasis || '已确认可使用样本')}</td><td>${esc(a.calcTime || '-')}</td><td>${avgFillStatusTag(fillDone)}</td>
          </tr>`;
        };
        avgSection = `
          <h4 class="step-subtitle">行业均值（基于已确认同步数据计算）</h4>
          ${renderTable(avgs, '<tr><th>标准行业</th><th>参与样本数</th><th>均值-收入(万)</th><th>均值-EBITDA(万)</th><th>计算依据</th><th>计算时间</th><th>填充状态</th></tr>', avgRowMapper, 7)}`;
      }

      panel += `
        ${!processing && !taskViewMode ? renderSyncFilterPanel(t, readonly) : ''}
        <p class="sync-summary-text">${syncSummaryText}</p>
        ${showOfflineTools ? `<div class="toolbar step-toolbar-top">
          <button type="button" class="btn btn-default" ${offlineCount ? '' : 'disabled'} onclick="CRST_APP.exportDataProcessOffline(${t.id})">导出待处理清单${offlineCount ? `（${offlineCount}）` : ''}</button>
          <button type="button" class="btn btn-default" onclick="CRST_APP.openDataProcessImportModal(${t.id})">导入处理结果</button>
        </div>` : ''}
        ${!processing && !taskViewMode ? `
        <div class="toolbar step-toolbar-top">
          <button type="button" class="btn btn-primary" ${syncDisabled ? 'disabled' : ''} onclick="CRST_APP.syncFinancial(${t.id})">同步财务数据</button>
        </div>` : ''}
        <h4 class="step-subtitle">${processing ? '已确认企业财务数据' : '同步企业清单'}</h4>
        ${taskViewMode ? '' : `<div class="sync-list-filter">
          <label class="sync-list-filter-label" for="sync_status_${t.id}">状态</label>
          <select class="select sync-status-select" id="sync_status_${t.id}" onchange="CRST_APP.setSyncStatusFilter(${t.id}, this.value)">${statusFilterOpts}</select>
        </div>`}
        ${recs.length ? syncTable : `
        <div class="table-wrap"><table><thead>${syncThead}</thead>
        <tbody><tr><td colspan="${syncColspan}" class="empty">请先同步数据</td></tr></tbody></table></div>`}
        ${avgSection}
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
      const stressEditable = canEditStressSection(t, 3);
      const scenarioReadonly = !stressEditable;
      const readyForStress = isJob ? t.status === 'READY' : t.status === 'READY_STRESS';
      const showFetchToolbar = stressEditable && readyForStress;
      const methodKey = isJob ? t.methodKey : moduleContext?.methodKey;
      const pubScenarios = methodKey
        ? scenariosForMethod(methodKey)
        : scenarios.filter((s) => s.status === 'PUBLISHED');
      const singleScenarioMode = !!methodKey && pubScenarios.length === 1;
      const stressDisabled = !stressEditable || !t.creditFetched || !t.eclFetched;
      const defaultCodes = singleScenarioMode
        ? [pubScenarios[0].scenarioCode]
        : pubScenarios.map((s) => s.scenarioCode);
      const selectedCodes = singleScenarioMode
        ? defaultCodes
        : (t.selectedScenarioCodes?.length
          ? t.selectedScenarioCodes.filter((c) => pubScenarios.some((s) => s.scenarioCode === c))
          : defaultCodes);
      if (singleScenarioMode && isJob) {
        t.selectedScenarioCodes = selectedCodes;
      }
      const checks = singleScenarioMode
        ? `<div class="scenario-single-banner"><strong>压测情景</strong> <span class="tag tag-processing">${esc(pubScenarios[0].scenarioName)}</span></div>`
        : pubScenarios.map((s) =>
          `<label><input type="checkbox" name="sc_${entityId}" value="${esc(s.scenarioCode)}" ${selectedCodes.includes(s.scenarioCode) ? 'checked' : ''} onchange="CRST_APP.onStressScenarioToggle(${entityId})" ${scenarioReadonly ? 'disabled' : ''} /> ${esc(s.scenarioName)}</label>`
        ).join('');
      const dataBanner = isJob ? `
        <div class="desc-grid stress-data-banner" style="margin-bottom:16px">
          <div class="desc-item"><span class="k">数据来源</span><span>${stressDataSourceTag(t.dataSource)} ${t.dataSource === 'REF' ? esc(t.sourceTaskName || '-') : 'Excel 导入'}</span></div>
          <div class="desc-item"><span class="k">数据条数</span><span>${t.recordCount?.toLocaleString()} 条（可用 ${t.usableCount?.toLocaleString()}）</span></div>
          <div class="desc-item"><span class="k">报告期</span><span>${t.reportPeriodStart} ~ ${t.reportPeriodEnd}</span></div>
          <div class="desc-item"><span class="k">数据口径</span><span>${esc(t.dataCaliber || '-')}</span></div>
        </div>` : '';
      const scenarioCardHtml = selectedCodes.map((code) => {
        const sc = pubScenarios.find((s) => s.scenarioCode === code);
        if (!sc) return '';
        const p = getScenarioStressParams(t, code);
        let extra = '';
        if (code === 'BASELINE') {
          extra = `<div class="form-row"><label>政策执行强度系数</label><input class="input" id="${scenarioInputId(entityId, code, 'policyIntensity')}" type="number" step="0.01" value="${p.policyIntensity}" ${scenarioReadonly ? 'disabled' : ''} /></div>`;
        } else if (code === 'GREENHOUSE_WORLD') {
          extra = `<div class="form-row"><label>物理损失率</label><input class="input" id="${scenarioInputId(entityId, code, 'physicalLossRatio')}" type="number" step="0.0001" value="${p.physicalLossRatio}" ${scenarioReadonly ? 'disabled' : ''} /></div>`;
        } else if (code === 'ORDERLY_TRANSITION') {
          extra = `<div class="form-row"><label>绿色投资占比</label><input class="input" id="${scenarioInputId(entityId, code, 'greenInvestmentRatio')}" type="number" step="0.0001" value="${p.greenInvestmentRatio}" ${scenarioReadonly ? 'disabled' : ''} /></div>`;
        }
        return `
          <div class="card" style="margin:12px 0 0">
            <h4 style="margin-bottom:10px">${esc(sc.scenarioName)}参数录入</h4>
            <div class="form-grid-2">
              <div class="form-row"><label>起始年份</label><input class="input" id="${scenarioInputId(entityId, code, 'start')}" type="number" value="${p.startYear}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>结束年份</label><input class="input" id="${scenarioInputId(entityId, code, 'end')}" type="number" value="${p.endYear}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>收入年增长率</label><input class="input" id="${scenarioInputId(entityId, code, 'growth')}" type="number" step="0.0001" value="${p.revenueGrowth}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>成本收入比</label><input class="input" id="${scenarioInputId(entityId, code, 'cost')}" type="number" step="0.0001" value="${p.costIncomeRatio}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>资产负债率</label><input class="input" id="${scenarioInputId(entityId, code, 'alr')}" type="number" step="0.0001" value="${p.assetLiabilityRatio}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>基期净利润为正</label><select class="select" id="${scenarioInputId(entityId, code, 'np')}" ${scenarioReadonly ? 'disabled' : ''}><option value="Y" ${p.baseNetProfitPositive ? 'selected' : ''}>是</option><option value="N" ${!p.baseNetProfitPositive ? 'selected' : ''}>否</option></select></div>
              ${extra}
            </div>
          </div>`;
      }).join('');
      const creditRow = (c) => `<tr>
        <td>${esc(c.companyName)}</td><td>${esc(c.customerId || '-')}</td><td>${esc(c.loanAccountNo || '-')}</td><td>${esc(c.contractNo || '-')}</td>
        <td>${c.loanBalance?.toLocaleString()}</td><td>${esc(c.productType || '-')}</td><td>${esc(c.currency || '-')}</td>
        <td>${esc(c.startDate || '-')}</td><td>${esc(c.maturityDate || '-')}</td><td>${esc(c.remainingTenor || '-')}</td>
        <td>${esc(c.rating)}</td><td>${esc(c.classification)}</td><td>${esc(c.guaranteeType)}</td><td>${esc(c.branchCode || '-')}</td></tr>`;
      const eclRow = (e) => `<tr>
        <td>${esc(e.companyName)}</td><td>${esc(e.customerId || '-')}</td><td>${esc(e.loanAccountNo || '-')}</td>
        <td>${e.pd}</td><td>${e.lgd}</td><td>${e.ead?.toLocaleString()}</td><td>${esc(e.stage)}</td>
        <td>${e.eclAmount?.toLocaleString()}</td><td>${esc(e.modelVersion || '-')}</td><td>${esc(e.measurementDate || '-')}</td></tr>`;
      const runBtnLabel = t.status === 'COMPLETED' ? '重新执行压测' : '执行压测';
      panel = `
        ${dataBanner}
        ${stressEditOnly ? stressEditActiveHint : ''}
        <h3 class="step-panel-title">${stressEditOnly ? '编辑场景压测' : '信贷与 ECL'}</h3>
        ${showFetchToolbar ? `<div class="toolbar toolbar-fetch">
          <div class="toolbar-btn-group">
            <button class="btn btn-primary" onclick="CRST_APP.fetchCredit(${entityId})">调取信贷系统</button>
            <button class="btn btn-primary" onclick="CRST_APP.fetchEcl(${entityId})">调取ECL系统</button>
          </div>
          <span class="fetch-status-hint">${t.creditFetched ? '<span class="badge-dot ok"></span>信贷已拉取' : '<span class="badge-dot warn"></span>信贷未拉取'}
          ${t.eclFetched ? '<span class="badge-dot ok"></span>ECL已拉取' : '<span class="badge-dot warn"></span>ECL未拉取'}</span>
        </div>` : (stressEditOnly ? `<p class="fetch-status-hint" style="margin-bottom:12px">${t.creditFetched ? '<span class="badge-dot ok"></span>信贷已拉取' : ''}
          ${t.eclFetched ? '<span class="badge-dot ok"></span>ECL已拉取' : ''}（已完成任务不可重新调取，仅可调整情景与参数）</p>` : '')}
        ${!stressEditOnly ? `${renderTable(credits, '<tr><th>公司</th><th>客户号</th><th>借据号</th><th>合同号</th><th>贷款余额(万)</th><th>产品类型</th><th>币种</th><th>起息日</th><th>到期日</th><th>剩余期限(月)</th><th>评级</th><th>五级分类</th><th>担保方式</th><th>分行代码</th></tr>', creditRow, 14)}
        <div style="margin-top:16px">
        ${renderTable(ecls, '<tr><th>公司</th><th>客户号</th><th>借据号</th><th>PD</th><th>LGD</th><th>EAD</th><th>减值阶段</th><th>ECL金额</th><th>模型版本</th><th>计量日期</th></tr>', eclRow, 10)}
        </div>` : ''}
        <h3 class="step-panel-title step-panel-title-divider">场景压测</h3>
        <div class="checkbox-group scenario-checkbox-group">${checks || '<span class="scenario-check-empty">无已生效场景，请先在场景计算方法配置中发布。</span>'}</div>
        ${scenarioCardHtml || ''}
        ${stressEditable ? renderCarbonPreviewCard(entityId, t) : ''}
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
        '<tr><th>维度</th><th>样本数</th><th>碳费用合计(万)</th><th>ECL增量(万)</th><th>资本充足率</th><th>违约数</th></tr>',
        (p) => {
          const carbonSum = filtered.filter((r) => (p.dim === '总行' ? true : r.branchName === p.dim))
            .reduce((s, r) => s + (r.carbonCost || 0), 0);
          return `<tr><td>${esc(p.dim)}</td><td>${p.count}</td><td>${carbonSum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td>${p.eclDelta.toLocaleString()}</td><td>${p.car}</td><td>${p.defaultCount}</td></tr>`;
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
          <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.goToApplicationReport(${t.id})">下一步：应用报送</button>
        </div>` : ''}`}`;
    } else if (activeStep === 5) {
      const reportDisabled = !canUseApplicationReport(t);
      const warnings = getRiskWarningRows(t.id);
      const portfolioRows = summarizePortfolioCredit(
        applyTaskResultFilter(results, getTaskResultFilter(t.id)),
        t.id
      );
      const warnedAt = t.riskWarningIssuedAt;
      const regulatoryAt = t.regulatoryReportGeneratedAt;
      const warningRow = (r) => `<tr>
        <td>${esc(r.companyName)}</td><td>${esc(r.branchName)}</td><td>${esc(r.standardIndustry)}</td>
        <td>${esc(r.scenarioName)}</td><td>${esc(r.testYear || '-')}</td>
        <td>${((r.impactRate || 0) * 100).toFixed(2)}%</td>
        <td>${esc(riskHintText(r))}</td>
        <td>${warnedAt ? '<span class="tag tag-success">已下发</span>' : '<span class="tag tag-warning">待下发</span>'}</td>
      </tr>`;
      const portfolioBrowse = renderTable(portfolioRows.slice(0, 4),
        '<tr><th>维度</th><th>ECL增量(万)</th><th>违约数</th><th>资本充足率</th></tr>',
        (p) => `<tr><td>${esc(p.dim)}</td><td>${p.eclDelta.toLocaleString()}</td><td>${p.defaultCount}</td><td>${p.car}</td></tr>`,
        4
      );
      panel = `
        ${stressEditHint}
        <h3 class="step-panel-title">应用报送</h3>
        ${!results.length ? '<div class="empty" style="padding:24px 0">暂无压测结果，请先在「场景压测」步骤执行压测。</div>' : `
        <div class="application-report-grid">
          <div class="application-card application-card--internal">
            <h4 class="application-card-title">内部管理应用</h4>
            <div class="toolbar application-card-actions">
              <button type="button" class="btn btn-primary" ${reportDisabled ? 'disabled' : ''} onclick="CRST_APP.openRiskPushModal(${t.id})">下发风险预警</button>
            </div>
            ${warnedAt ? `<p class="flow-hint">最近下发：${esc(warnedAt)}，共 ${warnings.length} 户</p>` : ''}
            <h5 class="application-subtitle">风险预警清单（${warnings.length} 户）</h5>
            ${warnings.length
              ? renderTable(warnings,
                '<tr><th>公司</th><th>分行</th><th>行业</th><th>情景</th><th>年份</th><th>影响率</th><th>风险提示</th><th>状态</th></tr>',
                warningRow, 8)
              : '<p class="flow-hint">当前筛选下暂无触发违约/预警阈值的企业。</p>'}
            <h5 class="application-subtitle">总行维度结果浏览</h5>
            ${portfolioBrowse}
          </div>
          <div class="application-card application-card--regulatory">
            <h4 class="application-card-title">外部监管报送</h4>
            <div class="toolbar application-card-actions">
              <button type="button" class="btn btn-primary" ${reportDisabled ? 'disabled' : ''} onclick="CRST_APP.generateRegulatoryReport(${t.id})">生成监管报送 Excel</button>
            </div>
            ${regulatoryAt ? `<p class="flow-hint">最近生成：${esc(regulatoryAt)}</p>` : ''}
            <h5 class="application-subtitle">报送文件包</h5>
            <ul class="application-file-list">
              ${REGULATORY_REPORT_FILES.map((f) => `<li><strong>${esc(f.name)}</strong><span>${esc(f.desc)}</span></li>`).join('')}
            </ul>
          </div>
        </div>`}`;
    }

    if (moduleContext?.embedded) {
      return renderTaskFlowCard(t.status, panel, activeStep);
    }
    const logBtn = !taskDraftMode && (!taskViewMode || completedTaskView)
      ? `<button type="button" class="btn btn-default" onclick="CRST_APP.openTaskLogDrawer(${t.id})">操作日志</button>`
      : '';
    return `
      <div class="breadcrumb-row">
        <div class="breadcrumb">
          <a onclick="CRST_APP.backToDataProcessList()">数据处理</a> / ${esc(t.taskName)}
        </div>
        ${logBtn}
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
        const meta = STRESS_METHODS[j.methodKey];
        sources.push({
          key: `job-${j.id}`,
          label: `[${meta?.title || j.methodKey}] ${j.jobName}`,
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

  function renderResults() {
    const { sources, src, res, taskId } = resolveResultSource();
    const dim = window._resultDim || 'industry';
    const years = [...new Set(res.map((r) => r.testYear).filter(Boolean))].sort((a, b) => a - b);
    const yearSel = window._resultYear;
    const year = yearSel === '' || yearSel == null ? null : (yearSel || years[years.length - 1]);
    const scenarioCode = window._resultScenarioCode || '';
    const caliberFilter = window._resultCaliber || '';
    const caliberOpts = [...new Set(res.map((r) => r.measureCaliber).filter(Boolean))];
    const scenarioOpts = sortScenarioCodes([...new Set(res.map((r) => r.scenarioCode).filter(Boolean))]);
    const filteredRes = filterAnalysisResults(res, year, scenarioCode).filter((r) => !caliberFilter || r.measureCaliber === caliberFilter);
    const trendRes = filterAnalysisResults(res, null, scenarioCode);
    const kpi = computeAnalysisKpis(filteredRes);
    const dimRows = aggregateAnalysisByDim(filteredRes, dim);
    const dimLabel = dim === 'branch' ? '分行' : '行业';
    const trend = computeTrendByYearScenario(trendRes);
    const yearRangeLabel = trend.years.length ? `${trend.years[0]}—${trend.years[trend.years.length - 1]}年` : '';
    const defaultMonitor = computeIndustryDefaultMonitor(res, year);
    const yearOptions = years.length
      ? `<option value="" ${year == null ? 'selected' : ''}>全部年份</option>${years.map((y) => `<option value="${y}" ${year === y ? 'selected' : ''}>${y}年</option>`).join('')}`
      : '<option value="">全部年份</option>';
    const srcKey = src?.key || '';
    const canExport = src && canExportSourceKey(srcKey);
    const reportTask = taskId ? getTask(taskId) : null;
    const canAppReport = reportTask && !src?.isJob && canUseApplicationReport(reportTask);

    return `
      <div class="card">
        <h2 class="page-title">压测结果分析</h2>
        <div class="filter-bar">
          <select class="select" onchange="CRST_APP.setResultSource(this.value)">
            ${sources.length
    ? sources.map((s) => `<option value="${esc(s.key)}" ${srcKey === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')
    : '<option value="">暂无已完成结果</option>'}
          </select>
          <select class="select" onchange="CRST_APP.setResultDim(this.value)">
            <option value="industry" ${dim === 'industry' ? 'selected' : ''}>行业维度</option>
            <option value="branch" ${dim === 'branch' ? 'selected' : ''}>分行维度</option>
          </select>
          <select class="select" onchange="CRST_APP.setResultYear(this.value === '' ? '' : +this.value)">
            ${yearOptions}
          </select>
          <select class="select" onchange="CRST_APP.setResultScenario(this.value)">
            <option value="" ${!scenarioCode ? 'selected' : ''}>全部情景</option>
            ${scenarioOpts.map((c) => `<option value="${esc(c)}" ${scenarioCode === c ? 'selected' : ''}>${esc(scenarioDisplayName(c, res))}</option>`).join('')}
          </select>
          ${caliberOpts.length ? `<select class="select" onchange="CRST_APP.setResultCaliber(this.value)">
            <option value="" ${!caliberFilter ? 'selected' : ''}>全部口径</option>
            ${caliberOpts.map((c) => `<option value="${esc(c)}" ${caliberFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>` : ''}
          ${canExport ? `
          <button type="button" class="btn btn-default" onclick="CRST_APP.exportResultsSummary('${esc(srcKey)}')">导出汇总</button>
          <button type="button" class="btn btn-primary" onclick="CRST_APP.openExportDetailModal('${esc(srcKey)}')">导出明细</button>` : ''}
          ${canAppReport ? `<button type="button" class="btn btn-default" onclick="CRST_APP.goToApplicationReport(${taskId})">应用报送</button>` : ''}
        </div>

        <div class="kpi-row">
          <div class="kpi-card kpi-card--c1"><span class="kpi-label">结果条数</span><span class="kpi-value">${kpi.sampleCount}</span><span class="kpi-sub">企业 ${kpi.companyCount} 家</span></div>
          <div class="kpi-card kpi-card--c2"><span class="kpi-label">平均影响率</span><span class="kpi-value">${kpi.avgImpactPct}%</span></div>
          <div class="kpi-card kpi-card--c3"><span class="kpi-label">ECL增量合计</span><span class="kpi-value">${kpi.eclDelta.toLocaleString()}</span><span class="kpi-sub">万</span></div>
          <div class="kpi-card kpi-card--c4"><span class="kpi-label">碳排放费用合计</span><span class="kpi-value">${kpi.carbonCost.toLocaleString()}</span><span class="kpi-sub">万</span></div>
          <div class="kpi-card kpi-card--c5"><span class="kpi-label">违约样本</span><span class="kpi-value">${kpi.defaults}</span><span class="kpi-sub">违约率 ${kpi.defaultRatePct}%</span></div>
        </div>

        <div class="analysis-panel">
          <h3 class="analysis-panel-title">影响率趋势（折线图 · 按年分情景）</h3>
          ${renderTrendLineChart(trend, res)}
        </div>

        <div class="analysis-panel">
          <h3 class="analysis-panel-title">逐年平均影响率${yearRangeLabel ? `（${yearRangeLabel}）` : ''}</h3>
          ${renderYearScenarioPivotTable(trend, res)}
        </div>

        <div class="analysis-panel">
          <h3 class="analysis-panel-title">${dimLabel}汇总明细</h3>
          ${renderTable(dimRows,
    `<tr><th>${dimLabel}</th><th>样本数</th><th>平均影响率</th><th>碳费用(万)</th><th>ECL增量(万)</th><th>违约数</th></tr>`,
    (s) => `<tr><td>${esc(s.name)}</td><td>${s.count}</td><td>${s.impactPct}%</td><td>${s.carbonCost.toLocaleString()}</td><td>${s.eclDelta.toLocaleString()}</td><td>${s.defaults}</td></tr>`,
    6)}
        </div>

        <div class="analysis-panel">
          <h3 class="analysis-panel-title">违约客户监控 — 行业新增不良/违约户（点击下钻客户清单）</h3>
          ${renderDefaultMonitorChart(defaultMonitor, taskId)}
        </div>
      </div>`;
  }

  /* —— 因子库 —— */
  function factorActions(f) {
    const btns = [`<button class="btn btn-link" onclick="CRST_APP.viewFactor(${f.id})">查看</button>`];
    btns.push(`<button class="btn btn-link" onclick="CRST_APP.editFactor(${f.id})">编辑</button>`);
    if (f.status === 'ENABLED') btns.push(`<button class="btn btn-link" onclick="CRST_APP.toggleFactor(${f.id},'DISABLED')">停用</button>`);
    else btns.push(`<button class="btn btn-link" onclick="CRST_APP.toggleFactor(${f.id},'ENABLED')">启用</button>`);
    btns.push(`<button class="btn btn-link" onclick="CRST_APP.deleteFactor(${f.id})">删除</button>`);
    return btns.join('');
  }

  function renderFactors() {
    const table = renderPagedTable('factors', factors,
      '<tr><th>因子编码</th><th>因子名称</th><th>国标代码</th><th>行业大类</th><th>细分类型</th><th>因子值</th><th>单位</th><th>版本</th><th>生效日期</th><th>更新时间</th><th>状态</th><th>操作</th></tr>',
      (f) => `<tr>
      <td>${esc(f.factorCode)}</td><td>${esc(f.factorName)}</td><td>${esc(f.gbCode || '-')}</td><td>${esc(f.industry)}</td>
      <td>${esc(f.subType || '-')}</td><td>${f.factorValue}</td><td>${esc(f.unit)}</td>
      <td>${esc(f.version)}</td><td>${esc(f.effectiveFrom || '-')}</td><td>${esc(f.updatedAt || '-')}</td><td>${tag(f.status, CONFIG_STATUS)}</td>
      <td><div class="action-group">${factorActions(f)}</div></td>
    </tr>`, 12);
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
  function mappingActions(m) {
    return `
      <button class="btn btn-link" onclick="CRST_APP.viewMapping(${m.id})">查看</button>
      <button class="btn btn-link" onclick="CRST_APP.editMapping(${m.id})">编辑</button>
      ${m.status === 'ENABLED'
        ? `<button class="btn btn-link" onclick="CRST_APP.toggleMapping(${m.id},'DISABLED')">停用</button>`
        : `<button class="btn btn-link" onclick="CRST_APP.toggleMapping(${m.id},'ENABLED')">启用</button>`}
      <button class="btn btn-link" onclick="CRST_APP.deleteMapping(${m.id})">删除</button>`;
  }

  function renderMappings() {
    const table = renderPagedTable('mappings', mappings,
      '<tr><th>接口行业</th><th>标准行业</th><th>国标代码</th><th>映射类型</th><th>版本</th><th>状态</th><th>更新时间</th><th>操作</th></tr>',
      (m) => `<tr>
      <td>${esc(m.apiIndustry)}</td><td>${esc(m.standardIndustry)}</td><td>${esc(m.gbCode || '-')}</td><td>${esc(m.mappingType)}</td>
      <td>${esc(m.version)}</td><td>${tag(m.status, CONFIG_STATUS)}</td><td>${m.updatedAt}</td>
      <td><div class="action-group">${mappingActions(m)}</div></td>
    </tr>`, 8);
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
      '<tr><th>机场企业</th><th>机场代码</th><th>年份</th><th>旅客吞吐量(万人次)</th><th>货邮吞吐量(万吨)</th><th>数据来源</th><th>状态</th><th>更新时间</th><th>操作</th></tr>',
      (r) => `<tr>
        <td>${esc(r.airportName)}</td><td>${esc(r.airportCode)}</td><td>${esc(r.year)}</td>
        <td>${Number(r.passengerThroughput).toLocaleString()}</td><td>${Number(r.cargoThroughput).toLocaleString()}</td>
        <td>${esc(r.source)}</td><td>${tag(r.status, CONFIG_STATUS)}</td><td>${esc(r.updatedAt)}</td>
        <td><div class="action-group">${airportThroughputActions(r)}</div></td>
      </tr>`, 9);
    return `
      <div class="card">
        <div class="toolbar">
          <h2 class="page-title">机场吞吐量维护</h2>
          <button class="btn btn-default" onclick="CRST_APP.resetAirportThroughputForm()">新增记录</button>
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
    const kw = exportFilters.taskName.trim();
    return exportLogs.filter((e) => {
      if (kw && !e.taskName.includes(kw)) return false;
      if (exportFilters.scope && e.scope !== exportFilters.scope) return false;
      if (exportFilters.sourceType && e.sourceType !== exportFilters.sourceType) return false;
      return true;
    });
  }

  function searchExports() {
    exportFilters.taskName = document.getElementById('ef_task')?.value?.trim() || '';
    exportFilters.scope = document.getElementById('ef_scope')?.value || '';
    exportFilters.sourceType = document.getElementById('ef_source')?.value || '';
    getListPager('exports').page = 1;
    render();
  }

  function resetExportFilters() {
    exportFilters = { taskName: '', scope: '', sourceType: '' };
    getListPager('exports').page = 1;
    render();
  }

  function renderExports() {
    const filtered = filterExportList();
    const scopeOpts = [...new Set(exportLogs.map((e) => e.scope))].sort();
    const sourceOpts = Object.entries(EXPORT_SOURCE_LABELS).map(([k, v]) =>
      `<option value="${k}" ${exportFilters.sourceType === k ? 'selected' : ''}>${esc(v)}</option>`
    ).join('');
    const table = renderPagedTable('exports', filtered,
      '<tr><th>任务名称</th><th>来源类型</th><th>导出类型</th><th>下载文件</th><th>范围</th><th>筛选条件</th><th>导出人</th><th>时间</th><th>操作</th></tr>',
      (e) => {
        const fileName = getExportDownloadFileName(e);
        const filterText = e.filter || '-';
        return `<tr>
      <td>${esc(e.taskName)}</td>
      <td>${esc(exportSourceLabel(e.sourceType))}</td>
      <td>${esc(exportKindLabel(e.exportKind))}</td>
      <td class="export-download-cell"><span class="export-download-name" data-tip="${esc(fileName)}" title="${esc(fileName)}">${esc(fileName)}</span></td>
      <td>${esc(e.scope)}</td>
      <td class="export-filter-cell" title="${esc(filterText)}">${esc(filterText)}</td>
      <td>${esc(e.operator)}</td><td>${e.exportedAt}</td>
      <td class="table-actions">
        <button class="btn btn-link" onclick="CRST_APP.downloadExport(${e.id})">下载</button>
        ${e.sourceKey ? `<button class="btn btn-link" onclick="CRST_APP.openExportSource('${esc(e.sourceKey)}', '${esc(e.sourceType)}')">查看来源</button>` : ''}
      </td>
    </tr>`;
      }, 9, 'table-exports-wrap');
    return `
      <div class="card">
        <h2 class="page-title">导出记录</h2>
        <div class="task-filter-bar export-filter-bar">
          <div class="filter-item">
            <label>任务名称</label>
            <input class="input" id="ef_task" placeholder="模糊搜索" value="${esc(exportFilters.taskName)}" onkeydown="if(event.key==='Enter')CRST_APP.searchExports()" />
          </div>
          <div class="filter-item">
            <label>来源类型</label>
            <select class="select" id="ef_source">
              <option value="">全部</option>
              ${sourceOpts}
            </select>
          </div>
          <div class="filter-item">
            <label>范围</label>
            <select class="select" id="ef_scope">
              <option value="">全部</option>
              ${scopeOpts.map((s) => `<option value="${esc(s)}" ${exportFilters.scope === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-item filter-actions">
            <button class="btn btn-primary" onclick="CRST_APP.searchExports()">查询</button>
            <button class="btn btn-default" onclick="CRST_APP.resetExportFilters()">重置</button>
          </div>
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
    const logBtn = `<button type="button" class="btn btn-default" onclick="CRST_APP.openTaskLogDrawer(${currentTaskId})">操作日志</button>`;

    return `
      <div class="module-page">
        <div class="breadcrumb-row">
          <div class="breadcrumb">
            <a onclick="CRST_APP.backToDataProcessList()">数据处理</a> / ${esc(t.taskName)}
          </div>
          ${logBtn}
        </div>
        ${renderDataProcessSubnav()}
        ${detail}
      </div>`;
  }

  function renderStressJobList(methodKey, title, pageId) {
    const filtered = filterStressJobList(methodKey);
    const f = stressJobFilters[methodKey];
    const statusOpts = Object.entries(STRESS_JOB_STATUS).map(([k, v]) =>
      `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v.text}</option>`
    ).join('');
    const sourceOpts = Object.entries(STRESS_DATA_SOURCE).map(([k, v]) =>
      `<option value="${k}" ${f.dataSource === k ? 'selected' : ''}>${v.text}</option>`
    ).join('');
    const table = renderPagedTable(`stress-jobs-${methodKey}`, filtered,
      '<tr><th>压测任务名称</th><th>数据来源</th><th>关联数据任务</th><th>报告期</th><th>数据条数</th><th>可用条数</th><th>状态</th><th>更新时间</th><th>操作</th></tr>',
      (j) => `<tr>
        <td>${esc(j.jobName)}</td>
        <td>${stressDataSourceTag(j.dataSource)}</td>
        <td>${j.dataSource === 'REF' ? esc(j.sourceTaskName || '-') : '-'}</td>
        <td>${j.reportPeriodStart} ~ ${j.reportPeriodEnd}</td>
        <td>${(j.recordCount || 0).toLocaleString()}</td>
        <td>${(j.usableCount || 0).toLocaleString()}</td>
        <td>${stressJobStatusTag(j.status)}</td>
        <td>${esc(j.updatedAt || j.createdAt)}</td>
        <td><div class="action-group">
          <button class="btn btn-link" onclick="CRST_APP.openStressJob(${j.id}, '${pageId}')">${j.status === 'COMPLETED' ? '查看' : '进入压测'}</button>
          ${j.status === 'COMPLETED' ? `<button class="btn btn-link" onclick="CRST_APP.viewStressResults(${j.id})">结果</button>` : ''}
          ${j.status === 'DRAFT' ? `<button class="btn btn-link" onclick="CRST_APP.deleteStressJob(${j.id})">删除</button>` : ''}
        </div></td>
      </tr>`, 9);
    return `
      <div class="card">
        <div class="toolbar">
          <h2 class="page-title">${title}</h2>
          <button class="btn btn-primary" onclick="CRST_APP.openCreateStressJobModal('${methodKey}')">新建压测任务</button>
        </div>
        <div class="task-filter-bar">
          <div class="filter-item">
            <label>任务名称</label>
            <input class="input" id="sf_name_${methodKey}" placeholder="模糊搜索" value="${esc(f.name)}" onkeydown="if(event.key==='Enter')CRST_APP.searchStressJobs('${methodKey}')" />
          </div>
          <div class="filter-item">
            <label>状态</label>
            <select class="select" id="sf_status_${methodKey}">
              <option value="">全部</option>
              ${statusOpts}
            </select>
          </div>
          <div class="filter-item">
            <label>数据来源</label>
            <select class="select" id="sf_source_${methodKey}">
              <option value="">全部</option>
              ${sourceOpts}
            </select>
          </div>
          <div class="filter-item">
            <label>报告期</label>
            <div class="filter-date-range">
              <input class="input" id="sf_start_${methodKey}" type="date" value="${esc(f.periodStart)}" />
              <span class="filter-date-sep">至</span>
              <input class="input" id="sf_end_${methodKey}" type="date" value="${esc(f.periodEnd)}" />
            </div>
          </div>
          <div class="filter-item filter-actions">
            <button type="button" class="btn btn-primary" onclick="CRST_APP.searchStressJobs('${methodKey}')">查询</button>
            <button type="button" class="btn btn-default" onclick="CRST_APP.resetStressJobFilters('${methodKey}')">重置</button>
          </div>
        </div>
        ${table}
      </div>`;
  }

  function renderStressMethodModule(methodKey, title, pageId) {
    moduleContext = { modulePage: pageId, methodKey, embedded: false };
    let body;
    if (stressJobListMode || !currentStressJobId) {
      body = renderStressJobList(methodKey, title, pageId);
      if (pendingCreateStressJob?.methodKey === methodKey) {
        setTimeout(() => openCreateStressJobModal(methodKey, pendingCreateStressJob.sourceTaskId), 0);
        pendingCreateStressJob = null;
      }
    } else {
      const job = getStressJob(currentStressJobId);
      if (!job || job.methodKey !== methodKey) {
        stressJobListMode = true;
        currentStressJobId = null;
        body = renderStressJobList(methodKey, title, pageId);
      } else {
        moduleContext = { modulePage: pageId, methodKey, stressJobId: job.id, embedded: true };
        stressJobDetailStep = 3;
        taskViewMode = job.status === 'COMPLETED' && !taskEditMode;
        const panel = renderTaskDetail();
        moduleContext.embedded = false;
        const logBtn = `<button type="button" class="btn btn-default" onclick="CRST_APP.openTaskLogDrawer(${job.id})">操作日志</button>`;
        body = `
          <div class="breadcrumb-row">
            <div class="breadcrumb">
              <a onclick="CRST_APP.backToStressJobList('${pageId}')">${title}</a> / ${esc(job.jobName)}
            </div>
            ${logBtn}
          </div>
          ${panel}`;
      }
    }
    return `<div class="module-page">${body}</div>`;
  }

  function searchStressJobs(methodKey) {
    stressJobFilters[methodKey] = {
      name: document.getElementById(`sf_name_${methodKey}`)?.value || '',
      status: document.getElementById(`sf_status_${methodKey}`)?.value || '',
      dataSource: document.getElementById(`sf_source_${methodKey}`)?.value || '',
      periodStart: document.getElementById(`sf_start_${methodKey}`)?.value || '',
      periodEnd: document.getElementById(`sf_end_${methodKey}`)?.value || '',
    };
    getListPager(`stress-jobs-${methodKey}`).page = 1;
    render();
  }

  function resetStressJobFilters(methodKey) {
    stressJobFilters[methodKey] = { name: '', status: '', dataSource: '', periodStart: '', periodEnd: '' };
    getListPager(`stress-jobs-${methodKey}`).page = 1;
    render();
  }

  function openStressJob(jobId, pageId) {
    currentStressJobId = jobId;
    stressJobListMode = false;
    taskEditMode = false;
    taskViewMode = getStressJob(jobId)?.status === 'COMPLETED';
    navigate(pageId, jobId, 3);
  }

  function backToStressJobList(pageId) {
    stressJobListMode = true;
    currentStressJobId = null;
    taskEditMode = false;
    taskViewMode = false;
    navigate(pageId);
  }

  function editStressJob(jobId) {
    const j = getStressJob(jobId);
    if (!j || j.status !== 'COMPLETED') return;
    taskEditMode = true;
    taskViewMode = false;
    openStressJob(jobId, STRESS_METHODS[j.methodKey]?.pageId || 'stress-trans');
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
    if (!j || j.status !== 'DRAFT') { toast('仅草稿可删除', 'error'); return; }
    if (!confirm(`确认删除压测任务「${j.jobName}」？`)) return;
    const idx = stressJobs.findIndex((x) => x.id === jobId);
    if (idx >= 0) stressJobs.splice(idx, 1);
    delete stressRecordsByJob[jobId];
    delete stressCreditByJob[jobId];
    delete stressEclByJob[jobId];
    delete stressResultsByJob[jobId];
    delete stressJobLogs[jobId];
    if (currentStressJobId === jobId) backToStressJobList(STRESS_METHODS[j.methodKey]?.pageId);
    else render();
    toast('已删除');
  }

  function openCreateStressJobModal(methodKey, presetSourceTaskId) {
    createStressJobMethodKey = methodKey;
    stressImportFilePicked = false;
    document.getElementById('sj_name').value = '';
    const processed = getProcessedDataTasks();
    const sel = document.getElementById('sj_ref_task');
    if (processed.length) {
      sel.innerHTML = processed.map((t) => {
        const cnt = getTaskRecordCountForRef(t);
        return `<option value="${t.id}" ${presetSourceTaskId === t.id ? 'selected' : ''}>${esc(t.taskName)}（${cnt.toLocaleString()} 条，${t.reportPeriodStart}~${t.reportPeriodEnd}）</option>`;
      }).join('');
      document.querySelector('input[name="sj_source"][value="REF"]').checked = true;
    } else {
      sel.innerHTML = '<option value="">暂无已完成数据处理的任务</option>';
      document.querySelector('input[name="sj_source"][value="IMPORT"]').checked = true;
    }
    onStressJobSourceChange();
    const preset = presetSourceTaskId ? getTask(presetSourceTaskId) : processed[0];
    if (preset) {
      document.getElementById('sj_import_start').value = preset.reportPeriodStart || '';
      document.getElementById('sj_import_end').value = preset.reportPeriodEnd || '';
      document.getElementById('sj_import_caliber').value = preset.dataCaliber || '05财报';
    }
    document.getElementById('sj_import_count').value = '500';
    document.getElementById('sj_import_file_hint').textContent = '未选择文件，保存时将按条数生成';
    showModal('modalCreateStressJob');
  }

  function onStressJobSourceChange() {
    const src = document.querySelector('input[name="sj_source"]:checked')?.value || 'REF';
    document.getElementById('sj_ref_panel').style.display = src === 'REF' ? '' : 'none';
    document.getElementById('sj_import_panel').style.display = src === 'IMPORT' ? '' : 'none';
  }

  function mockPickStressImportFile() {
    stressImportFilePicked = true;
    document.getElementById('sj_import_file_hint').textContent = '已选择：气候风险压测财务数据导入模板.xlsx';
  }

  function confirmCreateStressJob() {
    const methodKey = createStressJobMethodKey;
    const meta = STRESS_METHODS[methodKey];
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
      job = {
        id: jobId,
        methodKey,
        jobName: name,
        jobCode: genCode(`ST-${methodKey.toUpperCase()}`),
        dataSource: 'REF',
        sourceTaskId: taskId,
        sourceTaskName: source.taskName,
        recordCount: count,
        usableCount: countUsableFinancialRecords(cloned),
        reportPeriodStart: source.reportPeriodStart,
        reportPeriodEnd: source.reportPeriodEnd,
        dataCaliber: source.dataCaliber,
        status: 'READY',
        factorVersion: source.factorVersion,
        scenarioVersion: source.scenarioVersion || getPublishedScenarioVersion(),
        creditFetched: false,
        eclFetched: false,
        createdAt: nowStr(),
        updatedAt: nowStr(),
      };
      addStressJobLog(jobId, `新建压测任务：引用数据处理任务「${source.taskName}」，复制 ${count.toLocaleString()} 条财务数据`);
    } else {
      const start = document.getElementById('sj_import_start')?.value;
      const end = document.getElementById('sj_import_end')?.value;
      const caliber = document.getElementById('sj_import_caliber')?.value;
      const count = parseInt(document.getElementById('sj_import_count')?.value, 10) || 500;
      const tpl = cloneFinancialRecords(mockSyncRecords(0, { syncFilters: { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 } }), Math.min(count, 5000));
      stressRecordsByJob[jobId] = tpl;
      job = {
        id: jobId,
        methodKey,
        jobName: name,
        jobCode: genCode(`ST-${methodKey.toUpperCase()}`),
        dataSource: 'IMPORT',
        sourceTaskId: null,
        sourceTaskName: null,
        recordCount: tpl.length,
        usableCount: countUsableFinancialRecords(tpl),
        reportPeriodStart: start || '2024-01-01',
        reportPeriodEnd: end || '2024-12-31',
        dataCaliber: caliber,
        status: 'READY',
        factorVersion: suggestFactorVersionByReportEnd(end),
        scenarioVersion: getPublishedScenarioVersion(),
        creditFetched: false,
        eclFetched: false,
        createdAt: nowStr(),
        updatedAt: nowStr(),
      };
      addStressJobLog(jobId, `新建压测任务：${stressImportFilePicked ? '导入 Excel' : '按条数生成'} ${tpl.length.toLocaleString()} 条财务数据`);
    }
    job.selectedScenarioCodes = [getMethodScenarioCode(methodKey)];
    stressJobs.unshift(job);
    hideModal();
    toast('压测任务已创建');
    openStressJob(jobId, meta.pageId);
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

  function renderApplicationReportBody(taskId) {
    const t = getTask(taskId);
    if (!t) return '<div class="empty">任务不存在</div>';
    const results = resultsByTask[taskId] || [];
    if (!results.length) {
      return '<div class="empty" style="padding:24px 0">暂无压测结果，请先在压测方法中完成压测。</div>';
    }
    const warnings = getRiskWarningRows(taskId);
    const ranking = computeIndustryBadLoanRanking(results, window._appReportYear || null);
    const warnedAt = t.riskWarningIssuedAt;
    const regulatoryAt = t.regulatoryReportGeneratedAt;
    const pushChannels = t.riskPushChannels || [];
    const reportDisabled = !canUseApplicationReport(t);
    return `
        <div class="application-report-grid">
          <div class="application-card application-card--internal">
            <h4 class="application-card-title">内部管理应用</h4>
            <div class="toolbar application-card-actions">
              <button type="button" class="btn btn-primary" ${reportDisabled ? 'disabled' : ''} onclick="CRST_APP.openRiskPushModal(${taskId})">下发风险预警</button>
            </div>
            ${warnedAt ? `<p class="flow-hint">最近下发：${esc(warnedAt)}；渠道：${esc(pushChannels.join('、') || '系统内消息')}；共 ${warnings.length} 户</p>` : ''}
            <h5 class="application-subtitle">行业客户不良排行榜</h5>
            ${ranking.length
              ? renderTable(ranking.slice(0, 8),
                '<tr><th>行业</th><th>新增不良/违约户</th><th>操作</th></tr>',
                (d) => `<tr><td>${esc(d.name)}</td><td>${d.count}</td><td><button class="btn btn-link" onclick="CRST_APP.openDefaultDrill('${esc(d.name)}', ${taskId})">查看客户清单</button></td></tr>`,
                3)
              : '<p class="flow-hint">暂无新增不良/违约样本</p>'}
          </div>
          <div class="application-card application-card--regulatory">
            <h4 class="application-card-title">外部监管报送</h4>
            <div class="toolbar application-card-actions">
              <button type="button" class="btn btn-primary" ${reportDisabled ? 'disabled' : ''} onclick="CRST_APP.generateRegulatoryReport(${taskId})">生成监管报送 Excel</button>
            </div>
            ${regulatoryAt ? `<p class="flow-hint">最近生成：${esc(regulatoryAt)}</p>` : ''}
            <h5 class="application-subtitle">报送文件包</h5>
            <ul class="application-file-list">
              ${REGULATORY_REPORT_FILES.map((f) => `<li><strong>${esc(f.name)}</strong><span>${esc(f.desc)}</span></li>`).join('')}
            </ul>
          </div>
        </div>`;
  }

  function renderApplicationReportPage() {
    const completed = tasks.filter((t) => ['COMPLETED', 'ARCHIVED'].includes(t.status));
    const taskId = window._appReportTaskId || completed[0]?.id;
    const t = getTask(taskId);
    if (!t) {
      return `<div class="card"><h2 class="page-title">应用报送</h2><div class="empty">暂无已完成任务</div></div>`;
    }
    return `
      <div class="card">
        <h2 class="page-title">应用报送</h2>
        <div class="filter-bar">
          <select class="select" onchange="CRST_APP.setAppReportTask(+this.value)">
            ${completed.map((x) => `<option value="${x.id}" ${taskId === x.id ? 'selected' : ''}>${esc(x.taskName)}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-link" onclick="CRST_APP.navigate('results'); CRST_APP.setResultSource('task-${taskId}')">查看压测结果</button>
        </div>
        ${renderApplicationReportBody(taskId)}
      </div>`;
  }

  function computeIndustryBadLoanRanking(res, year) {
    return computeIndustryDefaultMonitor(res, year);
  }

  function renderDefaultMonitorChart(items, taskId) {
    if (!items.length) return '<div class="empty">当前筛选下无新增不良/违约样本</div>';
    const max = Math.max(...items.map((d) => d.count), 1);
    const bars = items.slice(0, 10).map((d, i) =>
      `<button type="button" class="chart-bar-col chart-bar-clickable" style="--h:${Math.round((d.count / max) * 100)}%;--c:${analysisColor(i)}" onclick="CRST_APP.openDefaultDrill('${esc(d.name)}', ${taskId})" title="点击查看客户清单">
        <span class="chart-bar-val">${d.count}</span><span class="chart-bar-lbl">${esc(d.name)}</span>
      </button>`
    ).join('');
    return `<div class="chart-bar chart-bar-vbar chart-bar-clickable-wrap">${bars}</div>`;
  }

  function openDefaultDrill(industry, taskId) {
    const res = resultsByTask[taskId] || [];
    const year = window._resultYear || null;
    const items = computeIndustryDefaultMonitor(res, year === '' ? null : year);
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
    if (!confirm('确认删除？')) return;
    carbonEmissionRows.splice(carbonEmissionRows.findIndex((r) => r.id === id), 1);
    toast('已删除'); render();
  }

  function setAppReportTask(id) { window._appReportTaskId = id; render(); }

  function openRiskPushModal(taskId) {
    const t = getTask(taskId);
    if (!canExportTaskResults(t)) { toast('请先完成压测', 'error'); return; }
    const warnings = getRiskWarningRows(taskId);
    if (!warnings.length) { toast('当前无触发违约/预警阈值的企业', 'info'); return; }
    pendingRiskPushTaskId = taskId;
    document.getElementById('wecomPreview').innerHTML = `
      <div class="wecom-card-mock">
        <div class="wecom-card-title">气候风险预警 · ${esc(t.taskName)}</div>
        <div class="wecom-card-body">触发预警企业 <strong>${warnings.length}</strong> 户，请及时关注行业转型影响与违约风险。</div>
        <div class="wecom-card-foot">华夏银行绿金系统</div>
      </div>`;
    showModal('modalRiskPush');
  }

  function confirmIssueRiskWarnings() {
    const taskId = pendingRiskPushTaskId;
    if (!taskId) return;
    const t = getTask(taskId);
    const warnings = getRiskWarningRows(taskId);
    const channels = [];
    if (document.getElementById('pushChannelSystem')?.checked) channels.push('系统内消息');
    if (document.getElementById('pushChannelWecom')?.checked) channels.push('企业微信');
    if (!channels.length) { toast('请至少选择一种推送渠道', 'error'); return; }
    t.riskWarningIssuedAt = nowStr();
    t.riskPushChannels = channels;
    t.updatedAt = nowStr();
    addLog(taskId, `应用报送：向 ${warnings.length} 户企业所在分行下发风险预警（${channels.join('、')}）`);
    hideModal();
    toast(`已通过 ${channels.join('、')} 下发 ${warnings.length} 户风险预警`);
    render();
  }

  function render() {
    const el = document.getElementById('content');
    const pages = {
      'data-process': renderDataProcessModule,
      'stress-trans': () => renderStressMethodModule('trans', STRESS_METHODS.trans.title, 'stress-trans'),
      'stress-phys': () => renderStressMethodModule('phys', STRESS_METHODS.phys.title, 'stress-phys'),
      'stress-comp': () => renderStressMethodModule('comp', STRESS_METHODS.comp.title, 'stress-comp'),
      results: renderResults,
      'app-report': renderApplicationReportPage,
      exports: renderExports,
      factors: renderFactors,
      scenarios: renderScenarios,
      mappings: renderMappings,
      'airport-throughput': renderAirportThroughput,
      'carbon-emission': renderCarbonEmission,
      'calc-doc': renderCalcDoc,
      'menu-perms': renderMenuPermissions,
    };
    el.innerHTML = (pages[currentPage] || renderDataProcessModule)();
    syncTaskLogUi();
  }

  function renderPermTreeNode(node, vis, depth) {
    if (node.children) {
      const pages = node.children.map((c) => c.page);
      const allOn = pages.every((p) => vis[p] !== false);
      const children = node.children.map((c) => renderPermTreeNode(c, vis, depth + 1)).join('');
      return `<li class="tree-branch">
        <label class="tree-row" style="--tree-depth:${depth}">
          <input type="checkbox" data-group="${node.key}" ${allOn ? 'checked' : ''} onchange="CRST_APP.onGroupPermChange('${node.key}', this.checked)" />
          <span class="tree-label">${esc(node.label)}</span>
        </label>
        <ul class="menu-perm-tree">${children}</ul>
      </li>`;
    }
    const checked = vis[node.page] !== false;
    return `<li class="tree-leaf">
      <label class="tree-row" style="--tree-depth:${depth}">
        <input type="checkbox" data-page="${node.page}" ${checked ? 'checked' : ''} ${node.locked ? 'disabled' : ''} onchange="CRST_APP.applyMenuPermTree()" />
        <span class="tree-label">${esc(node.label)}</span>
      </label>
    </li>`;
  }

  function renderMenuPermissions() {
    const vis = getMenuVisibility();
    const treeHtml = MENU_TREE.map((n) => renderPermTreeNode(n, vis, 0)).join('');
    return `
      <div class="card menu-perm-card">
        <h2 class="page-title">菜单权限</h2>
        <ul class="menu-perm-tree menu-perm-tree-root">${treeHtml}</ul>
      </div>`;
  }

  function readMenuPermFromTree() {
    const vis = getDefaultMenuVisibility();
    document.querySelectorAll('.menu-perm-tree-root input[data-page]').forEach((el) => {
      vis[el.dataset.page] = el.checked;
    });
    vis['menu-perms'] = true;
    return vis;
  }

  function syncGroupCheckboxes() {
    MENU_TREE.forEach((node) => {
      if (!node.children) return;
      const pages = node.children.map((c) => c.page);
      const allOn = pages.every((p) => {
        const el = document.querySelector(`.menu-perm-tree-root input[data-page="${p}"]`);
        return el && el.checked;
      });
      const g = document.querySelector(`.menu-perm-tree-root input[data-group="${node.key}"]`);
      if (g) g.checked = allOn;
    });
  }

  function applyMenuPermTree() {
    saveMenuVisibility(readMenuPermFromTree());
    syncGroupCheckboxes();
    if (getMenuVisibility()[currentPage] === false) navigate(firstVisibleMenuPage());
  }

  function onGroupPermChange(groupKey, checked) {
    const node = MENU_TREE.find((n) => n.key === groupKey);
    if (!node?.children) return;
    node.children.forEach((c) => {
      const el = document.querySelector(`.menu-perm-tree-root input[data-page="${c.page}"]`);
      if (el && !el.disabled) el.checked = checked;
    });
    applyMenuPermTree();
  }

  function renderCalcDoc() {
    if (window.CALC_DOC_CONTENT) return window.CALC_DOC_CONTENT.render();
    return '<div class="card empty">计算方法文档未加载</div>';
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
    if (!confirm('确认删除该机场吞吐量记录？')) return;
    airportThroughputRows.splice(airportThroughputRows.findIndex((r) => r.id === id), 1);
    if (airportThroughputEditId === id) airportThroughputEditId = null;
    toast('已删除');
    render();
  }

  /* —— 任务 CRUD & 状态机 —— */
  function startCreateTask() {
    navigate('data-process', null, 0, { draft: true });
  }

  function editTask(id) {
    const t = getTask(id);
    if (!canEditTask(t)) { toast('当前状态不可编辑', 'error'); return; }
    taskDraftMode = false;
    taskEditMode = true;
    taskViewMode = false;
    detailStep = editTaskEntryStep(t);
    if (isStressOnlyEditTask(t)) {
      const existing = stressJobs.find((j) => j.sourceTaskId === t.id && j.methodKey === 'trans');
      if (existing) openStressJob(existing.id, 'stress-trans');
      else {
        pendingCreateStressJob = { methodKey: 'trans', sourceTaskId: t.id };
        navigate('stress-trans');
      }
      return;
    }
    dataProcessListMode = false;
    dataProcessTab = detailStep <= 0 ? 0 : 1;
    navigate('data-process', id, detailStep <= 0 ? 0 : 1);
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
      start: document.getElementById('d_start')?.value || '',
      end: document.getElementById('d_end')?.value || '',
      caliber: document.getElementById('d_caliber')?.value || '两种口径均输出',
      sceneType: document.getElementById('d_sceneType')?.value || 'REGULATORY',
      stressPurpose: document.getElementById('d_stressPurpose')?.value || 'PBOC',
      desc: document.getElementById('d_desc')?.value || '',
      factorVersion: document.getElementById('d_factorVersion')?.value || '',
    };
  }

  function saveTask() {
    const { name, start, end, caliber, sceneType, stressPurpose, desc, factorVersion } = readTaskFormFields();
    if (!name || !start || !end || !factorVersion) { toast('请填写必填项', 'error'); return; }

    if (taskDraftMode) {
      const createdId = ++nextId.task;
      tasks.unshift({
        id: createdId,
        taskCode: genCode('CRST'),
        taskName: name,
        reportPeriodStart: start,
        reportPeriodEnd: end,
        dataCaliber: caliber,
        sceneType,
        stressPurpose,
        syncFilters: { loanRegion: 'DOMESTIC', loanClasses: [], pdMax: 0.99 },
        description: desc,
        factorVersion,
        status: 'DRAFT',
        createdAt: nowStr(),
        updatedAt: nowStr(),
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
      if (isStressOnlyEditTask(t)) {
        toast('已完成任务仅可在「场景压测」步骤调整情景与参数，请重新执行压测', 'error');
        return;
      }
      t.taskName = name;
      t.reportPeriodStart = start;
      t.reportPeriodEnd = end;
      t.dataCaliber = caliber;
      t.sceneType = sceneType;
      t.stressPurpose = stressPurpose;
      t.description = desc;
      t.factorVersion = factorVersion;
      t.updatedAt = nowStr();
      addLog(t.id, '创建任务：编辑任务基本信息');
      taskEditMode = false;
      taskViewMode = false;
      dataProcessListMode = false;
      const targetStep = editTaskEntryStep(t);
      detailStep = targetStep;
      dataProcessTab = targetStep <= 0 ? 0 : 1;
      toast('任务已更新');
      navigate('data-process', t.id, targetStep <= 0 ? 0 : 1);
      return;
    }
  }

  function deleteTask(id) {
    const t = getTask(id);
    if (!canDeleteTask(t)) { toast('仅草稿可删除', 'error'); return; }
    pendingDeleteTaskId = id;
    const nameEl = document.getElementById('deleteTaskName');
    if (nameEl) nameEl.textContent = t.taskName || '-';
    showModal('modalTaskDelete');
  }

  function confirmDeleteTask() {
    if (!pendingDeleteTaskId) return;
    const i = tasks.findIndex((x) => x.id === pendingDeleteTaskId);
    if (i < 0) { pendingDeleteTaskId = null; hideModal(); return; }
    tasks.splice(i, 1);
    pendingDeleteTaskId = null;
    hideModal();
    toast('已删除');
    render();
  }

  function cancelDeleteTask() {
    pendingDeleteTaskId = null;
    hideModal();
  }

  function startSync(id) {
    const t = getTask(id);
    if (t.status !== 'DRAFT') return;
    t.status = 'SYNCING';
    t.updatedAt = nowStr();
    addLog(id, '数据同步与确认：开始同步财务数据');
    render();
    setTimeout(() => {
      if (!t.factorVersion) t.factorVersion = suggestFactorVersionByReportEnd(t.reportPeriodEnd);
      t.mappingVersion = 'M-' + getActiveMappingVersion();
      t.scenarioVersion = 'S-' + getPublishedScenarioVersion();
      recordsByTask[id] = mockSyncRecords(id, t);
      const recs = recordsByTask[id];
      applyReportMissingRules(t, recs);
      const airportStats = fetchAirportThroughputForTask(id);
      refreshSyncStats(id);
      const pendingDisambig = getPendingDisambigRecords(recs);
      t.status = pendingDisambig.length ? 'PENDING_DISAMBIG' : 'PENDING_CONFIRM';
      t.updatedAt = nowStr();
      addLog(id, pendingDisambig.length
        ? `数据同步与确认：财务数据同步完成，识别 ${pendingDisambig.length} 条行业歧义客户，待甄别确认`
        : '数据同步与确认：财务数据同步完成，待确认清单');
      if (airportStats.total) {
        addLog(id, `数据同步与确认：机场企业旅客吞吐量调取成功 ${airportStats.success} 条，待维护 ${airportStats.fail} 条`);
      }
      toast(pendingDisambig.length
        ? `同步完成，${pendingDisambig.length} 条行业歧义待甄别`
        : airportStats.fail
          ? `财务数据同步完成；${airportStats.fail} 条机场企业旅客吞吐量待维护`
          : '财务数据同步完成');
      render();
      if (currentPage === 'data-process' && currentTaskId === id) detailStep = 1;
      render();
    }, 800);
  }

  function syncAirportThroughput(id) {
    const t = getTask(id);
    if (!['SYNCING', 'PENDING_DISAMBIG', 'PENDING_CONFIRM', 'PROCESSING'].includes(t.status)) {
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
    const f = getTaskSyncFilters(t);
    const templates = [
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
    let rows = templates.map((tpl, i) => {
      const map = mappings.find((m) => m.apiIndustry === tpl.apiIndustry && m.status === 'ENABLED');
      const std = tpl.standardIndustry || (map ? map.standardIndustry : '');
      let avail = 'USABLE';
      let reason = tpl.ambiguityCode ? '待行业甄别' : '数据完整';
      if (!std) { avail = 'ABNORMAL'; reason = '行业未映射'; }
      else if (tpl.reportMissing) { avail = 'NEED_AVG'; reason = '财报缺失'; }
      else if (i === 2 && !tpl.ambiguityCode) { avail = 'NEED_AVG'; reason = '关键指标缺失，需行业均值补算'; }
      return {
        id: taskId * 100 + i,
        ...tpl,
        standardIndustry: std,
        dataAvailability: avail,
        availabilityReason: reason,
        dataSource: avail === 'USABLE' ? '接口原始' : '待补算',
        ambiguityConfirmed: !tpl.ambiguityCode,
      };
    });
    if (f.loanRegion) rows = rows.filter((r) => r.loanRegion === f.loanRegion);
    if (Number.isFinite(f.pdMax)) rows = rows.filter((r) => r.pdValue == null || r.pdValue <= f.pdMax);
    if (f.loanClasses?.length) rows = rows.filter((r) => f.loanClasses.includes(r.loanClassification));
    return rows;
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
    toast(needN ? '清单已确认，请计算行业平均值' : '清单已确认，可直接进入场景压测');
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
    toast(left ? '已删除，请继续处理其余无法处理数据' : '无法处理数据已清理完毕，可进入下一步');
    render();
  }

  function calcIndustryAvg(id) {
    const t = getTask(id);
    if (t.status !== 'PROCESSING') { toast('请先确认清单', 'error'); return; }
    const recs = recordsByTask[id] || [];
    const industries = [...new Set(recs.filter((r) => r.dataAvailability === 'NEED_AVG').map((r) => r.standardIndustry))];
    if (!industries.length) {
      toast('无需行业均值补算', 'error');
      return;
    }
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
    addLog(id, '数据同步与确认：计算行业平均值');
    toast('行业平均值已计算，请填充至样本');
    render();
  }

  function fillIndustryData(id) {
    const t = getTask(id);
    if (t.status !== 'PROCESSING') return;
    if (!hasAvgCalculated(id)) { toast('请先计算行业平均值', 'error'); return; }
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
    addLog(id, '数据处理：确认处理结果，进入压测方法');
    toast('数据处理已完成，可在「压测方法1-现有政策（基准）」新建压测任务并引用本任务数据');
    pendingCreateStressJob = { methodKey: 'trans', sourceTaskId: id };
    stressJobListMode = true;
    currentStressJobId = null;
    navigate('stress-trans');
  }

  function fetchCredit(id) {
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
      addStressJobLog(id, `场景压测：调取信贷系统数据（${creditData.length} 条）`);
    } else {
      creditByTask[id] = creditData;
      addLog(id, '场景压测：调取信贷系统数据');
    }
    t.creditFetched = true;
    t.updatedAt = nowStr();
    toast('信贷数据已获取');
    render();
  }

  function fetchEcl(id) {
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
      addStressJobLog(id, `场景压测：调取 ECL 系统数据（${eclData.length} 条）`);
    } else {
      eclByTask[id] = eclData;
      addLog(id, '场景压测：调取 ECL 系统数据');
    }
    t.eclFetched = true;
    t.updatedAt = nowStr();
    toast('ECL数据已获取');
    render();
  }

  function runStress(id) {
    const t = resolveEntity(id);
    if (!t) return;
    const isJob = isStressJobEntity(t);
    const allowedStatus = isJob ? ['READY', 'COMPLETED'] : ['READY_STRESS', 'COMPLETED'];
    if (!allowedStatus.includes(t.status)) {
      toast('当前状态不可执行压测', 'error');
      return;
    }
    if (t.status === 'COMPLETED' && !taskEditMode) {
      toast('请通过「编辑」进入场景压测后再调整并重新执行', 'error');
      return;
    }
    if (!canEditStressSection(t, 3)) {
      toast('当前不可编辑场景压测', 'error');
      return;
    }
    if (!t.creditFetched || !t.eclFetched) { toast('请先调取信贷与ECL', 'error'); return; }
    const carbon = window.CRST_CARBON;
    if (!carbon) { toast('计算逻辑模块未加载', 'error'); return; }

    const selectedCodes = selectedScenarioCodes(id);
    const defaultScenarios = isJob
      ? scenariosForMethod(t.methodKey)
      : scenarios.filter((s) => s.status === 'PUBLISHED');
    const scenarioCodes = selectedCodes.length
      ? selectedCodes
      : defaultScenarios.map((s) => s.scenarioCode);
    if (!scenarioCodes.length) { toast('请至少选择一个压测场景', 'error'); return; }
    if (!t.stressScenarioParams) t.stressScenarioParams = {};
    const scenarioParamsMap = {};
    for (const code of scenarioCodes) {
      const parsed = readStressParamsFromDom(id, code);
      if (!parsed.ok) { toast(`${scenarios.find((s) => s.scenarioCode === code)?.scenarioName || code}：${parsed.msg}`, 'error'); return; }
      scenarioParamsMap[code] = parsed.params;
      t.stressScenarioParams[code] = parsed.params;
    }
    t.selectedScenarioCodes = scenarioCodes;
    const minStart = Math.min(...Object.values(scenarioParamsMap).map((p) => p.startYear));
    const maxEnd = Math.max(...Object.values(scenarioParamsMap).map((p) => p.endYear));

    t.status = isJob ? 'STRESSING' : 'STRESSING';
    const logStart = `场景压测：开始执行（${scenarioCodes.length}个情景，${minStart}-${maxEnd}年）`;
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

      const list = [];
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
            const out0 = carbon.runCompanyStress(enriched, code, { testYear: y, revenueGrowth: p.revenueGrowth });
            const out = enrichStressResult(applyScenarioAdjustment(out0, code, p), enriched, p);
            list.push({
              companyName: r.companyName,
              branchName: r.branchName,
              standardIndustry: r.standardIndustry,
              scenarioCode: out.scenarioCode,
              scenarioName: out.scenarioName,
              testYear: y,
              revenueGrowth: p.revenueGrowth,
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
        render();
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
  function openFactorModal(mode, id) {
    const f = id ? factors.find((x) => x.id === id) : null;
    modalState = { type: 'factor', mode, id };
    const titles = { create: '新增因子', view: '查看因子', edit: '编辑因子' };
    document.querySelector('#modalFactor .modal-hd').textContent = titles[mode] || '因子';
    const readonly = mode === 'view';
    ['f_code', 'f_name', 'f_gb', 'f_ind', 'f_subType', 'f_type', 'f_val', 'f_unit', 'f_version', 'f_effectiveFrom'].forEach((fid) => {
      const el = document.getElementById(fid);
      if (el) el.disabled = readonly;
    });
    document.getElementById('f_code').value = f?.factorCode || '';
    document.getElementById('f_name').value = f?.factorName || '';
    document.getElementById('f_gb').value = f?.gbCode || '';
    document.getElementById('f_ind').value = f?.industry || '';
    document.getElementById('f_subType').value = f?.subType || '';
    document.getElementById('f_type').value = f?.scenarioType || 'TRANSITION';
    document.getElementById('f_val').value = f?.factorValue ?? '';
    document.getElementById('f_unit').value = f?.unit || 'tCO2e/百万元';
    document.getElementById('f_version').value = f?.version || 'V2.0-行内方法';
    document.getElementById('f_effectiveFrom').value = f?.effectiveFrom || new Date().toISOString().slice(0, 10);
    document.querySelector('#modalFactor .modal-ft .btn-primary').style.display = readonly ? 'none' : '';
    showModal('modalFactor');
  }

  function saveFactor() {
    const code = document.getElementById('f_code').value.trim();
    const name = document.getElementById('f_name').value.trim();
    if (!code || !name) { toast('请填写必填项', 'error'); return; }
    const payload = {
      factorCode: code,
      factorName: name,
      gbCode: document.getElementById('f_gb').value.trim(),
      industry: document.getElementById('f_ind').value,
      subType: document.getElementById('f_subType').value.trim(),
      scenarioType: document.getElementById('f_type').value,
      factorValue: parseFloat(document.getElementById('f_val').value) || 0,
      unit: document.getElementById('f_unit').value,
      version: document.getElementById('f_version').value.trim() || 'V2.0-行内方法',
      status: 'ENABLED',
      effectiveFrom: document.getElementById('f_effectiveFrom').value || new Date().toISOString().slice(0, 10),
      updatedAt: nowStr(),
    };
    if (modalState.mode === 'create') {
      factors.unshift({ id: ++nextId.factor, ...payload });
      toast('因子已新增');
    } else {
      Object.assign(factors.find((x) => x.id === modalState.id), payload);
      toast('因子已更新');
    }
    hideModal();
    render();
  }

  function deleteFactor(id) {
    if (!confirm('确认删除该因子？')) return;
    const i = factors.findIndex((f) => f.id === id);
    factors.splice(i, 1);
    toast('已删除');
    render();
  }

  function toggleFactor(id, status) {
    const f = factors.find((x) => x.id === id);
    f.status = status;
    f.updatedAt = nowStr();
    toast(status === 'ENABLED' ? '已启用' : '已停用');
    render();
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
    if (s.status !== 'DRAFT') { toast('仅草稿可删除', 'error'); return; }
    if (!confirm('确认删除？')) return;
    scenarios.splice(scenarios.indexOf(s), 1);
    toast('已删除');
    render();
  }

  /* —— 映射 CRUD —— */
  function openMappingModal(mode, id) {
    const m = id ? mappings.find((x) => x.id === id) : null;
    modalState = { type: 'mapping', mode, id };
    const titles = { create: '新增行业映射', view: '查看映射', edit: '编辑映射' };
    document.querySelector('#modalMapping .modal-hd').textContent = titles[mode] || '行业映射';
    const readonly = mode === 'view';
    document.getElementById('m_api').disabled = readonly;
    document.getElementById('m_std').disabled = readonly;
    document.getElementById('m_type').disabled = readonly;
    document.getElementById('m_gb').disabled = readonly;
    document.getElementById('m_api').value = m?.apiIndustry || '';
    document.getElementById('m_std').value = m?.standardIndustry || '';
    document.getElementById('m_type').value = m?.mappingType || '多对一';
    document.getElementById('m_gb').value = m?.gbCode || '';
    document.querySelector('#modalMapping .modal-ft .btn-primary').style.display = readonly ? 'none' : '';
    showModal('modalMapping');
  }

  function saveMapping() {
    const api = document.getElementById('m_api').value.trim();
    const std = document.getElementById('m_std').value.trim();
    if (!api || !std) { toast('请填写必填项', 'error'); return; }
    const payload = {
      apiIndustry: api,
      standardIndustry: std,
      gbCode: document.getElementById('m_gb').value.trim(),
      mappingType: document.getElementById('m_type').value,
      version: 'V1.0',
      status: 'ENABLED',
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
    if (!confirm('确认删除该映射？')) return;
    mappings.splice(mappings.findIndex((m) => m.id === id), 1);
    toast('已删除');
    render();
  }

  function toggleMapping(id, status) {
    mappings.find((m) => m.id === id).status = status;
    toast(status === 'ENABLED' ? '已启用' : '已停用');
    render();
  }

  function issueRiskWarnings(taskId) {
    openRiskPushModal(taskId);
  }

  function generateRegulatoryReport(taskId) {
    const t = getTask(taskId);
    if (!canExportTaskResults(t)) { toast('请先完成压测', 'error'); return; }
    const sourceKey = `task-${taskId}`;
    const scope = '外部监管报送-人民银行模板';
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
    const scope = '压测明细（按筛选与所选字段）';
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
        stressJobDetailStep = step;
        render();
        return;
      }
      if (isDataProcessModule() && step > 1) {
        if (step >= 3) {
          navigate(step === 3 ? 'stress-trans' : step === 4 ? 'results' : 'results', currentTaskId, step);
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
    setResultSource: (key) => { window._resultSourceKey = key; getListPager('results').page = 1; render(); },
    setResultDim: (d) => { window._resultDim = d; getListPager('results').page = 1; render(); },
    setResultYear: (y) => { window._resultYear = y === '' ? '' : y; getListPager('results').page = 1; render(); },
    setResultScenario: (c) => { window._resultScenarioCode = c || ''; getListPager('results').page = 1; render(); },
    setResultCaliber: (c) => { window._resultCaliber = c || ''; getListPager('results').page = 1; render(); },
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
    openStressJob, backToStressJobList, openCreateStressJobModal,
    onStressJobSourceChange, mockPickStressImportFile, confirmCreateStressJob,
    editStressJob, viewStressResults, deleteStressJob,
    editTask,
    confirmDeleteTask, cancelDeleteTask,
    startCreateTask, cancelCreateTask, cancelEditTask, onTaskReportEndChange, saveTask, deleteTask, startSync, syncAirportThroughput, confirmList, excludeRecord, setSyncStatusFilter,
    saveSyncFilters, openExcludeCustomerModal, toggleExcludeAll, confirmExcludeCustomers,
    openIndustryDisambigModal, saveIndustryDisambig,
    exportDataProcessOffline, openDataProcessImportModal, mockPickDataProcessImportFile, confirmDataProcessImport,
    calcIndustryAvg, fillIndustryData, confirmAvg, fetchCredit, fetchEcl, runStress, goToApplicationReport,
    togglePdAdjust, setIncludeInternalSummary,
    openFactorModal, saveFactor, viewFactor: (id) => openFactorModal('view', id),
    editFactor: (id) => openFactorModal('edit', id), deleteFactor, toggleFactor,
    openScenarioModal, saveScenario, viewScenario: (id) => openScenarioModal('view', id),
    editScenario: (id) => openScenarioModal('edit', id), publishScenario, disableScenario, deleteScenario,
    openMappingModal, saveMapping, viewMapping: (id) => openMappingModal('view', id),
    editMapping: (id) => openMappingModal('edit', id), deleteMapping, toggleMapping,
    resetAirportThroughputForm, editAirportThroughput, saveAirportThroughput, deleteAirportThroughput,
    resetCarbonEmissionForm, editCarbonEmission, saveCarbonEmission, deleteCarbonEmission,
    exportResultsSummary, openExportDetailModal, toggleExportDetailFields, doExportDetail,
    issueRiskWarnings, openRiskPushModal, confirmIssueRiskWarnings, openDefaultDrill,
    generateRegulatoryReport, openExportSource,
    downloadExport, syncFinancial: startSync, hideModal,
    openTaskLogDrawer, closeTaskLogDrawer,
    toggleSider, setSiderCollapsed,
    applyMenuPermTree, onGroupPermChange,
  };

  applyMenuVisibility();
  const initVis = getMenuVisibility();
  if (initVis[currentPage] === false) currentPage = firstVisibleMenuPage();
  render();
})();
