/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseConfig from '../../firebase-applet-config.json';
import { initializeApp as realInitializeApp } from '@firebase/app';
import { 
  getAuth as realGetAuth, 
  signInWithEmailAndPassword as realSignInWithEmailAndPassword, 
  createUserWithEmailAndPassword as realCreateUserWithEmailAndPassword, 
  signOut as realSignOut, 
  onAuthStateChanged as realOnAuthStateChanged,
  signInWithPopup as realSignInWithPopup,
  GoogleAuthProvider as realGoogleAuthProvider
} from '@firebase/auth';
import { 
  getFirestore as realGetFirestore, 
  doc as realDoc, 
  collection as realCollection, 
  query as realQuery, 
  where as realWhere, 
  orderBy as realOrderBy, 
  getDoc as realGetDoc, 
  getDocs as realGetDocs, 
  addDoc as realAddDoc, 
  updateDoc as realUpdateDoc, 
  deleteDoc as realDeleteDoc, 
  writeBatch as realWriteBatch, 
  serverTimestamp as realServerTimestamp,
  getDocFromServer as realGetDocFromServer
} from '@firebase/firestore';

// Detect if we are using placeholder/mock credentials
const IS_MOCK = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('remixed-') || firebaseConfig.apiKey === '';

// --- SEED SECTOR ---
const SEED_PROJECTS = [
  {
    id: "proj-1",
    projectId: "P-101",
    clientName: "Acme Corporates",
    ownerId: "admin-user-id",
    amount: 25000,
    netAmount: 20000,
    startDate: "2026-05-15",
    status: "WIP",
    shift: "Day",
    deliveryDate: "2026-06-25",
    phases: ["UI/UX", "Web Frontend", "Backend"],
    createdAt: "2026-05-15T00:00:00.000Z"
  },
  {
    id: "proj-2",
    projectId: "P-102",
    clientName: "Starlight Inc",
    ownerId: "admin-user-id",
    amount: 18000,
    netAmount: 14400,
    startDate: "2026-05-10",
    status: "Delayed",
    shift: "Night",
    deliveryDate: "2026-06-25",
    phases: ["App Frontend", "Backend"],
    createdAt: "2026-05-10T00:00:00.000Z"
  },
  {
    id: "proj-3",
    projectId: "P-103",
    clientName: "Horizon Logistics",
    ownerId: "admin-user-id",
    amount: 30000,
    netAmount: 24000,
    startDate: "2026-04-01",
    status: "Delivered",
    shift: "Day",
    deliveryDate: "2026-05-15",
    phases: ["UI/UX", "Web Frontend", "Backend"],
    createdAt: "2026-04-01T00:00:00.000Z"
  }
];

const SEED_DEVELOPERS = [
  {
    id: "dev-1",
    employeeId: "EMP-001",
    name: "Aurelia Vance",
    email: "aurelia@sprintdesk.io",
    role: "UI/UX Designer",
    designation: "Senior Product Designer",
    ownerId: "admin-user-id",
    shift: "Day"
  },
  {
    id: "dev-2",
    employeeId: "EMP-002",
    name: "Devon Lane",
    email: "devon@sprintdesk.io",
    role: "Frontend Developer",
    designation: "Lead React Engineer",
    ownerId: "admin-user-id",
    shift: "Day"
  },
  {
    id: "dev-3",
    employeeId: "EMP-003",
    name: "Annette Black",
    email: "annette@sprintdesk.io",
    role: "Backend Developer",
    designation: "Principal Architect",
    ownerId: "admin-user-id",
    shift: "Night"
  },
  {
    id: "dev-4",
    employeeId: "EMP-004",
    name: "Courtney Henry",
    email: "courtney@sprintdesk.io",
    role: "AI Engineer",
    designation: "NLP Research Specialist",
    ownerId: "admin-user-id",
    shift: "Day"
  },
  {
    id: "dev-5",
    employeeId: "EMP-005",
    name: "Zahid Hasan",
    email: "zahid@sprintdesk.io",
    role: "Flutter Developer",
    designation: "Staff Mobile Architect",
    ownerId: "admin-user-id",
    shift: "Night"
  }
];

