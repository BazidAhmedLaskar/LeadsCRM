/* LeadsCRM App - Authentication & Initialization */

import { auth } from './firebase-config.js';
import { db } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { collection, addDoc, getDocs, query, orderBy, where, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ═════════════════════════════
// Auth State Management
// ═════════════════════════════

const provider = new GoogleAuthProvider();

// Connect sign-in button
document.getElementById('googleSignInBtn')?.addEventListener('click', signInWithGoogle);
document.getElementById('headerSignoutBtn')?.addEventListener('click', handleSignOut);
document.getElementById('pendingSignoutBtn')?.addEventListener('click', handleSignOut);

async function signInWithGoogle() {
  const btn = document.getElementById('googleSignInBtn');
  try {
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    console.log('✅ Signed in:', user.email);
    // Auth state listener will handle screen transitions
    
  } catch (error) {
    console.error('❌ Sign-in error:', error.code, error.message);
    
    if (error.code === 'auth/popup-closed-by-user') {
      showToast('Sign-in cancelled', 'var(--orange)');
    } else if (error.code === 'auth/popup-blocked') {
      showToast('Pop-up blocked. Enable pop-ups for this site.', 'var(--red)');
    } else {
      showToast('Sign-in failed: ' + error.message, 'var(--red)');
    }
    
    btn.disabled = false;
    btn.textContent = 'Continue with Google';
  }
}

async function handleSignOut() {
  try {
    await firebaseSignOut(auth);
    console.log('✅ Signed out');
    showToast('Signed out', 'var(--green)');
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
    showScreen('loginScreen');
    console.log('🔓 No user logged in');
    return;
  }
  
  console.log('🔐 User logged in:', user.uid, user.email);
  
  // For now, show app screen directly
  // In production, check approval status first
  showScreen('appScreen');
  
  // Update user info in header
  const userName = document.getElementById('userName');
  const userAvatar = document.getElementById('userAvatar');
  
  if (userName) userName.textContent = user.displayName?.split(' ')[0] || user.email.split('@')[0];
  if (userAvatar) userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=1e2d4d&color=94a3b8`;

  // Load database on login
  loadDatabase();
});

// ═════════════════════════════
// UI Utilities
// ═════════════════════════════

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

let toastTimer;
function showToast(msg, color = 'var(--green)') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = color;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ═════════════════════════════
// Manual Add Form
// ═════════════════════════════

function toggleManualForm() {
  const form = document.getElementById('manualForm');
  form.classList.toggle('open');
  if (form.classList.contains('open')) {
    document.getElementById('mName').focus();
  } else {
    // Clear form
    document.getElementById('mName').value = '';
    document.getElementById('mPhone').value = '';
    document.getElementById('mResponse').value = 'Not Called';
    document.getElementById('mNotes').value = '';
  }
}

async function addManually() {
  if (!auth.currentUser) {
    showToast('Please log in first', 'var(--red)');
    return;
  }

  const name = document.getElementById('mName').value.trim();
  const phone = document.getElementById('mPhone').value.trim();
  const response = document.getElementById('mResponse').value;
  const notes = document.getElementById('mNotes').value.trim();

  if (!name || !phone) {
    showToast('Name and phone are required', 'var(--red)');
    return;
  }

  try {
    await addDoc(collection(db, 'leads'), {
      name,
      phone,
      status: response,
      response,
      notes,
      createdAt: new Date(),
      createdBy: auth.currentUser.uid,
      createdByName: auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid
    });

    showToast('Lead added successfully', 'var(--green)');
    toggleManualForm();
    loadDatabase(); // Refresh database view
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
    showToast('Please login first', 'var(--red)');
    return;
  }

  try {
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(q);
    
    allLeads = [];
    querySnapshot.forEach((doc) => {
      allLeads.push({ id: doc.id, ...doc.data() });
    });
    
    renderDB();
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
    if (!userMap.has(l.createdBy)) {
      userMap.set(l.createdBy, l.createdByName || l.createdBy);
    }
  });

  userEl.innerHTML = '<option value="">All Users</option>';
  userMap.forEach((name, uid) => {
    const opt = document.createElement('option');
    opt.value = uid;
    opt.textContent = `${name}`;
    if (uid === current) opt.selected = true;
    userEl.appendChild(opt);
  });
}

function renderDB() {
  buildUserFilter();
  const searchTerm = document.getElementById('dbSearch').value.toLowerCase();
  const userFilter = document.getElementById('dbUser').value;
  const statusFilter = document.getElementById('dbStatus').value;
  
  const filtered = allLeads.filter(lead => {
    const matchesSearch = !searchTerm || lead.name.toLowerCase().includes(searchTerm);
    const matchesUser = !userFilter || lead.createdBy === userFilter;
    const matchesStatus = !statusFilter || (lead.status === statusFilter || lead.response === statusFilter);
    
    return matchesSearch && matchesUser && matchesStatus;
  });
  
  const container = document.getElementById('dbResults');
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><h3>No leads found</h3><p>Add some leads manually to get started.</p></div>';
    return;
  }
  
  container.innerHTML = filtered.map(lead => {
    const createdAtDate = lead.createdAt?.seconds ? new Date(lead.createdAt.seconds * 1000) : new Date(lead.createdAt || Date.now());
    const createdAtStr = !isNaN(createdAtDate.getTime()) ? createdAtDate.toLocaleString() : '—';

    return `
    <div class="card">
      <div class="card-top">
        <div>
          <div class="shop-name">${lead.name}</div>
          <div class="shop-address">${lead.phone} • ${lead.status}</div>
          <div class="shop-address">Created by: ${lead.createdByName || lead.createdBy} • ${createdAtStr}</div>
          <div class="shop-address">Response: ${lead.response || lead.status}</div>
          ${lead.notes ? `<div class="meta-row"><span>📝 ${lead.notes}</span></div>` : '<div class="meta-row"><span>📝 No notes</span></div>'}
        </div>
        <div class="badge badge-${lead.status.toLowerCase().replace(/\s+/g, '')}">${lead.status}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-green" onclick="updateStatus('${lead.id}', 'Called')">✅ Called</button>
        <button class="btn btn-orange" onclick="updateStatus('${lead.id}', 'Follow Up')">⏰ Follow Up</button>
        <button class="btn btn-red" onclick="updateStatus('${lead.id}', 'Not Interested')">🚫 Not Interested</button>
        <button class="btn btn-blue" onclick="updateStatus('${lead.id}', 'Sent Demo')">📧 Sent Demo</button>
        <button class="btn btn-ghost" onclick="deleteLead('${lead.id}')">🗑️ Delete</button>
      </div>
    </div>
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
    if (l.status !== 'Called') return false;
    const createdAtDate = l.createdAt?.seconds ? new Date(l.createdAt.seconds * 1000) : new Date(l.createdAt || 0);
    return createdAtDate >= startOfDay;
  }).length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statCalled').textContent = called;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statFollowup').textContent = followup;

  // Inject additional stats if they are missing
  const statsEl = document.querySelector('.stats');
  const extraStats = [
    { id: 'statNotPicked', label: 'Not Picked' },
    { id: 'statNotInterested', label: 'Not Interested' },
    { id: 'statSentDemo', label: 'Sent Demo' },
    { id: 'statCalledToday', label: 'Called Today' }
  ];

  extraStats.forEach(({ id, label }) => {
    if (!document.getElementById(id) && statsEl) {
      const extra = document.createElement('div');
      extra.className = 'stat-box';
      extra.innerHTML = `<div class="stat-num" id="${id}">0</div><div class="stat-label">${label}</div>`;
      statsEl.appendChild(extra);
    }
  });

  document.getElementById('statNotPicked').textContent = notPicked;
  document.getElementById('statNotInterested').textContent = notInterested;
  document.getElementById('statSentDemo').textContent = sentDemo;

  let calledTodayEl = document.getElementById('statCalledToday');
  if (!calledTodayEl) {
    const statsEl = document.querySelector('.stats');
    if (statsEl) {
      const extra = document.createElement('div');
      extra.className = 'stat-box';
      extra.innerHTML = `<div class=\"stat-num\" id=\"statCalledToday\">${calledToday}</div><div class=\"stat-label\">Called Today</div>`;
      statsEl.appendChild(extra);
      calledTodayEl = document.getElementById('statCalledToday');
    }
  }
  if (calledTodayEl) calledTodayEl.textContent = calledToday;
}

