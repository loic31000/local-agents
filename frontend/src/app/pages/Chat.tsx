import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Paperclip, Download, X, FileText, Copy, Check, Trash2 } from "lucide-react";
import { useAgents, Message, WELCOME_MESSAGE } from "../contexts/AgentsContext";

// ─── Bouton copie ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const el = document.createElement("textarea");
      el.value = text; document.body.appendChild(el); el.select();
      document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-slate-700/50 text-slate-500 hover:text-slate-300"
      title="Copier">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Chat() {
  const {
    agents, loading: agentsLoading,
    conversations, addMessage, resetConversation, setConversations,
  } = useAgents();

  const [input, setInput] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("coder");
  const [isLoading, setIsLoading] = useState(false);
  const [attachment, setAttachment] = useState<Message["attachment"] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  // Conversations persistantes depuis le contexte global
  const messages: Message[] = conversations[selectedAgentId] ?? [WELCOME_MESSAGE(selectedAgentId)];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!agentsLoading && agents.length > 0 && !selectedAgent) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, agentsLoading, selectedAgent]);

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    resetConversation(selectedAgentId);
    setConfirmReset(false);
  };

  // ── Envoi ─────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isLoading) return;

    let userContent = input.trim();
    if (attachment) {
      userContent += `\n\n📎 **${attachment.name}** (${(attachment.size / 1024).toFixed(1)} KB)\n\`\`\`\n${attachment.content.slice(0, 8000)}\n\`\`\``;
    }

    const userMessage: Message = {
      id: Date.now().toString(), role: "user",
      content: userContent, timestamp: new Date(),
      attachment: attachment ?? undefined,
    };

    // Ajouter dans le contexte global (persist entre pages)
    setConversations(prev => {
      const existing = prev[selectedAgentId] ?? [WELCOME_MESSAGE(selectedAgentId)];
      return { ...prev, [selectedAgentId]: [...existing, userMessage] };
    });

    const userInput = userContent;
    setInput(""); setAttachment(null); setIsLoading(true);

    try {
      const response = await fetch(`/api/chat/${selectedAgentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInput }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const content = data.output || data.content || JSON.stringify(data);
      addMessage(selectedAgentId, {
        id: (Date.now() + 1).toString(), role: "assistant",
        content, agent: selectedAgentId, model: selectedAgent?.model,
        timestamp: new Date(),
      });
    } catch (error) {
      addMessage(selectedAgentId, {
        id: (Date.now() + 1).toString(), role: "assistant",
        content: `Erreur : ${error}. Vérifie que l'agent ${selectedAgentId} est actif.`,
        agent: selectedAgentId, timestamp: new Date(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Pièce jointe ──────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert("Fichier trop volumineux (max 500 KB)"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachment({ name: file.name, content: ev.target?.result as string, size: file.size });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const exportConversation = (format: "md" | "txt") => {
    const agentName = selectedAgent?.name ?? selectedAgentId;
    const lines: string[] = [];
    if (format === "md") {
      lines.push(`# Conversation — ${agentName}`);
      lines.push(`> Modèle : ${selectedAgent?.model ?? "inconnu"}`);
      lines.push(`> Exporté le : ${new Date().toLocaleString()}`);
      lines.push("");
      messages.forEach(msg => {
        const time = msg.timestamp.toLocaleTimeString();
        const model = msg.model ? ` · \`${msg.model}\`` : "";
        lines.push(msg.role === "user" ? `## 👤 Utilisateur — ${time}` : `## 🤖 ${agentName}${model} — ${time}`);
        lines.push(msg.content); lines.push("");
      });
    } else {
      lines.push(`Conversation — ${agentName}`);
      lines.push(`Modèle : ${selectedAgent?.model ?? "inconnu"}`);
      lines.push(`Exporté le : ${new Date().toLocaleString()}`);
      lines.push("=".repeat(50));
      messages.forEach(msg => {
        const time = msg.timestamp.toLocaleTimeString();
        const model = msg.model ? ` [${msg.model}]` : "";
        const role = msg.role === "user" ? "Utilisateur" : `${agentName}${model}`;
        lines.push(`[${time}] ${role} :`); lines.push(msg.content); lines.push("");
      });
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `jarvis-${selectedAgentId}-${Date.now()}.${format}`; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-1">Chat</h2>
          <p className="text-slate-400 text-sm">Interact with JARVIS agents</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              confirmReset ? "bg-red-500/20 border border-red-500/40 text-red-400 animate-pulse"
              : "bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-red-400"}`}
            title="Effacer la conversation">
            <Trash2 className="w-3.5 h-3.5" />
            {confirmReset ? "Confirmer ?" : "Effacer"}
          </button>
          <button onClick={() => exportConversation("md")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-lg text-xs transition-all">
            <Download className="w-3.5 h-3.5" />.md
          </button>
          <button onClick={() => exportConversation("txt")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-lg text-xs transition-all">
            <Download className="w-3.5 h-3.5" />.txt
          </button>
        </div>
      </div>

      {/* Sélection agent */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {agentsLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-14 w-28 bg-slate-800/50 rounded-lg animate-pulse flex-shrink-0" />
          ))
        ) : (
          agents.map((agent) => {
            const msgCount = (conversations[agent.id] ?? []).length;
            return (
              <button key={agent.id}
                onClick={() => { setSelectedAgentId(agent.id); setConfirmReset(false); }}
                disabled={!agent.enabled}
                className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed relative ${
                  selectedAgentId === agent.id
                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white"
                    : "bg-slate-800/50 text-slate-400 hover:bg-slate-800"}`}>
                <div className="text-sm font-medium capitalize">{agent.name}</div>
                <div className="text-xs opacity-75 font-mono">{agent.model}</div>
                {msgCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold">
                    {msgCount > 9 ? "9+" : msgCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Badge agent actif */}
      {selectedAgent && (
        <div className="mb-3 px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg flex items-center gap-3 text-xs">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedAgent.enabled ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
          <span className="text-slate-400">Agent :</span>
          <span className="text-slate-200 font-medium capitalize">{selectedAgent.name}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">Modèle :</span>
          <span className="text-cyan-400 font-mono">{selectedAgent.model}</span>
          <span className="ml-auto text-slate-600">
            {messages.length - 1} message{messages.length - 1 > 1 ? "s" : ""}
          </span>
          {!selectedAgent.enabled && <span className="text-red-400 font-medium">⚠ Agent désactivé</span>}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-4 overflow-y-auto mb-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id}
              className={`flex gap-3 group ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}
              <div className={`max-w-[72%] rounded-lg p-4 ${
                message.role === "user"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white"
                  : "bg-slate-800/50 text-slate-200"}`}>
                {message.role === "assistant" && message.agent && (
                  <div className="text-xs text-cyan-400 mb-1 font-medium capitalize">
                    {agents.find((a) => a.id === message.agent)?.name ?? message.agent}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{message.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs ${message.role === "user" ? "opacity-70" : "opacity-50"}`}>
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                  {message.model && (
                    <><span className="text-xs opacity-40">·</span>
                    <span className="text-xs font-mono opacity-50">{message.model}</span></>
                  )}
                  <span className="ml-auto"><CopyButton text={message.content} /></span>
                </div>
              </div>
              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-5 h-5 text-slate-300" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                <span className="text-xs text-slate-400">{selectedAgent?.name} réfléchit...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Pièce jointe */}
      {attachment && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-xs">
          <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span className="text-slate-300 font-mono truncate">{attachment.name}</span>
          <span className="text-slate-500">({(attachment.size / 1024).toFixed(1)} KB)</span>
          <button onClick={() => setAttachment(null)} className="ml-auto text-slate-500 hover:text-red-400 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Zone de saisie */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-3">
        <div className="flex gap-2">
          <button onClick={() => fileInputRef.current?.click()} disabled={!selectedAgent?.enabled}
            className="p-2.5 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            title="Joindre un fichier (max 500 KB)">
            <Paperclip className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file"
            accept=".txt,.md,.py,.js,.ts,.tsx,.jsx,.go,.rs,.json,.yaml,.yml,.toml,.css,.html,.sql,.sh,.env"
            className="hidden" onChange={handleFileChange} />
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={handleKeyPress}
            placeholder={
              attachment ? `Question sur ${attachment.name}...`
              : selectedAgent?.enabled ? `Message à ${selectedAgent.name}...`
              : "Agent désactivé"}
            disabled={!selectedAgent?.enabled}
            className="flex-1 bg-slate-800/50 text-slate-200 placeholder-slate-500 rounded-lg px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            rows={1} />
          <button onClick={handleSend}
            disabled={(!input.trim() && !attachment) || isLoading || !selectedAgent?.enabled}
            className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}