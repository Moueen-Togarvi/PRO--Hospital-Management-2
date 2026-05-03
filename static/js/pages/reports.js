const currentUser = window.__APP__?.currentUser || { role: 'Guest' };
let patientsData = [];
let DAY_CONFIG = [];
let NIGHT_CONFIG = [];
window.reportTableState = {
  day: { showAll: false },
  night: { showAll: false },
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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function orderColumns(columns, desiredOrder) {
  const map = new Map((columns || []).map((column) => [column.key, column]));
  const ordered = [];
  desiredOrder.forEach((key) => {
    if (map.has(key)) {
      ordered.push(map.get(key));
      map.delete(key);
    }
  });
  return [...ordered, ...map.values()];
}

function mergeWithDefaults(columns, defaults, order) {
  const base = new Map(defaults.map((column) => [column.key, { ...column }]));
  (columns || []).forEach((column) => {
    if (base.has(column.key)) {
      base.set(column.key, { ...base.get(column.key), label: column.label });
    } else {
      base.set(column.key, column);
    }
  });
  return orderColumns(Array.from(base.values()), order);
}

function getStatusClass(status) {
  if (status === 'done') return 'bg-green-100 border border-green-300 hover:bg-green-200';
  if (status === 'not_done') return 'bg-red-100 border border-red-300 hover:bg-red-200';
  if (status === 'complaint') return 'bg-yellow-100 border border-yellow-300 hover:bg-yellow-200';
  if (status === 'med') return 'bg-blue-100 border border-blue-300 hover:bg-blue-200';
  if (status === 'wc') return 'bg-purple-100 border border-purple-300 hover:bg-purple-200';
  return 'bg-gray-50 border border-gray-100 hover:bg-gray-100';
}

function getStatusIcon(status) {
  if (status === 'done') return '<i class="fas fa-check text-sm text-green-600"></i>';
  if (status === 'not_done') return '<i class="fas fa-times text-sm text-red-600"></i>';
  if (status === 'complaint') return '<i class="fas fa-exclamation text-sm text-yellow-600"></i>';
  if (status === 'med') return '<span class="text-xs font-bold text-blue-600">Med</span>';
  if (status === 'wc') return '<span class="text-xs font-bold text-purple-600">WC</span>';
  return '<span class="text-xs text-gray-200">•</span>';
}

async function fetchPatients() {
  try {
    const res = await fetch('/api/patients');
    if (res.ok) {
      patientsData = await res.json();
    }
  } catch (error) {
    console.error('Patients fetch error', error);
  }
}

async function loadDailyReport() {
  const datePicker = document.getElementById('report-date-picker');
  if (!datePicker || !datePicker.value) return;
  const date = datePicker.value;

  if (currentUser.role === 'Admin') {
    document.getElementById('btn-save-layout')?.classList.remove('hidden');
  }

  try {
    const configRes = await fetch('/api/reports/config');
    if (configRes.ok) {
      const config = await configRes.json();
      DAY_CONFIG = mergeWithDefaults(config.day_columns, DEFAULT_DAY_CONFIG, DAY_COLUMN_ORDER);
      NIGHT_CONFIG = mergeWithDefaults(config.night_columns, DEFAULT_NIGHT_CONFIG, NIGHT_COLUMN_ORDER);
    } else {
      DAY_CONFIG = mergeWithDefaults(undefined, DEFAULT_DAY_CONFIG, DAY_COLUMN_ORDER);
      NIGHT_CONFIG = mergeWithDefaults(undefined, DEFAULT_NIGHT_CONFIG, NIGHT_COLUMN_ORDER);
    }
  } catch (error) {
    console.error('Config load error, using defaults', error);
    DAY_CONFIG = mergeWithDefaults(undefined, DEFAULT_DAY_CONFIG, DAY_COLUMN_ORDER);
    NIGHT_CONFIG = mergeWithDefaults(undefined, DEFAULT_NIGHT_CONFIG, NIGHT_COLUMN_ORDER);
  }

  DAY_CONFIG = DAY_CONFIG.filter((column) => DAY_COLUMN_ORDER.includes(column.key));
  NIGHT_CONFIG = NIGHT_CONFIG.filter((column) => NIGHT_COLUMN_ORDER.includes(column.key));

  if (!patientsData.length) {
    await fetchPatients();
  }
  const activePatients = patientsData.filter((patient) => !patient.isDischarged);

  let reportData = [];
  try {
    const res = await fetch(`/api/reports?date=${date}`);
    if (res.ok) reportData = await res.json();
  } catch (error) {
    console.error('Data load error', error);
  }

  const reportMap = {};
  reportData.forEach((row) => {
    reportMap[row.patient_id] = row.schedule || {};
  });

  renderSplitTable('day', DAY_CONFIG, activePatients, reportMap);
  renderSplitTable('night', NIGHT_CONFIG, activePatients, reportMap);
}

async function cycleReportStatus(buttonElement, patientId, timeSlot, currentStatus, reportType) {
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

  buttonElement.className = `w-full h-6 rounded flex items-center justify-center transition-all text-xs ${getStatusClass(nextStatus)}`;
  buttonElement.innerHTML = getStatusIcon(nextStatus);
  buttonElement.dataset.status = nextStatus || '';
  buttonElement.setAttribute('aria-label', statusLabelMap[nextStatus] || 'No Status');
  buttonElement.setAttribute(
    'onclick',
    `cycleReportStatus(this, '${patientId}', '${timeSlot}', '${nextStatus}', '${reportType}')`
  );

  const datePicker = document.getElementById('report-date-picker');
  const date = datePicker ? datePicker.value : new Date().toISOString().split('T')[0];

  try {
    await fetch('/api/reports/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        patient_id: patientId,
        time_slot: timeSlot,
        status: nextStatus,
      }),
    });
  } catch (error) {
    console.error('Network error updating status', error);
  }
}

