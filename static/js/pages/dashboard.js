const dashboardState = {
  currentUser: window.__APP__?.currentUser || { role: 'Guest', username: '' },
  patientsData: [],
  dayConfig: [],
  nightConfig: [],
  reportTableState: {
    day: { showAll: false },
    night: { showAll: false },
  },
};

const DAY_COLUMN_ORDER = [
  'slot_0800',
  'slot_0900',
  'slot_1000',
  'slot_1100',
  'slot_1200',
  'slot_1300',
  'slot_1400',
  'slot_1500',
  'slot_1600',
  'slot_1700',
  'slot_1800',
  'slot_1900',
];

const NIGHT_COLUMN_ORDER = [
  'slot_2000',
  'slot_2100',
  'slot_2200',
  'slot_2300',
  'slot_0000',
  'slot_0100',
  'slot_0200',
  'slot_0300',
  'slot_0400',
  'slot_0500',
  'slot_0600',
  'slot_0700',
];

const DEFAULT_DAY_CONFIG = [
  { key: 'slot_0800', label: '08:00 AM Breakfast' },
  { key: 'slot_0900', label: '09:00 AM Quran/Yoga' },
  { key: 'slot_1000', label: '10:00 AM Dr. Round' },
  { key: 'slot_1100', label: '11:00 AM Group Therapy' },
  { key: 'slot_1200', label: '12:00 PM Group Therapy' },
  { key: 'slot_1300', label: '01:00 PM Namaz' },
  { key: 'slot_1400', label: '02:00 PM Lunch' },
  { key: 'slot_1500', label: '03:00 PM Dr. Round' },
  { key: 'slot_1600', label: '04:00 PM TV Time' },
  { key: 'slot_1700', label: '05:00 PM Namaz' },
  { key: 'slot_1800', label: '06:00 PM Group Therapy' },
  { key: 'slot_1900', label: '07:00 PM Namaz' },
];

const DEFAULT_NIGHT_CONFIG = [
  { key: 'slot_2000', label: '08:00 PM Dinner' },
  { key: 'slot_2100', label: '09:00 PM Meds/Namaz' },
  { key: 'slot_2200', label: '10:00 PM Sleep' },
  { key: 'slot_2300', label: '11:00 PM' },
  { key: 'slot_0000', label: '12:00 AM' },
  { key: 'slot_0100', label: '01:00 AM' },
  { key: 'slot_0200', label: '02:00 AM' },
  { key: 'slot_0300', label: '03:00 AM' },
  { key: 'slot_0400', label: '04:00 AM' },
  { key: 'slot_0500', label: '05:00 AM' },
  { key: 'slot_0600', label: '06:00 AM' },
  { key: 'slot_0700', label: '07:00 AM' },
];

const statusLabelMap = {
  done: 'Done',
  not_done: 'Not Done',
  complaint: 'Emergency / Complaint',
  med: 'Medicine',
  wc: 'Washroom',
  '': 'No Status',
  null: 'No Status',
  undefined: 'No Status',
};

const printableSymbolMap = {
  done: '✓',
  not_done: '✕',
  complaint: '!',
  med: 'Med',
  wc: 'WC',
};

const formatCurrency = (amount) => new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  minimumFractionDigits: 0,
}).format(Number(amount) || 0);

const formatNumber = (amount) => new Intl.NumberFormat('en-US').format(Number(amount) || 0);

const canViewReports = () => ['Admin', 'Doctor', 'Staff'].includes(dashboardState.currentUser.role);
const canSaveLayouts = () => dashboardState.currentUser.role === 'Admin';
const canViewFinanceCards = () => dashboardState.currentUser.role === 'Admin';

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function orderColumns(columns, desiredOrder) {
  if (!Array.isArray(columns)) return [];
  const columnMap = new Map(columns.map((column) => [column.key, column]));
  const ordered = [];
  desiredOrder.forEach((key) => {
    if (columnMap.has(key)) {
      ordered.push(columnMap.get(key));
      columnMap.delete(key);
    }
  });
  return [...ordered, ...columnMap.values()];
}

function mergeWithDefaults(columns, defaults, order) {
  const baseMap = new Map(defaults.map((column) => [column.key, { ...column }]));
  if (Array.isArray(columns)) {
    columns.forEach((column) => {
      if (baseMap.has(column.key)) {
        baseMap.set(column.key, { ...baseMap.get(column.key), label: column.label });
      } else {
        baseMap.set(column.key, column);
      }
    });
  }
  return orderColumns(Array.from(baseMap.values()), order);
}

