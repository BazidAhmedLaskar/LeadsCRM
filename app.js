/* Fameo CRM App - Lead Management & Roster */

import { auth, db } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const provider = new GoogleAuthProvider();

document.getElementById('googleSignInBtn')?.addEventListener('click', signInWithGoogle);
document.getElementById('headerSignoutBtn')?.addEventListener('click', handleSignOut);
document.getElementById('pendingSignoutBtn')?.addEventListener('click', handleSignOut);

async function signInWithGoogle() {
  const btn = document.getElementById('googleSignInBtn');
  try {
    if (btn) {
      btn.disabled = true;
      const label = btn.querySelector('.btn-label');
      if (label) label.textContent = 'Signing in…';
    }
    const result = await signInWithPopup(auth, provider);
    console.log('✅ Signed in:', result.user.email);
  } catch (error) {
    console.error('❌ Sign-in error:', error.code, error.message);
    if (error.code === 'auth/popup-closed-by-user') {
      showToast('Sign-in cancelled', 'var(--orange)');
    } else if (error.code === 'auth/popup-blocked') {
      showToast('Pop-up blocked. Enable pop-ups for this site.', 'var(--red)');
    } else {
      showToast('Sign-in failed: ' + error.message, 'var(--red)');
    }
    if (btn) {
      btn.disabled = false;
      const label = btn.querySelector('.btn-label');
      if (label) label.textContent = 'Continue with Google ↗';
    }
  }
}

async function handleSignOut() {
  try {
    await firebaseSignOut(auth);
    console.log('✅ Signed out');
    showToast('Signed out', 'var(--ink)');
    window.location.href = 'login.html';
  } catch (error) {
    console.error('❌ Sign-out error:', error);
    showToast('Sign-out failed', 'var(--red)');
  }
}

// ═════════════════════════════
// Auth State Listener
// ═════════════════════════════

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    if (document.getElementById('loginScreen')) {
      showScreen('loginScreen');
    } else {
      window.location.href = 'login.html';
    }
    console.log('🔓 No user logged in');
    return;
  }

  console.log('🔐 User logged in:', user.uid, user.email);
  showScreen('appScreen');

  const userName = document.getElementById('userName');
  const userAvatar = document.getElementById('userAvatar');

  if (userName) userName.textContent = user.displayName?.split(' ')[0] || user.email.split('@')[0];
  if (userAvatar) {
    userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=ECE7DC&color=141413`;
  }

  loadDatabase();
});

// ═════════════════════════════
// Helpers & Utilities
// ═════════════════════════════

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePhone(phone) {
  return String(phone ?? '').replace(/\D/g, '');
}

function formatWhatsAppLink(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return '#';
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}`;
}

