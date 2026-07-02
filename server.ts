import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini
// (Handled inline in route for better error responses)

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
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
