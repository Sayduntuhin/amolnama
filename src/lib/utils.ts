import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Project, PhaseTracking, PhaseStatus, ProjectStatus, Issue } from '@/src/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateDeveloperPerformanceScore(
  devId: string,
  allPhases: PhaseTracking[],
  allIssues: Issue[]
) {
  const devPhases = allPhases.filter(ph => ph?.developerIds?.includes(devId));
  
  let avgProgressSum = 0;
  let activeCount = 0;
  let deliveredCount = 0;
  let totalExtensionDays = 0;
  
  devPhases.forEach(ph => {
    avgProgressSum += (ph.progress || 0);
    totalExtensionDays += (ph.totalExtensionDays || 0);
    if (ph.status === 'Delivered') {
      deliveredCount++;
    } else if (ph.status === 'In Progress' || ph.status === 'Delayed' || ph.status === 'Extension Requested') {
      activeCount++;
    }
  });
  
  const avgMilestoneProgress = devPhases.length > 0 ? Math.round(avgProgressSum / devPhases.length) : 0;
  
  // Issues related to this developer
  const devIssues = allIssues.filter(i => i.developerId === devId || (i.phaseId && devPhases.some(ph => ph.id === i.phaseId)));
  const totalIssues = devIssues.length;
  const openIssues = devIssues.filter(i => i.status !== 'Resolved').length;
  const resolvedIssues = totalIssues - openIssues;
  
  // Start with baseline performance of 80%
  let score = 80;
  
  if (devPhases.length > 0) {
    // 1. Milestone progress (scales score by up to +10 or -10)
    score += (avgMilestoneProgress - 75) * 0.2; // 75 is baseline progress; 100 adds 5, 50 subtracts 5.
    
    // 2. Deliveries (delivered milestones boost performance; +5 per delivered milestone)
    score += deliveredCount * 5;
    
    // 3. Extensions (penalize -3 points per extension day, capped at -20)
    score -= Math.min(20, totalExtensionDays * 3);
    
    // 4. Issues (penalize -4 points per open issue; bonus +2 points per resolved issue, capped at -20/+10)
    score -= Math.min(20, openIssues * 4);
    score += Math.min(10, resolvedIssues * 2);
  } else {
    // Default baseline score for developers with no milestones/sprints assigned yet
    score = 0;
  }
  
  score = Math.max(0, Math.min(100, Math.round(score)));
  
  let grade = 'N/A';
  if (devPhases.length > 0) {
    if (score >= 95) grade = 'A+';
    else if (score >= 90) grade = 'A';
    else if (score >= 82) grade = 'B+';
    else if (score >= 70) grade = 'B';
    else if (score >= 50) grade = 'C';
    else grade = 'F';
  }
  
  return {
    score,
    grade,
    metrics: {
      avgMilestoneProgress,
      totalIssues,
      openIssues,
      resolvedIssues,
      totalExtensionDays,
      deliveredMilestones: deliveredCount,
      activeMilestones: activeCount
    }
  };
}

export function resolvePhaseStatus(phase: PhaseTracking): PhaseStatus {
  if (phase.status === 'Cancelled') return 'Cancelled';
  if (phase.status === 'Delivered') return 'Delivered';
  
  // 1. Check if progress is 100% (or all tracks are 100%)
  const backend = phase.backendProgress !== undefined ? phase.backendProgress : phase.progress;
  const integration = phase.integrationProgress !== undefined ? phase.integrationProgress : phase.progress;
  const overallCalc = calcOverallProgress(phase);
  const isComplete = (backend === 100 && integration === 100) || (phase.progress === 100) || (overallCalc === 100);
  
  if (isComplete) {
    return 'Ready for Delivery';
  }
  
  // 2. Check if a pending extension request exists
  const hasPendingExtension = phase.extensions?.some(ext => ext.status === 'Pending');
  if (hasPendingExtension) {
    return 'Extension Requested';
  }
  
  // 3. Check if deadline is missed
  if (phase.expectedDeliveryDate && phase.status !== 'Pending') {
    const todayStr = getGMT6DateString();
    if (todayStr > phase.expectedDeliveryDate) {
      return 'Delayed';
    }
  }
  
  // 4. Default to standard in progress or pending status
  if (phase.progress > 0 || (phase.backendProgress !== undefined && phase.backendProgress > 0) || (phase.integrationProgress !== undefined && phase.integrationProgress > 0) || (overallCalc > 0)) {
    return 'In Progress';
  }
  return phase.status || 'Pending';
}

