import { useState, useEffect, useCallback } from "react";
import {
  Bell, Shield, Database, Bot, RefreshCw, Save,
  CheckCircle2, AlertCircle, Cpu, Globe, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackendInfo { backend: string; available: string[]; }
interface AgentInfo   { id: string; name: string; enabled: boolean; model: string; description: string; }
interface OllamaModel { name: string; model: string; details?: { parameter_size?: string; family?: string }; }

interface LocalSettings {
  notifications: { securityAlerts: boolean; agentStatus: boolean; trainingJobs: boolean; systemUpdates: boolean; };
  security:      { rateLimiting: boolean; promptInjectionDetection: boolean; auditLogging: boolean; };
  system:        { contextMemoryLimit: number; requestTimeout: number; maxConcurrentRequests: number; defaultBackend: string; };
}

const DEFAULT_SETTINGS: LocalSettings = {
  notifications: { securityAlerts: true, agentStatus: true, trainingJobs: true, systemUpdates: false },
  security:      { rateLimiting: true, promptInjectionDetection: true, auditLogging: true },
  system:        { contextMemoryLimit: 10, requestTimeout: 30, maxConcurrentRequests: 5, defaultBackend: "ollama" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-cyan-500" : "bg-slate-700"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-6" : ""}`} />
    </button>
  );
}

function Toast({ message, type }: { message: string; type: "success"|"error" }) {
  return (
    <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium backdrop-blur-sm ${
      type === "success" ? "bg-green-900/80 border-green-700/50 text-green-200" : "bg-red-900/80 border-red-700/50 text-red-200"
    }`}>
      {type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}

// ─── Section expandable ───────────────────────────────────────────────────────

function Section({ icon: Icon, title, children, defaultOpen = true }: {
  icon: React.ElementType; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/20 transition-colors">
        <span className="font-semibold text-slate-200 text-sm flex items-center gap-2">
          <Icon className="w-4 h-4 text-cyan-400" />{title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
      </button>
      {open && <div className="border-t border-slate-800/40 px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Settings() {
  const [backendInfo, setBackendInfo] = useState<BackendInfo | null>(null);
  const [agents, setAgents]           = useState<AgentInfo[]>([]);
  const [models, setModels]           = useState<OllamaModel[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [dirty, setDirty]             = useState(false);
  const [toast, setToast]             = useState<{ message: string; type: "success"|"error" } | null>(null);

  const [settings, setSettings] = useState<LocalSettings>(() => {
    try {
      const s = localStorage.getItem("jarvis_settings");
      return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  const fetchData = useCallback(async (spin = false) => {
    if (spin) setLoading(true);
    try {
      const [backendRes, agentsRes, modelsRes] = await Promise.allSettled([
        fetch("/api/backend"), fetch("/api/agents"), fetch("/api/ollama/models"),
      ]);
      if (backendRes.status === "fulfilled" && backendRes.value.ok) setBackendInfo(await backendRes.value.json());
      if (agentsRes.status  === "fulfilled" && agentsRes.value.ok)  setAgents(await agentsRes.value.json());
      if (modelsRes.status  === "fulfilled" && modelsRes.value.ok)  { const d = await modelsRes.value.json(); setModels(d.models || []); }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(true); }, [fetchData]);

  function updateSettings(path: string[], value: unknown) {
    setSettings(prev => {
      const next = structuredClone(prev);
      let obj: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]] as Record<string, unknown>;
      obj[path[path.length - 1]] = value;
      return next;
    });
    setDirty(true);
  }

  function showToast(message: string, type: "success"|"error" = "success") {
    setToast({ message, type }); setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      localStorage.setItem("jarvis_settings", JSON.stringify(settings));
      if (backendInfo && settings.system.defaultBackend !== backendInfo.backend) {
        const res = await fetch("/api/backend", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backend: settings.system.defaultBackend }),
        });
        if (res.ok) setBackendInfo(await res.json());
      }
      setDirty(false); showToast("Paramètres sauvegardés ✓");
    } catch { showToast("Erreur lors de la sauvegarde", "error"); }
    finally { setSaving(false); }
  }

  async function toggleAgent(agent: AgentInfo) {
    try {
      const res = await fetch(`/api/agents/${agent.id}/${agent.enabled ? "stop" : "start"}`, { method: "POST" });
      if (res.ok) {
        setAgents(p => p.map(a => a.id === agent.id ? { ...a, enabled: !a.enabled } : a));
        showToast(`Agent "${agent.name}" ${agent.enabled ? "désactivé" : "activé"} ✓`);
      }
    } catch { showToast("Impossible de modifier l'agent", "error"); }
  }

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800/0 hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {toast && <Toast message={toast.message} type={toast.type} />}

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Settings
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">Configuration de la plateforme JARVIS</p>
          </div>
          <button onClick={() => fetchData(true)} disabled={loading}
            className="p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 text-slate-500 hover:text-slate-200 rounded-xl transition-all disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── Backend LLM ── */}
        <Section icon={Cpu} title="Backend LLM">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-medium">Backend actif</p>
              <div className="flex flex-wrap gap-2">
                {(backendInfo?.available ?? ["ollama", "mock"]).map(b => (
                  <button key={b} onClick={() => updateSettings(["system","defaultBackend"], b)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                      settings.system.defaultBackend === b
                        ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                        : "border-slate-700/30 bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:border-slate-600"
                    }`}>
                    <span className="capitalize">{b}</span>
                    {backendInfo?.backend === b && <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-md">actif</span>}
                  </button>
                ))}
              </div>
            </div>
            {models.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-medium">Modèles Ollama ({models.length})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {models.map(m => (
                    <div key={m.name} className="flex items-center gap-2 px-3 py-2 bg-slate-900/60 border border-slate-800/40 rounded-xl">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-slate-300 text-xs font-mono truncate">{m.name}</p>
                        {m.details?.parameter_size && <p className="text-slate-600 text-[10px]">{m.details.parameter_size}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ── Agents ── */}
        {agents.length > 0 && (
          <Section icon={Bot} title="Gestion des agents">
            <div className="space-y-2">
              {agents.map(agent => (
                <div key={agent.id} className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border border-slate-800/40 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${agent.enabled ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
                    <div className="min-w-0">
                      <p className="text-slate-200 font-medium text-sm capitalize truncate">{agent.name || agent.id}</p>
                      <p className="text-slate-600 text-[10px] font-mono">{agent.model || "—"}</p>
                    </div>
                  </div>
                  <Toggle checked={agent.enabled} onChange={() => toggleAgent(agent)} />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-700 mt-3">Les changements d'état sont appliqués immédiatement.</p>
          </Section>
        )}

        {/* ── Notifications ── */}
        <Section icon={Bell} title="Notifications">
          <div className="space-y-2">
            {([
              { key: "securityAlerts", label: "Alertes de sécurité",    desc: "Événements de sécurité détectés" },
              { key: "agentStatus",    label: "Statut des agents",       desc: "Changements d'état des agents" },
              { key: "trainingJobs",   label: "Jobs d'entraînement",     desc: "Fin de jobs de fine-tuning" },
              { key: "systemUpdates",  label: "Mises à jour système",    desc: "Annonces importantes" },
            ] as const).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border border-slate-800/40 rounded-xl">
                <div>
                  <p className="text-slate-200 text-sm font-medium">{label}</p>
                  <p className="text-slate-600 text-xs mt-0.5">{desc}</p>
                </div>
                <Toggle checked={settings.notifications[key]} onChange={v => updateSettings(["notifications",key], v)} />
              </div>
            ))}
          </div>
        </Section>

        {/* ── Sécurité ── */}
        <Section icon={Shield} title="Sécurité">
          <div className="space-y-2">
            {([
              { key: "rateLimiting",             label: "Rate Limiting",               desc: "Limite les requêtes par utilisateur" },
              { key: "promptInjectionDetection", label: "Détection injection de prompt",desc: "Bloque les prompts malveillants" },
              { key: "auditLogging",             label: "Audit Logging",               desc: "Journalise toutes les actions critiques" },
            ] as const).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border border-slate-800/40 rounded-xl">
                <div>
                  <p className="text-slate-200 text-sm font-medium">{label}</p>
                  <p className="text-slate-600 text-xs mt-0.5">{desc}</p>
                </div>
                <Toggle checked={settings.security[key]} onChange={v => updateSettings(["security",key], v)} />
              </div>
            ))}
          </div>
        </Section>

        {/* ── Système ── */}
        <Section icon={Database} title="Configuration système">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              { key: "contextMemoryLimit",    label: "Limite mémoire contexte", unit: "messages", min: 1,  max: 100 },
              { key: "requestTimeout",        label: "Timeout requêtes",         unit: "secondes", min: 5,  max: 300 },
              { key: "maxConcurrentRequests", label: "Requêtes simultanées max", unit: "workers",  min: 1,  max: 20  },
            ] as const).map(({ key, label, unit, min, max }) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider font-medium">{label}</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={min} max={max} value={settings.system[key]}
                    onChange={e => updateSettings(["system",key], Number(e.target.value))}
                    className="flex-1 bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all" />
                  <span className="text-[11px] text-slate-600 flex-shrink-0 font-mono">{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── À propos ── */}
        <Section icon={Globe} title="À propos" defaultOpen={false}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Plateforme", value: "JARVIS Local Agents" },
              { label: "Backend",    value: backendInfo?.backend ?? "—" },
              { label: "Agents",     value: String(agents.length) },
              { label: "Modèles",    value: String(models.length) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-900/60 border border-slate-800/40 rounded-xl p-3">
                <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-slate-200 font-mono text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Footer actions ── */}
        <div className="flex items-center justify-between py-2">
          <button onClick={() => { setSettings(DEFAULT_SETTINGS); setDirty(true); }}
            className="text-slate-600 hover:text-slate-400 text-sm transition-colors">
            Réinitialiser
          </button>
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="text-xs text-yellow-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />Modifications non sauvegardées
              </span>
            )}
            <button onClick={handleSave} disabled={saving || !dirty}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                dirty
                  ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/15 hover:opacity-90"
                  : "bg-slate-800/60 border border-slate-700/30 text-slate-600 cursor-not-allowed"
              } disabled:opacity-60`}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}