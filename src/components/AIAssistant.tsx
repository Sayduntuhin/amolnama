import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Send, Loader2, Bot, User, ChevronDown, Minimize2, Maximize2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export const AIAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const fetchContext = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        console.warn("No active user found for AI context.");
        return null;
      }

      const email = auth.currentUser?.email;
      const isSuper = email && (email.toLowerCase().trim() === 'exceptionhubjvai@gmail.com');

      let allowedOwnerIds = [userId];
      if (!isSuper) {
        try {
          const leadersSnap = await getDocs(query(collection(db, 'leaders'), where('creatorId', '==', userId)));
          leadersSnap.docs.forEach(doc => {
            const lUid = doc.data().uid;
            if (lUid) allowedOwnerIds.push(lUid);
          });
        } catch (e) {
          console.warn("Error fetching leaders for AI context:", e);
        }
      }

      const [projectsSnap, developersSnap] = await Promise.all([
        getDocs(collection(db, 'projects')),
        getDocs(collection(db, 'developers'))
      ]);

      let projects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      let developers = developersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      if (!isSuper) {
        projects = projects.filter(p => allowedOwnerIds.includes(p.ownerId));
        developers = developers.filter(d => allowedOwnerIds.includes(d.ownerId));
      }

      // 2. Fetch phases subcollections in parallel for all the user's projects
      const phasesPromises = projects.map(async (project: any) => {
        try {
          const phasesSnap = await getDocs(collection(db, `projects/${project.id}/phases`));
          return phasesSnap.docs.map(doc => ({
            id: doc.id,
            projectId: project.id,
            ...doc.data()
          }));
        } catch (e) {
          console.error(`Error fetching phases for project ${project.id}:`, e);
          return [];
        }
      });

      const allPhasesArrays = await Promise.all(phasesPromises);
      const phases = allPhasesArrays.flat();

      return {
        projects,
        developers,
        phases
      };
    } catch (e) {
      console.error("Error fetching context for AI:", e);
      return null;
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const context = await fetchContext();
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, context })
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error("Non-JSON response received:", text.substring(0, 200));
        if (text.includes("Starting Server...") || text.includes("<html") || response.status === 502 || response.status === 503) {
          throw new Error("The AI Assistant server is currently initializing or restarting. Please wait a few seconds and try sending your message again.");
        }
        throw new Error('Server returned an invalid response. The API route might be temporarily unavailable or restarting.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'AI response failed');
      }
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error: any) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error.message || "I'm sorry, I encountered an error. Please ensure your AI key is configured in the settings.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              height: isMinimized ? '64px' : '500px',
              width: isMinimized ? '200px' : 'min(380px, calc(100vw - 2rem))'
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="mb-4 bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-slate-900 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white tracking-wide uppercase">Sprint Desk AI</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Assistant</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
                >
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Chat Area */}
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-slate-50/50"
                >
                  {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-40">
                      <Bot className="w-12 h-12 text-slate-300" />
                      <div>
                        <p className="text-sm font-black text-slate-900 uppercase tracking-widest">How can I help?</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">Ask me for a summary of current projects, developer performance, or delivery metrics.</p>
                      </div>
                    </div>
                  )}

                  {messages.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, x: m.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "flex gap-3 max-w-[85%]",
                        m.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                        m.role === 'user' ? "bg-slate-900" : "bg-white border border-slate-200"
                      )}>
                        {m.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-indigo-500" />}
                      </div>
                      <div className={cn(
                        "p-3 rounded-2xl text-xs font-medium leading-relaxed shadow-sm prose-sm max-w-none",
                        m.role === 'user' ? "bg-slate-900 text-white rounded-tr-none" : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
                      )}>
                        {m.role === 'user' ? (
                          m.content
                        ) : (
                          <ReactMarkdown 
                            components={{
                              p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                              ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                              ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                              li: ({children}) => <li>{children}</li>,
                              strong: ({children}) => <span className="font-black text-slate-900">{children}</span>,
                              code: ({children}) => <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">{children}</code>
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {isLoading && (
                    <div className="flex gap-3 max-w-[85%]">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-indigo-500 animate-spin" />
                      </div>
                      <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm">
                        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <form 
                  onSubmit={handleSend}
                  className="p-4 bg-white border-t border-slate-100"
                >
                  <div className="relative group">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask the AI anything..."
                      className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-slate-900 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-50 disabled:grayscale transition-all shadow-md active:scale-95"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest text-center mt-3">Powered by Gemini Pro</p>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setIsOpen(true);
          setIsMinimized(false);
        }}
        className={cn(
          "relative group p-4 bg-slate-900 text-white rounded-2xl shadow-2xl transition-all duration-500",
          isOpen ? "opacity-0 pointer-events-none scale-0" : "opacity-100 scale-100"
        )}
      >
        <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900 animate-ping" />
      </motion.button>
    </div>
  );
};
