import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  query, 
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { ProjectCredential } from '@/src/types';

export const credentialService = {
  async getCredentials(projectId: string) {
    const path = `projects/${projectId}/credentials`;
    try {
      const q = query(collection(db, path));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProjectCredential[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async addCredential(projectId: string, credential: Omit<ProjectCredential, 'id' | 'updatedAt'>) {
    const path = `projects/${projectId}/credentials`;
    try {
      await addDoc(collection(db, path), {
        ...credential,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async updateCredential(projectId: string, credentialId: string, data: Partial<ProjectCredential>) {
    const path = `projects/${projectId}/credentials/${credentialId}`;
    try {
      await updateDoc(doc(db, `projects/${projectId}/credentials`, credentialId), {
        ...data,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteCredential(projectId: string, credentialId: string) {
    const path = `projects/${projectId}/credentials`;
    try {
      await deleteDoc(doc(db, path, credentialId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${path}/${credentialId}`);
    }
  }
};
