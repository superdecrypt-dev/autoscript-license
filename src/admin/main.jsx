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
  statusLabel,
  statusTone,
} from "../shared/utils.js";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Database,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";

function AdminApp() {
  const config = useMemo(() => getAdminConfig(), []);
  const [activeView, setActiveView] = useState("dashboard");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Mock data for immediate preview
    setEntries([
      { id: "1", ip: "123.45.67.89", label: "Main Web Server", owner: "John Doe", effective_status: "active", expires_at: new Date(Date.now() + 864000000).toISOString() },
      { id: "2", ip: "192.168.1.10", label: "Database Primary", owner: "Jane Smith", effective_status: "expired", expires_at: new Date(Date.now() - 3600000).toISOString() },
      { id: "3", ip: "45.12.33.102", label: "Edge Proxy", owner: "System", effective_status: "revoked", expires_at: new Date().toISOString() },
    ]);
  }, []);

  const menu = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "entries", label: "Licenses", icon: ShieldCheck },
    { id: "audit", label: "Audit Logs", icon: History },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 flex flex-col fixed inset-y-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <ShieldCheck className="text-blue-400 size-6" />
            <span>License Console</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {menu.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                activeView === item.id 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <LogOut className="size-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8 page-enter">
        <header className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {menu.find(m => m.id === activeView)?.label}
            </h1>
            <p className="text-sm text-slate-500 font-medium">System Operator View</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" size="sm">Export CSV</Button>
            <Button size="sm"><Plus className="size-4" />New Entry</Button>
          </div>
        </header>

        {activeView === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard title="Active Entries" value="1,284" icon={ShieldCheck} color="text-blue-600" />
              <StatCard title="Total Volume" value="48k" icon={BarChart3} color="text-emerald-600" />
              <StatCard title="Security Score" value="98%" icon={Activity} color="text-indigo-600" />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Monitor the latest changes and status checks.</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="text-blue-600 font-bold">View Reports <ChevronRight className="ml-1 size-4" /></Button>
              </CardHeader>
              <CardContent>
                <div className="border border-slate-100 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Identity</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Sync</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div className="font-bold text-slate-900">{entry.ip}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">{entry.label}</div>
                          </TableCell>
                          <TableCell className="text-slate-600 text-sm">{entry.owner}</TableCell>
                          <TableCell>
                            <Badge variant={statusTone(entry.effective_status)}>{entry.effective_status}</Badge>
                          </TableCell>
                          <TableCell className="text-slate-500 text-xs font-medium">{formatDate(entry.expires_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeView === "entries" && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input className="pl-10" placeholder="Search licenses by IP, Owner, or Label..." />
              </div>
              <Select defaultValue="all">
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Identity</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Manage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-sm font-bold">{entry.ip}</TableCell>
                        <TableCell>
                          <div className="text-sm font-bold">{entry.owner}</div>
                          <div className="text-xs text-slate-400">{entry.label}</div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 font-medium">{formatDate(entry.expires_at)}</TableCell>
                        <TableCell><Badge variant={statusTone(entry.effective_status)}>{entry.effective_status}</Badge></TableCell>
                        <TableCell className="text-right"><Button variant="secondary" size="sm">Edit</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
  return (
    <Card className="hover:border-blue-200 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-2 rounded-lg bg-slate-50 border border-slate-100 ${color}`}>
            <Icon className="size-5" />
          </div>
          <span className="text-emerald-500 text-xs font-bold">+5.2%</span>
        </div>
        <div className="text-3xl font-bold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500 font-semibold">{title}</div>
      </CardContent>
    </Card>
  );
}

createRoot(document.getElementById("root")).render(<AdminApp />);
