import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  MapPin,
  Building2,
  Phone,
  AlertTriangle,
  ArrowRight,
  Calendar,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Copy,
  Check
} from 'lucide-react';
import {
  BloodGroup,
  BloodComponent,
  BloodSearchIntent,
  EmergencyPrefill,
  BookingPrefill
} from '../types';
import { db } from '../db/databaseStore';
import { useDatabaseSubscription } from '../hooks/useDatabaseSubscription';

interface FindBloodViewProps {
  initialIntent?: BloodSearchIntent | null;
  onOpenEmergency: (prefill?: EmergencyPrefill) => void;
  onOpenBooking: (prefill?: BookingPrefill) => void;
  onNavigateHospital: () => void;
  onNavigateCompatibility?: () => void;
}

const BLOOD_GROUPS: BloodGroup[] = ['O-', 'O+', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const COMPONENTS: BloodComponent[] = [
  'Packed Red Cells',
  'Whole Blood',
  'Platelets',
  'Fresh Frozen Plasma',
  'Cryoprecipitate'
];

export default function FindBloodView({
  initialIntent,
  onOpenEmergency,
  onOpenBooking,
  onNavigateHospital,
  onNavigateCompatibility
}: FindBloodViewProps) {
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup>(initialIntent?.bloodGroup || 'O+');
  const [selectedComponent, setSelectedComponent] = useState<BloodComponent>(
    initialIntent?.component || 'Packed Red Cells'
  );
  const [selectedCity, setSelectedCity] = useState<string>(initialIntent?.city || 'ALL');
  const [searchHospital, setSearchHospital] = useState('');
  const [copiedPhoneId, setCopiedPhoneId] = useState<number | null>(null);

  // Hydrate filters whenever a new cross-page search intent arrives
  useEffect(() => {
    if (!initialIntent) return;
    if (initialIntent.bloodGroup) setSelectedGroup(initialIntent.bloodGroup);
    if (initialIntent.city) setSelectedCity(initialIntent.city);
    if (initialIntent.component) setSelectedComponent(initialIntent.component);
  }, [initialIntent]);

  const storeRevision = useDatabaseSubscription();
  const allBloodUnits = useMemo(() => db.getBloodUnits(), [storeRevision]);
  const hospitals = useMemo(() => db.getHospitals(), [storeRevision]);

  const cities = useMemo(() => {
    return ['ALL', ...Array.from(new Set(hospitals.map(h => h.city)))];
  }, [hospitals]);

  // Live stock for selected blood group and component
  const liveUnits = useMemo(() => {
    return allBloodUnits.filter(
      u => u.status === 'Available' && u.bloodGroup === selectedGroup && u.component === selectedComponent
    );
  }, [allBloodUnits, selectedGroup, selectedComponent]);

  // All component totals for selected blood group
  const componentSummary = useMemo(() => {
    return COMPONENTS.map(comp => ({
      component: comp,
      count: allBloodUnits.filter(
        u => u.status === 'Available' && u.bloodGroup === selectedGroup && u.component === comp
      ).length
    }));
  }, [allBloodUnits, selectedGroup]);

  const filteredHospitals = useMemo(() => {
    return hospitals.filter(h => {
      const matchCity = selectedCity === 'ALL' || h.city === selectedCity;
      const q = searchHospital.trim().toLowerCase();
      const matchSearch =
        !q ||
        h.name.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        h.city.toLowerCase().includes(q);
      return matchCity && matchSearch;
    });
  }, [hospitals, selectedCity, searchHospital]);

  const compatibility = useMemo(() => {
    const map: Record<BloodGroup, { canReceiveFrom: string[]; canDonateTo: string[]; note: string }> = {
      'O-': {
        canReceiveFrom: ['O-'],
        canDonateTo: ['All Blood Groups (Universal RBC Donor)'],
        note: 'Universal red cell donor for uncrossmatched emergency trauma.'
      },
      'O+': {
        canReceiveFrom: ['O+', 'O-'],
        canDonateTo: ['O+', 'A+', 'B+', 'AB+'],
        note: 'High-demand red cell group compatible with all Rh-positive patients.'
      },
      'A-': {
        canReceiveFrom: ['A-', 'O-'],
        canDonateTo: ['A-', 'A+', 'AB-', 'AB+'],
        note: 'Compatible with A and AB recipients regardless of Rh factor.'
      },
      'A+': {
        canReceiveFrom: ['A+', 'A-', 'O+', 'O-'],
        canDonateTo: ['A+', 'AB+'],
        note: 'Frequently transfused in surgical and cardiac procedures.'
      },
      'B-': {
        canReceiveFrom: ['B-', 'O-'],
        canDonateTo: ['B-', 'B+', 'AB-', 'AB+'],
        note: 'Rare negative type; reserve levels are prioritized across vaults.'
      },
      'B+': {
        canReceiveFrom: ['B+', 'B-', 'O+', 'O-'],
        canDonateTo: ['B+', 'AB+'],
        note: 'Vital for chronic thalassemia and surgical transfusion needs.'
      },
      'AB-': {
        canReceiveFrom: ['AB-', 'A-', 'B-', 'O-'],
        canDonateTo: ['AB-', 'AB+'],
        note: 'Universal plasma donor; rarest red cell type.'
      },
      'AB+': {
        canReceiveFrom: ['All Blood Groups (Universal RBC Recipient)'],
        canDonateTo: ['AB+'],
        note: 'Can safely receive red blood cells from any ABO/Rh donor.'
      }
    };
    return map[selectedGroup];
  }, [selectedGroup]);

  // Real-time compatible substitute unit counts for the active component
  const compatibleSubstituteStock = useMemo(() => {
    const compatDonorGroups: BloodGroup[] =
      selectedGroup === 'AB+'
        ? BLOOD_GROUPS
        : (compatibility.canReceiveFrom.filter(bg => BLOOD_GROUPS.includes(bg as BloodGroup)) as BloodGroup[]);

    return compatDonorGroups.map(bg => ({
      bloodGroup: bg,
      isExact: bg === selectedGroup,
      units: allBloodUnits.filter(
        u => u.status === 'Available' && u.bloodGroup === bg && u.component === selectedComponent
      ).length
    }));
  }, [allBloodUnits, selectedGroup, selectedComponent, compatibility.canReceiveFrom]);

  const totalCompatibleUnits = useMemo(
    () => compatibleSubstituteStock.reduce((sum, item) => sum + item.units, 0),
    [compatibleSubstituteStock]
  );

  const stockLevel =
    liveUnits.length >= 4 ? 'Adequate' : liveUnits.length >= 2 ? 'Low Reserve' : 'Critical';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-rose-700 mb-1">Real-Time Cold-Chain Inventory</p>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
            Find Verified Blood Stock
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Inspect NAT-tested units by blood group, clinical component, and regional hospital vault.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              onOpenBooking({
                bloodGroup: selectedGroup,
                city: selectedCity !== 'ALL' ? selectedCity : undefined
              })
            }
            className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Calendar className="w-3.5 h-3.5 text-rose-700" />
            <span>Donate {selectedGroup}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onOpenEmergency({
                bloodGroup: selectedGroup,
                component: selectedComponent
              })
            }
            className="px-4 py-2.5 rounded-lg bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Request Urgent {selectedGroup}</span>
          </button>
        </div>
      </div>

      {/* Filter & Component Control Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-end">
          {/* Blood Group Selector */}
          <div className="lg:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-2">Blood Group</label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {BLOOD_GROUPS.map(bg => (
                <button
                  key={bg}
                  type="button"
                  onClick={() => setSelectedGroup(bg)}
                  className={`py-2 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    selectedGroup === bg
                      ? 'bg-rose-700 text-white'
                      : 'bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {bg}
                </button>
              ))}
            </div>
          </div>

          {/* Component Selector */}
          <div className="lg:col-span-4">
            <label htmlFor="find-blood-component" className="block text-xs font-semibold text-slate-700 mb-2">
              Blood Component
            </label>
            <select
              id="find-blood-component"
              value={selectedComponent}
              onChange={e => setSelectedComponent(e.target.value as BloodComponent)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 bg-white"
            >
              {COMPONENTS.map(comp => (
                <option key={comp} value={comp}>
                  {comp}
                </option>
              ))}
            </select>
          </div>

          {/* City Selector */}
          <div className="lg:col-span-3">
            <label htmlFor="find-blood-city" className="block text-xs font-semibold text-slate-700 mb-2">
              City / Vault Region
            </label>
            <select
              id="find-blood-city"
              value={selectedCity}
              onChange={e => setSelectedCity(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 bg-white"
            >
              {cities.map(city => (
                <option key={city} value={city}>
                  {city === 'ALL' ? 'All Regional Hubs' : city}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Component Breakdown Strip for Selected Blood Group */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {componentSummary.map(item => {
            const active = item.component === selectedComponent;
            return (
              <button
                key={item.component}
                type="button"
                onClick={() => setSelectedComponent(item.component)}
                className={`text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className={`text-[11px] truncate ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                  {item.component}
                </div>
                <div className="text-base font-mono font-bold tabular-data mt-0.5">
                  {item.count} <span className={`text-[11px] font-sans font-normal ${active ? 'text-slate-300' : 'text-slate-500'}`}>units</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Result Summary & Compatibility Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Stock Ledger (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500">
                Verified Cold-Chain Stock · {selectedGroup} · {selectedComponent}
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-3xl font-display font-bold font-mono text-slate-950 tabular-data">
                  {liveUnits.length}
                </span>
                <span className="text-sm text-slate-600">NAT-tested units ready for release</span>
              </div>
            </div>

            <div className="text-right">
              <span
                className={`text-xs font-semibold ${
                  stockLevel === 'Adequate'
                    ? 'text-emerald-700'
                    : stockLevel === 'Low Reserve'
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}
              >
                {stockLevel}
              </span>
              <p className="text-xs text-slate-400 mt-0.5">2°C–6°C Monitored</p>
            </div>
          </div>

          {liveUnits.length > 0 ? (
            <div className="overflow-x-auto border-t border-slate-200 pt-3">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="py-2.5 pr-4 font-medium">Unit Code</th>
                    <th className="py-2.5 pr-4 font-medium">Volume</th>
                    <th className="py-2.5 pr-4 font-medium">Cold Vault</th>
                    <th className="py-2.5 pr-4 font-medium">Expiry Date</th>
                    <th className="py-2.5 font-medium text-right">Screening</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liveUnits.slice(0, 8).map(unit => (
                    <tr key={unit.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-4 font-mono font-semibold text-slate-900 tabular-data">
                        {unit.unitCode}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-slate-600 tabular-data">
                        {unit.volumeMl} mL
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700">{unit.storageLocation}</td>
                      <td className="py-2.5 pr-4 font-mono text-slate-600 tabular-data">
                        {unit.expiryDate}
                      </td>
                      <td className="py-2.5 text-right font-medium text-emerald-700">
                        {unit.testingStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-3">
              <AlertTriangle className="w-6 h-6 text-rose-700 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  No direct {selectedGroup} {selectedComponent} units currently in central stock
                </p>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Dispatch an emergency request to activate inter-hospital transfer or mobilize verified compatible donors ({compatibility.canReceiveFrom.join(', ')}).
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onOpenEmergency({
                      bloodGroup: selectedGroup,
                      component: selectedComponent
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 transition-colors cursor-pointer"
                >
                  Trigger Inter-Hospital Dispatch
                </button>
                <button
                  type="button"
                  onClick={() => onOpenBooking({ bloodGroup: selectedGroup })}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Book {selectedGroup} Donation
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Compatibility & Fast Action Panel (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500">Clinical Cross-Match Reference</p>
              <h2 className="text-lg font-display font-bold text-slate-950 mt-0.5">
                {selectedGroup} Compatibility Guide
              </h2>
            </div>

            <div className="space-y-3 text-xs border-t border-slate-100 pt-4">
              <div>
                <span className="text-slate-500 block mb-1">Compatible Donor Types (Can Receive From)</span>
                <div className="font-mono font-semibold text-slate-900">
                  {compatibility.canReceiveFrom.join(' · ')}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-500 block mb-1">Compatible Recipients (Can Donate To)</span>
                <div className="font-mono font-semibold text-emerald-700">
                  {compatibility.canDonateTo.join(' · ')}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Live Compatible Units ({selectedComponent})</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-data">
                    {totalCompatibleUnits} total
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {compatibleSubstituteStock.map(item => (
                    <button
                      key={item.bloodGroup}
                      type="button"
                      onClick={() => setSelectedGroup(item.bloodGroup)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                        item.isExact
                          ? 'bg-rose-700 text-white font-semibold'
                          : item.units > 0
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 font-semibold'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={`Switch view to ${item.bloodGroup} (${item.units} units available)`}
                    >
                      {item.bloodGroup}: {item.units}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-slate-600 pt-2 border-t border-slate-100 leading-relaxed">
                {compatibility.note}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-col gap-2">
            {onNavigateCompatibility && (
              <button
                type="button"
                onClick={onNavigateCompatibility}
                className="w-full py-2.5 px-4 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Open Full ABO/Rh &amp; Plasma Matrix</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onNavigateHospital}
              className="w-full py-2 px-4 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
            >
              Hospital Coordinator? Open Transfusion Desk
            </button>
          </div>
        </div>
      </div>

      {/* Accredited Regional Hospital Blood Vaults */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-950">
              Partner Hospital Blood Vaults
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {filteredHospitals.length} verified facilities · Request urgent dispatch or book a direct donation slot
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchHospital}
                onChange={e => setSearchHospital(e.target.value)}
                placeholder="Search hospital or locality..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
              />
            </div>
            {(selectedCity !== 'ALL' || searchHospital) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCity('ALL');
                  setSearchHospital('');
                }}
                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 cursor-pointer"
                title="Reset location filters"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {filteredHospitals.length > 0 ? (
          <div className="divide-y divide-slate-200 border-t border-slate-200">
            {filteredHospitals.map(hosp => (
              <div
                key={hosp.id}
                className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-semibold text-slate-950">{hosp.name}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs font-mono text-slate-500">{hosp.hospitalCode}</span>
                    {hosp.verified && (
                      <>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs font-medium text-emerald-700 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified Vault
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pl-6">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {hosp.address}, {hosp.city}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-mono tabular-data">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{hosp.phone}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(hosp.phone).catch(() => {});
                          setCopiedPhoneId(hosp.id);
                          setTimeout(() => setCopiedPhoneId(null), 2000);
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-sans font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                        title={`Copy ${hosp.name} phone number`}
                      >
                        {copiedPhoneId === hosp.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pl-6 lg:pl-0 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenBooking({
                        hospitalId: hosp.id,
                        city: hosp.city,
                        bloodGroup: selectedGroup
                      })
                    }
                    className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Book Donation Here
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenEmergency({
                        hospitalId: hosp.id,
                        bloodGroup: selectedGroup,
                        component: selectedComponent
                      })
                    }
                    className="px-3.5 py-2 rounded-lg bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Request {selectedGroup} Urgent
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center border-t border-slate-200 space-y-2">
            <p className="text-sm font-semibold text-slate-900">No partner vaults match your current search.</p>
            <p className="text-xs text-slate-500">Try clearing the city filter or searching another locality.</p>
            <button
              type="button"
              onClick={() => {
                setSelectedCity('ALL');
                setSearchHospital('');
              }}
              className="mt-2 px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              Show All Regional Hubs
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