async function updateStatus(id, status) {
  try {
    await updateDoc(doc(db, 'leads', id), { status, response: status });
    showToast(`Response updated to ${status}`, 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating status:', error);
    showToast('Failed to update response', 'var(--red)');
  }
}

async function deleteLead(id) {
  if (!confirm('Are you sure you want to delete this lead?')) return;
  
  try {
    await deleteDoc(doc(db, 'leads', id));
    showToast('Lead deleted', 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error deleting lead:', error);
    showToast('Failed to delete lead', 'var(--red)');
  }
}

async function editNotes(id) {
  const notesSpan = document.getElementById(`notes-${id}`);
  const currentNotes = notesSpan.textContent === 'No notes' ? '' : notesSpan.textContent;
  
  const newNotes = prompt('Edit notes:', currentNotes);
  if (newNotes === null) return; // Cancelled
  
  try {
    await updateDoc(doc(db, 'leads', id), { notes: newNotes.trim() });
    showToast('Notes updated', 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating notes:', error);
    showToast('Failed to update notes', 'var(--red)');
  }
}

function switchTab(tabName) {
  const tabs = document.querySelectorAll('.tab');
  const pages = document.querySelectorAll('.page');
  
  tabs.forEach(tab => {
    // Determine which tab this is
    const isActive = tab.textContent.includes(
      tabName === 'search' ? 'Search' :
      tabName === 'database' ? 'Database' :
      'Admin'
    );
    tab.classList.toggle('active', isActive);
  });
  
  pages.forEach(page => {
    const isActive = page.id === `page-${tabName}`;
    page.classList.toggle('active', isActive);
  });
}

// Make functions globally available
window.showScreen = showScreen;
window.showToast = showToast;
window.switchTab = switchTab;
window.signInWithGoogle = signInWithGoogle;
window.handleSignOut = handleSignOut;
window.toggleManualForm = toggleManualForm;
window.addManually = addManually;
window.loadDatabase = loadDatabase;
window.renderDB = renderDB;
window.updateStatus = updateStatus;
window.deleteLead = deleteLead;
window.editNotes = editNotes;

console.log('✅ App initialized');
