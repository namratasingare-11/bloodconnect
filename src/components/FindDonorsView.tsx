import { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Database, 
  RotateCcw, 
  Download, 
  Phone, 
  Mail, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Calendar, 
  Activity, 
  ShieldCheck, 
  UserCheck, 
  Users,
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  Sparkles,
  Heart,
  Stethoscope,
  X,
  FileText,
  Languages,
  Loader2,
  Copy,
  Check,
  MessageSquareShare
} from 'lucide-react';
import { Donor, BloodGroup, User, MedicalScreening, Donation, DonorSearchFilters } from '../types';
import { db } from '../db/databaseStore';
import { useDatabaseSubscription } from '../hooks/useDatabaseSubscription';
import { SosAppealLanguage, draftMultilingualSosAppeal } from '../services/aiApi';
import { buildWhatsAppShareUrl } from '../utils/regionalVaults';

interface FindDonorsViewProps {
  currentUser?: User | null;
  onOpenAuthGuard?: () => void;
  onNavigate?: (view: string) => void;
  onOpenEligibilityCheck?: () => void;
}

const BLOOD_GROUPS: BloodGroup[] = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'];

const CITIES = [
  'ALL',
  'Mumbai',
  'Pune',
  'Nagpur',
  'Nashik',
  'Nanded',
  'Aurangabad',
  'Thane',
  'Navi Mumbai',
  'Kolhapur',
  'Solapur',
  'Amravati',
  'Jalgaon',
  'Akola'
];

