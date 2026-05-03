const patientDetailState = {
  patientId: window.__APP__?.patientId || '',
  currentUser: window.__APP__?.currentUser || { role: 'Guest' },
  patient: null,
  activeTab: 'notes',
};

const canAddSessionNote = () => ['Admin', 'Psychologist'].includes(patientDetailState.currentUser.role);
const canAddMedicalRecord = () => ['Admin', 'Doctor'].includes(patientDetailState.currentUser.role);
const isAdminUser = () => patientDetailState.currentUser.role === 'Admin';

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setFieldValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value || '';
}

function setImageValue(imgId, hiddenId, value) {
  const img = document.getElementById(imgId);
  const hidden = document.getElementById(hiddenId);
  const fallback = 'https://via.placeholder.com/480x300?text=No+Photo';
  if (hidden) hidden.value = value || '';
  if (img) {
    img.src = value || fallback;
    img.classList.toggle('opacity-40', !value);
  }
}

function updateLaundryLabel() {
  const checkbox = document.getElementById('det-laundry-status');
  const label = document.getElementById('det-laundry-label');
  if (checkbox && label) {
    label.textContent = checkbox.checked ? 'Laundry Service Enabled' : 'Enable Laundry Service';
  }
}

function buildSummaryCard(patient) {
  const container = document.getElementById('patient-summary-card');
  if (!container || !patient) return;

  const monthlyFee = Number(String(patient.monthlyFee || '0').replace(/,/g, '')) || 0;
  const received = Number(String(patient.receivedAmount || '0').replace(/,/g, '')) || 0;
  const canteen = Number(patient.canteenSpent || 0);
  const laundry = patient.laundryStatus ? Number(patient.laundryAmount || 0) : 0;
  const totalBill = monthlyFee + canteen + laundry;
  const balance = totalBill - received;

  container.innerHTML = `
    <div class="summary-stat">
      <div class="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Patient</div>
      <div class="mt-1 text-base font-black text-slate-950">${patient.name || 'Unknown'}</div>
      <div class="mt-1 text-sm font-semibold text-slate-500">${patient.fatherName || patient.guardianName || '—'}</div>
    </div>
    <div class="summary-stat">
      <div class="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Status</div>
      <div class="mt-1 text-base font-black ${patient.isDischarged ? 'text-slate-500' : 'text-emerald-700'}">${patient.isDischarged ? 'Discharged' : 'Active'}</div>
    </div>
    <div class="summary-stat">
      <div class="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Monthly Fee</div>
      <div class="mt-1 text-base font-black text-slate-950">Rs ${new Intl.NumberFormat('en-US').format(monthlyFee)}</div>
    </div>
    <div class="summary-stat">
      <div class="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Received</div>
      <div class="mt-1 text-base font-black text-slate-950">Rs ${new Intl.NumberFormat('en-US').format(received)}</div>
    </div>
    <div class="summary-stat">
      <div class="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Balance</div>
      <div class="mt-1 text-base font-black ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-emerald-600' : 'text-slate-500'}">
        Rs ${new Intl.NumberFormat('en-US').format(Math.abs(balance))}
        <span class="text-sm">${balance > 0 ? 'Due' : balance < 0 ? 'Refund' : 'Cleared'}</span>
      </div>
    </div>
  `;
}

function updateCallCalendar(admissionDateStr) {
  const panel = document.getElementById('call-info-panel');
  const nextCall = document.getElementById('next-call-display');
  const calendarEl = document.getElementById('mini-calendar');

  if (!panel || !nextCall || !calendarEl) return;
  if (!admissionDateStr) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  const admissionDate = new Date(admissionDateStr);
  const dayOfWeekIndex = admissionDate.getDay();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const callDayName = days[dayOfWeekIndex];

  nextCall.innerHTML = `
    <div class="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-500">Weekly Call Day</div>
    <div class="mt-2 text-2xl font-black text-emerald-700">${callDayName}</div>
  `;

  calendarEl.innerHTML = '';
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((day) => {
    calendarEl.innerHTML += `<div class="calendar-day-header">${day}</div>`;
  });

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    calendarEl.innerHTML += '<div></div>';
  }

  for (let date = 1; date <= lastDay.getDate(); date += 1) {
    const current = new Date(year, month, date);
    const isToday = date === today.getDate();
    const isCallDay = current.getDay() === dayOfWeekIndex;
    let className = 'calendar-day';
    if (isToday) className += ' today';
    if (isCallDay) className += ' call-day';
    calendarEl.innerHTML += `<div class="${className}">${date}</div>`;
  }
}

