import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Droplet,
  AlertCircle,
  CalendarCheck2,
  Truck,
  Stethoscope,
  Building2,
  Calendar,
  ArrowRight,
  X,
  Layers,
  MapPin,
  Sparkles
} from 'lucide-react';
import {
  BloodGroup,
  BloodMapIntent,
  BloodSearchIntent,
  DonationCamp,
  EmergencyPrefill
} from '../types';
import { db } from '../db/databaseStore';
import { BLOOD_GROUPS } from '../config/constants';

interface QuickSearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onSearchBlood: (intent: BloodSearchIntent) => void;
  onOpenBloodMap?: (intent?: BloodMapIntent) => void;
  onOpenAiDesk?: (tab?: 'triage' | 'scanner' | 'coach') => void;
  onOpenEmergency: (prefill?: EmergencyPrefill) => void;
  onOpenBooking: () => void;
  onOpenTracker: () => void;
  onOpenEligibility: () => void;
  onSelectCamp: (camp: DonationCamp) => void;
}

interface PaletteItem {
  id: string;
  category: 'Quick Action' | 'Blood Stock' | 'Partner Hospital' | 'Upcoming Camp';
  title: string;
  subtitle: string;
  keywords: string;
  icon: 'ai' | 'map' | 'emergency' | 'book' | 'tracker' | 'eligibility' | 'matrix' | 'blood' | 'hospital' | 'camp';
  onSelect: () => void;
}

