import { app, db, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../src/lib/firebase.ts';
import { collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

async function run() {
  console.log("Connecting to Firestore:", firebaseConfig.projectId);
  const email = `diagnostic_tester_${Date.now()}@example.com`;
  const password = "Password123!";
  
  let userCred;
  try {
    userCred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    try {
      userCred = await signInWithEmailAndPassword(auth, email, password);
    } catch (signInErr: any) {
      console.error("Authentication failed:", signInErr.message || signInErr);
      process.exit(1);
    }
  }

  try {
    const leaderCol = collection(db, 'leaders');
    const leaderSnap = await getDocs(leaderCol);
    console.log(`\n--- LEADERS IN FIRESTORE (${leaderSnap.docs.length}) ---`);
    for (const doc of leaderSnap.docs) {
      const data = doc.data();
      console.log(`Doc ID: ${doc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Email: ${data.email}`);
      console.log(`  UID (Auth): ${data.uid}`);
      console.log(`  Role: ${data.role}`);
      console.log('-----------------------------------');
    }
  } catch (err: any) {
    console.error("Error executing queries:", err.message || err);
  }

  // Cleanup the temp user
  try {
    if (userCred && userCred.user) {
      await userCred.user.delete();
    }
  } catch (cleanupErr: any) {}

  process.exit(0);
}

run();