function statusClass(status) {
  return String(status || 'Not Called').toLowerCase().replace(/\s+/g, '');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

let toastTimer;
function showToast(msg, color = 'var(--ink)') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = color;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ═════════════════════════════
// Manual Lead Form
// ═════════════════════════════

function clearManualForm() {
  const ids = ['mName', 'mPhone', 'mCity', 'mHandle', 'mNotes'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const resp = document.getElementById('mResponse');
  if (resp) resp.value = 'Not Called';
  const type = document.getElementById('mType');
  if (type) type.value = 'Brand';
}

function toggleManualForm() {
  const form = document.getElementById('manualForm');
  if (!form) return;
  form.classList.toggle('open');
  if (form.classList.contains('open')) {
    document.getElementById('mName')?.focus();
  } else {
    clearManualForm();
  }
}

async function addManually() {
  if (!auth.currentUser) {
    showToast('Please sign in first', 'var(--red)');
    return;
  }

  const name = document.getElementById('mName')?.value.trim() || '';
  const phone = document.getElementById('mPhone')?.value.trim() || '';
  const response = document.getElementById('mResponse')?.value || 'Not Called';
  const notes = document.getElementById('mNotes')?.value.trim() || '';
  const leadType = document.getElementById('mType')?.value || '';
  const city = document.getElementById('mCity')?.value.trim() || '';
  const handle = document.getElementById('mHandle')?.value.trim() || '';

  if (!name || !phone) {
    showToast('Lead name and phone number are required', 'var(--red)');
    return;
  }

  const normalizedNew = normalizePhone(phone);
  const existingLead = allLeads.find(lead => {
    const existingNorm = normalizePhone(lead.phone);
    if (normalizedNew.length >= 6 && existingNorm.length >= 6) {
      return existingNorm === normalizedNew || existingNorm.endsWith(normalizedNew) || normalizedNew.endsWith(existingNorm);
    }
    return (lead.phone || '').trim() === phone;
  });

  if (existingLead) {
    const status = existingLead.response || existingLead.status || 'Not Called';
    showToast(`${existingLead.name} is already in roster (${status})`, 'var(--orange)');
    return;
  }

  try {
    const payload = {
      name,
      phone,
      status: response,
      response,
      notes,
      createdAt: new Date(),
      createdBy: auth.currentUser.uid,
      createdByName: auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid
    };
    if (leadType) payload.leadType = leadType;
    if (city) payload.city = city;
    if (handle) payload.handle = handle;

    await addDoc(collection(db, 'leads'), payload);

    showToast('Lead added to Fameo roster', 'var(--green)');
    clearManualForm();
    loadDatabase();
  } catch (error) {
    console.error('Error adding lead:', error);
    showToast('Failed to add lead: ' + error.message, 'var(--red)');
  }
}

// ═════════════════════════════
// Database Management
// ═════════════════════════════

let allLeads = [];

async function loadDatabase() {
  if (!auth.currentUser) {
    showToast('Please sign in first', 'var(--red)');
    return;
  }

  try {
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);

    allLeads = [];
    querySnapshot.forEach((docSnap) => {
      allLeads.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderDB();
    renderRecentAdds();
    updateStats();
  } catch (error) {
    console.error('Error loading database:', error);
    showToast('Failed to load database: ' + error.message, 'var(--red)');
  }
}

function buildUserFilter() {
  const userEl = document.getElementById('dbUser');
  if (!userEl) return;

  const current = userEl.value;
  const userMap = new Map();
  allLeads.forEach(l => {
    if (l.createdBy && !userMap.has(l.createdBy)) {
      userMap.set(l.createdBy, l.createdByName || l.createdBy);
    }
  });

  userEl.innerHTML = '<option value="">All Team Members</option>';
  userMap.forEach((name, uid) => {
    const opt = document.createElement('option');
    opt.value = uid;
    opt.textContent = name;
    if (uid === current) opt.selected = true;
    userEl.appendChild(opt);
  });
}

function renderRecentAdds() {
  const container = document.getElementById('searchResults');
  if (!container) return;

  if (allLeads.length === 0) {
    container.innerHTML = '';
    return;
  }

  const recent = allLeads.slice(0, 5);
  container.innerHTML = `
    <div class="recent-panel">
      <div class="recent-head">
        <span class="eyebrow"><span class="eyebrow-dot"></span>Recent Roster Additions</span>
        <button class="mini-link" type="button" onclick="switchTab('database')">See all ${allLeads.length} →</button>
      </div>
      ${recent.map((lead) => {
        const status = lead.response || lead.status || 'Not Called';
        return `
          <div class="recent-row">
            <div>
              <div class="recent-name">${escapeHtml(lead.name)}</div>
              <div class="recent-sub">${escapeHtml(lead.phone)}${lead.city ? ' · ' + escapeHtml(lead.city) : ''}${lead.leadType ? ' · ' + escapeHtml(lead.leadType) : ''}</div>
            </div>
            <span class="badge badge-${statusClass(status)}">${escapeHtml(status)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function clearFilters() {
  const search = document.getElementById('dbSearch');
  const user = document.getElementById('dbUser');
  const status = document.getElementById('dbStatus');
  if (search) search.value = '';
  if (user) user.value = '';
  if (status) status.value = '';
  renderDB();
}

function renderDB() {
  buildUserFilter();
  const searchTerm = (document.getElementById('dbSearch')?.value || '').trim().toLowerCase();
  const userFilter = document.getElementById('dbUser')?.value || '';
  const statusFilter = document.getElementById('dbStatus')?.value || '';

  const clearBtn = document.getElementById('clearFiltersBtn');
  if (clearBtn) {
    clearBtn.style.display = (searchTerm || userFilter || statusFilter) ? 'inline-flex' : 'none';
  }

  const filtered = allLeads.filter(lead => {
    const haystack = [
      lead.name,
      lead.phone,
      lead.notes,
      lead.city,
      lead.handle,
      lead.leadType
    ].filter(Boolean).join(' ').toLowerCase();

    const matchesSearch = !searchTerm || haystack.includes(searchTerm);
    const matchesUser = !userFilter || lead.createdBy === userFilter;
    const currentStatus = lead.response || lead.status || 'Not Called';
    const matchesStatus = !statusFilter || lead.status === statusFilter || currentStatus === statusFilter;

    return matchesSearch && matchesUser && matchesStatus;
  });

  const container = document.getElementById('dbResults');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">∅</div>
        <h3>No leads match your filter</h3>
        <p>${allLeads.length === 0 ? 'Add your first brand or creator lead to get the Fameo roster moving.' : 'Try clearing your search or status filter.'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((lead, idx) => {
    const createdAtDate = lead.createdAt?.seconds ? new Date(lead.createdAt.seconds * 1000) : new Date(lead.createdAt || Date.now());
    const createdAtStr = !isNaN(createdAtDate.getTime())
      ? createdAtDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + createdAtDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '—';
    const status = lead.response || lead.status || 'Not Called';
    const indexStr = String(idx + 1).padStart(2, '0');
    const safeId = escapeHtml(lead.id);
    const safePhone = escapeHtml(lead.phone);

    return `
      <article class="card">
        <div class="card-top">
          <div style="flex:1;min-width:0;">
            <div class="card-index-row">
              <span class="card-idx">${indexStr}</span>
              ${lead.leadType ? `<span class="chip">${escapeHtml(lead.leadType)}</span>` : ''}
              ${lead.city ? `<span class="chip">${escapeHtml(lead.city)}</span>` : ''}
              ${lead.handle ? `<span class="chip">${escapeHtml(lead.handle)}</span>` : ''}
            </div>
            <h3 class="shop-name">${escapeHtml(lead.name)}</h3>
            <div class="contact-row">
              <a class="shop-phone" href="tel:${safePhone}">📞 ${safePhone}</a>
              <button class="mini-link" type="button" onclick="copyPhone('${safePhone}')">Copy</button>
              <a class="mini-link" href="${formatWhatsAppLink(lead.phone)}" target="_blank" rel="noopener">WhatsApp ↗</a>
            </div>
            <div class="shop-meta">
              Added by <strong>${escapeHtml(lead.createdByName || lead.createdBy || 'Team')}</strong> · ${escapeHtml(createdAtStr)}
            </div>
          </div>
          <span class="badge badge-${statusClass(status)}">${escapeHtml(status)}</span>
        </div>

        <div class="notes-box">
          <span class="notes-text ${lead.notes ? '' : 'notes-empty'}" id="notes-${safeId}">${lead.notes ? escapeHtml(lead.notes) : 'No notes yet'}</span>
          <button class="mini-link" type="button" onclick="toggleNotesEditor('${safeId}')">✎ Edit</button>
        </div>

        <div class="notes-editor" id="notes-editor-${safeId}">
          <textarea class="notes-area" id="notes-input-${safeId}" rows="2" placeholder="Write call notes, budget, or next step…">${escapeHtml(lead.notes || '')}</textarea>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" type="button" onclick="saveInlineNotes('${safeId}')">Save Notes</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick="toggleNotesEditor('${safeId}')">Cancel</button>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn btn-green btn-sm" type="button" onclick="updateStatus('${safeId}', 'Called')">✓ Called</button>
          <button class="btn btn-orange btn-sm" type="button" onclick="updateStatus('${safeId}', 'Follow Up')">◷ Follow Up</button>
          <button class="btn btn-stone btn-sm" type="button" onclick="updateStatus('${safeId}', 'Not Picked Call')">✕ Not Picked</button>
          <button class="btn btn-red btn-sm" type="button" onclick="updateStatus('${safeId}', 'Not Interested')">⊘ Not Interested</button>
          <button class="btn btn-blue btn-sm" type="button" onclick="updateStatus('${safeId}', 'Sent Demo')">↗ Sent Demo</button>
          <span class="card-actions-spacer"></span>
          <button class="btn btn-ghost btn-sm" type="button" onclick="deleteLead('${safeId}')">Delete</button>
        </div>
      </article>
    `;
  }).join('');
}

function updateStats() {
  const total = allLeads.length;
  const called = allLeads.filter(l => (l.response || l.status) === 'Called').length;
  const pending = allLeads.filter(l => (l.response || l.status) === 'Not Called').length;
  const followup = allLeads.filter(l => (l.response || l.status) === 'Follow Up').length;
  const notPicked = allLeads.filter(l => (l.response || l.status) === 'Not Picked Call').length;
  const notInterested = allLeads.filter(l => (l.response || l.status) === 'Not Interested').length;
  const sentDemo = allLeads.filter(l => (l.response || l.status) === 'Sent Demo').length;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const calledToday = allLeads.filter(l => {
    if ((l.response || l.status) !== 'Called') return false;
    const createdAtDate = l.createdAt?.seconds ? new Date(l.createdAt.seconds * 1000) : new Date(l.createdAt || 0);
    return createdAtDate >= startOfDay;
  }).length;

  const setStat = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setStat('statTotal', total);
  setStat('statCalled', called);
  setStat('statPending', pending);
  setStat('statFollowup', followup);
  setStat('statNotPicked', notPicked);
  setStat('statNotInterested', notInterested);
  setStat('statSentDemo', sentDemo);
  setStat('statCalledToday', calledToday);
}

async function updateStatus(id, status) {
  try {
    await updateDoc(doc(db, 'leads', id), { status, response: status });
    showToast(`Status updated → ${status}`, 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating status:', error);
    showToast('Failed to update status', 'var(--red)');
  }
}

async function deleteLead(id) {
  if (!confirm('Remove this lead from the Fameo roster?')) return;

  try {
    await deleteDoc(doc(db, 'leads', id));
    showToast('Lead removed', 'var(--ink)');
    loadDatabase();
  } catch (error) {
    console.error('Error deleting lead:', error);
    showToast('Failed to delete lead', 'var(--red)');
  }
}

function toggleNotesEditor(id) {
  const editor = document.getElementById(`notes-editor-${id}`);
  if (!editor) return;
  editor.classList.toggle('open');
  if (editor.classList.contains('open')) {
    document.getElementById(`notes-input-${id}`)?.focus();
  }
}

async function saveInlineNotes(id) {
  const input = document.getElementById(`notes-input-${id}`);
  if (!input) return;
  const newNotes = input.value.trim();

  try {
    await updateDoc(doc(db, 'leads', id), { notes: newNotes });
    showToast('Notes saved', 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating notes:', error);
    showToast('Failed to save notes', 'var(--red)');
  }
}

async function editNotes(id) {
  const notesSpan = document.getElementById(`notes-${id}`);
  const currentNotes = !notesSpan || notesSpan.textContent === 'No notes yet' ? '' : notesSpan.textContent;
  const newNotes = prompt('Edit notes:', currentNotes);
  if (newNotes === null) return;

  try {
    await updateDoc(doc(db, 'leads', id), { notes: newNotes.trim() });
    showToast('Notes updated', 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating notes:', error);
    showToast('Failed to update notes', 'var(--red)');
  }
}

async function copyPhone(phone) {
  try {
    await navigator.clipboard.writeText(phone);
    showToast(`Copied ${phone}`, 'var(--ink)');
  } catch {
    showToast('Could not copy phone number', 'var(--orange)');
  }
}

function exportCSV() {
  if (!allLeads.length) {
    showToast('No leads to export yet', 'var(--orange)');
    return;
  }

  const headers = ['Name', 'Phone', 'Type', 'City', 'Handle', 'Status', 'Notes', 'Added By', 'Created At'];
  const csvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = allLeads.map(l => {
    const dt = l.createdAt?.seconds ? new Date(l.createdAt.seconds * 1000) : new Date(l.createdAt || Date.now());
    const dtStr = !isNaN(dt.getTime()) ? dt.toISOString() : '';
    return [
      l.name,
      l.phone,
      l.leadType || '',
      l.city || '',
      l.handle || '',
      l.response || l.status || '',
      l.notes || '',
      l.createdByName || l.createdBy || '',
      dtStr
    ].map(csvCell).join(',');
  });

  const csv = [headers.map(csvCell).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fameo-crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Exported CSV', 'var(--green)');
}

function switchTab(tabName) {
  const tabs = document.querySelectorAll('.tab');
  const pages = document.querySelectorAll('.page');

  tabs.forEach(tab => {
    const target = tab.dataset.tab;
    const isActive = target ? target === tabName : tab.textContent.toLowerCase().includes(tabName === 'search' ? 'add' : 'database');
    tab.classList.toggle('active', isActive);
  });

  pages.forEach(page => {
    page.classList.toggle('active', page.id === `page-${tabName}`);
  });
}

// Make functions globally available
window.showScreen = showScreen;
window.showToast = showToast;
window.switchTab = switchTab;
window.signInWithGoogle = signInWithGoogle;
window.handleSignOut = handleSignOut;
window.toggleManualForm = toggleManualForm;
window.clearManualForm = clearManualForm;
window.addManually = addManually;
window.loadDatabase = loadDatabase;
window.renderDB = renderDB;
window.clearFilters = clearFilters;
window.updateStatus = updateStatus;
window.deleteLead = deleteLead;
window.toggleNotesEditor = toggleNotesEditor;
window.saveInlineNotes = saveInlineNotes;
window.editNotes = editNotes;
window.copyPhone = copyPhone;
window.exportCSV = exportCSV;

console.log('✅ Fameo CRM initialized');
