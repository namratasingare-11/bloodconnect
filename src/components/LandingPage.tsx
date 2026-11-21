import { useState, useMemo } from 'react';
import {
  Search,
  AlertCircle,
  Calendar,
  MapPin,
  ArrowRight,
  Activity,
  RefreshCw,
  ChevronRight,
  Truck,
  Stethoscope,
  Check,
  Building2,
  Users,
  Heart,
  ShieldCheck,
  CheckCircle2,
  PhoneCall,
  ChevronDown,
  Maximize2,
  Map as MapIcon,
  Sparkles,
  FileScan,
  HeartPulse,
  Volume2
} from 'lucide-react';
import {
  BloodGroup,
  BloodGroupInventorySummary,
  BloodMapIntent,
  BloodSearchIntent,
  BookingPrefill,
  DonationCamp,
  EmergencyPrefill
} from '../types';
import { BLOOD_GROUPS } from '../config/constants';
import { db } from '../db/databaseStore';
import { useDatabaseSubscription } from '../hooks/useDatabaseSubscription';
import {
  buildCampPinSnapshots,
  buildRegionalVaultSnapshots
} from '../utils/regionalVaults';
import RegionalBloodMapCanvas from './RegionalBloodMapCanvas';
import EmergencySosCard from './EmergencySosCard';
import coldChainVaultImg from '../assets/images/clinical_coldchain_vault_1795168586942.jpg';

interface LandingPageProps {
  onNavigate: (view: string) => void;
  onSearchBlood: (intent: BloodSearchIntent) => void;
  onOpenBloodMap: (intent?: BloodMapIntent) => void;
  onOpenAiDesk: (tab?: 'triage' | 'scanner' | 'coach') => void;
  onOpenAuth: (role?: 'donor' | 'hospital' | 'staff' | 'admin', isSignUp?: boolean) => void;
  onOpenEmergency: (prefill?: EmergencyPrefill) => void;
  onOpenBooking: (prefill?: BookingPrefill) => void;
  onSelectCamp: (camp: DonationCamp) => void;
  onOpenEligibilityCheck?: () => void;
  onOpenTracker?: () => void;
  quotaExceeded?: boolean;
}

const LAB_IMAGE_PATH = coldChainVaultImg;

const CLINICAL_FAQS = [
  {
    q: 'What are the clinical eligibility criteria to donate whole blood?',
    a: 'Donors must be between 18 and 65 years old, weigh at least 45 kg (50 kg for 450 mL collection), have a pre-donation hemoglobin of at least 12.5 g/dL, normal blood pressure, and no recent fever, antibiotics, or major surgery.'
  },
  {
    q: 'How often can I safely donate whole blood or platelets?',
    a: 'Under National Blood Transfusion Council guidelines, healthy men can donate whole blood every 90 days and women every 120 days. Single-donor apheresis platelets can be donated more frequently after medical officer clearance.'
  },
  {
    q: 'What screening tests are run before blood is released to a hospital?',
    a: 'Every collected unit undergoes mandatory 5-point testing for HIV-1/2, Hepatitis B (HBV), Hepatitis C (HCV), Syphilis, and Malaria using NAT/PCR and chemiluminescence assays prior to cold-chain release.'
  },
  {
    q: 'How should I prepare before arriving for my scheduled donation slot?',
    a: 'Eat a balanced, low-fat meal 2 to 3 hours beforehand, drink 500 mL of water prior to arrival, avoid alcohol for 24 hours, and carry a valid government photo ID along with your digital appointment pass.'
  },
  {
    q: 'How fast can hospitals receive emergency units during a trauma or ICU case?',
    a: 'Emergency requisitions trigger immediate cross-match reservation at the nearest verified vault. Uncrossmatched O-Negative PRBCs can be released under medical director protocol with refrigerated carrier dispatch in 15–20 minutes.'
  }
];