function populatePatient(patient) {
  patientDetailState.patient = patient;
  document.getElementById('patient-detail-title').textContent = patient.name || 'Patient Detail';
  document.getElementById('patient-detail-subtitle').textContent = `${patient.fatherName || 'Guardian not set'} • Admitted ${patient.admissionDate || 'unknown date'}`;
  document.getElementById('patient-bill-preview-link').href = `/api/patients/${patientDetailState.patientId}/bill/preview`;

  setFieldValue('det-name', patient.name);
  setFieldValue('det-father', patient.fatherName);
  setFieldValue('det-admission', patient.admissionDate);
  setFieldValue('det-id', patient.idNo);
  setFieldValue('det-age', patient.age);
  setFieldValue('det-drug', patient.drug || patient.drugProblem);
  setFieldValue('det-cnic', patient.cnic);
  setFieldValue('det-contact', patient.contactNo);
  setFieldValue('det-guardian', patient.guardianName);
  setFieldValue('det-relation', patient.relation);
  setFieldValue('det-area', patient.area);
  setFieldValue('det-prev', patient.prevAdmissions);
  setFieldValue('det-address', patient.address);
  setFieldValue('det-complaint', patient.complaint);
  setFieldValue('det-fee', patient.monthlyFee);
  setFieldValue('det-received', patient.receivedAmount);
  setFieldValue('det-allowance', patient.monthlyAllowance);
  setFieldValue('det-laundry-amount', patient.laundryAmount || '0');

  const laundryCheckbox = document.getElementById('det-laundry-status');
  if (laundryCheckbox) laundryCheckbox.checked = Boolean(patient.laundryStatus);
  updateLaundryLabel();

  setImageValue('det-photo1-img', 'det-photo1-hidden', patient.photo1);
  setImageValue('det-photo2-img', 'det-photo2-hidden', patient.photo2);
  setImageValue('det-photo3-img', 'det-photo3-hidden', patient.photo3);

  const financialCard = document.getElementById('financial-settings-card');
  if (financialCard) financialCard.style.display = isAdminUser() ? '' : 'none';

  buildSummaryCard(patient);
  updateCallCalendar(patient.admissionDate);
  populatePrintTemplate(patient);
}

function populatePrintTemplate(patient) {
  const target = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value || '................';
  };

  target('pr-name', patient.name);
  target('pr-father', patient.fatherName);
  target('pr-admission', patient.admissionDate);
  target('pr-id', patient.idNo);
  target('pr-age', patient.age);
  target('pr-cnic', patient.cnic);
  target('pr-guardian', patient.guardianName);
  target('pr-relation', patient.relation);
  target('pr-drug', patient.drug || patient.drugProblem);
  target('pr-contact', patient.contactNo);
  target('pr-marital', patient.maritalStatus);
  target('pr-prev', patient.prevAdmissions);
  target('pr-address', patient.address);
  target('pr-complaint', patient.complaint);
  target('ur-name', patient.name);
  target('ur-father', patient.fatherName);
  target('ur-age', patient.age);
  target('ur-cnic', patient.cnic);
  target('ur-contact', patient.contactNo);
  target('ur-address', patient.address);
  target('ur-auth-name', patient.guardianName);
}

function printPatientProfile() {
  const printEl = document.getElementById('printable-area');
  if (!printEl) return;
  printEl.classList.remove('hidden');
  printEl.classList.add('print-active');
  window.print();
  window.setTimeout(() => {
    printEl.classList.remove('print-active');
    printEl.classList.add('hidden');
  }, 500);
}

function renderRecordList(targetId, records, type) {
  const container = document.getElementById(targetId);
  if (!container) return;

  const filtered = records.filter((record) => record.type === type);
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="record-item text-sm font-semibold text-slate-400">
        No ${type === 'session_note' ? 'session notes' : 'medical records'} found yet.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((record) => `
    <article class="record-item">
      <div class="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
        ${new Date(record.date).toLocaleDateString()} • ${record.recorded_by || 'Unknown'}
      </div>
      <h4 class="mt-2 text-base font-black text-emerald-800">${record.title || record.type}</h4>
      <p class="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-600">${record.text || record.details || ''}</p>
    </article>
  `).join('');
}

async function loadPatientRecords() {
  const { response, data } = await window.apiFetchJson(`/api/patients/${patientDetailState.patientId}/records`);
  if (!response.ok || !Array.isArray(data)) {
    renderRecordList('session-notes-list', [], 'session_note');
    renderRecordList('medical-records-list', [], 'medical_record');
    return;
  }

  renderRecordList('session-notes-list', data, 'session_note');
  renderRecordList('medical-records-list', data, 'medical_record');
}

async function loadPatient() {
  const { response, data } = await window.apiFetchJson(`/api/patients/${patientDetailState.patientId}`);
  if (!response.ok || !data) {
    document.getElementById('patient-detail-title').textContent = 'Patient not found';
    document.getElementById('patient-detail-subtitle').textContent = data?.error || 'Unable to load patient details.';
    return;
  }

  populatePatient(data);
}

