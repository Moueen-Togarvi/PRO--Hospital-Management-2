document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  const forgotForm = document.getElementById('forgot-password-form');
  const resetForm = document.getElementById('reset-password-form');
  const forgotTrigger = document.getElementById('forgot-password-trigger');
  const togglePasswordBtn = document.getElementById('toggle-password-btn');
  const passwordInput = document.getElementById('login-password');
  const resetTokenInput = document.getElementById('reset-token-input');

  const redirectForRole = (role) => {
    const dashboardRoles = new Set(['Admin', 'Doctor', 'Psychologist', 'Canteen', 'Staff']);
    if (dashboardRoles.has(role)) return '/dashboard';
    if (role === 'Family') return '/family-dashboard';
    if (role === 'General Staff') return '/staff-dashboard';
    return '/dashboard';
  };

  const openModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  };

  const closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  };

  function generatePattern() {
    const container = document.getElementById('bgPattern');
    if (!container) return;

    const classes = ['teal', 'green', 'white', 'gold', ''];
    container.innerHTML = '';

    let count = 90;
    if (window.innerWidth <= 420) count = 34;
    else if (window.innerWidth <= 768) count = 55;

    for (let i = 0; i < count; i += 1) {
      const symbol = document.createElement('div');
      symbol.className = `plus-symbol ${classes[Math.floor(Math.random() * classes.length)]}`;
      symbol.textContent = '+';
      symbol.style.left = `${Math.random() * 100}vw`;
      symbol.style.top = `${Math.random() * 100}vh`;
      symbol.style.fontSize = `${0.9 + Math.random() * 1.3}rem`;
      symbol.style.animationDelay = `${Math.random() * 6}s`;
      symbol.style.animationDuration = `${4 + Math.random() * 5}s`;
      symbol.style.opacity = `${0.2 + Math.random() * 0.6}`;
      container.appendChild(symbol);
    }
  }

  function hydrateResetFromUrl() {
    const url = new URL(window.location.href);
    const resetToken = url.searchParams.get('reset_token');
    if (!resetToken || !resetTokenInput) return;

    resetTokenInput.value = resetToken;
    openModal('reset-password-modal');
    url.searchParams.delete('reset_token');
    const nextUrl = url.searchParams.toString() ? `${url.pathname}?${url.searchParams.toString()}` : url.pathname;
    window.history.replaceState({}, document.title, nextUrl);
  }

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const hidden = passwordInput.type === 'password';
      passwordInput.type = hidden ? 'text' : 'password';
      togglePasswordBtn.innerHTML = `<i class="fas ${hidden ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
    });
  }

  if (forgotTrigger) {
    forgotTrigger.addEventListener('click', () => openModal('forgot-password-modal'));
  }

  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.dataset.closeModal));
  });

  document.querySelectorAll('.app-modal').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.add('hidden');
    });
  });

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = 'Signing In...';

      const payload = {
        username: document.getElementById('login-username').value.trim(),
        password: document.getElementById('login-password').value,
      };

      try {
        const { response, data } = await window.apiFetchJson('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          window.showToast(data?.error || 'Login failed.', true);
          return;
        }

        if (data?.mfa_required) {
          window.showToast(data.message || 'MFA is enabled for this account.', true);
          return;
        }

        window.location.href = redirectForRole(data?.role);
      } catch (error) {
        window.showToast('Login error. Please try again.', true);
      } finally {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = 'Sign In';
      }
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        username: document.getElementById('forgot-username').value.trim(),
        email: document.getElementById('forgot-email').value.trim(),
      };

      const { response, data } = await window.apiFetchJson('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        closeModal('forgot-password-modal');
        forgotForm.reset();
        window.showToast(data?.message || 'Reset email sent.');
      } else {
        window.showToast(data?.error || 'Unable to send reset email.', true);
      }
    });
  }

  if (resetForm) {
    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const newPassword = document.getElementById('reset-new-password').value;
      const confirmPassword = document.getElementById('reset-confirm-password').value;

      if (newPassword !== confirmPassword) {
        window.showToast('Passwords do not match.', true);
        return;
      }

      const { response, data } = await window.apiFetchJson('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetTokenInput.value,
          new_password: newPassword,
        }),
      });

      if (response.ok) {
        closeModal('reset-password-modal');
        resetForm.reset();
        window.showToast(data?.message || 'Password updated successfully.');
      } else {
        window.showToast(data?.error || 'Unable to reset password.', true);
      }
    });
  }

  hydrateResetFromUrl();
  generatePattern();
  window.addEventListener('resize', () => {
    window.clearTimeout(window.__patternResizeTimer);
    window.__patternResizeTimer = window.setTimeout(generatePattern, 180);
  });
});
