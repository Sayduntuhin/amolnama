import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Plus, 
  ChevronRight,
  TrendingUp,
  History,
  MessageSquare,
  ArrowLeft,
  Trash2,
  Layers,
  Edit,
  X,
  Plus as PlusIcon,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Target,
  FileText
} from 'lucide-react';
import { projectService } from '@/src/services/projectService';
import { progressService } from '@/src/services/progressService';
import { developerService } from '@/src/services/developerService';
import { leaderService } from '@/src/services/leaderService';
import { auth } from '@/src/lib/firebase';
import { Project, PhaseTracking, DailyProgress, Issue, Developer, PhaseStatus, PhaseName, ProjectStatus, KPIAllocation, Shift, Leader } from '@/src/types';
import { formatDate, calculateProjectAge, calculateAge, formatDateForInput, cn, resolvePhaseStatus, resolveProjectStatus, calcOverallProgress, getGMT6Date, getGMT6DateString } from '@/src/lib/utils';
import { useSnackbar } from '@/src/components/Snackbar';
import { motion, AnimatePresence } from 'motion/react';

const phaseOptions: PhaseName[] = [
  'UI/UX', 'App Frontend', 'Web Frontend', 'Backend', 'AI', 'Deployment', 'Integration', 'Full Project', 'n8n', 'CMS'
];

