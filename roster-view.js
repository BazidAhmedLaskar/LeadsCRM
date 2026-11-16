/* Fameo Shared Sheet Viewer & Collaborative Editor (Google Sheets Style) */

import { auth, db } from './firebase-config.js';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  doc,
  updateDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

let sharedPayload = null;
let currentUser = null;
let activeRosterId = '';
let activeUnsub = null;

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

function normalizeHandle(raw) {
  let val = String(raw || '').trim();
  if (!val) return '';
  const igMatch = val.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i);
  if (igMatch && igMatch[1]) {
    val = igMatch[1];
  }
  val = val.replace(/^@+/, '').trim();
  if (!val) return '';
  if (val.includes('.') && !val.startsWith('@')) return val;
  return `@${val}`;
}

function formatHandleLink(handle) {
  const raw = String(handle || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('@')) return `https://instagram.com/${raw.slice(1)}`;
  if (raw.includes('.')) return `https://${raw}`;
  return `https://instagram.com/${raw}`;
}

function formatWhatsAppLink(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  const clean = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${clean}`;
}

function statusClass(status) {
  return String(status || 'Not Called').toLowerCase().replace(/\s+/g, '');
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encodeHashPayload(payload) {
  const compact = {
    t: payload.title,
    n: payload.note,
    sb: payload.sharedBy,
    ca: payload.createdAt,
    c: payload.columns,
    l: payload.leads.map(item => [
      item.name || '',
      item.handle || '',
      item.phone || '',
      item.email || '',
      item.leadType || '',
      item.category || '',
      item.budget || '',
      item.city || '',
      item.status || 'Not Called',
      item.owner || '',
      item.activity || '',
      item.notes || '',
      item.talkedToday ? 1 : 0,
      item.leadId || ''
    ])
  };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return '#s=' + toBase64Url(compressed);
  }
  return '#d=' + toBase64Url(bytes);
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
        talkedToday: Boolean(item[12]),
        leadId: item[13] || ''
      }
    : {
        name: item.name || '',
        handle: item.handle || '',
        phone: item.phone || '',
        email: item.email || '',
        leadType: item.leadType || '',
        category: item.category || '',
        budget: item.budget || '',
        city: item.city || '',
        status: item.status || 'Not Called',
        owner: item.owner || '',
        activity: item.activity || '',
        notes: item.notes || '',
        talkedToday: Boolean(item.talkedToday),
        leadId: item.leadId || item.id || ''
      }
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

function compactLeadsForDoc(leads) {
  return leads.map(item => [
    item.name || '',
    item.handle || '',
    item.phone || '',
    item.email || '',
    item.leadType || '',
    item.category || '',
    item.budget || '',
    item.city || '',
    item.status || 'Not Called',
    item.owner || '',
    item.activity || '',
    item.notes || '',
    item.talkedToday ? 1 : 0,
    item.leadId || ''
  ]);
}

function updateAuthUI() {
  const badge = document.getElementById('sharedAccessBadge');
  const headerBtn = document.getElementById('sharedHeaderSignInBtn');
  const userChip = document.getElementById('sharedUserChip');
  const userAvatar = document.getElementById('sharedUserAvatar');
  const userName = document.getElementById('sharedUserName');
  const banner = document.getElementById('sharedModeBanner');
  const bannerText = document.getElementById('sharedModeText');
  const bannerBtn = document.getElementById('sharedBannerSignInBtn');

  if (currentUser) {
    const first = currentUser.displayName?.split(' ')[0] || currentUser.email?.split('@')[0] || 'Team';
    if (badge) {
      badge.className = 'badge badge-called';
      badge.textContent = `Edit Mode · ${first}`;
    }
    if (headerBtn) headerBtn.style.display = 'none';
    if (userChip) userChip.style.display = 'inline-flex';
    if (userName) userName.textContent = first;
    if (userAvatar) {
      userAvatar.src = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || currentUser.email || 'F')}&background=ECE7DC&color=141413`;
    }
    if (banner) banner.classList.add('is-edit');
    if (bannerText) {
      bannerText.innerHTML = `<strong>Edit Mode active</strong> (${escapeHtml(currentUser.email || first)}) — click any cell below to edit &amp; auto-save${activeRosterId ? ' with live sync' : ''}.`;
    }
    if (bannerBtn) bannerBtn.style.display = 'none';
  } else {
    if (badge) {
      badge.className = 'badge badge-sentdemo';
      badge.textContent = 'View Only';
    }
    if (headerBtn) headerBtn.style.display = 'inline-flex';
    if (userChip) userChip.style.display = 'none';
    if (banner) banner.classList.remove('is-edit');
    if (bannerText) {
      bannerText.textContent = 'Read-only view · Sign in with your Fameo account to edit cells directly.';
    }
    if (bannerBtn) bannerBtn.style.display = 'inline-flex';
  }
}

