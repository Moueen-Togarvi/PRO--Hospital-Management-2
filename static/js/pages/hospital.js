const hmsState = {
  section: window.__APP__?.hospitalSection || 'beds',
  patients: [],
  users: [],
  data: {},
  bedsView: 'beds',
  unbilledCharges: [],
  autoBilling: {
    patientId: '',
    discount: '0',
  },
  edit: {
    resourceKey: '',
    recordId: '',
  },
  selectedClinicalPatient: '',
  clinical: {
    vitals: [],
    nursingNotes: [],
    medicationAdministration: [],
  },
};

const HMS_TABS = [
  ['overview', 'Overview', 'fa-chart-line'],
  ['ipd', 'IPD / Beds', 'fa-bed'],
  ['clinical', 'Clinical', 'fa-notes-medical'],
];

function hmsEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hmsToday() {
  return new Date().toISOString().slice(0, 10);
}

function hmsMoney(value) {
  return `Rs ${new Intl.NumberFormat('en-PK').format(Number(value) || 0)}`;
}

function hmsDate(value) {
  if (!value) return '-';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return hmsEscape(value);
  return date.toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' });
}

function hmsStatusPill(status = 'Open') {
  const styles = {
    Waiting: 'border-amber-100 bg-amber-50 text-amber-800',
    'In Consultation': 'border-blue-100 bg-blue-50 text-blue-800',
    Completed: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    Cancelled: 'border-slate-200 bg-slate-100 text-slate-700',
    Admitted: 'border-blue-100 bg-blue-50 text-blue-800',
    Discharged: 'border-slate-200 bg-slate-100 text-slate-700',
    Available: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    Occupied: 'border-rose-100 bg-rose-50 text-rose-800',
    Ordered: 'border-amber-100 bg-amber-50 text-amber-800',
    Processing: 'border-blue-100 bg-blue-50 text-blue-800',
    'Sample Collected': 'border-purple-100 bg-purple-50 text-purple-800',
    Unpaid: 'border-red-100 bg-red-50 text-red-800',
    Partial: 'border-amber-100 bg-amber-50 text-amber-800',
    Paid: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  };
  return `<span class="inline-flex rounded-full border ${styles[status] || 'border-slate-200 bg-white text-slate-700'} px-2.5 py-1 text-[11px] font-black">${hmsEscape(status)}</span>`;
}

async function hmsFetchJson(url, options = {}, fallback = []) {
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => fallback);
    if (!res.ok) {
      console.error('HMS API error', url, data);
      return fallback;
    }
    return data;
  } catch (error) {
    console.error('HMS API fetch failed', url, error);
    return fallback;
  }
}

function hmsPatientName(patientId) {
  const patient = hmsState.patients.find((entry) => entry._id === patientId || entry.id === patientId);
  return patient?.name || patient?.patientName || patientId || '-';
}

function hmsUserName(userId) {
  const user = hmsState.users.find((entry) => entry._id === userId || entry.id === userId);
  return user?.name || user?.username || userId || '-';
}

function hmsMedicineName(medicineId) {
  const medicine = hmsState.data.medicines?.find((entry) => entry._id === medicineId);
  return medicine?.name || medicineId || '-';
}

function hmsServiceName(serviceId) {
  const service = hmsState.data.services?.find((entry) => entry._id === serviceId);
  return service?.name || serviceId || '-';
}

function hmsBedName(bedId) {
  const bed = hmsState.data.beds?.find((entry) => entry._id === bedId);
  return bed ? `${bed.bed_no || bed.name || bed.public_id} (${bed.status || 'Available'})` : (bedId || '-');
}

function hmsWardName(wardId) {
  const ward = hmsState.data.wards?.find((entry) => entry._id === wardId);
  return ward?.name || ward?.public_id || wardId || '-';
}

function hmsRoomName(roomId) {
  const room = hmsState.data.rooms?.find((entry) => entry._id === roomId);
  return room?.room_no || room?.public_id || roomId || '-';
}

function hmsPatientOptions(selected = '') {
  return `<option value="">Select patient</option>${hmsState.patients.map((patient) => {
    const id = patient._id || patient.id;
    return `<option value="${hmsEscape(id)}" ${id === selected ? 'selected' : ''}>${hmsEscape(patient.name || 'Unnamed Patient')}</option>`;
  }).join('')}`;
}

function hmsUserOptions(role, selected = '') {
  const users = hmsState.users.filter((user) => !role || user.role === role);
  const fallback = window.__APP__?.currentUser;
  const visibleUsers = users.length > 0 ? users : (fallback ? [{
    _id: fallback.user_id,
    name: fallback.display_name,
    role: fallback.role,
  }] : []);
  return `<option value="">Select ${role || 'user'}</option>${visibleUsers.map((user) => {
    const id = user._id || user.user_id;
    return `<option value="${hmsEscape(id)}" ${id === selected ? 'selected' : ''}>${hmsEscape(user.name || user.display_name || user.username || 'User')}</option>`;
  }).join('')}`;
}

function hmsOptions(items, labelFn, selected = '', empty = 'Select option') {
  return `<option value="">${empty}</option>${(items || []).map((item) => {
    const id = item._id || item.id;
    return `<option value="${hmsEscape(id)}" ${id === selected ? 'selected' : ''}>${hmsEscape(labelFn(item))}</option>`;
  }).join('')}`;
}

function hmsInput(label, name, options = {}) {
  const type = options.type || 'text';
  const value = options.value || '';
  const required = options.required ? 'required' : '';
  const placeholder = options.placeholder || label;
  const fieldClass = 'h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100';
  return `
    <label class="grid gap-1">
      <span class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">${hmsEscape(label)}</span>
      <input type="${type}" name="${name}" value="${hmsEscape(value)}" placeholder="${hmsEscape(placeholder)}" class="${fieldClass}" ${required}>
    </label>
  `;
}

function hmsTextarea(label, name, placeholder = '') {
  return `
    <label class="grid gap-1 md:col-span-2">
      <span class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">${hmsEscape(label)}</span>
      <textarea name="${name}" rows="3" placeholder="${hmsEscape(placeholder || label)}" class="resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"></textarea>
    </label>
  `;
}

function hmsSelect(label, name, optionsHtml, required = false) {
  return `
    <label class="grid gap-1">
      <span class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">${hmsEscape(label)}</span>
      <select name="${name}" class="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" ${required ? 'required' : ''}>
        ${optionsHtml}
      </select>
    </label>
  `;
}

function hmsCard(title, content, accent = 'slate') {
  const colors = {
    slate: 'border-slate-200 bg-white',
    emerald: 'border-emerald-100 bg-emerald-50/40',
    blue: 'border-blue-100 bg-blue-50/40',
    amber: 'border-amber-100 bg-amber-50/40',
    rose: 'border-rose-100 bg-rose-50/40',
  };
  return `
    <section class="rounded-2xl border ${colors[accent] || colors.slate} p-4 shadow-sm">
      <h3 class="mb-3 text-sm font-black uppercase tracking-[0.12em] text-slate-800">${hmsEscape(title)}</h3>
      ${content}
    </section>
  `;
}

function hmsForm(id, endpoint, fieldsHtml, buttonText = 'Save', extraAttrs = '') {
  return `
    <form id="${id}" ${extraAttrs} onsubmit="submitHmsForm(event, '${endpoint}')" class="grid gap-3 md:grid-cols-2">
      ${fieldsHtml}
      <div class="md:col-span-2">
        <button type="submit" class="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-800">
          <i class="fas fa-save text-xs"></i>
          ${hmsEscape(buttonText)}
        </button>
      </div>
    </form>
  `;
}

function hmsCreateButton(label, formKey, icon = 'fa-plus', tone = 'emerald') {
  const tones = {
    emerald: 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800',
    blue: 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800',
    amber: 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600',
    slate: 'border-slate-800 bg-slate-900 text-white hover:bg-slate-800',
  };
  return `<button type="button" data-hms-create="${hmsEscape(formKey)}" class="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black shadow-sm ${tones[tone] || tones.emerald}">
    <i class="fas ${icon} text-xs"></i>
    ${hmsEscape(label)}
  </button>`;
}

function hmsPageToolbar(title, subtitle, actions = []) {
  return `
    <div class="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h3 class="text-xl font-black text-slate-950">${hmsEscape(title)}</h3>
        <p class="text-sm font-semibold text-slate-600">${hmsEscape(subtitle)}</p>
      </div>
      ${actions.length ? `<div class="flex flex-wrap gap-2">${actions.join('')}</div>` : ''}
    </div>
  `;
}

function hmsSimpleStat(label, value, tone = 'slate') {
  const colors = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-100 bg-rose-50 text-rose-800',
  };
  return `
    <div class="rounded-xl border ${colors[tone] || colors.slate} px-4 py-3">
      <p class="text-[10px] font-black uppercase tracking-[0.12em]">${hmsEscape(label)}</p>
      <p class="mt-1 text-2xl font-black">${hmsEscape(value)}</p>
    </div>
  `;
}

function hmsPanelSection(title, content, actions = []) {
  return `
    <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h4 class="text-sm font-black uppercase tracking-[0.12em] text-slate-800">${hmsEscape(title)}</h4>
        ${actions.length ? `<div class="flex flex-wrap gap-2">${actions.join('')}</div>` : ''}
      </div>
      ${content}
    </section>
  `;
}

