import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  LayoutDashboard, 
  Layers, 
  CheckCircle, 
  XCircle, 
  Briefcase, 
  Users, 
  Activity, 
  MessageSquare,
  Clock,
  Calendar,
  AlertTriangle,
  Check,
  X,
  ShieldAlert,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Target,
  FileText,
  Database
} from 'lucide-react';
import { projectService } from '@/src/services/projectService';
import { developerService } from '@/src/services/developerService';
import { progressService } from '@/src/services/progressService';
import { adminService } from '@/src/services/adminService';
import { leaderService } from '@/src/services/leaderService';
import { Project, Developer, PhaseTracking, DailyProgress, Shift, Issue } from '@/src/types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, calculateProjectAge, formatDateForInput, resolvePhaseStatus, resolveProjectStatus, getGMT6Date, getGMT6DateString, formatDate } from '@/src/lib/utils';
import { useSnackbar } from '@/src/components/Snackbar';
import { collection, getDocs, query } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';

function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      if (isNaN(target)) {
        setTimeLeft('Invalid Date');
        return;
      }
      const difference = target - now;

      if (difference <= 0) {
        setTimeLeft('EXPIRED');
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s Remaining`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return <span>{timeLeft}</span>;
}

const getDaysRemaining = (dateString?: string) => {
  if (!dateString) return 999;
  const target = new Date(dateString);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

let dashboardCache: any = null;

export function Dashboard() {
  const { showSuccess, showError, showWarning } = useSnackbar();
  const [projects, setProjects] = useState<Project[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [selectedAdminFilter, setSelectedAdminFilter] = useState<string>('All');
  const [leaders, setLeaders] = useState<any[]>([]);
  const [selectedLeaderFilter, setSelectedLeaderFilter] = useState<string>('All');
  const [currentLeader, setCurrentLeader] = useState<any | null>(null);
  const [projectShiftFilter, setProjectShiftFilter] = useState<Shift | 'All'>('All');
  const [projectProgress, setProjectProgress] = useState<Record<string, number>>({});
  const [phaseStats, setPhaseStats] = useState<Record<string, { wipCount: number, wipValue: number, deliveredCount: number, deliveredValue: number }>>({});
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    wip: 0,
    wipAmount: 0,
    delivered: 0,
    deliveredAmount: 0,
    cancelled: 0,
    workload: 0,
    totalPortfolioValue: 0,
    totalOpenIssues: 0,
    avgMilestoneAge: 0,
    redZoneCount: 0
  });

  const [allProjectPhases, setAllProjectPhases] = useState<{ projectId: string, phases: PhaseTracking[] }[]>([]);
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [issueProjFilter, setIssueProjFilter] = useState<string>('All');
  const [issueDevFilter, setIssueDevFilter] = useState<string>('All');
  const [issuePriorityFilter, setIssuePriorityFilter] = useState<string>('All');
  const [issueStatusFilter, setIssueStatusFilter] = useState<string>('All');
  const [dailyLogs, setDailyLogs] = useState<DailyProgress[]>([]);
  const [wipSchedule, setWipSchedule] = useState<any[]>([]);
  const [allDeliveredMilestones, setAllDeliveredMilestones] = useState<any[]>([]);
  const [redZoneMilestones, setRedZoneMilestones] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'milestones' | 'kpis' | 'issues'>('overview');

  const getOwnerDetails = (ownerId: string) => {
    const admin = admins.find(a => (a.uid || a.id) === ownerId);
    const leader = leaders.find(l => (l.uid || l.id) === ownerId);
    return {
      adminName: admin ? admin.name : 'Unknown Admin',
      leaderName: leader ? leader.name : 'No Leader Assigned'
    };
  };
  const [kpiMetrics, setKpiMetrics] = useState<{ 
    monthlyKpi: Record<string, number>, 
    topDevelopers: any[], 
    projectDistribution: any[] 
  }>({ monthlyKpi: {}, topDevelopers: [], projectDistribution: [] });
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        await loadData();
      } catch (e) {
        console.error('Dashboard loadData unexpected error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isSuperAdmin = auth.currentUser?.email?.toLowerCase().trim() === 'exceptionhubjvai@gmail.com';


  const criticalFiverrMilestones = React.useMemo(() => {
    return wipSchedule.filter(m => {
      const fiverrDate = m.actualDeliveryDate || m.expectedDeliveryDate;
      if (!fiverrDate) return false;
      const days = getDaysRemaining(fiverrDate);
      return days <= 3;
    });
  }, [wipSchedule]);

  const filteredProjects = React.useMemo(() => {
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

  const filteredDevelopers = React.useMemo(() => {
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

  const filteredDailyLogs = React.useMemo(() => {
    if (currentLeader) {
      return dailyLogs.filter(log => log.ownerId === auth.currentUser?.uid);
    }

    if (isSuperAdmin) {
      let temp = dailyLogs;
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
        
        temp = temp.filter(log => log.ownerId === targetOwnerId || leaderUids.includes(log.ownerId) || leaderIds.includes(log.ownerId));
      }
      if (selectedLeaderFilter !== 'All') {
        const selectedLeader = leaders.find(l => (l.uid || l.id) === selectedLeaderFilter);
        if (selectedLeader) {
          const ownerIdToMatch = selectedLeader.uid || selectedLeader.id;
          temp = temp.filter(log => log.ownerId === ownerIdToMatch);
        }
      }
      return temp;
    }

    const adminUid = auth.currentUser?.uid;
    const adminLeaders = leaders.filter(l => l.creatorId === adminUid);
    const leaderUids = adminLeaders.map(l => l.uid).filter(Boolean);
    const leaderIds = adminLeaders.map(l => l.id);

    if (selectedLeaderFilter === 'All') {
      return dailyLogs.filter(log => log.ownerId === adminUid || leaderUids.includes(log.ownerId) || leaderIds.includes(log.ownerId));
    } else if (selectedLeaderFilter === 'Self') {
      return dailyLogs.filter(log => log.ownerId === adminUid);
    } else {
      const selectedLeader = leaders.find(l => (l.uid || l.id) === selectedLeaderFilter);
      if (selectedLeader) {
        const ownerIdToMatch = selectedLeader.uid || selectedLeader.id;
        return dailyLogs.filter(log => log.ownerId === ownerIdToMatch);
      }
      return [];
    }
  }, [dailyLogs, selectedAdminFilter, selectedLeaderFilter, isSuperAdmin, currentLeader, admins, leaders]);

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

  const filteredAllProjectPhases = React.useMemo(() => {
    const allowedProjIds = new Set(filteredProjects.map(p => p.id));
    return allProjectPhases.filter(ph => allowedProjIds.has(ph.projectId));
  }, [allProjectPhases, filteredProjects]);

  const filteredAllIssues = React.useMemo(() => {
    const allowedProjIds = new Set(filteredProjects.map(p => p.id));
    return allIssues.filter(issue => allowedProjIds.has(issue.projectId));
  }, [allIssues, filteredProjects]);

  useEffect(() => {
    if (projects.length > 0) {
      calculateStats();
    }
  }, [filteredProjects, filteredDevelopers, filteredAllProjectPhases, filteredDailyLogs, projectShiftFilter]);

  const loadData = async (forceRefresh = false) => {
    if (!forceRefresh && dashboardCache) {
      setProjects(dashboardCache.projects);
      setDevelopers(dashboardCache.developers);
      setAdmins(dashboardCache.admins);
      setLeaders(dashboardCache.leaders);
      setDailyLogs(dashboardCache.dailyLogs);
      setAllProjectPhases(dashboardCache.allProjectPhases);
      setAllIssues(dashboardCache.allIssues);
      setCurrentLeader(dashboardCache.currentLeader);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const email = auth.currentUser?.email;
      const isSuper = email && (email.toLowerCase().trim() === 'exceptionhubjvai@gmail.com');

      const [p, d, logs, adminList, leadersList] = await Promise.all([
        projectService.getAllProjects(),
        developerService.getAllDevelopers(),
        progressService.getAllDailyProgress(),
        adminService.getAllAdmins(),
        leaderService.getAllLeaders()
      ]);

      const projectsData = p || [];
      const developersData = d || [];
      const logsData = logs || [];
      const adminsData = adminList || [];
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

      setProjects(projectsData);
      setDevelopers(developersData);
      setAdmins(adminsData);
      
      const devIds = new Set(developersData.map(dev => dev.id));
      const projIds = new Set(projectsData.map(proj => proj.id));
      const filteredLogs = logsData.filter(log => devIds.has(log.developerId) && (projIds.has(log.projectId) || log.projectId === 'maintenance'))
        .map(log => ({ ...log, date: formatDateForInput(log.date) }));
      setDailyLogs(filteredLogs);
      
      const phasesResult = await Promise.all(projectsData.map(async (project) => {
        try {
          const [ph, iss] = await Promise.all([
            progressService.getPhases(project.id),
            progressService.getIssues(project.id)
          ]);
          return { projectId: project.id, phases: (ph || []) as PhaseTracking[], issues: iss || [] };
        } catch (err) {
          console.error(`Error loading details for project ${project.id}`, err);
          return { projectId: project.id, phases: [], issues: [] };
        }
      }));
      
      setAllProjectPhases(phasesResult as any);
      
      const issuesList: Issue[] = [];
      phasesResult.forEach(item => {
        if (item.issues) {
          issuesList.push(...item.issues);
        }
      });
      setAllIssues(issuesList);

      // Cache the loaded data
      dashboardCache = {
        projects: projectsData,
        developers: developersData,
        admins: adminsData,
        leaders: filteredLeaders,
        dailyLogs: filteredLogs,
        allProjectPhases: phasesResult,
        allIssues: issuesList,
        currentLeader: activeLeader
      };
    } catch (error) {
      console.error("Dashboard failed to load initial vectors:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveExtensionDashboard = async (projectId: string, phaseData: PhaseTracking, extId: string, decision: 'Approved' | 'Rejected') => {
    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      const currentExtensions = phaseData.extensions || [];
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
      let updatedDeliveryDate = phaseData.expectedDeliveryDate || phaseData.startDate || new Date().toISOString().split('T')[0];
      let updatedTotalDays = phaseData.totalExtensionDays || 0;

      if (decision === 'Approved') {
        updatedDeliveryDate = targetExt.newDate;
        updatedTotalDays = (phaseData.totalExtensionDays || 0) + (targetExt.days || 1);
      }

      // Determine correct final phase status dynamically
      const mockUpdatedPhase: PhaseTracking = {
        ...phaseData,
        extensions: updatedExtensions,
        expectedDeliveryDate: updatedDeliveryDate,
        totalExtensionDays: updatedTotalDays
      };
      
      const resolvedStatus = resolvePhaseStatus(mockUpdatedPhase);

      const updateData: Partial<PhaseTracking> = {
        extensions: updatedExtensions,
        expectedDeliveryDate: updatedDeliveryDate,
        totalExtensionDays: updatedTotalDays,
        status: resolvedStatus
      };

      await progressService.updatePhase(projectId, phaseData.id, updateData);

      // Resolve overall project status as well
      const projectPhases = await progressService.getPhases(projectId);
      const updatedPhases = projectPhases?.map(p => p.id === phaseData.id ? { ...p, ...updateData } : p) || [];
      const newProjStatus = resolveProjectStatus(project, updatedPhases);
      if (newProjStatus !== project.status) {
        await projectService.updateProject(projectId, { status: newProjStatus });
      }

      showSuccess(`Timeline extension request ${decision.toLowerCase()} successfully!`);
      loadData(true);
    } catch (err) {
      console.error(err);
      showError("Failed to resolve extension request.");
    }
  };

  // Extract all extension requests across all projects & phases
  const allExtensions = React.useMemo(() => {
    const list: any[] = [];
    filteredAllProjectPhases.forEach(item => {
      const project = filteredProjects.find(p => p.id === item.projectId);
      if (!project) return;
      const phases = (item as any).phases || [];
      phases.forEach((phase: PhaseTracking) => {
        if (phase.extensions && Array.isArray(phase.extensions) && phase.extensions.length > 0) {
          phase.extensions.forEach((ext: any) => {
            list.push({
              ...ext,
              projectId: item.projectId,
              project,
              projectName: project.clientName || project.projectId,
              phaseId: phase.id,
              phaseName: phase.phaseName,
              phaseData: phase
            });
          });
        }
      });
    });
    const getMs = (dateVal: any) => {
      if (!dateVal) return 0;
      if (typeof dateVal === 'string') return new Date(dateVal).getTime() || 0;
      if (dateVal instanceof Date) return dateVal.getTime() || 0;
      if (dateVal.toDate && typeof dateVal.toDate === 'function') return dateVal.toDate().getTime() || 0;
      if (dateVal.seconds !== undefined) return dateVal.seconds * 1000;
      const t = new Date(String(dateVal)).getTime();
      return isNaN(t) ? 0 : t;
    };
    return list.sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
  }, [filteredAllProjectPhases, filteredProjects]);

  const calculateStats = () => {
    const filteredProjectsForCalc = projectShiftFilter === 'All' 
      ? filteredProjects 
      : filteredProjects.filter(p => (p.shift || 'Day') === projectShiftFilter);
    const filteredProjectIds = new Set(filteredProjectsForCalc.map(p => p.id));

    const pStats: Record<string, { wipCount: number, wipValue: number, deliveredCount: number, deliveredValue: number }> = {};
    const progressMap: Record<string, number> = {};
    let totalIssues = 0;
    let totalMilestoneAge = 0;
    let activeMilestoneCount = 0;
    let redZoneCount = 0;
    const redZoneList: any[] = [];

    filteredAllProjectPhases.filter(res => filteredProjectIds.has(res.projectId)).forEach(res => {
      const project = filteredProjects.find(p => p.id === res.projectId);
      if (!project) return;

      const iss = (res as any).issues || [];
      totalIssues += iss.filter((i: any) => i.status === 'Open').length;

      const ph = res.phases;
      if (ph && ph.length > 0) {
        const total = ph.reduce((acc: any, curr: any) => acc + (curr.progress || 0), 0);
        progressMap[project.id] = Math.round(total / ph.length);
        
        ph.forEach(phase => {
          if (!pStats[phase.phaseName]) {
            pStats[phase.phaseName] = { wipCount: 0, wipValue: 0, deliveredCount: 0, deliveredValue: 0 };
          }
          if (phase.status === 'In Progress' || phase.status === 'Delayed' || phase.status === 'Extension Requested' || phase.status === 'Ready for Delivery') {
            pStats[phase.phaseName].wipCount++;
            pStats[phase.phaseName].wipValue += phase.value || 0;
            
            if (phase.startDate) {
              const age = calculateProjectAge(phase.startDate);
              totalMilestoneAge += age;
              activeMilestoneCount++;

              let threshold = 30;
              if (phase.phaseName === 'UI/UX' || phase.phaseName === 'App Frontend' || phase.phaseName === 'Web Frontend') {
                threshold = 15;
              } else if (phase.phaseName === 'Backend') {
                threshold = 25;
              }

              if (age > threshold) {
                redZoneCount++;
                const openIssues = iss.filter((i: any) => i.status === 'Open' && i.phaseId === phase.id);
                redZoneList.push({
                  ...phase,
                  clientName: project.clientName,
                  projectIdAlias: project.projectId,
                  age,
                  threshold,
                  openIssues
                });
              }
            }
          } else if (phase.status === 'Delivered') {
            pStats[phase.phaseName].deliveredCount++;
            pStats[phase.phaseName].deliveredValue += phase.value || 0;
          }
        });
      }
    });

    setProjectProgress(progressMap);
    setPhaseStats(pStats);
    setRedZoneMilestones(redZoneList);

    // Calculate Monthly Statistics
    const mStatsMap: Record<string, any> = {};
    const ensureMonth = (date: any) => {
      let dateStr = formatDateForInput(date) || new Date().toISOString().split('T')[0];
      let monthKey = dateStr.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(monthKey) || isNaN(new Date(monthKey + '-01').getTime())) {
        monthKey = new Date().toISOString().slice(0, 7);
      }
      if (!mStatsMap[monthKey]) {
        mStatsMap[monthKey] = {
          month: monthKey,
          portfolioValue: 0,
          wipVolume: 0,
          deliveredTotal: 0,
          deliveredCount: 0,
          activeCapacity: 0,
          projectCount: 0
        };
      }
      return monthKey;
    };

    filteredProjectsForCalc.forEach(p => {
      const m = ensureMonth(p.startDate || p.createdAt);
      mStatsMap[m].portfolioValue += (p.amount || 0) * 0.8;
      mStatsMap[m].projectCount++;
    });

    filteredAllProjectPhases.filter(res => filteredProjectIds.has(res.projectId)).forEach(res => {
      const project = filteredProjects.find(p => p.id === res.projectId);
      res.phases.forEach(ph => {
        if ((ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested' || ph.status === 'Ready for Delivery') && ph.startDate) {
          const m = ensureMonth(ph.startDate);
          mStatsMap[m].wipVolume += (ph.value || 0) * 0.8;
          mStatsMap[m].activeCapacity++;
        } else if (ph.status === 'Delivered') {
          const deliveryTime = ph.endDate || ph.actualDeliveryDate || project?.deliveryDate || ph.startDate || '';
          if (deliveryTime) {
            const m = ensureMonth(deliveryTime);
            mStatsMap[m].deliveredTotal += (ph.value || 0) * 0.8;
            mStatsMap[m].deliveredCount++;
          }
        }
      });
    });

    const mData = Object.values(mStatsMap).sort((a: any, b: any) => a.month.localeCompare(b.month));
    setMonthlyData(mData);

    const wipAmount = filteredAllProjectPhases.filter(res => filteredProjectIds.has(res.projectId)).reduce((acc, curr) => 
      acc + curr.phases.filter(ph => ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested' || ph.status === 'Ready for Delivery').reduce((accPh, ph) => accPh + (ph.value || 0), 0), 0
    ) * 0.8;
    const deliveredAmount = filteredAllProjectPhases.filter(res => filteredProjectIds.has(res.projectId)).reduce((acc, curr) => 
      acc + curr.phases.filter(ph => ph.status === 'Delivered').reduce((accPh, ph) => accPh + (ph.value || 0), 0), 0
    ) * 0.8;

    const activeMilestones: any[] = [];
    filteredAllProjectPhases.filter(res => filteredProjectIds.has(res.projectId)).forEach(res => {
      const project = filteredProjects.find(p => p.id === res.projectId);
      res.phases.forEach(ph => {
        if ((ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested' || ph.status === 'Ready for Delivery') && ph.expectedDeliveryDate) {
          activeMilestones.push({
            ...ph,
            actualDeliveryDate: ph.actualDeliveryDate || ph.expectedDeliveryDate,
            clientName: project?.clientName || 'Unknown Client',
            projectIdAlias: project?.projectId || 'N/A',
            parentProjectId: res.projectId
          });
        }
      });
    });

    activeMilestones.sort((a, b) => new Date(a.expectedDeliveryDate).getTime() - new Date(b.expectedDeliveryDate).getTime());
    setWipSchedule(activeMilestones);

    const deliveredMilestones: any[] = [];
    filteredAllProjectPhases.filter(res => filteredProjectIds.has(res.projectId)).forEach(res => {
      const project = filteredProjects.find(p => p.id === res.projectId);
      res.phases.forEach(ph => {
        if (ph.status === 'Delivered') {
          const deliveryTime = ph.endDate || ph.actualDeliveryDate || project?.deliveryDate || ph.startDate || '';
          const formattedDelivery = formatDateForInput(deliveryTime);
          if (formattedDelivery) {
            const m = formattedDelivery.slice(0, 7); // YYYY-MM
            deliveredMilestones.push({
              ...ph,
              deliveryDate: deliveryTime,
              month: m,
              clientName: project?.clientName || 'Unknown Client',
              projectIdAlias: project?.projectId || 'N/A',
              parentProjectId: res.projectId,
              ownerId: project?.ownerId
            });
          }
        }
      });
    });
    deliveredMilestones.sort((a, b) => {
      const aTime = formatDateForInput(a.deliveryDate);
      const bTime = formatDateForInput(b.deliveryDate);
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    setAllDeliveredMilestones(deliveredMilestones);

    const monthlyKpiMap: Record<string, number> = {};
    const devKpiMap: Record<string, number> = {};
    const projectKpiMap: Record<string, number> = {};

    filteredAllProjectPhases.filter(res => filteredProjectIds.has(res.projectId)).forEach(res => {
      const project = filteredProjects.find(p => p.id === res.projectId);
      res.phases.forEach(ph => {
        if (ph.status === 'Delivered' && ph.kpiAllocations && Array.isArray(ph.kpiAllocations)) {
          const mKey = ph.month || 'Other';
          ph.kpiAllocations.forEach(alloc => {
            const kpiVal = alloc.value || 0;
            monthlyKpiMap[mKey] = (monthlyKpiMap[mKey] || 0) + kpiVal;
            devKpiMap[alloc.developerId] = (devKpiMap[alloc.developerId] || 0) + kpiVal;
            if (project) {
              projectKpiMap[project.projectId] = (projectKpiMap[project.projectId] || 0) + kpiVal;
            }
          });
        }
      });
    });

    const topDevs = Object.entries(devKpiMap)
      .map(([id, val]) => ({ 
        ...filteredDevelopers.find(d => d.id === id), 
        totalKpi: val 
      }))
      .sort((a, b) => (b.totalKpi || 0) - (a.totalKpi || 0))
      .slice(0, 5);

    const projDist = Object.entries(projectKpiMap)
      .map(([id, val]) => ({ name: id, value: val }))
      .sort((a, b) => b.value - a.value);

    setKpiMetrics({
      monthlyKpi: monthlyKpiMap,
      topDevelopers: topDevs,
      projectDistribution: projDist
    });

    setStats({
      total: filteredProjectsForCalc.length,
      wip: filteredProjectsForCalc.filter(p => p.status === 'WIP').length,
      wipAmount: wipAmount,
      delivered: filteredProjectsForCalc.filter(p => p.status === 'Delivered' || p.status === 'Complete').length,
      deliveredAmount: deliveredAmount,
      cancelled: filteredProjectsForCalc.filter(p => p.status === 'Cancelled').length,
      workload: filteredAllProjectPhases.filter(res => filteredProjectIds.has(res.projectId)).reduce((acc, curr) => acc + curr.phases.filter(ph => ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested' || ph.status === 'Ready for Delivery').length, 0),
      totalPortfolioValue: filteredProjectsForCalc.reduce((acc, curr) => acc + (curr.amount || 0), 0) * 0.8,
      totalOpenIssues: totalIssues,
      avgMilestoneAge: activeMilestoneCount > 0 ? Math.round(totalMilestoneAge / activeMilestoneCount) : 0,
      redZoneCount: redZoneCount
    });
  };

  const statusData = [
    { name: 'WIP', value: stats.wip, color: '#4f46e5' },
    { name: 'Delivered', value: stats.delivered, color: '#10b981' },
    { name: 'Cancelled', value: stats.cancelled, color: '#f43f5e' },
  ];

  const currentMonthlyStats = monthlyData.find(d => d.month === selectedMonth) || {
    portfolioValue: 0,
    wipVolume: 0,
    deliveredTotal: 0,
    deliveredCount: 0,
    activeCapacity: 0
  };

  const missedUpdates = React.useMemo(() => {
    // 1. All active projects
    const activeProjects = filteredProjects.filter(p => p.status === 'WIP' || p.status === 'Delayed');
    const activeProjectIds = new Set(activeProjects.map(p => p.id));

    // 2. Map all developers to their active milestones (milestones that are 'In Progress')
    const activeDevMilestones: Record<string, Array<{ project: Project; phase: PhaseTracking }>> = {};
    filteredAllProjectPhases.forEach(item => {
      if (!activeProjectIds.has(item.projectId)) return;
      const project = filteredProjects.find(p => p.id === item.projectId);
      if (!project) return;
      
      item.phases.forEach(ph => {
        if ((ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested') && ph.developerIds && Array.isArray(ph.developerIds)) {
          ph.developerIds.forEach(devId => {
            if (!activeDevMilestones[devId]) {
              activeDevMilestones[devId] = [];
            }
            activeDevMilestones[devId].push({ project, phase: ph });
          });
        }
      });
    });

    const missedList: Array<{
      developer: Developer;
      date: string;
      milestones: Array<{ project: Project; phase: PhaseTracking }>;
      isToday: boolean;
      deadlinePassed: boolean;
    }> = [];

    const now = new Date();
    const gmt6Time = getGMT6Date(now);

    // Check last 2 days (today and yesterday) in GMT+6
    for (let i = 0; i < 2; i++) {
      const checkDate = new Date(gmt6Time.getTime());
      checkDate.setUTCDate(gmt6Time.getUTCDate() - i);
      const y = checkDate.getUTCFullYear();
      const m = checkDate.getUTCMonth(); // 0-indexed
      const d = checkDate.getUTCDate();
      
      const checkDateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = i === 0;

      Object.entries(activeDevMilestones).forEach(([devId, milestones]) => {
        const dev = filteredDevelopers.find(d => d.id === devId);
        if (!dev) return;

        const shift = dev.shift || 'Day';
        
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

        const hasLog = filteredDailyLogs.some(l => l.developerId === devId && l.date === checkDateStr);
        
        if (!hasLog) {
          missedList.push({
            developer: dev,
            date: checkDateStr,
            milestones,
            isToday,
            deadlinePassed
          });
        }
      });
    }

    return missedList.filter(item => item.deadlinePassed).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredProjects, filteredDevelopers, filteredAllProjectPhases, filteredDailyLogs]);

  if (loading) return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-64 bg-slate-200 rounded-lg"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-100 rounded-3xl"></div>)}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-slate-500 text-sm font-medium">Tracking ${stats.totalPortfolioValue.toLocaleString()} in project volume.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 font-sans">
          {isSuperAdmin && (
            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full sm:w-auto shrink-0 font-sans">
              <select 
                value={selectedAdminFilter} 
                onChange={(e) => setSelectedAdminFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 px-3.5 py-1 outline-none border-none cursor-pointer w-full font-sans"
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
                className="bg-transparent text-xs font-bold text-slate-700 px-3.5 py-1 outline-none border-none cursor-pointer w-full font-sans"
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
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto no-scrollbar max-w-full">
            <button
              onClick={() => setProjectShiftFilter('All')}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                projectShiftFilter === 'All' ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-400 hover:text-slate-600"
              )}
            >
              All
            </button>
            <button
              onClick={() => setProjectShiftFilter('Day')}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                projectShiftFilter === 'Day' ? "bg-amber-500 text-white shadow-lg shadow-amber-200" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Day
            </button>
            <button
              onClick={() => setProjectShiftFilter('Night')}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                projectShiftFilter === 'Night' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Night
            </button>
          </div>
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-full sm:w-auto">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 px-3 py-1 outline-none border-none cursor-pointer w-full"
            >
              {[...new Set([...monthlyData.map(d => d.month), new Date().toISOString().slice(0, 7)])].sort().reverse().map(m => {
                let displayLabel = m;
                try {
                  const dObj = new Date(m + '-01');
                  if (!isNaN(dObj.getTime())) {
                    displayLabel = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  }
                } catch (err) {
                  console.warn("Failed to format month option label:", err);
                }
                return (
                  <option key={m} value={m}>{displayLabel}</option>
                );
              })}
            </select>
          </div>
          <button className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm w-full sm:w-auto">
            <Activity className="w-4 h-4" />
            Live Monitor
          </button>

        </div>
      </div>

      {/* Fiverr Critical Deadline Warning Banner */}
      {criticalFiverrMilestones.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 border-2 border-rose-250 rounded-[2rem] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 border border-rose-200 shrink-0">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h4 className="text-sm font-black text-rose-950 uppercase tracking-wider">⚠️ Fiverr Delivery Deadline Alerts</h4>
              <div className="text-xs text-rose-800 font-bold leading-normal mt-1 space-y-1">
                <p>The following milestones have a Fiverr deadline of 3 days or less. Please request an extension or deliver immediately:</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  {criticalFiverrMilestones.map((m, idx) => {
                    const days = getDaysRemaining(m.actualDeliveryDate || m.expectedDeliveryDate);
                    return (
                      <li key={idx}>
                        <strong>{m.clientName}</strong> ({m.phaseName}) — {days < 0 ? `${Math.abs(days)} days overdue!` : `${days} days left`} (Fiverr Due: {formatDate(m.actualDeliveryDate || m.expectedDeliveryDate)})
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Extension Notification Banner */}
      {allExtensions.filter(e => e.status === 'Pending').length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-200 shrink-0">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-950 uppercase tracking-wider">Pending Milestone Extension Alerts</h4>
              <p className="text-xs text-amber-800 font-bold leading-normal mt-0.5">
                The administrative network intercepted <span className="text-amber-600 font-black">{allExtensions.filter(e => e.status === 'Pending').length} pending</span> timeline extension adjustment requests waiting for your executive decision.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => {
              setActiveTab('milestones');
              setTimeout(() => {
                const el = document.getElementById('timeline-extensions');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 shrink-0 cursor-pointer"
          >
            Review Requests
          </button>
        </motion.div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-6">
        <MetricCard
          title="Red Zone Risk"
          value={stats.redZoneCount}
          subTitle="Aging Milestones"
          icon={Activity}
          color={stats.redZoneCount > 0 ? "bg-rose-600 shadow-rose-200" : "bg-emerald-600 shadow-emerald-200"}
          trend={stats.redZoneCount > 0 ? "Attention Required" : "Health Optimal"}
          onClick={() => {
            const el = document.getElementById('red-zone-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        />
        <MetricCard
          title="Net WIP Volume"
          value={`$${stats.wipAmount.toLocaleString()}`}
          subTitle={`${stats.workload} Milestones Active`}
          icon={Activity}
          color="bg-amber-500"
          trend="Active production (80%)"
        />
        <MetricCard
          title="Net Delivered Total"
          value={`$${currentMonthlyStats.deliveredTotal.toLocaleString()}`}
          subTitle={`${currentMonthlyStats.deliveredCount} Milestones Delivered`}
          icon={CheckCircle}
          color="bg-emerald-600"
          trend="Completed value (80%)"
        />
        <MetricCard
          title="Active Capacity"
          value={stats.workload}
          subTitle={`Avg Age: ${stats.avgMilestoneAge} Days`}
          icon={Layers}
          color="bg-indigo-600"
          trend="In-Flight Milestones"
        />
        <MetricCard
          title="System Resilience"
          value={stats.totalOpenIssues}
          subTitle="Active Issues"
          icon={XCircle}
          color={stats.totalOpenIssues > 0 ? "bg-rose-600" : "bg-emerald-600"}
          trend={stats.totalOpenIssues > 0 ? "Attention Required" : "System Stable"}
        />
      </div>

      {/* Interactive Tab Switcher Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-2.5 rounded-3xl border border-slate-200/60 shadow-sm my-6">
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all duration-300 active:scale-95 cursor-pointer",
              activeTab === 'overview' 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            Overview & Analytics
          </button>
          <button
            onClick={() => setActiveTab('milestones')}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all duration-300 active:scale-95 relative cursor-pointer",
              activeTab === 'milestones' 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <Layers className="w-4 h-4" />
            Milestones & Ops
            {wipSchedule.length + allExtensions.length > 0 && (
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[8px] font-black font-mono shrink-0",
                activeTab === 'milestones' ? "bg-white/30 text-white" : "bg-indigo-100 text-indigo-700"
              )}>
                {wipSchedule.length + allExtensions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('kpis')}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all duration-300 active:scale-95 cursor-pointer",
              activeTab === 'kpis' 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <Target className="w-4 h-4" />
            KPI Intelligence
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all duration-300 active:scale-95 relative cursor-pointer",
              activeTab === 'issues' 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <AlertTriangle className="w-4 h-4" />
            Risks & Issues
            {stats.totalOpenIssues + stats.redZoneCount > 0 && (
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[8px] font-black font-mono shrink-0 animate-pulse",
                activeTab === 'issues' ? "bg-white/30 text-white" : "bg-rose-100 text-rose-700"
              )}>
                {stats.totalOpenIssues + stats.redZoneCount}
              </span>
            )}
          </button>
        </div>
        
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3">
          Active Tab: {activeTab === 'overview' ? 'Overview & Performance' : activeTab === 'milestones' ? 'Operational Milestones' : activeTab === 'kpis' ? 'KPI Contribution' : 'Risk & Issues Registry'}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25 }}
          className="space-y-8"
        >


      {/* Missed Daily Updates Board */}
      {activeTab === 'issues' && missedUpdates.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3 font-sans">
              <div className="w-2 h-8 bg-rose-600 rounded-full animate-pulse" />
              Outstanding Alarms: Missed Daily Updates
            </h3>
            <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-rose-150 animate-pulse">
              {missedUpdates.length} Violations
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 font-sans">
            {missedUpdates.map((item, idx) => (
              <div key={`missed-${item.developer.id}-${item.date}-${idx}`} className="bg-white rounded-[2rem] border-2 border-rose-100 p-6 shadow-sm hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 left-0 w-full h-1 bg-rose-600" />
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 font-bold border border-rose-100 shrink-0">
                      {item.developer.name[0]}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="text-sm font-black text-slate-900 truncate leading-none mb-1">{item.developer.name}</h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-sans">{item.developer.designation} • {item.developer.shift} Shift</p>
                    </div>
                  </div>

                  <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px] font-black text-rose-600 uppercase tracking-wider font-mono">
                      <span>Missed Update For:</span>
                      <span>{item.date}</span>
                    </div>
                    <p className="text-[11px] font-bold text-slate-600 mt-1 uppercase tracking-tight leading-normal">
                      System Alert: Failed to submit daily project update by the {item.developer.shift === 'Night' ? '11:59 AM' : '11:59 PM'} deadline.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 font-sans">Active Milestones:</p>
                    {item.milestones.map((m, mIdx) => (
                      <div key={mIdx} className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center justify-between">
                        <div className="truncate pr-2">
                          <p className="text-xs font-black text-slate-800 truncate">{m.project.clientName}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-sans">{m.phase.phaseName}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100/50 rounded text-[8px] font-black text-indigo-700 tracking-wider uppercase shrink-0 font-mono">
                          {m.phase.progress}% WIP
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-[10px] font-black uppercase text-rose-500">
                  <span className="flex items-center gap-1.5 leading-none">
                    <ShieldAlert className="w-3.5 h-3.5" /> MISSING REPORT
                  </span>
                  <span className="text-slate-400 tracking-wider font-mono font-bold">
                    {item.developer.shift === 'Night' ? '11:59 AM' : '11:59 PM'} GMT+6
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Red Zone Alerts */}
      {activeTab === 'issues' && redZoneMilestones.length > 0 && (
        <div id="red-zone-section" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-2 h-8 bg-rose-600 rounded-full" />
              Red Zone Alert: Aging Milestones
            </h3>
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Immediate Review Required</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {redZoneMilestones.map((milestone, idx) => (
              <div key={`red-${milestone.id}-${idx}`} className="bg-white rounded-[2rem] border-2 border-rose-100 p-6 shadow-lg shadow-rose-500/5 hover:shadow-rose-500/10 transition-all group overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-rose-500" />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 font-bold border border-rose-100">
                      {milestone.clientName[0]}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 tracking-tight line-clamp-1">{milestone.clientName}</h4>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{milestone.phaseName} • {milestone.orderId || milestone.projectIdAlias}</p>
                    </div>
                  </div>
                  <div className="bg-rose-100 text-rose-600 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">
                    {milestone.age} Days
                  </div>
                </div>

                <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Standard Threshold</span>
                    <span className="text-xs font-black text-rose-600">{milestone.threshold} Days</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Overdue By</span>
                    <span className="text-sm font-black text-rose-600">{milestone.age - milestone.threshold} Days</span>
                  </div>
                </div>

                {milestone.openIssues && milestone.openIssues.length > 0 && (
                  <div className="mt-4 space-y-2">
                     <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest px-1">Reported Issues</p>
                     {milestone.openIssues.map((issue: any) => (
                       <div key={issue.id} className="bg-rose-100/30 border border-rose-200/50 p-3 rounded-xl">
                          <div className="flex items-center gap-2 mb-1">
                             <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                             <span className="text-[9px] font-black text-rose-600 uppercase tracking-tight">{issue.type}</span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-700 leading-relaxed italic">
                            "{issue.description}"
                          </p>
                       </div>
                     ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Chart Section */}
      {activeTab === 'overview' && (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 relative z-10">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-2 h-8 bg-indigo-600 rounded-full" />
              Monthly Growth & Performance
            </h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Correlating Portfolio Input vs Delivery Throughput</p>
          </div>
          <div className="flex gap-4">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-900" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Portfolio</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Delivered</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">WIP Volume</span>
             </div>
          </div>
        </div>
        
        <div className="h-[350px] w-full relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }}
                tickFormatter={(val) => {
                  try {
                    const d = new Date(val + '-01');
                    return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { month: 'short' });
                  } catch (e) {
                    return val;
                  }
                }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }}
                tickFormatter={(val) => `$${(val / 1000)}k`}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ 
                  backgroundColor: '#ffffff', 
                  borderRadius: '24px', 
                  border: '1px solid #e2e8f0', 
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12)',
                  padding: '20px'
                }}
                labelStyle={{ color: '#0f172a', fontWeight: 900, fontSize: '12px', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.1em' }}
                labelFormatter={(val) => {
                  try {
                    const d = new Date(val + '-01');
                    return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  } catch (e) {
                    return val;
                  }
                }}
              />
              <Bar dataKey="portfolioValue" name="Portfolio Value" fill="#0f172a" radius={[6, 6, 0, 0]} barSize={24} />
              <Bar dataKey="deliveredTotal" name="Delivered Total" fill="#10b981" radius={[6, 6, 0, 0]} barSize={24} />
              <Bar dataKey="wipVolume" name="WIP Volume" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      )}

      {/* KPI Intelligence Section */}
      {activeTab === 'kpis' && (
        <div className="space-y-6 lg:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-2 h-8 bg-emerald-500 rounded-full" />
            KPI Intelligence Summary
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cross-functional delivery value</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Monthly KPI Chart */}
          <div className="bg-white p-4 sm:p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col">
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Monthly KPI Distribution</h4>
            <div className="flex-1 h-64 lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={Object.entries(kpiMetrics.monthlyKpi).map(([m, v]) => ({ month: m, value: v })).sort((a,b) => a.month.localeCompare(b.month))}>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-center font-bold text-slate-400 uppercase tracking-widest mt-4">Total Value Allocated via Milestones</p>
          </div>

          {/* Top Contributing Developers */}
          <div className="bg-white p-4 sm:p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm">
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Top Contributors</h4>
            <div className="space-y-5">
              {kpiMetrics.topDevelopers.map((dev, idx) => (
                <div key={`${dev.id || 'dev'}-${idx}`} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs font-black text-indigo-600">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-black text-slate-900 leading-none">{dev.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{dev.role}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-indigo-600">${(dev.totalKpi || 0).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {kpiMetrics.topDevelopers.length === 0 && (
                <p className="text-center py-10 text-[10px] font-black text-slate-300 uppercase italic">No KPI data indexed</p>
              )}
            </div>
          </div>

          {/* Project Distribution */}
          <div className="bg-white p-4 sm:p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center md:col-span-2 lg:col-span-1">
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 self-start">Project Distribution</h4>
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={kpiMetrics.projectDistribution}
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {kpiMetrics.projectDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-2 mt-4 max-h-32 overflow-y-auto pr-2">
              {kpiMetrics.projectDistribution.map((p, idx) => (
                <div key={`${p.name}-${idx}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'][idx % 5] }} />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{p.name}</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-900">${p.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      )}

      {/* Charts Section */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Status Distribution */}
        <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center">
          <h3 className="text-lg font-bold text-slate-800 mb-8 self-start tracking-tight">Project Status</h3>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={8}
                  dataKey="value"
                  stroke="none"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full mt-4 space-y-3">
             {statusData.map((item, idx) => (
               <div key={`${item.name}-${idx}`} className="flex items-center justify-between group cursor-default">
                 <div className="flex items-center gap-3">
                   <div className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125" style={{ backgroundColor: item.color }}></div>
                   <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{item.name}</span>
                 </div>
                 <span className="text-sm font-black text-slate-900">{item.value}</span>
               </div>
             ))}
          </div>
        </div>

        {/* Capacity Chart */}
        <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Workload & Value Distribution</h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded">By Capacity</span>
          </div>
          <div className="space-y-6 md:space-y-8">
            {developers.slice(0, 5).map((dev, idx) => {
              const devPhases = allProjectPhases.flatMap(pRes => 
                pRes.phases.filter(ph => ph.developerIds?.includes(dev.id))
              );
              
              const totalValue = devPhases.reduce((acc, ph) => acc + (ph.value || 0), 0);
              const activeCount = devPhases.filter(ph => ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested' || ph.status === 'Ready for Delivery').length;
              
              return (
                <div key={`${dev.id}-${idx}`} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{dev.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{dev.role} • {activeCount} Active</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-indigo-600 tracking-tight">${Math.round(totalValue * 0.8).toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Net Contribution</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (activeCount / 5) * 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="h-full bg-indigo-600 rounded-full transition-all"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      )}

      {/* Milestone Stats Section */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800 tracking-tight">Milestone Performance Matrix</h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded">Execution Layer</span>
        </div>
        
        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="text-left px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Milestone Phase</th>
                <th className="text-left px-8 py-4 text-[10px] font-black text-amber-500 uppercase tracking-widest">WIP Count</th>
                <th className="text-left px-8 py-4 text-[10px] font-black text-amber-600 uppercase tracking-widest">Net WIP Amount</th>
                <th className="text-left px-8 py-4 text-[10px] font-black text-emerald-500 uppercase tracking-widest">Delivered Count</th>
                <th className="text-left px-8 py-4 text-[10px] font-black text-emerald-600 uppercase tracking-widest">Net Delivered Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.entries(phaseStats).map(([name, s]: [string, any], idx: number) => (
                <tr key={`${name}-${idx}`} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-8 py-4">
                    <span className="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{name}</span>
                  </td>
                  <td className="px-8 py-4">
                    <span className="text-sm font-bold text-slate-900">{s.wipCount}</span>
                  </td>
                  <td className="px-8 py-4">
                    <span className="text-sm font-black text-amber-600 tracking-tight">${Math.round(s.wipValue * 0.8).toLocaleString()}</span>
                  </td>
                  <td className="px-8 py-4">
                    <span className="text-sm font-bold text-slate-900">{s.deliveredCount}</span>
                  </td>
                  <td className="px-8 py-4">
                    <span className="text-sm font-black text-emerald-600 tracking-tight">${Math.round(s.deliveredValue * 0.8).toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Grid View */}
        <div className="lg:hidden p-4 space-y-4">
          {Object.entries(phaseStats).map(([name, s]: [string, any], idx: number) => (
            <div key={`${name}-${idx}-mobile`} className="bg-slate-50/30 rounded-2xl p-5 border border-slate-100 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{name}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">WIP Status</p>
                  <p className="text-xs font-bold text-slate-900">{s.wipCount} active units</p>
                  <p className="text-sm font-black text-amber-600 tracking-tight">${Math.round(s.wipValue * 0.8).toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Delivered</p>
                  <p className="text-xs font-bold text-slate-900">{s.deliveredCount} units</p>
                  <p className="text-sm font-black text-emerald-600 tracking-tight">${Math.round(s.deliveredValue * 0.8).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      )}

      {/* Developer Daily Activity Hub */}
      {activeTab === 'milestones' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between font-sans">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <div className="w-2 h-8 bg-indigo-600 rounded-full" />
                Developer Activity Hub
              </h3>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mt-1">Real-time status updates stream (no system logs or admin actions)</p>
            </div>
            <p className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full uppercase tracking-wider">
              {filteredDailyLogs.length} Developer updates
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredDailyLogs.slice(0, 15).map(log => {
              const dev = filteredDevelopers.find(d => d.id === log.developerId);
              const project = filteredProjects.find(p => p.id === log.projectId);
              let formattedDate = 'N/A';
              try {
                const dateObj = new Date(log.date);
                if (!isNaN(dateObj.getTime())) {
                  formattedDate = new Intl.DateTimeFormat('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  }).format(dateObj);
                }
              } catch (err) {
                console.warn("Failed to format daily log date:", log.date, err);
              }

              return (
                <div key={log.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-all flex flex-col md:flex-row gap-5 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 h-full w-1 bg-slate-100 group-hover:bg-indigo-600 transition-colors" />
                  
                  {/* Left Column: Developer Profile Info */}
                  <div className="flex md:flex-col items-center md:items-start gap-3 md:w-36 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 pb-3 md:pb-0 md:pr-4">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-xs shadow-md shadow-slate-900/10 shrink-0">
                      {dev?.name?.[0] || 'D'}
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="font-extrabold text-sm text-slate-950 truncate max-w-[150px]">{dev?.name || 'Developer'}</h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{dev?.designation || 'Engineer'}</p>
                      <span className="inline-block mt-2 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg text-[8px] font-black text-slate-500 uppercase tracking-widest font-mono">
                        {log.shift || 'Day'} Shift
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Update Details */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-10">
                      <div>
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">
                          {project?.clientName || 'Project'}
                        </span>
                        <h5 className="font-extrabold text-xs text-slate-400 uppercase tracking-widest mt-0.5">
                          Milestone: {log.phaseName || 'Milestone'}
                        </h5>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-slate-900 font-mono">{formattedDate}</p>
                        <span className="inline-block px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-black text-indigo-700 font-mono mt-1">
                          {log.progressPercentage}% Progress
                        </span>
                      </div>
                    </div>

                    {/* Targeted Goal & Actual Achieved Dashboard */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/60 p-4 rounded-2xl border border-slate-110 border-slate-200/45 mb-3 shadow-inner">
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
                          <CheckCircle className="w-3.5 h-3.5 text-indigo-500" />
                          Actual Achieved
                        </span>
                        <p className="text-xs font-black text-indigo-600 leading-relaxed">
                          {log.actualDone || 'No Delta Declared'}
                        </p>
                      </div>
                    </div>

                    {/* Collapsible Developer Notes */}
                    {log.description && (
                      <div className="mt-2 text-left">
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
                              transition={{ duration: 0.18 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 p-3 bg-slate-50 border border-slate-150/45 rounded-xl text-xs text-slate-500 italic leading-relaxed">
                                "{log.description}"
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredDailyLogs.length === 0 && (
              <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100">
                <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <Activity className="w-8 h-8 text-slate-200" />
                </div>
                <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">No activity logs indexed in neural network</p>
              </div>
            )}
          </div>
       </div>

      )}

      {/* Dev-Driven Central Issue Tracker Control Console */}
      {activeTab === 'issues' && (
        <div className="space-y-6 my-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-2 h-8 bg-rose-600 rounded-full font-sans" />
              Developer Blocker Control Center
            </h3>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mt-1">
              Captured real-time impediments hindering milestone progression
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
              {filteredAllIssues.filter(i => i.status === 'Open').length} Open Blockers
            </span>
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
              {filteredAllIssues.filter(i => i.status === 'Resolved').length} Resolved
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-sans">Filter by Project</label>
            <select
              value={issueProjFilter}
              onChange={(e) => setIssueProjFilter(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 transition-all font-bold text-xs text-slate-700 cursor-pointer"
            >
              <option value="All">All Projects ({filteredProjects.length})</option>
              {filteredProjects.map(p => (
                <option key={p.id} value={p.id}>{p.clientName || p.projectId}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-sans">Filter by Developer</label>
            <select
              value={issueDevFilter}
              onChange={(e) => setIssueDevFilter(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 transition-all font-bold text-xs text-slate-700 cursor-pointer"
            >
              <option value="All">All Developers ({filteredDevelopers.length})</option>
              {filteredDevelopers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-sans">Filter by Priority</label>
            <select
              value={issuePriorityFilter}
              onChange={(e) => setIssuePriorityFilter(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 transition-all font-bold text-xs text-slate-700 cursor-pointer"
            >
              <option value="All">All Priorities</option>
              <option value="Low">Low Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="High">High Priority</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-sans">Filter by Status</label>
            <select
              value={issueStatusFilter}
              onChange={(e) => setIssueStatusFilter(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 transition-all font-bold text-xs text-slate-700 cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Issues List Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAllIssues.filter(issue => {
            if (issueProjFilter !== 'All' && issue.projectId !== issueProjFilter) return false;
            if (issueDevFilter !== 'All' && issue.developerId !== issueDevFilter) return false;
            if (issuePriorityFilter !== 'All' && issue.priority !== issuePriorityFilter) return false;
            if (issueStatusFilter !== 'All' && issue.status !== issueStatusFilter) return false;
            return true;
          }).map(issue => {
            const isHigh = issue.priority === 'High';
            return (
              <div key={issue.id} className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm hover:shadow-xl transition-all relative flex flex-col justify-between overflow-hidden group">
                {/* Border Indicator */}
                <div className={cn(
                  "absolute top-0 left-0 w-full h-1",
                  issue.status === 'Resolved' ? "bg-emerald-500" :
                  isHigh ? "bg-rose-500 animate-pulse" : "bg-amber-400"
                )} />

                <div>
                   <div className="flex items-center justify-between gap-3 mb-4">
                    <span className={cn(
                      "px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border",
                      issue.status === 'Resolved' 
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                        : isHigh 
                          ? "bg-rose-50 border-rose-200 text-rose-700" 
                          : "bg-amber-50 border-amber-200 text-amber-700"
                    )}>
                      {issue.priority || 'Medium'} Priority
                    </span>
                    <span className="text-[10px] font-mono font-black text-slate-400 uppercase">
                      {issue.status}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-base text-slate-900 tracking-tight leading-snug line-clamp-2 mb-2">
                    {issue.title || issue.description || 'Untitled Blocker'}
                  </h4>
                  
                  <p className="text-slate-500 text-xs font-medium leading-relaxed line-clamp-3 mb-4">
                    {issue.description || 'No detailed log details supplied.'}
                  </p>

                  <div className="border-t border-slate-100 pt-3 mt-3 space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-slate-400 uppercase tracking-wider">Project:</span>
                      <span className="text-indigo-600 font-extrabold truncate max-w-[150px]">{issue.projectName || 'General Project'}</span>
                    </div>
                    {issue.phaseName && (
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-slate-400 uppercase tracking-wider">Milestone:</span>
                        <span className="text-slate-700 font-extrabold truncate max-w-[150px]">{issue.phaseName}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-slate-400 uppercase tracking-wider">Raised by:</span>
                      <span className="text-slate-800 font-black">{issue.developerName || 'Unknown Dev'}</span>
                    </div>
                  </div>
                </div>

                {issue.status !== 'Resolved' && (
                  <button
                    onClick={async () => {
                      try {
                        await progressService.updateIssue(issue.projectId, issue.id, 'Resolved');
                        showSuccess("Issue resolved successfully!");
                        loadData(true);
                      } catch (err) {
                        console.error(err);
                        showError("Failed to resolve issue.");
                      }
                    }}
                    className="w-full mt-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-600/10 active:scale-95 transition-all"
                  >
                    Mark as Resolved
                  </button>
                )}
              </div>
            );
          }).slice(0, 15)}

          {filteredAllIssues.filter(issue => {
            if (issueProjFilter !== 'All' && issue.projectId !== issueProjFilter) return false;
            if (issueDevFilter !== 'All' && issue.developerId !== issueDevFilter) return false;
            if (issuePriorityFilter !== 'All' && issue.priority !== issuePriorityFilter) return false;
            if (issueStatusFilter !== 'All' && issue.status !== issueStatusFilter) return false;
            return true;
          }).length === 0 && (
            <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100">
               <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                <MessageSquare className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">No issues match current filter configuration</p>
            </div>
          )}
        </div>
      </div>

      )}

      {/* Executive Central Timeline Extension Approval Control Panel */}
      {activeTab === 'milestones' && (
        <div id="timeline-extensions" className="space-y-6 my-12 scroll-mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-2 h-8 bg-amber-500 rounded-full font-sans" />
              Timeline Extension Approval Hub
            </h3>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mt-1">
              Review, accept, or decline timeline adjustment proposals requested by developers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
              {allExtensions.filter(e => e.status === 'Pending').length} Pending Review
            </span>
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
              {allExtensions.filter(e => e.status === 'Approved').length} Approved
            </span>
          </div>
        </div>

        {/* Extensions List Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allExtensions.map((ext) => {
            const isPending = ext.status === 'Pending';
            const isApproved = ext.status === 'Approved';
            const isRejected = ext.status === 'Rejected';

            return (
              <div 
                key={ext.id} 
                className={cn(
                  "bg-white rounded-[2rem] border p-6 transition-all shadow-sm flex flex-col justify-between relative overflow-hidden group",
                  isPending ? "border-amber-200 ring-4 ring-amber-500/5 hover:shadow-md" : "border-slate-100 hover:shadow-md"
                )}
              >
                {/* Visual Accent Bar */}
                <div className={cn(
                  "absolute top-0 left-0 w-full h-1",
                  isPending ? "bg-amber-500 animate-pulse" :
                  isRejected ? "bg-rose-500" : "bg-emerald-500"
                )} />

                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className={cn(
                      "text-[9px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-widest",
                      isPending ? "bg-amber-50 text-amber-800 border-amber-200" :
                      isRejected ? "bg-rose-50 text-rose-800 border-rose-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    )}>
                      {isPending ? "Pending Review" : isRejected ? "Rejected" : "Approved"}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 italic">
                      {formatDate(ext.createdAt)}
                    </span>
                  </div>

                  <div className="mb-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Project & Milestone</p>
                    <h4 className="text-sm font-black text-slate-900 tracking-tight leading-snug mt-0.5">
                      {ext.projectName}
                    </h4>
                    <p className="text-xs font-semibold text-indigo-600 mt-0.5">
                      {ext.phaseName}
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100/80 rounded-2xl p-4 my-3">
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Adjustment Breakdown</span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700">
                      <div>
                        <p className="text-[8px] text-slate-400 uppercase tracking-widest mb-0.5">Original Target</p>
                        <p className="font-medium text-slate-600">{ext.previousDate}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-[8px] text-slate-400 uppercase tracking-widest mb-0.5">Proposed Target</p>
                        <p className="text-indigo-600 font-extrabold">{ext.newDate}</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-250/50 border-t-slate-200/50 flex justify-between items-center">
                      <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest">Requested Extension</span>
                      <span className="text-xs font-black text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md uppercase">
                        +{ext.days} Days
                      </span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Developer Reason</p>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed italic bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                      "{ext.reason || 'No explanation provided.'}"
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 pl-1">
                      By: <span className="text-slate-600 font-extrabold">{ext.developerName}</span>
                    </p>
                  </div>
                </div>

                {isPending && (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => handleResolveExtensionDashboard(ext.projectId, ext.phaseData, ext.id, 'Rejected')}
                      className="flex-1 py-2.5 text-[9.5px] bg-slate-100 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-600 font-black uppercase tracking-widest rounded-xl transition-all border border-transparent active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Decline
                    </button>
                    <button
                      onClick={() => handleResolveExtensionDashboard(ext.projectId, ext.phaseData, ext.id, 'Approved')}
                      className="flex-1 py-2.5 text-[9.5px] bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-600/10 active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {allExtensions.length === 0 && (
            <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100">
              <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                <Clock className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">No timeline adjustment requests submitted yet</p>
            </div>
          )}
        </div>
      </div>

      )}

      {/* Delivered Milestones for Selected Month */}
      {activeTab === 'milestones' && (() => {
        let selectedMonthLabel = selectedMonth;
        try {
          const dObj = new Date(selectedMonth + '-01');
          if (!isNaN(dObj.getTime())) {
            selectedMonthLabel = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          }
        } catch (err) {
          console.warn("Failed to format selected month label:", err);
        }
        const currentDeliveredMilestones = allDeliveredMilestones.filter(m => m.month === selectedMonth);
        return (
          <div className="space-y-6 my-12">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <div className="w-2 h-8 bg-emerald-600 rounded-full animate-pulse" />
                Delivered Milestones ({selectedMonthLabel})
              </h3>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-150 font-mono">
                {currentDeliveredMilestones.length} Delivered
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {currentDeliveredMilestones.map((milestone, idx) => {
                const ownerInfo = getOwnerDetails(milestone.ownerId);
                return (
                  <Link 
                    to={`/projects/${milestone.parentProjectId}`} 
                    key={`delivered-card-${milestone.parentProjectId}-${idx}`}
                    className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm hover:shadow-xl hover:border-emerald-300 transition-all duration-300 group overflow-hidden relative block"
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-emerald-100 group-hover:bg-emerald-500 transition-colors" />
                    
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-650 font-bold border border-emerald-100 group-hover:scale-105 transition-transform">
                        {milestone.clientName[0]}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 tracking-tight line-clamp-1 group-hover:text-emerald-605 transition-colors">{milestone.clientName}</h4>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{milestone.phaseName} • {milestone.orderId || milestone.projectIdAlias}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md border border-slate-200">Admin: {ownerInfo.adminName}</span>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-indigo-50/70 text-indigo-600 rounded-md border border-indigo-100">Team: {ownerInfo.leaderName}</span>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 group-hover:bg-white group-hover:border-emerald-200 transition-all space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-400">Date Delivered</span>
                        <span className="text-emerald-650 font-black">{formatDate(milestone.deliveryDate)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-400">Net Value</span>
                        <span className="text-slate-900 font-black">${Math.round((milestone.value || 0) * 0.8).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-400">Gross Value</span>
                        <span className="text-slate-500 font-bold">${(milestone.value || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
              {currentDeliveredMilestones.length === 0 && (
                <div className="col-span-full py-12 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">No milestones delivered in {selectedMonthLabel}</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Active Milestones Countdown */}
      {activeTab === 'milestones' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-2 h-8 bg-amber-500 rounded-full" />
              Active Milestone Deadlines
            </h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Real-time Execution Tracking</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {wipSchedule.map((milestone, idx) => {
              const isOverdue = new Date(milestone.expectedDeliveryDate).getTime() < new Date().getTime();
              
              return (
                <div key={`${milestone.parentProjectId}-${idx}`} className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                  <div className={cn(
                    "absolute top-0 left-0 w-full h-1 transition-colors",
                    isOverdue ? "bg-rose-500" : "bg-amber-100 group-hover:bg-amber-500"
                  )} />
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 font-bold border border-amber-100 group-hover:scale-105 transition-transform">
                        {milestone.clientName[0]}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 tracking-tight line-clamp-1">{milestone.clientName}</h4>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{milestone.phaseName} • {milestone.orderId || milestone.projectIdAlias}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 mb-4 border border-slate-100 group-hover:bg-white group-hover:border-amber-200 transition-all space-y-3">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Target Time Remaining</p>
                      <p className={cn(
                        "text-sm font-black tracking-tight",
                        isOverdue ? "text-rose-600" : "text-amber-600"
                      )}>
                        <CountdownTimer targetDate={milestone.expectedDeliveryDate} />
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-0.5">Fiverr Deadline Remaining</p>
                      <p className={cn(
                        "text-xs font-black tracking-tight",
                        getDaysRemaining(milestone.actualDeliveryDate || milestone.expectedDeliveryDate) <= 0 ? "text-rose-600" : "text-amber-600"
                      )}>
                        <CountdownTimer targetDate={milestone.actualDeliveryDate || milestone.expectedDeliveryDate} />
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                       <span className="text-slate-400">Target Delivery</span>
                       <span className="text-slate-900">{formatDate(milestone.expectedDeliveryDate)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                       <span className="text-rose-500">Fiverr Deadline</span>
                       <span className="text-slate-900">{formatDate(milestone.actualDeliveryDate || milestone.expectedDeliveryDate)}</span>
                    </div>
                    {(() => {
                      const days = getDaysRemaining(milestone.actualDeliveryDate || milestone.expectedDeliveryDate);
                      if (days <= 3) {
                        return (
                          <div className="bg-rose-50 text-rose-600 text-[9px] font-black px-2.5 py-1.5 rounded-xl border border-rose-250 uppercase tracking-widest animate-pulse flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>Fiverr extension needed! ({days < 0 ? `${Math.abs(days)}d overdue` : `${days} days left`})</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                       <span className="text-slate-400">Progess</span>
                       <span className="text-indigo-600">{milestone.progress}%</span>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                       <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${milestone.progress}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {wipSchedule.length === 0 && (
               <div className="col-span-full py-12 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">No active milestones indexed</p>
               </div>
            )}
          </div>
        </div>
      )}
      </motion.div>
      </AnimatePresence>
    </div>
  );
}

function MetricCard({ title, value, subTitle, icon: Icon, color, trend, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 group",
        onClick && "cursor-pointer active:scale-95"
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{title}</p>
          <h4 className="text-2xl font-bold text-slate-900 tracking-tight">{value}</h4>
          {subTitle && (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{subTitle}</p>
          )}
        </div>
        <div className={cn("p-2.5 rounded-xl text-white shadow-lg", color)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 pt-4 border-t border-slate-50">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{trend}</p>
      </div>
    </div>
  );
}