function updateDateTime() {
  const now = new Date();
  const dateEl = document.getElementById('current-date');
  const timeEl = document.getElementById('current-time');

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
}

async function fetchPatients() {
  if (dashboardState.patientsData.length > 0) return dashboardState.patientsData;
  const { response, data } = await window.apiFetchJson('/api/patients');
  if (!response.ok || !Array.isArray(data)) {
    throw new Error('Unable to load patients.');
  }
  dashboardState.patientsData = data;
  return dashboardState.patientsData;
}

function setDefaultReportDate() {
  const dateInput = document.getElementById('report-date-picker');
  if (!dateInput || dateInput.value) return;
  const today = new Date();
  dateInput.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

async function updateDashboard() {
  const { response, data } = await window.apiFetchJson('/api/dashboard');
  if (!response.ok || !data) {
    window.showToast(data?.error || 'Unable to load dashboard metrics.', true);
    return;
  }

  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long' });
  document.getElementById('dash-total').textContent = formatNumber(data.totalPatients);
  document.getElementById('dash-admitted').textContent = formatNumber(data.admissionsThisMonth);
  document.getElementById('dash-discharged').textContent = formatNumber(data.dischargesThisMonth);
  document.getElementById('dash-psy-sessions').textContent = formatNumber(data.totalPsychSessionsToday);
  document.getElementById('dash-month-label').textContent = monthLabel;
  document.getElementById('dash-income').textContent = formatCurrency(data.totalExpectedBalance);
  document.getElementById('dash-canteen').textContent = formatCurrency(data.totalCanteenSalesThisMonth);
  document.getElementById('dash-expenses').textContent = formatCurrency(data.totalExpensesThisMonth);

  const incomeCard = document.getElementById('dash-income-card');
  const canteenCard = document.getElementById('dash-canteen-card');
  const expenseCard = document.getElementById('dash-expenses-card');
  const shouldShowFinance = canViewFinanceCards();

  [incomeCard, canteenCard, expenseCard].forEach((element) => {
    if (element) element.style.display = shouldShowFinance ? '' : 'none';
  });
}

async function openAdmissionsModal() {
  const container = document.getElementById('admissions-month-body');
  const modal = document.getElementById('admissions-modal');
  if (!container || !modal) return;

  container.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">Loading admissions...</div>';
  modal.classList.remove('hidden');

  const { response, data } = await window.apiFetchJson('/api/dashboard/admissions');
  if (!response.ok || !Array.isArray(data)) {
    container.innerHTML = '<div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm font-semibold text-red-600">Unable to load admissions.</div>';
    return;
  }

  if (data.length === 0) {
    container.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">No admissions recorded for this month.</div>';
    return;
  }

  container.innerHTML = data.map((item) => {
    const when = item.admissionDate || item.created_at || '';
    const date = when ? new Date(when.length === 10 ? `${when}T00:00:00` : when) : null;
    const formatted = date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown date';

    return `
      <div class="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
        <div>
          <p class="text-sm font-black text-slate-900">${escapeHtml(item.name || 'Unknown')}</p>
          <p class="text-xs font-medium text-slate-500">Patient admission</p>
        </div>
        <span class="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">${formatted}</span>
      </div>
    `;
  }).join('');
}

async function loadEmergencyAlerts() {
  const container = document.getElementById('emergency-list');
  if (!container) return;

  const { response, data } = await window.apiFetchJson('/api/emergency');
  if (!response.ok || !Array.isArray(data)) {
    container.innerHTML = '<div class="rounded-2xl border border-red-200 bg-red-50 px-5 py-8 text-center text-sm font-semibold text-red-600">Unable to load active alerts.</div>';
    return;
  }

  if (data.length === 0) {
    container.innerHTML = `
      <div class="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-5 py-8 text-center">
        <i class="fas fa-circle-check text-3xl text-emerald-500"></i>
        <p class="mt-3 text-sm font-black uppercase tracking-[0.18em] text-emerald-700">All Clear</p>
        <p class="mt-2 text-sm font-medium text-slate-500">No active emergency alerts right now.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = data.map((alert) => {
    const critical = alert.severity === 'critical';
    return `
      <article class="${critical ? 'animate-pulse-red border-red-300 bg-red-50' : 'border-orange-200 bg-orange-50'} rounded-2xl border px-4 py-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="inline-flex h-9 w-9 items-center justify-center rounded-2xl ${critical ? 'bg-red-600' : 'bg-orange-500'} text-white">
                <i class="fas fa-triangle-exclamation"></i>
              </span>
              <div>
                <p class="truncate text-sm font-black ${critical ? 'text-red-700' : 'text-orange-700'}">${escapeHtml(alert.patient_name || 'Unknown')}</p>
                <p class="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">${escapeHtml(alert.date || 'Just now')}</p>
              </div>
            </div>
            <p class="mt-3 whitespace-pre-wrap text-sm font-semibold text-slate-700">${escapeHtml(alert.note || '')}</p>
            <p class="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">By ${escapeHtml(alert.added_by || 'Staff')}</p>
          </div>
          <button type="button" data-resolve-alert="${escapeHtml(alert._id)}" class="rounded-full bg-white/80 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 shadow-sm hover:bg-white">
            Resolve
          </button>
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-resolve-alert]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await window.confirmAction('Mark this alert as resolved?');
      if (!confirmed) return;

      await fetch(`/api/emergency/${button.dataset.resolveAlert}`, { method: 'DELETE' });
      await loadEmergencyAlerts();
      window.showToast('Alert marked as resolved.');
    });
  });
}

