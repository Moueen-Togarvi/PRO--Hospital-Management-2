let prescriptionOptions = [];
let prescriptionPatients = [];


async function fetchPatients() {
  if (prescriptionPatients.length > 0) return prescriptionPatients;
  const res = await fetch('/api/patients');
  if (!res.ok) throw new Error('Unable to load patients.');
  prescriptionPatients = await res.json();
  return prescriptionPatients;
}

async function initializePrescriptionPage() {
  const list = document.getElementById('prescription-patient-list');
  const input = document.getElementById('prescription-patient-input');

  document.getElementById('prescription-form').reset();
  document.getElementById('medication-rows-container').innerHTML = '';
  list.innerHTML = '';
  addMedicationRow();

  try {
    if (!prescriptionPatients || prescriptionPatients.length === 0) {
      await fetchPatients();
    }

    prescriptionOptions = prescriptionPatients
      .filter((p) => !p.isDischarged)
      .map((p) => ({
        id: p._id || p.id,
        name: p.name,
        age: p.age || '',
        father: p.fatherName || '',
      }));

    if (prescriptionOptions.length === 0) {
      input.placeholder = 'No active patients. Type name manually.';
    } else {
      input.placeholder = 'Search or type new name...';
      list.innerHTML = prescriptionOptions
        .map((p) => `<option value="${escapeHtml(p.name)}">Father: ${escapeHtml(p.father)} | Age: ${p.age}</option>`)
        .join('');
    }
  } catch (error) {
    console.error('Error loading prescription patients', error);
  }
}

function handlePrescriptionInput() {
  const input = document.getElementById('prescription-patient-input');
  const ageInput = document.getElementById('prescription-patient-age');
  const val = input.value;
  const match = prescriptionOptions.find((p) => p.name === val);

  if (match) {
    ageInput.value = match.age;
  }
}

function addMedicationRow() {
  const container = document.getElementById('medication-rows-container');
  const rowId = Date.now();
  const div = document.createElement('div');
  div.className = 'med-row mb-2 grid grid-cols-12 items-center gap-2';
  div.id = `med-row-${rowId}`;

  div.innerHTML = `
    <div class="col-span-4">
      <input class="med-name h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="Medicine">
    </div>
    <div class="col-span-3">
      <input class="med-dosage h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="1+0+1">
    </div>
    <div class="col-span-2">
      <input class="med-freq h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="Days">
    </div>
    <div class="col-span-2">
      <input class="med-instr h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100" placeholder="After meal">
    </div>
    <div class="col-span-1 text-center">
      <button type="button" onclick="document.getElementById('med-row-${rowId}').remove()" class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
  container.appendChild(div);
}

function handlePrescriptionGeneration(e) {
  e.preventDefault();

  const name = document.getElementById('prescription-patient-input').value || '';
  const age = document.getElementById('prescription-patient-age').value || '';
  const diagnosis = document.getElementById('prescription-diagnosis').value || '';
  const symptoms = document.getElementById('prescription-symptoms').value || '';
  const notes = document.getElementById('prescription-notes').value || '';

  document.getElementById('rx-date-print').innerText = new Date().toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  document.getElementById('rx-name-print').innerText = name;
  document.getElementById('rx-age-print').innerText = age ? `${age} Yrs` : '';

  const diagEl = document.getElementById('rx-diagnosis-print');
  if (diagEl) diagEl.innerHTML = diagnosis.replace(/\n/g, '<br>');

  const sympEl = document.getElementById('rx-symptoms-print');
  if (sympEl) sympEl.innerHTML = symptoms.replace(/\n/g, '<br>');

  const notesEl = document.getElementById('rx-notes-print');
  if (notesEl) notesEl.innerHTML = notes.replace(/\n/g, '<br>');

  const tbody = document.getElementById('rx-table-body');
  tbody.innerHTML = '';

  const inputRows = document.querySelectorAll('#medication-rows-container .med-row');
  let hasValidMeds = false;

  inputRows.forEach((row, index) => {
    const medName = row.querySelector('.med-name')?.value || '';
    const medDosage = row.querySelector('.med-dosage')?.value || '';
    const medFreq = row.querySelector('.med-freq')?.value || '';
    const medInstr = row.querySelector('.med-instr')?.value || '';

    if (medName.trim() !== '') {
      hasValidMeds = true;
      tbody.innerHTML += `
        <tr>
          <td class="border border-gray-300 p-2 text-center text-xs text-gray-500">${index + 1}</td>
          <td class="border border-gray-300 p-2 text-sm font-bold text-gray-800">${medName}</td>
          <td class="border border-gray-300 p-2 text-sm">${medDosage}</td>
          <td class="border border-gray-300 p-2 text-sm">${medFreq}</td>
          <td class="border border-gray-300 p-2 text-sm">${medInstr}</td>
        </tr>`;
    }
  });

  if (!hasValidMeds) {
    for (let i = 1; i <= 5; i += 1) {
      tbody.innerHTML += `
        <tr>
          <td class="border border-gray-300 p-4 text-center text-gray-300">${i}</td>
          <td class="border border-gray-300"></td>
          <td class="border border-gray-300"></td>
          <td class="border border-gray-300"></td>
          <td class="border border-gray-300"></td>
        </tr>`;
    }
  }

  const printEl = document.getElementById('printable-prescription');
  printEl.classList.remove('hidden');
  printEl.classList.add('print-active');

  window.print();

  setTimeout(() => {
    printEl.classList.add('hidden');
    printEl.classList.remove('print-active');
  }, 1000);
}

window.handlePrescriptionInput = handlePrescriptionInput;
window.addMedicationRow = addMedicationRow;
window.handlePrescriptionGeneration = handlePrescriptionGeneration;

document.addEventListener('DOMContentLoaded', async () => {
  await initializePrescriptionPage();
});
