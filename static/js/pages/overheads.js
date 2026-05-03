const currentUser = window.__APP__?.currentUser || { role: 'Guest' };
let totalSalaries = 0;
let totalBills = 0;
let teamData = [];

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(Number(num) || 0);
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

async function initializeFinanceSelectors() {
  const monthSelect = document.getElementById('finance-month-select');
  const yearSelect = document.getElementById('finance-year-select');
  if (!monthSelect || !yearSelect) return;
  if (monthSelect.dataset.initialized) return;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  yearSelect.innerHTML = '';
  for (let year = currentYear; year >= currentYear - 2; year -= 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.appendChild(option);
  }

  monthSelect.value = String(currentMonth);
  yearSelect.value = String(currentYear);

  if (!monthSelect.dataset.boundListeners) {
    monthSelect.addEventListener('change', () => renderOverheads());
    yearSelect.addEventListener('change', () => renderOverheads());
    monthSelect.dataset.boundListeners = 'true';
  }
  monthSelect.dataset.initialized = 'true';
}

function updateOverheadTotal() {
  const grandTotal = totalSalaries + totalBills;
  const grandTotalEl = document.getElementById('grand-overhead-total');
  const salaryDisplay = document.getElementById('total-salary-display');
  const billsDisplay = document.getElementById('total-bills-display');

  if (grandTotalEl) grandTotalEl.innerText = formatCurrency(grandTotal);
  if (salaryDisplay) salaryDisplay.innerText = formatNumber(totalSalaries);
  if (billsDisplay) billsDisplay.innerText = formatNumber(totalBills);
}

function getFinanceMonthYear() {
  const monthEl = document.getElementById('finance-month-select');
  const yearEl = document.getElementById('finance-year-select');
  return {
    month: monthEl ? Number(monthEl.value) : null,
    year: yearEl ? Number(yearEl.value) : null,
  };
}

async function renderOverheads() {
  if (currentUser.role !== 'Admin') return;

  await initializeFinanceSelectors();
  const month = document.getElementById('finance-month-select').value;
  const year = document.getElementById('finance-year-select').value;

  const incomeEl = document.getElementById('overhead-total-income');
  const expenseEl = document.getElementById('grand-overhead-total');
  if (incomeEl) incomeEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  if (expenseEl) expenseEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const res = await fetch(`/api/finance/summary/${month}/${year}`);
    const data = await res.json();

    if (res.ok) {
      if (incomeEl) incomeEl.innerText = formatCurrency(data.totalIncome || 0);
      if (expenseEl) expenseEl.innerText = formatCurrency(data.totalEstimatedOverheads || 0);

      const displays = {
        'total-salary-display': data.totalSalaries,
        'total-bills-display': data.totalUtilityBills,
        'total-kitchen-display': data.totalKitchen,
        'total-canteen-display': data.totalCanteenAuto,
        'total-others-display': data.totalOthers,
        'total-advance-display': data.totalPayAdvance,
      };

      Object.entries(displays).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = formatNumber(val || 0);
      });

      await Promise.all([renderTeam(true), renderUtilityBills(true)]);
    }
  } catch (error) {
    console.error('Error rendering finance summary:', error);
  }

  loadOldBalances();
}

