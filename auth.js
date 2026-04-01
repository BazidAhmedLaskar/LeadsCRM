import { auth, analytics } from './firebase-config.js';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { logEvent } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";

const provider = new GoogleAuthProvider();

// UI Elements
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const pendingScreen = document.getElementById('pendingScreen');
const googleBtn = document.querySelector('.google-btn');
const signoutBtn = document.querySelector('.signout-btn');
const userPill = document.querySelector('.user-pill');

// Google Sign-in
if (googleBtn) {
  googleBtn.addEventListener('click', async () => {
    try {
      googleBtn.disabled = true;
      googleBtn.textContent = 'Signing in...';
      
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      console.log('✅ User logged in:', user.uid);
      console.log('Email:', user.email);
      console.log('Display Name:', user.displayName);
      
      logEvent(analytics, 'login', {
        method: 'google',
        userId: user.uid
      });
      
      // Show pending screen while app initializes
      showPendingScreen(user);
      
    } catch (error) {
      console.error('❌ Auth Error:', error.code, error.message);
      
      if (error.code === 'auth/popup-closed-by-user') {
        alert('Sign-in cancelled');
      } else if (error.code === 'auth/popup-blocked') {
        alert('Pop-up blocked. Please enable pop-ups for this site.');
      } else {
        alert('Sign-in failed: ' + error.message);
      }
      
      googleBtn.disabled = false;
      googleBtn.textContent = 'Sign in with Google';
    }
  });
}

// Sign-out
if (signoutBtn) {
  signoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      console.log('✅ User signed out');
      logEvent(analytics, 'logout');
      showLoginScreen();
    } catch (error) {
      console.error('❌ Sign-out Error:', error);
    }
  });
}

// UI State Management
function showLoginScreen() {
  loginScreen.classList.add('active');
  appScreen.classList.remove('active');
  pendingScreen.classList.remove('active');
  if (googleBtn) {
    googleBtn.disabled = false;
    googleBtn.textContent = 'Sign in with Google';
  }
}

function showPendingScreen(user) {
  loginScreen.classList.remove('active');
  appScreen.classList.remove('active');
  pendingScreen.classList.add('active');
  
  if (userPill) {
    userPill.innerHTML = `
      <img src="${user.photoURL || 'https://via.placeholder.com/26'}" alt="${user.displayName}">
      <span>${user.displayName || user.email}</span>
    `;
  }
  
  // Simulate loading, then show app screen after 1.5s
  setTimeout(() => {
    showAppScreen(user);
  }, 1500);
}

function showAppScreen(user) {
  loginScreen.classList.remove('active');
  appScreen.classList.remove('active');
  pendingScreen.classList.remove('active');
  appScreen.classList.add('active');
  
  // Update header with user info
  if (userPill) {
    userPill.innerHTML = `
      <img src="${user.photoURL || 'https://via.placeholder.com/26'}" alt="${user.displayName}">
      <span>${user.displayName || user.email}</span>
    `;
  }
}

// Auto-check auth state on page load
export function initializeAuthUI() {
  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log('🔐 Auth Check: User logged in -', user.uid);
      showAppScreen(user);
    } else {
      console.log('🔓 Auth Check: No user logged in');
      showLoginScreen();
    }
  });
}

export { auth };
