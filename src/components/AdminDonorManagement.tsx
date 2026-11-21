import { useState, useMemo, FormEvent } from 'react';
import { 
  Search, 
  Plus, 
  Download, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink, 
  Edit3, 
  ToggleLeft, 
  ToggleRight, 
  ShieldCheck, 
  Stethoscope, 
  Heart, 
  X, 
  Save, 
  Sparkles,
  Phone,
  Mail,
  Calendar,
  Database
} from 'lucide-react';
import { Donor, BloodGroup, User, MedicalScreening, Donation, DonorSearchFilters } from '../types';
import { db } from '../db/databaseStore';

interface AdminDonorManagementProps {
  currentUser: User;
  onRefreshParent?: () => void;
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

export default function AdminDonorManagement({ currentUser, onRefreshParent }: AdminDonorManagementProps) {
  // Query Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [bloodGroup, setBloodGroup] = useState('ALL');
  const [city, setCity] = useState('ALL');
  const [availability, setAvailability] = useState('ALL');
  const [eligibility, setEligibility] = useState('ALL');
  const [verification, setVerification] = useState('ALL');
  const [sortBy, setSortBy] = useState<'lastDonationDate' | 'totalDonations' | 'fullName' | 'city'>('lastDonationDate');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals state
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [selectedScreenings, setSelectedScreenings] = useState<MedicalScreening[]>([]);
  const [selectedDonations, setSelectedDonations] = useState<Donation[]>([]);

  const [editingDonor, setEditingDonor] = useState<Donor | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Donor Form state
  const [newDonorForm, setNewDonorForm] = useState({
    fullName: '',
    gender: 'Male' as 'Male' | 'Female',
    dateOfBirth: '1995-05-15',
    bloodGroup: 'O+' as BloodGroup,
    weightKg: 68,
    phone: '+91 98220 12345',
    email: 'new.donor@example.com',
    address: 'Flat 402, Lotus Residency',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    eligibilityStatus: 'Eligible' as Donor['eligibilityStatus'],
    donorStatus: 'Active' as 'Active' | 'Inactive',
    availability: 'Available' as 'Available' | 'Not Available',
    medicalNotes: 'Voluntary blood donor registered via administrative console.'
  });

  // Feedback toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Compute Overall Donor Statistics
  const stats = useMemo(() => {
    return db.getDonorStatistics();
  }, [refreshTrigger]);

  // Execute relational search
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
    return db.searchDonors(filters, currentUser);
  }, [bloodGroup, city, availability, eligibility, verification, searchTerm, sortBy, sortOrder, page, pageSize, currentUser, refreshTrigger]);

  const handleOpenDetails = (donor: Donor) => {
    setSelectedDonor(donor);
    setSelectedScreenings(db.getDonorScreenings(donor.id));
    setSelectedDonations(db.getDonorDonations(donor.id));
  };

  const handleToggleStatus = (donor: Donor) => {
    db.toggleDonorStatus(donor.id, currentUser);
    setRefreshTrigger(p => p + 1);
    if (onRefreshParent) onRefreshParent();
    showToast(`Updated status for ${donor.fullName} to ${donor.donorStatus === 'Active' ? 'Inactive' : 'Active'}`);
  };

  const handleToggleVerification = (donor: Donor) => {
    db.toggleDonorVerification(donor.id, currentUser);
    setRefreshTrigger(p => p + 1);
    if (onRefreshParent) onRefreshParent();
    showToast(`Updated verification for ${donor.fullName}`);
  };

  const handleSaveEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editingDonor) return;

    db.updateDonor(editingDonor.id, {
      phone: editingDonor.phone,
      email: editingDonor.email,
      city: editingDonor.city,
      address: editingDonor.address,
      pincode: editingDonor.pincode,
      eligibilityStatus: editingDonor.eligibilityStatus,
      availability: editingDonor.availability,
      donorStatus: editingDonor.donorStatus,
      medicalNotes: editingDonor.medicalNotes
    }, currentUser);

    setEditingDonor(null);
    setRefreshTrigger(p => p + 1);
    if (onRefreshParent) onRefreshParent();
    showToast(`Successfully updated record for ${editingDonor.fullName}`);
  };

  const handleCreateDonor = (e: FormEvent) => {
    e.preventDefault();
    if (!newDonorForm.fullName.trim()) return;

    const created = db.createDonor(newDonorForm, currentUser);
    setIsAddModalOpen(false);
    setRefreshTrigger(p => p + 1);
    if (onRefreshParent) onRefreshParent();
    showToast(`Registered donor ${created.fullName} (${created.donorCode}) into database.`);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setBloodGroup('ALL');
    setCity('ALL');
    setAvailability('ALL');
    setEligibility('ALL');
    setVerification('ALL');
    setSortBy('lastDonationDate');
    setSortOrder('DESC');
    setPage(1);
    showToast('Filters reset.');
  };

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
    link.setAttribute('download', `donors_registry_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported filtered donor records to CSV.');
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Statistical Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Total Donors</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.total.toLocaleString()}</div>
          <div className="text-[11px] text-purple-700 font-semibold mt-1">100% Relational InnoDB Records</div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Active &amp; Ready</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{stats.active.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">{stats.available} currently available</div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Medically Eligible</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.eligible.toLocaleString()}</div>
          <div className="text-[11px] text-amber-600 font-semibold mt-1">{stats.deferred} temporary deferrals</div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Rare Rh- Donors</div>
          <div className="text-2xl font-black text-rose-600 mt-1">{stats.rhNegative}</div>
          <div className="text-[11px] text-slate-600 mt-1">{stats.rhPositive} Rh+ Positive donors</div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs col-span-2 lg:col-span-1">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Top Urban Hubs</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {stats.topCities.slice(0, 3).map(c => (
              <span key={c.city} className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-800">
                {c.city}: {c.count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Search & Action Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Central Donors Relational Registry</h3>
            <p className="text-xs text-slate-600">
              Administer 95,000+ donors with foreign keys to <code className="font-mono text-purple-600">medical_screenings</code> and <code className="font-mono text-rose-600">donations</code>.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Register New Donor</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-2">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Search Code (DON-000147), Name, Phone, City..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
            />
          </div>

          <div>
            <select
              value={bloodGroup}
              onChange={e => { setBloodGroup(e.target.value); setPage(1); }}
              className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold"
            >
              <option value="ALL">All Blood Groups</option>
              {BLOOD_GROUPS.map(bg => (
                <option key={bg} value={bg}>{bg}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={city}
              onChange={e => { setCity(e.target.value); setPage(1); }}
              className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold"
            >
              {CITIES.map(c => (
                <option key={c} value={c}>{c === 'ALL' ? 'All Cities' : c}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={availability}
              onChange={e => { setAvailability(e.target.value); setPage(1); }}
              className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold"
            >
              <option value="ALL">All Availability</option>
              <option value="Available">Available</option>
              <option value="Not Available">Not Available</option>
            </select>
          </div>

          <div>
            <select
              value={eligibility}
              onChange={e => { setEligibility(e.target.value); setPage(1); }}
              className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold"
            >
              <option value="ALL">All Eligibility</option>
              <option value="Eligible">Eligible</option>
              <option value="Temporarily Deferred">Temporarily Deferred</option>
              <option value="Permanently Deferred">Permanently Deferred</option>
            </select>
          </div>
        </div>

        {/* Query execution bar */}
        <div className="flex items-center justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-purple-600" />
            <span>
              Query executed in <strong className="text-slate-900">{searchResult.executionTimeMs} ms</strong> • Matched{' '}
              <strong className="text-purple-700">{searchResult.totalMatches}</strong> records
            </span>
          </div>
          <div>
            <span>Rows per page: </span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[11px] font-bold"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Donors Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-900 uppercase font-bold text-[11px] border-b border-slate-200 tracking-wider">
              <tr>
                <th className="px-4 py-3">Donor Code</th>
                <th className="px-4 py-3">Full Name &amp; Age</th>
                <th className="px-4 py-3 text-center">Group</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Phone &amp; Email</th>
                <th className="px-4 py-3 text-center">Cycles</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Eligibility</th>
                <th className="px-4 py-3 text-center">Verification</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {searchResult.donors.length > 0 ? (
                searchResult.donors.map(donor => (
                  <tr key={donor.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Donor Code */}
                    <td className="px-4 py-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                      {donor.donorCode}
                    </td>

                    {/* Name & Demographics */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{donor.fullName}</div>
                      <div className="text-[11px] text-slate-600">{donor.gender} • {donor.weightKg} kg</div>
                    </td>

                    {/* Blood Group */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-xs font-black ${
                        donor.bloodGroup.includes('-')
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}>
                        {donor.bloodGroup}
                      </span>
                    </td>

                    {/* City */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{donor.city}</div>
                      <div className="text-[10px] text-slate-600">{donor.state}</div>
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{donor.phone}</div>
                      <div className="text-[10px] text-slate-600 truncate max-w-[140px]">{donor.email}</div>
                    </td>

                    {/* Cycles */}
                    <td className="px-4 py-3 text-center font-bold text-slate-900">
                      {donor.totalDonations}
                    </td>

                    {/* Status (Toggleable) */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleStatus(donor)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                          donor.donorStatus === 'Active'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title="Click to toggle Active/Inactive"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${donor.donorStatus === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {donor.donorStatus || 'Active'}
                      </button>
                    </td>

                    {/* Eligibility */}
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        donor.eligibilityStatus === 'Eligible'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {donor.eligibilityStatus}
                      </span>
                    </td>

                    {/* Verification (Toggleable) */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleVerification(donor)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                          donor.verificationStatus === 'Verified'
                            ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        }`}
                        title="Click to toggle Verified/Pending"
                      >
                        {donor.verificationStatus === 'Verified' ? (
                          <CheckCircle2 className="w-3 h-3 text-purple-700" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-amber-700" />
                        )}
                        <span>{donor.verificationStatus || 'Verified'}</span>
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDetails(donor)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                          title="View Relational Profile"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingDonor({ ...donor })}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit Donor Record"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-600">
                    No donors found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {searchResult.totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-slate-600">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, searchResult.totalMatches)} of{' '}
              <strong className="text-slate-900">{searchResult.totalMatches}</strong> donors
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(1)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
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

              <span className="px-3 py-1 font-bold text-slate-800">
                Page {page} of {searchResult.totalPages}
              </span>

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
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD NEW DONOR (INSERT SQL) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-black text-slate-900">Register New Donor (INSERT 3NF)</h3>
                <p className="text-xs text-slate-600">Creates record in <code className="font-mono text-purple-600">donors</code> with auto-generated DON code.</p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDonor} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={newDonorForm.fullName}
                    onChange={e => setNewDonorForm({ ...newDonorForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 font-medium"
                    placeholder="e.g. Ramesh Chandra Sharma"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Blood Group *</label>
                  <select
                    value={newDonorForm.bloodGroup}
                    onChange={e => setNewDonorForm({ ...newDonorForm, bloodGroup: e.target.value as BloodGroup })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                  >
                    {BLOOD_GROUPS.map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Gender</label>
                  <select
                    value={newDonorForm.gender}
                    onChange={e => setNewDonorForm({ ...newDonorForm, gender: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={newDonorForm.dateOfBirth}
                    onChange={e => setNewDonorForm({ ...newDonorForm, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={newDonorForm.phone}
                    onChange={e => setNewDonorForm({ ...newDonorForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={newDonorForm.email}
                    onChange={e => setNewDonorForm({ ...newDonorForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">City</label>
                  <input
                    type="text"
                    value={newDonorForm.city}
                    onChange={e => setNewDonorForm({ ...newDonorForm, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">State &amp; Pincode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newDonorForm.state}
                      onChange={e => setNewDonorForm({ ...newDonorForm, state: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                    <input
                      type="text"
                      value={newDonorForm.pincode}
                      onChange={e => setNewDonorForm({ ...newDonorForm, pincode: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Weight (kg) - Min 50kg</label>
                  <input
                    type="number"
                    min={45}
                    max={150}
                    value={newDonorForm.weightKg}
                    onChange={e => setNewDonorForm({ ...newDonorForm, weightKg: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Initial Eligibility Status</label>
                  <select
                    value={newDonorForm.eligibilityStatus}
                    onChange={e => setNewDonorForm({ ...newDonorForm, eligibilityStatus: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                  >
                    <option value="Eligible">Eligible</option>
                    <option value="Temporarily Deferred">Temporarily Deferred</option>
                    <option value="Permanently Deferred">Permanently Deferred</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Residential Street Address</label>
                <input
                  type="text"
                  value={newDonorForm.address}
                  onChange={e => setNewDonorForm({ ...newDonorForm, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Clinical Notes</label>
                <textarea
                  rows={2}
                  value={newDonorForm.medicalNotes}
                  onChange={e => setNewDonorForm({ ...newDonorForm, medicalNotes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold"
                >
                  Save Donor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT DONOR */}
      {editingDonor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-black text-slate-900">Edit Donor ({editingDonor.donorCode})</h3>
                <p className="text-xs text-slate-600">{editingDonor.fullName} • {editingDonor.bloodGroup}</p>
              </div>
              <button onClick={() => setEditingDonor(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Phone</label>
                  <input
                    type="text"
                    value={editingDonor.phone}
                    onChange={e => setEditingDonor({ ...editingDonor, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    value={editingDonor.email}
                    onChange={e => setEditingDonor({ ...editingDonor, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">City</label>
                  <input
                    type="text"
                    value={editingDonor.city}
                    onChange={e => setEditingDonor({ ...editingDonor, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Availability</label>
                  <select
                    value={editingDonor.availability || 'Available'}
                    onChange={e => setEditingDonor({ ...editingDonor, availability: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  >
                    <option value="Available">Available</option>
                    <option value="Not Available">Not Available</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Donor Status</label>
                  <select
                    value={editingDonor.donorStatus || 'Active'}
                    onChange={e => setEditingDonor({ ...editingDonor, donorStatus: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Eligibility Status</label>
                  <select
                    value={editingDonor.eligibilityStatus}
                    onChange={e => setEditingDonor({ ...editingDonor, eligibilityStatus: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  >
                    <option value="Eligible">Eligible</option>
                    <option value="Temporarily Deferred">Temporarily Deferred</option>
                    <option value="Permanently Deferred">Permanently Deferred</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Medical / Admin Notes</label>
                <textarea
                  rows={2}
                  value={editingDonor.medicalNotes || ''}
                  onChange={e => setEditingDonor({ ...editingDonor, medicalNotes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDonor(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW DONOR RELATIONAL PROFILE */}
      {selectedDonor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
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
                  </div>
                  <p className="text-xs text-slate-600">
                    {selectedDonor.gender} • {selectedDonor.city}, {selectedDonor.state} • Phone: {selectedDonor.phone}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedDonor(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
              {/* Relational Table 1: Medical Screenings */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Stethoscope className="w-4 h-4 text-purple-600" />
                  <span>Linked Screenings (<code className="font-mono text-purple-700">medical_screenings</code> table)</span>
                </h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Hemoglobin</th>
                        <th className="px-3 py-2">BP</th>
                        <th className="px-3 py-2">Pulse</th>
                        <th className="px-3 py-2">Verdict</th>
                        <th className="px-3 py-2">Staff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedScreenings.length > 0 ? (
                        selectedScreenings.map(s => (
                          <tr key={s.id}>
                            <td className="px-3 py-2 font-mono font-bold text-purple-700">{s.screeningCode || `SCR-${s.id}`}</td>
                            <td className="px-3 py-2">{s.screeningDate}</td>
                            <td className="px-3 py-2 font-bold">{s.hemoglobinGdl} g/dL</td>
                            <td className="px-3 py-2">{s.bloodPressure}</td>
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
                          <td colSpan={7} className="px-3 py-4 text-center text-slate-600">No screenings logged.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Relational Table 2: Donation History */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-rose-600" />
                  <span>Donation Logs (<code className="font-mono text-rose-700">donations</code> table)</span>
                </h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Center / Drive</th>
                        <th className="px-3 py-2">Units</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDonations.length > 0 ? (
                        selectedDonations.map(d => (
                          <tr key={d.id}>
                            <td className="px-3 py-2 font-mono font-bold text-rose-700">{d.donationCode}</td>
                            <td className="px-3 py-2">{new Date(d.donationDate).toLocaleDateString()}</td>
                            <td className="px-3 py-2 font-semibold">{d.donationType}</td>
                            <td className="px-3 py-2 text-slate-600">{d.donationCenter || d.campName || 'Central Bank'}</td>
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
                          <td colSpan={6} className="px-3 py-4 text-center text-slate-600">No donations logged yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedDonor(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