export default function QuickSearchPalette({
  isOpen,
  onClose,
  onNavigate,
  onSearchBlood,
  onOpenBloodMap,
  onOpenAiDesk,
  onOpenEmergency,
  onOpenBooking,
  onOpenTracker,
  onOpenEligibility,
  onSelectCamp
}: QuickSearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 20);
  }, [isOpen]);

  const items: PaletteItem[] = useMemo(() => {
    if (!isOpen) return [];
    const hospitals = db.getHospitals();
    const camps = db.getCamps().filter(c => c.status === 'Upcoming');
    const availability = db.getLiveBloodAvailability();

    const quickActions: PaletteItem[] = [
      {
        id: 'act-ai-triage',
        category: 'Quick Action',
        title: 'AI Clinical Triage & Voice Care Desk',
        subtitle: 'Live inventory-grounded clinical guidance with voice read-aloud',
        keywords: 'ai assistant chat voice triage clinical help',
        icon: 'ai',
        onSelect: () => {
          onClose();
          if (onOpenAiDesk) onOpenAiDesk('triage');
          else onNavigate('ai_care');
        }
      },
      {
        id: 'act-ai-scanner',
        category: 'Quick Action',
        title: 'AI Requisition & Lab Slip Scanner',
        subtitle: 'Upload a blood slip or CBC report to auto-fill emergency dispatch',
        keywords: 'ai scan slip prescription lab cbc report upload vision',
        icon: 'ai',
        onSelect: () => {
          onClose();
          if (onOpenAiDesk) onOpenAiDesk('scanner');
          else onNavigate('ai_care');
        }
      },
      {
        id: 'act-ai-coach',
        category: 'Quick Action',
        title: 'AI Donor Readiness & Iron Meal Coach',
        subtitle: 'Personalized NBTC readiness score, hydration & Indian iron meal plan',
        keywords: 'ai donor coach hemoglobin iron diet meal readiness',
        icon: 'ai',
        onSelect: () => {
          onClose();
          if (onOpenAiDesk) onOpenAiDesk('coach');
          else onNavigate('ai_care');
        }
      },
      {
        id: 'act-blood-map',
        category: 'Quick Action',
        title: 'Open Live Regional Blood Vault Map',
        subtitle: 'Interactive hospital vault pins, donation camps & nearest driving ETA',
        keywords: 'map radar pins nearest vault location directions eta',
        icon: 'map',
        onSelect: () => {
          onClose();
          if (onOpenBloodMap) onOpenBloodMap();
          else onNavigate('blood_map');
        }
      },
      {
        id: 'act-emergency',
        category: 'Quick Action',
        title: 'Dispatch Emergency Blood Request',
        subtitle: 'Priority 1 ICU requisition · 24/7 hotline 1800-11-9999',
        keywords: 'emergency urgent icu trauma dispatch request',
        icon: 'emergency',
        onSelect: () => {
          onClose();
          onOpenEmergency();
        }
      },
      {
        id: 'act-book',
        category: 'Quick Action',
        title: 'Book Direct Donation Slot & Digital Pass',
        subtitle: 'Choose hospital vault, hourly window & export .ics calendar invite',
        keywords: 'book donate appointment slot pass calendar',
        icon: 'book',
        onSelect: () => {
          onClose();
          onOpenBooking();
        }
      },
      {
        id: 'act-tracker',
        category: 'Quick Action',
        title: 'Track Emergency Blood Dispatch',
        subtitle: 'Inspect requisition status, cold-chain spec & ETA',
        keywords: 'track dispatch courier transit status requisition',
        icon: 'tracker',
        onSelect: () => {
          onClose();
          onOpenTracker();
        }
      },
      {
        id: 'act-eligibility',
        category: 'Quick Action',
        title: '60-Second Donor Eligibility & Date Calculator',
        subtitle: 'Check NBTC criteria and calculate next eligible donation date',
        keywords: 'eligibility check hemoglobin weight interval calculator',
        icon: 'eligibility',
        onSelect: () => {
          onClose();
          onOpenEligibility();
        }
      },
      {
        id: 'act-compatibility',
        category: 'Quick Action',
        title: 'ABO & Rh Cross-Match Compatibility Matrix',
        subtitle: 'Bi-directional PRBC, Plasma & Platelet compatibility reference',
        keywords: 'compatibility matrix abo rh plasma platelet crossmatch',
        icon: 'matrix',
        onSelect: () => {
          onClose();
          onNavigate('compatibility');
        }
      }
    ];

    const bloodItems: PaletteItem[] = BLOOD_GROUPS.map((bg: BloodGroup) => {
      const summary = availability.find(a => a.bloodGroup === bg);
      const count = summary?.availableUnits ?? 0;
      return {
        id: `bg-${bg}`,
        category: 'Blood Stock',
        title: `Find ${bg} Verified Blood Stock`,
        subtitle: `${count} units currently available across cold-chain vaults`,
        keywords: `blood ${bg} stock units inventory vault`,
        icon: 'blood',
        onSelect: () => {
          onClose();
          onSearchBlood({ bloodGroup: bg });
        }
      };
    });

    const hospitalItems: PaletteItem[] = hospitals.map(h => ({
      id: `hosp-${h.id}`,
      category: 'Partner Hospital',
      title: h.name,
      subtitle: `${h.city} · ${h.phone} · View live pin on Blood Map`,
      keywords: `hospital vault map pin ${h.name} ${h.city} ${h.hospitalCode}`,
      icon: 'hospital',
      onSelect: () => {
        onClose();
        if (onOpenBloodMap) onOpenBloodMap({ hospitalId: h.id });
        else onSearchBlood({ city: h.city });
      }
    }));

    const campItems: PaletteItem[] = camps.map(c => ({
      id: `camp-${c.id}`,
      category: 'Upcoming Camp',
      title: c.name,
      subtitle: `${c.date} · ${c.city} · ${c.organizer}`,
      keywords: `camp drive ${c.name} ${c.city} ${c.organizer}`,
      icon: 'camp',
      onSelect: () => {
        onClose();
        onSelectCamp(c);
      }
    }));

    return [...quickActions, ...bloodItems, ...hospitalItems, ...campItems];
  }, [isOpen, onClose, onNavigate, onOpenAiDesk, onOpenBloodMap, onOpenBooking, onOpenEligibility, onOpenEmergency, onOpenTracker, onSearchBlood, onSelectCamp]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 10);
    return items
      .filter(
        item =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.keywords.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(prev => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(prev =>
          filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0
        );
      } else if (event.key === 'Enter' && filteredItems[activeIndex]) {
        event.preventDefault();
        filteredItems[activeIndex].onSelect();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, activeIndex, onClose]);

  if (!isOpen) return null;

  const renderIcon = (kind: PaletteItem['icon']) => {
    switch (kind) {
      case 'ai':
        return <Sparkles className="w-4 h-4 text-rose-700" />;
      case 'map':
        return <MapPin className="w-4 h-4 text-rose-700" />;
      case 'emergency':
        return <AlertCircle className="w-4 h-4 text-rose-700" />;
      case 'book':
        return <CalendarCheck2 className="w-4 h-4 text-rose-700" />;
      case 'tracker':
        return <Truck className="w-4 h-4 text-slate-600" />;
      case 'eligibility':
        return <Stethoscope className="w-4 h-4 text-emerald-700" />;
      case 'matrix':
        return <Layers className="w-4 h-4 text-slate-600" />;
      case 'blood':
        return <Droplet className="w-4 h-4 text-rose-700" />;
      case 'hospital':
        return <Building2 className="w-4 h-4 text-slate-600" />;
      case 'camp':
        return <Calendar className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] flex items-start justify-center p-4 pt-16 sm:pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Quick clinical search"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search blood group (O-, AB+), hospital, city, camp, or action..."
            className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick search"
            className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={item.onSelect}
                  className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    isSelected ? 'bg-slate-50' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      {renderIcon(item.icon)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-950 truncate">{item.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400 hidden sm:inline">{item.category}</span>
                    <ArrowRight className={`w-3.5 h-3.5 ${isSelected ? 'text-rose-700' : 'text-slate-300'}`} />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-6 py-10 text-center text-xs text-slate-500">
              No matching blood types, hospitals, camps, or actions for “{query}”.
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>Use ↑ ↓ to navigate · Enter to open · Esc to close</span>
          <span className="font-mono text-slate-400">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
