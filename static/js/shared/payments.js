(function () {
  const currentUser = window.__APP__?.currentUser || { role: 'Guest' };
  let receiptPatientOptions = [];
  let receiptPatientsCache = [];
  let allPaymentRecords = [];
  let activePaymentRecordId = null;
  let paymentEditScreenshotData = '';

  function isAdmin() {
    return currentUser.role === 'Admin';
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(dateStr) {
    if (!dateStr || dateStr === 'N/A') return 'N/A';
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return String(dateStr);
    return parsed.toLocaleDateString('en-PK');
  }

  async function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function fetchPatientsForPayments(force = false) {
    if (!force && receiptPatientsCache.length) return receiptPatientsCache;
    const { response, data } = await window.apiFetchJson('/api/patients');
    if (!response.ok || !Array.isArray(data)) {
      throw new Error('Unable to load patients.');
    }
    receiptPatientsCache = data;
    return receiptPatientsCache;
  }

  async function refreshFinancialViews() {
    receiptPatientsCache = [];

    const tasks = [];
    if (typeof window.renderAccounts === 'function') tasks.push(window.renderAccounts());
    if (typeof window.loadPatients === 'function') tasks.push(window.loadPatients());
    if (typeof window.updateDashboard === 'function') tasks.push(window.updateDashboard());
    if (typeof window.loadPatient === 'function') tasks.push(window.loadPatient());
    await Promise.allSettled(tasks);
  }

  async function openReceiptModal() {
    if (!isAdmin()) {
      window.showToast('Access Denied. Admins only.', true);
      return;
    }

    const modal = document.getElementById('receipt-modal');
    const patientIdField = document.getElementById('receipt-patient-id');
    const patientList = document.getElementById('receipt-patient-list');
    const patientInput = document.getElementById('receipt-patient-input');
    const amountField = document.getElementById('receipt-amount');
    const dateField = document.getElementById('receipt-date');
    const screenshotField = document.getElementById('receipt-screenshot-file');

    if (!modal || !patientIdField || !patientList || !patientInput || !amountField || !dateField) return;

    amountField.value = '';
    patientInput.value = '';
    patientIdField.value = '';
    patientList.innerHTML = '<option value="">Loading...</option>';
    if (screenshotField) screenshotField.value = '';

    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .split('T')[0];
    dateField.value = localIso;

    modal.classList.remove('hidden');

    try {
      const patients = await fetchPatientsForPayments();
      const activePatients = patients.filter((patient) => !patient.isDischarged);
      receiptPatientOptions = activePatients.map((patient) => {
        const idInfo = patient.idNo ? `ID: ${patient.idNo}` : '';
        const fatherInfo = patient.fatherName || 'Father N/A';
        return {
          id: String(patient._id || patient.id || ''),
          label: `${patient.name} - Father: ${fatherInfo}${idInfo ? ` (${idInfo})` : ''}`,
          name: patient.name,
          father: patient.fatherName || '',
        };
      });

      if (receiptPatientOptions.length === 0) {
        patientList.innerHTML = '';
        patientInput.placeholder = 'No active patients available';
      } else {
        patientInput.placeholder = 'Start typing patient name or ID';
        patientList.innerHTML = receiptPatientOptions
          .map((option) => `<option value="${escapeHtml(option.label)}"></option>`)
          .join('');
      }

      handleReceiptPatientInputChange();
      toggleReceiptScreenshot();
    } catch (error) {
      console.error(error);
      patientList.innerHTML = '';
      patientInput.placeholder = 'Unable to load patients';
      window.showToast('Unable to load patients for receipt.', true);
    }
  }

  function handleReceiptPatientInputChange() {
    const input = document.getElementById('receipt-patient-input');
    const hiddenField = document.getElementById('receipt-patient-id');
    if (!input || !hiddenField) return;

    const value = input.value.trim();
    const match = receiptPatientOptions.find((option) => option.label === value);
    if (match) {
      hiddenField.value = match.id;
      input.dataset.patientName = match.name;
      input.dataset.fatherName = match.father;
    } else {
      hiddenField.value = '';
      delete input.dataset.patientName;
      delete input.dataset.fatherName;
    }
  }

  function toggleReceiptScreenshot() {
    const modeField = document.getElementById('receipt-mode');
    const container = document.getElementById('receipt-screenshot-container');
    if (!modeField || !container) return;
    container.classList.toggle('hidden', modeField.value !== 'Online');
  }

  async function handleReceiptGeneration(event) {
    event.preventDefault();

    const patientId = document.getElementById('receipt-patient-id')?.value;
    const amount = parseInt(document.getElementById('receipt-amount')?.value, 10);
    const mode = document.getElementById('receipt-mode')?.value || 'Cash';
    const selectedDate = document.getElementById('receipt-date')?.value;
    const fileInput = document.getElementById('receipt-screenshot-file');

    if (!patientId) {
      window.showToast('Please choose a patient from the list.', true);
      return;
    }

    if (!amount || amount <= 0) {
      window.showToast('Please select a patient and enter a valid amount.', true);
      return;
    }

    if (!selectedDate) {
      window.showToast('Please select a receipt date.', true);
      return;
    }

    try {
      const patients = await fetchPatientsForPayments();
      const patient = patients.find((item) => String(item._id || item.id || '') === String(patientId));

      if (patient) {
        const parse = (value) => Number(String(value || '0').replace(/,/g, '')) || 0;
        const monthlyFee = parse(patient.monthlyFee);
        const received = parse(patient.receivedAmount);
        const canteen = parse(patient.canteenSpent || patient.canteenTotal || 0);
        const laundry = patient.laundryStatus ? parse(patient.laundryAmount) : 0;

        let admissionDateObj;
        if (patient.admissionDate && patient.admissionDate.length === 10) {
          admissionDateObj = new Date(`${patient.admissionDate}T00:00:00`);
        } else {
          admissionDateObj = patient.admissionDate ? new Date(patient.admissionDate) : new Date();
        }

        const daysDiff = Math.floor((new Date() - admissionDateObj) / (1000 * 60 * 60 * 24));
        const daysElapsed = daysDiff >= 0 ? daysDiff : 0;
        const proratedFee = Math.floor((monthlyFee / 30.0) * Math.max(daysElapsed, 1));
        const totalDue = proratedFee + canteen + laundry;
        const currentBalance = totalDue - received;

        if (amount > currentBalance + 100) {
          const confirmed = await window.confirmAction(
            `The amount (PKR ${amount.toLocaleString()}) exceeds the current balance due (PKR ${currentBalance.toLocaleString()}). Proceed with this advance payment?`
          );
          if (!confirmed) return;
        }
      }

      const patientMeta = receiptPatientOptions.find((option) => option.id === patientId);
      if (!patientMeta) {
        window.showToast('Selected patient could not be found. Please pick again.', true);
        return;
      }

      let screenshotBase64 = '';
      if (mode === 'Online' && fileInput?.files && fileInput.files[0]) {
        screenshotBase64 = await readFileAsDataURL(fileInput.files[0]);
      }

      const response = await fetch(`/api/patients/${patientId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          payment_method: mode,
          screenshot: screenshotBase64,
          payment_date: selectedDate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        window.showToast(errorData.error || 'Error recording payment.', true);
        return;
      }

      const now = new Date();
      const receiptDate = new Date(`${selectedDate}T00:00:00`);
      document.getElementById('rcpt-no').innerText = `#${Date.now().toString().slice(-6)}`;
      document.getElementById('rcpt-date').innerText = receiptDate.toLocaleDateString('en-PK');
      document.getElementById('rcpt-time').innerText = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      document.getElementById('rcpt-name').innerText = patientMeta.name;
      document.getElementById('rcpt-father').innerText = patientMeta.father || '-';
      document.getElementById('rcpt-amount').innerText = `PKR ${amount.toLocaleString()}`;
      document.getElementById('rcpt-mode-display').innerText = mode;

      const screenshotArea = document.getElementById('rcpt-screenshot-area');
      const screenshotImg = document.getElementById('rcpt-screenshot-img');
      if (mode === 'Online' && screenshotBase64) {
        screenshotImg.src = screenshotBase64;
        screenshotArea.classList.remove('hidden');
      } else {
        screenshotArea.classList.add('hidden');
        screenshotImg.src = '';
      }

      document.getElementById('receipt-modal').classList.add('hidden');
      event.target.reset();
      handleReceiptPatientInputChange();
      document.getElementById('receipt-screenshot-container')?.classList.add('hidden');

      await refreshFinancialViews();
      printReceipt();
      window.showToast('Payment Recorded & Receipt Generated');
    } catch (error) {
      console.error(error);
      window.showToast('Network error.', true);
    }
  }

  function printReceipt() {
    const receiptEl = document.getElementById('printable-receipt');
    if (!receiptEl) return;
    receiptEl.classList.remove('hidden');
    receiptEl.classList.add('print-active');
    window.print();
    window.setTimeout(() => {
      receiptEl.classList.add('hidden');
      receiptEl.classList.remove('print-active');
    }, 1000);
  }

  async function openPaymentRecordsModal() {
    if (!isAdmin()) {
      window.showToast('Access Denied. Admins only.', true);
      return;
    }

    const modal = document.getElementById('payment-records-modal');
    const searchInput = document.getElementById('payment-records-search');
    if (searchInput) searchInput.value = '';
    if (modal) modal.classList.remove('hidden');
    await loadPaymentRecords();
  }

  function closePaymentRecordsModal() {
    document.getElementById('payment-records-modal')?.classList.add('hidden');
    closePaymentEditModal();
  }

  async function loadPaymentRecords() {
    const tbody = document.getElementById('payment-records-body');
    const countEl = document.getElementById('payment-records-count');
    const totalEl = document.getElementById('payment-records-total');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-400">
      <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
      <p>Loading payment records...</p>
    </td></tr>`;
    if (countEl) countEl.textContent = '0';
    if (totalEl) totalEl.textContent = 'PKR 0';

    try {
      const response = await fetch('/api/payment-records');
      if (!response.ok) throw new Error('Payment records failed');
      allPaymentRecords = await response.json();
      filterPaymentRecords();
    } catch (error) {
      console.error('Error fetching payment records:', error);
      tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-500">
        <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
        <p>Error loading payment records.</p>
      </td></tr>`;
    }
  }

  function renderPaymentRecords(records) {
    const tbody = document.getElementById('payment-records-body');
    const countEl = document.getElementById('payment-records-count');
    const totalEl = document.getElementById('payment-records-total');
    if (!tbody || !countEl || !totalEl) return;

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-400">
        <i class="fas fa-inbox text-3xl mb-2"></i>
        <p>No payment records found.</p>
      </td></tr>`;
      countEl.textContent = '0';
      totalEl.textContent = 'PKR 0';
      return;
    }

    let totalAmount = 0;
    let html = '';

    records.forEach((record, index) => {
      const recordAmount = Number(record.amount) || 0;
      totalAmount += recordAmount;
      const paymentMethod = String(record.payment_method || 'Cash');
      const isOnlinePayment = paymentMethod.toLowerCase().startsWith('online');
      const modeClass = isOnlinePayment
        ? 'bg-sky-100 text-sky-700'
        : paymentMethod === 'Cash/Initial'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-emerald-100 text-emerald-700';

      const screenshotBtn = record.screenshot
        ? `<button onclick="showPaymentScreenshot('${record._id}')" class="text-emerald-600 hover:text-emerald-800" title="View Screenshot"><i class="fas fa-image"></i></button>`
        : '<span class="text-gray-300">-</span>';

      html += `
        <tr class="hover:bg-emerald-50 transition">
          <td class="px-4 py-3 text-gray-600">${index + 1}</td>
          <td class="px-4 py-3 font-semibold text-gray-800">${escapeHtml(record.patient_name || '')}</td>
          <td class="px-4 py-3 font-mono font-bold text-emerald-600">${recordAmount.toLocaleString()}</td>
          <td class="px-4 py-3 text-gray-600">${formatDate(record.date)}</td>
          <td class="px-4 py-3">
            <span class="px-2 py-1 rounded-full text-xs font-semibold ${modeClass}">${escapeHtml(paymentMethod)}</span>
          </td>
          <td class="px-4 py-3 text-gray-600">${escapeHtml(record.recorded_by || '')}</td>
          <td class="px-4 py-3 text-center">${screenshotBtn}</td>
          <td class="px-4 py-3 text-center">
            <div class="flex items-center justify-center gap-3 whitespace-nowrap">
              <button onclick="openPaymentEditModal('${record._id}')" class="text-blue-600 hover:text-blue-800" title="Edit Payment">
                <i class="fas fa-edit"></i>
              </button>
              <button onclick="deletePaymentRecord('${record._id}')" class="text-red-600 hover:text-red-800" title="Delete Payment">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    countEl.textContent = String(records.length);
    totalEl.textContent = `PKR ${totalAmount.toLocaleString()}`;
  }

  function filterPaymentRecords() {
    const searchTerm = document.getElementById('payment-records-search')?.value.toLowerCase().trim() || '';
    if (!searchTerm) {
      renderPaymentRecords(allPaymentRecords);
      return;
    }

    const filtered = allPaymentRecords.filter((record) =>
      [record.patient_name, record.recorded_by, record.payment_method, record.date]
        .join(' ')
        .toLowerCase()
        .includes(searchTerm)
    );
    renderPaymentRecords(filtered);
  }

  function showPaymentScreenshot(recordId) {
    const record = allPaymentRecords.find((item) => item._id === recordId);
    if (!record?.screenshot) return;
    const previewModal = document.getElementById('screenshot-preview-modal');
    const previewImg = document.getElementById('screenshot-preview-img');
    if (!previewModal || !previewImg) return;
    previewImg.src = record.screenshot;
    previewModal.classList.remove('hidden');
  }

  function getPaymentRecordById(recordId) {
    return allPaymentRecords.find((record) => record._id === recordId) || null;
  }

  function openPaymentEditModal(recordId) {
    const record = getPaymentRecordById(recordId);
    if (!record) {
      window.showToast('Payment record not found.', true);
      return;
    }

    activePaymentRecordId = recordId;
    paymentEditScreenshotData = record.screenshot || '';
    document.getElementById('payment-edit-patient').value = record.patient_name || '';
    document.getElementById('payment-edit-date').value =
      record.date && record.date !== 'N/A' ? record.date : new Date().toISOString().split('T')[0];
    document.getElementById('payment-edit-amount').value = Number(record.amount) || 0;
    document.getElementById('payment-edit-mode').value = record.payment_method || 'Cash';
    document.getElementById('payment-edit-proof-file').value = '';

    updatePaymentEditProofUI();
    document.getElementById('payment-edit-modal')?.classList.remove('hidden');
  }

  function closePaymentEditModal() {
    document.getElementById('payment-edit-modal')?.classList.add('hidden');
    document.getElementById('payment-edit-form')?.reset();
    activePaymentRecordId = null;
    paymentEditScreenshotData = '';
    updatePaymentEditProofUI();
  }

  function updatePaymentEditProofUI() {
    const modeField = document.getElementById('payment-edit-mode');
    const proofSection = document.getElementById('payment-edit-proof-section');
    const preview = document.getElementById('payment-edit-proof-preview');
    const empty = document.getElementById('payment-edit-proof-empty');
    if (!modeField || !proofSection || !preview || !empty) return;

    const isOnlinePayment = String(modeField.value || '').toLowerCase().startsWith('online');
    proofSection.classList.toggle('hidden', !isOnlinePayment);

    if (!isOnlinePayment) {
      preview.classList.add('hidden');
      preview.src = '';
      empty.classList.remove('hidden');
      return;
    }

    if (paymentEditScreenshotData) {
      preview.src = paymentEditScreenshotData;
      preview.classList.remove('hidden');
      empty.classList.add('hidden');
    } else {
      preview.src = '';
      preview.classList.add('hidden');
      empty.classList.remove('hidden');
    }
  }

  async function handlePaymentEditProofChange(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      paymentEditScreenshotData = await readFileAsDataURL(file);
      updatePaymentEditProofUI();
    } catch (error) {
      console.error('Payment proof read error:', error);
      window.showToast('Could not read payment proof image.', true);
    }
  }

  function clearPaymentEditProof() {
    paymentEditScreenshotData = '';
    const fileInput = document.getElementById('payment-edit-proof-file');
    if (fileInput) fileInput.value = '';
    updatePaymentEditProofUI();
  }

  async function savePaymentRecordEdits(event) {
    event.preventDefault();
    if (!activePaymentRecordId) {
      window.showToast('No payment record selected.', true);
      return;
    }

    const date = document.getElementById('payment-edit-date').value;
    const amount = parseInt(document.getElementById('payment-edit-amount').value, 10);
    const paymentMethod = document.getElementById('payment-edit-mode').value;
    const submitBtn = event.target.querySelector('button[type="submit"]');

    if (!date) {
      window.showToast('Please select a payment date.', true);
      return;
    }
    if (!amount || amount <= 0) {
      window.showToast('Please enter a valid amount.', true);
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const response = await fetch(`/api/payment-records/${activePaymentRecordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          amount,
          payment_method: paymentMethod,
          screenshot: String(paymentMethod).toLowerCase().startsWith('online')
            ? paymentEditScreenshotData
            : '',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        window.showToast(errorData.error || 'Failed to update payment record.', true);
        return;
      }

      closePaymentEditModal();
      await loadPaymentRecords();
      await refreshFinancialViews();
      window.showToast('Payment record updated.');
    } catch (error) {
      console.error('Payment update error:', error);
      window.showToast('Failed to update payment record.', true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function deletePaymentRecord(recordId) {
    const record = getPaymentRecordById(recordId);
    const recordLabel = record?.patient_name ? ` for ${record.patient_name}` : '';
    const confirmed = await window.confirmAction(`Delete this payment record${recordLabel}?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/payment-records/${recordId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        window.showToast(errorData.error || 'Failed to delete payment record.', true);
        return;
      }

      if (activePaymentRecordId === recordId) closePaymentEditModal();
      await loadPaymentRecords();
      await refreshFinancialViews();
      window.showToast('Payment record deleted.');
    } catch (error) {
      console.error('Payment delete error:', error);
      window.showToast('Failed to delete payment record.', true);
    }
  }

  async function exportPaymentRecords(range) {
    try {
      const response = await fetch(`/api/payment-records/export?range=${range}`);
      if (!response.ok) {
        window.showToast('Export failed. Please try again.', true);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = range === 'six_months' ? 'payment_records_last_6_months.xlsx' : 'payment_records_current_month.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Payment export error:', error);
      window.showToast('Export failed. Please try again.', true);
    }
  }

  window.openReceiptModal = openReceiptModal;
  window.handleReceiptPatientInputChange = handleReceiptPatientInputChange;
  window.toggleReceiptScreenshot = toggleReceiptScreenshot;
  window.handleReceiptGeneration = handleReceiptGeneration;
  window.printReceipt = printReceipt;
  window.openPaymentRecordsModal = openPaymentRecordsModal;
  window.closePaymentRecordsModal = closePaymentRecordsModal;
  window.filterPaymentRecords = filterPaymentRecords;
  window.showPaymentScreenshot = showPaymentScreenshot;
  window.openPaymentEditModal = openPaymentEditModal;
  window.closePaymentEditModal = closePaymentEditModal;
  window.updatePaymentEditProofUI = updatePaymentEditProofUI;
  window.handlePaymentEditProofChange = handlePaymentEditProofChange;
  window.clearPaymentEditProof = clearPaymentEditProof;
  window.savePaymentRecordEdits = savePaymentRecordEdits;
  window.deletePaymentRecord = deletePaymentRecord;
  window.exportPaymentRecords = exportPaymentRecords;
})();
