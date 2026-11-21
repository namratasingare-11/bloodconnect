import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  Search,
  Building2,
  Phone,
  ArrowRight,
  Filter,
  RotateCcw,
  X,
  Printer
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { DonationCamp, User } from '../types';
import { db } from '../db/databaseStore';
import { useDatabaseSubscription } from '../hooks/useDatabaseSubscription';

interface CampsPageProps {
  currentUser: User | null;
  onOpenAuth: () => void;
  preSelectedCamp?: DonationCamp | null;
}

interface CampBookingConfirmation {
  passCode: string;
  campName: string;
  campDate: string;
  location: string;
  city: string;
  timeSlot: string;
  donorName: string;
}

export default function CampsPage({ currentUser, onOpenAuth, preSelectedCamp }: CampsPageProps) {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed'>('upcoming');
  const [cityFilter, setCityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampForReg, setSelectedCampForReg] = useState<DonationCamp | null>(preSelectedCamp || null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('10:00 AM - 11:00 AM');
  const [confirmation, setConfirmation] = useState<CampBookingConfirmation | null>(null);
  const [regErrorMsg, setRegErrorMsg] = useState<string | null>(null);

  const storeRevision = useDatabaseSubscription();

  useEffect(() => {
    if (preSelectedCamp) {
      setSelectedCampForReg(preSelectedCamp);
      setConfirmation(null);
      setRegErrorMsg(null);
    }
  }, [preSelectedCamp]);

  useEffect(() => {
    if (!selectedCampForReg) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedCampForReg(null);
        setConfirmation(null);
        setRegErrorMsg(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedCampForReg]);

  const camps = useMemo(() => db.getCamps(), [storeRevision]);
  const donors = useMemo(() => db.getDonors(), [storeRevision]);

  const availableCities = useMemo(() => {
    return ['ALL', ...Array.from(new Set(camps.map(c => c.city))).sort()];
  }, [camps]);

  const tabCounts = useMemo(() => {
    const upcoming = camps.filter(c => c.status === 'Upcoming').length;
    const completed = camps.filter(c => c.status === 'Completed').length;
    return { upcoming, completed };
  }, [camps]);

  const filteredCamps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return camps.filter(c => {
      const matchTab = activeTab === 'upcoming' ? c.status === 'Upcoming' : c.status === 'Completed';
      const matchCity = cityFilter === 'ALL' || c.city === cityFilter;
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.organizer.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.campCode.toLowerCase().includes(q);
      return matchTab && matchCity && matchSearch;
    });
  }, [camps, activeTab, cityFilter, searchQuery]);

  const resetFilters = () => {
    setCityFilter('ALL');
    setSearchQuery('');
  };

  const handleCloseModal = () => {
    setSelectedCampForReg(null);
    setConfirmation(null);
    setRegErrorMsg(null);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampForReg) return;

    if (!currentUser) {
      onOpenAuth();
      return;
    }

    let donor = donors.find(
      d => d.email.toLowerCase() === currentUser.email.toLowerCase() || d.id === currentUser.donorId
    );
    if (!donor) {
      donor = db.registerDonor({
        userId: currentUser.id,
        fullName: currentUser.fullName,
        email: currentUser.email,
        phone: currentUser.phone,
        dateOfBirth: '1998-05-15',
        gender: 'Male',
        bloodGroup: 'O+',
        address: 'National Blood Service Registered Address',
        city: selectedCampForReg.city,
        state: 'Maharashtra',
        pincode: '400001',
        weightKg: 65,
        eligibilityStatus: 'Eligible',
        medicalNotes: 'Authenticated voluntary camp donor',
        consentAccepted: true
      });
    }

    const res = db.registerForCamp(selectedCampForReg.id, donor.id, selectedTimeSlot);
    if (res.success) {
      setRegErrorMsg(null);
      const passCode = `CMP-${selectedCampForReg.campCode.replace(/[^A-Z0-9]/gi, '').slice(-4)}-${String(
        Date.now()
      ).slice(-4)}`;
      setConfirmation({
        passCode,
        campName: selectedCampForReg.name,
        campDate: selectedCampForReg.date,
        location: selectedCampForReg.location,
        city: selectedCampForReg.city,
        timeSlot: selectedTimeSlot,
        donorName: currentUser.fullName
      });
      try {
        confetti({ particleCount: 50, spread: 55, origin: { y: 0.65 } });
      } catch {
        // ignore confetti failure in headless contexts
      }
    } else {
      setRegErrorMsg(res.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="pb-6 border-b border-slate-200 max-w-3xl space-y-2">
        <p className="text-xs font-medium text-rose-700">
          Community Blood Drives · Mobile Collection Schedule
        </p>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
          Blood Donation Camps &amp; Drives
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Join mobile outreach camps organized with regional hospitals, universities, and community centers. Reserve a 60-minute arrival window to minimize waiting time.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Upcoming vs Completed Tabs */}
        <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setActiveTab('upcoming')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'upcoming'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upcoming Drives ({tabCounts.upcoming})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'completed'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Completed Camps ({tabCounts.completed})
          </button>
        </div>

        {/* Search & City Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search camp, venue, or organizer..."
              className="pl-9 pr-3 py-2 rounded-lg text-xs border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 w-full sm:w-64"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label="Filter camps by city"
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 cursor-pointer"
            >
              {availableCities.map(city => (
                <option key={city} value={city}>
                  {city === 'ALL' ? 'All Cities' : city}
                </option>
              ))}
            </select>
          </div>

          {(cityFilter !== 'ALL' || searchQuery.trim() !== '') && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-950 border border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Camps Grid or Empty State */}
      {filteredCamps.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCamps.map(camp => {
            const availableSlots = Math.max(0, camp.capacity - camp.registeredDonorsCount);
            const percent = Math.min(100, Math.round((camp.registeredDonorsCount / camp.capacity) * 100));
            const isFull = availableSlots === 0;

            return (
              <div
                key={camp.id}
                className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between transition-colors hover:border-slate-300"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                    <span className="font-mono font-semibold text-rose-700">{camp.campCode}</span>
                    <span className="font-mono tabular-data flex items-center gap-1 text-slate-700">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {camp.date}
                    </span>
                  </div>

                  <h2 className="text-base font-display font-bold text-slate-950 leading-snug">
                    {camp.name}
                  </h2>
                  <p className="text-xs font-medium text-slate-500 mt-1 mb-4 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{camp.organizer}</span>
                  </p>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        {camp.location}, {camp.city}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="tabular-data">
                        {camp.startTime} – {camp.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {camp.contactPerson} ·{' '}
                        <span className="font-mono text-slate-800">{camp.contactPhone}</span>
                      </span>
                    </div>
                  </div>

                  {/* Capacity progress */}
                  <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Slot Reservations</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-data">
                        {camp.registeredDonorsCount} / {camp.capacity} ({availableSlots} open)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-700 rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {camp.status === 'Upcoming' ? (
                  <button
                    type="button"
                    disabled={isFull}
                    onClick={() => {
                      setConfirmation(null);
                      setRegErrorMsg(null);
                      setSelectedCampForReg(camp);
                    }}
                    className="mt-6 w-full py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>{isFull ? 'Camp Capacity Reached' : 'Reserve Camp Slot'}</span>
                    {!isFull && <ArrowRight className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <div className="mt-6 w-full py-2.5 px-3 rounded-lg text-center text-xs font-medium text-slate-600 bg-slate-100 tabular-data">
                    Completed · {camp.registeredDonorsCount} Units Collected
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-900">
            No {activeTab} blood drives match your current filters.
          </p>
          <p className="text-xs text-slate-500">
            Try clearing the city or keyword search, or switch between Upcoming and Completed drives.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        </div>
      )}

      {/* Registration & Confirmation Pass Modal */}
      {selectedCampForReg && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camp-reg-modal-title"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-6 border border-slate-200 shadow-lg space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-medium text-rose-700">
                  {confirmation ? 'Camp Slot Confirmed' : 'Camp Slot Reservation'}
                </p>
                <h3 id="camp-reg-modal-title" className="text-base font-display font-bold text-slate-950 mt-0.5">
                  {selectedCampForReg.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {confirmation ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-900 space-y-0.5">
                    <div className="font-semibold">Your donor arrival slot is reserved.</div>
                    <p className="text-emerald-800">
                      Present this reference code and a valid government photo ID at the camp check-in desk.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-slate-500">Check-in Reference</span>
                    <span className="font-mono font-bold text-slate-950">{confirmation.passCode}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Donor</span>
                    <span className="font-semibold text-slate-900">{confirmation.donorName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Date &amp; Window</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-data">
                      {confirmation.campDate} · {confirmation.timeSlot}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-slate-500 shrink-0">Venue</span>
                    <span className="font-medium text-slate-900 text-right">
                      {confirmation.location}, {confirmation.city}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Pass</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                {regErrorMsg && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
                    {regErrorMsg}
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 text-slate-700">
                  <div>
                    <span className="text-slate-500">Date:</span>{' '}
                    <strong className="font-semibold text-slate-900">
                      {selectedCampForReg.date} ({selectedCampForReg.startTime} – {selectedCampForReg.endTime})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Venue:</span>{' '}
                    <strong className="font-semibold text-slate-900">
                      {selectedCampForReg.location}, {selectedCampForReg.city}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Coordinator:</span>{' '}
                    <strong className="font-semibold text-slate-900">
                      {selectedCampForReg.contactPerson} ({selectedCampForReg.contactPhone})
                    </strong>
                  </div>
                </div>

                <div>
                  <label htmlFor="camp-time-slot" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Preferred Arrival Window
                  </label>
                  <select
                    id="camp-time-slot"
                    value={selectedTimeSlot}
                    onChange={e => setSelectedTimeSlot(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-xs border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 font-medium text-slate-900"
                  >
                    <option value="09:00 AM - 10:00 AM">09:00 AM – 10:00 AM</option>
                    <option value="10:00 AM - 11:00 AM">10:00 AM – 11:00 AM</option>
                    <option value="11:30 AM - 12:30 PM">11:30 AM – 12:30 PM</option>
                    <option value="01:30 PM - 02:30 PM">01:30 PM – 02:30 PM</option>
                    <option value="03:00 PM - 04:00 PM">03:00 PM – 04:00 PM</option>
                  </select>
                </div>

                <div className="text-xs text-slate-600">
                  {currentUser ? (
                    <>
                      Registering as <strong className="font-semibold text-slate-900">{currentUser.fullName}</strong> ({currentUser.email})
                    </>
                  ) : (
                    <>You will be prompted to sign in before confirming your camp reservation.</>
                  )}
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{currentUser ? 'Confirm Camp Slot' : 'Sign In & Reserve'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
