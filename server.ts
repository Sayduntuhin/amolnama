import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini
// (Handled inline in route for better error responses)

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Custom CORS middleware to allow requests from Netlify or anywhere else
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  const ACTIVE_SESSIONS = new Set<string>();

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/backup/save", (req, res) => {
    try {
      const data = req.body;
      const backupPath = path.resolve(__dirname, 'database_backup.json');
      fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`[Backup] Database backup saved to ${backupPath}`);
      res.json({ status: "success", message: `Backup saved successfully to ${backupPath}` });
    } catch (error: any) {
      console.error("[Backup] Error saving backup:", error);
      res.status(500).json({ error: "BACKUP_FAILED", message: error.message });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "MISSING_FIELDS", message: "Email and password are required" });
      }

      const emailLower = email.toLowerCase().trim();
      const dbPath = path.resolve(__dirname, 'database.json');
      
      if (!fs.existsSync(dbPath)) {
        return res.status(500).json({ error: "DB_MISSING", message: "Database is not initialized" });
      }

      const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

      const findUser = (listName: string) => {
        const list = dbData[listName] || [];
        return list.find((u: any) => u.email && u.email.toLowerCase() === emailLower);
      };

      const user = findUser('admins') || findUser('developers') || findUser('leaders');

      if (!user) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "Incorrect email address or password." });
      }

      if (user.password !== password) {
        return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Incorrect email address or password." });
      }

      const token = "sess_" + Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 9);
      ACTIVE_SESSIONS.add(token);

      return res.json({
        status: "success",
        token,
        user: {
          uid: user.uid || user.id,
          email: user.email,
          displayName: user.name,
          emailVerified: true
        }
      });
    } catch (error: any) {
      console.error("[Auth Server] Login error:", error);
      res.status(500).json({ error: "AUTH_FAILED", message: error.message });
    }
  });

  app.post("/api/auth/register", (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "MISSING_FIELDS", message: "Email and password are required" });
      }

      const emailLower = email.toLowerCase().trim();
      const dbPath = path.resolve(__dirname, 'database.json');
      
      if (!fs.existsSync(dbPath)) {
        return res.status(500).json({ error: "DB_MISSING", message: "Database is not initialized" });
      }

      const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

      const listNames = ['admins', 'developers', 'leaders'];
      let targetUser: any = null;
      let targetListName = '';

      for (const name of listNames) {
        const list = dbData[name] || [];
        const found = list.find((u: any) => u.email && u.email.toLowerCase() === emailLower);
        if (found) {
          targetUser = found;
          targetListName = name;
          break;
        }
      }

      if (!targetUser) {
        return res.status(403).json({ error: "ROSTER_DENIED", message: "Access Denied: Your email address is not registered in the system." });
      }

      targetUser.password = password;
      fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf-8');

      const token = "sess_" + Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 9);
      ACTIVE_SESSIONS.add(token);

      return res.json({
        status: "success",
        token,
        user: {
          uid: targetUser.uid || targetUser.id,
          email: targetUser.email,
          displayName: targetUser.name,
          emailVerified: true
        }
      });
    } catch (error: any) {
      console.error("[Auth Server] Register error:", error);
      res.status(500).json({ error: "REGISTRATION_FAILED", message: error.message });
    }
  });

  app.post("/api/auth/reset-password", (req, res) => {
    try {
      const { email, password, resetKey } = req.body;
      if (!email || !password || !resetKey) {
        return res.status(400).json({ error: "MISSING_FIELDS", message: "Email, password, and reset key are required" });
      }

      const emailLower = email.toLowerCase().trim();
      const expectedResetKey = process.env.RESET_MASTER_KEY || "jvai@reset";

      if (resetKey !== expectedResetKey) {
        return res.status(403).json({ error: "INVALID_RESET_KEY", message: "Incorrect Master Reset Key. Please contact your system administrator." });
      }

      const dbPath = path.resolve(__dirname, 'database.json');
      if (!fs.existsSync(dbPath)) {
        return res.status(500).json({ error: "DB_MISSING", message: "Database is not initialized" });
      }

      const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

      const listNames = ['admins', 'developers', 'leaders'];
      let targetUser: any = null;

      for (const name of listNames) {
        const list = dbData[name] || [];
        const found = list.find((u: any) => u.email && u.email.toLowerCase() === emailLower);
        if (found) {
          targetUser = found;
          break;
        }
      }

      if (!targetUser) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "Access Denied: Your email address is not registered in the system." });
      }

      targetUser.password = password;
      fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf-8');
      console.log(`[Auth Server] Password updated successfully for user ${email}`);

      return res.json({
        status: "success",
        message: "Password updated successfully"
      });
    } catch (error: any) {
      console.error("[Auth Server] Reset password error:", error);
      res.status(500).json({ error: "RESET_FAILED", message: error.message });
    }
  });

  app.post("/api/db/import_payload", (req, res) => {
    try {
      const payload = req.body;
      const dbPath = path.resolve(__dirname, 'database.json');
      
      const seedPasswords = (listName: string) => {
        const list = payload[listName] || [];
        list.forEach((u: any) => {
          if (!u.password) {
            let defaultPass = 'password123';
            if (u.email && u.email.toLowerCase() === 'exceptionhubjvai@gmail.com') {
              defaultPass = 'jvai@2026';
            } else if (u.email && u.email.toLowerCase() === 'sayduntuhin.jvai@gmail.com') {
              defaultPass = 'admin123';
            }
            u.password = defaultPass;
          }
        });
      };
      
      seedPasswords('admins');
      seedPasswords('leaders');
      seedPasswords('developers');
      
      fs.writeFileSync(dbPath, JSON.stringify(payload, null, 2), 'utf-8');
      console.log(`[Import] Database populated from live Firebase Firestore!`);
      res.json({ status: "success" });
    } catch (err: any) {
      console.error("[Import] Error writing import payload:", err);
      res.status(500).json({ error: "IMPORT_FAILED", message: err.message });
    }
  });

  app.post("/api/db/action", (req, res) => {
    try {
      // Authorization Check
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Missing authorization token" });
      }
      const token = authHeader.split(" ")[1];
      if (!ACTIVE_SESSIONS.has(token)) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired session token" });
      }

      const { action, path: dbPathName, id, data, constraints, operations } = req.body;
      const dbPath = path.resolve(__dirname, 'database.json');
      
      // Ensure database exists
      if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, '{}', 'utf-8');
      }
      
      const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

      const getCollection = (colPath: string) => {
        if (!dbData[colPath]) {
          dbData[colPath] = [];
        }
        return dbData[colPath];
      };

      const saveDb = () => {
        fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf-8');
      };

      if (action === 'getDocs') {
        let list = [...getCollection(dbPathName)];

        if (constraints && Array.isArray(constraints)) {
          // Apply where constraints
          constraints.forEach(c => {
            if (c && c.type === 'where') {
              list = list.filter((item: any) => {
                const itemVal = item[c.field];
                if (c.op === '==') return String(itemVal).toLowerCase() === String(c.value).toLowerCase();
                if (c.op === 'in') return Array.isArray(c.value) && c.value.includes(itemVal);
                return true;
              });
            }
          });

          // Apply orderBy constraints
          constraints.forEach(c => {
            if (c && c.type === 'orderBy') {
              list.sort((a: any, b: any) => {
                const aVal = a[c.field];
                const bVal = b[c.field];
                if (aVal === undefined && bVal === undefined) return 0;
                if (aVal === undefined) return 1;
                if (bVal === undefined) return -1;
                
                let cmp = 0;
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                  cmp = aVal.localeCompare(bVal);
                } else {
                  cmp = (aVal < bVal) ? -1 : (aVal > bVal) ? 1 : 0;
                }
                return c.direction === 'desc' ? -cmp : cmp;
              });
            }
          });
        }

        return res.json({ status: "success", docs: list.map(item => ({ id: item.id, data: item })) });
      }

      if (action === 'getDoc') {
        const list = getCollection(dbPathName);
        const item = list.find((x: any) => x.id === id);
        return res.json({ status: "success", exists: !!item, data: item || null });
      }

      if (action === 'addDoc') {
        const list = getCollection(dbPathName);
        const newId = Math.random().toString(36).substr(2, 9);
        const newItem = { id: newId, ...data };
        list.push(newItem);
        saveDb();
        return res.json({ status: "success", id: newId });
      }

      if (action === 'updateDoc') {
        const list = getCollection(dbPathName);
        const idx = list.findIndex((item: any) => item.id === id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...data };
          saveDb();
          return res.json({ status: "success" });
        }
        return res.status(404).json({ error: "NOT_FOUND", message: `Document with ID ${id} not found in collection ${dbPathName}` });
      }

      if (action === 'deleteDoc') {
        const list = getCollection(dbPathName);
        const filtered = list.filter((item: any) => item.id !== id);
        dbData[dbPathName] = filtered;
        saveDb();
        return res.json({ status: "success" });
      }

      if (action === 'writeBatch') {
        if (operations && Array.isArray(operations)) {
          operations.forEach((op: any) => {
            const list = getCollection(op.path);
            if (op.type === 'set' || op.type === 'update') {
              const existingIdx = list.findIndex((x: any) => x.id === op.id);
              if (existingIdx !== -1) {
                list[existingIdx] = { ...list[existingIdx], ...op.data };
              } else {
                list.push({ id: op.id, ...op.data });
              }
            } else if (op.type === 'delete') {
              dbData[op.path] = list.filter((item: any) => item.id !== op.id);
            }
          });
          saveDb();
          return res.json({ status: "success" });
        }
        return res.status(400).json({ error: "BAD_REQUEST", message: "Operations must be an array" });
      }

      return res.status(400).json({ error: "BAD_REQUEST", message: `Unknown action: ${action}` });
    } catch (error: any) {
      console.error("[Database Server] Error executing action:", error);
      res.status(500).json({ error: "DB_OPERATION_FAILED", message: error.message });
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      // Authorization Check
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Missing authorization token" });
      }
      const token = authHeader.split(" ")[1];
      if (!ACTIVE_SESSIONS.has(token)) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired session token" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(401).json({ 
          error: "API_KEY_MISSING", 
          message: "The Gemini API key is not set. If you are using a free model, the platform usually sets this automatically. Please ensure a Gemini model is selected in the Settings menu." 
        });
      }

      const { message, context } = req.body;
      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      // Try multiple models in sequence in case of 503/high-demand errors on specific models
      const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
      let response: any = null;
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        try {
          console.log(`Attempting to generate content with model: ${modelName}`);
          response = await ai.models.generateContent({
            model: modelName,
            contents: message,
            config: {
              systemInstruction: `You are Sprint Desk AI, a specialized assistant for a project management dashboard. 
              You have access to the current application context (projects, developers, phases). 
              Your goal is to provide concise summaries and answer questions about the project data.
              Context: ${JSON.stringify(context)}
              Be professional, analytical, and helpful. Focus on providing actionable summaries of the data provided.
              ALWAYS use Markdown formatting for your responses:
              - Use **bold** for important values, amounts, or names
              - Use bullet points for lists of projects or developers
              - Use headers (minimal) or dividers if needed for long summaries
              - Format currency as $XX,XXX.XX`,
              temperature: 0.7,
            },
          });
          
          if (response && response.text) {
            console.log(`Successfully generated content using model: ${modelName}`);
            break;
          }
        } catch (error: any) {
          console.warn(`Model ${modelName} failed or returned error:`, error.message || error);
          lastError = error;
          
          // If the error is a 401 or 403, it's an API Key issue which fallback models won't solve.
          // For those, fail immediately so the user knows they need to fix their key.
          const status = error.status || (error.error && error.error.code);
          if (status === 401 || status === 403) {
            break;
          }
        }
      }

      if (!response || !response.text) {
        throw lastError || new Error("Failed to generate response with any available models.");
      }

      res.json({ reply: response.text });
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      const status = error.status || (error.error && error.error.code) || 500;
      const message = error.message || "Internal Server Error";
      
      // Handle specific Gemini error codes
      if (status === 403 || status === 401) {
        return res.status(403).json({ 
          error: "API_KEY_INVALID", 
          message: "The API key is invalid or has insufficient permissions. Please check your Gemini API key in the Settings > Secrets panel." 
        });
      }

      res.status(status === 200 ? 500 : status).json({ error: "AI_ERROR", message });
    }
  });

  // Catch-all for API routes to avoid returning index.html
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API_NOT_FOUND", message: `API route ${req.method} ${req.url} not found` });
  });

  // Vite middleware for development
  const fs = await import("fs");
  const isDev = process.env.NODE_ENV !== "production" && fs.existsSync(path.resolve(__dirname, "vite.config.ts"));

  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // SPA Fallback for dev mode
    app.get('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const fs = await import("fs");
        let html = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        const template = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // In production (bundled in dist/server.js), assets are in the same directory
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
