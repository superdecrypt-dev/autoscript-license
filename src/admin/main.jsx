import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "../shared/ui.jsx";
import { getAdminConfig } from "../shared/config.js";
import {
  formatDate,
  formatRelativeTime,
  statusLabel,
  statusTone,
} from "../shared/utils.js";
import {
  Activity,
  BarChart3,
  Database,
  History,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Users,
} from "lucide-react";

function AdminApp() {
  const config = useMemo(() => getAdminConfig(), []);
  const [activeView, setActiveView] = useState("dashboard");
  const [authStatus, setAuthStatus] = useState("authenticated"); // Simplified for redesign demo
  const [session, setSession] = useState({ admin_email: "admin@autoscript.io" });
  const [entries, setEntries] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  // Mock data for immediate visual feedback during redesign
  useEffect(() => {
    setEntries([
      { id: "1", ip: "123.45.67.89", label: "Production Web", owner: "Marketing", effective_status: "active", expires_at: new Date(Date.now() + 864000000).toISOString() },
      { id: "2", ip: "192.168.1.1", label: "Staging API", owner: "DevOps", effective_status: "expired", expires_at: new Date(Date.now() - 86400000).toISOString() },
      { id: "3", ip: "45.12.33.102", label: "Client VPS-A", owner: "Hansen", effective_status: "revoked", expires_at: new Date(Date.now() + 400000000).toISOString() },
    ]);
    setMetrics({
      summary: { active_entries: 42, expired_entries: 5, revoked_entries: 2, total_entries: 49 },
    });
  }, []);

  const navItems = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "entries", label: "Licenses", icon: Shield },
    { id: "audit", label: "Audit Log", icon: History },
    { id: "settings", label: "System", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-[#020617] text-slate-200">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-slate-900/50 backdrop-blur-xl flex flex-col fixed inset-y-0">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="size-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)]">
              <Shield className="size-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Autoscript</span>
          </div>
          
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeView === item.id 
                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-bold border border-indigo-500/30">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{session.admin_email}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        <header className="flex items-center justify-between mb-10 page-enter">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {navItems.find(n => n.id === activeView)?.label}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Manage your licensing infrastructure and monitor IP health.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm">
              <RefreshCw className="size-4" />
              Sync Data
            </Button>
            <Button size="sm">
              <Plus className="size-4" />
              New Entry
            </Button>
          </div>
        </header>

        {activeView === "dashboard" && (
          <div className="space-y-8 page-enter stagger-1">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Active Licenses" value={metrics?.summary?.active_entries || 0} icon={Shield} color="emerald" />
              <StatCard title="Expired" value={metrics?.summary?.expired_entries || 0} icon={Activity} color="amber" />
              <StatCard title="Revoked" value={metrics?.summary?.revoked_entries || 0} icon={Users} color="rose" />
              <StatCard title="System Health" value="99.9%" icon={BarChart3} color="indigo" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Recent Licenses</CardTitle>
                  <CardDescription>Latest IP addresses registered in the system.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-white/5 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>IP Address</TableHead>
                          <TableHead>Label</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Expiry</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono text-indigo-400 font-medium">{entry.ip}</TableCell>
                            <TableCell>{entry.label}</TableCell>
                            <TableCell>
                              <Badge variant={statusTone(entry.effective_status)}>{entry.effective_status}</Badge>
                            </TableCell>
                            <TableCell className="text-slate-400">{formatDate(entry.expires_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Audit Summary</CardTitle>
                  <CardDescription>Recent system activities.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ActivityItem type="Activation" ip="123.45.67.89" time="2 mins ago" />
                  <ActivityItem type="Status Check" ip="45.11.2.9" time="15 mins ago" />
                  <ActivityItem type="Renewal" ip="192.168.1.1" time="1 hour ago" />
                  <ActivityItem type="Revocation" ip="8.8.8.8" time="3 hours ago" />
                  <Button variant="ghost" className="w-full text-xs" onClick={() => setActiveView("audit")}>
                    View All Activity
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeView === "entries" && (
          <div className="space-y-6 page-enter stagger-1">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex-1 max-w-md relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                    <Input className="pl-10" placeholder="Search by IP, label, or owner..." />
                  </div>
                  <div className="flex items-center gap-3">
                    <Select defaultValue="all">
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Identity</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div className="font-mono text-indigo-400 font-medium">{entry.ip}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{entry.label}</div>
                          </TableCell>
                          <TableCell>{entry.owner}</TableCell>
                          <TableCell>
                            <Badge variant={statusTone(entry.effective_status)}>{entry.effective_status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{formatDate(entry.expires_at)}</div>
                            <div className="text-[10px] text-slate-500 uppercase mt-0.5">{formatRelativeTime(entry.expires_at)}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">Manage</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
  const colors = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  };
  return (
    <Card className="hover:translate-y-[-4px]">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn("size-10 rounded-xl flex items-center justify-center border", colors[color])}>
            <Icon className="size-5" />
          </div>
          <Badge variant="slate">+12%</Badge>
        </div>
        <div className="text-2xl font-bold text-white mb-1">{value}</div>
        <div className="text-sm text-slate-500">{title}</div>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ type, ip, time }) {
  return (
    <div className="flex items-start gap-3">
      <div className="size-2 rounded-full bg-indigo-500 mt-2" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200">{type}</p>
        <p className="text-xs text-indigo-400 font-mono mt-0.5">{ip}</p>
        <p className="text-[10px] text-slate-500 uppercase mt-1 tracking-wider">{time}</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<AdminApp />);
