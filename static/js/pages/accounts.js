let accountsData = [];
let accountsSearchTerm = '';

function formatNumber(value) {
  return new Intl.NumberFormat('en-PK').format(Number(String(value ?? 0).replace(/,/g, '')) || 0);
}

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

function getRecordIds(record) {
  if (!record || typeof record !== 'object') return [];
  return [
    record._id,
    record.id,
    record.patientId,
    record.patient_id,
    record.patient?._id,
    record.patient?.id,
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function resolvePatientId(anyId) {
  if (!anyId) return null;
  const key = String(anyId);
  const inAccounts = (accountsData || []).find((record) => getRecordIds(record).includes(key));
  if (inAccounts) {
    return inAccounts.patientId || inAccounts.patient_id || inAccounts._id || inAccounts.id;
  }
  return anyId;
}

function showSuccessModal(message, isError = false) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, isError);
    return;
  }

  window.alert(message);
}

function showConfirmModal(message) {
  if (typeof window.confirmAction === 'function') {
    return window.confirmAction(message);
  }

  return Promise.resolve(window.confirm(message));
}

async function triggerWhatsAppBill(patientId, button) {
  const confirmed = await showConfirmModal("Are you sure you want to send the WhatsApp Bill (PDF) to this patient's guardian?");
  if (!confirmed) return;

  const originalHtml = button?.innerHTML || '';
  if (button) {
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    button.disabled = true;
  }

  try {
    const response = await fetch('/api/whatsapp/trigger-billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: patientId }),
    });
    const result = await response.json().catch(() => ({}));

    if (response.ok) {
      showSuccessModal('Bill sent successfully!');
    } else {
      showSuccessModal(result.error || 'Failed to send bill.', true);
    }
  } catch (error) {
    console.error('Billing error:', error);
    showSuccessModal('Failed to connect to server.', true);
  } finally {
    if (button) {
      button.innerHTML = originalHtml;
      button.disabled = false;
    }
  }
}

async function printDischargeSlip(id) {
  const resolvedId = resolvePatientId(id);
  if (!resolvedId) {
    showSuccessModal('Patient id not found.', true);
    return;
  }

  window.open(`/api/patients/${resolvedId}/discharge-bill`, '_blank');
}

