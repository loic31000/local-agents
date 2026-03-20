import { useState, useEffect, useRef, useCallback } from "react";
import {
  GraduationCap, Play, Pause, CheckCircle2, Clock, Database,
  Upload, RefreshCw, XCircle, Plus, X, Trash2, BarChart2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dataset {
  id: string;
  name: string;
  description: string;
  type: string;
  format: string;
  samples: number;
  size_bytes: number;
  quality: string;
  created_at: string;
}

interface TrainingJob {
  id: string;
  name: string;
  status: string;
  base_model: string;
  method: string;
  dataset_id: string | null;
  dataset_name: string;
  epochs: number;
  batch_size: number;
  learning_rate: number;
  progress: number;
  output_model: string | null;
  loss_final: number | null;
  error_msg: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface TrainingLog {
  step: number;
  epoch: number;
  loss: number | null;
  grad_norm: number | null;
  lr: number | null;
}

interface Stats {
  total_jobs: number;
  running_jobs: number;
  completed_jobs: number;
  total_datasets: number;
  total_samples: number;
}

const AVAILABLE_MODELS = [
  "qwen2.5-coder:1.5b",
  "llama3.2:latest",
  "llama3.2:3b",
  "mistral:7b-instruct-q4_0",
  "phi4-mini:latest",
  "gemma3:1b",
  "smollm2:1.7b",
];

const METHODS = ["qlora", "lora", "full"];

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function statusColor(s: string) {
  switch (s) {
    case "completed": return "text-green-400 bg-green-500/10 border-green-500/20";
    case "running":   return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    case "pending":   return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    case "failed":    return "text-red-400 bg-red-500/10 border-red-500/20";
    case "cancelled": return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    default:          return "text-slate-400 bg-slate-500/10 border-slate-500/20";
  }
}

// ─── Modal nouveau job ────────────────────────────────────────────────────────

function NewJobModal({ datasets, onClose, onCreated }: {
  datasets: Dataset[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "", base_model: "qwen2.5-coder:1.5b", method: "qlora",
    dataset_id: "", epochs: 3, batch_size: 1, learning_rate: 0.0002, max_length: 512,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.base_model) { setError("Modèle requis"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/training/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCreated();
      onClose();
    } catch (e) {
      setError(`Erreur : ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-cyan-400" />
            Nouveau job d'entraînement
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Nom</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ex: Jarvis Coder LoRA v2"
              className="w-full bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Modèle de base</label>
              <select value={form.base_model} onChange={e => setForm(p => ({ ...p, base_model: e.target.value }))}
                className="w-full bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                {AVAILABLE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Méthode</label>
              <select value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value }))}
                className="w-full bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                {METHODS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Dataset</label>
            <select value={form.dataset_id} onChange={e => setForm(p => ({ ...p, dataset_id: e.target.value }))}
              className="w-full bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500">
              <option value="">— Aucun dataset —</option>
              {datasets.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.samples} samples)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Époques</label>
              <input type="number" min={1} max={20} value={form.epochs}
                onChange={e => setForm(p => ({ ...p, epochs: parseInt(e.target.value) }))}
                className="w-full bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Batch size</label>
              <input type="number" min={1} max={16} value={form.batch_size}
                onChange={e => setForm(p => ({ ...p, batch_size: parseInt(e.target.value) }))}
                className="w-full bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm">Annuler</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-70">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {saving ? "Création..." : "Créer le job"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal logs ───────────────────────────────────────────────────────────────

function LogsModal({ job, onClose }: { job: TrainingJob; onClose: () => void }) {
  const [logs, setLogs] = useState<TrainingLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/training/jobs/${job.id}/logs`)
      .then(r => r.json())
      .then(d => { setLogs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [job.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl mx-4 shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-cyan-400" />
            Logs — {job.name}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">Aucun log disponible pour ce job.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left py-2 px-3">Step</th>
                  <th className="text-left py-2 px-3">Epoch</th>
                  <th className="text-left py-2 px-3">Loss</th>
                  <th className="text-left py-2 px-3">Grad Norm</th>
                  <th className="text-left py-2 px-3">LR</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-mono text-slate-300">{l.step}</td>
                    <td className="py-2 px-3 font-mono text-slate-300">{l.epoch?.toFixed(2)}</td>
                    <td className="py-2 px-3 font-mono text-cyan-400">{l.loss?.toFixed(4) ?? "—"}</td>
                    <td className="py-2 px-3 font-mono text-slate-300">{l.grad_norm?.toFixed(3) ?? "—"}</td>
                    <td className="py-2 px-3 font-mono text-slate-300">{l.lr?.toExponential(2) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Training() {
  const [datasets, setDatasets]   = useState<Dataset[]>([]);
  const [jobs, setJobs]           = useState<TrainingJob[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [selectedJob, setSelectedJob] = useState<TrainingJob | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [dsRes, jobsRes, statsRes] = await Promise.all([
        fetch("/api/training/datasets"),
        fetch("/api/training/jobs"),
        fetch("/api/training/stats"),
      ]);
      if (dsRes.ok)    setDatasets(await dsRes.json());
      if (jobsRes.ok)  setJobs(await jobsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch { /* silencieux */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    // Refresh auto toutes les 10s si un job tourne
    const interval = setInterval(() => {
      if (jobs.some(j => j.status === "running")) fetchAll();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAll, jobs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("name", file.name.replace(/\.[^.]+$/, ""));
    form.append("type", "chat");
    form.append("format", "jsonl");
    try {
      const res = await fetch("/api/training/datasets", { method: "POST", body: form });
      if (res.ok) fetchAll();
    } catch { /* silencieux */ }
    finally { setUploading(false); e.target.value = ""; }
  };

  const handleCancel = async (jobId: string) => {
    await fetch(`/api/training/jobs/${jobId}/cancel`, { method: "POST" });
    fetchAll();
  };

  const handleDeleteDataset = async (id: string) => {
    await fetch(`/api/training/datasets/${id}`, { method: "DELETE" });
    fetchAll();
  };

  // ─── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-1">
            Training Pipeline
          </h2>
          <p className="text-slate-400 text-sm">Fine-tune vos modèles avec vos données</p>
        </div>
        <button onClick={() => fetchAll(true)} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded-lg text-sm transition-all disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Jobs total",    value: stats.total_jobs,     color: "text-cyan-400" },
            { label: "En cours",      value: stats.running_jobs,   color: "text-blue-400" },
            { label: "Terminés",      value: stats.completed_jobs, color: "text-green-400" },
            { label: "Datasets",      value: stats.total_datasets, color: "text-purple-400" },
            { label: "Samples total", value: stats.total_samples.toLocaleString(), color: "text-yellow-400" },
          ].map(s => (
            <div key={s.label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={() => setShowNewJob(true)}
          className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl p-5 hover:opacity-90 transition-opacity text-left flex items-center gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold">Nouveau job</h3>
            <p className="text-sm opacity-80">Lancer un fine-tuning LoRA / QLoRA</p>
          </div>
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all text-left flex items-center gap-4 disabled:opacity-60">
          <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
            {uploading ? <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" /> : <Upload className="w-5 h-5 text-cyan-400" />}
          </div>
          <div>
            <h3 className="font-semibold text-slate-200">Uploader un dataset</h3>
            <p className="text-sm text-slate-400">Fichier .jsonl ou .txt</p>
          </div>
        </button>
        <input ref={fileInputRef} type="file" accept=".jsonl,.json,.txt,.csv" className="hidden" onChange={handleUpload} />
      </div>

      {/* Jobs */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-cyan-400" />
          Jobs d'entraînement
          {jobs.some(j => j.status === "running") && (
            <span className="ml-2 w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          )}
        </h3>

        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="h-24 bg-slate-800/50 animate-pulse rounded-lg" />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            <GraduationCap className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500">Aucun job — crée-en un avec le bouton ci-dessus</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} className="p-4 bg-slate-800/30 rounded-lg border border-slate-800/50 hover:border-slate-700 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-slate-200">{job.name}</h4>
                      <span className={`px-2 py-0.5 rounded text-xs border ${statusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span className="font-mono">{job.base_model}</span>
                      <span>·</span>
                      <span>{job.method.toUpperCase()}</span>
                      {job.dataset_name && <><span>·</span><span>{job.dataset_name}</span></>}
                      <span>·</span>
                      <span>{job.epochs} époques</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setSelectedJob(job)}
                      className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
                      title="Voir les logs">
                      <BarChart2 className="w-4 h-4" />
                    </button>
                    {(job.status === "running" || job.status === "pending") && (
                      <button onClick={() => handleCancel(job.id)}
                        className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors text-yellow-400"
                        title="Annuler">
                        <Pause className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Barre de progression */}
                {job.status === "running" && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Progression</span>
                      <span className="text-cyan-400">{job.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                      <div className="bg-gradient-to-r from-cyan-500 to-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>
                )}

                {/* Infos bas */}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  {job.started_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(job.started_at).toLocaleString()}
                    </span>
                  )}
                  {job.loss_final && (
                    <span className="font-mono text-slate-400">loss: {job.loss_final.toFixed(4)}</span>
                  )}
                  {job.output_model && (
                    <span className="flex items-center gap-1 text-green-400">
                      <CheckCircle2 className="w-3 h-3" />
                      {job.output_model}
                    </span>
                  )}
                  {job.error_msg && (
                    <span className="flex items-center gap-1 text-red-400 truncate max-w-xs">
                      <XCircle className="w-3 h-3 flex-shrink-0" />
                      {job.error_msg}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Datasets */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          Datasets disponibles
        </h3>

        {datasets.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">Aucun dataset — uploadez un fichier .jsonl</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {datasets.map(ds => (
              <div key={ds.id} className="p-4 bg-slate-800/30 rounded-lg border border-slate-800/50 hover:border-slate-700 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-slate-200 text-sm truncate">{ds.name}</h4>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <span className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">{ds.type}</span>
                    <button onClick={() => handleDeleteDataset(ds.id)}
                      className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{ds.samples.toLocaleString()} samples</span>
                  <span>·</span>
                  <span>{formatBytes(ds.size_bytes)}</span>
                  <span>·</span>
                  <span className="font-mono">{ds.format}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${ds.quality === "high" ? "bg-green-400" : ds.quality === "medium" ? "bg-yellow-400" : "bg-red-400"}`} />
                  <span className="text-xs text-slate-500 capitalize">{ds.quality}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewJob && (
        <NewJobModal datasets={datasets} onClose={() => setShowNewJob(false)} onCreated={() => fetchAll()} />
      )}
      {selectedJob && (
        <LogsModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}