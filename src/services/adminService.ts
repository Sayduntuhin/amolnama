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
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';

const COLLECTION_NAME = 'admins';

const defaultSeeds = [
  {
    id: "admin-seed-sayduntuhin",
    name: "Saydun Nabi tuhin",
    email: "sayduntuhin.jvai@gmail.com",
    designation: "Administrator"
  },
  {
    id: "super-admin-id",
    name: "Super Admin",
    email: "exceptionhubjvai@gmail.com",
    designation: "Super Administrator"
  }
];

export const adminService = {
  async getAllAdmins() {
    try {
      const q = collection(db, COLLECTION_NAME);
      const querySnapshot = await getDocs(q);
      const dbAdmins = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      
      const result = [...dbAdmins];
      
      // Merge default seeds into the list if they are not already in DB
      defaultSeeds.forEach(seed => {
        if (!result.some(a => a.email && a.email.toLowerCase().trim() === seed.email.toLowerCase().trim())) {
          result.push(seed);
        }
      });
      return result;
    } catch (error) {
      console.warn("Could not fetch admins from Firestore (rules not deployed?). Returning seed admins fallback.", error);
      return defaultSeeds;
    }
  },

  async createAdmin(admin: { name: string; email: string; designation?: string }) {
    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        name: admin.name,
        email: admin.email.toLowerCase().trim(),
        designation: admin.designation || 'Administrator',
        createdAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    }
  },

  async deleteAdmin(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async getAdminByEmail(email: string) {
    if (!email) return null;
    const emailLower = email.toLowerCase().trim();
    
    // Check default seeds first (as the exception case for previous/bootstrap admins)
    const seedMatch = defaultSeeds.find(a => a.email.toLowerCase() === emailLower);
    if (seedMatch) {
      return seedMatch;
    }

    try {
      // 1. Try exact match query
      const q = query(
        collection(db, COLLECTION_NAME),
        where('email', '==', emailLower)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        return { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as { id: string; name: string; email: string; designation?: string };
      }

      // 2. Fallback: case-insensitive client-side search (covers any custom mock storage anomalies)
      const allAdmins = await getDocs(collection(db, COLLECTION_NAME));
      const match = allAdmins.docs.find(doc => {
        const adminEmail = doc.data()?.email;
        return adminEmail && adminEmail.toLowerCase().trim() === emailLower;
      });
      if (match) {
        return { id: match.id, ...match.data() } as { id: string; name: string; email: string; designation?: string };
      }

      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      return null;
    }
  },

  async updateAdminUid(docId: string, email: string, uid: string) {
    console.log(`[adminService] Attempting to update UID for ${email} (UID: ${uid})...`);
    try {
      const emailLower = email.toLowerCase().trim();
      const q = query(collection(db, COLLECTION_NAME), where('email', '==', emailLower));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const existingDocId = querySnapshot.docs[0].id;
        await updateDoc(doc(db, COLLECTION_NAME, existingDocId), { uid });
        console.log(`[adminService] Successfully updated existing admin document ${existingDocId} with UID: ${uid}`);
      } else {
        const seed = defaultSeeds.find(s => s.email.toLowerCase() === emailLower);
        const newDocRef = await addDoc(collection(db, COLLECTION_NAME), {
          name: seed?.name || email.split('@')[0],
          email: emailLower,
          designation: seed?.designation || 'Administrator',
          uid: uid,
          createdAt: serverTimestamp()
        });
        console.log(`[adminService] Created new admin document ${newDocRef.id} for ${email} with UID: ${uid}`);
      }
    } catch (error) {
      console.error("[adminService] FAILED to update admin UID in database. This usually means your firestore.rules are blocking the write or not deployed yet:", error);
    }
  }
};
