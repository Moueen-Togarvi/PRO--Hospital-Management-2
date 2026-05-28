const patientDetailState = {
  patientId: window.__APP__?.patientId || '',
  currentUser: window.__APP__?.currentUser || { role: 'Guest' },
  patient: null,
  records: [],
  activeRecordType: 'session_note',
  editingRecordId: null,
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
      <div class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">Patient</div>
      <div class="mt-1 text-sm font-black text-slate-950">${patient.name || 'Unknown'}</div>
      <div class="mt-0.5 text-xs font-bold text-slate-700">${patient.fatherName || patient.guardianName || '—'}</div>
    </div>
    <div class="summary-stat">
      <div class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">Status</div>
      <div class="mt-1 text-sm font-black ${patient.isDischarged ? 'text-slate-700' : 'text-emerald-700'}">${patient.isDischarged ? 'Discharged' : 'Active'}</div>
    </div>
    <div class="summary-stat">
      <div class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">Monthly Fee</div>
      <div class="mt-1 text-sm font-black text-slate-950">Rs ${new Intl.NumberFormat('en-US').format(monthlyFee)}</div>
    </div>
    <div class="summary-stat">
      <div class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">Received</div>
      <div class="mt-1 text-sm font-black text-slate-950">Rs ${new Intl.NumberFormat('en-US').format(received)}</div>
    </div>
    <div class="summary-stat">
      <div class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">Balance</div>
      <div class="mt-1 text-sm font-black ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-emerald-600' : 'text-slate-700'}">
        Rs ${new Intl.NumberFormat('en-US').format(Math.abs(balance))}
        <span class="text-xs">${balance > 0 ? 'Due' : balance < 0 ? 'Refund' : 'Cleared'}</span>
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
    <div class="call-day-label">Weekly Call Day</div>
    <div class="call-day-value">${callDayName}</div>
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

function getPatientDisplayId(patient) {
  const savedId = String(patient?.idNo || '').trim();
  if (savedId) return savedId;

  const rawId = String(patient?._id || patientDetailState.patientId || '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  return rawId ? `P-${rawId.slice(-6)}` : 'P-000000';
}

function populatePatient(patient) {
  patientDetailState.patient = patient;
  const displayId = getPatientDisplayId(patient);
  document.getElementById('patient-detail-title').textContent = patient.name || 'Patient Detail';
  const subtitle = document.getElementById('patient-detail-subtitle');
  subtitle.textContent = displayId;
  subtitle.title = patient._id || displayId;
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

function escapeRecordHtml(value) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function recordTypeLabel(type = patientDetailState.activeRecordType) {
  return type === 'medical_record' ? 'Medical Records' : 'Session Notes';
}

function canManageRecordType(type = patientDetailState.activeRecordType) {
  return type === 'medical_record' ? canAddMedicalRecord() : canAddSessionNote();
}

function getRecordRoute(type, recordId = '') {
  const suffix = recordId ? `/${recordId}` : '';
  return `/api/patients/${patientDetailState.patientId}/${type}${suffix}`;
}

function formatRecordDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function setRecordFormMode(record = null) {
  const isMedical = patientDetailState.activeRecordType === 'medical_record';
  const titleInput = document.getElementById('records-modal-title-input');
  const textInput = document.getElementById('records-modal-text-input');
  const saveButton = document.getElementById('records-modal-save');
  const cancelButton = document.getElementById('records-modal-cancel-edit');

  patientDetailState.editingRecordId = record?._id || null;
  if (titleInput) {
    titleInput.classList.toggle('hidden', !isMedical);
    titleInput.value = record?.title || '';
  }
  if (textInput) {
    textInput.value = record?.text || record?.details || '';
    textInput.placeholder = isMedical ? 'Write medical record details...' : 'Write psychology / counseling note...';
  }
  if (saveButton) {
    saveButton.innerHTML = patientDetailState.editingRecordId
      ? '<i class="fas fa-check"></i><span>Update Record</span>'
      : '<i class="fas fa-plus"></i><span>Add Record</span>';
  }
  if (cancelButton) cancelButton.classList.toggle('hidden', !patientDetailState.editingRecordId);
}

function renderRecordsModal() {
  const list = document.getElementById('records-modal-list');
  const title = document.getElementById('records-modal-title');
  const kicker = document.getElementById('records-modal-kicker');
  const form = document.getElementById('records-modal-form');
  const permission = document.getElementById('records-modal-permission');
  const records = patientDetailState.records.filter((record) => record.type === patientDetailState.activeRecordType);
  const canManage = canManageRecordType();

  if (title) title.textContent = recordTypeLabel();
  if (kicker) kicker.textContent = canManage ? 'Add, edit, or delete' : 'View records';
  if (form) form.classList.toggle('records-form-disabled', !canManage);
  if (permission) {
    permission.textContent = patientDetailState.activeRecordType === 'medical_record'
      ? 'Only Admin and Doctor roles can add, edit, or delete medical records.'
      : 'Only Admin and Psychologist roles can add, edit, or delete session notes.';
    permission.classList.toggle('hidden', canManage);
  }

  if (!list) return;

  if (records.length === 0) {
    list.innerHTML = `<div class="records-empty">No ${recordTypeLabel().toLowerCase()} found yet.</div>`;
    setRecordFormMode();
    return;
  }

  list.innerHTML = records.map((record) => {
    const isMedical = record.type === 'medical_record';
    const heading = isMedical ? (record.title || 'Medical Record') : 'Session Note';
    const body = isMedical ? (record.details || '') : (record.text || '');
    const actionHtml = canManage ? `
      <div class="records-item-actions">
        <button type="button" class="records-mini-btn records-edit-btn" data-edit-record="${escapeRecordHtml(record._id)}">
          <i class="fas fa-pen"></i> Edit
        </button>
        <button type="button" class="records-mini-btn records-delete-btn" data-delete-record="${escapeRecordHtml(record._id)}">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    ` : '';

    return `
      <article class="records-item">
        <div class="records-item-top">
          <div>
            <div class="records-date">${escapeRecordHtml(formatRecordDate(record.date))} • ${escapeRecordHtml(record.recorded_by || 'Unknown')}</div>
            <h4>${escapeRecordHtml(heading)}</h4>
          </div>
          ${actionHtml}
        </div>
        <p>${escapeRecordHtml(body)}</p>
      </article>
    `;
  }).join('');

  list.querySelectorAll('[data-edit-record]').forEach((button) => {
    button.addEventListener('click', () => {
      const record = patientDetailState.records.find((item) => item._id === button.dataset.editRecord);
      if (record) setRecordFormMode(record);
    });
  });

  list.querySelectorAll('[data-delete-record]').forEach((button) => {
    button.addEventListener('click', () => deleteRecord(button.dataset.deleteRecord));
  });

  if (!patientDetailState.editingRecordId) setRecordFormMode();
}

async function loadPatientRecords() {
  const { response, data } = await window.apiFetchJson(`/api/patients/${patientDetailState.patientId}/records`);
  if (!response.ok || !Array.isArray(data)) {
    patientDetailState.records = [];
    renderRecordsModal();
    return;
  }

  patientDetailState.records = data;
  renderRecordsModal();
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

async function deletePatient() {
  if (!isAdminUser()) {
    window.showToast('Only admins can delete patients.', true);
    return;
  }

  const patientName = patientDetailState.patient?.name || 'this patient';
  const confirmed = typeof window.confirmAction === 'function'
    ? await window.confirmAction(`Delete ${patientName}? This will remove the patient from active records.`)
    : window.confirm(`Delete ${patientName}? This will remove the patient from active records.`);

  if (!confirmed) return;

  const button = document.getElementById('patient-delete-btn');
  if (button) {
    button.disabled = true;
  }

  try {
    const { response, data } = await window.apiFetchJson(`/api/patients/${patientDetailState.patientId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      window.showToast(data?.error || 'Unable to delete patient.', true);
      return;
    }

    window.showToast(data?.message || 'Patient deleted successfully.');
    window.setTimeout(() => {
      window.location.href = '/patients';
    }, 350);
  } catch (error) {
    window.showToast('Unable to delete patient.', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

function openRecordsModal(type) {
  patientDetailState.activeRecordType = type === 'medical_record' ? 'medical_record' : 'session_note';
  const modal = document.getElementById('patient-records-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  setRecordFormMode();
  renderRecordsModal();
}

function closeRecordsModal() {
  const modal = document.getElementById('patient-records-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  setRecordFormMode();
}

async function saveRecordFromModal(event) {
  event.preventDefault();
  if (!canManageRecordType()) {
    window.showToast('You do not have permission to change these records.', true);
    return;
  }

  const isMedical = patientDetailState.activeRecordType === 'medical_record';
  const title = document.getElementById('records-modal-title-input')?.value.trim() || '';
  const text = document.getElementById('records-modal-text-input')?.value.trim() || '';

  if (!text && (!isMedical || !title)) {
    window.showToast(isMedical ? 'Add a title or details first.' : 'Add a session note first.', true);
    return;
  }

  const payload = isMedical ? { title, details: text } : { text };
  const recordId = patientDetailState.editingRecordId;
  const { response, data } = await window.apiFetchJson(getRecordRoute(patientDetailState.activeRecordType, recordId), {
    method: recordId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    window.showToast(data?.error || 'Unable to save record.', true);
    return;
  }

  event.target.reset();
  setRecordFormMode();
  window.showToast(data?.message || 'Record saved.');
  await loadPatientRecords();
}

async function deleteRecord(recordId) {
  if (!canManageRecordType()) {
    window.showToast('You do not have permission to delete this record.', true);
    return;
  }

  const confirmed = typeof window.confirmAction === 'function'
    ? await window.confirmAction(`Delete this ${recordTypeLabel().toLowerCase().slice(0, -1)}?`)
    : window.confirm(`Delete this ${recordTypeLabel().toLowerCase().slice(0, -1)}?`);
  if (!confirmed) return;

  const { response, data } = await window.apiFetchJson(getRecordRoute(patientDetailState.activeRecordType, recordId), {
    method: 'DELETE',
  });

  if (!response.ok) {
    window.showToast(data?.error || 'Unable to delete record.', true);
    return;
  }

  if (patientDetailState.editingRecordId === recordId) setRecordFormMode();
  window.showToast(data?.message || 'Record deleted.');
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
  const deleteButton = document.getElementById('patient-delete-btn');

  if (deleteButton) deleteButton.classList.toggle('hidden', !isAdminUser());
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('patient-details-form')?.addEventListener('submit', savePatientDetails);
  document.getElementById('patient-save-btn')?.addEventListener('click', () => {
    document.getElementById('patient-details-form')?.requestSubmit();
  });
  document.getElementById('patient-print-btn')?.addEventListener('click', printPatientProfile);
  document.getElementById('patient-delete-btn')?.addEventListener('click', deletePatient);
  document.getElementById('patient-session-notes-btn')?.addEventListener('click', () => openRecordsModal('session_note'));
  document.getElementById('patient-medical-records-btn')?.addEventListener('click', () => openRecordsModal('medical_record'));
  document.getElementById('records-modal-form')?.addEventListener('submit', saveRecordFromModal);
  document.getElementById('records-modal-close')?.addEventListener('click', closeRecordsModal);
  document.getElementById('records-modal-cancel-edit')?.addEventListener('click', () => setRecordFormMode());
  document.getElementById('patient-records-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'patient-records-modal') closeRecordsModal();
  });
  document.getElementById('det-laundry-status')?.addEventListener('change', updateLaundryLabel);

  setupPhotoInput('det-photo1-file', 'det-photo1-hidden', 'det-photo1-img');
  setupPhotoInput('det-photo2-file', 'det-photo2-hidden', 'det-photo2-img');
  setupPhotoInput('det-photo3-file', 'det-photo3-hidden', 'det-photo3-img');

  applyPermissions();
  await Promise.all([loadPatient(), loadPatientRecords()]);
});

window.loadPatient = loadPatient;
