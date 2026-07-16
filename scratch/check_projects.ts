import { db, collection, getDocs } from '../src/lib/firebase.ts';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

async function run() {
  console.log("Connecting to Firestore database:", firebaseConfig.projectId);
  try {
    const projCol = collection(db, 'projects');
    const snap = await getDocs(projCol);
    console.log(`Found ${snap.docs.length} projects.`);
    
    for (const doc of snap.docs) {
      const data = doc.data();
      console.log(`\nProject ID: ${doc.id}`);
      console.log(`Client Name: ${data.clientName}`);
      console.log(`Status: ${data.status}`);
      console.log(`Delivery Date: ${data.deliveryDate}`);
      
      // Also get phases
      const phasesCol = collection(db, `projects/${doc.id}/phases`);
      const phasesSnap = await getDocs(phasesCol);
      console.log(`Phases count: ${phasesSnap.docs.length}`);
      phasesSnap.docs.forEach(pDoc => {
        const pData = pDoc.data();
        console.log(`  - Phase Name: ${pData.phaseName}, Status: ${pData.status}, Start Date: ${pData.startDate}, End Date: ${pData.endDate}, Expected Delivery Date: ${pData.expectedDeliveryDate}, Actual Delivery Date: ${pData.actualDeliveryDate}`);
      });
    }
  } catch (err: any) {
    console.error("Error executing query:", err.message || err);
  }
  process.exit(0);
}

run();
