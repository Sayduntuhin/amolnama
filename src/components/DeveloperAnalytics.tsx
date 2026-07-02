import React, { useMemo } from 'react';
import { Developer, Project, PhaseTracking, DailyProgress } from '@/src/types';
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
import { User, Target, TrendingUp, CheckCircle, Clock, FileText } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useSnackbar } from '@/src/components/Snackbar';

interface DeveloperAnalyticsProps {
  developers: Developer[];
  projects: Project[];
  phases: Record<string, PhaseTracking[]>;
  logs: DailyProgress[];
}

export const DeveloperAnalytics: React.FC<DeveloperAnalyticsProps> = ({ 
  developers, 
  projects, 
  phases, 
  logs 
}) => {
  const { showInfo } = useSnackbar();
  const stats = useMemo(() => {
    return developers.map(dev => {
      const devLogs = logs.filter(l => l.developerId === dev.id);
      
      // Calculate phase completion and count projects where developer is active
      let totalPhases = 0;
      let completedPhases = 0;
      let activeProjectsCount = 0;

      Object.entries(phases).forEach(([_, projectPhases]) => {
        const typedPhases = projectPhases as PhaseTracking[];
        const relevantPhases = typedPhases.filter(ph => ph && Array.isArray(ph.developerIds) && ph.developerIds.includes(dev.id));
        
        if (relevantPhases.length > 0) {
          activeProjectsCount++;
          totalPhases += relevantPhases.length;
          completedPhases += relevantPhases.filter(ph => ph.status === 'Delivered').length;
        }
      });

      const productiveLogs = devLogs.filter(l => !l.reasonIfNoWork || (l.reasonIfNoWork !== 'Sick Leave' && l.reasonIfNoWork !== 'General Leave' && l.reasonIfNoWork !== 'Developer Off Day' && l.reasonIfNoWork !== 'Missed Update'));
      const avgProgress = productiveLogs.length > 0 
        ? Math.round(productiveLogs.reduce((acc, curr) => acc + (Number(curr.progressPercentage) || 0), 0) / productiveLogs.length) 
        : 0;

      const efficiencyScore = Math.min(100, Math.round(((Number(avgProgress) || 0) * 0.4) + (devLogs.length * 2) + (activeProjectsCount * 5)));

      return {
        id: dev.id,
        name: dev.name || 'Unknown Developer',
        role: dev.role || 'Unassigned',
        projectsCount: activeProjectsCount,
        logsCount: devLogs.length,
        completionRate: totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0,
        avgProgress: Number(avgProgress) || 0,
        efficiencyScore: Number(efficiencyScore) || 0
      };
    });
  }, [developers, projects, phases, logs]);

  const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
            <User className="w-5 h-5" />
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Talent</p>
          <p className="text-2xl font-black text-slate-900">{developers.length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
            <CheckCircle className="w-5 h-5" />
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg. Completion</p>
          <p className="text-2xl font-black text-slate-900">
            {Math.round(stats.reduce((acc, curr) => acc + curr.completionRate, 0) / (stats.length || 1))}%
          </p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 mb-4">
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Momentum</p>
          <p className="text-2xl font-black text-slate-900">
            {Math.round(stats.reduce((acc, curr) => acc + curr.avgProgress, 0) / (stats.length || 1))}%
          </p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white mb-4">
            <Target className="w-5 h-5" />
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Logs Processed</p>
          <p className="text-2xl font-black text-slate-900">{logs.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Proficiency Matrix */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-8">Performance Distribution</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                />
                <Bar dataKey="avgProgress" name="Avg Daily Progress %" radius={[4, 4, 0, 0]}>
                  {stats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.8} />
                  ))}
                </Bar>
                <Bar dataKey="completionRate" name="Phase Completion %" fill="#1e293b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Efficiency Leaderboard */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-8">Efficiency Index</h3>
          <div className="space-y-6">
            {[...stats].sort((a, b) => b.efficiencyScore - a.efficiencyScore).slice(0, 5).map((stat, idx) => (
              <div key={stat.id} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-100">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900">{stat.name}</span>
                    <span className="text-xs font-black text-indigo-600">{stat.efficiencyScore}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 rounded-full transition-all duration-1000" 
                      style={{ width: `${stat.efficiencyScore}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-8 pt-8 border-t border-slate-50">
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              * Efficiency index is a calculated metric based on daily update frequency, average progress volume, and active project capacity.
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Stat Table / Mobile Cards */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/20 overflow-hidden">
        {/* Desktop View */}
        <div className="hidden lg:block overflow-x-auto no-scrollbar">
          <table className="w-full text-left min-w-[1000px]">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Developer</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Milestone Execution</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Monthly Velocity</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Net Delivery</th>
                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.map(stat => (
                <tr key={stat.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-xs font-black text-white shadow-lg shadow-indigo-500/20">
                        {stat.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900 tracking-tight">{stat.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">{stat.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="space-y-1.5 min-w-[200px]">
                      <div className="flex justify-between text-[9px] font-black uppercase tracking-tighter">
                        <span className="text-slate-400">Target vs Actual</span>
                        <span className="text-indigo-600">{(stat.logsCount * 0.85).toFixed(1)} Avg Delta</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stat.avgProgress}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-700">{stat.logsCount} Logs indexed</span>
                      <span className="text-[10px] text-emerald-600 font-bold uppercase mt-1">Consistent Yield</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={cn(
                      "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                      stat.completionRate > 80 ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-amber-50 text-amber-600 border-amber-200'
                    )}>
                      {stat.completionRate}% Efficiency
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button 
                      onClick={() => showInfo(`Generating Monthly Performance Brief for ${stat.name}...\nPeriod: May 2026\nTelemetry Points: ${stat.logsCount}`)}
                      className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all active:scale-95 shadow-md flex items-center gap-2 ml-auto"
                    >
                      <FileText className="w-3 h-3" />
                      Gen. Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Grid View */}
        <div className="lg:hidden p-4 space-y-4">
          {stats.map(stat => (
            <div key={stat.id} className="bg-white border border-slate-200 rounded-[2rem] p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-sm font-black text-white shadow-xl shadow-indigo-500/20">
                  {stat.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-slate-900 tracking-tight">{stat.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{stat.role}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-indigo-600 leading-none">{stat.avgProgress}%</div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Velocity</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Efficiency</p>
                  <p className="text-sm font-black text-slate-900">{stat.efficiencyScore}%</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Active load</p>
                  <p className="text-sm font-black text-slate-900">{stat.projectsCount} Proj.</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Delivery Progress</span>
                  <span className="text-xs font-black text-slate-900">{stat.completionRate}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner ring-1 ring-slate-200/50">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      stat.completionRate > 80 ? "bg-emerald-500" : "bg-indigo-600"
                    )}
                    style={{ width: `${stat.completionRate}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
