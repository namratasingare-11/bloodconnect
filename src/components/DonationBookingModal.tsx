import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Droplet,
  CheckCircle2,
  Printer,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Building2,
  CalendarPlus
} from 'lucide-react';
import {
  BloodGroup,
  BookingPrefill,
  DonationAppointment,
  User
} from '../types';
import { db } from '../db/databaseStore';
import { downloadAppointmentIcs } from '../utils/calendarExport';

interface DonationBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  prefill?: BookingPrefill | null;
  viewingPass?: DonationAppointment | null;
  onBooked?: (appointment: DonationAppointment) => void;
  onGoToDashboard?: () => void;
}

const BLOOD_GROUPS: BloodGroup[] = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

const DONATION_TYPES: Array<{
  type: 'Whole Blood' | 'Apheresis Platelets' | 'Plasma';
  duration: string;
  note: string;
}> = [
  { type: 'Whole Blood', duration: '15–20 mins', note: 'Standard 350–450 mL collection · helps up to 3 patients' },
  { type: 'Apheresis Platelets', duration: '45–60 mins', note: 'Automated cell separation · critical for oncology & trauma' },
  { type: 'Plasma', duration: '35–45 mins', note: 'Fresh frozen plasma support · burn & coagulation care' }
];

const TIME_SLOTS = [
  { label: '09:00 AM - 10:00 AM', slotsLeft: 5 },
  { label: '10:00 AM - 11:00 AM', slotsLeft: 3 },
  { label: '11:30 AM - 12:30 PM', slotsLeft: 4 },
  { label: '02:00 PM - 03:00 PM', slotsLeft: 6 },
  { label: '03:30 PM - 04:30 PM', slotsLeft: 2 },
  { label: '05:00 PM - 06:00 PM', slotsLeft: 4 }
];

function getUpcomingDates(days = 7): Array<{ iso: string; dayLabel: string; dateNum: string; monthLabel: string }> {
  const out = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(Date.now() + i * 86400000);
    out.push({
      iso: d.toISOString().split('T')[0],
      dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateNum: String(d.getDate()),
      monthLabel: d.toLocaleDateString('en-US', { month: 'short' })
    });
  }
  return out;
}

