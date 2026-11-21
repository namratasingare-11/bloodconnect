import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Copy,
  Crosshair,
  List,
  Map as MapIcon,
  MapPin,
  MessageSquareShare,
  Navigation,
  PhoneCall,
  Route,
  Thermometer,
  X,
} from 'lucide-react';
import {
  BloodComponent,
  BloodGroup,
  BloodMapIntent,
  BookingPrefill,
  DonationCamp,
  EmergencyPrefill,
} from '../types';
import { BLOOD_COMPONENTS, BLOOD_GROUPS } from '../config/constants';
import { db } from '../db/databaseStore';
import { useDatabaseSubscription } from '../hooks/useDatabaseSubscription';
import {
  COMPATIBLE_DONOR_GROUPS,
  CampPinSnapshot,
  GeoPoint,
  HospitalVaultSnapshot,
  MUMBAI_METRO_CENTER,
  buildCampPinSnapshots,
  buildFamilySosAppeal,
  buildRegionalVaultSnapshots,
  buildWhatsAppShareUrl,
} from '../utils/regionalVaults';
import RegionalBloodMapCanvas, { RouteEtaSummary } from './RegionalBloodMapCanvas';

interface RegionalBloodMapViewProps {
  initialIntent?: BloodMapIntent | null;
  quotaExceeded?: boolean;
  onOpenEmergency: (prefill?: EmergencyPrefill) => void;
  onOpenBooking: (prefill?: BookingPrefill) => void;
  onSelectCamp: (camp: DonationCamp) => void;
}

