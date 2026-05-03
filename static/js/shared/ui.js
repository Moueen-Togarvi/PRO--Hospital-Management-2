(function () {
  function showToast(message, isError = false) {
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
    return window.confirm(message);
  };
})();

