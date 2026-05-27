let patientsData = [];
let manualDischargeRows = [];
let manualDischargeSearchTerm = '';
let manualDischargeDraftByPatient = {};

function formatNumber(value) {
  return new Intl.NumberFormat('en-PK').format(Number(String(value ?? 0).replace(/,/g, '')) || 0);
}

function formatDisplayDate(dateString) {
  if (!dateString) return '-';
  let date;
  if (typeof dateString === 'string' && dateString.length === 10) {
    date = new Date(`${dateString}T00:00:00`);
  } else {
    date = new Date(dateString);
  }
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showSuccessModal(message, isError = false) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, isError);
    return;
  }
  window.alert(message);
}

async function showConfirmModal(message) {
  if (typeof window.confirmAction === 'function') {
    return window.confirmAction(message);
  }
  return window.confirm(message);
}

async function fetchPatients() {
  try {
    const res = await fetch('/api/patients');
    if (res.ok) {
      patientsData = await res.json();
    }
  } catch (error) {
    console.error('Patient fetch error', error);
  }
}

function parseAmount(value) {
  const number = Number(String(value || '0').replace(/,/g, '').trim() || '0');
  return Number.isFinite(number) ? number : 0;
}

function calcManualDischargeTotals() {
  const stay = parseAmount(document.getElementById('mdr-stay-days')?.value || 0);
  const monthlyFee = parseAmount(document.getElementById('mdr-monthly-fee')?.value || 0);
  const rehabNextMonth = parseAmount(document.getElementById('mdr-rehab-next')?.value || 0);
  const testAmount = parseAmount(document.getElementById('mdr-test')?.value || 0);
  const canteen = parseAmount(document.getElementById('mdr-canteen')?.value || 0);
  const laundry = parseAmount(document.getElementById('mdr-laundry')?.value || 0);
  const barbarAmount = parseAmount(document.getElementById('mdr-barbar')?.value || 0);
  const medicineAmount = parseAmount(document.getElementById('mdr-medicine')?.value || 0);
  const other = parseAmount(document.getElementById('mdr-other')?.value || 0);
  const received = parseAmount(document.getElementById('mdr-received')?.value || 0);

  const feeAmount = Math.round((monthlyFee / 30) * Math.max(1, stay || 0));
  const gross = feeAmount + rehabNextMonth + testAmount + canteen + laundry + barbarAmount + medicineAmount + other;
  const balance = gross - received;

  const feeEl = document.getElementById('mdr-fee-amount');
  const grossEl = document.getElementById('mdr-gross');
  const balanceEl = document.getElementById('mdr-balance');
  if (feeEl) feeEl.value = feeAmount;
  if (grossEl) grossEl.value = gross;
  if (balanceEl) balanceEl.value = balance;
}

function syncManualStayFromDates() {
  const ad = document.getElementById('mdr-admission-date')?.value;
  const dis = document.getElementById('mdr-discharge-date')?.value;
  if (!ad || !dis) return;
  const a = new Date(`${ad}T00:00:00`);
  const d = new Date(`${dis}T00:00:00`);
  const diff = Math.floor((d - a) / (1000 * 60 * 60 * 24));
  const stay = Math.max(1, diff >= 0 ? diff : 0);
  const stayEl = document.getElementById('mdr-stay-days');
  if (stayEl) stayEl.value = stay;
  calcManualDischargeTotals();
}

function getManualDischargePayload() {
  return {
    patient_id: document.getElementById('mdr-patient-id').value || '',
    patient_name: document.getElementById('mdr-name').value,
    father_name: document.getElementById('mdr-father').value,
    age: document.getElementById('mdr-age').value,
    cnic: document.getElementById('mdr-cnic').value,
    contact_no: document.getElementById('mdr-contact').value,
    area: document.getElementById('mdr-area').value,
    address: document.getElementById('mdr-address').value,
    admission_date: document.getElementById('mdr-admission-date').value,
    discharge_date: document.getElementById('mdr-discharge-date').value,
    stay_days: parseAmount(document.getElementById('mdr-stay-days').value),
    monthly_fee: parseAmount(document.getElementById('mdr-monthly-fee').value),
    fee_amount: parseAmount(document.getElementById('mdr-fee-amount').value),
    rehab_next_month_amount: parseAmount(document.getElementById('mdr-rehab-next').value),
    test_amount: parseAmount(document.getElementById('mdr-test').value),
    canteen_amount: parseAmount(document.getElementById('mdr-canteen').value),
    laundry_amount: parseAmount(document.getElementById('mdr-laundry').value),
    barbar_amount: parseAmount(document.getElementById('mdr-barbar').value),
    medicine_amount: parseAmount(document.getElementById('mdr-medicine').value),
    other_amount: parseAmount(document.getElementById('mdr-other').value),
    received_amount: parseAmount(document.getElementById('mdr-received').value),
    notes: document.getElementById('mdr-notes').value,
  };
}

