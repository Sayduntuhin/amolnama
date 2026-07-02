import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where,
  getDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Project, ProjectStatus, PhaseName } from '@/src/types';
import { leaderService } from './leaderService';

const COLLECTION_NAME = 'projects';

export const projectService = {
  async getAllProjects() {
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
          return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Project[];
        } catch (err) {
          console.warn("Querying all projects restricted. Falling back to scoped query...", err);
        }
      }
      
      q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Project[];
    } catch (error) {
      console.warn("Failed to load projects:", error);
      return [];
    }
  },

  async getProjectById(id: string) {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Project;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${COLLECTION_NAME}/${id}`);
    }
  },

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'netAmount' | 'ownerId'> & { ownerId?: string }, initialPhases?: Array<{ 
    phaseName: PhaseName; 
    orderId: string;
    value: number; 
    startDate?: string;
    expectedDeliveryDate: string; 
    actualDeliveryDate?: string;
  }>) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Authentication required');

    try {
      const batch = writeBatch(db);
      const projectRef = doc(collection(db, COLLECTION_NAME));
      const docId = projectRef.id;
      
      const payload = {
        ...project,
        ownerId: project.ownerId || userId,
        netAmount: project.amount * 0.8,
        createdAt: serverTimestamp(),
      };
      
      batch.set(projectRef, payload);

      // Initialize phases as well
      if (initialPhases && initialPhases.length > 0) {
        initialPhases.forEach(phase => {
          const phaseRef = doc(collection(db, `${COLLECTION_NAME}/${docId}/phases`));
          batch.set(phaseRef, {
            phaseName: phase.phaseName,
            orderId: phase.orderId,
            status: 'In Progress',
            startDate: phase.startDate || project.startDate || new Date().toISOString(),
            expectedDeliveryDate: phase.expectedDeliveryDate,
            actualDeliveryDate: phase.actualDeliveryDate || phase.expectedDeliveryDate,
            value: phase.value,
            developerIds: [],
            progress: 0,
            resourceLinks: {}
          });
        });
      }

      await batch.commit();
      return docId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${COLLECTION_NAME}/[BATCH]`);
    }
  },

  async updateProject(id: string, data: Partial<Project>) {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const payload = { ...data };
      if (data.amount !== undefined) {
        payload.netAmount = data.amount * 0.8;
      }
      await updateDoc(docRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async deleteProject(id: string) {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async getProjectsByOwner(ownerId: string) {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', ownerId)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Project[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    }
  }
};
