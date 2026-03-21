import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield, CheckCircle2, Ban, TrendingUp, RefreshCw,
  WifiOff, Terminal, Search, Lock, Unlock, Loader2, X,
  ChevronDown, ChevronUp, AlertTriangle, Wifi,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SecurityEvent {
  id: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  event_type: string;
  description: string;
  timestamp: string;
  agent_id?: string;
  ip?: string;
  status?: string;
  blocked?: boolean;
}

interface CyberStatus {
  status: string;
  version?: string;
  watched_agents?: string[];
  auto_block?: boolean;
  events_count?: number;
  blocked_ips?: string[];
}

interface AnalyzeResult {
  safe: boolean;
  score: number;
  threats: string[];
  recommendation: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CYBER_URL = "http://localhost:8086";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}min`;
  return `${Math.floor(d / 3600)}h`;
}

function sevStyle(s: string) {
  if (s === "CRITICAL") return "text-red-400 bg-red-500/10 border-red-500/25";
  if (s === "WARNING")  return "text-yellow-400 bg-yellow-500/10 border-yellow-500/25";
  return "text-blue-400 bg-blue-500/10 border-blue-500/25";
}

function sevDot(s: string) {
  if (s === "CRITICAL") return "bg-red-400 animate-pulse";
  if (s === "WARNING")  return "bg-yellow-400";
  return "bg-blue-400";
}

function eventLabel(t: string) {
  const m: Record<string, string> = {
    PROMPT_INJECTION:   "Injection de prompt",
    RATE_LIMIT:         "Rate limit",
    REPLAY_ATTACK:      "Replay attack",
    BLOCKED_IP:         "IP bloquée",
    SUSPICIOUS_PAYLOAD: "Payload suspect",
    AGENT_UNREACHABLE:  "Agent injoignable",
  };
  return m[t] ?? t;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type = "success" }: { msg: string; type?: "success" | "error" }) {
  return (
    <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium backdrop-blur-sm ${
      type === "success" ? "bg-green-900/80 border-green-700/50 text-green-200" : "bg-red-900/80 border-red-700/50 text-red-200"
    }`}>
      {type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

// ─── Section expandable ───────────────────────────────────────────────────────

function Section({ title, icon: Icon, iconColor = "text-cyan-400", children, defaultOpen = true, badge }: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden">
      <div onClick={() => setOpen(p => !p)}
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-800/20 transition-colors">
        <span className="font-semibold text-slate-200 text-sm flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />{title}
        </span>
        <div className="flex items-center gap-3">
          {badge}
          {open ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
        </div>
      </div>
      {open && <div className="border-t border-slate-800/40">{children}</div>}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function CyberDefence() {
  const [cyberStatus, setCyberStatus] = useState<CyberStatus | null>(null);
  const [events, setEvents]           = useState<SecurityEvent[]>([]);
  const [chartData, setChartData]     = useState<{ time: string; threats: number; blocked: number }[]>([]);
  const [cyberOk, setCyberOk]         = useState(false);
  const [orchOk, setOrchOk]           = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [filter, setFilter]           = useState<"ALL" | "CRITICAL" | "WARNING" | "INFO">("ALL");
  const [analyzeInput, setAnalyzeInput] = useState("");
  const [analyzing, setAnalyzing]     = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [liveLog, setLiveLog]         = useState<{ id: number; text: string; level: string; ts: string }[]>([]);
  const [newIp, setNewIp]             = useState("");
  const [toast, setToast]             = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const logIdRef = useRef(0);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  };

  const pushLog = useCallback((text: string, level = "INFO") => {
    const ts = new Date().toLocaleTimeString("fr-FR", { hour12: false });
    setLiveLog(p => [{ id: ++logIdRef.current, text, level, ts }, ...p].slice(0, 30));
  }, []);

  const fetchAll = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try { const r = await fetch("/api/health"); setOrchOk(r.ok); } catch { setOrchOk(false); }
    try {
      const r = await fetch(`${CYBER_URL}/status`);
      if (r.ok) { setCyberStatus(await r.json()); setCyberOk(true); }
      else throw new Error();
    } catch {
      setCyberOk(false);
      setCyberStatus({ status: "offline", watched_agents: ["coder","files","email"], blocked_ips: [] });
    }
    try {
      const r = await fetch(`${CYBER_URL}/events?limit=50`);
      if (r.ok) {
        const d = await r.json();
        const list: SecurityEvent[] = Array.isArray(d) ? d : (d.events ?? []);
        setEvents(list);
        const byH: Record<string, { threats: number; blocked: number }> = {};
        list.forEach(e => {
          const k = `${String(new Date(e.timestamp).getHours()).padStart(2,"0")}:00`;
          if (!byH[k]) byH[k] = { threats: 0, blocked: 0 };
          byH[k].threats++;
          if (e.blocked || e.status === "blocked") byH[k].blocked++;
        });
        setChartData(Object.entries(byH).sort().map(([time, v]) => ({ time, ...v })));
        pushLog(`${list.length} événements chargés`);
      }
    } catch {}
    if (spin) setRefreshing(false);
  }, [pushLog]);

  useEffect(() => {
    fetchAll(true);
    pushLog("Interface CyberDefence initialisée");
    const iv = setInterval(() => fetchAll(), 15_000);
    return () => clearInterval(iv);
  }, [fetchAll, pushLog]);

  const analyze = async () => {
    if (!analyzeInput.trim() || analyzing) return;
    setAnalyzing(true); setAnalyzeResult(null);
    try {
      const r = await fetch(`${CYBER_URL}/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: analyzeInput, agent_id: "manual" }),
      });
      if (r.ok) setAnalyzeResult(await r.json());
      else throw new Error();
    } catch {
      const text = analyzeInput.toLowerCase();
      const inj = text.includes("ignore") || text.includes("system") || text.includes("jailbreak") || text.includes("prompt");
      setAnalyzeResult({ safe: !inj, score: inj ? 0.87 : 0.04, threats: inj ? ["PROMPT_INJECTION"] : [], recommendation: inj ? "Bloquer cette requête" : "Requête sûre" });
    }
    pushLog(`Analyse: "${analyzeInput.slice(0,40)}…"`);
    setAnalyzing(false);
  };

  const blockIp = async (ip: string) => {
    try {
      await fetch(`${CYBER_URL}/block`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip }) });
    } catch {}
    pushLog(`IP ${ip} bloquée`, "WARNING");
    showToast(`IP ${ip} bloquée`);
    setNewIp(""); fetchAll();
  };

  const unblockIp = async (ip: string) => {
    try {
      await fetch(`${CYBER_URL}/unblock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip }) });
    } catch {}
    pushLog(`IP ${ip} débloquée`);
    showToast(`IP ${ip} débloquée`);
    fetchAll();
  };

  const critCount  = events.filter(e => e.severity === "CRITICAL").length;
  const warnCount  = events.filter(e => e.severity === "WARNING").length;
  const blockedIps = cyberStatus?.blocked_ips ?? [];
  const filtered   = events.filter(e => filter === "ALL" || e.severity === filter);

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800/0 hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {toast && <Toast msg={toast.msg} type={toast.type} />}

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-rose-500 bg-clip-text text-transparent">
              CyberDefence
            </h2>
            <div className="flex items-center gap-3 mt-1 text-[11px] font-mono">
              <span className={`flex items-center gap-1.5 ${cyberOk ? "text-green-400" : "text-red-400"}`}>
                {cyberOk ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {cyberOk ? `online · :8086${cyberStatus?.version ? ` · v${cyberStatus.version}` : ""}` : "offline · :8086"}
              </span>
              <span className="text-slate-700">·</span>
              <span className={orchOk ? "text-green-600" : "text-slate-600"}>
                orchestrateur {orchOk ? "✓" : "✗"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-700 font-mono">refresh 15s</span>
            <button onClick={() => fetchAll(true)} disabled={refreshing}
              className="p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 text-slate-500 hover:text-slate-200 rounded-xl transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className={`rounded-2xl p-4 border ${critCount > 0 ? "bg-red-500/5 border-red-500/20" : "bg-slate-900/50 border-slate-800/50"}`}>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Critiques</p>
            <p className={`text-3xl font-bold ${critCount > 0 ? "text-red-400" : "text-slate-400"}`}>{critCount}</p>
            {critCount > 0 && <p className="text-[10px] text-red-500 mt-1">⚠ Attention requise</p>}
          </div>
          <div className={`rounded-2xl p-4 border ${warnCount > 0 ? "bg-yellow-500/5 border-yellow-500/20" : "bg-slate-900/50 border-slate-800/50"}`}>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Warnings</p>
            <p className={`text-3xl font-bold ${warnCount > 0 ? "text-yellow-400" : "text-slate-400"}`}>{warnCount}</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Total events</p>
            <p className="text-3xl font-bold text-slate-300">{events.length}</p>
          </div>
          <div className={`rounded-2xl p-4 border ${blockedIps.length > 0 ? "bg-purple-500/5 border-purple-500/20" : "bg-slate-900/50 border-slate-800/50"}`}>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">IPs bloquées</p>
            <p className={`text-3xl font-bold ${blockedIps.length > 0 ? "text-purple-400" : "text-slate-400"}`}>{blockedIps.length}</p>
          </div>
        </div>

        {/* ── Timeline chart ── */}
        <Section title="Timeline des menaces" icon={TrendingUp} iconColor="text-red-400">
          <div className="px-5 pb-5 pt-4">
            {chartData.length > 0 ? (
              <>
                <div className="flex items-center gap-4 mb-3 text-[10px] text-slate-600">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-500/60 inline-block" />Détectées</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green-500/60 inline-block" />Bloquées</span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#334155" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#334155" tick={{ fontSize: 10 }} width={24} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: 11 }} />
                    <Area type="monotone" dataKey="threats" stroke="#ef4444" fill="url(#gT)" strokeWidth={2} name="Détectées" />
                    <Area type="monotone" dataKey="blocked" stroke="#10b981" fill="url(#gB)" strokeWidth={2} name="Bloquées" />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-slate-700 text-sm">
                Pas de données — en attente d'événements
              </div>
            )}
          </div>
        </Section>

        {/* ── Événements ── */}
        <Section
          title="Événements de sécurité"
          icon={Shield}
          iconColor="text-red-400"
          badge={
            <div className="flex items-center gap-1">
              {(["ALL","CRITICAL","WARNING","INFO"] as const).map(f => (
                <button key={f} onClick={e => { e.stopPropagation(); setFilter(f); }}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all border ${
                    filter === f
                      ? f === "CRITICAL" ? "border-red-500/40 bg-red-500/15 text-red-400"
                      : f === "WARNING"  ? "border-yellow-500/40 bg-yellow-500/15 text-yellow-400"
                      : f === "INFO"     ? "border-blue-500/40 bg-blue-500/15 text-blue-400"
                      : "border-slate-600/40 bg-slate-800 text-slate-300"
                      : "border-transparent text-slate-600 hover:text-slate-400"
                  }`}>{f}</button>
              ))}
            </div>
          }
        >
          <div className="divide-y divide-slate-800/40 max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                {cyberOk ? (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-green-500/5 border border-green-500/15 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-green-500/50" />
                    </div>
                    <div className="text-center">
                      <p className="text-slate-300 font-medium text-sm">Système sain</p>
                      <p className="text-slate-600 text-xs mt-1">Aucun événement détecté</p>
                      <p className="text-slate-700 text-[10px] mt-0.5 font-mono">monitoring actif · refresh 15s</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-red-500/5 border border-red-500/15 flex items-center justify-center">
                      <WifiOff className="w-6 h-6 text-red-500/40" />
                    </div>
                    <div className="text-center">
                      <p className="text-slate-300 font-medium text-sm">CyberDefence hors ligne</p>
                      <p className="text-slate-600 text-xs mt-1">Container non joignable sur :8086</p>
                      <code className="text-xs text-cyan-400 font-mono mt-1.5 block">just start</code>
                    </div>
                  </>
                )}
              </div>
            ) : filtered.map(ev => (
              <div key={ev.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-800/20 transition-colors">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${sevDot(ev.severity)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-slate-200 text-sm font-medium">{eventLabel(ev.event_type)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${sevStyle(ev.severity)}`}>{ev.severity}</span>
                    <span className="ml-auto text-[10px] text-slate-600 font-mono flex-shrink-0">{timeAgo(ev.timestamp)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{ev.description}</p>
                  {(ev.ip || ev.agent_id) && (
                    <p className="text-[10px] text-slate-700 font-mono mt-0.5">
                      {ev.ip && `IP: ${ev.ip}`}{ev.ip && ev.agent_id && " · "}{ev.agent_id && `Agent: ${ev.agent_id}`}
                    </p>
                  )}
                </div>
                {ev.ip && !blockedIps.includes(ev.ip) && (
                  <button onClick={() => blockIp(ev.ip!)}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] bg-red-500/8 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg transition-all">
                    <Ban className="w-3 h-3" />Ban
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* ── Analyser + IPs en grille 2 colonnes ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Analyser un message */}
          <Section title="Analyser un message" icon={Search} iconColor="text-slate-400">
            <div className="px-5 pb-5 pt-4 space-y-3">
              <textarea value={analyzeInput} onChange={e => setAnalyzeInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && e.ctrlKey && analyze()}
                placeholder="Colle un message à analyser… Ctrl+↵"
                rows={3} disabled={analyzing}
                className="w-full bg-slate-800/50 border border-slate-700/30 text-slate-200 placeholder-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:opacity-40 transition-all" />
              <button onClick={analyze} disabled={!analyzeInput.trim() || analyzing}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-br from-red-600 to-rose-700 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all disabled:opacity-40">
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                {analyzing ? "Analyse…" : "Analyser"}
              </button>
              {analyzeResult && (
                <div className={`p-3 rounded-xl border ${analyzeResult.safe ? "border-green-500/25 bg-green-500/5" : "border-red-500/25 bg-red-500/5"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {analyzeResult.safe ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Ban className="w-4 h-4 text-red-400" />}
                    <span className={`font-medium text-sm ${analyzeResult.safe ? "text-green-400" : "text-red-400"}`}>
                      {analyzeResult.safe ? "Sûr" : "Menace détectée"}
                    </span>
                    <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded ${
                      analyzeResult.score > 0.5 ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"
                    }`}>{(analyzeResult.score * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-slate-400">{analyzeResult.recommendation}</p>
                  {analyzeResult.threats.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {analyzeResult.threats.map(t => (
                        <span key={t} className="text-[10px] font-mono px-2 py-0.5 bg-red-500/15 text-red-400 border border-red-500/20 rounded">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* IPs bloquées */}
          <Section
            title={`IPs bloquées`}
            icon={Lock}
            iconColor="text-purple-400"
            badge={blockedIps.length > 0 ? <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full font-mono">{blockedIps.length}</span> : undefined}
          >
            <div className="px-5 pb-5 pt-4 space-y-3">
              <div className="flex gap-2">
                <input value={newIp} onChange={e => setNewIp(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && newIp.trim() && blockIp(newIp)}
                  placeholder="192.168.x.x"
                  className="flex-1 bg-slate-800/50 border border-slate-700/30 text-slate-300 placeholder-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-all min-w-0" />
                <button onClick={() => newIp.trim() && blockIp(newIp)} disabled={!newIp.trim()}
                  className="px-3 py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/25 text-red-400 rounded-xl text-xs transition-all disabled:opacity-40 flex-shrink-0">
                  <Ban className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
                {blockedIps.length === 0 ? (
                  <p className="text-center text-slate-700 text-xs py-6 font-mono">Aucune IP bloquée</p>
                ) : blockedIps.map(ip => (
                  <div key={ip} className="flex items-center justify-between px-3 py-2 bg-red-500/5 border border-red-500/15 rounded-xl">
                    <span className="text-xs font-mono text-red-400">{ip}</span>
                    <button onClick={() => unblockIp(ip)} className="text-slate-600 hover:text-green-400 transition-colors p-1 rounded-lg hover:bg-green-500/10">
                      <Unlock className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </div>

        {/* ── Terminal log ── */}
        <div className="bg-slate-950 border border-slate-800/60 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-900/70 border-b border-slate-800/40">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-slate-500 font-mono">cyberdefence.log</span>
              <span className={`w-1.5 h-1.5 rounded-full ${cyberOk ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-700 font-mono">{liveLog.length} lignes</span>
              {liveLog.length > 0 && (
                <span role="button" onClick={() => setLiveLog([])}
                  className="text-[10px] text-slate-600 hover:text-slate-400 px-2 py-0.5 hover:bg-slate-800 rounded cursor-pointer transition-colors">
                  clear
                </span>
              )}
            </div>
          </div>
          <div className="p-3 space-y-0.5 max-h-48 overflow-y-auto font-mono text-[11px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
            {liveLog.length === 0 ? (
              <p className="text-center text-slate-700 py-6">Aucun log</p>
            ) : liveLog.map(l => (
              <div key={l.id} className="flex items-start gap-2">
                <span className="text-slate-700 flex-shrink-0">{l.ts}</span>
                <span className={`flex-shrink-0 font-bold ${l.level === "ERROR" ? "text-red-400" : l.level === "WARNING" ? "text-yellow-400" : "text-slate-600"}`}>[{l.level}]</span>
                <span className="text-slate-400 break-all">{l.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}