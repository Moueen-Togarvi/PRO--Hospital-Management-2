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

let currentCallMeetingRecords = [];
let callMeetingMeta = {};

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

const canViewReports = () => ['Admin', 'Doctor', 'Staff', 'Psychologist'].includes(dashboardState.currentUser.role);
const canSaveLayouts = () => dashboardState.currentUser.role === 'Admin';
const canViewFinanceCards = () => dashboardState.currentUser.role === 'Admin';

function isPatientDischarged(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes'].includes(normalized);
  }
  return value === true;
}

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

window.navigateTo = function navigateTo(viewId) {
  const routeMap = {
    'dashboard-view': '/dashboard',
    'patients-view': '/patients',
    'expenses-view': '/expenses',
    'canteen-view': '/canteen',
    'user-management-view': '/users',
    'accounts-view': '/accounts',
    'utility-bills-view': '/utility-bills',
    'team-view': '/team',
    'overheads-view': '/overheads',
    'manual-discharge-view': '/manual-discharge',
    'monthly-overheads-view': '/monthly-overheads',
    'attendance-view': '/attendance',
    'prescription-view': '/prescription',
    'psych-sessions-view': '/psych-sessions',
    'family-dashboard-view': '/family-dashboard',
    'staff-dashboard-view': '/staff-dashboard',
  };
  window.location.href = routeMap[viewId] || '/dashboard';
};

function setDefaultReportDate() {
  const dateInput = document.getElementById('report-date-picker');
  if (!dateInput || dateInput.value) return;
  const today = new Date();
  dateInput.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

async function updateDashboard() {
  try {
    const isAdmin = dashboardState.currentUser.role === 'Admin';
    const incomeCard = document.getElementById('dash-income-card');
    const canteenCard = document.getElementById('dash-canteen-card');
    const callMeetingSection = document.getElementById('dash-call-meeting-section');

    if (incomeCard) incomeCard.style.display = isAdmin ? '' : 'none';
    if (canteenCard) canteenCard.style.display = isAdmin ? '' : 'none';
    if (callMeetingSection) callMeetingSection.style.display = isAdmin ? '' : 'none';

    const { response, data } = await window.apiFetchJson('/api/dashboard');
    if (!response.ok || !data) return;

    const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long' });
    const totalEl = document.getElementById('dash-total');
    const admittedEl = document.getElementById('dash-admitted');
    const dischargedEl = document.getElementById('dash-discharged');
    const psychEl = document.getElementById('dash-psy-sessions');
    const monthEl = document.getElementById('dash-month-label');

    if (totalEl) totalEl.innerText = formatNumber(data.totalPatients);
    if (admittedEl) admittedEl.innerText = formatNumber(data.admissionsThisMonth || 0);
    if (dischargedEl) dischargedEl.innerText = formatNumber(data.dischargesThisMonth || 0);
    if (psychEl) psychEl.innerText = formatNumber(data.totalPsychSessionsToday || 0);
    if (monthEl) monthEl.innerText = monthLabel;
  } catch (error) {
    console.error('Dashboard Error', error);
  }

  const dateInput = document.getElementById('report-date-picker');
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const localIso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    dateInput.value = localIso;
  }

  if (canViewReports()) {
    document.getElementById('reports-content')?.classList.remove('hidden');
    document.getElementById('reports-no-access')?.classList.add('hidden');
    await loadDailyReport();
  } else {
    document.getElementById('reports-content')?.classList.add('hidden');
    document.getElementById('reports-no-access')?.classList.remove('hidden');
  }
}

