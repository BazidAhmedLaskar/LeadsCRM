/* Fameo CRM App - Client Pipeline & Outreach Roster */

import { auth, db } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const provider = new GoogleAuthProvider();
const TALKED_STATUSES = new Set(['Called', 'Follow Up', 'Sent Demo', 'Not Interested']);

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
// Helpers & Date Utilities
// ═════════════════════════════

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toDate(val) {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function getStartOfDay(offsetDays = 0) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
}

function getStartOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getLeadStatus(lead) {
  return lead.response || lead.status || 'Not Called';
}

function getTalkedDate(lead) {
  const explicit = toDate(lead.lastTalkedAt);
  if (explicit) return explicit;
  if (TALKED_STATUSES.has(getLeadStatus(lead))) {
    return toDate(lead.updatedAt) || toDate(lead.createdAt);
  }
  return null;
}

function getActivityDate(lead) {
  return toDate(lead.lastActivityAt) || toDate(lead.lastTalkedAt) || toDate(lead.updatedAt) || toDate(lead.createdAt);
}

function isTalkedToday(lead) {
  const status = getLeadStatus(lead);
  if (!TALKED_STATUSES.has(status)) return false;
  const talkedDate = getTalkedDate(lead);
  return Boolean(talkedDate && talkedDate >= getStartOfDay());
}

function isAddedToday(lead) {
  const created = toDate(lead.createdAt);
  return Boolean(created && created >= getStartOfDay());
}

function isAttemptedToday(lead) {
  if (getLeadStatus(lead) !== 'Not Picked Call') return false;
  const dt = toDate(lead.lastCallAttemptAt) || toDate(lead.updatedAt) || toDate(lead.createdAt);
  return Boolean(dt && dt >= getStartOfDay());
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

function formatMailtoLink(lead) {
  const email = encodeURIComponent(lead.email || '');
  const subject = encodeURIComponent(`Fameo — Brand Campaign Collaboration (${lead.name || 'Campaign Brief'})`);
  const body = encodeURIComponent(
    `Hi ${lead.name || 'there'},\n\nReaching out from Fameo (Guwahati · Pan India).\n\nBest,\nFameo Team\nfameomedia@gmail.com`
  );
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

function formatHandleLink(handle) {
  const raw = String(handle || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('@')) return `https://instagram.com/${raw.slice(1)}`;
  if (raw.includes('.')) return `https://${raw}`;
  return `https://instagram.com/${raw}`;
}

function normalizeHandle(handle) {
  let raw = String(handle || '').trim().toLowerCase();
  raw = raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  raw = raw.split('?')[0].split('#')[0];
  raw = raw.replace(/^@+/, '').replace(/\/+$/, '');
  return raw;
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
// Manual Client Form
// ═════════════════════════════

function clearManualForm() {
  const ids = ['mName', 'mPhone', 'mEmail', 'mCity', 'mHandle', 'mNotes'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const resp = document.getElementById('mResponse');
  if (resp) resp.value = 'Not Called';
  const type = document.getElementById('mType');
  if (type) type.value = 'Brand';
  const cat = document.getElementById('mCategory');
  if (cat) cat.value = '';
  const budget = document.getElementById('mBudget');
  if (budget) budget.value = '';
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
  const email = document.getElementById('mEmail')?.value.trim() || '';
  const response = document.getElementById('mResponse')?.value || 'Not Called';
  const notes = document.getElementById('mNotes')?.value.trim() || '';
  const leadType = document.getElementById('mType')?.value || '';
  const category = document.getElementById('mCategory')?.value || '';
  const budget = document.getElementById('mBudget')?.value || '';
  const city = document.getElementById('mCity')?.value.trim() || '';
  const handle = document.getElementById('mHandle')?.value.trim() || '';

  if (!name || !handle) {
    showToast('Client name and Instagram ID are required', 'var(--red)');
    return;
  }

  const normalizedHandle = normalizeHandle(handle);
  const existingByHandle = allLeads.find(lead => {
    const existingNorm = normalizeHandle(lead.handle);
    return normalizedHandle && existingNorm && existingNorm === normalizedHandle;
  });

  if (existingByHandle) {
    const status = getLeadStatus(existingByHandle);
    showToast(`${existingByHandle.name} (${existingByHandle.handle}) is already in roster (${status})`, 'var(--orange)');
    return;
  }

  if (phone) {
    const normalizedNew = normalizePhone(phone);
    const existingByPhone = allLeads.find(lead => {
      if (!lead.phone) return false;
      const existingNorm = normalizePhone(lead.phone);
      if (normalizedNew.length >= 6 && existingNorm.length >= 6) {
        return existingNorm === normalizedNew || existingNorm.endsWith(normalizedNew) || normalizedNew.endsWith(existingNorm);
      }
      return (lead.phone || '').trim() === phone;
    });

    if (existingByPhone) {
      const status = getLeadStatus(existingByPhone);
      showToast(`${existingByPhone.name} is already in roster (${status})`, 'var(--orange)');
      return;
    }
  }

  if (email) {
    const normalizedEmail = email.toLowerCase();
    const existingByEmail = allLeads.find(lead => (lead.email || '').trim().toLowerCase() === normalizedEmail);
    if (existingByEmail) {
      const status = getLeadStatus(existingByEmail);
      showToast(`${existingByEmail.name} already uses that email (${status})`, 'var(--orange)');
      return;
    }
  }

  try {
    const now = new Date();
    const actorName = auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid;
    const payload = {
      name,
      phone,
      email,
      status: response,
      response,
      notes,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      createdBy: auth.currentUser.uid,
      createdByName: actorName
    };
    if (TALKED_STATUSES.has(response)) {
      payload.lastTalkedAt = now;
      payload.lastTalkedByName = actorName;
    } else if (response === 'Not Picked Call') {
      payload.lastCallAttemptAt = now;
    }
    if (leadType) payload.leadType = leadType;
    if (category) payload.category = category;
    if (budget) payload.budget = budget;
    if (city) payload.city = city;
    if (handle) payload.handle = handle;

    await addDoc(collection(db, 'leads'), payload);

    showToast('Client added to Fameo roster', 'var(--green)');
    clearManualForm();
    loadDatabase();
  } catch (error) {
    console.error('Error adding client:', error);
    showToast('Failed to add client: ' + error.message, 'var(--red)');
  }
}

// ═════════════════════════════
// Database & Dynamic Filters
// ═════════════════════════════

let allLeads = [];
let todayListExpanded = false;
let dbViewMode = 'cards';
const selectedRosterIds = new Set();

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

    buildAllFilters();
    renderTodayTalkedPanel();
    renderDB();
    renderRecentAdds();
    updateStats();
    updateRosterSelectionUI();
    renderRoster();
  } catch (error) {
    console.error('Error loading database:', error);
    showToast('Failed to load database: ' + error.message, 'var(--red)');
  }
}

function populateSelect(id, defaultLabel, items) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = el.value;
  el.innerHTML = '';

  const def = document.createElement('option');
  def.value = '';
  def.textContent = defaultLabel;
  el.appendChild(def);

  items.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === prev) opt.selected = true;
    el.appendChild(opt);
  });
}

function buildAllFilters() {
  // Team Members
  const userMap = new Map();
  allLeads.forEach(l => {
    if (l.createdBy && !userMap.has(l.createdBy)) {
      userMap.set(l.createdBy, l.createdByName || l.createdBy);
    }
  });
  populateSelect(
    'dbUser',
    'All Team Members',
    Array.from(userMap.entries()).map(([value, label]) => ({ value, label }))
  );

  // Client Types
  const baseTypes = ['Brand', 'D2C / Ecommerce', 'Local Business', 'Agency / Partner', 'Other'];
  const typeSet = new Set(baseTypes);
  allLeads.forEach(l => {
    if (l.leadType && l.leadType !== 'Creator') typeSet.add(l.leadType);
  });
  populateSelect(
    'dbType',
    'All Client Types',
    Array.from(typeSet).map(v => ({ value: v, label: v }))
  );

  // Categories
  const baseCategories = [
    'Skincare',
    'Beauty & Cosmetics',
    'Fashion',
    'Wellness',
    'Health & Fitness',
    'Finance',
    'Entertainment & Lifestyle',
    'Other'
  ];
  const catSet = new Set(baseCategories);
  allLeads.forEach(l => {
    if (l.category) catSet.add(l.category);
  });
  populateSelect(
    'dbCategory',
    'All Categories',
    Array.from(catSet).map(v => ({ value: v, label: v }))
  );

  // Cities
  const cityMap = new Map();
  allLeads.forEach(l => {
    const c = (l.city || '').trim();
    if (c && !cityMap.has(c.toLowerCase())) {
      cityMap.set(c.toLowerCase(), c);
    }
  });
  const sortedCities = Array.from(cityMap.values()).sort((a, b) => a.localeCompare(b));
  populateSelect(
    'dbCity',
    'All Cities',
    sortedCities.map(v => ({ value: v, label: v }))
  );

  // Budgets
  const baseBudgets = [
    'Under ₹1,00,000',
    '₹1,00,000 – ₹3,00,000',
    '₹3,00,000 – ₹7,00,000',
    '₹7,00,000 – ₹15,00,000',
    '₹15,00,000+'
  ];
  const budgetSet = new Set(baseBudgets);
  allLeads.forEach(l => {
    if (l.budget) budgetSet.add(l.budget);
  });
  populateSelect(
    'dbBudget',
    'All Budgets',
    Array.from(budgetSet).map(v => ({ value: v, label: v }))
  );
}

