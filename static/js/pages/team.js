const currentUser = window.__APP__?.currentUser || { role: 'Guest' };
let teamData = [];

function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(Number(num) || 0);
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

async function renderTeam() {
  if (currentUser.role !== 'Admin') return;

  try {
    const res = await fetch('/api/employees');
    const employees = await res.json();
    teamData = employees;

    const tbody = document.getElementById('team-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (employees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-gray-400">No team members added yet.</td></tr>';
      return;
    }

    employees.forEach((emp, index) => {
      const payClean = emp.pay ? parseInt(String(emp.pay).replace(/,/g, ''), 10) || 0 : 0;
      const advanceClean = emp.advance ? parseInt(String(emp.advance).replace(/,/g, ''), 10) || 0 : 0;

      const tr = document.createElement('tr');
      tr.className = 'border-b border-gray-100 transition hover:bg-emerald-50/50';
      tr.innerHTML = `
        <td class="px-4 py-3 text-center font-mono text-xs text-gray-500">${index + 1}</td>
        <td class="px-4 py-3 font-semibold text-gray-800">${emp.name}</td>
        <td class="rounded bg-emerald-50/30 px-4 py-3 text-sm font-medium text-emerald-700">${emp.designation}</td>
        <td class="px-4 py-3 text-sm font-mono text-gray-600">${formatNumber(payClean)}</td>
        <td class="px-4 py-3 text-sm font-mono text-gray-600">${formatNumber(advanceClean)}</td>
        <td class="px-4 py-3 text-sm text-gray-600">${emp.duty_timings || ''}</td>
        <td class="px-4 py-3 text-sm text-gray-600">${emp.date_of_joining || ''}</td>
        <td class="px-4 py-3 text-xs">
          <div class="font-bold text-gray-900">${emp.phone || ''}</div>
          <div class="text-gray-500">${emp.cnic || ''}</div>
        </td>
        <td class="whitespace-nowrap px-4 py-3 text-center">
          <button onclick="editEmployee('${emp.id}')" class="p-2 text-blue-600 hover:text-blue-800" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="deleteEmployee('${emp.id}')" class="p-2 text-red-500 hover:text-red-700" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
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
  const data = {
    name: document.getElementById('emp-name').value,
    designation: document.getElementById('emp-designation').value,
    pay: document.getElementById('emp-pay').value,
    advance: document.getElementById('emp-advance').value,
    duty_timings: document.getElementById('emp-timings').value,
    date_of_joining: document.getElementById('emp-joining').value,
    cnic: document.getElementById('emp-cnic').value,
    phone: document.getElementById('emp-phone').value,
  };

  let method = 'POST';
  let url = '/api/employees';

  if (id) {
    method = 'PUT';
    url = `/api/employees/${id}`;
  }

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    showSuccessModal(id ? 'Employee Updated' : 'Employee Added');
    closeEmployeeModal();
    renderTeam();
  } else {
    showSuccessModal('Operation failed', true);
  }
}

async function deleteEmployee(id) {
  if (!(await showConfirmModal('Remove this employee from the team?'))) return;

  const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showSuccessModal('Employee Removed');
    renderTeam();
  } else {
    showSuccessModal('Error removing employee', true);
  }
}

window.openEmployeeModal = openEmployeeModal;
window.closeEmployeeModal = closeEmployeeModal;
window.editEmployee = editEmployee;
window.saveEmployee = saveEmployee;
window.deleteEmployee = deleteEmployee;

document.addEventListener('DOMContentLoaded', async () => {
  await renderTeam();
});