async function openEmergencyModal() {
  const modal = document.getElementById('emergency-modal');
  const select = document.getElementById('emer-name');
  if (!modal || !select) return;

  modal.classList.remove('hidden');
  select.innerHTML = '<option value="">Loading...</option>';

  try {
    const patients = await fetchPatients();
    const activePatients = patients.filter((patient) => !patient.isDischarged);
    if (activePatients.length === 0) {
      select.innerHTML = '<option value="">No active patients found</option>';
      return;
    }

    select.innerHTML = activePatients
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
      .map((patient) => `<option value="${escapeHtml(patient.name || '')}">${escapeHtml(patient.name || 'Unknown')} (${escapeHtml(patient.fatherName || '-')})</option>`)
      .join('');
  } catch (error) {
    select.innerHTML = '<option value="">Unable to load patients</option>';
  }
}

async function addEmergencyAlert(event) {
  event.preventDefault();
  const payload = {
    patient_name: document.getElementById('emer-name').value,
    note: document.getElementById('emer-note').value,
    severity: document.getElementById('emer-severity').value,
  };

  const { response, data } = await window.apiFetchJson('/api/emergency', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    window.showToast(data?.error || 'Unable to save the alert.', true);
    return;
  }

  document.getElementById('emergency-form').reset();
  document.getElementById('emergency-modal').classList.add('hidden');
  window.showToast('Emergency alert posted.');
  await loadEmergencyAlerts();
}

async function loadDailyReport() {
  const dateInput = document.getElementById('report-date-picker');
  if (!dateInput || !dateInput.value) return;

  try {
    const configResult = await window.apiFetchJson('/api/reports/config');
    const config = configResult.response.ok ? configResult.data || {} : {};
    dashboardState.dayConfig = mergeWithDefaults(config.day_columns, DEFAULT_DAY_CONFIG, DAY_COLUMN_ORDER)
      .filter((column) => DAY_COLUMN_ORDER.includes(column.key));
    dashboardState.nightConfig = mergeWithDefaults(config.night_columns, DEFAULT_NIGHT_CONFIG, NIGHT_COLUMN_ORDER)
      .filter((column) => NIGHT_COLUMN_ORDER.includes(column.key));
  } catch (error) {
    dashboardState.dayConfig = mergeWithDefaults(undefined, DEFAULT_DAY_CONFIG, DAY_COLUMN_ORDER);
    dashboardState.nightConfig = mergeWithDefaults(undefined, DEFAULT_NIGHT_CONFIG, NIGHT_COLUMN_ORDER);
  }

  const patients = await fetchPatients();
  const activePatients = patients.filter((patient) => !patient.isDischarged);

  const { response, data } = await window.apiFetchJson(`/api/reports?date=${dateInput.value}`);
  if (!response.ok) {
    window.showToast(data?.error || 'Unable to load report data.', true);
    return;
  }

  const reportMap = {};
  (data || []).forEach((report) => {
    reportMap[report.patient_id] = report.schedule || {};
  });

  renderSplitTable('day', dashboardState.dayConfig, activePatients, reportMap);
  renderSplitTable('night', dashboardState.nightConfig, activePatients, reportMap);
}

