import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSy" + "Bbba3FeBBTNaTsloR-zTx1PyvXTe9woZw",
  authDomain: "cineq-92fea.firebaseapp.com",
  projectId: "cineq-92fea",
  storageBucket: "cineq-92fea.firebasestorage.app",
  messagingSenderId: "671773564359",
  appId: "1:671773564359:web:3fa55f1686cdcb23584de2",
  measurementId: "G-JW5Q56HE28"
};

// Initialize Firebase only if it hasn't been initialized yet
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
