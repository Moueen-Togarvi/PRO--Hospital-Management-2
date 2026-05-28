(function () {
  const fields = {
    name: 'profile-name',
    system_name: 'profile-system-name',
    tagline: 'profile-tagline',
    owner_name: 'profile-owner-name',
    phone: 'profile-phone',
    email: 'profile-email',
    address: 'profile-address',
    website_url: 'profile-website-url',
  };
  const accountFields = {
    name: 'account-name',
    username: 'account-username',
    email: 'account-email',
  };
  let profileState = {};
  let accountState = {};

  function el(id) {
    return document.getElementById(id);
  }

  function getCurrentProfile() {
    if (typeof window.getSiteProfile === 'function') return window.getSiteProfile();
    return window.__APP__?.siteProfile || {};
  }

  function getCurrentUser() {
    return window.__APP__?.currentUser || {};
  }

  function setText(id, value) {
    const target = el(id);
    if (target) target.textContent = value || '';
  }

  function collectProfile() {
    const profile = { ...profileState };
    Object.entries(fields).forEach(([key, id]) => {
      profile[key] = el(id)?.value.trim() || '';
    });
    return profile;
  }

  function normalizeAccount(source = {}) {
    return {
      user_id: source.user_id || source._id || '',
      username: source.username || '',
      name: source.name || source.display_name || source.username || '',
      email: source.email || '',
      role: source.role || '',
    };
  }

  function collectAccount() {
    const account = { ...accountState };
    Object.entries(accountFields).forEach(([key, id]) => {
      account[key] = el(id)?.value.trim() || '';
    });
    return account;
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.classList.add('opacity-70');
      button.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i><span>${loadingText}</span>`;
      return;
    }
    button.disabled = false;
    button.classList.remove('opacity-70');
    if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
  }

  function renderPreview(profile = collectProfile()) {
    const logo = el('profile-logo-preview');
    const fallback = el('profile-logo-fallback');
    if (logo && fallback) {
      if (profile.logo_url) {
        logo.src = profile.logo_url;
        logo.classList.remove('hidden');
        fallback.classList.add('hidden');
      } else {
        logo.removeAttribute('src');
        logo.classList.add('hidden');
        fallback.classList.remove('hidden');
      }
    }

    setText('profile-preview-short-name', profile.short_name);
    setText('profile-preview-name', profile.name);
    setText('profile-preview-tagline', profile.tagline);
    setText('profile-preview-owner', profile.owner_name);
    setText('profile-preview-phone', profile.phone);
    setText('profile-preview-email', profile.email);
    setText('profile-preview-address', profile.address);
  }

  function renderAccountPreview(account = collectAccount()) {
    const safeAccount = normalizeAccount(account);
    const initial = (safeAccount.name || safeAccount.username || 'U').slice(0, 1).toUpperCase();
    setText('account-avatar-initial', initial);
    setText('account-preview-role', safeAccount.role);
    setText('account-preview-name', safeAccount.name || safeAccount.username);
    setText('account-preview-username', safeAccount.username ? `@${safeAccount.username}` : '');
    setText('account-preview-email', safeAccount.email);
  }

  function hydrateForm(profile) {
    const source = profile || {};
    profileState = { ...source };
    Object.entries(fields).forEach(([key, id]) => {
      const input = el(id);
      if (input) input.value = source[key] || '';
    });
    renderPreview(source);
  }

  function hydrateAccount(profile) {
    const source = normalizeAccount(profile);
    accountState = { ...source };
    Object.entries(accountFields).forEach(([key, id]) => {
      const input = el(id);
      if (input) input.value = source[key] || '';
    });
    renderAccountPreview(source);
  }

  async function loadAccountProfile() {
    hydrateAccount(normalizeAccount(getCurrentUser()));

    try {
      const { response, data } = await window.apiFetchJson('/api/auth/profile');
      if (!response.ok) return;
      hydrateAccount(data.profile);
      window.__APP__.currentUser = { ...(window.__APP__.currentUser || {}), ...(data.profile || {}) };
    } catch (error) {
      window.showToast('Unable to load account profile.', true);
    }
  }

  async function handleLogoFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const logoInput = el('profile-logo-file');
    const formData = new FormData();
    formData.append('logo', file);

    try {
      const { response, data } = await window.apiFetchJson('/api/site-profile/logo', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        window.showToast(data?.error || 'Unable to upload logo.', true);
        return;
      }

      window.__APP__.siteProfile = data.profile;
      hydrateForm(data.profile);
      window.showToast('Logo uploaded successfully.');
    } catch (error) {
      window.showToast('Unable to upload logo.', true);
    } finally {
      if (logoInput) logoInput.value = '';
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const button = el('profile-save-button');
    if (button) {
      button.disabled = true;
      button.classList.add('opacity-70');
    }

    try {
      const { response, data } = await window.apiFetchJson('/api/site-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectProfile()),
      });

      if (!response.ok) {
        window.showToast(data?.error || 'Unable to save profile.', true);
        return;
      }

      window.__APP__.siteProfile = data.profile;
      hydrateForm(data.profile);
      window.showToast('Profile updated successfully.');
    } catch (error) {
      window.showToast('Unable to save profile.', true);
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove('opacity-70');
      }
    }
  }

  async function saveAccount(event) {
    event.preventDefault();
    const button = el('account-save-button');
    const payload = collectAccount();

    if (!payload.name || !payload.username || !payload.email) {
      window.showToast('Name, username, and email are required.', true);
      return;
    }

    setButtonLoading(button, true, 'Saving');
    try {
      const { response, data } = await window.apiFetchJson('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        window.showToast(data?.error || 'Unable to save account.', true);
        return;
      }

      hydrateAccount(data.profile);
      window.__APP__.currentUser = { ...(window.__APP__.currentUser || {}), ...(data.profile || {}) };
      window.showToast('Account updated successfully.');
    } catch (error) {
      window.showToast('Unable to save account.', true);
    } finally {
      setButtonLoading(button, false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    const button = el('account-password-button');
    const currentPassword = el('account-current-password')?.value || '';
    const newPassword = el('account-new-password')?.value || '';
    const confirmPassword = el('account-confirm-password')?.value || '';

    if (!newPassword) {
      window.showToast('Enter a new password first.', true);
      return;
    }
    if (newPassword.length < 6) {
      window.showToast('New password must be at least 6 characters.', true);
      return;
    }
    if (newPassword !== confirmPassword) {
      window.showToast('Password confirmation does not match.', true);
      return;
    }
    if (!currentPassword) {
      window.showToast('Current password is required.', true);
      return;
    }

    setButtonLoading(button, true, 'Updating');
    try {
      const { response, data } = await window.apiFetchJson('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...collectAccount(),
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        window.showToast(data?.error || 'Unable to update password.', true);
        return;
      }

      hydrateAccount(data.profile);
      window.__APP__.currentUser = { ...(window.__APP__.currentUser || {}), ...(data.profile || {}) };
      el('account-password-form')?.reset();
      window.showToast('Password updated successfully.');
    } catch (error) {
      window.showToast('Unable to update password.', true);
    } finally {
      setButtonLoading(button, false);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    hydrateForm(getCurrentProfile());
    loadAccountProfile();
    document.querySelectorAll('#site-profile-form input').forEach((input) => {
      input.addEventListener('input', () => renderPreview());
    });
    document.querySelectorAll('#account-profile-form input').forEach((input) => {
      input.addEventListener('input', () => renderAccountPreview());
    });
    el('profile-logo-file')?.addEventListener('change', handleLogoFile);
    el('site-profile-form')?.addEventListener('submit', saveProfile);
    el('account-profile-form')?.addEventListener('submit', saveAccount);
    el('account-password-form')?.addEventListener('submit', savePassword);
  });
})();
