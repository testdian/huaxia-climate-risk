const PAGE_SIZE = 10;

let currentPage = 'tasks';
let currentTaskId = null;
let detailTab = 'sync';
let taskListPage = 1;
let resultsTaskId = tasks.find((t) => t.status === 'COMPLETED')?.id ?? tasks[0]?.id;
let resultsDimension = 'industry';
let selectedScenarios = ['TRANSITION'];
let toastTimer = null;

function tag(status, map) {
  const m = map[status] || { cls: 'tag-default', text: status };
  return `<span class="tag ${m.cls}">${m.text}</span>`;
}

function showToast(message, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast show ${type}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function paginate(items, page, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  const start = (p - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: p, totalPages, total };
}

function renderPagination(containerId, page, totalPages, total, onChange) {
  const prev = page <= 1;
  const next = page >= totalPages;
  let pages = '';
  for (let i = 1; i <= totalPages; i += 1) {
    if (totalPages > 7 && Math.abs(i - page) > 2 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) pages += '<span class="page-info">…</span>';
      continue;
    }
    pages += `<button type="button" class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  return `
    <div class="pagination" id="${containerId}">
      <span class="page-info">共 ${total} 条</span>
      <button type="button" class="page-btn" data-action="prev" ${prev ? 'disabled' : ''}>上一页</button>
      ${pages}
      <button type="button" class="page-btn" data-action="next" ${next ? 'disabled' : ''}>下一页</button>
    </div>`;
}

function bindPagination(containerId, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.onclick = (e) => {
    const btn = e.target.closest('[data-page], [data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const pg = document.getElementById(containerId);
    const active = pg.querySelector('.page-btn.active');
    let page = active ? Number(active.dataset.page) : 1;
    if (action === 'prev') page -= 1;
    else if (action === 'next') page += 1;
    else page = Number(btn.dataset.page);
    onChange(page);
  };
}

function navigate(page, taskId) {
  currentPage = page;
  if (taskId != null) currentTaskId = taskId;
  document.querySelectorAll('.menu a').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === page && page !== 'task-detail');
  });
  if (page === 'task-detail') {
    document.querySelectorAll('.menu a').forEach((a) => a.classList.remove('active'));
  }
  if (page === 'results' && !resultsTaskId) {
    resultsTaskId = tasks.find((t) => t.status === 'COMPLETED')?.id;
  }
  render();
}

function renderTasks() {
  const { items, page, totalPages, total } = paginate(tasks, taskListPage, PAGE_SIZE);
  const rows = items
    .map(
      (t) => `
    <tr>
      <td>${t.taskName}</td>
      <td>${t.reportPeriodStart} ~ ${t.reportPeriodEnd}</td>
      <td>${t.dataCaliber || '-'}</td>
      <td>${tag(t.status, STATUS_MAP)}</td>
      <td>${t.createdAt}</td>
      <td><button type="button" class="btn btn-link" data-action="detail" data-id="${t.id}">查看</button></td>
    </tr>`
    )
    .join('');
  return `
    <div class="card">
      <div class="toolbar">
        <h2 class="page-title">压测任务管理</h2>
        <button type="button" class="btn btn-primary" id="btnOpenCreate">新建任务</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>任务名称</th><th>报告期</th><th>数据口径</th><th>状态</th><th>创建时间</th><th>操作</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty">暂无数据</td></tr>'}</tbody>
        </table>
      </div>
      ${renderPagination('taskPagination', page, totalPages, total)}
    </div>`;
}

function renderSteps(status) {
  const stepIdx = getStepIndex(status);
  const labels = ['创建任务', '数据同步确认', '数据处理', '场景压测', '完成'];
  return labels
    .map((s, i) => {
      const done = i < stepIdx;
      const active = i === stepIdx;
      return `<div class="step ${done ? 'done' : ''} ${active ? 'active' : ''}">
          <div class="step-icon">${done ? '✓' : i + 1}</div>
          <span class="step-label">${s}</span>
          ${i < labels.length - 1 ? '<div class="step-line"></div>' : ''}
        </div>`;
    })
    .join('');
}

function renderTaskDetail() {
  const t = getTask(currentTaskId);
  if (!t) return '<div class="card"><p class="empty">任务不存在</p></div>';

  const recs = recordsByTask[t.id] || (t.status !== 'DRAFT' ? ensureRecordsForTask(t.id) : []);
  const res = resultsByTask[t.id] || [];
  const canSync = ['DRAFT', 'SYNCING'].includes(t.status);
  const canConfirm = t.status === 'PENDING_CONFIRM';
  const canProcess = ['PROCESSING', 'READY_STRESS'].includes(t.status);
  const canStress = ['READY_STRESS', 'STRESSING', 'COMPLETED'].includes(t.status);

  const recRows = recs
    .map(
      (r) => `<tr>
        <td>${r.companyName}</td><td>${r.branchName}</td><td>${r.apiIndustry}</td><td>${r.standardIndustry}</td>
        <td>${tag(r.dataAvailability, AVAIL_MAP)}</td><td>${r.availabilityReason}</td>
      </tr>`
    )
    .join('');

  const resRows = res
    .map(
      (r) => `<tr>
        <td>${r.companyName}</td><td>${r.branchName}</td><td>${r.standardIndustry}</td><td>${r.scenarioName}</td>
        <td>${formatMoney(r.metricRevenueBefore)}</td><td>${formatMoney(r.metricRevenueAfter)}</td>
        <td>${formatMoney(r.metricEclBefore)}</td><td>${formatMoney(r.metricEclAfter)}</td>
        <td>${formatPct(r.impactRate)}</td>
      </tr>`
    )
    .join('');

  const scenarioChecks = SCENARIO_OPTIONS.map(
    (s) =>
      `<label><input type="checkbox" name="scenario" value="${s.code}" ${selectedScenarios.includes(s.code) ? 'checked' : ''} /> ${s.name}</label>`
  ).join('');

  return `
    <div class="breadcrumb"><a href="#" data-nav="tasks">压测任务</a> / ${t.taskName}</div>
    <div class="card">
      <div class="desc-grid">
        <div class="desc-item"><span class="k">报告期</span><span>${t.reportPeriodStart} ~ ${t.reportPeriodEnd}</span></div>
        <div class="desc-item"><span class="k">数据口径</span><span>${t.dataCaliber || '-'}</span></div>
        <div class="desc-item"><span class="k">状态</span><span>${tag(t.status, STATUS_MAP)}</span></div>
        <div class="desc-item"><span class="k">任务说明</span><span>${t.description || '-'}</span></div>
      </div>
      <div class="steps">${renderSteps(t.status)}</div>
    </div>
    <div class="card">
      <div class="tabs" id="detailTabs">
        <div class="tab ${detailTab === 'sync' ? 'active' : ''}" data-tab="sync">数据同步与确认</div>
        <div class="tab ${detailTab === 'process' ? 'active' : ''}" data-tab="process">数据处理</div>
        <div class="tab ${detailTab === 'stress' ? 'active' : ''}" data-tab="stress">场景压测</div>
        <div class="tab ${detailTab === 'result' ? 'active' : ''}" data-tab="result">压测结果</div>
      </div>
      <div class="tab-panel ${detailTab === 'sync' ? 'active' : ''}">
        <div class="toolbar">
          <button type="button" class="btn btn-primary" id="btnSync" ${canSync ? '' : 'disabled'}>同步财务数据</button>
          <button type="button" class="btn btn-default" id="btnConfirm" ${canConfirm ? '' : 'disabled'}>确认清单</button>
        </div>
        <div class="table-wrap">
          <table><thead><tr>
            <th>公司</th><th>分行</th><th>接口行业</th><th>标准行业</th><th>分流</th><th>原因</th>
          </tr></thead><tbody>${recRows || '<tr><td colspan="6" class="empty">请先同步财务数据</td></tr>'}</tbody></table>
        </div>
      </div>
      <div class="tab-panel ${detailTab === 'process' ? 'active' : ''}">
        <p style="margin-bottom:12px;color:var(--text-secondary)">对需补算数据按标准行业计算行业平均值，管理员确认后进入压测基础数据集。</p>
        <button type="button" class="btn btn-primary" id="btnProcess" ${canProcess ? '' : 'disabled'}>计算行业平均值并确认</button>
      </div>
      <div class="tab-panel ${detailTab === 'stress' ? 'active' : ''}">
        <div class="checkbox-group" id="scenarioGroup">${scenarioChecks}</div>
        <button type="button" class="btn btn-primary" id="btnStress" ${canStress ? '' : 'disabled'}>执行压测</button>
      </div>
      <div class="tab-panel ${detailTab === 'result' ? 'active' : ''}">
        <div class="table-wrap">
          <table><thead><tr>
            <th>公司</th><th>分行</th><th>行业</th><th>场景</th>
            <th>收入(前)</th><th>收入(后)</th><th>ECL(前)</th><th>ECL(后)</th><th>影响率</th>
          </tr></thead><tbody>${resRows || '<tr><td colspan="9" class="empty">暂无压测结果，请先执行场景压测</td></tr>'}</tbody></table>
        </div>
      </div>
    </div>`;
}

function renderResults() {
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
  const taskOptions = completedTasks.length
    ? completedTasks
    : tasks;
  if (!resultsTaskId && taskOptions.length) resultsTaskId = taskOptions[0].id;

  const taskOpts = taskOptions
    .map((t) => `<option value="${t.id}" ${t.id === resultsTaskId ? 'selected' : ''}>${t.taskName}</option>`)
    .join('');

  const summary = resultsTaskId ? computeSummary(resultsTaskId, resultsDimension) : [];
  const dimLabel = resultsDimension === 'branch' ? '分行' : '行业';
  const max = summary.length ? Math.max(...summary.map((s) => s.impactRate)) : 1;

  const bars = summary
    .map(
      (s) => `
      <div class="bar-wrap">
        <div class="bar" style="height:${Math.max(4, (s.impactRate / max) * 160)}px"></div>
        <div class="bar-label">${s.name}<br>${formatPct(s.impactRate)}</div>
      </div>`
    )
    .join('');

  const rows = summary
    .map((s) => `<tr><td>${s.name}</td><td>${s.count}</td><td>${formatPct(s.impactRate)}</td></tr>`)
    .join('');

  return `
    <div class="card">
      <h2 class="page-title">压测结果分析</h2>
      <div class="toolbar">
        <select class="select" id="resultsTaskSelect" style="width:280px">
          ${taskOpts || '<option value="">暂无任务</option>'}
        </select>
        <select class="select" id="resultsDimSelect" style="width:160px">
          <option value="industry" ${resultsDimension === 'industry' ? 'selected' : ''}>行业维度</option>
          <option value="branch" ${resultsDimension === 'branch' ? 'selected' : ''}>分行维度</option>
        </select>
      </div>
      ${
        summary.length
          ? `<div class="grid-2">
          <div class="card" style="margin:0">
            <h3 style="margin-bottom:8px;font-size:15px">平均影响率</h3>
            <div class="chart-bar">${bars}</div>
          </div>
          <div class="card" style="margin:0">
            <h3 style="margin-bottom:8px;font-size:15px">汇总明细</h3>
            <div class="table-wrap">
              <table><thead><tr><th>${dimLabel}</th><th>公司数</th><th>平均影响率</th></tr></thead>
              <tbody>${rows}</tbody></table>
            </div>
          </div>
        </div>`
          : '<p class="empty">请选择已完成压测的任务，或先执行任务压测</p>'
      }
    </div>`;
}

function renderFactors() {
  const rows = factors
    .map(
      (f) => `<tr>
        <td>${f.factorCode}</td><td>${f.factorName}</td><td>${f.industry}</td>
        <td>${f.scenarioType}</td><td>${f.factorValue}</td><td>${f.unit}</td><td>${f.status}</td>
      </tr>`
    )
    .join('');
  return `<div class="card">
      <div class="toolbar">
        <h2 class="page-title">因子库管理</h2>
        <button type="button" class="btn btn-default" id="btnRefreshFactors">刷新</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>因子编码</th><th>因子名称</th><th>适用行业</th><th>场景类型</th><th>因子值</th><th>单位</th><th>状态</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>`;
}

function renderMapping() {
  const rows = industryMappings
    .map((m) => `<tr><td>${m.apiIndustry}</td><td>${m.standardIndustry}</td><td>${m.status}</td></tr>`)
    .join('');
  return `<div class="card">
      <div class="toolbar">
        <h2 class="page-title">行业映射关系</h2>
        <button type="button" class="btn btn-default" id="btnRefreshMapping">刷新</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>接口行业</th><th>标准行业</th><th>状态</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>
    </div>`;
}

function render() {
  const el = document.getElementById('content');
  if (currentPage === 'tasks') el.innerHTML = renderTasks();
  else if (currentPage === 'task-detail') el.innerHTML = renderTaskDetail();
  else if (currentPage === 'results') el.innerHTML = renderResults();
  else if (currentPage === 'factors') el.innerHTML = renderFactors();
  else if (currentPage === 'mapping') el.innerHTML = renderMapping();
  bindPageEvents();
}

function bindPageEvents() {
  document.getElementById('btnOpenCreate')?.addEventListener('click', openModal);

  bindPagination('taskPagination', (page) => {
    taskListPage = page;
    render();
  });

  document.querySelectorAll('[data-action="detail"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTaskId = Number(btn.dataset.id);
      detailTab = 'sync';
      selectedScenarios = ['TRANSITION'];
      navigate('task-detail');
    });
  });

  document.querySelector('[data-nav="tasks"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('tasks');
  });

  document.getElementById('detailTabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    detailTab = tab.dataset.tab;
    render();
  });

  document.getElementById('btnSync')?.addEventListener('click', () => {
    const r = syncTask(currentTaskId);
    showToast(r.message, r.ok ? 'success' : 'error');
    if (r.ok) detailTab = 'sync';
    render();
  });

  document.getElementById('btnConfirm')?.addEventListener('click', () => {
    const r = confirmRecords(currentTaskId);
    showToast(r.message, r.ok ? 'success' : 'error');
    if (r.ok) detailTab = getTask(currentTaskId).status === 'PROCESSING' ? 'process' : 'stress';
    render();
  });

  document.getElementById('btnProcess')?.addEventListener('click', () => {
    const r = calcIndustryAvg(currentTaskId);
    showToast(r.message, r.ok ? 'success' : 'error');
    if (r.ok) detailTab = 'stress';
    render();
  });

  document.getElementById('scenarioGroup')?.addEventListener('change', () => {
    selectedScenarios = [...document.querySelectorAll('#scenarioGroup input:checked')].map((i) => i.value);
  });

  document.getElementById('btnStress')?.addEventListener('click', () => {
    selectedScenarios = [...document.querySelectorAll('#scenarioGroup input:checked')].map((i) => i.value);
    const r = runStress(currentTaskId, selectedScenarios);
    showToast(r.message, r.ok ? 'success' : 'error');
    if (r.ok) {
      detailTab = 'result';
      resultsTaskId = currentTaskId;
    }
    render();
  });

  document.getElementById('resultsTaskSelect')?.addEventListener('change', (e) => {
    resultsTaskId = Number(e.target.value) || null;
    render();
  });

  document.getElementById('resultsDimSelect')?.addEventListener('change', (e) => {
    resultsDimension = e.target.value;
    render();
  });

  document.getElementById('btnRefreshFactors')?.addEventListener('click', () => {
    showToast('因子库已刷新');
    render();
  });

  document.getElementById('btnRefreshMapping')?.addEventListener('click', () => {
    showToast('行业映射已刷新');
    render();
  });
}

function openModal() {
  document.getElementById('modalCreate').classList.add('show');
  ['f_name', 'f_start', 'f_end', 'f_caliber', 'f_desc'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function closeModal() {
  document.getElementById('modalCreate').classList.remove('show');
}

function submitCreateTask() {
  const r = createTask({
    taskName: document.getElementById('f_name').value.trim(),
    reportPeriodStart: document.getElementById('f_start').value,
    reportPeriodEnd: document.getElementById('f_end').value,
    dataCaliber: document.getElementById('f_caliber').value.trim(),
    description: document.getElementById('f_desc').value.trim(),
  });
  if (!r.ok) {
    showToast(r.message, 'error');
    return;
  }
  closeModal();
  taskListPage = 1;
  showToast('任务创建成功');
  render();
}

document.getElementById('menu').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a?.dataset.page) return;
  e.preventDefault();
  navigate(a.dataset.page);
});

document.getElementById('modalCreate')?.addEventListener('click', (e) => {
  if (e.target.id === 'modalCreate') closeModal();
});

render();