function fillManualDischargeModal(data = {}) {
  const setVal = (id, value = '') => {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  };

  setVal('mdr-id', data.id || '');
  setVal('mdr-patient-id', data.patient_id || '');
  setVal('mdr-name', data.patient_name || data.name || '');
  setVal('mdr-father', data.father_name || data.fatherName || '');
  setVal('mdr-age', data.age || '');
  setVal('mdr-cnic', data.cnic || '');
  setVal('mdr-contact', data.contact_no || data.contactNo || '');
  setVal('mdr-area', data.area || '');
  setVal('mdr-address', data.address || '');
  setVal('mdr-admission-date', data.admission_date || data.admissionDate || '');
  setVal('mdr-discharge-date', data.discharge_date || new Date().toISOString().split('T')[0]);
  setVal('mdr-stay-days', data.stay_days || 1);
  setVal('mdr-monthly-fee', data.monthly_fee || data.monthlyFee || 0);
  setVal('mdr-fee-amount', data.fee_amount || 0);
  setVal('mdr-rehab-next', data.rehab_next_month_amount || 0);
  setVal('mdr-test', data.test_amount || 0);
  setVal('mdr-canteen', data.canteen_amount || data.canteenSpent || 0);
  setVal('mdr-laundry', data.laundry_amount || data.laundryAmount || 0);
  setVal('mdr-barbar', data.barbar_amount || 0);
  setVal('mdr-medicine', data.medicine_amount || 0);
  setVal('mdr-other', data.other_amount || 0);
  setVal('mdr-received', data.received_amount || data.receivedAmount || 0);
  setVal('mdr-notes', data.notes || '');
  calcManualDischargeTotals();
}

function setManualDischargeDraft(patientId, field, value) {
  const key = String(patientId || '');
  if (!key) return;
  if (!manualDischargeDraftByPatient[key]) manualDischargeDraftByPatient[key] = {};
  manualDischargeDraftByPatient[key][field] = value;
}