function getPayload() {
  return {
    name: document.getElementById('det-name').value,
    fatherName: document.getElementById('det-father').value,
    admissionDate: document.getElementById('det-admission').value,
    idNo: document.getElementById('det-id').value,
    age: document.getElementById('det-age').value,
    drug: document.getElementById('det-drug').value,
    cnic: document.getElementById('det-cnic').value,
    contactNo: document.getElementById('det-contact').value,
    guardianName: document.getElementById('det-guardian').value,
    relation: document.getElementById('det-relation').value,
    area: document.getElementById('det-area').value,
    prevAdmissions: document.getElementById('det-prev').value,
    address: document.getElementById('det-address').value,
    complaint: document.getElementById('det-complaint').value,
    monthlyFee: document.getElementById('det-fee').value,
    receivedAmount: document.getElementById('det-received').value || '0',
    monthlyAllowance: document.getElementById('det-allowance').value,
    laundryStatus: document.getElementById('det-laundry-status').checked,
    laundryAmount: document.getElementById('det-laundry-amount').value || '0',
    photo1: document.getElementById('det-photo1-hidden').value,
    photo2: document.getElementById('det-photo2-hidden').value,
    photo3: document.getElementById('det-photo3-hidden').value,
  };
}

async function savePatientDetails(event) {
  event.preventDefault();
  const { response, data } = await window.apiFetchJson(`/api/patients/${patientDetailState.patientId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(getPayload()),
  });

  if (!response.ok) {
    window.showToast(data?.error || 'Unable to save patient details.', true);
    return;
  }

  window.showToast('Patient details saved.');
  await loadPatient();
}

function showTab(tab) {
  patientDetailState.activeTab = tab;
  document.getElementById('tab-notes').classList.toggle('hidden', tab !== 'notes');
  document.getElementById('tab-med').classList.toggle('hidden', tab !== 'records');
  document.getElementById('notes-tab-btn').classList.toggle('active', tab === 'notes');
  document.getElementById('records-tab-btn').classList.toggle('active', tab === 'records');
}

async function addSessionNote(event) {
  event.preventDefault();
  const input = document.getElementById('new-session-note-input');
  const { response, data } = await window.apiFetchJson(`/api/patients/${patientDetailState.patientId}/session_note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: input.value }),
  });

  if (!response.ok) {
    window.showToast(data?.error || 'Unable to save session note.', true);
    return;
  }

  event.target.reset();
  window.showToast('Session note added.');
  await loadPatientRecords();
}

async function addMedicalRecord(event) {
  event.preventDefault();
  const { response, data } = await window.apiFetchJson(`/api/patients/${patientDetailState.patientId}/medical_record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: document.getElementById('new-med-title').value,
      details: document.getElementById('new-med-details').value,
    }),
  });

  if (!response.ok) {
    window.showToast(data?.error || 'Unable to save medical record.', true);
    return;
  }

  event.target.reset();
  window.showToast('Medical record added.');
  await loadPatientRecords();
}

function setupPhotoInput(fileId, hiddenId, imgId) {
  const fileInput = document.getElementById(fileId);
  if (!fileInput) return;
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataURL(file);
      setImageValue(imgId, hiddenId, dataUrl);
    } catch (error) {
      window.showToast('Unable to read selected image.', true);
    }
  });
}

function applyPermissions() {
  const sessionForm = document.getElementById('session-note-form');
  const medicalForm = document.getElementById('medical-record-form');
  const sessionPermission = document.getElementById('session-note-permission');
  const medicalPermission = document.getElementById('medical-record-permission');

  if (sessionForm) sessionForm.classList.toggle('hidden', !canAddSessionNote());
  if (medicalForm) medicalForm.classList.toggle('hidden', !canAddMedicalRecord());
  if (sessionPermission) sessionPermission.classList.toggle('hidden', canAddSessionNote());
  if (medicalPermission) medicalPermission.classList.toggle('hidden', canAddMedicalRecord());
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('patient-details-form')?.addEventListener('submit', savePatientDetails);
  document.getElementById('patient-save-btn')?.addEventListener('click', () => {
    document.getElementById('patient-details-form')?.requestSubmit();
  });
  document.getElementById('patient-print-btn')?.addEventListener('click', printPatientProfile);
  document.getElementById('session-note-form')?.addEventListener('submit', addSessionNote);
  document.getElementById('medical-record-form')?.addEventListener('submit', addMedicalRecord);
  document.getElementById('det-laundry-status')?.addEventListener('change', updateLaundryLabel);

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });

  setupPhotoInput('det-photo1-file', 'det-photo1-hidden', 'det-photo1-img');
  setupPhotoInput('det-photo2-file', 'det-photo2-hidden', 'det-photo2-img');
  setupPhotoInput('det-photo3-file', 'det-photo3-hidden', 'det-photo3-img');

  applyPermissions();
  showTab('notes');
  await Promise.all([loadPatient(), loadPatientRecords()]);
});

window.loadPatient = loadPatient;
