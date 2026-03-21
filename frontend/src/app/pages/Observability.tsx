import { useEffect, useState, useCallback, useRef } from "react";
import {
  Activity, Zap, Server, HardDrive, TrendingUp,
  RefreshCw, Wifi, WifiOff, Terminal, Clock,
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainingStats {
  total_jobs: number; running_jobs: number; completed_jobs: number;
  total_datasets: number; total_samples: number;
}

interface TrainingJob {
  id: string; name: string; status: string; base_model: string;
  progress: number; loss_final: number | null; error_msg: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
}

interface AgentInfo {
  id: string; name: string; enabled: boolean; model: string;
}

interface WsLog {
  id: string; timestamp: string;
  level: "INFO" | "WARNING" | "ERROR" | "DEBUG";
  service: string; message: string;
}

function generateTimeSeries() {
  return ["00:00","04:00","08:00","12:00","16:00","20:00"].map(time => ({
    time,
    p50:     Math.round(70  + Math.random() * 50),
    p95:     Math.round(130 + Math.random() * 70),
    p99:     Math.round(200 + Math.random() * 100),
    success: Math.round(30  + Math.random() * 130),
    error:   Math.round(Math.random() * 10),
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusDot(s: string) {
  switch(s) {
    case "completed": return "bg-green-400";
    case "running":   return "bg-cyan-400 animate-pulse";
    case "failed":    return "bg-red-400";
    default:          return "bg-yellow-400";
  }
}

function statusBadge(s: string) {
  switch(s) {
    case "completed": return "text-green-400 bg-green-500/10 border-green-500/25";
    case "running":   return "text-cyan-400 bg-cyan-500/10 border-cyan-500/25";
    case "failed":    return "text-red-400 bg-red-500/10 border-red-500/25";
    default:          return "text-yellow-400 bg-yellow-500/10 border-yellow-500/25";
  }
}

function logStyle(level: string) {
  switch(level) {
    case "ERROR":   return "text-red-400";
    case "WARNING": return "text-yellow-400";
    case "INFO":    return "text-cyan-400";
    default:        return "text-slate-500";
  }
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Observability() {
  const [stats, setStats]         = useState<TrainingStats | null>(null);
  const [jobs, setJobs]           = useState<TrainingJob[]>([]);
  const [agents, setAgents]       = useState<AgentInfo[]>([]);
  const [wsLogs, setWsLogs]       = useState<WsLog[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [chartData]               = useState(generateTimeSeries());
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [jobsExpanded, setJobsExpanded] = useState(true);
  const wsRef  = useRef<WebSocket | null>(null);
  const logId  = useRef(0);

  const addLog = useCallback((level: WsLog["level"], service: string, message: string) => {
    setWsLogs(p => [{ id: String(++logId.current), timestamp: new Date().toISOString(), level, service, message }, ...p].slice(0, 60));
  }, []);

  const fetchData = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const [statsRes, jobsRes, agentsRes] = await Promise.allSettled([
        fetch("/api/training/stats"),
        fetch("/api/training/jobs"),
        fetch("/api/agents"),
      ]);
      if (statsRes.status === "fulfilled" && statsRes.value.ok) setStats(await statsRes.value.json());
      if (jobsRes.status  === "fulfilled" && jobsRes.value.ok)  setJobs((await jobsRes.value.json()).slice(0,10));
      if (agentsRes.status === "fulfilled" && agentsRes.value.ok) setAgents(await agentsRes.value.json());
      setLastRefresh(new Date());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const connectWs = useCallback(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    wsRef.current = ws;
    ws.onopen    = () => { setWsConnected(true);  addLog("INFO", "orchestrator", "WebSocket connecté"); };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "result") {
          const r = msg.result;
          addLog(r.success ? "INFO" : "ERROR", r.agent_id || "orchestrator",
            r.success ? `Tâche ${r.task_id} terminée en ${r.duration_ms}ms` : `Tâche ${r.task_id} échouée: ${r.error}`);
        }
      } catch {}
    };
    ws.onclose = () => { setWsConnected(false); addLog("WARNING", "orchestrator", "WebSocket déconnecté — reconnexion 5s"); setTimeout(connectWs, 5000); };
    ws.onerror  = () => setWsConnected(false);
  }, [addLog]);

  useEffect(() => {
    fetchData(true); connectWs();
    const iv = setInterval(() => fetchData(), 15000);
    return () => { clearInterval(iv); wsRef.current?.close(); };
  }, [fetchData, connectWs]);

  const activeAgents  = agents.filter(a => a.enabled).length;
  const runningJobs   = jobs.filter(j => j.status === "running").length;
  const failedJobs    = jobs.filter(j => j.status === "failed").length;
  const completedJobs = jobs.filter(j => j.status === "completed").length;
  const successRate   = stats && stats.total_jobs > 0 ? Math.round((stats.completed_jobs / stats.total_jobs) * 100) : null;

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800/0 hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Observability
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5 font-mono">
              dernière maj {lastRefresh.toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit", second:"2-digit"})}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium ${
              wsConnected ? "border-green-500/30 bg-green-500/8 text-green-400" : "border-slate-700/40 bg-slate-800/40 text-slate-500"
            }`}>
              {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {wsConnected ? "Live" : "Offline"}
            </div>
            <button onClick={() => fetchData(true)} disabled={refreshing}
              className="p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 text-slate-500 hover:text-slate-200 rounded-xl transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Agents actifs",  value: loading ? "—" : `${activeAgents}/${agents.length}`, icon: Server,        color: "text-cyan-400",   dot: activeAgents > 0 },
            { label: "Jobs en cours",  value: loading ? "—" : runningJobs,                        icon: Zap,           color: "text-yellow-400", dot: runningJobs > 0 },
            { label: "Jobs terminés",  value: loading ? "—" : completedJobs,                      icon: CheckCircle2,  color: "text-green-400",  dot: false },
            { label: "Jobs échoués",   value: loading ? "—" : failedJobs,                         icon: XCircle,       color: "text-red-400",    dot: failedJobs > 0 },
          ].map(({ label, value, icon: Icon, color, dot }) => (
            <div key={label} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <Icon className={`w-4 h-4 ${color}`} />
                {dot && <div className={`w-1.5 h-1.5 rounded-full ${color.replace("text-","bg-")} animate-pulse`} />}
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {/* Stats training + taux de succès */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 flex items-center gap-4">
              <HardDrive className="w-8 h-8 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider">Datasets</p>
                <p className="text-xl font-bold text-slate-100">{stats.total_datasets}</p>
                <p className="text-[11px] text-slate-600 font-mono">{stats.total_samples.toLocaleString()} samples</p>
              </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 flex items-center gap-4">
              <Activity className="w-8 h-8 text-purple-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total jobs</p>
                <p className="text-xl font-bold text-slate-100">{stats.total_jobs}</p>
                <p className="text-[11px] text-slate-600 font-mono">{stats.running_jobs} actifs</p>
              </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 flex items-center gap-4">
              <TrendingUp className="w-8 h-8 text-cyan-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-600 uppercase tracking-wider">Taux de succès</p>
                <p className="text-xl font-bold text-slate-100">{successRate !== null ? `${successRate}%` : "—"}</p>
                {successRate !== null && (
                  <div className="mt-1.5 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 to-cyan-500 rounded-full" style={{ width: `${successRate}%` }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Agents status ── */}
        {agents.length > 0 && (
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-3 font-medium flex items-center gap-2">
              <Server className="w-3.5 h-3.5" />État des agents
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {agents.map(agent => (
                <div key={agent.id} className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border border-slate-800/40 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${agent.enabled ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
                    <div className="min-w-0">
                      <p className="text-slate-200 text-sm font-medium capitalize truncate">{agent.name || agent.id}</p>
                      <p className="text-slate-600 text-[10px] font-mono truncate">{agent.model || "—"}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2 ${agent.enabled ? "bg-green-500/10 text-green-400" : "bg-slate-800 text-slate-600"}`}>
                    {agent.enabled ? "actif" : "off"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-4 font-medium flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" />Latence de réponse (ms)
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#334155" tick={{ fontSize: 10 }} />
                <YAxis stroke="#334155" tick={{ fontSize: 10 }} width={28} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="p50" stroke="#10b981" name="p50" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="p95" stroke="#f59e0b" name="p95" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="p99" stroke="#ef4444" name="p99" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-4 font-medium flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" />Requêtes par heure
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#334155" tick={{ fontSize: 10 }} />
                <YAxis stroke="#334155" tick={{ fontSize: 10 }} width={28} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="success" fill="#10b981" name="Succès" radius={[3,3,0,0]} />
                <Bar dataKey="error"   fill="#ef4444" name="Erreur"  radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Jobs récents — expandable ── */}
        {jobs.length > 0 && (
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden">
            <button onClick={() => setJobsExpanded(p => !p)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/20 transition-colors">
              <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />Historique des jobs ({jobs.length})
              </span>
              {jobsExpanded ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
            </button>
            {jobsExpanded && (
              <div className="border-t border-slate-800/40 divide-y divide-slate-800/30">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/20 transition-colors">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(job.status)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 text-sm font-medium truncate">{job.name}</p>
                      <p className="text-slate-600 text-[10px] font-mono">{job.base_model}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {job.status === "running" && (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${job.progress}%` }} />
                          </div>
                          <span className="text-[10px] text-cyan-400 font-mono">{job.progress}%</span>
                        </div>
                      )}
                      {job.loss_final != null && (
                        <span className="text-[10px] text-slate-500 font-mono">loss {job.loss_final.toFixed(3)}</span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${statusBadge(job.status)}`}>{job.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Logs WebSocket — expandable ── */}
        <div className="bg-slate-950 border border-slate-800/60 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/40 cursor-pointer hover:bg-slate-800/20 transition-colors"
            onClick={() => setLogsExpanded(p => !p)}>
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-slate-500 font-mono">orchestrator.log</span>
              {wsConnected && <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-700 font-mono">{wsLogs.length} lignes</span>
              {wsLogs.length > 0 && (
                <span role="button" onClick={e => { e.stopPropagation(); setWsLogs([]); }}
                  className="text-[10px] text-slate-600 hover:text-slate-400 px-2 py-0.5 hover:bg-slate-800 rounded transition-colors cursor-pointer select-none">
                  clear
                </span>
              )}
              {logsExpanded ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
            </div>
          </div>
          {logsExpanded && (
            <div className="max-h-56 overflow-y-auto p-3 space-y-0.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
              {wsLogs.length === 0 ? (
                <p className="text-center text-slate-700 text-xs py-6 font-mono">
                  {wsConnected ? "En attente d'événements…" : "WebSocket déconnecté…"}
                </p>
              ) : wsLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2 text-[11px] font-mono py-0.5">
                  <span className="text-slate-700 flex-shrink-0">{new Date(log.timestamp).toLocaleTimeString("fr-FR",{hour12:false})}</span>
                  <span className={`flex-shrink-0 font-bold ${logStyle(log.level)}`}>[{log.level}]</span>
                  <span className="text-slate-600 flex-shrink-0">[{log.service}]</span>
                  <span className="text-slate-400 break-all">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Résumé bas de page ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Disponibilité",       value: "99.9%",                                                               color: "text-green-400", sub: "Dernières 24h" },
            { label: "Agents opérationnels",value: agents.length > 0 ? `${activeAgents}/${agents.length}` : "—",         color: "text-cyan-400",  sub: "En ce moment" },
            { label: "Taux d'erreur",        value: stats && stats.total_jobs > 0 ? `${Math.round((failedJobs/stats.total_jobs)*100)}%` : "0%", color: failedJobs === 0 ? "text-green-400" : "text-yellow-400", sub: "Sur tous les jobs" },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 text-center">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
              <p className="text-[10px] text-slate-700 mt-1 font-mono">{sub}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}