// ═════════════════════════════
// Today's Talked Clients Panel
// ═════════════════════════════

function toggleTodayList() {
  todayListExpanded = !todayListExpanded;
  const listEl = document.getElementById('todayTalkedList');
  const btnEl = document.getElementById('toggleTodayListBtn');
  if (listEl) listEl.classList.toggle('open', todayListExpanded);
  if (btnEl) btnEl.textContent = todayListExpanded ? 'Hide Today’s Log ▴' : 'Show Today’s Log ▾';
}

function renderTodayTalkedPanel() {
  const dateLabel = document.getElementById('todayDateLabel');
  const heading = document.getElementById('todayTalkedHeading');
  const chipsEl = document.getElementById('todayBreakdownChips');
  const listEl = document.getElementById('todayTalkedList');
  const btnEl = document.getElementById('toggleTodayListBtn');

  if (dateLabel) {
    dateLabel.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  const talkedToday = allLeads
    .filter(isTalkedToday)
    .sort((a, b) => (getTalkedDate(b)?.getTime() || 0) - (getTalkedDate(a)?.getTime() || 0));

  const addedTodayCount = allLeads.filter(isAddedToday).length;
  const notPickedTodayCount = allLeads.filter(isAttemptedToday).length;

  const countByStatus = (st) => talkedToday.filter(l => getLeadStatus(l) === st).length;

  if (heading) {
    const n = talkedToday.length;
    heading.textContent = `${n} ${n === 1 ? 'client' : 'clients'}`;
  }

  if (chipsEl) {
    chipsEl.innerHTML = `
      <span class="badge badge-called">Called Today: ${countByStatus('Called')}</span>
      <span class="badge badge-followup">Follow Up Today: ${countByStatus('Follow Up')}</span>
      <span class="badge badge-sentdemo">Sent Demo Today: ${countByStatus('Sent Demo')}</span>
      <span class="badge badge-notinterested">Not Interested Today: ${countByStatus('Not Interested')}</span>
      <span class="badge badge-notpickedcall">Not Picked Today: ${notPickedTodayCount}</span>
      <span class="chip">Added Today: ${addedTodayCount}</span>
    `;
  }

  if (listEl) {
    if (talkedToday.length === 0) {
      listEl.innerHTML = `<div class="today-client-note" style="padding:10px 4px;">No clients talked yet today. Mark any client as Called, Follow Up, Sent Demo, or Not Interested to log today’s conversation.</div>`;
    } else {
      listEl.innerHTML = talkedToday.map(lead => {
        const status = getLeadStatus(lead);
        const dt = getTalkedDate(lead);
        const timeStr = dt ? dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
        const contact = [lead.phone, lead.email].filter(Boolean).join(' · ') || 'No contact';
        const byName = lead.lastTalkedByName || lead.lastUpdatedByName || lead.createdByName || 'Team';

        return `
          <div class="today-row">
            <div style="min-width:0;">
              <div class="today-client-name">${escapeHtml(lead.name)}</div>
              <div class="today-client-note">${lead.notes ? escapeHtml(lead.notes) : 'No notes logged'}</div>
            </div>
            <div class="today-client-contact">${escapeHtml(contact)}</div>
            <span class="badge badge-${statusClass(status)}">${escapeHtml(status)}</span>
            <div class="today-client-time">${escapeHtml(timeStr)} · ${escapeHtml(byName.split(' ')[0])}</div>
          </div>
        `;
      }).join('');
    }
    listEl.classList.toggle('open', todayListExpanded);
  }

  if (btnEl) {
    btnEl.textContent = todayListExpanded ? 'Hide Today’s Log ▴' : 'Show Today’s Log ▾';
  }
}

// ═════════════════════════════
// Filtering & Rendering
// ═════════════════════════════

function getActiveFilterState() {
  return {
    searchTerm: (document.getElementById('dbSearch')?.value || '').trim().toLowerCase(),
    statusFilter: document.getElementById('dbStatus')?.value || '',
    dateFilter: document.getElementById('dbDate')?.value || '',
    userFilter: document.getElementById('dbUser')?.value || '',
    typeFilter: document.getElementById('dbType')?.value || '',
    categoryFilter: document.getElementById('dbCategory')?.value || '',
    cityFilter: document.getElementById('dbCity')?.value || '',
    budgetFilter: document.getElementById('dbBudget')?.value || '',
    contactFilter: document.getElementById('dbContact')?.value || '',
    sortBy: document.getElementById('dbSort')?.value || 'activityDesc'
  };
}

function getFilteredLeads() {
  const f = getActiveFilterState();
  const last7 = getStartOfDay(-6);
  const startMonth = getStartOfMonth();

  const filtered = allLeads.filter(lead => {
    const haystack = [
      lead.name,
      lead.email,
      lead.phone,
      lead.notes,
      lead.city,
      lead.handle,
      lead.leadType,
      lead.category,
      lead.budget
    ].filter(Boolean).join(' ').toLowerCase();

    if (f.searchTerm && !haystack.includes(f.searchTerm)) return false;

    const currentStatus = getLeadStatus(lead);
    if (f.statusFilter && lead.status !== f.statusFilter && currentStatus !== f.statusFilter) return false;

    if (f.userFilter && lead.createdBy !== f.userFilter) return false;

    if (f.typeFilter && (lead.leadType || '') !== f.typeFilter) return false;

    if (f.categoryFilter && (lead.category || '') !== f.categoryFilter) return false;

    if (f.cityFilter && (lead.city || '').trim().toLowerCase() !== f.cityFilter.toLowerCase()) return false;

    if (f.budgetFilter && (lead.budget || '') !== f.budgetFilter) return false;

    if (f.contactFilter === 'handle' && !(lead.handle || '').trim()) return false;
    if (f.contactFilter === 'email' && !(lead.email || '').trim()) return false;
    if (f.contactFilter === 'phone' && !(lead.phone || '').trim()) return false;
    if (f.contactFilter === 'both' && (!(lead.email || '').trim() || !(lead.phone || '').trim())) return false;
    if (f.contactFilter === 'notes' && !(lead.notes || '').trim()) return false;

    if (f.dateFilter === 'talkedToday' && !isTalkedToday(lead)) return false;
    if (f.dateFilter === 'addedToday' && !isAddedToday(lead)) return false;
    if (f.dateFilter === 'last7days') {
      const act = getActivityDate(lead);
      if (!act || act < last7) return false;
    }
    if (f.dateFilter === 'thisMonth') {
      const act = getActivityDate(lead);
      if (!act || act < startMonth) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    if (f.sortBy === 'createdDesc') {
      return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
    }
    if (f.sortBy === 'createdAsc') {
      return (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0);
    }
    if (f.sortBy === 'nameAsc') {
      return (a.name || '').localeCompare(b.name || '');
    }
    if (f.sortBy === 'status') {
      return getLeadStatus(a).localeCompare(getLeadStatus(b));
    }
    // activityDesc
    return (getActivityDate(b)?.getTime() || 0) - (getActivityDate(a)?.getTime() || 0);
  });

  return filtered;
}

function syncPresetHighlights() {
  const f = getActiveFilterState();
  let activePreset = '';
  const noExtra = !f.searchTerm && !f.userFilter && !f.typeFilter && !f.categoryFilter && !f.cityFilter && !f.budgetFilter;

  if (noExtra && !f.statusFilter && !f.dateFilter && !f.contactFilter) {
    activePreset = 'all';
  } else if (noExtra && f.dateFilter === 'talkedToday' && !f.statusFilter && !f.contactFilter) {
    activePreset = 'talkedToday';
  } else if (noExtra && f.dateFilter === 'addedToday' && !f.statusFilter && !f.contactFilter) {
    activePreset = 'addedToday';
  } else if (noExtra && f.statusFilter && !f.dateFilter && !f.contactFilter) {
    activePreset = `status:${f.statusFilter}`;
  } else if (noExtra && f.contactFilter === 'email' && !f.statusFilter && !f.dateFilter) {
    activePreset = 'hasEmail';
  } else if (noExtra && f.contactFilter === 'phone' && !f.statusFilter && !f.dateFilter) {
    activePreset = 'hasPhone';
  }

  document.querySelectorAll('#quickFilterPills .quick-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.preset === activePreset);
  });

  document.querySelectorAll('.stats .stat-box').forEach(box => {
    const onclickAttr = box.getAttribute('onclick') || '';
    const match = onclickAttr.match(/applyQuickPreset\('([^']+)'\)/);
    box.classList.toggle('stat-active', Boolean(match && match[1] === activePreset && activePreset !== 'all'));
  });
}

function applyQuickPreset(preset) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('dbSearch', '');
  setVal('dbStatus', '');
  setVal('dbDate', '');
  setVal('dbUser', '');
  setVal('dbType', '');
  setVal('dbCategory', '');
  setVal('dbCity', '');
  setVal('dbBudget', '');
  setVal('dbContact', '');

  if (preset === 'talkedToday') {
    setVal('dbDate', 'talkedToday');
  } else if (preset === 'addedToday') {
    setVal('dbDate', 'addedToday');
  } else if (preset === 'hasEmail') {
    setVal('dbContact', 'email');
  } else if (preset === 'hasPhone') {
    setVal('dbContact', 'phone');
  } else if (preset.startsWith('status:')) {
    setVal('dbStatus', preset.slice(7));
  }

  renderDB();
}

