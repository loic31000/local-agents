import { useEffect, useState, useCallback } from "react";
import { Activity, Bot, Zap, Shield, TrendingUp, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useAgents } from "../contexts/AgentsContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthData {
  status: string;
  uptime_seconds: number;
  ollama_ok: boolean;
  agents_count: number;
  version: string;
}

interface AgentStats {
  requests: number;
  successes: number;
  errors: number;
  avg_ms: number;
}

interface SecurityEvent {
  id: string;
  severity: string;
  event_type: string;
  description: string;
  timestamp: string;
  agent_id?: string;
}

// ─── Données simulées pour les graphiques ─────────────────────────────────────

const performanceData = [
  { time: "00:00", requests: 45 },
  { time: "04:00", requests: 32 },
  { time: "08:00", requests: 89 },
  { time: "12:00", requests: 156 },
  { time: "16:00", requests: 134 },
  { time: "20:00", requests: 98 },
];

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86400)}j ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatEventType(type: string): string {
  const labels: Record<string, string> = {
    PROMPT_INJECTION: "Injection détectée",
    RATE_LIMIT: "Rate limit atteint",
    REPLAY_ATTACK: "Replay attack",
    BLOCKED_IP: "IP bloquée",
    IP_BLOCKED: "IP bloquée manuellement",
    AGENT_UNREACHABLE: "Agent injoignable",
    ORCHESTRATOR_DOWN: "Orchestrateur en erreur",
  };
  return labels[type] ?? type;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function Dashboard() {
  // ← Agents depuis le contexte global (plus de fetch local)
  const { agents, loading: agentsLoading, refreshAgents } = useAgents();

  const [health, setHealth] = useState<HealthData | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch health + events CyberDefence
  const fetchDashboardData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      // Health orchestrateur
      const healthRes = await fetch("/api/health");
      if (healthRes.ok) {
        setHealth(await healthRes.json());
      }
    } catch { /* orchestrateur hors ligne */ }

    try {
      // Stats requêtes par agent
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
        const data = await statsRes.json();
        setAgentStats(data.agents ?? {});
      }
    } catch { /* stats non disponibles */ }

    try {
      const eventsRes = await fetch("http://localhost:8086/events?limit=5");
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setSecurityEvents(Array.isArray(data) ? data : data.events ?? []);
      }
    } catch { /* cyberdefence hors ligne */ }

    setLastRefresh(new Date());
    setRefreshing(false);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDashboardData(), refreshAgents()]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => fetchDashboardData(), 30_000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const [agentStats, setAgentStats] = useState<Record<string, AgentStats>>({});

  // Stats dérivées
  const activeAgents = agents.filter((a) => a.enabled).length;
  const totalAgents = agents.length;

  // Graphique basé sur les vraies stats
  const agentUsageData = agents.map((a) => ({
    agent: a.name.charAt(0).toUpperCase() + a.name.slice(1),
    requests: agentStats[a.id]?.requests ?? 0,
    avg_ms: agentStats[a.id]?.avg_ms ?? 0,
  }));

  const criticalCount = securityEvents.filter(e => e.severity === "CRITICAL").length;

  const stats = [
    {
      name: "Agents Actifs",
      value: agentsLoading ? "…" : `${activeAgents}/${totalAgents}`,
      change: agentsLoading ? "" : activeAgents === totalAgents ? "Tous en ligne ✓" : `${totalAgents - activeAgents} hors ligne`,
      changePositive: activeAgents === totalAgents,
      icon: Bot,
      color: "from-green-500 to-emerald-500",
    },
    {
      name: "Uptime",
      value: health ? formatUptime(health.uptime_seconds) : "—",
      change: health ? (health.ollama_ok ? "Ollama OK ✓" : "Ollama hors ligne") : "Chargement...",
      changePositive: health?.ollama_ok ?? false,
      icon: Clock,
      color: "from-cyan-500 to-blue-500",
    },
    {
      name: "Statut",
      value: health ? (health.status === "healthy" ? "OK" : "Dégradé") : "—",
      change: health ? `v${health.version}` : "",
      changePositive: health?.status === "healthy",
      icon: Zap,
      color: "from-yellow-500 to-orange-500",
    },
    {
      name: "Événements Sécu.",
      value: securityEvents.length > 0 ? securityEvents.length : "—",
      change: criticalCount > 0 ? `${criticalCount} CRITICAL` : "Aucun critique",
      changePositive: criticalCount === 0,
      icon: Shield,
      color: "from-red-500 to-pink-500",
    },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-1">
            Dashboard
          </h2>
          <p className="text-xs text-slate-500">
            Dernière mise à jour : {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded-lg text-sm transition-all disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-sm">{stat.name}</p>
                  <p className="text-3xl font-bold text-slate-100 mt-2">{stat.value}</p>
                  {stat.change && (
                    <p className={`text-sm mt-2 ${stat.changePositive ? "text-green-400" : "text-red-400"}`}>
                      {stat.change}
                    </p>
                  )}
                </div>
                <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center opacity-80`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Agents en direct */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            Agents — données en direct
          </h3>
          <span className="text-xs text-slate-500 font-mono">GET /api/agents</span>
        </div>

        {agentsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-800/50 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-800/50 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${agent.enabled ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-200 capitalize truncate">{agent.name}</p>
                    <p className="text-xs text-slate-500 font-mono truncate">{agent.model}</p>
                  </div>
                </div>
                {agent.enabled
                  ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Requêtes / heure
          </h3>
          <p className="text-xs text-slate-500 mb-4">Simulé — endpoint /api/stats à venir</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={performanceData}>
              <defs>
                <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }} />
              <Area type="monotone" dataKey="requests" stroke="#06b6d4" fillOpacity={1} fill="url(#colorReq)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            Usage par agent
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            {agentsLoading ? "Chargement..." : `${agents.length} agents — données réelles`}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={agentUsageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="agent" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }} />
              <Bar dataKey="requests" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activité récente — vraies données CyberDefence */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Activité récente
          </h3>
          <span className="text-xs text-slate-500 font-mono">GET :8086/events</span>
        </div>

        {securityEvents.length === 0 ? (
          <div className="space-y-2">
            {/* Fallback statique si CyberDefence hors ligne */}
            {[
              { agent: "Coder", action: "Génération de code complétée", time: "2 min", status: "success" },
              { agent: "CyberDefence", action: "Monitoring actif", time: "15 min", status: "success" },
              { agent: "Files", action: "Opération fichier", time: "20 min", status: "success" },
            ].map((activity, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-200 text-sm">{activity.agent}</p>
                    <p className="text-xs text-slate-400">{activity.action}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">il y a {activity.time}</span>
              </div>
            ))}
            <p className="text-xs text-slate-600 text-center pt-1">CyberDefence hors ligne — données statiques</p>
          </div>
        ) : (
          <div className="space-y-2">
            {securityEvents.map((event, index) => (
              <div key={event.id ?? index} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-all">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    event.severity === "CRITICAL" ? "bg-red-400" :
                    event.severity === "WARNING" ? "bg-yellow-400" : "bg-green-400"
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-200 text-sm">{formatEventType(event.event_type)}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                        event.severity === "CRITICAL" ? "bg-red-500/20 text-red-400" :
                        event.severity === "WARNING" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-green-500/20 text-green-400"
                      }`}>
                        {event.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate max-w-xs">{event.description}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">il y a {timeAgo(event.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}