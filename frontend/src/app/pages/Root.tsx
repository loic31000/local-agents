import { Outlet, Link, useLocation } from "react-router";
import { 
  LayoutDashboard, 
  MessageSquare, 
  Bot, 
  Database, 
  Shield, 
  GraduationCap, 
  Activity, 
  Settings,
  Menu,
  X,
  Cpu
} from "lucide-react";
import { useState } from "react";
import { AgentsProvider } from "../contexts/AgentsContext";


export function Root() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);


  const navigation = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Chat", path: "/chat", icon: MessageSquare },
    { name: "Agents", path: "/agents", icon: Bot },
    { name: "Models", path: "/models", icon: Database },
    { name: "CyberDefence", path: "/cyber", icon: Shield },
    { name: "Training", path: "/training", icon: GraduationCap },
    { name: "Observability", path: "/observability", icon: Activity },
    { name: "Settings", path: "/settings", icon: Settings },
  ];


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors lg:hidden"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  JARVIS
                </h1>
                <p className="text-xs text-slate-400">Agent Operating System</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-slate-300">Online</span>
            </div>
          </div>
        </div>
      </header>


      <div className="flex pt-16">
        {/* Sidebar */}
        <aside
          className={`fixed left-0 top-16 bottom-0 z-40 w-64 bg-slate-900/50 backdrop-blur-md border-r border-slate-800 transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0`}
        >
          <nav className="p-4 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === "/" 
                ? location.pathname === "/" 
                : location.pathname.startsWith(item.path);
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-400 border border-cyan-500/20"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>


        {/* Main Content */}
        <main className="flex-1 lg:ml-64 p-6 overflow-auto">
          <AgentsProvider>
            <Outlet />
          </AgentsProvider>
        </main>
      </div>
    </div>
  );
}
