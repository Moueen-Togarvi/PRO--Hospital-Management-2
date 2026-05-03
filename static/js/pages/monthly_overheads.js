const currentUser = window.__APP__?.currentUser || { role: 'Guest' };

let monthlyOverheadsData = {};
let monthlyCanteenDailyData = {};
let monthlyEmployeesCache = [];
let isSavingOverhead = false;

function formatCurrency(amount) {
  return `Rs ${new Intl.NumberFormat('en-US').format(Number(amount) || 0)}`;
}

function formatNumber(amount) {
  return new Intl.NumberFormat('en-US').format(Number(amount) || 0);
}

async function initializeMonthlyOverheads() {
  const monthSelect = document.getElementById('monthly-overheads-month-select');
  const yearSelect = document.getElementById('monthly-overheads-year-select');
  if (!monthSelect || !yearSelect) return;

  if (monthSelect.dataset.initialized) return;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  yearSelect.innerHTML = '';
  for (let y = currentYear; y >= currentYear - 2; y -= 1) {
    const option = document.createElement('option');
    option.value = y;
    option.textContent = y;
    yearSelect.appendChild(option);
  }

  monthSelect.value = String(currentMonth);
  yearSelect.value = String(currentYear);
  monthSelect.dataset.initialized = 'true';

  await window.loadMonthlyOverheadsTable();

  try {
    const res = await fetch('/api/employees');
    if (res.ok) {
      monthlyEmployeesCache = await res.json();
    }
  } catch (error) {
    console.error('Failed to fetch employees:', error);
  }
}

async function updateInventoryKPIs(month, year, totalProfit, totalCanteen) {
  const profitEl = document.getElementById('inv-monthly-profit');
  const salesEl = document.getElementById('inv-total-sales');
  if (profitEl) profitEl.innerText = `Rs ${formatNumber(totalProfit)}`;
  if (salesEl) salesEl.innerText = `Rs ${formatNumber(totalCanteen)}`;

  try {
    const res = await fetch(`/api/inventory/stats/${month}/${year}`);
    if (!res.ok) return;
    const stats = await res.json();
    const newEl = document.getElementById('inv-new-patients-count');
    const dischEl = document.getElementById('inv-discharged-count');
    if (newEl) newEl.innerText = stats.new_patients || 0;
    if (dischEl) dischEl.innerText = stats.discharged || 0;
  } catch (error) {
    console.warn('Could not load patient KPI stats:', error);
  }
}

async function loadAnnualOverheadsProfit(year) {
  const annualDisplay = document.getElementById('monthly-overheads-annual-profit-display');
  if (!annualDisplay) return;

  annualDisplay.innerHTML = `
    <div class="rounded-xl border-2 border-gray-200 bg-gray-50 px-6 py-3 text-right shadow-sm">
      <div class="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">${year} Profit</div>
      <div class="text-lg font-semibold text-gray-500">Loading...</div>
    </div>
  `;

  try {
    const res = await fetch(`/api/overheads/annual/${year}`);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    const profit = data.profit || 0;
    const profitClass = profit >= 0
      ? 'text-green-700 bg-green-50 border-green-200'
      : 'text-white bg-red-500 border-red-600';

    annualDisplay.innerHTML = `
      <div class="rounded-xl border-2 ${profitClass} px-6 py-3 shadow-lg">
        <div class="mb-1 text-xs font-bold uppercase tracking-wide">${year} Profit</div>
        <div class="text-3xl font-extrabold">${formatCurrency(profit)}</div>
      </div>
    `;
  } catch (error) {
    console.error('[MONTHLY OVERHEADS] Error loading annual profit:', error);
    annualDisplay.innerHTML = `
      <div class="rounded-xl border-2 border-red-200 bg-red-50 px-6 py-3 text-red-700 shadow-sm">
        <div class="mb-1 text-xs font-bold uppercase tracking-wide">${year} Profit</div>
        <div class="text-sm">Failed to load</div>
      </div>
    `;
  }
}

