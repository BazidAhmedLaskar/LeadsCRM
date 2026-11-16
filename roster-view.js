/* Fameo Shared Sheet Viewer (Google Sheets Style) */

import { auth, db } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

let sharedPayload = null;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, color = 'var(--ink)') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = color;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

function getExcelColLetter(idx) {
  let n = idx;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function formatHandleLink(handle) {
  const raw = String(handle || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('@')) return `https://instagram.com/${raw.slice(1)}`;
  if (raw.includes('.')) return `https://${raw}`;
  return `https://instagram.com/${raw}`;
}

function statusClass(status) {
  return String(status || 'Not Called').toLowerCase().replace(/\s+/g, '');
}

function fromBase64Url(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decodeHashPayload(hash) {
  if (hash.startsWith('#s=')) {
    const token = hash.slice(3);
    const compressedBytes = fromBase64Url(token);
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compressedBytes);
      writer.close();
      const text = await new Response(ds.readable).text();
      return JSON.parse(text);
    }
  }
  if (hash.startsWith('#d=')) {
    const token = hash.slice(3);
    const bytes = fromBase64Url(token);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  }
  return null;
}

function expandPayload(raw) {
  // Support compact keys (t, n, c, l) or full keys (title, note, columns, leads)
  const cols = raw.columns || raw.c || {
    phone: true, email: true, status: true, category: true, city: true, notes: true, talked: true
  };
  const leads = (raw.leads || raw.l || []).map(item => Array.isArray(item)
    ? {
        name: item[0] || '',
        handle: item[1] || '',
        phone: item[2] || '',
        email: item[3] || '',
        leadType: item[4] || '',
        category: item[5] || '',
        budget: item[6] || '',
        city: item[7] || '',
        status: item[8] || 'Not Called',
        owner: item[9] || '',
        activity: item[10] || '',
        notes: item[11] || '',
        talkedToday: Boolean(item[12])
      }
    : item
  );

  return {
    title: raw.title || raw.t || 'Fameo Client Roster',
    note: raw.note || raw.n || '',
    sharedBy: raw.sharedBy || raw.sb || raw.createdByName || 'Fameo Team',
    createdAt: raw.createdAt || raw.ca || new Date().toISOString(),
    columns: cols,
    leads
  };
}

function getFilteredSharedLeads() {
  if (!sharedPayload) return [];
  const q = (document.getElementById('sharedSearch')?.value || '').trim().toLowerCase();
  if (!q) return sharedPayload.leads;
  return sharedPayload.leads.filter(l => {
    const text = [
      l.name, l.handle, l.phone, l.email, l.leadType,
      l.category, l.budget, l.city, l.status, l.owner, l.notes
    ].filter(Boolean).join(' ').toLowerCase();
    return text.includes(q);
  });
}