const SEED_PHASES: Record<string, any[]> = {
  "projects/proj-1/phases": [
    {
      id: "phase-1-1",
      phaseName: "UI/UX",
      value: 5000,
      status: "Delivered",
      developerIds: ["dev-1"],
      progress: 100,
      startDate: "2026-05-15",
      expectedDeliveryDate: "2026-05-25",
      kpiAllocations: [{ id: "alloc-1", developerId: "dev-1", percentage: 100, value: 4000, includeInKPI: true }]
    },
    {
      id: "phase-1-2",
      phaseName: "Web Frontend",
      value: 10000,
      status: "In Progress",
      developerIds: ["dev-2"],
      progress: 60,
      startDate: "2026-05-25",
      expectedDeliveryDate: "2026-06-15"
    },
    {
      id: "phase-1-3",
      phaseName: "Backend",
      value: 10000,
      status: "In Progress",
      developerIds: ["dev-3"],
      progress: 40,
      startDate: "2026-05-25",
      expectedDeliveryDate: "2026-06-20",
      kpiAllocations: [{ id: "kpi-alt-1", developerId: "dev-4", percentage: 20, value: 1600, includeInKPI: true }]
    }
  ],
  "projects/proj-2/phases": [
    {
      id: "phase-2-1",
      phaseName: "App Frontend",
      value: 9000,
      status: "In Progress",
      developerIds: ["dev-5"],
      progress: 30,
      startDate: "2026-05-10",
      expectedDeliveryDate: "2026-06-01",
      totalExtensionDays: 3,
      extensions: [{ id: "ext-1", days: 3, reason: "API specifications delayed by client", previousDate: "2026-06-01", newDate: "2026-06-04", status: "Approved" }]
    },
    {
      id: "phase-2-2",
      phaseName: "Backend",
      value: 9000,
      status: "Pending",
      developerIds: ["dev-3"],
      progress: 0,
      startDate: "2026-06-05",
      expectedDeliveryDate: "2026-06-25"
    }
  ],
  "projects/proj-3/phases": [
    {
      id: "phase-3-1",
      phaseName: "UI/UX",
      value: 6000,
      status: "Delivered",
      developerIds: ["dev-1"],
      progress: 100,
      startDate: "2026-04-01",
      expectedDeliveryDate: "2026-04-10",
      kpiAllocations: [{ id: "alloc-3-1", developerId: "dev-1", percentage: 100, value: 4800, includeInKPI: true }]
    },
    {
      id: "phase-3-2",
      phaseName: "Web Frontend",
      value: 12000,
      status: "Delivered",
      developerIds: ["dev-2"],
      progress: 100,
      startDate: "2026-04-10",
      expectedDeliveryDate: "2026-05-01",
      kpiAllocations: [{ id: "alloc-3-2", developerId: "dev-2", percentage: 100, value: 9600, includeInKPI: true }]
    },
    {
      id: "phase-3-3",
      phaseName: "Backend",
      value: 12000,
      status: "Delivered",
      developerIds: ["dev-3"],
      progress: 100,
      startDate: "2026-04-10",
      expectedDeliveryDate: "2026-05-15",
      kpiAllocations: [{ id: "alloc-3-3", developerId: "dev-3", percentage: 100, value: 9600, includeInKPI: true }]
    }
  ]
};

const SEED_ISSUES: Record<string, any[]> = {
  "projects/proj-2/issues": [
    {
      id: "iss-1",
      projectId: "proj-2",
      phaseId: "phase-2-1",
      developerId: "dev-5",
      title: "Authentication endpoints failing in sandbox",
      description: "The OAuth token refresh endpoint is dropping active sockets under load.",
      priority: "High",
      status: "Open",
      type: "Internal Issue",
      createdAt: "2026-05-28T14:22:11.000Z"
    }
  ]
};

const SEED_DAILY_LOGS = [
  {
    id: "log-1",
    developerId: "dev-2",
    projectId: "proj-1",
    phaseId: "phase-1-2",
    ownerId: "admin-user-id",
    date: new Date().toISOString().split('T')[0],
    description: "Implemented state management for the dashboard and hooked up live sensors feedback.",
    dailyTarget: "Integrate Redux state",
    actualDone: "Completed dashboard Redux integration and verified telemetry charts.",
    progressPercentage: 60,
    shift: "Day"
  },
  {
    id: "log-2",
    developerId: "dev-3",
    projectId: "proj-1",
    phaseId: "phase-1-3",
    ownerId: "admin-user-id",
    date: new Date().toISOString().split('T')[0],
    description: "Fixed performance bottlenecks on SQL queries and implemented caching layer.",
    dailyTarget: "Optimize APIs",
    actualDone: "Halved API latency by introducing Redis query cache.",
    progressPercentage: 40,
    shift: "Night"
  }
];