export default function LandingPage({
  onNavigate,
  onSearchBlood,
  onOpenBloodMap,
  onOpenAiDesk,
  onOpenAuth,
  onOpenEmergency,
  onOpenBooking,
  onSelectCamp,
  onOpenEligibilityCheck,
  onOpenTracker,
  quotaExceeded = false
}: LandingPageProps) {
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
  const [refreshKey, setRefreshKey] = useState(0);
  const [labImgFailed, setLabImgFailed] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const storeRevision = useDatabaseSubscription();

  // Live Regional Blood Radar hero state
  const [radarBloodGroup, setRadarBloodGroup] = useState<BloodGroup | 'ALL'>('ALL');
  const [radarShowCamps, setRadarShowCamps] = useState<boolean>(true);
  const [selectedHeroVaultId, setSelectedHeroVaultId] = useState<number | null>(null);
  const [selectedHeroCampId, setSelectedHeroCampId] = useState<number | null>(null);

  // Interactive Compatibility Quick Checker state
  const [activeCompatGroup, setActiveCompatGroup] = useState<BloodGroup>('O+');

  // Interactive 7-Step Lifecycle state
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  const availabilityData = useMemo(() => db.getLiveBloodAvailability(), [refreshKey, storeRevision]);

  const criticalGroups = useMemo(
    () => availabilityData.filter(item => item.status === 'Critical' || item.status === 'Low').slice(0, 3),
    [availabilityData]
  );

  const hospitalsList = useMemo(() => db.getHospitals(), [refreshKey, storeRevision]);
  const bloodUnitsList = useMemo(() => db.getBloodUnits(), [refreshKey, storeRevision]);
  const allCamps = useMemo(() => db.getCamps(), [refreshKey, storeRevision]);

  const heroVaults = useMemo(
    () =>
      buildRegionalVaultSnapshots(hospitalsList, bloodUnitsList, radarBloodGroup, 'ALL').sort(
        (a, b) => b.directUnits - a.directUnits
      ),
    [hospitalsList, bloodUnitsList, radarBloodGroup]
  );

  const heroCamps = useMemo(() => buildCampPinSnapshots(allCamps), [allCamps]);

  const activeHeroVault = useMemo(
    () => heroVaults.find(v => v.hospital.id === selectedHeroVaultId) ?? heroVaults[0] ?? null,
    [heroVaults, selectedHeroVaultId]
  );

  const selectedHeroCamp = useMemo(
    () => heroCamps.find(c => c.camp.id === selectedHeroCampId) ?? null,
    [heroCamps, selectedHeroCampId]
  );

  const totalRadarMatchingUnits = useMemo(
    () => heroVaults.reduce((sum, v) => sum + v.directUnits, 0),
    [heroVaults]
  );

  const stockedRadarVaultCount = useMemo(
    () => heroVaults.filter(v => v.directUnits > 0).length,
    [heroVaults]
  );

  const upcomingCamps = useMemo(
    () => allCamps.filter(c => c.status === 'Upcoming').slice(0, 3),
    [allCamps]
  );

  const partnerHospitals = useMemo(
    () => hospitalsList.slice(0, 4),
    [hospitalsList]
  );

  const stats = useMemo(() => {
    const donors = db.getDonors();
    const units = bloodUnitsList.filter(u => u.status === 'Available');
    return {
      donorsCount: donors.length,
      availableUnits: units.length,
      hospitalsCount: hospitalsList.length
    };
  }, [bloodUnitsList, hospitalsList, refreshKey, storeRevision]);

  const filteredAvailability = useMemo(() => {
    if (selectedGroupFilter === 'ALL') return availabilityData;
    return availabilityData.filter(item => item.bloodGroup === selectedGroupFilter);
  }, [availabilityData, selectedGroupFilter]);

  const renderStatusText = (status: BloodGroupInventorySummary['status']) => {
    if (status === 'Available') {
      return <span className="text-xs font-medium text-emerald-700">Adequate</span>;
    }
    if (status === 'Low') {
      return <span className="text-xs font-medium text-amber-700">Low Reserve</span>;
    }
    return <span className="text-xs font-semibold text-rose-700">Urgent Need</span>;
  };

  const compatibilityGuide: Record<BloodGroup, { canDonateTo: string[]; canReceiveFrom: string[]; notes: string }> = {
    'O-': {
      canDonateTo: ['All Blood Types (Universal RBC Donor)'],
      canReceiveFrom: ['O-'],
      notes: 'Universal red cell donor. Critical for trauma resuscitation before cross-match.'
    },
    'O+': {
      canDonateTo: ['O+', 'A+', 'B+', 'AB+'],
      canReceiveFrom: ['O+', 'O-'],
      notes: 'Most requested blood type across emergency surgical and ICU wards.'
    },
    'A-': {
      canDonateTo: ['A-', 'A+', 'AB-', 'AB+'],
      canReceiveFrom: ['A-', 'O-'],
      notes: 'Essential for oncology and Rh-negative surgical transfusion protocols.'
    },
    'A+': {
      canDonateTo: ['A+', 'AB+'],
      canReceiveFrom: ['A+', 'A-', 'O+', 'O-'],
      notes: 'High daily hospital demand for cardiac and orthopedic surgeries.'
    },
    'B-': {
      canDonateTo: ['B-', 'B+', 'AB-', 'AB+'],
      canReceiveFrom: ['B-', 'O-'],
      notes: 'Rare blood type (<2% of population). Consistently prioritized in reserve vaults.'
    },
    'B+': {
      canDonateTo: ['B+', 'AB+'],
      canReceiveFrom: ['B+', 'B-', 'O+', 'O-'],
      notes: 'Vital for patients managing chronic thalassemia and hematology care.'
    },
    'AB-': {
      canDonateTo: ['AB-', 'AB+'],
      canReceiveFrom: ['AB-', 'A-', 'B-', 'O-'],
      notes: 'Rarest RBC type and universal Fresh Frozen Plasma (FFP) donor.'
    },
    'AB+': {
      canDonateTo: ['AB+'],
      canReceiveFrom: ['All Blood Types (Universal RBC Recipient)'],
      notes: 'Universal red cell recipient; plasma is compatible across all blood groups.'
    }
  };

  const steps = [
    {
      num: '01',
      title: 'Donor Registration',
      summary: 'Verified digital profile and confidential medical history review.',
      icon: Users,
      detail: 'Validates demographic identity and confirms mandatory recovery intervals (90 days for males, 120 days for females).'
    },
    {
      num: '02',
      title: 'Clinical Screening',
      summary: 'Pre-donation hemoglobin (>= 12.5 g/dL), blood pressure, and pulse check.',
      icon: Activity,
      detail: 'Registered medical staff perform physical triage before collection to safeguard donor well-being.'
    },
    {
      num: '03',
      title: 'Sterile Phlebotomy',
      summary: '10–12 minute collection using 100% single-use, pyrogen-free sterile kits.',
      icon: Heart,
      detail: 'Automated rocking donor couches with precision weight cut-offs ensure safe 350 mL or 450 mL collection.'
    },
    {
      num: '04',
      title: '5-Point NAT Screening',
      summary: 'Molecular screening for HIV-1/2, HBV, HCV, Syphilis, and Malaria.',
      icon: ShieldCheck,
      detail: 'Polymerase chain reaction (PCR) and chemiluminescence assays eliminate window-period transfusion risks.'
    },
    {
      num: '05',
      title: 'Cold-Chain Storage',
      summary: 'Component separation into PRBC, Platelets, and FFP at 2°C–6°C.',
      icon: Building2,
      detail: 'Serialized barcodes and continuous thermal telemetry monitor every unit inside certified regional vaults.'
    },
    {
      num: '06',
      title: 'Hospital Cross-Match',
      summary: 'Digital requisition matching recipient blood group and clinical urgency.',
      icon: AlertCircle,
      detail: 'Serological antibody screening and compatibility verification guarantee safe transfusion allocation.'
    },
    {
      num: '07',
      title: 'Bedside Transfusion',
      summary: 'Tamper-evident refrigerated dispatch directly to the patient ward.',
      icon: CheckCircle2,
      detail: 'Dual-nurse barcode verification at the bedside confirms right-unit, right-patient clinical traceability.'
    }
  ];

  return (
    <div className="w-full bg-[#F8FAFC]">
      {/* ----------------- 01. EDITORIAL SWISS LIVE BLOOD RADAR & 1-TAP SOS HERO ----------------- */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7 pb-10 lg:pt-9 lg:pb-12">
          {/* Swiss Masthead & Editorial Headline Row */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200">
            <div className="space-y-2 max-w-3xl">
              <p className="text-xs font-mono text-slate-500 tracking-tight">
                SBTC &amp; CDSCO Accredited Network · Mumbai Metro Cold-Chain Radar · 24/7 Helpline{' '}
                <strong className="text-slate-950 font-semibold">1800-11-9999</strong>
              </p>
              <h1 className="text-[clamp(1.85rem,3.4vw,2.9rem)] font-display font-bold text-slate-950 tracking-tight leading-[1.08]">
                Live regional blood radar and 1-tap emergency dispatch.
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                id="hero-expand-blood-map-btn"
                type="button"
                onClick={() =>
                  onOpenBloodMap({
                    bloodGroup: radarBloodGroup === 'ALL' ? undefined : radarBloodGroup,
                    hospitalId: selectedHeroVaultId ?? undefined
                  })
                }
                className="px-4 py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Maximize2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Expand Full Blood Map</span>
              </button>

              <button
                id="hero-quick-search-btn"
                type="button"
                onClick={() =>
                  onSearchBlood({
                    bloodGroup: radarBloodGroup === 'ALL' ? undefined : radarBloodGroup
                  })
                }
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <span>Component Inventory</span>
              </button>
            </div>
          </div>

          {/* Synchronized 8-Group Tactile Blood Selector Strip */}
          <div className="py-3.5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] text-slate-500 mr-1.5 shrink-0">
                Filter Radar
              </span>
              {(['ALL', ...BLOOD_GROUPS] as const).map(group => {
                const isActive = radarBloodGroup === group;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => {
                      setRadarBloodGroup(group);
                      setSelectedHeroCampId(null);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-rose-700 text-white border-rose-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-900 hover:text-slate-950'
                    }`}
                  >
                    {group === 'ALL' ? 'ALL' : group}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-600 shrink-0">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={radarShowCamps}
                  onChange={e => setRadarShowCamps(e.target.checked)}
                  className="accent-slate-950 rounded-xs"
                />
                <span>Show Donation Camps ({heroCamps.length})</span>
              </label>
              <span className="hidden sm:inline font-mono text-[11px] text-slate-500 tabular-data">
                Tap any vault pin to inspect
              </span>
            </div>
          </div>

          {/* Primary Two-Column Swiss Command Split: Radar Map (7 cols) + 1-Tap SOS Card (5 cols) */}
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left 7 Cols: Interactive Regional Blood Radar Surface */}
            <div className="lg:col-span-7 border border-slate-200 rounded-xl bg-white overflow-hidden flex flex-col">
              <div className="flex-1 min-h-[360px]">
                <RegionalBloodMapCanvas
                  vaults={heroVaults}
                  camps={heroCamps}
                  selectedBloodGroup={radarBloodGroup}
                  showVaults={true}
                  showCamps={radarShowCamps}
                  highlightSubstitutes={true}
                  selectedVaultId={selectedHeroVaultId ?? activeHeroVault?.hospital.id ?? null}
                  selectedCampId={selectedHeroCampId}
                  userLocation={null}
                  routeOrigin={null}
                  routeDestinationVaultId={null}
                  quotaExceeded={quotaExceeded}
                  heightClassName="h-[370px] sm:h-[420px]"
                  compact={true}
                  onSelectVault={vault => {
                    setSelectedHeroVaultId(vault.hospital.id);
                    setSelectedHeroCampId(null);
                  }}
                  onSelectCamp={camp => {
                    setSelectedHeroCampId(camp.camp.id);
                  }}
                />
              </div>

              {/* Swiss Hairline Selected Pin Dossier Strip */}
              <div className="px-4 py-3 bg-[#F8FAFC] border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                {selectedHeroCamp ? (
                  <>
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-rose-700 font-semibold">
                        CAMP · {selectedHeroCamp.camp.date} · {selectedHeroCamp.remainingSlots} slots open
                      </div>
                      <div className="text-sm font-display font-bold text-slate-950 truncate">
                        {selectedHeroCamp.camp.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectCamp(selectedHeroCamp.camp)}
                        className="px-3 py-1.5 rounded-md bg-slate-950 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                      >
                        Reserve Slot
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenBloodMap({ layer: 'camps' })}
                        className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold cursor-pointer"
                      >
                        Full Map
                      </button>
                    </div>
                  </>
                ) : activeHeroVault ? (
                  <>
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-slate-500 tabular-data">
                        {activeHeroVault.hospital.hospitalCode} · {activeHeroVault.zone} ·{' '}
                        <strong className="text-slate-950">
                          {activeHeroVault.directUnits} {radarBloodGroup === 'ALL' ? 'total' : radarBloodGroup} u
                        </strong>
                      </div>
                      <div className="text-sm font-display font-bold text-slate-950 truncate">
                        {activeHeroVault.hospital.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenBloodMap({
                            bloodGroup: radarBloodGroup === 'ALL' ? undefined : radarBloodGroup,
                            hospitalId: activeHeroVault.hospital.id
                          })
                        }
                        className="px-3 py-1.5 rounded-md bg-slate-950 hover:bg-slate-800 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <MapIcon className="w-3.5 h-3.5" />
                        <span>Inspect Vault &amp; Route</span>
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* Right 5 Cols: Tactile 1-Tap Emergency SOS & Family Appeal Card */}
            <div className="lg:col-span-5">
              <EmergencySosCard
                selectedBloodGroup={radarBloodGroup}
                activeVault={activeHeroVault}
                totalMatchingUnits={totalRadarMatchingUnits}
                stockedVaultCount={stockedRadarVaultCount}
                onOpenEmergency={onOpenEmergency}
                onOpenBooking={onOpenBooking}
                onOpenTracker={onOpenTracker}
                onSelectBloodGroup={group => setRadarBloodGroup(group)}
              />
            </div>
          </div>

          {/* Full-Width 4-Column Swiss Quantified Proof Strip */}
          <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-2xl sm:text-3xl font-display font-bold text-slate-950 font-mono tabular-data">
                {stats.donorsCount.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500 mt-1">Registered Voluntary Donors</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-display font-bold text-slate-950 font-mono tabular-data">
                {stats.availableUnits}
              </div>
              <div className="text-xs text-slate-500 mt-1">NAT-Verified Units Ready Now</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-display font-bold text-slate-950 font-mono tabular-data">
                {stats.hospitalsCount}
              </div>
              <div className="text-xs text-slate-500 mt-1">Connected Hospital Vaults</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-display font-bold text-rose-700 font-mono tabular-data">
                15–20 min
              </div>
              <div className="text-xs text-slate-500 mt-1">Priority ICU Cold-Chain Transit</div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------- 02. LIVE BLOOD STOCK AVAILABILITY ----------------- */}
      <section id="section-live-availability" className="py-16 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
            <div>
              <p className="text-xs font-medium text-rose-700 mb-1">01. Real-Time Vault Ledger</p>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
                Live Blood Stock Availability
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Select any blood group to inspect component availability or schedule a targeted donation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 bg-white p-1 rounded-lg border border-slate-200 overflow-x-auto">
                {['ALL', 'O-', 'O+', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(bg => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => setSelectedGroupFilter(bg)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      selectedGroupFilter === bg
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
                    }`}
                  >
                    {bg}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey(k => k + 1)}
                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
                title="Refresh stock counts"
                aria-label="Refresh stock counts"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inline Clinical Shortage Notice (replaces cluttered stacked header banner) */}
          {criticalGroups.length > 0 && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-rose-50/70 border border-rose-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-slate-800">
                <span className="font-semibold text-rose-800">Priority Reserve Notice:</span>{' '}
                Low regional reserves for{' '}
                <strong className="font-mono text-rose-800">
                  {criticalGroups.map(g => g.bloodGroup).join(', ')}
                </strong>
                . Eligible donors can book a direct 15-minute slot today.
              </div>
              <button
                type="button"
                onClick={() => onOpenBooking({ bloodGroup: criticalGroups[0].bloodGroup })}
                className="font-semibold text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>Donate {criticalGroups[0].bloodGroup}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 8 Blood Group Stock Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {filteredAvailability.map(item => {
              const fillPct = Math.min(100, Math.round((item.availableUnits / 10) * 100));
              const isLowOrCritical = item.status === 'Critical' || item.status === 'Low';

              return (
                <div
                  key={item.bloodGroup}
                  className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-lg font-display font-bold text-slate-950 font-mono">
                      {item.bloodGroup}
                    </span>
                    {renderStatusText(item.status)}
                  </div>

                  <div className="my-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono text-slate-950 tabular-data">
                        {item.availableUnits}
                      </span>
                      <span className="text-xs text-slate-500">units</span>
                    </div>

                    <div className="mt-2 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.status === 'Critical'
                            ? 'bg-rose-700'
                            : item.status === 'Low'
                            ? 'bg-amber-600'
                            : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.max(fillPct, 8)}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onOpenBloodMap({ bloodGroup: item.bloodGroup })}
                      className="font-medium text-slate-700 hover:text-rose-700 inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>On Map</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    {isLowOrCritical ? (
                      <button
                        type="button"
                        onClick={() => onOpenBooking({ bloodGroup: item.bloodGroup })}
                        className="font-semibold text-rose-700 hover:underline cursor-pointer"
                      >
                        Donate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSearchBlood({ bloodGroup: item.bloodGroup })}
                        className="font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                      >
                        Stock
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              Stock thresholds: Adequate (&gt;3 units) · Low Reserve (2–3 units) · Urgent Need (&le;1 unit)
            </div>
            <button
              type="button"
              onClick={() => onSearchBlood({})}
              className="font-semibold text-slate-900 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Explore PRBC, Platelets &amp; Plasma Breakdown</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* ----------------- 02B. AI CLINICAL CARE SUITE ----------------- */}
      <section className="py-14 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div className="max-w-2xl">
              <p className="text-xs font-mono uppercase tracking-[0.12em] text-rose-700 font-semibold mb-1">
                AI Clinical Care Desk · Live Inventory Grounded
              </p>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
                Interactive AI tools built for urgent decisions and safer donations.
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenAiDesk('triage')}
              className="px-4 py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-2 self-start md:self-auto cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              <span>Open AI Care Desk</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 border border-slate-200 rounded-xl overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-[#F8FAFC]">
            <button
              type="button"
              onClick={() => onOpenAiDesk('triage')}
              className="p-6 text-left hover:bg-white transition-colors flex flex-col justify-between gap-6 cursor-pointer group"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>01 · STREAMING + VOICE</span>
                  <Volume2 className="w-4 h-4 text-rose-700" />
                </div>
                <h3 className="text-base font-display font-bold text-slate-950 group-hover:text-rose-700 transition-colors">
                  Live AI Triage &amp; Voice Read-Aloud
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Ask about urgent blood needs, compatible donor substitutes, or vault availability and hear calm spoken guidance in one tap.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-900 inline-flex items-center gap-1">
                <span>Start Clinical Triage</span>
                <ArrowRight className="w-3.5 h-3.5 text-rose-700" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenAiDesk('scanner')}
              className="p-6 text-left hover:bg-white transition-colors flex flex-col justify-between gap-6 cursor-pointer group"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>02 · MULTIMODAL VISION</span>
                  <FileScan className="w-4 h-4 text-rose-700" />
                </div>
                <h3 className="text-base font-display font-bold text-slate-950 group-hover:text-rose-700 transition-colors">
                  Requisition &amp; Lab Slip Scanner
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Upload a hospital blood slip or CBC hemoglobin report to extract blood group, component, and units—then auto-fill Emergency Dispatch.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-900 inline-flex items-center gap-1">
                <span>Scan Slip or Report</span>
                <ArrowRight className="w-3.5 h-3.5 text-rose-700" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenAiDesk('coach')}
              className="p-6 text-left hover:bg-white transition-colors flex flex-col justify-between gap-6 cursor-pointer group"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>03 · NBTC PERSONALIZED</span>
                  <HeartPulse className="w-4 h-4 text-rose-700" />
                </div>
                <h3 className="text-base font-display font-bold text-slate-950 group-hover:text-rose-700 transition-colors">
                  Donor Readiness &amp; Iron Coach
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Generate your personal readiness score, 24-hour hydration plan, and diet-matched Indian iron recovery meals before booking a slot.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-900 inline-flex items-center gap-1">
                <span>Build My Donor Plan</span>
                <ArrowRight className="w-3.5 h-3.5 text-rose-700" />
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ----------------- 03. ASYMMETRIC CLINICAL UTILITIES ----------------- */}
      <section className="py-16 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium text-rose-700 mb-1">02. Clinical Decision Support</p>
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
              Interactive Transfusion &amp; Donor Tools
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Verify compatibility before cross-matching, confirm donation eligibility in 60 seconds, or track live refrigerated transit.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Marquee Asymmetric Panel (5 cols): Blood Compatibility Quick Checker */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-[#F8FAFC] border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-500 mb-1">Interactive Reference · ABO &amp; Rh</div>
                <h3 className="text-lg font-display font-bold text-slate-950">
                  Blood Compatibility Checker
                </h3>
                <p className="text-sm text-slate-600 mt-1 mb-5">
                  Select a blood group to inspect red cell compatibility and trigger matching requests.
                </p>

                <div className="grid grid-cols-4 gap-1.5 mb-5">
                  {(['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as BloodGroup[]).map(bg => (
                    <button
                      key={bg}
                      type="button"
                      onClick={() => setActiveCompatGroup(bg)}
                      className={`py-2 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                        activeCompatGroup === bg
                          ? 'bg-rose-700 text-white'
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {bg}
                    </button>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-500 shrink-0">Can Donate To</span>
                    <span className="font-mono font-semibold text-emerald-700 text-right">
                      {compatibilityGuide[activeCompatGroup].canDonateTo.join(' · ')}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-slate-100">
                    <span className="text-slate-500 shrink-0">Can Receive From</span>
                    <span className="font-mono font-semibold text-slate-900 text-right">
                      {compatibilityGuide[activeCompatGroup].canReceiveFrom.join(' · ')}
                    </span>
                  </div>
                  <p className="text-slate-600 pt-2 border-t border-slate-100 leading-relaxed">
                    {compatibilityGuide[activeCompatGroup].notes}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => onNavigate('compatibility')}
                  className="text-xs font-semibold text-slate-900 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Full Compatibility Matrix</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onSearchBlood({ bloodGroup: activeCompatGroup })}
                  className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                >
                  Find {activeCompatGroup} Stock
                </button>
              </div>
            </div>

            {/* Eligibility Pre-Check (4 cols) */}
            <div className="lg:col-span-4 p-6 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-500 mb-1">NBTC Self-Check · Under 60 Seconds</div>
                <h3 className="text-lg font-display font-bold text-slate-950">
                  Am I Eligible to Donate?
                </h3>
                <p className="text-sm text-slate-600 mt-1 mb-5">
                  Verify age, weight, hemoglobin, and recovery window before booking your visit.
                </p>

                <ul className="space-y-2.5 text-sm text-slate-700 border-t border-slate-100 pt-4">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Age between 18 and 65 years</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Body weight &ge; 45 kg</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Hemoglobin &ge; 12.5 g/dL (tested on-site)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>90+ days since last donation (120 for females)</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                {onOpenEligibilityCheck && (
                  <button
                    type="button"
                    onClick={onOpenEligibilityCheck}
                    className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Stethoscope className="w-4 h-4" />
                    <span>Start 60-Sec Pre-Check</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenBooking()}
                  className="w-full py-2 px-4 rounded-lg text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  Already Eligible? Book a Direct Slot
                </button>
              </div>
            </div>

            {/* Cold-Chain Logistics & Transit (3 cols) */}
            <div className="lg:col-span-3 p-6 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-500 mb-1">24/7 Cold-Chain Logistics</div>
                <h3 className="text-lg font-display font-bold text-slate-950">
                  Live Dispatch Tracker
                </h3>
                <p className="text-sm text-slate-600 mt-1 mb-5">
                  Follow temperature-logged refrigerated carriers from blood vault to hospital ICU.
                </p>

                <div className="space-y-3 text-xs border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Vault Range</span>
                    <span className="font-mono font-semibold text-emerald-700 tabular-data">2.0°C – 6.0°C</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">ICU Dispatch SLA</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-data">15–20 mins</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Verification</span>
                    <span className="font-semibold text-slate-900">RFID Tamper Seal</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                {onOpenTracker && (
                  <button
                    type="button"
                    onClick={onOpenTracker}
                    className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Truck className="w-4 h-4 text-slate-600" />
                    <span>Track Dispatch</span>
                  </button>
                )}
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 pt-1">
                  <PhoneCall className="w-3.5 h-3.5 text-rose-700" />
                  <span className="font-mono">1800-11-9999</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------- 04. VEIN-TO-VEIN CLINICAL SAFETY & LAB FACILITY ----------------- */}
      <section className="py-16 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start mb-10">
            <div className="lg:col-span-5 space-y-3">
              <p className="text-xs font-medium text-rose-700">03. Traceable Clinical Governance</p>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
                Seven verified stages from donor chair to bedside.
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Every blood unit carries a serialized identifier from initial hemoglobin screening through 5-point NAT pathogen assays and thermal cold-chain vault storage.
              </p>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white aspect-[16/9]">
                {!labImgFailed ? (
                  <img
                    src={LAB_IMAGE_PATH}
                    alt="Modern hematology laboratory and temperature-monitored cold-chain blood storage vault"
                    referrerPolicy="no-referrer"
                    onError={() => setLabImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center text-sm text-slate-500">
                    Certified 2°C–6°C Hematology &amp; Cold-Chain Vault Facility
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 7 Interactive Stage Selectors */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {steps.map((step, idx) => {
              const active = activeStepIndex === idx;
              return (
                <button
                  key={step.num}
                  type="button"
                  onClick={() => setActiveStepIndex(idx)}
                  className={`text-left p-4 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <span className={`font-mono text-xs font-semibold ${active ? 'text-rose-300' : 'text-rose-700'}`}>
                    {step.num}
                  </span>
                  <span className={`text-sm font-semibold mt-3 leading-snug ${active ? 'text-white' : 'text-slate-900'}`}>
                    {step.title}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Stage Clinical Detail Panel */}
          <div className="mt-4 p-6 rounded-xl bg-white border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1 max-w-3xl">
              <div className="text-xs font-medium text-slate-500">
                Stage {steps[activeStepIndex].num} · Standard Operating Protocol
              </div>
              <h3 className="text-lg font-display font-bold text-slate-950">
                {steps[activeStepIndex].title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {steps[activeStepIndex].summary} {steps[activeStepIndex].detail}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSearchBlood({})}
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
            >
              <span>Inspect Certified Stock</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ----------------- 05. UPCOMING DONATION CAMPS & DIRECT BOOKING ----------------- */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
            <div>
              <p className="text-xs font-medium text-rose-700 mb-1">04. Community &amp; Hospital Drives</p>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
                Upcoming Blood Donation Camps
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Join an organized regional drive or schedule a private appointment at a partner hospital blood bank.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('camps')}
                className="text-sm font-semibold text-slate-700 hover:text-slate-950 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>View All Camps</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {upcomingCamps.map(camp => {
              const pct = Math.min(100, Math.round((camp.registeredDonorsCount / camp.capacity) * 100));
              return (
                <div
                  key={camp.id}
                  className="p-6 rounded-xl bg-[#F8FAFC] border border-slate-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-xs text-slate-500 font-mono tabular-data mb-2">
                      {camp.date} · {camp.startTime} – {camp.endTime}
                    </div>
                    <h3 className="text-base font-display font-bold text-slate-950 leading-snug">
                      {camp.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {camp.organizer} · {camp.city}
                    </p>
                    <p className="text-xs text-slate-600 mt-3 flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{camp.location}</span>
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Registered Slots</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-data">
                        {camp.registeredDonorsCount} / {camp.capacity}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-700 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectCamp(camp)}
                      className="w-full py-2.5 px-4 rounded-lg bg-white border border-slate-300 hover:border-slate-400 text-xs font-semibold text-slate-900 transition-colors cursor-pointer"
                    >
                      Reserve Camp Slot
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quiet Closing Conversion Band */}
          <div className="mt-12 p-8 rounded-2xl bg-slate-950 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-xl space-y-1.5">
              <h3 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
                Prefer a dedicated hospital blood bank slot?
              </h3>
              <p className="text-sm text-slate-300">
                Book a direct appointment at any verified partner hospital in Mumbai, Pune, Nagpur, or Nashik and receive an instant printable Digital Pass.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => onOpenBooking()}
                className="px-5 py-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Book Direct Appointment
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('donor', true)}
                className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Create Donor Account
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------- 06. ACCREDITED HOSPITAL NETWORK & CLINICAL OUTCOMES ----------------- */}
      <section className="py-16 border-t border-slate-200 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-medium text-rose-700 mb-1">05. Accredited Transfusion Network</p>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
                Trusted by regional trauma centers and hematology wards.
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Direct vault-to-ward synchronization cuts cross-match waiting times and preserves temperature compliance from collection to transfusion.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSearchBlood({})}
              className="text-sm font-semibold text-slate-700 hover:text-slate-950 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              <span>Browse All Partner Vaults</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {partnerHospitals.map(hospital => (
              <div
                key={hospital.id}
                className="p-5 rounded-xl bg-white border border-slate-200 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="text-xs font-mono text-slate-500">
                    {hospital.hospitalCode} · {hospital.city}
                  </div>
                  <h3 className="text-sm font-display font-bold text-slate-950 mt-1 leading-snug">
                    {hospital.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{hospital.address}</p>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 tabular-data">
                    <strong className="font-semibold text-slate-900">{hospital.totalUnitsReceived}</strong> units transfused
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenBloodMap({ hospitalId: hospital.id })}
                    className="font-semibold text-rose-700 hover:text-rose-800 cursor-pointer"
                  >
                    Map Pin →
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <blockquote className="p-6 rounded-xl bg-white border border-slate-200 flex flex-col justify-between gap-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                “Having verified ABO/Rh component counts across Mumbai vaults cut our emergency surgical sourcing window from over 45 minutes to under 18 minutes.”
              </p>
              <footer className="text-xs text-slate-500 pt-3 border-t border-slate-100">
                <strong className="font-semibold text-slate-900">Dr. Meera Deshmukh</strong> · Head of Transfusion Medicine, Lilavati Hospital &amp; Research Centre
              </footer>
            </blockquote>

            <blockquote className="p-6 rounded-xl bg-white border border-slate-200 flex flex-col justify-between gap-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                “Pre-scheduled donor slots with digital check-in passes eliminated lobby crowding during weekend drives while keeping every screening record linked to its unit barcode.”
              </p>
              <footer className="text-xs text-slate-500 pt-3 border-t border-slate-100">
                <strong className="font-semibold text-slate-900">Dr. Rajesh Kulkarni</strong> · Regional Blood Bank Director, KEM Hospital Blood Center
              </footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ----------------- 07. DONOR & TRANSFUSION FAQ ACCORDION ----------------- */}
      <section className="py-16 border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-4 space-y-3">
              <p className="text-xs font-medium text-rose-700">06. Clinical Guidance</p>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
                Common questions from donors and families.
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Clear answers aligned with NBTC and SBTC safety standards. Need to verify if you can donate today?
              </p>
              {onOpenEligibilityCheck && (
                <button
                  type="button"
                  onClick={onOpenEligibilityCheck}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <Stethoscope className="w-4 h-4 text-rose-700" />
                  <span>Run 60-Second Eligibility Check</span>
                </button>
              )}
            </div>

            <div className="lg:col-span-8 divide-y divide-slate-200 border-t border-b border-slate-200">
              {CLINICAL_FAQS.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={item.q} className="py-4">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between gap-4 text-left cursor-pointer group"
                    >
                      <span className="text-sm font-semibold text-slate-950 group-hover:text-rose-700 transition-colors">
                        {item.q}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                          isOpen ? 'rotate-180 text-rose-700' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p className="mt-3 text-sm text-slate-600 leading-relaxed pr-8">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
