(function () {
  async function changePassword(event) {
    event.preventDefault();
    const form = event.target;
    const response = await fetch('/api/users/change_password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        old_password: form['old-password'].value,
        new_password: form['new-password-user'].value,
      }),
    });

    if (response.ok) {
      window.showToast('Password Updated');
      form.reset();
      document.getElementById('password-modal')?.classList.add('hidden');
      return;
    }

    const data = await response.json().catch(() => ({}));
    window.showToast(data.error || 'Error', true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('password-button')?.addEventListener('click', () => {
      document.getElementById('password-modal')?.classList.remove('hidden');
    });

    document.getElementById('password-change-form')?.addEventListener('submit', changePassword);
  });
})();
