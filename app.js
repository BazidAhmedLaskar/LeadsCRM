/* LeadsCRM App - Authentication & Initialization */

import { auth } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

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
// Tab Navigation
// ═════════════════════════════

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

console.log('✅ App initialized');
