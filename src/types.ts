export type ProjectStatus = 'WIP' | 'Paused' | 'Delayed' | 'Ready for Delivery' | 'Delivered' | 'Complete' | 'Cancelled';
export type PhaseName = 'UI/UX' | 'App Frontend' | 'Web Frontend' | 'Backend' | 'AI' | 'Deployment' | 'Integration' | 'Full Project' | 'n8n' | 'CMS';
export type PhaseStatus = 'Pending' | 'In Progress' | 'Delayed' | 'Extension Requested' | 'Ready for Delivery' | 'Delivered' | 'Cancelled';
export type DeveloperRole = 'UI/UX Designer' | 'Flutter Developer' | 'React Native Developer' | 'Frontend Developer' | 'Backend Developer' | 'AI Engineer';
export type IssueStatus = 'Open' | 'In Progress' | 'Resolved';
export type NoWorkReason = 'Developer Off Day' | 'Sick Leave' | 'Client Issue' | 'General Leave' | 'Missed Update' | 'SLA Maintenance Blocker';
export type Shift = 'Day' | 'Night';

export type MaintenanceType = 'Lite' | 'Moderate' | 'Heavy';
export type MaintenanceStatus = 'WIP' | 'Complete';

export interface MaintenanceProject {
  id: string;
  projectName: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  createdAt: string;
}

export interface Developer {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: DeveloperRole;
  designation: string;
  ownerId: string;
  shift: Shift;
  maintenanceProjects?: MaintenanceProject[];
}

export interface Project {
  id: string;
  projectId: string;
  clientName: string;
  ownerId: string;
  amount: number;
  netAmount: number;
  startDate: string;
  status: ProjectStatus;
  shift: Shift;
  deliveryDate?: string;
  phases: PhaseName[];
  createdAt: string;
}

export interface ExtensionEvent {
  id: string;
  days: number;
  reason: string;
  previousDate: string;
  newDate: string;
  createdAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  projectId?: string;
  projectClient?: string;
  phaseId?: string;
  phaseName?: string;
  developerName?: string;
}

export interface KPIAllocation {
  id: string;
  developerId: string;
  percentage: number;
  value: number;
  includeInKPI: boolean;
}

export interface PhaseTracking {
  id: string;
  orderId?: string;
  phaseName: PhaseName;
  startDate: string;
  startTime?: string;
  expectedDeliveryDate?: string;
  expectedDeliveryTime?: string;
  actualDeliveryDate?: string;
  originalDeliveryDate?: string;
  endDate?: string;
  status: PhaseStatus;
  developerIds: string[];
  progress: number;
  backendProgress?: number;
  integrationProgress?: number;
  developerProgress?: { [developerId: string]: number };
  developerWeights?: { [developerId: string]: number };
  value?: number;
  month?: string; // Format: YYYY-MM
  kpiAllocations?: KPIAllocation[];
  extensions?: ExtensionEvent[];
  totalExtensionDays?: number;
  resourceLinks: {
    figma?: string;
    gitlab?: string;
    liveApi?: string;
    liveApp?: string;
    storeLink?: string;
  };
}

export interface DailyProgress {
  id: string;
  date: string;
  projectId: string;
  ownerId: string;
  phaseId?: string;
  phaseName?: PhaseName;
  developerId: string;
  description: string;
  dailyTarget: string;
  actualDone: string;
  progressPercentage: number;
  shift: Shift;
  reasonIfNoWork?: NoWorkReason;
}

export interface Issue {
  id: string;
  projectId: string;
  phaseId?: string;
  projectName?: string;
  phaseName?: PhaseName;
  title?: string;
  description: string;
  type: 'Client Issue' | 'Internal Issue';
  priority?: 'Low' | 'Medium' | 'High';
  status: IssueStatus;
  developerId?: string;
  developerName?: string;
  createdAt: string;
}

export interface Leader {
  id: string;
  name: string;
  email: string;
  designation: string;
  creatorId: string;
  uid?: string;
  createdAt: any;
}

export interface ProjectCredential {
  id: string;
  projectId: string;
  title: string;
  category: 'API Key' | 'Hosting/Server' | 'Database' | 'Repository' | 'Domain' | 'Other';
  hostOrUrl?: string;
  usernameOrKey?: string;
  passwordOrSecret?: string;
  notes?: string;
  updatedAt: any;
  updatedBy: string;
}