export default function RegionalBloodMapView({
  initialIntent,
  quotaExceeded = false,
  onOpenEmergency,
  onOpenBooking,
  onSelectCamp,
}: RegionalBloodMapViewProps) {
  const storeRevision = useDatabaseSubscription();

  const [selectedBloodGroup, setSelectedBloodGroup] = useState<BloodGroup | 'ALL'>(
    initialIntent?.bloodGroup ?? 'ALL'
  );
  const [selectedComponent, setSelectedComponent] = useState<BloodComponent | 'ALL'>(
    initialIntent?.component ?? 'ALL'
  );
  const [showVaults, setShowVaults] = useState(initialIntent?.layer !== 'camps');
  const [showCamps, setShowCamps] = useState(initialIntent?.layer !== 'vaults');
  const [highlightSubstitutes, setHighlightSubstitutes] = useState(true);

  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(
    initialIntent?.hospitalId ?? null
  );
  const [selectedCampId, setSelectedCampId] = useState<number | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'map' | 'list'>('map');

  // Geolocation & Driving ETA state
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [routeOrigin, setRouteOrigin] = useState<GeoPoint | null>(null);
  const [routeOriginLabel, setRouteOriginLabel] = useState<string>('Your Location');
  const [routeDestinationVaultId, setRouteDestinationVaultId] = useState<number | null>(null);
  const [routeEta, setRouteEta] = useState<RouteEtaSummary | null>(null);

  const [copiedPhoneId, setCopiedPhoneId] = useState<number | null>(null);
  const [copiedAppeal, setCopiedAppeal] = useState(false);

  // Sync when navigated from homepage or QuickSearch with a new intent
  useEffect(() => {
    if (!initialIntent) return;
    if (initialIntent.bloodGroup) setSelectedBloodGroup(initialIntent.bloodGroup);
    if (initialIntent.component) setSelectedComponent(initialIntent.component);
    if (initialIntent.hospitalId) {
      setSelectedVaultId(initialIntent.hospitalId);
      setSelectedCampId(null);
    }
    if (initialIntent.layer === 'camps') {
      setShowVaults(false);
      setShowCamps(true);
    } else if (initialIntent.layer === 'vaults') {
      setShowVaults(true);
      setShowCamps(false);
    }
  }, [initialIntent]);

  // Escape closes inspector drawer cleanly
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedVaultId(null);
        setSelectedCampId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const hospitals = useMemo(() => db.getHospitals(), [storeRevision]);
  const bloodUnits = useMemo(() => db.getBloodUnits(), [storeRevision]);
  const campsRaw = useMemo(() => db.getCamps(), [storeRevision]);

  const vaults = useMemo(() => {
    const snapshots = buildRegionalVaultSnapshots(
      hospitals,
      bloodUnits,
      selectedBloodGroup,
      selectedComponent,
      userLocation
    );
    return snapshots.sort((a, b) => {
      if (userLocation && a.distanceKm !== null && b.distanceKm !== null) {
        const aHasStock = a.directUnits > 0 ? 1 : 0;
        const bHasStock = b.directUnits > 0 ? 1 : 0;
        if (aHasStock !== bHasStock) return bHasStock - aHasStock;
        return a.distanceKm - b.distanceKm;
      }
      return b.directUnits - a.directUnits;
    });
  }, [hospitals, bloodUnits, selectedBloodGroup, selectedComponent, userLocation]);

  const camps = useMemo(
    () => buildCampPinSnapshots(campsRaw, userLocation),
    [campsRaw, userLocation]
  );

  const selectedVault = useMemo(
    () => vaults.find((v) => v.hospital.id === selectedVaultId) ?? null,
    [vaults, selectedVaultId]
  );

  const selectedCamp = useMemo(
    () => camps.find((c) => c.camp.id === selectedCampId) ?? null,
    [camps, selectedCampId]
  );

  const totalDirectUnits = useMemo(
    () => vaults.reduce((sum, v) => sum + v.directUnits, 0),
    [vaults]
  );

  const handleLocateNearestVault = () => {
    setLocationNotice(null);
    if (!navigator.geolocation) {
      setLocationNotice('Browser geolocation unavailable. Showing distances from Central Mumbai.');
      setUserLocation(MUMBAI_METRO_CENTER);
      setRouteOrigin(MUMBAI_METRO_CENTER);
      setRouteOriginLabel('Central Mumbai');
      const best = vaults.find((v) => v.directUnits > 0) || vaults[0];
      if (best) {
        setSelectedVaultId(best.hospital.id);
        setSelectedCampId(null);
        setRouteDestinationVaultId(best.hospital.id);
      }
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const coords: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLocation(coords);
        setRouteOrigin(coords);
        setRouteOriginLabel('Your Location');

        const ranked = buildRegionalVaultSnapshots(
          hospitals,
          bloodUnits,
          selectedBloodGroup,
          selectedComponent,
          coords
        ).sort((a, b) => {
          const aHas = a.directUnits > 0 ? 1 : 0;
          const bHas = b.directUnits > 0 ? 1 : 0;
          if (aHas !== bHas) return bHas - aHas;
          return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
        });

        const nearest = ranked[0];
        if (nearest) {
          setSelectedVaultId(nearest.hospital.id);
          setSelectedCampId(null);
          setRouteDestinationVaultId(nearest.hospital.id);
          setLocationNotice(
            `Nearest stocked vault located: ${nearest.hospital.name} (${nearest.distanceKm} km away).`
          );
        }
      },
      () => {
        setLocating(false);
        setUserLocation(MUMBAI_METRO_CENTER);
        setRouteOrigin(MUMBAI_METRO_CENTER);
        setRouteOriginLabel('Central Mumbai Hub');
        const best = vaults.find((v) => v.directUnits > 0) || vaults[0];
        if (best) {
          setSelectedVaultId(best.hospital.id);
          setSelectedCampId(null);
          setRouteDestinationVaultId(best.hospital.id);
        }
        setLocationNotice(
          'Location permission declined. Estimating route from Central Mumbai instead.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleComputeRouteToVault = (vault: HospitalVaultSnapshot) => {
    const origin = userLocation ?? MUMBAI_METRO_CENTER;
    setRouteOrigin(origin);
    setRouteOriginLabel(userLocation ? 'Your Location' : 'Central Mumbai Hub');
    setRouteDestinationVaultId(vault.hospital.id);
  };

  const handleCopyPhone = async (id: number, phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhoneId(id);
      setTimeout(() => setCopiedPhoneId(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleCopyVaultAppeal = async (vault: HospitalVaultSnapshot) => {
    const msg = buildFamilySosAppeal({
      bloodGroup: selectedBloodGroup === 'ALL' ? 'O-' : selectedBloodGroup,
      unitsNeeded: 2,
      component: selectedComponent === 'ALL' ? 'Packed Red Cells' : selectedComponent,
      hospitalName: vault.hospital.name,
      hospitalPhone: vault.hospital.phone,
      hospitalCity: vault.hospital.city,
    });
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedAppeal(true);
      setTimeout(() => setCopiedAppeal(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="w-full bg-[#F8FAFC] min-h-[calc(100vh-8rem)]">
      {/* Top Swiss Editorial Filter Rail */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-[0.12em] text-rose-700 font-semibold">
                Live Spatial Telemetry · Mumbai Metropolitan Region
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight mt-0.5">
                Interactive Regional Blood Vault Map
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Inspect real-time cold-chain unit counts across{' '}
                <strong className="font-mono text-slate-950">{vaults.length}</strong> accredited
                hospital vaults and{' '}
                <strong className="font-mono text-slate-950">{camps.length}</strong> upcoming
                donation camps.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                id="blood-map-locate-nearest-btn"
                type="button"
                onClick={handleLocateNearestVault}
                disabled={locating}
                className="px-4 py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Crosshair className="w-3.5 h-3.5 text-rose-400" />
                <span>{locating ? 'Locating Vault...' : 'Locate Nearest Vault'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onOpenEmergency({
                    bloodGroup: selectedBloodGroup === 'ALL' ? 'O-' : selectedBloodGroup,
                    hospitalId: selectedVault?.hospital.id ?? vaults[0]?.hospital.id,
                    component: selectedComponent === 'ALL' ? 'Packed Red Cells' : selectedComponent,
                  })
                }
                className="px-4 py-2.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Emergency Dispatch</span>
              </button>
            </div>
          </div>

          {/* 8-Group Tactile Selector + Component + Layers */}
          <div className="pt-3 border-t border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 xl:pb-0">
              {(['ALL', ...BLOOD_GROUPS] as const).map((group) => {
                const active = selectedBloodGroup === group;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setSelectedBloodGroup(group)}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-rose-700 text-white border-rose-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-900 hover:text-slate-950'
                    }`}
                  >
                    {group === 'ALL' ? 'ALL' : group}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Filter by blood component"
                value={selectedComponent}
                onChange={(e) => setSelectedComponent(e.target.value as BloodComponent | 'ALL')}
                className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-950 cursor-pointer"
              >
                <option value="ALL">All Blood Components</option>
                {BLOOD_COMPONENTS.map((comp) => (
                  <option key={comp} value={comp}>
                    {comp}
                  </option>
                ))}
              </select>

              <div className="flex items-center border border-slate-200 rounded-md bg-[#F8FAFC] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setShowVaults((v) => !v)}
                  className={`px-2.5 py-1 rounded-xs font-medium transition-colors cursor-pointer ${
                    showVaults ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Vaults ({vaults.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowCamps((v) => !v)}
                  className={`px-2.5 py-1 rounded-xs font-medium transition-colors cursor-pointer ${
                    showCamps ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Camps ({camps.length})
                </button>
              </div>

              {selectedBloodGroup !== 'ALL' && (
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={highlightSubstitutes}
                    onChange={(e) => setHighlightSubstitutes(e.target.checked)}
                    className="accent-rose-700 rounded-xs"
                  />
                  <span>Show compatible substitutes</span>
                </label>
              )}
            </div>
          </div>

          {locationNotice && (
            <div className="px-3.5 py-2 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                <span>{locationNotice}</span>
              </span>
              <button
                type="button"
                onClick={() => setLocationNotice(null)}
                className="text-slate-400 hover:text-slate-800 cursor-pointer"
                aria-label="Dismiss location notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Mobile Map / List Switcher */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-mono text-slate-600 tabular-data">
          {totalDirectUnits} matching units · {vaults.length} vaults
        </span>
        <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMobilePanel('map')}
            className={`px-3 py-1 rounded-xs inline-flex items-center gap-1 cursor-pointer ${
              mobilePanel === 'map' ? 'bg-slate-950 text-white' : 'text-slate-600'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Map</span>
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel('list')}
            className={`px-3 py-1 rounded-xs inline-flex items-center gap-1 cursor-pointer ${
              mobilePanel === 'list' ? 'bg-slate-950 text-white' : 'text-slate-600'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Ledger</span>
          </button>
        </div>
      </div>

      {/* Synchronized Split Map + Ledger Workspace */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 border border-slate-200 rounded-xl bg-white overflow-hidden">
          {/* Left Synchronized Vault & Camp Ledger (4 cols) */}
          <div
            className={`lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col h-[560px] lg:h-[660px] ${
              mobilePanel === 'map' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <div className="px-4 py-3 border-b border-slate-200 bg-[#F8FAFC] flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900">
                {selectedBloodGroup === 'ALL'
                  ? 'All Regional Vaults'
                  : `${selectedBloodGroup} Stock Ledger`}
              </span>
              <span className="font-mono font-bold text-slate-700 tabular-data">
                {totalDirectUnits} units ready
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
              {showVaults &&
                vaults.map((vault) => {
                  const isSelected = selectedVaultId === vault.hospital.id;
                  return (
                    <button
                      key={vault.hospital.id}
                      type="button"
                      onClick={() => {
                        setSelectedVaultId(vault.hospital.id);
                        setSelectedCampId(null);
                        setMobilePanel('map');
                      }}
                      className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                        isSelected ? 'bg-slate-950 text-white' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className={`text-[11px] font-mono ${
                              isSelected ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {vault.hospital.hospitalCode} · {vault.zone}
                          </div>
                          <div
                            className={`text-sm font-display font-bold truncate mt-0.5 ${
                              isSelected ? 'text-white' : 'text-slate-950'
                            }`}
                          >
                            {vault.hospital.name}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`text-base font-mono font-bold tabular-data ${
                              isSelected
                                ? 'text-white'
                                : vault.status === 'Available'
                                ? 'text-emerald-700'
                                : vault.status === 'Low'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {vault.directUnits} u
                          </div>
                          {vault.distanceKm !== null && (
                            <div
                              className={`text-[10px] font-mono tabular-data ${
                                isSelected ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              {vault.distanceKm} km
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        className={`mt-2 flex items-center justify-between text-[11px] ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        <span className="font-mono tabular-data">
                          {vault.coldChainTempC.toFixed(1)}°C · {vault.responseEtaMin}m dispatch
                        </span>
                        {selectedBloodGroup !== 'ALL' && vault.compatibleSubstituteUnits > 0 && (
                          <span
                            className={`font-mono font-semibold ${
                              isSelected ? 'text-amber-300' : 'text-amber-700'
                            }`}
                          >
                            +{vault.compatibleSubstituteUnits} compat
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

              {showCamps && camps.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-slate-100 text-[11px] font-mono uppercase tracking-[0.1em] text-slate-600 font-semibold">
                    Upcoming Donation Camps ({camps.length})
                  </div>
                  {camps.map((item) => {
                    const isSelected = selectedCampId === item.camp.id;
                    return (
                      <button
                        key={`list-camp-${item.camp.id}`}
                        type="button"
                        onClick={() => {
                          setSelectedCampId(item.camp.id);
                          setSelectedVaultId(null);
                          setMobilePanel('map');
                        }}
                        className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                          isSelected ? 'bg-slate-950 text-white' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div
                              className={`text-[11px] font-mono ${
                                isSelected ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              {item.camp.date} · {item.camp.city}
                            </div>
                            <div
                              className={`text-sm font-display font-bold truncate mt-0.5 ${
                                isSelected ? 'text-white' : 'text-slate-950'
                              }`}
                            >
                              {item.camp.name}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`text-xs font-mono font-bold tabular-data ${
                                isSelected ? 'text-rose-300' : 'text-rose-700'
                              }`}
                            >
                              {item.remainingSlots} open
                            </div>
                            {item.distanceKm !== null && (
                              <div
                                className={`text-[10px] font-mono tabular-data ${
                                  isSelected ? 'text-slate-300' : 'text-slate-500'
                                }`}
                              >
                                {item.distanceKm} km
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Right Interactive Map Canvas + Tactile Inspector Drawer (8 cols) */}
          <div
            className={`lg:col-span-8 relative h-[560px] lg:h-[660px] ${
              mobilePanel === 'list' ? 'hidden lg:block' : 'block'
            }`}
          >
            <RegionalBloodMapCanvas
              vaults={vaults}
              camps={camps}
              selectedBloodGroup={selectedBloodGroup}
              showVaults={showVaults}
              showCamps={showCamps}
              highlightSubstitutes={highlightSubstitutes}
              selectedVaultId={selectedVaultId}
              selectedCampId={selectedCampId}
              userLocation={userLocation}
              routeOrigin={routeOrigin}
              routeOriginLabel={routeOriginLabel}
              routeDestinationVaultId={routeDestinationVaultId}
              quotaExceeded={quotaExceeded}
              heightClassName="h-full"
              onSelectVault={(v) => {
                setSelectedVaultId(v.hospital.id);
                setSelectedCampId(null);
              }}
              onSelectCamp={(c) => {
                setSelectedCampId(c.camp.id);
                setSelectedVaultId(null);
              }}
              onRouteResolved={setRouteEta}
            />

            {/* Active Driving Route ETA Bar */}
            {routeEta && (
              <div className="absolute top-14 left-3 z-30 bg-slate-950 text-white px-3.5 py-2 rounded-md shadow-md border border-slate-800 flex items-center gap-3 text-xs max-w-[calc(100%-1.5rem)]">
                <Route className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="min-w-0">
                  <div className="font-mono font-bold tabular-data">
                    {routeEta.durationMinutes} min · {routeEta.distanceKm} km
                    {routeEta.mode === 'estimated' ? ' (est.)' : ' driving'}
                  </div>
                  <div className="text-[10px] text-slate-300 truncate">
                    {routeEta.originLabel} → {routeEta.destinationName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRouteDestinationVaultId(null);
                    setRouteEta(null);
                  }}
                  aria-label="Clear route"
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Tactile Vault Inspector Slide-Over Drawer */}
            {selectedVault && (
              <div
                role="region"
                aria-label="Selected hospital vault details"
                className="absolute right-3 bottom-12 sm:bottom-3 z-30 w-[calc(100%-1.5rem)] sm:w-[390px] max-h-[82%] overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-xl"
              >
                <div className="px-4 py-3.5 border-b border-slate-200 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-rose-700 font-semibold">
                      {selectedVault.hospital.hospitalCode} · {selectedVault.hospital.licenseNumber}
                    </div>
                    <h3 className="text-base font-display font-bold text-slate-950 leading-snug mt-0.5">
                      {selectedVault.hospital.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                      <span>
                        {selectedVault.hospital.address}, {selectedVault.hospital.city}{' '}
                        {selectedVault.hospital.pincode}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedVaultId(null)}
                    aria-label="Close vault inspector"
                    className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Clinical Telemetry Strip */}
                  <div className="grid grid-cols-3 border border-slate-200 rounded-lg divide-x divide-slate-200 bg-[#F8FAFC] text-center">
                    <div className="p-2.5">
                      <div className="text-[10px] text-slate-500">
                        {selectedBloodGroup === 'ALL' ? 'Ready Units' : `${selectedBloodGroup} Units`}
                      </div>
                      <div className="text-lg font-mono font-bold text-slate-950 tabular-data">
                        {selectedVault.directUnits}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[10px] text-slate-500 inline-flex items-center gap-0.5">
                        <Thermometer className="w-3 h-3 text-emerald-700" />
                        <span>Vault</span>
                      </div>
                      <div className="text-lg font-mono font-bold text-emerald-700 tabular-data">
                        {selectedVault.coldChainTempC.toFixed(1)}°C
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[10px] text-slate-500">
                        {selectedVault.distanceKm !== null ? 'Distance' : 'ICU SLA'}
                      </div>
                      <div className="text-lg font-mono font-bold text-slate-950 tabular-data">
                        {selectedVault.distanceKm !== null
                          ? `${selectedVault.distanceKm}km`
                          : `${selectedVault.responseEtaMin}m`}
                      </div>
                    </div>
                  </div>

                  {/* Direct Phone & Driving Route Trigger */}
                  <div className="flex items-center justify-between gap-2 text-xs border border-slate-200 rounded-lg px-3 py-2">
                    <span className="font-mono text-slate-800 inline-flex items-center gap-1.5 tabular-data">
                      <PhoneCall className="w-3.5 h-3.5 text-rose-700" />
                      {selectedVault.hospital.phone}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyPhone(selectedVault.hospital.id, selectedVault.hospital.phone)
                        }
                        className="font-semibold text-slate-700 hover:text-slate-950 inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedPhoneId === selectedVault.hospital.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleComputeRouteToVault(selectedVault)}
                        className="font-semibold text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Route ETA</span>
                      </button>
                    </div>
                  </div>

                  {/* Component Breakdown */}
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-slate-500 mb-2">
                      Available Component Matrix
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {BLOOD_COMPONENTS.map((comp) => (
                        <div
                          key={comp}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#F8FAFC] border border-slate-200"
                        >
                          <span className="text-slate-600 truncate pr-2">{comp}</span>
                          <span className="font-mono font-bold text-slate-950 tabular-data">
                            {selectedVault.byComponent[comp]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Compatible Substitutes Strip */}
                  {selectedBloodGroup !== 'ALL' && (
                    <div className="p-3 rounded-lg bg-[#F8FAFC] border border-slate-200 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">
                          Compatible substitutes for{' '}
                          <strong className="font-mono text-slate-950">{selectedBloodGroup}</strong>
                        </span>
                        <span className="font-mono font-bold text-slate-950 tabular-data">
                          {selectedVault.compatibleSubstituteUnits} units
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-slate-500">
                        Groups:{' '}
                        {COMPATIBLE_DONOR_GROUPS[selectedBloodGroup]
                          .filter((g) => g !== selectedBloodGroup)
                          .join(' · ') || 'O- exact match only'}
                      </div>
                    </div>
                  )}

                  {/* Contextual Life-Saving Actions */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenEmergency({
                          bloodGroup: selectedBloodGroup === 'ALL' ? 'O-' : selectedBloodGroup,
                          hospitalId: selectedVault.hospital.id,
                          component:
                            selectedComponent === 'ALL' ? 'Packed Red Cells' : selectedComponent,
                        })
                      }
                      className="w-full py-2.5 px-4 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Request Emergency Units From This Vault</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenBooking({
                            bloodGroup:
                              selectedBloodGroup === 'ALL' ? undefined : selectedBloodGroup,
                            hospitalId: selectedVault.hospital.id,
                            city: selectedVault.hospital.city,
                          })
                        }
                        className="py-2 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-900 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5 text-slate-600" />
                        <span>Book Slot Here</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyVaultAppeal(selectedVault)}
                        className="py-2 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-900 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {copiedAppeal ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                            <span className="text-emerald-700">SOS Copied</span>
                          </>
                        ) : (
                          <>
                            <MessageSquareShare className="w-3.5 h-3.5 text-rose-700" />
                            <span>Copy SOS Card</span>
                          </>
                        )}
                      </button>
                    </div>

                    <a
                      href={buildWhatsAppShareUrl(
                        buildFamilySosAppeal({
                          bloodGroup: selectedBloodGroup === 'ALL' ? 'O-' : selectedBloodGroup,
                          unitsNeeded: 2,
                          component:
                            selectedComponent === 'ALL' ? 'Packed Red Cells' : selectedComponent,
                          hospitalName: selectedVault.hospital.name,
                          hospitalPhone: selectedVault.hospital.phone,
                          hospitalCity: selectedVault.hospital.city,
                        })
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                    >
                      <MessageSquareShare className="w-3.5 h-3.5" />
                      <span>Share Vault Contact on WhatsApp</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Tactile Camp Inspector Slide-Over Drawer */}
            {selectedCamp && (
              <div
                role="region"
                aria-label="Selected donation camp details"
                className="absolute right-3 bottom-12 sm:bottom-3 z-30 w-[calc(100%-1.5rem)] sm:w-[370px] bg-white border border-slate-300 rounded-xl shadow-xl"
              >
                <div className="px-4 py-3.5 border-b border-slate-200 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono text-rose-700 font-semibold">
                      {selectedCamp.camp.campCode} · {selectedCamp.camp.date}
                    </div>
                    <h3 className="text-base font-display font-bold text-slate-950 mt-0.5">
                      {selectedCamp.camp.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{selectedCamp.camp.organizer}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCampId(null)}
                    aria-label="Close camp inspector"
                    className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-3.5 text-xs">
                  <div className="text-slate-600 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      {selectedCamp.camp.location}, {selectedCamp.camp.city}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border border-slate-200 rounded-lg p-3 bg-[#F8FAFC]">
                    <div>
                      <div className="text-[10px] text-slate-500">Schedule</div>
                      <div className="font-mono font-semibold text-slate-950 mt-0.5 tabular-data">
                        {selectedCamp.camp.startTime} – {selectedCamp.camp.endTime}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Open Slots</div>
                      <div className="font-mono font-bold text-rose-700 mt-0.5 tabular-data">
                        {selectedCamp.remainingSlots} / {selectedCamp.camp.capacity}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span>Coordinator: {selectedCamp.camp.contactPerson}</span>
                    <span className="font-mono font-semibold tabular-data">
                      {selectedCamp.camp.contactPhone}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectCamp(selectedCamp.camp)}
                    className="w-full py-2.5 px-4 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Reserve Donation Camp Slot
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
