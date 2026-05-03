const currentUser = window.__APP__?.currentUser || { role: 'Guest' };
let psychSessions = [];
let psychNoteSessionId = '';
let psychPatientsData = [];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showSuccessModal(message, isError = false) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, isError);
    return;
  }
  window.alert(message);
}

async function fetchPatients() {
  try {
    const res = await fetch('/api/patients');
    if (res.ok) {
      psychPatientsData = await res.json();
    }
  } catch (error) {
    console.error('Patient fetch error', error);
  }
}

async function populatePsychologists() {
  const select = document.getElementById('psych-session-psychologist');
  if (!select) return;
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('user fetch failed');
    const users = await res.json();
    const psychologists = users.filter((user) => user.role === 'Psychologist');
    select.innerHTML = psychologists
      .map((user) => `<option value="${user._id}">${user.name || user.username}</option>`)
      .join('');
  } catch (error) {
    console.error('Psychologist load error', error);
    select.innerHTML = '<option value="">No psychologists found</option>';
  }
}

async function populatePsychPatients() {
  const select = document.getElementById('psych-session-patients');
  if (!select) return;
  if (!psychPatientsData.length) await fetchPatients();
  const activePatients = psychPatientsData.filter((patient) => !patient.isDischarged);
  select.innerHTML = activePatients
    .map((patient) => `<option value="${patient._id || patient.id}">${escapeHtml(patient.name)}</option>`)
    .join('');
}

async function loadPsychSessions() {
  const start = document.getElementById('psych-filter-start')?.value;
  const end = document.getElementById('psych-filter-end')?.value;
  const params = new URLSearchParams();
  if (start) params.append('start', start);
  if (end) params.append('end', end);

  try {
    const res = await fetch(`/api/psych-sessions?${params.toString()}`);
    if (!res.ok) throw new Error('fetch failed');
    psychSessions = await res.json();
    renderPsychSessions();
  } catch (error) {
    console.error('Load psych sessions error', error);
    const tbody = document.getElementById('psych-sessions-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-red-500">Unable to load sessions.</td></tr>';
    }
  }
}

