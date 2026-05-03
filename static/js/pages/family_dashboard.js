async function renderFamilyDashboard() {
  const container = document.getElementById('family-patients-container');
  if (!container) return;

  container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 0;gap:16px"><div style="width:48px;height:48px;border-radius:50%;border:4px solid #059669;border-top-color:transparent;animation:spin 0.8s linear infinite"></div><p style="color:#065f46;font-weight:600;font-size:14px">Loading your family portal...</p></div>';

  try {
    const res = await fetch('/api/family/dashboard');
    if (!res.ok) {
      container.innerHTML = '<div style="padding:48px;text-align:center;color:#b91c1c;background:#fef2f2;border-radius:16px;margin:24px"><i class="fas fa-exclamation-triangle" style="font-size:24px;margin-bottom:8px"></i><p style="font-weight:700">Failed to load dashboard. Please refresh the page.</p></div>';
      return;
    }
    const data = await res.json();

    if (!data || data.length === 0) {
      container.innerHTML = '<div style="padding:64px 32px;text-align:center;background:white;border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,0.06);margin:24px"><i class="fas fa-user-friends" style="font-size:48px;margin-bottom:12px;color:#d1d5db"></i><h3 style="font-size:20px;font-weight:900;color:#064e3b;margin-bottom:8px">No Patients Linked</h3><p style="color:#6b7280;max-width:360px;margin:0 auto;font-size:14px">No patients are linked to your family account yet. Please contact the hospital administration.</p></div>';
      return;
    }

    container.style.cssText = 'padding:0';
    container.innerHTML = '';

    const fmt = (n) => new Intl.NumberFormat('en-PK').format(Number(n) || 0);

    data.forEach((item) => {
      const p = item.patient;
      const report = item.latest_report;
      const sessionNotes = item.session_notes || [];
      const moodData = item.mood_chart || [];
      const meetings = item.upcoming_meetings || [];
      const fin = item.financial_summary || {};

      let hs = 60;
      if (report) {
        const mood = String(report.mood || report.behavior || '').toLowerCase();
        if (['calm', 'stable', 'normal', 'good', 'happy', 'cooperative', 'improving'].some((k) => mood.indexOf(k) > -1)) hs += 15;
        if (['agitated', 'aggressive', 'depressed', 'anxious', 'violent', 'crisis'].some((k) => mood.indexOf(k) > -1)) hs -= 20;
        if (String(report.vitals || '').toLowerCase().indexOf('normal') > -1) hs += 10;
        const diet = String(report.diet_status || '').toLowerCase();
        if (['good', 'normal', 'adequate', 'regular'].some((k) => diet.indexOf(k) > -1)) hs += 8;
        hs += 5;
      }
      hs = Math.min(100, Math.max(15, hs));

      const hColor = hs >= 70 ? '#059669' : hs >= 45 ? '#d97706' : '#dc2626';
      const admDate = p.admissionDate ? new Date(p.admissionDate) : null;
      const daysIn = admDate ? Math.floor((new Date() - admDate) / (1000 * 60 * 60 * 24)) : 0;
      const balance = fin.balance_due || 0;
      const balLabel = balance > 0 ? 'Due' : balance < 0 ? 'Overpaid' : 'Paid';
      const balColor = balance > 0 ? '#dc2626' : balance < 0 ? '#059669' : '#6b7280';

      let rHtml = '';
      if (report) {
        const rDate = report.date ? String(report.date).split('T')[0].split(' ')[0] : 'Today';
        rHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
          + '<div style="padding:10px;background:#f0fdf4;border-radius:10px;border:1px solid #d1fae5"><div style="font-size:9px;font-weight:800;color:#059669;text-transform:uppercase;margin-bottom:3px"><i class="fas fa-brain"></i> Mood</div><div style="font-size:13px;font-weight:700;color:#065f46">' + (report.behavior || report.mood || 'N/A') + '</div></div>'
          + '<div style="padding:10px;background:#fef2f2;border-radius:10px;border:1px solid #fee2e2"><div style="font-size:9px;font-weight:800;color:#dc2626;text-transform:uppercase;margin-bottom:3px"><i class="fas fa-heartbeat"></i> Vitals</div><div style="font-size:13px;font-weight:700;color:#991b1b">' + (report.vitals || 'Normal') + '</div></div>'
          + '<div style="padding:10px;background:#fffbeb;border-radius:10px;border:1px solid #fef3c7"><div style="font-size:9px;font-weight:800;color:#d97706;text-transform:uppercase;margin-bottom:3px"><i class="fas fa-utensils"></i> Diet</div><div style="font-size:13px;font-weight:700;color:#92400e">' + (report.diet_status || 'N/A') + '</div></div>'
          + '<div style="padding:10px;background:#f0f9ff;border-radius:10px;border:1px solid #e0f2fe"><div style="font-size:9px;font-weight:800;color:#0284c7;text-transform:uppercase;margin-bottom:3px"><i class="fas fa-calendar-day"></i> Date</div><div style="font-size:13px;font-weight:700;color:#075985">' + rDate + '</div></div>'
          + '</div>'
          + '<div style="padding:10px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb"><div style="font-size:9px;font-weight:800;color:#6b7280;text-transform:uppercase;margin-bottom:4px"><i class="fas fa-notes-medical"></i> Clinical Notes</div><div style="font-size:12px;color:#374151;line-height:1.6">' + (report.notes || 'No notes.') + '</div></div>';
      } else {
        rHtml = '<div style="padding:28px;text-align:center;color:#9ca3af;background:#f9fafb;border-radius:12px;border:1px dashed #d1d5db"><i class="fas fa-clipboard-list" style="font-size:24px;margin-bottom:8px;display:block"></i><p style="font-size:12px">No reports available.</p></div>';
      }

      let psychHtml = '';
      if (sessionNotes.length > 0) {
        psychHtml = sessionNotes.map((s) => {
          const sd = s.date ? String(s.date).split('T')[0] : 'Recent';
          return '<div style="padding:12px;background:#f5f3ff;border-radius:10px;border:1px solid #ede9fe;margin-bottom:8px"><div style="font-size:10px;font-weight:700;color:#7c3aed;margin-bottom:4px"><i class="fas fa-clock"></i> ' + sd + '</div><p style="font-size:12px;color:#4c1d95;line-height:1.6;font-style:italic">' + (s.notes || s.note || 'Session completed.') + '</p></div>';
        }).join('');
      } else {
        psychHtml = '<div style="padding:28px;text-align:center;color:#9ca3af;background:#f5f3ff;border-radius:12px;border:1px dashed #ddd6fe"><i class="fas fa-couch" style="font-size:24px;margin-bottom:8px;display:block"></i><p style="font-size:12px">No session notes.</p></div>';
      }

      let meetHtml = '';
      if (meetings.length > 0) {
        meetHtml = meetings.map((m) => {
          const mDate = m.requested_date ? String(m.requested_date).replace('T', ' ').substring(0, 16) : 'TBD';
          const sColor = m.status === 'accepted' ? '#059669' : m.status === 'rescheduled' ? '#2563eb' : '#d97706';
          const sBg = m.status === 'accepted' ? '#d1fae5' : m.status === 'rescheduled' ? '#dbeafe' : '#fef3c7';
          const icon = m.type === 'online' ? 'fa-video' : 'fa-users';
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fffbeb;border-radius:10px;border:1px solid #fef3c7;margin-bottom:8px"><div><div style="font-size:12px;font-weight:700;color:#1f2937"><i class="fas ' + icon + '"></i> ' + mDate + '</div><div style="font-size:10px;color:#6b7280;text-transform:capitalize">' + (m.type || 'physical') + '</div></div><span style="font-size:9px;font-weight:800;padding:3px 10px;border-radius:999px;background:' + sBg + ';color:' + sColor + '">' + (m.status || 'pending').toUpperCase() + '</span></div>';
        }).join('');
      } else {
        meetHtml = '<div style="padding:28px;text-align:center;color:#9ca3af;background:#fffbeb;border-radius:12px;border:1px dashed #fef3c7"><i class="fas fa-calendar-alt" style="font-size:24px;margin-bottom:8px;display:block"></i><p style="font-size:12px">No meetings.</p></div>';
      }

      let moodLine = '';
      if (moodData.length > 0) {
        moodLine = '<div style="display:flex;align-items:center;gap:4px;margin-bottom:10px">'
          + moodData.map((m, i) => {
            const mood = String(m.mood || '').toLowerCase();
            let c = '#10b981';
            if (['agitated', 'aggressive', 'violent', 'crisis'].some((k) => mood.indexOf(k) > -1)) c = '#ef4444';
            else if (['depressed', 'anxious', 'sad', 'low'].some((k) => mood.indexOf(k) > -1)) c = '#3b82f6';
            else if (['calm', 'stable', 'good', 'normal'].some((k) => mood.indexOf(k) > -1)) c = '#10b981';
            else c = '#f59e0b';
            const dot = '<div title="' + ((m.date || '') + '  ' + (m.mood || '')) + '" style="width:14px;height:14px;border-radius:50%;background:' + c + ';flex-shrink:0;cursor:default"></div>';
            return (i > 0 ? '<div style="flex:1;height:2px;background:#e5e7eb;align-self:center"></div>' : '') + dot;
          }).join('')
          + '</div>'
          + '<div style="display:flex;justify-content:space-between;font-size:9px;color:#9ca3af;margin-bottom:10px">'
          + '<span>' + ((moodData[0] && moodData[0].date) || '') + '</span>'
          + '<span>' + ((moodData[moodData.length - 1] && moodData[moodData.length - 1].date) || '') + '</span></div>'
          + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
          + ['<span style="font-size:10px;display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block"></span>Good</span>',
            '<span style="font-size:10px;display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block"></span>Stable</span>',
            '<span style="font-size:10px;display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block"></span>High Risk</span>',
            '<span style="font-size:10px;display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;display:inline-block"></span>Low Mood</span>'].join('')
          + '</div>';
      } else {
        moodLine = '<div style="padding:20px;text-align:center;color:#9ca3af;background:#f9fafb;border-radius:10px;font-size:12px">No data.</div>';
      }

      const statusText = p.isDischarged ? 'Discharged' : 'In Recovery';
      const statusColor = p.isDischarged ? '#9ca3af' : '#10b981';

      const html = ''
        + '<div style="background:#064e3b;padding:28px 32px;color:white;position:relative">'
        + '<div>'
        + '<div style="display:inline-flex;align-items:center;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:999px;padding:4px 14px;font-size:10px;font-weight:800;letter-spacing:.07em;margin-bottom:10px;color:white"><span style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';margin-right:6px"></span>' + statusText + '</div>'
        + '<h2 style="font-size:28px;font-weight:900;margin:0 0 8px">' + p.name + '</h2>'
        + '<div style="display:flex;gap:18px;font-size:11px;color:rgba(255,255,255,0.7)"><span><i class="fas fa-calendar-alt"></i> Admitted: ' + (p.admissionDate ? String(p.admissionDate).split('T')[0] : 'N/A') + '</span><span><i class="fas fa-clock"></i> ' + daysIn + ' Days</span></div></div>'
        + '<a href="' + item.bill_preview_url + '" target="_blank" style="position:absolute;top:28px;right:32px;display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:white;color:#064e3b;border-radius:10px;font-size:11px;font-weight:900;text-decoration:none;box-shadow:0 4px 12px rgba(0,0,0,0.1)"><i class="fas fa-file-invoice"></i> INVOICE</a>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:repeat(5,1fr);background:#f9fafb;border-bottom:1px solid #e5e7eb">'
        + '<div style="padding:15px;text-align:center;border-right:1px solid #e5e7eb"><div style="font-size:18px;font-weight:900;color:' + hColor + '">' + hs + '%</div><div style="font-size:9px;font-weight:800;color:#6b7280">HEALTH</div></div>'
        + '<div style="padding:15px;text-align:center;border-right:1px solid #e5e7eb"><div style="font-size:18px;font-weight:900;color:#111827">' + daysIn + '</div><div style="font-size:9px;font-weight:800;color:#6b7280">DAYS</div></div>'
        + '<div style="padding:15px;text-align:center;border-right:1px solid #e5e7eb"><div style="font-size:18px;font-weight:900;color:#111827">' + sessionNotes.length + '</div><div style="font-size:9px;font-weight:800;color:#6b7280">SESSIONS</div></div>'
        + '<div style="padding:15px;text-align:center;border-right:1px solid #e5e7eb"><div style="font-size:18px;font-weight:900;color:#111827">' + meetings.length + '</div><div style="font-size:9px;font-weight:800;color:#6b7280">MEETINGS</div></div>'
        + '<div style="padding:15px;text-align:center"><div style="font-size:14px;font-weight:900;color:' + balColor + '">Rs ' + fmt(Math.abs(balance)) + '</div><div style="font-size:9px;font-weight:800;color:#6b7280">' + balLabel.toUpperCase() + '</div></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;background:white">'
        + '<div style="padding:20px;border-right:1px solid #e5e7eb"><div style="font-size:11px;font-weight:800;color:#374151;margin-bottom:12px"><i class="fas fa-clipboard-check"></i> LATEST ACTIVITY</div>' + rHtml + '</div>'
        + '<div style="padding:20px;border-right:1px solid #e5e7eb"><div style="font-size:11px;font-weight:800;color:#374151;margin-bottom:12px"><i class="fas fa-user-md"></i> PSYCH NOTES</div>' + psychHtml + '</div>'
        + '<div style="padding:20px"><div style="font-size:11px;font-weight:800;color:#374151;margin-bottom:12px"><i class="fas fa-calendar-check"></i> MEETINGS</div>' + meetHtml + '</div>'
        + '</div>'
        + '<div style="padding:20px;background:#f9fafb;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">'
        + '<div style="flex:1;max-width:400px"><div style="font-size:10px;font-weight:800;color:#6b7280;margin-bottom:8px">MOOD TREND</div>' + moodLine + '</div>'
        + '<div style="text-align:right"><div style="font-size:10px;font-weight:800;color:#6b7280;margin-bottom:4px">TOTAL BILL</div><div style="font-size:20px;font-weight:900;color:#064e3b">Rs ' + fmt(fin.total_charges || 0) + '</div></div>'
        + '</div>';

      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'margin:24px;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);background:white;border:1px solid #e5e7eb';
      wrapper.innerHTML = html;
      container.appendChild(wrapper);
    });
  } catch (e) {
    console.error('Family Dashboard Render Error:', e);
    container.innerHTML = '<div style="padding:48px;text-align:center;color:#b91c1c;background:#fef2f2;border-radius:16px;margin:24px"><i class="fas fa-exclamation-circle" style="font-size:24px;margin-bottom:8px"></i><p style="font-weight:700">An error occurred. Please refresh.</p><p style="font-size:12px;color:#6b7280;margin-top:4px">' + e.message + '</p></div>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await renderFamilyDashboard();
});
