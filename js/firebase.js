// Fast Track — collegamento al database Salute (Firebase «azienda-salute», separato da ADV HUB).
// Questi valori NON sono segreti: identificano il progetto. I dati sono protetti dalle regole del database
// (solo l'utente di Paolo legge e scrive) e dall'accesso con email e password.
// Lo stesso database lo legge Greg in AZienda, quando Paolo gli chiede una verifica.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, Bytes,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

export const CONFIG = {
  apiKey: 'AIzaSyCH9yjievCC8AGTQajJvt9vC8ixEw02PVc',
  authDomain: 'azienda-salute.firebaseapp.com',
  projectId: 'azienda-salute',
  storageBucket: 'azienda-salute.firebasestorage.app',
  messagingSenderId: '629419673602',
  appId: '1:629419673602:web:5afbb1cdaadbcad5a77f1b',
};

export const app = initializeApp(CONFIG);
export const auth = getAuth(app);
// Cache sul telefono: l'app si apre anche senza rete e scrive appena torna la connessione.
let _db;
try { _db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) }); }
catch { _db = initializeFirestore(app, {}); }
export const db = _db;

export { onAuthStateChanged, signInWithEmailAndPassword, signOut };
export { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, Bytes };