function renderMonthlyOverheadsTable(month, year, daysInMonth) {
  const container = document.getElementById('monthly-overheads-table-container');
  if (!container) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let totalKitchen = 0;
  let totalCanteen = 0;
  let totalOthers = 0;
  let totalPayAdvance = 0;
  let totalExpense = 0;
  let totalIncome = 0;
  let totalProfit = 0;

  let tableHTML = `
    <table class="w-full table-auto border-collapse text-sm">
      <thead class="sticky top-0 bg-emerald-600 text-white">
        <tr>
          <th class="border border-emerald-700 px-3 py-3 text-center text-xs font-bold uppercase">Date</th>
          <th class="border border-emerald-700 px-3 py-3 text-center text-xs font-bold uppercase">Day</th>
          <th class="border border-emerald-700 px-3 py-3 text-center text-xs font-bold uppercase">Kitchen</th>
          <th class="border border-emerald-700 px-3 py-3 text-center text-xs font-bold uppercase">Canteen</th>
          <th class="border border-emerald-700 px-3 py-3 text-center text-xs font-bold uppercase">Others</th>
          <th class="border border-emerald-700 px-3 py-3 text-center text-xs font-bold uppercase">Pay/Advance</th>
          <th class="border border-emerald-700 bg-emerald-700 px-3 py-3 text-center text-xs font-bold uppercase">Total Expense</th>
          <th class="border border-emerald-700 px-3 py-3 text-center text-xs font-bold uppercase">Income</th>
          <th class="border border-emerald-700 px-3 py-3 text-center text-xs font-bold uppercase">Profit Per Day</th>
          <th class="w-20 border border-emerald-700 px-1 py-3 text-center text-xs font-bold uppercase">Employee <span class="text-[10px] font-normal text-emerald-200">(Optional)</span></th>
        </tr>
      </thead>
      <tbody class="bg-white">
  `;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateObj = new Date(year, month - 1, day);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayName = dayNames[dateObj.getDay()];

    const entry = monthlyOverheadsData[dateStr] || {};
    const kitchen = entry.kitchen != null ? entry.kitchen : 0;
    const hasStoredCanteen = Object.prototype.hasOwnProperty.call(entry, 'canteen_auto');
    const canteenValue = hasStoredCanteen ? entry.canteen_auto : (monthlyCanteenDailyData[dateStr] || 0);
    const others = entry.others != null ? entry.others : 0;
    const payAdvance = entry.pay_advance != null ? entry.pay_advance : 0;
    const income = entry.income != null ? entry.income : 0;
    const employeeNames = entry.employee_names || '';

    const rowExpense = kitchen + canteenValue + others + payAdvance;
    const dayProfit = income - rowExpense;

    totalKitchen += kitchen;
    totalCanteen += canteenValue;
    totalOthers += others;
    totalPayAdvance += payAdvance;
    totalExpense += rowExpense;
    totalIncome += income;
    totalProfit += dayProfit;

    const hasKitchen = Object.prototype.hasOwnProperty.call(entry, 'kitchen');
    const hasOthers = Object.prototype.hasOwnProperty.call(entry, 'others');
    const hasPayAdvance = Object.prototype.hasOwnProperty.call(entry, 'pay_advance');
    const hasIncome = Object.prototype.hasOwnProperty.call(entry, 'income');

    tableHTML += `
      <tr class="border-b hover:bg-emerald-50">
        <td class="border-x border-gray-100 px-3 py-2.5 text-center font-semibold">${day}</td>
        <td class="border-x border-gray-100 px-3 py-2.5 text-center text-gray-600">${dayName}</td>
        <td class="cursor-pointer border-x border-gray-100 px-3 py-2.5 text-right hover:bg-yellow-50"
            contenteditable="true"
            data-field="kitchen"
            data-date="${dateStr}"
            onkeydown="handleInventoryEnter(event, this)"
            onblur="saveMonthlyOverheadCell(this)"
            onfocus="selectAllText(this)">${hasKitchen ? kitchen : ''}</td>
        <td class="cursor-pointer border-x border-gray-100 px-3 py-2.5 text-right font-semibold text-gray-700 hover:bg-yellow-50"
            contenteditable="true"
            data-field="canteen_auto"
            data-date="${dateStr}"
            onkeydown="handleInventoryEnter(event, this)"
            onblur="saveMonthlyOverheadCell(this)"
            onfocus="selectAllText(this)">${hasStoredCanteen ? canteenValue : (canteenValue || '')}</td>
        <td class="cursor-pointer border-x border-gray-100 px-3 py-2.5 text-right hover:bg-yellow-50"
            contenteditable="true"
            data-field="others"
            data-date="${dateStr}"
            onkeydown="handleInventoryEnter(event, this)"
            onblur="saveMonthlyOverheadCell(this)"
            onfocus="selectAllText(this)">${hasOthers ? others : ''}</td>
        <td class="cursor-pointer border-x border-gray-100 px-3 py-2.5 text-right hover:bg-yellow-50"
            contenteditable="true"
            data-field="pay_advance"
            data-date="${dateStr}"
            onkeydown="handleInventoryEnter(event, this)"
            onblur="saveMonthlyOverheadCell(this)"
            onfocus="selectAllText(this)">${hasPayAdvance ? payAdvance : ''}</td>
        <td class="border-x border-gray-100 bg-emerald-50/50 px-3 py-2.5 text-right font-bold text-emerald-900">${rowExpense ? formatCurrency(rowExpense) : formatCurrency(0)}</td>
        <td class="cursor-pointer border-x border-gray-100 px-3 py-2.5 text-right hover:bg-yellow-50"
            contenteditable="true"
            data-field="income"
            data-date="${dateStr}"
            onkeydown="handleInventoryEnter(event, this)"
            onblur="saveMonthlyOverheadCell(this)"
            onfocus="selectAllText(this)">${hasIncome ? income : ''}</td>
        <td class="border-x border-gray-100 px-3 py-2.5 text-right font-bold ${dayProfit >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}">${(hasIncome || hasKitchen || hasOthers || hasPayAdvance || canteenValue > 0) ? formatCurrency(dayProfit) : ''}</td>
        <td class="relative w-24 cursor-pointer border-x border-gray-100 px-2 py-2.5 text-[10px] text-gray-600 hover:bg-yellow-50"
            data-field="employee_names"
            data-date="${dateStr}"
            onclick="openMonthlyEmployeeDropdown(this)">${employeeNames || '<span class="text-xs italic text-gray-400">Optional</span>'}</td>
      </tr>
    `;
  }

  tableHTML += `
      <tr class="bg-emerald-800 font-bold text-white" style="background-color: #064e3b !important;">
        <td colspan="2" class="border border-emerald-900 px-3 py-3 text-center uppercase text-white" style="background-color: #064e3b !important; color: white !important;">Total</td>
        <td class="border border-emerald-900 px-3 py-3 text-right text-white" style="background-color: #064e3b !important; color: white !important;">${formatCurrency(totalKitchen)}</td>
        <td class="border border-emerald-900 px-3 py-3 text-right text-white" style="background-color: #064e3b !important; color: white !important;">${formatCurrency(totalCanteen)}</td>
        <td class="border border-emerald-900 px-3 py-3 text-right text-white" style="background-color: #064e3b !important; color: white !important;">${formatCurrency(totalOthers)}</td>
        <td class="border border-emerald-900 px-3 py-3 text-right text-white" style="background-color: #064e3b !important; color: white !important;">${formatCurrency(totalPayAdvance)}</td>
        <td class="border border-emerald-900 bg-emerald-900 px-3 py-3 text-right text-white" style="background-color: #064e3b !important; color: white !important;">${formatCurrency(totalExpense)}</td>
        <td class="border border-emerald-900 px-3 py-3 text-right text-white" style="background-color: #064e3b !important; color: white !important;">${formatCurrency(totalIncome)}</td>
        <td class="border border-emerald-900 px-3 py-3 text-right font-extrabold text-white" style="background-color: #064e3b !important; color: white !important;">${formatCurrency(totalProfit)}</td>
        <td class="w-20 border border-emerald-900 px-1 py-3 text-white" style="background-color: #064e3b !important; color: white !important;"></td>
      </tr>
      </tbody>
    </table>
  `;

  container.innerHTML = tableHTML;

  updateInventoryKPIs(month, year, totalProfit, totalCanteen);

  const profitDisplay = document.getElementById('monthly-overheads-profit-display');
  const profitClass = totalProfit >= 0
    ? 'text-green-700 bg-green-50 border-green-200'
    : 'text-white bg-red-500 border-red-600';
  if (profitDisplay) {
    profitDisplay.innerHTML = `
      <div class="rounded-xl border-2 ${profitClass} px-6 py-3 shadow-lg">
        <div class="mb-1 text-xs font-bold uppercase tracking-wide">${monthNames[month - 1]} Profit</div>
        <div class="text-3xl font-extrabold">${formatCurrency(totalProfit)}</div>
      </div>
    `;
  }
}

