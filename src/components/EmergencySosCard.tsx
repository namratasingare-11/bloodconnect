import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Copy,
  Languages,
  Loader2,
  PhoneCall,
  Share2,
  Square,
  Truck,
  ArrowRight,
  MessageSquareShare,
  Volume2,
} from 'lucide-react';
import { BloodComponent, BloodGroup, BookingPrefill, EmergencyPrefill } from '../types';
import {
  COMPATIBLE_DONOR_GROUPS,
  HospitalVaultSnapshot,
  buildFamilySosAppeal,
  buildWhatsAppShareUrl,
} from '../utils/regionalVaults';
import {
  SosAppealLanguage,
  draftMultilingualSosAppeal,
  playBase64WavAudio,
  synthesizeClinicalSpeech,
} from '../services/aiApi';

interface EmergencySosCardProps {
  selectedBloodGroup: BloodGroup | 'ALL';
  activeVault: HospitalVaultSnapshot | null;
  totalMatchingUnits: number;
  stockedVaultCount: number;
  onOpenEmergency: (prefill?: EmergencyPrefill) => void;
  onOpenBooking: (prefill?: BookingPrefill) => void;
  onOpenTracker?: () => void;
  onSelectBloodGroup: (group: BloodGroup | 'ALL') => void;
}

export default function EmergencySosCard({
  selectedBloodGroup,
  activeVault,
  totalMatchingUnits,
  stockedVaultCount,
  onOpenEmergency,
  onOpenBooking,
  onOpenTracker,
  onSelectBloodGroup,
}: EmergencySosCardProps) {
  const [activeTab, setActiveTab] = useState<'dispatch' | 'appeal'>('dispatch');
  const [appealBloodGroup, setAppealBloodGroup] = useState<BloodGroup>(
    selectedBloodGroup === 'ALL' ? 'O-' : selectedBloodGroup
  );
  const [appealUnits, setAppealUnits] = useState<number>(2);
  const [appealComponent, setAppealComponent] = useState<BloodComponent>('Packed Red Cells');
  const [patientName, setPatientName] = useState('');
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedAppeal, setCopiedAppeal] = useState(false);

  const [appealLanguage, setAppealLanguage] = useState<SosAppealLanguage>('English');
  const [aiAppealText, setAiAppealText] = useState<string | null>(null);
  const [draftingAppeal, setDraftingAppeal] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [isSpeakingAppeal, setIsSpeakingAppeal] = useState(false);
  const appealAudioRef = useRef<{ audio: HTMLAudioElement; revoke: () => void } | null>(null);

  const effectiveBloodGroup: BloodGroup =
    selectedBloodGroup === 'ALL' ? appealBloodGroup : selectedBloodGroup;

  const compatibleSubstitutes = useMemo(
    () => COMPATIBLE_DONOR_GROUPS[effectiveBloodGroup].filter((g) => g !== effectiveBloodGroup),
    [effectiveBloodGroup]
  );

  const baseAppealText = useMemo(
    () =>
      buildFamilySosAppeal({
        bloodGroup: effectiveBloodGroup,
        unitsNeeded: appealUnits,
        component: appealComponent,
        patientName,
        hospitalName: activeVault?.hospital.name,
        hospitalPhone: activeVault?.hospital.phone,
        hospitalCity: activeVault?.hospital.city,
      }),
    [effectiveBloodGroup, appealUnits, appealComponent, patientName, activeVault]
  );

  const appealText = aiAppealText || baseAppealText;

  // Reset AI-drafted copy when core clinical inputs change so numbers stay accurate
  useEffect(() => {
    setAiAppealText(null);
    setAppealError(null);
  }, [effectiveBloodGroup, appealUnits, appealComponent, patientName, activeVault?.hospital.id]);

  useEffect(() => {
    return () => {
      if (appealAudioRef.current) {
        appealAudioRef.current.audio.pause();
        appealAudioRef.current.revoke();
      }
    };
  }, []);

  const handleDraftLanguageAppeal = async (lang: SosAppealLanguage) => {
    setAppealLanguage(lang);
    setAppealError(null);
    setDraftingAppeal(true);
    try {
      const result = await draftMultilingualSosAppeal({
        mode: 'family_sos',
        language: lang,
        bloodGroup: effectiveBloodGroup,
        unitsNeeded: appealUnits,
        component: appealComponent,
        compatibleSubstitutes,
        patientName: patientName.trim() || undefined,
        hospitalName: activeVault?.hospital.name,
        hospitalPhone: activeVault?.hospital.phone,
        hospitalCity: activeVault?.hospital.city,
      });
      setAiAppealText(result.appealText);
    } catch (err) {
      setAppealError(
        err instanceof Error ? err.message : 'Unable to generate localized appeal right now.'
      );
    } finally {
      setDraftingAppeal(false);
    }
  };

  const handleToggleSpeakAppeal = async () => {
    if (isSpeakingAppeal) {
      if (appealAudioRef.current) {
        appealAudioRef.current.audio.pause();
        appealAudioRef.current.revoke();
        appealAudioRef.current = null;
      }
      setIsSpeakingAppeal(false);
      return;
    }

    setAppealError(null);
    setIsSpeakingAppeal(true);
    try {
      const { audioBase64, mimeType } = await synthesizeClinicalSpeech(appealText, 'emergency');
      const player = playBase64WavAudio(audioBase64, mimeType);
      appealAudioRef.current = player;
      player.audio.onended = () => {
        player.revoke();
        appealAudioRef.current = null;
        setIsSpeakingAppeal(false);
      };
      player.audio.onerror = () => {
        player.revoke();
        appealAudioRef.current = null;
        setIsSpeakingAppeal(false);
      };
      await player.audio.play();
    } catch (err) {
      setIsSpeakingAppeal(false);
      setAppealError(err instanceof Error ? err.message : 'Unable to synthesize voice playback.');
    }
  };

  const handleCopyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 1800);
    } catch {
      // Clipboard blocked in restricted iframe
    }
  };

  const handleCopyAppeal = async () => {
    try {
      await navigator.clipboard.writeText(appealText);
      setCopiedAppeal(true);
      setTimeout(() => setCopiedAppeal(false), 2000);
    } catch {
      // Clipboard blocked in restricted iframe
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl flex flex-col justify-between overflow-hidden h-full">
      {/* Top Swiss Header Strip with Tactile Mode Switcher */}
      <div>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-rose-700 font-semibold">
              1-Tap Emergency Desk
            </div>
            <h2 className="text-base font-display font-bold text-slate-950 mt-0.5">
              Rapid Dispatch &amp; Family SOS
            </h2>
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('dispatch')}
              className={`px-2.5 py-1 rounded-xs transition-colors cursor-pointer ${
                activeTab === 'dispatch'
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Dispatch
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('appeal')}
              className={`px-2.5 py-1 rounded-xs transition-colors cursor-pointer ${
                activeTab === 'appeal'
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              SOS Card
            </button>
          </div>
        </div>

        {activeTab === 'dispatch' ? (
          <div className="p-5 space-y-5">
            {/* Live Synchronized Metric Grid */}
            <div className="grid grid-cols-2 border border-slate-200 rounded-lg divide-x divide-slate-200 bg-[#F8FAFC]">
              <div className="p-3.5">
                <div className="text-[11px] text-slate-500 font-medium">
                  {selectedBloodGroup === 'ALL' ? 'Regional Ready Stock' : `${selectedBloodGroup} Ready Now`}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-display font-bold font-mono text-slate-950 tabular-data">
                    {totalMatchingUnits}
                  </span>
                  <span className="text-xs text-slate-500">units</span>
                </div>
              </div>
              <div className="p-3.5">
                <div className="text-[11px] text-slate-500 font-medium">Vaults Holding Match</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-display font-bold font-mono text-slate-950 tabular-data">
                    {stockedVaultCount}
                  </span>
                  <span className="text-xs text-slate-500">/ 10 hubs</span>
                </div>
              </div>
            </div>

            {/* Active Selected / Nearest Stocked Vault Summary */}
            {activeVault && (
              <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-slate-500">
                      {activeVault.hospital.hospitalCode} · {activeVault.zone}
                    </div>
                    <div className="text-sm font-display font-bold text-slate-950 truncate mt-0.5">
                      {activeVault.hospital.name}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-bold text-slate-950 tabular-data">
                      {activeVault.directUnits} u
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 tabular-data">
                      {activeVault.coldChainTempC.toFixed(1)}°C vault
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700 font-mono tabular-data min-w-0 truncate">
                    <PhoneCall className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                    <span className="truncate">{activeVault.hospital.phone}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPhone(activeVault.hospital.phone)}
                    className="text-[11px] font-semibold text-slate-700 hover:text-slate-950 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedPhone ? (
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
                </div>
              </div>
            )}

            {/* Compatible Substitutes Hint (when specific blood group chosen) */}
            <div className="text-xs text-slate-600 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-slate-500">
                {selectedBloodGroup === 'ALL'
                  ? 'Tap any group on radar to filter'
                  : `Compatible RBC substitutes for ${selectedBloodGroup}`}
              </span>
              {selectedBloodGroup !== 'ALL' ? (
                <span className="font-mono font-semibold text-slate-900">
                  {compatibleSubstitutes.length > 0 ? compatibleSubstitutes.join(' · ') : 'O- Only'}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectBloodGroup('O-')}
                  className="font-mono font-semibold text-rose-700 hover:underline cursor-pointer"
                >
                  Check O-
                </button>
              )}
            </div>

            {/* Primary 1-Tap Emergency Dispatch Action */}
            <div className="space-y-2.5 pt-1">
              <button
                id="hero-sos-dispatch-btn"
                type="button"
                onClick={() =>
                  onOpenEmergency({
                    bloodGroup: selectedBloodGroup === 'ALL' ? 'O-' : selectedBloodGroup,
                    hospitalId: activeVault?.hospital.id,
                    component: 'Packed Red Cells',
                  })
                }
                className="w-full py-3 px-4 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <AlertCircle className="w-4 h-4" />
                <span>
                  1-Tap Emergency Dispatch
                  {selectedBloodGroup !== 'ALL' ? ` (${selectedBloodGroup})` : ''}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('appeal')}
                  className="py-2.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-900 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-rose-700" />
                  <span>Family SOS Card</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onOpenBooking({
                      bloodGroup: selectedBloodGroup === 'ALL' ? undefined : selectedBloodGroup,
                      hospitalId: activeVault?.hospital.id,
                    })
                  }
                  className="py-2.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-900 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  <span>Book 15m Slot</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 1-Tap Family SOS Appeal Card Generator */
          <div className="p-5 space-y-3.5">
            <p className="text-xs text-slate-600 leading-relaxed">
              Generate a clinically accurate emergency blood appeal with compatible substitute types and verified vault phone for WhatsApp or family groups.
            </p>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label
                  htmlFor="sos-blood-group"
                  className="block text-[11px] font-medium text-slate-500 mb-1"
                >
                  Group
                </label>
                <select
                  id="sos-blood-group"
                  value={effectiveBloodGroup}
                  onChange={(e) => {
                    const bg = e.target.value as BloodGroup;
                    setAppealBloodGroup(bg);
                    onSelectBloodGroup(bg);
                  }}
                  className="w-full px-2.5 py-2 rounded-md border border-slate-300 bg-white text-xs font-mono font-bold text-slate-950 focus:outline-none focus:border-slate-950"
                >
                  {(['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as BloodGroup[]).map(
                    (bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="sos-units"
                  className="block text-[11px] font-medium text-slate-500 mb-1"
                >
                  Units
                </label>
                <select
                  id="sos-units"
                  value={appealUnits}
                  onChange={(e) => setAppealUnits(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-md border border-slate-300 bg-white text-xs font-mono font-bold text-slate-950 focus:outline-none focus:border-slate-950"
                >
                  {[1, 2, 3, 4, 6].map((u) => (
                    <option key={u} value={u}>
                      {u} {u === 1 ? 'Unit' : 'Units'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="sos-component"
                  className="block text-[11px] font-medium text-slate-500 mb-1"
                >
                  Component
                </label>
                <select
                  id="sos-component"
                  value={appealComponent}
                  onChange={(e) => setAppealComponent(e.target.value as BloodComponent)}
                  className="w-full px-2 py-2 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-950 focus:outline-none focus:border-slate-950"
                >
                  <option value="Packed Red Cells">PRBC</option>
                  <option value="Whole Blood">Whole Blood</option>
                  <option value="Platelets">Platelets</option>
                  <option value="Fresh Frozen Plasma">Plasma</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="sos-patient-name"
                className="block text-[11px] font-medium text-slate-500 mb-1"
              >
                Patient Name or ICU Ward (Optional)
              </label>
              <input
                id="sos-patient-name"
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g., Ward 4B · Emergency Trauma"
                className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-950"
              />
            </div>

            {/* AI Multilingual SOS Language Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-slate-600 inline-flex items-center gap-1">
                  <Languages className="w-3.5 h-3.5 text-rose-700" />
                  <span>AI Language Draft</span>
                </span>
                <button
                  type="button"
                  onClick={handleToggleSpeakAppeal}
                  disabled={draftingAppeal}
                  className="text-[11px] font-semibold text-slate-700 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {isSpeakingAppeal ? (
                    <>
                      <Square className="w-2.5 h-2.5 fill-current text-rose-700" />
                      <span>Stop Audio</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-rose-700" />
                      <span>Listen Aloud</span>
                    </>
                  )}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                {(
                  [
                    { id: 'English', label: 'English' },
                    { id: 'Hindi', label: 'हिन्दी' },
                    { id: 'Marathi', label: 'मराठी' },
                    { id: 'Hinglish', label: 'Hinglish' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={draftingAppeal}
                    onClick={() => handleDraftLanguageAppeal(item.id)}
                    className={`py-1 px-1.5 rounded-xs text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                      appealLanguage === item.id && aiAppealText
                        ? 'bg-slate-950 text-white'
                        : 'text-slate-700 hover:bg-white hover:text-slate-950'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {appealError && (
              <div className="px-2.5 py-1.5 rounded-md bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                {appealError}
              </div>
            )}

            <div className="relative">
              <pre className="p-3 rounded-lg bg-[#F8FAFC] border border-slate-200 text-[11px] font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                {draftingAppeal ? 'Drafting verified emergency appeal...' : appealText}
              </pre>
              {draftingAppeal && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-700 absolute top-2.5 right-2.5" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyAppeal}
                disabled={draftingAppeal}
                className="py-2.5 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedAppeal ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Appeal Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SOS Text</span>
                  </>
                )}
              </button>

              <a
                href={buildWhatsAppShareUrl(appealText)}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <MessageSquareShare className="w-3.5 h-3.5" />
                <span>WhatsApp Share</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Quiet Utility Footer */}
      <div className="px-5 py-3 bg-[#F8FAFC] border-t border-slate-200 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-500 font-mono tabular-data">
          24/7 Desk · <strong className="text-slate-900">1800-11-9999</strong>
        </span>
        {onOpenTracker && (
          <button
            type="button"
            onClick={onOpenTracker}
            className="font-semibold text-slate-800 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5 text-slate-500" />
            <span>Track REQ</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