function initLocalStorageSeeds() {
  if (typeof window !== 'undefined') {
    if (!localStorage.getItem('projects')) {
      localStorage.setItem('projects', JSON.stringify(SEED_PROJECTS));
    }
    if (!localStorage.getItem('developers')) {
      localStorage.setItem('developers', JSON.stringify(SEED_DEVELOPERS));
    }
    if (!localStorage.getItem('admins')) {
      localStorage.setItem('admins', JSON.stringify([
        {
          id: "admin-user-id",
          name: "Admin Leader",
          email: "admin@sprintdesk.io",
          designation: "Lead Administrator",
          createdAt: new Date().toISOString()
        }
      ]));
    }
    if (!localStorage.getItem('dailyProgress')) {
      localStorage.setItem('dailyProgress', JSON.stringify(SEED_DAILY_LOGS));
    }
    Object.entries(SEED_PHASES).forEach(([key, val]) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(val));
      }
    });
    Object.entries(SEED_ISSUES).forEach(([key, val]) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(val));
      }
    });
    // Default Administrator Login Seed
    if (!localStorage.getItem('sprintdesk_curr_user')) {
      localStorage.setItem('sprintdesk_curr_user', JSON.stringify({
        uid: "admin-user-id",
        email: "admin@sprintdesk.io",
        displayName: "Administrator",
        emailVerified: true
      }));
    }
  }
}

if (IS_MOCK) {
  initLocalStorageSeeds();
}

// --- CORE MOCK PROVIDER CLASS SECTOR ---
class MockAuth {
  private listeners: Array<(user: any) => void> = [];

  get currentUser() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sprintdesk_curr_user');
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  }

  onAuthStateChanged(callback: (user: any) => void) {
    this.listeners.push(callback);
    // Fire initially
    setTimeout(() => callback(this.currentUser), 0);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notify() {
    const user = this.currentUser;
    this.listeners.forEach(l => l(user));
  }

  signInWithEmailAndPassword(email: string) {
    const emailLower = email.toLowerCase().trim();
    const developers = JSON.parse(localStorage.getItem('developers') || '[]');
    const matchedDev = developers.find((d: any) => d.email.toLowerCase() === emailLower);

    const admins = JSON.parse(localStorage.getItem('admins') || '[]');
    const matchedAdmin = admins.find((a: any) => a.email.toLowerCase() === emailLower);

    let payload: any = null;

    if (emailLower === 'exceptionhubjvai@gmail.com') {
      payload = {
        uid: "super-admin-id",
        email: "exceptionhubjvai@gmail.com",
        displayName: "Super Admin",
        emailVerified: true
      };
    } else if (emailLower === 'admin@sprintdesk.io') {
      payload = {
        uid: "admin-user-id",
        email: "admin@sprintdesk.io",
        displayName: "Administrator",
        emailVerified: true
      };
    } else if (matchedDev) {
      payload = {
        uid: matchedDev.id,
        email: matchedDev.email,
        displayName: matchedDev.name,
        emailVerified: true
      };
    } else if (matchedAdmin) {
      payload = {
        uid: matchedAdmin.id,
        email: matchedAdmin.email,
        displayName: matchedAdmin.name,
        emailVerified: true
      };
    } else {
      return Promise.reject(new Error("Firebase Auth Error: auth/user-not-found"));
    }

    localStorage.setItem('sprintdesk_curr_user', JSON.stringify(payload));
    this.notify();
    return Promise.resolve({ user: payload });
  }

  createUserWithEmailAndPassword(email: string) {
    const emailLower = email.toLowerCase().trim();
    const developers = JSON.parse(localStorage.getItem('developers') || '[]');
    const matchedDev = developers.find((d: any) => d.email.toLowerCase() === emailLower);

    const admins = JSON.parse(localStorage.getItem('admins') || '[]');
    const matchedAdmin = admins.find((a: any) => a.email.toLowerCase() === emailLower);

    if (emailLower !== 'exceptionhubjvai@gmail.com' && emailLower !== 'admin@sprintdesk.io' && !matchedDev && !matchedAdmin) {
      return Promise.reject(new Error("Firebase Auth Error: auth/email-not-registered-in-roster"));
    }

    const payload = {
      uid: matchedDev ? matchedDev.id : (matchedAdmin ? matchedAdmin.id : "new-user-id"),
      email: email,
      displayName: matchedDev ? matchedDev.name : (matchedAdmin ? matchedAdmin.name : email.split('@')[0]),
      emailVerified: true
    };

    localStorage.setItem('sprintdesk_curr_user', JSON.stringify(payload));
    this.notify();
    return Promise.resolve({ user: payload });
  }

  signOut() {
    localStorage.removeItem('sprintdesk_curr_user');
    this.notify();
    return Promise.resolve();
  }
}

