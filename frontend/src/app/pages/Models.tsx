import { useState, useEffect, useCallback } from "react";
import {
  Database, Download, Trash2, HardDrive, Cpu,
  RefreshCw, X, Loader2, CheckCircle2, AlertCircle,
  Search, Zap, Hash, ChevronDown, ChevronUp, Server,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Model {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
  details?: {
    parameter_size?: string;
    family?: string;
    quantization_level?: string;
    format?: string;
  };
}

interface BackendInfo {
  backend: string;
  available: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes, unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${size.toFixed(1)} ${units[unit]}`;
}

function timeAgo(ts: string) {
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}min`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}j`;
}

function familyColor(family?: string) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    llama:   { bg: "bg-orange-500/10 border-orange-500/20", text: "text-orange-400", dot: "bg-orange-400" },
    qwen2:   { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-400", dot: "bg-purple-400" },
    phi3:    { bg: "bg-blue-500/10 border-blue-500/20",     text: "text-blue-400",   dot: "bg-blue-400"   },
    gemma3:  { bg: "bg-green-500/10 border-green-500/20",   text: "text-green-400",  dot: "bg-green-400"  },
    mistral: { bg: "bg-cyan-500/10 border-cyan-500/20",     text: "text-cyan-400",   dot: "bg-cyan-400"   },
  };
  return map[family?.toLowerCase() ?? ""] ?? { bg: "bg-slate-800/60 border-slate-700/30", text: "text-slate-400", dot: "bg-slate-500" };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium backdrop-blur-sm ${
      type === "success" ? "bg-green-900/80 border-green-700/50 text-green-200" : "bg-red-900/80 border-red-700/50 text-red-200"
    }`}>
      {type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}

// ─── Modal Pull ───────────────────────────────────────────────────────────────

const POPULAR = [
  "llama3.2:3b", "llama3.2:1b", "mistral:7b-instruct-q4_0",
  "qwen2.5-coder:1.5b", "gemma3:1b", "phi4-mini:latest",
  "smollm2:360m", "tinyllama:latest",
];

