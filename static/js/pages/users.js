let usersCache = [];
let patientsCache = [];
let userModalMode = 'create';
let userPatientSelection = new Set();

const USER_ROLES = ['Admin', 'Doctor', 'Psychologist', 'Canteen', 'General Staff', 'Family'];

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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeRole(role = '') {
  return USER_ROLES.includes(role) ? role : 'General Staff';
}

function getRoleBadge(role = '') {
  const styles = {
    Admin: 'border-blue-100 bg-blue-50 text-blue-800',
    Doctor: 'border-violet-100 bg-violet-50 text-violet-800',
    Psychologist: 'border-indigo-100 bg-indigo-50 text-indigo-800',
    Canteen: 'border-amber-100 bg-amber-50 text-amber-800',
    'General Staff': 'border-slate-200 bg-slate-100 text-slate-800',
    Family: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  };

  return `<span class="inline-flex rounded-full border ${styles[role] || styles['General Staff']} px-3 py-1 text-xs font-black">${escapeHtml(role || 'Staff')}</span>`;
}

async function fetchUsers() {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error('Unable to load users.');
  usersCache = await res.json();
  return usersCache;
}

async function fetchPatients() {
  if (patientsCache.length > 0) return patientsCache;
  const res = await fetch('/api/patients');
  if (!res.ok) throw new Error('Unable to load patients.');
  patientsCache = await res.json();
  return patientsCache;
}

