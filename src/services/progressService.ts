import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  query, 
  where,
  orderBy,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { PhaseTracking, DailyProgress, Issue } from '@/src/types';
import { leaderService } from './leaderService';

export const progressService = {
  // Phases
  async getPhases(projectId: string) {
    const path = `projects/${projectId}/phases`;
    try {
      const q = query(collection(db, path));
      const querySnapshot = await getDocs(q);
      const phases = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PhaseTracking[];
      return phases;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async updatePhase(projectId: string, phaseId: string, data: Partial<PhaseTracking>) {
    const path = `projects/${projectId}/phases/${phaseId}`;
    try {
      await updateDoc(doc(db, `projects/${projectId}/phases`, phaseId), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async addPhase(projectId: string, phase: Omit<PhaseTracking, 'id'>) {
    const path = `projects/${projectId}/phases`;
    try {
      await addDoc(collection(db, path), {
        ...phase,
        startDate: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async getAllDailyProgress(ownerId?: string) {
    const userId = ownerId || auth.currentUser?.uid;
    if (!userId) return [];

    const path = 'dailyProgress';
    try {
      const email = auth.currentUser?.email;
      const isSuper = !ownerId && email && (email.toLowerCase().trim() === 'exceptionhubjvai@gmail.com');

      let isLeaderUser = false;
      if (email && !ownerId) {
        try {
          const leaderDoc = await leaderService.getLeaderByEmail(email);
          if (leaderDoc) isLeaderUser = true;
        } catch (e) {
          console.warn("Could not check if user is leader:", e);
        }
      }

      let q;
      if (isSuper || (!ownerId && !isLeaderUser)) {
        try {
          q = query(
            collection(db, path), 
            orderBy('date', 'desc')
          );
          const querySnapshot = await getDocs(q);
          return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DailyProgress[];
        } catch (err) {
          console.warn("Querying all progress logs restricted. Falling back to scoped query...", err);
        }
      }
      
      q = query(
        collection(db, path), 
        where('ownerId', '==', userId),
        orderBy('date', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DailyProgress[];
    } catch (error) {
      console.warn("Failed to load daily progress:", error);
      return [];
    }
  },

  // Daily Progress
  async getDailyProgress(projectId: string) {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    const path = 'dailyProgress';
    try {
      const email = auth.currentUser?.email;
      const isSuper = email && (email.toLowerCase().trim() === 'exceptionhubjvai@gmail.com');

      let q;
      if (isSuper) {
        try {
          q = query(
            collection(db, path), 
            where('projectId', '==', projectId),
            orderBy('date', 'desc')
          );
          const querySnapshot = await getDocs(q);
          return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DailyProgress[];
        } catch (superErr) {
          console.warn("Super Admin getDailyProgress query restricted by live Firestore rules. Falling back to scoped query...", superErr);
        }
      }
      
      q = query(
        collection(db, path), 
        where('projectId', '==', projectId),
        where('ownerId', '==', userId),
        orderBy('date', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DailyProgress[];
    } catch (error) {
      console.warn("Failed to load daily progress for project:", error);
      return [];
    }
  },

  async addDailyProgress(progress: Omit<DailyProgress, 'id' | 'ownerId'> & { ownerId?: string }) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Authentication required');

    const path = 'dailyProgress';
    try {
      await addDoc(collection(db, path), {
        ...progress,
        ownerId: progress.ownerId || userId
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async getDailyProgressByDeveloper(developerId: string) {
    const path = 'dailyProgress';
    try {
      const q = query(
        collection(db, path),
        where('developerId', '==', developerId)
      );
      const querySnapshot = await getDocs(q);
      const logs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DailyProgress[];
      logs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return logs;
    } catch (error) {
      console.warn("Failed to load daily progress by developer:", error);
      return [];
    }
  },

  async deleteDailyProgress(logId: string) {
    const path = 'dailyProgress';
    try {
      await deleteDoc(doc(db, path, logId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${path}/${logId}`);
    }
  },

  // Issues
  async getIssues(projectId: string) {
    const path = `projects/${projectId}/issues`;
    try {
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Issue[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async deletePhase(projectId: string, phaseId: string) {
    const path = `projects/${projectId}/phases`;
    try {
      await deleteDoc(doc(db, path, phaseId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${path}/${phaseId}`);
    }
  },

  async addIssue(projectId: string, issue: Omit<Issue, 'id' | 'createdAt' | 'projectId'>) {
    const path = `projects/${projectId}/issues`;
    try {
      await addDoc(collection(db, path), {
        ...issue,
        projectId,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async updateIssue(projectId: string, issueId: string, status: 'Open' | 'Resolved') {
    const path = `projects/${projectId}/issues/${issueId}`;
    try {
      await updateDoc(doc(db, `projects/${projectId}/issues`, issueId), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
};
