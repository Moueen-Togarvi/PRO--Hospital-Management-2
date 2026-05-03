document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const sidebar = document.getElementById('main-sidebar');
  const openBtn = document.getElementById('sidebar-open-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');
  const backdrop = document.getElementById('sidebar-backdrop');
  const logoutButton = document.getElementById('logout-button');

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

  if (openBtn) openBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      body.classList.remove('sidebar-open');
      if (backdrop) backdrop.classList.add('hidden');
      if (sidebar) sidebar.classList.remove('-translate-x-full');
    } else if (sidebar) {
      sidebar.classList.add('-translate-x-full');
    }
  });

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/login';
      }
    });
  }
});

