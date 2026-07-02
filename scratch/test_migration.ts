import { app, db, auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../src/lib/firebase.ts';
import { collection, doc, addDoc, getDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { leaderService } from '../src/services/leaderService.ts';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

async function run() {
  console.log("Connecting to Firestore:", firebaseConfig.projectId);
  const tempEmail = `diagnostic_tester_${Date.now()}@example.com`;
  const password = "Password123!";
  
  let userCred;
  try {
    console.log("Creating temporary auth user:", tempEmail);
    userCred = await createUserWithEmailAndPassword(auth, tempEmail, password);
    console.log("Temporary auth user created successfully. UID:", userCred.user.uid);
  } catch (err: any) {
    try {
      userCred = await signInWithEmailAndPassword(auth, tempEmail, password);
      console.log("Signed in successfully. UID:", userCred.user.uid);
    } catch (signInErr: any) {
      console.error("Authentication failed:", signInErr.message || signInErr);
      process.exit(1);
    }
  }

  const createdDocIds: { collection: string; id: string }[] = [];

  try {
    // 1. Create a mock leader document (unregistered, no UID)
    const leaderEmail = `mock_leader_${Date.now()}@joinventureai.com`;
    console.log(`\nCreating mock leader profile in Firestore for: ${leaderEmail}`);
    const leaderId = await leaderService.createLeader({
      name: "Mock Test Leader",
      email: leaderEmail,
      designation: "Test Manager"
    });
    if (!leaderId) throw new Error("Failed to create mock leader doc");
    console.log("Mock leader created. Doc ID:", leaderId);
    createdDocIds.push({ collection: 'leaders', id: leaderId });

    // 2. Create mock project and developer owned by the leader's document ID
    console.log(`\nAssigning mock project and developer to Leader Doc ID: ${leaderId}`);
    const projRef = await addDoc(collection(db, 'projects'), {
      clientName: "Migration Test Project",
      projectId: "P-MIG-TEST",
      amount: 1000,
      netAmount: 800,
      startDate: "2026-06-22",
      status: "WIP",
      ownerId: leaderId,
      createdAt: new Date().toISOString()
    });
    console.log("Created mock project. Doc ID:", projRef.id);
    createdDocIds.push({ collection: 'projects', id: projRef.id });

    const devRef = await addDoc(collection(db, 'developers'), {
      name: "Migration Test Developer",
      email: "mig_dev@joinventureai.com",
      role: "AI Engineer",
      designation: "Migrant Dev",
      employeeId: "99999",
      ownerId: leaderId
    });
    console.log("Created mock developer. Doc ID:", devRef.id);
    createdDocIds.push({ collection: 'developers', id: devRef.id });

    const logRef = await addDoc(collection(db, 'dailyProgress'), {
      date: "2026-06-22",
      projectId: projRef.id,
      developerId: devRef.id,
      description: "Migration Test Log",
      dailyTarget: "Test target",
      actualDone: "Test done",
      progressPercentage: 50,
      ownerId: leaderId
    });
    console.log("Created mock daily log. Doc ID:", logRef.id);
    createdDocIds.push({ collection: 'dailyProgress', id: logRef.id });

    // 3. Simulate leader registration by calling updateLeaderUid
    const mockLeaderAuthUid = `mock_leader_uid_${Date.now()}`;
    console.log(`\n--- SIMULATING LEADER REGISTRATION (UID: ${mockLeaderAuthUid}) ---`);
    await leaderService.updateLeaderUid(leaderId, leaderEmail, mockLeaderAuthUid);

    // 4. Verify migration of leader document, projects, developers, and progress logs
    console.log("\n--- VERIFYING DOCUMENT MIGRATION ---");
    
    // Check leader UID update
    const leaderDocSnap = await getDoc(doc(db, 'leaders', leaderId));
    const leaderData = leaderDocSnap.data();
    console.log(`Leader doc uid: ${leaderData?.uid} (Expected: ${mockLeaderAuthUid})`);
    if (leaderData?.uid !== mockLeaderAuthUid) {
      throw new Error("Leader document UID was not updated correctly!");
    }

    // Check project ownerId migration
    const projDocSnap = await getDoc(doc(db, 'projects', projRef.id));
    const projData = projDocSnap.data();
    console.log(`Project ownerId: ${projData?.ownerId} (Expected: ${mockLeaderAuthUid})`);
    if (projData?.ownerId !== mockLeaderAuthUid) {
      throw new Error("Project ownerId was not migrated!");
    }

    // Check developer ownerId migration
    const devDocSnap = await getDoc(doc(db, 'developers', devRef.id));
    const devData = devDocSnap.data();
    console.log(`Developer ownerId: ${devData?.ownerId} (Expected: ${mockLeaderAuthUid})`);
    if (devData?.ownerId !== mockLeaderAuthUid) {
      throw new Error("Developer ownerId was not migrated!");
    }

    // Check daily progress log ownerId migration
    const logDocSnap = await getDoc(doc(db, 'dailyProgress', logRef.id));
    const logData = logDocSnap.data();
    console.log(`Daily log ownerId: ${logData?.ownerId} (Expected: ${mockLeaderAuthUid})`);
    if (logData?.ownerId !== mockLeaderAuthUid) {
      throw new Error("Daily progress log ownerId was not migrated!");
    }

    console.log("\n>>> SUCCESS: Migration logic validated perfectly!");
  } catch (err: any) {
    console.error("\n>>> FAILURE during verification:", err.message || err);
  }

  // 5. Cleanup all created mock documents
  console.log("\nCleaning up created documents...");
  for (const item of createdDocIds) {
    try {
      await deleteDoc(doc(db, item.collection, item.id));
      console.log(`Deleted doc ${item.id} from ${item.collection}`);
    } catch (delErr: any) {
      console.warn(`Failed to delete doc ${item.id} from ${item.collection}:`, delErr.message);
    }
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
