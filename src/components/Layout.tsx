import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  ClipboardList, 
  Settings, 
  LogOut,
  ChevronRight,
  Search,
  Menu,
  Shield,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '@/src/lib/firebase';
import { cn } from '@/src/lib/utils';
import { AIAssistant } from './AIAssistant';

interface LayoutProps {
  children: React.ReactNode;
  isDeveloperMode: boolean;
  setIsDeveloperMode: (val: boolean) => void;
  currentDeveloper: any | null;
  currentLeader?: any | null;
}

export function Layout({ children, isDeveloperMode, setIsDeveloperMode, currentDeveloper, currentLeader }: LayoutProps) {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isSidebarClosed, setIsSidebarClosed] = React.useState(false);

  const email = auth.currentUser?.email;
  const isSuper = email && (email.toLowerCase().trim() === 'exceptionhubjvai@gmail.com');

  const menuItems = isDeveloperMode 
    ? [
        { icon: LayoutDashboard, label: 'Workspace', path: '/workspace' },
      ]
    : [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: Briefcase, label: 'Projects', path: '/projects' },
        { icon: Users, label: 'Developers', path: '/developers' },
        { icon: ClipboardList, label: 'Reports', path: '/reports' },
        ...((!isDeveloperMode && !currentLeader) ? [{ icon: UserCheck, label: 'Leaders', path: '/leaders' }] : []),
        ...(isSuper ? [{ icon: Shield, label: 'Admins', path: '/admins' }] : []),
      ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-hidden">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Navigation */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-all duration-300 z-50 shrink-0",
        // Mobile classes
        isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        // Desktop classes
        "lg:translate-x-0 lg:relative",
        isSidebarClosed 
          ? "lg:w-0 lg:-translate-x-64 lg:opacity-0 lg:pointer-events-none lg:border-r-0" 
          : "lg:w-64 lg:opacity-100"
      )}>
        <div className="px-6 py-5 flex items-center justify-between border-b border-slate-800/60 mb-4 overflow-hidden">
          <Link to="/" className="flex items-center select-none shrink-0">
            <img src="logo-white.svg" alt="JVAI Logo" className="h-9 w-auto" />
          </Link>
          <button 
            onClick={() => {
              setIsSidebarOpen(false);
              setIsSidebarClosed(true);
            }}
            className="p-1 hover:bg-slate-800/60 rounded-md transition-colors text-slate-400 hover:text-white cursor-pointer"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group text-sm font-medium",
                  isActive 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                )} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-800 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-black border shrink-0 uppercase",
              isDeveloperMode 
                ? "bg-slate-700 border-slate-600 text-slate-100" 
                : (isSuper ? "bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-600/20" : "bg-slate-700 border-slate-600 text-slate-100")
            )}>
              {isDeveloperMode ? (currentDeveloper?.name?.[0] || 'D') : (currentLeader ? (currentLeader?.name?.[0] || 'L') : (isSuper ? 'SA' : 'AD'))}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate">
                {isDeveloperMode ? (currentDeveloper?.name || 'Developer') : (currentLeader ? currentLeader.name : (isSuper ? 'Super Admin' : 'Admin Leader'))}
              </p>
              <p className="text-[10px] text-slate-500 truncate font-medium flex items-center gap-1.5">
                {isSuper && !isDeveloperMode && <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0"></span>}
                {isDeveloperMode ? (currentDeveloper?.designation || 'Engineer') : (currentLeader ? currentLeader.designation : (auth.currentUser?.email))}
              </p>
            </div>
          </div>
          
          <button
            onClick={() => auth.signOut()}
            className="flex items-center gap-3 px-3 py-2 w-full text-slate-400 hover:bg-slate-800 hover:text-rose-400 rounded-md transition-all duration-200 text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              onClick={() => {
                setIsSidebarOpen(true);
                setIsSidebarClosed(false);
              }}
              className={cn(
                "p-2 hover:bg-slate-100 rounded-lg text-slate-650 text-slate-600 transition-colors cursor-pointer",
                !isSidebarClosed && "lg:hidden"
              )}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg md:text-xl font-bold text-slate-800 truncate max-w-[150px] md:max-w-none">
              {menuItems.find(i => i.path === location.pathname)?.label || 'Admin Panel'}
            </h2>
            <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
            <p className="text-[10px] md:text-sm text-slate-500 font-medium hidden sm:block">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative group hidden lg:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search projects..." 
                className="bg-slate-100 border-none rounded-xl py-1.5 pl-10 pr-4 text-sm w-48 xl:w-64 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
              />
            </div>
            <button className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-white hover:shadow-sm transition-all">
              <Users className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />
            </button>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="p-4 md:p-8 max-w-[1600px] mx-auto"
          >
            {children}
          </motion.div>
        </div>
      </main>
      <AIAssistant />
    </div>
  );
}
