import { app, db, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../src/lib/firebase.ts';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
    const adminCol = collection(db, 'admins');
    const adminSnap = await getDocs(adminCol);
    console.log("=== ADMINS IN DATABASE ===");
    for (const doc of adminSnap.docs) {
      console.log(`Admin ID: ${doc.id}, Name: ${doc.data().name}, Email: ${doc.data().email}, UID: ${doc.data().uid}`);
    }
  } catch (err: any) {
    console.error("Error fetching admins:", err.message);
  }

  try {
    if (userCred && userCred.user) {
      await userCred.user.delete();
    }
  } catch (cleanupErr) {}
  process.exit(0);
}

run();