function clearFilters() {
  applyQuickPreset('all');
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
        const status = getLeadStatus(lead);
        const typeLabel = lead.leadType && lead.leadType !== 'Creator' ? lead.leadType : '';
        const subParts = [lead.handle, lead.phone, lead.email, lead.city, typeLabel].filter(Boolean).map(escapeHtml);
        return `
          <div class="recent-row">
            <div>
              <div class="recent-name">${escapeHtml(lead.name)}</div>
              <div class="recent-sub">${subParts.join(' · ') || '—'}</div>
            </div>
            <span class="badge badge-${statusClass(status)}">${escapeHtml(status)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderDB() {
  const f = getActiveFilterState();
  const hasAnyFilter = Boolean(
    f.searchTerm || f.statusFilter || f.dateFilter || f.userFilter ||
    f.typeFilter || f.categoryFilter || f.cityFilter || f.budgetFilter || f.contactFilter
  );

  const clearBtn = document.getElementById('clearFiltersBtn');
  if (clearBtn) clearBtn.style.display = hasAnyFilter ? 'inline-flex' : 'none';

  syncPresetHighlights();

  const filtered = getFilteredLeads();

  const countEl = document.getElementById('dbResultCount');
  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${allLeads.length} ${allLeads.length === 1 ? 'client' : 'clients'}`;
  }

  const container = document.getElementById('dbResults');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">∅</div>
        <h3>No clients match your filters</h3>
        <p>${allLeads.length === 0 ? 'Add your first brand or client lead to get the Fameo roster moving.' : 'Try clearing one or more filters to view your clients.'}</p>
      </div>
    `;
    return;
  }

  if (dbViewMode === 'excel') {
    container.innerHTML = renderExcelSheet(filtered, {
      editable: true,
      showActions: true,
      sheetTitle: 'Fameo_Client_Pipeline.xls'
    });
    return;
  }

  container.innerHTML = filtered.map((lead, idx) => {
    const createdAtDate = toDate(lead.createdAt) || new Date();
    const createdAtStr = createdAtDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' · ' + createdAtDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const talkedDt = getTalkedDate(lead);
    const talkedTodayBadge = isTalkedToday(lead) && talkedDt
      ? `<span class="chip" style="border-color:var(--accent);color:var(--accent);background:var(--accent-dim);">Talked today · ${escapeHtml(talkedDt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))}</span>`
      : '';

    const status = getLeadStatus(lead);
    const indexStr = String(idx + 1).padStart(2, '0');
    const safeId = escapeHtml(lead.id);
    const safePhone = escapeHtml(lead.phone || '');
    const safeEmail = escapeHtml(lead.email || '');
    const handleHref = formatHandleLink(lead.handle);
    const displayType = lead.leadType && lead.leadType !== 'Creator' ? lead.leadType : '';
    const isSelectedForRoster = selectedRosterIds.has(lead.id);

    return `
      <article class="card">
        <div class="card-top">
          <div style="flex:1;min-width:0;">
            <div class="card-index-row">
              <span class="card-idx">${indexStr}</span>
              <button class="roster-select-toggle ${isSelectedForRoster ? 'selected' : ''}" type="button" onclick="toggleRosterSelect('${safeId}')">
                ${isSelectedForRoster ? '✓ In Roster' : '+ Roster'}
              </button>
              ${talkedTodayBadge}
              ${displayType ? `<span class="chip">${escapeHtml(displayType)}</span>` : ''}
              ${lead.category ? `<span class="chip">${escapeHtml(lead.category)}</span>` : ''}
              ${lead.budget ? `<span class="chip">${escapeHtml(lead.budget)}</span>` : ''}
              ${lead.city ? `<span class="chip">${escapeHtml(lead.city)}</span>` : ''}
              ${lead.handle ? `<a class="chip" href="${escapeHtml(handleHref)}" target="_blank" rel="noopener" style="text-decoration:none;">${escapeHtml(lead.handle)} ↗</a>` : ''}
            </div>
            <h3 class="shop-name">${escapeHtml(lead.name)}</h3>
            <div class="contact-row">
              ${lead.handle ? `
                <a class="shop-phone" href="${escapeHtml(handleHref)}" target="_blank" rel="noopener">📸 ${escapeHtml(lead.handle)} ↗</a>
                <button class="mini-link" type="button" onclick="copyText('${escapeHtml(lead.handle)}', 'Instagram ID')">Copy</button>
              ` : ''}
              ${lead.phone ? `
                <a class="shop-phone" href="tel:${safePhone}">📞 ${safePhone}</a>
                <button class="mini-link" type="button" onclick="copyText('${safePhone}', 'phone')">Copy</button>
                <a class="mini-link" href="${formatWhatsAppLink(lead.phone)}" target="_blank" rel="noopener">WhatsApp ↗</a>
              ` : ''}
              ${lead.email ? `
                <a class="shop-email" href="${formatMailtoLink(lead)}">✉ ${safeEmail}</a>
                <button class="mini-link" type="button" onclick="copyText('${safeEmail}', 'email')">Copy</button>
              ` : ''}
            </div>
            <div class="shop-meta">
              Added by <strong>${escapeHtml(lead.createdByName || lead.createdBy || 'Team')}</strong> · ${escapeHtml(createdAtStr)}
            </div>
          </div>
          <span class="badge badge-${statusClass(status)}">${escapeHtml(status)}</span>
        </div>

        <div class="notes-box">
          <span class="notes-text ${lead.notes ? '' : 'notes-empty'}" id="notes-${safeId}">${lead.notes ? escapeHtml(lead.notes) : 'No notes yet'}</span>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="mini-link" type="button" onclick="toggleNotesEditor('${safeId}')">✎ Notes</button>
            <button class="mini-link" type="button" onclick="toggleLeadEditor('${safeId}')">✎ Details</button>
          </div>
        </div>

        <div class="notes-editor" id="notes-editor-${safeId}">
          <textarea class="notes-area" id="notes-input-${safeId}" rows="2" placeholder="Write call notes, budget, or next step…">${escapeHtml(lead.notes || '')}</textarea>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" type="button" onclick="saveInlineNotes('${safeId}')">Save Notes</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick="toggleNotesEditor('${safeId}')">Cancel</button>
          </div>
        </div>

        <div class="edit-lead-panel" id="lead-editor-${safeId}">
          <div class="edit-lead-grid">
            <div class="field-group">
              <label class="field-label">Client / Brand Name</label>
              <input class="form-input" id="edit-name-${safeId}" value="${escapeHtml(lead.name || '')}">
            </div>
            <div class="field-group">
              <label class="field-label">Phone / WhatsApp</label>
              <input class="form-input" id="edit-phone-${safeId}" value="${safePhone}">
            </div>
            <div class="field-group">
              <label class="field-label">Email Address</label>
              <input class="form-input" id="edit-email-${safeId}" type="email" value="${safeEmail}" placeholder="team@brand.com">
            </div>
            <div class="field-group">
              <label class="field-label">Instagram / Website</label>
              <input class="form-input" id="edit-handle-${safeId}" value="${escapeHtml(lead.handle || '')}" placeholder="@handle or website.com">
            </div>
            <div class="field-group">
              <label class="field-label">Category / Niche</label>
              <input class="form-input" id="edit-category-${safeId}" value="${escapeHtml(lead.category || '')}" placeholder="e.g. Skincare, Fashion">
            </div>
            <div class="field-group">
              <label class="field-label">Budget</label>
              <input class="form-input" id="edit-budget-${safeId}" value="${escapeHtml(lead.budget || '')}" placeholder="e.g. ₹1,00,000 – ₹3,00,000">
            </div>
            <div class="field-group">
              <label class="field-label">City / Market</label>
              <input class="form-input" id="edit-city-${safeId}" value="${escapeHtml(lead.city || '')}" placeholder="Guwahati, Mumbai…">
            </div>
            <div class="field-group">
              <label class="field-label">Client Type</label>
              <input class="form-input" id="edit-type-${safeId}" value="${escapeHtml(displayType)}" placeholder="Brand / D2C / Partner">
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" type="button" onclick="saveLeadDetails('${safeId}')">Save Details ↗</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick="toggleLeadEditor('${safeId}')">Cancel</button>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn btn-green btn-sm" type="button" onclick="updateStatus('${safeId}', 'Called')">✓ Called</button>
          <button class="btn btn-orange btn-sm" type="button" onclick="updateStatus('${safeId}', 'Follow Up')">◷ Follow Up</button>
          <button class="btn btn-stone btn-sm" type="button" onclick="updateStatus('${safeId}', 'Not Picked Call')">✕ Not Picked</button>
          <button class="btn btn-red btn-sm" type="button" onclick="updateStatus('${safeId}', 'Not Interested')">⊘ Not Interested</button>
          <button class="btn btn-blue btn-sm" type="button" onclick="updateStatus('${safeId}', 'Sent Demo')">↗ Sent Demo</button>
          ${lead.email ? `<a class="btn btn-ghost btn-sm" href="${formatMailtoLink(lead)}">✉ Email ↗</a>` : ''}
          <span class="card-actions-spacer"></span>
          <button class="btn btn-ghost btn-sm" type="button" onclick="deleteLead('${safeId}')">Delete</button>
        </div>
      </article>
    `;
  }).join('');
}

function updateStats() {
  const total = allLeads.length;
  const called = allLeads.filter(l => getLeadStatus(l) === 'Called').length;
  const pending = allLeads.filter(l => getLeadStatus(l) === 'Not Called').length;
  const followup = allLeads.filter(l => getLeadStatus(l) === 'Follow Up').length;
  const notPicked = allLeads.filter(l => getLeadStatus(l) === 'Not Picked Call').length;
  const notInterested = allLeads.filter(l => getLeadStatus(l) === 'Not Interested').length;
  const sentDemo = allLeads.filter(l => getLeadStatus(l) === 'Sent Demo').length;
  const talkedTodayCount = allLeads.filter(isTalkedToday).length;

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
  setStat('statCalledToday', talkedTodayCount);
}

async function updateStatus(id, status) {
  try {
    const now = new Date();
    const actorName = auth.currentUser?.displayName || auth.currentUser?.email || auth.currentUser?.uid || 'Team';
    const updates = {
      status,
      response: status,
      updatedAt: now,
      lastActivityAt: now,
      lastUpdatedBy: auth.currentUser?.uid || '',
      lastUpdatedByName: actorName
    };
    if (TALKED_STATUSES.has(status)) {
      updates.lastTalkedAt = now;
      updates.lastTalkedByName = actorName;
    } else if (status === 'Not Picked Call') {
      updates.lastCallAttemptAt = now;
    }

    await updateDoc(doc(db, 'leads', id), updates);
    showToast(`Status updated → ${status}`, 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating status:', error);
    showToast('Failed to update status', 'var(--red)');
  }
}

async function deleteLead(id) {
  if (!confirm('Remove this client from the Fameo roster?')) return;

  try {
    await deleteDoc(doc(db, 'leads', id));
    showToast('Client removed', 'var(--ink)');
    loadDatabase();
  } catch (error) {
    console.error('Error deleting client:', error);
    showToast('Failed to delete client', 'var(--red)');
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
    const now = new Date();
    await updateDoc(doc(db, 'leads', id), {
      notes: newNotes,
      updatedAt: now,
      lastActivityAt: now
    });
    showToast('Notes saved', 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating notes:', error);
    showToast('Failed to save notes', 'var(--red)');
  }
}

function toggleLeadEditor(id) {
  const editor = document.getElementById(`lead-editor-${id}`);
  if (!editor) return;
  editor.classList.toggle('open');
  if (editor.classList.contains('open')) {
    document.getElementById(`edit-email-${id}`)?.focus();
  }
}

async function saveLeadDetails(id) {
  const name = document.getElementById(`edit-name-${id}`)?.value.trim() || '';
  const phone = document.getElementById(`edit-phone-${id}`)?.value.trim() || '';
  const email = document.getElementById(`edit-email-${id}`)?.value.trim() || '';
  const handle = document.getElementById(`edit-handle-${id}`)?.value.trim() || '';
  const category = document.getElementById(`edit-category-${id}`)?.value.trim() || '';
  const budget = document.getElementById(`edit-budget-${id}`)?.value.trim() || '';
  const city = document.getElementById(`edit-city-${id}`)?.value.trim() || '';
  const leadType = document.getElementById(`edit-type-${id}`)?.value.trim() || '';

  if (!name || !handle) {
    showToast('Client name and Instagram ID are required', 'var(--red)');
    return;
  }

  try {
    const now = new Date();
    await updateDoc(doc(db, 'leads', id), {
      name,
      phone,
      email,
      handle,
      category,
      budget,
      city,
      leadType,
      updatedAt: now,
      lastActivityAt: now
    });
    showToast('Client details updated', 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating client details:', error);
    showToast('Failed to update client details', 'var(--red)');
  }
}

async function editNotes(id) {
  const notesSpan = document.getElementById(`notes-${id}`);
  const currentNotes = !notesSpan || notesSpan.textContent === 'No notes yet' ? '' : notesSpan.textContent;
  const newNotes = prompt('Edit notes:', currentNotes);
  if (newNotes === null) return;

  try {
    const now = new Date();
    await updateDoc(doc(db, 'leads', id), {
      notes: newNotes.trim(),
      updatedAt: now,
      lastActivityAt: now
    });
    showToast('Notes updated', 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating notes:', error);
    showToast('Failed to update notes', 'var(--red)');
  }
}

async function copyText(value, label = 'value') {
  try {
    await navigator.clipboard.writeText(value);
    showToast(`Copied ${value}`, 'var(--ink)');
  } catch {
    showToast(`Could not copy ${label}`, 'var(--orange)');
  }
}

async function copyPhone(phone) {
  return copyText(phone, 'phone number');
}

function exportCSV() {
  const list = getFilteredLeads();
  if (!list.length) {
    showToast('No clients to export for current filter', 'var(--orange)');
    return;
  }

  const headers = [
    'Client Name', 'Phone', 'Email', 'Client Type', 'Category', 'Budget',
    'City', 'Handle', 'Status', 'Talked Today', 'Last Talked At',
    'Notes', 'Added By', 'Created At'
  ];
  const csvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = list.map(l => {
    const dt = toDate(l.createdAt);
    const talkedDt = getTalkedDate(l);
    return [
      l.name,
      l.phone,
      l.email || '',
      l.leadType && l.leadType !== 'Creator' ? l.leadType : '',
      l.category || '',
      l.budget || '',
      l.city || '',
      l.handle || '',
      getLeadStatus(l),
      isTalkedToday(l) ? 'Yes' : 'No',
      talkedDt ? talkedDt.toISOString() : '',
      l.notes || '',
      l.createdByName || l.createdBy || '',
      dt ? dt.toISOString() : ''
    ].map(csvCell).join(',');
  });

  const csv = [headers.map(csvCell).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fameo-crm-clients-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${list.length} clients`, 'var(--green)');
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

  if (tabName === 'roster') {
    renderRoster();
  }
}

