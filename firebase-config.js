// Firebase Configuration - Modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCC6PfHU1UPgY41tmxkBr72l9nvu2tHI8o",
  authDomain: "leadcrm-57200.firebaseapp.com",
  projectId: "leadcrm-57200",
  storageBucket: "leadcrm-57200.firebasestorage.app",
  messagingSenderId: "721686387089",
  appId: "1:721686387089:web:585d5c33dd8d851dea6230",
  measurementId: "G-9KGFB7MB96"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const db = getFirestore(app);
const analytics = getAnalytics(app);

// Auth state listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('User logged in:', user.uid);
    logEvent(analytics, 'user_login', {
      userId: user.uid,
      email: user.email
    });
  } else {
    console.log('No user logged in');
  }
});

// Export for use in other modules
export { app, auth, db, analytics };
