const patientsPageState = {
  patients: [],
  search: '',
  user: window.__APP__?.currentUser || { role: 'Guest' },
};

const formatPatientCurrency = (amount) => `Rs ${new Intl.NumberFormat('en-US').format(Number(amount) || 0)}`;
const formatPatientNumber = (amount) => new Intl.NumberFormat('en-US').format(Number(amount) || 0);

function formatDisplayDate(dateString) {
  if (!dateString) return '—';
  let date;
  if (typeof dateString === 'string' && dateString.length === 10) {
    date = new Date(`${dateString}T00:00:00`);
  } else {
    date = new Date(dateString);
  }
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function calculatePatientMetrics(patient) {
  const monthlyFee = parseInt(String(patient.monthlyFee || '0').replace(/,/g, ''), 10) || 0;
  const admissionSource = patient.admissionDate || patient.created_at || '';
  const admissionDate = typeof admissionSource === 'string' && admissionSource.length === 10
    ? new Date(`${admissionSource}T00:00:00`)
    : new Date(admissionSource || new Date());

  const daysElapsed = Math.max(0, Math.floor((new Date() - admissionDate) / (1000 * 60 * 60 * 24)));
  const monthsElapsed = Math.floor(daysElapsed / 30);
  const calculatedFee = Math.floor((monthlyFee / 30) * Math.max(daysElapsed, 1));
  const canteenSpent = Number(patient.canteenSpent || 0);
  const laundry = patient.laundryStatus ? Number(patient.laundryAmount || 0) : 0;
  const totalBill = calculatedFee + canteenSpent + laundry;
  const received = parseInt(String(patient.receivedAmount || '0').replace(/,/g, ''), 10) || 0;
  const balance = totalBill - received;

  return {
    monthlyFee,
    admissionSource,
    daysElapsed,
    monthsElapsed,
    totalBill,
    received,
    balance,
  };
}

function updateStatusLabel(message, tone = 'default') {
  const el = document.getElementById('patients-table-status');
  if (!el) return;
  el.textContent = message;
  el.className = `text-xs font-black uppercase tracking-[0.18em] ${
    tone === 'error' ? 'text-red-500' : tone === 'success' ? 'text-emerald-500' : 'text-slate-400'
  }`;
}

function renderPatientsTable() {
  const tbody = document.getElementById('patients-table-body');
  if (!tbody) return;

  const normalizedSearch = patientsPageState.search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? patientsPageState.patients.filter((patient) => String(patient.name || '').toLowerCase().includes(normalizedSearch))
    : [...patientsPageState.patients];

  const active = filtered.filter((patient) => !patient.isDischarged);
  const discharged = filtered.filter((patient) => patient.isDischarged);
  const ordered = [...active, ...discharged];

  document.getElementById('patients-total-count').textContent = formatPatientNumber(ordered.length);
  document.getElementById('patients-active-count').textContent = formatPatientNumber(active.length);
  document.getElementById('patients-discharged-count').textContent = formatPatientNumber(discharged.length);

  let totalCollection = 0;

  if (ordered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="px-6 py-10 text-center text-sm font-semibold text-slate-400">
          ${normalizedSearch ? 'No patients match your search.' : 'No patient records found.'}
        </td>
      </tr>
    `;
    document.getElementById('patients-total-collection').textContent = 'Rs 0';
    updateStatusLabel(normalizedSearch ? 'Filtered' : 'Empty');
    return;
  }

  tbody.innerHTML = ordered.map((patient, index) => {
    const metrics = calculatePatientMetrics(patient);
    totalCollection += metrics.received;

    const patientId = patient._id || patient.id || '';
    const patientCode = patientId ? `P-${String(patientId).slice(-5).toUpperCase()}` : 'P-XXXXX';

    let balanceClass = 'cleared';
    let balanceText = 'Cleared';
    if (metrics.balance > 0) {
      balanceClass = 'due';
      balanceText = `${formatPatientCurrency(metrics.balance)} Due`;
    } else if (metrics.balance < 0) {
      balanceClass = 'refund';
      balanceText = `${formatPatientCurrency(Math.abs(metrics.balance))} Refund`;
    }

    return `
      <tr class="patient-directory-row ${patient.isDischarged ? 'is-discharged' : ''}">
        <td class="px-3 py-4 text-center text-[11px] font-black text-slate-400">${index + 1}</td>
        <td class="px-3 py-4">
          <div class="font-black text-slate-900">${patient.name || 'Unknown'}</div>
          <div class="mt-1"><span class="patient-id-badge">${patientCode}</span></div>
        </td>
        <td class="px-3 py-4 text-slate-700 font-semibold">${patient.fatherName || patient.guardianName || '—'}</td>
        <td class="px-3 py-4 text-slate-700 font-semibold">${patient.contactNo || patient.contact || patient.phone || '—'}</td>
        <td class="px-3 py-4 text-slate-500 font-bold uppercase tracking-[0.08em]">${formatDisplayDate(metrics.admissionSource)}</td>
        <td class="px-3 py-4 text-slate-700 font-semibold">${patient.area || patient.address || '—'}</td>
        <td class="px-3 py-4 font-black text-slate-900">${formatPatientCurrency(metrics.monthlyFee)}</td>
        <td class="px-3 py-4">
          <div class="font-black text-slate-900">${metrics.daysElapsed} Days</div>
          <div class="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">${metrics.monthsElapsed} Months</div>
        </td>
        <td class="px-3 py-4 font-black text-slate-900">${formatPatientCurrency(metrics.totalBill)}</td>
        <td class="px-3 py-4 font-black text-slate-900">${formatPatientCurrency(metrics.received)}</td>
        <td class="px-3 py-4 text-center">
          <span class="patient-balance-pill ${balanceClass}">${balanceText}</span>
        </td>
        <td class="px-3 py-4">
          <div class="patient-action-group">
            <button type="button" class="patient-action-btn bill" data-action="bill" data-patient-id="${patientId}">
              <i class="fab fa-whatsapp"></i><span>Bill</span>
            </button>
            <a class="patient-action-btn preview" href="/api/patients/${patientId}/bill/preview" target="_blank" rel="noopener">
              <i class="fas fa-eye"></i><span>Preview</span>
            </a>
            <button type="button" class="patient-action-btn ${patient.isDischarged ? 'restore' : 'status'}" data-action="${patient.isDischarged ? 'restore' : 'discharge'}" data-patient-id="${patientId}">
              <i class="fas ${patient.isDischarged ? 'fa-rotate-left' : 'fa-person-walking-arrow-right'}"></i>
              <span>${patient.isDischarged ? 'Restore' : 'Discharge'}</span>
            </button>
            <a class="patient-action-btn legacy" href="/legacy" title="Open legacy workspace for deep editing">
              <i class="fas fa-arrow-up-right-from-square"></i><span>Legacy</span>
            </a>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('patients-total-collection').textContent = formatPatientCurrency(totalCollection);
  updateStatusLabel(`${ordered.length} rows`, 'success');

  tbody.querySelectorAll('[data-action="bill"]').forEach((button) => {
    button.addEventListener('click', () => triggerWhatsAppBill(button));
  });
  tbody.querySelectorAll('[data-action="discharge"]').forEach((button) => {
    button.addEventListener('click', () => updateDischargeStatus(button, true));
  });
  tbody.querySelectorAll('[data-action="restore"]').forEach((button) => {
    button.addEventListener('click', () => updateDischargeStatus(button, false));
  });
}

async function triggerWhatsAppBill(button) {
  const patientId = button.dataset.patientId;
  const confirmed = await window.confirmAction('Send the WhatsApp bill PDF to this patient guardian?');
  if (!confirmed) return;

  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Sending</span>';

  const { response, data } = await window.apiFetchJson('/api/whatsapp/trigger-billing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: patientId }),
  });

  button.disabled = false;
  button.innerHTML = original;

  if (response.ok) {
    window.showToast('Bill sent successfully.');
  } else {
    window.showToast(data?.error || 'Unable to send billing message.', true);
  }
}

async function updateDischargeStatus(button, isDischarged) {
  const patientId = button.dataset.patientId;
  const confirmed = await window.confirmAction(
    isDischarged ? 'Discharge this patient from the directory?' : 'Restore this discharged patient?'
  );
  if (!confirmed) return;

  const payload = {
    isDischarged,
    dischargeDate: isDischarged ? new Date().toISOString() : '',
  };

  const { response, data } = await window.apiFetchJson(`/api/patients/${patientId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    window.showToast(data?.error || 'Unable to update discharge status.', true);
    return;
  }

  window.showToast(isDischarged ? 'Patient discharged.' : 'Patient restored.');
  await loadPatients();
}

async function loadPatients() {
  updateStatusLabel('Loading');
  const tbody = document.getElementById('patients-table-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="px-6 py-10 text-center text-sm font-semibold text-slate-400">
          Loading patient directory...
        </td>
      </tr>
    `;
  }

  const { response, data } = await window.apiFetchJson('/api/patients');
  if (!response.ok || !Array.isArray(data)) {
    updateStatusLabel('Error', 'error');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="px-6 py-10 text-center text-sm font-semibold text-red-500">
            Unable to load patient records right now.
          </td>
        </tr>
      `;
    }
    return;
  }

  patientsPageState.patients = data;
  renderPatientsTable();
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('patients-search-input')?.addEventListener('input', (event) => {
    patientsPageState.search = event.target.value || '';
    renderPatientsTable();
  });

  document.getElementById('refresh-patients-btn')?.addEventListener('click', () => {
    loadPatients();
  });

  await loadPatients();
});

