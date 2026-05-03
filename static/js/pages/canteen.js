const currentUser = window.__APP__?.currentUser || { role: 'Guest' };

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
  }).format(Number(amount) || 0);

function initDualScrollbars() {
  document.querySelectorAll('.overflow-x-auto').forEach((element) => {
    if (element.parentElement?.classList.contains('dual-scrollbar-wrapper')) return;
    if (element.scrollWidth <= element.clientWidth) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'dual-scrollbar-wrapper';

    const topScroll = document.createElement('div');
    topScroll.className = 'dual-scrollbar-top';

    const topScrollInner = document.createElement('div');
    topScrollInner.className = 'dual-scrollbar-top-inner';
    topScroll.appendChild(topScrollInner);

    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(topScroll);
    wrapper.appendChild(element);

    const syncScroll = (source, target) => {
      target.scrollLeft = source.scrollLeft;
    };

    topScroll.addEventListener('scroll', () => syncScroll(topScroll, element));
    element.addEventListener('scroll', () => syncScroll(element, topScroll));

    const updateTopScrollWidth = () => {
      topScrollInner.style.width = `${element.scrollWidth}px`;
      topScroll.style.display = element.scrollWidth <= element.clientWidth ? 'none' : 'block';
    };

    updateTopScrollWidth();

    const resizeObserver = new ResizeObserver(updateTopScrollWidth);
    resizeObserver.observe(element);
  });
}

async function renderCanteenBreakdown() {
  const monthSelect = document.getElementById('canteen-month-select');
  const yearSelect = document.getElementById('canteen-year-select');
  if (!monthSelect || !yearSelect) return;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  monthSelect.value = String(currentMonth);
  yearSelect.innerHTML = '';

  for (let year = currentYear; year >= currentYear - 2; year -= 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.appendChild(option);
  }
  yearSelect.value = String(currentYear);

  await loadCanteenMonthlyTable();
}

