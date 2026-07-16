import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth } from '@/src/lib/firebase';
import { developerService } from '@/src/services/developerService';
import { adminService } from '@/src/services/adminService';
import { leaderService } from '@/src/services/leaderService';
import { motion } from 'motion/react';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';

export function Login({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [resetKey, setResetKey] = useState('');
  const [showResetKey, setShowResetKey] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      await (auth as any).resetPassword(email, password, resetKey);
      setSuccessMessage('Password reset successfully! You can now log in with your new password.');
      setIsForgotMode(false);
      setPassword('');
      setResetKey('');
    } catch (err: any) {
      console.error('Reset Password Error:', err);
      setError(err.message || 'Failed to reset password. Please verify your details.');
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
            {isForgotMode ? 'Reset Password' : (isRegistering ? 'Sign Up' : 'Sign In')}
          </h1>
          <p className="text-slate-500 mt-2 text-center text-sm font-medium">
            {isForgotMode
              ? 'Reset your password using the Master Reset Key'
              : (isRegistering
                  ? 'Create a secure password to activate your account'
                  : 'Sign in to access your dashboard or developer workspace')}
          </p>
        </div>

        {isForgotMode ? (
          <form onSubmit={handleResetPassword} className="space-y-6">
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
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Master Reset Key</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showResetKey ? "text" : "password"}
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-semibold"
                  placeholder="Enter system reset key"
                  value={resetKey}
                  onChange={(e) => setResetKey(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowResetKey(!showResetKey)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showResetKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">New Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-semibold tracking-widest"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
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

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-emerald-600 text-xs font-bold bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div>
                  SUCCESS
                </div>
                <p className="pl-3.5 font-medium text-slate-600 leading-relaxed">{successMessage}</p>
              </motion.div>
            )}

            <div className="space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-slate-900 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsForgotMode(false);
                  setError('');
                  setSuccessMessage('');
                }}
                className="w-full py-2 text-indigo-600 hover:text-indigo-800 transition-colors text-[10px] font-black uppercase tracking-widest text-center"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        ) : (
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
              <div className="flex justify-between items-center pl-1 pr-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Password</label>
                {!isRegistering && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotMode(true);
                      setError('');
                      setSuccessMessage('');
                    }}
                    className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-wider transition-colors"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-semibold tracking-widest"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
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

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-emerald-600 text-xs font-bold bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div>
                  SUCCESS
                </div>
                <p className="pl-3.5 font-medium text-slate-600 leading-relaxed">{successMessage}</p>
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
                  : 'Set up Password'}
              </button>


            </div>
          </form>
        )}

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

