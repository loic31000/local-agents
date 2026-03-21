import { Outlet, Link, useLocation } from "react-router";
import {
  LayoutDashboard, MessageSquare, Database,
  Shield, GraduationCap, Activity, Settings,
  Menu, X, BookOpen, Cpu, MemoryStick, Zap,
} from "lucide-react";
import { useState, useEffect } from "react";
import { AgentsProvider } from "../contexts/AgentsContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemMetrics {
  cpu_percent: number;
  ram_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  gpu_percent?: number;
  gpu_mem_percent?: number;
  gpu_name?: string;
}

// ─── Logo Nexus SVG ───────────────────────────────────────────────────────────

function NexusLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Nœud central */}
      <circle cx="16" cy="16" r="3.5" fill="white" opacity="0.95" />
      {/* Nœuds satellites */}
      <circle cx="16" cy="5"  r="2.5" fill="white" opacity="0.7" />
      <circle cx="16" cy="27" r="2.5" fill="white" opacity="0.7" />
      <circle cx="5"  cy="16" r="2.5" fill="white" opacity="0.7" />
      <circle cx="27" cy="16" r="2.5" fill="white" opacity="0.7" />
      <circle cx="8"  cy="8"  r="2"   fill="white" opacity="0.5" />
      <circle cx="24" cy="8"  r="2"   fill="white" opacity="0.5" />
      <circle cx="8"  cy="24" r="2"   fill="white" opacity="0.5" />
      <circle cx="24" cy="24" r="2"   fill="white" opacity="0.5" />
      {/* Connexions vers le centre */}
      <line x1="16" y1="12.5" x2="16" y2="7.5"  stroke="white" strokeWidth="1.2" opacity="0.5" />
      <line x1="16" y1="19.5" x2="16" y2="24.5" stroke="white" strokeWidth="1.2" opacity="0.5" />
      <line x1="12.5" y1="16" x2="7.5"  y2="16" stroke="white" strokeWidth="1.2" opacity="0.5" />
      <line x1="19.5" y1="16" x2="24.5" y2="16" stroke="white" strokeWidth="1.2" opacity="0.5" />
      <line x1="13.5" y1="13.5" x2="9.5"  y2="9.5"  stroke="white" strokeWidth="1" opacity="0.35" />
      <line x1="18.5" y1="13.5" x2="22.5" y2="9.5"  stroke="white" strokeWidth="1" opacity="0.35" />
      <line x1="13.5" y1="18.5" x2="9.5"  y2="22.5" stroke="white" strokeWidth="1" opacity="0.35" />
      <line x1="18.5" y1="18.5" x2="22.5" y2="22.5" stroke="white" strokeWidth="1" opacity="0.35" />
    </svg>
  );
}

// ─── Barre métrique mini ──────────────────────────────────────────────────────

function MetricBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-12 h-1 bg-slate-700/60 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

// ─── Full Height Paths ────────────────────────────────────────────────────────

const FULL_HEIGHT_PATHS = ["/chat"];

// ─── Root ─────────────────────────────────────────────────────────────────────

