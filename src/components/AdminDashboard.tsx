import { useState, useMemo } from 'react';
import { 
  ShieldAlert, 
  Users, 
  Building2, 
  Droplet, 
  FileText, 
  Calendar, 
  Database, 
  Activity, 
  BarChart3, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  RefreshCw,
  Clock,
  Download,
  Filter
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line, 
  Legend 
} from 'recharts';
import { User, BloodGroup } from '../types';
import { db } from '../db/databaseStore';
import AdminDonorManagement from './AdminDonorManagement';
import AdminRbacPanel from './AdminRbacPanel';
import { UnderlineTabs } from './ui/UnderlineTabs';
import { useDatabaseSubscription } from '../hooks/useDatabaseSubscription';

interface AdminDashboardProps {
  currentUser: User;
  onNavigate: (view: string) => void;
  onOpenDatabase?: () => void;
}

export default function AdminDashboard({ currentUser, onNavigate, onOpenDatabase }: AdminDashboardProps) {
  const [activeSection, setActiveSection] = useState<'analytics' | 'rbac' | 'donors' | 'hospitals' | 'inventory' | 'audit'>('analytics');
  const [searchQuery, setSearchQuery] = useState('');
  const refreshKey = useDatabaseSubscription();
  const canManageDb = (currentUser.permissions ?? []).includes('db:manage');

  // Collections from store
  const donors = useMemo(() => db.getDonors(), [refreshKey]);
  const hospitals = useMemo(() => db.getHospitals(), [refreshKey]);
  const bloodUnits = useMemo(() => db.getBloodUnits(), [refreshKey]);
  const requests = useMemo(() => db.getRequests(), [refreshKey]);
  const auditLogs = useMemo(() => db.getAuditLogs(), [refreshKey]);
  const camps = useMemo(() => db.getCamps(), [refreshKey]);
  const inventorySummary = useMemo(() => db.getLiveBloodAvailability(), [refreshKey]);

  // Chart 1: Inventory by Blood Group
  const groupInventoryChartData = useMemo(() => {
    return inventorySummary.map(s => ({
      name: s.bloodGroup,
      Available: s.availableUnits,
      Reserved: s.reservedUnits,
      Issued: s.issuedUnits
    }));
  }, [inventorySummary]);

  // Chart 2: Monthly donations trend
  const monthlyTrendData = [
    { month: 'Sep 25', donations: 85, unitsIssued: 72 },
    { month: 'Oct 25', donations: 110, unitsIssued: 95 },
    { month: 'Nov 25', donations: 145, unitsIssued: 120 },
    { month: 'Dec 25', donations: 130, unitsIssued: 128 },
    { month: 'Jan 26', donations: 160, unitsIssued: 140 },
    { month: 'Feb 26', donations: 190, unitsIssued: 165 }
  ];

  // Chart 3: Requests by Urgency
  const urgencyPieData = useMemo(() => {
    const emergency = requests.filter(r => r.urgency === 'Emergency').length;
    const urgent = requests.filter(r => r.urgency === 'Urgent').length;
    const normal = requests.filter(r => r.urgency === 'Normal').length;
    return [
      { name: 'Emergency', value: emergency, color: '#e11d48' },
      { name: 'Urgent', value: urgent, color: '#f59e0b' },
      { name: 'Normal', value: normal, color: '#3b82f6' }
    ];
  }, [requests]);

  // Chart 4: Components Distribution
  const componentPieData = useMemo(() => {
    const prbc = bloodUnits.filter(u => u.component === 'Packed Red Cells').length;
    const platelets = bloodUnits.filter(u => u.component === 'Platelets').length;
    const ffp = bloodUnits.filter(u => u.component === 'Fresh Frozen Plasma').length;
    const whole = bloodUnits.filter(u => u.component === 'Whole Blood').length;
    return [
      { name: 'PRBC', value: prbc, color: '#dc2626' },
      { name: 'Platelets', value: platelets, color: '#8b5cf6' },
      { name: 'FFP', value: ffp, color: '#06b6d4' },
      { name: 'Whole Blood', value: whole, color: '#10b981' }
    ];
  }, [bloodUnits]);

  // Filtered Donors
  const filteredDonors = useMemo(() => {
    return donors.filter(d => 
      d.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.donorCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.bloodGroup.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [donors, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* ----------------- ADMIN WORKSPACE HEADER ----------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-rose-700">
            System Governance · National Blood Authority Node #MUM-01
          </p>
          <h1 className="text-2xl font-display font-bold text-slate-950 tracking-tight">
            System Administration &amp; Database Operations
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>Administrator: <strong className="text-slate-900">{currentUser.fullName}</strong></span>
            <span className="text-slate-300">·</span>
            <span>Database Mode: <strong className={db.getLiveStatus().isLiveConnected ? 'text-emerald-700' : 'text-slate-800'}>{db.getLiveStatus().isLiveConnected ? 'MySQL Live Synced' : 'Local Store (Ready to Connect)'}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start lg:self-auto flex-wrap">
          {onOpenDatabase && canManageDb && (
            <button
              type="button"
              onClick={onOpenDatabase}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Database className="w-3.5 h-3.5" />
              <span>MySQL Manager &amp; SQL Console</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Official Reports</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('dbms_architecture')}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3NF Schema Specs</span>
          </button>
        </div>
      </div>

      {/* Navigation Submenu */}
      <UnderlineTabs
        activeTab={activeSection}
        onChange={setActiveSection}
        tabs={[
          { id: 'analytics', label: 'Analytics Overview' },
          { id: 'rbac', label: 'Access Control & Security' },
          { id: 'donors', label: `Donor Registry (${donors.length.toLocaleString()})` },
          { id: 'hospitals', label: `Hospital Network (${hospitals.length})` },
          { id: 'inventory', label: `Inventory Ledger (${bloodUnits.length})` },
          { id: 'audit', label: `Clinical Audit (${auditLogs.length})` },
        ]}
      />

      {/* RBAC & SECURITY GOVERNANCE CONSOLE */}
      {activeSection === 'rbac' && <AdminRbacPanel currentUser={currentUser} />}

      {/* ----------------- FLOW 13: ANALYTICS & VISUALIZATIONS ----------------- */}
      {activeSection === 'analytics' && (
        <div className="space-y-6 animate-in fade-in">
          
          {/* Top 4 Macro Counters */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Total Voluntary Donors</div>
              <div className="text-3xl font-black text-slate-900">{donors.length}</div>
              <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">Active Lifesaver Database</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Blood Vault Stock</div>
              <div className="text-3xl font-black text-rose-600">
                {bloodUnits.filter(u => u.status === 'Available').length} units
              </div>
              <span className="text-[11px] text-slate-600 mt-1 block">Across 8 ABO/Rh types</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Partner Hospitals</div>
              <div className="text-3xl font-black text-blue-600">{hospitals.length}</div>
              <span className="text-[11px] text-blue-700 font-semibold mt-1 block">Accredited Transfusion Hubs</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Active Donation Drives</div>
              <div className="text-3xl font-black text-purple-600">{camps.length}</div>
              <span className="text-[11px] text-purple-700 font-semibold mt-1 block">Community Camps on Schedule</span>
            </div>
          </div>

          {/* Row 1: Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Chart 1: Blood Inventory by Blood Group */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Blood Inventory by ABO/Rh Group</h3>
                  <p className="text-xs text-slate-600">Available vs Reserved vs Issued units in system</p>
                </div>
                <span className="text-xs font-bold text-slate-600 px-2.5 py-1 bg-slate-100 rounded-lg">
                  8 Blood Groups
                </span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={groupInventoryChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 'bold' }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="Available" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Reserved" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Issued" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Requests by Urgency Pie */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold text-slate-900">Requisitions by Clinical Urgency</h3>
                  <span className="text-xs font-bold text-rose-600">Live Triage</span>
                </div>
                <p className="text-xs text-slate-600 mb-4">Emergency ICU vs Urgent Surgical vs Elective</p>

                <div className="h-48 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={urgencyPieData}
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {urgencyPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center text-xs">
                {urgencyPieData.map(u => (
                  <div key={u.name}>
                    <span className="font-bold text-slate-900 block">{u.value}</span>
                    <span className="text-[10px] text-slate-600">{u.name}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Row 2: Monthly Donations Trend & Components */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Chart 3: Monthly Trend */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Monthly Donations &amp; Dispatches</h3>
                  <p className="text-xs text-slate-600">Tracking seasonal demand peaks and camp intake</p>
                </div>
              </div>

              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line type="monotone" dataKey="donations" name="Donations Collected" stroke="#e11d48" strokeWidth={3} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="unitsIssued" name="Units Transfused" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 4: Component Inventory Distribution */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold text-slate-900">Component Storage Distribution</h3>
                  <span className="text-xs text-slate-600 font-bold">Cold Vault Breakdown</span>
                </div>
                <p className="text-xs text-slate-600 mb-2">Separated blood components currently stored</p>

                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={componentPieData}
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {componentPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1 text-center text-xs border-t border-slate-100 pt-2">
                {componentPieData.map(c => (
                  <div key={c.name}>
                    <span className="font-bold text-slate-900 block">{c.value}</span>
                    <span className="text-[10px] text-slate-600">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* TAB 2: DONORS DIRECTORY & MANAGEMENT */}
      {activeSection === 'donors' && (
        <AdminDonorManagement 
          currentUser={currentUser} 
          onRefreshParent={() => db.notify()} 
        />
      )}

      {/* TAB 3: HOSPITAL NETWORK */}
      {activeSection === 'hospitals' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Accredited Hospital Network</h3>
              <p className="text-xs text-slate-600">Table <code className="font-mono text-purple-600">hospitals</code> &bull; Total connected: {hospitals.length}</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Hospital Name</th>
                  <th className="px-4 py-3">License #</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Emergency Contact</th>
                  <th className="px-4 py-3">Requisitions</th>
                  <th className="px-4 py-3">Units Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hospitals.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-blue-600">{h.hospitalCode}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{h.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{h.licenseNumber}</td>
                    <td className="px-4 py-3">{h.city}</td>
                    <td className="px-4 py-3 text-slate-600">{h.phone}</td>
                    <td className="px-4 py-3 font-bold">{h.totalRequests}</td>
                    <td className="px-4 py-3 font-bold text-rose-600">{h.totalUnitsReceived} units</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: INVENTORY LEDGER */}
      {activeSection === 'inventory' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Serialized Blood Inventory Ledger</h3>
            <p className="text-xs text-slate-600">Physical barcodes stored in cold vaults &bull; Table <code className="font-mono text-purple-600">blood_units</code></p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Unit Barcode</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Component</th>
                  <th className="px-4 py-3">Volume</th>
                  <th className="px-4 py-3">Location / Fridge</th>
                  <th className="px-4 py-3">Collection Date</th>
                  <th className="px-4 py-3">Expiry Date</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bloodUnits.slice(0, 15).map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{u.unitCode}</td>
                    <td className="px-4 py-3 font-black text-rose-600">{u.bloodGroup}</td>
                    <td className="px-4 py-3">{u.component}</td>
                    <td className="px-4 py-3">{u.volumeMl} mL</td>
                    <td className="px-4 py-3">{u.storageLocation} ({u.refrigeratorCode})</td>
                    <td className="px-4 py-3">{u.collectionDate.split('T')[0]}</td>
                    <td className="px-4 py-3">{u.expiryDate.split('T')[0]}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.status === 'Available' ? 'bg-emerald-100 text-emerald-800' :
                        u.status === 'Issued' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: DATABASE AUDIT TRAIL */}
      {activeSection === 'audit' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Immutable Audit Logs</h3>
              <p className="text-xs text-slate-600">Cryptographically verifiable immutable audit trail tracking logins, stock dispatches, and emergency releases</p>
            </div>
            <span className="text-xs font-bold text-slate-600 px-3 py-1 bg-slate-100 rounded-lg">
              {auditLogs.length} Events Logged
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User / Persona</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Table</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Transaction Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {auditLogs.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{new Date(a.timestamp).toLocaleTimeString()}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 font-sans">{a.userName}</td>
                    <td className="px-4 py-3 uppercase text-[10px] text-slate-600 font-sans">{a.userRole}</td>
                    <td className="px-4 py-3 text-purple-700 font-bold">{a.action}</td>
                    <td className="px-4 py-3 text-slate-600">{a.tableName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        a.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                        a.status === 'ROLLBACK' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-sans max-w-sm truncate">{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