export default function FindDonorsView({ 
  currentUser, 
  onOpenAuthGuard, 
  onNavigate,
  onOpenEligibilityCheck 
}: FindDonorsViewProps) {
  // Search Filters
  const [bloodGroup, setBloodGroup] = useState<string>('ALL');
  const [city, setCity] = useState<string>('ALL');
  const [availability, setAvailability] = useState<string>('ALL');
  const [eligibility, setEligibility] = useState<string>('ALL');
  const [verification, setVerification] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'lastDonationDate' | 'totalDonations' | 'fullName' | 'city'>('lastDonationDate');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Selected donor for detailed relational profile modal
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [selectedDonorScreenings, setSelectedDonorScreenings] = useState<MedicalScreening[]>([]);
  const [selectedDonorDonations, setSelectedDonorDonations] = useState<Donation[]>([]);

  // Show / Hide SQL Inspector (collapsed by default for clinical clarity; toggleable on demand)
  const [showSqlInspector, setShowSqlInspector] = useState<boolean>(false);

  // Quick preset feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isAuthorized = !!(currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff'));
  const storeRevision = useDatabaseSubscription();

  useEffect(() => {
    if (!selectedDonor) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedDonor(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedDonor]);

  // Query execution using db.searchDonors
  const searchResult = useMemo(() => {
    const filters: DonorSearchFilters = {
      bloodGroup,
      city,
      availability,
      eligibility,
      verification,
      searchTerm,
      sortBy,
      sortOrder,
      page,
      pageSize
    };
    return db.searchDonors(filters, currentUser || undefined);
  }, [bloodGroup, city, availability, eligibility, verification, searchTerm, sortBy, sortOrder, page, pageSize, currentUser, storeRevision]);

  // AI Polite Donor Outreach Composer inside selected donor profile modal
  const [outreachLanguage, setOutreachLanguage] = useState<SosAppealLanguage>('English');
  const [outreachDraft, setOutreachDraft] = useState<string>('');
  const [draftingOutreach, setDraftingOutreach] = useState<boolean>(false);
  const [outreachError, setOutreachError] = useState<string | null>(null);
  const [copiedOutreach, setCopiedOutreach] = useState<boolean>(false);

  const handleOpenDonorDetails = (donor: Donor) => {
    if (!currentUser && onOpenAuthGuard) {
      onOpenAuthGuard();
      return;
    }
    setSelectedDonor(donor);
    setSelectedDonorScreenings(db.getDonorScreenings(donor.id));
    setSelectedDonorDonations(db.getDonorDonations(donor.id));
    setOutreachDraft('');
    setOutreachError(null);
    setCopiedOutreach(false);
  };

  const handleDraftDonorOutreach = async (lang: SosAppealLanguage) => {
    if (!selectedDonor) return;
    setOutreachLanguage(lang);
    setOutreachError(null);
    setDraftingOutreach(true);
    try {
      const nearestHospital =
        db.getHospitals().find((h) => h.city.toLowerCase() === selectedDonor.city.toLowerCase()) ||
        db.getHospitals()[0];
      const result = await draftMultilingualSosAppeal({
        mode: 'donor_outreach',
        language: lang,
        bloodGroup: selectedDonor.bloodGroup,
        unitsNeeded: 1,
        component: 'Whole Blood',
        donorName: selectedDonor.fullName.split(' ')[0],
        donorCity: selectedDonor.city,
        hospitalName: nearestHospital?.name,
        hospitalPhone: nearestHospital?.phone,
        hospitalCity: nearestHospital?.city || selectedDonor.city,
      });
      setOutreachDraft(result.appealText);
    } catch (err) {
      setOutreachError(
        err instanceof Error ? err.message : 'Unable to draft outreach message right now.'
      );
    } finally {
      setDraftingOutreach(false);
    }
  };

  const handleCopyOutreach = async () => {
    if (!outreachDraft) return;
    try {
      await navigator.clipboard.writeText(outreachDraft);
      setCopiedOutreach(true);
      setTimeout(() => setCopiedOutreach(false), 1800);
    } catch {
      // Clipboard restricted
    }
  };

  const handleResetFilters = () => {
    setBloodGroup('ALL');
    setCity('ALL');
    setAvailability('ALL');
    setEligibility('ALL');
    setVerification('ALL');
    setSearchTerm('');
    setSortBy('lastDonationDate');
    setSortOrder('DESC');
    setPage(1);
    setToastMessage('Filters reset to default view.');
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Professional Clinical Filter Presets
  const applyPreset = (type: 'universal_o_neg' | 'universal_plasma_ab' | 'emergency_on_call' | 'eligible_now' | 'rare_rh_neg') => {
    if (type === 'universal_o_neg') {
      setBloodGroup('O-');
      setCity('ALL');
      setSearchTerm('');
      setAvailability('Available');
      setEligibility('Eligible');
      setPage(1);
      setToastMessage('Filter Applied: Universal Red Cell Donors (O-, Active & Eligible)');
    } else if (type === 'universal_plasma_ab') {
      setBloodGroup('AB+');
      setCity('ALL');
      setSearchTerm('');
      setAvailability('ALL');
      setEligibility('ALL');
      setPage(1);
      setToastMessage('Filter Applied: Universal Plasma Donors (AB+)');
    } else if (type === 'emergency_on_call') {
      setBloodGroup('ALL');
      setCity('ALL');
      setSearchTerm('');
      setAvailability('Available');
      setEligibility('Eligible');
      setPage(1);
      setToastMessage('Filter Applied: Verified Donors Ready On-Call 24/7');
    } else if (type === 'eligible_now') {
      setBloodGroup('ALL');
      setCity('ALL');
      setSearchTerm('');
      setAvailability('ALL');
      setEligibility('Eligible');
      setPage(1);
      setToastMessage('Filter Applied: Clinically Screened (Zero Deferral)');
    } else if (type === 'rare_rh_neg') {
      setBloodGroup('AB-');
      setCity('ALL');
      setAvailability('ALL');
      setEligibility('ALL');
      setSearchTerm('');
      setPage(1);
      setToastMessage('Filter Applied: Ultra-Rare Rh-Negative Subtypes (AB-)');
    }
    setTimeout(() => setToastMessage(null), 3000);
  };

  // CSV Export
  const handleExportCsv = () => {
    const csvData = db.exportDonorsCsv({
      bloodGroup,
      city,
      availability,
      eligibility,
      verification,
      searchTerm
    });
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `bloodconnect_donors_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToastMessage('Exported filtered donor records to CSV.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16 pt-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

        {/* Top Notification Toast */}
        {toastMessage && (
          <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Page Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-rose-700">
                Verified Voluntary Registry · 95,000+ Registered Donors
              </p>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
                National Voluntary Donor Directory
              </h1>
              <p className="text-sm text-slate-600 max-w-2xl">
                Search verified active donors across cities and blood groups with recent donation logs, eligibility screening status, and emergency dispatch readiness.
              </p>
            </div>

            {/* Access State Badge */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {currentUser ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    {currentUser.role[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Authorized Access ({currentUser.role.toUpperCase()})</span>
                    </div>
                    <div className="text-[11px] text-emerald-700">
                      Logged in as {currentUser.fullName}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xs">
                    !
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Public Sanitized View</span>
                    </div>
                    <div className="text-[11px] text-amber-800">
                      Donor contacts & notes protected under RBAC
                    </div>
                  </div>
                  {onOpenAuthGuard && (
                    <button
                      onClick={onOpenAuthGuard}
                      className="ml-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      Authorize
                    </button>
                  )}
                </div>
              )}

              {onOpenEligibilityCheck && (
                <button
                  onClick={onOpenEligibilityCheck}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors"
                  title="Check clinical donation eligibility criteria in 60 seconds"
                >
                  <Stethoscope className="w-4 h-4 text-emerald-600" />
                  <span>Eligibility Check</span>
                </button>
              )}

              <button
                onClick={handleExportCsv}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Clinical Search Scenarios Fast-Bar */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>Clinical Search Presets:</span>
            </span>

            <button
              onClick={() => applyPreset('universal_o_neg')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
            >
              Universal Donors (O-)
            </button>

            <button
              onClick={() => applyPreset('universal_plasma_ab')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 transition-colors"
            >
              Universal Plasma (AB+)
            </button>

            <button
              onClick={() => applyPreset('emergency_on_call')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition-colors font-semibold"
            >
              Available On-Call 24/7
            </button>

            <button
              onClick={() => applyPreset('eligible_now')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
            >
              Eligible Today
            </button>

            <button
              onClick={() => applyPreset('rare_rh_neg')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
            >
              Rare Subtypes (AB-)
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Search Donor ID (DON-000147), Name (Rahul), Phone, City..."
                className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSqlInspector(!showSqlInspector)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  showSqlInspector 
                    ? 'bg-purple-50 text-purple-700 border-purple-200' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>{showSqlInspector ? 'Hide SQL Inspector' : 'Show SQL Inspector'}</span>
              </button>

              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Filter Dropdowns Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
            {/* Blood Group */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Blood Group</label>
              <select
                value={bloodGroup}
                onChange={e => { setBloodGroup(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
              >
                <option value="ALL">All Blood Groups</option>
                {BLOOD_GROUPS.map(bg => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>

            {/* City */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Location / City</label>
              <select
                value={city}
                onChange={e => { setCity(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
              >
                {CITIES.map(c => (
                  <option key={c} value={c}>{c === 'ALL' ? 'All Cities' : c}</option>
                ))}
              </select>
            </div>

            {/* Availability */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Availability</label>
              <select
                value={availability}
                onChange={e => { setAvailability(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
              >
                <option value="ALL">All Availability</option>
                <option value="Available">Available</option>
                <option value="Not Available">Not Available / Busy</option>
              </select>
            </div>

            {/* Eligibility */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Medical Eligibility</label>
              <select
                value={eligibility}
                onChange={e => { setEligibility(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
              >
                <option value="ALL">All Statuses</option>
                <option value="Eligible">Eligible</option>
                <option value="Temporarily Deferred">Temporarily Deferred</option>
                <option value="Permanently Deferred">Permanently Deferred</option>
              </select>
            </div>

            {/* Verification */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">ID Verification</label>
              <select
                value={verification}
                onChange={e => { setVerification(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
              >
                <option value="ALL">All Verification</option>
                <option value="Verified">Verified</option>
                <option value="Pending Verification">Pending</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Sort By</label>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={e => {
                  const [field, ord] = e.target.value.split('-') as [any, 'ASC' | 'DESC'];
                  setSortBy(field);
                  setSortOrder(ord);
                  setPage(1);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
              >
                <option value="lastDonationDate-DESC">Recent Donation (Newest)</option>
                <option value="lastDonationDate-ASC">Recent Donation (Oldest)</option>
                <option value="totalDonations-DESC">Total Donations (Highest)</option>
                <option value="fullName-ASC">Name (A-Z)</option>
                <option value="city-ASC">City (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Real-time SQL Query Inspector Box */}
        {showSqlInspector && (
          <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-md border border-slate-800 space-y-3 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  DBMS Query Execution Plan & Optimizer Output
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-400 font-mono font-bold">
                  ⚡ {searchResult.executionTimeMs} ms execution
                </span>
                <span className="text-slate-400">
                  {searchResult.totalMatches} matches found
                </span>
              </div>
            </div>

            {/* SQL Code Box */}
            <div className="relative bg-slate-950 rounded-2xl p-4 font-mono text-xs text-purple-300 border border-slate-800/80 overflow-x-auto">
              <pre className="whitespace-pre leading-relaxed">{searchResult.generatedSql}</pre>
            </div>

            {/* Indexes and Query Plan Details */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-bold">Indexes Evaluated:</span>
                {searchResult.indexesUsed.length > 0 ? (
                  searchResult.indexesUsed.map(idx => (
                    <span key={idx} className="px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 font-mono border border-purple-800/50">
                      {idx}
                    </span>
                  ))
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono">
                    idx_donors_primary
                  </span>
                )}
              </div>

              <div className="text-slate-400">
                Storage Engine: <span className="text-slate-200 font-mono font-bold">InnoDB (B-Tree Indexing, ACID Safe)</span>
              </div>
            </div>
          </div>
        )}

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 px-1">
          <div className="font-bold text-slate-900 text-sm">
            Showing {searchResult.totalMatches > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(page * pageSize, searchResult.totalMatches)} of{' '}
            <span className="text-purple-700">{searchResult.totalMatches}</span> matched donors
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-600">Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white font-semibold"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Donors Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Donor Code</th>
                  <th className="px-5 py-3.5">Donor Name</th>
                  <th className="px-5 py-3.5 text-center">Blood Group</th>
                  <th className="px-5 py-3.5">City & State</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-center">Eligibility</th>
                  <th className="px-5 py-3.5 text-center">Total Donations</th>
                  <th className="px-5 py-3.5">Last Donation</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {searchResult.donors.length > 0 ? (
                  searchResult.donors.map(donor => {
                    const isAvailable = (donor.availability || 'Available') === 'Available';
                    const isEligible = donor.eligibilityStatus === 'Eligible';
                    const isRare = donor.bloodGroup === 'AB-' || donor.bloodGroup === 'O-' || donor.bloodGroup === 'B-';

                    return (
                      <tr key={donor.id} className="hover:bg-slate-50/80 transition-colors group">
                        {/* Donor Code */}
                        <td className="px-5 py-3.5 font-mono font-bold text-purple-700">
                          <span className="flex items-center gap-1">
                            {donor.donorCode}
                            {donor.verificationStatus === 'Verified' && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />
                            )}
                          </span>
                        </td>

                        {/* Full Name & Demographics */}
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                            {donor.fullName}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {donor.gender} • DOB: {donor.dateOfBirth}
                          </div>
                        </td>

                        {/* Blood Group */}
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-xl text-xs font-black ${
                            donor.bloodGroup.includes('-')
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-slate-100 text-slate-900 border border-slate-200'
                          }`}>
                            {donor.bloodGroup}
                          </span>
                          {isRare && (
                            <span className="block text-[9px] font-bold text-rose-600 uppercase tracking-tight mt-0.5">
                              Rare Rh-
                            </span>
                          )}
                        </td>

                        {/* Location */}
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-800 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{donor.city}</span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {donor.state} ({donor.pincode})
                          </div>
                        </td>

                        {/* Availability */}
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isAvailable
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {donor.availability || 'Available'}
                          </span>
                        </td>

                        {/* Eligibility */}
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isEligible
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {donor.eligibilityStatus}
                          </span>
                        </td>

                        {/* Total Donations */}
                        <td className="px-5 py-3.5 text-center font-bold text-slate-800">
                          {donor.totalDonations} cycles
                        </td>

                        {/* Last Donation Date */}
                        <td className="px-5 py-3.5 text-slate-600">
                          {donor.lastDonationDate ? (
                            <div>
                              <span className="font-semibold text-slate-800">{donor.lastDonationDate}</span>
                              <span className="block text-[10px] text-slate-600">Eligible: {donor.nextEligibleDate}</span>
                            </div>
                          ) : (
                            <span className="text-slate-600 italic">First-time voluntary</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => handleOpenDonorDetails(donor)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors"
                          >
                            <span>Profile</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center">
                      <div className="max-w-sm mx-auto space-y-2">
                        <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                        <h4 className="font-bold text-slate-900 text-sm">No donors match this query</h4>
                        <p className="text-xs text-slate-600">
                          Try broadening your blood group or location filters, or click Reset.
                        </p>
                        <button
                          onClick={handleResetFilters}
                          className="mt-2 px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {searchResult.totalPages > 1 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="text-slate-600">
                Page <span className="font-bold text-slate-900">{searchResult.currentPage}</span> of{' '}
                <span className="font-bold text-slate-900">{searchResult.totalPages}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
                >
                  First
                </button>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page numbers */}
                {Array.from({ length: Math.min(5, searchResult.totalPages) }).map((_, i) => {
                  const pNum = Math.max(1, Math.min(searchResult.totalPages - 4, page - 2)) + i;
                  if (pNum > searchResult.totalPages) return null;
                  return (
                    <button
                      key={pNum}
                      onClick={() => setPage(pNum)}
                      className={`w-8 h-8 rounded-lg font-bold transition-colors ${
                        page === pNum
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {pNum}
                    </button>
                  );
                })}

                <button
                  disabled={page >= searchResult.totalPages}
                  onClick={() => setPage(p => Math.min(searchResult.totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= searchResult.totalPages}
                  onClick={() => setPage(searchResult.totalPages)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Relational Donor Details Modal */}
      {selectedDonor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-lg border border-purple-200">
                  {selectedDonor.bloodGroup}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">{selectedDonor.fullName}</h3>
                    <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                      {selectedDonor.donorCode}
                    </span>
                    {selectedDonor.verificationStatus === 'Verified' && (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        Verified Donor
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">
                    Registered on {new Date(selectedDonor.registeredAt).toLocaleDateString()} • {selectedDonor.city}, {selectedDonor.state}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDonor(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
              
              {/* Personal & Medical Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-600 uppercase block">Blood Group & Rh</span>
                  <span className="text-sm font-black text-rose-600">{selectedDonor.bloodGroup}</span>
                  <span className="text-[10px] text-slate-600 block">Rh {selectedDonor.rhFactor}</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-600 uppercase block">Eligibility</span>
                  <span className={`text-sm font-bold block ${
                    selectedDonor.eligibilityStatus === 'Eligible' ? 'text-emerald-700' : 'text-amber-700'
                  }`}>
                    {selectedDonor.eligibilityStatus}
                  </span>
                  <span className="text-[10px] text-slate-600 block">Weight: {selectedDonor.weightKg} kg</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-600 uppercase block">Total Cycles</span>
                  <span className="text-sm font-black text-slate-900">{selectedDonor.totalDonations} cycles</span>
                  <span className="text-[10px] text-slate-600 block">Last: {selectedDonor.lastDonationDate || 'N/A'}</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-600 uppercase block">Next Eligible Date</span>
                  <span className="text-sm font-bold text-purple-700 block">{selectedDonor.nextEligibleDate}</span>
                  <span className="text-[10px] text-slate-600 block">90-day recovery window</span>
                </div>
              </div>

              {/* Contact Information (RBAC Protected) */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Contact Information (RBAC Protected)</span>
                  </span>
                  {!isAuthorized && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      Masked for Privacy
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">{selectedDonor.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">{selectedDonor.email}</span>
                  </div>
                  <div className="flex items-center gap-2 col-span-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-700">{selectedDonor.address}, {selectedDonor.city}, {selectedDonor.state} - {selectedDonor.pincode}</span>
                  </div>
                </div>

                {selectedDonor.medicalNotes && (
                  <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                    <span className="font-bold text-slate-800">Medical Notes: </span>
                    {selectedDonor.medicalNotes}
                  </div>
                )}
              </div>

              {/* AI Polite Voluntary Donor Outreach Composer */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Languages className="w-4 h-4 text-rose-700" />
                    <span className="text-xs font-bold text-slate-950">
                      AI Voluntary Donor Outreach Composer
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                    {(
                      [
                        { id: 'English', label: 'EN' },
                        { id: 'Hindi', label: 'हिन्दी' },
                        { id: 'Marathi', label: 'मराठी' },
                        { id: 'Hinglish', label: 'Hinglish' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={draftingOutreach}
                        onClick={() => handleDraftDonorOutreach(item.id)}
                        className={`px-2.5 py-1 rounded-xs text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                          outreachLanguage === item.id && outreachDraft
                            ? 'bg-slate-950 text-white'
                            : 'text-slate-700 hover:bg-white hover:text-slate-950'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {!outreachDraft && !draftingOutreach && !outreachError && (
                  <p className="text-[11px] text-slate-600">
                    Select a language above to draft a polite, non-pressuring NBTC-compliant voluntary donation request tailored for {selectedDonor.fullName.split(' ')[0]} ({selectedDonor.bloodGroup} · {selectedDonor.city}).
                  </p>
                )}

                {draftingOutreach && (
                  <div className="flex items-center gap-2 text-xs text-slate-600 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-700" />
                    <span>Drafting respectful outreach message in {outreachLanguage}...</span>
                  </div>
                )}

                {outreachError && (
                  <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                    {outreachError}
                  </div>
                )}

                {outreachDraft && !draftingOutreach && (
                  <div className="space-y-2.5">
                    <pre className="p-3 rounded-lg bg-[#F8FAFC] border border-slate-200 text-xs font-sans text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {outreachDraft}
                    </pre>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyOutreach}
                        className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedOutreach ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Message</span>
                          </>
                        )}
                      </button>
                      <a
                        href={buildWhatsAppShareUrl(outreachDraft)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold inline-flex items-center gap-1.5"
                      >
                        <MessageSquareShare className="w-3.5 h-3.5" />
                        <span>Share on WhatsApp</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Relational Table 1: Medical Screenings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Stethoscope className="w-4 h-4 text-purple-600" />
                    <span>Medical Screening History (<code className="font-mono text-purple-700">medical_screenings</code>)</span>
                  </h4>
                  <span className="text-[10px] text-slate-600">
                    Linked by foreign key <code className="font-mono text-slate-700">donor_id = {selectedDonor.id}</code>
                  </span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-slate-900 font-bold text-[10px] uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Hemoglobin</th>
                        <th className="px-3 py-2">Blood Pressure</th>
                        <th className="px-3 py-2">Pulse</th>
                        <th className="px-3 py-2">Verdict</th>
                        <th className="px-3 py-2">Staff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDonorScreenings.length > 0 ? (
                        selectedDonorScreenings.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-bold text-purple-700">{s.screeningCode || `SCR-${s.id}`}</td>
                            <td className="px-3 py-2">{s.screeningDate}</td>
                            <td className="px-3 py-2 font-bold text-slate-900">
                              {s.hemoglobinGdl} g/dL {s.hemoglobinGdl >= 12.5 ? '✓' : '⚠️'}
                            </td>
                            <td className="px-3 py-2">{s.bloodPressure} mmHg</td>
                            <td className="px-3 py-2">{s.pulseBpm} bpm</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                s.isEligible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {s.isEligible ? 'Fit' : s.deferralReason || 'Deferred'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-600">{s.staffName || 'Clinical Staff'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-3 py-4 text-center text-slate-600">
                            No prior screening logs recorded for this donor.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Relational Table 2: Donation History */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Heart className="w-4 h-4 text-rose-600" />
                    <span>Historical Donations (<code className="font-mono text-rose-700">donations</code>)</span>
                  </h4>
                  <span className="text-[10px] text-slate-600">
                    Linked by foreign key <code className="font-mono text-slate-700">donor_id = {selectedDonor.id}</code>
                  </span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-slate-900 font-bold text-[10px] uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Donation Code</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Center / Drive</th>
                        <th className="px-3 py-2">Units</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDonorDonations.length > 0 ? (
                        selectedDonorDonations.map(d => (
                          <tr key={d.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-bold text-rose-700">{d.donationCode}</td>
                            <td className="px-3 py-2">{new Date(d.donationDate).toLocaleDateString()}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800">{d.donationType}</td>
                            <td className="px-3 py-2 text-slate-600">{d.donationCenter || d.campName || 'Central Blood Bank'}</td>
                            <td className="px-3 py-2 font-bold">{d.unitsCollected}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {d.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-3 py-4 text-center text-slate-600">
                            No physical donation events recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-600 font-mono">
                Primary Key: {selectedDonor.donorCode} (Internal ID: {selectedDonor.id})
              </span>
              <button
                onClick={() => setSelectedDonor(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-colors"
              >
                Close Profile
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
