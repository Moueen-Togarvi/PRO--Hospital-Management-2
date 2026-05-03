const exportReturnUrl = window.__APP__?.returnUrl || '/dashboard';

async function downloadExcel() {
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: 'all' }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'patients.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      window.location.href = exportReturnUrl;
    } else {
      const errorData = await res.json().catch(() => ({}));
      window.showToast(`Export failed: ${errorData.error || 'Unknown error'}`, true);
    }
  } catch (error) {
    window.showToast(`Export error: ${error.message}`, true);
  }
}

window.downloadExcel = downloadExcel;
