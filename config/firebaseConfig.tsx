// src/config/firebaseConfig.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
// Import other services like getStorage if needed

// Your web app's Firebase configuration
// REMPLACEZ CECI PAR VOTRE CONFIGURATION REELLE depuis la console Firebase
// (Paramètres du projet -> Général -> Vos applications -> SDK setup and configuration -> Config)
const firebaseConfig = {
    apiKey: "AIzaSyCApbVTET3bz8KfBZT9INovUFujL8rjR6w",
    authDomain: "familylocation-6bee5.firebaseapp.com",
    projectId: "familylocation-6bee5",
    storageBucket: "familylocation-6bee5.firebasestorage.app",
    messagingSenderId: "88372286958",
    appId: "1:88372286958:web:fffb29c2c8cef4153deaff",
    databaseURL: "https://familylocation-6bee5-default-rtdb.firebaseio.com/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const auth = getAuth(app);
const database = getDatabase(app);
// Export other services as needed

export { app, firestore, auth, database };