function getStatusClass(status) {
  if (status === 'done') return 'bg-green-100 hover:bg-green-200 border border-green-300';
  if (status === 'not_done') return 'bg-red-100 hover:bg-red-200 border border-red-300';
  if (status === 'complaint') return 'bg-yellow-100 hover:bg-yellow-200 border border-yellow-300';
  if (status === 'med') return 'bg-blue-100 hover:bg-blue-200 border border-blue-300';
  if (status === 'wc') return 'bg-purple-100 hover:bg-purple-200 border border-purple-300';
  return 'bg-slate-50 hover:bg-slate-100 border border-slate-200';
}

function getStatusIcon(status) {
  if (status === 'done') return '<i class="fas fa-check text-green-600 text-sm"></i>';
  if (status === 'not_done') return '<i class="fas fa-times text-red-600 text-sm"></i>';
  if (status === 'complaint') return '<i class="fas fa-exclamation text-yellow-600 text-sm"></i>';
  if (status === 'med') return '<span class="text-blue-600 text-xs font-bold">Med</span>';
  if (status === 'wc') return '<span class="text-purple-600 text-xs font-bold">WC</span>';
  return '<span class="text-slate-300 text-xs">•</span>';
}

async function cycleReportStatus(button, patientId, slotKey, currentStatus, reportType) {
  let nextStatus = 'done';
  if (reportType === 'night') {
    if (currentStatus === 'done') nextStatus = 'not_done';
    else if (currentStatus === 'not_done') nextStatus = 'med';
    else if (currentStatus === 'med') nextStatus = 'wc';
    else if (currentStatus === 'wc') nextStatus = '';
  } else {
    if (currentStatus === 'done') nextStatus = 'not_done';
    else if (currentStatus === 'not_done') nextStatus = 'complaint';
    else if (currentStatus === 'complaint') nextStatus = '';
  }

  button.className = `w-full h-6 rounded flex items-center justify-center transition-all text-xs ${getStatusClass(nextStatus)}`;
  button.innerHTML = getStatusIcon(nextStatus);
  button.dataset.status = nextStatus || '';
  button.setAttribute('aria-label', statusLabelMap[nextStatus] || 'No Status');
  button.onclick = () => cycleReportStatus(button, patientId, slotKey, nextStatus, reportType);

  const payload = {
    date: document.getElementById('report-date-picker').value,
    patient_id: patientId,
    time_slot: slotKey,
    status: nextStatus,
  };

  const { response, data } = await window.apiFetchJson('/api/reports/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    window.showToast(data?.error || 'Unable to update report status.', true);
  }
}

function attachReportScrollHandler(type) {
  const container = document.querySelector(`#${type}-report-container .overflow-x-auto`);
  if (!container || container.dataset.scrollWatcherAttached) return;
  container.addEventListener('scroll', () => {
    const headerCell = document.getElementById(`${type}-patient-header`);
    const label = headerCell?.querySelector('.patient-header-label');
    if (label) label.style.opacity = container.scrollLeft > 0 ? '0' : '1';
  });
  container.dataset.scrollWatcherAttached = 'true';
}

