import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, Loader2, Paperclip,
  X, FileText, Copy, Check, Trash2,
  Zap, MessageSquare, Settings, Play, Pause,
  Save, RefreshCw, Download, ChevronDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useAgents, Message, WELCOME_MESSAGE } from "../contexts/AgentsContext";
import type { Agent } from "../contexts/AgentsContext";

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch { const el = document.createElement("textarea"); el.value = text; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className={`transition-all p-1.5 rounded-md ${className}`} title="Copier">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── CodeBlock ────────────────────────────────────────────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-700/60 bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/90 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
          </div>
          <span className="text-[11px] font-mono text-slate-500 tracking-widest uppercase ml-2">{language || "code"}</span>
        </div>
        <CopyButton text={code} className="text-slate-500 hover:text-slate-200 hover:bg-slate-700/60" />
      </div>
      <SyntaxHighlighter language={language || "text"} style={oneDark}
        customStyle={{ margin: 0, padding: "1.1rem 1.25rem", background: "transparent", fontSize: "0.8rem", lineHeight: "1.65" }}
        showLineNumbers={code.split("\n").length > 4} lineNumberStyle={{ color: "#2d3748", minWidth: "2.5em" }} wrapLongLines={false}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ─── MarkdownMessage ──────────────────────────────────────────────────────────

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown components={{
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || "");
          const code = String(children).replace(/\n$/, "");
          if (code.includes("\n") || !!match) return <CodeBlock language={match?.[1] ?? ""} code={code} />;
          return <code className="px-1.5 py-0.5 rounded-md text-[0.82em] font-mono bg-slate-700/60 text-cyan-300 border border-slate-600/40">{children}</code>;
        },
        h1: ({ children }) => <h1 className="text-xl font-bold text-slate-100 mt-5 mb-2 pb-2 border-b border-slate-700/40">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-semibold text-slate-100 mt-4 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold text-slate-200 mt-3 mb-1.5">{children}</h3>,
        p:  ({ children }) => <p className="text-slate-200 leading-7 mb-3 last:mb-0 text-[0.925rem]">{children}</p>,
        ul: ({ children }) => <ul className="my-2.5 space-y-1.5 pl-1">{children}</ul>,
        ol: ({ children }) => <ol className="my-2.5 space-y-1.5 pl-1 list-decimal list-inside">{children}</ol>,
        li: ({ children }) => (
          <li className="text-slate-300 text-sm leading-relaxed flex gap-2.5 items-start">
            <span className="text-cyan-500/70 mt-1.5 shrink-0 text-[8px]">◆</span><span>{children}</span>
          </li>
        ),
        hr:         () => <hr className="my-4 border-slate-700/40" />,
        a:          ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-500/30 transition-all">{children}</a>,
        strong:     ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
        em:         ({ children }) => <em className="italic text-slate-300">{children}</em>,
        blockquote: ({ children }) => <blockquote className="my-3 pl-4 border-l-2 border-cyan-500/40 text-slate-400 italic bg-cyan-500/5 rounded-r-lg py-2 pr-3">{children}</blockquote>,
        table:      ({ children }) => <div className="my-3 overflow-x-auto rounded-xl border border-slate-700/40"><table className="w-full text-sm">{children}</table></div>,
        thead:      ({ children }) => <thead className="bg-slate-800/80 text-slate-300">{children}</thead>,
        tbody:      ({ children }) => <tbody className="divide-y divide-slate-700/30">{children}</tbody>,
        tr:         ({ children }) => <tr className="hover:bg-slate-800/30 transition-colors">{children}</tr>,
        th:         ({ children }) => <th className="px-4 py-2.5 text-left font-medium text-slate-400 text-xs uppercase tracking-wider">{children}</th>,
        td:         ({ children }) => <td className="px-4 py-2.5 text-slate-300">{children}</td>,
      }}>{content}</ReactMarkdown>
    </div>
  );
}

// ─── Ollama models hook ───────────────────────────────────────────────────────

function useOllamaModels() {
  const [models, setModels] = useState<string[]>(["qwen2.5-coder:1.5b","llama3.2:latest","llama3.2:3b","mistral:7b-instruct-q4_0","gemma3:1b"]);
  useEffect(() => {
    fetch("/api/ollama/models").then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.models?.length) setModels(d.models.map((m: { name: string }) => m.name)); }).catch(() => {});
  }, []);
  return models;
}