export class DocRef {
  constructor(public db: any, public path: string, public id: string) {}
}

export class CollectionRef {
  constructor(public db: any, public path: string) {}
}

export class Query {
  constructor(public collectionRef: CollectionRef, public constraints: any[] = []) {}
}

// --- EXPORTED ENDPOINTS & FUNCTIONS ---

const realApp = IS_MOCK ? null : realInitializeApp(firebaseConfig);
const realDb = IS_MOCK ? null : (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)" ? realGetFirestore(realApp!, firebaseConfig.firestoreDatabaseId) : realGetFirestore(realApp!));
const realAuth = IS_MOCK ? null : realGetAuth(realApp!);

export const app = IS_MOCK ? { options: { projectId: firebaseConfig.projectId } } : realApp;
export const db = IS_MOCK ? { app } as any : realDb as any;
export const auth = IS_MOCK ? new MockAuth() as any : realAuth as any;

export function initializeApp() { return app; }
export function getFirestore() { return db; }
export function getAuth() { return auth; }

async function seedRealFirestoreIfEmpty() {
  if (IS_MOCK || !realDb) return;
  try {
    // Check and seed admins collection with default admin if empty
    const adminCol = realCollection(realDb, 'admins');
    const adminSnap = await realGetDocs(realQuery(adminCol));
    if (adminSnap.empty) {
      const adminBatch = realWriteBatch(realDb);
      const adminDoc = realDoc(realDb, 'admins', 'admin-user-id');
      adminBatch.set(adminDoc, {
        name: "Admin Leader",
        email: "admin@sprintdesk.io",
        designation: "Lead Administrator",
        createdAt: realServerTimestamp()
      });
      await adminBatch.commit();
      console.log("Admins collection seeded successfully with default admin.");
    }

    const devCol = realCollection(realDb, 'developers');
    const snap = await realGetDocs(realQuery(devCol));
    if (!snap.empty) {
      return; 
    }

    console.log("Empty real Firestore detected. Seeding starting...");
    
    // Set up default admin user doc or credentials
    const developerBatch = realWriteBatch(realDb);
    for (const dev of SEED_DEVELOPERS) {
      const devDoc = realDoc(realDb, 'developers', dev.id);
      developerBatch.set(devDoc, dev);
    }
    await developerBatch.commit();
    console.log("Developers collection seeded successfully on production database.");

    // Seed Projects and sub-collections 
    for (const proj of SEED_PROJECTS) {
      const projDoc = realDoc(realDb, 'projects', proj.id);
      const { id, ...projData } = proj;
      await realUpdateDoc(projDoc, projData); 

      // Seed phases subcollection
      const phaseKey = `projects/${proj.id}/phases`;
      const phases = SEED_PHASES[phaseKey] || [];
      for (const ph of phases) {
        const phDoc = realDoc(realDb, `projects/${proj.id}/phases`, ph.id);
        const { id: phId, ...phData } = ph;
        await realUpdateDoc(phDoc, phData);
      }

      // Seed issues subcollection
      const issueKey = `projects/${proj.id}/issues`;
      const issues = SEED_ISSUES[issueKey] || [];
      for (const iss of issues) {
        const issDoc = realDoc(realDb, `projects/${proj.id}/issues`, iss.id);
        const { id: issId, ...issData } = iss;
        await realUpdateDoc(issDoc, issData);
      }
    }

    // Seed Daily Progress logs
    for (const log of SEED_DAILY_LOGS) {
      const logDoc = realDoc(realDb, 'dailyProgress', log.id);
      const { id, ...logData } = log;
      await realUpdateDoc(logDoc, logData);
    }

    console.log("Real Firestore database successfully pre-loaded with all SprintDesk schemas!");
  } catch (error) {
    console.warn("Could not auto-seed real database. This is common if your database security rules are currently denying write access:", error);
  }
}