window.loadMonthlyOverheadsTable = async function loadMonthlyOverheadsTable() {
  const container = document.getElementById('monthly-overheads-table-container');
  const monthSelect = document.getElementById('monthly-overheads-month-select');
  const yearSelect = document.getElementById('monthly-overheads-year-select');
  if (!container || !monthSelect || !yearSelect) return;

  try {
    const month = parseInt(monthSelect.value, 10);
    const year = parseInt(yearSelect.value, 10);

    container.innerHTML = '<div class="p-12 text-center font-bold text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Loading...</div>';

    try {
      const statsRes = await fetch(`/api/inventory/stats/${month}/${year}`);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        const newEl = document.getElementById('inv-new-patients-count');
        const dischEl = document.getElementById('inv-discharged-count');
        const salesEl = document.getElementById('inv-total-sales');
        if (newEl) newEl.innerText = stats.new_patients || 0;
        if (dischEl) dischEl.innerText = stats.discharged || 0;
        if (salesEl) salesEl.innerText = `Rs ${formatNumber(stats.total_canteen_sales || 0)}`;
      }
    } catch (statsError) {
      console.warn('Could not load inventory stats:', statsError);
    }

    const res = await fetch(`/api/overheads/${month}/${year}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error (${res.status})`);
    }

    const data = await res.json();
    monthlyOverheadsData = data.overheads || {};
    monthlyCanteenDailyData = data.canteen_daily || {};
    const daysInMonth = data.days_in_month;

    renderMonthlyOverheadsTable(month, year, daysInMonth);
    await loadAnnualOverheadsProfit(year);
  } catch (error) {
    console.error('[MONTHLY OVERHEADS] Error loading data:', error);
    container.innerHTML = `<div class="p-8 text-center font-bold text-red-600"><i class="fas fa-exclamation-circle mr-2"></i>${error.message || 'Failed to load data. Please try again.'}</div>`;
  }
};

