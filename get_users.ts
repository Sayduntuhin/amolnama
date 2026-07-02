import { app, db, collection, getDocs } from './src/lib/firebase.ts';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

async function run() {
  console.log("Connecting to Firestore database:", firebaseConfig.projectId);
  try {
    const projCol = collection(db, 'projects');
    const snap = await getDocs(projCol);
    console.log(`Found ${snap.docs.length} projects.`);
    const owners = new Set<string>();
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (data.ownerId) {
        owners.add(data.ownerId);
      }
    });
    console.log("Project Owner UIDs in database:", Array.from(owners));
    
    // Check users collection
    try {
      const userCol = collection(db, 'users');
      const userSnap = await getDocs(userCol);
      console.log(`Found ${userSnap.docs.length} users in the registry:`);
      userSnap.docs.forEach(doc => {
        console.log(`- UID: ${doc.id}, Email: ${doc.data()?.email || 'N/A'}, Name: ${doc.data()?.name || 'N/A'}`);
      });
    } catch (err: any) {
      console.log("Users collection read failed or restricted:", err.message);
    }
  } catch (err: any) {
    console.error("Error executing query:", err.message || err);
  }
  process.exit(0);
}

run();