// ─── Modal config agent ───────────────────────────────────────────────────────

function AgentConfigModal({ agent, onClose, onSave }: { agent: Agent; onClose: () => void; onSave: (a: Agent) => void }) {
  const [form, setForm] = useState({ ...agent });
  const [saving, setSaving] = useState(false);
  const models = useOllamaModels();

  const handleSave = async () => {
    setSaving(true);
    try { await fetch(`/api/agents/${agent.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); } catch {}
    setTimeout(() => { onSave(form); setSaving(false); onClose(); }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${form.enabled ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}>
              {agent.name.slice(0,2).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-100 capitalize">{agent.name}</p>
              <p className="text-xs text-slate-600 font-mono">{agent.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1.5 font-medium">Description</label>
            <input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))}
              className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all placeholder-slate-600" placeholder="Rôle de cet agent…" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1.5 font-medium">Modèle LLM</label>
            <select value={form.model} onChange={e => setForm(p => ({...p, model: e.target.value}))}
              className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all font-mono">
              {models.map(m => <option key={m} value={m}>{m}</option>)}
              {!models.includes(form.model) && <option value={form.model}>{form.model}</option>}
            </select>
          </div>
          <div className={`flex items-center justify-between p-4 rounded-xl border ${form.enabled ? "bg-green-500/5 border-green-500/20" : "bg-slate-800/30 border-slate-700/30"}`}>
            <div>
              <p className="text-sm text-slate-200 font-medium">Agent {form.enabled ? "activé" : "désactivé"}</p>
              <p className="text-xs text-slate-500 mt-0.5">{form.enabled ? "Répond aux messages" : "Hors ligne"}</p>
            </div>
            <button onClick={() => setForm(p => ({...p, enabled: !p.enabled}))}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${form.enabled ? "bg-cyan-500" : "bg-slate-700"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.enabled ? "translate-x-6" : ""}`} />
            </button>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/30 text-slate-300 rounded-xl text-sm transition-all">Annuler</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/15 hover:opacity-90 transition-all disabled:opacity-60">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeStr(d: Date) {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Chat() {
  const {
    agents, loading: agentsLoading,
    conversations, addMessage, resetConversation, setConversations, updateAgent,
  } = useAgents();

  const [input, setInput]                   = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("coder");
  const [isLoading, setIsLoading]           = useState(false);
  const [attachment, setAttachment]         = useState<Message["attachment"] | null>(null);
  const [confirmReset, setConfirmReset]     = useState(false);
  const [configAgent, setConfigAgent]       = useState<Agent | null>(null);
  const [togglingId, setTogglingId]         = useState<string | null>(null);
  const [agentMenuOpen, setAgentMenuOpen]   = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const agentMenuRef   = useRef<HTMLDivElement>(null);

  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const messages: Message[] = conversations[selectedAgentId] ?? [WELCOME_MESSAGE(selectedAgentId)];
  const msgCount = Math.max(0, messages.length - 1);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!agentsLoading && agents.length > 0 && !selectedAgent) setSelectedAgentId(agents[0].id);
  }, [agents, agentsLoading, selectedAgent]);

  // Fermer le menu agents en cliquant dehors
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) setAgentMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);
  useEffect(() => { autoResize(); }, [input, autoResize]);

  const toggleAgent = async (agent: Agent) => {
    setTogglingId(agent.id);
    const newEnabled = !agent.enabled;
    try { await fetch(`/api/agents/${agent.id}/${newEnabled ? "start" : "stop"}`, { method: "POST" }); } catch {}
    setTimeout(() => { updateAgent({ ...agent, enabled: newEnabled }); setTogglingId(null); }, 400);
  };

  const handleReset = () => {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return; }
    resetConversation(selectedAgentId); setConfirmReset(false);
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isLoading) return;
    let userContent = input.trim();
    if (attachment) userContent += `\n\n📎 **${attachment.name}** (${(attachment.size/1024).toFixed(1)} KB)\n\`\`\`\n${attachment.content.slice(0,8000)}\n\`\`\``;

    setConversations(prev => {
      const existing = prev[selectedAgentId] ?? [WELCOME_MESSAGE(selectedAgentId)];
      return { ...prev, [selectedAgentId]: [...existing, { id: Date.now().toString(), role: "user" as const, content: userContent, timestamp: new Date(), attachment: attachment ?? undefined }] };
    });

    const userInput = userContent;
    setInput(""); setAttachment(null); setIsLoading(true);
    try {
      const response = await fetch(`/api/chat/${selectedAgentId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInput }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      addMessage(selectedAgentId, { id: (Date.now()+1).toString(), role: "assistant", content: data.output||data.content||JSON.stringify(data), agent: selectedAgentId, model: selectedAgent?.model, timestamp: new Date() });
    } catch (error) {
      addMessage(selectedAgentId, { id: (Date.now()+1).toString(), role: "assistant", content: `Erreur : ${error}. Vérifie que l'agent ${selectedAgentId} est actif.`, agent: selectedAgentId, timestamp: new Date() });
    } finally { setIsLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 500*1024) { alert("Fichier trop volumineux (max 500 KB)"); return; }
    const reader = new FileReader();
    reader.onload = ev => setAttachment({ name: file.name, content: ev.target?.result as string, size: file.size });
    reader.readAsText(file); e.target.value = "";
  };

  const exportConversation = (format: "md"|"txt") => {
    const agentName = selectedAgent?.name ?? selectedAgentId;
    const lines: string[] = [];
    if (format === "md") {
      lines.push(`# Conversation — ${agentName}`, `> Modèle : ${selectedAgent?.model ?? "inconnu"}`, `> Exporté le : ${new Date().toLocaleString()}`, "");
      messages.forEach(msg => { lines.push(msg.role === "user" ? `## 👤 Utilisateur — ${timeStr(msg.timestamp)}` : `## 🤖 ${agentName} — ${timeStr(msg.timestamp)}`); lines.push(msg.content, ""); });
    } else {
      lines.push(`Conversation — ${agentName}`, "=".repeat(50));
      messages.forEach(msg => { lines.push(`[${timeStr(msg.timestamp)}] ${msg.role === "user" ? "Utilisateur" : agentName} :`); lines.push(msg.content, ""); });
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `jarvis-${selectedAgentId}-${Date.now()}.${format}`; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ overflow: "hidden" }}>

      {/* ── Topbar ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-slate-800/60 bg-slate-950/40 backdrop-blur-sm relative z-10 overflow-visible">

        {/* Sélecteur d'agent — dropdown */}
        <div className="relative" ref={agentMenuRef}>
          <button onClick={() => setAgentMenuOpen(p => !p)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all ${
              agentMenuOpen ? "border-cyan-500/40 bg-cyan-500/8" : "border-slate-700/30 bg-slate-800/40 hover:bg-slate-800/60"
            }`}>
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
              selectedAgent?.enabled ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white" : "bg-slate-800 text-slate-500"
            }`}>
              {selectedAgent?.name.slice(0,2).toUpperCase() ?? "?"}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-slate-200 text-sm font-medium capitalize leading-none">{selectedAgent?.name ?? "—"}</p>
              <p className="text-slate-600 text-[10px] font-mono mt-0.5">{selectedAgent?.model ?? ""}</p>
            </div>
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedAgent?.enabled ? "bg-green-400" : "bg-red-400"}`} />
            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${agentMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Dropdown */}
          {agentMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/50 z-[200] overflow-hidden">
              <div className="p-2 space-y-1">
                {agentsLoading ? (
                  [...Array(3)].map((_, i) => <div key={i} className="h-14 bg-slate-800/40 rounded-xl animate-pulse" />)
                ) : agents.map(agent => {
                  const isSelected = agent.id === selectedAgentId;
                  const convLen = (conversations[agent.id] ?? []).length;
                  return (
                    <div key={agent.id} className={`group rounded-xl border transition-all ${
                      isSelected ? "border-cyan-500/25 bg-cyan-500/5" : "border-transparent hover:bg-slate-800/40"
                    }`}>
                      {/* Sélection */}
                      <button onClick={() => { setSelectedAgentId(agent.id); setAgentMenuOpen(false); setConfirmReset(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                        <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          agent.enabled ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white" : "bg-slate-800 text-slate-500"
                        }`}>
                          {agent.name.slice(0,2).toUpperCase()}
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-slate-900 ${agent.enabled ? "bg-green-400" : "bg-red-400"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-slate-200 text-sm font-medium capitalize">{agent.name}</p>
                            {convLen > 1 && <span className="text-[9px] bg-cyan-500/15 text-cyan-400 px-1.5 py-0.5 rounded-full border border-cyan-500/20">{convLen}</span>}
                          </div>
                          <p className="text-slate-600 text-[10px] font-mono truncate">{agent.model}</p>
                        </div>
                        {isSelected && <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full flex-shrink-0" />}
                      </button>
                      {/* Actions Stop/Config */}
                      <div className="flex gap-1 px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); toggleAgent(agent); }} disabled={togglingId === agent.id}
                          className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-medium transition-all disabled:opacity-50 ${
                            agent.enabled ? "bg-red-500/10 hover:bg-red-500/20 text-red-400" : "bg-green-500/10 hover:bg-green-500/20 text-green-400"
                          }`}>
                          {togglingId === agent.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : agent.enabled ? <><Pause className="w-3 h-3" />Stop</> : <><Play className="w-3 h-3" />Start</>}
                        </button>
                        <button onClick={e => { e.stopPropagation(); setConfigAgent({ ...agent, capabilities: agent.capabilities ?? [] }); setAgentMenuOpen(false); }}
                          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-medium bg-slate-700/40 hover:bg-slate-700/70 text-slate-400 hover:text-slate-200 transition-all">
                          <Settings className="w-3 h-3" />Config
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Infos conversation */}
        <div className="flex items-center gap-3 text-[11px] text-slate-700 font-mono ml-1">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" />{msgCount} msg
          </span>
          {selectedAgent?.enabled && (
            <span className="flex items-center gap-1.5 text-green-600">
              <Zap className="w-3 h-3" />Prêt
            </span>
          )}
          {!selectedAgent?.enabled && selectedAgent && (
            <span className="text-red-500">hors ligne</span>
          )}
        </div>

        {/* Actions droite */}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={handleReset}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all ${
              confirmReset ? "bg-red-500/10 border border-red-500/25 text-red-400 animate-pulse" : "text-slate-600 hover:text-red-400 hover:bg-red-500/8"
            }`}>
            <Trash2 className="w-3 h-3" />
            <span className="hidden sm:inline">{confirmReset ? "Confirmer ?" : "Effacer"}</span>
          </button>
          <button onClick={() => exportConversation("md")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-slate-600 hover:text-slate-300 hover:bg-slate-800/60 transition-all">
            <Download className="w-3 h-3" /><span className="hidden sm:inline">.md</span>
          </button>
          <button onClick={() => exportConversation("txt")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-slate-600 hover:text-slate-300 hover:bg-slate-800/60 transition-all">
            <Download className="w-3 h-3" /><span className="hidden sm:inline">.txt</span>
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800/0 hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {messages.map(message => (
            <div key={message.id} className={`flex gap-3 group ${message.role === "user" ? "justify-end" : "justify-start"}`}>

              {/* Avatar assistant */}
              {message.role === "assistant" && (
                <div className="flex-shrink-0 mt-1 w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/15 ring-2 ring-slate-900/80">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}

              {/* Bulle utilisateur */}
              {message.role === "user" ? (
                <div className="flex flex-col items-end gap-1 max-w-[75%] sm:max-w-[60%]">
                  <div className="rounded-2xl rounded-tr-sm px-4 py-3 bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-lg shadow-blue-900/25">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  </div>
                  <div className="flex items-center gap-1 px-1">
                    <CopyButton text={message.content} className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-slate-300 hover:bg-slate-800/60" />
                    <span className="text-[10px] text-slate-700 font-mono">{timeStr(message.timestamp)}</span>
                  </div>
                </div>
              ) : (
                /* Bulle assistant */
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-semibold text-cyan-400 capitalize">
                      {agents.find(a => a.id === message.agent)?.name ?? message.agent ?? "Jarvis"}
                    </span>
                    {message.model && <span className="text-[10px] font-mono text-slate-600">{message.model}</span>}
                  </div>
                  <div className="relative bg-slate-900/70 border border-slate-800/60 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
                    <div className="absolute left-0 top-4 bottom-4 w-px bg-gradient-to-b from-cyan-500/40 via-blue-500/20 to-transparent rounded-full" />
                    <MarkdownMessage content={message.content} />
                    <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800/50">
                      <span className="text-[10px] text-slate-700 font-mono">{timeStr(message.timestamp)}</span>
                      {message.model && <span className="text-[10px] text-slate-700 font-mono">{message.model}</span>}
                      <CopyButton text={message.content} className="ml-auto opacity-0 group-hover:opacity-100 text-slate-700 hover:text-slate-300 hover:bg-slate-800/60" />
                    </div>
                  </div>
                </div>
              )}

              {/* Avatar utilisateur */}
              {message.role === "user" && (
                <div className="flex-shrink-0 mt-1 w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center ring-2 ring-slate-900/80">
                  <User className="w-4 h-4 text-slate-500" />
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-1 w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/15 ring-2 ring-slate-900/80">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-slate-900/70 border border-slate-800/60 rounded-2xl rounded-tl-sm px-5 py-3.5 flex items-center gap-3">
                <div className="flex gap-1.5">
                  {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-500/60 animate-bounce" style={{ animationDelay: `${i*0.18}s`, animationDuration: "0.85s" }} />)}
                </div>
                <span className="text-sm text-slate-600 italic">{selectedAgent?.name ?? "Agent"} génère…</span>
                <Loader2 className="w-3.5 h-3.5 text-slate-700 animate-spin" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Zone de saisie ── */}
      <div className="flex-shrink-0 border-t border-slate-800/40 bg-slate-950/30 backdrop-blur-sm px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-5xl mx-auto">

          {/* Pièce jointe */}
          {attachment && (
            <div className="mb-2.5 flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/30 rounded-xl text-xs">
              <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span className="text-slate-300 font-mono truncate">{attachment.name}</span>
              <span className="text-slate-600">({(attachment.size/1024).toFixed(1)} KB)</span>
              <button onClick={() => setAttachment(null)} className="ml-auto text-slate-600 hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Input grid */}
          <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", gap: 8, alignItems: "end" }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={!selectedAgent?.enabled}
              style={{ width: 44, height: 44 }}
              className="flex items-center justify-center rounded-xl border border-slate-700/30 bg-slate-800/50 hover:bg-slate-800 text-slate-600 hover:text-cyan-400 transition-all disabled:opacity-25 disabled:cursor-not-allowed">
              <Paperclip className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.py,.js,.ts,.tsx,.jsx,.go,.rs,.json,.yaml,.yml,.toml,.css,.html,.sql,.sh,.env" className="hidden" onChange={handleFileChange} />

            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={attachment ? `Question sur ${attachment.name}...` : selectedAgent?.enabled ? `Message à ${selectedAgent.name}…` : "Agent désactivé"}
              disabled={!selectedAgent?.enabled} rows={1}
              style={{ minHeight: 44, maxHeight: 160, paddingTop: 12, paddingBottom: 12, resize: "none" }}
              className="w-full bg-slate-800/50 border border-slate-700/30 text-slate-200 placeholder-slate-700 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed text-sm leading-relaxed transition-all" />

            <button onClick={handleSend} disabled={(!input.trim() && !attachment) || isLoading || !selectedAgent?.enabled}
              style={{ width: 44, height: 44 }}
              className={`flex items-center justify-center rounded-xl transition-all ${
                (!input.trim() && !attachment) || isLoading || !selectedAgent?.enabled
                  ? "bg-slate-800/40 border border-slate-700/20 text-slate-700 cursor-not-allowed"
                  : "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:opacity-90 active:scale-95"
              }`}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Modal config */}
      {configAgent && (
        <AgentConfigModal agent={configAgent} onClose={() => setConfigAgent(null)}
          onSave={updated => { updateAgent({ ...updated, capabilities: updated.capabilities ?? [] }); setConfigAgent(null); }} />
      )}
    </div>
  );
}