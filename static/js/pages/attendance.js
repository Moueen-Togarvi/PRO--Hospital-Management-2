async function renderAttendanceTable(targetMonthValue) {
  const headerRow = document.getElementById('attendance-header-row');
  const tbody = document.getElementById('attendance-table-body');
  const monthInput = document.getElementById('attendance-month');

  if (!headerRow || !tbody) return;

  const baseDate = (() => {
    if (targetMonthValue) return new Date(`${targetMonthValue}-01`);
    if (monthInput?.value) return new Date(`${monthInput.value}-01`);
    return new Date();
  })();

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  if (monthInput && !monthInput.value) {
    monthInput.value = `${year}-${String(month + 1).padStart(2, '0')}`;
  }

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

  let headerHTML = `
    <th class="sticky left-0 w-48 bg-emerald-600 px-4 py-2 text-white">Employee</th>
  `;
  for (let day = 1; day <= daysInMonth; day += 1) {
    headerHTML += `<th class="border-l border-emerald-500 bg-emerald-600 px-2 py-2 text-center text-white">${day}</th>`;
  }
  headerRow.innerHTML = headerHTML;

  tbody.innerHTML = '';
  employees.forEach((employee) => {
    const row = document.createElement('tr');
    row.className = 'hover:bg-gray-50';

    let rowHTML = `
      <td class="sticky left-0 bg-gray-100 px-3 py-2 font-semibold">
        ${employee.name}
      </td>
    `;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const mark = attendance[employee.id]?.[String(day)] || '';
      const color = mark === 'P'
        ? 'bg-green-200'
        : mark === 'A'
          ? 'bg-red-200'
          : mark === 'H'
            ? 'bg-yellow-200'
            : '';

      rowHTML += `
        <td class="cursor-pointer border text-center ${color}" data-emp="${employee.id}" data-day="${day}">
          ${mark === 'P' ? '✔️' : mark === 'A' ? '❌' : mark === 'H' ? '🕐' : ''}
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
      const mark = current === '' ? 'P' : current === '✔️' ? 'A' : current === '❌' ? 'H' : '';

      cell.textContent = mark === 'P' ? '✔️' : mark === 'A' ? '❌' : mark === 'H' ? '🕐' : '';
      cell.classList.toggle('bg-green-200', mark === 'P');
      cell.classList.toggle('bg-red-200', mark === 'A');
      cell.classList.toggle('bg-yellow-200', mark === 'H');

      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empId, day, year, month: month + 1, mark }),
      });
    };
  });
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
