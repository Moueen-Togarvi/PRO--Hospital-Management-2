const currentUser = window.__APP__?.currentUser || { role: 'Guest' };
const staffDashboardState = {
  patientsData: [],
  reportTableState: {
    day: { showAll: false },
    night: { showAll: false },
  },
};

const DAY_COLUMN_ORDER = [
  'slot_0800', 'slot_0900', 'slot_1000', 'slot_1100', 'slot_1200', 'slot_1300',
  'slot_1400', 'slot_1500', 'slot_1600', 'slot_1700', 'slot_1800', 'slot_1900',
];

const NIGHT_COLUMN_ORDER = [
  'slot_2000', 'slot_2100', 'slot_2200', 'slot_2300', 'slot_0000', 'slot_0100',
  'slot_0200', 'slot_0300', 'slot_0400', 'slot_0500', 'slot_0600', 'slot_0700',
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

async function fetchPatients() {
  if (staffDashboardState.patientsData.length > 0) return staffDashboardState.patientsData;
  const { response, data } = await window.apiFetchJson('/api/patients');
  if (!response.ok || !Array.isArray(data)) throw new Error('Unable to load patients.');
  staffDashboardState.patientsData = data;
  return staffDashboardState.patientsData;
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
    date: document.getElementById('staff-report-date-picker')?.value,
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

function updateReportHeaderVisibility(type, container) {
  const headerCell = document.getElementById(`${type}-patient-header`);
  if (!headerCell) return;
  const label = headerCell.querySelector('.patient-header-label');
  const isScrolled = container.scrollLeft > 0;
  if (label) label.style.opacity = isScrolled ? '0' : '1';
}

function attachReportScrollHandler(type, prefix = '') {
  const container = document.querySelector(`#${prefix}${type}-report-container .overflow-x-auto`) || document.querySelector(`#${prefix}${type}-report-container .table-scroll-shell`);
  if (!container) return;
  if (!container.dataset.scrollWatcherAttached) {
    container.addEventListener('scroll', () => updateReportHeaderVisibility(type, container));
    container.dataset.scrollWatcherAttached = 'true';
  }
  updateReportHeaderVisibility(type, container);
}

function renderSplitTable(type, columns, patients, reportMap, prefix = '') {
  const headerRow = document.getElementById(`${prefix}${type}-header-row`);
  const tbody = document.getElementById(`${prefix}${type}-table-body`);
  if (!headerRow || !tbody) return;

  const headerBaseClasses = 'px-2 py-2 text-left whitespace-nowrap sticky left-0 z-20 shadow-md bg-emerald-600 text-white';
  let headersHtml = `<th id="${type}-patient-header" class="${headerBaseClasses}" style="min-width: 100px; max-width: 140px;"><span class="patient-header-label font-semibold tracking-wide text-xs">Patient</span></th>`;

  columns.forEach((col, index) => {
    headersHtml += `<th data-idx="${index}" title="${escapeHtml(col.label || '')}" class="px-1 py-2 text-center align-middle whitespace-normal min-w-[50px] max-w-[70px] border-l border-white/20 cursor-default"><span class="block whitespace-pre-wrap text-[0.6rem] leading-tight">${escapeHtml(col.label || '')}</span></th>`;
  });
  headerRow.innerHTML = headersHtml;

  tbody.innerHTML = '';
  if (patients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" class="p-6 text-center text-gray-400">No active patients.</td></tr>`;
    return;
  }

  if (!staffDashboardState.reportTableState[type]) {
    staffDashboardState.reportTableState[type] = { showAll: false };
  }
  const showAllNormal = staffDashboardState.reportTableState[type].showAll;
  const flaggedRows = [];
  const normalRows = [];

  patients.forEach((p) => {
    const pId = p._id || p.id;
    const schedules = reportMap[pId] || {};
    let hasIssue = false;
    const rowBaseClasses = type === 'day'
      ? 'px-2 py-1 font-bold text-emerald-900 bg-emerald-50'
      : 'px-2 py-1 font-bold text-indigo-900 bg-indigo-50';

    let nameHtml = `<span class="block truncate" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>`;
    if (prefix === 'staff-') {
      nameHtml = `<div class="flex items-center justify-between gap-2"><span class="truncate" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span><button onclick="openStaffReportsModal('${pId}', '${escapeHtml(p.name)}')" class="p-1 text-emerald-600 hover:text-emerald-800" title="View Progress Reports"><i class="fas fa-file-medical"></i></button></div>`;
    }

    let rowHtml = `<td class="${rowBaseClasses} sticky left-0 z-20 max-w-[140px] whitespace-nowrap border-r text-[0.65rem]" style="min-width: 100px;">${nameHtml}</td>`;

    columns.forEach((col) => {
      const status = schedules[col.key];
      if (status === 'complaint') hasIssue = true;
      rowHtml += `<td class="border p-0.5 text-center align-middle"><button onclick="cycleReportStatus(this, '${pId}', '${col.key}', '${status || ''}', '${type}')" class="w-full h-6 rounded flex items-center justify-center transition-all text-xs ${getStatusClass(status)}" data-status="${status || ''}" data-patient="${pId}" data-slot="${col.key}" aria-label="${statusLabelMap[status] || 'No Status'}">${getStatusIcon(status)}</button></td>`;
    });

    const tr = document.createElement('tr');
    tr.innerHTML = rowHtml;
    tr.className = 'transition hover:bg-gray-50';

    if (hasIssue) {
      tr.classList.add('bg-rose-50');
      flaggedRows.push(tr);
    } else {
      tr.classList.add('report-normal-row', `report-normal-row-${type}`);
      if (!showAllNormal) tr.classList.add('hidden');
      normalRows.push(tr);
    }
  });

  const fragment = document.createDocumentFragment();

  if (flaggedRows.length === 0 && normalRows.length > 0) {
    const infoRow = document.createElement('tr');
    infoRow.innerHTML = `<td colspan="${columns.length + 1}" class="bg-emerald-50 px-4 py-4 text-center text-sm font-semibold text-emerald-800">All patients are currently on track.</td>`;
    fragment.appendChild(infoRow);
  }

  flaggedRows.forEach((row) => fragment.appendChild(row));

  if (normalRows.length > 0) {
    const toggleRow = document.createElement('tr');
    const toggleCell = document.createElement('td');
    toggleCell.colSpan = columns.length + 1;
    toggleCell.className = 'bg-amber-50 py-3 text-center';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.id = `report-toggle-btn-${type}`;
    toggleBtn.dataset.count = normalRows.length;
    toggleBtn.className = 'inline-flex items-center justify-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100';
    toggleBtn.setAttribute('onclick', `toggleReportRows('${type}')`);
    toggleBtn.innerHTML = showAllNormal
      ? '<i class="fas fa-eye-slash"></i> Hide On-Track Patients'
      : `<i class="fas fa-eye"></i> Show ${normalRows.length} On-Track Patients`;
    toggleCell.appendChild(toggleBtn);
    toggleRow.appendChild(toggleCell);
    fragment.appendChild(toggleRow);
    normalRows.forEach((row) => fragment.appendChild(row));
  }

  if (flaggedRows.length === 0 && normalRows.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="${columns.length + 1}" class="p-6 text-center text-gray-400">No active patients.</td>`;
    fragment.appendChild(emptyRow);
  }

  tbody.appendChild(fragment);
  attachReportScrollHandler(type, prefix);
}

window.toggleReportRows = function toggleReportRows(type) {
  if (!staffDashboardState.reportTableState[type]) return;
  const state = staffDashboardState.reportTableState[type];
  state.showAll = !state.showAll;

  const rows = document.querySelectorAll(`.report-normal-row-${type}`);
  rows.forEach((row) => {
    if (state.showAll) row.classList.remove('hidden');
    else row.classList.add('hidden');
  });

  const btn = document.getElementById(`report-toggle-btn-${type}`);
  if (btn) {
    const count = btn.dataset.count || rows.length || 0;
    btn.innerHTML = state.showAll
      ? '<i class="fas fa-eye-slash"></i> Hide On-Track Patients'
      : `<i class="fas fa-eye"></i> Show ${count} On-Track Patients`;
  }
};

window.openStaffReportsModal = async function openStaffReportsModal(patientId, patientName) {
  const modal = document.getElementById('staff-reports-modal');
  const title = document.getElementById('staff-report-title');
  const content = document.getElementById('staff-reports-content');
  if (!modal || !title || !content) return;

  title.innerText = `Reports: ${patientName}`;
  content.innerHTML = '<div class="flex justify-center p-8"><div class="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div></div>';
  modal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/patients/${patientId}/records`);
    if (!res.ok) throw new Error('Failed to load records');
    const records = await res.json();

    if (records.length === 0) {
      content.innerHTML = '<div class="p-12 text-center font-bold text-gray-400">No clinical reports found for this patient.</div>';
      return;
    }

    let html = '<div class="space-y-4">';
    records.forEach((r) => {
      const date = new Date(r.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isMed = r.type === 'medical_record';
      const icon = isMed ? 'fa-notes-medical' : 'fa-user-md';
      const color = isMed ? 'blue' : 'emerald';

      html += `<div class="rounded-2xl border-l-4 border-${color}-500 bg-white p-4 shadow-sm"><div class="mb-2 flex items-start justify-between"><div class="flex items-center gap-2"><i class="fas ${icon} text-${color}-600"></i><span class="text-sm font-black text-gray-900">${r.title || (isMed ? 'Medical Record' : 'Psychology Session')}</span></div><span class="text-[10px] font-bold uppercase text-gray-400">${date}</span></div><p class="text-xs leading-relaxed text-gray-600">${r.details || r.text || 'No details provided.'}</p><div class="mt-2 text-[9px] font-bold uppercase tracking-tighter text-gray-400">By: ${r.recorded_by || 'Unknown'}</div></div>`;
    });
    html += '</div>';
    content.innerHTML = html;
  } catch (error) {
    console.error('Staff Report Detail Load Error', error);
    content.innerHTML = `<div class="rounded-xl bg-red-50 p-4 text-center font-bold text-red-700">Error: ${error.message}</div>`;
  }
};

window.renderStaffDashboard = async function renderStaffDashboard() {
  const totalEl = document.getElementById('staff-dash-total');
  const datePicker = document.getElementById('staff-report-date-picker');

  if (datePicker && !datePicker.value) {
    datePicker.value = new Date().toISOString().split('T')[0];
  }
  const date = datePicker ? datePicker.value : new Date().toISOString().split('T')[0];

  try {
    const res = await fetch('/api/dashboard');
    if (res.ok) {
      const metrics = await res.json();
      if (totalEl) totalEl.innerText = metrics.totalPatients || 0;
    }
  } catch (error) {
    console.error('Staff Dashboard Metrics Load Error', error);
  }

  let dayConfig = [...DEFAULT_DAY_CONFIG];
  let nightConfig = [...DEFAULT_NIGHT_CONFIG];
  try {
    const configRes = await fetch('/api/reports/config');
    if (configRes.ok) {
      const config = await configRes.json();
      dayConfig = mergeWithDefaults(config.day_columns, DEFAULT_DAY_CONFIG, DAY_COLUMN_ORDER);
      nightConfig = mergeWithDefaults(config.night_columns, DEFAULT_NIGHT_CONFIG, NIGHT_COLUMN_ORDER);
    }
  } catch (error) {
    console.error('Config load error in staff dash', error);
  }

  const patients = await fetchPatients();
  const activePatients = patients.filter((p) => !p.isDischarged);

  let reportData = [];
  try {
    const res = await fetch(`/api/reports?date=${date}`);
    if (res.ok) reportData = await res.json();
  } catch (error) {
    console.error('Staff Report Load Error', error);
  }

  const reportMap = {};
  let totalTasks = 0;
  let completedTasks = 0;
  let pendingAlerts = 0;

  reportData.forEach((r) => {
    const schedule = r.schedule || {};
    reportMap[r.patient_id] = schedule;
    Object.values(schedule).forEach((status) => {
      if (status) {
        totalTasks += 1;
        if (status === 'done') completedTasks += 1;
        if (status === 'complaint') pendingAlerts += 1;
      }
    });
  });

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const totalTasksEl = document.getElementById('staff-total-tasks');
  const alertsEl = document.getElementById('staff-pending-alerts');
  const rateElCard = document.getElementById('staff-completion-rate-card');
  const rateElTop = document.getElementById('staff-completion-rate-top');
  const shiftTag = document.getElementById('staff-current-shift-tag');

  if (totalTasksEl) totalTasksEl.innerText = completedTasks;
  if (alertsEl) alertsEl.innerText = pendingAlerts;
  if (rateElCard) rateElCard.innerText = `${completionRate}%`;
  if (rateElTop) rateElTop.innerText = `${completionRate}%`;

  if (shiftTag) {
    const hour = new Date().getHours();
    const isNight = hour >= 20 || hour < 8;
    shiftTag.innerHTML = isNight ? '<i class="fas fa-moon mr-1.5 text-indigo-300"></i> Night Shift' : '<i class="fas fa-sun mr-1.5 text-yellow-300"></i> Day Shift';
    shiftTag.classList.toggle('bg-indigo-500/20', isNight);
    shiftTag.classList.toggle('border-indigo-400/30', isNight);
  }

  renderSplitTable('day', dayConfig, activePatients, reportMap, 'staff-');
  renderSplitTable('night', nightConfig, activePatients, reportMap, 'staff-');
};

document.addEventListener('DOMContentLoaded', async () => {
  if (currentUser.role !== 'General Staff') return;
  await window.renderStaffDashboard();
});
