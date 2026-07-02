import { app, db, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../src/lib/firebase.ts';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

async function run() {
  console.log("Connecting to Firestore:", firebaseConfig.projectId);
  const email = `diagnostic_tester_${Date.now()}@example.com`;
  const password = "Password123!";
  
  let userCred;
  try {
    console.log("Creating temporary auth user:", email);
    userCred = await createUserWithEmailAndPassword(auth, email, password);
    console.log("Temporary auth user created successfully. UID:", userCred.user.uid);
  } catch (err: any) {
    console.warn("Could not create user (might already exist), attempting sign in:", err.message);
    try {
      userCred = await signInWithEmailAndPassword(auth, email, password);
      console.log("Signed in successfully. UID:", userCred.user.uid);
    } catch (signInErr: any) {
      console.error("Authentication failed:", signInErr.message || signInErr);
      process.exit(1);
    }
  }

  try {
    // 1. Inspect Developers
    const devCol = collection(db, 'developers');
    const devSnap = await getDocs(devCol);
    console.log(`\n--- DEVELOPERS IN FIRESTORE (${devSnap.docs.length}) ---`);
    for (const doc of devSnap.docs) {
      const data = doc.data();
      console.log(`Doc ID: ${doc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Email: ${data.email}`);
      console.log(`  Role: ${data.role}`);
      console.log(`  EmployeeId: ${data.employeeId}`);
      console.log(`  OwnerId: ${data.ownerId}`);
      console.log(`  Maintenance Projects:`, JSON.stringify(data.maintenanceProjects || []));
      console.log('-----------------------------------');
    }

    // 2. Inspect Projects
    const projCol = collection(db, 'projects');
    const projSnap = await getDocs(projCol);
    console.log(`\n--- PROJECTS WITH ASSIGNED DEVELOPERS ---`);
    for (const projDoc of projSnap.docs) {
      const projData = projDoc.data();
      console.log(`\nProject: ${projData.clientName} (Doc ID: ${projDoc.id}, projectId: ${projData.projectId}, ownerId: ${projData.ownerId})`);
      
      const phasesCol = collection(db, `projects/${projDoc.id}/phases`);
      const phasesSnap = await getDocs(phasesCol);
      for (const phaseDoc of phasesSnap.docs) {
        const phaseData = phaseDoc.data();
        console.log(`  - Phase: ${phaseData.phaseName} (Status: ${phaseData.status}, DeveloperIds: ${JSON.stringify(phaseData.developerIds)})`);
      }
    }
  } catch (err: any) {
    console.error("Error executing queries:", err.message || err);
  }

  // Cleanup the temp user
  try {
    console.log("\nCleaning up temporary auth user...");
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
