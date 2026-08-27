const currentUser = window.__APP__?.currentUser || { role: 'Guest' };
let psychSessions = [];
let psychNoteSessionId = '';
let psychPatientsData = [];
let psychEditingSessionId = '';


function showSuccessModal(message, isError = false) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, isError);
    return;
  }
  window.alert(message);
}

function formatSessionDate(value = '') {
  if (!value) return 'No date';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function updatePsychSessionStats() {
  const total = psychSessions.length;
  const saved = psychSessions.filter((session) => Boolean(session.note)).length;
  const pending = Math.max(total - saved, 0);

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };

  setText('psych-total-count', total);
  setText('psych-pending-count', pending);
  setText('psych-saved-count', saved);
}

function renderSessionState(message, tone = 'slate') {
  const container = document.getElementById('psych-sessions-body');
  if (!container) return;
  const toneClass = tone === 'red'
    ? 'border-red-100 bg-red-50 text-red-700'
    : 'border-slate-100 bg-slate-50 text-slate-500';
  container.innerHTML = `<div class="rounded-xl border ${toneClass} p-6 text-center text-sm font-bold">${escapeHtml(message)}</div>`;
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
  renderPsychPatientOptions();
  updateSelectedPatientsCount();
}

function getVisiblePatientOptions() {
  const select = document.getElementById('psych-session-patients');
  const searchValue = document.getElementById('psych-patient-search')?.value.trim().toLowerCase() || '';
  if (!select) return [];
  return Array.from(select.options).filter((option) => (
    !searchValue || option.textContent.toLowerCase().includes(searchValue)
  ));
}

function renderPsychPatientOptions() {
  const container = document.getElementById('psych-patient-options');
  const visibleOptions = getVisiblePatientOptions();
  if (!container) return;

  if (visibleOptions.length === 0) {
    container.innerHTML = '<div class="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs font-bold text-slate-500">No patients found.</div>';
    updateSelectedPatientsCount();
    return;
  }

  container.innerHTML = visibleOptions.map((option) => `
    <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-emerald-100 hover:bg-emerald-50">
      <input type="checkbox" data-patient-id="${escapeHtml(option.value)}" ${option.selected ? 'checked' : ''} class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
      <span class="min-w-0 flex-1 truncate">${escapeHtml(option.textContent)}</span>
    </label>
  `).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const select = document.getElementById('psych-session-patients');
      const option = select ? Array.from(select.options).find((item) => item.value === checkbox.dataset.patientId) : null;
      if (option) option.selected = checkbox.checked;
      updateSelectedPatientsCount();
      renderPsychPatientOptions();
    });
  });

  updateSelectedPatientsCount();
}

function updateSelectedPatientsCount() {
  const select = document.getElementById('psych-session-patients');
  const count = document.getElementById('psych-selected-patients-count');
  const toggle = document.getElementById('psych-select-patients-toggle');
  if (!select) return;

  const total = select.options.length;
  const selected = Array.from(select.selectedOptions).length;
  const visibleOptions = getVisiblePatientOptions();
  const visibleSelected = visibleOptions.filter((option) => option.selected).length;
  if (count) count.textContent = `${selected} selected from ${total}`;
  if (toggle) toggle.textContent = visibleOptions.length > 0 && visibleSelected === visibleOptions.length ? 'Clear Shown' : 'Select Shown';
}

function toggleAllPsychPatients() {
  const options = getVisiblePatientOptions();
  const shouldSelectAll = options.some((option) => !option.selected);
  options.forEach((option) => {
    option.selected = shouldSelectAll;
  });
  renderPsychPatientOptions();
  updateSelectedPatientsCount();
}

function setPsychSessionFormMode(session = null) {
  psychEditingSessionId = session?._id || '';

  const title = document.getElementById('psych-session-modal-title');
  const saveLabel = document.getElementById('psych-session-save-label');
  const form = document.getElementById('psych-session-form');
  const psychSelect = document.getElementById('psych-session-psychologist');
  const dateField = document.getElementById('psych-session-date');
  const timeField = document.getElementById('psych-session-time');
  const titleField = document.getElementById('psych-session-title');
  const patientSelect = document.getElementById('psych-session-patients');

  if (form) form.reset();
  if (title) title.textContent = session ? 'Edit Session' : 'Add Session';
  if (saveLabel) saveLabel.textContent = session ? 'Update Session' : 'Save Session';
  if (psychSelect) psychSelect.value = session?.psychologist_id || psychSelect.value || '';
  if (dateField) dateField.value = session?.date || new Date().toISOString().split('T')[0];
  if (timeField) timeField.value = session?.time_slot || '';
  if (titleField) titleField.value = session?.title || '';

  if (patientSelect) {
    const selectedIds = new Set(session?.patient_ids || []);
    Array.from(patientSelect.options).forEach((option) => {
      option.selected = selectedIds.has(option.value);
    });
  }
  const patientSearch = document.getElementById('psych-patient-search');
  if (patientSearch) patientSearch.value = '';
  renderPsychPatientOptions();
  updateSelectedPatientsCount();
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
    psychSessions = [];
    updatePsychSessionStats();
    renderSessionState('Unable to load sessions.', 'red');
  }
}

