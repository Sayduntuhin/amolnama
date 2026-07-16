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
const IS_MOCK = true;
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

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

// Seeds are handled on the server-side database.json. No client-side initialization required.

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
    setTimeout(() => callback(this.currentUser), 0);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notify() {
    const user = this.currentUser;
    this.listeners.forEach(l => l(user));
  }

  async signInWithEmailAndPassword(email: string, password?: string) {
    const response = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Authentication failed");
    }
    
    const res = await response.json();
    localStorage.setItem('sprintdesk_session_token', res.token);
    localStorage.setItem('sprintdesk_curr_user', JSON.stringify(res.user));
    this.notify();
    return { user: res.user };
  }

  async createUserWithEmailAndPassword(email: string, password?: string) {
    const response = await fetch(API_BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Registration failed");
    }
    
    const res = await response.json();
    localStorage.setItem('sprintdesk_session_token', res.token);
    localStorage.setItem('sprintdesk_curr_user', JSON.stringify(res.user));
    this.notify();
    return { user: res.user };
  }

  async sendOtp(email: string) {
    const response = await fetch(API_BASE + '/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Failed to send verification OTP");
    }

    return await response.json();
  }

  async resetPassword(email: string, newPassword?: string, resetKey?: string) {
    const response = await fetch(API_BASE + '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: newPassword, resetKey })
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Password reset failed");
    }
    
    return await response.json();
  }

  signOut() {
    localStorage.removeItem('sprintdesk_curr_user');
    localStorage.removeItem('sprintdesk_session_token');
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

export const app = { options: { projectId: "local-custom-db" } };
export const db = { app } as any;
export const auth = new MockAuth() as any;

export function initializeApp() { return app; }
export function getFirestore() { return db; }
export function getAuth() { return auth; }

export function onAuthStateChanged(authInstance: any, callback: (user: any) => void) {
  return auth.onAuthStateChanged(callback);
}

export function signInWithEmailAndPassword(authInstance: any, email: string, password?: string) {
  return auth.signInWithEmailAndPassword(email, password);
}

export function createUserWithEmailAndPassword(authInstance: any, email: string, password?: string) {
  return auth.createUserWithEmailAndPassword(email, password);
}

export function signInWithPopup(authInstance: any, provider: any) {
  return auth.signInWithEmailAndPassword("admin@sprintdesk.io", "admin123");
}

export class GoogleAuthProvider {}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

export function doc(parent: any, ...segments: string[]) {
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
}

export function collection(dbInstance: any, path: string, ...segments: string[]) {
  const parts = [path, ...segments].filter(Boolean);
  return new CollectionRef(null, parts.join('/'));
}

export function query(colRef: any, ...constraints: any[]) {
  return new Query(colRef, constraints);
}

export function where(field: string, op: any, value: any) {
  return { type: 'where', field, op, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function serverTimestamp() {
  return new Date().toISOString() as any;
}

const queryCache = new Map<string, any>();
const docCache = new Map<string, any>();

function clearCache(path: string) {
  const normalizedPath = path.replace(/\/$/, '');
  
  // Clear getDocs query cache
  for (const key of queryCache.keys()) {
    try {
      const parsed = JSON.parse(key);
      const cachedPath = (parsed.path || '').replace(/\/$/, '');
      if (
        cachedPath === normalizedPath || 
        cachedPath.startsWith(normalizedPath + '/') || 
        normalizedPath.startsWith(cachedPath + '/')
      ) {
        queryCache.delete(key);
      }
    } catch (e) {
      queryCache.delete(key);
    }
  }

  // Clear getDoc cache
  for (const key of docCache.keys()) {
    if (
      key === normalizedPath || 
      key.startsWith(normalizedPath + '/') || 
      normalizedPath.startsWith(key + '/')
    ) {
      docCache.delete(key);
    }
  }
}

export async function getDoc(docRef: any) {
  const cacheKey = `${docRef.path}/${docRef.id}`;
  if (docCache.has(cacheKey)) {
    return docCache.get(cacheKey);
  }

  const token = localStorage.getItem('sprintdesk_session_token') || '';
  const response = await fetch(API_BASE + '/api/db/action', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'getDoc', path: docRef.path, id: docRef.id })
  });
  const res = await response.json();
  
  const result = {
    id: docRef.id,
    exists: () => res.exists,
    data: () => res.data
  };

  docCache.set(cacheKey, result);
  return result;
}

export async function getDocFromServer(docRef: any) {
  return getDoc(docRef);
}

