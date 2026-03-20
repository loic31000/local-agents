import { Shield, AlertTriangle, CheckCircle, XCircle, Ban, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const securityMetrics = [
  { time: "00:00", threats: 2, blocked: 2 },
  { time: "04:00", threats: 1, blocked: 1 },
  { time: "08:00", threats: 5, blocked: 4 },
  { time: "12:00", threats: 8, blocked: 7 },
  { time: "16:00", threats: 6, blocked: 6 },
  { time: "20:00", threats: 3, blocked: 3 },
];

const securityEvents = [
  {
    id: "evt_001",
    severity: "WARNING",
    type: "PROMPT_INJECTION",
    description: "Suspected jailbreak attempt detected",
    timestamp: "2026-03-17T14:23:00Z",
    ip: "192.168.1.45",
    status: "blocked",
  },
  {
    id: "evt_002",
    severity: "INFO",
    type: "RATE_LIMIT",
    description: "Rate limit reached for user session",
    timestamp: "2026-03-17T13:45:00Z",
    ip: "192.168.1.67",
    status: "throttled",
  },
  {
    id: "evt_003",
    severity: "CRITICAL",
    type: "PROMPT_INJECTION",
    description: "Multiple injection attempts from same IP",
    timestamp: "2026-03-17T12:10:00Z",
    ip: "203.45.67.89",
    status: "blocked",
  },
  {
    id: "evt_004",
    severity: "WARNING",
    type: "SUSPICIOUS_PAYLOAD",
    description: "Unusual request pattern detected",
    timestamp: "2026-03-17T11:30:00Z",
    ip: "192.168.1.89",
    status: "flagged",
  },
];

const stats = [
  { label: "Total Events", value: "247", color: "from-cyan-500 to-blue-500" },
  { label: "Blocked Threats", value: "23", color: "from-red-500 to-pink-500" },
  { label: "Success Rate", value: "98.7%", color: "from-green-500 to-emerald-500" },
  { label: "Avg Response", value: "12ms", color: "from-yellow-500 to-orange-500" },
];

export function CyberDefence() {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      case "WARNING":
        return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "INFO":
        return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      default:
        return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "blocked":
        return <Ban className="w-4 h-4 text-red-400" />;
      case "throttled":
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case "flagged":
        return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      default:
        return <CheckCircle className="w-4 h-4 text-green-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
          CyberDefence
        </h2>
        <p className="text-slate-400">Security monitoring and threat detection</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6"
          >
            <p className="text-slate-400 text-sm mb-2">{stat.label}</p>
            <p className={`text-3xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Security Metrics Chart */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          Security Events Timeline
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={securityMetrics}>
            <defs>
              <linearGradient id="colorThreats" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Area
              type="monotone"
              dataKey="threats"
              stroke="#ef4444"
              fillOpacity={1}
              fill="url(#colorThreats)"
              name="Threats Detected"
              key="threats"
            />
            <Area
              type="monotone"
              dataKey="blocked"
              stroke="#10b981"
              fillOpacity={1}
              fill="url(#colorBlocked)"
              name="Threats Blocked"
              key="blocked"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Security Events */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Recent Security Events
          </h3>
          <button className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded-lg text-sm transition-colors">
            View All
          </button>
        </div>

        <div className="space-y-3">
          {securityEvents.map((event) => (
            <div
              key={event.id}
              className={`p-4 rounded-lg border ${getSeverityColor(event.severity)}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  {getStatusIcon(event.status)}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-200">{event.type}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(event.severity)}`}>
                        {event.severity}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300">{event.description}</p>
                  </div>
                </div>
                <button className="px-3 py-1 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded text-xs transition-colors">
                  Details
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/50">
                <span>IP: {event.ip}</span>
                <span>•</span>
                <span>{new Date(event.timestamp).toLocaleString()}</span>
                <span>•</span>
                <span className="capitalize">{event.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}