function renderPsychSessions() {
  const tbody = document.getElementById('psych-sessions-body');
  if (!tbody) return;

  if (!psychSessions || psychSessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-gray-400">No sessions found.</td></tr>';
    return;
  }

  const canAddNote = ['Psychologist', 'Admin'].includes(currentUser.role);
  const isAdmin = currentUser.role === 'Admin';

  tbody.innerHTML = psychSessions.map((session) => {
    const patients = (session.patient_names || []).join(', ');
    const detail = session.note_detail || {};
    const noteStatus = session.note
      ? `<div class="font-semibold text-emerald-700">Saved</div>
           <div class="text-xs text-gray-600">Issue: ${escapeHtml(detail.issue || '')}</div>
           <div class="text-xs text-gray-600">Intervention: ${escapeHtml(detail.intervention || '')}</div>
           <div class="text-xs text-gray-600">Response: ${escapeHtml(detail.response || '')}</div>
           <div class="text-[11px] text-gray-400">by ${escapeHtml(session.note_author || 'Unknown')}</div>`
      : '<span class="font-semibold text-amber-600">Pending</span>';

    const actionBtn = session.note
      ? (isAdmin
        ? `<button class="font-semibold text-blue-600 hover:text-blue-800" onclick="openPsychNoteModal('${session._id}', true)">Edit Note</button>`
        : '<span class="text-sm text-gray-400">Locked</span>')
      : (canAddNote
        ? `<button class="font-semibold text-emerald-700 hover:text-emerald-900" onclick="openPsychNoteModal('${session._id}')">Add Note</button>`
        : '-');

    return `
      <tr class="hover:bg-emerald-50">
        <td class="px-3 py-2">${session.date || ''}</td>
        <td class="px-3 py-2">${session.time_slot || ''}</td>
        <td class="px-3 py-2">${escapeHtml(session.psychologist_name || session.psychologist_id || '')}</td>
        <td class="px-3 py-2">${patients}</td>
        <td class="px-3 py-2">${escapeHtml(session.title || '')}</td>
        <td class="px-3 py-2">${noteStatus}</td>
        <td class="px-3 py-2 text-center">${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

async function submitPsychSession(event) {
  event.preventDefault();
  const psychId = document.getElementById('psych-session-psychologist')?.value;
  const dateVal = document.getElementById('psych-session-date')?.value;
  const timeVal = document.getElementById('psych-session-time')?.value;
  const titleVal = document.getElementById('psych-session-title')?.value || '';
  const patientSelect = document.getElementById('psych-session-patients');
  const patientIds = patientSelect ? Array.from(patientSelect.selectedOptions).map((option) => option.value) : [];

  if (!psychId || !dateVal || patientIds.length === 0) {
    showSuccessModal('Please select psychologist, date, and at least one patient.', true);
    return;
  }

  try {
    const res = await fetch('/api/psych-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        psychologist_id: psychId,
        date: dateVal,
        time_slot: timeVal,
        patient_ids: patientIds,
        title: titleVal,
      }),
    });
    if (!res.ok) throw new Error('save failed');

    showSuccessModal('Session saved');
    await loadPsychSessions();
    document.getElementById('psych-session-form')?.reset();
    const todayIso = new Date().toISOString().split('T')[0];
    const dateField = document.getElementById('psych-session-date');
    if (dateField) dateField.value = todayIso;
  } catch (error) {
    console.error(error);
    showSuccessModal('Could not save session.', true);
  }
}

function openPsychNoteModal(sessionId, isEdit = false) {
  psychNoteSessionId = sessionId;
  const modal = document.getElementById('psych-note-modal');
  const session = psychSessions.find((entry) => entry._id === sessionId) || {};
  const dateField = document.getElementById('psych-note-date');
  const issueField = document.getElementById('psych-note-issue');
  const interventionField = document.getElementById('psych-note-intervention');
  const responseField = document.getElementById('psych-note-response');

  if (dateField) dateField.value = session.date || new Date().toISOString().split('T')[0];

  if (isEdit && session.note_detail) {
    if (issueField) issueField.value = session.note_detail.issue || '';
    if (interventionField) interventionField.value = session.note_detail.intervention || '';
    if (responseField) responseField.value = session.note_detail.response || '';
  } else {
    if (issueField) issueField.value = '';
    if (interventionField) interventionField.value = '';
    if (responseField) responseField.value = '';
  }

  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
}

function closePsychNoteModal() {
  const modal = document.getElementById('psych-note-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  psychNoteSessionId = '';
}

async function savePsychNote() {
  const issue = document.getElementById('psych-note-issue')?.value.trim();
  const intervention = document.getElementById('psych-note-intervention')?.value.trim();
  const response = document.getElementById('psych-note-response')?.value.trim();

  if (!psychNoteSessionId || !issue || !intervention || !response) {
    showSuccessModal('Please fill all fields.', true);
    return;
  }

  try {
    const res = await fetch(`/api/psych-sessions/${psychNoteSessionId}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue, intervention, response }),
    });
    if (!res.ok) {
      showSuccessModal('Could not save note.', true);
      return;
    }
    closePsychNoteModal();
    await loadPsychSessions();
    showSuccessModal('Note saved');
  } catch (error) {
    console.error('Save note error', error);
    showSuccessModal('Could not save note.', true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const todayIso = new Date().toISOString().split('T')[0];
  const formDate = document.getElementById('psych-session-date');
  if (formDate && !formDate.value) formDate.value = todayIso;

  if (currentUser.role === 'Admin') {
    document.getElementById('psych-assign-card')?.classList.remove('hidden');
    await populatePsychologists();
    await populatePsychPatients();
  }

  await loadPsychSessions();
});

window.loadPsychSessions = loadPsychSessions;
window.submitPsychSession = submitPsychSession;
window.openPsychNoteModal = openPsychNoteModal;
window.closePsychNoteModal = closePsychNoteModal;
window.savePsychNote = savePsychNote;
