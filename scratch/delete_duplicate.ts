import { app, db, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../src/lib/firebase.ts';
import { doc, deleteDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

async function run() {
  console.log("Connecting to Firestore:", firebaseConfig.projectId);
  const email = `diagnostic_tester_${Date.now()}@example.com`;
  const password = "Password123!";
  
  let userCred;
  try {
    console.log("Creating temporary auth user:", email);
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
    const TARGET_ID = "CpeKVfANioVAnuTfvtq2";
    console.log(`Attempting to delete duplicate developer document ID: ${TARGET_ID}`);
    const devDocRef = doc(db, 'developers', TARGET_ID);
    await deleteDoc(devDocRef);
    console.log("Successfully deleted duplicate developer document.");
  } catch (err: any) {
    console.error("Error deleting document:", err.message || err);
  }

  // Cleanup the temp user
  try {
    console.log("Cleaning up temporary auth user...");
    if (userCred && userCred.user) {
      await userCred.user.delete();
      console.log("Temporary auth user deleted successfully.");
    }
  } catch (cleanupErr: any) {
    console.warn("Failed to delete temporary auth user:", cleanupErr.message);
  }

  process.exit(0);
}

run();
