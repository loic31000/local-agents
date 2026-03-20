import { useEffect, useState, useCallback } from "react";
import { Activity, Bot, Zap, Shield, TrendingUp, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  capabilities: string[];
  enabled: boolean;
}

// ─── Données simulées (en attendant les endpoints stats) ─────────────────────

const performanceData = [
  { time: "00:00", requests: 45 },
  { time: "04:00", requests: 32 },
  { time: "08:00", requests: 89 },
  { time: "12:00", requests: 156 },
  { time: "16:00", requests: 134 },
  { time: "20:00", requests: 98 },
];

const recentActivity = [
  { agent: "Coder", action: "Génération de code complétée", time: "2 min", status: "success" },
  { agent: "Vision", action: "Analyse d'image traitée", time: "5 min", status: "success" },
  { agent: "CyberDefence", action: "Prompt suspect détecté", time: "12 min", status: "warning" },
  { agent: "Files", action: "Opération de lecture fichier", time: "18 min", status: "success" },
  { agent: "Email", action: "Email envoyé avec succès", time: "25 min", status: "success" },
];

// ─── Composant ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const fetchAgents = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Agent[] = await res.json();
      setAgents(data);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError("Impossible de contacter l'orchestrateur (localhost:8081)");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Chargement initial + auto-refresh toutes les 30s
  useEffect(() => {
    fetchAgents();
    const interval = setInterval(() => fetchAgents(), 30_000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  // Stats dérivées des vraies données
  const activeAgents = agents.filter((a) => a.enabled).length;
  const totalAgents = agents.length;

  // Bar chart basé sur les vrais agents
  const agentUsageData = agents.map((a) => ({
    agent: a.name.charAt(0).toUpperCase() + a.name.slice(1),
    requests: Math.floor(50 + Math.random() * 400),
  }));

  const stats = [
    {
      name: "Total Requêtes",
      value: "12,847",
      change: "+12.5%",
      changePositive: true,
      icon: Activity,
      color: "from-cyan-500 to-blue-500",
    },
    {
      name: "Agents Actifs",
      value: loading ? "…" : `${activeAgents}/${totalAgents}`,
      change: loading
        ? ""
        : activeAgents === totalAgents
        ? "Tous en ligne ✓"
        : `${totalAgents - activeAgents} hors ligne`,
      changePositive: activeAgents === totalAgents,
      icon: Bot,
      color: "from-green-500 to-emerald-500",
    },
    {
      name: "Latence Moy.",
      value: "142ms",
      change: "-8.3%",
      changePositive: true,
      icon: Zap,
      color: "from-yellow-500 to-orange-500",
    },
    {
      name: "Événements Sécu.",
      value: "23",
      change: "+3 aujourd'hui",
      changePositive: false,
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
        </div>
        <button
          onClick={() => fetchAgents(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded-lg text-sm transition-all disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* Bannière d'erreur */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-900/30 border border-red-800/50 rounded-xl text-red-300 text-sm">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error} — les données affichées sont en partie statiques.
        </div>
      )}

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
                  <p className="text-3xl font-bold text-slate-100 mt-2">
                    {loading && stat.name === "Agents Actifs" ? (
                      <span className="inline-block w-16 h-8 bg-slate-800 animate-pulse rounded" />
                    ) : (
                      stat.value
                    )}
                  </p>
                  {stat.change && (
                    <p className={`text-sm mt-2 ${stat.changePositive ? "text-green-400" : "text-red-400"}`}>
                      {stat.change}
                    </p>
                  )}
                </div>
                <div
                  className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center opacity-80`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Agents live */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            Agents — données en direct
          </h3>
          <span className="text-xs text-slate-500 font-mono">GET /api/agents</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-800/50 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-slate-500 text-sm italic">Données indisponibles — orchestrateur hors ligne</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-800/50 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      agent.enabled ? "bg-green-400 animate-pulse" : "bg-red-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-200 capitalize truncate">{agent.name}</p>
                    <p className="text-xs text-slate-500 font-mono truncate">{agent.model}</p>
                  </div>
                </div>
                {agent.enabled ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
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
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
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
            {loading ? "Chargement..." : `${agents.length} agents chargés depuis l'API`}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={agentUsageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="agent" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="requests" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activité récente */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          Activité récente
        </h3>
        <div className="space-y-2">
          {recentActivity.map((activity, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-all"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    activity.status === "success" ? "bg-green-400" : "bg-yellow-400"
                  }`}
                />
                <div>
                  <p className="font-medium text-slate-200 text-sm">{activity.agent}</p>
                  <p className="text-xs text-slate-400">{activity.action}</p>
                </div>
              </div>
              <span className="text-xs text-slate-500 flex-shrink-0">il y a {activity.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}