function hmsTable(rows, columns, emptyText = 'No records yet.') {
  if (!rows || rows.length === 0) {
    return `<div class="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-500">${hmsEscape(emptyText)}</div>`;
  }
  return `
    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table class="min-w-full divide-y divide-slate-100 text-sm">
        <thead class="bg-slate-900 text-white">
          <tr>${columns.map((column) => `<th class="whitespace-nowrap px-4 py-2 text-left text-[10px] font-black uppercase tracking-[0.12em]">${hmsEscape(column.label)}</th>`).join('')}</tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${rows.map((row) => `
            <tr class="hover:bg-slate-50">
              ${columns.map((column) => `<td class="whitespace-nowrap px-4 py-3 font-bold text-slate-800">${column.value(row)}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function hmsActions(actions) {
  return `<div class="flex flex-wrap gap-2">${actions.join('')}</div>`;
}

function hmsMiniButton(label, onclick, tone = 'slate') {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    blue: 'border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-100',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    red: 'border-red-100 bg-red-50 text-red-700 hover:bg-red-100',
  };
  return `<button type="button" onclick="${onclick}" class="inline-flex h-8 items-center rounded-lg border ${tones[tone] || tones.slate} px-3 text-xs font-black">${hmsEscape(label)}</button>`;
}

function hmsRecordActions(resourceKey, row, extraActions = []) {
  const config = HMS_RESOURCE_CONFIG[resourceKey];
  if (!config || !row?._id) return hmsActions(extraActions);
  const endpoint = resolveHmsEndpoint(config);
  return hmsActions([
    ...extraActions,
    hmsMiniButton('Edit', `openHmsEditModal('${resourceKey}', '${row._id}')`, 'blue'),
    hmsMiniButton('Delete', `deleteHmsRecord('${endpoint}/${row._id}')`, 'red'),
  ]);
}

function resolveHmsEndpoint(config) {
  return typeof config.endpoint === 'function' ? config.endpoint() : config.endpoint;
}

function resolveHmsCreateEndpoint(config) {
  return typeof config.endpoint === 'function' ? config.endpoint() : config.endpoint;
}

function hmsFieldHtml(field, value = '') {
  const required = field.required ? 'required' : '';
  const name = hmsEscape(field.name);
  const label = hmsEscape(field.label || field.name);
  const currentValue = value ?? '';
  const baseClass = 'h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100';

  if (field.type === 'textarea') {
    return `
      <label class="grid gap-1 md:col-span-2">
        <span class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">${label}</span>
        <textarea name="${name}" rows="3" class="resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100" ${required}>${hmsEscape(currentValue)}</textarea>
      </label>
    `;
  }

  if (field.type === 'select') {
    const options = typeof field.options === 'function' ? field.options() : (field.options || []);
    const optionsHtml = Array.isArray(options)
      ? options.map((option) => {
        const optionValue = typeof option === 'object' ? option.value : option;
        const optionLabel = typeof option === 'object' ? option.label : option;
        return `<option value="${hmsEscape(optionValue)}" ${String(optionValue) === String(currentValue) ? 'selected' : ''}>${hmsEscape(optionLabel)}</option>`;
      }).join('')
      : options;
    return `
      <label class="grid gap-1">
        <span class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">${label}</span>
        <select name="${name}" class="${baseClass} bg-white" ${required}>
          <option value="">Select</option>
          ${optionsHtml}
        </select>
      </label>
    `;
  }

  return `
    <label class="grid gap-1">
      <span class="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">${label}</span>
      <input type="${field.type || 'text'}" name="${name}" value="${hmsEscape(currentValue)}" class="${baseClass}" ${required}>
    </label>
  `;
}

function hmsPatientSelectOptions() {
  return hmsState.patients.map((patient) => ({ value: patient._id || patient.id, label: patient.name || 'Unnamed Patient' }));
}

function hmsDoctorSelectOptions() {
  return hmsState.users
    .filter((user) => user.role === 'Doctor')
    .map((user) => ({ value: user._id || user.id, label: user.name || user.username || 'Doctor' }));
}

function hmsOptionsFromData(key, labelFn) {
  return (hmsState.data[key] || []).map((item) => ({ value: item._id, label: labelFn(item) }));
}

const HMS_RESOURCE_CONFIG = {
  appointment: {
    title: 'Edit Appointment',
    listKey: 'appointments',
    endpoint: '/api/appointments',
    fields: () => [
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'doctor_id', label: 'Doctor', type: 'select', options: hmsDoctorSelectOptions },
      { name: 'doctor_name', label: 'Doctor Name' },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'time', label: 'Time', type: 'time' },
      { name: 'status', label: 'Status', type: 'select', options: ['Waiting', 'In Consultation', 'Completed', 'Cancelled'] },
      { name: 'reason', label: 'Reason', type: 'textarea' },
    ],
  },
  opdVisit: {
    title: 'Edit OPD Visit',
    listKey: 'opdVisits',
    endpoint: '/api/opd-visits',
    fields: () => [
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'doctor_id', label: 'Doctor', type: 'select', options: hmsDoctorSelectOptions },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'service_name', label: 'Service Name' },
      { name: 'billable_amount', label: 'Billable Amount', type: 'number' },
      { name: 'complaint', label: 'Complaint', type: 'textarea' },
      { name: 'diagnosis', label: 'Diagnosis / Notes', type: 'textarea' },
      { name: 'prescription', label: 'Prescription', type: 'textarea' },
      { name: 'follow_up_date', label: 'Follow Up', type: 'date' },
    ],
  },
  ward: {
    title: 'Edit Ward',
    listKey: 'wards',
    endpoint: '/api/wards',
    fields: () => [
      { name: 'name', label: 'Ward Name', required: true },
      { name: 'type', label: 'Type' },
    ],
  },
  room: {
    title: 'Edit Room',
    listKey: 'rooms',
    endpoint: '/api/rooms',
    fields: () => [
      { name: 'ward_id', label: 'Ward', type: 'select', options: () => hmsOptionsFromData('wards', (item) => item.name || item.public_id), required: true },
      { name: 'room_no', label: 'Room No', required: true },
      { name: 'type', label: 'Type' },
    ],
  },
  bed: {
    title: 'Edit Bed',
    listKey: 'beds',
    endpoint: '/api/beds',
    fields: () => [
      { name: 'ward_id', label: 'Ward', type: 'select', options: () => hmsOptionsFromData('wards', (item) => item.name || item.public_id), required: true },
      { name: 'room_id', label: 'Room', type: 'select', options: () => hmsOptionsFromData('rooms', (item) => item.room_no || item.public_id) },
      { name: 'bed_no', label: 'Bed No', required: true },
      { name: 'status', label: 'Status', type: 'select', options: ['Available', 'Occupied', 'Maintenance'] },
    ],
  },
  ipdAdmission: {
    title: 'Edit IPD Admission',
    listKey: 'ipdAdmissions',
    endpoint: '/api/ipd-admissions',
    fields: () => [
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'bed_id', label: 'Bed', type: 'select', options: () => hmsOptionsFromData('beds', (item) => `${item.bed_no || item.public_id} - ${item.status || 'Available'}`) },
      { name: 'status', label: 'Status', type: 'select', options: ['Admitted', 'Discharged'] },
      { name: 'admission_date', label: 'Admission Date', type: 'date' },
      { name: 'discharge_date', label: 'Discharge Date', type: 'date' },
      { name: 'room_rate', label: 'Room Rate', type: 'number' },
      { name: 'admission_charge', label: 'Admission Charge', type: 'number' },
      { name: 'room_charged_until', label: 'Room Charged Until', type: 'date' },
      { name: 'consultant', label: 'Consultant' },
      { name: 'reason', label: 'Reason', type: 'textarea' },
    ],
  },
  bedTransfer: {
    title: 'Edit Bed Transfer',
    listKey: 'bedTransfers',
    endpoint: '/api/bed-transfers',
    fields: () => [
      { name: 'admission_id', label: 'Admission', type: 'select', options: () => hmsOptionsFromData('ipdAdmissions', (item) => `${item.ipd_no || item.public_id} - ${hmsPatientName(item.patient_id)}`) },
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'from_bed_id', label: 'From Bed', type: 'select', options: () => hmsOptionsFromData('beds', (item) => `${item.bed_no || item.public_id} - ${item.status || 'Available'}`) },
      { name: 'to_bed_id', label: 'To Bed', type: 'select', options: () => hmsOptionsFromData('beds', (item) => `${item.bed_no || item.public_id} - ${item.status || 'Available'}`) },
      { name: 'transfer_date', label: 'Transfer Date', type: 'date' },
      { name: 'reason', label: 'Reason' },
    ],
  },
  vital: {
    title: 'Edit Vitals',
    listKey: 'clinical.vitals',
    endpoint: () => `/api/patients/${hmsState.selectedClinicalPatient}/vitals`,
    fields: () => [
      { name: 'bp', label: 'BP' },
      { name: 'pulse', label: 'Pulse' },
      { name: 'temperature', label: 'Temperature' },
      { name: 'spo2', label: 'SpO2' },
      { name: 'weight', label: 'Weight' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  nursingNote: {
    title: 'Edit Nursing Note',
    listKey: 'clinical.nursingNotes',
    endpoint: () => `/api/patients/${hmsState.selectedClinicalPatient}/nursing-notes`,
    fields: () => [
      { name: 'shift', label: 'Shift' },
      { name: 'nurse_name', label: 'Nurse' },
      { name: 'note', label: 'Note', type: 'textarea' },
    ],
  },
  mar: {
    title: 'Edit Medication Administration',
    listKey: 'clinical.medicationAdministration',
    endpoint: () => `/api/patients/${hmsState.selectedClinicalPatient}/medication-administration`,
    fields: () => [
      { name: 'medicine_name', label: 'Medicine', required: true },
      { name: 'dose', label: 'Dose' },
      { name: 'route', label: 'Route' },
      { name: 'given_at', label: 'Given At', type: 'datetime-local' },
      { name: 'given_by', label: 'Given By' },
      { name: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  labTest: {
    title: 'Edit Lab Test',
    listKey: 'labTests',
    endpoint: '/api/lab/tests',
    fields: () => [
      { name: 'name', label: 'Test Name', required: true },
      { name: 'category', label: 'Category' },
      { name: 'price', label: 'Price', type: 'number' },
    ],
  },
  labOrder: {
    title: 'Edit Lab Order',
    listKey: 'labOrders',
    endpoint: '/api/lab/orders',
    fields: () => [
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'test_id', label: 'Test', type: 'select', options: () => hmsOptionsFromData('labTests', (item) => `${item.name || item.public_id} - ${hmsMoney(item.price)}`) },
      { name: 'status', label: 'Status', type: 'select', options: ['Ordered', 'Sample Collected', 'Processing', 'Completed', 'Cancelled'] },
      { name: 'source', label: 'Source', type: 'select', options: ['OPD', 'IPD'] },
      { name: 'test_name', label: 'Test Name' },
      { name: 'billable_amount', label: 'Billable Amount', type: 'number' },
      { name: 'result', label: 'Result', type: 'textarea' },
    ],
  },
  radiologyOrder: {
    title: 'Edit Radiology Order',
    listKey: 'radiologyOrders',
    endpoint: '/api/radiology/orders',
    fields: () => [
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'study_name', label: 'Study', required: true },
      { name: 'modality', label: 'Modality', type: 'select', options: ['X-Ray', 'Ultrasound', 'CT', 'MRI'] },
      { name: 'status', label: 'Status', type: 'select', options: ['Ordered', 'Processing', 'Completed', 'Cancelled'] },
      { name: 'billable_amount', label: 'Billable Amount', type: 'number' },
      { name: 'clinical_notes', label: 'Clinical Notes', type: 'textarea' },
    ],
  },
  radiologyReport: {
    title: 'Edit Radiology Report',
    listKey: 'radiologyReports',
    endpoint: '/api/radiology/reports',
    fields: () => [
      { name: 'order_id', label: 'Order', type: 'select', options: () => hmsOptionsFromData('radiologyOrders', (item) => `${item.study_name || item.public_id} - ${hmsPatientName(item.patient_id)}`) },
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'report_url', label: 'Report URL' },
      { name: 'report_text', label: 'Report Text', type: 'textarea' },
    ],
  },
  medicine: {
    title: 'Edit Medicine',
    listKey: 'medicines',
    endpoint: '/api/pharmacy/medicines',
    fields: () => [
      { name: 'name', label: 'Medicine Name', required: true },
      { name: 'category', label: 'Category' },
      { name: 'stock', label: 'Stock', type: 'number' },
      { name: 'purchase_price', label: 'Purchase Price', type: 'number' },
      { name: 'sale_price', label: 'Sale Price', type: 'number' },
    ],
  },
  batch: {
    title: 'Edit Batch',
    listKey: 'batches',
    endpoint: '/api/pharmacy/batches',
    fields: () => [
      { name: 'medicine_id', label: 'Medicine', type: 'select', options: () => hmsOptionsFromData('medicines', (item) => `${item.name || item.public_id} - Stock ${item.stock || 0}`), required: true },
      { name: 'batch_no', label: 'Batch No', required: true },
      { name: 'expiry_date', label: 'Expiry', type: 'date' },
      { name: 'quantity', label: 'Quantity', type: 'number' },
    ],
  },
  dispense: {
    title: 'Edit Dispense',
    listKey: 'dispenses',
    endpoint: '/api/pharmacy/dispense',
    fields: () => [
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'medicine_id', label: 'Medicine', type: 'select', options: () => hmsOptionsFromData('medicines', (item) => `${item.name || item.public_id} - Stock ${item.stock || 0}`), required: true },
      { name: 'batch_id', label: 'Batch', type: 'select', options: () => hmsOptionsFromData('batches', (item) => `${item.batch_no || item.public_id} - Rem ${item.remaining || item.quantity || 0}`) },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true },
      { name: 'sale_price', label: 'Sale Price', type: 'number' },
      { name: 'billable_amount', label: 'Billable Amount', type: 'number' },
      { name: 'instructions', label: 'Instructions' },
    ],
  },
  service: {
    title: 'Edit Service',
    listKey: 'services',
    endpoint: '/api/services',
    fields: () => [
      { name: 'name', label: 'Service Name', required: true },
      { name: 'category', label: 'Category', type: 'select', options: ['OPD', 'IPD', 'Lab', 'Radiology', 'Pharmacy', 'Room', 'Other'] },
      { name: 'price', label: 'Price', type: 'number', required: true },
    ],
  },
  invoice: {
    title: 'Edit Invoice',
    listKey: 'invoices',
    endpoint: '/api/invoices',
    fields: () => [
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'source', label: 'Source' },
      { name: 'discount_amount', label: 'Discount', type: 'number' },
      { name: 'paid_amount', label: 'Paid Amount', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: ['Unpaid', 'Partial', 'Paid'] },
    ],
  },
  refund: {
    title: 'Edit Refund',
    listKey: 'refunds',
    endpoint: '/api/refunds',
    fields: () => [
      { name: 'invoice_id', label: 'Invoice', type: 'select', options: () => hmsOptionsFromData('invoices', (item) => `${item.invoice_no || item.public_id} - ${hmsPatientName(item.patient_id)}`) },
      { name: 'patient_id', label: 'Patient', type: 'select', options: hmsPatientSelectOptions, required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      { name: 'status', label: 'Status', type: 'select', options: ['Pending', 'Approved', 'Rejected'] },
      { name: 'reason', label: 'Reason' },
    ],
  },
  cashClosing: {
    title: 'Edit Cash Closing',
    listKey: 'cashClosings',
    endpoint: '/api/cash-closing',
    fields: () => [
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'cash_total', label: 'Cash Total', type: 'number' },
      { name: 'card_total', label: 'Card Total', type: 'number' },
      { name: 'online_total', label: 'Online Total', type: 'number' },
      { name: 'expense_total', label: 'Expenses', type: 'number' },
      { name: 'closed_by', label: 'Closed By' },
    ],
  },
};

const HMS_CREATE_CONFIG = {
  ward: {
    title: 'Add Ward',
    help: 'Create one ward with a clear name and type.',
    endpoint: '/api/wards',
    form: () => hmsForm('hms-create-ward-form', '/api/wards', `
      ${hmsInput('Ward Name', 'name', { required: true })}
      ${hmsInput('Type', 'type', { placeholder: 'General / ICU / Private' })}
    `, 'Add Ward'),
  },
  room: {
    title: 'Add Room',
    help: 'Choose ward, then add room number and type.',
    endpoint: '/api/rooms',
    form: () => hmsForm('hms-create-room-form', '/api/rooms', `
      ${hmsSelect('Ward', 'ward_id', hmsOptions(hmsState.data.wards || [], (item) => item.name || item.public_id), true)}
      ${hmsInput('Room No', 'room_no', { required: true })}
      ${hmsInput('Type', 'type', { placeholder: 'Private / Shared' })}
    `, 'Add Room'),
  },
  bed: {
    title: 'Add Bed',
    help: 'Add a bed under the correct ward and room.',
    endpoint: '/api/beds',
    form: () => hmsForm('hms-create-bed-form', '/api/beds', `
      ${hmsSelect('Ward', 'ward_id', hmsOptions(hmsState.data.wards || [], (item) => item.name || item.public_id), true)}
      ${hmsSelect('Room', 'room_id', hmsOptions(hmsState.data.rooms || [], (item) => item.room_no || item.public_id))}
      ${hmsInput('Bed No', 'bed_no', { required: true })}
      ${hmsSelect('Status', 'status', ['Available', 'Occupied', 'Maintenance'].map((status) => `<option value="${status}">${status}</option>`).join(''))}
    `, 'Add Bed'),
  },
  admission: {
    title: 'Admit Patient',
    help: 'Select patient and available bed, then save the IPD admission.',
    endpoint: '/api/ipd-admissions',
    form: () => {
      const availableBeds = (hmsState.data.beds || []).filter((bed) => bed.status !== 'Occupied');
      return hmsForm('hms-create-admission-form', '/api/ipd-admissions', `
        ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
        ${hmsSelect('Bed', 'bed_id', hmsOptions(availableBeds, (item) => `${item.bed_no || item.public_id} - ${item.status || 'Available'}`), true)}
        ${hmsInput('Admission Date', 'admission_date', { type: 'date', value: hmsToday() })}
        ${hmsInput('Consultant', 'consultant')}
        ${hmsInput('Room Rate / Day', 'room_rate', { type: 'number', value: '0' })}
        ${hmsInput('Admission Charge', 'admission_charge', { type: 'number', value: '0' })}
        ${hmsTextarea('Reason', 'reason')}
      `, 'Admit Patient');
    },
  },
  transfer: {
    title: 'Transfer Bed',
    help: 'Move an admitted patient from one bed to another.',
    endpoint: '/api/bed-transfers',
    form: () => {
      const availableBeds = (hmsState.data.beds || []).filter((bed) => bed.status !== 'Occupied');
      return hmsForm('hms-create-transfer-form', '/api/bed-transfers', `
        ${hmsSelect('Admission', 'admission_id', hmsOptions(hmsState.data.ipdAdmissions || [], (item) => `${item.ipd_no || item.public_id} - ${hmsPatientName(item.patient_id)}`), true)}
        ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
        ${hmsSelect('From Bed', 'from_bed_id', hmsOptions(hmsState.data.beds || [], (item) => `${item.bed_no || item.public_id} - ${item.status || 'Available'}`))}
        ${hmsSelect('To Bed', 'to_bed_id', hmsOptions(availableBeds, (item) => `${item.bed_no || item.public_id} - ${item.status || 'Available'}`), true)}
        ${hmsInput('Transfer Date', 'transfer_date', { type: 'date', value: hmsToday() })}
        ${hmsInput('Reason', 'reason')}
      `, 'Transfer Bed');
    },
  },
  vital: {
    title: 'Add Vitals',
    help: 'Record current vitals for the selected patient.',
    endpoint: () => `/api/patients/${hmsState.selectedClinicalPatient}/vitals`,
    form: () => hmsForm('hms-create-vitals-form', `/api/patients/${hmsState.selectedClinicalPatient}/vitals`, `
      ${hmsInput('BP', 'bp', { placeholder: '120/80' })}
      ${hmsInput('Pulse', 'pulse')}
      ${hmsInput('Temperature', 'temperature')}
      ${hmsInput('SpO2', 'spo2')}
      ${hmsInput('Weight', 'weight')}
      ${hmsTextarea('Notes', 'notes')}
    `, 'Add Vitals'),
  },
  nursingNote: {
    title: 'Add Nursing Note',
    help: 'Record shift notes for the selected patient.',
    endpoint: () => `/api/patients/${hmsState.selectedClinicalPatient}/nursing-notes`,
    form: () => hmsForm('hms-create-nursing-form', `/api/patients/${hmsState.selectedClinicalPatient}/nursing-notes`, `
      ${hmsInput('Shift', 'shift', { placeholder: 'Morning / Evening / Night' })}
      ${hmsInput('Nurse', 'nurse_name', { value: window.__APP__?.currentUser?.display_name || '' })}
      ${hmsTextarea('Nursing Note', 'note')}
    `, 'Add Nursing Note'),
  },
  mar: {
    title: 'Record Medication',
    help: 'Record administered medication for the selected patient.',
    endpoint: () => `/api/patients/${hmsState.selectedClinicalPatient}/medication-administration`,
    form: () => hmsForm('hms-create-mar-form', `/api/patients/${hmsState.selectedClinicalPatient}/medication-administration`, `
      ${hmsInput('Medicine', 'medicine_name', { required: true })}
      ${hmsInput('Dose', 'dose')}
      ${hmsInput('Route', 'route', { placeholder: 'Oral / IV / IM' })}
      ${hmsInput('Given At', 'given_at', { type: 'datetime-local' })}
      ${hmsInput('Given By', 'given_by', { value: window.__APP__?.currentUser?.display_name || '' })}
      ${hmsTextarea('Remarks', 'remarks')}
    `, 'Record Medication'),
  },
};

async function loadHospitalReferences() {
  const [patients, users] = await Promise.all([
    hmsFetchJson('/api/patients', {}, []),
    hmsFetchJson('/api/users', {}, []),
  ]);
  hmsState.patients = patients;
  hmsState.users = users;
}

async function loadClinicalRecords(patientId) {
  if (!patientId) {
    hmsState.clinical = { vitals: [], nursingNotes: [], medicationAdministration: [] };
    return;
  }
  const [vitals, nursingNotes, medicationAdministration] = await Promise.all([
    hmsFetchJson(`/api/patients/${patientId}/vitals`, {}, []),
    hmsFetchJson(`/api/patients/${patientId}/nursing-notes`, {}, []),
    hmsFetchJson(`/api/patients/${patientId}/medication-administration`, {}, []),
  ]);
  hmsState.clinical = { vitals, nursingNotes, medicationAdministration };
}

async function loadHospitalData() {
  const endpoints = {
    summary: '/api/hms/summary',
    wards: '/api/wards',
    rooms: '/api/rooms',
    beds: '/api/beds',
    ipdAdmissions: '/api/ipd-admissions',
    bedTransfers: '/api/bed-transfers',
  };

  const results = await Promise.all(Object.values(endpoints).map((url) => hmsFetchJson(url, {}, Array.isArray(url) ? [] : [])));
  hmsState.data = Object.fromEntries(Object.keys(endpoints).map((key, index) => [key, results[index]]));
}

function renderHospitalSummary() {
  const summary = hmsState.data.summary || {};
  const values = {
    'hms-stat-ipd': summary.activeIpd || 0,
    'hms-stat-beds': summary.availableBeds || 0,
    'hms-stat-occupied': summary.occupiedBeds || 0,
  };
  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

function renderHospitalTabs() {
  const container = document.getElementById('hospital-tabs');
  if (!container) return;
  container.innerHTML = HMS_TABS.map(([key, label, icon]) => {
    const active = hmsState.tab === key;
    return `
      <button type="button" onclick="switchHospitalTab('${key}')" class="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black ${active ? 'border-emerald-200 bg-emerald-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}">
        <i class="fas ${icon} text-xs"></i>
        ${hmsEscape(label)}
      </button>
    `;
  }).join('');
}

function renderOverview() {
  const activeIpd = (hmsState.data.ipdAdmissions || []).filter((row) => row.status !== 'Discharged').slice(0, 8);
  const beds = hmsState.data.beds || [];
  return `
    <div class="grid gap-4 xl:grid-cols-2">
      ${hmsCard('Current IPD Patients', hmsTable(activeIpd, [
        { label: 'IPD', value: (row) => hmsEscape(row.ipd_no || row.public_id) },
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Bed', value: (row) => hmsEscape(hmsBedName(row.bed_id)) },
        { label: 'Status', value: (row) => hmsStatusPill(row.status) },
      ]), 'amber')}
      ${hmsCard('Bed Status', hmsTable(beds.slice(0, 12), [
        { label: 'Bed', value: (row) => hmsEscape(row.bed_no || row.public_id) },
        { label: 'Ward', value: (row) => hmsEscape(hmsWardName(row.ward_id)) },
        { label: 'Room', value: (row) => hmsEscape(hmsRoomName(row.room_id)) },
        { label: 'Status', value: (row) => hmsStatusPill(row.status) },
      ]), 'blue')}
    </div>
  `;
}

function renderOpd() {
  const appointmentForm = hmsForm('hms-appointment-form', '/api/appointments', `
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsSelect('Doctor', 'doctor_id', hmsUserOptions('Doctor'))}
    ${hmsInput('Doctor Name', 'doctor_name', { placeholder: 'Optional manual name' })}
    ${hmsInput('Date', 'date', { type: 'date', value: hmsToday(), required: true })}
    ${hmsInput('Time', 'time', { type: 'time' })}
    ${hmsInput('Reason', 'reason')}
  `, 'Book Appointment');

  const opdForm = hmsForm('hms-opd-form', '/api/opd-visits', `
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsSelect('Appointment', 'appointment_id', hmsOptions(hmsState.data.appointments || [], (item) => `${item.appointment_no || item.public_id} - ${hmsPatientName(item.patient_id)}`))}
    ${hmsSelect('Doctor', 'doctor_id', hmsUserOptions('Doctor'))}
    ${hmsInput('Date', 'date', { type: 'date', value: hmsToday() })}
    ${hmsInput('Service Name', 'service_name', { value: 'OPD Consultation' })}
    ${hmsInput('Billable Amount', 'billable_amount', { type: 'number', value: '0' })}
    ${hmsTextarea('Complaint', 'complaint')}
    ${hmsTextarea('Diagnosis / Notes', 'diagnosis')}
    ${hmsTextarea('Prescription', 'prescription')}
    ${hmsInput('Follow Up', 'follow_up_date', { type: 'date' })}
  `, 'Complete OPD Visit');

  const scheduleForm = hmsForm('hms-schedule-form', '/api/doctors/schedule', `
    ${hmsSelect('Doctor', 'doctor_id', hmsUserOptions('Doctor'), true)}
    ${hmsSelect('Weekday', 'weekday', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => `<option value="${day}">${day}</option>`).join(''))}
    ${hmsInput('Start Time', 'start_time', { type: 'time', required: true })}
    ${hmsInput('End Time', 'end_time', { type: 'time', required: true })}
    ${hmsInput('Room', 'room')}
  `, 'Save Schedule');

  const appointmentsTable = hmsTable(hmsState.data.appointments || [], [
    { label: 'Token', value: (row) => `#${hmsEscape(row.token_number || '-')}` },
    { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
    { label: 'Doctor', value: (row) => hmsEscape(row.doctor_name || hmsUserName(row.doctor_id)) },
    { label: 'Date', value: (row) => hmsDate(row.date) },
    { label: 'Status', value: (row) => hmsStatusPill(row.status) },
    {
      label: 'Actions',
      value: (row) => hmsRecordActions('appointment', row, [
        hmsMiniButton('Consult', `updateHmsRecord('/api/appointments/${row._id}', { status: 'In Consultation' })`, 'blue'),
        hmsMiniButton('Done', `updateHmsRecord('/api/appointments/${row._id}', { status: 'Completed' })`, 'emerald'),
        hmsMiniButton('Cancel', `updateHmsRecord('/api/appointments/${row._id}', { status: 'Cancelled' })`, 'red'),
      ]),
    },
  ]);

  const visitsTable = hmsTable(hmsState.data.opdVisits || [], [
    { label: 'Visit', value: (row) => hmsEscape(row.visit_no || row.public_id) },
    { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
    { label: 'Doctor', value: (row) => hmsEscape(hmsUserName(row.doctor_id)) },
    { label: 'Date', value: (row) => hmsDate(row.date) },
    { label: 'Fee', value: (row) => hmsMoney(row.billable_amount) },
    { label: 'Diagnosis', value: (row) => hmsEscape(row.diagnosis || '-') },
    { label: 'Actions', value: (row) => hmsRecordActions('opdVisit', row) },
  ]);

  return `
    <div class="grid gap-4 xl:grid-cols-3">
      ${hmsCard('Book Appointment', appointmentForm, 'emerald')}
      ${hmsCard('OPD Visit', opdForm, 'blue')}
      ${hmsCard('Doctor Schedule', scheduleForm, 'slate')}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsCard('Appointments', appointmentsTable)}
      ${hmsCard('OPD Visits', visitsTable)}
    </div>
  `;
}

