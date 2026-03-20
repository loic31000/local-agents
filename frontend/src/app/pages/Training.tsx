import { GraduationCap, Play, Pause, CheckCircle2, Clock, Database, Cpu, Upload } from "lucide-react";

const trainingJobs = [
  {
    id: "job_001",
    name: "Jarvis Coder LoRA",
    status: "completed",
    model: "qwen2.5-coder:7b",
    method: "QLoRA",
    dataset: "jarvis-code-v1",
    samples: 1247,
    epochs: 3,
    startTime: "2026-03-15T10:00:00Z",
    duration: "2h 34m",
    gpuUsage: "80%",
  },
  {
    id: "job_002",
    name: "Security Fine-tune",
    status: "running",
    model: "mistral:7b",
    method: "LoRA",
    dataset: "jarvis-security-v1",
    samples: 856,
    epochs: 2,
    startTime: "2026-03-17T08:30:00Z",
    duration: "1h 12m",
    gpuUsage: "95%",
    progress: 67,
  },
  {
    id: "job_003",
    name: "Vision Model Training",
    status: "pending",
    model: "llava:7b",
    method: "Full",
    dataset: "jarvis-vision-v1",
    samples: 2341,
    epochs: 5,
    startTime: null,
    duration: null,
    gpuUsage: null,
  },
];

const datasets = [
  { name: "jarvis-code-v1", samples: 1247, size: "45 MB", type: "Code", quality: "High" },
  { name: "jarvis-security-v1", samples: 856, size: "32 MB", type: "Security", quality: "High" },
  { name: "jarvis-vision-v1", samples: 2341, size: "128 MB", type: "Vision", quality: "Medium" },
  { name: "jarvis-chat-v1", samples: 3456, size: "78 MB", type: "Chat", quality: "High" },
];

export function Training() {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-400 bg-green-500/10 border-green-500/20";
      case "running":
        return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "pending":
        return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "failed":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      default:
        return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
          Training Pipeline
        </h2>
        <p className="text-slate-400">Fine-tune models with your data</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl p-6 hover:opacity-90 transition-opacity text-left">
          <Play className="w-6 h-6 mb-2" />
          <h3 className="font-semibold mb-1">Start New Training</h3>
          <p className="text-sm opacity-90">Launch a fine-tuning job</p>
        </button>
        <button className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all text-left">
          <Upload className="w-6 h-6 mb-2 text-cyan-400" />
          <h3 className="font-semibold mb-1 text-slate-200">Upload Dataset</h3>
          <p className="text-sm text-slate-400">Add new training data</p>
        </button>
        <button className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all text-left">
          <Database className="w-6 h-6 mb-2 text-cyan-400" />
          <h3 className="font-semibold mb-1 text-slate-200">Collect Data</h3>
          <p className="text-sm text-slate-400">Run dataset collector</p>
        </button>
      </div>

      {/* Training Jobs */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-cyan-400" />
          Training Jobs
        </h3>

        <div className="space-y-4">
          {trainingJobs.map((job) => (
            <div
              key={job.id}
              className="p-4 bg-slate-800/30 rounded-lg border border-slate-800/50"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-slate-200">{job.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs border ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span className="font-mono">{job.model}</span>
                    <span>•</span>
                    <span>{job.method}</span>
                    <span>•</span>
                    <span>{job.samples.toLocaleString()} samples</span>
                    <span>•</span>
                    <span>{job.epochs} epochs</span>
                  </div>
                </div>
                {job.status === "running" ? (
                  <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                    <Pause className="w-4 h-4 text-yellow-400" />
                  </button>
                ) : job.status === "pending" ? (
                  <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                    <Play className="w-4 h-4 text-green-400" />
                  </button>
                ) : null}
              </div>

              {job.progress !== undefined && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-400">Progress</span>
                    <span className="text-cyan-400">{job.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${job.progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="flex items-center gap-1 text-slate-400 mb-1">
                    <Database className="w-3 h-3" />
                    Dataset
                  </div>
                  <div className="text-slate-200">{job.dataset}</div>
                </div>
                {job.duration && (
                  <div>
                    <div className="flex items-center gap-1 text-slate-400 mb-1">
                      <Clock className="w-3 h-3" />
                      Duration
                    </div>
                    <div className="text-slate-200">{job.duration}</div>
                  </div>
                )}
                {job.gpuUsage && (
                  <div>
                    <div className="flex items-center gap-1 text-slate-400 mb-1">
                      <Cpu className="w-3 h-3" />
                      GPU Usage
                    </div>
                    <div className="text-slate-200">{job.gpuUsage}</div>
                  </div>
                )}
                {job.status === "completed" && (
                  <div>
                    <div className="flex items-center gap-1 text-slate-400 mb-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Status
                    </div>
                    <div className="text-green-400">Success</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Datasets */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          Available Datasets
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {datasets.map((dataset) => (
            <div
              key={dataset.name}
              className="p-4 bg-slate-800/30 rounded-lg border border-slate-800/50 hover:border-slate-700 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-slate-200 mb-1">{dataset.name}</h4>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{dataset.samples.toLocaleString()} samples</span>
                    <span>•</span>
                    <span>{dataset.size}</span>
                  </div>
                </div>
                <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                  {dataset.type}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    dataset.quality === "High" ? "bg-green-400" : "bg-yellow-400"
                  }`}></div>
                  <span className="text-sm text-slate-400">Quality: {dataset.quality}</span>
                </div>
                <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs transition-colors">
                  Use
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