export default function DonationBookingModal({
  isOpen,
  onClose,
  currentUser,
  prefill,
  viewingPass,
  onBooked,
  onGoToDashboard
}: DonationBookingModalProps) {
  const hospitals = useMemo(() => db.getHospitals(), []);
  const cities = useMemo(() => {
    const unique = Array.from(new Set(hospitals.map(h => h.city)));
    return ['ALL', ...unique];
  }, [hospitals]);
  const upcomingDates = useMemo(() => getUpcomingDates(7), []);

  const matchedDonor = useMemo(() => {
    if (!currentUser) return null;
    const donors = db.getDonors();
    if (currentUser.donorId) {
      const byId = donors.find(d => d.id === currentUser.donorId);
      if (byId) return byId;
    }
    return donors.find(d => d.email.toLowerCase() === currentUser.email.toLowerCase()) || null;
  }, [currentUser]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [selectedHospitalId, setSelectedHospitalId] = useState<number>(hospitals[0]?.id || 1);
  const [donationType, setDonationType] = useState<'Whole Blood' | 'Apheresis Platelets' | 'Plasma'>('Whole Blood');
  const [appointmentDate, setAppointmentDate] = useState<string>(upcomingDates[0]?.iso || '');
  const [timeSlot, setTimeSlot] = useState<string>(TIME_SLOTS[1].label);

  const [donorName, setDonorName] = useState<string>('');
  const [donorEmail, setDonorEmail] = useState<string>('');
  const [donorPhone, setDonorPhone] = useState<string>('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedPass, setConfirmedPass] = useState<DonationAppointment | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Sync prefill and user details whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (viewingPass) {
      setConfirmedPass(viewingPass);
      return;
    }

    setConfirmedPass(null);
    setStep(1);
    setErrorMsg(null);
    setCopiedCode(false);

    if (prefill?.city && cities.includes(prefill.city)) {
      setCityFilter(prefill.city);
      const inCity = hospitals.find(h => h.city === prefill.city);
      if (inCity) setSelectedHospitalId(inCity.id);
    } else if (prefill?.hospitalId) {
      setSelectedHospitalId(prefill.hospitalId);
      const hosp = hospitals.find(h => h.id === prefill.hospitalId);
      if (hosp) setCityFilter(hosp.city);
    } else {
      setCityFilter('ALL');
      setSelectedHospitalId(hospitals[0]?.id || 1);
    }

    setDonationType(prefill?.donationType || 'Whole Blood');
    setAppointmentDate(upcomingDates[0]?.iso || new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    setTimeSlot(TIME_SLOTS[1].label);

    setDonorName(matchedDonor?.fullName || currentUser?.fullName || '');
    setDonorEmail(matchedDonor?.email || currentUser?.email || '');
    setDonorPhone(matchedDonor?.phone || currentUser?.phone || '');
    setBloodGroup(prefill?.bloodGroup || matchedDonor?.bloodGroup || 'O+');
  }, [isOpen, viewingPass, prefill, currentUser, matchedDonor, hospitals, cities, upcomingDates]);

  const filteredHospitals = useMemo(() => {
    if (cityFilter === 'ALL') return hospitals;
    return hospitals.filter(h => h.city === cityFilter);
  }, [hospitals, cityFilter]);

  const selectedHospital = useMemo(() => {
    return hospitals.find(h => h.id === selectedHospitalId) || filteredHospitals[0] || hospitals[0];
  }, [hospitals, filteredHospitals, selectedHospitalId]);

  // Compute real remaining slot capacity based on existing scheduled appointments
  const dynamicTimeSlots = useMemo(() => {
    const existing = db.getAppointments().filter(
      a =>
        a.hospitalId === selectedHospital?.id &&
        a.appointmentDate === appointmentDate &&
        a.status !== 'Cancelled'
    );
    return TIME_SLOTS.map(slot => {
      const bookedCount = existing.filter(a => a.timeSlot === slot.label).length;
      const remaining = Math.max(1, slot.slotsLeft - bookedCount);
      return { ...slot, slotsLeft: remaining };
    });
  }, [selectedHospital?.id, appointmentDate, isOpen]);

  // Dismiss modal with Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirmBooking = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!donorName.trim()) {
      setErrorMsg('Please enter the donor full name.');
      return;
    }
    if (!donorPhone.trim() || donorPhone.replace(/\D/g, '').length < 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number for slot reminders.');
      return;
    }
    if (!donorEmail.trim() || !donorEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address for your digital pass.');
      return;
    }
    if (!appointmentDate) {
      setErrorMsg('Please select a preferred donation date.');
      return;
    }

    const created = db.createDonationAppointment({
      donorId: matchedDonor?.id || currentUser?.donorId,
      donorName,
      donorPhone,
      donorEmail,
      bloodGroup,
      hospitalId: selectedHospital.id,
      donationType,
      appointmentDate,
      timeSlot
    });

    setConfirmedPass(created);
    if (onBooked) onBooked(created);
  };

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl relative my-auto overflow-hidden">
        {/* Top bar */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {confirmedPass ? 'Confirmed Appointment Pass' : `Direct Blood Bank Scheduling · Step ${step} of 3`}
            </p>
            <h2 id="booking-modal-title" className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
              {confirmedPass ? 'Digital Donation Pass' : 'Schedule a Blood Donation'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close booking dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator (when booking) */}
        {!confirmedPass && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-6 text-xs font-medium">
            {[
              { num: 1, label: '01. Center & Type' },
              { num: 2, label: '02. Date & Slot' },
              { num: 3, label: '03. Donor Details' }
            ].map(item => (
              <button
                key={item.num}
                type="button"
                onClick={() => {
                  if (item.num < step) setStep(item.num as 1 | 2 | 3);
                }}
                className={`whitespace-nowrap shrink-0 transition-colors ${
                  step === item.num
                    ? 'text-rose-700 font-semibold'
                    : step > item.num
                    ? 'text-slate-800 hover:text-rose-700 cursor-pointer'
                    : 'text-slate-400 cursor-default'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {confirmedPass ? (
            /* ----------------- DIGITAL APPOINTMENT PASS ----------------- */
            <div className="space-y-6">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {/* Pass Header */}
                <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400">BloodConnect Verified Pass</p>
                    <div className="font-mono text-xl font-semibold tracking-tight mt-0.5 tabular-data">
                      {confirmedPass.appointmentCode}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Blood Group</p>
                      <p className="font-mono text-xl font-bold text-rose-400 tabular-data">
                        {confirmedPass.bloodGroup}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pass Details Grid */}
                <div className="p-6 bg-white grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Donor Name</p>
                    <p className="font-semibold text-slate-900 mt-0.5">{confirmedPass.donorName}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-data">{confirmedPass.donorPhone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Appointment Window</p>
                    <p className="font-semibold text-slate-900 mt-0.5 font-mono tabular-data">
                      {confirmedPass.appointmentDate}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">{confirmedPass.timeSlot}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Collection Center</p>
                    <p className="font-semibold text-slate-900 mt-0.5">{confirmedPass.centerName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {confirmedPass.centerAddress}, {confirmedPass.city}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Donation Type · Status</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {confirmedPass.donationType} ·{' '}
                      <span className={confirmedPass.status === 'Cancelled' ? 'text-rose-700' : 'text-emerald-700'}>
                        {confirmedPass.status}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Bring valid photo ID at reception</p>
                  </div>
                </div>

                {/* Clean SVG Barcode Strip */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <svg width="132" height="32" viewBox="0 0 132 32" aria-label="Appointment check-in barcode" className="text-slate-900 shrink-0">
                      {[2, 6, 10, 16, 20, 26, 30, 34, 42, 46, 52, 58, 62, 68, 74, 78, 84, 90, 96, 100, 108, 114, 120, 126].map((x, idx) => (
                        <rect
                          key={x}
                          x={x}
                          y={2}
                          width={idx % 3 === 0 ? 3 : idx % 2 === 0 ? 2 : 1.5}
                          height={28}
                          fill="currentColor"
                        />
                      ))}
                    </svg>
                    <div className="text-xs text-slate-500">
                      Scan at blood bank reception desk for priority check-in
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(confirmedPass.appointmentCode)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>
              </div>

              {/* Pre-Donation Preparation Checklist */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs font-semibold text-slate-900 mb-2">Before Your Visit</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                  <div>Drink 500 mL of water 2 hours prior to donation.</div>
                  <div>Eat a balanced, iron-rich meal (avoid fatty foods).</div>
                  <div>Carry a government photo ID and get 7+ hours of rest.</div>
                </div>
              </div>

              {/* Pass Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 no-print">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadAppointmentIcs(confirmedPass)}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <CalendarPlus className="w-4 h-4 text-rose-700" />
                    <span>Add to Calendar (.ics)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print / Save Pass</span>
                  </button>
                </div>
                <div className="flex items-center gap-2.5">
                  {onGoToDashboard && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onGoToDashboard();
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-700 text-white text-sm font-medium hover:bg-rose-800 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>View in Donor Portal</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-800 text-sm font-medium hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : step === 1 ? (
            /* ----------------- STEP 1: CENTER & DONATION TYPE ----------------- */
            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <label className="text-sm font-semibold text-slate-900">1. Choose Collection Center</label>
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {cities.map(city => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => {
                          setCityFilter(city);
                          const match = city === 'ALL' ? hospitals[0] : hospitals.find(h => h.city === city);
                          if (match) setSelectedHospitalId(match.id);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          cityFilter === city
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {city === 'ALL' ? 'All Cities' : city}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {filteredHospitals.map(hosp => {
                    const isSelected = selectedHospital?.id === hosp.id;
                    return (
                      <button
                        key={hosp.id}
                        type="button"
                        onClick={() => setSelectedHospitalId(hosp.id)}
                        className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer flex items-start justify-between gap-4 ${
                          isSelected
                            ? 'border-rose-700 bg-rose-50/40'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Building2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-rose-700' : 'text-slate-400'}`} />
                            <span className="text-sm font-semibold text-slate-900">{hosp.name}</span>
                          </div>
                          <p className="text-xs text-slate-500 pl-6">
                            {hosp.address} · {hosp.city}
                          </p>
                          <p className="text-xs text-slate-500 pl-6 font-mono tabular-data">
                            {hosp.phone} · Mon–Sun 08:30 AM – 06:30 PM
                          </p>
                        </div>
                        <span className={`text-xs font-medium shrink-0 ${isSelected ? 'text-rose-700' : 'text-slate-400'}`}>
                          {isSelected ? 'Selected' : 'Select'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-3">2. Select Donation Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {DONATION_TYPES.map(item => {
                    const active = donationType === item.type;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setDonationType(item.type)}
                        className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                          active
                            ? 'border-rose-700 bg-rose-50/40'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-900">{item.type}</div>
                        <div className="text-xs text-rose-700 font-medium mt-0.5">{item.duration}</div>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{item.note}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-700 text-white text-sm font-medium hover:bg-rose-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Choose Date &amp; Time</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : step === 2 ? (
            /* ----------------- STEP 2: DATE & TIME SLOT ----------------- */
            <div className="space-y-6">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong className="text-slate-900">{selectedHospital?.name}</strong> · {selectedHospital?.city} · {donationType}
                </span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-rose-700 font-medium hover:underline cursor-pointer"
                >
                  Change center
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-slate-900">Select Preferred Date</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={appointmentDate}
                    onChange={e => setAppointmentDate(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-800 bg-white"
                  />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {upcomingDates.map(d => {
                    const active = appointmentDate === d.iso;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => setAppointmentDate(d.iso)}
                        className={`py-2.5 px-2 rounded-xl border text-center transition-colors cursor-pointer ${
                          active
                            ? 'border-rose-700 bg-rose-700 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className={`text-[11px] ${active ? 'text-rose-100' : 'text-slate-500'}`}>{d.dayLabel}</div>
                        <div className="text-base font-bold font-mono tabular-data mt-0.5">{d.dateNum}</div>
                        <div className={`text-[11px] ${active ? 'text-rose-100' : 'text-slate-400'}`}>{d.monthLabel}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-3">Available Hourly Windows</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {dynamicTimeSlots.map(slot => {
                    const active = timeSlot === slot.label;
                    return (
                      <button
                        key={slot.label}
                        type="button"
                        onClick={() => setTimeSlot(slot.label)}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors cursor-pointer flex items-center justify-between ${
                          active
                            ? 'border-rose-700 bg-rose-50/50 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-sm font-medium flex items-center gap-2">
                          <Clock className={`w-4 h-4 ${active ? 'text-rose-700' : 'text-slate-400'}`} />
                          <span>{slot.label}</span>
                        </span>
                        <span className="text-xs text-slate-500 font-mono tabular-data">{slot.slotsLeft} open</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-700 text-white text-sm font-medium hover:bg-rose-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Continue to Donor Details</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* ----------------- STEP 3: DONOR DETAILS & CONFIRM ----------------- */
            <form onSubmit={handleConfirmBooking} className="space-y-5">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong className="text-slate-900">{selectedHospital?.name}</strong> ·{' '}
                  <span className="font-mono tabular-data">{appointmentDate}</span> · {timeSlot}
                </span>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-rose-700 font-medium hover:underline cursor-pointer"
                >
                  Edit slot
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={e => setDonorName(e.target.value)}
                    placeholder="e.g., Priya Deshmukh"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:border-rose-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mobile Number *</label>
                  <input
                    type="tel"
                    value={donorPhone}
                    onChange={e => setDonorPhone(e.target.value)}
                    placeholder="+91 98201 00000"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:border-rose-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address *</label>
                  <input
                    type="email"
                    value={donorEmail}
                    onChange={e => setDonorEmail(e.target.value)}
                    placeholder="donor@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:border-rose-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Blood Group *</label>
                  <select
                    value={bloodGroup}
                    onChange={e => setBloodGroup(e.target.value as BloodGroup)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-900 bg-white focus:border-rose-700"
                  >
                    {BLOOD_GROUPS.map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>
                  On-site hemoglobin (&ge;12.5 g/dL) and vital signs triage are completed free of charge at the collection center prior to donation.
                </span>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-700 text-white text-sm font-medium hover:bg-rose-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm &amp; Generate Pass</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