// ═════════════════════════════
// Roster Builder & Sharing
// ═════════════════════════════

function updateRosterSelectionUI() {
  // Prune deleted leads
  const validIds = new Set(allLeads.map(l => l.id));
  for (const id of Array.from(selectedRosterIds)) {
    if (!validIds.has(id)) selectedRosterIds.delete(id);
  }

  const count = selectedRosterIds.size;
  const statusEl = document.getElementById('rosterSelectionStatus');
  if (statusEl) {
    statusEl.textContent = count > 0
      ? `${count} ${count === 1 ? 'client' : 'clients'} selected for roster`
      : 'Select clients below or build a roster from filtered / today’s calls';
  }

  const clearBtn = document.getElementById('clearSelectionBtn');
  if (clearBtn) clearBtn.style.display = count > 0 ? 'inline-flex' : 'none';

  const tabBadge = document.getElementById('rosterTabBadge');
  if (tabBadge) {
    tabBadge.textContent = count;
    tabBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

function toggleRosterSelect(id) {
  if (selectedRosterIds.has(id)) {
    selectedRosterIds.delete(id);
  } else {
    selectedRosterIds.add(id);
  }
  updateRosterSelectionUI();
  renderDB();
  renderRoster();
}

function selectAllFiltered() {
  const filtered = getFilteredLeads();
  if (!filtered.length) {
    showToast('No filtered clients to select', 'var(--orange)');
    return;
  }
  filtered.forEach(l => selectedRosterIds.add(l.id));
  updateRosterSelectionUI();
  renderDB();
  renderRoster();
  showToast(`Added ${filtered.length} clients to roster`, 'var(--green)');
}

function clearRosterSelection() {
  selectedRosterIds.clear();
  updateRosterSelectionUI();
  renderDB();
  renderRoster();
  showToast('Roster selection cleared', 'var(--ink)');
}

function openRosterWithSource(source) {
  const srcEl = document.getElementById('rosterSource');
  if (srcEl) srcEl.value = source;

  const titleEl = document.getElementById('rosterTitle');
  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (titleEl && (!titleEl.value.trim() || titleEl.value.startsWith('Fameo '))) {
    if (source === 'talkedToday') {
      titleEl.value = `Fameo Today’s Talked Clients — ${todayStr}`;
    } else if (source === 'selected') {
      titleEl.value = `Fameo Selected Client Roster — ${todayStr}`;
    } else if (source === 'filtered') {
      titleEl.value = `Fameo Filtered Client Roster — ${todayStr}`;
    } else {
      titleEl.value = `Fameo Complete Client Roster — ${todayStr}`;
    }
  }

  switchTab('roster');
  renderRoster();
}

function openRosterFromDatabase() {
  if (selectedRosterIds.size > 0) {
    openRosterWithSource('selected');
  } else {
    openRosterWithSource('filtered');
  }
}

function getRosterConfig() {
  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const source = document.getElementById('rosterSource')?.value || 'talkedToday';
  const titleInput = document.getElementById('rosterTitle')?.value.trim();
  const defaultTitle = source === 'talkedToday'
    ? `Fameo Today’s Talked Clients — ${todayStr}`
    : `Fameo Client Roster — ${todayStr}`;

  return {
    source,
    title: titleInput || defaultTitle,
    note: document.getElementById('rosterNote')?.value.trim() || '',
    showPhone: document.getElementById('rColPhone')?.checked ?? true,
    showEmail: document.getElementById('rColEmail')?.checked ?? true,
    showStatus: document.getElementById('rColStatus')?.checked ?? true,
    showCategory: document.getElementById('rColCategory')?.checked ?? true,
    showCity: document.getElementById('rColCity')?.checked ?? true,
    showNotes: document.getElementById('rColNotes')?.checked ?? true,
    showTalked: document.getElementById('rColTalked')?.checked ?? true
  };
}

function getRosterLeads(source) {
  if (source === 'selected') {
    return allLeads.filter(l => selectedRosterIds.has(l.id));
  }
  if (source === 'filtered') {
    return getFilteredLeads();
  }
  if (source === 'talkedToday') {
    return allLeads
      .filter(isTalkedToday)
      .sort((a, b) => (getTalkedDate(b)?.getTime() || 0) - (getTalkedDate(a)?.getTime() || 0));
  }
  return [...allLeads];
}

function buildRosterPlainText(leads, cfg) {
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });

  const lines = [
    `*${cfg.title}*`,
    `Fameo Studio · ${dateStr} · Total: ${leads.length} ${leads.length === 1 ? 'client' : 'clients'}`
  ];

  if (cfg.note) {
    lines.push(`Note: ${cfg.note}`);
  }

  if (leads.length === 0) {
    lines.push('', 'No clients in this roster yet.');
    return lines.join('\n');
  }

  const statusCounts = {};
  leads.forEach(l => {
    const st = getLeadStatus(l);
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  });
  const summaryParts = Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`);
  if (summaryParts.length) {
    lines.push(`Summary: ${summaryParts.join(' | ')}`);
  }
  lines.push('────────────────────────');

  leads.forEach((lead, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const status = getLeadStatus(lead);
    const header = cfg.showStatus ? `${num}. ${lead.name} [${status}]` : `${num}. ${lead.name}`;
    lines.push(header);

    const contacts = [];
    if (cfg.showPhone && lead.phone) contacts.push(`Ph: ${lead.phone}`);
    if (cfg.showEmail && lead.email) contacts.push(`Email: ${lead.email}`);
    if (contacts.length) lines.push(`   ${contacts.join(' | ')}`);

    if (cfg.showCategory) {
      const displayType = lead.leadType && lead.leadType !== 'Creator' ? lead.leadType : '';
      const catBits = [displayType, lead.category, lead.budget].filter(Boolean);
      if (catBits.length) lines.push(`   Profile: ${catBits.join(' · ')}`);
    }

    if (cfg.showCity) {
      const locBits = [lead.city, lead.handle].filter(Boolean);
      if (locBits.length) lines.push(`   Market: ${locBits.join(' · ')}`);
    }

    if (cfg.showTalked) {
      const dt = getTalkedDate(lead) || getActivityDate(lead);
      const dtStr = dt ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      const owner = lead.lastTalkedByName || lead.lastUpdatedByName || lead.createdByName || '';
      const metaBits = [owner ? `By ${owner}` : '', dtStr].filter(Boolean);
      if (metaBits.length) lines.push(`   Activity: ${metaBits.join(' · ')}`);
    }

    if (cfg.showNotes && lead.notes) {
      lines.push(`   Notes: ${lead.notes}`);
    }
  });

  return lines.join('\n');
}

function renderRoster() {
  const cfg = getRosterConfig();
  const leads = getRosterLeads(cfg.source);

  const dateMeta = document.getElementById('rosterDateMeta');
  if (dateMeta) {
    dateMeta.textContent = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  const heading = document.getElementById('rosterSheetHeading');
  if (heading) heading.textContent = cfg.title;

  const sub = document.getElementById('rosterSheetSub');
  if (sub) {
    if (cfg.note) {
      sub.textContent = cfg.note;
      sub.style.display = 'block';
    } else {
      sub.style.display = 'none';
    }
  }

  const countBadge = document.getElementById('rosterCountBadge');
  if (countBadge) {
    countBadge.textContent = `${leads.length} ${leads.length === 1 ? 'client' : 'clients'}`;
  }

  const tableWrap = document.getElementById('rosterPreviewTable');
  if (tableWrap) {
    if (leads.length === 0) {
      tableWrap.innerHTML = `
        <div class="empty-state">
          <div class="icon">∅</div>
          <h3>No clients in this roster</h3>
          <p>${cfg.source === 'selected' ? 'Go to Lead Database and click “+ Roster” on client cards, or switch Roster Source above.' : 'Switch Roster Source above or add clients in Lead Database.'}</p>
        </div>
      `;
    } else {
      tableWrap.innerHTML = renderExcelSheet(leads, {
        showPhone: cfg.showPhone,
        showEmail: cfg.showEmail,
        showCategory: cfg.showCategory,
        showCity: cfg.showCity,
        showStatus: cfg.showStatus,
        showTalked: cfg.showTalked,
        showNotes: cfg.showNotes,
        editable: true,
        showRemove: cfg.source === 'selected',
        sheetTitle: cfg.title
      });
    }
  }

  const textPreview = document.getElementById('rosterTextPreview');
  if (textPreview) {
    textPreview.textContent = buildRosterPlainText(leads, cfg);
  }
  invalidateShareUrl();
}

let currentShareUrl = '';

function invalidateShareUrl() {
  currentShareUrl = '';
  const urlInput = document.getElementById('rosterShareUrl');
  const statusEl = document.getElementById('rosterLinkStatus');
  if (urlInput) urlInput.value = '';
  if (statusEl) statusEl.textContent = 'Ready to generate';
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function encodePublicSheetHash(payload) {
  const json = JSON.stringify(payload);
  const rawBytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(rawBytes);
    writer.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return '#s=' + toBase64Url(compressed);
  }
  return '#d=' + toBase64Url(rawBytes);
}

function buildShareSnapshot(leads, cfg) {
  const actorName = auth.currentUser?.displayName || auth.currentUser?.email || 'Fameo Team';
  const compactLeads = leads.map(lead => {
    const displayType = lead.leadType && lead.leadType !== 'Creator' ? lead.leadType : '';
    const dt = getTalkedDate(lead) || getActivityDate(lead);
    const dtStr = dt ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const owner = (lead.lastTalkedByName || lead.lastUpdatedByName || lead.createdByName || 'Team').split(' ')[0];
    return [
      lead.name || '',
      lead.handle || '',
      lead.phone || '',
      lead.email || '',
      displayType,
      lead.category || '',
      lead.budget || '',
      lead.city || '',
      getLeadStatus(lead),
      owner,
      dtStr,
      lead.notes || '',
      isTalkedToday(lead) ? 1 : 0
    ];
  });

  return {
    t: cfg.title,
    n: cfg.note,
    sb: actorName,
    ca: new Date().toISOString(),
    c: {
      phone: cfg.showPhone,
      email: cfg.showEmail,
      status: cfg.showStatus,
      category: cfg.showCategory,
      city: cfg.showCity,
      notes: cfg.showNotes,
      talked: cfg.showTalked
    },
    l: compactLeads
  };
}

async function generateShareLink(silent = false) {
  if (currentShareUrl) return currentShareUrl;

  const cfg = getRosterConfig();
  const leads = getRosterLeads(cfg.source);
  if (!leads.length) {
    showToast('No clients in this roster to share', 'var(--orange)');
    return '';
  }

  const mode = document.getElementById('rosterShareMode')?.value || 'public';
  const statusEl = document.getElementById('rosterLinkStatus');
  const urlInput = document.getElementById('rosterShareUrl');
  const baseViewerUrl = new URL('roster.html', window.location.href).href;

  if (statusEl) statusEl.textContent = 'Creating link…';

  const snapshot = buildShareSnapshot(leads, cfg);

  if (mode === 'team') {
    try {
      const docRef = await addDoc(collection(db, 'rosters'), {
        title: cfg.title,
        note: cfg.note,
        sharedBy: snapshot.sb,
        createdAt: new Date(),
        createdBy: auth.currentUser?.uid || '',
        createdByName: snapshot.sb,
        columns: snapshot.c,
        l: snapshot.l
      });
      currentShareUrl = `${baseViewerUrl}?id=${encodeURIComponent(docRef.id)}`;
      if (urlInput) urlInput.value = currentShareUrl;
      if (statusEl) statusEl.textContent = `Team link ready (${leads.length} clients)`;
      if (!silent) showToast('Team sheet link created!', 'var(--green)');
      return currentShareUrl;
    } catch (err) {
      console.warn('Firestore rosters write failed, falling back to public link:', err);
    }
  }

  try {
    const hash = await encodePublicSheetHash(snapshot);
    currentShareUrl = `${baseViewerUrl}${hash}`;
    if (urlInput) urlInput.value = currentShareUrl;
    if (statusEl) statusEl.textContent = `Public link ready (${leads.length} clients · no login needed)`;
    if (!silent) showToast('Website sheet link created!', 'var(--green)');
    return currentShareUrl;
  } catch (error) {
    console.error('Error generating share link:', error);
    if (statusEl) statusEl.textContent = 'Could not generate link';
    showToast('Failed to generate share link', 'var(--red)');
    return '';
  }
}

async function copyShareLink() {
  const url = await generateShareLink(true);
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Website sheet link copied!', 'var(--green)');
  } catch {
    const urlInput = document.getElementById('rosterShareUrl');
    if (urlInput) {
      urlInput.select();
    }
    showToast('Link generated — copy from box', 'var(--ink)');
  }
}

async function openSharedRosterPage() {
  const url = await generateShareLink(true);
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}

async function copyRosterText() {
  const cfg = getRosterConfig();
  const leads = getRosterLeads(cfg.source);
  if (!leads.length) {
    showToast('No clients in this roster to copy', 'var(--orange)');
    return;
  }
  const text = buildRosterPlainText(leads, cfg);
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied roster (${leads.length} clients)`, 'var(--green)');
  } catch {
    showToast('Could not copy roster text', 'var(--orange)');
  }
}

