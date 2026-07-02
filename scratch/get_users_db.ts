import { app, db, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../src/lib/firebase.ts';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

async function run() {
  const email = `diagnostic_tester_${Date.now()}@example.com`;
  const password = "Password123!";
  let userCred;
  try {
    userCred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    userCred = await signInWithEmailAndPassword(auth, email, password);
  }

  try {
    const userCol = collection(db, 'users');
    const userSnap = await getDocs(userCol);
    console.log("=== USERS IN DATABASE ===");
    for (const doc of userSnap.docs) {
      console.log(`User ID: ${doc.id}, Email: ${doc.data().email}, Name: ${doc.data().name}, Role: ${doc.data().role}`);
    }
  } catch (err: any) {
    console.error("Error fetching users:", err.message);
  }

  try {
    if (userCred && userCred.user) {
      await userCred.user.delete();
    }
  } catch (cleanupErr) {}
  process.exit(0);
}

run();