function renderSplitTable(type, columns, patients, reportMap) {
  const headerRow = document.getElementById(`${type}-header-row`);
  const tbody = document.getElementById(`${type}-table-body`);
  if (!headerRow || !tbody) return;

  const editableHeaders = canSaveLayouts();
  const headerBaseClass = 'px-2 py-3 text-left whitespace-nowrap sticky left-0 z-20 bg-emerald-600 text-white shadow-md';
  let headersHtml = `<th id="${type}-patient-header" class="${headerBaseClass}" style="min-width: 120px; max-width: 160px;"><span class="patient-header-label font-semibold tracking-wide text-xs">Patient</span></th>`;

  columns.forEach((column, index) => {
    headersHtml += `
      <th
        ${editableHeaders ? 'contenteditable="true"' : ''}
        data-idx="${index}"
        title="${escapeHtml(column.label || '')}"
        ${editableHeaders ? 'onblur="window.markLayoutDirty()"' : ''}
        class="px-1 py-3 text-center align-middle whitespace-normal min-w-[64px] max-w-[84px] border-l border-white/20 ${editableHeaders ? 'cursor-text hover:bg-white/10' : ''}"
      >
        <span class="block whitespace-pre-wrap text-[0.64rem] leading-tight">${escapeHtml(column.label || '')}</span>
      </th>
    `;
  });
  headerRow.innerHTML = headersHtml;

  if (patients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" class="p-6 text-center text-slate-400">No active patients.</td></tr>`;
    return;
  }

  const state = dashboardState.reportTableState[type] || { showAll: false };
  const flaggedRows = [];
  const normalRows = [];

  patients.forEach((patient) => {
    const patientId = patient._id || patient.id;
    const schedule = reportMap[patientId] || {};
    let hasIssue = false;

    let rowHtml = `
      <td class="sticky left-0 z-20 max-w-[160px] whitespace-nowrap border-r bg-emerald-50 px-2 py-2 text-[0.68rem] font-bold text-emerald-900">
        <span class="block truncate" title="${escapeHtml(patient.name || '')}">${escapeHtml(patient.name || 'Unknown')}</span>
      </td>
    `;

    columns.forEach((column) => {
      const status = schedule[column.key];
      if (status === 'complaint') hasIssue = true;
      rowHtml += `
        <td class="border p-1 text-center align-middle">
          <button
            class="w-full h-6 rounded flex items-center justify-center transition-all text-xs ${getStatusClass(status)}"
            data-status="${status || ''}"
            aria-label="${statusLabelMap[status] || 'No Status'}"
          >
            ${getStatusIcon(status)}
          </button>
        </td>
      `;
    });

    const row = document.createElement('tr');
    row.className = 'hover:bg-slate-50 transition';
    row.innerHTML = rowHtml;

    row.querySelectorAll('button[data-status]').forEach((button, index) => {
      button.onclick = () => cycleReportStatus(button, patientId, columns[index].key, button.dataset.status || '', type);
    });

    if (hasIssue) {
      row.classList.add('bg-rose-50');
      flaggedRows.push(row);
    } else {
      row.classList.add(`report-normal-row-${type}`);
      if (!state.showAll) row.classList.add('hidden');
      normalRows.push(row);
    }
  });

  tbody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  if (flaggedRows.length === 0 && normalRows.length > 0) {
    const infoRow = document.createElement('tr');
    infoRow.innerHTML = `<td colspan="${columns.length + 1}" class="px-4 py-4 text-center text-sm font-semibold text-emerald-800 bg-emerald-50">All patients are currently on track.</td>`;
    fragment.appendChild(infoRow);
  }

  flaggedRows.forEach((row) => fragment.appendChild(row));

  if (normalRows.length > 0) {
    const toggleRow = document.createElement('tr');
    toggleRow.innerHTML = `
      <td colspan="${columns.length + 1}" class="bg-amber-50 py-3 text-center">
        <button type="button" id="report-toggle-btn-${type}" class="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100 transition">
          ${state.showAll ? '<i class="fas fa-eye-slash"></i> Hide On-Track Patients' : `<i class="fas fa-eye"></i> Show ${normalRows.length} On-Track Patients`}
        </button>
      </td>
    `;
    fragment.appendChild(toggleRow);
    normalRows.forEach((row) => fragment.appendChild(row));
  }

  if (flaggedRows.length === 0 && normalRows.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="${columns.length + 1}" class="p-6 text-center text-slate-400">No active patients.</td>`;
    fragment.appendChild(emptyRow);
  }

  tbody.appendChild(fragment);

  const toggleButton = document.getElementById(`report-toggle-btn-${type}`);
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      state.showAll = !state.showAll;
      dashboardState.reportTableState[type] = state;
      document.querySelectorAll(`.report-normal-row-${type}`).forEach((row) => {
        row.classList.toggle('hidden', !state.showAll);
      });
      toggleButton.innerHTML = state.showAll
        ? '<i class="fas fa-eye-slash"></i> Hide On-Track Patients'
        : `<i class="fas fa-eye"></i> Show ${normalRows.length} On-Track Patients`;
    });
  }

  attachReportScrollHandler(type);
}

function markLayoutDirty() {
  const button = document.getElementById('btn-save-layout');
  if (!button) return;
  button.classList.remove('hidden');
  button.classList.add('bg-amber-500', 'text-white');
}

async function saveLayoutConfig() {
  const scrapeHeaders = (tableType, config) => {
    return Array.from(document.querySelectorAll(`#${tableType}-header-row th[data-idx]`)).map((th) => {
      const index = Number(th.dataset.idx);
      return {
        key: config[index].key,
        label: th.innerText.trim(),
      };
    });
  };

  const payload = {
    day_columns: scrapeHeaders('day', dashboardState.dayConfig),
    night_columns: scrapeHeaders('night', dashboardState.nightConfig),
  };

  const { response, data } = await window.apiFetchJson('/api/reports/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    window.showToast(data?.error || 'Unable to save layout.', true);
    return;
  }

  dashboardState.dayConfig = payload.day_columns;
  dashboardState.nightConfig = payload.night_columns;
  const button = document.getElementById('btn-save-layout');
  if (button) button.classList.remove('bg-amber-500', 'text-white');
  window.showToast('Report layout saved.');
}

function formatPrintableDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildPrintableTable(type) {
  const headerRow = document.getElementById(`${type}-header-row`);
  const bodyRows = document.querySelectorAll(`#${type}-table-body tr`);

  if (!headerRow || !headerRow.children.length) {
    return '<p class="no-data">No columns configured for this report.</p>';
  }

  const headers = Array.from(headerRow.children).map((th, index) => {
    return `<th class="${index === 0 ? 'patient-col' : ''}">${escapeHtml(th.textContent.replace(/\s+/g, ' ').trim())}</th>`;
  }).join('');

  const rows = Array.from(bodyRows).map((row) => {
    const cells = Array.from(row.children).map((cell, index) => {
      if (index === 0) {
        return `<td class="patient-col">${escapeHtml(cell.textContent.replace(/\s+/g, ' ').trim())}</td>`;
      }
      const button = cell.querySelector('button');
      const status = button ? button.dataset.status || '' : '';
      return `<td>${printableSymbolMap[status] || ''}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function generatePrintableReport(mode) {
  const dateValue = document.getElementById('report-date-picker')?.value;
  const reportDate = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  const sections = [];

  if (mode === 'day' || mode === 'both') sections.push(`<section class="report-section"><h2>Day Report</h2>${buildPrintableTable('day')}</section>`);
  if (mode === 'night' || mode === 'both') sections.push(`<section class="report-section"><h2>Night Report</h2>${buildPrintableTable('night')}</section>`);

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>PRO Daily Report</title>
        <style>
          @page { size: portrait; margin: 15mm; }
          body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
          h1, h2 { margin: 0; }
          header { margin-bottom: 20px; text-align: center; }
          .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12px; color: #475569; }
          .report-section { margin-bottom: 28px; }
          .report-section h2 { margin-bottom: 12px; color: #065f46; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #94a3b8; padding: 6px 8px; text-align: center; }
          th { background: #0f766e; color: white; }
          .patient-col { text-align: left; font-weight: bold; width: 220px; }
        </style>
      </head>
      <body>
        <header>
          <h1>Pakistan Recovery Oasis</h1>
          <p>Daily Patient Activity Report</p>
        </header>
        <div class="meta">
          <span>Date: ${formatPrintableDate(reportDate)}</span>
          <span>Generated: ${new Date().toLocaleString()}</span>
        </div>
        ${sections.join('<div style="page-break-before: always;"></div>')}
      </body>
    </html>
  `;
}

function printReport(mode) {
  const popup = window.open('', '', 'width=1200,height=800');
  if (!popup) {
    window.showToast('Please allow pop-ups to print the report.', true);
    return;
  }

  popup.document.write(generatePrintableReport(mode));
  popup.document.close();
  popup.focus();
  popup.addEventListener('load', () => {
    popup.print();
    setTimeout(() => popup.close(), 200);
  });
}

function closeModalFromButton(button) {
  const modalId = button.dataset.closeModal;
  if (!modalId) return;
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
  updateDateTime();
  window.setInterval(updateDateTime, 1000);
  setDefaultReportDate();

  document.getElementById('open-admissions-btn')?.addEventListener('click', openAdmissionsModal);
  document.getElementById('open-emergency-btn')?.addEventListener('click', openEmergencyModal);
  document.getElementById('emergency-form')?.addEventListener('submit', addEmergencyAlert);
  document.getElementById('report-date-picker')?.addEventListener('change', () => {
    if (canViewReports()) loadDailyReport();
  });
  document.getElementById('btn-save-layout')?.addEventListener('click', saveLayoutConfig);

  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => closeModalFromButton(button));
  });

  document.querySelectorAll('.app-modal').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.add('hidden');
    });
  });

  document.querySelectorAll('[data-print-report]').forEach((button) => {
    button.addEventListener('click', () => printReport(button.dataset.printReport));
  });

  await Promise.all([
    updateDashboard(),
    loadEmergencyAlerts(),
  ]);

  if (canViewReports()) {
    if (canSaveLayouts()) {
      document.getElementById('btn-save-layout')?.classList.remove('hidden');
    }
    await loadDailyReport();
  } else {
    document.getElementById('reports-content')?.classList.add('hidden');
    document.getElementById('reports-no-access')?.classList.remove('hidden');
  }
});

window.markLayoutDirty = markLayoutDirty;