async function shareRosterWhatsApp() {
  const cfg = getRosterConfig();
  const leads = getRosterLeads(cfg.source);
  if (!leads.length) {
    showToast('No clients in this roster to share', 'var(--orange)');
    return;
  }
  const url = await generateShareLink(true);
  if (!url) return;
  const msg = `${cfg.title} (${leads.length} clients)\nView live Fameo sheet:\n${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

async function shareRosterEmail() {
  const cfg = getRosterConfig();
  const leads = getRosterLeads(cfg.source);
  if (!leads.length) {
    showToast('No clients in this roster to email', 'var(--orange)');
    return;
  }
  const url = await generateShareLink(true);
  if (!url) return;
  const body = `Hi,\n\nHere is the live Fameo client roster (${leads.length} clients):\n${url}\n\n${cfg.note ? 'Note: ' + cfg.note + '\n\n' : ''}Best,\nFameo Team`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(cfg.title)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailUrl;
}

async function nativeShareRoster() {
  const cfg = getRosterConfig();
  const leads = getRosterLeads(cfg.source);
  if (!leads.length) {
    showToast('No clients in this roster to share', 'var(--orange)');
    return;
  }
  const url = await generateShareLink(true);
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({
        title: cfg.title,
        text: `${cfg.title} (${leads.length} clients) — Fameo Sheet`,
        url
      });
      showToast('Website sheet link shared', 'var(--green)');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  await copyShareLink();
}

function exportRosterCSV() {
  const cfg = getRosterConfig();
  const leads = getRosterLeads(cfg.source);
  if (!leads.length) {
    showToast('No clients in this roster to export', 'var(--orange)');
    return;
  }

  const headers = ['No.', 'Client Name'];
  if (cfg.showPhone) headers.push('Phone');
  if (cfg.showEmail) headers.push('Email');
  if (cfg.showCategory) headers.push('Client Type', 'Category', 'Budget');
  if (cfg.showCity) headers.push('City', 'Handle');
  if (cfg.showStatus) headers.push('Status');
  if (cfg.showTalked) headers.push('Owner', 'Activity Time');
  if (cfg.showNotes) headers.push('Notes');

  const csvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = leads.map((lead, idx) => {
    const row = [String(idx + 1).padStart(2, '0'), lead.name];
    const displayType = lead.leadType && lead.leadType !== 'Creator' ? lead.leadType : '';
    const dt = getTalkedDate(lead) || getActivityDate(lead);
    const owner = lead.lastTalkedByName || lead.lastUpdatedByName || lead.createdByName || '';

    if (cfg.showPhone) row.push(lead.phone || '');
    if (cfg.showEmail) row.push(lead.email || '');
    if (cfg.showCategory) row.push(displayType, lead.category || '', lead.budget || '');
    if (cfg.showCity) row.push(lead.city || '', lead.handle || '');
    if (cfg.showStatus) row.push(getLeadStatus(lead));
    if (cfg.showTalked) row.push(owner, dt ? dt.toISOString() : '');
    if (cfg.showNotes) row.push(lead.notes || '');

    return row.map(csvCell).join(',');
  });

  const csv = [headers.map(csvCell).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fameo-roster-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported roster (${leads.length} clients)`, 'var(--green)');
}

