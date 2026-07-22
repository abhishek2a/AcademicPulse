const firebaseConfig = {
    apiKey: "AIzaSyDePs88cfFibQGQ6J44hcBYjUzz_dUtNtY",
    authDomain: "academicpulse-3e1e2.firebaseapp.com",
    projectId: "academicpulse-3e1e2",
    storageBucket: "academicpulse-3e1e2.firebasestorage.app",
    messagingSenderId: "319669838898",
    appId: "1:319669838898:web:2725e03ef576736003482b",
    measurementId: "G-WXSKH63X5Q"
};

// Initialize Firebase using compat API
const app = firebase.initializeApp(firebaseConfig);

// Initialize Firebase App Check with reCAPTCHA Enterprise
try {
    const appCheck = firebase.appCheck();
    appCheck.activate(
        new firebase.appCheck.ReCaptchaEnterpriseProvider('6LdSBBMtAAAAAAyOgUbNa37n9vUyU7WX6fMKYHC7'),
        true // isTokenAutoRefreshEnabled
    );
} catch (e) {
    console.warn("App Check failed to initialize (expected if running locally):", e);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Make db and auth globally accessible for app.js to sync data
window.firebaseAuth = auth;
window.firebaseDb = db;

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const splashScreen = document.getElementById('splash-screen');
const loginCard = document.getElementById('authLoginCard');
const registerCard = document.getElementById('authRegisterCard');
const resetCard = document.getElementById('authResetCard');

// Toggle UI Forms
document.getElementById('linkToRegister').addEventListener('click', (e) => {
    e.preventDefault();
    loginCard.style.display = 'none';
    registerCard.style.display = 'block';
});

document.getElementById('linkToLogin').addEventListener('click', (e) => {
    e.preventDefault();
    registerCard.style.display = 'none';
    loginCard.style.display = 'block';
});

document.getElementById('linkToReset').addEventListener('click', (e) => {
    e.preventDefault();
    loginCard.style.display = 'none';
    resetCard.style.display = 'block';
});

document.getElementById('linkToLoginFromReset').addEventListener('click', (e) => {
    e.preventDefault();
    resetCard.style.display = 'none';
    loginCard.style.display = 'block';
});

// Authentication State Observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Logged In
        authOverlay.classList.add('hidden');
        
        // Sync Data from Firestore
        await syncDataFromCloud(user.uid);
        
        // Populate Profile View
        document.getElementById('profileDisplayName').textContent = user.displayName || 'User';
        if(document.getElementById('mobileTopUsername')) document.getElementById('mobileTopUsername').textContent = user.displayName || 'User';
        document.getElementById('profileEmail').textContent = user.email;
        document.getElementById('profileAvatar').textContent = (user.displayName || 'U').charAt(0).toUpperCase();
        document.getElementById('profileNameInput').value = user.displayName || '';
        
        // Ensure Main App starts
        if(typeof window.initApp === 'function') window.initApp();
        
    } else {
        // Logged Out
        authOverlay.classList.remove('hidden');
    }
    
    // Hide Splash Screen after initial load
    setTimeout(() => {
        splashScreen.classList.add('hidden');
    }, 1500); // 1.5s for cool effect
});

// Sync Functions
async function syncDataFromCloud(uid) {
    try {
        const docRef = db.collection("userData").doc(uid);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
            const data = docSnap.data();
            if (data.subjects) localStorage.setItem('cseb_study_subjects', JSON.stringify(data.subjects));
            if (data.sessions) localStorage.setItem('cseb_session_history', JSON.stringify(data.sessions));
            if (data.attendance) localStorage.setItem('cseb_study_attendance', JSON.stringify(data.attendance));
            if (data.goals) localStorage.setItem('cseb_study_goals', JSON.stringify(data.goals));
            if (data.accaTopics) localStorage.setItem('cseb_acca_topics', JSON.stringify(data.accaTopics));
            if (data.mocks) localStorage.setItem('cseb_mock_tests', JSON.stringify(data.mocks));
            if (data.practice) localStorage.setItem('cseb_question_practice', JSON.stringify(data.practice));
            if (data.csebSyllabus) localStorage.setItem('cseb_syllabus_tracker', JSON.stringify(data.csebSyllabus));
            if (data.notifications) localStorage.setItem('cseb_notifications', JSON.stringify(data.notifications));
            if (data.schedule) localStorage.setItem('cseb_study_schedule', JSON.stringify(data.schedule));
            if (data.achievements) localStorage.setItem('cseb_achievements', JSON.stringify(data.achievements));
            if (data.systemState) localStorage.setItem('cseb_system_state', JSON.stringify(data.systemState));
            if (data.workoutQuestions) localStorage.setItem('cseb_workout_questions', JSON.stringify(data.workoutQuestions));
            if (data.workoutStats) localStorage.setItem('cseb_workout_stats', JSON.stringify(data.workoutStats));
        } else {
            // First login, push local data to cloud
            await syncDataToCloud(uid);
        }
    } catch (error) {
        console.error("Error syncing data:", error);
    }
}