function renderSharedSheet() {
  if (!sharedPayload) return;

  const titleEl = document.getElementById('sharedSheetTitle');
  const noteEl = document.getElementById('sharedSheetNote');
  const metaDateEl = document.getElementById('sharedMetaDate');
  const controlsEl = document.getElementById('sharedSheetControls');
  const authEl = document.getElementById('sharedAuthPrompt');

  if (authEl) authEl.style.display = 'none';
  if (controlsEl) controlsEl.style.display = 'block';

  document.title = `${sharedPayload.title} — Fameo Sheet`;
  if (titleEl) titleEl.textContent = sharedPayload.title;
  if (noteEl) {
    if (sharedPayload.note) {
      noteEl.textContent = sharedPayload.note;
      noteEl.style.display = 'block';
    } else {
      noteEl.style.display = 'none';
    }
  }
  if (metaDateEl) {
    const dt = sharedPayload.createdAt?.seconds
      ? new Date(sharedPayload.createdAt.seconds * 1000)
      : new Date(sharedPayload.createdAt || Date.now());
    const dtStr = !isNaN(dt.getTime())
      ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';
    metaDateEl.textContent = `Shared by ${sharedPayload.sharedBy}${dtStr ? ' · ' + dtStr : ''}`;
  }

  const leads = getFilteredSharedLeads();
  const countEl = document.getElementById('sharedRowCount');
  if (countEl) {
    countEl.textContent = `Showing ${leads.length} of ${sharedPayload.leads.length} clients`;
  }

  const cfg = sharedPayload.columns;
  const cols = [{ key: 'name', label: 'Client Name' }];
  if (cfg.city) cols.push({ key: 'handle', label: 'Instagram ID' });
  if (cfg.phone) cols.push({ key: 'phone', label: 'Phone' });
  if (cfg.email) cols.push({ key: 'email', label: 'Email' });
  if (cfg.category) {
    cols.push({ key: 'leadType', label: 'Type' });
    cols.push({ key: 'category', label: 'Category' });
    cols.push({ key: 'budget', label: 'Budget' });
  }
  if (cfg.city) cols.push({ key: 'city', label: 'City' });
  if (cfg.status) cols.push({ key: 'status', label: 'Status' });
  if (cfg.talked) {
    cols.push({ key: 'owner', label: 'Owner' });
    cols.push({ key: 'activity', label: 'Activity Time' });
  }
  if (cfg.notes) cols.push({ key: 'notes', label: 'Notes' });

  const talkedCount = leads.filter(l => l.talkedToday).length;
  const calledCount = leads.filter(l => l.status === 'Called').length;
  const followupCount = leads.filter(l => l.status === 'Follow Up').length;

  const wrap = document.getElementById('sharedExcelWrap');
  if (!wrap) return;

  if (leads.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="icon">∅</div>
        <h3>No matching rows</h3>
        <p>Clear the search box to see all ${sharedPayload.leads.length} clients in this shared sheet.</p>
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <div class="excel-wrap">
      <div class="excel-toolbar">
        <div class="excel-fx-bar">
          <span class="excel-fx-tag">fx</span>
          <span><strong>${escapeHtml(sharedPayload.title)}</strong> · ${leads.length} rows × ${cols.length} cols</span>
        </div>
        <div>Talked Today: <strong>${talkedCount}</strong> · Called: <strong>${calledCount}</strong> · Follow Up: <strong>${followupCount}</strong></div>
      </div>
      <table class="excel-table">
        <thead>
          <tr class="excel-col-letters">
            <th class="excel-row-num"></th>
            ${cols.map((_, i) => `<th>${getExcelColLetter(i)}</th>`).join('')}
          </tr>
          <tr class="excel-headers">
            <th class="excel-row-num">#</th>
            ${cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${leads.map((lead, idx) => {
            const cells = [`<td class="excel-cell"><strong>${escapeHtml(lead.name || '')}</strong></td>`];
            if (cfg.city) {
              const href = formatHandleLink(lead.handle);
              cells.push(`<td class="excel-cell excel-input-mono">${lead.handle ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;">${escapeHtml(lead.handle)} ↗</a>` : '—'}</td>`);
            }
            if (cfg.phone) {
              cells.push(`<td class="excel-cell excel-input-mono">${lead.phone ? `<a href="tel:${escapeHtml(lead.phone)}" style="color:inherit;text-decoration:none;">${escapeHtml(lead.phone)}</a>` : '—'}</td>`);
            }
            if (cfg.email) {
              cells.push(`<td class="excel-cell excel-input-mono">${lead.email ? `<a href="mailto:${escapeHtml(lead.email)}" style="color:inherit;text-decoration:none;">${escapeHtml(lead.email)}</a>` : '—'}</td>`);
            }
            if (cfg.category) {
              cells.push(`<td class="excel-cell">${escapeHtml(lead.leadType || '—')}</td>`);
              cells.push(`<td class="excel-cell">${escapeHtml(lead.category || '—')}</td>`);
              cells.push(`<td class="excel-cell excel-input-mono">${escapeHtml(lead.budget || '—')}</td>`);
            }
            if (cfg.city) {
              cells.push(`<td class="excel-cell">${escapeHtml(lead.city || '—')}</td>`);
            }
            if (cfg.status) {
              cells.push(`<td class="excel-cell"><span class="badge badge-${statusClass(lead.status)}">${escapeHtml(lead.status || 'Not Called')}</span></td>`);
            }
            if (cfg.talked) {
              cells.push(`<td class="excel-cell">${escapeHtml(lead.owner || '—')}</td>`);
              cells.push(`<td class="excel-cell excel-input-mono">${escapeHtml(lead.activity || '—')}</td>`);
            }
            if (cfg.notes) {
              cells.push(`<td class="excel-cell excel-cell-wide">${escapeHtml(lead.notes || '—')}</td>`);
            }

            return `<tr><td class="excel-row-num">${idx + 1}</td>${cells.join('')}</tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="excel-footer-row">
            <td class="excel-row-num">Σ</td>
            <td colspan="${cols.length}">
              TOTAL: ${leads.length} CLIENTS · TALKED TODAY: ${talkedCount} · CALLED: ${calledCount} · FOLLOW UP: ${followupCount}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

async function initSharedRoster() {
  const titleEl = document.getElementById('sharedSheetTitle');
  try {
    const hash = window.location.hash || '';
    if (hash.startsWith('#s=') || hash.startsWith('#d=')) {
      const raw = await decodeHashPayload(hash);
      if (raw) {
        sharedPayload = expandPayload(raw);
        renderSharedSheet();
        return;
      }
    }

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      try {
        const snap = await getDoc(doc(db, 'rosters', id));
        if (snap.exists()) {
          sharedPayload = expandPayload(snap.data());
          renderSharedSheet();
          return;
        } else {
          if (titleEl) titleEl.textContent = 'Roster not found';
          showToast('This shared sheet link does not exist', 'var(--red)');
          return;
        }
      } catch (err) {
        if (err && err.code === 'permission-denied') {
          if (titleEl) titleEl.textContent = 'Sign in required';
          const authPrompt = document.getElementById('sharedAuthPrompt');
          if (authPrompt) authPrompt.style.display = 'block';
          return;
        }
        throw err;
      }
    }

    if (titleEl) titleEl.textContent = 'No shared roster specified';
  } catch (error) {
    console.error('Error loading shared sheet:', error);
    if (titleEl) titleEl.textContent = 'Could not load shared sheet';
    showToast('Failed to load shared sheet', 'var(--red)');
  }
}

document.getElementById('sharedGoogleSignInBtn')?.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    initSharedRoster();
  } catch (err) {
    showToast('Sign-in failed: ' + err.message, 'var(--red)');
  }
});

async function copyCurrentSheetLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast('Copied sheet link!', 'var(--green)');
  } catch {
    showToast('Could not copy link', 'var(--orange)');
  }
}

function downloadSharedExcel() {
  if (!sharedPayload) return;
  const leads = getFilteredSharedLeads();
  const cfg = sharedPayload.columns;
  const headers = ['#', 'Client Name'];
  if (cfg.city) headers.push('Instagram ID');
  if (cfg.phone) headers.push('Phone');
  if (cfg.email) headers.push('Email');
  if (cfg.category) headers.push('Type', 'Category', 'Budget');
  if (cfg.city) headers.push('City');
  if (cfg.status) headers.push('Status');
  if (cfg.talked) headers.push('Owner', 'Activity Time');
  if (cfg.notes) headers.push('Notes');

  const rows = leads.map((l, idx) => {
    const tds = [`<td style="text-align:center;">${idx + 1}</td>`, `<td><b>${escapeHtml(l.name)}</b></td>`];
    if (cfg.city) tds.push(`<td>${escapeHtml(l.handle || '')}</td>`);
    if (cfg.phone) tds.push(`<td style="mso-number-format:'\\@';">${escapeHtml(l.phone || '')}</td>`);
    if (cfg.email) tds.push(`<td>${escapeHtml(l.email || '')}</td>`);
    if (cfg.category) {
      tds.push(`<td>${escapeHtml(l.leadType || '')}</td>`);
      tds.push(`<td>${escapeHtml(l.category || '')}</td>`);
      tds.push(`<td>${escapeHtml(l.budget || '')}</td>`);
    }
    if (cfg.city) tds.push(`<td>${escapeHtml(l.city || '')}</td>`);
    if (cfg.status) tds.push(`<td>${escapeHtml(l.status || '')}</td>`);
    if (cfg.talked) {
      tds.push(`<td>${escapeHtml(l.owner || '')}</td>`);
      tds.push(`<td>${escapeHtml(l.activity || '')}</td>`);
    }
    if (cfg.notes) tds.push(`<td>${escapeHtml(l.notes || '')}</td>`);
    return `<tr>${tds.join('')}</tr>`;
  }).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8">
      <style>
        table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
        th { background: #1D6F42; color: #FFFFFF; font-weight: bold; border: 1px solid #B8C2CC; padding: 6px 10px; text-align: left; }
        td { border: 1px solid #D0D7DE; padding: 5px 10px; vertical-align: top; }
      </style>
    </head>
    <body><table><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>${rows}</table></body>
    </html>
  `;
  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fameo-shared-roster-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded Excel (${leads.length} rows)`, 'var(--green)');
}

function downloadSharedCSV() {
  if (!sharedPayload) return;
  const leads = getFilteredSharedLeads();
  const cfg = sharedPayload.columns;
  const csvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const headers = ['No.', 'Client Name'];
  if (cfg.city) headers.push('Instagram ID');
  if (cfg.phone) headers.push('Phone');
  if (cfg.email) headers.push('Email');
  if (cfg.category) headers.push('Type', 'Category', 'Budget');
  if (cfg.city) headers.push('City');
  if (cfg.status) headers.push('Status');
  if (cfg.talked) headers.push('Owner', 'Activity Time');
  if (cfg.notes) headers.push('Notes');

  const rows = leads.map((l, idx) => {
    const row = [idx + 1, l.name || ''];
    if (cfg.city) row.push(l.handle || '');
    if (cfg.phone) row.push(l.phone || '');
    if (cfg.email) row.push(l.email || '');
    if (cfg.category) row.push(l.leadType || '', l.category || '', l.budget || '');
    if (cfg.city) row.push(l.city || '');
    if (cfg.status) row.push(l.status || '');
    if (cfg.talked) row.push(l.owner || '', l.activity || '');
    if (cfg.notes) row.push(l.notes || '');
    return row.map(csvCell).join(',');
  });

  const csv = [headers.map(csvCell).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fameo-shared-roster-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported CSV (${leads.length} rows)`, 'var(--green)');
}

window.renderSharedSheet = renderSharedSheet;
window.copyCurrentSheetLink = copyCurrentSheetLink;
window.downloadSharedExcel = downloadSharedExcel;
window.downloadSharedCSV = downloadSharedCSV;

initSharedRoster();