function updateUserStats(users = usersCache) {
  const total = users.length;
  const admins = users.filter((user) => user.role === 'Admin').length;
  const staff = users.filter((user) => ['Doctor', 'Psychologist', 'Canteen', 'General Staff'].includes(user.role)).length;
  const family = users.filter((user) => user.role === 'Family').length;

  const statMap = {
    'user-stat-total': total,
    'user-stat-admin': admins,
    'user-stat-staff': staff,
    'user-stat-family': family,
  };

  Object.entries(statMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
}

function getFilteredUsers() {
  const query = (document.getElementById('user-search')?.value || '').trim().toLowerCase();
  const role = document.getElementById('user-role-filter')?.value || '';

  return usersCache.filter((user) => {
    const matchesRole = !role || user.role === role;
    const searchable = `${user.name || ''} ${user.username || ''} ${user.email || ''} ${user.role || ''}`.toLowerCase();
    return matchesRole && searchable.includes(query);
  });
}

function getPatientSummary(user) {
  if (user.role !== 'Family') {
    return '<span class="text-sm font-bold text-slate-500">Not required</span>';
  }

  const ids = Array.isArray(user.patient_ids) ? user.patient_ids : [];
  if (ids.length === 0) {
    return '<span class="text-sm font-black text-red-600">No patients linked</span>';
  }

  return `<span class="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">${ids.length} linked</span>`;
}

function getShiftControls(user) {
  if (user.role !== 'General Staff') {
    return '<span class="text-sm font-bold text-slate-400">-</span>';
  }

  const dayClass = user.day_shift ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500';
  const nightClass = user.night_shift ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-500';

  return `
    <div class="flex items-center justify-center gap-2">
      <button type="button" onclick="toggleUserShift('${user._id}', 'day', ${!user.day_shift})" class="h-8 rounded-lg border ${dayClass} px-2 text-xs font-black">Day</button>
      <button type="button" onclick="toggleUserShift('${user._id}', 'night', ${!user.night_shift})" class="h-8 rounded-lg border ${nightClass} px-2 text-xs font-black">Night</button>
    </div>
  `;
}

function renderUserList() {
  const tbody = document.getElementById('user-table-body');
  if (!tbody) return;

  const users = getFilteredUsers();
  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-5 py-10 text-center">
          <div class="text-sm font-black text-slate-700">No users found</div>
          <div class="mt-1 text-xs font-semibold text-slate-500">Try another search or role filter.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map((user) => {
    const isMainAdmin = user.username === 'ImranSaab';
    const deleteButton = isMainAdmin
      ? ''
      : `<button type="button" onclick="deleteUser('${user._id}')" class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 text-xs font-black text-red-700 hover:bg-red-100">
          <i class="fas fa-trash-alt"></i>
          Delete
        </button>`;

    return `
      <tr class="transition hover:bg-slate-50">
        <td class="px-5 py-4">
          <div class="font-black text-slate-950">${escapeHtml(user.name || 'Unnamed User')}</div>
          <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
            <span>@${escapeHtml(user.username || 'no-username')}</span>
            <span class="text-slate-300">|</span>
            <span>${escapeHtml(user.email || 'No email')}</span>
          </div>
        </td>
        <td class="px-5 py-4">${getRoleBadge(user.role)}</td>
        <td class="px-5 py-4 text-center">${getShiftControls(user)}</td>
        <td class="px-5 py-4">${getPatientSummary(user)}</td>
        <td class="px-5 py-4">
          <div class="flex justify-end gap-2">
            <button type="button" onclick="openUserModal('edit', '${user._id}')" class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-800 hover:bg-blue-100">
              <i class="fas fa-pen"></i>
              Edit
            </button>
            ${deleteButton}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function renderUserManagement() {
  const tbody = document.getElementById('user-table-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-5 py-10 text-center text-sm font-black text-slate-600">Loading users...</td>
      </tr>
    `;
  }

  try {
    await Promise.all([fetchUsers(), fetchPatients()]);
    updateUserStats();
    renderUserList();
  } catch (error) {
    console.error('User management render error:', error);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-5 py-10 text-center text-sm font-black text-red-600">Unable to load users.</td>
        </tr>
      `;
    }
  }
}

function getSelectedUserPatientIds() {
  return Array.from(userPatientSelection);
}

function updateSelectedPatientCount() {
  const element = document.getElementById('user-patient-count');
  if (!element) return;
  const count = getSelectedUserPatientIds().length;
  element.textContent = `${count} selected`;
}

function renderUserPatientPicker(selectedIds = null) {
  const list = document.getElementById('user-patients-list');
  if (!list) return;

  if (Array.isArray(selectedIds)) {
    userPatientSelection = new Set(selectedIds);
  }

  const query = (document.getElementById('user-patient-search')?.value || '').trim().toLowerCase();
  const visiblePatients = patientsCache.filter((patient) => String(patient.name || '').toLowerCase().includes(query));

  if (visiblePatients.length === 0) {
    list.innerHTML = '<div class="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">No patients found.</div>';
    updateSelectedPatientCount();
    return;
  }

  list.innerHTML = visiblePatients.map((patient) => {
    const checked = userPatientSelection.has(patient._id) ? 'checked' : '';
    const statusClass = patient.isDischarged ? 'text-slate-500' : 'text-emerald-700';
    const statusText = patient.isDischarged ? 'Discharged' : 'Active';

    return `
      <label class="user-patient-option flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2 hover:bg-emerald-50">
        <input type="checkbox" value="${patient._id}" onchange="toggleUserPatientSelection(this)" class="user-patient-checkbox h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" ${checked}>
        <span class="flex-1">
          <span class="block text-sm font-black text-slate-950">${escapeHtml(patient.name || 'Unnamed Patient')}</span>
          <span class="text-[11px] font-black uppercase tracking-[0.1em] ${statusClass}">${statusText}</span>
        </span>
      </label>
    `;
  }).join('');

  updateSelectedPatientCount();
}

function toggleUserPatientSelection(checkbox) {
  if (!checkbox) return;
  if (checkbox.checked) {
    userPatientSelection.add(checkbox.value);
  } else {
    userPatientSelection.delete(checkbox.value);
  }
  updateSelectedPatientCount();
}

function setVisibleUserPatients(checked) {
  document.querySelectorAll('#user-patients-list .user-patient-checkbox').forEach((checkbox) => {
    checkbox.checked = checked;
    if (checked) {
      userPatientSelection.add(checkbox.value);
    } else {
      userPatientSelection.delete(checkbox.value);
    }
  });
  updateSelectedPatientCount();
}

function handleUserRoleChange() {
  const role = document.getElementById('user-role')?.value || '';
  const patientsGroup = document.getElementById('user-patients-group');
  const shiftGroup = document.getElementById('user-shift-group');

  if (patientsGroup) {
    patientsGroup.classList.toggle('hidden', role !== 'Family');
  }
  if (shiftGroup) {
    shiftGroup.classList.toggle('hidden', role !== 'General Staff');
  }

  updateSelectedPatientCount();
}

async function openUserModal(mode = 'create', userId = '') {
  userModalMode = mode;
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');
  if (!modal || !form) return;

  await fetchPatients().catch((error) => console.error('Patient load failed:', error));

  form.reset();
  document.getElementById('user-form-id').value = '';
  document.getElementById('user-patient-search').value = '';
  document.getElementById('user-username').disabled = false;
  document.getElementById('user-role').disabled = false;

  const passwordInput = document.getElementById('user-password');
  const passwordNote = document.getElementById('user-password-note');
  const title = document.getElementById('user-modal-title');
  const kicker = document.getElementById('user-modal-kicker');
  const help = document.getElementById('user-modal-help');
  const saveButton = document.getElementById('user-save-button');

  if (mode === 'edit') {
    const user = usersCache.find((entry) => entry._id === userId);
    if (!user) {
      showSuccessModal('User not found. Please refresh and try again.', true);
      return;
    }

    document.getElementById('user-form-id').value = user._id;
    document.getElementById('user-name').value = user.name || '';
    document.getElementById('user-username').value = user.username || '';
    document.getElementById('user-email').value = user.email || '';
    document.getElementById('user-role').value = normalizeRole(user.role);
    document.getElementById('user-day-shift').checked = Boolean(user.day_shift);
    document.getElementById('user-night-shift').checked = Boolean(user.night_shift);

    passwordInput.required = false;
    passwordInput.placeholder = 'Leave blank to keep current password';
    passwordNote.textContent = 'Leave blank if password should stay the same.';
    title.textContent = 'Edit User';
    kicker.textContent = 'Update User';
    help.textContent = 'Update user details, role, shifts, or linked patients.';
    saveButton.innerHTML = '<i class="fas fa-save text-xs"></i> Update User';

    if (user.username === 'ImranSaab') {
      document.getElementById('user-username').disabled = true;
      document.getElementById('user-role').disabled = true;
    }

    renderUserPatientPicker(user.patient_ids || []);
  } else {
    passwordInput.required = true;
    passwordInput.placeholder = 'Password';
    passwordNote.textContent = 'Required for new users.';
    title.textContent = 'Add User';
    kicker.textContent = 'New User';
    help.textContent = 'Fill user details and save access.';
    saveButton.innerHTML = '<i class="fas fa-save text-xs"></i> Save User';
    document.getElementById('user-role').value = 'General Staff';
    renderUserPatientPicker([]);
  }

  handleUserRoleChange();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => document.getElementById('user-name')?.focus(), 50);
}

function closeUserModal() {
  const modal = document.getElementById('user-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function getUserPayload() {
  const roleSelect = document.getElementById('user-role');
  const usernameInput = document.getElementById('user-username');
  const currentUser = usersCache.find((user) => user._id === document.getElementById('user-form-id').value);
  const role = roleSelect.disabled && currentUser ? currentUser.role : roleSelect.value;
  const username = usernameInput.disabled && currentUser ? currentUser.username : usernameInput.value;
  const password = document.getElementById('user-password').value.trim();

  const payload = {
    name: document.getElementById('user-name').value.trim(),
    username: username.trim(),
    email: document.getElementById('user-email').value.trim(),
    role,
    patient_ids: role === 'Family' ? getSelectedUserPatientIds() : [],
    day_shift: role === 'General Staff' ? document.getElementById('user-day-shift').checked : false,
    night_shift: role === 'General Staff' ? document.getElementById('user-night-shift').checked : false,
  };

  if (password) payload.password = password;
  return payload;
}

async function saveUser(event) {
  event.preventDefault();
  const userId = document.getElementById('user-form-id').value;
  const payload = getUserPayload();

  if (userModalMode === 'create' && !payload.password) {
    showSuccessModal('Password is required for new users.', true);
    return;
  }

  const url = userModalMode === 'edit' ? `/api/users/${userId}` : '/api/users';
  const method = userModalMode === 'edit' ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showSuccessModal(data.error || 'Failed to save user.', true);
      return;
    }

    showSuccessModal(userModalMode === 'edit' ? 'User updated successfully.' : 'User created successfully.');
    closeUserModal();
    await renderUserManagement();
  } catch (error) {
    console.error('Save User Error:', error);
    showSuccessModal('An unexpected error occurred while saving the user.', true);
  }
}

async function createUser(event) {
  userModalMode = 'create';
  await saveUser(event);
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
      showSuccessModal('Failed to update shift.', true);
    }
  } catch (error) {
    console.error('Shift Toggle Error', error);
    showSuccessModal('Unable to update shift.', true);
  }
}

async function deleteUser(id) {
  const confirmed = await showConfirmModal('Delete this user? This action cannot be undone.');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const result = await res.json().catch(() => ({}));

    if (res.ok) {
      showSuccessModal('User deleted successfully.');
    } else {
      showSuccessModal(result.error || 'Failed to delete user.', true);
    }
  } catch (error) {
    console.error('Delete User Error:', error);
    showSuccessModal('An unexpected error occurred while deleting the user.', true);
  } finally {
    await renderUserManagement();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderUserManagement();
});

window.renderUserManagement = renderUserManagement;
window.renderUserList = renderUserList;
window.openUserModal = openUserModal;
window.closeUserModal = closeUserModal;
window.handleUserRoleChange = handleUserRoleChange;
window.renderUserPatientPicker = renderUserPatientPicker;
window.toggleUserPatientSelection = toggleUserPatientSelection;
window.setVisibleUserPatients = setVisibleUserPatients;
window.updateSelectedPatientCount = updateSelectedPatientCount;
window.saveUser = saveUser;
window.createUser = createUser;
window.toggleUserShift = toggleUserShift;
window.deleteUser = deleteUser;
