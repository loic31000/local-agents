import { useState, useEffect, useCallback, useRef } from "react";
import {
  Database, Plus, Upload, Download, Trash2, RefreshCw, X,
  Eye, EyeOff, Edit3, Save, AlertCircle, CheckCircle2,
  Globe, MessageSquare, FileText, Tag, Hash, ChevronDown,
  ChevronUp, BookOpen, Layers,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dataset {
  id: string; name: string; description: string; type: string;
  format: string; samples: number; size_bytes: number; quality: string;
  created_at: string;
}

interface DatasetRow {
  text: string; label?: number; instruction?: string; response?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LABEL_SETS: Record<string, string[]> = {
  moderation: ["clean", "toxic", "scam", "phishing", "impersonation"],
  chat:       [],
  code:       ["correct", "buggy", "incomplete", "insecure"],
  ner:        ["O", "B-PERSON", "I-PERSON", "B-ORG", "I-ORG", "B-LOC", "I-LOC"],
};

const TYPE_COLOR: Record<string, string> = {
  moderation:     "text-red-400 bg-red-500/10 border-red-500/20",
  chat:           "text-blue-400 bg-blue-500/10 border-blue-500/20",
  code:           "text-green-400 bg-green-500/10 border-green-500/20",
  hf_import:      "text-purple-400 bg-purple-500/10 border-purple-500/20",
  discord_export: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  moderation:     <Tag className="w-3.5 h-3.5" />,
  chat:           <MessageSquare className="w-3.5 h-3.5" />,
  code:           <FileText className="w-3.5 h-3.5" />,
  hf_import:      <Globe className="w-3.5 h-3.5" />,
  discord_export: <MessageSquare className="w-3.5 h-3.5" />,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (!b) return "0 B";
  const k = 1024, s = ["B","KB","MB","GB"], i = Math.floor(Math.log(b)/Math.log(k));
  return `${(b/Math.pow(k,i)).toFixed(1)} ${s[i]}`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type = "success" }: { msg: string; type?: "success"|"error" }) {
  return (
    <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium backdrop-blur-sm ${
      type === "success" ? "bg-green-900/80 border-green-700/50 text-green-200" : "bg-red-900/80 border-red-700/50 text-red-200"
    }`}>
      {type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

// ─── Modal HuggingFace ────────────────────────────────────────────────────────

const POPULAR_HF = [
  { repo: "dair-ai/emotion",                       text: "text",     label: "label",  desc: "Émotions (6 classes)" },
  { repo: "stanfordnlp/sst2",                      text: "sentence", label: "label",  desc: "Sentiment ±" },
  { repo: "fancyzhx/ag_news",                      text: "text",     label: "label",  desc: "News (4 catégories)" },
  { repo: "google-research-datasets/go_emotions",   text: "text",     label: "labels", desc: "Émotions (27 classes)" },
];

function HFImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [form, setForm] = useState({ repo_id: "", split: "train", text_field: "text", label_field: "label", max_samples: 1000, name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.repo_id) { setError("repo_id requis"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/training/datasets/import-hf", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onImported(); onClose();
    } catch(e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2"><Globe className="w-5 h-5 text-purple-400" />Import HuggingFace Hub</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {POPULAR_HF.map(d => (
              <button key={d.repo} onClick={() => setForm(p => ({...p, repo_id: d.repo, text_field: d.text, label_field: d.label, name: d.repo.split("/")[1]}))}
                className={`p-3 rounded-xl border text-left text-xs transition-all ${form.repo_id === d.repo ? "border-purple-500/50 bg-purple-500/10" : "border-slate-700/40 bg-slate-800/40 hover:border-slate-600/60"}`}>
                <p className="font-mono text-slate-300 truncate">{d.repo}</p>
                <p className="text-slate-600 mt-0.5">{d.desc}</p>
              </button>
            ))}
          </div>
          <input value={form.repo_id} onChange={e => setForm(p => ({...p, repo_id: e.target.value}))} placeholder="organisation/nom-dataset"
            className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/40 placeholder-slate-600 transition-all" />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider">Split</label>
              <select value={form.split} onChange={e => setForm(p => ({...p, split: e.target.value}))}
                className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all">
                {["train","test","validation"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider">Texte</label>
              <input value={form.text_field} onChange={e => setForm(p => ({...p, text_field: e.target.value}))}
                className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider">Label</label>
              <input value={form.label_field} onChange={e => setForm(p => ({...p, label_field: e.target.value}))}
                className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/30 text-slate-300 rounded-xl text-sm transition-all">Annuler</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-60">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {loading ? "Import…" : "Importer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Manuel ─────────────────────────────────────────────────────────────

function ManualDatasetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<"config"|"editor">("config");
  const [config, setConfig] = useState({ name: "", description: "", type: "moderation" });
  const [rows, setRows] = useState<Array<{ text: string; label: number }>>([{ text: "", label: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const labels = LABEL_SETS[config.type] || [];

  const handleSave = async () => {
    const valid = rows.filter(r => r.text.trim());
    if (!config.name) { setError("Nom requis"); return; }
    if (!valid.length) { setError("Au moins une ligne requise"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/training/datasets/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, labels, rows: valid }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onCreated(); onClose();
    } catch(e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 flex-shrink-0">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-cyan-400" />{step === "config" ? "Configuration" : config.name}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        {step === "config" ? (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider">Nom</label>
                <input value={config.name} onChange={e => setConfig(p => ({...p, name: e.target.value}))} placeholder="mon-dataset"
                  className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 placeholder-slate-600 transition-all" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider">Type</label>
                <select value={config.type} onChange={e => setConfig(p => ({...p, type: e.target.value}))}
                  className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all">
                  {Object.keys(LABEL_SETS).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {labels.map((l, i) => (
                  <span key={l} className="px-3 py-1 rounded-lg bg-slate-800/60 border border-slate-700/30 text-sm text-slate-300">
                    <span className="text-cyan-400 mr-1.5">{i}</span>{l}
                  </span>
                ))}
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/30 text-slate-300 rounded-xl text-sm transition-all">Annuler</button>
              <button onClick={() => { if (!config.name) { setError("Nom requis"); return; } setError(""); setStep("editor"); }}
                className="flex-1 px-4 py-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl text-sm hover:opacity-90 transition-all">
                Suivant →
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-6 py-3 bg-slate-800/30 border-b border-slate-800 flex-shrink-0 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded border ${TYPE_COLOR[config.type] || "text-slate-400 bg-slate-500/10 border-slate-500/20"}`}>{config.type}</span>
              <span className="text-xs text-cyan-400">{rows.filter(r => r.text.trim()).length} lignes valides</span>
              {labels.length > 0 && labels.map((l, i) => (
                <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                  <span className="text-cyan-500">{i}</span>={l}
                </span>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-700 w-6 text-right flex-shrink-0 font-mono">{i+1}</span>
                  <input value={row.text} onChange={e => setRows(p => p.map((r, idx) => idx === i ? {...r, text: e.target.value} : r))}
                    placeholder="Texte du sample…"
                    className="flex-1 bg-slate-800/50 border border-slate-700/30 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 placeholder-slate-600 transition-all" />
                  {labels.length > 0 ? (
                    <select value={row.label} onChange={e => setRows(p => p.map((r, idx) => idx === i ? {...r, label: parseInt(e.target.value)} : r))}
                      className="w-36 bg-slate-800/50 border border-slate-700/30 text-slate-200 rounded-xl px-2 py-2.5 text-sm focus:outline-none transition-all flex-shrink-0">
                      {labels.map((l, li) => <option key={l} value={li}>{li}: {l}</option>)}
                    </select>
                  ) : (
                    <input type="number" value={row.label} onChange={e => setRows(p => p.map((r, idx) => idx === i ? {...r, label: parseInt(e.target.value)||0} : r))}
                      className="w-20 bg-slate-800/50 border border-slate-700/30 text-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all flex-shrink-0" />
                  )}
                  <button onClick={() => setRows(p => p.filter((_, idx) => idx !== i))}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {error && <p className="text-red-400 text-sm px-6 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-800 flex-shrink-0">
              <button onClick={() => setRows(p => [...p, {text: "", label: 0}])}
                className="px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/30 text-slate-300 rounded-xl text-sm flex items-center gap-2 transition-all">
                <Plus className="w-4 h-4" />Ajouter
              </button>
              <button onClick={() => setStep("config")} className="px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/30 text-slate-300 rounded-xl text-sm transition-all">Retour</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-60">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Sauvegarde…" : `Sauvegarder (${rows.filter(r => r.text.trim()).length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal Discord ────────────────────────────────────────────────────────────

function DiscordExportModal({ onClose, onExported }: { onClose: () => void; onExported: () => void }) {
  const [form, setForm] = useState({ max_messages: 500, auto_label: false, name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleExport = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/training/datasets/discord-export", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.samples === 0) { setError("Aucune conversation trouvée."); setLoading(false); return; }
      onExported(); onClose();
    } catch(e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-indigo-400" />Export Discord</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-indigo-300 bg-indigo-500/8 border border-indigo-500/20 rounded-xl px-4 py-3">
            Exporte les conversations Jarvis#1336 (PostgreSQL) vers JSONL.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider">Max messages</label>
              <input type="number" value={form.max_messages} onChange={e => setForm(p => ({...p, max_messages: parseInt(e.target.value)||500}))}
                className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider">Nom</label>
              <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="auto si vide"
                className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none transition-all placeholder-slate-600" />
            </div>
          </div>
          <div className={`flex items-center justify-between p-4 rounded-xl border ${form.auto_label ? "bg-indigo-500/5 border-indigo-500/20" : "bg-slate-800/30 border-slate-700/30"}`}>
            <div>
              <p className="text-sm text-slate-200 font-medium">Auto-labeling ML</p>
              <p className="text-xs text-slate-500 mt-0.5">Classifie avec DistilBERT</p>
            </div>
            <button onClick={() => setForm(p => ({...p, auto_label: !p.auto_label}))}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${form.auto_label ? "bg-indigo-500" : "bg-slate-700"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.auto_label ? "translate-x-6" : ""}`} />
            </button>
          </div>
          {error && <p className="text-red-400 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/30 text-slate-300 rounded-xl text-sm transition-all">Annuler</button>
          <button onClick={handleExport} disabled={loading}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-60">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {loading ? "Export…" : "Exporter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card Dataset avec viewer inline ─────────────────────────────────────────

function DatasetCard({ dataset, onDelete }: { dataset: Dataset; onDelete: (id: string, name: string) => void }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [newRow, setNewRow] = useState({ text: "", label: 0 });
  const [adding, setAdding] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);
  const labels = LABEL_SETS[dataset.type] || [];
  const colors = TYPE_COLOR[dataset.type] || "text-slate-400 bg-slate-500/10 border-slate-500/20";

  const loadRows = async () => {
    setLoadingRows(true);
    try {
      const res = await fetch(`/api/training/datasets/${dataset.id}/rows`);
      if (res.ok) setRows(await res.json());
    } finally { setLoadingRows(false); }
  };

  const toggleViewer = () => {
    if (!viewerOpen) loadRows();
    setViewerOpen(p => !p);
  };

  const handleAddRow = async () => {
    if (!newRow.text.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/training/datasets/${dataset.id}/rows`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([newRow]),
      });
      if (res.ok) { setRows(p => [...p, {text: newRow.text, label: newRow.label}]); setNewRow({text: "", label: 0}); setShowAddRow(false); }
    } finally { setAdding(false); }
  };

  return (
    <div className={`bg-slate-900/50 border rounded-2xl overflow-hidden transition-all duration-200 ${
      viewerOpen ? "border-slate-700/60 shadow-lg shadow-black/20" : "border-slate-800/50 hover:border-slate-700/40"
    }`}>
      {/* Header card */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.split(' ').filter(c => c.startsWith('bg-')).join(' ')}`}>
          <span className={colors.split(' ').find(c => c.startsWith('text-')) ?? 'text-slate-400'}>
            {TYPE_ICON[dataset.type] || <Database className="w-3.5 h-3.5" />}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-slate-200 font-medium text-sm truncate">{dataset.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${colors}`}>{dataset.type}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              dataset.quality === "high" ? "bg-green-500/10 text-green-400" :
              dataset.quality === "medium" ? "bg-yellow-500/10 text-yellow-400" :
              "bg-red-500/10 text-red-400"
            }`}>{dataset.quality}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-600 font-mono">
            <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{dataset.samples.toLocaleString()} samples</span>
            <span>· {formatBytes(dataset.size_bytes)}</span>
            <span>· {dataset.format}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={toggleViewer}
            className={`p-2 rounded-xl transition-all ${viewerOpen ? "bg-cyan-500/15 text-cyan-400" : "hover:bg-slate-800 text-slate-500 hover:text-cyan-400"}`}
            title="Voir le contenu">
            {viewerOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button onClick={() => onDelete(dataset.id, dataset.name)}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-600 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Viewer inline */}
      {viewerOpen && (
        <div className="border-t border-slate-800/50 bg-slate-950/30">
          {/* Labels reference */}
          {labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-slate-800/30">
              {labels.map((l, i) => (
                <span key={l} className="text-[10px] px-2 py-0.5 rounded bg-slate-800/60 text-slate-500">
                  <span className="text-cyan-500">{i}</span> = {l}
                </span>
              ))}
            </div>
          )}

          {/* Barre add row */}
          <div className="px-5 py-2 border-b border-slate-800/30 flex items-center gap-2">
            <button onClick={() => setShowAddRow(p => !p)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors px-2 py-1 hover:bg-slate-800/60 rounded-lg">
              <Plus className="w-3.5 h-3.5" />Ajouter une ligne
            </button>
          </div>

          {showAddRow && (
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800/30 bg-slate-900/40">
              <input value={newRow.text} onChange={e => setNewRow(p => ({...p, text: e.target.value}))}
                placeholder="Nouveau sample…" onKeyDown={e => e.key === "Enter" && handleAddRow()}
                className="flex-1 bg-slate-800/60 border border-slate-700/30 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/40 placeholder-slate-600 transition-all" />
              {labels.length > 0 ? (
                <select value={newRow.label} onChange={e => setNewRow(p => ({...p, label: parseInt(e.target.value)}))}
                  className="w-36 bg-slate-800/60 border border-slate-700/30 text-slate-200 rounded-xl px-2 py-2 text-xs focus:outline-none flex-shrink-0">
                  {labels.map((l, i) => <option key={l} value={i}>{i}: {l}</option>)}
                </select>
              ) : (
                <input type="number" value={newRow.label} onChange={e => setNewRow(p => ({...p, label: parseInt(e.target.value)||0}))}
                  className="w-16 bg-slate-800/60 border border-slate-700/30 text-slate-200 rounded-xl px-2 py-2 text-xs focus:outline-none flex-shrink-0" />
              )}
              <button onClick={handleAddRow} disabled={adding}
                className="px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs disabled:opacity-60 transition-all flex-shrink-0">
                {adding ? "…" : "OK"}
              </button>
              <button onClick={() => setShowAddRow(false)} className="p-2 text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Table */}
          <div className="max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
            {loadingRows ? (
              <div className="flex justify-center py-8"><RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" /></div>
            ) : rows.length === 0 ? (
              <p className="text-slate-700 text-xs text-center py-8">Aucune ligne</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-950/95">
                  <tr className="text-slate-600 border-b border-slate-800">
                    <th className="text-left py-2 px-4 w-8">#</th>
                    <th className="text-left py-2 px-4">Texte</th>
                    <th className="text-left py-2 px-4 w-28">Label</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {rows.slice(0, 200).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-800/20">
                      <td className="py-2 px-4 text-slate-700 font-mono">{i+1}</td>
                      <td className="py-2 px-4 text-slate-400 max-w-xs">
                        <span className="line-clamp-1">{row.text || row.instruction}</span>
                      </td>
                      <td className="py-2 px-4">
                        {row.label !== undefined ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30 text-cyan-400 font-mono">
                            {labels[row.label as number] || row.label}
                          </span>
                        ) : <span className="text-slate-700">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length > 200 && (
              <p className="text-[10px] text-slate-700 text-center py-2 font-mono">
                Affichage limité à 200 sur {rows.length}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Datasets() {
  const [datasets, setDatasets]     = useState<Dataset[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal]           = useState<"hf"|"manual"|"discord"|null>(null);
  const [uploading, setUploading]   = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: "success"|"error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: "success"|"error" = "success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  };

  const fetchDatasets = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const res = await fetch("/api/training/datasets");
      if (res.ok) setDatasets(await res.json());
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    await fetch(`/api/training/datasets/${id}`, { method: "DELETE" });
    fetchDatasets(); showToast("Dataset supprimé");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("name", file.name.replace(/\.[^.]+$/, ""));
    fd.append("type", "chat"); fd.append("format", "jsonl");
    try { await fetch("/api/training/datasets", { method: "POST", body: fd }); fetchDatasets(); showToast("Dataset uploadé ✓"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const totalSamples = datasets.reduce((s, d) => s + d.samples, 0);
  const totalSize    = datasets.reduce((s, d) => s + d.size_bytes, 0);

  // Grouper par type
  const byType = datasets.reduce((acc, d) => {
    if (!acc[d.type]) acc[d.type] = [];
    acc[d.type].push(d);
    return acc;
  }, {} as Record<string, Dataset[]>);

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800/0 hover:[&::-webkit-scrollbar-thumb]:bg-slate-700/50 [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {toast && <Toast msg={toast.msg} type={toast.type} />}

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Datasets
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5 font-mono">
              {loading ? "…" : `${datasets.length} datasets · ${totalSamples.toLocaleString()} samples · ${formatBytes(totalSize)}`}
            </p>
          </div>
          <button onClick={() => fetchDatasets(true)} disabled={refreshing}
            className="p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 text-slate-500 hover:text-slate-200 rounded-xl transition-all disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* ── 4 boutons de création ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Upload JSONL",   icon: <Upload className="w-5 h-5" />,        color: "from-cyan-500 to-blue-500",     action: () => fileInputRef.current?.click(), disabled: uploading },
            { label: "Éditeur manuel", icon: <Edit3 className="w-5 h-5" />,         color: "from-emerald-500 to-teal-500", action: () => setModal("manual") },
            { label: "HuggingFace",    icon: <Globe className="w-5 h-5" />,         color: "from-purple-500 to-indigo-500",action: () => setModal("hf") },
            { label: "Export Discord", icon: <MessageSquare className="w-5 h-5" />, color: "from-indigo-500 to-violet-500",action: () => setModal("discord") },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action} disabled={btn.disabled}
              className="group flex flex-col items-center gap-3 p-4 bg-slate-900/50 border border-slate-800/50 hover:border-slate-700/60 rounded-2xl transition-all disabled:opacity-50">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${btn.color} flex items-center justify-center text-white shadow-lg`}>
                {btn.label === "Upload JSONL" && uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : btn.icon}
              </div>
              <span className="text-slate-300 text-xs font-medium">{btn.label}</span>
            </button>
          ))}
          <input ref={fileInputRef} type="file" accept=".jsonl,.json,.txt,.csv" className="hidden" onChange={handleUpload} />
        </div>

        {/* ── Liste datasets ── */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-900/40 rounded-2xl animate-pulse" />)}
          </div>
        ) : datasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center border border-slate-800/50 rounded-2xl bg-slate-900/20">
            <div className="w-14 h-14 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-center">
              <Database className="w-6 h-6 text-slate-700" />
            </div>
            <div>
              <p className="text-slate-400 font-medium">Aucun dataset</p>
              <p className="text-slate-600 text-sm mt-1">Crée-en un avec les boutons ci-dessus</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byType).map(([type, tDatasets]) => {
              const colors = TYPE_COLOR[type] || "text-slate-400 bg-slate-500/10 border-slate-500/20";
              const textColor = colors.split(' ').find(c => c.startsWith('text-')) ?? 'text-slate-400';
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${textColor}`}>{type}</span>
                    <span className="text-[10px] text-slate-700 font-mono">{tDatasets.length} dataset{tDatasets.length > 1 ? "s" : ""}</span>
                    <div className="flex-1 h-px bg-slate-800/60 ml-1" />
                  </div>
                  <div className="space-y-2">
                    {tDatasets.map(ds => (
                      <DatasetCard key={ds.id} dataset={ds} onDelete={handleDelete} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {modal === "hf"      && <HFImportModal     onClose={() => setModal(null)} onImported={() => { fetchDatasets(); showToast("Import HuggingFace ✓"); }} />}
      {modal === "manual"  && <ManualDatasetModal onClose={() => setModal(null)} onCreated={() => { fetchDatasets(); showToast("Dataset créé ✓"); }} />}
      {modal === "discord" && <DiscordExportModal onClose={() => setModal(null)} onExported={() => { fetchDatasets(); showToast("Export Discord ✓"); }} />}
    </div>
  );
}