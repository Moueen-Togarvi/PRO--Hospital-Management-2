function initAppLayout() {
  const body = document.body;
  const sidebar = document.getElementById('main-sidebar');
  const openBtn = document.getElementById('sidebar-open-btn');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');
  const backdrop = document.getElementById('sidebar-backdrop');
  const logoutButtons = document.querySelectorAll('[data-logout-button]');
  const globalBackButton = document.getElementById('global-page-back');

  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
    body.classList.add('sidebar-open');
  }

  function closeSidebar() {
    if (!sidebar || window.innerWidth >= 768) return;
    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
    body.classList.remove('sidebar-open');
  }

  function syncSidebarToggleIcon() {
    const icon = toggleBtn?.querySelector('i');
    if (!icon) return;
    icon.className = body.classList.contains('sidebar-collapsed')
      ? 'fas fa-angles-right'
      : 'fas fa-angles-left';
  }

  if (openBtn) openBtn.addEventListener('click', openSidebar);
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (window.innerWidth < 768) {
        openSidebar();
        return;
      }
      body.classList.toggle('sidebar-collapsed');
      syncSidebarToggleIcon();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);
  if (globalBackButton) {
    globalBackButton.addEventListener('click', () => {
      const fallback = globalBackButton.dataset.fallback || '/dashboard';
      const referrerUrl = document.referrer ? new URL(document.referrer) : null;
      if (referrerUrl && referrerUrl.origin === window.location.origin && window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.href = fallback;
    });
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      body.classList.remove('sidebar-open');
      if (backdrop) backdrop.classList.add('hidden');
      if (sidebar) sidebar.classList.remove('-translate-x-full');
    } else if (sidebar) {
      body.classList.remove('sidebar-collapsed');
      sidebar.classList.add('-translate-x-full');
    }
    syncSidebarToggleIcon();
  });

  syncSidebarToggleIcon();

  logoutButtons.forEach((logoutButton) => {
    logoutButton.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/login';
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppLayout);
} else {
  initAppLayout();
}
