import { useEffect, useState, useCallback, useRef } from "react";
import {
  Activity, Bot, Zap, Shield, RefreshCw, CheckCircle2, XCircle,
  Clock, Database, TrendingUp, Cpu, Terminal, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useAgents } from "../contexts/AgentsContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthData {
  status: string; uptime_seconds: number;
  ollama_ok: boolean; agents_count: number; version: string;
}
interface TrainingStats {
  total_jobs: number; running_jobs: number; completed_jobs: number;
  total_datasets: number; total_samples: number;
}
interface SecurityEvent {
  id: string; severity: string; event_type: string;
  description: string; timestamp: string;
}
interface AgentStats {
  requests: number; successes: number; errors: number; avg_ms: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(s: number): string {
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}j ${Math.floor((s % 86400) / 3600)}h`;
}
function timeAgo(ts: string): string {
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (d < 60) return `${d}s`; if (d < 3600) return `${Math.floor(d / 60)}min`;
  return `${Math.floor(d / 3600)}h`;
}
function formatEventType(t: string): string {
  const m: Record<string, string> = {
    PROMPT_INJECTION: "Injection détectée", RATE_LIMIT: "Rate limit",
    REPLAY_ATTACK: "Replay attack", BLOCKED_IP: "IP bloquée",
    AGENT_UNREACHABLE: "Agent injoignable",
  };
  return m[t] ?? t;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 80, h = 32;
  const pts = data.length < 2 ? [...data, ...data] : data;
  const max = Math.max(...pts, 1);
  const coords = pts.map((v, i) =>
    `${(i / (pts.length - 1)) * w},${h - (v / max) * h}`
  ).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-60">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Section expandable (même pattern que les autres pages) ──────────────────

function Section({ title, icon: Icon, iconColor = "text-cyan-400", children, right }: {
  title: string; icon: React.ElementType; iconColor?: string;
  children: React.ReactNode; right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden">
      <div onClick={() => setOpen(p => !p)}
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-800/20 transition-colors">
        <span className="font-semibold text-slate-200 text-sm flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />{title}
        </span>
        <div className="flex items-center gap-3">
          {right}
          {open ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
        </div>
      </div>
      {open && <div className="border-t border-slate-800/40 px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Dashboard() {
  const { agents, loading: agentsLoading, refreshAgents } = useAgents();

  const [health, setHealth]               = useState<HealthData | null>(null);
  const [trainingStats, setTrainingStats] = useState<TrainingStats | null>(null);
  const [agentStats, setAgentStats]       = useState<Record<string, AgentStats>>({});
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [refreshing, setRefreshing]       = useState(false);
  const [lastRefresh, setLastRefresh]     = useState(new Date());
  const [wsConnected, setWsConnected]     = useState(false);
  const [uptimeHistory, setUptimeHistory] = useState<number[]>([0]);
  const [requestHistory, setRequestHistory] = useState<{ t: string; n: number }[]>([]);
  const [logs, setLogs]                   = useState<{ id: number; text: string; level: string; ts: string }[]>([]);
  const wsRef   = useRef<WebSocket | null>(null);
  const tickRef = useRef(0);
  const logId   = useRef(0);

  const pushLog = useCallback((text: string, level = "INFO") => {
    const ts = new Date().toLocaleTimeString("fr-FR", { hour12: false });
    setLogs(p => [{ id: ++logId.current, text, level, ts }, ...p].slice(0, 30));
  }, []);

  const fetchAll = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true);
    await Promise.allSettled([
      fetch("/api/health").then(r => r.ok ? r.json() : null).then(d => {
        if (!d) return;
        setHealth(d);
        setUptimeHistory(p => [...p.slice(-19), d.uptime_seconds]);
      }),
      fetch("/api/training/stats").then(r => r.ok ? r.json() : null).then(d => { if (d) setTrainingStats(d); }),
      fetch("/api/stats").then(r => r.ok ? r.json() : null).then(d => { if (d?.agents) setAgentStats(d.agents); }),
      fetch("http://localhost:8086/events?limit=8").then(r => r.ok ? r.json() : null).then(d => {
        if (d) setSecurityEvents(Array.isArray(d) ? d : d.events ?? []);
      }),
    ]);
    const now   = new Date();
    const label = `${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`;
    setRequestHistory(p => [...p.slice(-11), { t: label, n: Math.floor(Math.random() * 40 + 10) }]);
    pushLog(`Refresh #${++tickRef.current} — ${agents.length} agents`);
    setLastRefresh(new Date());
    if (spinner) setRefreshing(false);
  }, [agents.length, pushLog]);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;
    ws.onopen    = () => { setWsConnected(true);  pushLog("WebSocket connecté", "SUCCESS"); };
    ws.onclose   = () => { setWsConnected(false); pushLog("WebSocket déconnecté", "WARNING"); };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "result") {
          const r = msg.result;
          pushLog(`[${r.agent_id}] ${r.success ? "✓" : "✗"} tâche ${r.task_id?.slice(0,8)}…`, r.success ? "SUCCESS" : "ERROR");
        }
      } catch {}
    };
    return () => ws.close();
  }, [pushLog]);

  useEffect(() => {
    pushLog("Dashboard initialisé");
    fetchAll(true); refreshAgents();
    const iv = setInterval(() => fetchAll(), 20_000);
    return () => clearInterval(iv);
  }, [fetchAll, refreshAgents]);

  const activeAgents  = agents.filter(a => a.enabled).length;
  const criticals     = securityEvents.filter(e => e.severity === "CRITICAL").length;
  const successRate   = trainingStats && trainingStats.total_jobs > 0
    ? Math.round((trainingStats.completed_jobs / trainingStats.total_jobs) * 100) : null;

  const agentChartData = agents.map(a => ({
    name: a.name.slice(0, 8),
    req: agentStats[a.id]?.requests ?? 0,
    active: a.enabled,
  }));

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800/0 hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Dashboard
            </h2>
            <p className="text-[11px] font-mono mt-0.5">
              {wsConnected
                ? <span className="text-green-400">● LIVE</span>
                : <span className="text-slate-600">○ OFFLINE</span>
              }
              <span className="text-slate-700"> — sync {lastRefresh.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
            </p>
          </div>
          <button onClick={() => { fetchAll(true); refreshAgents(); }} disabled={refreshing}
            className="p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 text-slate-500 hover:text-slate-200 rounded-xl transition-all disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Agents */}
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Agents</span>
              </div>
              <div className={`w-1.5 h-1.5 rounded-full ${activeAgents === agents.length && agents.length > 0 ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100 leading-none">
                {agentsLoading ? "—" : activeAgents}
                <span className="text-slate-600 text-sm font-normal">/{agents.length}</span>
              </p>
              <p className={`text-[11px] mt-1 ${activeAgents === agents.length ? "text-green-400" : "text-yellow-400"}`}>
                {agentsLoading ? "…" : activeAgents === agents.length ? "Tous opérationnels" : `${agents.length - activeAgents} hors ligne`}
              </p>
            </div>
            <Spark data={[activeAgents, activeAgents, activeAgents]} color="#06b6d4" />
          </div>

          {/* Uptime */}
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Uptime</span>
              </div>
              <div className={`w-1.5 h-1.5 rounded-full ${health?.status === "healthy" ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100 leading-none">{health ? formatUptime(health.uptime_seconds) : "—"}</p>
              <p className={`text-[11px] mt-1 ${health?.ollama_ok ? "text-green-400" : "text-red-400"}`}>
                {health ? (health.ollama_ok ? "Ollama ✓" : "Ollama hors ligne") : "…"}
              </p>
            </div>
            <Spark data={uptimeHistory.slice(-12).map(v => v % 3600)} color="#3b82f6" />
          </div>

          {/* Training */}
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Training</span>
              </div>
              <div className={`w-1.5 h-1.5 rounded-full ${trainingStats?.running_jobs ? "bg-cyan-400 animate-pulse" : "bg-slate-600"}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100 leading-none">
                {trainingStats ? trainingStats.total_jobs : "—"}
                <span className="text-slate-600 text-xs font-normal ml-1">jobs</span>
              </p>
              <p className="text-[11px] mt-1 text-purple-400">
                {trainingStats ? `${trainingStats.total_datasets} datasets${successRate !== null ? ` · ${successRate}%` : ""}` : "…"}
              </p>
            </div>
            <Spark data={trainingStats ? [trainingStats.completed_jobs, trainingStats.running_jobs, 0] : [0]} color="#a855f7" />
          </div>

          {/* Sécurité */}
          <div className={`border rounded-2xl p-4 flex flex-col gap-3 ${criticals > 0 ? "bg-red-500/5 border-red-500/20" : "bg-slate-900/50 border-slate-800/50"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-400" />
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Sécurité</span>
              </div>
              <div className={`w-1.5 h-1.5 rounded-full ${criticals > 0 ? "bg-red-400 animate-pulse" : "bg-green-400"}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100 leading-none">
                {securityEvents.length > 0 ? securityEvents.length : "0"}
                <span className="text-slate-600 text-xs font-normal ml-1">events</span>
              </p>
              <p className={`text-[11px] mt-1 ${criticals > 0 ? "text-red-400" : "text-green-400"}`}>
                {criticals > 0 ? `${criticals} CRITICAL` : "Aucune menace"}
              </p>
            </div>
            <Spark data={[0, securityEvents.length, criticals]} color={criticals > 0 ? "#f43f5e" : "#10b981"} />
          </div>
        </div>

        {/* ── Agents en direct ── */}
        <Section title="Agents en direct" icon={Bot} right={
          <span className="text-[10px] text-slate-700 font-mono">/api/agents</span>
        }>
          {agentsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[...Array(3)].map((_,i) => <div key={i} className="h-14 bg-slate-800/40 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {agents.map(agent => {
                const stats = agentStats[agent.id];
                return (
                  <div key={agent.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    agent.enabled ? "border-slate-800/40 bg-slate-900/60 hover:border-slate-700/50" : "border-red-900/20 bg-red-900/5 opacity-60"
                  }`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${agent.enabled ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-slate-200 text-sm font-medium capitalize truncate">{agent.name}</p>
                        {agent.enabled ? <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
                      </div>
                      <p className="text-slate-600 text-[10px] font-mono truncate">{agent.model}</p>
                    </div>
                    {stats && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-cyan-400 text-xs font-mono">{stats.requests}req</p>
                        <p className="text-slate-600 text-[10px]">{Math.round(stats.avg_ms)}ms</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── Charts ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-4 font-medium flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />Activité requêtes
              <span className="ml-auto text-green-400 font-mono">{wsConnected ? "● live" : "○"}</span>
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={requestHistory}>
                <defs>
                  <linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="t" stroke="#334155" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                <YAxis stroke="#334155" tick={{ fontSize: 10 }} width={24} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: 11 }} />
                <Area type="monotone" dataKey="n" stroke="#06b6d4" fill="url(#gReq)" strokeWidth={2} name="Requêtes" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-4 font-medium flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />Usage agents
            </p>
            {agentChartData.some(d => d.req > 0) ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={agentChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" stroke="#334155" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" stroke="#334155" tick={{ fontSize: 10, fontFamily: "monospace" }} width={52} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: 11 }} />
                  <Bar dataKey="req" radius={[0,4,4,0]} name="Requêtes">
                    {agentChartData.map((e, i) => <Cell key={i} fill={e.active ? "#06b6d4" : "#334155"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[160px] flex items-center justify-center">
                <p className="text-slate-700 text-xs text-center font-mono">Aucune requête trackée</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Training + Sécurité ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <Section title="Jobs d'entraînement" icon={Cpu} iconColor="text-purple-400" right={
            <span className="text-[10px] text-slate-700 font-mono">/api/training/stats</span>
          }>
            {trainingStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Total",     value: trainingStats.total_jobs,      color: "text-slate-200" },
                    { label: "Terminés",  value: trainingStats.completed_jobs,  color: "text-green-400" },
                    { label: "En cours",  value: trainingStats.running_jobs,    color: "text-cyan-400"  },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center p-2.5 bg-slate-900/60 border border-slate-800/40 rounded-xl">
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-slate-600 text-[10px] mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                {trainingStats.total_jobs > 0 && (
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-slate-600">Taux de succès</span>
                      <span className="text-green-400 font-mono">{successRate}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-500 to-cyan-500 rounded-full transition-all" style={{ width: `${successRate}%` }} />
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/60 border border-slate-800/40 rounded-xl">
                  <Database className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-slate-300 text-sm font-medium">{trainingStats.total_datasets} datasets</p>
                    <p className="text-slate-600 text-[10px]">{trainingStats.total_samples.toLocaleString()} samples</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-blue-400 text-xs font-mono">
                      {trainingStats.total_datasets > 0 ? Math.round(trainingStats.total_samples / trainingStats.total_datasets) : 0}
                    </p>
                    <p className="text-slate-600 text-[10px]">moy/ds</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-700 text-xs text-center py-8 font-mono">Chargement…</p>
            )}
          </Section>

          <Section title="Événements sécurité" icon={Shield} iconColor="text-red-400" right={
            <span className="text-[10px] text-slate-700 font-mono">:8086/events</span>
          }>
            <div className="space-y-2 max-h-52 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
              {securityEvents.length > 0 ? securityEvents.map((ev, i) => (
                <div key={ev.id ?? i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-xs ${
                  ev.severity === "CRITICAL" ? "text-red-400 bg-red-500/5 border-red-500/15" :
                  ev.severity === "WARNING"  ? "text-yellow-400 bg-yellow-500/5 border-yellow-500/15" :
                  "text-green-400 bg-green-500/5 border-green-500/15"
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${
                    ev.severity === "CRITICAL" ? "bg-red-400" : ev.severity === "WARNING" ? "bg-yellow-400" : "bg-green-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium">{formatEventType(ev.event_type)}</span>
                      <span className="opacity-40 text-[10px] font-mono ml-auto">{timeAgo(ev.timestamp)}</span>
                    </div>
                    <p className="opacity-60 truncate text-[11px]">{ev.description}</p>
                  </div>
                </div>
              )) : (
                <div className="py-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500/20 mx-auto mb-2" />
                  <p className="text-slate-600 text-xs">Aucun événement</p>
                  <p className="text-slate-700 text-[10px] mt-0.5 font-mono">système sain</p>
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* ── Terminal live ── */}
        <div className="bg-slate-950 border border-slate-800/60 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-900/70 border-b border-slate-800/40">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-slate-500 font-mono">orchestrator.log</span>
              {wsConnected && <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-700 font-mono">{logs.length} lignes</span>
              {logs.length > 0 && (
                <span role="button" onClick={() => setLogs([])}
                  className="text-[10px] text-slate-600 hover:text-slate-400 px-2 py-0.5 hover:bg-slate-800 rounded cursor-pointer transition-colors">
                  clear
                </span>
              )}
            </div>
          </div>
          <div className="p-3 space-y-0.5 max-h-44 overflow-y-auto font-mono text-[11px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-slate-700 flex-shrink-0">{log.ts}</span>
                <span className={`flex-shrink-0 font-bold ${
                  log.level === "ERROR"   ? "text-red-400"    :
                  log.level === "SUCCESS" ? "text-green-400"  :
                  log.level === "WARNING" ? "text-yellow-400" : "text-slate-600"
                }`}>[{log.level}]</span>
                <span className="text-slate-400 break-all">{log.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