window.selectAllText = function selectAllText(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

window.handleInventoryEnter = function handleInventoryEnter(event, element) {
  if (event.key === 'Enter') {
    event.preventDefault();
    element.blur();
  }
};

window.saveMonthlyOverheadCell = async function saveMonthlyOverheadCell(cell) {
  if (isSavingOverhead) return;

  const row = cell.parentElement;
  const date = cell.dataset.date;
  const cells = Array.from(row.querySelectorAll('td'));

  const parseVal = (element) => {
    if (!element) return 0;
    const text = element.textContent.trim().replace(/[Rs\s,]/g, '');
    const val = parseFloat(text);
    return Number.isNaN(val) ? 0 : val;
  };

  const kitchen = parseVal(cells[2]);
  const canteenValue = parseVal(cells[3]);
  const others = parseVal(cells[4]);
  const payAdvance = parseVal(cells[5]);
  const income = parseVal(cells[7]);
  const rawEmployee = cells[9] ? cells[9].textContent.trim() : '';
  const employeeNames = rawEmployee === 'Optional' || rawEmployee === '' ? '' : rawEmployee;

  const [year, month] = date.split('-').map(Number);

  isSavingOverhead = true;
  try {
    const res = await fetch('/api/overheads/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        month,
        year,
        kitchen,
        canteen_auto: canteenValue,
        others,
        pay_advance: payAdvance,
        employee_names: employeeNames,
        income,
      }),
    });

    if (res.ok) {
      monthlyOverheadsData[date] = {
        date,
        month,
        year,
        kitchen,
        others,
        income,
        pay_advance: payAdvance,
        canteen_auto: canteenValue,
        employee_names: employeeNames,
        total_expense: kitchen + canteenValue + others + payAdvance,
      };
      await window.loadMonthlyOverheadsTable();
    } else {
      const errData = await res.json().catch(() => ({}));
      console.error('[OVERHEADS] Save failed:', errData);
    }
  } catch (error) {
    console.error('[OVERHEADS] Error saving cell:', error);
  } finally {
    isSavingOverhead = false;
  }
};

