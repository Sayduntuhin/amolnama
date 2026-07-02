import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Leader } from '@/src/types';

const COLLECTION_NAME = 'leaders';

export const leaderService = {
  async getAllLeaders() {
    try {
      const q = collection(db, COLLECTION_NAME);
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Leader[];
    } catch (error) {
      console.warn("Could not fetch leaders from Firestore:", error);
      return [];
    }
  },

  async getLeadersByCreator(creatorId: string) {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('creatorId', '==', creatorId)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Leader[];
    } catch (error) {
      console.warn("Could not fetch leaders by creator:", error);
      return [];
    }
  },

  async createLeader(leader: { name: string; email: string; designation?: string }) {
    const creatorId = auth.currentUser?.uid;
    if (!creatorId) throw new Error('Authentication required');

    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        name: leader.name,
        email: leader.email.toLowerCase().trim(),
        designation: leader.designation || 'Leader',
        creatorId: creatorId,
        createdAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    }
  },

  async deleteLeader(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async getLeaderByEmail(email: string) {
    if (!email) return null;
    const emailLower = email.toLowerCase().trim();

    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('email', '==', emailLower)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        return { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as Leader;
      }
      return null;
    } catch (error) {
      console.warn(`Could not check if user ${emailLower} is a leader:`, error);
      return null;
    }
  },

  async updateLeaderUid(docId: string, email: string, uid: string) {
    console.log(`[leaderService] Attempting to update UID for leader ${email} (UID: ${uid})...`);
    try {
      const emailLower = email.toLowerCase().trim();
      const q = query(collection(db, COLLECTION_NAME), where('email', '==', emailLower));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const existingDocId = querySnapshot.docs[0].id;
        await updateDoc(doc(db, COLLECTION_NAME, existingDocId), { uid });
        console.log(`[leaderService] Successfully updated leader document ${existingDocId} with UID: ${uid}`);

        // Migrate all associated entities that were assigned using the Firestore document ID as ownerId
        try {
          // 1. Projects
          const projQuery = query(collection(db, 'projects'), where('ownerId', '==', existingDocId));
          const projSnapshot = await getDocs(projQuery);
          for (const projDoc of projSnapshot.docs) {
            await updateDoc(doc(db, 'projects', projDoc.id), { ownerId: uid });
            console.log(`[leaderService] Migrated project ${projDoc.id} ownerId from ${existingDocId} to ${uid}`);
          }

          // 2. Developers
          const devQuery = query(collection(db, 'developers'), where('ownerId', '==', existingDocId));
          const devSnapshot = await getDocs(devQuery);
          for (const devDoc of devSnapshot.docs) {
            await updateDoc(doc(db, 'developers', devDoc.id), { ownerId: uid });
            console.log(`[leaderService] Migrated developer ${devDoc.id} ownerId from ${existingDocId} to ${uid}`);
          }

          // 3. Daily Progress Logs
          const logQuery = query(collection(db, 'dailyProgress'), where('ownerId', '==', existingDocId));
          const logSnapshot = await getDocs(logQuery);
          for (const logDoc of logSnapshot.docs) {
            await updateDoc(doc(db, 'dailyProgress', logDoc.id), { ownerId: uid });
            console.log(`[leaderService] Migrated progress log ${logDoc.id} ownerId from ${existingDocId} to ${uid}`);
          }
        } catch (migrationErr) {
          console.error("[leaderService] Error migrating associated entities to new UID:", migrationErr);
        }
      }
    } catch (error) {
      console.error("[leaderService] FAILED to update leader UID in database:", error);
    }
  }
};