async function openAdmissionsModal() {
  const container = document.getElementById('admissions-month-body');
  const modal = document.getElementById('admissions-modal');
  if (!container || !modal) return;

  container.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">Loading admissions...</div>';
  modal.classList.remove('hidden');
  modal.classList.add('flex');

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

function closeAdmissionsModal() {
  const modal = document.getElementById('admissions-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function loadEmergencyAlerts() {
  const container = document.getElementById('emergency-list');
  if (!container) return;

  const { response, data } = await window.apiFetchJson('/api/emergency');
  if (!response.ok || !Array.isArray(data)) {
    container.innerHTML = '<div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-xs font-semibold text-red-600">Unable to load active alerts.</div>';
    return;
  }

  if (data.length === 0) {
    container.innerHTML = `
      <div class="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
        <i class="fas fa-circle-check text-xl text-emerald-500"></i>
        <p class="mt-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">All Clear</p>
        <p class="mt-1 text-xs font-medium text-slate-500">No active emergency alerts right now.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = data.map((alert) => {
    const critical = alert.severity === 'critical';
    return `
      <article class="${critical ? 'animate-pulse-red border-red-300 bg-red-50' : 'border-orange-200 bg-orange-50'} rounded-xl border px-4 py-3 shadow-sm">
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
  modal.classList.add('flex');
  select.innerHTML = '<option value="">Loading...</option>';

  try {
    const patients = await fetchPatients();
    const activePatients = patients.filter((patient) => !isPatientDischarged(patient.isDischarged));
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
  document.getElementById('emergency-modal').classList.remove('flex');
  window.showToast('Emergency alert posted.');
  await loadEmergencyAlerts();
}

async function loadCallMeetingData() {
  try {
    const today = new Date();
    const monthInput = document.getElementById('call-meeting-month');
    if (!monthInput) return;

    if (!monthInput.value) {
      monthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    }

    const [yearStr, monthStr] = monthInput.value.split('-');
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthLabel = document.getElementById('call-meeting-month-label');
    if (monthLabel) monthLabel.innerText = `Month view for ${monthNames[month - 1]} ${year}`;

    const todayLabel = document.getElementById('call-meeting-current-date');
    if (todayLabel) {
      todayLabel.innerText = `Today: ${today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
    }

    const { response, data } = await window.apiFetchJson(`/api/call_meeting_tracker?month=${month}&year=${year}`);
    if (!response.ok) return;
    currentCallMeetingRecords = data || [];
    renderCallMeetingTable(currentCallMeetingRecords, month, year);
  } catch (error) {
    console.error('Call/Meeting Load Error', error);
  }
}

function renderCallMeetingTable(records, month, year) {
  const headerRow = document.getElementById('call_meeting_header_row');
  const tbody = document.getElementById('call_meeting_table_body');
  if (!headerRow || !tbody) return;

  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayDay = today.getDate();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  let headersHtml = `<th class="call-meeting-name-col sticky left-0 z-20 whitespace-nowrap bg-emerald-600 px-3 py-2 text-left text-white shadow-md"><span class="text-sm font-semibold tracking-wide">Name</span></th>`;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const isTodayCol = isCurrentMonth && day === todayDay;
    headersHtml += `<th class="call-meeting-day-header ${isTodayCol ? 'call-meeting-today' : ''} whitespace-nowrap border-l border-white/20 px-1 py-2 text-center text-[11px] font-semibold">${day}</th>`;
  }
  headerRow.innerHTML = headersHtml;

  callMeetingMeta = {};
  const groupedByName = {};
  (records || []).forEach((record) => {
    if (!groupedByName[record.name]) {
      groupedByName[record.name] = {
        name: record.name,
        date_of_admission: record.date_of_admission,
        days: {},
      };
    }
    groupedByName[record.name].days[record.day] = {
      id: record._id,
      status: record.status || record.type || 'Meeting',
    };
  });

  const names = Object.keys(groupedByName);
  if (!names.length) {
    tbody.innerHTML = `<tr><td colspan="${daysInMonth + 1}" class="p-6 text-center text-gray-400">No entries for this month.</td></tr>`;
    return;
  }

  const rows = names.map((name) => {
    const person = groupedByName[name];
    callMeetingMeta[name] = { date_of_admission: person.date_of_admission, days: person.days };
    let rowHtml = `<td class="call-meeting-name-col sticky left-0 z-20 whitespace-nowrap border-r bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 md:text-sm"><span class="block truncate">${escapeHtml(person.name)}</span></td>`;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayData = person.days[day];
      const hasEntry = !!dayData;
      const isTodayCol = isCurrentMonth && day === todayDay;
      const cellBadge = hasEntry ? '<i class="fas fa-check text-xs text-emerald-700"></i>' : '';
      const cellClass = hasEntry ? 'bg-emerald-50 border border-emerald-500' : 'bg-gray-50';

      rowHtml += `<td class="call-meeting-day-cell ${isTodayCol ? 'call-meeting-today' : ''} border p-1 text-center align-middle">
        <button class="${cellClass} ${isTodayCol ? 'call-meeting-today-button' : ''} flex h-7 w-full items-center justify-center rounded text-[11px]"
          onclick="toggleCallMeeting('${encodeURIComponent(person.name)}', ${day})"
          title="${hasEntry ? 'Remove entry' : 'Add entry'}">
          ${cellBadge}
        </button>
      </td>`;
    }

    return `<tr class="transition hover:bg-gray-50">${rowHtml}</tr>`;
  }).join('');

  tbody.innerHTML = rows;
}

function setupCallMeetingPatientDropdown() {
  const input = document.getElementById('cm-name');
  const dropdown = document.getElementById('cm-name-dropdown');
  const admissionDateInput = document.getElementById('cm-admission-date');
  if (!input || !dropdown || !admissionDateInput) return;

  const activePatients = dashboardState.patientsData
    .filter((patient) => !patient.isDischarged)
    .map((patient) => ({
      id: patient._id || patient.id,
      name: patient.name,
      admissionDate: patient.admissionDate,
    }));

  let selectedPatientId = null;
  let selectedAdmissionDate = '';

  function renderDropdown(filter = '') {
    const filtered = activePatients.filter((patient) =>
      String(patient.name || '').toLowerCase().includes(filter.toLowerCase())
    );

    dropdown.innerHTML = '';
    if (!filtered.length) {
      dropdown.innerHTML = '<div class="searchable-dropdown-item" style="color: #9ca3af;">No patients found</div>';
      return;
    }

    filtered.forEach((patient) => {
      const item = document.createElement('div');
      item.className = 'searchable-dropdown-item';
      item.textContent = patient.name;
      item.addEventListener('click', () => {
        input.value = patient.name;
        selectedPatientId = patient.id;
        selectedAdmissionDate = patient.admissionDate || '';
        admissionDateInput.value = selectedAdmissionDate;
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(item);
    });
  }

  input.onfocus = () => {
    renderDropdown(input.value);
    dropdown.style.display = 'block';
  };
  input.oninput = (event) => {
    renderDropdown(event.target.value);
    dropdown.style.display = 'block';
    selectedPatientId = null;
    selectedAdmissionDate = '';
    admissionDateInput.value = '';
  };
  document.addEventListener('click', (event) => {
    if (!input.contains(event.target) && !dropdown.contains(event.target)) {
      dropdown.style.display = 'none';
    }
  });

  input.dataset.getSelectedId = () => selectedPatientId;
  input.dataset.getSelectedAdmissionDate = () => selectedAdmissionDate;
}

function openCallMeetingModal() {
  const modal = document.getElementById('call_meeting_modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  document.getElementById('call_meeting_form')?.reset();
  document.getElementById('cm-admission-date').value = '';

  const dayInput = document.getElementById('cm-date');
  const monthInput = document.getElementById('call-meeting-month');
  if (dayInput && monthInput && monthInput.value) {
    const [year, month] = monthInput.value.split('-');
    dayInput.value = `${year}-${month}-01`;
  }

  fetchPatients().then(() => {
    setupCallMeetingPatientDropdown();
  });
}

async function saveCallMeetingEntry(event) {
  event.preventDefault();

  const name = document.getElementById('cm-name').value;
  const admissionDate = document.getElementById('cm-admission-date').value;
  const scheduledDate = document.getElementById('cm-date').value;
  const status = document.getElementById('cm-status').value;

  if (!admissionDate) {
    window.showToast('Please select a patient from the list.', true);
    return;
  }
  if (!scheduledDate) {
    window.showToast('Please select a date for this entry.', true);
    return;
  }

  const parsedDate = new Date(`${scheduledDate}T00:00:00`);
  const payload = {
    name,
    date_of_admission: admissionDate,
    day: parsedDate.getDate(),
    month: parsedDate.getMonth() + 1,
    year: parsedDate.getFullYear(),
    type: status,
    status,
  };

  const { response } = await window.apiFetchJson('/api/call_meeting_tracker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    document.getElementById('call_meeting_modal').classList.add('hidden');
    document.getElementById('call_meeting_modal').classList.remove('flex');
    window.showToast('Entry saved successfully!');
    await loadCallMeetingData();
  } else {
    window.showToast('Error saving entry. Please try again.', true);
  }
}

async function toggleCallMeeting(encodedName, day) {
  const name = decodeURIComponent(encodedName);
  const monthInput = document.getElementById('call-meeting-month');
  const today = new Date();
  const [yearStr, monthStr] = (
    monthInput && monthInput.value
      ? monthInput.value
      : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  ).split('-');
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);

  const meta = callMeetingMeta[name] || { days: {} };
  const existing = meta.days[day];
  const admissionDate = meta.date_of_admission || '';

  try {
    if (existing && existing.id) {
      const { response } = await window.apiFetchJson(`/api/call_meeting_tracker/${existing.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
    } else {
      const { response } = await window.apiFetchJson('/api/call_meeting_tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          date_of_admission: admissionDate,
          day,
          month,
          year,
          type: 'Meeting',
          status: 'Meeting',
        }),
      });
      if (!response.ok) throw new Error('Save failed');
    }
    await loadCallMeetingData();
  } catch (error) {
    console.error('Toggle call/meeting failed', error);
    window.showToast('Could not update entry. Please try again.', true);
  }
}

function printCallMeetingReport() {
  const table = document.getElementById('call-meeting-table');
  const monthValue = document.getElementById('call-meeting-month')?.value || '';
  if (!table) return;

  const popup = window.open('', '', 'width=1200,height=800');
  if (!popup) {
    window.showToast('Please allow pop-ups to print.', true);
    return;
  }

  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Call & Meeting Tracker</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
          th, td { border: 1px solid #d1d5db; padding: 6px; text-align: center; }
          th { background: #065f46; color: white; }
          td:first-child, th:first-child { text-align: left; width: 180px; }
        </style>
      </head>
      <body>
        <h1>Call & Meeting Tracker</h1>
        <p>${monthValue}</p>
        ${table.outerHTML}
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
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

  const reportMap = {};
  let activePatients = [];

  try {
    const patients = await fetchPatients();
    activePatients = Array.isArray(patients)
      ? patients.filter((patient) => !isPatientDischarged(patient.isDischarged))
      : [];
  } catch (error) {
    console.error('Patients load error', error);
    window.showToast('Unable to load patients for shift report.', true);
  }

  try {
    const { response, data } = await window.apiFetchJson(`/api/reports?date=${dateInput.value}`);
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to load report data.');
    }

    (data || []).forEach((report) => {
      reportMap[report.patient_id] = report.schedule || {};
    });
  } catch (error) {
    console.error('Report load error', error);
    window.showToast(error.message || 'Unable to load report data.', true);
  }

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
  const siteProfile = typeof window.getSiteProfile === 'function' ? window.getSiteProfile() : {};
  const profileName = escapeHtml(siteProfile.name || 'Pakistan Recovery Oasis');
  const profileSystemName = escapeHtml(siteProfile.system_name || siteProfile.short_name || 'PRO');
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
        <title>${profileSystemName} Daily Report</title>
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
          <h1>${profileName}</h1>
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

  if (dashboardState.currentUser.role === 'Admin') {
    await loadCallMeetingData();
  }

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
window.loadDailyReport = loadDailyReport;
window.printReport = printReport;
window.saveLayoutConfig = saveLayoutConfig;
window.openEmergencyModal = openEmergencyModal;
window.addEmergencyAlert = addEmergencyAlert;
window.closeAdmissionsModal = closeAdmissionsModal;
window.openCallMeetingModal = openCallMeetingModal;
window.saveCallMeetingEntry = saveCallMeetingEntry;
window.toggleCallMeeting = toggleCallMeeting;
window.loadCallMeetingData = loadCallMeetingData;
window.printCallMeetingReport = printCallMeetingReport;
window.updateDashboard = updateDashboard;