async function loadCanteenMonthlyTable() {
  try {
    const month = document.getElementById('canteen-month-select')?.value;
    const year = document.getElementById('canteen-year-select')?.value;
    if (!month || !year) return;

    const res = await fetch(`/api/canteen/monthly-table?month=${month}&year=${year}`);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API returned ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const monthDisplay = document.getElementById('canteen-month-display');
    const tableHeader = document.getElementById('canteen-table-header');
    const tableBody = document.getElementById('canteen-monthly-body');
    if (!monthDisplay || !tableHeader || !tableBody) return;

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    monthDisplay.textContent = `${monthNames[Number(month) - 1]} ${year} - ${data.daysInMonth} days`;

    let headerHTML = `
      <th class="sticky left-0 z-10 min-w-[150px] bg-emerald-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-emerald-900">Name</th>
      <th class="min-w-[120px] px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-emerald-900">Old Balance</th>
    `;

    for (let day = 1; day <= data.daysInMonth; day += 1) {
      headerHTML += `<th class="min-w-[60px] px-3 py-3 text-center text-xs font-bold uppercase text-emerald-900">${day}</th>`;
    }

    headerHTML += `
      <th class="min-w-[100px] px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-emerald-900">Other</th>
      <th class="min-w-[120px] bg-emerald-100 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-emerald-900">Month Total</th>
      <th class="min-w-[120px] bg-emerald-100 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-emerald-900">Total</th>
    `;
    tableHeader.innerHTML = headerHTML;

    const isAdmin = currentUser.role === 'Admin';
    const isCanteen = currentUser.role === 'Canteen';
    tableBody.innerHTML = '';

    const activePatientsOnly = (data.patients || []).filter((patient) => {
      const flag = patient?.isDischarged;
      if (typeof flag === 'boolean') return !flag;
      return !['true', '1', 'yes'].includes(String(flag || '').trim().toLowerCase());
    });

    activePatientsOnly.forEach((patient) => {
      const row = document.createElement('tr');
      row.className = patient.isDischarged ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50';

      const nameClass = patient.exceedsBalance ? 'bg-red-500 text-white font-bold' : 'bg-white';
      const dischargedBadge = patient.isDischarged
        ? '<span class="ml-2 rounded bg-gray-300 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-600">Discharged</span>'
        : '';

      const oldBalanceEditable = isAdmin ? 'contenteditable="true"' : '';
      const oldBalanceClass = isAdmin ? 'editable-cell cursor-text hover:bg-blue-50' : '';
      const overrideIndicator = patient.hasManualOverride
        ? '<i class="fas fa-edit ml-1 text-xs text-blue-500" title="Manually edited"></i>'
        : '';

      row.innerHTML = `
        <td class="sticky left-0 z-10 whitespace-nowrap border-r px-4 py-3 ${nameClass}">
          ${patient.name} ${dischargedBadge}
        </td>
        <td class="px-4 py-3 text-center font-semibold text-gray-700 ${oldBalanceClass}"
            ${oldBalanceEditable}
            data-patient-id="${patient.id}"
            data-entry-type="old-balance"
            data-original="${patient.oldBalance}"
            onblur="saveCanteenOldBalance(this, ${month}, ${year})"
            onkeydown="handleCellKeydown(event)"
            title="${patient.hasManualOverride ? `Manual override (calculated: ${formatCurrency(patient.calculatedBalance)})` : 'Auto-calculated'}">
          ${formatCurrency(patient.oldBalance)}${overrideIndicator}
        </td>
      `;

      for (let day = 1; day <= data.daysInMonth; day += 1) {
        const amount = patient.dailyEntries[day] || '';
        const displayValue = amount ? formatCurrency(amount) : '';
        const isEditable = isAdmin || (isCanteen && !amount);
        const editableAttr = isEditable ? 'contenteditable="true"' : '';
        const cellClass = isEditable ? 'editable-cell cursor-text hover:bg-blue-50' : 'bg-gray-100';

        row.innerHTML += `
          <td class="px-2 py-2 text-center text-sm ${cellClass}"
              ${editableAttr}
              data-patient-id="${patient.id}"
              data-day="${day}"
              data-entry-type="daily"
              data-original="${amount}"
              onblur="saveCanteenEntry(this, ${month}, ${year})"
              onkeydown="handleCellKeydown(event)">
            ${displayValue}
          </td>
        `;
      }

      const otherAmount = patient.other || '';
      const otherDisplay = otherAmount ? formatCurrency(otherAmount) : '';
      const otherEditable = isAdmin || (isCanteen && !otherAmount);
      const otherEditableAttr = otherEditable ? 'contenteditable="true"' : '';
      const otherCellClass = otherEditable ? 'editable-cell cursor-text hover:bg-blue-50' : 'bg-gray-100';

      row.innerHTML += `
        <td class="px-3 py-2 text-center text-sm font-medium ${otherCellClass}"
            ${otherEditableAttr}
            data-patient-id="${patient.id}"
            data-entry-type="other"
            data-original="${otherAmount}"
            onblur="saveCanteenEntry(this, ${month}, ${year})"
            onkeydown="handleCellKeydown(event)">
          ${otherDisplay}
        </td>
        <td class="bg-emerald-50 px-4 py-3 text-center font-bold text-gray-900">
          ${formatCurrency(patient.monthTotal)}
        </td>
        <td class="bg-emerald-50 px-4 py-3 text-center font-bold text-gray-900">
          ${formatCurrency(patient.total)}
        </td>
      `;

      tableBody.appendChild(row);
    });

    setTimeout(initDualScrollbars, 50);
  } catch (error) {
    console.error('Error loading canteen table:', error);
    window.alert('Failed to load canteen data');
  }
}

function handleCellKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.target.blur();
  }

  const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'];
  if (!allowedKeys.includes(event.key) && (event.key < '0' || event.key > '9')) {
    event.preventDefault();
  }
}

