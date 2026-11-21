import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  Plus, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Users, 
  Droplet, 
  Send, 
  ChevronRight, 
  Activity, 
  FileText,
  Filter,
  ShieldCheck
} from 'lucide-react';
import { Hospital, Patient, BloodRequest, BloodGroup, BloodComponent, RequestUrgency, User } from '../types';
import { db } from '../db/databaseStore';
import { StatCard } from './ui/StatCard';
import { UnderlineTabs } from './ui/UnderlineTabs';

interface HospitalDashboardProps {
  currentUser: User;
  onNavigate: (view: string) => void;
}

export default function HospitalDashboard({ currentUser, onNavigate }: HospitalDashboardProps) {
  const [activeTab, setActiveTab] = useState<'requests' | 'new_request' | 'patients' | 'add_patient'>('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedRequestForTracking, setSelectedRequestForTracking] = useState<BloodRequest | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Hospital record
  const hospital: Hospital = useMemo(() => {
    const list = db.getHospitals();
    if (currentUser.hospitalId) {
      const foundById = list.find(h => h.id === currentUser.hospitalId);
      if (foundById) return foundById;
    }
    const foundByName = list.find(h => 
      h.name.toLowerCase().includes(currentUser.fullName.toLowerCase()) || 
      currentUser.fullName.toLowerCase().includes(h.name.toLowerCase())
    );
    if (foundByName) return foundByName;
    const foundByEmail = list.find(h => h.email.toLowerCase() === currentUser.email.toLowerCase());
    if (foundByEmail) return foundByEmail;
    return list[0];
  }, [currentUser]);

  // Live Requests from store
  const requests = useMemo(() => {
    return db.getRequests().filter(r => r.hospitalId === hospital.id || r.hospitalName.toLowerCase().includes(hospital.name.toLowerCase()));
  }, [hospital.id, hospital.name, activeTab, refreshKey]);

  // Live Patients from store
  const patients = useMemo(() => {
    return db.getPatients().filter(p => p.hospitalId === hospital.id || p.hospitalName.toLowerCase().includes(hospital.name.toLowerCase()));
  }, [hospital.id, hospital.name, activeTab, refreshKey]);

  // Request stats
  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter(r => r.status === 'Pending' || r.status === 'Under Review').length;
    const fulfilled = requests.filter(r => r.status === 'Fulfilled').length;
    const units = requests.reduce((acc, r) => acc + r.unitsFulfilled, 0);
    return { total, pending, fulfilled, units };
  }, [requests]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchSearch = r.requestCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.bloodGroup.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [requests, searchQuery, statusFilter]);

  // ----------------- FLOW 06: NEW BLOOD REQUEST FORM STATE -----------------
  const [reqPatientId, setReqPatientId] = useState<number>(patients[0]?.id || 1);
  const [reqBloodGroup, setReqBloodGroup] = useState<BloodGroup>('O-');
  const [reqComponent, setReqComponent] = useState<BloodComponent>('Packed Red Cells');
  const [reqUnits, setReqUnits] = useState<number>(2);
  const [reqUrgency, setReqUrgency] = useState<RequestUrgency>('Urgent');
  const [reqDate, setReqDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reqRemarks, setReqRemarks] = useState('');
  const [requestSuccessCode, setRequestSuccessCode] = useState<string | null>(null);

  // ----------------- ADD PATIENT FORM STATE -----------------
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientAge, setNewPatientAge] = useState(42);
  const [newPatientGender, setNewPatientGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [newPatientBg, setNewPatientBg] = useState<BloodGroup>('A+');
  const [newPatientDiagnosis, setNewPatientDiagnosis] = useState('');
  const [newPatientBed, setNewPatientBed] = useState('ICU Bed 12');
  const [newPatientEmergency, setNewPatientEmergency] = useState(false);
  const [patientSuccessCode, setPatientSuccessCode] = useState<string | null>(null);

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const created = db.createBloodRequest({
      hospitalId: hospital.id,
      patientId: reqPatientId,
      bloodGroup: reqBloodGroup,
      component: reqComponent,
      unitsRequired: reqUnits,
      urgency: reqUrgency,
      requiredDate: reqDate,
      remarks: reqRemarks
    });

    setRequestSuccessCode(created.requestCode);
    setRefreshKey(k => k + 1);
    setTimeout(() => {
      setRequestSuccessCode(null);
      setActiveTab('requests');
      setSelectedRequestForTracking(created);
    }, 1800);
  };

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    const created = db.addPatient({
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      fullName: newPatientName,
      age: newPatientAge,
      gender: newPatientGender,
      bloodGroup: newPatientBg,
      diagnosis: newPatientDiagnosis || 'Acute clinical evaluation',
      isEmergency: newPatientEmergency,
      bedNumber: newPatientBed
    });

    setPatientSuccessCode(created.patientCode);
    setRefreshKey(k => k + 1);
    setTimeout(() => {
      setPatientSuccessCode(null);
      setActiveTab('patients');
    }, 1500);
  };

  const getUrgencyBadge = (urgency: RequestUrgency) => {
    switch (urgency) {
      case 'Emergency':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">EMERGENCY</span>;
      case 'Urgent':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">URGENT</span>;
      case 'Normal':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">NORMAL</span>;
    }
  };

  const getStatusBadge = (status: BloodRequest['status']) => {
    switch (status) {
      case 'Pending':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Pending Review</span>;
      case 'Under Review':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">Crossmatching</span>;
      case 'Approved':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">Approved</span>;
      case 'Partially Fulfilled':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800">Partial ({requests.find(r => r.status === 'Partially Fulfilled')?.unitsFulfilled || 1} units)</span>;
      case 'Fulfilled':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Fulfilled &amp; Dispatched</span>;
      case 'Rejected':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Rejected</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* ----------------- HOSPITAL WORKSPACE HEADER ----------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-rose-700">
            Accredited Transfusion Hub · License <span className="font-mono">{hospital.licenseNumber}</span>
          </p>
          <h1 className="text-2xl font-display font-bold text-slate-950 tracking-tight">
            {hospital.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>{hospital.address}, {hospital.city}</span>
            <span className="text-slate-300">·</span>
            <span className="font-mono tabular-data">{hospital.phone}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('add_patient')}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Admit Inpatient</span>
          </button>
          <button
            id="btn-request-blood-hero"
            type="button"
            onClick={() => setActiveTab('new_request')}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Droplet className="w-3.5 h-3.5 fill-white" />
            <span>Request Blood Unit</span>
          </button>
        </div>
      </div>

      {/* 4 Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Requests" value={stats.total} sublabel="Requisitions on record" />
        <StatCard label="Under Review" value={stats.pending} sublabel="Awaiting laboratory cross-match" tone="amber" />
        <StatCard label="Fulfilled Requests" value={stats.fulfilled} sublabel="Successfully transfused" tone="emerald" />
        <StatCard label="Units Received" value={stats.units} sublabel="Cold-chain delivered" tone="crimson" />
      </div>

      {/* Tabs */}
      <UnderlineTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'requests', label: `Blood Requisitions (${requests.length})` },
          { id: 'new_request', label: '+ Create Requisition' },
          { id: 'patients', label: `Inpatient Directory (${patients.length})` },
          { id: 'add_patient', label: '+ Admit Patient' },
        ]}
      />

      {/* TAB 1: BLOOD REQUESTS & TRACKING TIMELINE */}
      {activeTab === 'requests' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in">
          
          {/* Requests Table */}
          <div className={`${selectedRequestForTracking ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4`}>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search REQ code, patient, blood group..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs border border-slate-200 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Fulfilled">Fulfilled</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3">Req Code</th>
                    <th className="px-3.5 py-3">Patient</th>
                    <th className="px-3.5 py-3">Component</th>
                    <th className="px-3.5 py-3">Urgency</th>
                    <th className="px-3.5 py-3">Units</th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-3.5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.map(r => (
                    <tr 
                      key={r.id} 
                      onClick={() => setSelectedRequestForTracking(r)}
                      className={`cursor-pointer transition-colors ${
                        selectedRequestForTracking?.id === r.id ? 'bg-rose-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-3.5 py-3 font-mono font-bold text-rose-600">{r.requestCode}</td>
                      <td className="px-3.5 py-3">
                        <div className="font-semibold text-slate-900">{r.patientName}</div>
                        <div className="text-[10px] text-slate-600">{r.patientCode}</div>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="font-bold text-slate-900">{r.bloodGroup}</span> &bull; {r.component}
                      </td>
                      <td className="px-3.5 py-3">{getUrgencyBadge(r.urgency)}</td>
                      <td className="px-3.5 py-3 font-bold">
                        {r.unitsFulfilled} / {r.unitsRequired}
                      </td>
                      <td className="px-3.5 py-3">{getStatusBadge(r.status)}</td>
                      <td className="px-3.5 py-3 text-right">
                        <button className="text-xs font-bold text-rose-600 hover:underline">
                          Timeline
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ----------------- FLOW 07: TIMELINE DRAWER ----------------- */}
          {selectedRequestForTracking && (
            <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Live Status Requisition Tracking</span>
                  <h3 className="text-base font-black text-slate-900">{selectedRequestForTracking.requestCode}</h3>
                </div>
                <button
                  onClick={() => setSelectedRequestForTracking(null)}
                  className="text-xs text-slate-400 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              {/* Patient & Requirement summary */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-600">Patient:</span>
                  <span className="font-bold text-slate-900">{selectedRequestForTracking.patientName} ({selectedRequestForTracking.bloodGroup})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Component:</span>
                  <span className="font-semibold text-slate-900">{selectedRequestForTracking.component}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Urgency:</span>
                  <span>{getUrgencyBadge(selectedRequestForTracking.urgency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Fulfillment:</span>
                  <span className="font-bold text-slate-900">{selectedRequestForTracking.unitsFulfilled} of {selectedRequestForTracking.unitsRequired} units delivered</span>
                </div>
                {selectedRequestForTracking.remarks && (
                  <div className="pt-1 text-slate-600 italic border-t border-slate-200">
                    "{selectedRequestForTracking.remarks}"
                  </div>
                )}
              </div>

              {/* Visual Multi-Stage Progress Line */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Audit Timeline</h4>
                <div className="space-y-4 relative pl-5 border-l-2 border-slate-200">
                  {selectedRequestForTracking.trackingTimeline.map((item, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full bg-rose-600 border-2 border-white shadow-xs" />
                      <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                        <span>{item.stage}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-snug">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ----------------- FLOW 06: CREATE BLOOD REQUEST FORM ----------------- */}
      {activeTab === 'new_request' && (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6 animate-in fade-in">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">
              FLOW 06 &bull; Blood Requisition Form
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Create Blood Request
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Dispatches an encrypted order to central laboratory blood vaults. Auto-inserts into relational table <code className="font-mono text-purple-600">blood_requests</code>.
            </p>
          </div>

          {requestSuccessCode ? (
            <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h3 className="text-lg font-bold text-emerald-900">Requisition Lodged Successfully!</h3>
              <div className="font-mono font-bold text-slate-900 text-base">{requestSuccessCode}</div>
              <p className="text-xs text-emerald-700">Awaiting crossmatch compatibility test by staff.</p>
            </div>
          ) : (
            <form onSubmit={handleCreateRequest} className="space-y-4">
              
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Inpatient *</label>
                <select
                  required
                  value={reqPatientId}
                  onChange={e => {
                    const id = Number(e.target.value);
                    setReqPatientId(id);
                    const p = patients.find(pat => pat.id === id);
                    if (p) setReqBloodGroup(p.bloodGroup);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                >
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.bloodGroup}) &bull; {p.patientCode} &bull; {p.bedNumber} ({p.diagnosis})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Group Required *</label>
                  <select
                    value={reqBloodGroup}
                    onChange={e => setReqBloodGroup(e.target.value as BloodGroup)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-300 focus:outline-none font-bold text-rose-600"
                  >
                    {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as BloodGroup[]).map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Component Required *</label>
                  <select
                    value={reqComponent}
                    onChange={e => setReqComponent(e.target.value as BloodComponent)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-300 focus:outline-none"
                  >
                    <option value="Packed Red Cells">Packed Red Cells (PRBC)</option>
                    <option value="Platelets">Platelets (RDP / SDP)</option>
                    <option value="Fresh Frozen Plasma">Fresh Frozen Plasma (FFP)</option>
                    <option value="Whole Blood">Whole Blood</option>
                    <option value="Cryoprecipitate">Cryoprecipitate</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Units Required (Bags) *</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={reqUnits}
                    onChange={e => setReqUnits(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-300 focus:outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Urgency Level *</label>
                  <select
                    value={reqUrgency}
                    onChange={e => setReqUrgency(e.target.value as RequestUrgency)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-300 focus:outline-none font-bold"
                  >
                    <option value="Normal">Normal (Elective / 24-48 hrs)</option>
                    <option value="Urgent">Urgent (Surgical / 4-12 hrs)</option>
                    <option value="Emergency">Emergency (Immediate Trauma / ICU)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Required By Date</label>
                <input
                  type="date"
                  value={reqDate}
                  onChange={e => setReqDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Indication / Diagnosis Remarks</label>
                <textarea
                  rows={2}
                  value={reqRemarks}
                  onChange={e => setReqRemarks(e.target.value)}
                  placeholder="e.g. Pre-operative crossmatch for cardiac bypass surgery tomorrow morning."
                  className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveTab('requests')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/30 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Transmit Requisition to Blood Bank</span>
                </button>
              </div>

            </form>
          )}

        </div>
      )}

      {/* TAB 3: INPATIENT DIRECTORY */}
      {activeTab === 'patients' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Hospital Inpatient Directory</h3>
              <p className="text-xs text-slate-600">Normalized records in SQL table <code className="font-mono text-purple-600">patients</code></p>
            </div>
            <button
              onClick={() => setActiveTab('add_patient')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Admit New Patient</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Patient Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Age/Gender</th>
                  <th className="px-4 py-3">Blood Group</th>
                  <th className="px-4 py-3">Ward / Bed</th>
                  <th className="px-4 py-3">Diagnosis</th>
                  <th className="px-4 py-3">Admission</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-blue-600">{p.patientCode}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.fullName}</td>
                    <td className="px-4 py-3">{p.age} yrs &bull; {p.gender}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-rose-600 px-2 py-0.5 rounded bg-rose-50 border border-rose-200">
                        {p.bloodGroup}
                      </span>
                    </td>
                    <td className="px-4 py-3">{p.bedNumber}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{p.diagnosis}</td>
                    <td className="px-4 py-3">{new Date(p.admissionDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setReqPatientId(p.id);
                          setReqBloodGroup(p.bloodGroup);
                          setActiveTab('new_request');
                        }}
                        className="text-xs font-bold text-rose-600 hover:underline"
                      >
                        Request Blood
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: ADMIT PATIENT FORM */}
      {activeTab === 'add_patient' && (
        <div className="max-w-xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5 animate-in fade-in">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Admit New Inpatient</h2>
            <p className="text-xs text-slate-600 mt-1">Registers inpatient into hospital clinical registry with auto-assigned Patient MRN and ward assignment</p>
          </div>

          {patientSuccessCode ? (
            <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h3 className="text-base font-bold text-emerald-900">Patient Admitted</h3>
              <div className="font-mono font-bold text-slate-900">{patientSuccessCode}</div>
            </div>
          ) : (
            <form onSubmit={handleAddPatient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Patient Full Name *</label>
                <input
                  type="text"
                  required
                  value={newPatientName}
                  onChange={e => setNewPatientName(e.target.value)}
                  placeholder="e.g. Suman Gupta"
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-300 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    required
                    value={newPatientAge}
                    onChange={e => setNewPatientAge(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                  <select
                    value={newPatientGender}
                    onChange={e => setNewPatientGender(e.target.value as any)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 focus:outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Group</label>
                  <select
                    value={newPatientBg}
                    onChange={e => setNewPatientBg(e.target.value as BloodGroup)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 focus:outline-none font-bold text-rose-600"
                  >
                    {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as BloodGroup[]).map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ward / Bed Number</label>
                  <input
                    type="text"
                    value={newPatientBed}
                    onChange={e => setNewPatientBed(e.target.value)}
                    placeholder="e.g. ICU Bed 4B"
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Diagnosis</label>
                  <input
                    type="text"
                    required
                    value={newPatientDiagnosis}
                    onChange={e => setNewPatientDiagnosis(e.target.value)}
                    placeholder="e.g. Severe Anemia, Hb 6.2"
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 focus:outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-800 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPatientEmergency}
                  onChange={e => setNewPatientEmergency(e.target.checked)}
                />
                <span>Classify as Acute Emergency Trauma Admission</span>
              </label>

              <div className="pt-2 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveTab('patients')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/30"
                >
                  Save Inpatient Record
                </button>
              </div>
            </form>
          )}

        </div>
      )}

    </div>
  );
}