export function onAuthStateChanged(authInstance: any, callback: (user: any) => void) {
  if (IS_MOCK) {
    return auth.onAuthStateChanged(callback);
  } else {
    return realOnAuthStateChanged(authInstance, (user) => {
      if (user) {
        seedRealFirestoreIfEmpty();
      }
      callback(user);
    });
  }
}

export function signInWithEmailAndPassword(authInstance: any, email: string, password: string) {
  if (IS_MOCK) {
    return auth.signInWithEmailAndPassword(email);
  } else {
    return realSignInWithEmailAndPassword(authInstance, email, password);
  }
}

export function createUserWithEmailAndPassword(authInstance: any, email: string, password: string) {
  if (IS_MOCK) {
    return auth.createUserWithEmailAndPassword(email);
  } else {
    return realCreateUserWithEmailAndPassword(authInstance, email, password);
  }
}

export function signInWithPopup(authInstance: any, provider: any) {
  if (IS_MOCK) {
    return auth.signInWithEmailAndPassword("admin@sprintdesk.io");
  } else {
    return realSignInWithPopup(authInstance, provider);
  }
}

export const GoogleAuthProvider = IS_MOCK ? class GoogleAuthProvider {} : realGoogleAuthProvider;

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

export function doc(parent: any, ...segments: string[]) {
  if (IS_MOCK) {
    let fullPath = '';
    if (parent instanceof CollectionRef) {
      fullPath = parent.path;
    } else if (parent instanceof DocRef) {
      fullPath = parent.path + '/' + parent.id;
    }
    
    const allSegments = [...segments];
    if (fullPath) {
      allSegments.unshift(fullPath);
    }
    
    const joined = allSegments.filter(Boolean).join('/');
    const parts = joined.split('/');
    
    const isOdd = parts.length % 2 === 1;
    let collectionPath = '';
    let id = '';
    
    if (isOdd) {
      collectionPath = parts.join('/');
      id = Math.random().toString(36).substr(2, 9);
    } else {
      id = parts.pop() || '';
      collectionPath = parts.join('/');
    }
    
    return new DocRef(null, collectionPath, id);
  } else {
    return realDoc(parent, ...segments);
  }
}

export function collection(dbInstance: any, path: string, ...segments: string[]) {
  if (IS_MOCK) {
    const parts = [path, ...segments].filter(Boolean);
    return new CollectionRef(null, parts.join('/'));
  } else {
    return realCollection(dbInstance, path, ...segments);
  }
}

export function query(colRef: any, ...constraints: any[]) {
  if (IS_MOCK) {
    return new Query(colRef, constraints);
  } else {
    return realQuery(colRef, ...constraints);
  }
}

export function where(field: string, op: any, value: any) {
  if (IS_MOCK) {
    return { type: 'where', field, op, value };
  } else {
    return realWhere(field, op, value);
  }
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
  if (IS_MOCK) {
    return { type: 'orderBy', field, direction };
  } else {
    return realOrderBy(field, direction);
  }
}

export function serverTimestamp() {
  if (IS_MOCK) {
    return new Date().toISOString() as any;
  } else {
    return realServerTimestamp();
  }
}

export function getDoc(docRef: any) {
  if (IS_MOCK) {
    const collectionKey = docRef.path;
    const list = JSON.parse(localStorage.getItem(collectionKey) || '[]');
    const item = list.find((x: any) => x.id === docRef.id);
    return Promise.resolve({
      id: docRef.id,
      exists: () => !!item,
      data: () => item
    });
  } else {
    return realGetDoc(docRef);
  }
}

export function getDocFromServer(docRef: any) {
  if (IS_MOCK) {
    return getDoc(docRef);
  } else {
    return realGetDocFromServer(docRef);
  }
}

