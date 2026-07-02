import { app, db, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../src/lib/firebase.ts';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
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
    // 1. Fetch Leaders
    const leadersCol = collection(db, 'leaders');
    const leadersSnap = await getDocs(leadersCol);
    console.log(`\n=== LEADERS IN DATABASE (${leadersSnap.docs.length}) ===`);
    const leadersMap = new Map<string, any>();
    for (const doc of leadersSnap.docs) {
      const data = doc.data();
      leadersMap.set(doc.id, { id: doc.id, ...data });
      console.log(`Leader ID: ${doc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Email: ${data.email}`);
      console.log(`  UID: ${data.uid || 'NOT REGISTERED'}`);
      console.log('-----------------------------------');
    }

    // 2. Fetch Developers
    const devCol = collection(db, 'developers');
    const devSnap = await getDocs(devCol);
    console.log(`\n=== DEVELOPERS IN DATABASE (${devSnap.docs.length}) ===`);
    const devsByEmail = new Map<string, any[]>();
    for (const doc of devSnap.docs) {
      const data = doc.data();
      const dev = { id: doc.id, ...data };
      const emailLower = (data.email || '').toLowerCase().trim();
      if (emailLower) {
        if (!devsByEmail.has(emailLower)) {
          devsByEmail.set(emailLower, []);
        }
        devsByEmail.get(emailLower)!.push(dev);
      }
      console.log(`Dev ID: ${doc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Email: ${data.email}`);
      console.log(`  OwnerId: ${data.ownerId}`);
      console.log(`  Maintenance Projects:`, JSON.stringify(data.maintenanceProjects || []));
      console.log('-----------------------------------');
    }

    // 3. Find Duplicates
    console.log(`\n=== DUPLICATE DEVELOPERS DETECTED ===`);
    for (const [email, list] of devsByEmail.entries()) {
      if (list.length > 1) {
        console.log(`Email: ${email} has ${list.length} records:`);
        for (const dev of list) {
          console.log(`  - Doc ID: ${dev.id}, Name: ${dev.name}, OwnerId: ${dev.ownerId}, Maintenance Count: ${dev.maintenanceProjects?.length || 0}`);
        }
      }
    }

    // 4. Fetch Projects
    const projCol = collection(db, 'projects');
    const projSnap = await getDocs(projCol);
    console.log(`\n=== PROJECTS IN DATABASE (${projSnap.docs.length}) ===`);
    for (const projDoc of projSnap.docs) {
      const projData = projDoc.data();
      console.log(`Project: ${projData.clientName} (ID: ${projDoc.id}, ownerId: ${projData.ownerId})`);
      
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
    if (userCred && userCred.user) {
      await userCred.user.delete();
    }
  } catch (cleanupErr: any) {
    console.warn("Failed to delete temporary auth user:", cleanupErr.message);
  }

  process.exit(0);
}

run();
