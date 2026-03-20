import { useState, useEffect } from "react";
import {
  Database, Download, Trash2, Play, Pause, HardDrive, Cpu, RefreshCw, X, Loader2, CheckCircle2, AlertCircle
} from "lucide-react";

interface Model {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
}

interface BackendInfo {
  backend: string;
  available: string[];
}

export function Models() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [backend, setBackend] = useState<BackendInfo | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [pullModal, setPullModal] = useState(false);
  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [pullStatus, setPullStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Charger les modèles
  const fetchModels = async () => {
    try {
      const res = await fetch("/api/ollama/models");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setModels(data.models || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Charger le backend actif
  const fetchBackend = async () => {
    try {
      const res = await fetch("/api/backend");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBackend(data);
    } catch (err) {
      console.error("Erreur backend:", err);
    }
  };

  useEffect(() => {
    fetchModels();
    fetchBackend();
    const interval = setInterval(fetchModels, 30000); // rafraîchit toutes les 30s
    return () => clearInterval(interval);
  }, []);

  // Changer de backend
  const switchBackend = async (target: string) => {
    setSwitching(target);
    try {
      const res = await fetch("/api/backend/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backend: target }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchBackend(); // recharger le statut
      // Recharger les modèles (les backends comme GGUF ont leurs propres modèles)
      fetchModels();
    } catch (err: any) {
      setError(`Erreur lors du changement de backend : ${err.message}`);
    } finally {
      setSwitching(null);
    }
  };

  // Télécharger un modèle
  const pullModel = async () => {
    if (!pullName.trim()) return;
    setPulling(true);
    setPullProgress(0);
    setPullStatus("Préparation...");
    try {
      const response = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pullName, stream: true }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.trim());
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status) setPullStatus(data.status);
            if (data.total && data.completed) {
              const percent = (data.completed / data.total) * 100;
              setPullProgress(percent);
            }
          } catch {}
        }
      }
      setPullModal(false);
      setPullName("");
      fetchModels(); // recharger la liste
    } catch (err: any) {
      setError(`Erreur de téléchargement : ${err.message}`);
    } finally {
      setPulling(false);
      setPullProgress(0);
    }
  };

  // Supprimer un modèle
  const deleteModel = async (name: string) => {
    if (!confirm(`Supprimer définitivement le modèle "${name}" ?`)) return;
    setDeleting(name);
    try {
      const res = await fetch("/api/ollama/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchModels();
    } catch (err: any) {
      setError(`Erreur de suppression : ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  // Formater la taille
  const formatSize = (bytes: number) => {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    return `${size.toFixed(1)} ${units[unit]}`;
  };

  // Définir les couleurs des backends
  const backendColors: Record<string, string> = {
    ollama: "#3b82f6",
    mock: "#f59e0b",
    gguf: "#10b981",
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
          Models
        </h2>
        <p className="text-slate-400">Manage LLM models and backends</p>
      </div>

      {/* Backend Selection */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-cyan-400" />
          Backend Selection
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {backend?.available.map((b) => (
            <button
              key={b}
              onClick={() => switchBackend(b)}
              disabled={switching === b}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                backend.backend === b
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-slate-800 bg-slate-800/30 hover:border-slate-700"
              } ${switching === b ? "opacity-50 cursor-wait" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-200 capitalize">{b}</span>
                {backend.backend === b && (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                )}
              </div>
              {switching === b ? (
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              ) : (
                <span className="text-xs text-slate-500">
                  {backend.backend === b ? "Actif" : "Inactif"}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Models List */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            Available Models
          </h3>
          <div className="flex gap-2">
            <button
              onClick={fetchModels}
              className="px-3 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded-lg text-sm transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPullModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Pull New Model
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-800/30 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : models.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>Aucun modèle installé</p>
            <p className="text-sm">Utilisez le bouton "Pull New Model" pour en télécharger un.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {models.map((model) => (
              <div
                key={model.name}
                className="p-4 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-all border border-slate-800/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h4 className="font-semibold text-slate-200 font-mono text-sm">
                        {model.name}
                      </h4>
                      <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">
                        {backend?.backend}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm flex-wrap">
                      <div className="flex items-center gap-2 text-slate-400">
                        <HardDrive className="w-4 h-4" />
                        <span>{formatSize(model.size)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Cpu className="w-4 h-4" />
                        <span>{model.digest.substring(0, 12)}...</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => deleteModel(model.name)}
                      disabled={deleting === model.name}
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting === model.name ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-red-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Pull Model */}
      {pullModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-slate-100">Télécharger un modèle</h3>
                <p className="text-xs text-slate-400">Exemples : llama3.2:3b, mistral:7b</p>
              </div>
              <button
                onClick={() => setPullModal(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={pullName}
                onChange={(e) => setPullName(e.target.value)}
                placeholder="Nom du modèle (ex: llama3.2:3b)"
                className="w-full bg-slate-800 text-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 border border-slate-700"
              />

              {pulling && (
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>{pullStatus}</span>
                    <span>{Math.round(pullProgress)}%</span>
                  </div>
                  <div className="bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-2 transition-all duration-300"
                      style={{ width: `${pullProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setPullModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={pullModel}
                  disabled={!pullName.trim() || pulling}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {pulling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {pulling ? "Téléchargement..." : "Télécharger"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}