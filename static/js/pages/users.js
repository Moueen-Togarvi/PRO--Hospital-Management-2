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

async function renderUserManagement() {
  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    const tbody = document.getElementById('user-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    users.forEach((user) => {
      const delBtn = user.username !== 'ImranSaab'
        ? `<button class="text-red-500 transition hover:text-red-700" onclick="deleteUser('${user._id}')"><i class="fas fa-trash"></i></button>`
        : '';

      const linkBtn = user.role === 'Family'
        ? `<button class="mr-3 text-blue-500 transition hover:text-blue-700" onclick="openUserLinkModal('${user._id}', '${user.username}')" title="Link Patients"><i class="fas fa-link"></i></button>`
        : '';

      const shiftCol = user.role === 'General Staff'
        ? `<div class="flex items-center justify-center gap-4">
             <button onclick="toggleUserShift('${user._id}', 'day', ${!user.day_shift})" title="Toggle Day Shift">
               <i class="fas ${user.day_shift ? 'fa-check text-green-600' : 'fa-times text-red-500'}"></i>
             </button>
             <button onclick="toggleUserShift('${user._id}', 'night', ${!user.night_shift})" title="Toggle Night Shift">
               <i class="fas ${user.night_shift ? 'fa-check text-green-600' : 'fa-times text-red-500'}"></i>
             </button>
           </div>`
        : '<span class="text-gray-300">—</span>';

      tbody.innerHTML += `<tr class="border-b hover:bg-gray-50">
        <td class="whitespace-nowrap px-6 py-4">${user.name || ''}</td>
        <td class="whitespace-nowrap px-6 py-4">${user.username || ''}</td>
        <td class="whitespace-nowrap px-6 py-4">${user.role || ''}</td>
        <td class="px-6 py-4 text-center">${shiftCol}</td>
        <td class="px-6 py-4 text-center">${linkBtn}${delBtn}</td>
      </tr>`;
    });

    const resPatients = await fetch('/api/patients');
    const allPatients = await resPatients.json();
    const createList = document.getElementById('new-user-patients-list');
    if (createList) {
      createList.innerHTML = '';
      allPatients.forEach((patient) => {
        const item = document.createElement('label');
        item.className = 'flex cursor-pointer items-center gap-2 rounded p-1.5 text-xs transition hover:bg-white';
        item.innerHTML = `<input type="checkbox" value="${patient._id}" class="new-user-patient-checkbox"> ${patient.name}`;
        createList.appendChild(item);
      });
    }
  } catch (error) {
    console.error('User management render error:', error);
    const tbody = document.getElementById('user-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-6 py-8 text-center text-red-500">Unable to load users.</td>
        </tr>
      `;
    }
  }
}

function togglePatientSelect() {
  const role = document.getElementById('new-user-role')?.value;
  const group = document.getElementById('new-user-patients-group');
  if (!group) return;

  if (role === 'Family') {
    group.classList.remove('hidden');
  } else {
    group.classList.add('hidden');
  }
}

async function createUser(event) {
  event.preventDefault();
  const form = event.target;
  const selectedPatientIds = Array.from(document.querySelectorAll('.new-user-patient-checkbox:checked')).map((checkbox) => checkbox.value);

  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: form['new-username'].value,
      email: form['new-email'].value,
      password: form['new-password'].value,
      name: form['new-name'].value,
      role: form['new-role'].value,
      patient_ids: selectedPatientIds,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    showSuccessModal('User created successfully');
    await renderUserManagement();
    form.reset();
    togglePatientSelect();
  } else {
    showSuccessModal(data.error || 'Failed to create user', true);
  }
}

async function toggleUserShift(userId, type, value) {
  try {
    const body = {};
    if (type === 'day') body.day_shift = value;
    else body.night_shift = value;

    const res = await fetch(`/api/users/${userId}/shift`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      await renderUserManagement();
    } else {
      showSuccessModal('Failed to update shift', true);
    }
  } catch (error) {
    console.error('Shift Toggle Error', error);
  }
}

async function deleteUser(id) {
  const confirmed = await showConfirmModal('Are you sure you want to delete this user? This action cannot be undone.');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const result = await res.json().catch(() => ({}));

    if (res.ok) {
      showSuccessModal('User deleted successfully!');
    } else {
      showSuccessModal(`Error: ${result.error || 'Failed to delete user'}`, true);
    }
  } catch (error) {
    console.error('Delete User Error:', error);
    showSuccessModal('An unexpected error occurred while deleting the user.', true);
  } finally {
    await renderUserManagement();
  }
}

async function openUserLinkModal(userId) {
  document.getElementById('link-user-id').value = userId;
  const modal = document.getElementById('user-link-patients-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const resPatients = await fetch('/api/patients');
  const allPatients = await resPatients.json();

  const resUsers = await fetch('/api/users');
  const allUsers = await resUsers.json();
  const user = allUsers.find((entry) => entry._id === userId);
  const currentLinks = user?.patient_ids || [];

  const listContainer = document.getElementById('link-patients-list');
  listContainer.innerHTML = '';

  allPatients.forEach((patient) => {
    const isChecked = currentLinks.includes(patient._id);
    const item = document.createElement('label');
    item.className = 'patient-link-item flex cursor-pointer items-center gap-3 rounded p-2 transition hover:bg-white';
    item.dataset.name = String(patient.name || '').toLowerCase();
    item.innerHTML = `
      <input type="checkbox" value="${patient._id}" class="patient-link-checkbox rounded text-emerald-600 focus:ring-emerald-500" ${isChecked ? 'checked' : ''}>
      <div class="flex-1">
        <div class="text-sm font-bold text-gray-900">${patient.name}</div>
        <div class="text-[10px] uppercase text-gray-500">${patient.isDischarged ? 'Discharged' : 'Active'}</div>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

function closeUserLinkModal() {
  const modal = document.getElementById('user-link-patients-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function filterLinkPatients() {
  const query = document.getElementById('link-patient-search')?.value.toLowerCase() || '';
  document.querySelectorAll('.patient-link-item').forEach((element) => {
    element.style.display = element.dataset.name.includes(query) ? 'flex' : 'none';
  });
}

async function saveUserPatientLinks() {
  const userId = document.getElementById('link-user-id').value;
  const selectedIds = Array.from(document.querySelectorAll('.patient-link-checkbox:checked')).map((checkbox) => checkbox.value);

  try {
    const res = await fetch(`/api/users/${userId}/patients`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_ids: selectedIds }),
    });

    if (res.ok) {
      showSuccessModal('Patient links updated successfully!');
      closeUserLinkModal();
      await renderUserManagement();
    } else {
      const data = await res.json().catch(() => ({}));
      showSuccessModal(data.error || 'Failed to update links', true);
    }
  } catch (error) {
    console.error('Save Links Error:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderUserManagement();
  togglePatientSelect();
});

window.renderUserManagement = renderUserManagement;
window.togglePatientSelect = togglePatientSelect;
window.createUser = createUser;
window.toggleUserShift = toggleUserShift;
window.deleteUser = deleteUser;
window.openUserLinkModal = openUserLinkModal;
window.closeUserLinkModal = closeUserLinkModal;
window.filterLinkPatients = filterLinkPatients;
window.saveUserPatientLinks = saveUserPatientLinks;
