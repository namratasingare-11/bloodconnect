import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Phone,
  ThermometerSnowflake,
  Truck,
  Building2,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import { db } from '../db/databaseStore';
import { BloodRequest } from '../types';
import { useDatabaseSubscription } from '../hooks/useDatabaseSubscription';

interface EmergencyDispatchTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRequestCode?: string;
}

interface DispatchStage {
  step: number;
  label: string;
  desc: string;
  done: boolean;
  active?: boolean;
}

function getStagesForRequest(request: BloodRequest): {
  stages: DispatchStage[];
  etaLabel: string;
  statusHeadline: string;
  tempRange: string;
} {
  const status = request.status;

  if (status === 'Fulfilled') {
    return {
      etaLabel: 'Delivered',
      statusHeadline: 'Handed Over to Hospital Transfusion Ward',
      tempRange: '3.6°C',
      stages: [
        { step: 1, label: 'Triage Approved', desc: 'Requisition logged', done: true },
        { step: 2, label: 'Cross-Match OK', desc: 'Serology cleared', done: true },
        { step: 3, label: 'Cold-Pack Sealed', desc: 'RFID tamper seal', done: true },
        { step: 4, label: 'Transit Complete', desc: 'Cold-chain intact', done: true },
        { step: 5, label: 'Ward Handover', desc: 'Signed by duty RN', done: true, active: true }
      ]
    };
  }

  if (status === 'Approved' || status === 'Partially Fulfilled') {
    return {
      etaLabel: '14 mins',
      statusHeadline: 'Refrigerated Carrier En-Route to Hospital',
      tempRange: '3.8°C',
      stages: [
        { step: 1, label: 'Triage Approved', desc: 'Requisition logged', done: true },
        { step: 2, label: 'Cross-Match OK', desc: 'Serology cleared', done: true },
        { step: 3, label: 'Cold-Pack Sealed', desc: '2°C–6°C thermal pack', done: true },
        { step: 4, label: 'En-Route Transit', desc: 'Priority courier van', done: true, active: true },
        { step: 5, label: 'Ward Handover', desc: 'Awaiting bedside scan', done: false }
      ]
    };
  }

  if (status === 'Rejected') {
    return {
      etaLabel: 'Closed',
      statusHeadline: `Requisition ${status}`,
      tempRange: 'N/A',
      stages: [
        { step: 1, label: 'Requisition Logged', desc: request.requestCode, done: true },
        { step: 2, label: status, desc: 'No units dispatched', done: true, active: true },
        { step: 3, label: 'Cold-Pack Seal', desc: 'Not applicable', done: false },
        { step: 4, label: 'Courier Transit', desc: 'Not applicable', done: false },
        { step: 5, label: 'Ward Handover', desc: 'Not applicable', done: false }
      ]
    };
  }

  // Pending
  return {
    etaLabel: '18–25 mins',
    statusHeadline: 'Cross-Match & Vault Allocation In Progress',
    tempRange: '4.0°C',
    stages: [
      { step: 1, label: 'Triage Logged', desc: 'Priority queue active', done: true },
      { step: 2, label: 'Cross-Match & Reserve', desc: 'Lab verification', done: false, active: true },
      { step: 3, label: 'Cold-Pack Seal', desc: 'Awaiting lab release', done: false },
      { step: 4, label: 'Courier Transit', desc: 'Standby dispatch van', done: false },
      { step: 5, label: 'Ward Handover', desc: 'Bedside verification', done: false }
    ]
  };
}

