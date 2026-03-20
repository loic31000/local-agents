import { Database, Download, Trash2, Play, Pause, HardDrive, Cpu } from "lucide-react";
import { useState } from "react";

const backends = [
  { id: "mock", name: "Mock Backend", status: "inactive" },
  { id: "ollama", name: "Ollama Backend", status: "active" },
  { id: "gguf", name: "GGUF Backend", status: "inactive" },
];

const models = [
  {
    id: "qwen2.5-coder-1.5b",
    name: "qwen2.5-coder:1.5b",
    backend: "ollama",
    size: "1.8 GB",
    status: "active",
    downloads: 2847,
    performance: "Fast",
    useCase: "Code generation",
  },
  {
    id: "llava-7b",
    name: "llava:7b",
    backend: "ollama",
    size: "4.2 GB",
    status: "active",
    downloads: 1234,
    performance: "Medium",
    useCase: "Vision & multimodal",
  },
  {
    id: "mistral-7b",
    name: "mistral:7b",
    backend: "ollama",
    size: "4.1 GB",
    status: "inactive",
    downloads: 3421,
    performance: "Fast",
    useCase: "General chat",
  },
  {
    id: "custom-jarvis",
    name: "jarvis-coder-custom",
    backend: "gguf",
    size: "2.3 GB",
    status: "inactive",
    downloads: 0,
    performance: "Very Fast",
    useCase: "Fine-tuned coding",
  },
];

export function Models() {
  const [activeBackend, setActiveBackend] = useState("ollama");

  return (
    <div className="space-y-6">
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
          {backends.map((backend) => (
            <button
              key={backend.id}
              onClick={() => setActiveBackend(backend.id)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                activeBackend === backend.id
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-slate-800 bg-slate-800/30 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-200">{backend.name}</span>
                <div
                  className={`w-2 h-2 rounded-full ${
                    backend.status === "active" ? "bg-green-400" : "bg-slate-600"
                  }`}
                ></div>
              </div>
              <span
                className={`text-xs ${
                  backend.status === "active" ? "text-green-400" : "text-slate-500"
                }`}
              >
                {backend.status === "active" ? "Active" : "Inactive"}
              </span>
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
          <button className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2">
            <Download className="w-4 h-4" />
            Pull New Model
          </button>
        </div>

        <div className="space-y-4">
          {models.map((model) => (
            <div
              key={model.id}
              className="p-4 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-all border border-slate-800/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-slate-200 font-mono">{model.name}</h4>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        model.status === "active"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {model.status}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">
                      {model.backend}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">{model.useCase}</p>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2 text-slate-400">
                      <HardDrive className="w-4 h-4" />
                      <span>{model.size}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <Download className="w-4 h-4" />
                      <span>{model.downloads.toLocaleString()} uses</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <Cpu className="w-4 h-4" />
                      <span>{model.performance}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {model.status === "active" ? (
                    <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                      <Pause className="w-4 h-4 text-yellow-400" />
                    </button>
                  ) : (
                    <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                      <Play className="w-4 h-4 text-green-400" />
                    </button>
                  )}
                  <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