async function saveCanteenOldBalance(cell, month, year) {
  const patientId = cell.dataset.patientId;
  const originalValue = cell.dataset.original || '';
  let newValueStr = cell.textContent.trim().replace(/[^\d]/g, '');

  if (!newValueStr) newValueStr = '0';

  const newAmount = parseInt(newValueStr, 10);
  const originalAmount = originalValue ? parseInt(originalValue, 10) : 0;

  if (newAmount === originalAmount && originalValue !== '') {
    cell.textContent = originalAmount ? formatCurrency(originalAmount) : '';
    return;
  }
  if (newAmount === 0 && originalValue === '') {
    cell.textContent = '';
    return;
  }

  try {
    const res = await fetch('/api/canteen/old-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: patientId,
        month,
        year,
        old_balance: newAmount,
      }),
    });

    if (res.ok) {
      cell.textContent = formatCurrency(newAmount);
      cell.dataset.original = String(newAmount);
      if (!cell.querySelector('.fa-edit')) {
        cell.innerHTML += '<i class="fas fa-edit ml-1 text-xs text-blue-500" title="Manually edited"></i>';
      }
      await loadCanteenMonthlyTable();
    } else {
      const errorText = await res.text();
      window.alert(`Failed to save old balance: ${errorText}`);
      cell.textContent = originalAmount ? formatCurrency(originalAmount) : '';
    }
  } catch (error) {
    console.error('Save old balance error:', error);
    window.alert('Error saving old balance');
    cell.textContent = originalAmount ? formatCurrency(originalAmount) : '';
  }
}

async function saveCanteenEntry(cell, month, year) {
  const patientId = cell.dataset.patientId;
  const entryType = cell.dataset.entryType;
  const originalValue = cell.dataset.original || '';
  let newValueStr = cell.textContent.trim().replace(/[^\d]/g, '');

  if (!newValueStr) newValueStr = '0';

  const newAmount = parseInt(newValueStr, 10);
  const originalAmount = originalValue ? parseInt(originalValue, 10) : 0;

  if (newAmount === originalAmount && originalValue !== '') {
    cell.textContent = originalAmount ? formatCurrency(originalAmount) : '';
    return;
  }
  if (newAmount === 0 && originalValue === '') {
    cell.textContent = '';
    return;
  }

  const dateString = entryType === 'daily'
    ? `${year}-${String(month).padStart(2, '0')}-${String(parseInt(cell.dataset.day, 10)).padStart(2, '0')}T00:00:00`
    : `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;

  try {
    const res = await fetch('/api/canteen/daily-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: patientId,
        date: dateString,
        amount: newAmount,
        entry_type: entryType,
        item: entryType === 'other' ? 'Other adjustment' : 'Daily canteen',
      }),
    });

    if (res.ok) {
      cell.textContent = newAmount ? formatCurrency(newAmount) : '';
      cell.dataset.original = String(newAmount);
      await loadCanteenMonthlyTable();
      if (typeof refreshOverheadsCanteenColumn === 'function') {
        await refreshOverheadsCanteenColumn();
      }
    } else {
      const error = await res.json().catch(() => ({}));
      window.alert(error.error || 'Failed to save entry');
      cell.textContent = originalAmount ? formatCurrency(originalAmount) : '';
    }
  } catch (error) {
    console.error('Error saving entry:', error);
    window.alert('Failed to save entry');
    cell.textContent = originalAmount ? formatCurrency(originalAmount) : '';
  }
}

async function recordCanteenSale(event) {
  event.preventDefault();
  window.alert('Please use the monthly table to record canteen entries.');
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderCanteenBreakdown();
});

window.loadCanteenMonthlyTable = loadCanteenMonthlyTable;
window.handleCellKeydown = handleCellKeydown;
window.saveCanteenOldBalance = saveCanteenOldBalance;
window.saveCanteenEntry = saveCanteenEntry;
window.recordCanteenSale = recordCanteenSale;