export default function EmergencyDispatchTrackerModal({
  isOpen,
  onClose,
  initialRequestCode
}: EmergencyDispatchTrackerModalProps) {
  const storeRevision = useDatabaseSubscription();
  const allRequests = useMemo(() => db.getRequests(), [isOpen, storeRevision]);

  const [searchCode, setSearchCode] = useState(initialRequestCode || allRequests[0]?.requestCode || '');
  const [activeRequest, setActiveRequest] = useState<BloodRequest | null>(null);
  const [notFoundQuery, setNotFoundQuery] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const lookupRequest = (codeToSearch: string, allowDefaultFallback = false) => {
    const trimmed = codeToSearch.trim();
    if (!trimmed) {
      if (allowDefaultFallback && allRequests.length > 0) {
        setActiveRequest(allRequests[0]);
        setSearchCode(allRequests[0].requestCode);
        setNotFoundQuery(null);
      } else {
        setActiveRequest(null);
        setNotFoundQuery('empty query');
      }
      return;
    }

    const found = allRequests.find(
      r => r.requestCode.toLowerCase() === trimmed.toLowerCase()
    );
    if (found) {
      setActiveRequest(found);
      setNotFoundQuery(null);
    } else if (allowDefaultFallback && allRequests.length > 0) {
      setActiveRequest(allRequests[0]);
      setSearchCode(allRequests[0].requestCode);
      setNotFoundQuery(null);
    } else {
      setActiveRequest(null);
      setNotFoundQuery(trimmed);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setCopiedSummary(false);
    if (initialRequestCode) {
      setSearchCode(initialRequestCode);
      lookupRequest(initialRequestCode, false);
    } else {
      lookupRequest(searchCode, true);
    }
  }, [isOpen, initialRequestCode, storeRevision]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookupRequest(searchCode, false);
  };

  const handleCopyDispatchSummary = () => {
    if (!activeRequest) return;
    const { etaLabel, statusHeadline } = getStagesForRequest(activeRequest);
    const text = [
      `BloodConnect Dispatch Update`,
      `Requisition: ${activeRequest.requestCode}`,
      `Patient: ${activeRequest.patientName}`,
      `Hospital: ${activeRequest.hospitalName}`,
      `Requirement: ${activeRequest.unitsRequired} unit(s) ${activeRequest.bloodGroup} ${activeRequest.component} (${activeRequest.urgency})`,
      `Status: ${activeRequest.status} — ${statusHeadline}`,
      `ETA: ${etaLabel} | 24/7 Helpline: 1800-11-9999`
    ].join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  if (!isOpen) return null;

  const stageMeta = activeRequest ? getStagesForRequest(activeRequest) : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispatch-tracker-title"
    >
      <div className="w-full max-w-4xl bg-white rounded-2xl p-6 sm:p-7 shadow-xl border border-slate-200 relative my-auto space-y-6">
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-rose-700">
              24/7 Transfusion Logistics · Cold-Chain Traceability
            </p>
            <h2
              id="dispatch-tracker-title"
              className="text-xl sm:text-2xl font-display font-bold text-slate-950 tracking-tight mt-0.5 flex items-center gap-2"
            >
              <Truck className="w-5 h-5 text-rose-700 shrink-0" />
              <span>Emergency Blood Dispatch Tracker</span>
            </h2>
          </div>

          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => {
                setIsRefreshing(true);
                lookupRequest(searchCode, false);
                setTimeout(() => setIsRefreshing(false), 500);
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dispatch tracker"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search / Preset Requisition Bar */}
        <div className="space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchCode}
                onChange={e => setSearchCode(e.target.value)}
                placeholder="Enter Requisition Code (e.g. REQ-2026-8801)"
                className="w-full pl-10 pr-4 py-2.5 text-xs font-mono font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              Track Requisition
            </button>
          </form>

          {allRequests.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Active Requisitions:</span>
              {allRequests.slice(0, 5).map(req => (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => {
                    setSearchCode(req.requestCode);
                    setActiveRequest(req);
                    setNotFoundQuery(null);
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                    activeRequest?.requestCode === req.requestCode
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {req.requestCode} · {req.bloodGroup}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active Dispatch Details */}
        {activeRequest && stageMeta ? (
          <div className="space-y-5">
            {/* 3 Clinical Telemetry Tiles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-slate-950 text-white space-y-1">
                <div className="text-xs text-slate-400">Current Stage ETA</div>
                <div className="text-2xl font-display font-bold font-mono tracking-tight tabular-data">
                  {stageMeta.etaLabel}
                </div>
                <div className="text-xs text-slate-300">{stageMeta.statusHeadline}</div>
              </div>

              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <ThermometerSnowflake className="w-3.5 h-3.5 text-slate-600" />
                    <span>Cold-Chain Spec</span>
                  </span>
                  <span className="font-semibold text-emerald-700">Compliant</span>
                </div>
                <div className="text-2xl font-display font-bold font-mono text-slate-950 tabular-data">
                  {stageMeta.tempRange}
                </div>
                <div className="text-xs text-slate-500">Target Range: 2.0°C – 6.0°C</div>
              </div>

              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Requisition Spec</span>
                  <span
                    className={`font-semibold ${
                      activeRequest.urgency === 'Emergency' ? 'text-rose-700' : 'text-slate-700'
                    }`}
                  >
                    {activeRequest.urgency} · {activeRequest.status}
                  </span>
                </div>
                <div className="text-2xl font-display font-bold text-slate-950 flex items-baseline gap-2 tabular-data">
                  <span className="font-mono text-rose-700">{activeRequest.bloodGroup}</span>
                  <span>
                    {activeRequest.unitsRequired} {activeRequest.unitsRequired === 1 ? 'Unit' : 'Units'}
                  </span>
                </div>
                <div className="text-xs text-slate-600 truncate">{activeRequest.component}</div>
              </div>
            </div>

            {/* 5-Stage Status-Accurate Pipeline Stepper */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">Clinical Dispatch Milestones</span>
                <span className="font-mono text-slate-600">
                  Fulfilled: {activeRequest.unitsFulfilled} / {activeRequest.unitsRequired} units
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {stageMeta.stages.map(st => (
                  <div
                    key={st.step}
                    className={`p-3 rounded-lg border text-left ${
                      st.active
                        ? 'bg-white border-rose-700 ring-1 ring-rose-700 text-slate-950'
                        : st.done
                        ? 'bg-white border-slate-200 text-slate-800'
                        : 'bg-slate-100/70 border-slate-200 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-mono font-semibold">0{st.step}</span>
                      {st.done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full border border-slate-300" />
                      )}
                    </div>
                    <div className="text-xs font-semibold leading-snug">{st.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{st.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hospital & Clinical Notes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                <h3 className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-rose-700" />
                  <span>Destination Hospital</span>
                </h3>
                <div className="space-y-1 text-slate-600">
                  <div className="font-semibold text-sm text-slate-950">{activeRequest.hospitalName}</div>
                  <div>
                    Patient: <strong className="font-semibold text-slate-900">{activeRequest.patientName}</strong>
                  </div>
                  <div>
                    Clinical Notes:{' '}
                    <span>{activeRequest.doctorNotes || activeRequest.remarks || 'Standard transfusion protocol'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                <h3 className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-slate-700" />
                  <span>Dispatch Coordination</span>
                </h3>
                <div className="space-y-1 text-slate-600">
                  <div className="font-semibold text-sm text-slate-950">Central Cold-Chain Desk</div>
                  <div>
                    Requisition Code: <strong className="font-mono text-slate-900">{activeRequest.requestCode}</strong>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <Phone className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="font-mono font-semibold text-emerald-700">1800-11-9999</span>
                    <span className="text-slate-400">· 24/7 Duty Officer</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyDispatchSummary}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedSummary ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedSummary ? 'Dispatch Summary Copied' : 'Copy Update for Doctor / Family'}</span>
                </button>

                <a
                  href="tel:1800119999"
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call 1800-11-9999</span>
                </a>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Close Tracker
              </button>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center space-y-3 border border-slate-200 rounded-xl bg-slate-50">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
            <h3 className="text-base font-display font-bold text-slate-950">
              No Requisition Found for “{notFoundQuery || searchCode}”
            </h3>
            <p className="text-xs text-slate-600 max-w-sm mx-auto">
              Verify the exact requisition code from your dispatch confirmation, or select one of the active requests listed above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
