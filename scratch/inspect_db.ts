import { app, db } from '../src/lib/firebase.ts';
import { collection, getDocs, query, where } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

async function run() {
  console.log("Connecting to Firestore:", firebaseConfig.projectId);
  try {
    // 1. Inspect Developers
    const devCol = collection(db, 'developers');
    const devSnap = await getDocs(devCol);
    console.log(`\n--- DEVELOPERS (${devSnap.docs.length}) ---`);
    for (const doc of devSnap.docs) {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`Name: ${data.name}`);
      console.log(`Email: ${data.email}`);
      console.log(`Role: ${data.role}`);
      console.log(`EmployeeId: ${data.employeeId}`);
      console.log(`Maintenance Projects:`, JSON.stringify(data.maintenanceProjects || []));
      console.log('-----------------------------------');
    }

    // 2. Inspect Projects and Phases
    const projCol = collection(db, 'projects');
    const projSnap = await getDocs(projCol);
    console.log(`\n--- PROJECTS WITH PHASES AND ASSIGNED DEVELOPERS ---`);
    for (const projDoc of projSnap.docs) {
      const projData = projDoc.data();
      console.log(`\nProject: ${projData.clientName} (ID: ${projDoc.id}, projectId: ${projData.projectId})`);
      
      const phasesCol = collection(db, `projects/${projDoc.id}/phases`);
      const phasesSnap = await getDocs(phasesCol);
      for (const phaseDoc of phasesSnap.docs) {
        const phaseData = phaseDoc.data();
        console.log(`  - Phase: ${phaseData.phaseName} (Status: ${phaseData.status}, DeveloperIds: ${JSON.stringify(phaseData.developerIds)})`);
      }
    }
  } catch (err: any) {
    console.error("Error running diagnostics:", err.message || err);
  }
  process.exit(0);
}

run();
