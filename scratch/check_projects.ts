import { app, db, auth, collection, getDocs, query, where, signInWithEmailAndPassword } from '../src/lib/firebase.ts';

async function run() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage: npx tsx scratch/check_projects.ts <email> <password>");
    process.exit(1);
  }

  console.log(`Attempting to sign in as ${email}...`);
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const user = userCred.user;
    console.log(`Successfully authenticated! UID: ${user.uid}`);

    // Try global query
    console.log("\n--- Attempting Global Projects Query ---");
    try {
      const globalSnap = await getDocs(collection(db, 'projects'));
      console.log(`Success! Found ${globalSnap.docs.length} total projects globally:`);
      globalSnap.docs.forEach(doc => {
        console.log(`- ID: ${doc.id}, Name: ${doc.data()?.clientName}, OwnerID: ${doc.data()?.ownerId}`);
      });
    } catch (err: any) {
      console.warn(`Global query failed (expected if rules are not deployed): ${err.message}`);
    }

    // Try owner-scoped query
    console.log("\n--- Attempting Owner-Scoped Projects Query ---");
    try {
      const scopedQuery = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
      const scopedSnap = await getDocs(scopedQuery);
      console.log(`Success! Found ${scopedSnap.docs.length} projects owned by this UID:`);
      scopedSnap.docs.forEach(doc => {
        console.log(`- ID: ${doc.id}, Name: ${doc.data()?.clientName}`);
      });
    } catch (err: any) {
      console.error(`Scoped query failed: ${err.message}`);
    }

  } catch (err: any) {
    console.error(`Authentication or query failed: ${err.message}`);
  }
  process.exit(0);
}

run();