function renderManualDischargePatientRows() {
  const tbody = document.getElementById('manual-discharge-patients-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const term = (manualDischargeSearchTerm || '').trim().toLowerCase();
  const filtered = (patientsData || []).filter((p) => {
    if (!term) return true;
    const hay = `${p.name || ''} ${p.fatherName || ''} ${p.contactNo || ''} ${p.cnic || ''}`.toLowerCase();
    return hay.includes(term);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" class="px-3 py-4 text-center text-gray-400">No patients found.</td></tr>';
    return;
  }

  filtered.forEach((p, index) => {
    const pid = String(p._id || p.id || '');
    const draft = manualDischargeDraftByPatient[pid] || {};

    const admissionDateObj = p.admissionDate ? new Date(`${p.admissionDate}T00:00:00`) : new Date();
    const dischargeDateObj = new Date();
    const diff = Math.floor((dischargeDateObj - admissionDateObj) / (1000 * 60 * 60 * 24));
    const autoStayDays = Math.max(1, diff >= 0 ? diff : 0);

    const autoMonthlyFee = p.monthlyFee || 0;
    const autoCanteen = p.canteenSpent || 0;
    const autoReceived = p.receivedAmount || 0;

    const stayDays = draft.stay_days !== undefined ? draft.stay_days : autoStayDays;
    const monthlyFee = draft.monthly_fee !== undefined ? draft.monthly_fee : autoMonthlyFee;
    const canteenAmount = draft.canteen_amount !== undefined ? draft.canteen_amount : autoCanteen;
    const receivedAmount = draft.received_amount !== undefined ? draft.received_amount : autoReceived;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-emerald-50/40';
    tr.innerHTML = `
      <td class="px-2 py-2 text-gray-500">${index + 1}</td>
      <td class="px-2 py-2">
        <div class="font-semibold text-gray-800">${p.name || '-'}</div>
        <div class="text-[10px] text-gray-500">${p.contactNo || p.contact || p.phone || ''}</div>
      </td>
      <td class="px-2 py-2 text-gray-600">${p.admissionDate ? formatDisplayDate(p.admissionDate) : '-'}</td>
      <td class="px-1 py-2"><input type="number" min="1" value="${stayDays}" class="min-w-[3rem] w-12 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','stay_days',this.value)" /></td>
      <td class="px-1 py-2"><input type="number" min="0" value="${monthlyFee}" class="min-w-[4rem] w-16 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','monthly_fee',this.value)" /></td>
      <td class="px-1 py-2"><input type="number" min="0" value="${draft.rehab_next_month_amount || ''}" class="min-w-[4rem] w-16 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','rehab_next_month_amount',this.value)" /></td>
      <td class="px-1 py-2"><input type="number" min="0" value="${draft.test_amount || ''}" class="min-w-[4rem] w-16 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','test_amount',this.value)" /></td>
      <td class="px-1 py-2"><input type="number" min="0" value="${canteenAmount}" class="min-w-[4rem] w-16 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','canteen_amount',this.value)" /></td>
      <td class="px-1 py-2"><input type="number" min="0" value="${draft.laundry_amount || ''}" class="min-w-[4rem] w-16 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','laundry_amount',this.value)" /></td>
      <td class="px-1 py-2"><input type="number" min="0" value="${draft.barbar_amount || ''}" class="min-w-[4rem] w-16 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','barbar_amount',this.value)" /></td>
      <td class="px-1 py-2"><input type="number" min="0" value="${draft.medicine_amount || ''}" class="min-w-[4rem] w-16 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','medicine_amount',this.value)" /></td>
      <td class="px-1 py-2"><input type="number" min="0" value="${draft.other_amount || ''}" class="min-w-[4rem] w-16 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','other_amount',this.value)" /></td>
      <td class="px-1 py-2"><input type="number" min="0" value="${receivedAmount}" class="min-w-[4rem] w-16 rounded border px-1 py-1 text-xs" oninput="setManualDischargeDraft('${pid}','received_amount',this.value)" /></td>
      <td class="px-1 py-2 text-center">
        <button class="whitespace-nowrap rounded-lg border border-gray-900 bg-gray-900 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-white hover:bg-black" onclick="autoSaveAndPrintManualDischarge('${pid}', event)"><i class="fas fa-print mr-1"></i>Print Invoice</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openManualDischargeModal(row = null) {
  const modal = document.getElementById('manual-discharge-modal');
  if (!modal) return;
  fillManualDischargeModal(row || {});
  calcManualDischargeTotals();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeManualDischargeModal() {
  const modal = document.getElementById('manual-discharge-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function loadManualDischargeReceipts() {
  const q = encodeURIComponent((manualDischargeSearchTerm || '').trim());
  const res = await fetch(`/api/manual-discharge-receipts${q ? `?q=${q}` : ''}`);
  manualDischargeRows = res.ok ? await res.json() : [];
  const tbody = document.getElementById('manual-discharge-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (manualDischargeRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">No manual receipts found.</td></tr>';
    return;
  }

  manualDischargeRows.forEach((row, idx) => {
    const gross = parseAmount(row.fee_amount) + parseAmount(row.rehab_next_month_amount) + parseAmount(row.test_amount) + parseAmount(row.canteen_amount) + parseAmount(row.laundry_amount) + parseAmount(row.barbar_amount) + parseAmount(row.medicine_amount) + parseAmount(row.other_amount);
    const balance = parseAmount(row.net_balance);
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-emerald-50/40';
    tr.innerHTML = `
      <td class="px-3 py-3 text-xs text-gray-500">${idx + 1}</td>
      <td class="px-3 py-3">
        <div class="font-semibold text-gray-800">${row.patient_name || '-'}</div>
        <div class="text-xs text-gray-500">${row.contact_no || ''}</div>
      </td>
      <td class="px-3 py-3 text-xs text-gray-600">${row.admission_date || '-'}</td>
      <td class="px-3 py-3 text-xs text-gray-600">${row.discharge_date || '-'}</td>
      <td class="px-3 py-3 text-right font-mono text-sm">${formatNumber(gross)}</td>
      <td class="px-3 py-3 text-right font-mono text-sm">${formatNumber(parseAmount(row.received_amount))}</td>
      <td class="px-3 py-3 text-right font-mono text-sm ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-emerald-600' : 'text-gray-700'}">${formatNumber(Math.abs(balance))}</td>
      <td class="px-3 py-3 text-center whitespace-nowrap">
        <button class="px-1 text-blue-600 hover:text-blue-800" onclick="editManualDischargeReceipt('${row.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="px-1 text-gray-700 hover:text-black" onclick="printManualDischargeReceipt('${row.id}')" title="Print"><i class="fas fa-print"></i></button>
        <button class="px-1 text-red-600 hover:text-red-800" onclick="deleteManualDischargeReceipt('${row.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function renderManualDischargePage() {
  if (!patientsData.length) await fetchPatients();
  const select = document.getElementById('mdr-patient-select');
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="">Select patient...</option>';
    (patientsData || []).forEach((p) => {
      const id = p._id || p.id;
      select.innerHTML += `<option value="${id}">${p.name || 'Unknown'}</option>`;
    });
    if (current) select.value = current;
  }
  renderManualDischargePatientRows();
  await loadManualDischargeReceipts();
}

function handleManualDischargeSearch(value = '') {
  manualDischargeSearchTerm = value;
  renderManualDischargePatientRows();
  loadManualDischargeReceipts();
}

async function saveManualDischargeReceipt(e) {
  e.preventDefault();
  const id = document.getElementById('mdr-id').value;
  const payload = getManualDischargePayload();
  const url = id ? `/api/manual-discharge-receipts/${id}` : '/api/manual-discharge-receipts';
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    showSuccessModal('Failed to save manual discharge receipt.', true);
    return;
  }

  closeManualDischargeModal();
  showSuccessModal(id ? 'Manual discharge receipt updated.' : 'Manual discharge receipt added.');
  await loadManualDischargeReceipts();
}

async function editManualDischargeReceipt(id) {
  const res = await fetch(`/api/manual-discharge-receipts/${id}`);
  if (!res.ok) {
    showSuccessModal('Record not found.', true);
    return;
  }
  const row = await res.json();
  openManualDischargeModal(row);
}

async function deleteManualDischargeReceipt(id) {
  if (!(await showConfirmModal('Delete this manual discharge receipt?'))) return;
  const res = await fetch(`/api/manual-discharge-receipts/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    showSuccessModal('Failed to delete record.', true);
    return;
  }
  showSuccessModal('Record deleted.');
  await loadManualDischargeReceipts();
}

async function printManualDischargeReceipt(id) {
  const row = manualDischargeRows.find((x) => x.id === id) || (await (await fetch(`/api/manual-discharge-receipts/${id}`)).json());
  if (!row) return;

  const fee = parseAmount(row.fee_amount);
  const rehabNext = parseAmount(row.rehab_next_month_amount);
  const testAmount = parseAmount(row.test_amount);
  const canteen = parseAmount(row.canteen_amount);
  const laundry = parseAmount(row.laundry_amount);
  const barbar = parseAmount(row.barbar_amount);
  const medicine = parseAmount(row.medicine_amount);
  const other = parseAmount(row.other_amount);
  const received = parseAmount(row.received_amount);
  const gross = fee + rehabNext + testAmount + canteen + laundry + barbar + medicine + other;
  const balance = parseAmount(row.net_balance);
  const siteProfile = typeof window.getSiteProfile === 'function' ? window.getSiteProfile() : {};
  const safe = typeof window.escapeHtml === 'function' ? window.escapeHtml : (value) => String(value ?? '');
  const logoMarkup = siteProfile.logo_url
    ? `<img src="${safe(siteProfile.logo_url)}" alt="${safe(siteProfile.name || 'Logo')} logo" class="h-12 w-12 object-contain" />`
    : '<i class="fas fa-brain text-[#0b7454]" style="font-size: 40px;"></i>';

  const content = document.getElementById('manual-discharge-print-content');
  if (!content) return;
  content.innerHTML = `
    <div class="mx-auto max-w-2xl bg-white p-[15px] font-sans text-gray-800">
      <div class="mb-4 flex items-center justify-between">
        <div class="w-16">
          ${logoMarkup}
        </div>
        <div class="flex-1 text-center">
          <h1 class="text-[#0b7454]" style="font-size: 28px; line-height: 1; font-weight: 800; letter-spacing: 0.08em;">${safe(siteProfile.short_name || 'PRO')}</h1>
          <p style="font-size: 11px;" class="font-bold tracking-wide text-gray-800">${safe((siteProfile.name || 'Pakistan Recovery Oasis').toUpperCase())}</p>
          <div class="mx-auto my-1 w-1/2 border-t border-gray-400"></div>
          <p class="text-[8px] uppercase tracking-wide text-gray-600">${safe(siteProfile.tagline || 'Addiction Treatment & Psychological Services')}</p>
          <p class="mt-1 text-[9px]"><i class="fas fa-phone-alt mr-1"></i>${safe(siteProfile.phone || '+966-557385262')}</p>
        </div>
        <div class="w-16"></div>
      </div>

      <div class="mb-3 overflow-hidden rounded border-2 border-[#0b7454]" style="font-size: 11px;">
        <div class="grid grid-cols-2 divide-x divide-gray-200">
          <div class="flex items-center border-b border-gray-200 bg-gray-50 px-2 py-1.5"><span class="w-24 font-bold text-gray-900">Patient:</span> <span class="text-gray-700">${row.patient_name || '-'}</span></div>
          <div class="flex items-center border-b border-gray-200 bg-gray-50 px-2 py-1.5"><span class="w-16 font-bold text-gray-900">S/O,D/O:</span> <span class="text-gray-700">${row.father_name || '-'}</span></div>
          <div class="flex items-center border-b border-gray-200 px-2 py-1.5"><span class="w-24 font-bold text-gray-900">Age:</span> <span class="text-gray-700">${row.age || '-'}</span></div>
          <div class="flex items-center border-b border-gray-200 px-2 py-1.5"><span class="w-28 font-bold text-gray-900">Admission:</span> <span class="text-gray-700">${row.admission_date ? new Date(row.admission_date).toLocaleDateString('en-GB').replace(/\//g, '-') : '-'}</span></div>
          <div class="flex items-center bg-gray-50 px-2 py-1.5"><span class="w-28 font-bold text-gray-900">Discharge:</span> <span class="text-gray-700">${row.discharge_date ? new Date(row.discharge_date).toLocaleDateString('en-GB').replace(/\//g, '-') : '-'}</span></div>
          <div class="flex items-center bg-gray-50 px-2 py-1.5"><span class="w-24 font-bold text-gray-900">Days:</span> <span class="text-gray-700">${row.stay_days || 0}</span></div>
        </div>
      </div>

      <div class="mb-2 text-center">
        <h2 class="inline-block border-b-2 border-gray-900 pb-0.5 text-lg font-extrabold">Patient Bill</h2>
      </div>

      <table class="w-full border-collapse border border-gray-400" style="font-size: 11px;">
        <thead class="bg-[#0b7454] text-white">
          <tr>
            <th class="w-10 border border-gray-400 px-2 py-1 text-center font-semibold">#</th>
            <th class="border border-gray-400 px-2 py-1 text-left font-semibold">Description</th>
            <th class="w-28 border border-gray-400 px-2 py-1 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="border border-gray-400 px-2 py-1 text-center">1</td>
            <td class="border border-gray-400 px-2 py-1">Rehab Charges</td>
            <td class="border border-gray-400 px-2 py-1 text-right">${fee ? `${formatNumber(fee)}/-` : '-'}</td>
          </tr>
          ${rehabNext ? `<tr class="bg-gray-50"><td class="border border-gray-400 px-2 py-1 text-center">2</td><td class="border border-gray-400 px-2 py-1">Rehab (Next Month)</td><td class="border border-gray-400 px-2 py-1 text-right">${formatNumber(rehabNext)}/-</td></tr>` : ''}
          ${testAmount ? `<tr><td class="border border-gray-400 px-2 py-1 text-center">${rehabNext ? '3' : '2'}</td><td class="border border-gray-400 px-2 py-1">Test</td><td class="border border-gray-400 px-2 py-1 text-right">${formatNumber(testAmount)}/-</td></tr>` : ''}
          ${canteen ? `<tr class="bg-gray-50"><td class="border border-gray-400 px-2 py-1 text-center">-</td><td class="border border-gray-400 px-2 py-1">Canteen</td><td class="border border-gray-400 px-2 py-1 text-right">${formatNumber(canteen)}/-</td></tr>` : ''}
          ${laundry ? `<tr><td class="border border-gray-400 px-2 py-1 text-center">-</td><td class="border border-gray-400 px-2 py-1">Laundry</td><td class="border border-gray-400 px-2 py-1 text-right">${formatNumber(laundry)}/-</td></tr>` : ''}
          ${barbar ? `<tr class="bg-gray-50"><td class="border border-gray-400 px-2 py-1 text-center">-</td><td class="border border-gray-400 px-2 py-1">Barbar</td><td class="border border-gray-400 px-2 py-1 text-right">${formatNumber(barbar)}/-</td></tr>` : ''}
          ${medicine ? `<tr><td class="border border-gray-400 px-2 py-1 text-center">-</td><td class="border border-gray-400 px-2 py-1">Medicine</td><td class="border border-gray-400 px-2 py-1 text-right">${formatNumber(medicine)}/-</td></tr>` : ''}
          ${other ? `<tr class="bg-gray-50"><td class="border border-gray-400 px-2 py-1 text-center">-</td><td class="border border-gray-400 px-2 py-1">Others/Old</td><td class="border border-gray-400 px-2 py-1 text-right">${formatNumber(other)}/-</td></tr>` : ''}
          <tr class="bg-[#0b7454] font-bold text-white"><td class="border border-gray-400 px-2 py-1"></td><td class="border border-gray-400 px-2 py-1">Total</td><td class="border border-gray-400 px-2 py-1 text-right">${formatNumber(gross)}/-</td></tr>
          <tr class="bg-green-50"><td class="border border-gray-400 px-2 py-1"></td><td class="border border-gray-400 px-2 py-1 font-medium">Received</td><td class="border border-gray-400 px-2 py-1 text-right text-green-700">${received ? `${formatNumber(received)}/-` : '-'}</td></tr>
          <tr class="bg-red-50 font-bold"><td class="border border-gray-400 px-2 py-1"></td><td class="border border-gray-400 px-2 py-1">Remaining</td><td class="border border-gray-400 px-2 py-1 text-right text-red-700">${formatNumber(Math.abs(balance))}/-</td></tr>
        </tbody>
      </table>
      ${row.notes ? `<div class="mt-2 text-[10px] text-gray-600"><span class="font-bold">Notes:</span> ${row.notes}</div>` : ''}
      <div class="mt-3 border-t border-gray-200 pt-2 text-center text-[9px] text-gray-500">Thank you for choosing ${safe(siteProfile.name || 'Pakistan Recovery Oasis')}</div>
    </div>
  `;

  const printEl = document.getElementById('printable-manual-discharge');
  if (!printEl) return;
  printEl.classList.remove('hidden');
  printEl.classList.add('print-active');
  window.print();
  setTimeout(() => {
    printEl.classList.remove('print-active');
    printEl.classList.add('hidden');
  }, 500);
}

function loadManualDischargeFromSelectedPatient() {
  const selectedId = document.getElementById('mdr-patient-select').value;
  if (!selectedId) return;
  const p = (patientsData || []).find((x) => String(x._id || x.id) === String(selectedId));
  if (!p) return;

  const admissionDate = p.admissionDate || new Date().toISOString().split('T')[0];
  const dischargeDate = new Date().toISOString().split('T')[0];
  const diff = Math.floor((new Date(`${dischargeDate}T00:00:00`) - new Date(`${admissionDate}T00:00:00`)) / (1000 * 60 * 60 * 24));
  const stayDays = Math.max(1, diff >= 0 ? diff : 0);

  fillManualDischargeModal({
    patient_id: p._id || p.id,
    patient_name: p.name || '',
    father_name: p.fatherName || '',
    age: p.age || '',
    cnic: p.cnic || '',
    contact_no: p.contactNo || p.contact || p.phone || '',
    area: p.area || '',
    address: p.address || '',
    admission_date: admissionDate,
    discharge_date: dischargeDate,
    stay_days: stayDays,
    monthly_fee: parseAmount(p.monthlyFee || 0),
    rehab_next_month_amount: 0,
    test_amount: 0,
    canteen_amount: parseAmount(p.canteenSpent || 0),
    laundry_amount: p.laundryStatus ? parseAmount(p.laundryAmount || 0) : 0,
    barbar_amount: 0,
    medicine_amount: 0,
    other_amount: 0,
    received_amount: parseAmount(p.receivedAmount || 0),
  });
}

async function autoSaveAndPrintManualDischarge(patientId, evt) {
  const pid = String(patientId || '');
  const p = (patientsData || []).find((x) => String(x._id || x.id) === pid);
  if (!p) {
    showSuccessModal('Patient not found.', true);
    return;
  }

  const draft = manualDischargeDraftByPatient[pid] || {};
  const admissionDate = p.admissionDate ? new Date(`${p.admissionDate}T00:00:00`) : new Date();
  const dischargeDate = new Date();
  const diff = Math.floor((dischargeDate - admissionDate) / (1000 * 60 * 60 * 24));
  const autoStayDays = Math.max(1, diff >= 0 ? diff : 0);

  const autoMonthlyFee = p.monthlyFee || 0;
  const autoCanteen = p.canteenSpent || 0;
  const autoReceived = p.receivedAmount || 0;
  const stayDays = Math.max(1, parseInt(draft.stay_days !== undefined ? draft.stay_days : autoStayDays, 10) || 1);
  const monthlyFee = parseAmount(draft.monthly_fee !== undefined ? draft.monthly_fee : autoMonthlyFee);
  const feeAmount = Math.round((monthlyFee / 30) * stayDays);

  const payload = {
    patient_id: p._id || p.id,
    patient_name: p.name || '',
    father_name: p.fatherName || '',
    age: p.age || '',
    cnic: p.cnic || '',
    contact_no: p.contactNo || p.contact || p.phone || '',
    area: p.area || '',
    address: p.address || '',
    admission_date: p.admissionDate || '',
    discharge_date: new Date().toISOString().split('T')[0],
    stay_days: stayDays,
    monthly_fee: monthlyFee,
    fee_amount: feeAmount,
    rehab_next_month_amount: parseAmount(draft.rehab_next_month_amount || 0),
    test_amount: parseAmount(draft.test_amount || 0),
    canteen_amount: parseAmount(draft.canteen_amount !== undefined ? draft.canteen_amount : autoCanteen),
    laundry_amount: parseAmount(draft.laundry_amount || 0),
    barbar_amount: parseAmount(draft.barbar_amount || 0),
    medicine_amount: parseAmount(draft.medicine_amount || 0),
    other_amount: parseAmount(draft.other_amount || 0),
    received_amount: parseAmount(draft.received_amount !== undefined ? draft.received_amount : autoReceived),
  };

  try {
    const btn = evt?.currentTarget;
    const originalHtml = btn?.innerHTML || '';
    if (btn) {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Saving...';
      btn.disabled = true;
    }

    const res = await fetch('/api/manual-discharge-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      showSuccessModal('Failed to save manual discharge receipt.', true);
      if (btn) {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
      return;
    }

    const data = await res.json();
    const savedId = data.id || data._id;
    await loadManualDischargeReceipts();

    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }

    if (savedId) {
      printManualDischargeReceipt(savedId);
    } else {
      showSuccessModal('Saved, but ID not returned.', true);
    }
  } catch (error) {
    console.error('Save & Print Error:', error);
    showSuccessModal('Error saving receipt.', true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderManualDischargePage();
});

window.calcManualDischargeTotals = calcManualDischargeTotals;
window.syncManualStayFromDates = syncManualStayFromDates;
window.openManualDischargeModal = openManualDischargeModal;
window.closeManualDischargeModal = closeManualDischargeModal;
window.handleManualDischargeSearch = handleManualDischargeSearch;
window.saveManualDischargeReceipt = saveManualDischargeReceipt;
window.editManualDischargeReceipt = editManualDischargeReceipt;
window.deleteManualDischargeReceipt = deleteManualDischargeReceipt;
window.printManualDischargeReceipt = printManualDischargeReceipt;
window.loadManualDischargeFromSelectedPatient = loadManualDischargeFromSelectedPatient;
window.autoSaveAndPrintManualDischarge = autoSaveAndPrintManualDischarge;
window.setManualDischargeDraft = setManualDischargeDraft;