function printRoster() {
  switchTab('roster');
  setTimeout(() => window.print(), 120);
}

// ═════════════════════════════
// Excel Sheet View, Inline Edits & Excel (.xls) / TSV Export
// ═════════════════════════════

function setDbViewMode(mode) {
  dbViewMode = mode === 'excel' ? 'excel' : 'cards';
  document.getElementById('viewBtnCards')?.classList.toggle('active', dbViewMode === 'cards');
  document.getElementById('viewBtnExcel')?.classList.toggle('active', dbViewMode === 'excel');
  renderDB();
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

function renderExcelSheet(leads, opts = {}) {
  const showPhone = opts.showPhone ?? true;
  const showEmail = opts.showEmail ?? true;
  const showCategory = opts.showCategory ?? true;
  const showCity = opts.showCity ?? true;
  const showStatus = opts.showStatus ?? true;
  const showTalked = opts.showTalked ?? true;
  const showNotes = opts.showNotes ?? true;
  const editable = opts.editable ?? true;
  const showActions = opts.showActions ?? false;
  const showRemove = opts.showRemove ?? false;
  const sheetTitle = opts.sheetTitle || 'Fameo_Clients.xls';

  const cols = [{ key: 'name', label: 'Client Name' }];
  if (showPhone) cols.push({ key: 'phone', label: 'Phone' });
  if (showEmail) cols.push({ key: 'email', label: 'Email' });
  if (showCategory) {
    cols.push({ key: 'leadType', label: 'Type' });
    cols.push({ key: 'category', label: 'Category' });
    cols.push({ key: 'budget', label: 'Budget' });
  }
  if (showCity) {
    cols.push({ key: 'city', label: 'City' });
    cols.push({ key: 'handle', label: 'Handle / Web' });
  }
  if (showStatus) cols.push({ key: 'status', label: 'Status' });
  if (showTalked) {
    cols.push({ key: 'owner', label: 'Owner' });
    cols.push({ key: 'activity', label: 'Activity Time' });
  }
  if (showNotes) cols.push({ key: 'notes', label: 'Notes' });
  if (showActions) cols.push({ key: 'actions', label: 'Quick Actions' });

  const talkedCount = leads.filter(isTalkedToday).length;
  const calledCount = leads.filter(l => getLeadStatus(l) === 'Called').length;
  const followupCount = leads.filter(l => getLeadStatus(l) === 'Follow Up').length;
  const statusOptions = ['Not Called', 'Called', 'Follow Up', 'Not Picked Call', 'Not Interested', 'Sent Demo'];

  return `
    <div class="excel-wrap">
      <div class="excel-toolbar">
        <div class="excel-fx-bar">
          <span class="excel-fx-tag">fx</span>
          <span><strong>${escapeHtml(sheetTitle)}</strong> · ${leads.length} rows × ${cols.length} cols${editable ? ' · Click any cell to edit & auto-save' : ''}</span>
        </div>
        <div>Talked Today: <strong>${talkedCount}</strong> · Called: <strong>${calledCount}</strong> · Follow Up: <strong>${followupCount}</strong></div>
      </div>
      <table class="excel-table">
        <thead>
          <tr class="excel-col-letters">
            <th class="excel-row-num"></th>
            ${cols.map((_, i) => `<th>${getExcelColLetter(i)}</th>`).join('')}
            ${showRemove ? '<th class="roster-remove-col"></th>' : ''}
          </tr>
          <tr class="excel-headers">
            <th class="excel-row-num">#</th>
            ${cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}
            ${showRemove ? '<th class="roster-remove-col"></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${leads.map((lead, idx) => {
            const safeId = escapeHtml(lead.id);
            const status = getLeadStatus(lead);
            const displayType = lead.leadType && lead.leadType !== 'Creator' ? lead.leadType : '';
            const dt = getTalkedDate(lead) || getActivityDate(lead);
            const dtStr = dt ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
            const owner = lead.lastTalkedByName || lead.lastUpdatedByName || lead.createdByName || 'Team';
            const isSelected = selectedRosterIds.has(lead.id);

            const cells = [];
            cells.push(editable
              ? `<td><input class="excel-input" style="font-weight:600;min-width:155px;" value="${escapeHtml(lead.name || '')}" onchange="updateExcelCell('${safeId}', 'name', this.value)"></td>`
              : `<td class="excel-cell"><strong>${escapeHtml(lead.name || '')}</strong></td>`);

            if (showPhone) {
              cells.push(editable
                ? `<td><input class="excel-input excel-input-mono" style="min-width:130px;" value="${escapeHtml(lead.phone || '')}" onchange="updateExcelCell('${safeId}', 'phone', this.value)"></td>`
                : `<td class="excel-cell excel-input-mono">${lead.phone ? `<a href="tel:${escapeHtml(lead.phone)}" style="color:inherit;text-decoration:none;">${escapeHtml(lead.phone)}</a>` : '—'}</td>`);
            }

            if (showEmail) {
              cells.push(editable
                ? `<td><input class="excel-input excel-input-mono" style="min-width:170px;" type="email" value="${escapeHtml(lead.email || '')}" placeholder="email@brand.com" onchange="updateExcelCell('${safeId}', 'email', this.value)"></td>`
                : `<td class="excel-cell excel-input-mono">${lead.email ? `<a href="${formatMailtoLink(lead)}" style="color:inherit;text-decoration:none;">${escapeHtml(lead.email)}</a>` : '—'}</td>`);
            }

            if (showCategory) {
              cells.push(editable
                ? `<td><input class="excel-input" style="min-width:105px;" value="${escapeHtml(displayType)}" placeholder="Brand" onchange="updateExcelCell('${safeId}', 'leadType', this.value)"></td>`
                : `<td class="excel-cell">${escapeHtml(displayType || '—')}</td>`);
              cells.push(editable
                ? `<td><input class="excel-input" style="min-width:120px;" value="${escapeHtml(lead.category || '')}" placeholder="Category" onchange="updateExcelCell('${safeId}', 'category', this.value)"></td>`
                : `<td class="excel-cell">${escapeHtml(lead.category || '—')}</td>`);
              cells.push(editable
                ? `<td><input class="excel-input excel-input-mono" style="min-width:130px;" value="${escapeHtml(lead.budget || '')}" placeholder="Budget" onchange="updateExcelCell('${safeId}', 'budget', this.value)"></td>`
                : `<td class="excel-cell excel-input-mono">${escapeHtml(lead.budget || '—')}</td>`);
            }

            if (showCity) {
              cells.push(editable
                ? `<td><input class="excel-input" style="min-width:110px;" value="${escapeHtml(lead.city || '')}" placeholder="City" onchange="updateExcelCell('${safeId}', 'city', this.value)"></td>`
                : `<td class="excel-cell">${escapeHtml(lead.city || '—')}</td>`);
              cells.push(editable
                ? `<td><input class="excel-input excel-input-mono" style="min-width:125px;" value="${escapeHtml(lead.handle || '')}" placeholder="@handle" onchange="updateExcelCell('${safeId}', 'handle', this.value)"></td>`
                : `<td class="excel-cell excel-input-mono">${escapeHtml(lead.handle || '—')}</td>`);
            }

            if (showStatus) {
              cells.push(editable
                ? `<td>
                    <select class="excel-select" style="min-width:132px;font-weight:600;" onchange="updateExcelCell('${safeId}', 'status', this.value)">
                      ${statusOptions.map(opt => `<option value="${escapeHtml(opt)}" ${opt === status ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
                    </select>
                  </td>`
                : `<td class="excel-cell"><span class="badge badge-${statusClass(status)}">${escapeHtml(status)}</span></td>`);
            }

            if (showTalked) {
              cells.push(`<td class="excel-cell">${escapeHtml(owner.split(' ')[0])}</td>`);
              cells.push(`<td class="excel-cell excel-input-mono">${escapeHtml(dtStr)}</td>`);
            }

            if (showNotes) {
              cells.push(editable
                ? `<td><input class="excel-input" style="min-width:190px;" value="${escapeHtml(lead.notes || '')}" placeholder="Add note…" onchange="updateExcelCell('${safeId}', 'notes', this.value)"></td>`
                : `<td class="excel-cell excel-cell-wide">${escapeHtml(lead.notes || '—')}</td>`);
            }

            if (showActions) {
              cells.push(`
                <td>
                  <div class="excel-action-links">
                    <button class="excel-mini-btn" type="button" onclick="toggleRosterSelect('${safeId}')">${isSelected ? '✓ Roster' : '+ Roster'}</button>
                    ${lead.phone ? `<a class="excel-mini-btn" href="${formatWhatsAppLink(lead.phone)}" target="_blank" rel="noopener">WA</a>` : ''}
                    ${lead.email ? `<a class="excel-mini-btn" href="${formatMailtoLink(lead)}">Mail</a>` : ''}
                    <button class="excel-mini-btn" type="button" onclick="deleteLead('${safeId}')" style="color:var(--red);">Del</button>
                  </div>
                </td>
              `);
            }

            return `
              <tr>
                <td class="excel-row-num">${idx + 1}</td>
                ${cells.join('')}
                ${showRemove ? `<td class="roster-remove-col" style="padding:4px 8px;text-align:center;"><button class="excel-mini-btn" type="button" onclick="toggleRosterSelect('${safeId}')">✕</button></td>` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="excel-footer-row">
            <td class="excel-row-num">Σ</td>
            <td colspan="${cols.length + (showRemove ? 1 : 0)}">
              TOTAL: ${leads.length} CLIENTS · TALKED TODAY: ${talkedCount} · CALLED: ${calledCount} · FOLLOW UP: ${followupCount}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

async function updateExcelCell(id, field, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (field === 'status') {
    await updateStatus(id, value);
    return;
  }

  const existing = allLeads.find(l => l.id === id);
  if (field === 'name' && !value) {
    showToast('Client name cannot be empty', 'var(--red)');
    renderDB();
    renderRoster();
    return;
  }
  if (field === 'handle' && !value) {
    showToast('Instagram ID cannot be empty', 'var(--red)');
    renderDB();
    renderRoster();
    return;
  }

  try {
    const now = new Date();
    await updateDoc(doc(db, 'leads', id), {
      [field]: value,
      updatedAt: now,
      lastActivityAt: now
    });
    showToast(`Saved ${field}`, 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error saving cell:', error);
    showToast('Failed to save change', 'var(--red)');
  }
}

function downloadExcelWorkbook(leads, cfg, filename) {
  if (!leads.length) {
    showToast('No clients to export to Excel', 'var(--orange)');
    return;
  }

  const headers = ['#', 'Client Name'];
  if (cfg.showPhone) headers.push('Phone');
  if (cfg.showEmail) headers.push('Email');
  if (cfg.showCategory) headers.push('Client Type', 'Category', 'Budget');
  if (cfg.showCity) headers.push('City', 'Handle / Website');
  if (cfg.showStatus) headers.push('Status');
  if (cfg.showTalked) headers.push('Talked Today', 'Owner', 'Activity Time');
  if (cfg.showNotes) headers.push('Notes');

  const bodyRows = leads.map((lead, idx) => {
    const displayType = lead.leadType && lead.leadType !== 'Creator' ? lead.leadType : '';
    const dt = getTalkedDate(lead) || getActivityDate(lead);
    const dtStr = dt ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const owner = lead.lastTalkedByName || lead.lastUpdatedByName || lead.createdByName || '';

    const tds = [
      `<td style="text-align:center;">${idx + 1}</td>`,
      `<td><b>${escapeHtml(lead.name || '')}</b></td>`
    ];
    if (cfg.showPhone) tds.push(`<td style="mso-number-format:'\\@';">${escapeHtml(lead.phone || '')}</td>`);
    if (cfg.showEmail) tds.push(`<td>${escapeHtml(lead.email || '')}</td>`);
    if (cfg.showCategory) {
      tds.push(`<td>${escapeHtml(displayType)}</td>`);
      tds.push(`<td>${escapeHtml(lead.category || '')}</td>`);
      tds.push(`<td>${escapeHtml(lead.budget || '')}</td>`);
    }
    if (cfg.showCity) {
      tds.push(`<td>${escapeHtml(lead.city || '')}</td>`);
      tds.push(`<td>${escapeHtml(lead.handle || '')}</td>`);
    }
    if (cfg.showStatus) tds.push(`<td>${escapeHtml(getLeadStatus(lead))}</td>`);
    if (cfg.showTalked) {
      tds.push(`<td>${isTalkedToday(lead) ? 'Yes' : 'No'}</td>`);
      tds.push(`<td>${escapeHtml(owner)}</td>`);
      tds.push(`<td>${escapeHtml(dtStr)}</td>`);
    }
    if (cfg.showNotes) tds.push(`<td>${escapeHtml(lead.notes || '')}</td>`);
    return `<tr>${tds.join('')}</tr>`;
  }).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <!--[if gte mso 9]><xml>
        <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
          <x:Name>Fameo Roster</x:Name>
          <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
      </xml><![endif]-->
      <style>
        table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
        th { background: #1D6F42; color: #FFFFFF; font-weight: bold; border: 1px solid #B8C2CC; padding: 6px 10px; text-align: left; }
        td { border: 1px solid #D0D7DE; padding: 5px 10px; vertical-align: top; }
        .title { font-size: 14pt; font-weight: bold; color: #141413; border: none; padding: 8px 0; }
      </style>
    </head>
    <body>
      <table>
        <tr><td class="title" colspan="${headers.length}">${escapeHtml(cfg.title || 'Fameo Client Roster')}</td></tr>
        <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
        ${bodyRows}
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded Excel (${leads.length} clients)`, 'var(--green)');
}

