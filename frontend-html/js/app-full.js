/**
 * 气候风险压测 — 完整版原型（含 CRUD 与状态流转）
 */
(function () {
  const S = window.CRST_STORE;
  const {
    STATUS_MAP, AVAIL_MAP, CONFIG_STATUS,
    tasks, recordsByTask, avgByTask, creditByTask, eclByTask, resultsByTask, taskLogs,
    factors, scenarios, mappings, exportLogs, nextId, genCode, addLog,
    getPublishedScenarioVersion, getActiveFactorVersion, getActiveMappingVersion,
    getFactorVersionCatalog, suggestFactorVersionByReportEnd, formatFactorVersionDisplay,
  } = S;

  let currentPage = 'tasks';
  let currentTaskId = null;
  let taskDraftMode = false;
  let taskEditMode = false;
  let taskViewMode = false;
  let detailStep = 0;
  const TAB_TO_STEP = { overview: 0, sync: 1, process: 2, external: 3, stress: 3, result: 4, log: 5 };
  let taskFilters = { name: '', periodStart: '', periodEnd: '', step: '', factorVersion: '' };
  const LIST_PAGE_SIZES = [10, 20, 50, 100];
  const listPagers = {};
  /** 任务详情同步清单状态筛选：taskId -> '' | USABLE | NEED_AVG | ABNORMAL */
  const syncListFilters = {};
  /** 任务详情压测结果筛选：taskId -> filters */
  const taskResultFilters = {};
  let exportFilters = { taskName: '', scope: '' };
  const SYNC_STATUS_TEXT = {
    USABLE: '可使用',
    NEED_AVG: '需计算',
    ABNORMAL: '无法处理',
  };
  let modalState = null;
  let pendingDeleteTaskId = null;
  let toastTimer = null;
  let taskLogDrawerOpen = false;

  let airportThroughputRows = [
    { id: 1, airportName: '华南机场运营有限公司', airportCode: 'CAN', year: 2024, passengerThroughput: 6350, cargoThroughput: 205, source: '机场运营数据接口', status: 'ENABLED', updatedAt: '2025-06-04' },
    { id: 2, airportName: '华东枢纽机场股份', airportCode: 'SHA', year: 2024, passengerThroughput: 4720, cargoThroughput: 168, source: '手工维护', status: 'ENABLED', updatedAt: '2025-06-04' },
  ];
  let nextAirportThroughputId = 10;
  let airportThroughputEditId = null;

  const TASK_EDITABLE = ['DRAFT', 'SYNCING', 'PENDING_CONFIRM', 'PROCESSING', 'READY_STRESS', 'STRESSING', 'COMPLETED'];
  const TASK_DELETABLE = ['DRAFT'];
  const STEP_ORDER = ['DRAFT', 'SYNCING', 'PENDING_CONFIRM', 'PROCESSING', 'READY_STRESS', 'STRESSING', 'COMPLETED', 'ARCHIVED'];
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
    { key: 'eclBefore', label: 'ECL(前)' },
    { key: 'eclAfter', label: 'ECL(后)' },
    { key: 'impactRate', label: '影响率' },
    { key: 'defaultFlag', label: '违约' },
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
    detailStep = 5;
    addLog(id, '压测结果：确认结果，进入应用报送');
    navigate('task-detail', id, 5);
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

  function appendExportLog({ taskId, scope, fields, filterDesc }) {
    const t = getTask(taskId);
    const exportedAt = nowStr();
    const taskName = t?.taskName || '结果分析';
    const downloadFileName = buildExportDownloadFileName(taskName, exportedAt);
    exportLogs.unshift({
      id: ++nextId.export,
      taskCode: t?.taskCode || '-',
      taskName,
      exportType: '表格',
      fileFormat: 'Excel',
      scope,
      fields,
      filter: filterDesc || '',
      operator: '总行管理员',
      exportedAt,
      downloadFileName,
    });
    return { downloadFileName, exportedAt, taskName };
  }

  function getTask(id) {
    return tasks.find((t) => t.id === id);
  }

  function stepIndex(status) {
    const map = {
      DRAFT: 0, SYNCING: 1, PENDING_CONFIRM: 1, PROCESSING: 2,
      READY_STRESS: 3, STRESSING: 3, COMPLETED: 5, ARCHIVED: 5,
    };
    return map[status] ?? 0;
  }

  /** 列表/概览展示的当前步骤名，与详情页步骤条 STEP_LABELS 完全一致 */
  function taskStepLabel(status) {
    return STEP_LABELS[stepIndex(status)];
  }

  function taskStepTag(status) {
    const idx = stepIndex(status);
    const text = taskStepLabel(status);
    const cls = idx >= 5 ? 'tag-success' : idx >= 4 ? 'tag-processing' : idx >= 2 ? 'tag-processing' : idx === 1 ? 'tag-warning' : 'tag-default';
    return `<span class="tag ${cls}">${esc(text)}</span>`;
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
      if (taskFilters.step !== '' && String(stepIndex(t.status)) !== taskFilters.step) return false;
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
      step: document.getElementById('tf_step')?.value ?? '',
      factorVersion: document.getElementById('tf_factor')?.value || '',
    };
  }

  function searchTasks() {
    taskFilters = readTaskFiltersFromDom();
    getListPager('tasks').page = 1;
    render();
  }

  function resetTaskFilters() {
    taskFilters = { name: '', periodStart: '', periodEnd: '', step: '', factorVersion: '' };
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
    if (t.status === 'COMPLETED') return taskEditMode;
    return t.status === 'READY_STRESS';
  }

  function canDeleteTask(t) {
    return TASK_DELETABLE.includes(t.status);
  }

  function taskActions(t) {
    const btns = [];
    if (canEditTask(t)) btns.push(`<button class="btn btn-link" onclick="CRST_APP.editTask(${t.id})">编辑</button>`);
    btns.push(`<button class="btn btn-link" onclick="CRST_APP.viewTask(${t.id})">查看</button>`);
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
    if (isRecordAvgFilled(r)) return 'USABLE';
    return r.dataAvailability;
  }

  function countSyncStatus(recs) {
    let usable = 0;
    let needAvg = 0;
    let abnormal = 0;
    recs.forEach((r) => {
      const s = effectiveSyncStatus(r);
      if (s === 'USABLE') usable++;
      else if (s === 'NEED_AVG') needAvg++;
      else if (s === 'ABNORMAL') abnormal++;
    });
    return { usable, needAvg, abnormal };
  }

  function syncStatusLabel(avail) {
    return SYNC_STATUS_TEXT[avail] || avail || '-';
  }

  function avgFillStatusTag(filled) {
    return filled
      ? '<span class="tag tag-success">已填充</span>'
      : '<span class="tag tag-warning">未填充</span>';
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
    {
      key: 'stress',
      label: '气候风险压测',
      children: [
        { page: 'tasks', label: '压测任务管理' },
        { page: 'results', label: '压测结果分析' },
        { page: 'exports', label: '导出记录' },
      ],
    },
    {
      key: 'config',
      label: '基础配置',
      children: [
        { page: 'factors', label: '因子库管理' },
        { page: 'scenarios', label: '场景计算方法配置' },
        { page: 'mappings', label: '行业映射关系' },
        { page: 'airport-throughput', label: '机场吞吐量维护' },
        { page: 'calc-doc', label: '计算方法说明' },
      ],
    },
    { page: 'menu-perms', label: '菜单权限', locked: true },
  ];

  const MENU_REGISTRY = MENU_TREE.flatMap((n) =>
    n.children ? n.children.map((c) => ({ ...c, group: n.label, section: n.key })) : [{ ...n, group: n.label, section: 'perms' }]
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
    tasks: 'stress', results: 'stress', exports: 'stress', 'task-detail': 'stress',
    factors: 'config', scenarios: 'config', mappings: 'config', 'airport-throughput': 'config', 'calc-doc': 'config',
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

  function navigate(page, taskId, tab) {
    const vis = getMenuVisibility();
    const meta = MENU_REGISTRY.find((m) => m.page === page);
    if (meta && !meta.locked && vis[page] === false) {
      toast('该菜单已隐藏，请在菜单权限中开启', 'error');
      page = firstVisibleMenuPage();
    }
    currentPage = page;
    if (page !== 'task-detail') {
      taskDraftMode = false;
      taskEditMode = false;
      taskViewMode = false;
    }
    if (!isTaskManagementPage(page)) {
      closeTaskLogDrawer();
    }
    if (taskId != null) {
      currentTaskId = taskId;
      taskDraftMode = false;
    }
    const step = resolveDetailStep(tab);
    if (step != null) detailStep = step;
    document.querySelectorAll('#menu a[data-page]').forEach((a) => {
      a.classList.toggle('active', a.dataset.page === page && !['task-detail', 'task-wizard'].includes(page));
    });
    document.querySelectorAll('.menu-level-1[data-nav-page]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.navPage === page);
    });
    if (page === 'task-detail') {
      document.querySelectorAll('#menu a[data-page="tasks"]').forEach((a) => a.classList.add('active'));
    }
    syncMenuSections(page);
    render();
  }

  function renderSteps(status, selectedStep) {
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

  function renderTaskFlowCard(status, panelHtml, selectedStep) {
    return `
      <div class="card task-flow-card">
        <div class="steps steps-nav">${renderSteps(status, selectedStep)}</div>
        <div class="step-panel">${panelHtml}</div>
      </div>`;
  }

  /* —— 压测任务列表 —— */
  function renderTasks() {
    const filtered = filterTaskList();
    const table = renderPagedTable('tasks', filtered,
      '<tr><th>任务名称</th><th>报告期</th><th>当前步骤</th><th>因子版本</th><th>创建时间</th><th>操作</th></tr>',
      (t) => `<tr>
        <td>${esc(t.taskName)}</td>
        <td>${t.reportPeriodStart} ~ ${t.reportPeriodEnd}</td>
        <td>${taskStepTag(t.status)}</td>
        <td>${esc(formatFactorVersionDisplay(t.factorVersion))}</td>
        <td>${t.createdAt}</td>
        <td><div class="action-group">${taskActions(t)}</div></td>
      </tr>`, 6);

    const stepFilterOpts = STEP_LABELS.map((label, i) =>
      `<option value="${i}" ${taskFilters.step === String(i) ? 'selected' : ''}>${label}</option>`
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
          <h2 class="page-title">压测任务管理</h2>
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
            <label>当前步骤</label>
            <select class="select" id="tf_step">
              <option value="">全部</option>
              ${stepFilterOpts}
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
    const calibers = ['合并报表', '母公司', '单体报表'];
    const caliberOpts = ['<option value="">请选择</option>']
      .concat(calibers.map((c) => `<option value="${c}" ${t?.dataCaliber === c ? 'selected' : ''}>${c}</option>`))
      .join('');
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
      <div class="form-row">
        <label>数据口径</label>
        <select class="select" id="d_caliber" ${ro}>${caliberOpts}</select>
      </div>
      <div class="form-row">
        <label><span class="req">*</span>因子版本</label>
        ${renderFactorVersionSelect(factorSel, factorLocked)}
        <p class="flow-hint" style="margin-top:6px">压测将锁定该版本因子库中的行业排放因子等参数；版本与生效年度对应，建议与报告期一致。${factorLocked ? ' 已开始流程后不可修改。' : ''}</p>
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

  function renderTaskLogList(taskId) {
    const logs = taskLogs[taskId] || [];
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
    return page === 'tasks' || page === 'task-detail';
  }

  function openTaskLogDrawer(taskId) {
    const id = taskId != null ? taskId : currentTaskId;
    if (!isTaskManagementPage(currentPage) || !id || (currentPage === 'task-detail' && taskDraftMode)) return;
    taskLogDrawerOpen = true;
    const body = document.getElementById('taskLogDrawerBody');
    const sub = document.getElementById('taskLogDrawerSub');
    const t = getTask(id);
    if (sub && t) sub.textContent = `任务：${t.taskName}`;
    if (body) body.innerHTML = renderTaskLogList(id);
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
    if (taskLogDrawerOpen && currentTaskId && !taskDraftMode) {
      const body = document.getElementById('taskLogDrawerBody');
      const sub = document.getElementById('taskLogDrawerSub');
      const t = getTask(currentTaskId);
      if (sub && t) sub.textContent = `任务：${t.taskName}`;
      if (body) body.innerHTML = renderTaskLogList(currentTaskId);
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
        <a onclick="CRST_APP.navigate('tasks')">压测任务</a> / 新建任务
      </div>
      ${renderTaskFlowCard('DRAFT', panel, 0)}`;
  }

  /* —— 任务详情（完整流程） —— */
  function renderTaskDetail() {
    if (taskDraftMode) return renderTaskCreatePage();

    const t = getTask(currentTaskId);
    if (!t) return '<div class="card empty">任务不存在</div>';

    const recs = recordsByTask[t.id] || [];
    const syncStatusCounts = countSyncStatus(recs);
    const usable = syncStatusCounts.usable;
    const needAvg = syncStatusCounts.needAvg;
    const abnormal = syncStatusCounts.abnormal;
    const avgs = avgByTask[t.id] || [];
    const credits = creditByTask[t.id] || [];
    const ecls = eclByTask[t.id] || [];
    const results = resultsByTask[t.id] || [];
    const stressEditOnly = taskEditMode && isStressOnlyEditTask(t);
    const completedTaskView = isCompletedTaskViewMode(t);
    const resultTools = showTaskResultTools(t);
    const readonly = t.status === 'ARCHIVED' || (taskViewMode && !completedTaskView)
      || (['COMPLETED'].includes(t.status) && !taskEditMode && !completedTaskView && detailStep < 4)
      || (stressEditOnly && detailStep !== 3 && detailStep !== 4 && detailStep !== 5);
    const stressEditHint = stressEditOnly && detailStep !== 3
      ? '<div class="alert alert-warning" style="margin-bottom:12px">已完成任务的其他步骤仅可查看，请在「场景压测」步骤调整情景与参数。</div>'
      : '';
    const stressEditActiveHint = stressEditOnly && detailStep === 3
      ? '<div class="alert alert-info" style="margin-bottom:12px">可调整情景勾选与参数，修改后请重新执行压测。</div>'
      : '';

    let panel = '';
    if (detailStep === 0) {
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
            <div class="desc-item"><span class="k">当前步骤</span><span>${taskStepTag(t.status)}</span></div>
            <div class="desc-item"><span class="k">数据口径</span><span>${esc(t.dataCaliber || '-')}</span></div>
            <div class="desc-item"><span class="k">因子版本</span><span>${esc(formatFactorVersionDisplay(t.factorVersion))}</span></div>
            <div class="desc-item"><span class="k">映射版本</span><span>${esc(t.mappingVersion || getActiveMappingVersion())}</span></div>
            <div class="desc-item"><span class="k">场景公式版本</span><span>${esc(t.scenarioVersion || getPublishedScenarioVersion())}</span></div>
            <div class="desc-item"><span class="k">任务说明</span><span>${esc(t.description || '-')}</span></div>
            <div class="desc-item"><span class="k">更新时间</span><span>${t.updatedAt || t.createdAt}</span></div>
          </div>
          ${canEditTaskBasicInfo(t) && !readonly
            ? `<div class="toolbar" style="margin-top:12px"><button class="btn btn-default" onclick="CRST_APP.editTask(${t.id})">编辑基本信息</button></div>`
            : '<p class="flow-hint">本任务绑定当时生效的配置版本，后续配置变更不影响历史任务回放口径。</p>'}`;
      }
    } else if (detailStep === 1) {
      panel = `${stressEditHint}<h3 class="step-panel-title">数据同步与确认</h3>`;
      const syncDisabled = !['DRAFT', 'SYNCING', 'PENDING_CONFIRM'].includes(t.status) || readonly;
      const pendingConfirm = t.status === 'PENDING_CONFIRM' && !readonly;
      const processing = t.status === 'PROCESSING' && !readonly;
      const canConfirmList = pendingConfirm && recs.length > 0 && abnormal === 0;
      const needAvgCount = countNeedAvg(recs);
      const avgDone = hasAvgCalculated(t.id);
      const fillDone = isAvgDataFilled(t.id);

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
      ].map((o) => `<option value="${o.value}" ${syncStatusFilter === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
      const showSyncOpCol = pendingConfirm && !taskViewMode;
      const recRowMapper = (r) => `<tr>
        <td>${esc(r.companyName)}</td><td>${esc(r.branchName)}</td>
        <td>${esc(r.customerId || '-')}</td><td>${esc(r.unifiedSocialCreditCode || '-')}</td>
        <td>${esc(r.branchCode || '-')}</td><td>${esc(r.apiIndustry)}</td><td>${esc(r.gbIndustryCode || '-')}</td><td>${esc(r.standardIndustry || '未映射')}</td>
        <td>${esc(r.emissionFactorCode || '-')}</td>
        ${showAirportCols ? `<td>${isAirportEnterprise(r) ? '是' : '否'}</td><td>${isAirportEnterprise(r)
          ? (r.throughputFetched ? Number(r.passengerThroughput).toLocaleString() : '<span class="tag tag-error">未调取</span>')
          : '-'}</td>` : ''}
        <td>${syncStatusLabel(effectiveSyncStatus(r))}</td>
        <td>${esc(r.availabilityReason)}</td><td>${esc(r.dataSource || '-')}</td>
        ${processing ? `<td>${r.revenue != null ? r.revenue.toLocaleString() : '-'}</td>` : ''}
        ${showSyncOpCol ? `<td>${r.dataAvailability === 'ABNORMAL'
          ? `<button class="btn btn-link" onclick="CRST_APP.excludeRecord(${t.id},${r.id})">删除</button>` : '-'}</td>` : ''}
      </tr>`;
      const syncColspan = 12 + (showAirportCols ? 2 : 0) + (processing ? 1 : 0) + (showSyncOpCol ? 1 : 0);
      const syncThead = `<tr>
          <th>公司</th><th>分行</th><th>客户号</th><th>统一社会信用代码</th><th>分行代码</th><th>接口行业</th><th>国标代码</th><th>标准行业</th><th>排放因子编码</th>
          ${showAirportCols ? '<th>机场企业</th><th>旅客吞吐量(万人次)</th>' : ''}
          <th>状态</th><th>原因</th><th>数据来源</th>
          ${processing ? '<th>收入(万)</th>' : ''}
          ${showSyncOpCol ? '<th>操作</th>' : ''}
        </tr>`;
      const syncTable = renderTable(filteredRecs, syncThead, recRowMapper, syncColspan);
      const totalCount = t.syncStats?.total ?? recs.length;
      const airportSummary = airportRecs.length
        ? `；机场企业 ${airportRecs.length} 条（吞吐量已调取 ${airportFetchedCount} 条）` : '';
      const syncSummaryText = `同步条数：${totalCount}条；可使用：${usable}条；需计算：${needAvg}条；无法处理：${abnormal}条${airportSummary}`;

      let stepFooter = '';
      if (!taskViewMode && pendingConfirm) {
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
              <span class="step-footer-msg">尚有 <strong>${abnormal}</strong> 条无法处理数据${airportHint}，请在列表中<strong>删除</strong>或补全数据后再进入下一步</span>
            </div>`;
        }
      } else if (!taskViewMode && processing) {
        if (needAvgCount === 0 || fillDone) {
          stepFooter = `
            <div class="step-footer">
              <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.confirmAvg(${t.id})">下一步：进入场景压测</button>
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
        <p class="sync-summary-text">${syncSummaryText}</p>
        ${!processing && !taskViewMode ? `
        <div class="toolbar step-toolbar-top">
          <button type="button" class="btn btn-primary" ${syncDisabled ? 'disabled' : ''} onclick="CRST_APP.syncFinancial(${t.id})">同步财务数据</button>
          ${recs.length && airportRecs.length && !syncDisabled
            ? `<button type="button" class="btn btn-default" onclick="CRST_APP.syncAirportThroughput(${t.id})">同步旅客吞吐量</button>`
            : ''}
        </div>
        ${airportRecs.length ? `<div class="alert alert-info">清单中含机场企业 ${airportRecs.length} 条，除财务数据外还需从「机场吞吐量维护」调取旅客吞吐量；未维护的企业将无法确认清单。</div>` : ''}` : (processing ? `
        <div class="alert alert-info">清单已确认。${needAvgCount ? '请基于下列已同步财务数据计算行业均值并填充后，进入场景压测。' : '无需行业均值补算，可直接进入场景压测。'}</div>` : '')}
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
    } else if (detailStep === 2) {
      const processRow = (a) => `<tr>
        <td>${esc(a.industry)}</td><td>${a.sampleCount}</td><td>${a.avgRevenue?.toLocaleString()}</td>
        <td>${a.avgEbitda?.toLocaleString()}</td><td>${esc(a.calcBasis || '已确认可使用样本')}</td><td>${esc(a.calcTime || '-')}</td><td>${avgFillStatusTag(a.status === 'CONFIRMED')}</td>
      </tr>`;
      panel = `
        ${stressEditHint}
        <h3 class="step-panel-title">数据处理</h3>
        <p class="flow-hint">行业均值计算与样本填充已在「数据同步与确认」步骤完成，此处为处理结果留痕。</p>
        ${renderTable(avgs, '<tr><th>标准行业</th><th>样本数</th><th>均值-收入</th><th>均值-EBITDA</th><th>计算依据</th><th>计算时间</th><th>状态</th></tr>', processRow, 7)}`;
    } else if (detailStep === 3) {
      const stressEditable = canEditStressSection(t, 3);
      const scenarioReadonly = !stressEditable;
      const showFetchToolbar = stressEditable && t.status === 'READY_STRESS';
      const pubScenarios = scenarios.filter((s) => s.status === 'PUBLISHED');
      const stressDisabled = !stressEditable || !t.creditFetched || !t.eclFetched;
      const selectedCodes = t.selectedScenarioCodes?.length
        ? t.selectedScenarioCodes
        : pubScenarios.map((s) => s.scenarioCode);
      const checks = pubScenarios.map((s) =>
        `<label><input type="checkbox" name="sc_${t.id}" value="${esc(s.scenarioCode)}" ${selectedCodes.includes(s.scenarioCode) ? 'checked' : ''} onchange="CRST_APP.onStressScenarioToggle(${t.id})" ${scenarioReadonly ? 'disabled' : ''} /> ${esc(s.scenarioName)}</label>`
      ).join('');
      const scenarioCardHtml = selectedCodes.map((code) => {
        const sc = pubScenarios.find((s) => s.scenarioCode === code);
        if (!sc) return '';
        const p = getScenarioStressParams(t, code);
        let extra = '';
        if (code === 'BASELINE') {
          extra = `<div class="form-row"><label>政策执行强度系数</label><input class="input" id="${scenarioInputId(t.id, code, 'policyIntensity')}" type="number" step="0.01" value="${p.policyIntensity}" ${scenarioReadonly ? 'disabled' : ''} /></div>`;
        } else if (code === 'GREENHOUSE_WORLD') {
          extra = `<div class="form-row"><label>物理损失率</label><input class="input" id="${scenarioInputId(t.id, code, 'physicalLossRatio')}" type="number" step="0.0001" value="${p.physicalLossRatio}" ${scenarioReadonly ? 'disabled' : ''} /></div>`;
        } else if (code === 'ORDERLY_TRANSITION') {
          extra = `<div class="form-row"><label>绿色投资占比</label><input class="input" id="${scenarioInputId(t.id, code, 'greenInvestmentRatio')}" type="number" step="0.0001" value="${p.greenInvestmentRatio}" ${scenarioReadonly ? 'disabled' : ''} /></div>`;
        }
        return `
          <div class="card" style="margin:12px 0 0">
            <h4 style="margin-bottom:10px">${esc(sc.scenarioName)}参数录入</h4>
            <div class="form-grid-2">
              <div class="form-row"><label>起始年份</label><input class="input" id="${scenarioInputId(t.id, code, 'start')}" type="number" value="${p.startYear}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>结束年份</label><input class="input" id="${scenarioInputId(t.id, code, 'end')}" type="number" value="${p.endYear}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>收入年增长率</label><input class="input" id="${scenarioInputId(t.id, code, 'growth')}" type="number" step="0.0001" value="${p.revenueGrowth}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>成本收入比</label><input class="input" id="${scenarioInputId(t.id, code, 'cost')}" type="number" step="0.0001" value="${p.costIncomeRatio}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>资产负债率</label><input class="input" id="${scenarioInputId(t.id, code, 'alr')}" type="number" step="0.0001" value="${p.assetLiabilityRatio}" ${scenarioReadonly ? 'disabled' : ''} /></div>
              <div class="form-row"><label>基期净利润为正</label><select class="select" id="${scenarioInputId(t.id, code, 'np')}" ${scenarioReadonly ? 'disabled' : ''}><option value="Y" ${p.baseNetProfitPositive ? 'selected' : ''}>是</option><option value="N" ${!p.baseNetProfitPositive ? 'selected' : ''}>否</option></select></div>
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
      panel = `
        ${stressEditOnly ? stressEditActiveHint : ''}
        <h3 class="step-panel-title">${stressEditOnly ? '编辑场景压测' : '信贷与 ECL'}</h3>
        ${showFetchToolbar ? `<div class="toolbar toolbar-fetch">
          <div class="toolbar-btn-group">
            <button class="btn btn-primary" onclick="CRST_APP.fetchCredit(${t.id})">调取信贷系统</button>
            <button class="btn btn-primary" onclick="CRST_APP.fetchEcl(${t.id})">调取ECL系统</button>
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
        <div class="alert alert-info">压测按<strong>行内方法</strong>执行；完成后在<strong>压测结果</strong>查看排放、财务与信用计量结果，并在<strong>应用报送</strong>输出内外部报表。</div>
        <div class="checkbox-group scenario-checkbox-group">${checks || '<span class="scenario-check-empty">无已生效场景，请先在场景计算方法配置中发布。</span>'}</div>
        ${scenarioCardHtml || '<p class="flow-hint">请先勾选至少一个压测场景，随后录入该场景参数。</p>'}
        ${stressEditable ? '<p class="flow-hint">勾选的场景会显示对应参数卡片；取消勾选后卡片自动隐藏。不同场景需补录字段不同。</p>' : ''}
        ${stressEditable ? `<div class="toolbar step-panel-actions" style="margin-top:12px">
          <button class="btn btn-default" onclick="CRST_APP.cancelEditTask()">取消编辑</button>
          <button class="btn btn-primary" ${stressDisabled ? 'disabled' : ''} onclick="CRST_APP.runStress(${t.id})">重新执行压测</button>
        </div>` : ''}
        ${stressEditable && (!t.creditFetched || !t.eclFetched) ? '<p class="flow-hint">请先完成信贷与ECL数据调取。</p>' : ''}`;
    } else if (detailStep === 4) {
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
          <td>${fin.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td>${fin.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td>${r.eclBefore?.toLocaleString()}</td><td>${r.eclAfter?.toLocaleString()}</td>
          <td>${(r.impactRate * 100).toFixed(2)}%</td>
          <td>${r.defaultFlag ? '<span class="tag tag-error">违约</span>' : '<span class="tag tag-success">正常</span>'}</td></tr>`;
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
            '<tr><th>公司</th><th>分行</th><th>行业</th><th>情景</th><th>年份</th><th>测算口径</th><th>碳排放量(吨)</th><th>碳费用(万)</th><th>营业收入(万)</th><th>净利润(万)</th><th>ECL(前)</th><th>ECL(后)</th><th>影响率</th><th>违约</th></tr>',
            resultRow, 14)}
        </section>
        ${canUseApplicationReport(t) && !stressEditOnly ? `
        <div class="step-footer">
          <button type="button" class="btn btn-primary btn-next-step" onclick="CRST_APP.goToApplicationReport(${t.id})">下一步：应用报送</button>
        </div>` : ''}`}`;
    } else if (detailStep === 5) {
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
              <button type="button" class="btn btn-primary" ${reportDisabled ? 'disabled' : ''} onclick="CRST_APP.issueRiskWarnings(${t.id})">下发风险预警</button>
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
            <p class="flow-hint">生成后将写入「导出记录」，支持按任务名称与时间戳下载追溯。</p>
          </div>
        </div>`}`;
    }

    const logBtn = !taskDraftMode && (!taskViewMode || completedTaskView)
      ? `<button type="button" class="btn btn-default" onclick="CRST_APP.openTaskLogDrawer(${t.id})">操作日志</button>`
      : '';
    return `
      <div class="breadcrumb-row">
        <div class="breadcrumb">
          <a onclick="CRST_APP.navigate('tasks')">压测任务</a> / ${esc(t.taskName)}
        </div>
        ${logBtn}
      </div>
      ${renderTaskFlowCard(t.status, panel, detailStep)}`;
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
      <p class="flow-hint chart-metric-hint">柱高按各指标在样本中的相对占比归一化，便于跨行业对比；悬停查看实际数值。</p>
      <div class="chart-bar chart-bar-grouped chart-metric-vbar">${cols}</div>`;
  }

  function topByMetric(dimRows, metricKey, n) {
    return [...dimRows].sort((a, b) => b[metricKey] - a[metricKey]).slice(0, n);
  }

  function renderResults() {
    const completed = tasks.filter((t) => ['COMPLETED', 'ARCHIVED'].includes(t.status));
    const dim = window._resultDim || 'industry';
    const taskId = window._resultTaskId || (completed[0]?.id);
    const res = resultsByTask[taskId] || [];
    const years = [...new Set(res.map((r) => r.testYear).filter(Boolean))].sort((a, b) => a - b);
    const yearSel = window._resultYear;
    const year = yearSel === '' || yearSel == null ? null : (yearSel || years[years.length - 1]);
    const scenarioCode = window._resultScenarioCode || '';
    const scenarioOpts = sortScenarioCodes([...new Set(res.map((r) => r.scenarioCode).filter(Boolean))]);
    const filteredRes = filterAnalysisResults(res, year, scenarioCode);
    const trendRes = filterAnalysisResults(res, null, scenarioCode);
    const kpi = computeAnalysisKpis(filteredRes);
    const dimRows = aggregateAnalysisByDim(filteredRes, dim);
    const dimLabel = dim === 'branch' ? '分行' : '行业';
    const trend = computeTrendByYearScenario(trendRes);
    const scenarioCmp = computeScenarioComparison(filteredRes);
    const topCarbon = topByMetric(dimRows, 'carbonCost', 8);
    const topEcl = topByMetric(dimRows, 'eclDelta', 8);
    const topDefault = [...dimRows].filter((d) => d.defaults > 0).sort((a, b) => b.defaults - a.defaults).slice(0, 8);
    const topImpact = [...dimRows].sort((a, b) => b.impactPct - a.impactPct).slice(0, 8);
    const metricCompareItems = [...dimRows].sort((a, b) => b.carbonCost - a.carbonCost).slice(0, 6);
    const yearOptions = years.length
      ? `<option value="" ${year == null ? 'selected' : ''}>全部年份</option>${years.map((y) => `<option value="${y}" ${year === y ? 'selected' : ''}>${y}年</option>`).join('')}`
      : '<option value="">全部年份</option>';

    return `
      <div class="card">
        <h2 class="page-title">压测结果分析</h2>
        <div class="filter-bar">
          <select class="select" onchange="CRST_APP.setResultTask(+this.value)">
            ${completed.length ? completed.map((t) => `<option value="${t.id}" ${taskId === t.id ? 'selected' : ''}>${esc(t.taskName)}</option>`).join('') : '<option value="">暂无已完成任务</option>'}
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

        <div class="analysis-grid-2">
          <div class="analysis-panel" style="margin:0">
            <h3 class="analysis-panel-title">情景对比（环形占比）</h3>
            ${renderScenarioDonut(scenarioCmp)}
          </div>
          <div class="analysis-panel" style="margin:0">
            <h3 class="analysis-panel-title">平均影响率 Top8（横向条形 · ${dimLabel}）</h3>
            ${renderHBarChart(topImpact, { valueKey: 'impactPct', labelKey: 'name', format: (v) => `${v}%` })}
          </div>
        </div>

        <div class="analysis-grid-2">
          <div class="analysis-panel" style="margin:0">
            <h3 class="analysis-panel-title">碳排放费用 Top8（${dimLabel}）</h3>
            ${renderHBarChart(topCarbon, { valueKey: 'carbonCost', labelKey: 'name', format: (v) => `${v.toLocaleString()} 万`, colorFn: (_, i) => analysisColor(i + 1) })}
          </div>
          <div class="analysis-panel" style="margin:0">
            <h3 class="analysis-panel-title">ECL增量 Top8（${dimLabel}）</h3>
            ${renderHBarChart(topEcl, { valueKey: 'eclDelta', labelKey: 'name', format: (v) => `${v.toLocaleString()} 万`, colorFn: (_, i) => analysisColor(i + 3) })}
          </div>
        </div>

        <div class="analysis-panel">
          <h3 class="analysis-panel-title">多维指标对比（${dimLabel} Top6 · 纵向分组柱状）</h3>
          ${renderMetricCompareBars(metricCompareItems, [
    { key: 'impactPct', label: '影响率', color: '#4a7cb8' },
    { key: 'carbonCost', label: '碳费', color: '#e67e22' },
    { key: 'eclDelta', label: 'ECL增', color: '#9b59b6' },
  ])}
        </div>

        <div class="analysis-grid-2">
          <div class="analysis-panel" style="margin:0">
            <h3 class="analysis-panel-title">违约集中度（${dimLabel}）</h3>
            ${topDefault.length
    ? renderHBarChart(topDefault, {
      valueKey: 'defaults',
      labelKey: 'name',
      format: (v) => `${v} 家`,
      colorFn: () => '#e74c3c',
      tone: 'risk',
    })
    : '<div class="empty">当前筛选下无违约样本</div>'}
          </div>
          <div class="analysis-panel" style="margin:0">
            <h3 class="analysis-panel-title">${dimLabel}汇总明细</h3>
            ${renderTable(dimRows,
    `<tr><th>${dimLabel}</th><th>样本数</th><th>平均影响率</th><th>碳费用(万)</th><th>ECL增量(万)</th><th>违约数</th></tr>`,
    (s) => `<tr><td>${esc(s.name)}</td><td>${s.count}</td><td>${s.impactPct}%</td><td>${s.carbonCost.toLocaleString()}</td><td>${s.eclDelta.toLocaleString()}</td><td>${s.defaults}</td></tr>`,
    6)}
          </div>
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
        <div class="alert alert-info">已内置《高碳行业碳排放费用计算方法》行业碳排放因子（吨CO₂e/百万元等）。有企业基期排放数据时优先用 基期排放÷收入 计算企业因子。</div>
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
        <div class="alert alert-info">配置公式与字段后<strong>发布生效</strong>，新任务立即使用；历史任务保留原版本。同一类型建议仅一个已生效版本。</div>
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
        <div class="alert alert-info">财务接口行业 → 标准行业；未映射公司在同步后标记为异常，需维护映射后重新同步。</div>
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
        <div class="alert alert-info">机场企业压测时按旅客吞吐量计算碳排放量；压测任务将直接调用本表数据。</div>
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
      return true;
    });
  }

  function searchExports() {
    exportFilters.taskName = document.getElementById('ef_task')?.value?.trim() || '';
    exportFilters.scope = document.getElementById('ef_scope')?.value || '';
    getListPager('exports').page = 1;
    render();
  }

  function resetExportFilters() {
    exportFilters = { taskName: '', scope: '' };
    getListPager('exports').page = 1;
    render();
  }

  function renderExports() {
    const filtered = filterExportList();
    const scopeOpts = [...new Set(exportLogs.map((e) => e.scope))].sort();
    const table = renderPagedTable('exports', filtered,
      '<tr><th>任务名称</th><th>下载内容</th><th>范围</th><th>筛选条件</th><th>字段</th><th>导出人</th><th>时间</th><th>操作</th></tr>',
      (e) => {
        const fileName = getExportDownloadFileName(e);
        const filterText = e.filter || '-';
        return `<tr>
      <td>${esc(e.taskName)}</td>
      <td class="export-download-cell"><span class="export-download-name" data-tip="${esc(fileName)}" title="${esc(fileName)}">${esc(fileName)}</span></td>
      <td>${esc(e.scope)}</td>
      <td class="export-filter-cell" title="${esc(filterText)}">${esc(filterText)}</td>
      <td title="${esc(e.fields)}">${esc(String(e.fields).slice(0, 20))}${String(e.fields).length > 20 ? '…' : ''}</td>
      <td>${esc(e.operator)}</td><td>${e.exportedAt}</td>
      <td><button class="btn btn-link" onclick="CRST_APP.downloadExport(${e.id})">下载</button></td>
    </tr>`;
      }, 8, 'table-exports-wrap');
    return `
      <div class="card">
        <h2 class="page-title">导出记录</h2>
        <div class="task-filter-bar export-filter-bar">
          <div class="filter-item">
            <label>任务名称</label>
            <input class="input" id="ef_task" placeholder="模糊搜索" value="${esc(exportFilters.taskName)}" onkeydown="if(event.key==='Enter')CRST_APP.searchExports()" />
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

  function render() {
    const el = document.getElementById('content');
    const pages = {
      tasks: renderTasks,
      'task-detail': renderTaskDetail,
      results: renderResults,
      factors: renderFactors,
      scenarios: renderScenarios,
      mappings: renderMappings,
      'airport-throughput': renderAirportThroughput,
      exports: renderExports,
      'calc-doc': renderCalcDoc,
      'menu-perms': renderMenuPermissions,
    };
    el.innerHTML = (pages[currentPage] || renderTasks)();
    document.getElementById('pageTitle').textContent = {
      tasks: '压测任务管理',
      'task-detail': '任务详情',
      results: '压测结果分析',
      factors: '因子库管理',
      scenarios: '场景计算方法配置',
      mappings: '行业映射关系',
      'airport-throughput': '机场吞吐量维护',
      exports: '导出记录',
      'calc-doc': '计算方法说明',
      'menu-perms': '菜单权限',
    }[currentPage] || '气候风险压测';
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
        <p class="flow-hint">勾选侧栏展示，取消勾选则隐藏。变更后立即生效。</p>
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
    taskDraftMode = true;
    taskEditMode = false;
    taskViewMode = false;
    currentTaskId = null;
    detailStep = 0;
    navigate('task-detail');
  }

  function editTask(id) {
    const t = getTask(id);
    if (!canEditTask(t)) { toast('当前状态不可编辑', 'error'); return; }
    taskDraftMode = false;
    taskEditMode = true;
    taskViewMode = false;
    detailStep = editTaskEntryStep(t);
    navigate('task-detail', id, detailStep);
  }

  function cancelCreateTask() {
    taskDraftMode = false;
    taskViewMode = false;
    navigate('tasks');
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
      caliber: document.getElementById('d_caliber')?.value || '',
      desc: document.getElementById('d_desc')?.value || '',
      factorVersion: document.getElementById('d_factorVersion')?.value || '',
    };
  }

  function saveTask() {
    const { name, start, end, caliber, desc, factorVersion } = readTaskFormFields();
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
        description: desc,
        factorVersion,
        status: 'DRAFT',
        createdAt: nowStr(),
        updatedAt: nowStr(),
      });
      addLog(createdId, '创建任务：保存任务');
      taskDraftMode = false;
      detailStep = 1;
      toast('任务已创建，请进行数据同步与确认');
      navigate('task-detail', createdId, 1);
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
      t.description = desc;
      t.factorVersion = factorVersion;
      t.updatedAt = nowStr();
      addLog(t.id, '创建任务：编辑任务基本信息');
      taskEditMode = false;
      taskViewMode = false;
      const targetStep = editTaskEntryStep(t);
      detailStep = targetStep;
      toast('任务已更新');
      navigate('task-detail', t.id, targetStep);
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
      t.status = 'PENDING_CONFIRM';
      if (!t.factorVersion) t.factorVersion = suggestFactorVersionByReportEnd(t.reportPeriodEnd);
      t.mappingVersion = 'M-' + getActiveMappingVersion();
      t.scenarioVersion = 'S-' + getPublishedScenarioVersion();
      recordsByTask[id] = mockSyncRecords(id, t);
      const recs = recordsByTask[id];
      const airportStats = fetchAirportThroughputForTask(id);
      refreshSyncStats(id);
      t.updatedAt = nowStr();
      addLog(id, '数据同步与确认：财务数据同步完成，待确认清单');
      if (airportStats.total) {
        addLog(id, `数据同步与确认：机场企业旅客吞吐量调取成功 ${airportStats.success} 条，待维护 ${airportStats.fail} 条`);
      }
      toast(airportStats.fail
        ? `财务数据同步完成；${airportStats.fail} 条机场企业旅客吞吐量待维护`
        : '财务数据同步完成');
      render();
      if (currentPage === 'task-detail' && currentTaskId === id) detailStep = 1;
      render();
    }, 800);
  }

  function syncAirportThroughput(id) {
    const t = getTask(id);
    if (!['SYNCING', 'PENDING_CONFIRM', 'PROCESSING'].includes(t.status)) {
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
    const templates = [
      { companyName: '华东化工有限公司', customerId: 'CUST-1001', unifiedSocialCreditCode: '91310000100000001X', branchName: '上海分行', branchCode: '3100', apiIndustry: 'C2614 有机化学原料制造', gbIndustryCode: 'C2614', emissionFactorCode: 'EMISSION_C2614', standardIndustry: '化工', revenue: 120000, costIncomeRatio: 0.88 },
      { companyName: '北方钢铁集团', customerId: 'CUST-1002', unifiedSocialCreditCode: '91110000100000002Y', branchName: '北京分行', branchCode: '1100', apiIndustry: 'C3110 炼铁', gbIndustryCode: 'C3110', emissionFactorCode: 'EMISSION_STEEL', standardIndustry: '钢铁', revenue: 98000, costIncomeRatio: 0.9 },
      { companyName: '华南电力股份', customerId: 'CUST-1003', unifiedSocialCreditCode: '91440000100000003Z', branchName: '广州分行', branchCode: '4400', apiIndustry: 'D4411 火力发电', gbIndustryCode: 'D4411', emissionFactorCode: 'EMISSION_D4411', standardIndustry: '电力', revenue: 150000, costIncomeRatio: 0.82 },
      { companyName: '华南机场运营有限公司', customerId: 'CUST-1005', unifiedSocialCreditCode: '91440000100000005A', branchName: '广州分行', branchCode: '4400', apiIndustry: 'G5631 机场', gbIndustryCode: 'G5631', emissionFactorCode: 'EMISSION_G5631', standardIndustry: '机场企业', revenue: 88000, costIncomeRatio: 0.78 },
      { companyName: '未知行业企业', customerId: 'CUST-1004', unifiedSocialCreditCode: '91440300100000004K', branchName: '深圳分行', branchCode: '4403', apiIndustry: '其他行业' },
    ];
    return templates.map((tpl, i) => {
      const map = mappings.find((m) => m.apiIndustry === tpl.apiIndustry && m.status === 'ENABLED');
      const std = tpl.standardIndustry || (map ? map.standardIndustry : '');
      let avail = 'USABLE';
      let reason = '数据完整';
      if (!std) { avail = 'ABNORMAL'; reason = '行业未映射'; }
      else if (i === 2) { avail = 'NEED_AVG'; reason = '关键指标缺失，需行业均值补算'; }
      return {
        id: taskId * 100 + i,
        ...tpl,
        standardIndustry: std,
        dataAvailability: avail,
        availabilityReason: reason,
        dataSource: avail === 'USABLE' ? '接口原始' : '待补算',
      };
    });
  }

  function confirmList(id) {
    const t = getTask(id);
    if (t.status !== 'PENDING_CONFIRM') return;
    const recs = recordsByTask[id] || [];
    if (recs.some((r) => r.dataAvailability === 'ABNORMAL')) {
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
    toast('数据填充完成，可进入场景压测');
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
    addLog(id, '数据处理：确认处理结果，进入场景压测');
    toast('已进入场景压测');
    detailStep = 3;
    navigate('task-detail', id, 3);
  }

  function fetchCredit(id) {
    const t = getTask(id);
    creditByTask[id] = (recordsByTask[id] || []).filter((r) => r.dataAvailability !== 'ABNORMAL').slice(0, 3).map((r) => ({
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
    t.creditFetched = true;
    t.updatedAt = nowStr();
    addLog(id, '场景压测：调取信贷系统数据');
    toast('信贷数据已获取');
    render();
  }

  function fetchEcl(id) {
    const t = getTask(id);
    eclByTask[id] = (recordsByTask[id] || []).filter((r) => r.dataAvailability !== 'ABNORMAL').slice(0, 3).map((r) => ({
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
    t.eclFetched = true;
    t.updatedAt = nowStr();
    addLog(id, '场景压测：调取 ECL 系统数据');
    toast('ECL数据已获取');
    render();
  }

  function runStress(id) {
    const t = getTask(id);
    if (!['READY_STRESS', 'COMPLETED'].includes(t.status)) {
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
    const scenarioCodes = selectedCodes.length
      ? selectedCodes
      : scenarios.filter((s) => s.status === 'PUBLISHED').map((s) => s.scenarioCode);
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

    t.status = 'STRESSING';
    addLog(id, `场景压测：开始执行（${scenarioCodes.length}个情景，${minStart}-${maxEnd}年）`);
    render();
    setTimeout(() => {
      const recs = recordsByTask[id] || [];
      const eclMap = {};
      (eclByTask[id] || []).forEach((e) => { eclMap[e.companyName] = e.eclAmount; });

      const list = [];
      recs.filter((r) => r.dataAvailability !== 'ABNORMAL' && r.standardIndustry).forEach((r) => {
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
            const out = applyScenarioAdjustment(out0, code, p);
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
              carbonEmission: out.carbonEmission,
              carbonCost: out.carbonCost,
              eclBefore: out.eclBefore,
              eclAfter: out.eclAfter,
              impactRate: out.impactRate,
              netProfitAfter: out.netProfitAfter,
              defaultFlag: out.defaultFlag,
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

      resultsByTask[id] = list;
      window._resultYear = maxEnd;
      t.scenarioVersion = getPublishedScenarioVersion();
      t.status = 'COMPLETED';
      t.updatedAt = nowStr();
      addLog(id, `压测结果：场景压测完成，已生成压测结果（${minStart}-${maxEnd}年，${scenarioCodes.length}个情景）`);
      if (taskEditMode && isStressOnlyEditTask(t)) {
        taskEditMode = false;
        addLog(id, '场景压测：已完成任务参数调整后重新压测');
      }
      toast('压测已完成（已输出逐年结果）');
      navigate('task-detail', id, 4);
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
    const t = getTask(taskId);
    if (!canExportTaskResults(t)) { toast('请先完成压测', 'error'); return; }
    const warnings = getRiskWarningRows(taskId);
    if (!warnings.length) { toast('当前无触发违约/预警阈值的企业', 'info'); return; }
    t.riskWarningIssuedAt = nowStr();
    t.updatedAt = nowStr();
    addLog(taskId, `应用报送：向 ${warnings.length} 户企业所在分行下发风险预警`);
    toast(`已向 ${warnings.length} 户企业所在分行下发风险预警`);
    render();
  }

  function generateRegulatoryReport(taskId) {
    const t = getTask(taskId);
    if (!canExportTaskResults(t)) { toast('请先完成压测', 'error'); return; }
    const scope = '外部监管报送-人民银行模板';
    const fields = REGULATORY_REPORT_FILES.map((f) => f.name).join(', ');
    const filterDesc = `监管口径：${t.scenarioVersion || '-'}；情景：${(t.selectedScenarioCodes || []).join('、') || '全部已选情景'}`;
    const { downloadFileName, taskName } = appendExportLog({ taskId, scope, fields, filterDesc });
    t.regulatoryReportGeneratedAt = nowStr();
    t.updatedAt = nowStr();
    addLog(taskId, '应用报送：生成监管报送 Excel 文件包');
    triggerExportFileDownload(
      downloadFileName,
      `监管报送\n任务：${taskName}\n${filterDesc}\n文件：${fields}\n说明：符合人民银行气候风险宏观情景压力测试报送要求，支持指标与明细追溯`
    );
    toast('监管报送 Excel 已生成，已写入导出记录');
    render();
  }

  /* —— 导出 —— */
  function exportResultsSummary(taskId) {
    const t = getTask(taskId);
    if (!canExportTaskResults(t)) { toast('请先完成压测后再导出', 'error'); return; }
    const summaryDimLabel = getTaskResultFilter(taskId).summaryDim === 'branch' ? '分行' : '行业';
    const fields = getSummaryExportFieldLabels(taskId).join(',');
    const filterDesc = buildTaskResultFilterDesc(taskId);
    const scope = `汇总结果（按${summaryDimLabel}，含完整字段）`;
    const { downloadFileName, taskName } = appendExportLog({ taskId, scope, fields, filterDesc });
    addLog(taskId, `压测结果：导出汇总结果（${scope}，筛选条件：${filterDesc}）`);
    triggerExportFileDownload(
      downloadFileName,
      `汇总导出\n任务：${taskName}\n范围：${scope}\n字段：${fields}\n筛选条件：${filterDesc}\n汇总维度：${summaryDimLabel}`
    );
    toast('汇总结果已导出，已写入导出记录');
  }

  function openExportDetailModal(taskId) {
    const t = getTask(taskId);
    if (!canExportTaskResults(t)) { toast('请先完成压测后再导出', 'error'); return; }
    modalState = { type: 'exportDetail', taskId };
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
    const taskId = modalState?.taskId;
    const t = getTask(taskId);
    if (!t || !canExportTaskResults(t)) { toast('请先完成压测后再导出', 'error'); return; }
    const selected = Array.from(document.querySelectorAll('#ed_fields input[name="ed_field"]:checked'));
    if (!selected.length) { toast('请至少选择一个导出字段', 'error'); return; }
    const labels = selected.map((el) => {
      const def = RESULT_DETAIL_EXPORT_FIELDS.find((f) => f.key === el.value);
      return def ? def.label : el.value;
    });
    const fields = labels.join(',');
    const filterDesc = buildTaskResultFilterDesc(taskId);
    const scope = '压测明细（按筛选与所选字段）';
    const { downloadFileName, taskName } = appendExportLog({ taskId, scope, fields, filterDesc });
    addLog(taskId, `压测结果：导出压测明细（${fields}，筛选条件：${filterDesc}）`);
    hideModal();
    triggerExportFileDownload(
      downloadFileName,
      `明细导出\n任务：${taskName}\n范围：${scope}\n字段：${fields}\n筛选条件：${filterDesc}`
    );
    toast('明细已导出，已写入导出记录');
  }

  function downloadExport(id) {
    const e = exportLogs.find((x) => x.id === id);
    if (!e) { toast('导出记录不存在', 'error'); return; }
    const fileName = getExportDownloadFileName(e);
    const blob = new Blob(
      [`导出文件：${fileName}\n任务：${e.taskName}\n范围：${e.scope}\n筛选：${e.filter || '无'}\n字段：${e.fields}\n导出人：${e.operator}\n时间：${e.exportedAt}`],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
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
        navigate(navPage);
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
    setDetailStep: (step) => { detailStep = step; render(); },
    setDetailTab: (tab) => { detailStep = resolveDetailStep(tab) ?? 0; render(); },
    searchTasks, resetTaskFilters, searchExports, resetExportFilters, setListPage, setListPageSize,
    setResultTask: (id) => { window._resultTaskId = id; getListPager('results').page = 1; render(); },
    setResultDim: (d) => { window._resultDim = d; getListPager('results').page = 1; render(); },
    setResultYear: (y) => { window._resultYear = y === '' ? '' : y; getListPager('results').page = 1; render(); },
    setResultScenario: (c) => { window._resultScenarioCode = c || ''; getListPager('results').page = 1; render(); },
    setTaskResultFilter, resetTaskResultFilter,
    onStressScenarioToggle,
    viewTask: (id, tab) => {
      taskEditMode = false;
      taskViewMode = true;
      const t = getTask(id);
      navigate('task-detail', id, tab != null ? tab : (t ? viewTaskDefaultStep(t) : 0));
    },
    editTask,
    confirmDeleteTask, cancelDeleteTask,
    startCreateTask, cancelCreateTask, cancelEditTask, onTaskReportEndChange, saveTask, deleteTask, startSync, syncAirportThroughput, confirmList, excludeRecord, setSyncStatusFilter,
    calcIndustryAvg, fillIndustryData, confirmAvg, fetchCredit, fetchEcl, runStress, goToApplicationReport,
    openFactorModal, saveFactor, viewFactor: (id) => openFactorModal('view', id),
    editFactor: (id) => openFactorModal('edit', id), deleteFactor, toggleFactor,
    openScenarioModal, saveScenario, viewScenario: (id) => openScenarioModal('view', id),
    editScenario: (id) => openScenarioModal('edit', id), publishScenario, disableScenario, deleteScenario,
    openMappingModal, saveMapping, viewMapping: (id) => openMappingModal('view', id),
    editMapping: (id) => openMappingModal('edit', id), deleteMapping, toggleMapping,
    resetAirportThroughputForm, editAirportThroughput, saveAirportThroughput, deleteAirportThroughput,
    exportResultsSummary, openExportDetailModal, toggleExportDetailFields, doExportDetail,
    issueRiskWarnings, generateRegulatoryReport,
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
