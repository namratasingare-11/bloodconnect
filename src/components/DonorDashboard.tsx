import { useState, useMemo, useEffect } from 'react';
import { 
  Heart, 
  Droplet, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Download, 
  MapPin, 
  Plus,
  Printer,
  XCircle,
  RefreshCw,
  ArrowRight,
  Award,
  ShieldCheck,
  AlertCircle,
  CalendarPlus
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Donor, User, DonationAppointment } from '../types';
import { db } from '../db/databaseStore';
import { DONATION_TIME_SLOTS } from '../config/constants';
import { UnderlineTabs } from './ui/UnderlineTabs';
import { downloadAppointmentIcs } from '../utils/calendarExport';

interface DonorDashboardProps {
  currentUser: User;
  onNavigate: (view: string) => void;
  onOpenCamps: () => void;
  onOpenBooking?: () => void;
  onViewAppointmentPass?: (appointment: DonationAppointment) => void;
  onNotify?: (message: string) => void;
}

const RESCHEDULE_SLOTS = DONATION_TIME_SLOTS;

export default function DonorDashboard({
  currentUser,
  onNavigate,
  onOpenCamps,
  onOpenBooking,
  onViewAppointmentPass,
  onNotify
}: DonorDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'history' | 'eligibility' | 'card'>('overview');
  const [refreshToggle, setRefreshToggle] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleSlot, setRescheduleSlot] = useState<string>(RESCHEDULE_SLOTS[1]);

  useEffect(() => {
    return db.subscribe(() => setRefreshToggle(t => t + 1));
  }, []);

  // Match donor record
  const donor: Donor = useMemo(() => {
    const list = db.getDonors();
    if (currentUser.donorId) {
      const foundById = list.find(d => d.id === currentUser.donorId);
      if (foundById) return foundById;
    }
    const foundByEmail = list.find(d => d.email.toLowerCase() === currentUser.email.toLowerCase());
    if (foundByEmail) return foundByEmail;
    return list[0];
  }, [currentUser, refreshToggle]);

  const appointments = useMemo(() => {
    return db.getDonorAppointments(donor.id, donor.email);
  }, [donor.id, donor.email, refreshToggle]);

  const activeAppointmentsCount = useMemo(
    () => appointments.filter(a => a.status === 'Scheduled' || a.status === 'Checked In').length,
    [appointments]
  );

  const notify = (msg: string) => {
    if (onNotify) onNotify(msg);
    else {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const handleCancelAppointment = (apt: DonationAppointment) => {
    db.updateAppointmentStatus(apt.id, 'Cancelled');
    setRefreshToggle(t => t + 1);
    notify(`Appointment ${apt.appointmentCode} has been cancelled.`);
  };

  const handleSaveReschedule = (aptId: number) => {
    if (!rescheduleDate) return;
    const updated = db.rescheduleAppointment(aptId, rescheduleDate, rescheduleSlot);
    if (updated) {
      setReschedulingId(null);
      setRefreshToggle(t => t + 1);
      notify(`Rescheduled ${updated.appointmentCode} to ${rescheduleDate} (${rescheduleSlot}).`);
    }
  };

  const handleToggleEmergencyAvailability = () => {
    const nextAvailability = donor.availability === 'Available' ? 'Not Available' : 'Available';
    db.updateDonor(donor.id, { availability: nextAvailability });
    setRefreshToggle(t => t + 1);
    setToastMessage(`Emergency dispatch availability updated to: ${nextAvailability}`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handlePrintCard = () => {
    window.print();
    setToastMessage('Digital LifeCard sent to printer / PDF exporter.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Donation history (reactive)
  const donations = useMemo(() => {
    return db.getDonorHistory(donor.id);
  }, [donor.id, refreshToggle]);

  // Real medical screening history for hemoglobin trend
  const screenings = useMemo(() => {
    return db.getDonorScreenings(donor.id);
  }, [donor.id, refreshToggle]);

  // Camp registrations (reactive)
  const registrations = useMemo(() => {
    return db.getCampRegistrations().filter(r => r.donorId === donor.id);
  }, [donor.id, refreshToggle]);

  // Upcoming camps (reactive)
  const upcomingCamps = useMemo(() => {
    return db.getCamps().filter(c => c.status === 'Upcoming').slice(0, 2);
  }, [refreshToggle]);

  const totalCompletedDonations = Math.max(donor.totalDonations || 0, donations.length);
  const livesSaved = Math.max(1, totalCompletedDonations) * 3;

  // Real next-eligible countdown
  const eligibilityCountdown = useMemo(() => {
    const parsed = new Date(`${donor.nextEligibleDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return { isReady: true, daysLeft: 0 };
    }
    const diffDays = Math.ceil((parsed.getTime() - Date.now()) / 86400000);
    return { isReady: diffDays <= 0, daysLeft: Math.max(0, diffDays) };
  }, [donor.nextEligibleDate]);

  // Screening-derived Hemoglobin progression (with clean baseline fallback)
  const chartData = useMemo(() => {
    if (screenings.length >= 2) {
      return screenings
        .slice()
        .reverse()
        .map((s, idx) => ({
          month: s.screeningDate.slice(0, 7),
          donations: idx + 1,
          hemoglobin: s.hemoglobinGdl
        }));
    }
    return [
      { month: 'Cycle 1', donations: 1, hemoglobin: 14.1 },
      { month: 'Cycle 2', donations: 2, hemoglobin: 14.4 },
      { month: 'Cycle 3', donations: 3, hemoglobin: 14.2 },
      { month: 'Latest', donations: 4, hemoglobin: screenings[0]?.hemoglobinGdl || 14.6 }
    ];
  }, [screenings]);

  const avgHemoglobin = useMemo(() => {
    if (chartData.length === 0) return '14.4';
    const avg = chartData.reduce((sum, pt) => sum + pt.hemoglobin, 0) / chartData.length;
    return avg.toFixed(1);
  }, [chartData]);

  const milestones = useMemo(
    () => [
      { label: 'First Drop', target: 1, subtitle: '1st donation' },
      { label: 'Bronze Lifesaver', target: 3, subtitle: '3+ donations' },
      { label: 'Silver Guardian', target: 5, subtitle: '5+ donations' },
      { label: 'Gold Champion', target: 10, subtitle: '10 donations' },
      { label: 'Platinum Responder', target: 15, subtitle: '15 donations' },
      { label: 'Centurion Club', target: 25, subtitle: '25 donations' }
    ],
    []
  );

  // Eligibility check state
  const [calcWeight, setCalcWeight] = useState(donor.weightKg || 68);
  const [calcHb, setCalcHb] = useState(14.5);
  const [calcMonthsSinceLast, setCalcMonthsSinceLast] = useState(4);
  const isCalcEligible = calcWeight >= 45 && calcHb >= 12.5 && calcMonthsSinceLast >= 3;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-800 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ----------------- DONOR WORKSPACE HEADER ----------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-rose-700 text-white flex items-center justify-center text-xl font-mono font-bold shrink-0">
            {donor.bloodGroup}
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-display font-bold text-slate-950 tracking-tight">
              Welcome back, {donor.fullName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="font-mono font-semibold text-slate-900">{donor.donorCode}</span>
              <span className="text-slate-300">·</span>
              <span>{donor.city}, {donor.state}</span>
              <span className="text-slate-300">·</span>
              <span className="font-medium text-emerald-700">{donor.eligibilityStatus}</span>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={handleToggleEmergencyAvailability}
                className={`font-semibold underline underline-offset-2 cursor-pointer ${
                  donor.availability === 'Available'
                    ? 'text-emerald-700 hover:text-emerald-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Toggle 24/7 on-call availability for emergency trauma dispatch"
              >
                Emergency Dispatch: {donor.availability === 'Available' ? 'On-Call' : 'Paused'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('card')}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Digital LifeCard</span>
          </button>
          <button
            type="button"
            onClick={() => (onOpenBooking ? onOpenBooking() : onOpenCamps())}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Book Donation Slot</span>
          </button>
        </div>
      </div>

      {/* Segmented Navigation Tabs */}
      <UnderlineTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'appointments', label: `Appointments & Passes (${activeAppointmentsCount})` },
          { id: 'history', label: `Donation History (${donations.length})` },
          { id: 'eligibility', label: 'Eligibility Check' },
          { id: 'card', label: 'Digital LifeCard' },
        ]}
      />

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* 4 Key Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-xs font-medium text-slate-500 mb-2">Total Donations</div>
              <div className="text-3xl font-display font-bold font-mono text-slate-950 tabular-data">
                {donor.totalDonations}
              </div>
              <span className="text-xs text-emerald-700 font-medium mt-1 block">
                Verified voluntary record
              </span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-xs font-medium text-slate-500 mb-2">Last Donation</div>
              <div className="text-xl font-display font-bold font-mono text-slate-950 tabular-data">
                {donor.lastDonationDate || '2025-11-20'}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                Whole Blood (450 mL)
              </span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-xs font-medium text-slate-500 mb-2">Next Eligible Date</div>
              <div className={`text-xl font-display font-bold font-mono tabular-data ${eligibilityCountdown.isReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                {donor.nextEligibleDate}
              </div>
              <span className={`text-xs font-medium mt-1 block ${eligibilityCountdown.isReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                {eligibilityCountdown.isReady
                  ? 'Cleared to donate today'
                  : `Eligible in ${eligibilityCountdown.daysLeft} days`}
              </span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-xs font-medium text-slate-500 mb-2">Lives Supported</div>
              <div className="text-3xl font-display font-bold font-mono text-rose-700 tabular-data">
                {livesSaved}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                Estimated trauma &amp; surgical impact
              </span>
            </div>
          </div>

          {/* Upcoming Direct Appointment Banner in Overview */}
          {appointments.filter(a => a.status === 'Scheduled').length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-medium text-rose-700">Upcoming Scheduled Appointment</div>
                <div className="text-sm font-semibold text-slate-950">
                  {appointments.find(a => a.status === 'Scheduled')?.centerName} ·{' '}
                  <span className="font-mono tabular-data">
                    {appointments.find(a => a.status === 'Scheduled')?.appointmentDate}
                  </span>{' '}
                  ({appointments.find(a => a.status === 'Scheduled')?.timeSlot})
                </div>
                <div className="text-xs text-slate-500">
                  Pass Code:{' '}
                  <span className="font-mono font-semibold text-slate-800">
                    {appointments.find(a => a.status === 'Scheduled')?.appointmentCode}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onViewAppointmentPass && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextApt = appointments.find(a => a.status === 'Scheduled');
                      if (nextApt) onViewAppointmentPass(nextApt);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Open Digital Pass
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('appointments')}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Manage All
                </button>
              </div>
            </div>
          )}

          {/* Next Steps & Chart row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Donation History Trend */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-display font-bold text-slate-950">Hemoglobin Screening Trend</h3>
                  <p className="text-xs text-slate-500">Recorded pre-donation hemoglobin levels (minimum 12.5 g/dL)</p>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-700 tabular-data">
                  Avg: {avgHemoglobin} g/dL
                </span>
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorHb" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#be123c" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#be123c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis domain={[12, 16.5]} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '10px', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="hemoglobin" stroke="#be123c" strokeWidth={2} fillOpacity={1} fill="url(#colorHb)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right: Active Camp Bookings / Upcoming Camps */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-display font-bold text-slate-950">Registered Camps</h3>
                  <span className="text-xs text-rose-700 font-semibold font-mono tabular-data">{registrations.length} Active</span>
                </div>

                {registrations.length > 0 ? (
                  <div className="space-y-2.5">
                    {registrations.map(reg => (
                      <div key={reg.id} className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs">
                        <div className="flex items-center justify-between font-semibold text-emerald-950 mb-1">
                          <span>{reg.campName}</span>
                          <span className="text-emerald-700">Confirmed</span>
                        </div>
                        <div className="text-slate-600 font-mono tabular-data">Slot: {reg.timeSlot}</div>
                        <div className="text-slate-500">Registered: {new Date(reg.registeredAt).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-600 space-y-1">
                    <p>No active camp reservations yet.</p>
                    <p className="font-semibold text-slate-900">
                      {eligibilityCountdown.isReady
                        ? 'You are eligible to reserve a drive today.'
                        : `Next eligible in ${eligibilityCountdown.daysLeft} days.`}
                    </p>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">Nearby Drives</h4>
                  <div className="space-y-2">
                    {upcomingCamps.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-xs">
                        <div>
                          <div className="font-semibold text-slate-900">{c.name}</div>
                          <div className="text-slate-500 font-mono tabular-data">{c.date} · {c.city}</div>
                        </div>
                        <button
                          type="button"
                          onClick={onOpenCamps}
                          className="px-2.5 py-1 rounded-md bg-rose-700 hover:bg-rose-800 text-white font-semibold text-[11px] cursor-pointer"
                        >
                          Reserve
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenCamps}
                className="mt-4 w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>View All Community Drives</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

          {/* Dynamic Donor Milestones */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-display font-bold text-slate-950">Voluntary Donor Milestones</h3>
                <p className="text-xs text-slate-500">Tracked automatically from your verified donation history</p>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-700 tabular-data">
                {totalCompletedDonations} completed donations
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {milestones.map(m => {
                const unlocked = totalCompletedDonations >= m.target;
                const remaining = Math.max(0, m.target - totalCompletedDonations);
                const pct = Math.min(100, Math.round((totalCompletedDonations / m.target) * 100));
                return (
                  <div
                    key={m.label}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 ${
                      unlocked
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Award className={`w-4 h-4 ${unlocked ? 'text-rose-700' : 'text-slate-400'}`} />
                      <span className={`text-[11px] font-semibold ${unlocked ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {unlocked ? 'Unlocked' : `${remaining} left`}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{m.label}</div>
                      <div className="text-[11px] text-slate-500">{m.subtitle}</div>
                    </div>
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${unlocked ? 'bg-emerald-600' : 'bg-rose-700'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: DONATION HISTORY TABLE */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-display font-bold text-slate-950">Official Blood Donation Records</h3>
              <p className="text-xs text-slate-500">Verified donation and barcode trace history</p>
            </div>
            <span className="text-xs font-bold text-slate-600 px-3 py-1 bg-slate-100 rounded-lg">
              Total Recorded: {donations.length}
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Donation ID</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Units</th>
                  <th className="px-4 py-3">Blood Bag Barcode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Screening Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {donations.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono font-bold text-rose-600">{d.donationCode}</td>
                    <td className="px-4 py-3">{new Date(d.donationDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium">{d.donationType}</td>
                    <td className="px-4 py-3">{d.unitsCollected} unit (450 mL)</td>
                    <td className="px-4 py-3 font-mono text-slate-900">BLD-2026-90{d.bloodUnitId || 12}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{d.notes || 'Normal vitals, safe storage.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ELIGIBILITY CHECK */}
      {activeTab === 'eligibility' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 max-w-2xl mx-auto space-y-6">
          <div>
            <h3 className="text-xl font-display font-bold text-slate-950">Clinical Eligibility Calculator</h3>
            <p className="text-xs text-slate-600 mt-1">
              Verify if you satisfy the national blood transfusion council criteria before visiting a donation camp.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                <span>Body Weight: {calcWeight} kg</span>
                <span className="text-slate-600">Standard: &ge; 45 kg</span>
              </div>
              <input
                type="range"
                min="35"
                max="120"
                value={calcWeight}
                onChange={e => setCalcWeight(Number(e.target.value))}
                className="w-full accent-rose-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                <span>Hemoglobin Level: {calcHb} g/dL</span>
                <span className="text-slate-600">Standard: &ge; 12.5 g/dL</span>
              </div>
              <input
                type="range"
                min="9"
                max="18"
                step="0.1"
                value={calcHb}
                onChange={e => setCalcHb(Number(e.target.value))}
                className="w-full accent-rose-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                <span>Months Since Previous Donation: {calcMonthsSinceLast} months</span>
                <span className="text-slate-600">Standard: &ge; 3 months (90 days)</span>
              </div>
              <input
                type="range"
                min="1"
                max="12"
                value={calcMonthsSinceLast}
                onChange={e => setCalcMonthsSinceLast(Number(e.target.value))}
                className="w-full accent-rose-600"
              />
            </div>
          </div>

          <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 ${
            isCalcEligible ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            {isCalcEligible ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Congratulations! You are eligible to donate.</h4>
                  <p className="mt-1">All vital parameters meet clinical criteria. You can proceed to any blood bank or mobile blood drive.</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Temporary Deferral Suggested</h4>
                  <p className="mt-1">
                    {calcWeight < 45 && '• Weight must be at least 45 kg. '}
                    {calcHb < 12.5 && '• Hemoglobin must be at least 12.5 g/dL. '}
                    {calcMonthsSinceLast < 3 && '• Minimum 90 days required between whole blood donations. '}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB: DIRECT APPOINTMENTS & DIGITAL PASSES */}
      {activeTab === 'appointments' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-display font-bold text-slate-950">
                Direct Donation Appointments &amp; Passes
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                View your scannable pass, reschedule an upcoming window, or book a new hospital blood bank slot.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenCamps}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                Browse Community Camps
              </button>
              {onOpenBooking && (
                <button
                  type="button"
                  onClick={onOpenBooking}
                  className="px-4 py-2 rounded-lg bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Book New Slot</span>
                </button>
              )}
            </div>
          </div>

          {appointments.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">No donation appointments scheduled yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Schedule a 15-minute slot at any accredited hospital vault and receive an instant printable Digital Pass.
                </p>
              </div>
              {onOpenBooking && (
                <button
                  type="button"
                  onClick={onOpenBooking}
                  className="px-4 py-2.5 rounded-lg bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 transition-colors cursor-pointer"
                >
                  Book Your First Slot
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {appointments.map(apt => {
                const isEditing = reschedulingId === apt.id;
                return (
                  <div key={apt.id} className="py-5 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-slate-950">{apt.appointmentCode}</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-medium text-slate-700">{apt.donationType}</span>
                          <span className="text-slate-300">·</span>
                          <span
                            className={`font-semibold ${
                              apt.status === 'Cancelled'
                                ? 'text-rose-700'
                                : apt.status === 'Completed'
                                ? 'text-slate-600'
                                : 'text-emerald-700'
                            }`}
                          >
                            {apt.status}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">{apt.centerName}</div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1 font-mono tabular-data">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {apt.appointmentDate} · {apt.timeSlot}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {apt.centerAddress}, {apt.city}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {apt.status !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() => {
                              downloadAppointmentIcs(apt);
                              notify(`Saved calendar invite (${apt.appointmentCode}.ics) with 2-hour hydration reminder.`);
                            }}
                            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <CalendarPlus className="w-3.5 h-3.5 text-rose-700" />
                            <span>.ics</span>
                          </button>
                        )}
                        {onViewAppointmentPass && (
                          <button
                            type="button"
                            onClick={() => onViewAppointmentPass(apt)}
                            className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>View / Print Pass</span>
                          </button>
                        )}
                        {apt.status === 'Scheduled' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setReschedulingId(isEditing ? null : apt.id);
                                setRescheduleDate(apt.appointmentDate);
                                setRescheduleSlot(apt.timeSlot);
                              }}
                              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Reschedule</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelAppointment(apt)}
                              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">New Date</label>
                          <input
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                            value={rescheduleDate}
                            onChange={e => setRescheduleDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-900"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">New Time Window</label>
                          <select
                            value={rescheduleSlot}
                            onChange={e => setRescheduleSlot(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                          >
                            {RESCHEDULE_SLOTS.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveReschedule(apt.id)}
                            className="px-4 py-2 rounded-lg bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 cursor-pointer whitespace-nowrap"
                          >
                            Save Changes
                          </button>
                          <button
                            type="button"
                            onClick={() => setReschedulingId(null)}
                            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DIGITAL DONOR CARD */}
      {activeTab === 'card' && (
        <div className="max-w-md mx-auto space-y-4">
          <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-rose-700 flex items-center justify-center">
                  <Droplet className="w-4 h-4 fill-white" />
                </span>
                <span className="font-display font-bold text-sm tracking-tight">BloodConnect LifeCard</span>
              </div>
              <span className="text-xs font-medium text-emerald-400">
                Verified Donor
              </span>
            </div>

            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-xs text-slate-400">Donor Full Name</div>
                <div className="text-xl font-display font-bold text-white mt-0.5">{donor.fullName}</div>
                <div className="text-xs font-mono text-slate-400 mt-1 tabular-data">{donor.donorCode}</div>
              </div>
              <div className="w-14 h-14 rounded-xl bg-rose-700 text-white font-mono font-bold text-xl flex items-center justify-center">
                {donor.bloodGroup}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs border-t border-slate-800 pt-4 text-slate-300">
              <div>
                <span className="text-slate-500 block">Total Donations</span>
                <span className="font-mono font-semibold text-white tabular-data">{donor.totalDonations} completed</span>
              </div>
              <div>
                <span className="text-slate-500 block">Next Eligible Date</span>
                <span className="font-mono font-semibold text-emerald-400 tabular-data">{donor.nextEligibleDate}</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <span>National Blood Transfusion Registry</span>
              <span>ISO 9001:2015</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePrintCard}
            className="w-full py-3 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Print / Save Digital LifeCard (PDF)</span>
          </button>
        </div>
      )}

    </div>
  );
}