const getDaysRemaining = (dateString?: string) => {
  if (!dateString) return 999;
  const target = new Date(dateString);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export function ProjectDetail() {
  const { showSuccess, showError, showWarning } = useSnackbar();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [phases, setPhases] = useState<PhaseTracking[]>([]);
  const [logs, setLogs] = useState<DailyProgress[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettingDeliveryDate, setIsSettingDeliveryDate] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ProjectStatus | null>(null);
  const [deliveryDate, setLocalDeliveryDate] = useState(getGMT6DateString());
  const [activeTab, setActiveTab] = useState<'phases' | 'progress' | 'issues'>('phases');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [projectEditData, setProjectEditData] = useState({
    clientName: '',
    projectId: '',
    amount: 0,
    ownerId: ''
  });

  useEffect(() => {
    if (project) {
      setProjectEditData({
        clientName: project.clientName,
        projectId: project.projectId,
        amount: project.amount,
        ownerId: project.ownerId || ''
      });
    }
  }, [project]);
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [isManagingKPI, setIsManagingKPI] = useState(false);
  const [kpiPhase, setKpiPhase] = useState<PhaseTracking | null>(null);
  const [filterDevId, setFilterDevId] = useState<string>('');
  const [filterPhaseId, setFilterPhaseId] = useState<string>('');
  const [filterShift, setFilterShift] = useState<string>('');
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  const loadData = async () => {
    if (!id || isRefreshing) return;
    setIsRefreshing(true);
    if (logs.length === 0) setLoading(true); // Only show full loading if it's the first load
    
    try {
      const [p, ph, l, i, devs, leadersList] = await Promise.all([
        projectService.getProjectById(id),
        progressService.getPhases(id),
        progressService.getDailyProgress(id),
        progressService.getIssues(id),
        developerService.getAllDevelopers(),
        leaderService.getAllLeaders()
      ]);
      
      if (p) {
        setProject(p);
        setPhases(ph || []);
        setLogs(l || []);
        setIssues(i || []);
        setDevelopers(devs || []);
        setLeaders(leadersList || []);
        
        // Auto-backfill missing logs - DISABLED to only display what developers explicitly add
        // if (ph && ph.length > 0) {
        //   const addedCount = await checkAndBackfillLogs(id, ph, l || [], p.createdAt);
        //   if (addedCount > 0) {
        //     // Re-fetch logs if any were added
        //     const updatedLogs = await progressService.getDailyProgress(id);
        //     setLogs(updatedLogs || []);
        //   }
        // }
      }
    } catch (error) {
      console.error("Critical telemetry failure:", error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const checkAndBackfillLogs = async (projectId: string, currentPhases: PhaseTracking[], currentLogs: DailyProgress[], createdAt: string) => {
    const now = new Date();
    const gmt6Time = getGMT6Date(now);
    
    const projectCreatedDate = new Date(createdAt);
    projectCreatedDate.setHours(0, 0, 0, 0); // Start of creation day
    
    let addedCount = 0;

    // Check last 3 days to keep it efficient
    for (let i = 0; i < 3; i++) {
        const checkDate = new Date();
        checkDate.setDate(now.getDate() - i);
        checkDate.setHours(0, 0, 0, 0);
        
        // Don't backfill for dates before project was created
        if (checkDate < projectCreatedDate) continue;

        // Use local date parts to avoid UTC shift issues
        const y = checkDate.getFullYear();
        const m = checkDate.getMonth(); // 0-indexed
        const d = checkDate.getDate();
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        // Find developers who should have logged for this project today
        const activeDevIds = new Set<string>();
        currentPhases.forEach(ph => {
            if ((ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested') && ph.developerIds) {
                ph.developerIds.forEach(devId => activeDevIds.add(devId));
            }
        });
        
        for (const devId of activeDevIds) {
            const hasLog = currentLogs.some(log => log.date === dateStr && log.developerId === devId);
            if (!hasLog) {
                const developer = developers.find(d => d.id === devId);
                const shift = developer?.shift || 'Day';

                let deadlinePassed = false;
                if (shift === 'Night') {
                    // Night shift deadline is 11:59 AM GMT+6 of the NEXT day
                    const deadline = new Date(Date.UTC(y, m, d, 11, 59, 0));
                    deadline.setUTCDate(deadline.getUTCDate() + 1);
                    deadlinePassed = gmt6Time.getTime() >= deadline.getTime();
                } else {
                    // Day shift deadline is 11:59 PM GMT+6 of the SAME day
                    const deadline = new Date(Date.UTC(y, m, d, 23, 59, 0));
                    deadlinePassed = gmt6Time.getTime() >= deadline.getTime();
                }
                if (!deadlinePassed) continue;

                console.log(`Auto-backfilling log for ${devId} on ${dateStr}`);
                const phase = currentPhases.find(ph => (ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested') && ph.developerIds?.includes(devId));
                
                await progressService.addDailyProgress({
                    projectId,
                    developerId: devId,
                    date: dateStr,
                    phaseId: phase?.id || '',
                    phaseName: phase?.phaseName,
                    progressPercentage: 0,
                    dailyTarget: 'N/A',
                    actualDone: 'N/A',
                    shift: shift,
                    description: `Automatic system log: Missed daily update deadline (${shift === 'Night' ? '11:59 AM' : '11:59 PM'} GMT+6)`,
                    reasonIfNoWork: 'Missed Update' as any
                });
                addedCount++;
            }
        }
    }
    return addedCount;
  };

  const handleUpdateProject = async () => {
    if (!id) return;
    try {
      await projectService.updateProject(id, projectEditData);
      setIsEditingProject(false);
      loadData();
    } catch (error) {
      console.error("Failed to update project details:", error);
    }
  };

  const calculateAutoStatus = () => {
    if (!project || !phases.length) return project?.status || '';
    
    // Check if developer has completed 100% progress for all phases (milestones)
    const allPhases100Pct = phases.length > 0 && phases.every(ph => ph.progress === 100);
    
    if (allPhases100Pct && project.status !== 'Delivered' && project.status !== 'Complete') {
      return 'Ready for Delivery';
    }

    // Calculate total value of delivered phases
    const deliveredValue = phases.filter(ph => ph.status === 'Delivered').reduce((acc, ph) => acc + (ph.value || 0), 0);
    const isValueComplete = deliveredValue >= project.amount && project.amount > 0;
    const anyInProgress = phases.some(ph => ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested');
    const anyDelivered = phases.some(ph => ph.status === 'Delivered');

    // Rule: Complete if value matches and NO milestone is in progress
    if (isValueComplete && !anyInProgress) return 'Complete';
    
    // Rule: WIP if any phase is in progress
    if (anyInProgress) return 'WIP';
    
    // Rule: Paused if some phases are delivered but none in progress (and not complete)
    if (anyDelivered && !anyInProgress) return 'Paused';
    
    return project.status;
  };

  const autoStatus = calculateAutoStatus();
  
  const activePhases = phases.filter(ph => ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested');
  const avgMilestoneAge = activePhases.length > 0
    ? Math.round(activePhases.reduce((acc, ph) => acc + calculateProjectAge(ph.startDate || (ph as any).createdAt || ''), 0) / activePhases.length)
    : 0;
  
  // Effect to sync autoStatus with backend if it differs significantly
  useEffect(() => {
    if (project && autoStatus && autoStatus !== project.status) {
       // Standard Transitions to sync automatically:
       // 1. Move to Delivered if all milestones are delivered
       // 2. Move to WIP if any milestone is reopened/started
       // 3. Move to Ready for Delivery if developer completes 100% progress before admin marks delivered
       
       const shouldSync = 
         (autoStatus === 'Ready for Delivery' && project.status === 'WIP') ||
         (autoStatus === 'WIP' && (project.status === 'Ready for Delivery' || project.status === 'Delivered' || project.status === 'Complete' || project.status === 'Paused')) ||
         (autoStatus === 'Delivered' && project.status === 'WIP') ||
         (autoStatus === 'WIP' && (project.status === 'Delivered' || project.status === 'Complete' || project.status === 'Paused'));

       if (shouldSync && project.status !== 'Cancelled') {
         projectService.updateProject(project.id, { status: autoStatus as ProjectStatus });
         setProject(prev => prev ? { ...prev, status: autoStatus as ProjectStatus } : null);
       }
    }
  }, [autoStatus, project?.status]);

  const handleDeleteProject = async () => {
    if (!id || !project) return;
    
    if (window.confirm(`CRITICAL SYSTEM OVERRIDE: Are you sure you want to permanently purge ${project.clientName}? All telemetry, milestones, and reports will be lost.`)) {
      setIsDeleting(true);
      try {
        console.log('Initiating project purge for ID:', id);
        await projectService.deleteProject(id);
        showSuccess('Project purged successfully.');
        console.log('Purge sequence completed');
        navigate('/projects');
      } catch (error: any) {
        console.error('Purge Failed:', error);
        let displayError = error.message;
        try {
          const parsed = JSON.parse(error.message);
          displayError = parsed.error || error.message;
        } catch (e) {
          // not JSON
        }
        showError('SYSTEM ERROR during purge: ' + displayError);
        setIsDeleting(false);
      }
    }
  };

  if (loading) return <div className="h-64 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!project) return <div className="text-center py-20 text-slate-500">Project not found</div>;

  const totalProgress = phases.length > 0
    ? Math.round(phases.reduce((acc, p) => acc + (p.progress || 0), 0) / phases.length)
    : 0;

  const totalMilestoneValue = phases.reduce((acc, ph) => acc + (ph.value || 0), 0);
  const budgetWarning = totalMilestoneValue > project.amount;

  const updateProjectStatus = async (newStatus: any) => {
    if (!id || isSubmitting) return;

    if (newStatus === 'Delivered' || newStatus === 'Complete') {
      setPendingStatus(newStatus);
      setIsSettingDeliveryDate(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await projectService.updateProject(id, { status: newStatus });
      await loadData();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalizeDelivery = async () => {
    if (!id || !pendingStatus || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await projectService.updateProject(id, { 
        status: pendingStatus,
        deliveryDate: deliveryDate
      });
      setIsSettingDeliveryDate(false);
      setPendingStatus(null);
      await loadData();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredLogs = logs
    .filter(log => {
      const devMatch = !filterDevId || log.developerId === filterDevId;
      const shiftMatch = !filterShift || log.shift === filterShift;
      const phaseIdMatch = !filterPhaseId || log.phaseId === filterPhaseId;
      const phaseNameMatch = !filterPhaseId || (log as any).phaseName === phases.find(p => p.id === filterPhaseId)?.phaseName;
      return devMatch && shiftMatch && (phaseIdMatch || phaseNameMatch);
    })
    // De-duplicate by ID (in case state is updated multiple times)
    .filter((log, index, self) => index === self.findIndex((t) => t.id === log.id));

  const handleDeleteLog = async (logId: string) => {
    if (window.confirm('Delete this activity log?')) {
      setIsSubmitting(true);
      try {
        await progressService.deleteDailyProgress(logId);
        await loadData();
      } catch (error) {
        console.error(error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white p-4 sm:p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden relative group">
        <div className="absolute top-0 left-0 h-1.5 bg-indigo-600 transition-all duration-1000" style={{ width: `${totalProgress}%` }}></div>
        <div className="flex flex-col gap-8">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <button 
                onClick={() => navigate('/projects')} 
                className="flex items-center gap-2 text-slate-400 hover:text-indigo-600 text-[10px] font-black uppercase tracking-[0.2em] transition-all group/back"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover/back:-translate-x-1 transition-transform" />
                Back to Portfolio
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={isDeleting}
                className="flex items-center gap-2 text-rose-400 hover:text-rose-600 text-[9px] font-black uppercase tracking-widest transition-all px-3 py-1.5 rounded-xl hover:bg-rose-50 disabled:opacity-50 border border-transparent hover:border-rose-100"
              >
                <Trash2 className={cn("w-3.5 h-3.5", isDeleting && "animate-pulse")} />
                {isDeleting ? 'Purging...' : 'Purge Project'}
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-none">{project.clientName}</h1>
                <button 
                  onClick={() => setIsEditingProject(true)}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 transition-all sm:opacity-0 group-hover:opacity-100"
                  title="Edit Project Details"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn(
                    "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] border shadow-sm",
                    project.status === 'WIP' ? "bg-amber-50 text-amber-600 border-amber-200" :
                    project.status === 'Paused' ? "bg-slate-50 text-slate-600 border-slate-200" :
                    project.status === 'Ready for Delivery' ? "bg-indigo-100 text-indigo-700 border-indigo-200 shadow-md animate-pulse" :
                    project.status === 'Complete' ? "bg-emerald-600 text-white border-emerald-700 shadow-lg" :
                    project.status === 'Delivered' ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                    "bg-rose-50 text-rose-600 border-rose-200"
                  )}>
                    {project.status === 'WIP' ? 'In Progress' : project.status}
                  </span>

                  {project.deliveryDate && (
                    <span className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] bg-indigo-50 text-indigo-600 border border-indigo-200 shadow-sm flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3" />
                      Delivered: {formatDate(project.deliveryDate)}
                    </span>
                  )}
                  
                  <div className="relative">
                    <select 
                      className="text-[9px] font-black uppercase tracking-widest bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-slate-500 outline-none hover:border-indigo-300 transition-all appearance-none cursor-pointer"
                      value={project.status}
                      onChange={(e) => updateProjectStatus(e.target.value)}
                    >
                      <option value="WIP">Set WIP</option>
                      <option value="Paused">Set Paused</option>
                      <option value="Ready for Delivery">Set Ready for Delivery</option>
                      <option value="Delivered">Set Delivered</option>
                      <option value="Complete">Set Complete</option>
                      <option value="Cancelled">Set Cancelled</option>
                    </select>
                    <ChevronRight className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Management Instance: {project.projectId}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 lg:grid-cols-5">
            <StatCard 
              icon={DollarSign} 
              label="Net Fee Structure (80%)" 
              value={`$${project.netAmount.toLocaleString()}`} 
              subValue={`Gross Project Total: $${project.amount.toLocaleString()}`} 
              color={budgetWarning ? 'rose' : 'indigo'} 
            />
            <StatCard icon={Clock} label="Operational Age" value={`${calculateProjectAge(project.startDate)} Days`} subValue={`Since ${formatDate(project.startDate)}`} color="amber" />
            <StatCard icon={Layers} label="Milestone Alloc" value={`$${totalMilestoneValue.toLocaleString()}`} subValue={`Allocated of $${project.amount.toLocaleString()}`} color="indigo" />
            <StatCard icon={TrendingUp} label="Total Completion" value={`${totalProgress}%`} subValue={`${phases.filter(p => p.status === 'Delivered' || (p as any).status === 'Complete').length}/${phases.length} Phases Done`} color="emerald" />
            <StatCard icon={History} label="Log Density" value={`${logs.length}`} subValue="Total Updates" color="slate" />
          </div>
        </div>
      </div>

      {/* KPI Management Modal */}
      {isManagingKPI && kpiPhase && project && (
        <KPIAllocationModal 
          phase={kpiPhase} 
          projectId={project.id} 
          developers={developers} 
          project={project}
          onClose={() => {
            setIsManagingKPI(false);
            setKpiPhase(null);
          }} 
          onSave={() => {
            setIsManagingKPI(false);
            setKpiPhase(null);
            loadData();
          }} 
        />
      )}

      {/* Tabs Control */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-full lg:w-auto overflow-x-auto no-scrollbar">
          {[
            { id: 'phases', label: 'Milestones', icon: CheckCircle2 },
            { id: 'progress', label: 'Activity Hub', icon: History },
            { id: 'issues', label: 'Issue Tracker', icon: MessageSquare },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 lg:flex-none flex items-center justify-center gap-3 px-6 py-3 text-[10px] font-black transition-all rounded-xl uppercase tracking-[0.15em] whitespace-nowrap",
                activeTab === tab.id 
                  ? "bg-slate-900 text-white shadow-xl shadow-slate-900/10" 
                  : "text-slate-400 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'phases' && (
          <button
            onClick={() => setIsAddingMilestone(true)}
            className="flex items-center justify-center gap-3 bg-emerald-600 text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 active:scale-95 w-full lg:w-auto"
          >
            <Plus className="w-5 h-5" />
            <span>Add Milestone</span>
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'phases' && project && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-10">
            {phases.map((phase) => (
              <PhaseCard 
                key={phase.id} 
                phase={phase} 
                developers={developers} 
                onUpdate={() => loadData()} 
                projectId={project.id}
                project={project}
                onManageKPI={(p: PhaseTracking) => {
                  setKpiPhase(p);
                  setIsManagingKPI(true);
                }} 
              />
            ))}
          </div>
        )}

        {activeTab === 'progress' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
            <div className="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6">
              <DailyUpdateForm 
                projectId={project.id} 
                developers={developers} 
                phases={phases} 
                onSave={() => loadData()} 
                projectOwnerId={project.ownerId}
              />
            </div>
            
            <div className="lg:col-span-3 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-2">
                <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                  <div className="w-2 h-8 bg-indigo-600 rounded-full" />
                  Execution Timeline
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <select 
                    className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-500 outline-none hover:border-indigo-300 transition-all shadow-sm focus:ring-2 focus:ring-indigo-500 appearance-none min-w-[140px]"
                    value={filterDevId}
                    onChange={(e) => setFilterDevId(e.target.value)}
                  >
                    <option value="">All Developers</option>
                    {developers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select 
                    className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-500 outline-none hover:border-indigo-300 transition-all shadow-sm focus:ring-2 focus:ring-indigo-500 appearance-none min-w-[140px]"
                    value={filterPhaseId}
                    onChange={(e) => setFilterPhaseId(e.target.value)}
                  >
                    <option value="">All Milestones</option>
                    {phases.map(p => <option key={p.id} value={p.id}>{p.phaseName}</option>)}
                  </select>
                  <select 
                    className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-500 outline-none hover:border-indigo-300 transition-all shadow-sm focus:ring-2 focus:ring-indigo-500 appearance-none min-w-[140px]"
                    value={filterShift}
                    onChange={(e) => setFilterShift(e.target.value)}
                  >
                    <option value="">All Shifts</option>
                    <option value="Day">Day Shift</option>
                    <option value="Night">Night Shift</option>
                  </select>
                </div>
              </div>
              {filteredLogs.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] py-24 text-center">
                  <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-inner">
                    <History className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">
                    {logs.length === 0 ? "No historical logs available" : "No logs match the selected filters"}
                  </p>
                </div>
              ) : (
                <div className="space-y-4 md:space-y-6">
                  {filteredLogs.map(log => (
                    <div key={log.id} className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-xl hover:border-indigo-200 transition-all group overflow-hidden relative">
                      <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 uppercase tracking-widest">{formatDate(log.date)}</span>
                          {log.shift && (
                             <span className={cn(
                               "text-[10px] font-black px-3 py-1.5 rounded-lg border uppercase tracking-widest",
                               log.shift === 'Day' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-blue-900 text-blue-50 border-blue-800 shadow-sm"
                             )}>
                               {log.shift} Shift
                             </span>
                          )}
                          {log.phaseName && (
                            <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 uppercase tracking-widest">
                              {log.phaseName}
                            </span>
                          )}
                          {log.reasonIfNoWork && (
                            <span className={cn(
                              "text-[10px] font-black px-3 py-1.5 rounded-lg border uppercase tracking-widest",
                              log.reasonIfNoWork === 'SLA Maintenance Blocker'
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "text-rose-600 bg-rose-50 border border-rose-100"
                            )}>
                              {log.reasonIfNoWork}
                            </span>
                          )}
                          <button 
                            onClick={() => handleDeleteLog(log.id)}
                            disabled={isSubmitting}
                            className="ml-auto p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                          >
                            <Trash2 className={cn("w-3.5 h-3.5", isSubmitting && "animate-pulse")} />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mb-3">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black border shadow-sm",
                                log.developerId === 'SYSTEM' ? "bg-indigo-600 text-white border-indigo-700" : "bg-white text-slate-500 border-slate-200"
                              )}>
                                {log.developerId === 'SYSTEM' ? <TrendingUp className="w-4 h-4" /> : (developers.find(d => d.id === log.developerId)?.name[0] || '?')}
                              </div>
                              <span className={cn(
                                "text-[11px] font-black uppercase tracking-widest",
                                log.developerId === 'SYSTEM' ? "text-indigo-600" : "text-slate-900"
                              )}>
                                {log.developerId === 'SYSTEM' ? 'SYSTEM LOG' : (developers.find(d => d.id === log.developerId)?.name || 'Unknown')}
                              </span>
                            </div>
                        </div>

                        {/* Targeted Goal & Actual Achieved Dashboard */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/60 p-4 rounded-2xl border border-slate-100/80 mb-3 shadow-inner">
                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 font-mono">
                              <Target className="w-3.5 h-3.5 text-rose-500" />
                              Targeted Goal
                            </span>
                            <p className="text-xs font-bold text-slate-800 leading-relaxed">
                              {log.dailyTarget || 'No Target Declared'}
                            </p>
                          </div>
                          <div className="space-y-1 sm:border-l sm:border-slate-200/60 sm:pl-4">
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 font-mono">
                              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                              Actual Achieved
                            </span>
                            <p className="text-xs font-black text-indigo-600 leading-relaxed">
                              {log.actualDone || 'No Delta Declared'}
                            </p>
                          </div>
                        </div>

                        {/* Collapsible Developer Notes */}
                        {log.description && (
                          <div className="mt-2.5">
                            <button
                              type="button"
                              onClick={() => setExpandedLogs(prev => ({ ...prev, [log.id]: !prev[log.id] }))}
                              className="text-[10px] font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1.5 cursor-pointer py-1"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>{expandedLogs[log.id] ? 'Hide Developer Notes' : 'Show Developer Notes (Optional)'}</span>
                              {expandedLogs[log.id] ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                            <AnimatePresence>
                              {expandedLogs[log.id] && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-2 p-3 bg-white border border-slate-150/60 rounded-xl text-xs text-slate-500 italic leading-relaxed">
                                    "{log.description}"
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-center justify-center min-w-[140px] md:border-l md:border-slate-100 md:pl-6 h-full">
                        <div className="text-4xl font-black text-slate-900 tracking-tighter group-hover:text-indigo-600 transition-colors">{log.progressPercentage}%</div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Phase Sync</p>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner ring-1 ring-slate-200/50">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${log.progressPercentage}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="h-full bg-indigo-600 rounded-full" 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
             <div className="lg:col-span-1">
              <IssueForm projectId={project.id} phases={phases} onSave={() => loadData()} />
            </div>
            <div className="lg:col-span-3 space-y-6">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">System Reliability Report</h3>
              {issues.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl py-20 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                    <MessageSquare className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Registry is clean</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {issues.map(issue => {
                    const linkedPhase = phases.find(p => p.id === issue.phaseId);
                    return (
                      <div key={issue.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between gap-6 hover:shadow-md transition-shadow">
                        <div className="flex gap-5">
                          <div className={cn(
                            "mt-1 p-3 rounded-2xl border",
                            issue.status === 'Open' ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                          )}>
                            {issue.status === 'Open' ? <AlertCircle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-100 rounded">{issue.type}</span>
                               {linkedPhase && (
                                 <>
                                   <span className="text-[10px] font-bold text-slate-300">•</span>
                                   <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase tracking-widest">
                                     {linkedPhase.phaseName}
                                   </span>
                                 </>
                               )}
                               <span className="text-[10px] font-bold text-slate-300">•</span>
                               <span className="text-[10px] font-bold text-slate-400">Captured {formatDate(issue.createdAt)}</span>
                            </div>
                            <p className="text-slate-800 font-bold text-lg mb-1 leading-tight">{issue.description}</p>
                            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Status: {issue.status}</p>
                          </div>
                        </div>
                        {issue.status === 'Open' && (
                          <button
                            onClick={async () => {
                              if (isSubmitting) return;
                              setIsSubmitting(true);
                              try {
                                await progressService.updateIssue(project.id, issue.id, 'Resolved');
                                await loadData();
                              } catch (e) {
                                console.error(e);
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            disabled={isSubmitting}
                            className="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-all shadow-lg shadow-emerald-500/20 uppercase tracking-widest active:scale-95 whitespace-nowrap disabled:opacity-50"
                          >
                            {isSubmitting ? 'Resolving...' : 'Resolve Now'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAddingMilestone && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-xl shadow-2xl p-8"
            >
              <AddMilestoneForm 
                projectId={project.id} 
                onClose={() => setIsAddingMilestone(false)} 
                onSave={() => loadData()} 
              />
            </motion.div>
          </div>
        )}

        {isSettingDeliveryDate && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-8"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Confirm Delivery</h3>
                  <button onClick={() => setIsSettingDeliveryDate(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                    <Plus className="w-5 h-5 rotate-45" />
                  </button>
                </div>
                
                <p className="text-slate-500 text-sm font-medium">Please specify the final delivery date for this project registry.</p>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Final Delivery Date</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={deliveryDate}
                    onChange={(e) => setLocalDeliveryDate(e.target.value)}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setIsSettingDeliveryDate(false)} className="flex-1 py-3.5 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-all">Cancel</button>
                  <button 
                    onClick={handleFinalizeDelivery}
                    disabled={isSubmitting}
                    className="flex-[2] py-3.5 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Updating...' : 'Confirm Completion'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Project Edit Modal */}
      {isEditingProject && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[80] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Edit Project Details</h3>
              <button onClick={() => setIsEditingProject(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Assign Leader</label>
                <select 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                  value={projectEditData.ownerId}
                  onChange={(e) => setProjectEditData({ ...projectEditData, ownerId: e.target.value })}
                >
                  <option value={auth.currentUser?.uid || ''}>Admin (Self)</option>
                  {leaders.map(leader => (
                    <option key={leader.id} value={leader.uid || leader.id}>Leader: {leader.name}</option>
                  ))}
                  {projectEditData.ownerId && projectEditData.ownerId !== auth.currentUser?.uid && !leaders.some(l => (l.uid === projectEditData.ownerId || l.id === projectEditData.ownerId)) && (
                    <option value={projectEditData.ownerId}>Current Owner</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Stakeholder / Client Name</label>
                <input 
                  type="text" 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={projectEditData.clientName}
                  onChange={(e) => setProjectEditData({ ...projectEditData, clientName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Total Project Budget ($)</label>
                <input 
                  type="number" 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={projectEditData.amount}
                  onChange={(e) => setProjectEditData({ ...projectEditData, amount: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                onClick={() => setIsEditingProject(false)} 
                className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateProject} 
                className="flex-1 py-4 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-xl shadow-slate-900/10 hover:bg-indigo-600 transition-all active:scale-95"
              >
                Save Intelligence
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function AddMilestoneForm({ projectId, onClose, onSave }: { projectId: string, onClose: () => void, onSave: () => void }) {
  const [formData, setFormData] = useState({
    phaseName: 'UI/UX' as PhaseName,
    orderId: '',
    value: 0,
    month: getGMT6DateString().slice(0, 7), // YYYY-MM
    startDate: getGMT6DateString(),
    startTime: '09:00',
    expectedDeliveryDate: getGMT6DateString(),
    expectedDeliveryTime: '18:00',
    actualDeliveryDate: getGMT6DateString(),
    status: 'In Progress' as PhaseStatus,
    progress: 0,
    developerIds: [] as string[],
    resourceLinks: {} as any
  });
  const [saving, setSaving] = useState(false);
  const [devs, setDevs] = useState<Developer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    developerService.getAllDevelopers().then(setDevs).catch(console.error);
  }, []);

  const filteredDevs = devs.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { 
        ...formData,
        kpiAllocations: [],
        originalDeliveryDate: formData.expectedDeliveryDate,
        totalExtensionDays: 0,
        extensions: []
    };
    try {
      await progressService.addPhase(projectId, payload);
      onSave();
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-bold text-slate-900 tracking-tight">New Milestone</h3>
        <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
           <Plus className="w-5 h-5 rotate-45" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Phase Type</label>
          <select 
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
            value={formData.phaseName}
            onChange={(e) => setFormData({ ...formData, phaseName: e.target.value as PhaseName })}
          >
            {phaseOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Milestone Title / Ref</label>
          <input 
            type="text"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="e.g. M-101"
            value={formData.orderId}
            onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
            {formData.status === 'Delivered' ? 'Delivery Date' : 'Incoming Date'}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input 
              type="date"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formatDateForInput(formData.startDate)}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
            <input 
              type="time"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Target Delivery</label>
          <div className="grid grid-cols-2 gap-3">
            <input 
              type="date"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.expectedDeliveryDate}
              onChange={(e) => {
                const dateVal = e.target.value;
                const date = new Date(dateVal);
                const month = dateVal ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
                setFormData({ 
                  ...formData, 
                  expectedDeliveryDate: dateVal, 
                  actualDeliveryDate: formData.actualDeliveryDate === formData.expectedDeliveryDate ? dateVal : formData.actualDeliveryDate,
                  month 
                });
              }}
            />
            <input 
              type="time"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.expectedDeliveryTime}
              onChange={(e) => setFormData({ ...formData, expectedDeliveryTime: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-rose-500 uppercase tracking-widest pl-1">Actual Fiverr Delivery Date</label>
          <input 
            type="date"
            className="w-full px-4 py-3 bg-slate-50 border border-rose-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all outline-none"
            value={formData.actualDeliveryDate}
            onChange={(e) => setFormData({ ...formData, actualDeliveryDate: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Milestone Value ($)</label>
          <input 
            type="number"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
            value={formData.value}
            onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Assign Developers</label>
        <div className="relative mb-2">
          <label htmlFor="dev-search-new" className="sr-only">Search developers</label>
          <input 
            id="dev-search-new"
            type="text"
            placeholder="Search developers..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2">
          {filteredDevs.map(dev => (
              <button
                key={dev.id}
                type="button"
                onClick={() => {
                  const isSelected = formData.developerIds.includes(dev.id);
                  let newDevs = [];

                  if (isSelected) {
                    newDevs = formData.developerIds.filter(id => id !== dev.id);
                  } else {
                    newDevs = [...formData.developerIds, dev.id];
                  }
                  setFormData({ ...formData, developerIds: newDevs });
                }}
              className={cn(
                "flex items-center gap-2 p-2 rounded-xl border text-[10px] font-bold transition-all text-left",
                formData.developerIds.includes(dev.id) ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
              )}
            >
              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black", formData.developerIds.includes(dev.id) ? "bg-white/20" : "bg-indigo-50 text-indigo-600")}>
                {dev.name[0]}
              </div>
              <span className="truncate">{dev.name}</span>
            </button>
          ))}
          {filteredDevs.length === 0 && (
            <p className="col-span-2 text-center py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">No developers found</p>
          )}
        </div>
      </div>

      <div className="flex gap-4 pt-4">
        <button type="button" onClick={onClose} className="flex-1 py-3.5 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-all">Cancel</button>
        <button 
          type="submit" 
          disabled={saving} 
          className="flex-[2] py-3.5 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Initialize Milestone'}
        </button>
      </div>
    </form>
  );
}

function KPIAllocationModal({ phase, projectId, developers, onClose, onSave, project }: { phase: PhaseTracking, projectId: string, developers: Developer[], onClose: () => void, onSave: () => void, project: Project }) {
  const { showSuccess, showError, showWarning } = useSnackbar();
  const netRatio = project.amount > 0 ? project.netAmount / project.amount : 0.8;
  const netPhaseValue = (phase.value || 0) * netRatio;

  // Initialize and ensure values are net-based
  const [allocations, setAllocations] = useState<KPIAllocation[]>(() => {
    const existing = phase.kpiAllocations || [];
    return existing.map(a => ({
      ...a,
      value: Math.round((netPhaseValue * a.percentage) / 100)
    }));
  });
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const totalPercentage = allocations.reduce((sum, a) => sum + (Number(a.percentage) || 0), 0);
  const totalValue = allocations.reduce((sum, a) => sum + (Number(a.value) || 0), 0);

  const handleSave = async () => {
    if (totalPercentage !== 100) {
      showWarning(`Total allocation must be exactly 100%. Current: ${totalPercentage}%`);
      return;
    }
    setIsSaving(true);
    try {
      await progressService.updatePhase(projectId, phase.id, {
        ...phase,
        kpiAllocations: allocations
      });
      showSuccess('KPI allocation updated successfully!');
      onSave();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredDevs = developers.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    !allocations.some(a => a.developerId === d.id)
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 sm:p-8 pb-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">KPI Performance Split</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Milestone: {phase.phaseName} ({phase.orderId})</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400" aria-label="Close modal">
             <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 sm:p-8 py-4 overflow-y-auto space-y-6 flex-1 no-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="space-y-4">
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4 mb-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Project Net Amount (80%)</p>
                    <p className="text-base font-black text-slate-900 leading-none">${Math.round(project.netAmount).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Project Total Gross</p>
                    <p className="text-sm font-bold text-slate-500 leading-none">${project.amount.toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Milestone Net KPI Fund (80% of Milestone)</p>
                    <p className="text-xl font-black text-indigo-600 leading-none">${Math.round(netPhaseValue).toLocaleString()}</p>
                    <p className="text-[9px] font-bold text-slate-400 mt-1">Milestone Gross: ${phase.value?.toLocaleString() || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Allocated Sum</p>
                    <p className={cn("text-xl font-black mb-1", totalPercentage === 100 ? "text-emerald-600" : "text-rose-500")}>
                      {totalPercentage}%
                    </p>
                    <p className="text-[10px] font-black text-slate-400 tracking-tight">${totalValue.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 mb-2">Allocated Team</p>
              <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-2 no-scrollbar">
                {allocations.map((alloc, idx) => {
                  const dev = developers.find(d => d.id === alloc.developerId);
                  return (
                    <div key={alloc.id} className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">{dev?.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{dev?.role}</p>
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/55">
                            ${(alloc.value || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="w-20">
                        <div className="relative">
                          <input 
                            type="number"
                            className="w-full pl-2 pr-6 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black focus:ring-1 focus:ring-indigo-500 outline-none"
                            value={alloc.percentage}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const newAllocs = [...allocations];
                              newAllocs[idx] = { 
                                ...alloc, 
                                percentage: val,
                                value: Math.round((netPhaseValue * val) / 100)
                              };
                              setAllocations(newAllocs);
                            }}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 font-mono">%</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setAllocations(allocations.filter(a => a.id !== alloc.id))}
                        className="p-1.5 text-slate-300 hover:text-rose-600 transition-colors"
                        aria-label="Remove developer from KPI"
                      >
                        <Plus className="w-4 h-4 rotate-45" />
                      </button>
                    </div>
                  );
                })}
                {allocations.length === 0 && (
                  <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No developers assigned</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Add Contributors</p>
              <input 
                type="text"
                placeholder="Search talent..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="grid grid-cols-1 gap-2 max-h-[45vh] overflow-y-auto pr-2 no-scrollbar">
                {filteredDevs.map(dev => (
                  <button 
                    key={dev.id}
                    onClick={() => {
                      const remaining = Math.max(0, 100 - totalPercentage);
                      setAllocations([...allocations, {
                        id: crypto.randomUUID(),
                        developerId: dev.id,
                        percentage: remaining > 0 ? remaining : 0,
                        value: Math.round((netPhaseValue * (remaining > 0 ? remaining : 0)) / 100),
                        includeInKPI: true
                      }]);
                    }}
                    className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-600 transition-all text-left group"
                  >
                    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors uppercase">
                      {dev.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-bold text-slate-900 truncate leading-none">{dev.name}</p>
                        {!phase.developerIds?.includes(dev.id) && (
                          <span className="text-[7.5px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded leading-none">
                            Unassigned
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{dev.role}</p>
                    </div>
                    <PlusIcon className="w-4 h-4 text-slate-200 group-hover:text-indigo-600 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 sm:p-8 pt-4 border-t border-slate-100 flex gap-4 flex-shrink-0 bg-slate-50/50">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl uppercase tracking-widest text-[10px] transition-colors">Cancel</button>
          <button 
            disabled={isSaving || totalPercentage !== 100}
            onClick={handleSave}
            className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 uppercase tracking-widest text-[10px] transition-all disabled:opacity-50"
          >
            {isSaving ? 'Synchronizing...' : 'Finalize KPI Split'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subValue, color }: any) {
  const themes: any = {
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    slate: "bg-slate-50 text-slate-600 border-slate-100"
  };
  return (
    <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-sm group hover:bg-slate-50 transition-colors">
      <div className={cn("p-2 sm:p-2.5 rounded-2xl w-fit mb-3 sm:mb-4 border shadow-sm group-hover:scale-110 transition-transform", themes[color])}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5">{label}</p>
      <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tighter truncate" title={String(value)}>{value}</p>
      <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 line-clamp-1">{subValue}</p>
    </div>
  );
}

interface PhaseCardProps {
  key?: string | number;
  phase: PhaseTracking;
  developers: Developer[];
  onUpdate: () => void | Promise<void>;
  projectId: string;
  project: Project;
  onManageKPI?: (phase: PhaseTracking) => void;
}

function ExtensionModal({ phase, projectId, onClose, onUpdate }: { phase: PhaseTracking, projectId: string, onClose: () => void, onUpdate: () => void }) {
  const [days, setDays] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleApplyExtension = async () => {
    if (days <= 0 || !reason) return;
    setIsSaving(true);
    try {
      const currentTarget = new Date(phase.expectedDeliveryDate || phase.startDate);
      const newTarget = new Date(currentTarget.getTime() + days * 24 * 60 * 60 * 1000);
      
      const newEvent: any = {
        id: crypto.randomUUID(),
        days,
        reason,
        previousDate: phase.expectedDeliveryDate || phase.startDate,
        newDate: newTarget.toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };

      const updatedData = {
        ...phase,
        expectedDeliveryDate: newEvent.newDate,
        originalDeliveryDate: phase.originalDeliveryDate || phase.expectedDeliveryDate || phase.startDate,
        extensions: [...(phase.extensions || []), newEvent],
        totalExtensionDays: (phase.totalExtensionDays || 0) + days
      };

      await progressService.updatePhase(projectId, phase.id, updatedData);
      onUpdate();
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[80] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Timeline Extension</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
             <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Current Target</span>
              <span className="text-sm font-black text-amber-600">{formatDate(phase.expectedDeliveryDate || phase.startDate)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Extension Days</label>
            <input 
              type="number"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none"
              placeholder="e.g. 7"
              value={days || ''}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Reason for Delay</label>
            <textarea 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none h-24"
              placeholder="Explain why this extension is required..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-4 pt-2">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">Cancel</button>
          <button 
            disabled={isSaving || days <= 0 || !reason}
            onClick={handleApplyExtension}
            className="flex-1 py-3 bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-200 disabled:opacity-50"
          >
            {isSaving ? 'Applying...' : 'Apply Extension'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PhaseCard({ phase, developers, onUpdate, projectId, project, onManageKPI }: PhaseCardProps) {
  const { showSuccess, showError, showWarning } = useSnackbar();
  const [isEditing, setIsEditing] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [devSearch, setDevSearch] = useState('');
  const [formData, setFormData] = useState({ 
    ...phase,
    actualDeliveryDate: phase.actualDeliveryDate || phase.expectedDeliveryDate || '',
    month: phase.month || getGMT6DateString().slice(0, 7)
  });

  useEffect(() => {
    if (isEditing) {
      setFormData({
        ...phase,
        actualDeliveryDate: phase.actualDeliveryDate || phase.expectedDeliveryDate || '',
        month: phase.month || getGMT6DateString().slice(0, 7)
      });
    }
  }, [isEditing, phase]);

  const getCountdown = (dateString?: string) => {
    if (!dateString) return null;
    const target = new Date(dateString);
    const now = new Date();
    const diff = target.getTime() - now.getTime();
    
    if (diff < 0) {
      const absDiff = Math.abs(diff);
      const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
      return { label: `${days}d Overdue`, color: 'text-rose-600' };
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (days >= 3) {
      return { label: `${days}d ${hours}h ${minutes}m ${seconds}s Remaining`, color: 'text-emerald-600' };
    } else if (days > 0) {
      return { label: `${days}d ${hours}h ${minutes}m ${seconds}s Remaining`, color: 'text-rose-600' };
    } else if (hours > 0) {
      return { label: `${hours}h ${minutes}m ${seconds}s Remaining`, color: 'text-rose-600' };
    } else {
      return { label: `${minutes}m ${seconds}s Remaining`, color: 'text-rose-600 animate-pulse' };
    }
  };

  const [timeLeft, setTimeLeft] = useState(getCountdown(phase.expectedDeliveryDate));
  const [fiverrTimeLeft, setFiverrTimeLeft] = useState(getCountdown(phase.actualDeliveryDate || phase.expectedDeliveryDate));

  useEffect(() => {
    if (!phase.expectedDeliveryDate || phase.status === 'Delivered') return;
    
    const timer = setInterval(() => {
      setTimeLeft(getCountdown(phase.expectedDeliveryDate));
      setFiverrTimeLeft(getCountdown(phase.actualDeliveryDate || phase.expectedDeliveryDate));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [phase.expectedDeliveryDate, phase.actualDeliveryDate, phase.status]);

  const statusColors: Record<string, string> = {
    'Pending': 'bg-slate-100 text-slate-500 border-slate-200',
    'In Progress': 'bg-indigo-50 text-indigo-600 border-indigo-200',
    'Delivered': 'bg-emerald-600 text-white border-emerald-700 shadow-sm',
    'Cancelled': 'bg-rose-50 text-rose-600 border-rose-200',
    'Delayed': 'bg-rose-100 text-rose-700 border-rose-250 animate-pulse font-bold',
    'Extension Requested': 'bg-amber-100 text-amber-700 border-amber-250 animate-pulse font-bold',
    'Ready for Delivery': 'bg-violet-100 text-violet-700 border-violet-200 font-extrabold'
  };

  const handleResolveExtension = async (extId: string, decision: 'Approved' | 'Rejected') => {
    setIsSaving(true);
    try {
      const currentExtensions = phase.extensions || [];
      const targetExt = currentExtensions.find((e: any) => e.id === extId);
      
      if (!targetExt) {
        showWarning("Extension request not found.");
        return;
      }

      // Update the extension item status
      const updatedExtensions = currentExtensions.map((e: any) => 
        e.id === extId ? { ...e, status: decision } : e
      );

      // Solve new target date and total extension days
      let updatedDeliveryDate = phase.expectedDeliveryDate || phase.startDate || getGMT6DateString();
      let updatedTotalDays = phase.totalExtensionDays || 0;

      if (decision === 'Approved') {
        updatedDeliveryDate = targetExt.newDate;
        updatedTotalDays = (phase.totalExtensionDays || 0) + (targetExt.days || 1);
      }

      // Determine correct final phase status dynamically
      const mockUpdatedPhase: PhaseTracking = {
        ...phase,
        extensions: updatedExtensions,
        expectedDeliveryDate: updatedDeliveryDate,
        totalExtensionDays: updatedTotalDays
      };
      
      // Clear status from "Extension Requested" back to real dynamic status
      const resolvedStatus = resolvePhaseStatus(mockUpdatedPhase);

      const updateData: Partial<PhaseTracking> = {
        extensions: updatedExtensions,
        expectedDeliveryDate: updatedDeliveryDate,
        totalExtensionDays: updatedTotalDays,
        status: resolvedStatus
      };

      await progressService.updatePhase(projectId, phase.id, updateData);

      // Resolve overall project status as well
      const projectPhases = await progressService.getPhases(projectId);
      const updatedPhases = projectPhases?.map(p => p.id === phase.id ? { ...p, ...updateData } : p) || [];
      const newProjStatus = resolveProjectStatus(project, updatedPhases);
      if (newProjStatus !== project.status) {
        await projectService.updateProject(projectId, { status: newProjStatus });
      }

      showSuccess(`Timeline extension request ${decision.toLowerCase()} successfully!`);
      onUpdate();
    } catch (err) {
      console.error(err);
      showError("Failed to resolve extension request.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      const updatedData = { ...formData };
      
      // Clean up records for any developer that has been unassigned from developerIds
      if (updatedData.developerIds) {
        // Clean up developerProgress mapping
        if (updatedData.developerProgress) {
          const cleanedDevProgress: { [developerId: string]: number } = {};
          updatedData.developerIds.forEach(id => {
            if (updatedData.developerProgress?.[id] !== undefined) {
              cleanedDevProgress[id] = updatedData.developerProgress[id];
            }
          });
          updatedData.developerProgress = cleanedDevProgress;
        }

        // Clean up developerWeights mapping
        if (updatedData.developerWeights) {
          const cleanedWeights: { [developerId: string]: number } = {};
          updatedData.developerIds.forEach(id => {
            if (updatedData.developerWeights?.[id] !== undefined) {
              cleanedWeights[id] = updatedData.developerWeights[id];
            }
          });
          updatedData.developerWeights = cleanedWeights;
        }


      }

      // Automatically calculate overall phase progress based on user's selected weights / developer sub-progress values
      updatedData.progress = calcOverallProgress(updatedData);
      
      // Automatically resolve the actual phase status
      updatedData.status = resolvePhaseStatus(updatedData);
      
      await progressService.updatePhase(projectId, phase.id, updatedData);
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete the milestone "${phase.phaseName}"? This action cannot be undone.`)) {
      setIsPurging(true);
      try {
        await progressService.deletePhase(projectId, phase.id);
        onUpdate();
      } catch (error) {
        console.error(error);
      } finally {
        setIsPurging(false);
      }
    }
  };

  const currentDevs = developers.filter((d: any) => phase.developerIds.includes(d.id));

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden hover:shadow-2xl hover:border-indigo-200 transition-all group flex flex-col h-full bg-gradient-to-b from-white to-slate-50/50">
      <div className="p-8 flex flex-col h-full">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-900/10 group-hover:bg-indigo-600 transition-colors">
              <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-bold text-slate-900 text-xl tracking-tight leading-none">{phase.phaseName}</h4>
                {phase.orderId && <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 tracking-widest">{phase.orderId}</span>}
              </div>
              {phase.value && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 flex items-center gap-1">
                    <DollarSign className="w-2.5 h-2.5" />
                    Val: ${phase.value.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">Net: ${Math.round(phase.value * (project.netAmount / project.amount)).toLocaleString()}</span>
                  <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 flex items-center gap-1 ml-1">
                    <Clock className="w-2.5 h-2.5" />
                    {phase.status === 'Delivered' ? `Delivered: ${formatDate(phase.endDate || phase.startDate)} at ${phase.startTime || 'N/A'}` : `Age: ${calculateAge(phase.startDate)} Days`}
                  </span>
                  {phase.totalExtensionDays > 0 && (
                    <button 
                      onClick={() => setShowHistory(true)}
                      className="text-[10px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 flex items-center gap-1 hover:bg-rose-100 transition-colors"
                    >
                      <AlertCircle className="w-2.5 h-2.5" />
                      Ext: +{phase.totalExtensionDays} Days
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className={cn("px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border mb-1 block", statusColors[phase.status])}>
              {phase.status}
            </span>
            {timeLeft && phase.status !== 'Delivered' && (
              <div className="text-right mb-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Internal Target</span>
                <span className={cn("text-xs font-black uppercase flex items-center justify-end gap-1.5", timeLeft.color)}>
                  <Clock className="w-3.5 h-3.5" />
                  {timeLeft.label}
                </span>
              </div>
            )}
            {fiverrTimeLeft && phase.status !== 'Delivered' && (
              <div className="text-right">
                <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest block">Fiverr Deadline</span>
                <span className={cn("text-xs font-black uppercase flex items-center justify-end gap-1.5", fiverrTimeLeft.color)}>
                  <Clock className="w-3.5 h-3.5" />
                  {fiverrTimeLeft.label}
                </span>
                {(() => {
                  const days = getDaysRemaining(phase.actualDeliveryDate || phase.expectedDeliveryDate);
                  return days <= 3 ? (
                    <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 text-[9px] font-black px-2 py-0.5 rounded border border-rose-200 uppercase tracking-wider animate-pulse mt-1">
                      ⚠️ Fiverr Extension Needed
                    </span>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
           <div className="flex items-center justify-between mb-2">
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Phase Progress</span>
             <span className="text-xs font-black text-indigo-600">{phase.progress || 0}%</span>
           </div>
           <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-50">
             <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${phase.progress || 0}%` }}></div>
           </div>
        </div>

        <div className="space-y-6 flex-1">
          {/* Developers - Only show if assigned */}
          {currentDevs.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Assign Developers</p>
                <div className="flex flex-wrap gap-2">
                  {currentDevs.map((dev, devIdx) => (
                    <div key={`${dev.id}-${devIdx}`} className="flex items-center gap-2.5 bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
                      <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center text-[10px] font-black text-indigo-600 border border-indigo-150">
                        {dev.name[0]}
                      </div>
                      <span className="text-xs font-bold text-slate-700">{dev.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Developer progress breakdown (Request 1 & 2) */}
              <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-150/70 space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                  <span>Developer-Wise Progress Breakdown</span>
                  <span className="text-indigo-600 font-extrabold lowercase">by weight</span>
                </p>
                <div className="space-y-2">
                  {currentDevs.map(dev => {
                    const progress = phase.developerProgress?.[dev.id] !== undefined ? phase.developerProgress[dev.id] : 0;
                    const weight = phase.developerWeights?.[dev.id] !== undefined ? phase.developerWeights[dev.id] : 100 / currentDevs.length;
                    return (
                      <div key={dev.id} className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          {dev.name} 
                          <span className="text-[9px] text-indigo-600 font-extrabold uppercase bg-indigo-50/70 px-1.5 py-0.5 rounded border border-indigo-100/50">Weight: {Math.round(weight)}%</span>
                        </span>
                        <span className="font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">{progress}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Links - Only show if they exist */}
          {Object.entries(phase.resourceLinks).some(([_, value]) => !!value) && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Documentation Assets</p>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(phase.resourceLinks).map(([key, value]) => (
                  value && (
                    <a key={key} href={value} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-slate-100 hover:bg-slate-900 hover:text-white transition-all group/link shadow-sm active:scale-95">
                      <span className="text-[10px] font-bold uppercase tracking-widest">{key}</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-40 group-hover/link:opacity-100 transition-opacity" />
                    </a>
                  )
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setIsExtending(true)}
              className="py-3.5 bg-amber-50 text-amber-600 font-bold text-[10px] uppercase tracking-widest rounded-2xl hover:bg-amber-100 transition-all flex items-center justify-center gap-2 active:scale-95 border border-amber-100"
            >
              <Clock className="w-3.5 h-3.5" />
              Extensions
            </button>
            <button 
              onClick={() => setIsEditing(true)}
              className="py-3.5 bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              Configure
            </button>
          </div>
          
          <button 
            onClick={() => {
              if (phase.status === 'Delivered') {
                if (onManageKPI) onManageKPI(phase);
              } else {
                setIsEditing(true);
              }
            }}
            className={cn(
              "py-4 font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-xl",
              phase.status === 'Delivered' 
                ? "bg-emerald-600 text-white shadow-emerald-500/20 hover:bg-emerald-700" 
                : "bg-slate-900 text-white shadow-slate-900/10 hover:bg-indigo-600"
            )}
          >
            {phase.status === 'Delivered' ? (
              <>
                <TrendingUp className="w-4 h-4" />
                Manage Individual KPIs
              </>
            ) : (
              <>
                Update Milestone
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Extension History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Extension History</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Milestone: {phase.phaseName}</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                 <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Original Delivery</p>
                  <p className="text-sm font-black text-slate-900">{formatDate(phase.originalDeliveryDate || phase.startDate)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest leading-none mb-1">Total Extension</p>
                  <p className="text-sm font-black text-rose-500">+{phase.totalExtensionDays || 0} Days</p>
                </div>
              </div>

              {phase.extensions?.map((ext: any, idx: number) => {
                const isPending = ext.status === 'Pending' || !ext.status;
                const isRejected = ext.status === 'Rejected';
                const isApproved = ext.status === 'Approved' || (ext.status === undefined && ext.days > 0);

                return (
                  <div key={ext.id} className={cn(
                    "relative pl-6 py-4 border-l-2",
                    isPending ? "border-amber-400 bg-amber-50/50 rounded-r-2xl pr-4 my-2" :
                    isRejected ? "border-rose-400 bg-rose-50/50 rounded-r-2xl pr-4 my-2" : "border-emerald-400"
                  )}>
                    <div className={cn(
                      "absolute top-5 -left-[9px] w-4 h-4 rounded-full border-4 border-white shadow-sm",
                      isPending ? "bg-amber-500 animate-pulse" :
                      isRejected ? "bg-rose-500" : "bg-emerald-500"
                    )} />
                    <div className="flex justify-between items-start mb-2">
                      <span className={cn(
                        "text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-widest",
                        isPending ? "bg-amber-100 text-amber-800 border-amber-300" :
                        isRejected ? "bg-rose-105 text-rose-800 border-rose-300 bg-rose-100" : "bg-emerald-100 text-emerald-800 border-emerald-300"
                      )}>
                        {isPending ? "Pending Review" : isRejected ? "Rejected" : "Approved"}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 italic">{formatDate(ext.createdAt)}</span>
                    </div>
                    <h5 className="text-sm font-black text-slate-900 mb-1">+{ext.days} Days Requested</h5>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed italic mb-3">"{ext.reason}"</p>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-100 pt-2">
                      <div className="flex items-center gap-2">
                        <span>From: {formatDate(ext.previousDate)}</span>
                        <ChevronRight className="w-3 h-3" />
                        <span className="text-indigo-600 font-black">New Target: {formatDate(ext.newDate)}</span>
                      </div>
                      
                      {isPending && (
                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          <button
                            onClick={() => handleResolveExtension(ext.id, 'Rejected')}
                            className="px-2.5 py-1 text-[8px] bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest rounded-lg transition-all active:scale-95"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleResolveExtension(ext.id, 'Approved')}
                            className="px-2.5 py-1 text-[8px] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest rounded-lg transition-all active:scale-95"
                          >
                            Approve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={() => setShowHistory(false)} className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-95">
              Close Breakdown
            </button>
          </motion.div>
        </div>
      )}

      {/* Extension Modal */}
      {isExtending && (
        <ExtensionModal 
          phase={phase} 
          projectId={projectId} 
          onClose={() => setIsExtending(false)} 
          onUpdate={onUpdate} 
        />
      )}

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="bg-white rounded-3xl w-full max-w-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-6 sm:p-8 pb-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Manage {phase.phaseName}</h3>
              <button 
                onClick={() => setIsEditing(false)} 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                aria-label="Close modal"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            
            {/* Scrollable Modal Body */}
            <div className="p-6 sm:p-8 py-4 overflow-y-auto space-y-6 flex-1 no-scrollbar">
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Milestone Name</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none hover:border-slate-300 transition-colors"
                      value={formData.phaseName}
                      onChange={(e) => setFormData({ ...formData, phaseName: e.target.value as any })}
                    >
                      {phaseOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Order ID</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none hover:border-slate-300 transition-colors"
                      value={formData.orderId || ''}
                      onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
                      placeholder="e.g. M-001"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                      <span>Overall Milestone Progress</span>
                      <span className="text-indigo-600 font-black">{formData.progress || 0}%</span>
                    </label>
                    <input 
                      type="range"
                      className="w-full accent-indigo-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer mt-4 disabled:opacity-50"
                      value={formData.progress || 0}
                      min="0"
                      max="100"
                      disabled={formData.developerIds && formData.developerIds.length > 0}
                      onChange={(e) => setFormData({ ...formData, progress: Number(e.target.value) })}
                    />
                    {formData.developerIds && formData.developerIds.length > 0 && (
                      <p className="text-[9px] text-slate-400 mt-1 italic">
                        Derived automatically from the dev-wise progress breakdown below. Set sub-progress there to update overall completion.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">Milestone Value ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                      <input 
                        type="number"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm hover:border-slate-300 transition-colors"
                        value={formData.value || ''}
                        onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                        placeholder="e.g. 1000"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Status</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none hover:border-slate-300 transition-colors"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Delivered">Delivered</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {formData.status === 'Delivered' ? 'Delivery Date' : 'Incoming Date'}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <input 
                        type="date"
                        className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold outline-none"
                        value={formatDateForInput(formData.startDate)}
                        onChange={(e) => {
                          const newDate = e.target.value;
                          if (formData.status === 'Delivered') {
                            setFormData({ ...formData, startDate: newDate, endDate: newDate });
                          } else {
                            setFormData({ ...formData, startDate: newDate });
                          }
                        }}
                      />
                      <input 
                        type="time"
                        className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs font-bold outline-none"
                        value={formData.startTime || ''}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Target Delivery</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input 
                        type="date"
                        className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold outline-none"
                        value={formData.expectedDeliveryDate || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ 
                            ...formData, 
                            expectedDeliveryDate: val,
                            actualDeliveryDate: formData.actualDeliveryDate === formData.expectedDeliveryDate ? val : formData.actualDeliveryDate
                          });
                        }}
                      />
                      <input 
                        type="time"
                        className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs font-bold outline-none"
                        value={formData.expectedDeliveryTime || ''}
                        onChange={(e) => setFormData({ ...formData, expectedDeliveryTime: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-2">Actual Fiverr Delivery Date</label>
                    <input 
                      type="date"
                      className="w-full px-3 py-3 bg-slate-50 border border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-500 text-sm font-bold outline-none"
                      value={formData.actualDeliveryDate || ''}
                      onChange={(e) => setFormData({ ...formData, actualDeliveryDate: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Assign Developers</label>
                  <div className="relative mb-2">
                    <label htmlFor={`dev-search-${phase.id}`} className="sr-only">Search developers</label>
                    <input 
                      id={`dev-search-${phase.id}`}
                      type="text"
                      placeholder="Search developers..."
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={devSearch}
                      onChange={(e) => setDevSearch(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 no-scrollbar">
                    {developers
                      .filter(d => d.name.toLowerCase().includes(devSearch.toLowerCase()))
                      .map(dev => {
                        const isSelected = formData.developerIds.includes(dev.id);
                        return (
                          <button
                            key={dev.id}
                            type="button"
                            onClick={() => {
                              let newDevs: string[] = [];
                              if (isSelected) {
                                newDevs = formData.developerIds.filter((id: string) => id !== dev.id);
                              } else {
                                newDevs = [...formData.developerIds, dev.id];
                              }
                              // Recalculate average progress in real-time
                              const draftPhase = { ...formData, developerIds: newDevs };
                              const updatedProgress = calcOverallProgress(draftPhase);
                              setFormData({ 
                                ...formData, 
                                developerIds: newDevs,
                                progress: updatedProgress
                              });
                            }}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-xl border text-[10px] font-black transition-all text-left",
                              isSelected ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                            )}
                          >
                            <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black", isSelected ? "bg-white/20" : "bg-indigo-50 text-indigo-600")}>
                              {dev.name[0]}
                            </div>
                            <span className="truncate">{dev.name}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {formData.developerIds.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Developer Metrics Assignment</label>
                    <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200/60 space-y-4">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                        Control individual developer sub-progress and statistical importance weights:
                      </p>
                      <div className="space-y-3">
                        {developers
                          .filter(d => formData.developerIds.includes(d.id))
                          .map(dev => {
                            const currentWeight = formData.developerWeights?.[dev.id] !== undefined ? formData.developerWeights[dev.id] : 100 / formData.developerIds.length;
                            const currentProgress = formData.developerProgress?.[dev.id] !== undefined ? formData.developerProgress[dev.id] : 0;
                            return (
                              <div key={dev.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-150 shadow-sm">
                                <span className="text-xs font-bold text-slate-700 truncate">{dev.name}</span>
                                <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-start">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">Progress:</span>
                                    <input 
                                      type="number"
                                      min="0"
                                      max="100"
                                      placeholder="Progress"
                                      className="w-14 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 text-center outline-none"
                                      value={Math.round(currentProgress)}
                                      onChange={(e) => {
                                        const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                        const progressMap = { ...formData.developerProgress };
                                        progressMap[dev.id] = val;
                                        // Recalculate average progress in real-time
                                        const draftPhase = { ...formData, developerProgress: progressMap };
                                        const updatedProgress = calcOverallProgress(draftPhase);
                                        setFormData({ 
                                          ...formData, 
                                          developerProgress: progressMap,
                                          progress: updatedProgress
                                        });
                                      }}
                                    />
                                    <span className="text-[10px] font-black text-slate-400">%</span>
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">Weight:</span>
                                    <input 
                                      type="number"
                                      min="0"
                                      max="100"
                                      placeholder="Weight"
                                      className="w-14 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500 text-center outline-none"
                                      value={Math.round(currentWeight)}
                                      onChange={(e) => {
                                        const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                        const weights = { ...formData.developerWeights };
                                        weights[dev.id] = val;
                                        // Recalculate average progress in real-time
                                        const draftPhase = { ...formData, developerWeights: weights };
                                        const updatedProgress = calcOverallProgress(draftPhase);
                                        setFormData({ 
                                          ...formData, 
                                          developerWeights: weights,
                                          progress: updatedProgress
                                        });
                                      }}
                                    />
                                    <span className="text-[10px] font-black text-slate-400">%</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Resource Links</label>
                  <div className="space-y-2.5">
                    <input placeholder="Figma Link" className="w-full text-xs px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50" value={formData.resourceLinks.figma || ''} onChange={(e) => setFormData({ ...formData, resourceLinks: { ...formData.resourceLinks, figma: e.target.value } })} />
                    <input placeholder="GitLab Link" className="w-full text-xs px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50" value={formData.resourceLinks.gitlab || ''} onChange={(e) => setFormData({ ...formData, resourceLinks: { ...formData.resourceLinks, gitlab: e.target.value } })} />
                    <input placeholder="Live Link / App Link" className="w-full text-xs px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50" value={formData.resourceLinks.liveApp || ''} onChange={(e) => setFormData({ ...formData, resourceLinks: { ...formData.resourceLinks, liveApp: e.target.value } })} />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 sm:p-8 pt-4 border-t border-slate-100 flex gap-4 flex-shrink-0 bg-slate-50/50">
              <button 
                onClick={handleDelete} 
                disabled={isPurging || isSaving}
                className="p-3.5 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100 transition-colors disabled:opacity-50 flex-shrink-0 border border-rose-100"
                title="Delete Milestone"
              >
                <Trash2 className={cn("w-5 h-5", isPurging && "animate-pulse")} />
              </button>
              <button 
                onClick={() => setIsEditing(false)} 
                disabled={isSaving || isPurging} 
                className="flex-1 py-3.5 bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold rounded-2xl disabled:opacity-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                disabled={isSaving || isPurging} 
                className="flex-[2] py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-100 disabled:opacity-50 transition-colors text-sm"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function DailyUpdateForm({ projectId, developers, phases, onSave, projectOwnerId }: { projectId: string, developers: Developer[], phases: PhaseTracking[], onSave: () => void | Promise<void>, projectOwnerId?: string }) {
  const { showSuccess, showError } = useSnackbar();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    date: getGMT6DateString(),
    developerId: '',
    shift: 'Day' as Shift,
    phaseId: '',
    description: '',
    dailyTarget: '',
    actualDone: '',
    progressPercentage: 0,
    reasonIfNoWork: undefined as any
  });

  // Filter developers based on selected milestone
  const selectedPhase = phases.find(p => p.id === formData.phaseId);
  const filteredDevelopers = selectedPhase 
    ? developers.filter(d => selectedPhase.developerIds?.includes(d.id))
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      // Clean undefined values for Firestore compatibility
      const cleanData = Object.entries(formData).reduce((acc: any, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
      }, {});

      await progressService.addDailyProgress({ ...cleanData, projectId, ownerId: projectOwnerId });

      if (formData.phaseId && formData.developerId) {
        const targetPhase = phases.find(p => p.id === formData.phaseId);
        if (targetPhase) {
          const updatedProgressMap = { ...(targetPhase.developerProgress || {}), [formData.developerId]: formData.progressPercentage };
          const dummyPhase = { ...targetPhase, developerProgress: updatedProgressMap };
          const calculatedOverall = calcOverallProgress(dummyPhase);
          const newStatus = resolvePhaseStatus(dummyPhase);

          await progressService.updatePhase(projectId, targetPhase.id, {
            developerProgress: updatedProgressMap,
            progress: calculatedOverall,
            status: newStatus,
            ...(calculatedOverall === 100 ? { endDate: getGMT6DateString() } : {})
          });
        }
      }
      
      setFormData({
        date: getGMT6DateString(),
        developerId: '',
        shift: 'Day',
        phaseId: '',
        description: '',
        dailyTarget: '',
        actualDone: '',
        progressPercentage: 0,
        reasonIfNoWork: undefined
      });
      showSuccess('Daily log submitted successfully!');
      await onSave();
    } catch (error: any) {
      console.error('Failed to submit log:', error);
      let errorMsg = 'Failed to submit log.';
      try {
        const parsed = JSON.parse(error.message);
        errorMsg = parsed.error || errorMsg;
      } catch (e) {}
      showError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-slate-900 font-primary">Log Daily Update</h3>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 rounded-lg border border-amber-100">
           <Clock className="w-3 h-3 text-amber-600" />
           <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">
             Deadline: {formData.shift === 'Night' ? '11:59 AM' : '11:59 PM'} GMT+6
           </span>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Update Date</label>
          <input required type="date" max={getGMT6DateString()} className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
        </div>
        
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Associated Milestone</label>
          <select required className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.phaseId} onChange={(e) => {
            const phase = phases.find(p => p.id === e.target.value);
            setFormData({ 
              ...formData, 
              phaseId: e.target.value, 
              phaseName: phase?.phaseName,
              developerId: '' // Clear developer selection when milestone changes
            } as any);
          }}>
            <option value="">Select Milestone</option>
            {phases.map(p => <option key={p.id} value={p.id}>{p.phaseName} {p.orderId ? `(${p.orderId})` : ''}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Developer</label>
          <select 
            required 
            disabled={!formData.phaseId}
            className="w-full px-4 py-2 bg-slate-50 border rounded-xl disabled:opacity-50 disabled:cursor-not-allowed" 
            value={formData.developerId} 
            onChange={(e) => {
              const devId = e.target.value;
              const dev = developers.find(d => d.id === devId);
              const selectedPhase = phases.find(p => p.id === formData.phaseId);
              const currentDevProgress = selectedPhase?.developerProgress?.[devId] !== undefined 
                ? selectedPhase.developerProgress[devId] 
                : 0;
              setFormData({ 
                ...formData, 
                developerId: devId, 
                shift: dev?.shift || 'Day',
                progressPercentage: currentDevProgress
              });
            }}
          >
            <option value="">{formData.phaseId ? 'Select Developer' : 'Select Milestone First'}</option>
            {filteredDevelopers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.role})</option>)}
          </select>
          {!formData.phaseId && <p className="text-[9px] text-slate-400 mt-1 italic">Please select a milestone to see assigned developers.</p>}
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Operational Shift</label>
          <select required className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.shift} onChange={(e) => setFormData({ ...formData, shift: e.target.value as Shift })}>
            <option value="Day">Day Shift</option>
            <option value="Night">Night Shift</option>
          </select>
        </div>
        
        <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reason for No Work (Working Day if empty)</label>
            <select className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.reasonIfNoWork || ''} onChange={(e) => {
              const reason = e.target.value || undefined;
              setFormData({ 
                ...formData, 
                reasonIfNoWork: reason,
                // If it's leave/sick, progress is 0
                progressPercentage: reason ? 0 : formData.progressPercentage
              });
            }}>
                <option value="">Working Day</option>
                <option value="Developer Off Day">Developer Off Day</option>
                <option value="Sick Leave">Sick Leave</option>
                <option value="Client Issue">Client Issue</option>
                <option value="General Leave">General Leave</option>
            </select>
            <p className="text-[9px] text-slate-400 mt-1 italic">Selecting a reason excludes this day from performance calculation.</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Developer Milestone Progress (%)</label>
            <span className="text-blue-600 font-bold text-xs">{formData.progressPercentage}%</span>
          </div>
          <input 
            type="range" 
            className="w-full accent-blue-600 disabled:opacity-50" 
            value={formData.progressPercentage} 
            min="0" 
            max="100" 
            disabled={!!formData.reasonIfNoWork && formData.reasonIfNoWork !== 'Client Issue'}
            onChange={(e) => setFormData({ ...formData, progressPercentage: Number(e.target.value) })} 
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Today's Target</label>
          <input 
            required={!formData.reasonIfNoWork} 
            className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-sm" 
            placeholder={formData.reasonIfNoWork ? "N/A" : "e.g. Design 3 mobile screens"} 
            value={formData.dailyTarget} 
            onChange={(e) => setFormData({ ...formData, dailyTarget: e.target.value })} 
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Actually Achieved</label>
          <input 
            required={!formData.reasonIfNoWork} 
            className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-sm" 
            placeholder={formData.reasonIfNoWork ? "N/A" : "e.g. Completed header and footer"} 
            value={formData.actualDone} 
            onChange={(e) => setFormData({ ...formData, actualDone: e.target.value })} 
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Work Description (Extra Notes)</label>
          <textarea 
            className="w-full px-4 py-2 bg-slate-50 border rounded-xl h-24" 
            placeholder={formData.reasonIfNoWork ? "Details about leave/sick..." : "Describe today's achievements..."} 
            value={formData.description} 
            onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
          />
        </div>
        <button 
          type="submit" 
          disabled={submitting}
          className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Log'}
        </button>
      </form>
    </div>
  );
}

function IssueForm({ projectId, phases, onSave }: { projectId: string, phases: PhaseTracking[], onSave: () => void | Promise<void> }) {
  const { showSuccess, showError } = useSnackbar();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    type: 'Internal Issue' as any,
    status: 'Open' as any,
    phaseId: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const payload = { ...formData };
    if (!payload.phaseId) delete (payload as any).phaseId;
    
    try {
      await progressService.addIssue(projectId, payload);
      setFormData({ description: '', type: 'Internal Issue', status: 'Open', phaseId: '' });
      showSuccess('Blocker/Issue registered successfully.');
      await onSave();
    } catch (error: any) {
      console.error('Failed to report issue:', error);
      let errorMsg = 'Failed to report issue.';
      try {
        const parsed = JSON.parse(error.message);
        errorMsg = parsed.error || errorMsg;
      } catch (e) {}
      showError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
     <div className="bg-white p-8 rounded-3xl border border-slate-200">
      <h3 className="text-xl font-bold text-slate-900 mb-6">Report Issue</h3>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Issue Type</label>
          <select required className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}>
            <option value="Internal Issue">Internal Issue</option>
            <option value="Client Issue">Client Issue</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Relate to Milestone (Optional)</label>
          <select className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.phaseId} onChange={(e) => setFormData({ ...formData, phaseId: e.target.value })}>
            <option value="">General Project Issue</option>
            {phases.map(p => <option key={p.id} value={p.id}>{p.phaseName} {p.orderId ? `(${p.orderId})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</label>
          <textarea required className="w-full px-4 py-2 bg-slate-50 border rounded-xl h-32" placeholder="What happened?" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
        </div>
        <button 
          type="submit" 
          disabled={submitting}
          className="w-full py-4 bg-red-600 text-white font-bold rounded-2xl shadow-lg shadow-red-100 hover:bg-red-700 transition-all disabled:opacity-50"
        >
          {submitting ? 'Reporting...' : 'Report Issue'}
        </button>
      </form>
    </div>
  );
}