async function handleDischargeFromTable(id) {
  try {
    const resolvedId = resolvePatientId(id);
    if (!resolvedId) {
      showSuccessModal('Patient id not found.', true);
      return;
    }

    const payload = {
      isDischarged: true,
      dischargeDate: new Date().toISOString(),
    };

    const res = await fetch(`/api/patients/${resolvedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      showSuccessModal(errData.error || 'Failed to discharge patient. Please try again.', true);
      return;
    }

    await printDischargeSlip(resolvedId);
    await renderAccounts();
    showSuccessModal('Patient discharged and saved.');
  } catch (error) {
    console.error('Discharge error:', error);
    showSuccessModal('Network error while discharging.', true);
  }
}

async function revertDischargeFromTable(id) {
  try {
    const resolvedId = resolvePatientId(id);
    if (!resolvedId) {
      showSuccessModal('Patient id not found.', true);
      return;
    }

    const payload = {
      isDischarged: false,
      dischargeDate: null,
    };

    const res = await fetch(`/api/patients/${resolvedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      showSuccessModal(errData.error || 'Failed to restore patient. Please try again.', true);
      return;
    }

    await renderAccounts();
    showSuccessModal('Patient restored to active list.');
  } catch (error) {
    console.error('Revert discharge error:', error);
    showSuccessModal('Network error while restoring patient.', true);
  }
}

async function renderAccounts() {
  try {
    const res = await fetch('/api/accounts/summary');
    if (!res.ok) throw new Error('API Error');

    let rawData = await res.json();
    if (!Array.isArray(rawData)) rawData = [];

    const normalizedSearch = accountsSearchTerm.trim().toLowerCase();
    if (normalizedSearch) {
      rawData = rawData.filter((record) => String(record.name || '').toLowerCase().includes(normalizedSearch));
    }

    const active = rawData.filter((record) => !record.isDischarged);
    const discharged = rawData.filter((record) => record.isDischarged);
    accountsData = [...active, ...discharged];

    const tbody = document.getElementById('accounts-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalPending = 0;
    let totalRefunds = 0;
    let totalCollection = 0;
    let activeCount = 0;

    if (!accountsData.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-6 text-center text-gray-400">${normalizedSearch ? 'No accounts match your search.' : 'No records found.'}</td>
        </tr>
      `;
    }

    accountsData.forEach((patient) => {
      const isDischarged = patient.isDischarged;
      const rowId = patient.patientId || patient.patient_id || patient._id || patient.id;

      const rowContrastClass = isDischarged ? 'bg-gray-50' : '';
      const textClass = 'text-gray-900';
      const subTextClass = 'text-gray-500';
      const valueClass = 'text-gray-900';

      const fee = Number(patient.calculatedFee) || 0;
      const canteen = Number(patient.canteenTotal) || 0;
      const laundry = Number(patient.laundryAmount) || 0;
      const received = Number(String(patient.receivedAmount || '0').replace(/,/g, '')) || 0;
      const totalBill = fee + canteen + laundry;
      const balanceDue = totalBill - received;

      totalCollection += received;
      if (balanceDue > 0) totalPending += balanceDue;
      if (balanceDue < 0) totalRefunds += Math.abs(balanceDue);
      if (!patient.isDischarged) activeCount += 1;

      let balanceHtml = '';
      if (balanceDue > 0) {
        balanceHtml = `<div class="text-[10px] font-black uppercase tracking-widest text-red-600">Due</div><div class="text-sm font-black text-red-600">Rs ${formatNumber(balanceDue)}</div>`;
      } else if (balanceDue < 0) {
        balanceHtml = `<div class="text-[10px] font-black uppercase tracking-widest text-emerald-600">Refund</div><div class="text-sm font-black text-emerald-600">Rs ${formatNumber(Math.abs(balanceDue))}</div>`;
      } else {
        balanceHtml = '<div class="text-sm font-black text-emerald-600">Rs 0</div>';
      }

      tbody.innerHTML += `
        <tr class="group border-b transition hover:bg-gray-50/80 ${isDischarged ? 'discharged-row' : ''} ${rowContrastClass}">
          <td class="border-r border-gray-100 px-5 py-6">
            <div class="text-sm font-extrabold ${textClass}">${patient.name || '—'}</div>
          </td>
          <td class="whitespace-nowrap border-r border-gray-100 px-3 py-6 text-sm font-bold ${textClass}">${patient.fatherName || '—'}</td>
          <td class="whitespace-nowrap border-r border-gray-100 px-3 py-6 text-xs font-black uppercase tracking-tight ${subTextClass}">${patient.admissionDate ? formatDisplayDate(patient.admissionDate) : '—'}</td>
          <td class="whitespace-nowrap border-r border-gray-100 px-3 py-6">
            <div class="text-sm font-black ${valueClass}">Rs ${formatNumber(totalBill)}</div>
            <div class="mt-1 text-[11px] ${subTextClass}">(Fee: ${formatNumber(fee)} + Cant: ${formatNumber(canteen)} + Lnd: ${formatNumber(laundry)})</div>
          </td>
          <td class="whitespace-nowrap border-r border-gray-100 px-3 py-6">
            <div class="text-sm font-black ${valueClass}">Rs ${formatNumber(received)}</div>
            <div class="mt-1 text-[11px] uppercase tracking-wide ${subTextClass}">ADVANCE TOTAL</div>
          </td>
          <td class="whitespace-nowrap border-r border-gray-100 px-3 py-6">
            ${balanceHtml}
          </td>
          <td class="whitespace-nowrap px-3 py-6">
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="event.stopPropagation(); triggerWhatsAppBill('${rowId}', this)" title="Send WhatsApp Bill" class="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#25D366] px-2 py-2 text-[9px] font-black uppercase tracking-wide leading-none text-white shadow-md shadow-green-500/20 transition active:scale-95 hover:bg-[#128C7E]">
                <i class="fab fa-whatsapp text-xs"></i> Bill
              </button>
              <button onclick="event.stopPropagation(); window.open('/api/patients/${rowId}/bill/preview', '_blank')" title="Preview Bill" class="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-blue-500 px-2 py-2 text-[9px] font-black uppercase tracking-wide leading-none text-white shadow-md shadow-blue-500/20 transition active:scale-95 hover:bg-blue-600">
                <i class="fas fa-eye text-xs"></i>
              </button>
              ${
                !isDischarged
                  ? `<button onclick="event.stopPropagation(); handleDischargeFromTable('${rowId}')" class="flex items-center gap-1 rounded-lg bg-[#0b9b65] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white shadow-sm transition active:scale-95 hover:bg-[#098858]">
                      <i class="fas fa-sign-out-alt"></i>
                    </button>`
                  : `<button onclick="event.stopPropagation(); printDischargeSlip('${rowId}')" class="flex items-center gap-1 rounded-lg border border-gray-900 bg-gray-900 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-white shadow-md transition active:scale-95 hover:bg-black">
                      <i class="fas fa-print"></i>
                    </button>
                    <button onclick="event.stopPropagation(); revertDischargeFromTable('${rowId}')" class="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-[9px] font-black uppercase tracking-wide text-gray-700 shadow-sm transition active:scale-95 hover:bg-gray-100">
                      <i class="fas fa-undo"></i>
                    </button>`
              }
            </div>
          </td>
        </tr>
      `;
    });

    document.getElementById('accounts-total-pending').innerText = `Rs ${formatNumber(totalPending)}`;
    document.getElementById('accounts-total-refunds').innerText = `Rs ${formatNumber(totalRefunds)}`;
    document.getElementById('accounts-total-collection').innerText = `Rs ${formatNumber(totalCollection)}`;
    document.getElementById('accounts-active-count').innerText = formatNumber(activeCount);
  } catch (error) {
    console.error(error);
    const tbody = document.getElementById('accounts-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-6 text-center text-red-500">Unable to load archive records.</td>
        </tr>
      `;
    }
  }
}

function handleAccountsSearch(query = '') {
  accountsSearchTerm = query;
  renderAccounts();
}

document.addEventListener('DOMContentLoaded', () => {
  renderAccounts();
});

window.triggerWhatsAppBill = triggerWhatsAppBill;
window.printDischargeSlip = printDischargeSlip;
window.handleDischargeFromTable = handleDischargeFromTable;
window.revertDischargeFromTable = revertDischargeFromTable;
window.renderAccounts = renderAccounts;
window.handleAccountsSearch = handleAccountsSearch;
