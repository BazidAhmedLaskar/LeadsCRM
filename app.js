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
    document.getElementById('mCity').value = '';
    document.getElementById('mAddress').value = '';
    document.getElementById('mNotes').value = '';
  }
}

async function addManually() {
  const name = document.getElementById('mName').value.trim();
  const phone = document.getElementById('mPhone').value.trim();
  const city = document.getElementById('mCity').value.trim();
  const address = document.getElementById('mAddress').value.trim();
  const notes = document.getElementById('mNotes').value.trim();

  if (!name || !phone) {
    showToast('Name and phone are required', 'var(--red)');
    return;
  }

  try {
    const docRef = await addDoc(collection(db, 'leads'), {
      name,
      phone,
      city,
      address,
      notes,
      status: 'Not Called',
      createdAt: new Date(),
      createdBy: auth.currentUser.uid
    });

    showToast('Lead added successfully', 'var(--green)');
    toggleManualForm();
    loadDatabase(); // Refresh database view
  } catch (error) {
    console.error('Error adding lead:', error);
    showToast('Failed to add lead', 'var(--red)');
  }
}

// ═════════════════════════════
// Database Management
// ═════════════════════════════

let allLeads = [];

async function loadDatabase() {
  try {
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    allLeads = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.createdBy === auth.currentUser.uid) {
        allLeads.push({ id: doc.id, ...data });
      }
    });
    
    renderDB();
    updateStats();
  } catch (error) {
    console.error('Error loading database:', error);
    showToast('Failed to load database', 'var(--red)');
  }
}

function renderDB() {
  const searchTerm = document.getElementById('dbSearch').value.toLowerCase();
  const statusFilter = document.getElementById('dbStatus').value;
  
  const filtered = allLeads.filter(lead => {
    const matchesSearch = !searchTerm || 
      lead.name.toLowerCase().includes(searchTerm) ||
      lead.city.toLowerCase().includes(searchTerm) ||
      lead.phone.includes(searchTerm);
    
    const matchesStatus = !statusFilter || lead.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });
  
  const container = document.getElementById('dbResults');
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><h3>No leads found</h3><p>Add some leads manually to get started.</p></div>';
    return;
  }
  
  container.innerHTML = filtered.map(lead => `
    <div class="card">
      <div class="card-top">
        <div>
          <div class="shop-name">${lead.name}</div>
          <div class="shop-address">${lead.city || '—'} • ${lead.address || '—'}</div>
          <div class="shop-phone">${lead.phone}</div>
          <div class="meta-row"><span>📝 <span id="notes-${lead.id}">${lead.notes || 'No notes'}</span></span> <button class="btn btn-blue" onclick="editNotes('${lead.id}')" style="font-size:.7rem;padding:2px 8px;margin-left:8px;">Edit</button></div>
        </div>
        <div class="badge badge-${lead.status.toLowerCase().replace(' ', '')}">${lead.status}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-green" onclick="updateStatus('${lead.id}', 'Called')">✅ Called</button>
        <button class="btn btn-orange" onclick="updateStatus('${lead.id}', 'Follow Up')">⏰ Follow Up</button>
        <button class="btn btn-red" onclick="deleteLead('${lead.id}')">🗑️ Delete</button>
      </div>
    </div>
  `).join('');
}

function updateStats() {
  const total = allLeads.length;
  const called = allLeads.filter(l => l.status === 'Called').length;
  const pending = allLeads.filter(l => l.status === 'Not Called').length;
  const followup = allLeads.filter(l => l.status === 'Follow Up').length;
  
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statCalled').textContent = called;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statFollowup').textContent = followup;
}

async function updateStatus(id, status) {
  try {
    await updateDoc(doc(db, 'leads', id), { status });
    showToast(`Status updated to ${status}`, 'var(--green)');
    loadDatabase();
  } catch (error) {
    console.error('Error updating status:', error);
    showToast('Failed to update status', 'var(--red)');
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
