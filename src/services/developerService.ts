import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  getDoc,
  where
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Developer } from '@/src/types';
import { leaderService } from './leaderService';

const COLLECTION_NAME = 'developers';

export const developerService = {
  async getAllDevelopers() {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    try {
      const email = auth.currentUser?.email;
      const isSuper = email && (email.toLowerCase().trim() === 'exceptionhubjvai@gmail.com');

      let isLeaderUser = false;
      if (email) {
        try {
          const leaderDoc = await leaderService.getLeaderByEmail(email);
          if (leaderDoc) isLeaderUser = true;
        } catch (e) {
          console.warn("Could not check if user is leader:", e);
        }
      }

      let q;
      if (isSuper || !isLeaderUser) {
        try {
          q = collection(db, COLLECTION_NAME);
          const querySnapshot = await getDocs(q);
          return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Developer[];
        } catch (superErr) {
          console.warn("Super Admin or Admin developers query restricted. Falling back to scoped query...", superErr);
        }
      }
      
      q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Developer[];
    } catch (error) {
      console.warn("Failed to load developers:", error);
      return [];
    }
  },

  async createDeveloper(developer: Omit<Developer, 'id' | 'ownerId'> & { ownerId?: string }) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Authentication required');

    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...developer,
        email: developer.email.toLowerCase().trim(),
        ownerId: developer.ownerId || userId
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    }
  },

  async deleteDeveloper(id: string) {
    try {
      // Delete developer document
      await deleteDoc(doc(db, COLLECTION_NAME, id));

      // 3. Spin off background cleanup tasks without awaiting them to make the service return instantly!
      (async () => {
        // Clear all dailyProgress logs for this developer
        try {
          const q = query(
            collection(db, 'dailyProgress'),
            where('developerId', '==', id)
          );
          const querySnapshot = await getDocs(q);
          const deletePromises = querySnapshot.docs.map(item => 
            deleteDoc(doc(db, 'dailyProgress', item.id))
          );
          await Promise.all(deletePromises);
          console.log(`Successfully purged ${deletePromises.length} progress logs for developer ${id}`);
        } catch (err) {
          console.warn("Failed to delete daily progress logs for developer:", err);
        }

        // Purge developer references from all projects/phases (developerIds & kpiAllocations)
        try {
          const projectsSnap = await getDocs(collection(db, 'projects'));
          const updatePromises: Promise<any>[] = [];
          for (const projDoc of projectsSnap.docs) {
            const projectId = projDoc.id;
            const phasesCol = collection(db, `projects/${projectId}/phases`);
            const phasesSnap = await getDocs(phasesCol);
            for (const phaseDoc of phasesSnap.docs) {
              const phaseData = phaseDoc.data() as any;
              let updated = false;
              let updatedDevIds = phaseData.developerIds || [];
              if (updatedDevIds.includes(id)) {
                updatedDevIds = updatedDevIds.filter((devId: string) => devId !== id);
                updated = true;
              }

              let updatedKpis = phaseData.kpiAllocations || [];
              if (updatedKpis.some((kpi: any) => kpi.developerId === id)) {
                updatedKpis = updatedKpis.filter((kpi: any) => kpi.developerId !== id);
                updated = true;
              }

              if (updated) {
                const phaseRef = doc(db, `projects/${projectId}/phases`, phaseDoc.id);
                updatePromises.push(updateDoc(phaseRef, {
                  developerIds: updatedDevIds,
                  kpiAllocations: updatedKpis
                }));
              }
            }
          }
          await Promise.all(updatePromises);
          console.log(`Successfully cleaned up project phase assignments for developer ${id}`);
        } catch (err) {
          console.warn("Failed to clean up developer assignments across tasks:", err);
        }
      })();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async updateDeveloper(id: string, developer: Partial<Developer>) {
    try {
      const updatedData = { ...developer };
      if (updatedData.email) {
        updatedData.email = updatedData.email.toLowerCase().trim();
      }
      await updateDoc(doc(db, COLLECTION_NAME, id), updatedData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async getDeveloperByEmail(email: string) {
    if (!email) return null;
    try {
      const emailLower = email.toLowerCase().trim();

      // 1. Try match with original email string
      const qOriginal = query(
        collection(db, COLLECTION_NAME),
        where('email', '==', email)
      );
      const querySnapshotOriginal = await getDocs(qOriginal);
      if (!querySnapshotOriginal.empty) {
        return { id: querySnapshotOriginal.docs[0].id, ...querySnapshotOriginal.docs[0].data() } as Developer;
      }

      // 2. Try match with lowercased email string
      const qLower = query(
        collection(db, COLLECTION_NAME),
        where('email', '==', emailLower)
      );
      const querySnapshotLower = await getDocs(qLower);
      if (!querySnapshotLower.empty) {
        return { id: querySnapshotLower.docs[0].id, ...querySnapshotLower.docs[0].data() } as Developer;
      }

      // 3. Fallback: retrieve all developers and do a client-side case-insensitive match
      const allDevsSnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const match = allDevsSnapshot.docs.find(doc => {
        const devEmail = doc.data()?.email;
        return devEmail && devEmail.toLowerCase().trim() === emailLower;
      });
      if (match) {
        return { id: match.id, ...match.data() } as Developer;
      }

      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return null;
    }
  },

};
