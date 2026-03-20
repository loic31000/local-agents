import { useState } from "react";
import {
  Bot, CheckCircle2, XCircle, Settings,
  RefreshCw, X, Save, Play, Pause,
} from "lucide-react";
import { useAgents } from "../contexts/AgentsContext";
import type { Agent } from "../contexts/AgentsContext";

// ─── Modèles disponibles (synchronisés avec Ollama) ───────────────────────────

const AVAILABLE_MODELS = [
  "qwen2.5-coder:1.5b",
  "llama3.2:latest",
  "llama3.2:3b",
  "mistral:7b-instruct-q4_0",
  "phi4-mini:latest",
  "gemma3:1b",
  "smollm2:1.7b",
  "smollm2:360m",
  "qwen2.5:0.5b",
  "tinyllama:latest",
];

// ─── Modal de configuration ───────────────────────────────────────────────────

interface ConfigModalProps {
  agent: Agent;
  onClose: () => void;
  onSave: (updated: Agent) => void;
}

function ConfigModal({ agent, onClose, onSave }: ConfigModalProps) {
  const [form, setForm] = useState({ ...agent });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } catch { /* fallback local */ }
    setTimeout(() => { onSave(form); setSaving(false); onClose(); }, 400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 capitalize">{agent.name}</h3>
              <p className="text-xs text-slate-400">Configuration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Description */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 border border-slate-700"
            />
          </div>

          {/* Modèle LLM */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Modèle LLM</label>
            <select
              value={form.model}
              onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
              className="w-full bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 border border-slate-700"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              {/* Afficher le modèle actuel même s'il n'est pas dans la liste */}
              {!AVAILABLE_MODELS.includes(form.model) && (
                <option value={form.model}>{form.model} (actuel)</option>
              )}
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              Le modèle sera utilisé pour toutes les nouvelles conversations de cet agent.
            </p>
          </div>

          {/* Activé / désactivé */}
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div>
              <span className="text-sm text-slate-300">Agent activé</span>
              <p className="text-xs text-slate-500 mt-0.5">
                {form.enabled ? "L'agent répond aux messages" : "L'agent est hors ligne"}
              </p>
            </div>
            <button
              onClick={() => setForm((p) => ({ ...p, enabled: !p.enabled }))}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.enabled ? "bg-cyan-500" : "bg-slate-600"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.enabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page Agents ──────────────────────────────────────────────────────────────

export function Agents() {
  const { agents, loading, error, refreshAgents, updateAgent } = useAgents();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAgents();
    setRefreshing(false);
  };

  const toggleAgent = async (agent: Agent) => {
    setTogglingId(agent.id);
    const newEnabled = !agent.enabled;
    try {
      await fetch(`/api/agents/${agent.id}/${newEnabled ? "start" : "stop"}`, { method: "POST" });
    } catch { /* fallback */ }
    setTimeout(() => {
      updateAgent({ ...agent, enabled: newEnabled });
      setTogglingId(null);
      showToast(`Agent "${agent.name}" ${newEnabled ? "démarré ✓" : "arrêté"}`);
    }, 500);
  };

  const saveAgent = (updated: Agent) => {
    updateAgent(updated);
    showToast(`Configuration de "${updated.name}" sauvegardée ✓`);
  };

  const activeCount = agents.filter((a) => a.enabled).length;

  return (
    <div className="space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border bg-green-900/80 border-green-700 text-green-200 text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-1">
            Agents
          </h2>
          <p className="text-slate-400 text-sm">
            {loading ? "Chargement..." : `${activeCount}/${agents.length} agents actifs`}
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

      {/* Erreur */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-900/30 border border-red-800/50 rounded-xl text-red-300 text-sm">
          <XCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Agents actifs", value: `${activeCount}/${agents.length}`, color: "text-green-400" },
            { label: "Modèles distincts", value: new Set(agents.map(a => a.model)).size, color: "text-cyan-400" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-slate-900/50 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Cartes agents */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`bg-slate-900/50 backdrop-blur-md border rounded-xl p-6 transition-all ${
                agent.enabled
                  ? "border-slate-800 hover:border-slate-700"
                  : "border-slate-800/50 opacity-60"
              }`}
            >
              {/* En-tête carte */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center ${!agent.enabled ? "grayscale" : ""}`}>
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-slate-100 capitalize">{agent.name}</h3>
                    <p className="text-sm text-slate-400">{agent.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {agent.enabled
                    ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                    : <XCircle className="w-5 h-5 text-red-400" />}
                  <button
                    onClick={() => setSelectedAgent(agent)}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Settings className="w-4 h-4 text-slate-400 hover:text-slate-200" />
                  </button>
                </div>
              </div>

              {/* Modèle */}
              <div className="flex items-center justify-between text-sm mb-4">
                <span className="text-slate-400">Modèle</span>
                <span className="text-slate-200 font-mono text-xs bg-slate-800/60 px-2 py-1 rounded">
                  {agent.model}
                </span>
              </div>

              {/* Boutons */}
              <div className="flex gap-2">
                <button
                  onClick={() => toggleAgent(agent)}
                  disabled={togglingId === agent.id}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm transition-all flex items-center justify-center gap-2 ${
                    agent.enabled
                      ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                      : "bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20"
                  }`}
                >
                  {togglingId === agent.id
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : agent.enabled
                    ? <><Pause className="w-4 h-4" />Arrêter</>
                    : <><Play className="w-4 h-4" />Démarrer</>}
                </button>
                <button
                  onClick={() => setSelectedAgent(agent)}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:opacity-90 text-white rounded-lg text-sm transition-opacity flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" />Configurer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {selectedAgent && (
        <ConfigModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onSave={(updated) => { saveAgent(updated); setSelectedAgent(null); }}
        />
      )}
    </div>
  );
}