function PullModal({ onClose, onPulled }: { onClose: () => void; onPulled: () => void }) {
  const [name, setName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  const pull = async () => {
    if (!name.trim()) return;
    setPulling(true); setProgress(0); setStatus("Connexion…"); setErr("");
    try {
      const res = await fetch("/api/ollama/pull", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), stream: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split("\n").filter(Boolean)) {
          try {
            const d = JSON.parse(line);
            if (d.status) setStatus(d.status);
            if (d.total && d.completed) setProgress((d.completed / d.total) * 100);
          } catch {}
        }
      }
      onPulled(); onClose();
    } catch (e: unknown) {
      setErr(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
      setPulling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-100">Télécharger un modèle</h3>
            <p className="text-xs text-slate-500 mt-0.5">Depuis Ollama Hub</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && pull()} placeholder="llama3.2:3b"
            disabled={pulling} autoFocus
            className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/40 placeholder-slate-600 disabled:opacity-40 transition-all" />
          <div className="flex flex-wrap gap-1.5">
            {POPULAR.map(m => (
              <button key={m} onClick={() => setName(m)} disabled={pulling}
                className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-all disabled:opacity-40 ${
                  name === m ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400" : "border-slate-700/30 bg-slate-800/40 text-slate-500 hover:text-slate-300"
                }`}>{m}</button>
            ))}
          </div>
          {pulling && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 truncate">{status}</span>
                <span className="text-cyan-400 font-mono ml-2">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {err && <p className="text-red-400 text-xs flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" />{err}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} disabled={pulling} className="flex-1 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/30 text-slate-300 rounded-xl text-sm disabled:opacity-50 transition-all">Annuler</button>
          <button onClick={pull} disabled={!name.trim() || pulling}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 hover:opacity-90 transition-all">
            {pulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {pulling ? "Téléchargement…" : "Télécharger"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Carte modèle expandable ──────────────────────────────────────────────────

function ModelCard({ model, backend, onDelete, deleting, onSwitchBackend, switching }: {
  model: Model;
  backend: BackendInfo | null;
  onDelete: (name: string) => void;
  deleting: string | null;
  onSwitchBackend: (b: string) => void;
  switching: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const family = model.details?.family;
  const colors = familyColor(family);

  return (
    <div className={`bg-slate-900/50 border rounded-2xl overflow-hidden transition-all duration-200 ${
      expanded ? "border-slate-700/60 shadow-lg shadow-black/20" : "border-slate-800/50 hover:border-slate-700/40"
    }`}>
      {/* Ligne principale */}
      <button onClick={() => setExpanded(p => !p)} className="w-full flex items-center gap-4 px-5 py-4 text-left">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-200 font-mono font-medium text-sm">{model.name}</span>
            {family && (
              <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${colors.bg} ${colors.text}`}>{family}</span>
            )}
            {model.details?.quantization_level && (
              <span className="text-[10px] text-slate-600 font-mono">{model.details.quantization_level}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-600 font-mono">
            <span>{formatSize(model.size)}</span>
            {model.details?.parameter_size && <><span>·</span><span>{model.details.parameter_size}</span></>}
            <span>·</span>
            <span>{timeAgo(model.modified_at)}</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-slate-600">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Détail expandé */}
      {expanded && (
        <div className="border-t border-slate-800/50 px-5 py-4 space-y-4 bg-slate-950/30">
          {/* Métriques */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Taille",     value: formatSize(model.size),                icon: HardDrive },
              { label: "Paramètres", value: model.details?.parameter_size ?? "—",  icon: Cpu       },
              { label: "Format",     value: model.details?.format ?? "gguf",        icon: Database  },
              { label: "Modifié",    value: `il y a ${timeAgo(model.modified_at)}`, icon: Hash     },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-slate-900/60 border border-slate-800/40 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className="w-3 h-3 text-slate-600" />
                  <span className="text-[10px] text-slate-600 uppercase tracking-wider">{label}</span>
                </div>
                <p className="text-sm text-slate-300 font-mono truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Digest */}
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5 font-medium">Digest SHA256</p>
            <p className="text-[11px] text-slate-600 font-mono break-all bg-slate-900/60 border border-slate-800/30 rounded-xl px-3 py-2.5">
              {model.digest}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {backend && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Backend</span>
                {backend.available.map(b => (
                  <button key={b} onClick={() => onSwitchBackend(b)} disabled={!!switching}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-50 ${
                      backend.backend === b
                        ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                        : "border-slate-700/30 bg-slate-800/40 text-slate-500 hover:text-slate-200"
                    }`}>
                    {switching === b ? <Loader2 className="w-3 h-3 animate-spin" /> :
                      backend.backend === b ? <CheckCircle2 className="w-3 h-3" /> :
                      <div className="w-3 h-3 rounded-full border border-current opacity-40" />}
                    <span className="capitalize">{b}</span>
                    {backend.backend === b && <span className="text-[10px] text-green-400">actif</span>}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => onDelete(model.name)} disabled={deleting === model.name}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 text-red-400 rounded-xl text-sm transition-all disabled:opacity-50 ml-auto">
              {deleting === model.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Models() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [backend, setBackend] = useState<BackendInfo | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [pullModal, setPullModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  };

  const fetchModels = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const res = await fetch("/api/ollama/models");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setModels(data.models || []);
    } catch { showToast("Impossible de charger les modèles", "error"); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchBackend = useCallback(async () => {
    try { const r = await fetch("/api/backend"); if (r.ok) setBackend(await r.json()); } catch {}
  }, []);

  useEffect(() => {
    fetchModels(true); fetchBackend();
    const iv = setInterval(() => fetchModels(), 30_000);
    return () => clearInterval(iv);
  }, [fetchModels, fetchBackend]);

  const switchBackend = async (target: string) => {
    setSwitching(target);
    try {
      await fetch("/api/backend/switch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backend: target }),
      });
      await fetchBackend(); fetchModels();
      showToast(`Backend → ${target}`);
    } catch { showToast("Erreur changement backend", "error"); }
    finally { setSwitching(null); }
  };

  const deleteModel = async (name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    setDeleting(name);
    try {
      const res = await fetch("/api/ollama/delete", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      fetchModels(); showToast(`"${name}" supprimé`);
    } catch { showToast("Erreur suppression", "error"); }
    finally { setDeleting(null); }
  };

  const filtered = models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

  // Grouper par famille
  const byFamily = filtered.reduce((acc, m) => {
    const f = m.details?.family ?? "autres";
    if (!acc[f]) acc[f] = [];
    acc[f].push(m);
    return acc;
  }, {} as Record<string, Model[]>);

  const totalSize = models.reduce((acc, m) => acc + m.size, 0);

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800/0 hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {toast && <Toast message={toast.msg} type={toast.type} />}

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Models
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5 font-mono">
              {loading ? "…" : `${models.length} modèles · ${formatSize(totalSize)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchModels(true)} disabled={refreshing}
              className="p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 text-slate-500 hover:text-slate-200 rounded-xl transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setPullModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl shadow-lg shadow-cyan-500/20 hover:opacity-90 transition-all text-sm font-medium">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Télécharger</span>
            </button>
          </div>
        </div>

        {/* ── Backend ── */}
        {backend && (
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-slate-500">
                <Server className="w-4 h-4" />
                <span className="text-sm font-medium">Backend LLM</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap ml-1">
                {backend.available.map(b => (
                  <button key={b} onClick={() => switchBackend(b)} disabled={!!switching}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-50 ${
                      backend.backend === b
                        ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400 shadow-sm"
                        : "border-slate-700/30 bg-slate-800/40 text-slate-500 hover:text-slate-200 hover:border-slate-600"
                    }`}>
                    {switching === b ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                      backend.backend === b ? <Zap className="w-3.5 h-3.5" /> :
                      <div className="w-3.5 h-3.5 rounded-full border border-current opacity-40" />}
                    <span className="capitalize">{b}</span>
                    {backend.backend === b && (
                      <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-md font-normal">actif</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Recherche ── */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/50 border border-slate-800/50 rounded-2xl">
          <Search className="w-4 h-4 text-slate-600 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filtrer les modèles…"
            className="flex-1 bg-transparent text-slate-200 text-sm placeholder-slate-600 focus:outline-none" />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-600 hover:text-slate-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          {!loading && (
            <span className="text-[11px] text-slate-700 font-mono flex-shrink-0">{filtered.length}/{models.length}</span>
          )}
        </div>

        {/* ── Contenu ── */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-900/40 rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-center">
              <Database className="w-7 h-7 text-slate-700" />
            </div>
            <div>
              <p className="text-slate-400 font-medium">{search ? "Aucun résultat" : "Aucun modèle installé"}</p>
              <p className="text-slate-600 text-sm mt-1">
                {search ? "Essaie un autre terme" : "Clique sur « Télécharger » pour commencer"}
              </p>
            </div>
            {!search && (
              <button onClick={() => setPullModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl shadow-lg shadow-cyan-500/20 hover:opacity-90 transition-all text-sm font-medium">
                <Download className="w-4 h-4" />Télécharger un modèle
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byFamily).map(([family, fModels]) => {
              const colors = familyColor(family === "autres" ? undefined : family);
              return (
                <div key={family}>
                  {/* Séparateur de famille */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>{family}</span>
                    <span className="text-[10px] text-slate-700 font-mono">
                      {fModels.length} modèle{fModels.length > 1 ? "s" : ""}
                    </span>
                    <div className="flex-1 h-px bg-slate-800/60 ml-1" />
                  </div>
                  <div className="space-y-2">
                    {fModels.map(model => (
                      <ModelCard key={model.name} model={model} backend={backend}
                        onDelete={deleteModel} deleting={deleting}
                        onSwitchBackend={switchBackend} switching={switching} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pullModal && <PullModal onClose={() => setPullModal(false)} onPulled={() => fetchModels()} />}
    </div>
  );
}