function exportRosterExcel() {
  const cfg = getRosterConfig();
  const leads = getRosterLeads(cfg.source);
  downloadExcelWorkbook(leads, cfg, `fameo-roster-${new Date().toISOString().slice(0, 10)}.xls`);
}

function exportFilteredExcel() {
  const leads = getFilteredLeads();
  downloadExcelWorkbook(leads, {
    title: `Fameo Client Pipeline — ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    showPhone: true,
    showEmail: true,
    showCategory: true,
    showCity: true,
    showStatus: true,
    showTalked: true,
    showNotes: true
  }, `fameo-pipeline-${new Date().toISOString().slice(0, 10)}.xls`);
}

async function copyRosterTSV() {
  const cfg = getRosterConfig();
  const leads = getRosterLeads(cfg.source);
  if (!leads.length) {
    showToast('No clients in this roster to copy', 'var(--orange)');
    return;
  }

  const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const headers = ['#', 'Client Name'];
  if (cfg.showPhone) headers.push('Phone');
  if (cfg.showEmail) headers.push('Email');
  if (cfg.showCategory) headers.push('Client Type', 'Category', 'Budget');
  if (cfg.showCity) headers.push('City', 'Handle');
  if (cfg.showStatus) headers.push('Status');
  if (cfg.showTalked) headers.push('Owner', 'Activity Time');
  if (cfg.showNotes) headers.push('Notes');

  const lines = [headers.join('\t')];
  leads.forEach((lead, idx) => {
    const displayType = lead.leadType && lead.leadType !== 'Creator' ? lead.leadType : '';
    const dt = getTalkedDate(lead) || getActivityDate(lead);
    const dtStr = dt ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const owner = lead.lastTalkedByName || lead.lastUpdatedByName || lead.createdByName || '';

    const row = [idx + 1, clean(lead.name)];
    if (cfg.showPhone) row.push(clean(lead.phone));
    if (cfg.showEmail) row.push(clean(lead.email));
    if (cfg.showCategory) row.push(clean(displayType), clean(lead.category), clean(lead.budget));
    if (cfg.showCity) row.push(clean(lead.city), clean(lead.handle));
    if (cfg.showStatus) row.push(clean(getLeadStatus(lead)));
    if (cfg.showTalked) row.push(clean(owner), clean(dtStr));
    if (cfg.showNotes) row.push(clean(lead.notes));
    lines.push(row.join('\t'));
  });

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    showToast(`Copied ${leads.length} rows — paste straight into Excel or Sheets!`, 'var(--green)');
  } catch {
    showToast('Could not copy table for Excel', 'var(--orange)');
  }
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
window.applyQuickPreset = applyQuickPreset;
window.toggleTodayList = toggleTodayList;
window.updateStatus = updateStatus;
window.deleteLead = deleteLead;
window.toggleNotesEditor = toggleNotesEditor;
window.saveInlineNotes = saveInlineNotes;
window.toggleLeadEditor = toggleLeadEditor;
window.saveLeadDetails = saveLeadDetails;
window.editNotes = editNotes;
window.copyText = copyText;
window.copyPhone = copyPhone;
window.exportCSV = exportCSV;
window.toggleRosterSelect = toggleRosterSelect;
window.selectAllFiltered = selectAllFiltered;
window.clearRosterSelection = clearRosterSelection;
window.openRosterWithSource = openRosterWithSource;
window.openRosterFromDatabase = openRosterFromDatabase;
window.renderRoster = renderRoster;
window.copyRosterText = copyRosterText;
window.shareRosterWhatsApp = shareRosterWhatsApp;
window.shareRosterEmail = shareRosterEmail;
window.nativeShareRoster = nativeShareRoster;
window.exportRosterCSV = exportRosterCSV;
window.printRoster = printRoster;
window.setDbViewMode = setDbViewMode;
window.updateExcelCell = updateExcelCell;
window.exportRosterExcel = exportRosterExcel;
window.exportFilteredExcel = exportFilteredExcel;
window.copyRosterTSV = copyRosterTSV;
window.generateShareLink = generateShareLink;
window.copyShareLink = copyShareLink;
window.openSharedRosterPage = openSharedRosterPage;
window.invalidateShareUrl = invalidateShareUrl;

console.log('✅ Fameo CRM initialized');
