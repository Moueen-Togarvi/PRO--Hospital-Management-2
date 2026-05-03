function formatCurrency(amount) {
  return `Rs ${new Intl.NumberFormat('en-US').format(Number(amount) || 0)}`;
}

function formatDisplayDate(dateString) {
  if (!dateString) return '-';
  let date;
  if (typeof dateString === 'string' && dateString.length === 10) {
    date = new Date(`${dateString}T00:00:00`);
  } else {
    date = new Date(dateString);
  }
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

window.openExpenseModal = function openExpenseModal() {
  const form = document.getElementById('expense-form');
  if (form) form.reset();
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('exp-date');
  if (dateInput) dateInput.value = today;
  const modal = document.getElementById('expense-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
};

function closeExpenseModal() {
  const modal = document.getElementById('expense-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

window.saveExpense = async function saveExpense(event) {
  event.preventDefault();
  const payload = {
    type: document.getElementById('exp-type').value,
    amount: document.getElementById('exp-amount').value,
    category: document.getElementById('exp-category').value,
    date: document.getElementById('exp-date').value,
    note: document.getElementById('exp-note').value,
  };

  const saveButton = document.getElementById('save-expense-btn');
  if (saveButton) saveButton.disabled = true;

  const { response } = await window.apiFetchJson('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (saveButton) saveButton.disabled = false;

  if (response.ok) {
    closeExpenseModal();
    window.showToast('Expense saved successfully');
    await loadExpenses();
  } else {
    window.showToast('Error saving expense. Please try again.', true);
  }
};

window.deleteExpense = async function deleteExpense(id) {
  if (id.startsWith('auto-')) {
    window.showToast('Automated entries cannot be deleted.');
    return;
  }

  const confirmed = await window.confirmAction('Delete this expense?');
  if (!confirmed) return;

  const { response } = await window.apiFetchJson(`/api/expenses/${id}`, { method: 'DELETE' });
  if (response.ok) {
    window.showToast('Expense deleted');
    await loadExpenses();
  } else {
    window.showToast('Error deleting expense.', true);
  }
};

async function loadExpenses() {
  try {
    const [listResult, summaryResult] = await Promise.all([
      window.apiFetchJson('/api/expenses'),
      window.apiFetchJson('/api/expenses/summary'),
    ]);

    if (summaryResult.response.ok) {
      const summary = summaryResult.data || {};
      document.getElementById('expense-incoming').innerText = formatCurrency(summary.incoming || 0);
      document.getElementById('expense-outgoing').innerText = formatCurrency(summary.outgoing || 0);
      document.getElementById('expense-net').innerText = formatCurrency(summary.net || 0);
    }

    if (listResult.response.ok) {
      renderExpensesTable(listResult.data);
    }
  } catch (error) {
    console.error('Expenses load error', error);
  }
}

function renderExpensesTable(list) {
  const tbody = document.getElementById('expenses-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-400">No expenses recorded.</td></tr>';
    return;
  }

  list.forEach((item) => {
    const tr = document.createElement('tr');
    const typeBadge = item.type === 'incoming'
      ? '<span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Incoming</span>'
      : '<span class="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Outgoing</span>';
    const autoBadge = item.auto
      ? '<span class="ml-2 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">Auto</span>'
      : '';
    const deleteCell = item.auto
      ? '<span class="text-xs text-gray-400">—</span>'
      : `<button onclick="deleteExpense('${item.id}')" class="rounded px-3 py-1 text-sm text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800">
           <i class="fas fa-trash"></i>
         </button>`;

    tr.className = 'transition hover:bg-emerald-50';
    tr.innerHTML = `
      <td class="whitespace-nowrap px-6 py-4 text-gray-800">${formatDisplayDate(item.date)}</td>
      <td class="whitespace-nowrap px-6 py-4 text-gray-700">${item.category || '-'}${autoBadge}</td>
      <td class="px-6 py-4">${typeBadge}</td>
      <td class="px-6 py-4 text-right font-semibold text-gray-800">${formatCurrency(item.amount || 0)}</td>
      <td class="px-6 py-4 text-gray-600">${item.note || '-'}</td>
      <td class="px-6 py-4 text-center">${deleteCell}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const addExpenseBtn = document.getElementById('add-expense-btn');
  if (addExpenseBtn) {
    addExpenseBtn.style.display = window.__APP__?.currentUser?.role === 'Admin' ? 'inline-flex' : 'none';
    addExpenseBtn.addEventListener('click', window.openExpenseModal);
  }

  document.getElementById('expense-form')?.addEventListener('submit', window.saveExpense);
  document.getElementById('cancel-expense-btn')?.addEventListener('click', closeExpenseModal);
  document.getElementById('expense-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'expense-modal') closeExpenseModal();
  });

  await loadExpenses();
});
