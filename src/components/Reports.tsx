import React, { useEffect, useState, useMemo } from 'react';
import { useSnackbar } from './Snackbar';
import { 
  Loader2, 
  Search, 
  ArrowUpRight, 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  ShieldCheck, 
  Clock, 
  CheckCircle, 
  ChevronDown, 
  User,
  Download,
  Filter,
  FileText,
  ArrowUpDown
} from 'lucide-react';
import { leaderService } from '@/src/services/leaderService';
import { projectService } from '@/src/services/projectService';
import { developerService } from '@/src/services/developerService';
import { progressService } from '@/src/services/progressService';
import { adminService } from '@/src/services/adminService';
import { auth } from '@/src/lib/firebase';
import { Project, Developer, ProjectStatus, PhaseName, PhaseTracking, Shift } from '@/src/types';
import { cn, formatDate } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function Reports() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [selectedAdminFilter, setSelectedAdminFilter] = useState<string>('All');
  const [leaders, setLeaders] = useState<any[]>([]);
  const [selectedLeaderFilter, setSelectedLeaderFilter] = useState<string>('All');
  const [currentLeader, setCurrentLeader] = useState<any | null>(null);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [phases, setPhases] = useState<(PhaseTracking & { 
    clientName: string, 
    projectIdStr: string,
    projectAmount: number,
    projectNetAmount: number,
    parentProjectId: string
  })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<'projects' | 'kpi' | 'delivery'>('projects');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'All'>('All');
  const [phaseFilter, setPhaseFilter] = useState<PhaseName | 'All'>('All');
  const [shiftFilter, setShiftFilter] = useState<Shift | 'All'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  
  // KPI Filters
  const [kpiMonthFilter, setKpiMonthFilter] = useState('All');
  const [kpiDevFilter, setKpiDevFilter] = useState('All');
  const [kpiProjFilter, setKpiProjFilter] = useState('All');
  const [kpiShiftFilter, setKpiShiftFilter] = useState<Shift | 'All'>('All');

  // Delivery Filters
  const [deliveryMonthFilter, setDeliveryMonthFilter] = useState('All');
  const [deliveryShiftFilter, setDeliveryShiftFilter] = useState<Shift | 'All'>('All');
  const [deliveryViewMode, setDeliveryViewMode] = useState<'detailed' | 'summary'>('detailed');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const email = auth.currentUser?.email;
    const isSuper = email && (email.toLowerCase().trim() === 'exceptionhubjvai@gmail.com');

    const [p, d, adminList, leadersList] = await Promise.all([
      projectService.getAllProjects(),
      developerService.getAllDevelopers(),
      adminService.getAllAdmins(),
      leaderService.getAllLeaders()
    ]);
    
    if (adminList) setAdmins(adminList);

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

    if (p) {
      setProjects(p);
      // Fetch all phases for KPI reporting
      const allPhases = await Promise.all(p.map(async (project) => {
        const ph = await progressService.getPhases(project.id);
        return (ph || []).map(item => ({ 
          ...item, 
          clientName: project.clientName, 
          projectIdStr: project.projectId,
          projectAmount: project.amount,
          projectNetAmount: project.netAmount,
          parentProjectId: project.id
        }));
      }));
      setPhases(allPhases.flat());
    }
    if (d) setDevelopers(d);
    setLoading(false);
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
        if (selectedAdmin?.email?.toLowerCase().trim() === 'exceptionhubjvai@gmail.com') {
          adminUid = superAdminUid;
        }
        if (adminUid) {
          temp = temp.filter(p => p.ownerId === adminUid);
        } else if (selectedAdmin?.email?.toLowerCase().trim() === 'sayduntuhin.jvai@gmail.com') {
          const otherAdminUids = admins
            .filter(a => (a.uid || a.id) !== selectedAdminFilter && a.uid)
            .map(a => a.uid);
          temp = temp.filter(p => p.ownerId !== superAdminUid && !otherAdminUids.includes(p.ownerId));
        }
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
        if (selectedAdmin?.email?.toLowerCase().trim() === 'exceptionhubjvai@gmail.com') {
          adminUid = superAdminUid;
        }
        if (adminUid) {
          temp = temp.filter(d => d.ownerId === adminUid);
        } else if (selectedAdmin?.email?.toLowerCase().trim() === 'sayduntuhin.jvai@gmail.com') {
          const otherAdminUids = admins
            .filter(a => (a.uid || a.id) !== selectedAdminFilter && a.uid)
            .map(a => a.uid);
          temp = temp.filter(d => d.ownerId !== superAdminUid && !otherAdminUids.includes(d.ownerId));
        }
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

  const adminFilteredPhases = React.useMemo(() => {
    const allowedProjIds = new Set(adminFilteredProjects.map(p => p.id));
    return phases.filter(ph => allowedProjIds.has(ph.parentProjectId));
  }, [phases, adminFilteredProjects]);

  const filteredData = adminFilteredProjects.filter(p => {
    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    const matchesPhase = phaseFilter === 'All' || p.phases.includes(phaseFilter);
    const matchesShift = shiftFilter === 'All' || (p.shift || 'Day') === shiftFilter;
    const matchesSearch = p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.projectId.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesPhase && matchesShift && matchesSearch;
  });

  const deliveryData = adminFilteredPhases.filter(ph => ph.status === 'Delivered').map(ph => {
    const project = adminFilteredProjects.find(p => p.id === ph.parentProjectId);
    const ratio = project && project.amount > 0 ? (project.netAmount / project.amount) : 0.8;
    return {
      ...ph,
      projectShift: project?.shift || 'Day',
      netValue: (ph.value || 0) * ratio
    };
  }).filter(item => {
    const monthMatch = deliveryMonthFilter === 'All' || item.month === deliveryMonthFilter;
    const shiftMatch = deliveryShiftFilter === 'All' || item.projectShift === deliveryShiftFilter;
    const searchMatch = item.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        item.phaseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        item.orderId?.toLowerCase().includes(searchTerm.toLowerCase());
    return monthMatch && shiftMatch && searchMatch;
  });

  const monthlyDeliverySummary = useMemo(() => {
    const summary: Record<string, { month: string, count: number, grossValue: number, netValue: number, clientNames: Set<string> }> = {};
    
    const baseDeliveries = adminFilteredPhases.filter(ph => ph.status === 'Delivered').map(ph => {
      const project = adminFilteredProjects.find(p => p.id === ph.parentProjectId);
      const ratio = project && project.amount > 0 ? (project.netAmount / project.amount) : 0.8;
      return {
        ...ph,
        projectShift: project?.shift || 'Day',
        netValue: (ph.value || 0) * ratio
      };
    }).filter(item => {
      const shiftMatch = deliveryShiftFilter === 'All' || item.projectShift === deliveryShiftFilter;
      return shiftMatch;
    });

    baseDeliveries.forEach(item => {
      const month = item.month || 'N/A';
      if (!summary[month]) {
        summary[month] = { month, count: 0, grossValue: 0, netValue: 0, clientNames: new Set() };
      }
      summary[month].count++;
      summary[month].grossValue += (item.value || 0);
      summary[month].netValue += item.netValue;
      summary[month].clientNames.add(item.clientName);
    });

    return Object.values(summary).sort((a, b) => b.month.localeCompare(a.month));
  }, [adminFilteredPhases, adminFilteredProjects, deliveryShiftFilter]);

  const exportDeliveryCSV = () => {
    const headers = [
      'Delivery Month',
      'Delivery Date',
      'Order ID',
      'Project ID',
      'Client',
      'Milestone',
      'Capital Value ($)',
      'Net Amount ($)',
      'Shift'
    ];

    const rows = deliveryData.map(item => [
      `"${item.month}"`,
      `"${formatDate(item.endDate || item.startDate)}"`,
      `"${item.orderId || 'N/A'}"`,
      `"${item.projectIdStr}"`,
      `"${item.clientName}"`,
      `"${item.phaseName}"`,
      item.value || 0,
      item.netValue.toFixed(2),
      `"${item.projectShift}"`
    ]);

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `delivery_audit_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const kpiData = adminFilteredPhases.flatMap(ph => {
    if (!ph.kpiAllocations || ph.status !== 'Delivered') return [];
    
    // Calculate actual net ratio from project data if available
    const ratio = ph.projectAmount && ph.projectAmount > 0 
      ? ph.projectNetAmount / ph.projectAmount 
      : 0.8;

    return ph.kpiAllocations.map(alloc => {
      const milestoneNetFund = (ph.value || 0) * ratio;
      const dev = adminFilteredDevelopers.find(d => d.id === alloc.developerId);
      return {
        ...alloc,
        developerName: dev?.name || 'Unknown',
        developerShift: dev?.shift || 'Day',
        milestoneName: ph.phaseName,
        orderId: ph.orderId || 'N/A',
        clientName: ph.clientName,
        projectIdStr: ph.projectIdStr,
        month: ph.month || 'N/A',
        milestoneValue: ph.value || 0,
        milestoneNetValue: milestoneNetFund,
        value: (alloc.percentage * milestoneNetFund) / 100,
        deliveryDate: ph.endDate || ph.startDate || ''
      };
    });
  }).filter(item => {
    const monthMatch = kpiMonthFilter === 'All' || item.month === kpiMonthFilter;
    const devMatch = kpiDevFilter === 'All' || item.developerId === kpiDevFilter;
    const projMatch = kpiProjFilter === 'All' || item.projectIdStr === kpiProjFilter;
    const shiftMatch = kpiShiftFilter === 'All' || item.developerShift === kpiShiftFilter;
    const searchMatch = item.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        item.milestoneName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        item.orderId.toLowerCase().includes(searchTerm.toLowerCase());
    return monthMatch && devMatch && projMatch && shiftMatch && searchMatch;
  });

  const exportKPICSV = () => {
    const headers = [
      'Month',
      'Delivery Date',
      'Project ID',
      'Order ID',
      'Client Name',
      'Milestone',
      'Developer',
      'Shift',
      'KPI %',
      'KPI Value ($)',
      'Total Milestone Net Value ($)'
    ];

    const rows = kpiData.map(item => [
      `"${item.month}"`,
      `"${formatDate(item.deliveryDate)}"`,
      `"${item.projectIdStr}"`,
      `"${item.orderId}"`,
      `"${item.clientName}"`,
      `"${item.milestoneName}"`,
      `"${adminFilteredDevelopers.find(d => d.id === item.developerId)?.name || 'Unknown'}"`,
      `"${item.developerShift}"`,
      item.percentage,
      item.value,
      item.milestoneNetValue
    ]);

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `kpi_performance_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportCSV = async () => {
    setLoading(true);
    try {
      const detailedData = await Promise.all(filteredData.map(async (p) => {
        const [phases, issues] = await Promise.all([
          progressService.getPhases(p.id),
          progressService.getIssues(p.id)
        ]);
        return { 
          ...p, 
          phasesData: phases || [], 
          issuesData: issues || [] 
        };
      }));

      const headers = [
        'Order ID', 
        'Client', 
        'Capital Value', 
        'Net Fee (80%)', 
        'Status', 
        'Start Date', 
        'Delivery Date', 
        'Phases Count', 
        'Phases Summary',
        'Total Extensions (Days)',
        'Open Issues',
        'Resolved Issues'
      ];

      const rows = detailedData.map(p => {
        const totalExtensions = p.phasesData.reduce((acc, ph) => acc + (ph.totalExtensionDays || 0), 0);
        const openIssues = p.issuesData.filter(i => i.status === 'Open').length;
        const resolvedIssues = p.issuesData.filter(i => i.status === 'Resolved').length;
        const phasesSummary = p.phasesData.map(ph => `${ph.phaseName} (${ph.status}, ${ph.progress}%)`).join('; ');
        
        return [
          `"${p.projectId}"`,
          `"${p.clientName}"`,
          p.amount,
          p.netAmount,
          `"${p.status}"`,
          `"${p.startDate}"`,
          `"${p.deliveryDate || 'N/A'}"`,
          p.phasesData.length,
          `"${phasesSummary}"`,
          totalExtensions,
          openIssues,
          resolvedIssues
        ];
      });
      
      let csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `detailed_project_report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
       {/* Tab Switcher */}
       <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit mb-4 overflow-x-auto no-scrollbar max-w-full">
          <button 
            onClick={() => setActiveReport('projects')}
            className={cn(
              "px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap",
              activeReport === 'projects' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900"
            )}
          >
            Project Intelligence
          </button>
          <button 
            onClick={() => setActiveReport('delivery')}
            className={cn(
              "px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap",
              activeReport === 'delivery' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900"
            )}
          >
            Delivery Audit
          </button>
          <button 
            onClick={() => setActiveReport('kpi')}
            className={cn(
              "px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap",
              activeReport === 'kpi' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900"
            )}
          >
            KPI Forensic Report
          </button>
       </div>

       <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600"></div>
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            {activeReport === 'projects' ? 'Project Intelligence' : 
             activeReport === 'delivery' ? 'Delivery Audit' : 
             'KPI Forensic Analysis'}
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            {activeReport === 'projects' 
              ? 'Export raw engineering telemetry for stakeholder alignment.'
              : activeReport === 'delivery'
              ? 'Comprehensive tracking of delivered milestones and net capital values.'
              : 'Cross-functional performance tracking and value distribution.'}
          </p>
        </div>
        <button
          onClick={activeReport === 'projects' ? exportCSV : activeReport === 'delivery' ? exportDeliveryCSV : exportKPICSV}
          className="flex items-center justify-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl shadow-slate-900/10 active:scale-95 w-full lg:w-auto"
        >
          <Download className="w-5 h-5" />
          Export Dataset
        </button>
      </div>

      {/* Filters Bar */}
      {activeReport === 'projects' ? (
        <div className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-inner bg-slate-50/30",
          (4 + (isSuperAdmin ? 1 : 0) + (!currentLeader ? 1 : 0)) === 6 ? "lg:grid-cols-6" : (4 + (isSuperAdmin ? 1 : 0) + (!currentLeader ? 1 : 0)) === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"
        )}>
          {isSuperAdmin && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select 
                className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                value={selectedAdminFilter}
                onChange={(e) => setSelectedAdminFilter(e.target.value)}
              >
                <option value="All">All Admins</option>
                {admins.map(admin => (
                  <option key={admin.id} value={admin.uid || admin.id}>{admin.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
          {!currentLeader && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select 
                className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                value={selectedLeaderFilter}
                onChange={(e) => setSelectedLeaderFilter(e.target.value)}
              >
                {!isSuperAdmin ? (
                  <>
                    <option value="All">All Leaders (Under Me)</option>
                    <option value="Self">Admin (Self Only)</option>
                  </>
                ) : (
                  <option value="All">All Leaders</option>
                )}
                {leaders.map(leader => (
                  <option key={leader.id} value={leader.uid || leader.id}>{leader.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search registry..."
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="relative">
             <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
             <select 
               className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
               value={shiftFilter}
               onChange={(e) => setShiftFilter(e.target.value as any)}
             >
               <option value="All">All Shifts</option>
               <option value="Day">Day Shift</option>
               <option value="Night">Night Shift</option>
             </select>
             <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
             <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
             <select 
               className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
               value={statusFilter}
               onChange={(e) => setStatusFilter(e.target.value as any)}
             >
               <option value="All">All Statuses</option>
               <option value="WIP">WIP Only</option>
               <option value="Delivered">Delivered</option>
               <option value="Cancelled">Cancelled</option>
             </select>
             <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
             <LayersIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
             <select 
               className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
               value={phaseFilter}
               onChange={(e) => setPhaseFilter(e.target.value as any)}
             >
                <option value="All">All Phases</option>
                <option value="UI/UX">UI/UX</option>
                <option value="App Frontend">App Frontend</option>
                <option value="Web Frontend">Web Frontend</option>
                <option value="Backend">Backend</option>
                <option value="AI">AI</option>
             </select>
             <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex items-center justify-center lg:justify-end px-4">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">{filteredData.length} records indexed</p>
          </div>
        </div>
      ) : activeReport === 'delivery' ? (
        <div className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-inner bg-slate-50/30",
          (3 + (isSuperAdmin ? 1 : 0) + (!currentLeader ? 1 : 0)) === 5 ? "lg:grid-cols-5" : (3 + (isSuperAdmin ? 1 : 0) + (!currentLeader ? 1 : 0)) === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
        )}>
          {isSuperAdmin && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select 
                className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                value={selectedAdminFilter}
                onChange={(e) => setSelectedAdminFilter(e.target.value)}
              >
                <option value="All">All Admins</option>
                {admins.map(admin => (
                  <option key={admin.id} value={admin.uid || admin.id}>{admin.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
          {!currentLeader && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select 
                className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                value={selectedLeaderFilter}
                onChange={(e) => setSelectedLeaderFilter(e.target.value)}
              >
                {!isSuperAdmin ? (
                  <>
                    <option value="All">All Leaders (Under Me)</option>
                    <option value="Self">Admin (Self Only)</option>
                  </>
                ) : (
                  <option value="All">All Leaders</option>
                )}
                {leaders.map(leader => (
                  <option key={leader.id} value={leader.uid || leader.id}>{leader.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search deliveries..."
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select 
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer"
              value={deliveryMonthFilter}
              onChange={(e) => setDeliveryMonthFilter(e.target.value)}
            >
              <option value="All">All Delivery Months</option>
              {Array.from(new Set(adminFilteredPhases.filter(ph => ph.status === 'Delivered').map(p => p.month).filter(Boolean))).sort().reverse().map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
             <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
             <select 
               className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
               value={deliveryShiftFilter}
               onChange={(e) => setDeliveryShiftFilter(e.target.value as any)}
             >
               <option value="All">All Shifts</option>
               <option value="Day">Day Projects</option>
               <option value="Night">Night Projects</option>
             </select>
             <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex items-center justify-center lg:justify-end px-4 gap-6">
             {activeReport === 'delivery' && (
               <div className="flex bg-slate-100 p-1 rounded-xl">
                 <button 
                   onClick={() => setDeliveryViewMode('detailed')}
                   className={cn(
                     "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                     deliveryViewMode === 'detailed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                   )}
                 >
                   Detailed
                 </button>
                 <button 
                   onClick={() => setDeliveryViewMode('summary')}
                   className={cn(
                     "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                     deliveryViewMode === 'summary' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                   )}
                 >
                   Monthly
                 </button>
               </div>
             )}
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">{deliveryData.length} records</p>
          </div>
        </div>
      ) : (
        <div className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-inner bg-slate-50/30",
          (1 + (isSuperAdmin ? 1 : 0) + (!currentLeader ? 1 : 0)) === 3 ? "lg:grid-cols-3" : (1 + (isSuperAdmin ? 1 : 0) + (!currentLeader ? 1 : 0)) === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"
        )}>
          {isSuperAdmin && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select 
                className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                value={selectedAdminFilter}
                onChange={(e) => setSelectedAdminFilter(e.target.value)}
              >
                <option value="All">All Admins</option>
                {admins.map(admin => (
                  <option key={admin.id} value={admin.uid || admin.id}>{admin.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
          {!currentLeader && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select 
                className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                value={selectedLeaderFilter}
                onChange={(e) => setSelectedLeaderFilter(e.target.value)}
              >
                {!isSuperAdmin ? (
                  <>
                    <option value="All">All Leaders (Under Me)</option>
                    <option value="Self">Admin (Self Only)</option>
                  </>
                ) : (
                  <option value="All">All Leaders</option>
                )}
                {leaders.map(leader => (
                  <option key={leader.id} value={leader.uid || leader.id}>{leader.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select 
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer"
              value={kpiMonthFilter}
              onChange={(e) => setKpiMonthFilter(e.target.value)}
            >
              <option value="All">All Months</option>
              {Array.from(new Set(adminFilteredPhases.map(p => p.month).filter(Boolean))).sort().reverse().map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select 
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer"
              value={kpiShiftFilter}
              onChange={(e) => setKpiShiftFilter(e.target.value as any)}
            >
              <option value="All">All Shifts</option>
              <option value="Day">Day Shift</option>
              <option value="Night">Night Shift</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select 
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer"
              value={kpiDevFilter}
              onChange={(e) => setKpiDevFilter(e.target.value)}
            >
              <option value="All">All Developers</option>
              {adminFilteredDevelopers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select 
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer"
              value={kpiProjFilter}
              onChange={(e) => setKpiProjFilter(e.target.value)}
            >
              <option value="All">All Projects</option>
              {adminFilteredProjects.map(p => <option key={p.id} value={p.projectId}>{p.clientName}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="flex items-center justify-center lg:justify-end px-4">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">{kpiData.length} records found</p>
          </div>
        </div>
      )}

      {/* Reports Table / Mobile Cards */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-xl shadow-slate-200/20">
        {activeReport === 'projects' ? (
          /* Projects Report Table - Original Logic */
          <div className="hidden lg:block overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800">
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[.2em]">Order ID</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[.2em]">Stakeholder</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[.2em] text-right">Capital Value</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[.2em] text-center">Lifecycle</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[.2em]">Inception</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[.2em]">Phases</th>
                  <th className="px-8 py-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(project => (
                  <tr key={project.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-7">
                      <span className="font-black text-slate-900 tracking-tight text-sm">{project.projectId}</span>
                    </td>
                    <td className="px-8 py-7">
                      <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">{project.clientName}</span>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-black text-slate-900 tracking-tight">${project.amount.toLocaleString()}</span>
                        <span className="text-[9px] text-indigo-500 font-black uppercase tracking-widest mt-1">Net: ${project.netAmount.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="flex justify-center">
                         <span className={cn(
                            "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                            project.status === 'WIP' ? "bg-amber-50 text-amber-600 border-amber-200" :
                            project.status === 'Delivered' ? "bg-emerald-600 text-white border-emerald-700" :
                            "bg-rose-50 text-rose-600 border-rose-200"
                          )}>
                            {project.status === 'WIP' ? 'In Progress' : project.status}
                          </span>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                       <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.1em]">{formatDate(project.startDate)}</span>
                    </td>
                    <td className="px-8 py-7">
                      <div className="flex flex-wrap gap-1.5 max-w-[240px]">
                        {project.phases.map((p, idx) => (
                          <span key={`${p}-${idx}`} className="px-2.5 py-1 bg-slate-100 text-slate-500 text-[9px] font-black rounded-lg uppercase tracking-tighter border border-slate-200">{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <button className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:bg-slate-900 hover:text-white transition-all active:scale-95 group-hover:text-indigo-600 shadow-sm hover:shadow-lg">
                        <FileText className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeReport === 'delivery' ? (
          deliveryViewMode === 'summary' ? (
            /* Monthly Delivery Summary Table */
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-indigo-950 border-b border-indigo-900">
                    <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em]">Operational Period</th>
                    <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em] text-center">Unit Count</th>
                    <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em] text-right">Gross Portfolio ($)</th>
                    <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em] text-right">Net Realized ($)</th>
                    <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em]">Key Stakeholders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyDeliverySummary.map((item) => (
                    <tr key={item.month} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="px-8 py-7 tracking-tighter">
                         <span className="font-black text-slate-900 text-base">{item.month}</span>
                      </td>
                      <td className="px-8 py-7 text-center">
                        <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-100">{item.count}</span>
                      </td>
                      <td className="px-8 py-7 text-right">
                        <span className="text-sm font-black text-slate-300 line-through">${item.grossValue.toLocaleString()}</span>
                      </td>
                      <td className="px-8 py-7 text-right">
                         <div className="flex flex-col items-end">
                           <span className="text-lg font-black text-emerald-600 tracking-tighter">${item.netValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                           <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Monthly Total</span>
                         </div>
                      </td>
                      <td className="px-8 py-7">
                        <div className="flex flex-wrap gap-1.5 max-w-sm">
                          {Array.from(item.clientNames).slice(0, 4).map(name => (
                            <span key={name} className="px-3 py-1 bg-white text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200 shadow-sm">{name}</span>
                          ))}
                          {item.clientNames.size > 4 && (
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-lg border border-indigo-100">
                              +{item.clientNames.size - 4} more
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900 border-t border-slate-800">
                  <tr>
                    <td colSpan={3} className="px-8 py-8 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Aggregate Cumulative Revenue:</td>
                    <td className="px-8 py-8 text-right">
                      <span className="text-2xl font-black text-emerald-400 tracking-tighter">
                        ${monthlyDeliverySummary.reduce((acc, curr) => acc + curr.netValue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            /* Delivery Audit Table */
            <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-emerald-900 border-b border-emerald-800">
                  <th className="px-8 py-6 text-[10px] font-black text-emerald-200 uppercase tracking-[.2em]">Delivery Month</th>
                  <th className="px-8 py-6 text-[10px] font-black text-emerald-200 uppercase tracking-[.2em]">Delivery Date</th>
                  <th className="px-8 py-6 text-[10px] font-black text-emerald-200 uppercase tracking-[.2em]">Stakeholder / Order</th>
                  <th className="px-8 py-6 text-[10px] font-black text-emerald-200 uppercase tracking-[.2em]">Milestone</th>
                  <th className="px-8 py-6 text-[10px] font-black text-emerald-200 uppercase tracking-[.2em] text-right">Gross Value</th>
                  <th className="px-8 py-6 text-[10px] font-black text-emerald-200 uppercase tracking-[.2em] text-right">Net Delivery Amount</th>
                  <th className="px-8 py-6 text-[10px] font-black text-emerald-200 uppercase tracking-[.2em] text-center">Operational Shift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveryData.map((item, idx) => (
                  <tr key={`${item.id}-${idx}`} className="hover:bg-emerald-50/30 transition-colors group">
                    <td className="px-8 py-7">
                      <span className="font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 text-[10px] uppercase tracking-widest">{item.month}</span>
                    </td>
                    <td className="px-8 py-7 text-sm">
                      <span className="font-bold text-slate-700">{formatDate(item.endDate || item.startDate)}</span>
                    </td>
                    <td className="px-8 py-7">
                      <p className="font-black text-slate-900 tracking-tight text-sm leading-none mb-1">{item.clientName}</p>
                      <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">{item.orderId || item.projectIdStr}</p>
                    </td>
                    <td className="px-8 py-7">
                      <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">{item.phaseName}</span>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <span className="text-sm font-black text-slate-400 line-through tracking-tight">${(item.value || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-base font-black text-emerald-600 tracking-tighter">${item.netValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Finalized Capital</span>
                      </div>
                    </td>
                    <td className="px-8 py-7 text-center">
                       <span className={cn(
                          "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                          item.projectShift === 'Night' ? "bg-indigo-900 text-indigo-100 border-indigo-950" : "bg-amber-50 text-amber-600 border-amber-200"
                        )}>
                          {item.projectShift} Project
                        </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {deliveryData.length > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={5} className="px-8 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Audited Net Revenue:</td>
                    <td className="px-8 py-6 text-right">
                      <span className="text-xl font-black text-emerald-700 tracking-tighter">
                        ${deliveryData.reduce((acc, curr) => acc + curr.netValue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )) : (
          /* KPI Forensic Table */
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-indigo-900 border-b border-indigo-800">
                  <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em]">Target Month</th>
                  <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em]">Delivery Date</th>
                  <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em]">Project / Stakeholder</th>
                  <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em]">Order ID</th>
                  <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em]">Milestone</th>
                  <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em]">Developer Intelligence</th>
                  <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em] text-right">KPI Allocation</th>
                  <th className="px-8 py-6 text-[10px] font-black text-indigo-200 uppercase tracking-[.2em] text-right">KPI Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kpiData.map((item, idx) => {
                  const dev = developers.find(d => d.id === item.developerId);
                  return (
                    <tr key={`${item.id}-${item.developerId}-${idx}`} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="px-8 py-7">
                        <span className="font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 text-[10px] uppercase tracking-widest">{item.month}</span>
                      </td>
                      <td className="px-8 py-7 text-sm">
                        <span className="font-bold text-slate-700">{formatDate(item.deliveryDate)}</span>
                      </td>
                      <td className="px-8 py-7">
                        <p className="font-black text-slate-900 tracking-tight text-sm leading-none mb-1">{item.clientName}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.projectIdStr}</p>
                      </td>
                      <td className="px-8 py-7 text-sm">
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 tracking-widest">{item.orderId || item.projectIdStr || 'N/A'}</span>
                      </td>
                      <td className="px-8 py-7">
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">{item.milestoneName}</span>
                      </td>
                      <td className="px-8 py-7 text-sm">
                        <p className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{dev?.name || 'Unknown'}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{dev?.role}</p>
                      </td>
                      <td className="px-8 py-7 text-right">
                        <span className="text-sm font-black text-emerald-600">{item.percentage}%</span>
                      </td>
                      <td className="px-8 py-7 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-black text-slate-900 tracking-tight">${item.value.toLocaleString()}</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">of ${item.milestoneNetValue.toLocaleString()}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile Grid View */}
        <div className="lg:hidden p-4 space-y-4">
          <AnimatePresence>
            {activeReport === 'projects' ? filteredData.map(project => (
              <motion.div 
                key={project.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-[2rem] p-6 space-y-6"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{project.projectId}</p>
                    <h3 className="font-black text-slate-900 line-clamp-1">{project.clientName}</h3>
                  </div>
                  <span className={cn(
                    "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                    project.status === 'WIP' ? "bg-amber-50 text-amber-600 border-amber-200" :
                    project.status === 'Delivered' ? "bg-emerald-600 text-white border-emerald-700" :
                    "bg-rose-50 text-rose-600 border-rose-200"
                  )}>
                    {project.status === 'WIP' ? 'In Progress' : project.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Cap. Value</p>
                    <div className="flex flex-col">
                      <p className="text-sm font-black text-slate-900">${project.amount.toLocaleString()}</p>
                      <p className="text-[9px] font-black text-indigo-600 uppercase tracking-tight mt-0.5">Net: ${project.netAmount.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Inception</p>
                    <p className="text-sm font-black text-slate-900">{formatDate(project.startDate)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {project.phases.map((p, idx) => (
                    <span key={`${p}-${idx}`} className="px-2.5 py-1 bg-slate-100 text-slate-500 text-[9px] font-black rounded-lg uppercase tracking-tighter border border-slate-200">{p}</span>
                  ))}
                </div>

                <button className="w-full py-3.5 bg-slate-900 text-white rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest active:scale-95 shadow-xl shadow-slate-900/10">
                  <FileText className="w-4 h-4" />
                  Technical Brief
                </button>
              </motion.div>
            )) : activeReport === 'delivery' ? (
              deliveryViewMode === 'summary' ? monthlyDeliverySummary.map(item => (
                <motion.div 
                  key={item.month}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-6 space-y-6"
                >
                  <div className="flex items-center justify-between">
                     <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">{item.month}</h3>
                     <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black border border-indigo-100 uppercase tracking-widest">{item.count} Units</span>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                    <p className="text-[9px] font-black text-emerald-600 uppercase mb-1 tracking-widest text-center">Net Revenue</p>
                    <p className="text-xl font-black text-slate-900 text-center tracking-tighter">${item.netValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-2">
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Major Stakeholders</p>
                     <div className="flex flex-wrap gap-1.5">
                        {Array.from(item.clientNames).slice(0, 5).map(name => (
                          <span key={name} className="px-2 py-0.5 bg-slate-50 text-slate-500 text-[9px] font-bold rounded-lg border border-slate-200">{name}</span>
                        ))}
                     </div>
                  </div>
                </motion.div>
              )) : deliveryData.map(item => (
                <motion.div 
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-6 space-y-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{item.month}</p>
                        <span className="text-[10px] text-slate-400 font-bold">• Delivered {formatDate(item.endDate || item.startDate)}</span>
                      </div>
                      <h3 className="font-black text-slate-900 line-clamp-1">{item.clientName}</h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.phaseName}</p>
                    </div>
                     <span className={cn(
                        "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                        item.projectShift === 'Night' ? "bg-indigo-900 text-indigo-100 border-indigo-950" : "bg-amber-50 text-amber-600 border-amber-200"
                      )}>
                        {item.projectShift}
                      </span>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                    <p className="text-[9px] font-black text-emerald-600 uppercase mb-1 tracking-widest text-center">Net Revenue</p>
                    <p className="text-xl font-black text-slate-900 text-center tracking-tighter">${item.netValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </motion.div>
              ))
            ) : kpiData.map(item => (
              <motion.div 
                key={`${item.id}-${item.developerId}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-[2rem] p-6 space-y-6"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{item.month}</p>
                      <span className="text-[10px] text-slate-400 font-bold">• Delivered {formatDate(item.deliveryDate)}</span>
                    </div>
                    <h3 className="font-black text-slate-900 line-clamp-1">{item.clientName}</h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.milestoneName}</p>
                  </div>
                  <div className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl text-[9px] font-black border border-indigo-100 uppercase tracking-widest">
                    {item.percentage}% Share
                  </div>
                </div>

                <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-black">
                      {item.developerName[0]}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{item.developerName}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.developerShift} Shift</p>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">KPI Realized</p>
                      <p className="text-lg font-black text-indigo-600 tracking-tighter">${item.value.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Milestone Net</p>
                      <p className="text-xs font-black text-slate-900 opacity-60">${item.milestoneNetValue.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredData.length === 0 && (
          <div className="py-32 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-inner">
              <Search className="w-8 h-8 text-slate-200" />
            </div>
            <p className="text-slate-400 font-black uppercase tracking-[0.25em] text-[11px]">Neural filter: Zero matches identified</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LayersIcon({ className }: { className: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
      <path d="m2.6 12.18a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
      <path d="m2.6 17.18a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
    </svg>
  );
}
