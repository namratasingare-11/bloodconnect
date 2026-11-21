import { useState, useMemo } from 'react';
import {
  Droplet,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Search,
  Layers,
  ThermometerSnowflake,
  CalendarCheck2
} from 'lucide-react';
import { BloodGroup, BloodSearchIntent, EmergencyPrefill, BookingPrefill } from '../types';
import { db } from '../db/databaseStore';
import { useDatabaseSubscription } from '../hooks/useDatabaseSubscription';

interface BloodCompatibilityMatrixProps {
  onOpenEmergency?: (prefill?: EmergencyPrefill) => void;
  onNavigateBlood?: (intent?: BloodSearchIntent) => void;
  onOpenBooking?: (prefill?: BookingPrefill) => void;
}

type ComponentCategory = 'red_cells' | 'plasma' | 'platelets';

interface CompatibilityRule {
  canReceiveFrom: BloodGroup[];
  canDonateTo: BloodGroup[];
  isUniversalDonor?: boolean;
  isUniversalRecipient?: boolean;
  clinicalNote: string;
}

const RED_CELL_RULES: Record<BloodGroup, CompatibilityRule> = {
  'O-': {
    canReceiveFrom: ['O-'],
    canDonateTo: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
    isUniversalDonor: true,
    clinicalNote: 'Universal Red Cell Donor. Critical for trauma resuscitations before patient ABO typing is confirmed.'
  },
  'O+': {
    canReceiveFrom: ['O-', 'O+'],
    canDonateTo: ['O+', 'A+', 'B+', 'AB+'],
    clinicalNote: 'Can donate to any Rh-positive patient. Most frequently transfused red cell type in routine surgery.'
  },
  'A-': {
    canReceiveFrom: ['O-', 'A-'],
    canDonateTo: ['A-', 'A+', 'AB-', 'AB+'],
    clinicalNote: 'Carries A antigen without Rh-D factor. Safe for all A and AB recipients.'
  },
  'A+': {
    canReceiveFrom: ['O-', 'O+', 'A-', 'A+'],
    canDonateTo: ['A+', 'AB+'],
    clinicalNote: 'Second most common group. Safe for A+ and AB+ recipients with positive Rh-D factor.'
  },
  'B-': {
    canReceiveFrom: ['O-', 'B-'],
    canDonateTo: ['B-', 'B+', 'AB-', 'AB+'],
    clinicalNote: 'Carries B antigen without Rh factor. Can only receive from O- and B-.'
  },
  'B+': {
    canReceiveFrom: ['O-', 'O+', 'B-', 'B+'],
    canDonateTo: ['B+', 'AB+'],
    clinicalNote: 'Safe for B+ and AB+ recipients. High demand in regional thalassemia support protocols.'
  },
  'AB-': {
    canReceiveFrom: ['O-', 'A-', 'B-', 'AB-'],
    canDonateTo: ['AB-', 'AB+'],
    clinicalNote: 'Rare red cell type (<1% of population). Can receive from all Rh-negative donor groups.'
  },
  'AB+': {
    canReceiveFrom: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
    canDonateTo: ['AB+'],
    isUniversalRecipient: true,
    clinicalNote: 'Universal Red Cell Recipient. Has neither Anti-A nor Anti-B antibodies and carries Rh-D.'
  }
};

const PLASMA_RULES: Record<BloodGroup, CompatibilityRule> = {
  'O-': {
    canReceiveFrom: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
    canDonateTo: ['O-', 'O+'],
    isUniversalRecipient: true,
    clinicalNote: 'O plasma contains both Anti-A and Anti-B antibodies; can only be donated to O recipients, while O patients can receive plasma from all groups.'
  },
  'O+': {
    canReceiveFrom: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
    canDonateTo: ['O-', 'O+'],
    isUniversalRecipient: true,
    clinicalNote: 'Rh factor does not affect plasma compatibility. O patients can safely receive plasma from any group.'
  },
  'A-': {
    canReceiveFrom: ['A-', 'A+', 'AB-', 'AB+'],
    canDonateTo: ['A-', 'A+', 'O-', 'O+'],
    clinicalNote: 'A plasma contains Anti-B antibody. Safe for A and O recipients.'
  },
  'A+': {
    canReceiveFrom: ['A-', 'A+', 'AB-', 'AB+'],
    canDonateTo: ['A-', 'A+', 'O-', 'O+'],
    clinicalNote: 'Contains Anti-B antibody. Safe for A and O recipients.'
  },
  'B-': {
    canReceiveFrom: ['B-', 'B+', 'AB-', 'AB+'],
    canDonateTo: ['B-', 'B+', 'O-', 'O+'],
    clinicalNote: 'B plasma contains Anti-A antibody. Safe for B and O recipients.'
  },
  'B+': {
    canReceiveFrom: ['B-', 'B+', 'AB-', 'AB+'],
    canDonateTo: ['B-', 'B+', 'O-', 'O+'],
    clinicalNote: 'Contains Anti-A antibody. Safe for B and O recipients.'
  },
  'AB-': {
    canReceiveFrom: ['AB-', 'AB+'],
    canDonateTo: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
    isUniversalDonor: true,
    clinicalNote: 'Universal Plasma Donor. Plasma has zero Anti-A or Anti-B antibodies, making it vital for emergency burn and coagulopathy resuscitation.'
  },
  'AB+': {
    canReceiveFrom: ['AB-', 'AB+'],
    canDonateTo: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
    isUniversalDonor: true,
    clinicalNote: 'Universal Plasma Donor. Transfusable to all patients regardless of recipient ABO group.'
  }
};