export function getDocs(q: any) {
  if (IS_MOCK) {
    let path = '';
    let constraints: any[] = [];
    
    if (q instanceof CollectionRef) {
      path = q.path;
    } else if (q instanceof Query) {
      path = q.collectionRef.path;
      constraints = q.constraints;
    }
    
    let list = JSON.parse(localStorage.getItem(path) || '[]');
    
    // Apply where constraints
    constraints.forEach(c => {
      if (c && c.type === 'where') {
        list = list.filter((item: any) => {
          const itemVal = item[c.field];
          if (c.op === '==') return String(itemVal).toLowerCase() === String(c.value).toLowerCase();
          if (c.op === 'in') return Array.isArray(c.value) && c.value.includes(itemVal);
          return true;
        });
      }
    });
    
    // Apply orderBy constraints
    constraints.forEach(c => {
      if (c && c.type === 'orderBy') {
        list.sort((a: any, b: any) => {
          const aVal = a[c.field];
          const bVal = b[c.field];
          if (aVal === undefined && bVal === undefined) return 0;
          if (aVal === undefined) return 1;
          if (bVal === undefined) return -1;
          
          let cmp = 0;
          if (typeof aVal === 'string' && typeof bVal === 'string') {
            cmp = aVal.localeCompare(bVal);
          } else {
            cmp = (aVal < bVal) ? -1 : (aVal > bVal) ? 1 : 0;
          }
          return c.direction === 'desc' ? -cmp : cmp;
        });
      }
    });
    
    const docSnaps = list.map((item: any) => {
      return {
        id: item.id,
        exists: () => true,
        data: () => item
      };
    });
    
    return Promise.resolve({
      empty: docSnaps.length === 0,
      docs: docSnaps
    });
  } else {
    return realGetDocs(q);
  }
}

export function addDoc(colRef: any, data: any) {
  if (IS_MOCK) {
    const collectionKey = colRef.path;
    const list = JSON.parse(localStorage.getItem(collectionKey) || '[]');
    const newId = Math.random().toString(36).substr(2, 9);
    const newItem = { id: newId, ...data };
    list.push(newItem);
    localStorage.setItem(collectionKey, JSON.stringify(list));
    return Promise.resolve({ id: newId });
  } else {
    return realAddDoc(colRef, data);
  }
}

export function updateDoc(docRef: any, data: any) {
  if (IS_MOCK) {
    const collectionKey = docRef.path;
    const list = JSON.parse(localStorage.getItem(collectionKey) || '[]');
    const idx = list.findIndex((item: any) => item.id === docRef.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data };
      localStorage.setItem(collectionKey, JSON.stringify(list));
    }
    return Promise.resolve();
  } else {
    return realUpdateDoc(docRef, data);
  }
}

export function deleteDoc(docRef: any) {
  if (IS_MOCK) {
    const collectionKey = docRef.path;
    const list = JSON.parse(localStorage.getItem(collectionKey) || '[]');
    const filtered = list.filter((item: any) => item.id !== docRef.id);
    localStorage.setItem(collectionKey, JSON.stringify(filtered));
    return Promise.resolve();
  } else {
    return realDeleteDoc(docRef);
  }
}

export function writeBatch(dbInstance: any) {
  if (IS_MOCK) {
    const operations: Array<() => void> = [];
    return {
      set(docRef: any, data: any) {
        operations.push(() => {
          const collectionKey = docRef.path;
          const list = JSON.parse(localStorage.getItem(collectionKey) || '[]');
          const existingIdx = list.findIndex((x: any) => x.id === docRef.id);
          const newItem = { id: docRef.id, ...data };
          if (existingIdx !== -1) {
            list[existingIdx] = newItem;
          } else {
            list.push(newItem);
          }
          localStorage.setItem(collectionKey, JSON.stringify(list));
        });
      },
      update(docRef: any, data: any) {
        operations.push(() => {
          const collectionKey = docRef.path;
          const list = JSON.parse(localStorage.getItem(collectionKey) || '[]');
          const idx = list.findIndex((item: any) => item.id === docRef.id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...data };
            localStorage.setItem(collectionKey, JSON.stringify(list));
          }
        });
      },
      delete(docRef: any) {
        operations.push(() => {
          const collectionKey = docRef.path;
          const list = JSON.parse(localStorage.getItem(collectionKey) || '[]');
          const filtered = list.filter((item: any) => item.id !== docRef.id);
          localStorage.setItem(collectionKey, JSON.stringify(filtered));
        });
      },
      async commit() {
        operations.forEach(op => op());
        return Promise.resolve();
      }
    };
  } else {
    return realWriteBatch(dbInstance);
  }
}

// Global handle errors helper
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