async function renderUtilityBills(isOverheadContext = false) {
  if (currentUser.role !== 'Admin') return;

  try {
    let url = '/api/utility_bills';
    if (isOverheadContext) {
      const m = document.getElementById('finance-month-select').value;
      const y = document.getElementById('finance-year-select').value;
      url += `?month=${m}&year=${y}`;
    }

    const res = await fetch(url);
    const bills = await res.json();

    const grid = document.getElementById('bills-grid');
    const emptyState = document.getElementById('bills-empty-state');
    if (!grid || !emptyState) return;

    grid.innerHTML = '';
    let currentTotalBills = 0;

    if (bills.length === 0) {
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
    } else {
      emptyState.classList.add('hidden');
      emptyState.classList.remove('flex');
    }

    bills.forEach((bill) => {
      currentTotalBills += bill.amount;

      let iconClass = 'fa-file-invoice';
      let colorClass = 'bg-gray-100 text-gray-600';
      if (bill.type === 'Electricity') {
        iconClass = 'fa-bolt';
        colorClass = 'bg-yellow-100 text-yellow-600';
      } else if (bill.type === 'Gas') {
        iconClass = 'fa-fire';
        colorClass = 'bg-orange-100 text-orange-600';
      } else if (bill.type === 'Water') {
        iconClass = 'fa-tint';
        colorClass = 'bg-blue-100 text-blue-600';
      } else if (bill.type === 'Internet') {
        iconClass = 'fa-wifi';
        colorClass = 'bg-indigo-100 text-indigo-600';
      } else if (bill.type === 'Rent') {
        iconClass = 'fa-home';
        colorClass = 'bg-purple-100 text-purple-600';
      }

      const card = document.createElement('div');
      card.className = 'group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md';
      card.innerHTML = `
        <div class="mb-3 flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full ${colorClass} shadow-sm">
              <i class="fas ${iconClass}"></i>
            </div>
            <div>
              <h4 class="font-bold text-gray-800">${bill.type}</h4>
              <div class="text-xs text-gray-500">${bill.ref_no || 'No Ref'}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-lg font-extrabold text-gray-800">${formatCurrency(bill.amount)}</div>
            <div class="text-xs font-semibold text-red-500">Due: ${bill.due_date}</div>
          </div>
        </div>
        <div class="mt-4 flex justify-end border-t border-gray-100 pt-3">
          <button onclick="payUtilityBill('${bill.id}')" class="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-sm font-bold text-green-700 transition hover:bg-green-600 hover:text-white">
            <i class="fas fa-check"></i> Mark Paid
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    totalBills = currentTotalBills;
  } catch (error) {
    console.error('Bills Render Error:', error);
  }
}

async function addUtilityBill(e) {
  e.preventDefault();
  const data = {
    type: document.getElementById('bill-type').value,
    amount: document.getElementById('bill-amount').value,
    due_date: document.getElementById('bill-due-date').value,
    ref_no: document.getElementById('bill-ref').value,
  };

  const res = await fetch('/api/utility_bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    showSuccessModal('Bill Added Successfully');
    e.target.reset();
    renderOverheads();
  } else {
    showSuccessModal('Error adding bill', true);
  }
}

async function payUtilityBill(id) {
  if (!(await showConfirmModal('Mark this bill as paid? This will move it to Expenses.'))) return;

  const res = await fetch(`/api/utility_bills/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showSuccessModal('Bill Paid & Recorded');
    renderOverheads();
  } else {
    showSuccessModal('Error paying bill', true);
  }
}

async function renderTeam(isOverheadContext = false) {
  if (currentUser.role !== 'Admin') return;

  try {
    let url = '/api/employees';
    if (isOverheadContext) {
      const { month, year } = getFinanceMonthYear();
      if (month && year) url += `?month=${month}&year=${year}`;
    }
    const res = await fetch(url);
    const employees = await res.json();
    teamData = employees;

    const tbody = document.getElementById('team-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let currentTotalSalary = 0;

    if (employees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-gray-400">No team members added yet.</td></tr>';
    } else {
      employees.forEach((emp, index) => {
        const payClean = emp.pay ? parseInt(String(emp.pay).replace(/,/g, ''), 10) || 0 : 0;
        const advanceClean = emp.advance ? parseInt(String(emp.advance).replace(/,/g, ''), 10) || 0 : 0;
        const remaining = payClean - advanceClean;
        currentTotalSalary += remaining;

        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-100 transition hover:bg-emerald-50/50';
        tr.innerHTML = `
          <td class="px-4 py-3 text-center font-mono text-xs text-gray-500">${index + 1}</td>
          <td class="px-4 py-3 font-semibold text-gray-800">${emp.name}</td>
          <td class="rounded bg-emerald-50/30 px-4 py-3 text-sm font-medium text-emerald-700">${emp.designation}</td>
          <td class="px-4 py-3 font-mono text-sm text-gray-600">${formatNumber(payClean)}</td>
          <td class="px-4 py-3 font-mono text-sm text-gray-600">${formatNumber(advanceClean)}</td>
          <td class="bg-gray-50 px-4 py-3 font-mono text-sm font-bold text-gray-800">${formatNumber(remaining)}</td>
          <td class="px-4 py-3 text-xs">
            <div class="font-bold text-gray-900">${emp.phone || ''}</div>
            <div class="text-gray-500">${emp.cnic || ''}</div>
          </td>
          <td class="px-4 py-3 text-center whitespace-nowrap">
            <button onclick="editEmployee('${emp.id}')" class="p-2 text-blue-600 hover:text-blue-800" title="Edit"><i class="fas fa-edit"></i></button>
            <button onclick="deleteEmployee('${emp.id}')" class="p-2 text-red-500 hover:text-red-700" title="Delete"><i class="fas fa-trash"></i></button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    totalSalaries = currentTotalSalary;
    updateOverheadTotal();
  } catch (error) {
    console.error('Team Render Error:', error);
  }
}

function openEmployeeModal() {
  document.getElementById('employee-form').reset();
  document.getElementById('emp-id').value = '';
  document.getElementById('emp-modal-title').innerHTML = '<i class="fas fa-user-tie mr-2"></i>Add Employee';
  const modal = document.getElementById('employee-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeEmployeeModal() {
  const modal = document.getElementById('employee-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function editEmployee(id) {
  const emp = teamData.find((employee) => employee.id === id);
  if (!emp) return;

  document.getElementById('emp-id').value = emp.id;
  document.getElementById('emp-name').value = emp.name;
  document.getElementById('emp-designation').value = emp.designation;
  document.getElementById('emp-pay').value = emp.pay;
  document.getElementById('emp-advance').value = emp.advance;
  document.getElementById('emp-timings').value = emp.duty_timings;
  document.getElementById('emp-joining').value = emp.date_of_joining;
  document.getElementById('emp-cnic').value = emp.cnic;
  document.getElementById('emp-phone').value = emp.phone;

  document.getElementById('emp-modal-title').innerHTML = '<i class="fas fa-edit mr-2"></i>Edit Employee';
  const modal = document.getElementById('employee-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

async function saveEmployee(e) {
  e.preventDefault();
  const id = document.getElementById('emp-id').value;
  const { month, year } = getFinanceMonthYear();
  const data = {
    name: document.getElementById('emp-name').value,
    designation: document.getElementById('emp-designation').value,
    pay: document.getElementById('emp-pay').value,
    advance: document.getElementById('emp-advance').value,
    duty_timings: document.getElementById('emp-timings').value,
    date_of_joining: document.getElementById('emp-joining').value,
    cnic: document.getElementById('emp-cnic').value,
    phone: document.getElementById('emp-phone').value,
    month,
    year,
  };

  let method = 'POST';
  let url = '/api/employees';
  if (id) {
    method = 'PUT';
    url = `/api/employees/${id}`;
    if (month && year) url += `?month=${month}&year=${year}`;
  }

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    showSuccessModal(id ? 'Employee Updated' : 'Employee Added');
    closeEmployeeModal();
    renderOverheads();
  } else {
    showSuccessModal('Operation failed', true);
  }
}

async function deleteEmployee(id) {
  if (!(await showConfirmModal('Remove this employee from the team?'))) return;

  const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showSuccessModal('Employee Removed');
    renderOverheads();
  } else {
    showSuccessModal('Error removing employee', true);
  }
}

async function loadOldBalances() {
  try {
    const { month, year } = getFinanceMonthYear();
    let url = '/api/old-balances';
    if (month && year) url += `?month=${month}&year=${year}`;
    const res = await fetch(url);
    const records = await res.json();
    const tbody = document.getElementById('old-balance-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-400">No recovery records found.</td></tr>';
      return;
    }

    records.forEach((rec, index) => {
      tbody.innerHTML += `
        <tr class="border-b border-gray-100 transition hover:bg-indigo-50">
          <td class="px-4 py-3 text-center text-xs text-gray-500">${index + 1}</td>
          <td class="px-4 py-3 font-semibold text-gray-800">${rec.name}</td>
          <td class="px-4 py-3 font-mono font-bold text-indigo-700">${formatCurrency(rec.amount)}</td>
          <td class="px-4 py-3 text-sm text-gray-600">${formatDisplayDate(rec.commitment_date)}</td>
          <td class="px-4 py-3 text-sm text-gray-600">${formatDisplayDate(rec.last_call_date)}</td>
          <td class="px-4 py-3 text-center">
            <button onclick="deleteOldBalance('${rec.id}')" class="transition text-red-500 hover:text-red-700" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });
  } catch (error) {
    console.error('Error loading old balances', error);
  }
}

async function addOldBalance(e) {
  e.preventDefault();
  const { month, year } = getFinanceMonthYear();
  const data = {
    name: document.getElementById('ob-name').value,
    amount: document.getElementById('ob-amount').value,
    commitment_date: document.getElementById('ob-commit-date').value,
    last_call_date: document.getElementById('ob-call-date').value,
    month,
    year,
  };

  const res = await fetch('/api/old-balances', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    showSuccessModal('Recovery Record Added');
    e.target.reset();
    renderOverheads();
  } else {
    showSuccessModal('Error adding record', true);
  }
}

async function deleteOldBalance(id) {
  if (!(await showConfirmModal('Delete this recovery record?'))) return;
  const res = await fetch(`/api/old-balances/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showSuccessModal('Record Deleted');
    renderOverheads();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderOverheads();
});

window.renderOverheads = renderOverheads;
window.addUtilityBill = addUtilityBill;
window.payUtilityBill = payUtilityBill;
window.openEmployeeModal = openEmployeeModal;
window.closeEmployeeModal = closeEmployeeModal;
window.editEmployee = editEmployee;
window.saveEmployee = saveEmployee;
window.deleteEmployee = deleteEmployee;
window.addOldBalance = addOldBalance;
window.deleteOldBalance = deleteOldBalance;