function renderMonthlyEmployeeList(currentValue, searchTerm = '') {
  const listContainer = document.getElementById('monthly-employee-list');
  if (!listContainer) return;

  const selectedNames = currentValue.split(',').map((name) => name.trim()).filter(Boolean);
  const filtered = monthlyEmployeesCache.filter((emp) =>
    String(emp.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  listContainer.innerHTML = filtered.map((emp) => {
    const isChecked = selectedNames.includes(emp.name);
    return `
      <label class="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-100">
        <input type="checkbox" value="${emp.name}" ${isChecked ? 'checked' : ''} class="monthly-employee-checkbox" />
        <span>${emp.name} - ${emp.designation}</span>
      </label>
    `;
  }).join('');
}

window.openMonthlyEmployeeDropdown = function openMonthlyEmployeeDropdown(cell) {
  const date = cell.dataset.date;
  const currentValue = cell.textContent.trim();

  const existing = document.querySelector('.employee-dropdown-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'employee-dropdown-overlay fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';

  const dropdown = document.createElement('div');
  dropdown.className = 'max-h-96 w-96 overflow-y-auto rounded-lg bg-white p-4 shadow-xl';
  dropdown.innerHTML = `
    <h3 class="mb-2 text-lg font-bold text-gray-800">Select Employee(s)</h3>
    <p class="mb-3 text-xs italic text-gray-500">This field is optional - leave empty if not applicable</p>
    <input type="text" id="monthly-employee-search" placeholder="Search employees..." class="mb-3 w-full rounded border px-3 py-2 focus:ring-2 focus:ring-green-500" />
    <div id="monthly-employee-list" class="space-y-1"></div>
    <div class="mt-4 flex gap-2">
      <button onclick="saveMonthlyEmployeeSelection('${date}')" class="flex-1 rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700">Save</button>
      <button onclick="clearMonthlyEmployeeSelection('${date}')" class="flex-1 rounded bg-orange-500 px-4 py-2 text-white hover:bg-orange-600">Clear</button>
      <button onclick="closeMonthlyEmployeeDropdown()" class="flex-1 rounded bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400">Cancel</button>
    </div>
  `;

  overlay.appendChild(dropdown);
  document.body.appendChild(overlay);

  renderMonthlyEmployeeList(currentValue);

  document.getElementById('monthly-employee-search')?.addEventListener('input', (event) => {
    renderMonthlyEmployeeList(currentValue, event.target.value);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) window.closeMonthlyEmployeeDropdown();
  });
};

window.saveMonthlyEmployeeSelection = async function saveMonthlyEmployeeSelection(date) {
  const checkboxes = document.querySelectorAll('.monthly-employee-checkbox:checked');
  const selectedNames = Array.from(checkboxes).map((cb) => cb.value).join(', ');
  const [year, month] = date.split('-').map(Number);

  const cell = document.querySelector(`td[data-field="employee_names"][data-date="${date}"]`);
  if (!cell) return;

  cell.textContent = selectedNames;
  const row = cell.parentElement;
  const cells = Array.from(row.querySelectorAll('td'));
  const kitchen = parseFloat(cells[2].textContent.trim()) || 0;
  const others = parseFloat(cells[4].textContent.trim()) || 0;
  const payAdvance = parseFloat(cells[5].textContent.trim()) || 0;
  const income = parseFloat(cells[7].textContent.trim()) || 0;
  const entry = monthlyOverheadsData[date] || {};
  const canteenValue = Object.prototype.hasOwnProperty.call(entry, 'canteen_auto')
    ? entry.canteen_auto
    : (monthlyCanteenDailyData[date] || 0);

  try {
    const res = await fetch('/api/overheads/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        month,
        year,
        kitchen,
        canteen_auto: canteenValue,
        others,
        pay_advance: payAdvance,
        employee_names: selectedNames,
        income,
      }),
    });

    if (res.ok) {
      window.closeMonthlyEmployeeDropdown();
    } else {
      window.alert('Failed to save employee selection');
    }
  } catch (error) {
    console.error('Error saving employee selection:', error);
    window.alert('Failed to save employee selection');
  }
};

