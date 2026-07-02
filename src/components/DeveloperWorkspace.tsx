import React, { useEffect, useState } from 'react';
import { 
  Briefcase, 
  Clock, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  TrendingUp, 
  User, 
  ChevronRight, 
  Sliders, 
  PlusCircle, 
  BookOpen, 
  HelpCircle,
  Activity,
  ArrowUpRight,
  Sparkles,
  RefreshCw,
  Send,
  Wrench,
  Trash2,
  Loader2
} from 'lucide-react';
import { db, auth } from '@/src/lib/firebase';
import { developerService } from '@/src/services/developerService';
import { projectService } from '@/src/services/projectService';
import { progressService } from '@/src/services/progressService';
import { Developer, Project, PhaseTracking, DailyProgress, Issue, PhaseStatus, NoWorkReason, MaintenanceProject } from '@/src/types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, resolvePhaseStatus, resolveProjectStatus, calculateProjectAge, calcOverallProgress, calculateDeveloperPerformanceScore, getGMT6DateString } from '@/src/lib/utils';
import { useSnackbar } from '@/src/components/Snackbar';

const getPhaseCountdown = (dateString?: string) => {
  if (!dateString) return null;
  const target = new Date(dateString);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  const daysRemaining = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    return { daysRemaining: -days, label: `${days}d overdue`, color: 'text-rose-600 font-extrabold animate-pulse bg-rose-50 border-rose-200' };
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days >= 3) {
    return { daysRemaining: days, label: `${days}d ${hours}h remaining`, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
  } else if (days > 0) {
    return { daysRemaining: days, label: `⚠️ Only ${days}d ${hours}h left`, color: 'text-amber-700 bg-amber-50 border-amber-200 font-bold' };
  } else {
    return { daysRemaining: 0, label: `⚠️ Due today! Only ${hours}h left`, color: 'text-amber-700 bg-amber-50 border-amber-200 font-black animate-pulse' };
  }
};

