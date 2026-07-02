import fs from 'fs';
import path from 'path';

const configPath = '/Users/samin/.config/configstore/firebase-tools.json';
const projectId = 'projectmanagment-b619c';
const databaseId = 'ai-studio-dff2f466-838a-4f9b-813f-0884b30d9716';

async function getAccessToken(): Promise<string> {
  const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refresh_token = data.tokens.refresh_token;
  const client_id = data.user.azp;

  console.log("Refreshing access token manually with the correct client secret...");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id,
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
      refresh_token,
      grant_type: "refresh_token"
    })
  });

  const resJson = await response.json() as any;
  if (!response.ok) {
    throw new Error(`Failed to refresh access token: ${JSON.stringify(resJson)}`);
  }
  return resJson.access_token;
}

async function listDocuments(collectionName: string, token: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionName}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  const resJson = await response.json() as any;
  if (!response.ok) {
    throw new Error(`Failed to fetch collection ${collectionName}: ${JSON.stringify(resJson)}`);
  }
  return resJson.documents || [];
}

async function listSubcollection(parentPath: string, subcollectionName: string, token: string) {
  const url = `https://firestore.googleapis.com/v1/${parentPath}/${subcollectionName}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  const resJson = await response.json() as any;
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to fetch subcollection ${subcollectionName} for parent ${parentPath}: ${JSON.stringify(resJson)}`);
  }
  return resJson.documents || [];
}

async function run() {
  try {
    const token = await getAccessToken();
    console.log("Authenticated successfully!");

    // 1. Fetch all developers
    console.log("\n--- FETCHING DEVELOPERS ---");
    const devs = await listDocuments('developers', token);
    console.log(`Found ${devs.length} developers in Firestore.`);

    let emonDoc: any = null;
    devs.forEach((dev: any) => {
      const fields = dev.fields;
      const id = dev.name.split('/').pop();
      const email = fields.email?.stringValue;
      const name = fields.name?.stringValue;
      console.log(`- Developer ID: ${id}, Name: ${name}, Email: ${email}`);
      if (email && email.toLowerCase().trim() === 'emon@joinventureai.com') {
        emonDoc = dev;
      }
    });

    if (!emonDoc) {
      console.log("\nWARNING: emon@joinventureai.com was NOT found in the developers collection!");
      process.exit(0);
    }

    const emonId = emonDoc.name.split('/').pop();
    const emonFields = emonDoc.fields;
    console.log(`\nFound Emon's Profile document!`);
    console.log(`JSON Fields:`, JSON.stringify(emonFields, null, 2));

    // 2. Fetch all projects and look for Emon's assignments
    console.log("\n--- FETCHING PROJECTS ---");
    const projects = await listDocuments('projects', token);
    console.log(`Found ${projects.length} projects in Firestore.`);

    for (const proj of projects) {
      const projId = proj.name.split('/').pop();
      const projFields = proj.fields;
      const clientName = projFields.clientName?.stringValue || "Unknown Client";
      const status = projFields.status?.stringValue || "Unknown Status";
      const ownerId = projFields.ownerId?.stringValue || "Unknown Owner";
      console.log(`- Project ID: ${projId}, Client: ${clientName}, Status: ${status}, Owner: ${ownerId}`);

      // Query phases for this project
      const parentPath = proj.name; // projects/project-id
      const phases = await listSubcollection(parentPath, 'phases', token);
      for (const phase of phases) {
        const phaseId = phase.name.split('/').pop();
        const phaseFields = phase.fields;
        const phaseName = phaseFields.phaseName?.stringValue;
        const devIdsArray = phaseFields.developerIds?.arrayValue?.values || [];
        const devIds = devIdsArray.map((v: any) => v.stringValue).filter(Boolean);
        console.log(`  * Phase: ${phaseName} (${phaseId}), developerIds: [${devIds.join(', ')}]`);
        if (devIds.includes(emonId)) {
          console.log(`    --> FOUND Emon (${emonId}) assigned to this phase!`);
        }
      }
    }

  } catch (err: any) {
    console.error("An error occurred during diagnostics:", err.message || err);
  }
}

run();
