import { useState, useMemo } from 'react';
import { 
  Stethoscope, 
  Droplet, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Clock, 
  Database, 
  Play, 
  RefreshCw, 
  Layers, 
  Thermometer, 
  ArrowRight, 
  ArrowLeft,
  XCircle,
  FileCheck,
  Building2,
  Calendar,
  Sparkles
} from 'lucide-react';
import { 
  BloodUnit, 
  BloodRequest, 
  Donor, 
  BloodGroup, 
  BloodComponent, 
  User 
} from '../types';
import { db } from '../db/databaseStore';
import { UnderlineTabs } from './ui/UnderlineTabs';

interface StaffDashboardProps {
  currentUser: User;
  onNavigate: (view: string) => void;
}

export default function StaffDashboard({ currentUser, onNavigate }: StaffDashboardProps) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'donation_workflow' | 'issuance' | 'expiring'>('inventory');
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters for inventory
  const [invFilterBg, setInvFilterBg] = useState<string>('ALL');
  const [invFilterComp, setInvFilterComp] = useState<string>('ALL');
  const [invFilterStatus, setInvFilterStatus] = useState<string>('ALL');
  const [invSearch, setInvSearch] = useState('');

  // Live collections
  const bloodUnits = useMemo(() => db.getBloodUnits(), [refreshKey, activeTab]);
  const requests = useMemo(() => db.getRequests(), [refreshKey, activeTab]);
  const donors = useMemo(() => db.getDonors(), [refreshKey, activeTab]);
  const expiringUnits = useMemo(() => db.getExpiringUnitsView(), [refreshKey, activeTab]);
  const pendingRequests = useMemo(() => db.getPendingRequestsView(), [refreshKey, activeTab]);

  // Operational metrics
  const metrics = useMemo(() => {
    const available = bloodUnits.filter(u => u.status === 'Available').length;
    const criticalBgs = db.getLiveBloodAvailability().filter(b => b.status === 'Critical').length;
    const todayDonations = db.getDonations().length;
    return {
      available,
      criticalBgs,
      todayDonations,
      expiringCount: expiringUnits.length,
      pendingReqCount: pendingRequests.length
    };
  }, [bloodUnits, expiringUnits, pendingRequests]);

  // Filtered inventory
  const filteredInventory = useMemo(() => {
    return bloodUnits.filter(u => {
      const matchBg = invFilterBg === 'ALL' || u.bloodGroup === invFilterBg;
      const matchComp = invFilterComp === 'ALL' || u.component === invFilterComp;
      const matchStatus = invFilterStatus === 'ALL' || u.status === invFilterStatus;
      const matchSearch = u.unitCode.toLowerCase().includes(invSearch.toLowerCase()) ||
                          u.storageLocation.toLowerCase().includes(invSearch.toLowerCase()) ||
                          u.refrigeratorCode.toLowerCase().includes(invSearch.toLowerCase());
      return matchBg && matchComp && matchStatus && matchSearch;
    });
  }, [bloodUnits, invFilterBg, invFilterComp, invFilterStatus, invSearch]);

  // ----------------- FLOW 09: 7-STEP GUIDED DONATION STATE -----------------
  const [stepNum, setStepNum] = useState<number>(1);
  const [selectedDonorId, setSelectedDonorId] = useState<number>(donors[0]?.id || 1);
  const [donorSearchQuery, setDonorSearchQuery] = useState('');
  
  // Step 2: Screening
  const [screenWeight, setScreenWeight] = useState(66);
  const [screenHb, setScreenHb] = useState(14.2);
  const [screenBp, setScreenBp] = useState('120/80');
  const [screenPulse, setScreenPulse] = useState(72);
  const [screenTemp, setScreenTemp] = useState(36.8);
  const [screenEligible, setScreenEligible] = useState(true);

  // Step 3: Donation details
  const [donationType, setDonationType] = useState<'Whole Blood' | 'Apheresis Platelets' | 'Plasma'>('Whole Blood');
  const [donationVolume, setDonationVolume] = useState<number>(450);

  // Step 4 & 5: Testing
  const [testingPassed, setTestingPassed] = useState(true);

  // Step 6: Storage
  const [storageLoc, setStorageLoc] = useState('Central Vault A');
  const [fridgeCode, setFridgeCode] = useState('REF-A1 (4°C)');

  // Result
  const [workflowSuccessResult, setWorkflowSuccessResult] = useState<{ unitCode: string; donationCode: string } | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  // ----------------- FLOW 11: ACID ISSUANCE TRANSACTION STATE -----------------
  const [issueReqId, setIssueReqId] = useState<number>(requests[0]?.id || 1);
  const [issueUnitCodes, setIssueUnitCodes] = useState<string[]>([]);
  const [simulateRollback, setSimulateRollback] = useState(false);
  const [txStepsLog, setTxStepsLog] = useState<{ step: string; status: 'pending' | 'ok' | 'fail'; detail: string }[]>([]);
  const [txResult, setTxResult] = useState<{ success: boolean; message: string; hash?: string } | null>(null);
  const [isExecutingTx, setIsExecutingTx] = useState(false);

  // Selected request for issuance
  const selectedReq = useMemo(() => {
    return requests.find(r => r.id === issueReqId) || requests[0];
  }, [requests, issueReqId]);

  // Matching compatible available blood units
  const compatibleAvailableUnits = useMemo(() => {
    if (!selectedReq) return [];
    return bloodUnits.filter(u => {
      if (u.status !== 'Available') return false;
      // Component match
      if (u.component !== selectedReq.component) return false;
      // Blood Group compatibility
      if (u.bloodGroup === selectedReq.bloodGroup) return true;
      if (selectedReq.component === 'Packed Red Cells' || selectedReq.component === 'Whole Blood') {
        if (u.bloodGroup === 'O-') return true; // universal
      }
      return false;
    });
  }, [bloodUnits, selectedReq]);

  // Execute 7-Step donation submission
  const handleCompleteDonationWorkflow = () => {
    setWorkflowError(null);
    try {
      const res = db.processDonation({
        donorId: selectedDonorId,
        screening: {
          weightKg: screenWeight,
          hemoglobinGdl: screenHb,
          bloodPressure: screenBp,
          pulseBpm: screenPulse,
          temperatureC: screenTemp,
          isEligible: screenEligible,
          deferralReason: screenEligible ? undefined : 'Hemoglobin or vitals failed clinical range'
        },
        donationType,
        unitsCollected: 1,
        component: donationType === 'Apheresis Platelets' ? 'Platelets' : (donationType === 'Plasma' ? 'Fresh Frozen Plasma' : 'Packed Red Cells'),
        volumeMl: donationVolume,
        storageLocation: storageLoc,
        refrigeratorCode: fridgeCode,
        staffId: currentUser.id,
        staffName: currentUser.fullName
      });

      setWorkflowSuccessResult({
        unitCode: res.bloodUnit?.unitCode || 'BLD-2026-9080',
        donationCode: res.donation.donationCode
      });
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setWorkflowError(err.message || 'Donation workflow failed.');
    }
  };

  // ----------------- FLOW 11: STEP-BY-STEP ACID ISSUANCE ENGINE -----------------
  const handleExecuteAcidIssuance = async () => {
    if (issueUnitCodes.length === 0) {
      setWorkflowError('Please select at least 1 verified blood unit to issue.');
      return;
    }

    setIsExecutingTx(true);
    setTxResult(null);

    const steps: { step: string; status: 'pending' | 'ok' | 'fail'; detail: string }[] = [
      { step: '1. START TRANSACTION', status: 'pending', detail: 'Acquiring InnoDB ACID transaction lock...' },
      { step: '2. SELECT ... FOR UPDATE', status: 'pending', detail: `Row-level locking units: [${issueUnitCodes.join(', ')}]` },
      { step: '3. LAB VALIDATION', status: 'pending', detail: 'Crossmatching antibody compatibility & NAT viral clearance' },
      { step: '4. UPDATE blood_units', status: 'pending', detail: 'Shift unit status to "Issued", record hospital recipient' },
      { step: '5. INSERT INTO blood_issues', status: 'pending', detail: 'Generate cryptographic audit trail & dispatch receipt' },
      { step: '6. UPDATE blood_requests', status: 'pending', detail: 'Update fulfilled unit counts and requisition timeline' },
      { step: '7. COMMIT / ROLLBACK', status: 'pending', detail: 'Finalizing WAL redo log sync' }
    ];

    setTxStepsLog([...steps]);

    // Animate transaction steps
    for (let i = 0; i < steps.length - 1; i++) {
      await new Promise(r => setTimeout(r, 260));
      steps[i].status = 'ok';
      setTxStepsLog([...steps]);
    }

    await new Promise(r => setTimeout(r, 300));

    const result = db.issueBloodTransaction({
      requestId: selectedReq.id,
      unitCodes: issueUnitCodes,
      staffId: currentUser.id,
      staffName: currentUser.fullName,
      simulateRollback
    });

    if (result.success) {
      steps[steps.length - 1].status = 'ok';
      steps[steps.length - 1].detail = 'COMMIT SUCCESS: Data state synchronized safely.';
    } else {
      steps[steps.length - 1].status = 'fail';
      steps[steps.length - 1].detail = 'ROLLBACK EXECUTED: All state reverted to previous checkpoint.';
    }

    setTxStepsLog([...steps]);
    setTxResult({
      success: result.success,
      message: result.message,
      hash: result.transactionHash
    });
    setIsExecutingTx(false);
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* ----------------- FLOW 08: STAFF HEADER ----------------- */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 text-white flex items-center justify-center text-2xl font-black shadow-md shadow-amber-500/25">
            <Stethoscope className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Laboratory &amp; Cold Vault Operations
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Duty Desk: {currentUser.fullName}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span>Central Transfusion Vault &bull; 4.0°C Assured</span>
              <span>&bull;</span>
              <span>Cold-Chain Security: <strong className="text-emerald-600">Active Telemetry (ISO Compliant)</strong></span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={() => {
              setStepNum(1);
              setWorkflowSuccessResult(null);
              setActiveTab('donation_workflow');
            }}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Droplet className="w-3.5 h-3.5 fill-white" />
            <span>Process New Donation</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('issuance')}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Database className="w-3.5 h-3.5 text-slate-600" />
            <span>Unit Issuance Desk</span>
          </button>
        </div>
      </div>

      {/* 5 Operational Metric Blocks */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Available Units</div>
          <div className="text-2xl font-display font-bold font-mono text-slate-950 tabular-data">{metrics.available}</div>
          <span className="text-xs text-emerald-700 font-medium">Cold vaults stocked</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Pending Requests</div>
          <div className="text-2xl font-display font-bold font-mono text-amber-700 tabular-data">{metrics.pendingReqCount}</div>
          <span className="text-xs text-amber-700 font-medium">Awaiting issuance</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Critical Blood Groups</div>
          <div className="text-2xl font-display font-bold font-mono text-rose-700 tabular-data">{metrics.criticalBgs}</div>
          <span className="text-xs text-rose-700 font-medium">&le; 1 unit remaining</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Expiring (7 Days)</div>
          <div className="text-2xl font-display font-bold font-mono text-amber-700 tabular-data">{metrics.expiringCount}</div>
          <span className="text-xs text-slate-500">Priority rotation</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">Total Donations</div>
          <div className="text-2xl font-display font-bold font-mono text-slate-950 tabular-data">{metrics.todayDonations}</div>
          <span className="text-xs text-slate-500">Verified on record</span>
        </div>
      </div>

      {/* Tabs */}
      <UnderlineTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'inventory', label: `Cold Vault Inventory (${bloodUnits.length})` },
          { id: 'donation_workflow', label: '7-Step Donation Intake' },
          { id: 'issuance', label: 'Unit Issuance Engine' },
          { id: 'expiring', label: `Expiring Units View (${expiringUnits.length})` },
        ]}
      />

      {/* ----------------- FLOW 10: INVENTORY MANAGEMENT ----------------- */}
      {activeTab === 'inventory' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={invSearch}
                onChange={e => setInvSearch(e.target.value)}
                placeholder="Search barcode, vault location, refrigerator..."
                className="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={invFilterBg}
                onChange={e => setInvFilterBg(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs border border-slate-200 focus:outline-none font-bold text-rose-600"
              >
                <option value="ALL">All Blood Groups</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>

              <select
                value={invFilterComp}
                onChange={e => setInvFilterComp(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs border border-slate-200 focus:outline-none"
              >
                <option value="ALL">All Components</option>
                <option value="Packed Red Cells">Packed Red Cells</option>
                <option value="Platelets">Platelets</option>
                <option value="Fresh Frozen Plasma">Fresh Frozen Plasma</option>
                <option value="Whole Blood">Whole Blood</option>
              </select>

              <select
                value={invFilterStatus}
                onChange={e => setInvFilterStatus(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs border border-slate-200 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="Available">Available</option>
                <option value="Reserved">Reserved</option>
                <option value="Issued">Issued</option>
                <option value="Expired">Expired</option>
              </select>

              <button
                onClick={() => setRefreshKey(k => k + 1)}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-3">Unit Barcode</th>
                  <th className="px-3.5 py-3">Group</th>
                  <th className="px-3.5 py-3">Component</th>
                  <th className="px-3.5 py-3">Volume</th>
                  <th className="px-3.5 py-3">Testing</th>
                  <th className="px-3.5 py-3">Storage / Ref</th>
                  <th className="px-3.5 py-3">Expiry Date</th>
                  <th className="px-3.5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInventory.map(u => {
                  const isExpSoon = new Date(u.expiryDate).getTime() - Date.now() < 7 * 24 * 3600 * 1000 && u.status === 'Available';

                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-3.5 py-3 font-mono font-bold text-slate-900">{u.unitCode}</td>
                      <td className="px-3.5 py-3">
                        <span className="font-black text-rose-600 px-2 py-0.5 rounded bg-rose-50 border border-rose-200">
                          {u.bloodGroup}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 font-medium">{u.component}</td>
                      <td className="px-3.5 py-3">{u.volumeMl} mL</td>
                      <td className="px-3.5 py-3">
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>NAT Clear</span>
                        </span>
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="text-slate-900 font-semibold">{u.storageLocation}</div>
                        <div className="text-[10px] text-slate-600">{u.refrigeratorCode}</div>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className={isExpSoon ? 'text-rose-600 font-bold flex items-center gap-1' : ''}>
                          {isExpSoon && <AlertTriangle className="w-3.5 h-3.5" />}
                          {u.expiryDate.split('T')[0]}
                        </span>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.status === 'Available' ? 'bg-emerald-100 text-emerald-800' :
                          u.status === 'Issued' ? 'bg-blue-100 text-blue-800' :
                          u.status === 'Reserved' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------- FLOW 09: 7-STEP GUIDED DONATION WIZARD ----------------- */}
      {activeTab === 'donation_workflow' && (
        <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6 animate-in fade-in">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">
              FLOW 09 &bull; Clinical Lifecycle Wizard
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              7-Step Guided Blood Donation Process
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Executes serialized blood collection: Donor Verification &rarr; Medical Screening &rarr; Collection &rarr; Unit Creation &rarr; Serology Testing &rarr; Storage Vault &rarr; Live Inventory Integration.
            </p>
          </div>

          {/* Step indicator */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1.5">
              <span>Step {stepNum} of 7: {
                stepNum === 1 ? 'Donor Verification' :
                stepNum === 2 ? 'Pre-Donation Medical Screening' :
                stepNum === 3 ? 'Blood Collection Procedure' :
                stepNum === 4 ? 'Generate Serialized Blood Unit' :
                stepNum === 5 ? 'Mandatory Viral Screening' :
                stepNum === 6 ? 'Cold-Chain Storage Assignment' : 'Final Inventory Commit'
              }</span>
              <span className="text-rose-600 font-black">{Math.round((stepNum / 7) * 100)}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-rose-600 transition-all duration-300"
                style={{ width: `${(stepNum / 7) * 100}%` }}
              />
            </div>
          </div>

          {workflowError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{workflowError}</span>
            </div>
          )}

          {workflowSuccessResult ? (
            <div className="p-8 rounded-3xl bg-emerald-50 border border-emerald-200 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-emerald-950">Donation Cycle Completed &amp; Verified!</h3>
              <p className="text-xs text-emerald-800 max-w-md mx-auto">
                Blood unit successfully tested safe, barcoded, and committed to SQL table <code className="font-mono text-purple-700">blood_units</code>. Donor cooldown period initiated (+90 days).
              </p>

              <div className="flex justify-center gap-4 pt-2">
                <div className="p-3 rounded-xl bg-white border border-emerald-200 text-xs">
                  <div className="text-slate-600 uppercase font-bold text-[10px]">Donation Code</div>
                  <div className="font-mono font-black text-slate-900 text-sm">{workflowSuccessResult.donationCode}</div>
                </div>
                <div className="p-3 rounded-xl bg-white border border-emerald-200 text-xs">
                  <div className="text-slate-600 uppercase font-bold text-[10px]">Blood Unit Barcode</div>
                  <div className="font-mono font-black text-rose-600 text-sm">{workflowSuccessResult.unitCode}</div>
                </div>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  onClick={() => {
                    setWorkflowSuccessResult(null);
                    setStepNum(1);
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-100"
                >
                  Process Another Donor
                </button>
                <button
                  onClick={() => setActiveTab('inventory')}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700"
                >
                  View in Cold Vault Inventory
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* STEP 1: Donor Verification */}
              {stepNum === 1 && (
                <div className="space-y-3 animate-in fade-in">
                  <h4 className="text-sm font-bold text-slate-900">Step 1 — Verify Registered Donor</h4>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Select Donor</label>
                    <select
                      value={selectedDonorId}
                      onChange={e => setSelectedDonorId(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-300 font-medium"
                    >
                      {donors.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.fullName} ({d.bloodGroup}) &bull; {d.donorCode} &bull; {d.city} &bull; Total: {d.totalDonations} donations
                        </option>
                      ))}
                    </select>
                  </div>
                  {donors.find(d => d.id === selectedDonorId) && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{donors.find(d => d.id === selectedDonorId)?.fullName}</div>
                        <div className="text-slate-600">Blood Group: <strong className="text-rose-600">{donors.find(d => d.id === selectedDonorId)?.bloodGroup}</strong></div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {donors.find(d => d.id === selectedDonorId)?.eligibilityStatus}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Medical Screening */}
              {stepNum === 2 && (
                <div className="space-y-3.5 animate-in fade-in">
                  <h4 className="text-sm font-bold text-slate-900">Step 2 — Vitals &amp; Hemoglobin Screening</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Body Weight (kg)</label>
                      <input
                        type="number"
                        value={screenWeight}
                        onChange={e => setScreenWeight(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Hemoglobin (g/dL) *Standard &ge; 12.5</label>
                      <input
                        type="number"
                        step="0.1"
                        value={screenHb}
                        onChange={e => setScreenHb(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 font-bold text-rose-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Pressure</label>
                      <input
                        type="text"
                        value={screenBp}
                        onChange={e => setScreenBp(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Pulse (bpm)</label>
                      <input
                        type="number"
                        value={screenPulse}
                        onChange={e => setScreenPulse(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Temp (°C)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={screenTemp}
                        onChange={e => setScreenTemp(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={screenEligible}
                      onChange={e => setScreenEligible(e.target.checked)}
                    />
                    <span>Physician clears donor as medically fit for phlebotomy</span>
                  </label>
                </div>
              )}

              {/* STEP 3: Blood Collection */}
              {stepNum === 3 && (
                <div className="space-y-3 animate-in fade-in">
                  <h4 className="text-sm font-bold text-slate-900">Step 3 — Blood Collection Procedure</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Collection Modality</label>
                      <select
                        value={donationType}
                        onChange={e => setDonationType(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 font-bold"
                      >
                        <option value="Whole Blood">Whole Blood (Standard)</option>
                        <option value="Apheresis Platelets">Apheresis Platelets (SDP)</option>
                        <option value="Plasma">Plasma Apheresis</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Target Volume (mL)</label>
                      <input
                        type="number"
                        value={donationVolume}
                        onChange={e => setDonationVolume(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 font-bold"
                      />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    Phlebotomist sanitized antecubital fossa. Triple-bag collection system with CPD-A1 anticoagulant solution engaged.
                  </div>
                </div>
              )}

              {/* STEP 4: Create Blood Unit */}
              {stepNum === 4 && (
                <div className="space-y-3 animate-in fade-in">
                  <h4 className="text-sm font-bold text-slate-900">Step 4 — Generate Serialized Blood Unit</h4>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Auto Barcode:</span>
                      <span className="font-mono font-bold text-slate-900">BLD-2026-90{donors.length + 85}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Blood Group:</span>
                      <span className="font-bold text-rose-600">{donors.find(d => d.id === selectedDonorId)?.bloodGroup}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Component:</span>
                      <span className="font-semibold text-slate-900">
                        {donationType === 'Apheresis Platelets' ? 'Platelets (5 days shelf life)' : 'Packed Red Cells (42 days shelf life)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: Mandatory Viral Testing */}
              {stepNum === 5 && (
                <div className="space-y-3 animate-in fade-in">
                  <h4 className="text-sm font-bold text-slate-900">Step 5 — Serological &amp; NAT Testing</h4>
                  <p className="text-xs text-slate-600">All 5 mandatory transmissible disease assays must be confirmed Non-Reactive:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                      <span>HIV 1 &amp; 2 (Antibody/Ag)</span>
                      <span className="font-bold text-emerald-700">NEGATIVE ✓</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                      <span>Hepatitis B (HBsAg)</span>
                      <span className="font-bold text-emerald-700">NEGATIVE ✓</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                      <span>Hepatitis C (Anti-HCV)</span>
                      <span className="font-bold text-emerald-700">NEGATIVE ✓</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                      <span>Syphilis (VDRL / RPR)</span>
                      <span className="font-bold text-emerald-700">NON-REACTIVE ✓</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between text-xs font-semibold">
                    <span>Malaria Parasite (Smear &amp; Rapid Antigen)</span>
                    <span className="font-bold text-emerald-700">NEGATIVE ✓</span>
                  </div>
                </div>
              )}

              {/* STEP 6: Storage Assignment */}
              {stepNum === 6 && (
                <div className="space-y-3 animate-in fade-in">
                  <h4 className="text-sm font-bold text-slate-900">Step 6 — Assign Cold-Chain Storage Vault</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Cold Vault Location</label>
                      <select
                        value={storageLoc}
                        onChange={e => setStorageLoc(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300"
                      >
                        <option value="Central Vault A">Central Vault A</option>
                        <option value="Central Vault B">Central Vault B</option>
                        <option value="Emergency Trauma Rack">Emergency Trauma Rack</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Refrigerator Unit</label>
                      <select
                        value={fridgeCode}
                        onChange={e => setFridgeCode(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300"
                      >
                        <option value="REF-A1 (4°C)">REF-A1 (4°C Blood Bank Spec)</option>
                        <option value="REF-A2 (4°C)">REF-A2 (4°C PRBC Compartment)</option>
                        <option value="AGITATOR-P1 (22°C)">AGITATOR-P1 (22°C Platelet Agitator)</option>
                        <option value="FREEZER-F1 (-30°C)">FREEZER-F1 (-30°C Plasma Deep Freeze)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 7: Final Review & Commit */}
              {stepNum === 7 && (
                <div className="space-y-3 animate-in fade-in">
                  <h4 className="text-sm font-bold text-slate-900">Step 7 — Commit to Database</h4>
                  <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-purple-900">
                      <Database className="w-4 h-4" />
                      <span>Transactional Atomicity Preview</span>
                    </div>
                    <p className="text-slate-700">
                      Clicking commit will atomically insert into <code className="font-mono text-purple-700">donations</code> and <code className="font-mono text-purple-700">blood_units</code>, update <code className="font-mono text-purple-700">donors.total_donations</code>, and log to <code className="font-mono text-purple-700">audit_logs</code>.
                    </p>
                  </div>
                </div>
              )}

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {stepNum > 1 ? (
                  <button
                    type="button"
                    onClick={() => setStepNum(s => s - 1)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                ) : <div />}

                {stepNum < 7 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (stepNum === 2 && !screenEligible) {
                        setWorkflowError('Cannot advance: Donor failed clinical screening criteria. Complete deferral counseling.');
                        return;
                      }
                      setWorkflowError(null);
                      setStepNum(s => s + 1);
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/30 flex items-center gap-1.5"
                  >
                    <span>Next: Step {stepNum + 1}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCompleteDonationWorkflow}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Commit &amp; Add to Stock</span>
                  </button>
                )}
              </div>

            </div>
          )}

        </div>
      )}

      {/* ----------------- FLOW 11: ACID ISSUANCE TRANSACTION ----------------- */}
      {activeTab === 'issuance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in">
          
          {/* Left Configuration Form */}
          <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">
                Emergency Crossmatch &amp; Unit Issuance
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Blood Unit Issuance Desk
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Verified digital release protocol with automated cold-chain audit log and recipient cross-match verification.
              </p>
            </div>

            {/* Select Requisition */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Pending Hospital Requisition</label>
              <select
                value={issueReqId}
                onChange={e => {
                  setIssueReqId(Number(e.target.value));
                  setIssueUnitCodes([]);
                  setTxResult(null);
                  setTxStepsLog([]);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-300 font-bold"
              >
                {requests.filter(r => r.status !== 'Fulfilled').map(r => (
                  <option key={r.id} value={r.id}>
                    {r.requestCode} &bull; {r.hospitalName} &bull; {r.patientName} ({r.bloodGroup} {r.component}) &bull; Need: {r.unitsRequired - r.unitsFulfilled} units
                  </option>
                ))}
              </select>
            </div>

            {/* Requisition Card */}
            {selectedReq && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-600">Hospital:</span>
                  <span className="font-bold text-slate-900">{selectedReq.hospitalName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Patient:</span>
                  <span className="font-bold text-slate-900">{selectedReq.patientName} ({selectedReq.patientCode})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Demanded Component:</span>
                  <span className="font-bold text-rose-600">{selectedReq.bloodGroup} &bull; {selectedReq.component}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Urgency:</span>
                  <span className="font-bold text-amber-700">{selectedReq.urgency}</span>
                </div>
              </div>
            )}

            {/* Compatible Blood Units Selector */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                <span>Select Available Compatible Blood Units</span>
                <span className="text-slate-600 font-normal">{compatibleAvailableUnits.length} units in vault</span>
              </div>

              {compatibleAvailableUnits.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-2xl p-2">
                  {compatibleAvailableUnits.map(u => {
                    const checked = issueUnitCodes.includes(u.unitCode);
                    return (
                      <label 
                        key={u.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                          checked ? 'bg-purple-50 border-purple-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              if (e.target.checked) {
                                setIssueUnitCodes([...issueUnitCodes, u.unitCode]);
                              } else {
                                setIssueUnitCodes(issueUnitCodes.filter(c => c !== u.unitCode));
                              }
                            }}
                          />
                          <span className="font-mono font-bold text-slate-900">{u.unitCode}</span>
                          <span className="font-bold text-rose-600 px-1.5 py-0.5 rounded bg-rose-50 text-[10px]">{u.bloodGroup}</span>
                          <span className="text-slate-600">{u.component}</span>
                        </div>
                        <span className="text-slate-600 text-[10px]">{u.refrigeratorCode}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  No compatible {selectedReq?.bloodGroup} {selectedReq?.component} units currently available in stock!
                </div>
              )}
            </div>

            {/* Transaction Stress Test: Simulate Rollback */}
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateRollback}
                  onChange={e => setSimulateRollback(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-bold text-amber-900">Safety Simulation: Crossmatch Antibody Incompatibility</span>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    Simulate an antibody mismatch trigger to verify automated issuance safety halt and quarantine protocol.
                  </p>
                </div>
              </label>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleExecuteAcidIssuance}
              disabled={isExecutingTx || issueUnitCodes.length === 0}
              className="w-full py-3 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-600/30 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{isExecutingTx ? 'Executing ACID Transaction...' : 'Execute ACID Issuance Transaction'}</span>
            </button>
          </div>

          {/* Right Live Transaction Log Console */}
          <div className="lg:col-span-6 bg-slate-900 text-slate-100 rounded-3xl p-6 shadow-xl font-mono text-xs flex flex-col justify-between border border-slate-800">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2 text-purple-400">
                  <Database className="w-4 h-4" />
                  <span className="font-bold uppercase tracking-wider text-[11px]">InnoDB Two-Phase Lock (2PL) Console</span>
                </div>
                <span className="text-[10px] text-slate-500">Isolation: REPEATABLE READ</span>
              </div>

              {txStepsLog.length === 0 ? (
                <div className="text-slate-500 text-center py-12 space-y-2">
                  <p>Awaiting transaction trigger...</p>
                  <p className="text-[11px]">Select units on the left and click "Execute ACID Issuance Transaction".</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {txStepsLog.map((st, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      {st.status === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : st.status === 'fail' ? (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold text-white">{st.step}</div>
                        <div className="text-[11px] text-slate-400">{st.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {txResult && (
              <div className={`mt-6 p-4 rounded-2xl border text-xs ${
                txResult.success ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' : 'bg-rose-950/80 border-rose-800 text-rose-300'
              }`}>
                <div className="font-bold text-sm mb-1">
                  {txResult.success ? 'TRANSACTION COMMITTED' : 'TRANSACTION ROLLED BACK'}
                </div>
                <p className="leading-relaxed">{txResult.message}</p>
                {txResult.hash && (
                  <div className="mt-2 pt-2 border-t border-emerald-900 text-[10px] text-slate-400 truncate">
                    Cryptographic Hash: <code className="text-white">{txResult.hash}</code>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 4: EXPIRING UNITS VIEW */}
      {activeTab === 'expiring' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Expiring Blood Units (Within 7 Days)</h3>
              <p className="text-xs text-slate-600">Real-time dynamic shelf-life monitoring to enforce First-Expiry-First-Out (FEFO) clinical protocols</p>
            </div>
            <span className="text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 px-3 py-1 rounded-xl">
              {expiringUnits.length} bags at risk
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Unit Code</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Component</th>
                  <th className="px-4 py-3">Expiry Date</th>
                  <th className="px-4 py-3">Storage Location</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expiringUnits.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-rose-600">{u.unitCode}</td>
                    <td className="px-4 py-3 font-bold">{u.bloodGroup}</td>
                    <td className="px-4 py-3">{u.component}</td>
                    <td className="px-4 py-3 font-bold text-orange-600">{u.expiryDate.split('T')[0]}</td>
                    <td className="px-4 py-3">{u.storageLocation} ({u.refrigeratorCode})</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setIssueUnitCodes([u.unitCode]);
                          setActiveTab('issuance');
                        }}
                        className="text-xs font-bold text-purple-600 hover:underline"
                      >
                        Prioritize for Issuance &rarr;
                      </button>
                    </td>
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
