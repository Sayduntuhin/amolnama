/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { Layout } from '@/src/components/Layout';
import { Login } from '@/src/components/Login';
import { Dashboard } from '@/src/components/Dashboard';
import { ProjectList } from '@/src/components/ProjectList';
import { ProjectDetail } from '@/src/components/ProjectDetail';
import { DeveloperList } from '@/src/components/DeveloperList';
import { Reports } from '@/src/components/Reports';
import { DeveloperWorkspace } from '@/src/components/DeveloperWorkspace';
import { developerService } from '@/src/services/developerService';
import { adminService } from '@/src/services/adminService';
import { leaderService } from '@/src/services/leaderService';
import { Developer, Leader } from '@/src/types';
import { SnackbarProvider } from '@/src/components/Snackbar';
import { AdminList } from '@/src/components/AdminList';
import { LeaderList } from '@/src/components/LeaderList';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentDeveloper, setCurrentDeveloper] = useState<Developer | null>(null);
  const [currentLeader, setCurrentLeader] = useState<Leader | null>(null);
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [unauthorizedMessage, setUnauthorizedMessage] = useState<string | null>(null);

  useEffect(() => {
    // Critical Constraint: Test Firestore connection on boot
    const testConnection = async () => {
      try {
        console.log("System diagnostics: testing Firestore link...", db.app.options.projectId);
        console.log("Database ID:", (db as any)._databaseId?.database || 'default');
        const docRef = doc(db, 'test', 'connection');
        await getDocFromServer(docRef);
        console.log("System diagnostics: Firestore link stable.");
      } catch (error) {
        console.warn("System diagnostics warning: Firestore link restricted or delayed.", error);
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user?.email) {
        const userEmailLower = user.email.toLowerCase().trim();
        const isSuperAdminEmail = userEmailLower === 'exceptionhubjvai@gmail.com';
        const isAdminSeed = userEmailLower === 'sayduntuhin.jvai@gmail.com';

        try {
          // 1. Check if Super Admin
          if (isSuperAdminEmail) {
            setUser(user);
            setCurrentDeveloper(null);
            setCurrentLeader(null);
            setIsDeveloperMode(false);
            setUnauthorizedMessage(null);
            setLoading(false);
            return;
          }

          // 2. Check if Developer
          const dev = await developerService.getDeveloperByEmail(user.email);
          if (dev) {
            setUser(user);
            setCurrentDeveloper(dev);
            setCurrentLeader(null);
            setIsDeveloperMode(true);
            setUnauthorizedMessage(null);
            setLoading(false);
            return;
          }

          // 3. Check if Leader
          let leaderDoc = null;
          try {
            leaderDoc = await leaderService.getLeaderByEmail(user.email);
          } catch (e) {
            console.warn("Failed to check leader role status on login:", e);
          }
          if (leaderDoc) {
            // Update leader UID mapping in database asynchronously
            try {
              leaderService.updateLeaderUid(leaderDoc.id, user.email, user.uid || '');
            } catch (uidErr) {
              console.warn("Failed to update leader UID:", uidErr);
            }

            setUser(user);
            setCurrentDeveloper(null);
            setCurrentLeader(leaderDoc);
            setIsDeveloperMode(false);
            setUnauthorizedMessage(null);
            setLoading(false);
            return;
          }

          // 4. Check if Admin (seeded or registered in collection)
          const adminDoc = await adminService.getAdminByEmail(user.email);
          if (isAdminSeed || adminDoc) {
            // Update admin UID mapping in database asynchronously
            adminService.updateAdminUid(adminDoc?.id || '', user.email, user.uid);

            setUser(user);
            setCurrentDeveloper(null);
            setCurrentLeader(null);
            setIsDeveloperMode(false);
            setUnauthorizedMessage(null);
            setLoading(false);
            return;
          }

          // 5. Unauthorized
          setUnauthorizedMessage("Access Denied: Your email address is not registered in the system as an Administrator, Leader, or Developer.");
          setCurrentDeveloper(null);
          setCurrentLeader(null);
          setIsDeveloperMode(false);
          await auth.signOut();
          setUser(null);
          setLoading(false);
        } catch (e) {
          console.warn("Could not retrieve profile on login:", e);
          if (isAdminSeed) {
            setUser(user);
            setCurrentDeveloper(null);
            setCurrentLeader(null);
            setIsDeveloperMode(false);
            setUnauthorizedMessage(null);
            setLoading(false);
          } else {
            setUnauthorizedMessage("Access Denied: Profile verification error. Please check your credentials or network.");
            setCurrentDeveloper(null);
            setCurrentLeader(null);
            setIsDeveloperMode(false);
            await auth.signOut();
            setUser(null);
            setLoading(false);
          }
        }
      } else {
        setUser(null);
        setCurrentDeveloper(null);
        setCurrentLeader(null);
        setIsDeveloperMode(false);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium animate-pulse">Initializing JVAI...</p>
        </div>
      </div>
    );
  }

  return (
    <SnackbarProvider>
      {!user ? (
        <Login initialError={unauthorizedMessage || undefined} />
      ) : (
        <HashRouter>
          <Layout 
            isDeveloperMode={isDeveloperMode} 
            setIsDeveloperMode={setIsDeveloperMode}
            currentDeveloper={currentDeveloper}
            currentLeader={currentLeader}
          >
            <Routes>
              {isDeveloperMode ? (
                <>
                  <Route path="/workspace" element={<DeveloperWorkspace />} />
                  <Route path="*" element={<Navigate to="/workspace" replace />} />
                </>
              ) : (
                <>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/projects" element={<ProjectList />} />
                  <Route path="/projects/:id" element={<ProjectDetail />} />
                  <Route path="/developers" element={<DeveloperList />} />
                  <Route path="/reports" element={<Reports />} />
                  {(!isDeveloperMode && !currentLeader) && (
                    <Route path="/leaders" element={<LeaderList />} />
                  )}
                  {user?.email?.toLowerCase().trim() === 'exceptionhubjvai@gmail.com' && (
                    <Route path="/admins" element={<AdminList />} />
                  )}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              )}
            </Routes>
          </Layout>
        </HashRouter>
      )}
    </SnackbarProvider>
  );
}
