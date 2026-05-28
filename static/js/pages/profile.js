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
  let profileState = {};

  function el(id) {
    return document.getElementById(id);
  }

  function getCurrentProfile() {
    if (typeof window.getSiteProfile === 'function') return window.getSiteProfile();
    return window.__APP__?.siteProfile || {};
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

  function hydrateForm(profile) {
    const source = profile || {};
    profileState = { ...source };
    Object.entries(fields).forEach(([key, id]) => {
      const input = el(id);
      if (input) input.value = source[key] || '';
    });
    renderPreview(source);
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

  document.addEventListener('DOMContentLoaded', () => {
    hydrateForm(getCurrentProfile());
    document.querySelectorAll('#site-profile-form input').forEach((input) => {
      input.addEventListener('input', () => renderPreview());
    });
    el('profile-logo-file')?.addEventListener('change', handleLogoFile);
    el('site-profile-form')?.addEventListener('submit', saveProfile);
  });
})();