export function DeveloperWorkspace() {
  const { showSuccess, showError, showWarning } = useSnackbar();
  const [currentDev, setCurrentDev] = useState<Developer | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignedPhases, setAssignedPhases] = useState<Array<{ project: Project; phase: PhaseTracking }>>([]);
  const [myLogs, setMyLogs] = useState<DailyProgress[]>([]);
  const [myIssues, setMyIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeProjectTab, setActiveProjectTab] = useState<string | null>(null);

  // Forms states
  const [selectedPhaseForLog, setSelectedPhaseForLog] = useState<{ project: Project; phase: PhaseTracking } | null>(null);
  const [selectedPhaseForExt, setSelectedPhaseForExt] = useState<{ project: Project; phase: PhaseTracking } | null>(null);
  const [selectedProjectForIssue, setSelectedProjectForIssue] = useState<Project | null>(null);
  const [logNoWork, setLogNoWork] = useState<string>('');
  const [selectedMntProjLogId, setSelectedMntProjLogId] = useState<string>('');
  const [logDate, setLogDate] = useState<string>('');
  const [selectedMntForLog, setSelectedMntForLog] = useState<MaintenanceProject | null>(null);

  useEffect(() => {
    if (selectedMntForLog) {
      const today = getGMT6DateString();
      setLogDate(today);
    }
  }, [selectedMntForLog]);

  useEffect(() => {
    if (selectedPhaseForLog) {
      const today = getGMT6DateString();
      setLogDate(today);
      
      const parts = today.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dayOfWeek = new Date(y, m, d).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          setLogNoWork('Developer Off Day');
        } else {
          setLogNoWork('');
        }
      } else {
        setLogNoWork('');
      }
      setSelectedMntProjLogId('');
    }
  }, [selectedPhaseForLog]);

  const getIsWeekend = (dateStr: string) => {
    if (!dateStr) return false;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return false;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dayOfWeek = new Date(y, m, d).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  const isOffDayOrWeekend = getIsWeekend(logDate) || !!logNoWork;

  const handleDateChange = (newDate: string) => {
    setLogDate(newDate);
    const parts = newDate.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dayOfWeek = new Date(y, m, d).getDay();
      
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        if (!logNoWork) {
          setLogNoWork('Developer Off Day');
        }
      } else {
        if (logNoWork === 'Developer Off Day') {
          setLogNoWork('');
        }
      }
    }
  };

  // Success alert triggers
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Maintenance form and update states
  const [mntProjectName, setMntProjectName] = useState('');
  const [mntType, setMntType] = useState<'Lite' | 'Moderate' | 'Heavy'>('Lite');

  const handleUpdateMaintenance = async (updatedProjects: any[]) => {
    if (!currentDev) return;
    
    // Save state for rollback
    const previousDev = { ...currentDev };
    
    // Optimistic UI update
    setCurrentDev({
      ...currentDev,
      maintenanceProjects: updatedProjects
    });

    setSubmitting(true);
    try {
      await developerService.updateDeveloper(currentDev.id, {
        maintenanceProjects: updatedProjects
      });
      showNotification('Maintenance log updated successfully!');
    } catch (err) {
      console.error(err);
      setCurrentDev(previousDev);
      showError('Failed to update maintenance. Reverted changes.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    loadDeveloperData();
  }, []);

  const loadDeveloperData = async () => {
    try {
      setLoading(true);
      const email = auth.currentUser?.email;
      if (!email) {
        console.warn("[DIAGNOSTIC] No signed-in auth user email found.");
        return;
      }

      // 1. Fetch Developer profile matching current email
      console.log("[DIAGNOSTIC] Fetching developer profile for email:", email);
      const devProfile = await developerService.getDeveloperByEmail(email);
      if (!devProfile) {
        console.warn("[DIAGNOSTIC] No developer profile matched for email:", email);
        setLoading(false);
        await auth.signOut();
        return;
      }
      console.log("[DIAGNOSTIC] Developer Profile found:", devProfile);
      setCurrentDev(devProfile);

      // 2. Fetch all projects
      console.log("[DIAGNOSTIC] Fetching all projects...");
      const allProjects = await projectService.getAllProjects();
      const safeProjects = allProjects || [];
      console.log("[DIAGNOSTIC] Projects fetched count:", safeProjects.length, safeProjects);
      setProjects(safeProjects);

      // 3. For each project, fetch its phases and pick the ones assigned to this developer
      const phasesList: Array<{ project: Project; phase: PhaseTracking }> = [];
      const issuesList: Issue[] = [];

      console.log("[DIAGNOSTIC] Concurrent fetches for project subcollections starting...");
      await Promise.all(safeProjects.map(async (project) => {
        // Fetch phases with local try/catch
        try {
          const phases = await progressService.getPhases(project.id);
          if (phases) {
            phases.forEach(phase => {
              const isAssignedDev = phase.developerIds?.includes(devProfile.id);
              const myKpiAlloc = phase.kpiAllocations?.find(a => a.developerId === devProfile.id);
              const hasKPIAllocated = !!(myKpiAlloc && myKpiAlloc.percentage > 0);
              if (isAssignedDev || hasKPIAllocated) {
                const resStatus = resolvePhaseStatus(phase);
                phasesList.push({ project, phase: { ...phase, status: resStatus } });
              }
            });
          }
        } catch (phaseError) {
          console.error(`[DIAGNOSTIC] Failed to load phases for project ${project.id} (${project.clientName}):`, phaseError);
        }

        // Fetch issues with local try/catch
        try {
          const issues = await progressService.getIssues(project.id);
          if (issues) {
            issuesList.push(...issues);
          }
        } catch (issueError) {
          console.error(`[DIAGNOSTIC] Failed to load issues for project ${project.id} (${project.clientName}):`, issueError);
        }
      }));

      // Sort phases: WIP first, then Delayed, then Extension Requested, then Pending, then Delivered
      phasesList.sort((a, b) => {
        const order: Record<PhaseStatus, number> = { 
          'In Progress': 1, 
          'Delayed': 2, 
          'Extension Requested': 3, 
          'Pending': 4, 
          'Ready for Delivery': 5,
          'Delivered': 6, 
          'Cancelled': 7 
        };
        return (order[a.phase.status] || 8) - (order[b.phase.status] || 8);
      });

      console.log("[DIAGNOSTIC] Resolved phases list:", phasesList);
      console.log("[DIAGNOSTIC] Resolved issues list:", issuesList);

      setAssignedPhases(phasesList);
      setMyIssues(issuesList);

      if (phasesList.length > 0 && !activeProjectTab) {
        setActiveProjectTab(phasesList[0].phase.id);
      }

      // 4. Fetch all general progress logs of the developer
      console.log("[DIAGNOSTIC] Fetching daily progress logs for dev ID:", devProfile.id);
      try {
        const filteredLogs = await progressService.getDailyProgressByDeveloper(devProfile.id);
        console.log("[DIAGNOSTIC] Daily progress logs fetched successfully:", filteredLogs);
        setMyLogs(filteredLogs);
      } catch (logError) {
        console.error(`[DIAGNOSTIC] Failed to load daily progress logs for developer ${devProfile.id}:`, logError);
        setMyLogs([]);
      }

    } catch (error) {
      console.error('[DIAGNOSTIC] Uncaught exception in loadDeveloperData:', error);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message: string) => {
    showSuccess(message);
  };

  const handleUpdateDeveloperProgress = async (projectId: string, phaseId: string, currentPhase: PhaseTracking, value: number) => {
    if (!currentDev) return;
    setSubmitting(true);
    try {
      if (value === 100) {
        // Enforce Rule 6: At least one update log & No unresolved high-priority issues
        const logsForPhase = myLogs.filter(log => log.phaseId === phaseId && log.developerId === currentDev.id);
        if (logsForPhase.length === 0) {
          showWarning("Cannot mark progress as 100% without having filed at least one update log for this milestone.");
          await loadDeveloperData();
          setSubmitting(false);
          return;
        }

        const highIssues = myIssues.filter(issue => 
          issue.projectId === projectId && 
          (!issue.phaseId || issue.phaseId === phaseId) && 
          issue.priority === 'High' && 
          issue.status !== 'Resolved'
        );
        if (highIssues.length > 0) {
          showWarning(`Cannot set progress to 100%. This project/milestone holds unresolved high-priority issues raised by developers.`);
          await loadDeveloperData();
          setSubmitting(false);
          return;
        }
      }

      const updatedProgressMap = { ...(currentPhase.developerProgress || {}), [currentDev.id]: value };
      const dummyPhase = { ...currentPhase, developerProgress: updatedProgressMap };
      const calculatedOverall = calcOverallProgress(dummyPhase);
      const newStatus = resolvePhaseStatus(dummyPhase);

      const updateData: Partial<PhaseTracking> = {
        developerProgress: updatedProgressMap,
        progress: calculatedOverall,
        status: newStatus,
        ...(calculatedOverall === 100 ? { endDate: getGMT6DateString() } : {})
      };

      await progressService.updatePhase(projectId, phaseId, updateData);

      const targetProject = projects.find(p => p.id === projectId);
      if (targetProject) {
        const projectPhases = await progressService.getPhases(projectId);
        const updatedPhases = projectPhases?.map(p => p.id === phaseId ? { ...p, ...updateData } : p) || [];
        const newProjStatus = resolveProjectStatus(targetProject, updatedPhases);
        if (newProjStatus !== targetProject.status) {
          await projectService.updateProject(projectId, { status: newProjStatus });
        }
      }

      showNotification(`Successfully updated progress to ${value}%`);
      await loadDeveloperData();
    } catch (err) {
      console.error(err);
      showError('Failed to update progress');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddDailyProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDev || !selectedPhaseForLog) return;
    setSubmitting(true);

    try {
      const f = e.target as any;
      const noWork = f.noWork.value;
      const targetLogDate = f.date.value || getGMT6DateString();

      // Rule 1: One progress log per project per day
      const hasLoggedProjectToday = myLogs.some(log => 
        log.projectId === selectedPhaseForLog.project.id && 
        log.date === targetLogDate
      );
      if (hasLoggedProjectToday) {
        showWarning(`You have already submitted a progress log for the project "${selectedPhaseForLog.project.clientName}" on ${targetLogDate}. Only one progress log per project per day is permitted.`);
        setSubmitting(false);
        return;
      }

      // Rule 2: Progress cannot go elements backward (only checked for today/future dates)
      const currentPhase = selectedPhaseForLog.phase;
      const pastProgress = currentPhase.developerProgress?.[currentDev.id] !== undefined 
        ? currentPhase.developerProgress[currentDev.id] 
        : 0;

      // Automatically force progress to stay unchanged if off-day, leave, or maintenance blocker is selected
      let ownProgress = Number(f.ownProgress.value);
      if (noWork) {
        ownProgress = pastProgress;
      }

      const localToday = getGMT6DateString();
      const isPastDate = targetLogDate < localToday;

      if (!isPastDate && ownProgress < pastProgress) {
        showWarning(`Progress cannot go backward. Your current progress for this milestone is ${pastProgress}%, so you cannot set it to ${ownProgress}%.`);
        setSubmitting(false);
        return;
      }

      if (ownProgress === 100) {
        // Enforce Rule 6: At least one update log is satisfied (logging now), check unresolved high-priority issues
        const highIssues = myIssues.filter(issue => 
          issue.projectId === selectedPhaseForLog.project.id && 
          (!issue.phaseId || issue.phaseId === selectedPhaseForLog.phase.id) && 
          issue.priority === 'High' && 
          issue.status !== 'Resolved'
        );
        if (highIssues.length > 0) {
          showWarning(`Cannot set progress to 100%. This project/milestone holds ${highIssues.length} unresolved high-priority issue(s). Please resolve or close them first.`);
          setSubmitting(false);
          return;
        }
      }
      
      const updatedDevProgress = { ...(currentPhase.developerProgress || {}), [currentDev.id]: ownProgress };
      const dummyPhase = { ...currentPhase, developerProgress: updatedDevProgress };
      const calculatedOverallVal = calcOverallProgress(dummyPhase);
      const phaseStatus = resolvePhaseStatus(dummyPhase);

      let dailyTarget = f.target.value?.trim();
      let actualDone = f.achieved.value?.trim();

      const isOffDayOrWeekendLocal = getIsWeekend(targetLogDate) || !!noWork;
      if (isOffDayOrWeekendLocal) {
        if (!dailyTarget) {
          dailyTarget = noWork ? `Status Block: ${noWork}` : "Off Day / Weekend Rest";
        }
        if (!actualDone) {
          actualDone = noWork ? `Inactive due to ${noWork}` : "Inactive - Weekend Off Channel";
        }
      }

      const logData = {
        date: targetLogDate,
        projectId: selectedPhaseForLog.project.id,
        phaseId: selectedPhaseForLog.phase.id,
        phaseName: selectedPhaseForLog.phase.phaseName,
        developerId: currentDev.id,
        description: f.description.value,
        dailyTarget,
        actualDone,
        progressPercentage: ownProgress,
        shift: currentDev.shift || 'Day',
        ownerId: selectedPhaseForLog.project.ownerId || currentDev.ownerId,
        ...(noWork ? { reasonIfNoWork: noWork as NoWorkReason } : {})
      };

      await progressService.addDailyProgress(logData);

      const shouldUpdatePhase = !isPastDate || ownProgress > pastProgress;

      if (shouldUpdatePhase) {
        const updatedPhaseData: Partial<PhaseTracking> = {
          developerProgress: updatedDevProgress,
          progress: calculatedOverallVal,
          status: phaseStatus,
          ...(calculatedOverallVal === 105 || calculatedOverallVal === 100 ? { endDate: getGMT6DateString() } : {})
        };
        await progressService.updatePhase(selectedPhaseForLog.project.id, selectedPhaseForLog.phase.id, updatedPhaseData);

        // Verify and transition overall project status if applicable
        const project = selectedPhaseForLog.project;
        if (project) {
          const projectPhases = await progressService.getPhases(project.id);
          const updatedPhases = projectPhases?.map(p => p.id === currentPhase.id ? { ...p, ...updatedPhaseData } : p) || [];
          const newProjStatus = resolveProjectStatus(project, updatedPhases);
          if (newProjStatus !== project.status) {
            await projectService.updateProject(project.id, { status: newProjStatus });
          }
        }
      }
      
      // Also write back log activity trigger
      showNotification('Daily progress log filed successfully!');
      setSelectedPhaseForLog(null);
      await loadDeveloperData();
    } catch (err) {
      console.error(err);
      showError('Failed to file progress report');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMntDailyProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDev || !selectedMntForLog) return;
    setSubmitting(true);

    try {
      const f = e.target as any;
      const targetLogDate = f.date.value || getGMT6DateString();

      // Check duplicate logs on same day for this maintenance project
      const hasLoggedToday = myLogs.some(log => 
        log.projectId === 'maintenance' &&
        log.phaseId === selectedMntForLog.id && 
        log.date === targetLogDate
      );
      if (hasLoggedToday) {
        showWarning(`You have already submitted a progress log for this maintenance project on ${targetLogDate}. Only one log per day is permitted.`);
        setSubmitting(false);
        return;
      }

      const logData = {
        date: targetLogDate,
        projectId: 'maintenance',
        phaseId: selectedMntForLog.id,
        phaseName: selectedMntForLog.projectName as any,
        developerId: currentDev.id,
        description: f.description.value || '',
        dailyTarget: f.target.value?.trim() || 'Maintenance SLA Tasks',
        actualDone: f.achieved.value?.trim() || 'Investigated issues / support tickets',
        progressPercentage: 100,
        shift: currentDev.shift || 'Day',
        ownerId: currentDev.ownerId
      };

      await progressService.addDailyProgress(logData);

      showNotification('Maintenance daily progress log filed successfully!');
      setSelectedMntForLog(null);
      await loadDeveloperData();
    } catch (err) {
      console.error(err);
      showError('Failed to file maintenance progress report');
    } finally {
      setSubmitting(false);
    }
  };


  const handleAddExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhaseForExt || !currentDev) return;
    setSubmitting(true);

    try {
      const f = e.target as any;
      const targetNewDate = f.requestedDate.value;
      const reason = f.reason.value;

      const currentPhase = selectedPhaseForExt.phase;
      const prevDate = currentPhase.expectedDeliveryDate || currentPhase.startDate || getGMT6DateString();
      
      // Calculate Days Count
      const targetDateObj = new Date(targetNewDate);
      const prevDateObj = new Date(prevDate);
      const diffMs = targetDateObj.getTime() - prevDateObj.getTime();
      const days = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

      const currentExtensions = currentPhase.extensions || [];
      const newExtension = {
        id: Math.random().toString(36).substr(2, 9),
        days,
        reason,
        previousDate: prevDate,
        newDate: targetNewDate,
        createdAt: new Date().toISOString(),
        status: 'Pending' as const,
        projectId: selectedPhaseForExt.project.id,
        projectClient: selectedPhaseForExt.project.clientName,
        phaseId: currentPhase.id,
        phaseName: currentPhase.phaseName,
        developerName: currentDev.name
      };

      const updatedExtensions = [...currentExtensions, newExtension];

      await progressService.updatePhase(selectedPhaseForExt.project.id, currentPhase.id, {
        extensions: updatedExtensions,
        status: 'Extension Requested'
      });

      showNotification(`Extension request submitted! Pending Admin Review.`);
      setSelectedPhaseForExt(null);
      await loadDeveloperData();
    } catch (err) {
      console.error(err);
      showError('Failed to submit timeline extension');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectForIssue || !currentDev) return;
    setSubmitting(true);

    try {
      const f = e.target as any;
      const phaseId = f.phaseId.value;
      const targetPhase = assignedPhases.find(p => p.phase.id === phaseId);

      const issueData = {
        title: f.title.value,
        priority: f.priority.value as 'Low' | 'Medium' | 'High',
        phaseId: phaseId || undefined,
        phaseName: targetPhase ? targetPhase.phase.phaseName : undefined,
        description: f.description.value,
        type: f.type.value as 'Client Issue' | 'Internal Issue',
        developerId: currentDev.id,
        developerName: currentDev.name,
        projectName: selectedProjectForIssue.clientName || selectedProjectForIssue.projectId || 'Unknown Project',
        projectId: selectedProjectForIssue.id,
        status: 'Open' as const
      };

      await progressService.addIssue(selectedProjectForIssue.id, issueData);

      showNotification('Blocker/Issue registered successfully.');
      setSelectedProjectForIssue(null);
      await loadDeveloperData();
    } catch (err) {
      console.error(err);
      showError('Failed to report issue');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseIssue = async (projectId: string, issueId: string) => {
    setSubmitting(true);
    try {
      await progressService.updateIssue(projectId, issueId, 'Resolved');
      showNotification('Blocker marked as resolved.');
      await loadDeveloperData();
    } catch (err) {
      console.error(err);
      showError('Failed to close blocker');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 bg-slate-50/55 rounded-[2.5rem] border border-slate-100">
        <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="text-slate-500 font-semibold text-xs animate-pulse">Synchronizing developer workspace…</p>
      </div>
    );
  }

  if (!currentDev) {
    return (
      <div className="max-w-2xl mx-auto p-12 text-center bg-white rounded-[2.5rem] border border-slate-200 shadow-xl my-8">
        <div className="w-20 h-20 bg-rose-50 border border-rose-100 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Workspace Access Suspended</h2>
        <p className="text-slate-500 font-medium leading-relaxed mb-6">
          The email terminal <code className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md text-rose-600 font-mono text-sm font-semibold">{auth.currentUser?.email}</code> does not match any authenticated record in the developer roster. Please verify with your system administrator.
        </p>
        <div className="inline-flex gap-4">
          <button 
            onClick={() => loadDeveloperData()} 
            className="px-6 py-3 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Link
          </button>
        </div>
      </div>
    );
  }

  // Calculate live average progress percentage across this developer's assigned milestones
  const avgProgress = assignedPhases.length > 0 
    ? Math.round(assignedPhases.reduce((acc, curr) => acc + (curr.phase.progress || 0), 0) / assignedPhases.length) 
    : 0;

  // Group milestones by clientName and phaseName to merge duplicates in sidebar
  const groupedMilestones: Array<{
    key: string;
    project: Project;
    phaseName: string;
    items: Array<{ project: Project; phase: PhaseTracking }>;
  }> = [];

  assignedPhases.forEach((item) => {
    const key = `${item.project.clientName}-${item.phase.phaseName}`;
    let group = groupedMilestones.find(g => g.key === key);
    if (!group) {
      group = {
        key,
        project: item.project,
        phaseName: item.phase.phaseName,
        items: []
      };
      groupedMilestones.push(group);
    }
    group.items.push(item);
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      <AnimatePresence>
        {actionSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-800 z-50 flex items-center gap-3"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-xs">✓</div>
            <p className="text-xs uppercase tracking-wider font-extrabold">{actionSuccess}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Workspace Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
            {currentDev.name[0]}
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">Developer workspace</h1>
            <p className="text-slate-500 text-[11px]">
              Welcome back, <span className="font-semibold text-slate-700">{currentDev.name}</span> • {currentDev.shift} shift • ID: {currentDev.employeeId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              const currentActive = assignedPhases.find(ap => ap.phase.id === activeProjectTab);
              if (currentActive) {
                setLogNoWork('');
                setSelectedMntProjLogId('');
                setSelectedPhaseForLog(currentActive);
              } else {
                showWarning("No active milestone selected to log progress for.");
              }
            }}
            disabled={assignedPhases.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Log daily activity</span>
          </button>
        </div>
      </div>

      {/* Compact Stat Bar */}
      {currentDev && (
        <div className="w-full h-[52px] border-b border-slate-200/80 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          {/* Stat 1: Assigned Projects */}
          <div className="flex-1 flex items-center justify-between px-3 h-full border-r border-slate-150 last:border-r-0 min-w-[120px]">
            <span className="text-[10px] text-slate-500 font-medium">Assigned projects</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-slate-900">{new Set(assignedPhases.map(ap => ap.project.id)).size}</span>
              <span className="text-[9px] text-slate-400">active</span>
            </div>
          </div>

          {/* Stat 2: Delivered Sprints */}
          <div className="flex-1 flex items-center justify-between px-3 h-full border-r border-slate-150 last:border-r-0 min-w-[120px]">
            <span className="text-[10px] text-slate-500 font-medium">Delivered sprints</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-slate-900">
                {assignedPhases.filter(ap => ap.phase.status === 'Delivered').length}
              </span>
              <span className="text-[9px] text-emerald-600 font-semibold font-mono">done</span>
            </div>
          </div>

          {/* Stat 3: Active Workload */}
          <div className="flex-1 flex items-center justify-between px-3 h-full border-r border-slate-150 last:border-r-0 min-w-[120px]">
            <span className="text-[10px] text-slate-500 font-medium">Active workload</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-slate-900">
                {assignedPhases.filter(ap => 
                  ['In Progress', 'Pending', 'Delayed', 'Extension Requested'].includes(ap.phase.status)
                ).length}
              </span>
              <span className="text-[9px] text-amber-600 font-semibold font-mono">sprints</span>
            </div>
          </div>

          {/* Stat 4: KPI Allocation */}
          <div className="flex-1 flex items-center justify-between px-3 h-full border-r border-slate-150 last:border-r-0 min-w-[120px]">
            <span className="text-[10px] text-slate-500 font-medium">KPI allocation</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-slate-900">
                {assignedPhases.reduce((sum, ap) => {
                  const myAlloc = ap.phase.kpiAllocations?.find(a => a.developerId === currentDev.id && a.includeInKPI);
                  return sum + (myAlloc?.value || 0);
                }, 0)}
              </span>
              <span className="text-[9px] text-violet-650 font-semibold">pts</span>
            </div>
          </div>

          {/* Stat 5: Performance Grade */}
          <div className="flex-1 flex items-center justify-between px-3 h-full last:border-r-0 min-w-[120px]">
            <span className="text-[10px] text-slate-500 font-medium">Performance grade</span>
            {(() => {
              const perfResult = calculateDeveloperPerformanceScore(currentDev.id, assignedPhases.map(ap => ap.phase), myIssues);
              return (
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-bold text-slate-900">
                    {perfResult.grade === 'N/A' ? '—' : `${perfResult.score}%`}
                  </span>
                  <span className="text-[9px] text-pink-650 font-semibold">
                    {perfResult.grade === 'N/A' ? '' : `(${perfResult.grade})`}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Actionable Warnings / Alert Section */}
      {(() => {
        const redAlerts = assignedPhases.filter(ap => {
          const ph = ap.phase;
          if (ph.status === 'Delivered' || ph.status === 'Cancelled') return false;
          
          // 1. Check if phase has exceeded governance threshold (Red Zone)
          if (ph.status === 'In Progress' && ph.startDate) {
            const age = calculateProjectAge(ph.startDate);
            let threshold = 30;
            if (ph.phaseName === 'UI/UX' || ph.phaseName === 'App Frontend' || ph.phaseName === 'Web Frontend') {
              threshold = 15;
            } else if (ph.phaseName === 'Backend') {
              threshold = 25;
            }
            if (age > threshold) return true;
          }

          // 2. Check if phase status is manually marked Delayed
          if (ph.status === 'Delayed') return true;

          // 3. Check if near expected delivery date (less than 3 days)
          if (ph.expectedDeliveryDate) {
            const target = new Date(ph.expectedDeliveryDate);
            const now = new Date();
            const diff = target.getTime() - now.getTime();
            const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays < 3 && ph.progress < 100;
          }
          return false;
        });

        if (redAlerts.length === 0) return null;

        return (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-slate-600">Active alerts & SLA commitments ({redAlerts.length})</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {redAlerts.map(({ project, phase }) => {
                const age = phase.startDate ? calculateProjectAge(phase.startDate) : 0;
                let threshold = 30;
                if (phase.phaseName === 'UI/UX' || phase.phaseName === 'App Frontend' || phase.phaseName === 'Web Frontend') {
                  threshold = 15;
                } else if (phase.phaseName === 'Backend') {
                  threshold = 25;
                }
                const isOverdue = age > threshold || phase.status === 'Delayed';
                const overdueDays = age > threshold ? age - threshold : 0;

                const countdown = getPhaseCountdown(phase.expectedDeliveryDate || '');
                const daysRemaining = countdown ? countdown.daysRemaining : 999;
                
                // Color robertoverwater row amber (warning) since it has 24d remaining.
                // Color Yourself Beauty row red (critical) since it has only 1d 15h left.
                // Critical is daysRemaining <= 2 or already overdue.
                const isCritical = daysRemaining <= 2;

                return (
                  <div 
                    key={phase.id}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-xl bg-white shadow-sm transition-all hover:shadow-md",
                      isCritical 
                        ? "border-rose-150 bg-rose-50/20 hover:border-rose-250" 
                        : "border-amber-150 bg-amber-50/20 hover:border-amber-250"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        isCritical ? "bg-rose-500 animate-pulse" : "bg-amber-500"
                      )}></span>
                      <div className="min-w-[120px]">
                        <h5 className="text-xs font-bold text-slate-900 leading-none">{project.clientName}</h5>
                        <p className="text-[10px] text-slate-500 font-medium mt-1">{phase.phaseName}</p>
                      </div>
                      
                      <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

                      <div className="text-[11px] font-mono">
                        <span className="text-slate-400 font-sans">Age: </span>
                        <span className="text-slate-800 font-bold">{age} days</span>
                      </div>

                      <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

                      <div className="text-[11px] font-mono">
                        {isCritical ? (
                          <>
                            <span className="text-rose-600 font-bold">Critical</span>
                            {countdown && <span className="text-rose-600 font-bold ml-2">({countdown.label})</span>}
                          </>
                        ) : (
                          <>
                            <span className="text-amber-700 font-semibold">Warning</span>
                            {countdown && <span className="text-slate-700 ml-2">({countdown.label})</span>}
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveProjectTab(phase.id)}
                      className={cn(
                        "px-3 py-1.5 font-bold text-[10px] rounded-xl transition-all cursor-pointer shadow-sm text-white shrink-0 self-start sm:self-center",
                        isCritical 
                          ? "bg-rose-600 hover:bg-rose-700 active:scale-95" 
                          : "bg-amber-600 hover:bg-amber-700 active:scale-95"
                      )}
                    >
                      {isCritical ? "Urgent: address now" : "Review"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {assignedPhases.length === 0 ? (
        <div className="bg-white rounded-[2rem] p-12 text-center border border-slate-200 shadow-sm max-w-3xl mx-auto">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <Briefcase className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">All clear! No active sprint assignments</h2>
          <p className="text-slate-500 text-sm leading-relaxed mt-2 max-w-md mx-auto">
            You currently aren't assigned to any active project milestones. Reach out to your project leader if you believe this is an error or need task onboarding.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Daily Log & Blockers Section (Visible on initial load) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Blocker overview (col-span-4) */}
            <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 text-rose-500 animate-pulse" />
                Active blockers
              </h3>
              
              <div className="space-y-3 max-h-[190px] overflow-y-auto no-scrollbar">
                {myIssues.filter(i => i.status === 'Open' && i.developerId === currentDev.id).length === 0 ? (
                  <div className="py-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-[10px] text-slate-400 font-semibold">No active blockers logged</p>
                  </div>
                ) : (
                  myIssues.filter(i => i.status === 'Open' && i.developerId === currentDev.id).map(issue => (
                    <div key={issue.id} className="p-3 bg-rose-50/50 rounded-xl border border-rose-100 text-xs text-rose-900 leading-relaxed font-semibold space-y-1 shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[9px] uppercase tracking-widest text-rose-600 bg-white border border-rose-100 px-2 py-0.5 rounded-lg">
                            {issue.type}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 font-mono">
                            {issue.createdAt ? new Date(issue.createdAt as any).toLocaleDateString() : 'Active'}
                          </span>
                        </div>
                        <p className="text-slate-700 font-medium leading-relaxed mt-1">{issue.description}</p>
                      </div>
                      <div className="flex justify-end pt-1.5 border-t border-rose-100/40 mt-1.5 font-sans">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleCloseIssue(issue.projectId, issue.id)}
                          className="px-2 py-1 bg-white hover:bg-rose-100/60 text-rose-600 rounded border border-rose-200 text-[9px] font-bold cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-sm disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3 text-rose-500" />
                          Resolve blocker
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Daily History logs (col-span-8) */}
            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  Your daily log
                </h3>
                <span className="text-[10px] bg-indigo-50/70 border border-indigo-100 px-2.5 py-1 rounded-xl text-indigo-700 font-bold">
                  {myLogs.length} logs
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[190px] overflow-y-auto no-scrollbar pr-1">
                {myLogs.length === 0 ? (
                  <div className="col-span-full py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-[10px] text-slate-400 font-semibold leading-none">No achievements registered</p>
                  </div>
                ) : (
                  myLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-50/75 border border-slate-100 rounded-xl space-y-2.5 shadow-sm hover:border-indigo-100 hover:bg-white transition-all duration-300">
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-[10px] text-indigo-650 font-black uppercase bg-indigo-50/80 px-2.5 py-1 rounded border border-indigo-100/60 max-w-[150px] truncate">
                          {log.phaseName}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">{log.date}</span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <p className="text-slate-800 font-medium leading-relaxed line-clamp-2">{log.description}</p>
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 pt-1.5 border-t border-slate-150/40">
                          <div>
                            <span className="font-bold text-slate-400">Target:</span>
                            <span className="ml-1 text-slate-850 font-medium truncate block max-w-full">{log.dailyTarget}</span>
                          </div>
                          <div>
                            <span className="font-bold text-slate-400">Achieved:</span>
                            <span className="ml-1 text-slate-850 font-medium truncate block max-w-full">{log.actualDone}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100/40">
                        <span className="text-[9px] font-semibold text-slate-400 flex items-center gap-1">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            log.shift === 'Night' ? "bg-slate-900" : "bg-amber-400"
                          )}></span>
                          {log.shift} shift
                        </span>
                        <span className="text-[10px] font-bold text-emerald-650 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                          {log.progressPercentage}%
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Milestone Details & Navigator Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Pane 1: Milestone Sidebar Selector (col-span-3) */}
            <div className="lg:col-span-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-500">Active milestones</h3>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold">
                  {assignedPhases.length}
                </span>
              </div>
              
              <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
                {groupedMilestones.map((group) => {
                  if (group.items.length === 1) {
                    const { project, phase } = group.items[0];
                    const isActive = activeProjectTab === phase.id;
                    
                    const age = phase.startDate ? calculateProjectAge(phase.startDate) : 0;
                    let threshold = 30;
                    if (phase.phaseName === 'UI/UX' || phase.phaseName === 'App Frontend' || phase.phaseName === 'Web Frontend') {
                      threshold = 15;
                    } else if (phase.phaseName === 'Backend') {
                      threshold = 25;
                    }
                    const isRedZone = phase.status === 'In Progress' && age > threshold;
                    const countdown = getPhaseCountdown(phase.expectedDeliveryDate || '');

                    return (
                      <button 
                        key={phase.id}
                        onClick={() => setActiveProjectTab(phase.id)}
                        className={cn(
                          "w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 relative cursor-pointer",
                          isActive 
                            ? "bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-600/10" 
                            : "bg-white border-slate-200 hover:border-indigo-300 text-slate-800"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-bold truncate max-w-[160px]">
                            {project.clientName}
                          </span>
                          <span className={cn(
                            "w-2 h-2 rounded-full shrink-0 mt-1",
                            isRedZone ? "bg-rose-500 animate-pulse" :
                            phase.status === 'In Progress' ? (isActive ? "bg-white" : "bg-indigo-500") :
                            phase.status === 'Pending' ? "bg-amber-500" : "bg-emerald-500"
                          )}></span>
                        </div>
                        
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={cn(
                            isActive ? "text-indigo-200" : "text-slate-500",
                            "font-medium"
                          )}>
                            {phase.phaseName}
                          </span>
                          <span className={cn(
                            isActive ? "text-indigo-100" : (isRedZone ? "text-rose-600 font-bold" : "text-slate-400"),
                            "font-mono text-[9px]"
                          )}>
                            {isRedZone ? "overdue" : (countdown ? `${countdown.daysRemaining}d left` : 'TBD')}
                          </span>
                        </div>
                      </button>
                    );
                  } else {
                    const { project, phaseName } = group;
                    const isAnyChildActive = group.items.some(item => activeProjectTab === item.phase.id);

                    return (
                      <div 
                        key={group.key}
                        className={cn(
                          "w-full p-3.5 rounded-xl border transition-all flex flex-col gap-3 bg-white",
                          isAnyChildActive 
                            ? "border-indigo-305 border-indigo-500 bg-slate-50/50 shadow-sm" 
                            : "border-slate-200"
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-slate-900 leading-tight">
                            {project.clientName}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {phaseName}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100">
                          {group.items.map((item, index) => {
                            const phase = item.phase;
                            const label = index === 0 ? "Sprint A" : "Sprint B";
                            const isActive = activeProjectTab === phase.id;
                            
                            const age = phase.startDate ? calculateProjectAge(phase.startDate) : 0;
                            let threshold = 30;
                            if (phase.phaseName === 'UI/UX' || phase.phaseName === 'App Frontend' || phase.phaseName === 'Web Frontend') {
                              threshold = 15;
                            } else if (phase.phaseName === 'Backend') {
                              threshold = 25;
                            }
                            const isRedZone = phase.status === 'In Progress' && age > threshold;
                            const countdown = getPhaseCountdown(phase.expectedDeliveryDate || '');

                            return (
                              <button
                                key={phase.id}
                                onClick={() => setActiveProjectTab(phase.id)}
                                className={cn(
                                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all border cursor-pointer",
                                  isActive
                                    ? "bg-indigo-600 border-indigo-700 text-white font-bold shadow-sm"
                                    : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                                )}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className={cn(
                                    "w-1.5 h-1.5 rounded-full shrink-0",
                                    isRedZone ? "bg-rose-500 animate-pulse" :
                                    phase.status === 'In Progress' ? (isActive ? "bg-white" : "bg-indigo-500") :
                                    phase.status === 'Pending' ? "bg-amber-500" : "bg-emerald-500"
                                  )}></span>
                                  <span>{label}</span>
                                </div>
                                <span className={cn(
                                  isActive ? "text-indigo-150 text-indigo-200 font-bold" : "text-slate-500 font-normal"
                                )}>
                                  {isRedZone ? "overdue" : (countdown ? `${countdown.daysRemaining}d left` : 'TBD')}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>

            {/* Pane 2: Active Workspace Details (col-span-9) */}
            <div className="lg:col-span-9 space-y-4">
              <AnimatePresence mode="wait">
                {assignedPhases.map(({ project, phase }) => {
                  if (activeProjectTab !== phase.id) return null;

                  const openIssues = myIssues.filter(i => i.projectId === project.id && i.status === 'Open');

                  return (
                    <motion.div 
                      key={phase.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30 p-6 sm:p-8 space-y-6 relative overflow-hidden"
                    >
                      {/* Sprint Header details */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-5 gap-4 relative z-10">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100/60">{project.clientName}</p>
                            <span className="text-[10px] font-bold text-slate-400">• Workspace node: {project.projectId}</span>
                            {project.status === 'Delivered' && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase rounded-lg border border-emerald-100 tracking-wider">
                                Approved & closed
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 tracking-tight mt-2">{phase.phaseName} workspace</h3>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <span className="px-3 py-1.5 bg-slate-50 text-[10px] font-semibold text-slate-700 rounded-xl border border-slate-100/80">
                            Due: {phase.expectedDeliveryDate || 'TBD'}
                          </span>
                          {phase.totalExtensionDays && phase.totalExtensionDays > 0 ? (
                          <span className="px-2 py-1.5 bg-rose-50 border border-rose-100 text-[9px] font-bold text-rose-600 rounded-xl">
                              +{phase.totalExtensionDays}d extension
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Progress slider / controls */}
                      {(() => {
                        const countdown = getPhaseCountdown(phase.expectedDeliveryDate || '');
                        const daysRemaining = countdown ? countdown.daysRemaining : 999;
                        
                        // Allowed to request if at least 3 days before deadline
                        const isAllowedToRequestExt = daysRemaining >= 3;

                        const isMainDev = phase.developerIds?.includes(currentDev.id);

                        if (!isMainDev) {
                          const myKpiAlloc = phase.kpiAllocations?.find(a => a.developerId === currentDev.id);
                          return (
                            <div className="space-y-6">
                              <div className="bg-gradient-to-br from-indigo-50/60 to-indigo-100/20 border border-indigo-100 rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-44 h-44 bg-indigo-500/5 rounded-full blur-2xl"></div>
                                <div className="flex items-start gap-4 relative z-10">
                                  <div className="p-3.5 bg-white rounded-2xl shadow-sm text-indigo-600 shrink-0 border border-indigo-100">
                                    <Sparkles className="w-6 h-6 text-indigo-650" />
                                  </div>
                                  <div className="space-y-1.5 min-w-0">
                                    <h4 className="text-sm font-bold text-slate-900 tracking-tight">Milestone KPI balance allocation</h4>
                                    <p className="text-[10px] text-indigo-600 font-bold bg-white rounded-md px-2 py-0.5 border border-indigo-100 inline-block">SLA ledger status</p>
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-xl">
                                      You are listed on this milestone specifically as a KPI balancing recipient to satisfy corporate SLA balancing rules and system benchmarks. Because you do not hold direct engineering/code delivery responsibilities in this active sprint, project progress update sliders and daily work logs are automatically hidden.
                                    </p>
                                  </div>
                                </div>
                                <div className="bg-white rounded-[1.5rem] border border-indigo-100 p-5 min-w-[210px] text-center shadow-xl shadow-indigo-100/10 shrink-0 relative z-10">
                                  <p className="text-[10px] font-bold text-slate-400 leading-none">Balanced SLA share</p>
                                  <p className="text-3xl font-black text-indigo-650 mt-2 font-mono tracking-tight">
                                    {myKpiAlloc ? `${myKpiAlloc.percentage}%` : '0%'}
                                  </p>
                                  <p className="text-xs font-semibold mt-1.5 text-slate-550">
                                    Value reward: <span className="text-indigo-650 font-bold">${Math.round(myKpiAlloc?.value || 0).toLocaleString()}</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-6 animate-fadeIn">
                            {/* Live Countdown & Info Row */}
                            {countdown && phase.status !== 'Delivered' && (
                              <div className={cn("px-5 py-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between text-xs font-bold gap-2.5 shadow-sm", countdown.color)}>
                                <span className="flex items-center gap-2">
                                  <Clock className="w-4.5 h-4.5 animate-spin-slow text-indigo-600" />
                                  <span>Deadline countdown</span>
                                </span>
                                <span className="px-3.5 py-1 bg-white/90 backdrop-blur rounded-xl border border-slate-200/40 text-slate-900 shadow-sm font-mono tracking-tight">{countdown.label}</span>
                              </div>
                            )}

                            {daysRemaining >= 3 && daysRemaining <= 5 && (
                              <div className="bg-amber-50 border border-amber-250 text-amber-900 rounded-2xl p-5 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl"></div>
                                <div className="flex items-start gap-3 relative z-10">
                                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                  <div className="space-y-1">
                                    <h4 className="font-bold text-xs text-amber-950 flex items-center gap-1.5">
                                      ⚠️ Timeline extension warning
                                    </h4>
                                    <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                                      If you do not request an extension before the remaining time drops below 3 days, you will no longer be eligible to request one.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {(() => {
                              const age = phase.startDate ? calculateProjectAge(phase.startDate) : 0;
                              let threshold = 30;
                              if (phase.phaseName === 'UI/UX' || phase.phaseName === 'App Frontend' || phase.phaseName === 'Web Frontend') {
                                threshold = 15;
                              } else if (phase.phaseName === 'Backend') {
                                threshold = 25;
                              }
                              const isRedZone = phase.status === 'In Progress' && age > threshold;

                              if (!isRedZone) return null;

                              return (
                                <div className="bg-rose-50/60 border border-rose-200 text-rose-900 rounded-2xl p-5 shadow-sm relative overflow-hidden space-y-4">
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl"></div>
                                  <div className="flex items-start gap-3 relative z-10">
                                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                      <h4 className="font-bold text-xs text-rose-950 flex items-center gap-1.5">
                                        🔴 SLA overdue — governance threshold exceeded
                                      </h4>
                                      <p className="text-xs text-rose-750/90 font-medium leading-relaxed">
                                        This milestone is {age - threshold} days past its SLA. Submit a progress update or request a deadline extension.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 relative z-10 pt-1">
                                    <div className="bg-white/90 backdrop-blur rounded-xl px-4 py-2 border border-rose-100/50 flex flex-col justify-center shadow-sm">
                                      <p className="text-[9px] font-semibold text-slate-400 leading-none">Milestone age</p>
                                      <p className="text-xs font-bold text-slate-800 mt-1 font-mono">{age} days</p>
                                    </div>
                                    <div className="bg-white/90 backdrop-blur rounded-xl px-4 py-2 border border-rose-100/50 flex flex-col justify-center shadow-sm">
                                      <p className="text-[9px] font-semibold text-slate-400 leading-none">Threshold</p>
                                      <p className="text-xs font-bold text-slate-800 mt-1 font-mono">{threshold} days</p>
                                    </div>
                                    <div className="bg-rose-600 rounded-xl px-4 py-2 text-white border border-rose-700 shadow-md shadow-rose-600/10 flex flex-col justify-center bg-rose-600">
                                      <p className="text-[9px] font-semibold text-rose-200 leading-none">Overdue by</p>
                                      <p className="text-xs font-bold text-white mt-1 font-mono">+{age - threshold} days</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-150 space-y-6">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-rose-100/20 pb-5 gap-4">
                                <div className="space-y-1">
                                  <h4 className="text-sm font-bold text-slate-900 tracking-tight">Milestone overall progress</h4>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-semibold text-slate-400">Status</span>
                                    <span className={cn("px-2.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border", 
                                      phase.status === 'Delayed' ? 'bg-rose-50 border-rose-100 text-rose-600 animate-pulse' : 
                                      phase.status === 'Extension Requested' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                                      phase.status === 'Ready for Delivery' ? 'bg-indigo-50 border-indigo-100 text-indigo-750 font-bold bg-indigo-100' :
                                      phase.status === 'Delivered' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
                                    )}>{phase.status}</span>
                                  </div>
                                </div>
                                <div className="flex flex-col sm:items-end gap-1.5">
                                  <span className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/20 font-mono">
                                    Overall: {phase.progress || 0}%
                                  </span>
                                  <span className="text-[8px] font-semibold text-slate-400 leading-none">Weighted developer average</span>
                                </div>
                              </div>

                              {/* Own Progress Slider with Visual Controls */}
                              <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                  <span className="text-xs font-semibold text-slate-700">Your progress (%)</span>
                                  <span className="text-sm font-bold text-indigo-600 bg-white px-3 py-1 rounded-xl border border-slate-200 font-mono shadow-sm">
                                    {phase.developerProgress?.[currentDev.id] !== undefined ? phase.developerProgress[currentDev.id] : 0}%
                                  </span>
                                </div>
                                
                                {/* Read-Only Progress Bar */}
                                <div className="w-full h-3 bg-slate-200/60 rounded-xl overflow-hidden relative border border-slate-350/10 shadow-inner">
                                  <div 
                                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-xl transition-all duration-500" 
                                    style={{ width: `${phase.developerProgress?.[currentDev.id] !== undefined ? phase.developerProgress[currentDev.id] : 0}%` }}
                                  />
                                </div>
                              </div>

                              {/* Quick Operation Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200/40">
                                {/* Log Work Button */}
                                <button 
                                  onClick={() => {
                                    setLogNoWork('');
                                    setSelectedMntProjLogId('');
                                    setSelectedPhaseForLog({ project, phase });
                                  }}
                                  className="flex flex-col items-start p-5 bg-indigo-50/60 hover:bg-indigo-100/80 text-indigo-900 rounded-2xl border border-indigo-100/60 transition-all text-left group active:scale-98 shadow-sm hover:shadow"
                                >
                                  <div className="p-3 bg-white rounded-xl shadow-sm text-indigo-600 mb-4 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 border border-indigo-50">
                                    <PlusCircle className="w-5 h-5" />
                                  </div>
                                  <h4 className="font-bold text-sm tracking-tight text-indigo-950">Log daily activity</h4>
                                  <p className="text-[10px] text-indigo-600/90 leading-relaxed font-semibold mt-1">Submit achievements & target outcomes</p>
                                </button>

                                {/* Timeline Extension Button with Custom Policy Restriction */}
                                <button 
                                  onClick={() => {
                                    if (isAllowedToRequestExt) {
                                      setSelectedPhaseForExt({ project, phase });
                                    }
                                  }}
                                  disabled={!isAllowedToRequestExt}
                                  className={cn(
                                    "flex flex-col items-start p-5 rounded-2xl border transition-all text-left group shadow-sm w-full",
                                    isAllowedToRequestExt 
                                      ? "bg-amber-50/60 hover:bg-amber-100/80 text-amber-950 border-amber-100/60 active:scale-98 cursor-pointer hover:shadow" 
                                      : "bg-slate-50/60 text-slate-350 border-slate-150 cursor-not-allowed opacity-75"
                                  )}
                                >
                                  <div className={cn("p-3 bg-white rounded-xl shadow-sm mb-4 transition-all duration-300 border", 
                                    isAllowedToRequestExt ? "text-amber-600 group-hover:bg-amber-600 group-hover:text-white border-amber-50" : "text-slate-300 border-slate-100"
                                  )}>
                                    <Calendar className="w-5 h-5" />
                                  </div>
                                  <h4 className={cn("font-bold text-sm tracking-tight", isAllowedToRequestExt ? "text-amber-950" : "text-slate-400")}>
                                    Extend timeline
                                  </h4>
                                  <p className="text-[10px] leading-relaxed font-semibold mt-1 text-slate-550">
                                    {isAllowedToRequestExt 
                                      ? "Proposal timeline shift guidelines."
                                      : "❌ Lockout: extensions must be requested at least 3 days prior to the deadline."
                                    }
                                  </p>
                                </button>

                                {/* File Blocker Ticket */}
                                <button 
                                  onClick={() => setSelectedProjectForIssue(project)}
                                  className="flex flex-col items-start p-5 bg-rose-50/60 hover:bg-rose-100/20 text-rose-900 rounded-2xl border border-rose-100/60 transition-all text-left group active:scale-98 shadow-sm hover:shadow"
                                >
                                  <div className="p-3 bg-white rounded-xl shadow-sm text-rose-600 mb-4 group-hover:scale-110 group-hover:bg-rose-600 group-hover:text-white transition-all duration-300 border border-rose-50">
                                    <AlertCircle className="w-5 h-5" />
                                  </div>
                                  <h4 className="font-bold text-sm tracking-tight text-rose-950">Add issue / blocker</h4>
                                  <p className="text-[10px] text-rose-600/90 leading-relaxed font-semibold mt-1">Register roadblock variables for assistance</p>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                        })()}

                        {/* Resources section */}
                        <div className="border-t border-slate-100 pt-6">
                          <h4 className="text-xs font-semibold text-slate-400 mb-4">Figma & design assets</h4>
                          {Object.keys(phase.resourceLinks || {}).length === 0 ? (
                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">No resource links allocated by admin</p>
                          ) : (
                            <div className="flex gap-3 flex-wrap">
                              {phase.resourceLinks?.figma && (
                                <a href={phase.resourceLinks.figma} target="_blank" rel="noreferrer" className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold tracking-tight text-slate-700 inline-flex items-center gap-2">
                                  Figma design workspace <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                                </a>
                              )}
                              {phase.resourceLinks?.gitlab && (
                                <a href={phase.resourceLinks.gitlab} target="_blank" rel="noreferrer" className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold tracking-tight text-slate-700 inline-flex items-center gap-2">
                                  GitLab repository <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                                </a>
                              )}
                              {phase.resourceLinks?.liveApp && (
                                <a href={phase.resourceLinks.liveApp} target="_blank" rel="noreferrer" className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold tracking-tight text-slate-700 inline-flex items-center gap-2">
                                  Live beta app <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}

      {/* Maintenance Support Bench Section */}
      <div id="maintenance-bench-section" className="bg-white rounded-[2rem] border border-slate-100 p-6 sm:p-8 shadow-xl shadow-slate-200/30 space-y-6 mt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-500 animate-pulse" />
              Maintenance & SLA commitments
            </h2>
            <p className="text-slate-500 text-xs font-medium">Log and track your post-delivery tasks, Hotfixes, or SLA contracts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-[10px] bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg text-slate-500 font-bold">
              {currentDev.maintenanceProjects?.length || 0} commitments
            </span>
            <span className="text-[10px] bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg text-amber-700 font-bold">
              {currentDev.maintenanceProjects?.filter(p => p.status === 'WIP').length || 0} active
            </span>
          </div>
        </div>

        {/* Informative Guidance Alerts */}
        {assignedPhases.length === 0 ? (
          <div className="bg-amber-50/60 border border-amber-200/60 text-amber-805 text-amber-900 rounded-2xl p-5 text-xs font-semibold leading-relaxed flex items-start gap-3">
            <AlertCircle className="w-5.5 h-5.5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950 text-[10px] mb-0.5">Bench status — no active sprints</p>
              <p className="text-amber-805 text-amber-800/95 leading-relaxed font-semibold">You have no active primary project sprints at this time. If you are servicing custom maintenance or post-delivery commitments, register them below so they are tracked securely by your leadership team.</p>
            </div>
          </div>
        ) : (
          currentDev.maintenanceProjects?.some(p => p.status === 'WIP') && (
            <div className="bg-indigo-50/60 border border-indigo-150 text-indigo-900 rounded-2xl p-5 text-xs font-semibold leading-relaxed flex items-start gap-3">
              <Sparkles className="w-5.5 h-5.5 text-indigo-650 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-indigo-950 text-[10px] mb-0.5">SLA commitments active</p>
                <p className="text-indigo-850 text-indigo-900/90 leading-relaxed font-semibold">When you are logged on active maintenance tasks, your primary sprint deliverables may experience delays. Keeping this bench current communicates your exact operational load clearly to project managers.</p>
              </div>
            </div>
          )
        )}

        {/* Add Maintenance Form */}
        <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-150">
          <p className="text-[10px] font-bold text-slate-400 pl-1 mb-3">Add maintenance project</p>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (submitting) return;
              if (!mntProjectName.trim()) {
                showWarning('Please provide a project name.');
                return;
              }
              const newMnt = {
                id: Math.random().toString(36).substr(2, 9),
                projectName: mntProjectName.trim(),
                type: mntType,
                status: 'WIP' as const,
                createdAt: new Date().toISOString()
              };
              const updatedList = [...(currentDev.maintenanceProjects || []), newMnt];
              handleUpdateMaintenance(updatedList);
              setMntProjectName('');
              setMntType('Lite');
            }}
            className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end"
          >
            {/* Step 1: Project Name */}
            <div className="md:col-span-6 space-y-1.5 w-full">
              <label className="text-[9px] font-bold text-slate-400 pl-1">Step 1. Project name</label>
              <input 
                type="text"
                required
                placeholder="e.g. Acme Web Server Hotfixes"
                value={mntProjectName}
                onChange={(e) => setMntProjectName(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs font-semibold transition-all outline-none"
              />
            </div>
            
            {/* Step 2: Intensity */}
            <div className="md:col-span-4 space-y-1.5 w-full">
              <label className="text-[9px] font-bold text-slate-400 pl-1">Step 2. Set intensity</label>
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-full h-[41px]">
                {(['Lite', 'Moderate', 'Heavy'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMntType(t)}
                    className={cn(
                      "flex-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer",
                      mntType === t 
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-600 text-slate-900"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Confirm button */}
            <div className="md:col-span-2 w-full">
              <button 
                type="submit"
                disabled={submitting}
                className="w-full h-[41px] bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer bg-indigo-600"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Confirm log
              </button>
            </div>
          </form>
        </div>

        {/* Maintenance Projects Table */}
        <div className="overflow-x-auto border border-slate-150 rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-150 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3">Project name</th>
                <th className="px-4 py-3">Intensity</th>
                <th className="px-4 py-3">Date logged</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {(!currentDev.maintenanceProjects || currentDev.maintenanceProjects.length === 0) ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400 font-semibold">
                    <p className="text-xs">No active maintenance work listed</p>
                    <p className="text-[10px] font-medium mt-1">Add tasks above to record server upkeep and support commits.</p>
                  </td>
                </tr>
              ) : (
                [...(currentDev.maintenanceProjects || [])]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((mnt) => (
                    <tr 
                      key={mnt.id} 
                      className={cn(
                        "hover:bg-slate-50/40 transition-colors",
                        mnt.status === 'Complete' && "bg-slate-50/20"
                      )}
                    >
                      <td className="px-6 py-4">
                        <span className={cn(
                          "font-bold text-slate-900 tracking-tight",
                          mnt.status === 'Complete' && "text-slate-400 line-through font-normal"
                        )}>
                          {mnt.projectName}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border",
                          mnt.type === 'Heavy' ? "bg-rose-50 text-rose-600 border-rose-100" :
                          mnt.type === 'Moderate' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                          "bg-teal-50 text-teal-600 border-teal-100"
                        )}>
                          {mnt.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-500 font-medium font-mono text-[10px]">
                        {new Date(mnt.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border inline-block",
                          mnt.status === 'Complete' 
                            ? "bg-slate-100 text-slate-500 border-slate-200" 
                            : "bg-amber-50 text-amber-600 border-amber-100"
                        )}>
                          {mnt.status === 'Complete' ? 'Completed' : 'WIP'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {mnt.status === 'WIP' ? (
                            <>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => setSelectedMntForLog(mnt)}
                                className="px-2.5 py-1 bg-indigo-50 text-indigo-650 hover:bg-indigo-600 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-indigo-100 transition-all flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-50"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                Log
                              </button>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => {
                                  const updated = currentDev.maintenanceProjects?.map(m => m.id === mnt.id ? { ...m, status: 'Complete' as const } : m) || [];
                                  handleUpdateMaintenance(updated);
                                }}
                                className="px-2.5 py-1 bg-emerald-50 text-emerald-650 hover:bg-emerald-650 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-100 transition-all flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Done
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => {
                                const updated = currentDev.maintenanceProjects?.map(m => m.id === mnt.id ? { ...m, status: 'WIP' as const } : m) || [];
                                handleUpdateMaintenance(updated);
                              }}
                              className="px-2.5 py-1 bg-slate-50 text-slate-500 hover:bg-slate-900 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200 transition-all flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Reopen
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => {
                              if (window.confirm('Delete this maintenance record?')) {
                                const updated = currentDev.maintenanceProjects?.filter(m => m.id !== mnt.id) || [];
                                handleUpdateMaintenance(updated);
                              }
                            }}
                            className="p-1.5 text-slate-350 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-all cursor-pointer"
                            title="Delete maintenance record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Progress Modal Form */}
      <AnimatePresence>
        {selectedPhaseForLog && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Record Daily Achievement</h3>
                <p className="text-xs text-indigo-600 font-semibold mt-1">
                  {selectedPhaseForLog.project.clientName} - {selectedPhaseForLog.phase.phaseName}
                </p>
              </div>

              <form onSubmit={handleAddDailyProgress} className="p-6 space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-slate-400">Entry date</label>
                    {isOffDayOrWeekend && (
                      <span className="text-[9px] text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full font-bold">
                        Weekend / Off Status Active
                      </span>
                    )}
                  </div>
                  <input 
                    name="date" 
                    type="date" 
                    required 
                    max={getGMT6DateString()}
                    value={logDate} 
                    onChange={(e) => handleDateChange(e.target.value)} 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-xs" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-bold text-slate-400">Daily target</label>
                      {isOffDayOrWeekend && (
                        <span className="text-[8px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">Optional</span>
                      )}
                    </div>
                    <input 
                      name="target" 
                      required={!isOffDayOrWeekend} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-semibold text-xs" 
                      placeholder={isOffDayOrWeekend ? "Optional (Weekend/Off status)" : "e.g. Design 3 UI frames"} 
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-bold text-slate-400">Actual achieved</label>
                      {isOffDayOrWeekend && (
                        <span className="text-[8px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">Optional</span>
                      )}
                    </div>
                    <input 
                      name="achieved" 
                      required={!isOffDayOrWeekend} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-semibold text-xs" 
                      placeholder={isOffDayOrWeekend ? "Optional (Weekend/Off status)" : "e.g. Designed 3 UI frames"} 
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 block">Work status / blocker</label>
                  <select 
                    name="noWork" 
                    value={logNoWork}
                    onChange={(e) => {
                      const selected = e.target.value;
                      setLogNoWork(selected);
                      if (selected) {
                        // Lock progress value to past progress
                        const past = selectedPhaseForLog.phase.developerProgress?.[currentDev.id] !== undefined 
                          ? selectedPhaseForLog.phase.developerProgress[currentDev.id] 
                          : 0;
                        const slider = document.querySelector('input[name="ownProgress"]') as HTMLInputElement;
                        if (slider) slider.value = String(past);
                        const indicator = document.getElementById('log-own-progress-indicator');
                        if (indicator) indicator.textContent = `${past}%`;

                        if (selected === 'SLA Maintenance Blocker') {
                          const targetInput = document.querySelector('input[name="target"]') as HTMLInputElement;
                          const achievedInput = document.querySelector('input[name="achieved"]') as HTMLInputElement;
                          const descTextarea = document.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
                          if (targetInput && !targetInput.value) {
                            targetInput.value = "Maintenance SLA support duties";
                          }
                          if (achievedInput && !achievedInput.value) {
                            achievedInput.value = "Investigating live production issues / support tickets";
                          }
                          if (descTextarea && !descTextarea.value) {
                            descTextarea.value = "Spent today servicing urgent post-delivery maintenance, resolving support logs, or handling Hotfixes under SLA.";
                          }
                        }
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-indigo-50/50 border border-indigo-100 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs text-indigo-950 transition-all"
                  >
                    <option value="">No (Standard sprint work on Active Milestone)</option>
                    <option value="SLA Maintenance Blocker">Yes - Occupied with SLA / Maintenance Project</option>
                    <option value="Developer Off Day">Yes - Off Day / Weekend</option>
                    <option value="Sick Leave">Yes - Sick Leave</option>
                    <option value="Client Issue">Yes - Blocked by Client Issue</option>
                    <option value="General Leave">Yes - General Leave</option>
                  </select>
                </div>

                {logNoWork === 'SLA Maintenance Blocker' && (
                  <div className="space-y-1.5 p-4 bg-amber-50/50 border border-amber-205 rounded-2xl animate-fade-in">
                    <label className="text-[9px] font-bold text-amber-800 block">
                      Assigned Maintenance Project Blocker
                    </label>
                    {(!currentDev.maintenanceProjects || currentDev.maintenanceProjects.filter(p => p.status === 'WIP').length === 0) ? (
                      <div className="text-[10px] text-slate-500 font-bold bg-white p-3 rounded-xl border border-slate-200 text-center">
                        💡 No active WIP maintenance project on your profile. You can log standard maintenance support text directly, or register maintenance projects in the registry below first.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <select
                          value={selectedMntProjLogId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedMntProjLogId(val);
                            const selectedMnt = currentDev.maintenanceProjects?.find(p => p.id === val);
                            if (selectedMnt) {
                              const targetInput = document.querySelector('input[name="target"]') as HTMLInputElement;
                              const achievedInput = document.querySelector('input[name="achieved"]') as HTMLInputElement;
                              const descTextarea = document.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
                              if (targetInput) {
                                targetInput.value = `SLA Maintenance Support: ${selectedMnt.projectName}`;
                              }
                              if (achievedInput) {
                                achievedInput.value = `Serviced critical maintenance needs for ${selectedMnt.projectName}`;
                              }
                              if (descTextarea) {
                                descTextarea.value = `Occupied today dealing with SLA maintenance commit logs, support cases, and health checks on: "${selectedMnt.projectName}" (${selectedMnt.type} support level).`;
                              }
                            }
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 font-bold text-xs"
                        >
                          <option value="">-- Choose Target Maintenance Project --</option>
                          {currentDev.maintenanceProjects?.filter(p => p.status === 'WIP').map((m) => (
                            <option key={m.id} value={m.id}>{m.projectName} (Commitment: {m.type})</option>
                          ))}
                        </select>
                        <p className="text-[9px] text-amber-700 font-semibold leading-relaxed">Selecting a project automatically populates the target and achievements below to minimize hassle.</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400">
                    Your milestone progress (%) {logNoWork && " (Locked)"}
                  </label>
                  <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <input 
                      name="ownProgress" 
                      type="range" 
                      min="0" 
                      max="100" 
                      required 
                      disabled={!!logNoWork}
                      defaultValue={selectedPhaseForLog.phase.developerProgress?.[currentDev.id] !== undefined ? selectedPhaseForLog.phase.developerProgress[currentDev.id] : 0} 
                      className="flex-1 accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      onChange={(e) => {
                        const val = e.target.value;
                        const indicator = document.getElementById('log-own-progress-indicator');
                        if (indicator) indicator.textContent = `${val}%`;
                      }}
                    />
                    <span id="log-own-progress-indicator" className="w-12 text-center text-xs font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-xl border border-indigo-100 animate-pulse">
                      {selectedPhaseForLog.phase.developerProgress?.[currentDev.id] !== undefined ? selectedPhaseForLog.phase.developerProgress[currentDev.id] : 0}%
                    </span>
                  </div>
                  {logNoWork && (
                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">Active sprint progress is safely held unchanged while Work Status blocker is active.</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400">Log summary / description (optional)</label>
                  <textarea name="description" rows={3} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-xs resize-none" placeholder="Elaborated brief of activities done today..."></textarea>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setSelectedPhaseForLog(null)} className="flex-1 py-2.5 text-slate-500 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
                  <button type="submit" disabled={submitting} className="flex-[2] py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-md">
                    {submitting ? 'recording...' : 'Commit Work Log'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Maintenance Daily Progress Modal Form */}
      <AnimatePresence>
        {selectedMntForLog && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Record Maintenance Progress</h3>
                <p className="text-xs text-amber-600 font-semibold mt-1">
                  Maintenance: {selectedMntForLog.projectName}
                </p>
              </div>

              <form onSubmit={handleAddMntDailyProgress} className="p-6 space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-slate-400">Entry date</label>
                  </div>
                  <input 
                    name="date" 
                    type="date" 
                    required 
                    max={getGMT6DateString()}
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-xs" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400">Daily target</label>
                    <input 
                      name="target" 
                      required 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-semibold text-xs" 
                      placeholder="e.g. Investigate production memory leak" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400">Actual achieved</label>
                    <input 
                      name="achieved" 
                      required 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-semibold text-xs" 
                      placeholder="e.g. Identified leak in pool allocation" 
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400">Log summary / description (optional)</label>
                  <textarea name="description" rows={3} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-xs resize-none" placeholder="Describe today's achievements on this maintenance commitment..."></textarea>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setSelectedMntForLog(null)} className="flex-1 py-2.5 text-slate-500 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
                  <button type="submit" disabled={submitting} className="flex-[2] py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-md">
                    {submitting ? 'recording...' : 'Commit Maintenance Log'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Timeline Extension Modal Form */}
      <AnimatePresence>
        {selectedPhaseForExt && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Milestone Timeline Extension</h3>
                <p className="text-xs text-amber-600 font-semibold mt-1">
                  Adjust target date values
                </p>
              </div>

              <form onSubmit={handleAddExtension} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400">Requested new deadline</label>
                  <input name="requestedDate" type="date" required defaultValue={selectedPhaseForExt.phase.expectedDeliveryDate || selectedPhaseForExt.phase.startDate || getGMT6DateString()} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-xs" />
                  <p className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider mt-1">Current expected deadline: {selectedPhaseForExt.phase.expectedDeliveryDate || 'Not Set'}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400">Reason for timeline adjustment</label>
                  <textarea name="reason" rows={3} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-xs resize-none" placeholder="Provide complete justification explaining external factors..."></textarea>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setSelectedPhaseForExt(null)} className="flex-1 py-2.5 text-slate-500 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
                  <button type="submit" disabled={submitting} className="flex-[2] py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-md">
                    {submitting ? 'processing...' : 'Extend Timeline'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Issue Modal Form */}
      <AnimatePresence>
        {selectedProjectForIssue && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Report Project Issue / Blocker</h3>
                <p className="text-xs text-rose-600 font-semibold mt-1">
                  Active in {selectedProjectForIssue.clientName}
                </p>
              </div>

              <form onSubmit={handleAddIssue} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400">Issue title</label>
                  <input name="title" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-semibold text-xs" placeholder="e.g. Broken API endpoints in backend" />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400">Select phase / milestone</label>
                  <select name="phaseId" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-xs text-slate-600">
                    <option value="">General Project Issue (No specific phase)</option>
                    {assignedPhases.filter(p => p.project.id === selectedProjectForIssue.id).map(({ phase }) => (
                      <option key={phase.id} value={phase.id}>{phase.phaseName}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400">Issue type</label>
                    <select name="type" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-xs text-slate-600">
                      <option value="Internal Issue">Internal Issue</option>
                      <option value="Client Issue">Client Issue</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400">Priority</label>
                    <select name="priority" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-xs text-slate-600">
                      <option value="Low">Low</option>
                      <option value="Medium" selected>Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400">Detailed blocker description</label>
                  <textarea name="description" rows={3} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-xs resize-none" placeholder="State clearly what is blocking your execution..."></textarea>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setSelectedProjectForIssue(null)} className="flex-1 py-2.5 text-slate-500 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
                  <button type="submit" disabled={submitting} className="flex-[2] py-2.5 bg-rose-600 text-white rounded-xl font-bold text-xs hover:bg-rose-700 transition-all shadow-md">
                    {submitting ? 'Registering Blocker...' : 'Publish Blocker'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
