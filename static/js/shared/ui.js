(function () {
  let successHideTimer = null;

  function closeSuccessModal() {
    const modal = document.getElementById('success-modal');
    if (modal) modal.classList.add('hidden');
    if (successHideTimer) {
      window.clearTimeout(successHideTimer);
      successHideTimer = null;
    }
  }

  function updateSuccessModal(message, isError = false) {
    const modal = document.getElementById('success-modal');
    const icon = document.getElementById('success-icon');
    const messageEl = document.getElementById('success-message');
    const button = document.getElementById('success-ok-btn');

    if (!modal || !icon || !messageEl || !button) return false;

    messageEl.textContent = message;
    icon.innerHTML = isError
      ? '<i class="fas fa-circle-exclamation text-6xl text-red-500"></i>'
      : '<i class="fas fa-check-circle text-6xl text-green-500"></i>';
    button.className = isError
      ? 'bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition'
      : 'bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition';

    modal.classList.remove('hidden');
    if (!isError) {
      successHideTimer = window.setTimeout(closeSuccessModal, 2200);
    }
    return true;
  }

  function showToast(message, isError = false) {
    if (updateSuccessModal(message, isError)) {
      return;
    }

    const root = document.getElementById('toast-root');
    if (!root) {
      window.alert(message);
      return;
    }

    root.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.innerHTML = `
      <i class="fas ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i>
      <span>${message}</span>
    `;
    root.appendChild(toast);

    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 3200);
  }

  async function apiFetchJson(url, options = {}) {
    const response = await fetch(url, options);
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }
    return { response, data };
  }

  window.showToast = showToast;
  window.apiFetchJson = apiFetchJson;
  window.confirmAction = async function confirmAction(message) {
    const modal = document.getElementById('confirm-modal');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    if (!modal || !messageEl || !okBtn || !cancelBtn) {
      return window.confirm(message);
    }

    messageEl.textContent = message;
    modal.classList.remove('hidden');

    return new Promise((resolve) => {
      const cleanup = () => {
        modal.classList.add('hidden');
        okBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
      };

      const onConfirm = () => {
        cleanup();
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      const onBackdrop = (event) => {
        if (event.target === modal) {
          cleanup();
          resolve(false);
        }
      };

      okBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('success-ok-btn')?.addEventListener('click', closeSuccessModal);
  });
})();
