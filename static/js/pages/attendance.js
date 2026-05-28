async function renderAttendanceTable(targetMonthValue) {
  const headerRow = document.getElementById('attendance-header-row');
  const tbody = document.getElementById('attendance-table-body');
  const monthInput = document.getElementById('attendance-month');
  const monthLabel = document.getElementById('attendance-month-label');

  if (!headerRow || !tbody) return;

  const baseDate = (() => {
    if (targetMonthValue) return new Date(`${targetMonthValue}-01`);
    if (monthInput?.value) return new Date(`${monthInput.value}-01`);
    return new Date();
  })();

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = baseDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (monthInput && !monthInput.value) {
    monthInput.value = `${year}-${String(month + 1).padStart(2, '0')}`;
  }
  if (monthLabel) monthLabel.textContent = `${monthName} - ${daysInMonth} days`;

  let employees = [];
  try {
    const res = await fetch('/api/employees');
    if (res.ok) employees = await res.json();
  } catch (error) {
    console.error('Employee fetch failed', error);
  }

  let attendance = {};
  try {
    const res = await fetch(`/api/attendance?year=${year}&month=${month + 1}`);
    if (res.ok) attendance = await res.json();
  } catch (error) {
    console.error('Attendance fetch failed', error);
  }

  const stats = { P: 0, A: 0, H: 0 };

  let headerHTML = `
    <th class="w-[10rem] bg-slate-800 px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.1em] text-white">Employee</th>
  `;
  for (let day = 1; day <= daysInMonth; day += 1) {
    headerHTML += `<th class="border-l border-slate-700 bg-slate-800 px-0.5 py-3 text-center text-[10px] font-black text-white">${day}</th>`;
  }
  headerRow.innerHTML = headerHTML;

  tbody.innerHTML = '';
  employees.forEach((employee) => {
    const row = document.createElement('tr');
    row.className = 'bg-white hover:bg-emerald-50/30';

    let rowHTML = `
      <td class="w-[10rem] truncate border-r border-slate-100 bg-white px-3 py-3 text-xs font-black text-slate-950" title="${employee.name}">
        ${employee.name}
      </td>
    `;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const mark = attendance[employee.id]?.[String(day)] || '';
      if (stats[mark] !== undefined) stats[mark] += 1;
      const cellClass = mark === 'P'
        ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
        : mark === 'A'
          ? 'border-red-100 bg-red-50 text-red-700'
          : mark === 'H'
            ? 'border-amber-100 bg-amber-50 text-amber-700'
            : 'border-slate-100 bg-white text-slate-300 hover:bg-slate-50';

      rowHTML += `
        <td class="h-9 cursor-pointer border px-0.5 py-1 text-center text-[10px] font-black transition ${cellClass}" data-emp="${employee.id}" data-day="${day}" title="${employee.name} - Day ${day}">
          ${mark || ''}
        </td>
      `;
    }

    row.innerHTML = rowHTML;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('td[data-emp]').forEach((cell) => {
    cell.onclick = async () => {
      const empId = cell.dataset.emp;
      const day = cell.dataset.day;

      const current = cell.textContent.trim();
      const mark = current === '' ? 'P' : current === 'P' ? 'A' : current === 'A' ? 'H' : '';

      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empId, day, year, month: month + 1, mark }),
      });

      await renderAttendanceTable(monthInput ? monthInput.value : undefined);
    };
  });

  const setStat = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };

  setStat('attendance-staff-count', employees.length);
  setStat('attendance-present-count', stats.P);
  setStat('attendance-absent-count', stats.A);
  setStat('attendance-half-count', stats.H);
}

document.addEventListener('DOMContentLoaded', () => {
  const monthInput = document.getElementById('attendance-month');
  const printBtn = document.getElementById('attendance-print-btn');

  if (monthInput && !monthInput.value) {
    const today = new Date();
    monthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }

  if (monthInput) {
    monthInput.addEventListener('change', () => renderAttendanceTable(monthInput.value));
  }

  if (printBtn) {
    printBtn.addEventListener('click', async () => {
      const targetMonth = monthInput ? monthInput.value : undefined;
      await renderAttendanceTable(targetMonth);

      const section = document.getElementById('attendance-section');
      const clone = section ? section.cloneNode(true) : null;

      if (clone) {
        clone.id = 'attendance-print-clone';
        clone.classList.add('attendance-print-container');
        document.body.appendChild(clone);
      }

      document.body.classList.add('print-attendance');
      window.print();

      setTimeout(() => {
        document.body.classList.remove('print-attendance');
        if (clone) clone.remove();
      }, 300);
    });
  }

  renderAttendanceTable(monthInput ? monthInput.value : undefined);
});
