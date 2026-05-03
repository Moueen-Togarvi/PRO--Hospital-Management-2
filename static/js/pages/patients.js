let patientsData = [];
let patientsSearchTerm = '';
const dischargedPatientIds = new Set();

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
  return [record?._id, record?.id].filter(Boolean).map((value) => String(value));
}

function resolvePatientId(id) {
  const target = String(id || '');
  if (!target) return '';

  const match = patientsData.find((record) => getRecordIds(record).includes(target));
  return match ? target : '';
}

function showSuccessModal(message, isError = false) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, isError);
    return;
  }

  window.alert(message);
}

function showPatientDetail(id) {
  if (!id) {
    showSuccessModal('Patient id not found.', true);
    return;
  }

  window.location.href = `/patients/${id}`;
}

function renderPatientsTable(list) {
  const tbody = document.getElementById('patients-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  const normalizedSearch = patientsSearchTerm.trim().toLowerCase();
  const filteredList = normalizedSearch
    ? list.filter((patient) => (patient.name || '').toLowerCase().includes(normalizedSearch))
    : list;

  if (filteredList.length === 0) {
    const emptyMessage = normalizedSearch ? 'No patients match your search.' : 'No records found.';
    const colspanCount = document.querySelectorAll('#patients-table-headers th').length || 12;
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspanCount}" class="p-6 text-center text-gray-400">${emptyMessage}</td>
      </tr>
    `;

    const totalCollection = document.getElementById('patients-total-collection');
    if (totalCollection) totalCollection.innerText = 'Rs 0';
    return;
  }

  const activePatients = [];
  const dischargedPatients = [];

  filteredList.forEach((patient) => {
    const patientId = patient._id || patient.id;
    const isDischarged = dischargedPatientIds.has(String(patientId)) || patient.isDischarged;
    if (isDischarged) {
      if (patientId) dischargedPatientIds.add(String(patientId));
      dischargedPatients.push({ patient: { ...patient, isDischarged: true }, patientId: String(patientId || '') });
    } else {
      activePatients.push({ patient, patientId: String(patientId || '') });
    }
  });

  const orderedPatients = [...activePatients, ...dischargedPatients];

  let totalCollectionValue = 0;

  orderedPatients.forEach(({ patient, patientId }, index) => {
    const isDischarged = dischargedPatientIds.has(patientId) || patient.isDischarged;
    const rowContrastClass = isDischarged ? 'bg-gray-50' : '';
    const textClass = 'text-gray-900';
    const subTextClass = 'text-gray-500';
    const valueClass = 'text-gray-900';

    const monthlyFeeRaw = parseInt(String(patient.monthlyFee || '0').replace(/,/g, ''), 10) || 0;
    const admissionStr = patient.admissionDate || patient.created_at || '';
    let admissionDt;

    if (admissionStr && typeof admissionStr === 'string' && admissionStr.length === 10) {
      admissionDt = new Date(`${admissionStr}T00:00:00`);
    } else {
      admissionDt = admissionStr ? new Date(admissionStr) : new Date();
    }

    const today = new Date();
    const daysDiff = Math.floor((today - admissionDt) / (1000 * 60 * 60 * 24));
    const daysElapsed = daysDiff >= 0 ? daysDiff : 0;
    const months = Math.floor(daysElapsed / 30);

    const calculatedFee = Math.floor((monthlyFeeRaw / 30.0) * Math.max(daysElapsed, 1));
    const canteenSpentValue = Number(patient.canteenSpent || 0);
    const laundryValue = patient.laundryStatus ? Number(patient.laundryAmount || 0) : 0;
    const totalBillValue = calculatedFee + canteenSpentValue + laundryValue;
    const receivedValue = parseInt(String(patient.receivedAmount || '0').replace(/,/g, ''), 10) || 0;
    const balanceDue = totalBillValue - receivedValue;

    totalCollectionValue += receivedValue;

    const stayDisplay = `<div class="text-sm font-black ${valueClass}">${daysElapsed} Days</div>
      <div class="text-[9px] font-bold uppercase tracking-tight ${subTextClass}">${months} Months</div>`;

    let balanceHtml = '';
    if (balanceDue > 0) {
      balanceHtml = `<div class="${isDischarged ? 'border-gray-100 bg-gray-50 text-gray-400' : 'border-red-100 bg-red-50 text-red-600 shadow-sm'} inline-block rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider">Rs. ${formatNumber(balanceDue)} Due</div>`;
    } else if (balanceDue < 0) {
      balanceHtml = `<div class="${isDischarged ? 'border-gray-100 bg-gray-50 text-gray-400' : 'border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm'} inline-block rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider">Rs. ${formatNumber(Math.abs(balanceDue))} Refund</div>`;
    } else {
      balanceHtml = '<div class="inline-block rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-gray-400">Cleared</div>';
    }

    const formattedPid = patientId ? `P-${patientId.slice(-5).toUpperCase()}` : 'P-XXXXX';

    const row = document.createElement('tr');
    row.className = `group cursor-pointer border-b transition hover:bg-gray-50/80 ${isDischarged ? 'discharged-row' : ''} ${rowContrastClass}`;
    row.onclick = (event) => {
      if (event.target.closest('button, a, details, summary')) return;
      showPatientDetail(patientId);
    };

    row.innerHTML = `
      <td class="border-r border-gray-100 px-2 py-3 text-center text-[10px] font-bold ${subTextClass}">${index + 1}</td>
      <td class="w-[105px] border-r border-gray-100 px-2 py-3 text-center">
        <div class="text-sm font-extrabold ${textClass}">${patient.name || '—'}</div>
        <div class="mt-0.5 text-[9px] font-bold tracking-tight ${subTextClass}">${formattedPid}</div>
      </td>
      <td class="w-[100px] border-r border-gray-100 px-2 py-3 text-center text-[11px] font-bold ${textClass}">${patient.fatherName || '—'}</td>
      <td class="w-[95px] border-r border-gray-100 px-2 py-3 text-center text-[11px] font-bold ${textClass}">${patient.contactNo || patient.contact || patient.phone || '—'}</td>
      <td class="border-r border-gray-100 px-2 py-3 text-[10px] font-black uppercase tracking-tight ${subTextClass}">${admissionStr ? formatDisplayDate(admissionStr) : '—'}</td>
      <td class="max-w-[90px] whitespace-nowrap truncate border-r border-gray-100 px-2 py-3 text-[11px] font-bold ${textClass}">${patient.area || patient.address || '—'}</td>
      <td class="border-r border-gray-100 px-2 py-3 text-[11px] font-black ${valueClass}">Rs. ${formatNumber(monthlyFeeRaw)}</td>
      <td class="border-r border-gray-100 px-2 py-3">${stayDisplay}</td>
      <td class="border-r border-gray-100 px-2 py-3 text-[11px] font-black ${textClass}">Rs. ${formatNumber(totalBillValue)}</td>
      <td class="border-r border-gray-100 px-2 py-3 text-[11px] font-black ${textClass}">Rs. ${formatNumber(receivedValue)}</td>
      <td class="whitespace-nowrap border-r border-gray-100 px-2 py-3 text-center">
        <div class="flex items-center justify-center">
          ${balanceHtml}
        </div>
      </td>
      <td class="w-[120px] whitespace-nowrap overflow-visible px-2 py-3">
        <div class="flex flex-nowrap items-center justify-center gap-1.5 overflow-visible">
          <button onclick="event.stopPropagation(); triggerWhatsAppBill('${patientId}')" title="Send WhatsApp Bill" class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#25D366] px-2 py-2 text-[9px] font-black uppercase tracking-wide leading-none text-white shadow-md shadow-green-500/20 transition active:scale-95 hover:bg-[#128C7E]">
            <i class="fab fa-whatsapp text-xs"></i> Bill
          </button>
          <button onclick="event.stopPropagation(); window.open('/api/patients/${patientId}/bill/preview', '_blank')" title="Preview Bill" class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-500 px-2 py-2 text-[9px] font-black uppercase tracking-wide leading-none text-white shadow-md shadow-blue-500/20 transition active:scale-95 hover:bg-blue-600">
            <i class="fas fa-eye text-xs"></i>
          </button>
          ${
            !isDischarged
              ? `<button onclick="event.stopPropagation(); handleDischargeFromTable('${patientId}')" class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#e63946] px-2 py-2 text-[9px] font-black uppercase tracking-wide leading-none text-white shadow-md shadow-red-500/20 transition active:scale-95 hover:bg-[#d62828]">
                  <i class="fas fa-sign-out-alt"></i>
                  Discharge
                </button>`
              : `<button onclick="event.stopPropagation(); printDischargeSlip('${patientId}')" class="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-900 bg-gray-900 px-2 py-1.5 text-[9px] font-black uppercase tracking-wide text-white shadow-md transition active:scale-95 hover:bg-black">
                  <i class="fas fa-print"></i> Print
                </button>
                <details class="relative">
                  <summary onclick="event.stopPropagation();" class="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100">
                    <i class="fas fa-ellipsis-v text-[11px]"></i>
                  </summary>
                  <div class="absolute right-0 z-50 mt-1 min-w-[120px] rounded-lg border border-gray-200 bg-white shadow-lg">
                    <button onclick="event.stopPropagation(); revertDischargeFromTable('${patientId}')" class="w-full rounded-lg px-3 py-2 text-left text-[11px] font-bold text-gray-700 hover:bg-gray-50">
                      <i class="fas fa-undo mr-1"></i> Restore
                    </button>
                  </div>
                </details>`
          }
        </div>
      </td>
    `;

    tbody.appendChild(row);
  });

  const totalRecords = document.getElementById('patients-total-count');
  const activeCount = document.getElementById('patients-active-count');
  const dischargedCount = document.getElementById('patients-discharged-count');
  const totalCollection = document.getElementById('patients-total-collection');

  if (totalRecords) totalRecords.innerText = formatNumber(orderedPatients.length);
  if (activeCount) activeCount.innerText = formatNumber(activePatients.length);
  if (dischargedCount) dischargedCount.innerText = formatNumber(dischargedPatients.length);
  if (totalCollection) totalCollection.innerText = `Rs ${formatNumber(totalCollectionValue)}`;
}

async function triggerWhatsAppBill(id) {
  if (!id) {
    showSuccessModal('Patient id not found.', true);
    return;
  }

  try {
    const res = await fetch('/api/whatsapp/trigger-billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: id }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      showSuccessModal(data.message || 'Billing queued successfully.');
    } else {
      showSuccessModal(data.error || 'Unable to send billing message.', true);
    }
  } catch (error) {
    console.error('Billing error:', error);
    showSuccessModal('Network error while sending bill.', true);
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

window.handleDischargeFromTable = async function (id) {
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

    dischargedPatientIds.add(String(resolvedId));
    patientsData = patientsData.map((patient) => {
      if (getRecordIds(patient).includes(String(resolvedId))) {
        return { ...patient, isDischarged: true, dischargeDate: payload.dischargeDate };
      }
      return patient;
    });

    renderPatientsTable(patientsData);
    await printDischargeSlip(resolvedId);
    showSuccessModal('Patient discharged and saved.');
  } catch (error) {
    console.error('Discharge error:', error);
    showSuccessModal('Network error while discharging.', true);
  }
};

window.revertDischargeFromTable = async function (id) {
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

    dischargedPatientIds.delete(String(resolvedId));
    patientsData = patientsData.map((patient) => {
      if (getRecordIds(patient).includes(String(resolvedId))) {
        return { ...patient, isDischarged: false, dischargeDate: null };
      }
      return patient;
    });

    renderPatientsTable(patientsData);
    showSuccessModal('Patient restored to active list.');
  } catch (error) {
    console.error('Revert discharge error:', error);
    showSuccessModal('Network error while restoring patient.', true);
  }
};

window.handlePatientsSearch = function handlePatientsSearch(value) {
  patientsSearchTerm = value || '';
  renderPatientsTable(patientsData);
};

async function loadPatients() {
  const tbody = document.getElementById('patients-table-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="p-6 text-center text-gray-400">Loading patient directory...</td>
      </tr>
    `;
  }

  try {
    const res = await fetch('/api/patients');
    const data = await res.json().catch(() => []);

    if (!res.ok || !Array.isArray(data)) {
      throw new Error('Unable to load patient records.');
    }

    patientsData = data;
    renderPatientsTable(patientsData);
  } catch (error) {
    console.error('Patients load error:', error);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="p-6 text-center text-red-500">Unable to load patient records right now.</td>
        </tr>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadPatients();
});

window.triggerWhatsAppBill = triggerWhatsAppBill;
window.printDischargeSlip = printDischargeSlip;
window.showPatientDetail = showPatientDetail;
window.loadPatients = loadPatients;