function renderSplitTable(type, columns, patients, reportMap) {
  const headerRow = document.getElementById(`${type}-header-row`);
  const tbody = document.getElementById(`${type}-table-body`);
  const isAdmin = currentUser.role === 'Admin';

  const headerBaseClasses = 'px-2 py-2 text-left whitespace-nowrap sticky left-0 z-20 shadow-md bg-emerald-600 text-white';
  let headersHtml = `<th id="${type}-patient-header" class="${headerBaseClasses}" style="min-width: 100px; max-width: 140px;">
    <span class="patient-header-label font-semibold tracking-wide text-xs">Patient</span>
  </th>`;

  columns.forEach((column, index) => {
    const editableAttr = isAdmin ? 'contenteditable="true"' : '';
    const blurAttr = isAdmin ? 'onblur="markLayoutDirty()"' : '';
    const cursorClass = isAdmin ? 'cursor-text hover:bg-white/10' : 'cursor-default';
    const titleAttr = `title="${escapeHtml(column.label || '')}"`;
    const headerContent = `<span class="block whitespace-pre-wrap text-[0.6rem] leading-tight">${escapeHtml(column.label || '')}</span>`;

    headersHtml += `<th ${editableAttr} data-idx="${index}" ${titleAttr} ${blurAttr}
      class="px-1 py-2 text-center align-middle whitespace-normal min-w-[50px] max-w-[70px] border-l border-white/20 ${cursorClass}">
      ${headerContent}
    </th>`;
  });

  headerRow.innerHTML = headersHtml;
  tbody.innerHTML = '';

  if (!patients.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" class="p-6 text-center text-gray-400">No active patients.</td></tr>`;
    return;
  }

  if (!window.reportTableState[type]) {
    window.reportTableState[type] = { showAll: false };
  }
  const showAllNormal = window.reportTableState[type].showAll;
  const flaggedRows = [];
  const normalRows = [];

  patients.forEach((patient) => {
    const patientId = patient._id || patient.id;
    const schedules = reportMap[patientId] || {};
    let hasIssue = false;

    const rowBaseClasses = type === 'day'
      ? 'px-2 py-1 font-bold text-emerald-900 bg-emerald-50'
      : 'px-2 py-1 font-bold text-indigo-900 bg-indigo-50';

    let rowHtml = `<td class="${rowBaseClasses} sticky left-0 border-r z-20 whitespace-nowrap text-[0.65rem] max-w-[140px]" style="min-width: 100px;">
      <span class="block truncate" title="${escapeHtml(patient.name || '')}">${escapeHtml(patient.name || '')}</span>
    </td>`;

    columns.forEach((column) => {
      const status = schedules[column.key];
      if (status === 'complaint') hasIssue = true;
      rowHtml += `
        <td class="p-0.5 border text-center align-middle">
          <button onclick="cycleReportStatus(this, '${patientId}', '${column.key}', '${status || ''}', '${type}')"
            class="w-full h-6 rounded flex items-center justify-center transition-all text-xs ${getStatusClass(status)}"
            data-status="${status || ''}"
            data-patient="${patientId}"
            data-slot="${column.key}"
            aria-label="${statusLabelMap[status] || 'No Status'}">
            ${getStatusIcon(status)}
          </button>
        </td>`;
    });

    const row = document.createElement('tr');
    row.innerHTML = rowHtml;
    row.className = 'transition hover:bg-gray-50';

    if (hasIssue) {
      row.classList.add('bg-rose-50');
      flaggedRows.push(row);
    } else {
      row.classList.add('report-normal-row', `report-normal-row-${type}`);
      if (!showAllNormal) row.classList.add('hidden');
      normalRows.push(row);
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
    toggleBtn.dataset.count = String(normalRows.length);
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
  attachReportScrollHandler(type);
}

function attachReportScrollHandler(type) {
  const container = document.querySelector(`#${type}-report-container .overflow-x-auto`);
  if (!container) return;
  if (!container.dataset.scrollWatcherAttached) {
    container.addEventListener('scroll', () => updateReportHeaderVisibility(type, container));
    container.dataset.scrollWatcherAttached = 'true';
  }
  updateReportHeaderVisibility(type, container);
}

function updateReportHeaderVisibility(type, container) {
  const headerCell = document.getElementById(`${type}-patient-header`);
  if (!headerCell) return;
  const label = headerCell.querySelector('.patient-header-label');
  if (label) label.style.opacity = container.scrollLeft > 0 ? '0' : '1';
}

function toggleReportRows(type) {
  if (!window.reportTableState[type]) return;
  const state = window.reportTableState[type];
  state.showAll = !state.showAll;

  document.querySelectorAll(`.report-normal-row-${type}`).forEach((row) => {
    row.classList.toggle('hidden', !state.showAll);
  });

  const btn = document.getElementById(`report-toggle-btn-${type}`);
  if (btn) {
    const count = btn.dataset.count || '0';
    btn.innerHTML = state.showAll
      ? '<i class="fas fa-eye-slash"></i> Hide On-Track Patients'
      : `<i class="fas fa-eye"></i> Show ${count} On-Track Patients`;
  }
}

function markLayoutDirty() {
  const btn = document.getElementById('btn-save-layout');
  if (!btn) return;
  btn.classList.add('bg-yellow-500', 'animate-pulse');
  btn.classList.remove('bg-gray-900');
}

async function saveLayoutConfig() {
  const scrapeHeaders = (type, currentConfig) => {
    const headers = document.querySelectorAll(`#${type}-header-row th[data-idx]`);
    const newColumns = [];
    headers.forEach((header) => {
      const index = Number(header.getAttribute('data-idx'));
      const originalKey = currentConfig[index]?.key;
      if (originalKey) {
        newColumns.push({ key: originalKey, label: header.innerText.trim() });
      }
    });
    return newColumns;
  };

  const newDayConfig = scrapeHeaders('day', DAY_CONFIG);
  const newNightConfig = scrapeHeaders('night', NIGHT_CONFIG);

  try {
    const res = await fetch('/api/reports/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_columns: newDayConfig, night_columns: newNightConfig }),
    });

    if (res.ok) {
      showSuccessModal('Layout Saved');
      const btn = document.getElementById('btn-save-layout');
      if (btn) {
        btn.classList.remove('bg-yellow-500', 'animate-pulse');
        btn.classList.add('bg-gray-900');
      }
      DAY_CONFIG = newDayConfig;
      NIGHT_CONFIG = newNightConfig;
    } else {
      showSuccessModal('Error saving layout', true);
    }
  } catch (error) {
    console.error('Save layout error', error);
    showSuccessModal('Error saving layout', true);
  }
}

function formatPrintableDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function buildPrintableTable(type) {
  const headerRow = document.getElementById(`${type}-header-row`);
  const bodyRows = document.querySelectorAll(`#${type}-table-body tr`);
  if (!headerRow || !headerRow.children.length) {
    return '<p class="no-data">No columns configured for this report.</p>';
  }
  if (!bodyRows.length) {
    return '<p class="no-data">No active patients for this report.</p>';
  }

  const sanitize = (text) => (text || '').replace(/\s+/g, ' ').trim();

  const headers = Array.from(headerRow.children)
    .map((th, index) => `<th class="${index === 0 ? 'patient-col' : ''}">${sanitize(th.textContent)}</th>`)
    .join('');

  const rowHtml = Array.from(bodyRows)
    .filter((row) => row.querySelector('button') || row.querySelector('td'))
    .map((row) => {
      const cells = Array.from(row.children).map((cell, index) => {
        if (index === 0) {
          return `<td class="patient-col">${sanitize(cell.textContent)}</td>`;
        }
        const button = cell.querySelector('button');
        const status = button?.dataset.status || '';
        return `<td>${printableSymbolMap[status] || ''}</td>`;
      });
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');

  return `<table><thead><tr>${headers}</tr></thead><tbody>${rowHtml}</tbody></table>`;
}

function generatePrintableReport(mode) {
  const styles = `
    <style>
      @page { size: portrait; margin: 15mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; }
      header { text-align: center; margin-bottom: 24px; }
      header h1 { margin: 0 0 6px 0; font-size: 26px; letter-spacing: 0.5px; }
      header p { margin: 2px 0; color: #4b5563; font-size: 13px; }
      .report-meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 16px; color: #4b5563; }
      .report-section { margin-bottom: 28px; }
      .report-section h2 { margin-bottom: 12px; font-size: 18px; color: #065f46; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #9ca3af; padding: 6px 8px; text-align: center; }
      th { background: #0f3c2d; color: white; }
      td.patient-col { text-align: left; font-weight: 600; width: 220px; }
      tr:nth-child(even) td { background: #f8f9fb; }
      .legend { font-size: 11px; color: #4b5563; margin-top: 8px; }
      .no-data { font-size: 12px; color: #6b7280; font-style: italic; }
      .page-break { page-break-before: always; }
    </style>
  `;

  const datePicker = document.getElementById('report-date-picker');
  const selectedDate = datePicker && datePicker.value ? new Date(`${datePicker.value}T00:00:00`) : new Date();
  const generatedAt = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const reportDate = formatPrintableDate(selectedDate);

  const sections = [];
  if (mode === 'day' || mode === 'both') {
    sections.push(`<section class="report-section"><h2>Day Report</h2>${buildPrintableTable('day')}</section>`);
  }
  if (mode === 'night' || mode === 'both') {
    sections.push(`<section class="report-section"><h2>Night Report</h2>${buildPrintableTable('night')}</section>`);
  }
  if (!sections.length) sections.push('<p>No report data available for printing.</p>');

  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>PRO Daily Report</title>
        ${styles}
      </head>
      <body>
        <header>
          <h1>Pakistan Recovery Oasis</h1>
          <p>Daily Patient Activity Report</p>
          <p style="margin-top:4px;">&#9742; +966-557385262</p>
        </header>
        <div class="report-meta">
          <span>Date: ${reportDate}</span>
          <span>Generated: ${generatedAt}</span>
        </div>
        ${sections.join('<div class="page-break"></div>')}
        <div class="legend">
          <strong>Status Legend:</strong> Leave blank if no update. Use ✓ for Done, ✕ for Not Done, ! for Emergency / Complaint.
        </div>
      </body>
    </html>`;
}

function printReport(mode) {
  const printableHTML = generatePrintableReport(mode);
  const printWindow = window.open('', '', 'width=1200,height=800');
  if (!printWindow) {
    window.alert('Please allow pop-ups to print the report.');
    return;
  }

  printWindow.document.write(printableHTML);
  printWindow.document.close();
  printWindow.focus();
  printWindow.addEventListener('load', () => {
    printWindow.print();
    setTimeout(() => {
      printWindow.close();
    }, 200);
  });
}

function showSuccessModal(message, isError = false) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, isError);
    return;
  }
  window.alert(message);
}

document.addEventListener('DOMContentLoaded', async () => {
  const dateInput = document.getElementById('report-date-picker');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  await fetchPatients();
  await loadDailyReport();
});

window.loadDailyReport = loadDailyReport;
window.cycleReportStatus = cycleReportStatus;
window.toggleReportRows = toggleReportRows;
window.markLayoutDirty = markLayoutDirty;
window.saveLayoutConfig = saveLayoutConfig;
window.printReport = printReport;