function renderIpd() {
  const wardForm = hmsForm('hms-ward-form', '/api/wards', `
    ${hmsInput('Ward Name', 'name', { required: true })}
    ${hmsInput('Type', 'type', { placeholder: 'General / ICU / Private' })}
  `, 'Add Ward');

  const roomForm = hmsForm('hms-room-form', '/api/rooms', `
    ${hmsSelect('Ward', 'ward_id', hmsOptions(hmsState.data.wards || [], (item) => item.name || item.public_id), true)}
    ${hmsInput('Room No', 'room_no', { required: true })}
    ${hmsInput('Type', 'type', { placeholder: 'Private / Shared' })}
  `, 'Add Room');

  const bedForm = hmsForm('hms-bed-form', '/api/beds', `
    ${hmsSelect('Ward', 'ward_id', hmsOptions(hmsState.data.wards || [], (item) => item.name || item.public_id), true)}
    ${hmsSelect('Room', 'room_id', hmsOptions(hmsState.data.rooms || [], (item) => item.room_no || item.public_id))}
    ${hmsInput('Bed No', 'bed_no', { required: true })}
    ${hmsSelect('Status', 'status', ['Available', 'Occupied', 'Maintenance'].map((status) => `<option value="${status}">${status}</option>`).join(''))}
  `, 'Add Bed');

  const availableBeds = (hmsState.data.beds || []).filter((bed) => bed.status !== 'Occupied');
  const admissionForm = hmsForm('hms-ipd-form', '/api/ipd-admissions', `
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsSelect('Bed', 'bed_id', hmsOptions(availableBeds, (item) => `${item.bed_no || item.public_id} - ${item.status || 'Available'}`), true)}
    ${hmsInput('Admission Date', 'admission_date', { type: 'date', value: hmsToday() })}
    ${hmsInput('Consultant', 'consultant')}
    ${hmsInput('Room Rate / Day', 'room_rate', { type: 'number', value: '0' })}
    ${hmsInput('Admission Charge', 'admission_charge', { type: 'number', value: '0' })}
    ${hmsTextarea('Reason', 'reason')}
  `, 'Admit Patient');

  const transferForm = hmsForm('hms-transfer-form', '/api/bed-transfers', `
    ${hmsSelect('Admission', 'admission_id', hmsOptions(hmsState.data.ipdAdmissions || [], (item) => `${item.ipd_no || item.public_id} - ${hmsPatientName(item.patient_id)}`), true)}
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsSelect('From Bed', 'from_bed_id', hmsOptions(hmsState.data.beds || [], (item) => `${item.bed_no || item.public_id} - ${item.status || 'Available'}`))}
    ${hmsSelect('To Bed', 'to_bed_id', hmsOptions(availableBeds, (item) => `${item.bed_no || item.public_id} - ${item.status || 'Available'}`), true)}
    ${hmsInput('Transfer Date', 'transfer_date', { type: 'date', value: hmsToday() })}
    ${hmsInput('Reason', 'reason')}
  `, 'Transfer Bed');

  const bedTable = hmsTable(hmsState.data.beds || [], [
    { label: 'Bed', value: (row) => hmsEscape(row.bed_no || row.public_id) },
    { label: 'Ward', value: (row) => hmsEscape((hmsState.data.wards || []).find((ward) => ward._id === row.ward_id)?.name || '-') },
    { label: 'Room', value: (row) => hmsEscape((hmsState.data.rooms || []).find((room) => room._id === row.room_id)?.room_no || '-') },
    { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
    { label: 'Status', value: (row) => hmsStatusPill(row.status || 'Available') },
    { label: 'Actions', value: (row) => hmsRecordActions('bed', row) },
  ]);

  const admissionTable = hmsTable(hmsState.data.ipdAdmissions || [], [
    { label: 'IPD', value: (row) => hmsEscape(row.ipd_no || row.public_id) },
    { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
    { label: 'Bed', value: (row) => hmsEscape(hmsBedName(row.bed_id)) },
    { label: 'Date', value: (row) => hmsDate(row.admission_date) },
    { label: 'Room Rate', value: (row) => hmsMoney(row.room_rate) },
    { label: 'Status', value: (row) => hmsStatusPill(row.status) },
    { label: 'Actions', value: (row) => hmsRecordActions('ipdAdmission', row, row.status === 'Discharged' ? [] : [hmsMiniButton('Discharge', `updateHmsRecord('/api/ipd-admissions/${row._id}', { status: 'Discharged' })`, 'red')]) },
  ]);

  const wardsTable = hmsTable(hmsState.data.wards || [], [
    { label: 'Ward', value: (row) => hmsEscape(row.name || row.public_id) },
    { label: 'Type', value: (row) => hmsEscape(row.type || '-') },
    { label: 'Actions', value: (row) => hmsRecordActions('ward', row) },
  ]);

  const roomsTable = hmsTable(hmsState.data.rooms || [], [
    { label: 'Room', value: (row) => hmsEscape(row.room_no || row.public_id) },
    { label: 'Ward', value: (row) => hmsEscape((hmsState.data.wards || []).find((ward) => ward._id === row.ward_id)?.name || '-') },
    { label: 'Type', value: (row) => hmsEscape(row.type || '-') },
    { label: 'Actions', value: (row) => hmsRecordActions('room', row) },
  ]);

  const transfersTable = hmsTable(hmsState.data.bedTransfers || [], [
    { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
    { label: 'From', value: (row) => hmsEscape(hmsBedName(row.from_bed_id)) },
    { label: 'To', value: (row) => hmsEscape(hmsBedName(row.to_bed_id)) },
    { label: 'Date', value: (row) => hmsDate(row.transfer_date) },
    { label: 'Actions', value: (row) => hmsRecordActions('bedTransfer', row) },
  ]);

  return `
    <div class="grid gap-4 xl:grid-cols-3">
      ${hmsCard('Ward', wardForm)}
      ${hmsCard('Room', roomForm)}
      ${hmsCard('Bed', bedForm)}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsCard('IPD Admission', admissionForm, 'blue')}
      ${hmsCard('Bed Transfer', transferForm, 'amber')}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsCard('Bed Occupancy', bedTable)}
      ${hmsCard('IPD Admissions', admissionTable)}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      ${hmsCard('Wards', wardsTable)}
      ${hmsCard('Rooms', roomsTable)}
      ${hmsCard('Transfers', transfersTable)}
    </div>
  `;
}

function renderClinical() {
  const selected = hmsState.selectedClinicalPatient;
  const patientPicker = `
    <div class="mb-4 grid gap-3 rounded-2xl border border-emerald-100 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto]">
      ${hmsSelect('Patient', 'clinical_patient', hmsPatientOptions(selected), true).replace('<select', '<select onchange="selectClinicalPatient(this.value)"')}
      <button type="button" onclick="selectClinicalPatient(document.querySelector('[name=clinical_patient]').value)" class="h-10 self-end rounded-xl bg-emerald-700 px-4 text-sm font-black text-white">Load Records</button>
    </div>
  `;

  if (!selected) {
    return `${patientPicker}<div class="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm font-bold text-slate-500">Select a patient to add vitals, nursing notes, and medication administration records.</div>`;
  }

  const vitalsForm = hmsForm('hms-vitals-form', `/api/patients/${selected}/vitals`, `
    ${hmsInput('BP', 'bp', { placeholder: '120/80' })}
    ${hmsInput('Pulse', 'pulse')}
    ${hmsInput('Temperature', 'temperature')}
    ${hmsInput('SpO2', 'spo2')}
    ${hmsInput('Weight', 'weight')}
    ${hmsTextarea('Notes', 'notes')}
  `, 'Add Vitals');

  const nursingForm = hmsForm('hms-nursing-form', `/api/patients/${selected}/nursing-notes`, `
    ${hmsInput('Shift', 'shift', { placeholder: 'Morning / Evening / Night' })}
    ${hmsInput('Nurse', 'nurse_name', { value: window.__APP__?.currentUser?.display_name || '' })}
    ${hmsTextarea('Nursing Note', 'note')}
  `, 'Add Nursing Note');

  const marForm = hmsForm('hms-mar-form', `/api/patients/${selected}/medication-administration`, `
    ${hmsInput('Medicine', 'medicine_name', { required: true })}
    ${hmsInput('Dose', 'dose')}
    ${hmsInput('Route', 'route', { placeholder: 'Oral / IV / IM' })}
    ${hmsInput('Given At', 'given_at', { type: 'datetime-local' })}
    ${hmsInput('Given By', 'given_by', { value: window.__APP__?.currentUser?.display_name || '' })}
    ${hmsTextarea('Remarks', 'remarks')}
  `, 'Record Medication');

  return `
    ${patientPicker}
    <div class="grid gap-4 xl:grid-cols-3">
      ${hmsCard('Vitals Chart', vitalsForm, 'emerald')}
      ${hmsCard('Nursing Note', nursingForm, 'blue')}
      ${hmsCard('Medication Administration', marForm, 'amber')}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      ${hmsCard('Vitals History', hmsTable(hmsState.clinical.vitals, [
        { label: 'Date', value: (row) => hmsDate(row.created_at || row.date) },
        { label: 'BP', value: (row) => hmsEscape(row.bp || '-') },
        { label: 'Pulse', value: (row) => hmsEscape(row.pulse || '-') },
        { label: 'Temp', value: (row) => hmsEscape(row.temperature || '-') },
        { label: 'Actions', value: (row) => hmsRecordActions('vital', row) },
      ]))}
      ${hmsCard('Nursing Notes', hmsTable(hmsState.clinical.nursingNotes, [
        { label: 'Date', value: (row) => hmsDate(row.created_at || row.date) },
        { label: 'Shift', value: (row) => hmsEscape(row.shift || '-') },
        { label: 'Note', value: (row) => hmsEscape(row.note || '-') },
        { label: 'Actions', value: (row) => hmsRecordActions('nursingNote', row) },
      ]))}
      ${hmsCard('MAR', hmsTable(hmsState.clinical.medicationAdministration, [
        { label: 'Medicine', value: (row) => hmsEscape(row.medicine_name || '-') },
        { label: 'Dose', value: (row) => hmsEscape(row.dose || '-') },
        { label: 'Given', value: (row) => hmsDate(row.given_at || row.created_at) },
        { label: 'Actions', value: (row) => hmsRecordActions('mar', row) },
      ]))}
    </div>
  `;
}

function renderDashboardPage() {
  const summary = hmsState.data.summary || {};
  const activeIpd = (hmsState.data.ipdAdmissions || []).filter((row) => row.status !== 'Discharged').slice(0, 6);
  const beds = hmsState.data.beds || [];
  return `
    ${hmsPageToolbar('Dashboard', 'A simple snapshot of current IPD and bed status.', [
      `<a href="/hospital/admissions" class="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-700 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-800"><i class="fas fa-plus text-xs"></i> Admit Patient</a>`,
      `<a href="/hospital/beds" class="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 hover:bg-slate-50"><i class="fas fa-bed text-xs"></i> Manage Beds</a>`,
    ])}
    <div class="grid gap-3 md:grid-cols-3">
      ${hmsSimpleStat('Active IPD', summary.activeIpd || 0, 'blue')}
      ${hmsSimpleStat('Free Beds', summary.availableBeds || 0, 'emerald')}
      ${hmsSimpleStat('Occupied', summary.occupiedBeds || 0, 'rose')}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsPanelSection('Current IPD Patients', hmsTable(activeIpd, [
        { label: 'IPD', value: (row) => hmsEscape(row.ipd_no || row.public_id) },
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Bed', value: (row) => hmsEscape(hmsBedName(row.bed_id)) },
        { label: 'Status', value: (row) => hmsStatusPill(row.status) },
      ], 'No active IPD patients yet.'))}
      ${hmsPanelSection('Bed Status', hmsTable(beds.slice(0, 10), [
        { label: 'Bed', value: (row) => hmsEscape(row.bed_no || row.public_id) },
        { label: 'Ward', value: (row) => hmsEscape(hmsWardName(row.ward_id)) },
        { label: 'Room', value: (row) => hmsEscape(hmsRoomName(row.room_id)) },
        { label: 'Status', value: (row) => hmsStatusPill(row.status || 'Available') },
      ], 'No beds added yet.'))}
    </div>
  `;
}

function renderBedsPage() {
  const view = hmsState.bedsView || 'beds';
  const tabs = [
    ['beds', 'Beds', 'fa-bed'],
    ['rooms', 'Rooms', 'fa-door-open'],
    ['wards', 'Wards', 'fa-hospital'],
  ];
  const activeAction = {
    beds: hmsCreateButton('Add Bed', 'bed', 'fa-plus', 'slate'),
    rooms: hmsCreateButton('Add Room', 'room', 'fa-plus', 'blue'),
    wards: hmsCreateButton('Add Ward', 'ward', 'fa-plus', 'emerald'),
  }[view];
  const toggle = `
    <div class="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex gap-2 overflow-x-auto">
        ${tabs.map(([key, label, icon]) => `
          <button type="button" onclick="switchBedsView('${key}')" class="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black ${view === key ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}">
            <i class="fas ${icon} text-xs"></i>
            ${label}
          </button>
        `).join('')}
      </div>
      ${activeAction}
    </div>
  `;

  const bedsTable = hmsPanelSection('Beds', hmsTable(hmsState.data.beds || [], [
    { label: 'Bed', value: (row) => hmsEscape(row.bed_no || row.public_id) },
    { label: 'Ward', value: (row) => hmsEscape(hmsWardName(row.ward_id)) },
    { label: 'Room', value: (row) => hmsEscape(hmsRoomName(row.room_id)) },
    { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
    { label: 'Status', value: (row) => hmsStatusPill(row.status || 'Available') },
    { label: 'Actions', value: (row) => hmsRecordActions('bed', row) },
  ], 'No beds added yet.'));

  const roomsTable = hmsPanelSection('Rooms', hmsTable(hmsState.data.rooms || [], [
    { label: 'Room', value: (row) => hmsEscape(row.room_no || row.public_id) },
    { label: 'Ward', value: (row) => hmsEscape(hmsWardName(row.ward_id)) },
    { label: 'Type', value: (row) => hmsEscape(row.type || '-') },
    { label: 'Actions', value: (row) => hmsRecordActions('room', row) },
  ], 'No rooms added yet.'));

  const wardsTable = hmsPanelSection('Wards', hmsTable(hmsState.data.wards || [], [
    { label: 'Ward', value: (row) => hmsEscape(row.name || row.public_id) },
    { label: 'Type', value: (row) => hmsEscape(row.type || '-') },
    { label: 'Actions', value: (row) => hmsRecordActions('ward', row) },
  ], 'No wards added yet.'));

  const content = {
    beds: bedsTable,
    rooms: roomsTable,
    wards: wardsTable,
  }[view] || bedsTable;

  return `
    ${toggle}
    ${content}
  `;
}

function renderAdmissionsPage() {
  const activeAdmissions = (hmsState.data.ipdAdmissions || []).filter((row) => row.status !== 'Discharged');
  const dischargedAdmissions = (hmsState.data.ipdAdmissions || []).filter((row) => row.status === 'Discharged');
  return `
    ${hmsPageToolbar('IPD Admissions', 'Patient admission, bed transfer, and discharge are managed here.', [
      hmsCreateButton('Admit Patient', 'admission', 'fa-plus', 'emerald'),
      hmsCreateButton('Transfer Bed', 'transfer', 'fa-right-left', 'amber'),
    ])}
    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      ${hmsPanelSection('Active Admissions', hmsTable(activeAdmissions, [
        { label: 'IPD', value: (row) => hmsEscape(row.ipd_no || row.public_id) },
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Bed', value: (row) => hmsEscape(hmsBedName(row.bed_id)) },
        { label: 'Admitted', value: (row) => hmsDate(row.admission_date) },
        { label: 'Status', value: (row) => hmsStatusPill(row.status || 'Admitted') },
        { label: 'Actions', value: (row) => hmsRecordActions('ipdAdmission', row, [
          hmsMiniButton('Discharge', `updateHmsRecord('/api/ipd-admissions/${row._id}', { status: 'Discharged', discharge_date: '${hmsToday()}' })`, 'red'),
        ]) },
      ], 'No active admissions.'))}
      ${hmsPanelSection('Transfers', hmsTable(hmsState.data.bedTransfers || [], [
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'From', value: (row) => hmsEscape(hmsBedName(row.from_bed_id)) },
        { label: 'To', value: (row) => hmsEscape(hmsBedName(row.to_bed_id)) },
        { label: 'Date', value: (row) => hmsDate(row.transfer_date) },
        { label: 'Actions', value: (row) => hmsRecordActions('bedTransfer', row) },
      ], 'No bed transfers yet.'))}
    </div>
    <div class="mt-4">
      ${hmsPanelSection('Discharged Admissions', hmsTable(dischargedAdmissions.slice(0, 20), [
        { label: 'IPD', value: (row) => hmsEscape(row.ipd_no || row.public_id) },
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Bed', value: (row) => hmsEscape(hmsBedName(row.bed_id)) },
        { label: 'Discharged', value: (row) => hmsDate(row.discharge_date) },
        { label: 'Actions', value: (row) => hmsRecordActions('ipdAdmission', row) },
      ], 'No discharged admissions yet.'))}
    </div>
  `;
}

function renderClinicalPage() {
  const selected = hmsState.selectedClinicalPatient;
  const patientPicker = `
    <div class="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        ${hmsSelect('Patient', 'clinical_patient', hmsPatientOptions(selected), true).replace('<select', '<select onchange="selectClinicalPatient(this.value)"')}
        <button type="button" onclick="selectClinicalPatient(document.querySelector('[name=clinical_patient]').value)" class="h-10 self-end rounded-xl bg-emerald-700 px-4 text-sm font-black text-white hover:bg-emerald-800">Load Records</button>
      </div>
    </div>
  `;

  if (!selected) {
    return `
      ${hmsPageToolbar('Clinical Records', 'Select a patient first. Then use simple add buttons for each clinical record.')}
      ${patientPicker}
      <div class="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm font-bold text-slate-500">Select a patient to view and add clinical records.</div>
    `;
  }

  return `
    ${hmsPageToolbar('Clinical Records', `Viewing records for ${hmsPatientName(selected)}.`, [
      hmsCreateButton('Add Vitals', 'vital', 'fa-heart-pulse', 'emerald'),
      hmsCreateButton('Nursing Note', 'nursingNote', 'fa-notes-medical', 'blue'),
      hmsCreateButton('Medication', 'mar', 'fa-pills', 'amber'),
    ])}
    ${patientPicker}
    <div class="grid gap-4 xl:grid-cols-3">
      ${hmsPanelSection('Vitals History', hmsTable(hmsState.clinical.vitals, [
        { label: 'Date', value: (row) => hmsDate(row.created_at || row.date) },
        { label: 'BP', value: (row) => hmsEscape(row.bp || '-') },
        { label: 'Pulse', value: (row) => hmsEscape(row.pulse || '-') },
        { label: 'Temp', value: (row) => hmsEscape(row.temperature || '-') },
        { label: 'Actions', value: (row) => hmsRecordActions('vital', row) },
      ], 'No vitals yet.'))}
      ${hmsPanelSection('Nursing Notes', hmsTable(hmsState.clinical.nursingNotes, [
        { label: 'Date', value: (row) => hmsDate(row.created_at || row.date) },
        { label: 'Shift', value: (row) => hmsEscape(row.shift || '-') },
        { label: 'Note', value: (row) => hmsEscape(row.note || '-') },
        { label: 'Actions', value: (row) => hmsRecordActions('nursingNote', row) },
      ], 'No nursing notes yet.'))}
      ${hmsPanelSection('Medication Administration', hmsTable(hmsState.clinical.medicationAdministration, [
        { label: 'Medicine', value: (row) => hmsEscape(row.medicine_name || '-') },
        { label: 'Dose', value: (row) => hmsEscape(row.dose || '-') },
        { label: 'Given', value: (row) => hmsDate(row.given_at || row.created_at) },
        { label: 'Actions', value: (row) => hmsRecordActions('mar', row) },
      ], 'No medication records yet.'))}
    </div>
  `;
}

function renderDiagnostics() {
  const testForm = hmsForm('hms-lab-test-form', '/api/lab/tests', `
    ${hmsInput('Test Name', 'name', { required: true })}
    ${hmsInput('Category', 'category')}
    ${hmsInput('Price', 'price', { type: 'number' })}
  `, 'Add Test');

  const labOrderForm = hmsForm('hms-lab-order-form', '/api/lab/orders', `
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsSelect('Test', 'test_id', hmsOptions(hmsState.data.labTests || [], (item) => `${item.name || item.public_id} - ${hmsMoney(item.price)}`), true)}
    ${hmsSelect('Source', 'source', '<option value="OPD">OPD</option><option value="IPD">IPD</option>')}
    ${hmsSelect('Status', 'status', ['Ordered', 'Sample Collected', 'Processing', 'Completed', 'Cancelled'].map((status) => `<option value="${status}">${status}</option>`).join(''))}
    ${hmsTextarea('Result', 'result')}
  `, 'Create Lab Order');

  const radOrderForm = hmsForm('hms-rad-order-form', '/api/radiology/orders', `
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsInput('Study', 'study_name', { required: true, placeholder: 'X-Ray Chest / Ultrasound' })}
    ${hmsSelect('Modality', 'modality', '<option value="X-Ray">X-Ray</option><option value="Ultrasound">Ultrasound</option><option value="CT">CT</option><option value="MRI">MRI</option>')}
    ${hmsSelect('Status', 'status', ['Ordered', 'Processing', 'Completed', 'Cancelled'].map((status) => `<option value="${status}">${status}</option>`).join(''))}
    ${hmsInput('Billable Amount', 'billable_amount', { type: 'number', value: '0' })}
    ${hmsTextarea('Clinical Notes', 'clinical_notes')}
  `, 'Create Radiology Order');

  const radReportForm = hmsForm('hms-rad-report-form', '/api/radiology/reports', `
    ${hmsSelect('Order', 'order_id', hmsOptions(hmsState.data.radiologyOrders || [], (item) => `${item.study_name || item.public_id} - ${hmsPatientName(item.patient_id)}`), true)}
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsTextarea('Report Text', 'report_text')}
    ${hmsInput('Report URL', 'report_url', { placeholder: 'Optional file/report URL' })}
  `, 'Save Report');

  return `
    <div class="grid gap-4 xl:grid-cols-4">
      ${hmsCard('Test Catalog', testForm)}
      ${hmsCard('Lab Order', labOrderForm, 'blue')}
      ${hmsCard('Radiology Order', radOrderForm, 'amber')}
      ${hmsCard('Radiology Report', radReportForm, 'emerald')}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsCard('Lab Orders', hmsTable(hmsState.data.labOrders || [], [
        { label: 'Order', value: (row) => hmsEscape(row.public_id) },
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Test', value: (row) => hmsEscape((hmsState.data.labTests || []).find((test) => test._id === row.test_id)?.name || '-') },
        { label: 'Charge', value: (row) => hmsMoney(row.billable_amount) },
        { label: 'Status', value: (row) => hmsStatusPill(row.status) },
        { label: 'Actions', value: (row) => hmsRecordActions('labOrder', row, [
          hmsMiniButton('Sample', `updateHmsRecord('/api/lab/orders/${row._id}', { status: 'Sample Collected' })`, 'blue'),
          hmsMiniButton('Complete', `updateHmsRecord('/api/lab/orders/${row._id}', { status: 'Completed' })`, 'emerald'),
        ]) },
      ]))}
      ${hmsCard('Radiology Orders', hmsTable(hmsState.data.radiologyOrders || [], [
        { label: 'Order', value: (row) => hmsEscape(row.public_id) },
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Study', value: (row) => hmsEscape(row.study_name || '-') },
        { label: 'Charge', value: (row) => hmsMoney(row.billable_amount) },
        { label: 'Status', value: (row) => hmsStatusPill(row.status) },
        { label: 'Actions', value: (row) => hmsRecordActions('radiologyOrder', row, [hmsMiniButton('Complete', `updateHmsRecord('/api/radiology/orders/${row._id}', { status: 'Completed' })`, 'emerald')]) },
      ]))}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsCard('Lab Tests', hmsTable(hmsState.data.labTests || [], [
        { label: 'Test', value: (row) => hmsEscape(row.name || row.public_id) },
        { label: 'Category', value: (row) => hmsEscape(row.category || '-') },
        { label: 'Price', value: (row) => hmsMoney(row.price) },
        { label: 'Actions', value: (row) => hmsRecordActions('labTest', row) },
      ]))}
      ${hmsCard('Radiology Reports', hmsTable(hmsState.data.radiologyReports || [], [
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Order', value: (row) => hmsEscape((hmsState.data.radiologyOrders || []).find((order) => order._id === row.order_id)?.study_name || '-') },
        { label: 'Report', value: (row) => hmsEscape(row.report_text || row.report_url || '-') },
        { label: 'Actions', value: (row) => hmsRecordActions('radiologyReport', row) },
      ]))}
    </div>
  `;
}

function renderPharmacy() {
  const medicineForm = hmsForm('hms-medicine-form', '/api/pharmacy/medicines', `
    ${hmsInput('Medicine Name', 'name', { required: true })}
    ${hmsInput('Category', 'category')}
    ${hmsInput('Stock', 'stock', { type: 'number', value: '0' })}
    ${hmsInput('Purchase Price', 'purchase_price', { type: 'number' })}
    ${hmsInput('Sale Price', 'sale_price', { type: 'number' })}
  `, 'Add Medicine');

  const batchForm = hmsForm('hms-batch-form', '/api/pharmacy/batches', `
    ${hmsSelect('Medicine', 'medicine_id', hmsOptions(hmsState.data.medicines || [], (item) => `${item.name || item.public_id} - Stock ${item.stock || 0}`), true)}
    ${hmsInput('Batch No', 'batch_no', { required: true })}
    ${hmsInput('Expiry', 'expiry_date', { type: 'date' })}
    ${hmsInput('Quantity', 'quantity', { type: 'number', required: true })}
  `, 'Add Batch');

  const dispenseForm = hmsForm('hms-dispense-form', '/api/pharmacy/dispense', `
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsSelect('Medicine', 'medicine_id', hmsOptions(hmsState.data.medicines || [], (item) => `${item.name || item.public_id} - Stock ${item.stock || 0}`), true)}
    ${hmsSelect('Batch', 'batch_id', hmsOptions(hmsState.data.batches || [], (item) => `${item.batch_no || item.public_id} - Rem ${item.remaining || item.quantity || 0}`))}
    ${hmsInput('Quantity', 'quantity', { type: 'number', required: true })}
    ${hmsInput('Sale Price', 'sale_price', { type: 'number' })}
    ${hmsInput('Dose Instructions', 'instructions')}
  `, 'Dispense');

  return `
    <div class="grid gap-4 xl:grid-cols-3">
      ${hmsCard('Medicine Catalog', medicineForm)}
      ${hmsCard('Batch Purchase', batchForm, 'emerald')}
      ${hmsCard('Dispense Medicine', dispenseForm, 'blue')}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsCard('Medicines', hmsTable(hmsState.data.medicines || [], [
        { label: 'Medicine', value: (row) => hmsEscape(row.name || row.public_id) },
        { label: 'Category', value: (row) => hmsEscape(row.category || '-') },
        { label: 'Stock', value: (row) => hmsEscape(row.stock || 0) },
        { label: 'Sale', value: (row) => hmsMoney(row.sale_price) },
        { label: 'Actions', value: (row) => hmsRecordActions('medicine', row) },
      ]))}
      ${hmsCard('Stock Ledger', hmsTable(hmsState.data.stockLedger || [], [
        { label: 'Date', value: (row) => hmsDate(row.date || row.created_at) },
        { label: 'Medicine', value: (row) => hmsEscape(hmsMedicineName(row.medicine_id)) },
        { label: 'Type', value: (row) => hmsEscape(row.transaction_type || '-') },
        { label: 'Qty', value: (row) => hmsEscape(row.quantity || 0) },
      ]))}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsCard('Batches', hmsTable(hmsState.data.batches || [], [
        { label: 'Batch', value: (row) => hmsEscape(row.batch_no || row.public_id) },
        { label: 'Medicine', value: (row) => hmsEscape(hmsMedicineName(row.medicine_id)) },
        { label: 'Expiry', value: (row) => hmsDate(row.expiry_date) },
        { label: 'Remaining', value: (row) => hmsEscape(row.remaining || 0) },
        { label: 'Actions', value: (row) => hmsRecordActions('batch', row) },
      ]))}
      ${hmsCard('Dispenses', hmsTable(hmsState.data.dispenses || [], [
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Medicine', value: (row) => hmsEscape(row.medicine_name || hmsMedicineName(row.medicine_id)) },
        { label: 'Qty', value: (row) => hmsEscape(row.quantity || 0) },
        { label: 'Charge', value: (row) => hmsMoney(row.billable_amount) },
        { label: 'Actions', value: (row) => hmsRecordActions('dispense', row) },
      ]))}
    </div>
  `;
}

function renderAutoPullBilling() {
  const charges = hmsState.unbilledCharges || [];
  const selectedPatient = hmsState.autoBilling.patientId || '';
  const discount = Number(hmsState.autoBilling.discount || 0);
  const subtotal = charges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0);
  const total = Math.max(subtotal - discount, 0);
  const chargeList = charges.length === 0
    ? '<div class="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm font-bold text-slate-500">Load a patient to view unbilled OPD/IPD/lab/radiology/pharmacy charges.</div>'
    : `
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2">
        <p class="text-xs font-black uppercase tracking-[0.12em] text-slate-700">${charges.length} unbilled charge${charges.length === 1 ? '' : 's'}</p>
        <div class="flex gap-2">
          <button type="button" onclick="setAutoChargeSelection(true)" class="h-8 rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-xs font-black text-emerald-800 hover:bg-emerald-100">Select All</button>
          <button type="button" onclick="setAutoChargeSelection(false)" class="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">Clear</button>
        </div>
      </div>
      <div class="max-h-60 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
        ${charges.map((charge) => `
          <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-emerald-50">
            <input type="checkbox" onchange="updateAutoPullTotal()" class="hms-charge-checkbox h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" value="${hmsEscape(charge.source_key)}" checked>
            <span class="flex-1">
              <span class="block text-sm font-black text-slate-950">${hmsEscape(charge.description)}</span>
              <span class="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">${hmsEscape(charge.source)} • ${hmsDate(charge.date)}</span>
            </span>
            <span class="text-sm font-black text-emerald-800">${hmsMoney(charge.amount)}</span>
          </label>
        `).join('')}
      </div>
    `;

  return `
    <div class="grid gap-3">
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto]">
        ${hmsSelect('Patient', 'auto_patient_id', hmsPatientOptions(selectedPatient), true).replace('<select', '<select id="hms-auto-patient"')}
        ${hmsInput('Discount', 'auto_discount', { type: 'number', value: String(hmsState.autoBilling.discount || '0') }).replace('name="auto_discount"', 'name="auto_discount" id="hms-auto-discount" oninput="updateAutoPullTotal()"')}
        <button type="button" onclick="loadHmsUnbilledCharges()" class="h-10 self-end rounded-xl border border-emerald-100 bg-emerald-50 px-4 text-sm font-black text-emerald-800 hover:bg-emerald-100">
          Load Charges
        </button>
      </div>
      ${chargeList}
      <div class="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-black text-slate-800 sm:grid-cols-3">
        <div>Subtotal: <span id="hms-auto-subtotal" class="text-slate-950">${hmsMoney(subtotal)}</span></div>
        <div>Discount: <span id="hms-auto-discount-view" class="text-amber-700">${hmsMoney(discount)}</span></div>
        <div>Total: <span id="hms-auto-total" class="text-emerald-800">${hmsMoney(total)}</span></div>
      </div>
      <button type="button" onclick="createInvoiceFromCharges()" class="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white hover:bg-slate-800">
        <i class="fas fa-file-invoice-dollar text-xs"></i>
        Create Invoice From Selected
      </button>
    </div>
  `;
}

function updateAutoPullTotal() {
  const selected = new Set(Array.from(document.querySelectorAll('.hms-charge-checkbox:checked')).map((checkbox) => checkbox.value));
  const subtotal = (hmsState.unbilledCharges || [])
    .filter((charge) => selected.has(charge.source_key))
    .reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0);
  const discount = Number(document.getElementById('hms-auto-discount')?.value || 0);
  const total = Math.max(subtotal - discount, 0);
  hmsState.autoBilling.patientId = document.getElementById('hms-auto-patient')?.value || hmsState.autoBilling.patientId || '';
  hmsState.autoBilling.discount = String(discount || 0);
  const subtotalEl = document.getElementById('hms-auto-subtotal');
  const discountEl = document.getElementById('hms-auto-discount-view');
  const totalEl = document.getElementById('hms-auto-total');
  if (subtotalEl) subtotalEl.textContent = hmsMoney(subtotal);
  if (discountEl) discountEl.textContent = hmsMoney(discount);
  if (totalEl) totalEl.textContent = hmsMoney(total);
}

function setAutoChargeSelection(checked) {
  document.querySelectorAll('.hms-charge-checkbox').forEach((checkbox) => {
    checkbox.checked = checked;
  });
  updateAutoPullTotal();
}

function renderBilling() {
  const serviceForm = hmsForm('hms-service-form', '/api/services', `
    ${hmsInput('Service Name', 'name', { required: true })}
    ${hmsSelect('Category', 'category', '<option value="OPD">OPD</option><option value="IPD">IPD</option><option value="Lab">Lab</option><option value="Radiology">Radiology</option><option value="Pharmacy">Pharmacy</option><option value="Room">Room</option><option value="Other">Other</option>')}
    ${hmsInput('Price', 'price', { type: 'number', required: true })}
  `, 'Add Service');

  const invoiceForm = hmsForm('hms-invoice-form', '/api/invoices', `
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsSelect('Source', 'source', '<option value="OPD">OPD</option><option value="IPD">IPD</option><option value="Lab">Lab</option><option value="Radiology">Radiology</option><option value="Pharmacy">Pharmacy</option><option value="Manual">Manual</option>')}
    ${hmsSelect('Service', 'service_id', hmsOptions(hmsState.data.services || [], (item) => `${item.name || item.public_id} - ${hmsMoney(item.price)}`), true)}
    ${hmsInput('Description', 'line_description', { required: true, placeholder: 'Consultation / Lab Test / Room Charge' })}
    ${hmsInput('Amount', 'line_amount', { type: 'number', required: true })}
    ${hmsInput('Discount', 'discount_amount', { type: 'number', value: '0' })}
  `, 'Create Invoice', 'data-kind="invoice"');

  const paymentForm = hmsForm('hms-payment-form', '/api/invoices/:invoice_id/payments', `
    ${hmsSelect('Invoice', 'invoice_id', hmsOptions(hmsState.data.invoices || [], (item) => `${item.invoice_no || item.public_id} - ${hmsPatientName(item.patient_id)} - ${hmsMoney(item.total)}`), true)}
    ${hmsInput('Amount', 'amount', { type: 'number', required: true })}
    ${hmsSelect('Method', 'method', '<option value="Cash">Cash</option><option value="Card">Card</option><option value="Online">Online</option><option value="Bank">Bank</option>')}
    ${hmsInput('Date', 'date', { type: 'date', value: hmsToday() })}
  `, 'Record Payment');

  const refundForm = hmsForm('hms-refund-form', '/api/refunds', `
    ${hmsSelect('Invoice', 'invoice_id', hmsOptions(hmsState.data.invoices || [], (item) => `${item.invoice_no || item.public_id} - ${hmsPatientName(item.patient_id)}`))}
    ${hmsSelect('Patient', 'patient_id', hmsPatientOptions(), true)}
    ${hmsInput('Amount', 'amount', { type: 'number', required: true })}
    ${hmsInput('Reason', 'reason')}
  `, 'Add Refund');

  const cashClosingForm = hmsForm('hms-closing-form', '/api/cash-closing', `
    ${hmsInput('Date', 'date', { type: 'date', value: hmsToday() })}
    ${hmsInput('Cash Total', 'cash_total', { type: 'number', value: '0' })}
    ${hmsInput('Card Total', 'card_total', { type: 'number', value: '0' })}
    ${hmsInput('Online Total', 'online_total', { type: 'number', value: '0' })}
    ${hmsInput('Expenses', 'expense_total', { type: 'number', value: '0' })}
  `, 'Close Day');

  return `
    <div class="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      ${hmsCard('Auto Pull Charges', renderAutoPullBilling(), 'emerald')}
      ${hmsCard('Manual Invoice', invoiceForm, 'blue')}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-4">
      ${hmsCard('Service Catalog', serviceForm)}
      ${hmsCard('Payment', paymentForm, 'emerald')}
      ${hmsCard('Refund', refundForm, 'rose')}
      ${hmsCard('Cash Closing', cashClosingForm, 'amber')}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsCard('Invoices', hmsTable(hmsState.data.invoices || [], [
        { label: 'Invoice', value: (row) => hmsEscape(row.invoice_no || row.public_id) },
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Total', value: (row) => hmsMoney(row.total) },
        { label: 'Paid', value: (row) => hmsMoney(row.paid_amount) },
        { label: 'Status', value: (row) => hmsStatusPill(row.status) },
        { label: 'Actions', value: (row) => hmsRecordActions('invoice', row) },
      ]))}
      ${hmsCard('Services', hmsTable(hmsState.data.services || [], [
        { label: 'Service', value: (row) => hmsEscape(row.name || row.public_id) },
        { label: 'Category', value: (row) => hmsEscape(row.category || '-') },
        { label: 'Price', value: (row) => hmsMoney(row.price) },
        { label: 'Actions', value: (row) => hmsRecordActions('service', row) },
      ]))}
    </div>
    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      ${hmsCard('Refunds', hmsTable(hmsState.data.refunds || [], [
        { label: 'Patient', value: (row) => hmsEscape(hmsPatientName(row.patient_id)) },
        { label: 'Amount', value: (row) => hmsMoney(row.amount) },
        { label: 'Status', value: (row) => hmsStatusPill(row.status) },
        { label: 'Reason', value: (row) => hmsEscape(row.reason || '-') },
        { label: 'Actions', value: (row) => hmsRecordActions('refund', row) },
      ]))}
      ${hmsCard('Cash Closings', hmsTable(hmsState.data.cashClosings || [], [
        { label: 'Date', value: (row) => hmsDate(row.date) },
        { label: 'Cash', value: (row) => hmsMoney(row.cash_total) },
        { label: 'Online', value: (row) => hmsMoney(row.online_total) },
        { label: 'Net', value: (row) => hmsMoney(row.net_total) },
        { label: 'Actions', value: (row) => hmsRecordActions('cashClosing', row) },
      ]))}
    </div>
  `;
}

function renderHospitalPanel() {
  const panel = document.getElementById('hospital-panel');
  if (!panel) return;
  const renderers = {
    beds: renderBedsPage,
    admissions: renderAdmissionsPage,
    clinical: renderClinicalPage,
  };
  panel.innerHTML = (renderers[hmsState.section] || renderBedsPage)();
}

async function reloadHospitalWorkspace() {
  const panel = document.getElementById('hospital-panel');
  if (panel) {
    panel.innerHTML = '<div class="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm font-black text-slate-600">Loading hospital workspace...</div>';
  }
  await loadHospitalReferences();
  await loadHospitalData();
  if (hmsState.selectedClinicalPatient) {
    await loadClinicalRecords(hmsState.selectedClinicalPatient);
  }
  renderHospitalPanel();
}

function switchHospitalTab(tab) {
  hmsState.section = tab;
  renderHospitalPanel();
}

function switchBedsView(view) {
  hmsState.bedsView = view;
  renderHospitalPanel();
}

async function selectClinicalPatient(patientId) {
  hmsState.selectedClinicalPatient = patientId;
  await loadClinicalRecords(patientId);
  renderHospitalPanel();
}

function hmsListByKey(listKey) {
  if (!listKey) return [];
  if (!listKey.includes('.') && hmsState.data?.[listKey]) return hmsState.data[listKey];
  return listKey.split('.').reduce((value, key) => value?.[key], hmsState) || [];
}

function closeHmsEditModal() {
  const modal = document.getElementById('hms-edit-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function closeHmsCreateModal() {
  const modal = document.getElementById('hms-create-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function openHmsCreateModal(formKey) {
  const config = HMS_CREATE_CONFIG[formKey];
  if (!config) return;
  if (['vital', 'nursingNote', 'mar'].includes(formKey) && !hmsState.selectedClinicalPatient) {
    window.showToast?.('Select patient first.', true);
    return;
  }

  document.getElementById('hms-create-title').textContent = config.title || 'Add Record';
  document.getElementById('hms-create-help').textContent = config.help || 'Fill the required fields and save.';
  document.getElementById('hms-create-body').innerHTML = config.form();
  const form = document.getElementById('hms-create-body').querySelector('form');
  if (form) {
    form.removeAttribute('onsubmit');
    form.dataset.endpoint = resolveHmsCreateEndpoint(config);
    form.addEventListener('submit', submitHmsCreateForm);
  }

  const modal = document.getElementById('hms-create-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function openHmsEditModal(resourceKey, id) {
  const config = HMS_RESOURCE_CONFIG[resourceKey];
  if (!config) return;
  const record = hmsListByKey(config.listKey).find((item) => item._id === id);
  if (!record) {
    window.showToast?.('Record not found. Refresh and try again.', true);
    return;
  }

  hmsState.edit = { resourceKey, recordId: id };
  document.getElementById('hms-edit-resource').value = resourceKey;
  document.getElementById('hms-edit-id').value = id;
  document.getElementById('hms-edit-title').textContent = config.title || 'Edit Record';
  document.getElementById('hms-edit-help').textContent = record.public_id || record.invoice_no || record.appointment_no || 'Update fields and save changes.';
  document.getElementById('hms-edit-fields').innerHTML = config.fields().map((field) => hmsFieldHtml(field, record[field.name])).join('');

  const modal = document.getElementById('hms-edit-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

async function submitHmsEditModal(event) {
  event.preventDefault();
  const resourceKey = document.getElementById('hms-edit-resource').value;
  const recordId = document.getElementById('hms-edit-id').value;
  const config = HMS_RESOURCE_CONFIG[resourceKey];
  if (!config || !recordId) return;

  const payload = Object.fromEntries(new FormData(event.target).entries());
  delete payload.resourceKey;
  delete payload.recordId;
  Object.keys(payload).forEach((key) => {
    if (payload[key] === '') delete payload[key];
  });

  const endpoint = `${resolveHmsEndpoint(config)}/${recordId}`;
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    window.showToast?.(data.error || 'Unable to update record.', true);
    return;
  }
  window.showToast?.('Record updated.');
  closeHmsEditModal();
  await reloadHospitalWorkspace();
}

function hmsPayloadFromForm(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  Object.keys(payload).forEach((key) => {
    if (payload[key] === '') delete payload[key];
  });

  if (form.dataset.kind === 'invoice') {
    const description = payload.line_description || hmsServiceName(payload.service_id);
    const amount = Number(payload.line_amount || 0);
    payload.lines = [{
      service_id: payload.service_id || '',
      description,
      amount,
    }];
    delete payload.line_description;
    delete payload.line_amount;
  }

  if (payload.doctor_id && !payload.doctor_name) {
    payload.doctor_name = hmsUserName(payload.doctor_id);
  }
  if (payload.medicine_id && !payload.medicine_name) {
    payload.medicine_name = hmsMedicineName(payload.medicine_id);
  }
  if (payload.service_id && !payload.service_name) {
    payload.service_name = hmsServiceName(payload.service_id);
  }
  return payload;
}

async function loadHmsUnbilledCharges() {
  const patientId = document.getElementById('hms-auto-patient')?.value || '';
  const discount = document.getElementById('hms-auto-discount')?.value || '0';
  if (!patientId) {
    window.showToast?.('Select patient first.', true);
    return;
  }
  hmsState.autoBilling = { patientId, discount };
  hmsState.unbilledCharges = await hmsFetchJson(`/api/billing/unbilled-charges?patient_id=${encodeURIComponent(patientId)}`, {}, []);
  renderHospitalPanel();
  updateAutoPullTotal();
}

async function createInvoiceFromCharges() {
  const patientId = document.getElementById('hms-auto-patient')?.value || '';
  const charges = Array.from(document.querySelectorAll('.hms-charge-checkbox:checked')).map((checkbox) => checkbox.value);
  const discount = document.getElementById('hms-auto-discount')?.value || '0';
  hmsState.autoBilling = { patientId, discount };
  if (!patientId || charges.length === 0) {
    window.showToast?.('Select patient and at least one charge.', true);
    return;
  }
  const res = await fetch('/api/invoices/from-charges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: patientId, charges, discount_amount: discount, date: hmsToday() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    window.showToast?.(data.error || 'Unable to create invoice.', true);
    return;
  }
  window.showToast?.('Invoice created from charges.');
  hmsState.unbilledCharges = [];
  hmsState.autoBilling.discount = '0';
  await reloadHospitalWorkspace();
}

async function submitHmsForm(event, endpointTemplate) {
  event.preventDefault();
  const form = event.target;
  const payload = hmsPayloadFromForm(form);
  let endpoint = endpointTemplate;

  if (endpoint.includes(':invoice_id')) {
    if (!payload.invoice_id) {
      window.showToast?.('Select invoice first.', true);
      return;
    }
    endpoint = endpoint.replace(':invoice_id', payload.invoice_id);
    delete payload.invoice_id;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    window.showToast?.(data.error || 'Unable to save record.', true);
    return;
  }
  window.showToast?.('Saved successfully.');
  form.reset();
  closeHmsCreateModal();
  await reloadHospitalWorkspace();
}

async function submitHmsCreateForm(event) {
  event.preventDefault();
  const form = event.target;
  const endpoint = form.dataset.endpoint;
  if (!endpoint) {
    window.showToast?.('Form endpoint missing. Refresh and try again.', true);
    return;
  }

  const payload = hmsPayloadFromForm(form);
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.classList.add('opacity-70');
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.showToast?.(data.error || 'Unable to save record.', true);
      return;
    }
    window.showToast?.('Saved successfully.');
    closeHmsCreateModal();
    await reloadHospitalWorkspace();
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.classList.remove('opacity-70');
    }
  }
}

async function updateHmsRecord(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    window.showToast?.(data.error || 'Unable to update record.', true);
    return;
  }
  window.showToast?.('Updated successfully.');
  await reloadHospitalWorkspace();
}

async function deleteHmsRecord(endpoint) {
  const confirmed = typeof window.confirmAction === 'function'
    ? await window.confirmAction('Delete this hospital record?')
    : window.confirm('Delete this hospital record?');
  if (!confirmed) return;
  const res = await fetch(endpoint, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    window.showToast?.(data.error || 'Unable to delete record.', true);
    return;
  }
  window.showToast?.('Deleted successfully.');
  await reloadHospitalWorkspace();
}

document.addEventListener('DOMContentLoaded', () => {
  reloadHospitalWorkspace();
});

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-hms-create]');
  if (!trigger) return;
  event.preventDefault();
  openHmsCreateModal(trigger.dataset.hmsCreate);
});

window.reloadHospitalWorkspace = reloadHospitalWorkspace;
window.switchHospitalTab = switchHospitalTab;
window.switchBedsView = switchBedsView;
window.selectClinicalPatient = selectClinicalPatient;
window.openHmsCreateModal = openHmsCreateModal;
window.closeHmsCreateModal = closeHmsCreateModal;
window.openHmsEditModal = openHmsEditModal;
window.closeHmsEditModal = closeHmsEditModal;
window.submitHmsEditModal = submitHmsEditModal;
window.loadHmsUnbilledCharges = loadHmsUnbilledCharges;
window.createInvoiceFromCharges = createInvoiceFromCharges;
window.updateAutoPullTotal = updateAutoPullTotal;
window.setAutoChargeSelection = setAutoChargeSelection;
window.submitHmsForm = submitHmsForm;
window.submitHmsCreateForm = submitHmsCreateForm;
window.updateHmsRecord = updateHmsRecord;
window.deleteHmsRecord = deleteHmsRecord;
