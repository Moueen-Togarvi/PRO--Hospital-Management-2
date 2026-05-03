const currentUser = window.__APP__?.currentUser || { role: 'Guest' };

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
  }).format(Number(amount) || 0);
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

async function renderUtilityBills() {
  if (currentUser.role !== 'Admin') return;

  try {
    const res = await fetch('/api/utility_bills');
    const bills = await res.json();

    const grid = document.getElementById('bills-grid');
    const emptyState = document.getElementById('bills-empty-state');
    const totalDisplay = document.getElementById('bill-total-display');
    if (!grid || !emptyState) return;

    grid.innerHTML = '';
    let currentTotalBills = 0;

    if (bills.length === 0) {
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
    } else {
      emptyState.classList.add('hidden');
      emptyState.classList.remove('flex');
    }

    bills.forEach((bill) => {
      currentTotalBills += bill.amount;

      let iconClass = 'fa-file-invoice';
      let colorClass = 'bg-gray-100 text-gray-600';

      if (bill.type === 'Electricity') {
        iconClass = 'fa-bolt';
        colorClass = 'bg-yellow-100 text-yellow-600';
      } else if (bill.type === 'Gas') {
        iconClass = 'fa-fire';
        colorClass = 'bg-orange-100 text-orange-600';
      } else if (bill.type === 'Water') {
        iconClass = 'fa-tint';
        colorClass = 'bg-blue-100 text-blue-600';
      } else if (bill.type === 'Internet') {
        iconClass = 'fa-wifi';
        colorClass = 'bg-indigo-100 text-indigo-600';
      } else if (bill.type === 'Rent') {
        iconClass = 'fa-home';
        colorClass = 'bg-purple-100 text-purple-600';
      }

      const card = document.createElement('div');
      card.className = 'group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md';
      card.innerHTML = `
        <div class="mb-3 flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full ${colorClass} shadow-sm">
              <i class="fas ${iconClass}"></i>
            </div>
            <div>
              <h4 class="font-bold text-gray-800">${bill.type}</h4>
              <div class="text-xs text-gray-500">${bill.ref_no || 'No Ref'}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-lg font-extrabold text-gray-800">${formatCurrency(bill.amount)}</div>
            <div class="text-xs font-semibold text-red-500">Due: ${bill.due_date}</div>
          </div>
        </div>
        <div class="mt-4 flex justify-end border-t border-gray-100 pt-3">
          <button onclick="payUtilityBill('${bill.id}')" class="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-sm font-bold text-green-700 transition hover:bg-green-600 hover:text-white">
            <i class="fas fa-check"></i> Mark Paid
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    if (totalDisplay) totalDisplay.innerText = formatCurrency(currentTotalBills);
  } catch (error) {
    console.error('Bills Render Error:', error);
  }
}

async function addUtilityBill(e) {
  e.preventDefault();
  const data = {
    type: document.getElementById('bill-type').value,
    amount: document.getElementById('bill-amount').value,
    due_date: document.getElementById('bill-due-date').value,
    ref_no: document.getElementById('bill-ref').value,
  };

  const res = await fetch('/api/utility_bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    showSuccessModal('Bill Added Successfully');
    e.target.reset();
    renderUtilityBills();
  } else {
    showSuccessModal('Error adding bill', true);
  }
}

async function payUtilityBill(id) {
  if (!(await showConfirmModal('Mark this bill as paid? This will move it to Expenses.'))) return;

  const res = await fetch(`/api/utility_bills/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showSuccessModal('Bill Paid & Recorded');
    renderUtilityBills();
  } else {
    showSuccessModal('Error paying bill', true);
  }
}

window.addUtilityBill = addUtilityBill;
window.payUtilityBill = payUtilityBill;

document.addEventListener('DOMContentLoaded', async () => {
  await renderUtilityBills();
});
