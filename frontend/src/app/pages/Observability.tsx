import { Activity, Zap, Server, HardDrive, TrendingUp, AlertCircle } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const latencyData = [
  { time: "00:00", p50: 85, p95: 145, p99: 210 },
  { time: "04:00", p50: 78, p95: 132, p99: 195 },
  { time: "08:00", p50: 92, p95: 168, p99: 245 },
  { time: "12:00", p50: 105, p95: 189, p99: 278 },
  { time: "16:00", p50: 98, p95: 175, p99: 256 },
  { time: "20:00", p50: 88, p95: 152, p99: 220 },
];

const requestsData = [
  { time: "00:00", success: 42, error: 3 },
  { time: "04:00", success: 31, error: 1 },
  { time: "08:00", success: 85, error: 4 },
  { time: "12:00", success: 148, error: 8 },
  { time: "16:00", success: 129, error: 5 },
  { time: "20:00", success: 94, error: 4 },
];

const systemMetrics = [
  { name: "CPU Usage", value: "45%", status: "healthy", icon: Server },
  { name: "Memory", value: "12.4 GB / 32 GB", status: "healthy", icon: HardDrive },
  { name: "GPU Usage", value: "78%", status: "warning", icon: Zap },
  { name: "Disk I/O", value: "234 MB/s", status: "healthy", icon: Activity },
];

const errorLogs = [
  {
    timestamp: "2026-03-17T14:45:23Z",
    level: "ERROR",
    service: "ollama-backend",
    message: "Model loading timeout after 30s",
    requestId: "req_abc123",
  },
  {
    timestamp: "2026-03-17T13:22:15Z",
    level: "WARNING",
    service: "vision-agent",
    message: "High GPU memory usage detected",
    requestId: "req_def456",
  },
  {
    timestamp: "2026-03-17T12:10:45Z",
    level: "ERROR",
    service: "coder-agent",
    message: "Failed to connect to Redis cache",
    requestId: "req_ghi789",
  },
];

export function Observability() {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-400";
      case "warning":
        return "text-yellow-400";
      case "critical":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case "ERROR":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      case "WARNING":
        return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "INFO":
        return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      default:
        return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
          Observability
        </h2>
        <p className="text-slate-400">Monitor system health and performance</p>
      </div>

      {/* System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {systemMetrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.name}
              className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6"
            >
              <div className="flex items-start justify-between mb-3">
                <Icon className={`w-6 h-6 ${getStatusColor(metric.status)}`} />
                <div className={`w-2 h-2 rounded-full ${
                  metric.status === "healthy" ? "bg-green-400" : "bg-yellow-400"
                } animate-pulse`}></div>
              </div>
              <p className="text-slate-400 text-sm mb-1">{metric.name}</p>
              <p className="text-xl font-semibold text-slate-200">{metric.value}</p>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency Chart */}
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Response Latency
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={latencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="p50" stroke="#10b981" name="p50" strokeWidth={2} />
              <Line type="monotone" dataKey="p95" stroke="#f59e0b" name="p95" strokeWidth={2} />
              <Line type="monotone" dataKey="p99" stroke="#ef4444" name="p99" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Requests Chart */}
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Requests per Hour
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={requestsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar dataKey="success" fill="#10b981" name="Success" radius={[8, 8, 0, 0]} key="success" />
              <Bar dataKey="error" fill="#ef4444" name="Error" radius={[8, 8, 0, 0]} key="error" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Error Logs */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-cyan-400" />
            Recent Logs
          </h3>
          <button className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded-lg text-sm transition-colors">
            View All Logs
          </button>
        </div>

        <div className="space-y-3">
          {errorLogs.map((log, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${getLogColor(log.level)}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLogColor(log.level)}`}>
                      {log.level}
                    </span>
                    <span className="text-sm text-slate-400">{log.service}</span>
                    <span className="text-xs text-slate-500 font-mono">{log.requestId}</span>
                  </div>
                  <p className="text-sm text-slate-200">{log.message}</p>
                </div>
                <button className="px-3 py-1 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded text-xs transition-colors">
                  Details
                </button>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                {new Date(log.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h4 className="text-slate-400 text-sm mb-2">Availability</h4>
          <p className="text-3xl font-bold text-green-400 mb-1">99.87%</p>
          <p className="text-xs text-slate-500">Last 24 hours</p>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h4 className="text-slate-400 text-sm mb-2">Error Rate</h4>
          <p className="text-3xl font-bold text-yellow-400 mb-1">1.3%</p>
          <p className="text-xs text-slate-500">Last 24 hours</p>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h4 className="text-slate-400 text-sm mb-2">Avg Response Time</h4>
          <p className="text-3xl font-bold text-cyan-400 mb-1">142ms</p>
          <p className="text-xs text-slate-500">Last 24 hours</p>
        </div>
      </div>
    </div>
  );
}