function renderPsychSessions() {
  const container = document.getElementById('psych-sessions-body');
  if (!container) return;

  updatePsychSessionStats();

  if (!psychSessions || psychSessions.length === 0) {
    renderSessionState('No sessions found.');
    return;
  }

  const canAddNote = ['Psychologist', 'Admin'].includes(currentUser.role);
  const isAdmin = currentUser.role === 'Admin';

  container.innerHTML = psychSessions.map((session) => {
    const patientNames = session.patient_names || [];
    const patientChips = patientNames.length
      ? patientNames.slice(0, 6).map((name) => `
          <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700">${escapeHtml(name)}</span>
        `).join('')
      : '<span class="text-xs font-bold text-slate-500">No patients</span>';
    const extraPatients = patientNames.length > 6
      ? `<span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">+${patientNames.length - 6}</span>`
      : '';
    const detail = session.note_detail || {};
    const isSaved = Boolean(session.note);
    const noteStatus = isSaved
      ? `<div class="grid gap-1 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
           <div class="flex items-center justify-between gap-2">
             <span class="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Saved</span>
             <span class="text-[11px] font-bold text-emerald-800">${escapeHtml(session.note_author || 'Unknown')}</span>
           </div>
           <p class="text-sm font-bold text-slate-800">${escapeHtml(detail.issue || 'No issue noted')}</p>
           <p class="line-clamp-2 text-xs font-semibold text-slate-600">${escapeHtml(detail.response || detail.intervention || '')}</p>
         </div>`
      : `<div class="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
           <span class="text-xs font-black uppercase tracking-[0.12em] text-amber-700">Pending Note</span>
         </div>`;

    const noteAction = isSaved
      ? (isAdmin
        ? `<button class="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-700 hover:bg-blue-100" onclick="openPsychNoteModal('${session._id}', true)">
             <i class="fas fa-pen"></i><span>Edit Note</span>
           </button>`
        : '<span class="inline-flex h-9 items-center rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-500">Locked</span>')
      : (canAddNote
        ? `<button class="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700" onclick="openPsychNoteModal('${session._id}')">
             <i class="fas fa-plus"></i><span>Add Note</span>
           </button>`
        : '-');
    const adminActions = isAdmin
      ? `<button class="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100" onclick="openPsychSessionModal('${session._id}')">
           <i class="fas fa-pen"></i><span>Edit</span>
         </button>
         <button class="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 text-xs font-black text-red-700 hover:bg-red-100" onclick="deletePsychSession('${session._id}')">
           <i class="fas fa-trash"></i><span>Delete</span>
         </button>`
      : '';
    const actionBtn = `<div class="flex flex-wrap justify-start gap-2 xl:justify-end">${noteAction}${adminActions}</div>`;

    return `
      <article class="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-emerald-100 hover:bg-emerald-50/20">
        <div class="grid gap-3 xl:grid-cols-[11rem_minmax(0,1fr)_16rem_auto] xl:items-center">
          <div>
            <p class="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">${escapeHtml(formatSessionDate(session.date))}</p>
            <p class="mt-1 text-sm font-black text-slate-950">${escapeHtml(session.time_slot || 'No time set')}</p>
          </div>

          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="truncate text-base font-black text-slate-950">${escapeHtml(session.title || 'Psych Session')}</h4>
              <span class="rounded-full ${isSaved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em]">
                ${isSaved ? 'Saved' : 'Pending'}
              </span>
            </div>
            <p class="mt-1 text-xs font-bold text-slate-500">${escapeHtml(session.psychologist_name || session.psychologist_id || 'Psychologist not set')}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">${patientChips}${extraPatients}</div>
          </div>

          <div>${noteStatus}</div>

          <div>${actionBtn}</div>
        </div>
      </article>
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
    const url = psychEditingSessionId ? `/api/psych-sessions/${psychEditingSessionId}` : '/api/psych-sessions';
    const res = await fetch(url, {
      method: psychEditingSessionId ? 'PUT' : 'POST',
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

    showSuccessModal(psychEditingSessionId ? 'Session updated' : 'Session saved');
    await loadPsychSessions();
    closePsychSessionModal();
  } catch (error) {
    console.error(error);
    showSuccessModal('Could not save session.', true);
  }
}

function openPsychSessionModal(sessionId = '') {
  const modal = document.getElementById('psych-session-modal');
  const session = psychSessions.find((entry) => entry._id === sessionId) || null;
  setPsychSessionFormMode(session);
  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
}

function closePsychSessionModal() {
  const modal = document.getElementById('psych-session-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  setPsychSessionFormMode();
}

async function deletePsychSession(sessionId) {
  if (currentUser.role !== 'Admin') {
    showSuccessModal('Only admins can delete sessions.', true);
    return;
  }

  const confirmed = typeof window.confirmAction === 'function'
    ? await window.confirmAction('Delete this psych session?')
    : window.confirm('Delete this psych session?');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/psych-sessions/${sessionId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    showSuccessModal('Session deleted');
    await loadPsychSessions();
  } catch (error) {
    console.error('Delete psych session error', error);
    showSuccessModal('Could not delete session.', true);
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
    const addButton = document.getElementById('psych-add-session-btn');
    addButton?.classList.remove('hidden');
    addButton?.classList.add('inline-flex');
    addButton?.addEventListener('click', () => openPsychSessionModal());
    document.getElementById('psych-select-patients-toggle')?.addEventListener('click', toggleAllPsychPatients);
    document.getElementById('psych-session-patients')?.addEventListener('change', updateSelectedPatientsCount);
    document.getElementById('psych-patient-search')?.addEventListener('input', renderPsychPatientOptions);
    document.getElementById('psych-session-modal')?.addEventListener('click', (event) => {
      if (event.target.id === 'psych-session-modal') closePsychSessionModal();
    });
    await populatePsychologists();
    await populatePsychPatients();
  }

  await loadPsychSessions();
});

window.loadPsychSessions = loadPsychSessions;
window.submitPsychSession = submitPsychSession;
window.openPsychSessionModal = openPsychSessionModal;
window.closePsychSessionModal = closePsychSessionModal;
window.deletePsychSession = deletePsychSession;
window.openPsychNoteModal = openPsychNoteModal;
window.closePsychNoteModal = closePsychNoteModal;
window.savePsychNote = savePsychNote;