export async function getDocs(q: any) {
  let path = '';
  let constraints: any[] = [];
  
  if (q instanceof CollectionRef) {
    path = q.path;
  } else if (q instanceof Query) {
    path = q.collectionRef.path;
    constraints = q.constraints;
  }
  
  const cacheKey = JSON.stringify({ path, constraints });
  if (queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey);
  }

  const token = localStorage.getItem('sprintdesk_session_token') || '';
  const response = await fetch(API_BASE + '/api/db/action', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'getDocs', path, constraints })
  });
  const res = await response.json();
  
  const docSnaps = res.docs.map((doc: any) => {
    return {
      id: doc.id,
      exists: () => true,
      data: () => doc.data
    };
  });
  
  const result = {
    empty: docSnaps.length === 0,
    docs: docSnaps
  };

  queryCache.set(cacheKey, result);
  return result;
}

export async function addDoc(colRef: any, data: any) {
  clearCache(colRef.path);
  const token = localStorage.getItem('sprintdesk_session_token') || '';
  const response = await fetch(API_BASE + '/api/db/action', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'addDoc', path: colRef.path, data })
  });
  const res = await response.json();
  return { id: res.id };
}

export async function updateDoc(docRef: any, data: any) {
  clearCache(docRef.path);
  const token = localStorage.getItem('sprintdesk_session_token') || '';
  const response = await fetch(API_BASE + '/api/db/action', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'updateDoc', path: docRef.path, id: docRef.id, data })
  });
  await response.json();
  return Promise.resolve();
}

export async function deleteDoc(docRef: any) {
  clearCache(docRef.path);
  const token = localStorage.getItem('sprintdesk_session_token') || '';
  const response = await fetch(API_BASE + '/api/db/action', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'deleteDoc', path: docRef.path, id: docRef.id })
  });
  await response.json();
  return Promise.resolve();
}

export function writeBatch(dbInstance: any) {
  const operations: any[] = [];
  return {
    set(docRef: any, data: any) {
      operations.push({ type: 'set', path: docRef.path, id: docRef.id, data });
    },
    update(docRef: any, data: any) {
      operations.push({ type: 'update', path: docRef.path, id: docRef.id, data });
    },
    delete(docRef: any) {
      operations.push({ type: 'delete', path: docRef.path, id: docRef.id });
    },
    async commit() {
      const pathsToClear = new Set<string>();
      operations.forEach(op => {
        if (op.path) {
          pathsToClear.add(op.path);
        }
      });
      pathsToClear.forEach(p => clearCache(p));

      const token = localStorage.getItem('sprintdesk_session_token') || '';
      const response = await fetch(API_BASE + '/api/db/action', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'writeBatch', operations })
      });
      await response.json();
      return Promise.resolve();
    }
  };
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

export async function runFirebaseImport(email?: string, password?: string) {
  // Initialize real firebase
  const realApp = realInitializeApp(firebaseConfig);
  const realDb = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)" 
    ? realGetFirestore(realApp, firebaseConfig.firestoreDatabaseId) 
    : realGetFirestore(realApp);
  const realAuth = realGetAuth(realApp);
  
  if (email && password) {
    console.log("Logging in via Email/Password to Firebase...");
    await realSignInWithEmailAndPassword(realAuth, email, password);
  } else {
    console.log("Logging in via Google Popup to Firebase...");
    const provider = new realGoogleAuthProvider();
    await realSignInWithPopup(realAuth, provider);
  }
  
  console.log("Logged in to Firebase successfully!");
  
  // Download data
  const database = {
    admins: [],
    leaders: [],
    developers: [],
    projects: [],
    dailyProgress: []
  };
  
  const collections = ['admins', 'leaders', 'developers', 'projects', 'dailyProgress'];
  for (const colName of collections) {
    const snap = await realGetDocs(realCollection(realDb, colName));
    snap.forEach((doc) => {
      database[colName].push({ id: doc.id, ...doc.data() });
    });
  }
  
  // Subcollections (phases and issues)
  for (const project of database.projects) {
    const projId = project.id;
    
    // Phases
    const phaseSnap = await realGetDocs(realCollection(realDb, `projects/${projId}/phases`));
    const phasesList = [];
    phaseSnap.forEach((doc) => {
      phasesList.push({ id: doc.id, ...doc.data() });
    });
    if (phasesList.length > 0) {
      database[`projects/${projId}/phases`] = phasesList;
    }
    
    // Issues
    const issueSnap = await realGetDocs(realCollection(realDb, `projects/${projId}/issues`));
    const issuesList = [];
    issueSnap.forEach((doc) => {
      issuesList.push({ id: doc.id, ...doc.data() });
    });
    if (issuesList.length > 0) {
      database[`projects/${projId}/issues`] = issuesList;
    }
  }
  
  // Send payload to server
  const response = await fetch(API_BASE + '/api/db/import_payload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(database)
  });
  
  if (!response.ok) {
    throw new Error("Failed to save imported data on the server");
  }
}