const ALL_BLOOD_GROUPS: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

export default function BloodCompatibilityMatrix({
  onOpenEmergency,
  onNavigateBlood,
  onOpenBooking
}: BloodCompatibilityMatrixProps) {
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup>('O-');
  const [selectedCategory, setSelectedCategory] = useState<ComponentCategory>('red_cells');
  const [perspective, setPerspective] = useState<'receiving' | 'donating'>('receiving');

  const storeRevision = useDatabaseSubscription();

  const liveStock = useMemo(() => {
    const units = db.getBloodUnits().filter(u => u.status === 'Available');
    const counts: Record<string, number> = {};
    ALL_BLOOD_GROUPS.forEach(bg => {
      counts[bg] = 0;
    });
    units.forEach(u => {
      counts[u.bloodGroup] = (counts[u.bloodGroup] || 0) + 1;
    });
    return counts;
  }, [storeRevision]);

  const currentRules = selectedCategory === 'plasma' ? PLASMA_RULES : RED_CELL_RULES;
  const activeRule = currentRules[selectedGroup];

  const compatibleGroups =
    perspective === 'receiving' ? activeRule.canReceiveFrom : activeRule.canDonateTo;

  const mappedComponent =
    selectedCategory === 'plasma'
      ? 'Fresh Frozen Plasma'
      : selectedCategory === 'platelets'
      ? 'Platelets'
      : 'Packed Red Cells';

  const totalCompatibleUnits = compatibleGroups.reduce((acc, bg) => acc + (liveStock[bg] || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Clinical Editorial Header */}
      <div className="pb-6 border-b border-slate-200 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-medium text-rose-700">
            Clinical Transfusion Safety · Cross-Match Reference
          </p>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
            ABO &amp; Rh Compatibility Matrix
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Bi-directional cross-match guidance for Packed Red Blood Cells (PRBC), Fresh Frozen Plasma (FFP), and Platelets, paired with live cold-chain stock counts.
          </p>
        </div>

        <div className="text-xs text-slate-600 space-y-1 lg:text-right">
          <div>
            <strong className="font-semibold text-slate-900">O-</strong> Universal RBC Donor ·{' '}
            <strong className="font-semibold text-slate-900">AB+</strong> Universal RBC Recipient
          </div>
          <div>
            <strong className="font-semibold text-slate-900">AB / AB+</strong> Universal Plasma Donor
          </div>
        </div>
      </div>

      {/* Control Strip */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          {/* Step 1: Component Selection */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-500 block">
              1. Blood Component
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('red_cells')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'red_cells'
                    ? 'bg-rose-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Droplet className="w-3.5 h-3.5" />
                <span>Packed Red Cells (PRBC)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('plasma')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'plasma'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <ThermometerSnowflake className="w-3.5 h-3.5" />
                <span>Fresh Frozen Plasma (FFP)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('platelets')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'platelets'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Platelets (RDP / Apheresis)</span>
              </button>
            </div>
          </div>

          {/* Step 2: Perspective Mode */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-500 block">
              2. Clinical Perspective
            </span>
            <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setPerspective('receiving')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  perspective === 'receiving'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Patient Receiving Blood
              </button>
              <button
                type="button"
                onClick={() => setPerspective('donating')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  perspective === 'donating'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Volunteer Donor Giving
              </button>
            </div>
          </div>
        </div>

        {/* Step 3: Select Blood Group */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              3. Target Blood Group ({perspective === 'receiving' ? 'Patient Group' : 'Donor Group'})
            </span>
            <span className="text-xs text-slate-500">
              Live vault availability shown beneath each type
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
            {ALL_BLOOD_GROUPS.map(bg => {
              const isSelected = selectedGroup === bg;
              const unitsCount = liveStock[bg] || 0;
              return (
                <button
                  key={bg}
                  type="button"
                  onClick={() => setSelectedGroup(bg)}
                  className={`p-3.5 rounded-xl border text-center transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-rose-700 bg-rose-50 text-rose-950 ring-1 ring-rose-700'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-900'
                  }`}
                >
                  <div className="text-xl font-display font-bold tracking-tight">{bg}</div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-data mt-1">
                    {unitsCount} units
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Compatibility Result Display */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Compatibility Grid */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <p className="text-xs font-medium text-rose-700">
                Cross-Match Analysis · {selectedGroup} · {mappedComponent}
              </p>
              <h2 className="text-xl font-display font-bold text-slate-950 mt-0.5">
                {perspective === 'receiving'
                  ? `Safe Donors for ${selectedGroup} Patient`
                  : `Eligible Recipients for ${selectedGroup} Donor`}
              </h2>
            </div>

            {(activeRule.isUniversalDonor || activeRule.isUniversalRecipient) && (
              <span className="text-xs font-semibold text-emerald-700">
                {activeRule.isUniversalDonor ? 'Universal Donor Group' : 'Universal Recipient Group'}
              </span>
            )}
          </div>

          {/* 8-Box Cross-Match Status Board */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ALL_BLOOD_GROUPS.map(bg => {
              const isCompatible = compatibleGroups.includes(bg);
              const isSelectedSelf = bg === selectedGroup;
              const unitsAvailable = liveStock[bg] || 0;

              return (
                <div
                  key={bg}
                  className={`p-4 rounded-xl border transition-colors ${
                    isCompatible
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-display font-bold tracking-tight">{bg}</span>
                    {isCompatible ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    ) : (
                      <XCircle className="w-4 h-4 text-slate-300" />
                    )}
                  </div>

                  <div className="text-xs font-semibold">
                    {isCompatible ? (
                      <span className="text-emerald-800">Compatible</span>
                    ) : (
                      <span className="text-slate-500">Incompatible</span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between tabular-data">
                    <span>In Vault</span>
                    <strong className="font-mono font-semibold text-slate-900">
                      {unitsAvailable} units
                    </strong>
                  </div>

                  {isSelectedSelf && (
                    <div className="mt-2 pt-1.5 border-t border-slate-200/70 text-[11px] font-medium text-slate-600">
                      Selected group
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Clinical Description */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <Info className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Immunological Rationale</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{activeRule.clinicalNote}</p>
          </div>

          {selectedCategory === 'plasma' && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>Plasma Compatibility Inversion</span>
              </div>
              <p className="text-amber-900 leading-relaxed">
                Plasma compatibility is the inverse of red cells. <strong>AB plasma</strong> contains neither anti-A nor anti-B antibodies and is safe for recipients of any ABO group during acute shock or burn management.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Action Desk */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-950">
              Transfusion Summary
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Target Group</span>
                <span className="font-display font-bold text-slate-950 text-sm">{selectedGroup}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Component</span>
                <span className="font-semibold text-slate-900">{mappedComponent}</span>
              </div>

              <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
                <span className="text-slate-500 shrink-0">
                  {perspective === 'receiving' ? 'Compatible Donors' : 'Eligible Recipients'}
                </span>
                <span className="font-semibold text-emerald-700 text-right tabular-data">
                  {compatibleGroups.length} of 8 ({compatibleGroups.join(', ')})
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Live Compatible Stock</span>
                <span className="font-mono font-bold text-rose-700 text-sm tabular-data">
                  {totalCompatibleUnits} units
                </span>
              </div>
            </div>

            <div className="pt-2 space-y-2.5">
              {onOpenEmergency && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenEmergency({
                      bloodGroup: selectedGroup,
                      component: mappedComponent
                    })
                  }
                  className="w-full py-2.5 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Request Urgent {selectedGroup} Blood</span>
                </button>
              )}

              {onNavigateBlood && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigateBlood({
                      bloodGroup: selectedGroup,
                      component: mappedComponent
                    })
                  }
                  className="w-full py-2.5 rounded-lg text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>Inspect {selectedGroup} Stock Across Vaults</span>
                </button>
              )}

              {onOpenBooking && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenBooking({
                      bloodGroup: selectedGroup
                    })
                  }
                  className="w-full py-2.5 rounded-lg text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CalendarCheck2 className="w-4 h-4 text-rose-700" />
                  <span>Book {selectedGroup} Donation Slot</span>
                </button>
              )}
            </div>
          </div>

          {/* Standard Protocol Note */}
          <div className="bg-slate-950 text-white rounded-2xl p-6 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Standard Laboratory Protocol</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Routine transfusions require both major and minor serological cross-match in addition to ABO/Rh typing. In uncrossmatched emergencies, O-Negative PRBCs may be released immediately under medical director authorization.
            </p>
            <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-800">
              Aligned with NBTC &amp; WHO Blood Transfusion Safety standards.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
