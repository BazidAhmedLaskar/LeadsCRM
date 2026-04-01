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
  const currentPage = window.location.pathname.split('/').pop();
  
  if (!user) {
    if (currentPage !== 'login.html') {
      window.location.href = 'login.html';
    }
    console.log('🔓 No user logged in');
    return;
  }
  
  console.log('🔐 User logged in:', user.uid, user.email);
  
  // For now, assume approved and go to app
  // In production, check approval status
  if (currentPage !== 'app.html') {
    window.location.href = 'app.html';
  }
  
  // Update user info if on app page
  if (currentPage === 'app.html') {
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    
    if (userName) userName.textContent = user.displayName?.split(' ')[0] || user.email.split('@')[0];
    if (userAvatar) userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=1e2d4d&color=94a3b8`;
  }
  
  // If on pending page, set email
  if (currentPage === 'pending.html') {
    const pendingEmail = document.getElementById('pendingEmail');
    if (pendingEmail) pendingEmail.textContent = user.email;
  }
});

// ═════════════════════════════
// UI Utilities
// ═════════════════════════════

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

// Make functions globally available
window.showToast = showToast;
window.signInWithGoogle = signInWithGoogle;
window.handleSignOut = handleSignOut;
