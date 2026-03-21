import { useState, useEffect, useRef, useCallback } from "react";
import {
  GraduationCap, Play, Pause, CheckCircle2, Clock, Database,
  Upload, RefreshCw, XCircle, Plus, X, Trash2, Zap,
  ChevronDown, ChevronUp, TrendingDown, AlertCircle,
  BarChart2, BookOpen,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dataset {
  id: string; name: string; type: string; format: string;
  samples: number; size_bytes: number; quality: string; created_at: string;
}

interface Job {
  id: string; name: string; base_model: string; method: string;
  dataset_id?: string; dataset_name?: string;
  epochs: number; batch_size: number; learning_rate: number; max_length: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number; output_model?: string; loss_final?: number; error_msg?: string;
  created_at: string; started_at?: string; completed_at?: string;
}

interface TrainingLog {
  id: string; job_id: string; step: number; epoch: number;
  loss: number | null; grad_norm: number | null; lr: number | null; logged_at: string;
}

interface Stats {
  total_jobs: number; running_jobs: number; completed_jobs: number;
  total_datasets: number; total_samples: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AVAILABLE_MODELS = [
  { id: "distilbert-base-uncased",            label: "DistilBERT base (66M) — Recommandé" },
  { id: "distilbert-base-multilingual-cased", label: "DistilBERT multilingual (134M)" },
  { id: "bert-base-uncased",                  label: "BERT base (110M)" },
  { id: "albert-base-v2",                     label: "ALBERT base v2 (12M) — Léger" },
];
const METHODS = ["lora", "qlora", "full"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (!b) return "0 B";
  const k = 1024, s = ["B","KB","MB","GB"], i = Math.floor(Math.log(b)/Math.log(k));
  return `${(b/Math.pow(k,i)).toFixed(1)} ${s[i]}`;
}

function formatDuration(start: string, end?: string) {
  const diff = Math.floor((new Date(end||Date.now()).getTime()-new Date(start).getTime())/1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ${diff%60}s`;
  return `${Math.floor(diff/3600)}h ${Math.floor((diff%3600)/60)}m`;
}

function statusStyle(s: string) {
  switch(s) {
    case "completed": return { badge: "text-green-400 bg-green-500/10 border-green-500/25", dot: "bg-green-400" };
    case "running":   return { badge: "text-cyan-400 bg-cyan-500/10 border-cyan-500/25",   dot: "bg-cyan-400 animate-pulse" };
    case "pending":   return { badge: "text-yellow-400 bg-yellow-500/10 border-yellow-500/25", dot: "bg-yellow-400" };
    case "failed":    return { badge: "text-red-400 bg-red-500/10 border-red-500/25",       dot: "bg-red-400" };
    default:          return { badge: "text-slate-400 bg-slate-800/40 border-slate-700/30", dot: "bg-slate-600" };
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string }) {
  return (
    <div className="fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border bg-green-900/80 border-green-700/50 text-green-200 text-sm font-medium backdrop-blur-sm">
      <CheckCircle2 className="w-4 h-4" />{msg}
    </div>
  );
}

// ─── Modal : Nouveau Job ──────────────────────────────────────────────────────

function NewJobModal({ datasets, onClose, onCreated }: {
  datasets: Dataset[]; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "", base_model: "distilbert-base-uncased", method: "lora",
    dataset_id: "", epochs: 1, batch_size: 1, learning_rate: 0.00002, max_length: 128,
  });
  const [saving, setSaving] = useState(false);
  const [autoStart, setAutoStart] = useState(true);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.base_model) { setError("Modèle requis"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/training/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const job = await res.json();
      if (autoStart && job.id) {
        const sr = await fetch(`/api/training/jobs/${job.id}/start`, { method: "POST" });
        if (!sr.ok) { const e = await sr.json(); throw new Error(e.error || "Erreur démarrage"); }
      }
      onCreated(); onClose();
    } catch(e) { setError(`Erreur : ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-cyan-400" />Nouveau job d'entraînement
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1.5 font-medium">Nom</label>
            <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
              placeholder="Ex: Moderation LoRA v2"
              className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 placeholder-slate-600 transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1.5 font-medium">Modèle</label>
              <select value={form.base_model} onChange={e => setForm(p => ({...p, base_model: e.target.value}))}
                className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all">
                {AVAILABLE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1.5 font-medium">Méthode</label>
              <select value={form.method} onChange={e => setForm(p => ({...p, method: e.target.value}))}
                className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all">
                {METHODS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1.5 font-medium">Dataset</label>
            <select value={form.dataset_id} onChange={e => setForm(p => ({...p, dataset_id: e.target.value}))}
              className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all">
              <option value="">— Dataset synthétique intégré —</option>
              {datasets.map(d => <option key={d.id} value={d.id}>{d.name} ({d.samples} samples)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["Époques","epochs",1,20],["Batch","batch_size",1,16],["Max len","max_length",64,512]].map(([label,key,min,max]) => (
              <div key={String(key)}>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1.5 font-medium">{label}</label>
                <input type="number" min={Number(min)} max={Number(max)} value={form[key as keyof typeof form] as number}
                  onChange={e => setForm(p => ({...p, [key as string]: parseInt(e.target.value)||Number(min)}))}
                  className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all" />
              </div>
            ))}
          </div>
          <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${autoStart ? "bg-cyan-500/5 border-cyan-500/20" : "bg-slate-800/30 border-slate-700/30"}`}>
            <div>
              <p className="text-sm text-slate-200 font-medium">Démarrer automatiquement</p>
              <p className="text-xs text-slate-500 mt-0.5">Lance l'entraînement immédiatement</p>
            </div>
            <button onClick={() => setAutoStart(p => !p)}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${autoStart ? "bg-cyan-500" : "bg-slate-700"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoStart ? "translate-x-6" : ""}`} />
            </button>
          </div>
          {error && <p className="text-red-400 text-sm flex items-center gap-2"><XCircle className="w-4 h-4" />{error}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/30 text-slate-300 rounded-xl text-sm transition-all">Annuler</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/15 hover:opacity-90 transition-all disabled:opacity-60">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {saving ? "Lancement…" : autoStart ? "Créer & Démarrer" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card Job avec logs inline ────────────────────────────────────────────────

function JobCard({ job, onStart, onCancel, starting }: {
  job: Job;
  onStart: (id: string) => void;
  onCancel: (id: string) => void;
  starting: string | null;
}) {
  const [expanded, setExpanded] = useState(job.status === "running");
  const [logs, setLogs] = useState<TrainingLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const st = statusStyle(job.status);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/training/jobs/${job.id}/logs`);
      if (res.ok) setLogs(await res.json());
    } finally { setLoadingLogs(false); }
  }, [job.id]);

  useEffect(() => {
    if (!expanded) return;
    setLoadingLogs(true);
    fetchLogs();
    if (job.status === "running") {
      const iv = setInterval(fetchLogs, 3000);
      return () => clearInterval(iv);
    }
  }, [expanded, job.status, fetchLogs]);

  useEffect(() => {
    if (expanded) logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, expanded]);

  const lastLog = logs[logs.length - 1];
  const minLoss = logs.reduce((m, l) => l.loss !== null ? Math.min(m, l.loss) : m, Infinity);

  return (
    <div className={`bg-slate-900/50 border rounded-2xl overflow-hidden transition-all duration-200 ${
      expanded ? "border-slate-700/60 shadow-lg shadow-black/20" : "border-slate-800/50 hover:border-slate-700/40"
    }`}>
      {/* Ligne principale */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-slate-100 font-semibold text-sm">
              {job.name || `Job ${job.created_at?.slice(0,16)}`}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${st.badge}`}>{job.status}</span>
            {job.status === "running" && (
              <span className="text-[10px] text-cyan-400 font-mono">{job.progress}%</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-600 font-mono">
            <span>{job.base_model}</span>
            <span>· {job.method?.toUpperCase()}</span>
            {job.dataset_name && <span>· {job.dataset_name}</span>}
            <span>· {job.epochs} époque{job.epochs > 1 ? "s" : ""}</span>
            {job.started_at && (
              <span className="flex items-center gap-1">
                · <Clock className="w-3 h-3" />{formatDuration(job.started_at, job.completed_at)}
              </span>
            )}
          </div>
          {job.status === "running" && (
            <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden w-full max-w-xs">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-1000"
                style={{ width: `${job.progress}%` }} />
            </div>
          )}
          {(job.loss_final != null || job.output_model || job.error_msg) && (
            <div className="flex items-center gap-3 mt-1.5 text-xs">
              {job.loss_final != null && (
                <span className="flex items-center gap-1 text-slate-400 font-mono">
                  <TrendingDown className="w-3 h-3 text-green-400" />loss {job.loss_final.toFixed(4)}
                </span>
              )}
              {job.output_model && <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{job.output_model}</span>}
              {job.error_msg && <span className="text-red-400 flex items-center gap-1 truncate max-w-xs"><XCircle className="w-3 h-3 flex-shrink-0" />{job.error_msg}</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {job.status === "pending" && (
            <button onClick={() => onStart(job.id)} disabled={starting === job.id}
              className="p-2 hover:bg-green-500/15 rounded-xl transition-colors text-green-400 disabled:opacity-50">
              {starting === job.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            </button>
          )}
          {job.status === "running" && (
            <button onClick={() => onCancel(job.id)} className="p-2 hover:bg-yellow-500/15 rounded-xl transition-colors text-yellow-400">
              <Pause className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setExpanded(p => !p)}
            className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-cyan-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <BarChart2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Logs inline */}
      {expanded && (
        <div className="border-t border-slate-800/50 bg-slate-950/40">
          {/* Métriques si logs dispo */}
          {logs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 py-4 border-b border-slate-800/30">
              {[
                { label: "Steps",      value: lastLog?.step ?? "—" },
                { label: "Epoch",      value: lastLog?.epoch?.toFixed(2) ?? "—" },
                { label: "Loss",       value: lastLog?.loss?.toFixed(4) ?? "—" },
                { label: "Loss min",   value: minLoss === Infinity ? "—" : minLoss.toFixed(4) },
              ].map(m => (
                <div key={m.label} className="bg-slate-900/60 border border-slate-800/40 rounded-xl p-3 text-center">
                  <div className="text-base font-bold text-cyan-400 font-mono">{m.value}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Table logs */}
          <div className="max-h-56 overflow-y-auto px-5 py-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
            {loadingLogs ? (
              <div className="flex justify-center py-6"><RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" /></div>
            ) : logs.length === 0 ? (
              <p className="text-slate-700 text-xs text-center py-6 font-mono">
                {job.status === "running" ? "En attente des premiers logs…" : "Aucun log disponible"}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-950/90">
                  <tr className="text-slate-600 border-b border-slate-800">
                    {["Step","Epoch","Loss","Grad","LR","Heure"].map(h => (
                      <th key={h} className="text-left py-2 px-2 uppercase tracking-wider font-medium text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {logs.map((l, i) => (
                    <tr key={l.id ?? i} className={`hover:bg-slate-800/20 ${i === logs.length-1 && job.status === "running" ? "bg-cyan-500/5" : ""}`}>
                      <td className="py-1.5 px-2 font-mono text-slate-400">{l.step}</td>
                      <td className="py-1.5 px-2 font-mono text-slate-500">{l.epoch?.toFixed(2)}</td>
                      <td className={`py-1.5 px-2 font-mono font-semibold ${l.loss !== null && l.loss < 1 ? "text-green-400" : "text-cyan-400"}`}>{l.loss?.toFixed(4) ?? "—"}</td>
                      <td className="py-1.5 px-2 font-mono text-slate-600">{l.grad_norm?.toFixed(3) ?? "—"}</td>
                      <td className="py-1.5 px-2 font-mono text-slate-700">{l.lr?.toExponential(1) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-slate-600">{new Date(l.logged_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div ref={logsEndRef} />
          </div>
          {job.status === "running" && (
            <div className="px-5 pb-3 flex items-center gap-2 text-[10px] text-slate-700">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />refresh 3s
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Training() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [toast, setToast]           = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchAll = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const [dsRes, jobsRes, statsRes] = await Promise.all([
        fetch("/api/training/datasets"),
        fetch("/api/training/jobs"),
        fetch("/api/training/stats"),
      ]);
      if (dsRes.ok)    setDatasets(await dsRes.json());
      if (jobsRes.ok)  setJobs(await jobsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleStart = async (jobId: string) => {
    setStartingId(jobId);
    try {
      const res = await fetch(`/api/training/jobs/${jobId}/start`, { method: "POST" });
      if (!res.ok) { const e = await res.json(); showToast(e.error || "Erreur"); }
      else { showToast("Job démarré ✓"); fetchAll(); }
    } finally { setStartingId(null); }
  };

  const handleCancel = async (jobId: string) => {
    await fetch(`/api/training/jobs/${jobId}/cancel`, { method: "POST" });
    showToast("Job annulé"); fetchAll();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("name", file.name.replace(/\.[^.]+$/, ""));
    fd.append("type", "chat"); fd.append("format", "jsonl");
    try { await fetch("/api/training/datasets", { method: "POST", body: fd }); fetchAll(); showToast("Dataset uploadé ✓"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const runningCount = jobs.filter(j => j.status === "running").length;
  const successRate  = stats && stats.total_jobs > 0 ? Math.round((stats.completed_jobs / stats.total_jobs) * 100) : null;

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800/0 hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {toast && <Toast msg={toast} />}

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Training
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5 font-mono">
              {loading ? "…" : `${jobs.length} jobs · ${datasets.length} datasets`}
              {runningCount > 0 && <span className="ml-2 text-cyan-500">· {runningCount} en cours</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchAll(true)} disabled={refreshing}
              className="p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 text-slate-500 hover:text-slate-200 rounded-xl transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setShowNewJob(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl shadow-lg shadow-cyan-500/20 hover:opacity-90 transition-all text-sm font-medium">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nouveau job</span>
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total jobs",  value: stats.total_jobs,       color: "text-slate-200" },
              { label: "En cours",    value: stats.running_jobs,      color: "text-cyan-400"  },
              { label: "Terminés",    value: stats.completed_jobs,    color: "text-green-400" },
              { label: "Datasets",    value: stats.total_datasets,    color: "text-purple-400"},
            ].map(s => (
              <div key={s.label} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Taux de succès */}
        {successRate !== null && (
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400 font-medium">Taux de succès</span>
              <span className="text-sm text-green-400 font-mono font-medium">{successRate}%</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-500 to-cyan-500 rounded-full transition-all"
                style={{ width: `${successRate}%` }} />
            </div>
          </div>
        )}

        {/* ── Actions rapides ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => setShowNewJob(true)}
            className="flex items-center gap-4 px-5 py-4 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 hover:border-cyan-500/40 rounded-2xl transition-all group">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-cyan-500/20 flex-shrink-0">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-slate-200 font-semibold text-sm">Nouveau job</p>
              <p className="text-slate-600 text-xs mt-0.5">Lancer un fine-tuning LoRA / QLoRA</p>
            </div>
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-4 px-5 py-4 bg-slate-900/50 border border-slate-800/50 hover:border-slate-700/60 rounded-2xl transition-all disabled:opacity-50">
            <div className="w-10 h-10 bg-slate-800/80 rounded-xl flex items-center justify-center flex-shrink-0">
              {uploading ? <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" /> : <Upload className="w-5 h-5 text-cyan-400" />}
            </div>
            <div className="text-left">
              <p className="text-slate-200 font-semibold text-sm">Upload dataset</p>
              <p className="text-slate-600 text-xs mt-0.5">.jsonl · .json · .txt</p>
            </div>
          </button>
          <input ref={fileInputRef} type="file" accept=".jsonl,.json,.txt,.csv" className="hidden" onChange={handleUpload} />
        </div>

        {/* ── Jobs ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap className="w-4 h-4 text-cyan-400" />
            <h3 className="text-slate-300 font-semibold text-sm">Jobs d'entraînement</h3>
            {runningCount > 0 && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />}
            <span className="text-[10px] text-slate-700 font-mono ml-auto">refresh 5s</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-slate-900/40 rounded-2xl animate-pulse" />)}
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center border border-slate-800/50 rounded-2xl bg-slate-900/20">
              <div className="w-14 h-14 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <p className="text-slate-400 font-medium">Aucun job</p>
                <p className="text-slate-600 text-sm mt-1">Lance ton premier fine-tuning</p>
              </div>
              <button onClick={() => setShowNewJob(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-cyan-500/15 hover:opacity-90 transition-all">
                <Plus className="w-4 h-4" />Nouveau job
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <JobCard key={job.id} job={job}
                  onStart={handleStart} onCancel={handleCancel} starting={startingId} />
              ))}
            </div>
          )}
        </div>

        {/* ── Datasets ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-cyan-400" />
            <h3 className="text-slate-300 font-semibold text-sm">Datasets disponibles</h3>
            <span className="text-[10px] text-slate-700 font-mono ml-auto">{datasets.length} datasets</span>
          </div>
          {datasets.length === 0 ? (
            <p className="text-center text-slate-700 text-sm py-8 border border-slate-800/50 rounded-2xl">
              Aucun dataset — uploadez un fichier .jsonl
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {datasets.map(ds => (
                <div key={ds.id} className="bg-slate-900/50 border border-slate-800/50 hover:border-slate-700/50 rounded-2xl p-4 transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-slate-200 text-sm font-medium truncate">{ds.name}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/30">{ds.type}</span>
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        ds.quality === "high" ? "bg-green-400" : ds.quality === "medium" ? "bg-yellow-400" : "bg-red-400"
                      }`} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-600 font-mono">
                    <BookOpen className="w-3 h-3" />
                    <span>{ds.samples.toLocaleString()} samples</span>
                    <span>·</span>
                    <span>{formatBytes(ds.size_bytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {showNewJob && (
        <NewJobModal datasets={datasets} onClose={() => setShowNewJob(false)}
          onCreated={() => { fetchAll(); showToast("Job créé ✓"); }} />
      )}
    </div>
  );
}