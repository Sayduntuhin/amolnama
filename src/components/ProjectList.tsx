import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter, MoreVertical, Calendar, User, ArrowUpRight, Trash2, X, FileSpreadsheet } from 'lucide-react';
import { projectService } from '@/src/services/projectService';
import { progressService } from '@/src/services/progressService';
import { adminService } from '@/src/services/adminService';
import { auth } from '@/src/lib/firebase';
import { Project, ProjectStatus, PhaseName, Shift } from '@/src/types';
import { formatDate, calculateProjectAge, formatDateForInput, cn } from '@/src/lib/utils';
import { useSnackbar } from '@/src/components/Snackbar';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleSheetsSyncModal } from './GoogleSheetsSyncModal';
import { leaderService } from '@/src/services/leaderService';

export function ProjectList() {
  const { showSuccess, showError } = useSnackbar();
  const [projects, setProjects] = useState<Project[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [selectedAdminFilter, setSelectedAdminFilter] = useState<string>('All');
  const [leaders, setLeaders] = useState<any[]>([]);
  const [selectedLeaderFilter, setSelectedLeaderFilter] = useState<string>('All');
  const [currentLeader, setCurrentLeader] = useState<any | null>(null);
  const [projectProgress, setProjectProgress] = useState<Record<string, number>>({});
  const [projectIssuesCount, setProjectIssuesCount] = useState<Record<string, number>>({});
  const [projectMilestoneAge, setProjectMilestoneAge] = useState<Record<string, number>>({});
  const [projectInProgressValue, setProjectInProgressValue] = useState<Record<string, number>>({});
  const [projectInProgressPhases, setProjectInProgressPhases] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'All'>('All');
  const [shiftFilter, setShiftFilter] = useState<Shift | 'All'>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({ clientName: '', projectId: '', shift: 'Day' as Shift, ownerId: '' });
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const email = auth.currentUser?.email;
    const isSuper = email && (email.toLowerCase().trim() === 'exceptionhubjvai@gmail.com');

    const [data, adminList, leadersList] = await Promise.all([
      projectService.getAllProjects(),
      adminService.getAllAdmins(),
      leaderService.getAllLeaders()
    ]);
    
    if (adminList) {
      setAdmins(adminList);
    }

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
    
    if (data) {
      setProjects(data);
      
      // Fetch progress and issues for each project
      const progressMap: Record<string, number> = {};
      const issuesMap: Record<string, number> = {};
      const ageMap: Record<string, number> = {};
      const inProgressValueMap: Record<string, number> = {};
      const inProgressPhasesMap: Record<string, string[]> = {};
      await Promise.all(data.map(async (p) => {
        // Phases/Progress
        const phases = await progressService.getPhases(p.id);
        if (phases && phases.length > 0) {
          const total = phases.reduce((acc, curr) => acc + (curr.progress || 0), 0);
          progressMap[p.id] = Math.round(total / phases.length);

          const activePhases = phases.filter(ph => ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested' || ph.status === 'Ready for Delivery');
          if (activePhases.length > 0) {
            const avgAge = Math.round(activePhases.reduce((acc, ph) => acc + calculateProjectAge(ph.startDate || (ph as any).createdAt || ''), 0) / activePhases.length);
            ageMap[p.id] = avgAge;
            
            const ipValue = activePhases.reduce((acc, ph) => acc + (ph.value || 0), 0);
            inProgressValueMap[p.id] = ipValue;
            inProgressPhasesMap[p.id] = activePhases.map(ph => ph.phaseName);
          } else {
            ageMap[p.id] = 0;
            inProgressValueMap[p.id] = 0;
            inProgressPhasesMap[p.id] = [];
          }
        } else {
          progressMap[p.id] = 0;
          ageMap[p.id] = 0;
          inProgressValueMap[p.id] = 0;
          inProgressPhasesMap[p.id] = [];
        }

        // Issues
        const issues = await progressService.getIssues(p.id);
        if (issues) {
          issuesMap[p.id] = issues.filter(i => i.status === 'Open').length;
        } else {
          issuesMap[p.id] = 0;
        }
      }));
      setProjectProgress(progressMap);
      setProjectIssuesCount(issuesMap);
      setProjectMilestoneAge(ageMap);
      setProjectInProgressValue(inProgressValueMap);
      setProjectInProgressPhases(inProgressPhasesMap);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm('CRITICAL: Purge this project and all associated metadata? This action is irreversible.')) {
      setIsDeleting(id);
      try {
        console.log('Attempting to delete project document:', id);
        await projectService.deleteProject(id);
        
        // Optimistic UI update: remove from local state immediately
        setProjects(prev => prev.filter(p => p.id !== id));
        showSuccess('Project purged successfully!');
        console.log('Project purged successfully');
      } catch (error: any) {
        console.error('Purge Failed:', error);
        // Attempt to parse the error message if it's our JSON format
        let displayError = error.message;
        try {
          const parsed = JSON.parse(error.message);
          displayError = parsed.error || error.message;
        } catch (e) {
          // not JSON
        }
        showError('SECURITY/INTEGRITY ERROR: ' + displayError);
        // Refresh the list to ensure sync
        await loadProjects();
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const handleUpdateProject = async (id: string) => {
    setIsUpdating(true);
    try {
      await projectService.updateProject(id, editFormData);
      setProjects(prev => prev.map(p => p.id === id ? { ...p, ...editFormData } : p));
      setEditingProjectId(null);
    } catch (error) {
      console.error('Update failed:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const startEditing = (project: Project, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingProjectId(project.id);
    setEditFormData({ 
      clientName: project.clientName, 
      projectId: project.projectId, 
      shift: project.shift || 'Day',
      ownerId: project.ownerId || ''
    });
  };

  const isSuperAdmin = auth.currentUser?.email?.toLowerCase().trim() === 'exceptionhubjvai@gmail.com';

  const adminFilteredProjects = React.useMemo(() => {
    if (currentLeader) {
      return projects.filter(p => p.ownerId === auth.currentUser?.uid);
    }

    if (isSuperAdmin) {
      let temp = projects;
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
        
        temp = temp.filter(p => p.ownerId === targetOwnerId || leaderUids.includes(p.ownerId) || leaderIds.includes(p.ownerId));
      }
      if (selectedLeaderFilter !== 'All') {
        const selectedLeader = leaders.find(l => (l.uid || l.id) === selectedLeaderFilter);
        if (selectedLeader) {
          const ownerIdToMatch = selectedLeader.uid || selectedLeader.id;
          temp = temp.filter(p => p.ownerId === ownerIdToMatch);
        }
      }
      return temp;
    }

    const adminUid = auth.currentUser?.uid;
    const adminLeaders = leaders.filter(l => l.creatorId === adminUid);
    const leaderUids = adminLeaders.map(l => l.uid).filter(Boolean);
    const leaderIds = adminLeaders.map(l => l.id);

    if (selectedLeaderFilter === 'All') {
      return projects.filter(p => p.ownerId === adminUid || leaderUids.includes(p.ownerId) || leaderIds.includes(p.ownerId));
    } else if (selectedLeaderFilter === 'Self') {
      return projects.filter(p => p.ownerId === adminUid);
    } else {
      const selectedLeader = leaders.find(l => (l.uid || l.id) === selectedLeaderFilter);
      if (selectedLeader) {
        const ownerIdToMatch = selectedLeader.uid || selectedLeader.id;
        return projects.filter(p => p.ownerId === ownerIdToMatch);
      }
      return [];
    }
  }, [projects, selectedAdminFilter, selectedLeaderFilter, isSuperAdmin, currentLeader, admins, leaders]);

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

  const filteredProjects = adminFilteredProjects.filter(p => {
    const matchesSearch = p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.projectId.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    const matchesShift = shiftFilter === 'All' || (p.shift || 'Day') === shiftFilter;
    
    // Custom logic to match visual badges
    if (statusFilter === 'Delivered') {
      matchesStatus = (p.status === 'Delivered' || p.status === 'Complete' || (projectProgress[p.id] ?? 0) === 100) && p.status !== 'WIP';
    } else if (statusFilter === 'WIP') {
      matchesStatus = p.status === 'WIP' || (p.status !== 'Delivered' && p.status !== 'Complete' && p.status !== 'Cancelled' && p.status !== 'Paused' && (projectProgress[p.id] ?? 0) < 100);
    }
    
    return matchesSearch && matchesStatus && matchesShift;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Project Portfolio</h1>
          <p className="text-slate-500 text-sm font-medium">Manage and track all active and completed project deliverables.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 active:scale-95 w-full sm:w-auto"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>Sync from Sheet</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-95 w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-4 bg-white p-2 rounded-2xl md:rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Client or Management Name..."
            className="w-full pl-11 pr-4 py-3.5 bg-transparent border-none focus:ring-0 text-sm font-medium placeholder:text-slate-400 placeholder:font-normal"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {isSuperAdmin && (
          <>
            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full lg:w-48 shrink-0 font-sans">
              <select 
                value={selectedAdminFilter} 
                onChange={(e) => setSelectedAdminFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 px-3 py-1 outline-none border-none cursor-pointer w-full"
              >
                <option value="All">All Admins</option>
                {admins.map(admin => (
                  <option key={admin.id} value={admin.uid || admin.id}>{admin.name}</option>
                ))}
              </select>
            </div>
            <div className="h-8 w-px bg-slate-200 hidden lg:block"></div>
          </>
        )}
        
        {!currentLeader && (
          <>
            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full lg:w-48 shrink-0 font-sans">
              <select 
                value={selectedLeaderFilter} 
                onChange={(e) => setSelectedLeaderFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 px-3 py-1 outline-none border-none cursor-pointer w-full"
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
            <div className="h-8 w-px bg-slate-200 hidden lg:block"></div>
          </>
        )}
        
        <div className="h-8 w-px bg-slate-200 hidden lg:block"></div>

                <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-full sm:w-auto">
                    {['All', 'Day', 'Night'].map((shift) => (
                      <button
                        key={shift}
                        onClick={() => setShiftFilter(shift as any)}
                        className={cn(
                          "flex-1 px-4 py-2.5 rounded-xl text-[10px] md:text-xs font-black transition-all whitespace-nowrap uppercase tracking-widest",
                          shiftFilter === shift 
                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" 
                            : "text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                        )}
                      >
                        {shift === 'All' ? 'All Projects' : `${shift} Shift`}
                      </button>
                    ))}
                </div>

        <div className="h-8 w-px bg-slate-200 hidden lg:block"></div>

        <div className="flex items-center gap-2 p-2 overflow-x-auto no-scrollbar">
          {['All', 'WIP', 'Paused', 'Delivered', 'Cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status as any)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] md:text-xs font-black transition-all whitespace-nowrap uppercase tracking-widest",
                statusFilter === status 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {status === 'WIP' ? 'In Progress' : status}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="h-64 bg-slate-100 animate-pulse rounded-2xl border border-slate-200"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          <AnimatePresence>
            {filteredProjects.map((project) => (
              <motion.div
                key={project.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 hover:shadow-2xl hover:border-indigo-200 transition-all group flex flex-col h-full relative"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1 space-y-1">
                    {editingProjectId === project.id ? (
                      <div className="space-y-2 pr-4" onClick={(e) => e.preventDefault()}>
                        <input 
                          type="text" 
                          className="w-full px-2 py-1 text-base font-black text-slate-900 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                          value={editFormData.clientName}
                          onChange={(e) => setEditFormData({ ...editFormData, clientName: e.target.value })}
                          placeholder="Client Name"
                        />
                        <select 
                          className="w-full px-2 py-1 text-[10px] font-black text-slate-900 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 bg-white uppercase tracking-widest"
                          value={editFormData.shift}
                          onChange={(e) => setEditFormData({ ...editFormData, shift: e.target.value as Shift })}
                        >
                          <option value="Day">Day Project</option>
                          <option value="Night">Night Project</option>
                        </select>
                        {!currentLeader && (
                          <select 
                            className="w-full px-2 py-1 text-[10px] font-black text-slate-900 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 bg-white uppercase tracking-widest"
                            value={editFormData.ownerId}
                            onChange={(e) => setEditFormData({ ...editFormData, ownerId: e.target.value })}
                          >
                            <option value={auth.currentUser?.uid}>Admin (Self)</option>
                            {visibleLeaders.map(leader => (
                              <option key={leader.id} value={leader.uid || leader.id}>Leader: {leader.name}</option>
                            ))}
                          </select>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button 
                            onClick={() => handleUpdateProject(project.id)}
                            disabled={isUpdating}
                            className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button 
                            onClick={() => setEditingProjectId(null)}
                            className="px-3 py-1 bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Client: {project.projectId}</p>
                          <button 
                            onClick={(e) => startEditing(project, e)}
                            className="p-1 text-slate-300 hover:text-indigo-600 transition-colors"
                          >
                            <Plus className="w-3 h-3 rotate-45" />
                          </button>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors line-clamp-1 tracking-tight">
                          {project.clientName}
                        </h3>
                      </>
                    )}
                  </div>
                    <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[9px] font-black px-2 py-1 rounded border uppercase tracking-widest",
                        project.shift === 'Night' ? "bg-indigo-900 text-indigo-200 border-indigo-950" : "bg-amber-100 text-amber-600 border-amber-200"
                      )}>
                        {project.shift || 'Day'}
                      </span>
                      {projectIssuesCount[project.id] > 0 && (
                        <span className="bg-rose-50 text-rose-600 text-[9px] font-black px-2 py-1 rounded-md border border-rose-100 uppercase tracking-widest animate-pulse">
                          {projectIssuesCount[project.id]} Issues
                        </span>
                      )}
                      <span className={cn(
                        "text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-widest border shadow-sm",
                        project.status === 'Paused' ? "bg-slate-50 text-slate-600 border-slate-200" :
                        project.status === 'Cancelled' ? "bg-rose-50 text-rose-600 border-rose-200/50" :
                        project.status === 'Ready for Delivery' ? "bg-indigo-100 text-indigo-700 border-indigo-200 shadow-md animate-pulse" :
                        (project.status as string !== 'WIP' && (project.status as string === 'Delivered' || project.status as string === 'Complete' || (projectProgress[project.id] ?? 0) === 100)) ? "bg-emerald-600 text-white border-emerald-700" :
                        "bg-amber-50 text-amber-600 border-amber-200/50"
                      )}>
                        {project.status === 'Paused' ? 'Paused' :
                         project.status === 'Cancelled' ? 'Cancelled' :
                         project.status === 'Ready for Delivery' ? 'Ready for Delivery' :
                         (project.status as string !== 'WIP' && (project.status as string === 'Delivered' || project.status as string === 'Complete' || (projectProgress[project.id] ?? 0) === 100)) ? 'Delivered' : 
                         'In Progress'}
                      </span>
                    </div>
                    {project.deliveryDate && (
                      <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 uppercase tracking-widest">
                        Done: {formatDate(project.deliveryDate)}
                      </span>
                    )}
                    <button
                      onClick={(e) => handleDelete(project.id, e)}
                      disabled={isDeleting === project.id}
                      className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all active:scale-90"
                      title="Delete Project"
                    >
                      <Trash2 className={cn("w-4 h-4", isDeleting === project.id && "animate-pulse")} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:bg-white hover:border-indigo-100 transition-all group/stat">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest group-hover/stat:text-indigo-400">Total Value</p>
                    <p className="text-base font-black text-slate-900 tracking-tight">${project.amount.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:bg-white hover:border-indigo-100 transition-all group/stat text-rose-600">
                    <p className="text-[10px] font-black text-rose-400 uppercase mb-2 tracking-widest group-hover/stat:text-rose-500">Net WIP (80%)</p>
                    <p className="text-base font-black tracking-tight">${Math.round((projectInProgressValue[project.id] || 0) * 0.8).toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:bg-white hover:border-indigo-100 transition-all group/stat">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest group-hover/stat:text-indigo-400">Duration</p>
                    <p className="text-base font-black text-slate-900 tracking-tight text-center">{projectMilestoneAge[project.id] || 0} Days</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-indigo-100 hover:bg-indigo-50/50 transition-all group/stat">
                    <p className="text-[10px] font-black text-indigo-400 uppercase mb-2 tracking-widest">Active Phase</p>
                    <p className="text-[11px] font-black text-indigo-600 leading-tight">
                      {projectInProgressPhases[project.id]?.length > 0 
                        ? projectInProgressPhases[project.id].join(' + ') 
                        : 'No Active Phase'}
                    </p>
                  </div>
                </div>

                <div className="space-y-6 flex-1">
                  <div className="flex items-center gap-2.5 text-[10px] font-black text-slate-500 bg-slate-50 px-3 py-2 rounded-xl w-fit uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Incoming {formatDate(project.startDate)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {project.phases.slice(0, 3).map((phase, idx) => (
                      <span key={`${phase}-${idx}`} className="px-2.5 py-1.5 bg-indigo-50/50 text-indigo-600 text-[10px] font-black rounded-lg uppercase tracking-widest border border-indigo-100/50">
                        {phase}
                      </span>
                    ))}
                    {project.phases.length > 3 && (
                      <span className="px-2.5 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-black rounded-lg uppercase tracking-widest">
                        +{project.phases.length - 3} More
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  to={`/projects/${project.id}`}
                  className="mt-8 flex items-center justify-center gap-3 w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-600 transition-all shadow-xl shadow-slate-900/10 active:scale-95"
                >
                  Manage Project
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* New Project Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4">
            <motion.div
              layoutId="modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-white/20"
            >
              <ProjectForm onClose={() => setIsModalOpen(false)} onSave={loadProjects} leaders={leaders} currentLeader={currentLeader} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Google Sheets Sync Modal */}
      <AnimatePresence>
        {isSyncModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-white/20"
            >
              <GoogleSheetsSyncModal 
                onClose={() => setIsSyncModalOpen(false)} 
                onSyncSuccess={loadProjects} 
                existingProjects={projects} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProjectForm({ onClose, onSave, leaders, currentLeader }: { onClose: () => void; onSave: () => void; leaders: any[]; currentLeader: any | null }) {
  const { showSuccess, showError, showWarning } = useSnackbar();
  const [formData, setFormData] = useState({
    projectId: '',
    clientName: '',
    amount: 0,
    startDate: new Date().toISOString().split('T')[0],
    status: 'WIP' as ProjectStatus,
    shift: 'Day' as Shift,
    ownerId: '',
  });

  const [milestones, setMilestones] = useState<Array<{
    phaseName: PhaseName;
    orderId: string;
    value: number;
    startDate: string;
    startTime: string;
    expectedDeliveryDate: string;
    expectedDeliveryTime: string;
    actualDeliveryDate: string;
  }>>([]);

  const [newMilestone, setNewMilestone] = useState<{
    phaseName: PhaseName;
    orderId: string;
    value: number;
    startDate: string;
    startTime: string;
    expectedDeliveryDate: string;
    expectedDeliveryTime: string;
    actualDeliveryDate: string;
  }>({
    phaseName: '' as any,
    orderId: '',
    value: 0,
    startDate: formData.startDate,
    startTime: '09:00',
    expectedDeliveryDate: new Date().toISOString().split('T')[0],
    expectedDeliveryTime: '18:00',
    actualDeliveryDate: new Date().toISOString().split('T')[0]
  });

  const [saving, setSaving] = useState(false);

  const phaseOptions: PhaseName[] = [
    'UI/UX', 'App Frontend', 'Web Frontend', 'Backend', 'AI', 'Deployment', 'Integration', 'Full Project', 'n8n', 'CMS'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (milestones.length === 0) {
      showWarning('Please add at least one milestone.');
      return;
    }
    setSaving(true);
    try {
      const generatedProjectId = 'P-' + Math.floor(100 + Math.random() * 900);
      const projectPayload = {
        ...formData,
        projectId: formData.projectId || generatedProjectId,
        phases: milestones.map(m => m.phaseName)
      };
      await projectService.createProject(projectPayload, milestones);
      showSuccess('Project initiated successfully!');
      onSave();
      onClose();
    } catch (error: any) {
      console.error('Project initiation failed:', error);
      showError('Failed to initiate project: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const addMilestone = () => {
    if (!newMilestone.phaseName) {
      showWarning('Please select a phase name.');
      return;
    }
    if (newMilestone.value <= 0) {
      showWarning('Please provide a milestone value.');
      return;
    }
    setMilestones([...milestones, newMilestone]);
    // Reset for next
    setNewMilestone({
      phaseName: '' as any,
      orderId: '',
      value: 0,
      startDate: formData.startDate,
      startTime: '09:00',
      expectedDeliveryDate: new Date().toISOString().split('T')[0],
      expectedDeliveryTime: '18:00',
      actualDeliveryDate: new Date().toISOString().split('T')[0]
    });
  };

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const totalMilestonesValue = milestones.reduce((acc, m) => acc + m.value, 0);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
      <div className="p-5 sm:p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Initiate New Project</h2>
          <p className="text-slate-500 text-xs sm:sm font-medium">Define metadata and custom milestones.</p>
        </div>
        <button 
          type="button" 
          onClick={onClose} 
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 sm:p-8 space-y-6 sm:space-y-8 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Client Name</label>
            <input
              required
              type="text"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-medium"
              placeholder="e.g. Acme Corp"
              value={formData.clientName}
              onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
            />
          </div>
          {!currentLeader ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Assign Leader</label>
              <select
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-bold text-slate-700 appearance-none bg-white"
                value={formData.ownerId}
                onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
              >
                <option value="">Admin (Self)</option>
                {leaders.map(leader => (
                  <option key={leader.id} value={leader.uid || leader.id}>{leader.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Operational Shift</label>
              <select
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-black uppercase tracking-widest appearance-none bg-white"
                value={formData.shift}
                onChange={(e) => setFormData({ ...formData, shift: e.target.value as Shift })}
              >
                <option value="Day">Day Project</option>
                <option value="Night">Night Project</option>
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Total Contract Value ($)</label>
            <input
              required
              type="number"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-medium"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Incoming Date</label>
            <input
              required
              type="date"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-medium"
              value={formatDateForInput(formData.startDate)}
              onChange={(e) => {
                setFormData({ ...formData, startDate: e.target.value });
                if (milestones.length === 0) {
                  setNewMilestone(prev => ({ ...prev, startDate: e.target.value }));
                }
              }}
            />
          </div>
          {!currentLeader && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Operational Shift</label>
              <select
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-black uppercase tracking-widest appearance-none bg-white"
                value={formData.shift}
                onChange={(e) => setFormData({ ...formData, shift: e.target.value as Shift })}
              >
                <option value="Day">Day Project</option>
                <option value="Night">Night Project</option>
              </select>
            </div>
          )}
        </div>

        <div className="space-y-6 bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest">Add Milestones</h3>
            <span className={cn(
              "text-[10px] font-black px-2 py-1 rounded border",
              totalMilestonesValue === formData.amount ? "bg-emerald-100 text-emerald-600 border-emerald-200" : "bg-amber-100 text-amber-600 border-amber-200"
            )}>
              Total Allocated: ${totalMilestonesValue.toLocaleString()} / ${formData.amount.toLocaleString()}
            </span>
          </div>

          <div className="space-y-4">
            {/* General Info Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Order ID</label>
                <input 
                  type="text"
                  placeholder="INV-001"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={newMilestone.orderId}
                  onChange={(e) => setNewMilestone({ ...newMilestone, orderId: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Milestone Phase</label>
                <select 
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={newMilestone.phaseName}
                  onChange={(e) => setNewMilestone({ ...newMilestone, phaseName: e.target.value as PhaseName })}
                >
                  <option value="">Select Phase</option>
                  {phaseOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Milestone Value ($)</label>
                <input 
                  type="number"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={newMilestone.value || ''}
                  onChange={(e) => setNewMilestone({ ...newMilestone, value: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Deadlines Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Incoming</label>
                <div className="flex gap-2">
                  <input 
                    type="date"
                    className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={formatDateForInput(newMilestone.startDate)}
                    onChange={(e) => setNewMilestone({ ...newMilestone, startDate: e.target.value })}
                  />
                  <input 
                    type="time"
                    className="w-24 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={newMilestone.startTime}
                    onChange={(e) => setNewMilestone({ ...newMilestone, startTime: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Target Delivery</label>
                <div className="flex gap-2">
                  <input 
                    type="date"
                    className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={formatDateForInput(newMilestone.expectedDeliveryDate)}
                    onChange={(e) => setNewMilestone({ ...newMilestone, expectedDeliveryDate: e.target.value })}
                  />
                  <input 
                    type="time"
                    className="w-24 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={newMilestone.expectedDeliveryTime}
                    onChange={(e) => setNewMilestone({ ...newMilestone, expectedDeliveryTime: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-rose-500 uppercase tracking-widest pl-1">Actual Fiverr Delivery</label>
                <div className="flex gap-2">
                  <input 
                    type="date"
                    className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-rose-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-rose-500"
                    value={formatDateForInput(newMilestone.actualDeliveryDate)}
                    onChange={(e) => setNewMilestone({ ...newMilestone, actualDeliveryDate: e.target.value })}
                  />
                  <button 
                    type="button"
                    onClick={addMilestone}
                    className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl hover:bg-slate-900 transition-colors shrink-0 flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {milestones.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3">Planned Phases</p>
              <div className="space-y-2">
                {milestones.map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-left-2 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-xs">{idx + 1}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black text-slate-900">{m.phaseName}</p>
                          {m.orderId && <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{m.orderId}</span>}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">
                          {m.phaseName && 'Active From'} {formatDate(m.startDate)} {m.startTime && `at ${m.startTime}`} • Due {formatDate(m.expectedDeliveryDate)} {m.expectedDeliveryTime && `at ${m.expectedDeliveryTime}`}
                          {m.actualDeliveryDate && ` • Fiverr Due ${formatDate(m.actualDeliveryDate)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm font-black text-indigo-600">${m.value.toLocaleString()}</p>
                      <button onClick={() => removeMilestone(idx)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-8 border-t border-slate-100 flex items-center gap-4 bg-slate-50/50">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 text-slate-500 font-bold rounded-xl hover:bg-slate-100 transition-all text-sm"
        >
          Discard
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 text-sm disabled:opacity-50"
        >
          {saving ? 'Initializing...' : 'Confirm Initiation'}
        </button>
      </div>
    </form>
  );
}