export function calcOverallProgress(phase: PhaseTracking): number {
  const devIds = phase.developerIds || [];
  if (devIds.length === 0) return phase.progress || 0;
  
  const devProgress = phase.developerProgress || {};
  const devWeights = phase.developerWeights || {};
  
  let totalWeight = 0;
  let weightedSum = 0;
  let hasWeightsDefined = false;
  
  devIds.forEach(devId => {
    const weight = devWeights[devId] !== undefined ? Number(devWeights[devId]) : 0;
    if (weight > 0) hasWeightsDefined = true;
  });
  
  if (hasWeightsDefined) {
    devIds.forEach(devId => {
      const progress = devProgress[devId] !== undefined ? Number(devProgress[devId]) : 0;
      const weight = devWeights[devId] !== undefined ? Number(devWeights[devId]) : 0;
      weightedSum += progress * weight;
      totalWeight += weight;
    });
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  } else {
    // Simple Average
    let progressSum = 0;
    devIds.forEach(devId => {
      const progress = devProgress[devId] !== undefined ? Number(devProgress[devId]) : 0;
      progressSum += progress;
    });
    return Math.round(progressSum / devIds.length);
  }
}

export function resolveProjectStatus(project: Project, phases: PhaseTracking[]): ProjectStatus {
  if (project.status === 'Cancelled') return 'Cancelled';
  if (project.status === 'Paused') return 'Paused';
  if (project.status === 'Complete') return 'Complete';

  if (!phases.length) return project.status || 'WIP';

  // 1. If all phases are Delivered
  const allDelivered = phases.every(ph => ph.status === 'Delivered');
  if (allDelivered) {
    return 'Delivered';
  }

  // 2. If any phase is ready for delivery / all phases are complete but not delivered
  const allCompleteOrDelivered = phases.every(ph => {
    if (ph.status === 'Delivered') return true;
    const backend = ph.backendProgress !== undefined ? ph.backendProgress : ph.progress;
    const integration = ph.integrationProgress !== undefined ? ph.integrationProgress : ph.progress;
    return (backend === 100 && integration === 100) || ph.progress === 100;
  });
  if (allCompleteOrDelivered) {
    return 'Ready for Delivery';
  }

  // 3. If any active phase is Delayed
  const anyDelayed = phases.some(ph => {
    if (ph.status === 'Delivered' || ph.status === 'Cancelled') return false;
    if (ph.expectedDeliveryDate) {
      const todayStr = getGMT6DateString();
      return todayStr > ph.expectedDeliveryDate && ph.progress < 100;
    }
    return false;
  });
  
  if (anyDelayed) {
    return 'Delayed';
  }

  return 'WIP';
}

export function formatDate(date: any) {
  if (!date) return 'N/A';
  try {
    let d: Date;
    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else if (date && typeof date === 'object') {
      if (date.toDate && typeof date.toDate === 'function') {
        d = date.toDate();
      } else if (date.seconds !== undefined) {
        d = new Date(date.seconds * 1000);
      } else {
        d = new Date(String(date));
      }
    } else {
      d = new Date(String(date));
    }
    
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (err) {
    console.warn("formatDate failed for:", date, err);
    return 'N/A';
  }
}

export function calculateProjectAge(startDate: any) {
  if (!startDate) return 0;
  
  let start: Date;
  if (startDate instanceof Date) {
    start = startDate;
  } else if (typeof startDate === 'string') {
    start = new Date(startDate);
  } else if (startDate && typeof startDate === 'object') {
    // Handle Firebase Timestamps or similar objects
    if (startDate.toDate && typeof startDate.toDate === 'function') {
      start = startDate.toDate();
    } else if (startDate.seconds !== undefined) {
      start = new Date(startDate.seconds * 1000);
    } else {
      start = new Date(String(startDate));
    }
  } else {
    return 0;
  }

  if (isNaN(start.getTime())) return 0;

  const now = new Date();
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  
  const diffTime = now.getTime() - s.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function calculateAge(date: string | Date) {
  return calculateProjectAge(date);
}

export function formatDateForInput(date: any): string {
  if (!date) return '';
  try {
    let d: Date;
    if (typeof date === 'string') {
      if (!date.includes('T') && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }
      d = new Date(date);
    } else if (date instanceof Date) {
      d = date;
    } else if (date && typeof date === 'object') {
      if (date.toDate && typeof date.toDate === 'function') {
        d = date.toDate();
      } else if (date.seconds !== undefined) {
        d = new Date(date.seconds * 1000);
      } else {
        d = new Date(String(date));
      }
    } else {
      d = new Date(String(date));
    }
    
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch (err) {
    console.warn("formatDateForInput failed for:", date, err);
    return '';
  }
}

/**
 * Returns a Date object shifted to GMT+6.
 * This allows using UTC methods (getUTCDate, getUTCHours, etc.) to get local GMT+6 fields.
 */
export function getGMT6Date(d: Date = new Date()): Date {
  return new Date(d.getTime() + 6 * 60 * 60 * 1000);
}

/**
 * Returns the current date in YYYY-MM-DD format based on GMT+6 timezone.
 */
export function getGMT6DateString(d: Date = new Date()): string {
  const gmt6 = getGMT6Date(d);
  const y = gmt6.getUTCFullYear();
  const m = String(gmt6.getUTCMonth() + 1).padStart(2, '0');
  const dateVal = String(gmt6.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dateVal}`;
}
