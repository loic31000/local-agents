import { Settings as SettingsIcon, User, Bell, Shield, Database, Palette } from "lucide-react";

export function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
          Settings
        </h2>
        <p className="text-slate-400">Configure your JARVIS platform</p>
      </div>

      {/* Settings Sections */}
      <div className="space-y-4">
        {/* User Profile */}
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-cyan-400" />
            User Profile
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Display Name</label>
              <input
                type="text"
                defaultValue="Admin User"
                className="w-full bg-slate-800/50 text-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Email</label>
              <input
                type="email"
                defaultValue="admin@jarvis.ai"
                className="w-full bg-slate-800/50 text-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Role</label>
              <div className="px-4 py-2 bg-slate-800/30 text-slate-300 rounded-lg">
                Administrator
              </div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            Notifications
          </h3>
          <div className="space-y-3">
            {[
              { label: "Security Alerts", description: "Get notified about security events" },
              { label: "Agent Status", description: "Receive updates on agent status changes" },
              { label: "Training Jobs", description: "Notifications for training job completion" },
              { label: "System Updates", description: "Important system announcements" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div>
                  <p className="text-slate-200 font-medium">{item.label}</p>
                  <p className="text-sm text-slate-400">{item.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Security
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <div>
                <p className="text-slate-200 font-medium">Rate Limiting</p>
                <p className="text-sm text-slate-400">Limit requests per user</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <div>
                <p className="text-slate-200 font-medium">Prompt Injection Detection</p>
                <p className="text-sm text-slate-400">Detect and block malicious prompts</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <div>
                <p className="text-slate-200 font-medium">Audit Logging</p>
                <p className="text-sm text-slate-400">Log all critical actions</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>
          </div>
        </div>

        {/* System */}
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            System Configuration
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Context Memory Limit</label>
              <input
                type="number"
                defaultValue="10"
                className="w-full bg-slate-800/50 text-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Request Timeout (seconds)</label>
              <input
                type="number"
                defaultValue="30"
                className="w-full bg-slate-800/50 text-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Max Concurrent Requests</label>
              <input
                type="number"
                defaultValue="100"
                className="w-full bg-slate-800/50 text-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button className="px-6 py-3 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded-lg transition-colors">
          Cancel
        </button>
        <button className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity">
          Save Changes
        </button>
      </div>
    </div>
  );
}
