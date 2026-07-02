import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider 
} from 'firebase/auth';
import { auth } from '@/src/lib/firebase';
import { developerService } from '@/src/services/developerService';
import { adminService } from '@/src/services/adminService';
import { leaderService } from '@/src/services/leaderService';
import { motion } from 'motion/react';
import { Lock, Mail } from 'lucide-react';

export function Login({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Google Auth Error:', err.code, err.message);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Google Login is not enabled in Firebase Console. Authentication > Sign-in method > Enable Google.');
      } else {
        setError('Failed to establish Google connection: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isRegistering) {
        const emailLower = email.toLowerCase().trim();
        const isSuperAdminEmail = emailLower === 'exceptionhubjvai@gmail.com';
        const isAdminSeed = emailLower === 'sayduntuhin.jvai@gmail.com';

        // 1. Create the Auth account first so the session becomes authenticated
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const loggedInUser = userCred.user;

        // Skip DB check for bootstrap emails to avoid bootstrap lock
        if (isSuperAdminEmail || isAdminSeed) {
          setLoading(false);
          return;
        }

        // 2. Validate that the email exists in the official developer, leader, or admin database while authenticated
        try {
          const dev = await developerService.getDeveloperByEmail(emailLower);
          const adminDoc = await adminService.getAdminByEmail(emailLower);
          
          let leaderDoc = null;
          try {
            leaderDoc = await leaderService.getLeaderByEmail(emailLower);
          } catch (e) {
            console.warn("Could not check leader role on signup check:", e);
          }

          if (!dev && !adminDoc && !leaderDoc) {
            setError('Access Denied: Your email address is not registered in the Developer, Leader, or Admin database. A Super Administrator or Administrator must add your profile before you can set up a password.');
            try {
              // Delete the unauthorized auth record to prevent orphaned records in Auth
              await loggedInUser.delete();
            } catch (delError) {
              console.warn("Could not delete unregistered auth user:", delError);
              await auth.signOut();
            }
            setLoading(false);
            return;
          }
        } catch (eCheck) {
          console.warn("Could not check roster on signup:", eCheck);
          setError('Verification failed: Unable to connect to the verification service. Please check your credentials or network.');
          await auth.signOut();
          setLoading(false);
          return;
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error('Auth Error:', err.code, err.message);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password login is not enabled in Firebase Auth settings.');
      } else if (isRegistering) {
        if (err.code === 'auth/email-already-in-use') {
          setError('This email address is already registered.');
        } else if (err.code === 'auth/weak-password') {
          setError('Your password must be at least 6 characters long.');
        } else if (err.code === 'auth/invalid-email') {
          setError('Please enter a valid email address.');
        } else {
          setError('Failed to create account: ' + (err.message || 'Unknown error'));
        }
      } else {
        setError('Incorrect email address or password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Abstract Background Accents */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] -mr-48 -mt-48"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-900/40 rounded-full blur-[120px] -ml-48 -mb-48"></div>
 
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl border border-white/10 p-10 relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="mb-8 select-none">
            <img src="logo.svg" alt="JVAI Logo" className="h-14 w-auto" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {isRegistering ? 'Sign Up' : 'Sign In'}
          </h1>
          <p className="text-slate-500 mt-2 text-center text-sm font-medium">
            {isRegistering 
              ? 'Create a secure password to activate your account' 
              : 'Sign in to access your dashboard or developer workspace'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-semibold"
                placeholder="developer@sprintdesk.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-semibold tracking-widest"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-rose-600 text-xs font-bold bg-rose-50 p-4 rounded-xl border border-rose-100 flex flex-col gap-1"
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-600"></div>
                ERROR DETECTED
              </div>
              <p className="pl-3.5 font-medium text-slate-600 leading-relaxed">{error}</p>
            </motion.div>
          )}

          <div className="space-y-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-slate-900 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
            >
              {loading 
                ? 'Processing...' 
                : (isRegistering ? 'Register Account' : 'Sign In')}
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
                <span className="bg-white px-4 text-slate-400">Or Continue With</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold py-4 rounded-2xl transition-all border border-slate-200 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>

            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError('');
              }}
              className="w-full py-2 text-indigo-600 hover:text-indigo-800 transition-colors text-[10px] font-black uppercase tracking-widest"
            >
              {isRegistering 
                ? 'Already have an account? Sign In' 
                : 'Sign Up / Set up Password'}
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left space-y-2">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">How to Log In as a Developer or Admin:</p>
          <ul className="text-[10px] text-slate-500 font-medium leading-relaxed list-decimal list-inside space-y-1">
            <li>A Super Administrator must first add your email to the <strong>Developers</strong> or <strong>Admins</strong> database in the panel.</li>
            <li>Once added, click <strong>"Sign Up / Set up Password"</strong> above.</li>
            <li>Enter your registered email address and create a password to set up your account.</li>
            <li>Once completed, you can use those credentials to log in!</li>
          </ul>
        </div>

        <div className="mt-8 text-center border-t border-slate-50 pt-6">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
            System v2.4.0 • Secured Core
          </p>
        </div>
      </motion.div>
    </div>
  );
}

