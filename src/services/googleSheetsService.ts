import { projectService } from './projectService';
import { Project, PhaseName, Shift, ProjectStatus } from '@/src/types';

export interface SheetRow {
  projectId: string;
  clientName: string;
  amount: number;
  startDate: string;
  shift: Shift;
  phases: PhaseName[];
}

export interface SyncReport {
  totalRows: number;
  syncedCount: number;
  duplicateDbCount: number;
  duplicateSheetCount: number;
  invalidCount: number;
  details: Array<{
    rowNumber: number;
    projectId: string;
    clientName: string;
    status: 'success' | 'duplicate_db' | 'duplicate_sheet' | 'invalid';
    reason?: string;
  }>;
}

const VALID_PHASE_NAMES: PhaseName[] = [
  'UI/UX',
  'App Frontend',
  'Web Frontend',
  'Backend',
  'AI',
  'Deployment',
  'Integration',
  'Full Project'
];

/**
 * Match string to closest official PhaseName, or default to 'UI/UX'
 */
function parsePhases(phasesStr: string): PhaseName[] {
  if (!phasesStr) return ['UI/UX'];
  
  return phasesStr
    .split(',')
    .map(p => p.trim())
    .map(p => {
      const match = VALID_PHASE_NAMES.find(
        valid => valid.toLowerCase() === p.toLowerCase()
      );
      if (match) return match;
      
      // Partial matches
      if (p.toLowerCase().includes('frontend')) {
        if (p.toLowerCase().includes('app') || p.toLowerCase().includes('mobile')) {
          return 'App Frontend';
        }
        return 'Web Frontend';
      }
      if (p.toLowerCase().includes('design') || p.toLowerCase().includes('ux') || p.toLowerCase().includes('ui')) {
        return 'UI/UX';
      }
      if (p.toLowerCase().includes('back')) {
        return 'Backend';
      }
      if (p.toLowerCase().includes('ai') || p.toLowerCase().includes('ml') || p.toLowerCase().includes('model')) {
        return 'AI';
      }
      if (p.toLowerCase().includes('deploy') || p.toLowerCase().includes('cloud') || p.toLowerCase().includes('cicd')) {
        return 'Deployment';
      }
      if (p.toLowerCase().includes('integrat')) {
        return 'Integration';
      }
      
      return 'Full Project' as PhaseName;
    });
}

export const googleSheetsService = {
  /**
   * Fetches Google Sheets data using raw fetch and the given access token
   */
  async fetchSheetData(accessToken: string, spreadsheetUrlOrId: string, range: string): Promise<any[][]> {
    // Extract ID from full URL if provided
    let spreadsheetId = spreadsheetUrlOrId.trim();
    const urlMatch = spreadsheetUrlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) {
      spreadsheetId = urlMatch[1];
    }

    if (!spreadsheetId) {
      throw new Error('Invalid Spreadsheet ID or URL');
    }

    const cleanRange = range.trim() || 'Sheet1!A2:F100';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cleanRange)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Google Sheets API Error body:', errBody);
      throw new Error(`Google Sheets API responded with ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.values || [];
  },

  /**
   * Main sync processor checking for database and in-batch duplicate projects
   */
  async syncProjectsWithDatabase(rows: any[][], existingProjects: Project[]): Promise<SyncReport> {
    const report: SyncReport = {
      totalRows: rows.length,
      syncedCount: 0,
      duplicateDbCount: 0,
      duplicateSheetCount: 0,
      invalidCount: 0,
      details: []
    };

    const seenProjectIdsInSheet = new Set<string>();

    // Normalize existing project ID set for quick O(1) comparison
    const existingProjectIds = new Set(
      existingProjects.map(p => p.projectId ? p.projectId.toLowerCase().trim() : '')
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Assuming range starts at row 2 (row 1 is header)

      // We expect columns: 
      // 0: Project ID (Business Ref)
      // 1: Client Name
      // 2: Amount
      // 3: Start Date (YYYY-MM-DD or MM/DD/YYYY)
      // 4: Shift (Day/Night)
      // 5: Phases optional (comma separated)
      const rawId = row[0]?.toString() || '';
      const clientName = row[1]?.toString() || '';
      const amountRaw = row[2]?.toString() || '0';
      const startDateRaw = row[3]?.toString() || '';
      const shiftRaw = row[4]?.toString() || 'Day';
      const phasesRaw = row[5]?.toString() || '';

      const projectId = rawId.trim();

      // Validation
      if (!projectId || !clientName) {
        report.invalidCount++;
        report.details.push({
          rowNumber: rowNum,
          projectId: projectId || 'N/A',
          clientName: clientName || 'N/A',
          status: 'invalid',
          reason: 'Missing Project ID or Client Name'
        });
        continue;
      }

      const lowerId = projectId.toLowerCase().trim();

      // 1. Check duplicate inside Sheet (in-batch double import prevention)
      if (seenProjectIdsInSheet.has(lowerId)) {
        report.duplicateSheetCount++;
        report.details.push({
          rowNumber: rowNum,
          projectId,
          clientName,
          status: 'duplicate_sheet',
          reason: 'Duplicate project ID found earlier in the Google Sheet'
        });
        continue;
      }

      // Add to sheet seen list
      seenProjectIdsInSheet.add(lowerId);

      // 2. Check duplicate in database (prevent syncing duplicates!)
      if (existingProjectIds.has(lowerId)) {
        report.duplicateDbCount++;
        report.details.push({
          rowNumber: rowNum,
          projectId,
          clientName,
          status: 'duplicate_db',
          reason: 'Project ID already exists in your database'
        });
        continue;
      }

      // Parse fields safely
      const amount = parseFloat(amountRaw.replace(/[^0-9.-]+/g, '')) || 0;
      let startDate = startDateRaw.trim() || new Date().toISOString().split('T')[0];
      
      // Simple date normalizer to YYYY-MM-DD if in format MM/DD/YYYY
      if (startDate.includes('/')) {
        const parts = startDate.split('/');
        if (parts.length === 3) {
          const month = parts[0].padStart(2, '0');
          const day = parts[1].padStart(2, '0');
          const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          startDate = `${year}-${month}-${day}`;
        }
      }

      const shift: Shift = (shiftRaw.trim().toLowerCase() === 'night') ? 'Night' : 'Day';
      const hasPhases = parsePhases(phasesRaw);

      // Prepare project creation params
      const projectData = {
        projectId,
        clientName,
        amount,
        startDate,
        status: 'WIP' as ProjectStatus,
        shift,
        phases: hasPhases
      };

      // Set up milestones based on the listed phases
      // Split contract amount evenly among phases
      const phaseValue = amount / hasPhases.length;
      const initialPhases = hasPhases.map((phaseName, idx) => {
        // Stagger delivery dates by idx * 7 days
        const delivery = new Date(startDate);
        delivery.setDate(delivery.getDate() + (idx + 1) * 7);
        return {
          phaseName,
          orderId: `PH-${101 + idx}`,
          value: Math.round(phaseValue),
          startDate,
          expectedDeliveryDate: delivery.toISOString().split('T')[0]
        };
      });

      try {
        await projectService.createProject(projectData, initialPhases);
        report.syncedCount++;
        report.details.push({
          rowNumber: rowNum,
          projectId,
          clientName,
          status: 'success'
        });
      } catch (err: any) {
        console.error(`Failed to seed project ${projectId}:`, err);
        report.invalidCount++;
        report.details.push({
          rowNumber: rowNum,
          projectId,
          clientName,
          status: 'invalid',
          reason: `Database error: ${err.message}`
        });
      }
    }

    return report;
  }
};