export function Root() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  const navigation = [
    { name: "Dashboard",     path: "/",              icon: LayoutDashboard },
    { name: "Chat",          path: "/chat",           icon: MessageSquare },
    { name: "Models",        path: "/models",         icon: Database },
    { name: "CyberDefence",  path: "/cyber",          icon: Shield },
    { name: "Training",      path: "/training",       icon: GraduationCap },
    { name: "Datasets",      path: "/datasets",       icon: BookOpen },
    { name: "Observability", path: "/observability",  icon: Activity },
    { name: "Settings",      path: "/settings",       icon: Settings },
  ];

  // ── Fetch métriques système ────────────────────────────────────────────────
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const r = await fetch("/api/metrics/system");
        if (r.ok) setMetrics(await r.json());
      } catch {}
    };
    fetchMetrics();
    const iv = setInterval(fetchMetrics, 3000);
    return () => clearInterval(iv);
  }, []);

  const isFullHeight = FULL_HEIGHT_PATHS.some(p => location.pathname.startsWith(p));

  const cpuColor  = (v: number) => v > 85 ? "bg-red-500"    : v > 60 ? "bg-yellow-500" : "bg-green-500";
  const ramColor  = (v: number) => v > 85 ? "bg-red-500"    : v > 70 ? "bg-yellow-500" : "bg-cyan-500";
  const gpuColor  = (v: number) => v > 90 ? "bg-red-500"    : v > 70 ? "bg-yellow-500" : "bg-purple-500";

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col">

      {/* ══════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center justify-between px-4 py-2.5">

          {/* Logo + Nom */}
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors lg:hidden">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/25 flex-shrink-0">
                <NexusLogo size={22} />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent leading-tight">
                  Nexus
                </h1>
                <p className="text-[10px] text-slate-600 leading-tight">Local AI Platform</p>
              </div>
            </div>
          </div>

          {/* ── Métriques système temps réel ── */}
          <div className="flex items-center gap-4">
            {metrics ? (
              <div className="hidden sm:flex items-center gap-4">
                {/* CPU */}
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-600 font-mono w-6">CPU</span>
                      <span className={`text-[10px] font-mono font-bold ${
                        metrics.cpu_percent > 85 ? "text-red-400" : metrics.cpu_percent > 60 ? "text-yellow-400" : "text-green-400"
                      }`}>{metrics.cpu_percent.toFixed(0)}%</span>
                    </div>
                    <MetricBar value={metrics.cpu_percent} color={cpuColor(metrics.cpu_percent)} />
                  </div>
                </div>

                {/* RAM */}
                <div className="flex items-center gap-2">
                  <MemoryStick className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-600 font-mono w-6">RAM</span>
                      <span className={`text-[10px] font-mono font-bold ${
                        metrics.ram_percent > 85 ? "text-red-400" : metrics.ram_percent > 70 ? "text-yellow-400" : "text-cyan-400"
                      }`}>{metrics.ram_used_gb.toFixed(1)}G</span>
                    </div>
                    <MetricBar value={metrics.ram_percent} color={ramColor(metrics.ram_percent)} />
                  </div>
                </div>

                {/* GPU (si disponible) */}
                {metrics.gpu_percent !== undefined && (
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-600 font-mono w-6">GPU</span>
                        <span className={`text-[10px] font-mono font-bold ${
                          metrics.gpu_percent > 90 ? "text-red-400" : metrics.gpu_percent > 70 ? "text-yellow-400" : "text-purple-400"
                        }`}>{metrics.gpu_percent.toFixed(0)}%</span>
                      </div>
                      <MetricBar value={metrics.gpu_percent} color={gpuColor(metrics.gpu_percent)} />
                    </div>
                  </div>
                )}

                <div className="w-px h-6 bg-slate-800" />
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-700 font-mono">
                <span className="animate-pulse">chargement métriques…</span>
                <div className="w-px h-6 bg-slate-800" />
              </div>
            )}

            {/* Statut Online */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-xl border border-slate-700/30">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-slate-300 font-medium">Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          BODY
      ══════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className={`
          flex-shrink-0 z-40 w-64
          bg-slate-900/50 backdrop-blur-md border-r border-slate-800
          transition-transform duration-300
          flex flex-col
          fixed inset-y-0 left-0 top-[53px]
          lg:static lg:translate-x-0 lg:top-auto lg:inset-y-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}>
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);
              return (
                <Link key={item.path} to={item.path}
                  onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-400 border border-cyan-500/20"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent"
                  }`}>
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Overlay mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <main className={`flex-1 min-w-0 overflow-hidden flex flex-col ${isFullHeight ? "" : "overflow-y-auto"}`}>
          <AgentsProvider>
            {isFullHeight ? (
              <Outlet />
            ) : (
              <div className="p-6 min-h-full">
                <Outlet />
              </div>
            )}
          </AgentsProvider>
        </main>
      </div>
    </div>
  );
}