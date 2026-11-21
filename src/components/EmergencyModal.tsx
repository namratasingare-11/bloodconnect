import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  X,
  Clock,
  ShieldAlert,
  PhoneCall,
  CheckCircle2,
  Copy,
  Check
} from 'lucide-react';
import { BloodGroup, BloodComponent, EmergencyPrefill } from '../types';
import { db } from '../db/databaseStore';

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefill?: EmergencyPrefill | null;
  onSuccessNavigate?: () => void;
  onTrackDispatch?: (requestCode: string) => void;
  onNotify?: (message: string) => void;
}

const BLOOD_GROUPS: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
const COMPONENTS: BloodComponent[] = [
  'Packed Red Cells',
  'Whole Blood',
  'Platelets',
  'Fresh Frozen Plasma',
  'Cryoprecipitate'
];

export default function EmergencyModal({
  isOpen,
  onClose,
  prefill,
  onSuccessNavigate,
  onTrackDispatch,
  onNotify
}: EmergencyModalProps) {
  const hospitals = db.getHospitals();
  const [selectedHospitalId, setSelectedHospitalId] = useState<number>(hospitals[0]?.id || 1);
  const [hospitalName, setHospitalName] = useState(hospitals[0]?.name || 'Lilavati Hospital & Research Centre');
  const [patientName, setPatientName] = useState('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O-');
  const [component, setComponent] = useState<BloodComponent>('Packed Red Cells');
  const [units, setUnits] = useState<number>(2);
  const [doctorNotes, setDoctorNotes] = useState('Immediate acute hemorrhage — ICU trauma dispatch');
  const [contactPhone, setContactPhone] = useState('+91 98201 12233');
  const [submittedResult, setSubmittedResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Live stock availability check for the selected blood group & component
  const liveMatchingUnits = useMemo(() => {
    if (!isOpen) return 0;
    return db
      .getBloodUnits()
      .filter(
        u =>
          u.status === 'Available' &&
          u.bloodGroup === bloodGroup &&
          u.component === component
      ).length;
  }, [isOpen, bloodGroup, component]);

  // Dismiss modal with Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Sync context-aware prefill whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSubmittedResult(null);
    setErrorMessage(null);
    setCopiedCode(false);
    setPatientName('');

    if (prefill?.hospitalId) {
      const matched = hospitals.find(h => h.id === prefill.hospitalId);
      if (matched) {
        setSelectedHospitalId(matched.id);
        setHospitalName(matched.name);
      }
    } else if (hospitals[0]) {
      setSelectedHospitalId(hospitals[0].id);
      setHospitalName(hospitals[0].name);
    }

    setBloodGroup(prefill?.bloodGroup || 'O-');
    setComponent(prefill?.component || 'Packed Red Cells');
    setUnits(2);
    setDoctorNotes(prefill?.urgencyNote || 'Immediate clinical transfusion requirement — ICU priority');
  }, [isOpen, prefill]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!patientName.trim()) {
      setErrorMessage('Please enter the patient full name for emergency clinical triage.');
      return;
    }

    const hosp = hospitals.find(h => h.id === selectedHospitalId) || hospitals[0];

    const res = db.createBloodRequest({
      hospitalId: hosp.id,
      hospitalName: hospitalName || hosp.name,
      patientName: patientName.trim(),
      patientCode: 'PAT-EMERGENCY',
      bloodGroup,
      component,
      unitsRequired: units,
      urgency: 'Emergency',
      doctorNotes: `[PRIORITY 1 - IMMEDIATE DISPATCH] ${doctorNotes}. Phone: ${contactPhone}`
    });

    setSubmittedResult(res.requestCode);
    if (onNotify) {
      onNotify(`Emergency requisition ${res.requestCode} dispatched for ${bloodGroup} (${units} units).`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-modal-title"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-xl relative my-auto overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-700 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-rose-700">24/7 Rapid Transfusion Desk · Hotline 1800-11-9999</p>
              <h2 id="emergency-modal-title" className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
                Emergency Blood Requisition
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close emergency modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[78vh] overflow-y-auto">
          {submittedResult ? (
            <div className="py-4 space-y-5">
              <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-900">
                      Priority Requisition Dispatched
                    </h3>
                    <p className="text-sm text-slate-600">
                      Requisition <span className="font-mono font-semibold text-slate-900 tabular-data">{submittedResult}</span> has been broadcast to duty lab technicians and regional cold-vault dispatchers.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(submittedResult).catch(() => {});
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-xs font-semibold text-slate-800 hover:bg-emerald-100/50 transition-colors cursor-pointer shrink-0"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy ID'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">Blood Group</span>
                  <span className="font-mono font-bold text-rose-700 text-sm">{bloodGroup}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Component</span>
                  <span className="font-semibold text-slate-900">{component}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Units</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-data">{units} units</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Target SLA</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-data">15–20 mins</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                {onTrackDispatch && (
                  <button
                    type="button"
                    onClick={() => {
                      const code = submittedResult;
                      onClose();
                      onTrackDispatch(code);
                    }}
                    className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-rose-700 hover:bg-rose-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Clock className="w-4 h-4" />
                    <span>Track Live Transit</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onSuccessNavigate) onSuccessNavigate();
                  }}
                  className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Open Hospital Desk
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {prefill && (prefill.bloodGroup || prefill.hospitalId) && (
                <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-2">
                  <span>
                    Pre-filled from your current selection: <strong className="text-slate-900">{bloodGroup}</strong> · {component}
                  </span>
                  <span className="text-slate-400">Editable below</span>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Target Hospital / Transfusion Desk
                </label>
                <select
                  value={selectedHospitalId}
                  onChange={e => {
                    const id = Number(e.target.value);
                    setSelectedHospitalId(id);
                    const matched = hospitals.find(h => h.id === id);
                    if (matched) setHospitalName(matched.name);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm border border-slate-300 font-medium bg-white text-slate-900"
                >
                  {hospitals.map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name} — {h.city} ({h.hospitalCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Patient Full Name *</label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={e => setPatientName(e.target.value)}
                    placeholder="e.g., Arjun Kulkarni"
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm border border-slate-300 text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Emergency Contact Phone *</label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm font-mono border border-slate-300 text-slate-900"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Blood Group *</label>
                  <select
                    value={bloodGroup}
                    onChange={e => setBloodGroup(e.target.value as BloodGroup)}
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 bg-white text-slate-900"
                  >
                    {BLOOD_GROUPS.map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Component *</label>
                  <select
                    value={component}
                    onChange={e => setComponent(e.target.value as BloodComponent)}
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm border border-slate-300 bg-white text-slate-900"
                  >
                    {COMPONENTS.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Units Required *</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={units}
                    onChange={e => setUnits(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm font-mono font-semibold border border-slate-300 text-slate-900 tabular-data"
                    required
                  />
                </div>
              </div>

              {/* Live Vault Stock Readiness Preview */}
              <div
                className={`px-3.5 py-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                  liveMatchingUnits >= units
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <span>
                  {liveMatchingUnits >= units ? (
                    <>
                      <strong className="font-mono tabular-data">{liveMatchingUnits}</strong> verified {bloodGroup} {component} units ready in network vaults for immediate reservation.
                    </>
                  ) : (
                    <>
                      Direct vault stock is <strong className="font-mono tabular-data">{liveMatchingUnits} unit{liveMatchingUnits === 1 ? '' : 's'}</strong> — inter-hospital transfer &amp; compatible donor dispatch will activate automatically.
                    </>
                  )}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Clinical Diagnosis / Ward Notes</label>
                <textarea
                  rows={2}
                  value={doctorNotes}
                  onChange={e => setDoctorNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg text-sm border border-slate-300 text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <PhoneCall className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                  <span>Direct ICU Hotline: <strong className="font-mono text-slate-800">1800-11-9999</strong></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Dispatch Priority Request
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
