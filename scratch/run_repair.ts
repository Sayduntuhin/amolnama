import { app, db, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../src/lib/firebase.ts';
import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

async function run() {
  console.log("Connecting to Firestore:", firebaseConfig.projectId);
  const email = `diagnostic_tester_${Date.now()}@example.com`;
  const password = "Password123!";
  let userCred;
  try {
    userCred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    userCred = await signInWithEmailAndPassword(auth, email, password);
  }

  try {
    const LEADER_UID = "QLy3xox25zbr67SpHP5uf7CdvYw2"; // Abu Awad Arman's Auth UID
    const LEADER_DOC_ID = "E4ztv4n4MkDMq01Hopco"; // Abu Awad Arman's Firestore Doc ID

    // Map of [duplicate developer doc ID]: [original developer doc ID]
    const duplicatesMap: Record<string, string> = {
      "jny7ipkJIoLAOo4N2tcl": "34P9Dm6hqLU1mOjxLYIY", // Md. Rasel Sarker
      "6cfdnJb1HsMTTn9jYKb0": "76opqucYASv9gpjm6FiD", // Md Roni Ahamed
      "8ZbIv5TFVaYIMLi6uUMp": "CckuQ0mYWAwjCmUvxCWq", // Md Mahmud Hasan
      "OITfe5gqTDN6rXWaTuQP": "kDCsXPmxVQWWse5HS4vK", // Md. Hasibul Hasan
      "qTCbaAac80d77X1eUPDk": "c8chSr6ZTj9xo6eOncG0", // Akash Adhikary
      "hOt4VIfQ86FaubUFSVgb": "GyFDFvKmCBNZAzCwxizl", // Mehedi Hasan Shihab
    };

    console.log("\n=== 1. MIGRATING ORIGINAL DEVELOPERS & DELETING DUPLICATES ===");
    for (const [dupId, origId] of Object.entries(duplicatesMap)) {
      console.log(`Processing duplicate pair: Dup=${dupId} -> Orig=${origId}`);
      
      // Update original developer doc to the new leader UID ownerId
      try {
        const origDocRef = doc(db, 'developers', origId);
        const origSnap = await getDoc(origDocRef);
        if (origSnap.exists()) {
          await updateDoc(origDocRef, { ownerId: LEADER_UID });
          console.log(`  Updated original developer ${origId} ownerId to ${LEADER_UID}`);
        } else {
          console.warn(`  Original developer document ${origId} not found!`);
        }
      } catch (err: any) {
        console.error(`  Error updating original developer ${origId}:`, err.message);
      }

      // Delete the duplicate developer doc
      try {
        const dupDocRef = doc(db, 'developers', dupId);
        const dupSnap = await getDoc(dupDocRef);
        if (dupSnap.exists()) {
          await deleteDoc(dupDocRef);
          console.log(`  Deleted duplicate developer document ${dupId}`);
        } else {
          console.log(`  Duplicate developer ${dupId} already deleted.`);
        }
      } catch (err: any) {
        console.error(`  Error deleting duplicate developer ${dupId}:`, err.message);
      }
    }

    console.log("\n=== 2. MIGRATING PROJECT OWNERSHIP & PHASE DEVELOPER ASSIGNMENTS ===");
    // Migrate project ownerId from leader doc ID to leader Auth UID
    try {
      const projCol = collection(db, 'projects');
      const projSnap = await getDocs(projCol);
      for (const projDoc of projSnap.docs) {
        const projData = projDoc.data();
        if (projData.ownerId === LEADER_DOC_ID) {
          await updateDoc(doc(db, 'projects', projDoc.id), { ownerId: LEADER_UID });
          console.log(`  Migrated project ${projDoc.id} (${projData.clientName}) ownerId to ${LEADER_UID}`);
        }

        // Fetch and update project phases if they contain duplicate developer IDs
        const phasesCol = collection(db, `projects/${projDoc.id}/phases`);
        const phasesSnap = await getDocs(phasesCol);
        for (const phaseDoc of phasesSnap.docs) {
          const phaseData = phaseDoc.data();
          let devIds: string[] = phaseData.developerIds || [];
          let updated = false;

          const nextDevIds: string[] = [];
          for (const devId of devIds) {
            if (duplicatesMap[devId]) {
              const origId = duplicatesMap[devId];
              if (!nextDevIds.includes(origId)) {
                nextDevIds.push(origId);
              }
              updated = true;
            } else {
              if (!nextDevIds.includes(devId)) {
                nextDevIds.push(devId);
              }
            }
          }

          if (updated) {
            await updateDoc(doc(db, `projects/${projDoc.id}/phases`, phaseDoc.id), {
              developerIds: nextDevIds
            });
            console.log(`  Updated phase ${phaseDoc.id} (${phaseData.phaseName}) developerIds from ${JSON.stringify(devIds)} to ${JSON.stringify(nextDevIds)}`);
          }
        }
      }
    } catch (err: any) {
      console.error("Error updating projects/phases:", err.message);
    }

    console.log("\n=== 3. MIGRATING DAILY PROGRESS LOGS ===");
    // Update daily progress logs that reference duplicate developer IDs or old owner IDs
    try {
      const logCol = collection(db, 'dailyProgress');
      const logSnap = await getDocs(logCol);
      for (const logDoc of logSnap.docs) {
        const logData = logDoc.data();
        let updates: Record<string, any> = {};

        // Migrate developer ID
        if (duplicatesMap[logData.developerId]) {
          updates.developerId = duplicatesMap[logData.developerId];
        }

        // Migrate ownerId
        if (logData.ownerId === LEADER_DOC_ID || logData.ownerId === "nTche5t9xJFMdHgSYDQN") {
          updates.ownerId = LEADER_UID;
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, 'dailyProgress', logDoc.id), updates);
          console.log(`  Updated progress log ${logDoc.id} with updates: ${JSON.stringify(updates)}`);
        }
      }
    } catch (err: any) {
      console.error("Error migrating daily progress logs:", err.message);
    }

    console.log("\n>>> DATABASE REPAIR COMPLETED SUCCESSFULLY! <<<");

  } catch (err: any) {
    console.error("Uncaught error during repair:", err.message || err);
  }

  // Cleanup temp user
  try {
    if (userCred && userCred.user) {
      await userCred.user.delete();
    }
  } catch (cleanupErr) {}
  process.exit(0);
}

run();