async function syncDataToCloud(uid) {
    if(!uid) return;
    try {
        await db.collection("userData").doc(uid).set({
            subjects: JSON.parse(localStorage.getItem('cseb_study_subjects') || '[]'),
            sessions: JSON.parse(localStorage.getItem('cseb_session_history') || '[]'),
            attendance: JSON.parse(localStorage.getItem('cseb_study_attendance') || '{}'),
            goals: JSON.parse(localStorage.getItem('cseb_study_goals') || '{"daily":8,"weekly":40,"monthly":160}'),
            accaTopics: JSON.parse(localStorage.getItem('cseb_acca_topics') || '[]'),
            mocks: JSON.parse(localStorage.getItem('cseb_mock_tests') || '[]'),
            practice: JSON.parse(localStorage.getItem('cseb_question_practice') || '{"attempted":0,"correct":0}'),
            csebSyllabus: JSON.parse(localStorage.getItem('cseb_syllabus_tracker') || '{}'),
            notifications: JSON.parse(localStorage.getItem('cseb_notifications') || '[]'),
            schedule: JSON.parse(localStorage.getItem('cseb_study_schedule') || '[]'),
            achievements: JSON.parse(localStorage.getItem('cseb_achievements') || '[]'),
            systemState: JSON.parse(localStorage.getItem('cseb_system_state') || '{"currentVersion":"v1.0.60"}'),
            workoutQuestions: JSON.parse(localStorage.getItem('cseb_workout_questions') || '[]'),
            workoutStats: JSON.parse(localStorage.getItem('cseb_workout_stats') || '{"totalDone":0,"totalCorrect":0}')
        });
    } catch (error) {
        console.error("Error saving to cloud:", error);
        if (window.addNotification) {
            window.addNotification('Cloud Sync Failed', 'Could not save data to the cloud. Check your connection.', 'warning');
        }
    }
}

let syncTimer = null;
// Global function to trigger sync on saveData (debounced)
window.triggerCloudSync = () => {
    if (auth.currentUser) {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            syncDataToCloud(auth.currentUser.uid);
            syncTimer = null;
        }, 2000);
    }
}

// Ensure data is synced safely if the user leaves the page
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && syncTimer && auth.currentUser) {
        clearTimeout(syncTimer);
        syncTimer = null;
        syncDataToCloud(auth.currentUser.uid);
    }
});

// Login
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    const btn = document.getElementById('btnLoginSubmit');
    btn.textContent = 'Logging in...';
    
    auth.signInWithEmailAndPassword(email, pass)
        .then(() => { btn.textContent = 'Log In'; })
        .catch(err => {
            btn.textContent = 'Log In';
            alert(err.message);
        });
});

// Register
document.getElementById('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const pass = document.getElementById('registerPassword').value;
    const btn = document.getElementById('btnRegisterSubmit');
    btn.textContent = 'Signing up...';

    auth.createUserWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            return userCredential.user.updateProfile({ displayName: name });
        })
        .then(() => {
            btn.textContent = 'Sign Up';
        })
        .catch(err => {
            btn.textContent = 'Sign Up';
            alert(err.message);
        });
});

// Reset Password
document.getElementById('resetPasswordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value;
    const btn = document.getElementById('btnResetSubmit');
    btn.textContent = 'Sending...';

    auth.sendPasswordResetEmail(email)
        .then(() => {
            btn.textContent = 'Send Reset Link';
            alert("Password reset email sent!");
            document.getElementById('linkToLoginFromReset').click();
        })
        .catch(err => {
            btn.textContent = 'Send Reset Link';
            alert(err.message);
        });
});

// Logout
document.getElementById('btnLogout').addEventListener('click', () => {
    auth.signOut().then(() => {
        // Force reload to clear state
        window.location.reload();
    });
});

// Update Profile
document.getElementById('updateProfileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('profileNameInput').value;
    const user = auth.currentUser;
    if(user) {
        user.updateProfile({ displayName: name }).then(() => {
            document.getElementById('profileDisplayName').textContent = name;
            if(document.getElementById('mobileTopUsername')) document.getElementById('mobileTopUsername').textContent = name;
            document.getElementById('profileAvatar').textContent = name.charAt(0).toUpperCase();
            alert("Profile name updated!");
        }).catch(err => alert(err.message));
    }
});

// Update Password
document.getElementById('updatePasswordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pass = document.getElementById('profilePasswordInput').value;
    const user = auth.currentUser;
    if(user) {
        user.updatePassword(pass).then(() => {
            alert("Password updated successfully!");
            document.getElementById('profilePasswordInput').value = '';
        }).catch(err => alert(err.message));
    }
});

window.addEventListener('beforeunload', () => {
    if (syncTimer && window.firebaseAuth?.currentUser) {
        clearTimeout(syncTimer);
        syncDataToCloud(window.firebaseAuth.currentUser.uid);
    }
});