window.closeMonthlyEmployeeDropdown = function closeMonthlyEmployeeDropdown() {
  const overlay = document.querySelector('.employee-dropdown-overlay');
  if (overlay) overlay.remove();
};

window.clearMonthlyEmployeeSelection = async function clearMonthlyEmployeeSelection(date) {
  const [year, month] = date.split('-').map(Number);
  const cell = document.querySelector(`td[data-field="employee_names"][data-date="${date}"]`);
  if (!cell) return;

  cell.innerHTML = '<span class="text-xs italic text-gray-400">Optional</span>';
  const row = cell.parentElement;
  const cells = Array.from(row.querySelectorAll('td'));
  const kitchen = parseFloat(cells[2].textContent.trim()) || 0;
  const others = parseFloat(cells[4].textContent.trim()) || 0;
  const payAdvance = parseFloat(cells[5].textContent.trim()) || 0;
  const income = parseFloat(cells[7].textContent.trim()) || 0;
  const entry = monthlyOverheadsData[date] || {};
  const canteenValue = Object.prototype.hasOwnProperty.call(entry, 'canteen_auto')
    ? entry.canteen_auto
    : (monthlyCanteenDailyData[date] || 0);

  try {
    const res = await fetch('/api/overheads/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        month,
        year,
        kitchen,
        canteen_auto: canteenValue,
        others,
        pay_advance: payAdvance,
        employee_names: '',
        income,
      }),
    });

    if (res.ok) {
      window.closeMonthlyEmployeeDropdown();
    } else {
      window.alert('Failed to clear employee selection');
    }
  } catch (error) {
    console.error('Error clearing employee selection:', error);
    window.alert('Failed to clear employee selection');
  }
};

window.refreshOverheadsCanteenColumn = async function refreshOverheadsCanteenColumn() {
  const monthSelect = document.getElementById('monthly-overheads-month-select');
  const yearSelect = document.getElementById('monthly-overheads-year-select');
  if (!monthSelect || !yearSelect) return;

  const month = parseInt(monthSelect.value, 10);
  const year = parseInt(yearSelect.value, 10);

  try {
    const res = await fetch(`/api/overheads/canteen-sync/${month}/${year}`);
    if (!res.ok) return;
    const data = await res.json();
    monthlyCanteenDailyData = data.canteen_daily || {};
    await window.loadMonthlyOverheadsTable();
  } catch (error) {
    console.error('Error syncing canteen data:', error);
  }
};

window.renderMonthlyOverheads = async function renderMonthlyOverheads() {
  if (currentUser.role !== 'Admin') return;
  await initializeMonthlyOverheads();
};

document.addEventListener('DOMContentLoaded', async () => {
  await window.renderMonthlyOverheads();
});
