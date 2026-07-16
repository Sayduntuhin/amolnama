import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Mail, Briefcase, TrendingUp, Award, LayoutGrid, BarChart3, Search, Settings, CheckCircle2, Clock, Wrench, X, User, Loader2, AlertCircle } from 'lucide-react';
import { developerService } from '@/src/services/developerService';
import { projectService } from '@/src/services/projectService';
import { progressService } from '@/src/services/progressService';
import { adminService } from '@/src/services/adminService';
import { auth } from '@/src/lib/firebase';
import { Developer, Project, PhaseTracking, DailyProgress, Issue } from '@/src/types';
import { cn, calculateDeveloperPerformanceScore } from '@/src/lib/utils';
import { useSnackbar } from '@/src/components/Snackbar';
import { motion, AnimatePresence } from 'motion/react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { DeveloperAnalytics } from './DeveloperAnalytics';
import { leaderService } from '@/src/services/leaderService';

export function DeveloperList() {
  const { showSuccess, showError } = useSnackbar();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [selectedAdminFilter, setSelectedAdminFilter] = useState<string>('All');
  const [leaders, setLeaders] = useState<any[]>([]);
  const [selectedLeaderFilter, setSelectedLeaderFilter] = useState<string>('All');
  const [currentLeader, setCurrentLeader] = useState<any | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [phases, setPhases] = useState<Record<string, PhaseTracking[]>>({});
  const [logs, setLogs] = useState<DailyProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMntModalOpen, setIsMntModalOpen] = useState(false);
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string | null>(null);
  const [editingDeveloper, setEditingDeveloper] = useState<Developer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [performanceData, setPerformanceData] = useState<Record<string, number>>({});
  const [performanceDetails, setPerformanceDetails] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterShift, setFilterShift] = useState<string>('');

  const selectedDeveloper = developers.find(d => d.id === selectedDeveloperId);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const email = auth.currentUser?.email;
      const isSuper = email && (email.toLowerCase().trim() === 'exceptionhubjvai@gmail.com');

      const [devs, projs, adminList, leadersList] = await Promise.all([
        developerService.getAllDevelopers(),
        projectService.getAllProjects(),
        adminService.getAllAdmins(),
        leaderService.getAllLeaders()
      ]);
      
      const safeDevs = devs || [];
      const safeProjs = projs || [];
      const safeAdmins = adminList || [];
      const rawLeaders = leadersList || [];

      // Determine if current user is a Leader
      const activeLeader = email ? rawLeaders.find(l => l.email.toLowerCase().trim() === email.toLowerCase().trim()) : null;
      setCurrentLeader(activeLeader);

      // Filter visible leaders in dropdown
      let filteredLeaders = [];
      if (isSuper) {
        filteredLeaders = rawLeaders;
      } else {
        filteredLeaders = rawLeaders.filter(l => l.creatorId === auth.currentUser?.uid);
      }
      setLeaders(filteredLeaders);

      setDevelopers(safeDevs);
      setAdmins(safeAdmins);
      setProjects(safeProjs);

      // Fetch analytics data
      const phasesMap: Record<string, PhaseTracking[]> = {};
      const allPhases = await Promise.all(safeProjs.map(p => progressService.getPhases(p.id)));
      safeProjs.forEach((p, i) => {
        phasesMap[p.id] = allPhases[i] || [];
      });
      setPhases(phasesMap);

      const allIssuesArr = await Promise.all(safeProjs.map(p => progressService.getIssues(p.id)));
      const flattenedIssues = allIssuesArr.flat().filter(Boolean) as Issue[];

      const flattenedPhases = Object.values(phasesMap).flat();
      calculatePerformance(safeDevs, flattenedPhases, flattenedIssues);
      
      const allLogs = await progressService.getAllDailyProgress();
      const devIdsForLogs = new Set(safeDevs.map(d => d.id));
      const projIdsForLogs = new Set(safeProjs.map(p => p.id));
      const filteredLogs = (allLogs || []).filter(l => l && devIdsForLogs.has(l.developerId) && (projIdsForLogs.has(l.projectId) || l.projectId === 'maintenance'));
      setLogs(filteredLogs);
    } catch (error) {
      console.error("DeveloperData load failure:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePerformance = (devs: Developer[], allPhases: PhaseTracking[], allIssues: Issue[]) => {
    try {
      const perf: Record<string, number> = {};
      const details: Record<string, any> = {};
      
      for (const dev of devs) {
        const perfResult = calculateDeveloperPerformanceScore(dev.id, allPhases, allIssues);
        perf[dev.id] = perfResult.score;
        details[dev.id] = perfResult;
      }
      setPerformanceData(perf);
      setPerformanceDetails(details);
    } catch (error) {
      console.error("Perf calculation failure:", error);
    }
  };

  const handleDeleteDeveloper = async (id: string) => {
    if (window.confirm('CRITICAL: Permanently remove this talent from the registry?')) {
      const previousDevelopers = [...developers];
      // Optimistically remove from local state immediately for instant feedback
      setDevelopers(prev => prev.filter(d => d.id !== id));
      showSuccess('Developer profile removed from roster.');

      try {
        console.log('Initiating developer removal:', id);
        await developerService.deleteDeveloper(id);
        console.log('Developer removed successfully');
      } catch (error: any) {
        console.error('Removal Failed:', error);
        // Rollback local state if delete failed
        setDevelopers(previousDevelopers);
        
        let displayError = error.message;
        try {
          const parsed = JSON.parse(error.message);
          displayError = parsed.error || error.message;
        } catch (e) { }
        showError('TEAM REGISTRY ERROR: ' + displayError);
      }
    }
  };

  const handleUpdateMaintenance = async (devId: string, mProjects: any[]) => {
    // Optimistic UI update
    const previousDevelopers = [...developers];
    setDevelopers(prev => prev.map(d => d.id === devId ? { ...d, maintenanceProjects: mProjects } : d));
    
    setIsSubmitting(true);
    try {
      await developerService.updateDeveloper(devId, { maintenanceProjects: mProjects });
      showSuccess('Talent maintenance registry updated successfully.');
    } catch (err) {
      console.error(err);
      // Rollback on error
      setDevelopers(previousDevelopers);
      showError('Failed to update maintenance registry. Reverting state.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSuperAdmin = auth.currentUser?.email?.toLowerCase().trim() === 'exceptionhubjvai@gmail.com';

  const adminFilteredDevelopers = React.useMemo(() => {
    if (currentLeader) {
      return developers.filter(d => d.ownerId === auth.currentUser?.uid);
    }

    if (isSuperAdmin) {
      let temp = developers;
      if (selectedAdminFilter !== 'All') {
        const superAdminUid = auth.currentUser?.uid;
        const selectedAdmin = admins.find(a => (a.uid || a.id) === selectedAdminFilter);
        let adminUid = selectedAdmin?.uid;
        if (selectedAdmin?.email?.toLowerCase()?.trim() === 'exceptionhubjvai@gmail.com') {
          adminUid = superAdminUid;
        }
        const targetOwnerId = adminUid || selectedAdmin?.id;
        
        const adminLeaders = leaders.filter(l => l.creatorId === targetOwnerId);
        const leaderUids = adminLeaders.map(l => l.uid).filter(Boolean);
        const leaderIds = adminLeaders.map(l => l.id);
        
        temp = temp.filter(d => d.ownerId === targetOwnerId || leaderUids.includes(d.ownerId) || leaderIds.includes(d.ownerId));
      }
      if (selectedLeaderFilter !== 'All') {
        const selectedLeader = leaders.find(l => (l.uid || l.id) === selectedLeaderFilter);
        if (selectedLeader) {
          const ownerIdToMatch = selectedLeader.uid || selectedLeader.id;
          temp = temp.filter(d => d.ownerId === ownerIdToMatch);
        }
      }
      return temp;
    }

    const adminUid = auth.currentUser?.uid;
    const adminLeaders = leaders.filter(l => l.creatorId === adminUid);
    const leaderUids = adminLeaders.map(l => l.uid).filter(Boolean);
    const leaderIds = adminLeaders.map(l => l.id);

    if (selectedLeaderFilter === 'All') {
      return developers.filter(d => d.ownerId === adminUid || leaderUids.includes(d.ownerId) || leaderIds.includes(d.ownerId));
    } else if (selectedLeaderFilter === 'Self') {
      return developers.filter(d => d.ownerId === adminUid);
    } else {
      const selectedLeader = leaders.find(l => (l.uid || l.id) === selectedLeaderFilter);
      if (selectedLeader) {
        const ownerIdToMatch = selectedLeader.uid || selectedLeader.id;
        return developers.filter(d => d.ownerId === ownerIdToMatch);
      }
      return [];
    }
  }, [developers, selectedAdminFilter, selectedLeaderFilter, isSuperAdmin, currentLeader, admins, leaders]);

  const visibleLeaders = React.useMemo(() => {
    if (!isSuperAdmin || selectedAdminFilter === 'All') {
      return leaders;
    }
    const selectedAdmin = admins.find(a => (a.uid || a.id) === selectedAdminFilter);
    if (!selectedAdmin) return [];
    
    const superAdminUid = auth.currentUser?.uid;
    let adminUid = selectedAdmin.uid;
    if (selectedAdmin.email?.toLowerCase()?.trim() === 'exceptionhubjvai@gmail.com') {
      adminUid = superAdminUid;
    }
    const targetOwnerId = adminUid || selectedAdmin.id;
    return leaders.filter(l => l.creatorId === targetOwnerId);
  }, [leaders, isSuperAdmin, selectedAdminFilter, admins]);

  useEffect(() => {
    if (isSuperAdmin && selectedAdminFilter !== 'All' && selectedLeaderFilter !== 'All') {
      const selectedAdmin = admins.find(a => (a.uid || a.id) === selectedAdminFilter);
      if (selectedAdmin) {
        const superAdminUid = auth.currentUser?.uid;
        let adminUid = selectedAdmin.uid;
        if (selectedAdmin.email?.toLowerCase()?.trim() === 'exceptionhubjvai@gmail.com') {
          adminUid = superAdminUid;
        }
        const targetOwnerId = adminUid || selectedAdmin.id;
        const belongsToSelectedAdmin = leaders.some(l => (l.uid || l.id) === selectedLeaderFilter && l.creatorId === targetOwnerId);
        if (!belongsToSelectedAdmin) {
          setSelectedLeaderFilter('All');
        }
      }
    }
  }, [selectedAdminFilter, isSuperAdmin, admins, leaders, selectedLeaderFilter]);

  const filteredDevelopers = adminFilteredDevelopers
    .filter(dev => 
      (dev.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dev.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dev.designation || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dev.employeeId || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter(dev => !filterShift || (dev.shift || 'Day') === filterShift);

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Engineering Team</h1>
          <p className="text-slate-500 text-sm font-medium">Coordinate talent and monitor delivery throughput across specializations.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {isSuperAdmin && (
            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full sm:w-auto shrink-0 font-sans">
              <select 
                value={selectedAdminFilter} 
                onChange={(e) => setSelectedAdminFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 px-3.5 py-1 outline-none border-none cursor-pointer w-full"
              >
                <option value="All">All Admins</option>
                {admins.map(admin => (
                  <option key={admin.id} value={admin.uid || admin.id}>{admin.name}</option>
                ))}
              </select>
            </div>
          )}
          {!currentLeader && (
            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full sm:w-auto shrink-0 font-sans">
              <select 
                value={selectedLeaderFilter} 
                onChange={(e) => setSelectedLeaderFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 px-3.5 py-1 outline-none border-none cursor-pointer w-full"
              >
                {!isSuperAdmin ? (
                  <>
                    <option value="All">All Leaders (Under Me)</option>
                    <option value="Self">Admin (Self Only)</option>
                  </>
                ) : (
                  <option value="All">All Leaders</option>
                )}
                {visibleLeaders.map(leader => (
                  <option key={leader.id} value={leader.uid || leader.id}>{leader.name}</option>
                ))}
              </select>
            </div>
          )}
          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search talent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            />
          </div>
          
          {/* Shift Filter Toggle */}
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-full sm:w-auto">
            <button 
              onClick={() => setFilterShift('')}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                filterShift === '' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-indigo-600"
              )}
            >
              All
            </button>
            <button 
              onClick={() => setFilterShift('Day')}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                filterShift === 'Day' ? "bg-amber-500 text-white shadow-lg shadow-amber-200" : "text-slate-400 hover:text-amber-500"
              )}
            >
              Day
            </button>
            <button 
              onClick={() => setFilterShift('Night')}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                filterShift === 'Night' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "text-slate-400 hover:text-indigo-600"
              )}
            >
              Night
            </button>
          </div>

          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-full sm:w-auto">
            <button 
              onClick={() => setActiveTab('list')}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'list' 
                  ? "bg-slate-900 text-white shadow-lg" 
                  : "text-slate-400 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Roster
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'analytics' 
                  ? "bg-slate-900 text-white shadow-lg" 
                  : "text-slate-400 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Insights
            </button>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-95 w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            <span>Onboard Talent</span>
          </button>
        </div>
      </div>

      {activeTab === 'analytics' ? (
        <DeveloperAnalytics 
          developers={developers} 
          projects={projects} 
          phases={phases}
          logs={logs}
        />
      ) : (
        <div className="space-y-6">
          <div className="bg-indigo-50 border border-indigo-100 rounded-[1.5rem] p-5">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[9px] font-black uppercase text-indigo-600 bg-white border border-indigo-200 px-2.5 py-0.5 rounded-lg tracking-wider">Access Protocol Guide</span>
              <p className="text-xs font-black text-indigo-950">How do Developers log in?</p>
            </div>
            <p className="text-[11px] text-indigo-700 leading-relaxed font-semibold">
              To let a developer access their custom portal, register their profile below with their correct <strong>email address</strong>. After registration, instructs the developer to go to the Login page, click <span className="underline">"Develop Team? Initialize Password"</span>, and enter that exact email address to create their own secure password key. Once registered, they are routed straight to their Developer Workspace!
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {[1, 2, 3].map(i => <div key={i} className="h-80 bg-slate-100 rounded-3xl animate-pulse border border-slate-200"></div>)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredDevelopers.map((dev) => {
              const allPhases = Object.values(phases).flat() as PhaseTracking[];
              const activeDeploymentCount = allPhases.filter(ph => 
                ph && ph.status === 'In Progress' && ph.developerIds?.includes(dev.id)
              ).length;
              const activeMaintenanceCount = dev.maintenanceProjects?.filter(m => m.status === 'WIP').length || 0;
              const totalActiveLoad = activeDeploymentCount + activeMaintenanceCount;
              
              const workloadColor = totalActiveLoad === 0 ? 'text-emerald-500 bg-emerald-50' : 
                                   totalActiveLoad >= 3 ? 'text-rose-500 bg-rose-50' : 
                                   'text-amber-500 bg-amber-50';
              const workloadLabel = totalActiveLoad === 0 ? 'Available' : 
                                   totalActiveLoad >= 3 ? 'Overloaded' : 
                                   'Active';

              return (
                <motion.div
                  key={dev.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group bg-white rounded-3xl border border-slate-200 p-6 hover:shadow-2xl hover:border-indigo-200 transition-all relative flex flex-col"
                >
                  {/* Workload Indicator */}
                  <div className="absolute top-4 left-4">
                    <div className={cn(
                      "px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border border-current",
                      workloadColor
                    )}>
                      {workloadLabel}
                    </div>
                  </div>

                  {/* Performance Badge */}
                  <div className="absolute top-0 right-0 p-4">
                    <div className={cn(
                      "flex flex-col items-center justify-center w-12 h-14 rounded-2xl border-2 shadow-sm transition-all group-hover:scale-110",
                      performanceDetails[dev.id]?.grade === 'N/A' ? "bg-slate-50 border-slate-200 text-slate-400" :
                      (performanceData[dev.id] || 0) >= 82 ? "bg-emerald-50 border-emerald-200 text-emerald-600" :
                      (performanceData[dev.id] || 0) >= 70 ? "bg-indigo-50 border-indigo-200 text-indigo-600" :
                      "bg-rose-50 border-rose-250 text-rose-600"
                    )}>
                      <span className="text-[8px] font-black uppercase tracking-widest leading-none mb-0.5 opacity-60">Grade</span>
                      <span className="text-base font-black tracking-tight leading-none">{performanceDetails[dev.id]?.grade || 'N/A'}</span>
                      <span className="text-[9px] font-black tracking-tighter opacity-80 mt-1">
                        {performanceDetails[dev.id]?.grade === 'N/A' ? '—' : `${performanceData[dev.id] || 0}%`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center mb-6 pt-2">
                    <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-lg font-black mb-3 shadow-2xl shadow-slate-900/20 ring-4 ring-slate-50 group-hover:ring-indigo-100/50 group-hover:bg-indigo-600 transition-all">
                      {dev.name[0]}
                    </div>
                    <h3 className="font-black text-slate-900 text-center tracking-tight text-lg leading-tight">{dev.name}</h3>
                    <p className="text-[8px] text-slate-400 font-black uppercase tracking-[0.25em] mt-1 opacity-60">ID: {dev.employeeId || 'N/A'}</p>
                    <div className="flex gap-2 mt-3">
                      <div className="text-indigo-600 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-indigo-50/50 rounded-xl border border-indigo-100 transition-colors group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-700">
                        {dev.role}
                      </div>
                      <div className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border transition-all",
                        dev.shift === 'Night' 
                        ? "bg-slate-900 text-slate-300 border-slate-800 group-hover:bg-indigo-900 group-hover:text-indigo-200" 
                        : "bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-100"
                      )}>
                        {dev.shift || 'Day'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6 bg-slate-50/80 p-4 rounded-2xl border border-slate-100 flex-1 transition-colors group-hover:bg-white group-hover:border-indigo-100 shadow-inner group-hover:shadow-none">
                    <div className="flex items-center gap-2.5 text-slate-500 overflow-hidden">
                      <div className="p-1.5 bg-white rounded-lg border border-slate-200 group-hover:border-indigo-200 transition-colors">
                        <User className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      </div>
                      <span className="text-[10px] font-bold truncate tracking-tight text-slate-600 group-hover:text-slate-900 transition-colors">{dev.designation}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-500 overflow-hidden">
                      <div className="p-1.5 bg-white rounded-lg border border-slate-200 group-hover:border-indigo-200 transition-colors">
                        <Mail className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      </div>
                      <span className="text-[10px] font-bold truncate tracking-tight text-slate-600 group-hover:text-slate-900 transition-colors">{dev.email || 'No email assigned'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2.5 text-slate-500">
                        <div className="p-1.5 bg-white rounded-lg border border-slate-200 group-hover:border-indigo-200 transition-colors">
                          <Briefcase className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        </div>
                        <span className="text-[10px] font-bold tracking-tight text-slate-600 group-hover:text-slate-900 transition-colors">Active Deploy</span>
                      </div>
                      <span className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600">{activeDeploymentCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2.5 text-slate-500">
                        <div className="p-1.5 bg-white rounded-lg border border-slate-200 group-hover:border-indigo-200 transition-colors">
                          <Wrench className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        </div>
                        <span className="text-[10px] font-bold tracking-tight text-slate-600 group-hover:text-slate-900 transition-colors">Maintenance</span>
                      </div>
                      <span className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-[10px] font-black text-amber-600">{activeMaintenanceCount}</span>
                    </div>

                    {/* Performance Metrics Breakdown */}
                    {performanceDetails[dev.id] && (
                      <div className="pt-2 border-t border-dashed border-slate-150 space-y-1.5 mt-2">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none block">Telemetry Scorecard</span>
                        <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                          <div className="bg-slate-100/50 p-2 rounded-xl border border-slate-100 flex flex-col justify-center">
                            <span className="text-slate-400 uppercase tracking-widest text-[7px] leading-tight font-black">Avg Progress</span>
                            <span className="font-extrabold text-slate-900 mt-0.5">{performanceDetails[dev.id].metrics.avgMilestoneProgress}%</span>
                          </div>
                          <div className="bg-slate-100/50 p-2 rounded-xl border border-slate-100 flex flex-col justify-center">
                            <span className="text-slate-400 uppercase tracking-widest text-[7px] leading-tight font-black">Deliveries</span>
                            <span className="font-extrabold text-emerald-600 mt-0.5">{performanceDetails[dev.id].metrics.deliveredMilestones}</span>
                          </div>
                          <div className="bg-slate-100/50 p-2 rounded-xl border border-slate-100 flex flex-col justify-center">
                            <span className="text-slate-400 uppercase tracking-widest text-[7px] leading-tight font-black">Open Issues</span>
                            <span className={cn("font-extrabold mt-0.5", performanceDetails[dev.id].metrics.openIssues > 0 ? "text-rose-650" : "text-slate-900")}>
                              {performanceDetails[dev.id].metrics.openIssues}
                            </span>
                          </div>
                          <div className="bg-slate-100/50 p-2 rounded-xl border border-slate-100 flex flex-col justify-center">
                            <span className="text-slate-400 uppercase tracking-widest text-[7px] leading-tight font-black">Extensions</span>
                            <span className={cn("font-extrabold mt-0.5", performanceDetails[dev.id].metrics.totalExtensionDays > 0 ? "text-amber-650" : "text-slate-900")}>
                              {performanceDetails[dev.id].metrics.totalExtensionDays}d
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2.5">
                    <button 
                      onClick={() => {
                        setSelectedDeveloperId(dev.id);
                        setIsMntModalOpen(true);
                      }}
                      className="flex-1 py-3 bg-slate-900 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-xl shadow-slate-900/10"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => {
                        setEditingDeveloper(dev);
                        setIsModalOpen(true);
                      }}
                      className="flex-1 py-3 bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-xl shadow-indigo-600/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteDeveloper(dev.id)}
                      disabled={isSubmitting}
                      className="flex-1 py-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all flex items-center justify-center active:scale-95 border border-transparent hover:border-rose-100 shadow-sm disabled:opacity-50"
                    >
                      <Trash2 className={cn("w-4 h-4", isSubmitting && "animate-pulse")} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )}

      {/* New/Edit Developer Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-white/20 max-h-[95vh] flex flex-col"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {editingDeveloper ? 'Edit Talent Details' : 'Onboard Talent'}
                </h2>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1">
                  {editingDeveloper ? `Updating ${editingDeveloper.name}` : 'New Registry Entry'}
                </p>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmitting) return;
                setIsSubmitting(true);
                try {
                  const f = e.target as any;
                  const devData = {
                    employeeId: f.employeeId.value,
                    name: f.name.value,
                    email: f.email.value,
                    designation: f.designation.value,
                    role: f.role.value,
                    shift: f.shift.value,
                    ownerId: f.ownerId?.value || auth.currentUser?.uid || ''
                  };

                  if (editingDeveloper) {
                    await developerService.updateDeveloper(editingDeveloper.id, devData);
                  } else {
                    await developerService.createDeveloper(devData);
                  }
                  
                  setIsModalOpen(false);
                  setEditingDeveloper(null);
                  fetchData();
                } catch (err) {
                  console.error(err);
                } finally {
                  setIsSubmitting(false);
                }
              }} className="p-6 sm:p-8 space-y-5 overflow-y-auto no-scrollbar">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Employee ID</label>
                  <input name="employeeId" required defaultValue={editingDeveloper?.employeeId} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-sm" placeholder="e.g. DP-2024-001" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Full Identity</label>
                  <input name="name" required defaultValue={editingDeveloper?.name} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm" placeholder="e.g. Liam Anderson" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email (Auth Sync)</label>
                  <input name="email" type="email" required defaultValue={editingDeveloper?.email} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm" placeholder="e.g. liam@sprintdesk.io" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Designation</label>
                  <input name="designation" required defaultValue={editingDeveloper?.designation} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm" placeholder="e.g. Senior Software Engineer" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Technical Stack</label>
                  <select name="role" required defaultValue={editingDeveloper?.role} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-sm text-slate-700 appearance-none">
                    <option value="UI/UX Designer">UI/UX Designer</option>
                    <option value="Flutter Developer">Flutter Developer</option>
                    <option value="React Native Developer">React Native Developer</option>
                    <option value="Frontend Developer">Frontend Developer</option>
                    <option value="Backend Developer">Backend Developer</option>
                    <option value="AI Engineer">AI Engineer</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Operational Shift</label>
                  <select name="shift" required defaultValue={editingDeveloper?.shift} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-sm text-slate-700 appearance-none bg-white">
                    <option value="Day">Day Shift</option>
                    <option value="Night">Night Shift</option>
                  </select>
                </div>
                {!currentLeader && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Assign Leader</label>
                    <select name="ownerId" defaultValue={editingDeveloper?.ownerId || auth.currentUser?.uid} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-sm text-slate-700 appearance-none bg-white">
                      <option value={auth.currentUser?.uid}>Admin (Self)</option>
                      {visibleLeaders.map(leader => (
                        <option key={leader.id} value={leader.uid || leader.id}>{leader.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-3 pt-6">
                  <button type="button" onClick={() => { setIsModalOpen(false); setEditingDeveloper(null); }} disabled={isSubmitting} className="flex-1 py-3 text-slate-500 font-bold text-sm rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50">
                    {isSubmitting ? (editingDeveloper ? 'Saving...' : 'Onboarding...') : (editingDeveloper ? 'Save Changes' : 'Finalize Entry')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Maintenance Projects Modal */}
      <AnimatePresence>
        {isMntModalOpen && selectedDeveloper && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Maintenance Track - {selectedDeveloper.name}</h2>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1">View post-delivery commitments (Managed by Developer)</p>
                </div>
                <button 
                  onClick={() => {
                    setIsMntModalOpen(false);
                    setSelectedDeveloperId(null);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              
              <div className="p-8 max-h-[60vh] overflow-y-auto no-scrollbar">
                {/* List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(selectedDeveloper.maintenanceProjects || []).length === 0 ? (
                    <div className="col-span-2 py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No maintenance commitments logged by developer</p>
                    </div>
                  ) : (
                    [...(selectedDeveloper.maintenanceProjects || [])]
                      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                      .map((mnt) => (
                        <div key={mnt.id} className="p-5 bg-white border border-slate-150 rounded-2xl shadow-sm hover:border-indigo-150 transition-all flex flex-col justify-between h-36">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className={cn(
                                "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border",
                                mnt.status === 'Complete' 
                                  ? "bg-slate-100 text-slate-500 border-slate-200" 
                                  : "bg-amber-50 text-amber-600 border-amber-100"
                              )}>
                                {mnt.status === 'Complete' ? 'Completed' : 'Work In Progress'}
                              </span>
                              <span className={cn(
                                "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border",
                                mnt.type === 'Heavy' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                mnt.type === 'Moderate' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                                "bg-teal-50 text-teal-600 border-teal-100"
                              )}>
                                {mnt.type}
                              </span>
                            </div>
                            <h4 className="text-sm font-black text-slate-950 tracking-tight leading-tight line-clamp-2">{mnt.projectName}</h4>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 border-t border-slate-100 pt-2 shrink-0">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-300" />
                              {mnt.type} Support
                            </span>
                            {mnt.createdAt && (
                              <span>Logged: {new Date(mnt.createdAt).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