function getFilteredSharedRows() {
  if (!sharedPayload) return [];
  const q = (document.getElementById('sharedSearch')?.value || '').trim().toLowerCase();
  return sharedPayload.leads
    .map((lead, idx) => ({ lead, idx }))
    .filter(({ lead }) => {
      if (!q) return true;
      const text = [
        lead.name, lead.handle, lead.phone, lead.email, lead.leadType,
        lead.category, lead.budget, lead.city, lead.status, lead.owner, lead.notes
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

  const rows = getFilteredSharedRows();
  const countEl = document.getElementById('sharedRowCount');
  if (countEl) {
    countEl.textContent = `Showing ${rows.length} of ${sharedPayload.leads.length} clients`;
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
  cols.push({ key: 'links', label: 'Quick Links' });

  const talkedCount = rows.filter(r => r.lead.talkedToday).length;
  const calledCount = rows.filter(r => r.lead.status === 'Called').length;
  const followupCount = rows.filter(r => r.lead.status === 'Follow Up').length;
  const editable = Boolean(currentUser);
  const statusOptions = ['Not Called', 'Called', 'Follow Up', 'Not Picked Call', 'Not Interested', 'Sent Demo'];

  const wrap = document.getElementById('sharedExcelWrap');
  if (!wrap) return;

  if (rows.length === 0) {
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
          <span><strong>${escapeHtml(sharedPayload.title)}</strong> · ${rows.length} rows × ${cols.length} cols${editable ? ' · Editable (auto-saves)' : ' · Read-only'}</span>
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
          ${rows.map(({ lead, idx }, visualIdx) => {
            const igHref = formatHandleLink(lead.handle);
            const waHref = formatWhatsAppLink(lead.phone);

            const cells = [
              editable
                ? `<td><input class="excel-input" style="font-weight:600;min-width:155px;" value="${escapeHtml(lead.name || '')}" onchange="updateSharedCell(${idx}, 'name', this.value)"></td>`
                : `<td class="excel-cell"><strong>${escapeHtml(lead.name || '')}</strong></td>`
            ];

            if (cfg.city) {
              cells.push(editable
                ? `<td><input class="excel-input excel-input-mono" style="min-width:130px;color:var(--accent);" value="${escapeHtml(lead.handle || '')}" placeholder="@instagram_id" onchange="updateSharedCell(${idx}, 'handle', this.value)"></td>`
                : `<td class="excel-cell excel-input-mono">${lead.handle ? `<a href="${escapeHtml(igHref)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;">${escapeHtml(lead.handle)} ↗</a>` : '—'}</td>`
              );
            }

            if (cfg.phone) {
              cells.push(editable
                ? `<td><input class="excel-input excel-input-mono" style="min-width:128px;" value="${escapeHtml(lead.phone || '')}" placeholder="Optional phone" onchange="updateSharedCell(${idx}, 'phone', this.value)"></td>`
                : `<td class="excel-cell excel-input-mono">${lead.phone ? `<a href="tel:${escapeHtml(lead.phone)}" style="color:inherit;text-decoration:none;">${escapeHtml(lead.phone)}</a>` : '—'}</td>`
              );
            }

            if (cfg.email) {
              cells.push(editable
                ? `<td><input class="excel-input excel-input-mono" style="min-width:165px;" type="email" value="${escapeHtml(lead.email || '')}" placeholder="Optional email" onchange="updateSharedCell(${idx}, 'email', this.value)"></td>`
                : `<td class="excel-cell excel-input-mono">${lead.email ? `<a href="mailto:${escapeHtml(lead.email)}" style="color:inherit;text-decoration:none;">${escapeHtml(lead.email)}</a>` : '—'}</td>`
              );
            }

            if (cfg.category) {
              cells.push(editable
                ? `<td><input class="excel-input" style="min-width:98px;" value="${escapeHtml(lead.leadType || '')}" placeholder="Brand" onchange="updateSharedCell(${idx}, 'leadType', this.value)"></td>`
                : `<td class="excel-cell">${escapeHtml(lead.leadType || '—')}</td>`
              );
              cells.push(editable
                ? `<td><input class="excel-input" style="min-width:115px;" value="${escapeHtml(lead.category || '')}" placeholder="Category" onchange="updateSharedCell(${idx}, 'category', this.value)"></td>`
                : `<td class="excel-cell">${escapeHtml(lead.category || '—')}</td>`
              );
              cells.push(editable
                ? `<td><input class="excel-input excel-input-mono" style="min-width:118px;" value="${escapeHtml(lead.budget || '')}" placeholder="Budget" onchange="updateSharedCell(${idx}, 'budget', this.value)"></td>`
                : `<td class="excel-cell excel-input-mono">${escapeHtml(lead.budget || '—')}</td>`
              );
            }

            if (cfg.city) {
              cells.push(editable
                ? `<td><input class="excel-input" style="min-width:105px;" value="${escapeHtml(lead.city || '')}" placeholder="City" onchange="updateSharedCell(${idx}, 'city', this.value)"></td>`
                : `<td class="excel-cell">${escapeHtml(lead.city || '—')}</td>`
              );
            }

            if (cfg.status) {
              cells.push(editable
                ? `<td>
                    <select class="excel-select" style="min-width:132px;font-weight:600;" onchange="updateSharedCell(${idx}, 'status', this.value)">
                      ${statusOptions.map(opt => `<option value="${escapeHtml(opt)}" ${opt === lead.status ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
                    </select>
                  </td>`
                : `<td class="excel-cell"><span class="badge badge-${statusClass(lead.status)}">${escapeHtml(lead.status || 'Not Called')}</span></td>`
              );
            }

            if (cfg.talked) {
              cells.push(`<td class="excel-cell">${escapeHtml(lead.owner || '—')}</td>`);
              cells.push(`<td class="excel-cell excel-input-mono">${escapeHtml(lead.activity || '—')}</td>`);
            }

            if (cfg.notes) {
              cells.push(editable
                ? `<td><input class="excel-input" style="min-width:190px;" value="${escapeHtml(lead.notes || '')}" placeholder="Add note…" onchange="updateSharedCell(${idx}, 'notes', this.value)"></td>`
                : `<td class="excel-cell excel-cell-wide">${escapeHtml(lead.notes || '—')}</td>`
              );
            }

            cells.push(`
              <td class="excel-cell">
                <div class="excel-action-links">
                  ${igHref ? `<a class="excel-mini-btn" href="${escapeHtml(igHref)}" target="_blank" rel="noopener">IG ↗</a>` : ''}
                  ${waHref ? `<a class="excel-mini-btn" href="${escapeHtml(waHref)}" target="_blank" rel="noopener">WA</a>` : ''}
                  ${lead.email ? `<a class="excel-mini-btn" href="mailto:${escapeHtml(lead.email)}">Mail</a>` : ''}
                </div>
              </td>
            `);

            return `<tr><td class="excel-row-num">${visualIdx + 1}</td>${cells.join('')}</tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="excel-footer-row">
            <td class="excel-row-num">Σ</td>
            <td colspan="${cols.length}">
              TOTAL: ${rows.length} CLIENTS · TALKED TODAY: ${talkedCount} · CALLED: ${calledCount} · FOLLOW UP: ${followupCount}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

async function updateSharedCell(rowIdx, field, rawValue) {
  if (!currentUser || !sharedPayload || !sharedPayload.leads[rowIdx]) {
    showToast('Sign in to edit this sheet', 'var(--orange)');
    renderSharedSheet();
    return;
  }

  let value = String(rawValue ?? '').trim();
  if (field === 'name' && !value) {
    showToast('Client name is required', 'var(--red)');
    renderSharedSheet();
    return;
  }
  if (field === 'handle') {
    value = normalizeHandle(value);
    if (!value) {
      showToast('Instagram ID is required', 'var(--red)');
      renderSharedSheet();
      return;
    }
  }

  const row = sharedPayload.leads[rowIdx];
  const actorName = currentUser.displayName || currentUser.email || 'Fameo Team';
  const actorFirst = actorName.split(' ')[0];
  const now = new Date();

  row[field] = value;
  row.owner = actorFirst;
  row.activity = now.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (field === 'status' && value !== 'Not Called') {
    row.talkedToday = true;
  }

  let syncedCRM = false;
  if (row.leadId) {
    try {
      const leadUpdate = {
        [field]: value,
        updatedAt: now,
        lastActivityAt: now,
        lastUpdatedBy: currentUser.uid,
        lastUpdatedByName: actorName
      };
      if (field === 'status' && value !== 'Not Called') {
        leadUpdate.lastTalkedAt = now;
        leadUpdate.lastTalkedBy = currentUser.uid;
        leadUpdate.lastTalkedByName = actorName;
      }
      await updateDoc(doc(db, 'leads', row.leadId), leadUpdate);
      syncedCRM = true;
    } catch (err) {
      console.warn('Could not sync lead doc:', err);
    }
  }

  if (activeRosterId) {
    try {
      await updateDoc(doc(db, 'rosters', activeRosterId), {
        l: compactLeadsForDoc(sharedPayload.leads),
        updatedAt: now,
        updatedByName: actorName
      });
      showToast(syncedCRM ? `Saved ${field} to Sheet & CRM` : `Saved ${field} to Sheet`, 'var(--green)');
      return;
    } catch (err) {
      console.warn('Could not update shared roster doc:', err);
    }
  }

  if (window.location.hash.startsWith('#s=') || window.location.hash.startsWith('#d=')) {
    try {
      const newHash = await encodeHashPayload(sharedPayload);
      window.history.replaceState(null, '', newHash);
    } catch (err) {
      console.warn('Could not update hash state:', err);
    }
  }

  showToast(syncedCRM ? `Saved ${field} to CRM` : `Updated ${field}`, 'var(--green)');
  renderSharedSheet();
}

function subscribeRosterDoc(rosterId) {
  if (activeUnsub) {
    activeUnsub();
    activeUnsub = null;
  }
  activeRosterId = rosterId;
  const titleEl = document.getElementById('sharedSheetTitle');

  activeUnsub = onSnapshot(
    doc(db, 'rosters', rosterId),
    (snap) => {
      if (snap.exists()) {
        sharedPayload = expandPayload(snap.data());
        renderSharedSheet();
      } else {
        if (titleEl) titleEl.textContent = 'Roster not found';
        showToast('This shared sheet link does not exist', 'var(--red)');
      }
    },
    (err) => {
      if (err && err.code === 'permission-denied') {
        if (titleEl) titleEl.textContent = 'Sign in required';
        const authPrompt = document.getElementById('sharedAuthPrompt');
        const controls = document.getElementById('sharedSheetControls');
        if (controls) controls.style.display = 'none';
        if (authPrompt) authPrompt.style.display = 'block';
        return;
      }
      console.error('Error listening to shared sheet:', err);
      if (titleEl) titleEl.textContent = 'Could not load shared sheet';
      showToast('Failed to load shared sheet', 'var(--red)');
    }
  );
}

async function initSharedRoster() {
  const titleEl = document.getElementById('sharedSheetTitle');
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('r') || params.get('id');
    if (id) {
      subscribeRosterDoc(id);
      return;
    }

    const hash = window.location.hash || '';
    if (hash.startsWith('#s=') || hash.startsWith('#d=')) {
      const raw = await decodeHashPayload(hash);
      if (raw) {
        sharedPayload = expandPayload(raw);
        renderSharedSheet();
        return;
      }
    }

    if (titleEl) titleEl.textContent = 'No shared roster specified';
  } catch (error) {
    console.error('Error loading shared sheet:', error);
    if (titleEl) titleEl.textContent = 'Could not load shared sheet';
    showToast('Failed to load shared sheet', 'var(--red)');
  }
}

async function signInSharedViewer() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    showToast('Signed in — Edit Mode enabled!', 'var(--green)');
    const params = new URLSearchParams(window.location.search);
    const id = params.get('r') || params.get('id');
    if (id && !sharedPayload) {
      subscribeRosterDoc(id);
    }
  } catch (err) {
    if (err?.code !== 'auth/popup-closed-by-user') {
      showToast('Sign-in failed: ' + err.message, 'var(--red)');
    }
  }
}

document.getElementById('sharedGoogleSignInBtn')?.addEventListener('click', signInSharedViewer);
document.getElementById('sharedHeaderSignInBtn')?.addEventListener('click', signInSharedViewer);
document.getElementById('sharedBannerSignInBtn')?.addEventListener('click', signInSharedViewer);

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  updateAuthUI();
  if (sharedPayload) {
    renderSharedSheet();
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
  const leads = getFilteredSharedRows().map(r => r.lead);
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
  const leads = getFilteredSharedRows().map(r => r.lead);
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
window.updateSharedCell = updateSharedCell;
window.copyCurrentSheetLink = copyCurrentSheetLink;
window.downloadSharedExcel = downloadSharedExcel;
window.downloadSharedCSV = downloadSharedCSV;

initSharedRoster();
