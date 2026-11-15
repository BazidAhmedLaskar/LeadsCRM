import { auth } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// ═════════════════════════════
// Auth State Management
// ═════════════════════════════

const provider = new GoogleAuthProvider();

document.getElementById('googleSignInBtn')?.addEventListener('click', signInWithGoogle);
document.getElementById('headerSignoutBtn')?.addEventListener('click', handleSignOut);
document.getElementById('pendingSignoutBtn')?.addEventListener('click', handleSignOut);

function setGoogleBtnState(disabled, label) {
  const btn = document.getElementById('googleSignInBtn');
  if (!btn) return;
  btn.disabled = disabled;
  const labelEl = btn.querySelector('.btn-label');
  if (labelEl) {
    labelEl.textContent = label;
  } else {
    btn.textContent = label;
  }
}

async function signInWithGoogle() {
  try {
    setGoogleBtnState(true, 'Signing in…');
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

    setGoogleBtnState(false, 'Continue with Google ↗');
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
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const isLoginPage = currentPage === 'login.html' || currentPage === 'login';
  const isAppPage = currentPage === 'app.html' || currentPage === 'app';
  const isPendingPage = currentPage === 'pending.html' || currentPage === 'pending';

  if (!user) {
    if (!isLoginPage) {
      window.location.href = 'login.html';
    }
    console.log('🔓 No user logged in');
    return;
  }

  console.log('🔐 User logged in:', user.uid, user.email);

  if (!isAppPage && !isPendingPage) {
    window.location.href = 'app.html';
    return;
  }

  if (isAppPage) {
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    if (userName) userName.textContent = user.displayName?.split(' ')[0] || user.email.split('@')[0];
    if (userAvatar) {
      userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=ECE7DC&color=141413`;
    }
  }

  if (isPendingPage) {
    const pendingEmail = document.getElementById('pendingEmail');
    if (pendingEmail) pendingEmail.textContent = user.email;
  }
});

// ═════════════════════════════
// UI Utilities
// ═════════════════════════════

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

window.showToast = showToast;
window.signInWithGoogle = signInWithGoogle;
window.handleSignOut = handleSignOut;
