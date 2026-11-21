import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  FileScan,
  HeartPulse,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Send,
  Square,
  Stethoscope,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  BloodGroup,
  BloodMapIntent,
  BloodSearchIntent,
  BookingPrefill,
  EmergencyPrefill,
} from '../types';
import { BLOOD_GROUPS } from '../config/constants';
import { db } from '../db/databaseStore';
import { useDatabaseSubscription } from '../hooks/useDatabaseSubscription';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { COMPATIBLE_DONOR_GROUPS } from '../utils/regionalVaults';
import {
  AiChatMessage,
  ClinicalSlipAnalysis,
  DonorReadinessPlan,
  analyzeClinicalSlip,
  buildLiveClinicalContext,
  detectBloodGroupsInText,
  generateDonorPlan,
  playBase64WavAudio,
  streamTriageChat,
  synthesizeClinicalSpeech,
} from '../services/aiApi';

interface AiCareDeskViewProps {
  initialTab?: 'triage' | 'scanner' | 'coach';
  onOpenBloodMap: (intent?: BloodMapIntent) => void;
  onSearchBlood: (intent: BloodSearchIntent) => void;
  onOpenEmergency: (prefill?: EmergencyPrefill) => void;
  onOpenBooking: (prefill?: BookingPrefill) => void;
}

const SAMPLE_PROMPTS = [
  'Need 2 units of O- Packed Red Cells urgently near Bandra — what are our fastest options?',
  'Can I donate blood if my hemoglobin is 12.6 g/dL and I had a mild cold 10 days ago?',
  'Why did the ICU doctor ask for Single Donor Platelets instead of Whole Blood?',
  'Which upcoming Mumbai donation camps still have open slots this month?',
];

const SAMPLE_REQUISITION_NOTE =
  'METRO CITY MULTISPECIALTY HOSPITAL · TRAUMA ICU BED 04\nPatient: Arjun K. Menon (Age 48/M)\nLab CBC: Hemoglobin 6.9 g/dL · Platelets 145,000 /uL\nBlood Group: B- (Rh Negative)\nOrder: 2 Units Packed Red Blood Cells (PRBC) — STAT / Emergency Cross-match required immediately for orthopedic trauma surgery.';

export default function AiCareDeskView({
  initialTab = 'triage',
  onOpenBloodMap,
  onSearchBlood,
  onOpenEmergency,
  onOpenBooking,
}: AiCareDeskViewProps) {
  const storeRevision = useDatabaseSubscription();
  const [activeTab, setActiveTab] = useState<'triage' | 'scanner' | 'coach'>(initialTab);

  // Audio Playback State (Shared across tabs)
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const activeAudioRef = useRef<{ audio: HTMLAudioElement; revoke: () => void } | null>(null);

  // Tab 1: Streaming Triage Chat
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Welcome to the BloodConnect AI Care Desk. Ask about live blood availability across Mumbai hospital vaults, compatible substitute groups, emergency requisition steps, or NBTC donor eligibility.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tab 2: Multimodal Slip / CBC Report Scanner
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null);
  const [slipBase64, setSlipBase64] = useState<string | null>(null);
  const [slipMimeType, setSlipMimeType] = useState<string | null>(null);
  const [slipNoteText, setSlipNoteText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ClinicalSlipAnalysis | null>(null);

  // Tab 3: Personalized Donor Readiness & Iron Coach
  const [coachBloodGroup, setCoachBloodGroup] = useState<BloodGroup>('O+');
  const [coachGender, setCoachGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [coachAge, setCoachAge] = useState<number>(28);
  const [coachWeight, setCoachWeight] = useState<number>(66);
  const [coachHb, setCoachHb] = useState<string>('13.4');
  const [coachDiet, setCoachDiet] = useState<string>('Vegetarian');
  const [coachLastDonation, setCoachLastDonation] = useState<string>('');
  const [coachNotes, setCoachNotes] = useState<string>('');
  const [coaching, setCoaching] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachPlan, setCoachPlan] = useState<DonorReadinessPlan | null>(null);

  const liveAvailability = useMemo(
    () => db.getLiveBloodAvailability(),
    [storeRevision]
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (activeAudioRef.current) {
        activeAudioRef.current.audio.pause();
        activeAudioRef.current.revoke();
      }
    };
  }, []);

  const stopAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.audio.pause();
      activeAudioRef.current.revoke();
      activeAudioRef.current = null;
    }
    setSpeakingId(null);
  };

  const handleListenAloud = async (
    id: string,
    text: string,
    style: 'emergency' | 'advisor' = 'advisor'
  ) => {
    setTtsError(null);
    if (speakingId === id) {
      stopAudio();
      return;
    }
    stopAudio();
    setSpeakingId(id);

    try {
      const { audioBase64, mimeType } = await synthesizeClinicalSpeech(text, style);
      const player = playBase64WavAudio(audioBase64, mimeType);
      activeAudioRef.current = player;
      player.audio.onended = () => {
        player.revoke();
        if (activeAudioRef.current === player) {
          activeAudioRef.current = null;
          setSpeakingId(null);
        }
      };
      player.audio.onerror = () => {
        player.revoke();
        setSpeakingId(null);
        setTtsError('Audio playback could not start in this browser.');
      };
      await player.audio.play();
    } catch (err) {
      setSpeakingId(null);
      setTtsError(err instanceof Error ? err.message : 'Unable to generate speech audio.');
    }
  };

  // --- Tab 1: Send Streaming Triage Message ---
  const sendChatMessage = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isStreaming) return;

    setChatError(null);
    setChatInput('');

    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantId = `m-${Date.now() + 1}`;
    const placeholderMsg: AiChatMessage = {
      id: assistantId,
      role: 'model',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, placeholderMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const liveContext = buildLiveClinicalContext();
      await streamTriageChat(
        nextHistory.map((m) => ({ role: m.role, text: m.text })),
        liveContext,
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m))
          );
        },
        controller.signal
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errMsg = err instanceof Error ? err.message : 'Unable to reach the AI Care Desk.';
        setChatError(errMsg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.text.length > 0));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendChatMessage(chatInput);
  };

  const {
    isRecording,
    isTranscribing,
    elapsedSeconds,
    toggleRecording,
  } = useVoiceRecorder({
    maxSeconds: 30,
    onTranscript: (transcript) => {
      setChatError(null);
      sendChatMessage(transcript);
    },
    onError: (msg) => setChatError(msg),
  });

  // --- Tab 2: Slip File Upload & Analysis ---
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setScanError(null);

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setScanError('Please upload a JPG, PNG, or WebP photo of the requisition slip or lab report.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setScanError('File exceeds 4 MB. Please upload a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setSlipPreviewUrl(dataUrl);
      setSlipMimeType(file.type);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      setSlipBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeSlip = async () => {
    if (!slipBase64 && !slipNoteText.trim()) {
      setScanError('Upload a slip photo or paste a clinical requisition note to analyze.');
      return;
    }
    setScanError(null);
    setScanning(true);
    try {
      const result = await analyzeClinicalSlip({
        imageBase64: slipBase64 || undefined,
        mimeType: slipMimeType || undefined,
        clinicalNoteText: slipNoteText.trim() || undefined,
      });
      setScanResult(result);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to analyze clinical slip.');
    } finally {
      setScanning(false);
    }
  };

  // Cross-check extracted slip blood group against live BloodConnect inventory
  const slipStockMatch = useMemo(() => {
    if (!scanResult || scanResult.bloodGroup === 'UNKNOWN') return null;
    const direct =
      liveAvailability.find((a) => a.bloodGroup === scanResult.bloodGroup)?.availableUnits ?? 0;
    const substitutes = COMPATIBLE_DONOR_GROUPS[scanResult.bloodGroup]
      .filter((bg) => bg !== scanResult.bloodGroup)
      .map((bg) => ({
        bloodGroup: bg,
        units: liveAvailability.find((a) => a.bloodGroup === bg)?.availableUnits ?? 0,
      }))
      .filter((s) => s.units > 0);
    return { direct, substitutes };
  }, [scanResult, liveAvailability]);

  // --- Tab 3: Donor Coach ---
  const handleGenerateCoachPlan = async (e: FormEvent) => {
    e.preventDefault();
    setCoachError(null);
    setCoaching(true);
    try {
      const parsedHb = coachHb.trim() ? Number(coachHb) : null;
      const plan = await generateDonorPlan({
        bloodGroup: coachBloodGroup,
        gender: coachGender,
        age: coachAge,
        weightKg: coachWeight,
        hemoglobinGdl: Number.isFinite(parsedHb) ? parsedHb : null,
        dietPreference: coachDiet,
        lastDonationDate: coachLastDonation,
        notes: coachNotes,
      });
      setCoachPlan(plan);
    } catch (err) {
      setCoachError(err instanceof Error ? err.message : 'Unable to generate donor readiness plan.');
    } finally {
      setCoaching(false);
    }
  };

  return (
    <div className="w-full bg-[#F8FAFC] min-h-[calc(100vh-8rem)]">
      {/* Top Swiss Editorial Masthead & 3-Mode Tab Bar */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7 pb-0">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6">
            <div className="space-y-1.5 max-w-2xl">
              <div className="text-xs font-mono uppercase tracking-[0.12em] text-rose-700 font-semibold">
                AI Clinical Care Desk · Live Network Grounded
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight">
                Interactive Blood Triage, Slip Scanner &amp; Donor Coach
              </h1>
              <p className="text-sm text-slate-600">
                Real-time clinical guidance grounded in BloodConnect’s live vault inventory, with multimodal requisition scanning and voice read-aloud.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenBloodMap()}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-rose-700" />
                <span>Live Blood Map</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenEmergency()}
                className="px-3.5 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Emergency Dispatch</span>
              </button>
            </div>
          </div>

          {/* Swiss Hairline Tabs */}
          <div className="flex items-center gap-6 overflow-x-auto border-t border-slate-200">
            <button
              id="ai-tab-triage"
              type="button"
              onClick={() => setActiveTab('triage')}
              className={`relative py-3.5 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === 'triage' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-rose-700" />
              <span>01. Live AI Triage &amp; Voice</span>
              {activeTab === 'triage' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-700" />
              )}
            </button>

            <button
              id="ai-tab-scanner"
              type="button"
              onClick={() => setActiveTab('scanner')}
              className={`relative py-3.5 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === 'scanner' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileScan className="w-4 h-4 text-rose-700" />
              <span>02. Requisition &amp; Lab Slip Scanner</span>
              {activeTab === 'scanner' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-700" />
              )}
            </button>

            <button
              id="ai-tab-coach"
              type="button"
              onClick={() => setActiveTab('coach')}
              className={`relative py-3.5 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === 'coach' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <HeartPulse className="w-4 h-4 text-rose-700" />
              <span>03. Donor Readiness &amp; Iron Coach</span>
              {activeTab === 'coach' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-700" />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Optional TTS Playback Error Notice */}
      {ttsError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
            <span>Voice read-aloud notice: {ttsError}</span>
            <button
              type="button"
              onClick={() => setTtsError(null)}
              className="text-amber-700 hover:text-amber-950 cursor-pointer"
              aria-label="Dismiss voice notice"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ================= TAB 1: LIVE AI TRIAGE & VOICE ================= */}
        {activeTab === 'triage' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 Cols: Streaming Conversation Console */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-[600px]">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-[#F8FAFC] flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-rose-700" />
                  <span className="font-semibold text-slate-950">
                    Real-Time Clinical Triage Console
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  Live Inventory Synced · Voice In &amp; Out
                </span>
              </div>

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const mentionedGroups = !isUser ? detectBloodGroupsInText(msg.text) : [];
                  const isPlayingThis = speakingId === msg.id;

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-slate-950 text-white'
                            : 'bg-[#F8FAFC] border border-slate-200 text-slate-800'
                        }`}
                      >
                        {msg.text || (
                          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-700" />
                            <span>Checking live vaults &amp; clinical guidelines...</span>
                          </span>
                        )}
                      </div>

                      {!isUser && msg.text.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleListenAloud(msg.id, msg.text, 'advisor')}
                            className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                              isPlayingThis
                                ? 'bg-rose-700 text-white border-rose-700'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-900'
                            }`}
                          >
                            {isPlayingThis ? (
                              <>
                                <Square className="w-3 h-3 fill-current" />
                                <span>Stop Voice</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5 text-rose-700" />
                                <span>Listen Aloud</span>
                              </>
                            )}
                          </button>

                          {mentionedGroups.slice(0, 2).map((bg) => (
                            <button
                              key={`${msg.id}-map-${bg}`}
                              type="button"
                              onClick={() => onOpenBloodMap({ bloodGroup: bg })}
                              className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:border-slate-900 text-[11px] font-mono font-semibold text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <MapPin className="w-3 h-3 text-rose-700" />
                              <span>{bg} on Map</span>
                            </button>
                          ))}

                          {mentionedGroups.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenEmergency({ bloodGroup: mentionedGroups[0] })
                              }
                              className="px-2.5 py-1 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <AlertCircle className="w-3 h-3" />
                              <span>Dispatch {mentionedGroups[0]}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {chatError && (
                <div className="mx-5 mb-3 px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {chatError}
                </div>
              )}

              {/* Composer */}
              <form
                onSubmit={handleChatSubmit}
                className="p-3.5 border-t border-slate-200 bg-white flex items-center gap-2"
              >
                <button
                  id="ai-triage-voice-btn"
                  type="button"
                  onClick={toggleRecording}
                  disabled={isStreaming || isTranscribing}
                  title={
                    isRecording
                      ? 'Stop voice recording and send'
                      : 'Speak your question in English, Hindi, or Marathi'
                  }
                  className={`px-3 py-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0 ${
                    isRecording
                      ? 'bg-rose-700 border-rose-700 text-white'
                      : 'bg-white border-slate-300 text-slate-800 hover:border-slate-950'
                  }`}
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-700" />
                      <span className="hidden sm:inline">Transcribing</span>
                    </>
                  ) : isRecording ? (
                    <>
                      <Square className="w-3 h-3 fill-current" />
                      <span className="font-mono tabular-data">
                        0:{String(elapsedSeconds).padStart(2, '0')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 text-rose-700" />
                      <span className="hidden sm:inline">Speak</span>
                    </>
                  )}
                </button>
                <input
                  id="ai-triage-input"
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={
                    isRecording
                      ? 'Listening... click Stop when finished speaking'
                      : isTranscribing
                        ? 'Transcribing spoken query...'
                        : 'Type or tap Speak (EN / Hindi / Marathi) for live vault stock & triage...'
                  }
                  disabled={isStreaming || isRecording || isTranscribing}
                  className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-[#F8FAFC] focus:bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-950"
                />
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    id="ai-triage-send-btn"
                    type="submit"
                    disabled={isRecording || isTranscribing || !chatInput.trim()}
                    className="px-4 py-2.5 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Ask AI</span>
                  </button>
                )}
              </form>
            </div>

            {/* Right 4 Cols: Clinical Quick Prompts + Live Inventory Context */}
            <div className="lg:col-span-4 space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">
                  Try Clinical Scenarios
                </div>
                <div className="space-y-2">
                  {SAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={isStreaming}
                      onClick={() => sendChatMessage(prompt)}
                      className="w-full text-left p-3 rounded-lg border border-slate-200 bg-[#F8FAFC] hover:bg-white hover:border-slate-900 text-xs text-slate-700 hover:text-slate-950 transition-colors cursor-pointer leading-relaxed"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">
                    Live Stock Fed to AI
                  </span>
                  <button
                    type="button"
                    onClick={() => onSearchBlood({})}
                    className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                  >
                    Full Stock →
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {liveAvailability.map((item) => (
                    <button
                      key={item.bloodGroup}
                      type="button"
                      onClick={() =>
                        sendChatMessage(
                          `What is the current ${item.bloodGroup} stock across Mumbai vaults and which compatible donor groups can help?`
                        )
                      }
                      className="p-2 rounded-md border border-slate-200 bg-[#F8FAFC] hover:border-slate-900 text-center cursor-pointer transition-colors"
                    >
                      <div className="text-xs font-mono font-bold text-slate-950">
                        {item.bloodGroup}
                      </div>
                      <div
                        className={`text-[11px] font-mono font-semibold tabular-data ${
                          item.status === 'Critical'
                            ? 'text-rose-700'
                            : item.status === 'Low'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {item.availableUnits}u
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: MULTIMODAL SLIP & CBC LAB SCANNER ================= */}
        {activeTab === 'scanner' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 6 Cols: Upload / Paste Input */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-rose-700 font-semibold">
                  Multimodal Vision Extraction
                </div>
                <h2 className="text-lg font-display font-bold text-slate-950 mt-0.5">
                  Scan Hospital Blood Requisition or CBC Lab Report
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Upload a photo of a doctor’s blood requisition slip or hemoglobin lab report—or paste ward order text—to automatically extract required units, check live BloodConnect stock, and pre-fill an emergency dispatch.
                </p>
              </div>

              {/* Image Upload Dropzone */}
              <div className="border border-dashed border-slate-300 rounded-xl p-5 bg-[#F8FAFC] text-center space-y-3">
                {slipPreviewUrl ? (
                  <div className="space-y-3">
                    <img
                      src={slipPreviewUrl}
                      alt="Uploaded clinical slip preview"
                      className="max-h-52 mx-auto rounded-lg border border-slate-200 object-contain bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSlipPreviewUrl(null);
                        setSlipBase64(null);
                        setSlipMimeType(null);
                      }}
                      className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                    >
                      Remove Photo
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 mx-auto flex items-center justify-center text-slate-600">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-xs text-slate-700 font-medium">
                      Upload requisition slip or lab report photo (JPG, PNG, WebP · max 4 MB)
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer">
                      <span>Choose Image</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </>
                )}
              </div>

              {/* Clinical Text / Sample Option */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="slip-note-textarea"
                    className="text-xs font-semibold text-slate-800"
                  >
                    Or Paste Clinical Requisition / Lab Note
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setSlipNoteText(SAMPLE_REQUISITION_NOTE);
                      setScanError(null);
                    }}
                    className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                  >
                    Load Sample ICU Note
                  </button>
                </div>
                <textarea
                  id="slip-note-textarea"
                  rows={5}
                  value={slipNoteText}
                  onChange={(e) => setSlipNoteText(e.target.value)}
                  placeholder="Paste blood requisition text, hemoglobin result, or emergency ward instructions..."
                  className="w-full p-3 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-950"
                />
              </div>

              {scanError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {scanError}
                </div>
              )}

              <button
                id="ai-analyze-slip-btn"
                type="button"
                disabled={scanning}
                onClick={handleAnalyzeSlip}
                className="w-full py-3 px-4 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Extracting Clinical Fields...</span>
                  </>
                ) : (
                  <>
                    <FileScan className="w-4 h-4" />
                    <span>Analyze Slip &amp; Cross-Check Live Stock</span>
                  </>
                )}
              </button>
            </div>

            {/* Right 6 Cols: Structured Extraction & Live Vault Match */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              {!scanResult ? (
                <div className="py-16 text-center space-y-2.5">
                  <div className="w-11 h-11 rounded-lg bg-[#F8FAFC] border border-slate-200 mx-auto flex items-center justify-center text-slate-400">
                    <FileScan className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Structured Extraction Results Appear Here
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Once scanned, BloodConnect extracts blood group, component, urgency, and hemoglobin readings—and immediately cross-checks our live cold-chain vaults.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-rose-700 font-semibold">
                        {scanResult.documentType} · {scanResult.urgency}
                      </div>
                      <h3 className="text-lg font-display font-bold text-slate-950 mt-0.5">
                        Extracted Requisition Summary
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleListenAloud(
                          'scan-summary',
                          `${scanResult.clinicalSummary} Recommended next steps: ${scanResult.recommendedNextSteps.join('. ')}`,
                          scanResult.urgency === 'Emergency' ? 'emergency' : 'advisor'
                        )
                      }
                      className="px-3 py-1.5 rounded-md border border-slate-200 hover:border-slate-900 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {speakingId === 'scan-summary' ? (
                        <>
                          <Square className="w-3 h-3 fill-current text-rose-700" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5 text-rose-700" />
                          <span>Listen</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Extracted Key Clinical Fields */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-[#F8FAFC]">
                    <div className="p-3">
                      <div className="text-[10px] text-slate-500 uppercase font-mono">Group</div>
                      <div className="text-lg font-mono font-bold text-rose-700 mt-0.5">
                        {scanResult.bloodGroup}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-[10px] text-slate-500 uppercase font-mono">Units</div>
                      <div className="text-lg font-mono font-bold text-slate-950 mt-0.5 tabular-data">
                        {scanResult.unitsRequired}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-[10px] text-slate-500 uppercase font-mono">Component</div>
                      <div className="text-xs font-semibold text-slate-950 mt-1">
                        {scanResult.component}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-[10px] text-slate-500 uppercase font-mono">Hemoglobin</div>
                      <div className="text-xs font-mono font-semibold text-slate-950 mt-1 tabular-data">
                        {scanResult.hemoglobinGdl || 'Not listed'}
                      </div>
                    </div>
                  </div>

                  {(scanResult.patientName || scanResult.hospitalHint) && (
                    <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                      {scanResult.patientName && (
                        <span>
                          Patient: <strong className="text-slate-950">{scanResult.patientName}</strong>
                        </span>
                      )}
                      {scanResult.hospitalHint && (
                        <span>
                          Facility: <strong className="text-slate-950">{scanResult.hospitalHint}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-sm text-slate-700 leading-relaxed">
                    {scanResult.clinicalSummary}
                  </p>

                  {/* Live BloodConnect Vault Cross-Check */}
                  {slipStockMatch && scanResult.bloodGroup !== 'UNKNOWN' && (
                    <div className="p-4 rounded-lg border border-slate-200 bg-[#F8FAFC] space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          Live BloodConnect Vault Match ({scanResult.bloodGroup})
                        </span>
                        <span
                          className={`font-mono font-bold tabular-data ${
                            slipStockMatch.direct >= scanResult.unitsRequired
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {slipStockMatch.direct} direct units ready
                        </span>
                      </div>
                      {slipStockMatch.substitutes.length > 0 && (
                        <div className="text-slate-600">
                          Compatible substitutes in stock:{' '}
                          <span className="font-mono font-semibold text-slate-900">
                            {slipStockMatch.substitutes
                              .map((s) => `${s.bloodGroup} (${s.units}u)`)
                              .join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Concrete Next Steps */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-slate-500 font-semibold">
                      Recommended Immediate Steps
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {scanResult.recommendedNextSteps.map((step) => (
                        <li key={step} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Direct 1-Tap Actions from Scanned Slip */}
                  <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenEmergency({
                          bloodGroup:
                            scanResult.bloodGroup !== 'UNKNOWN'
                              ? scanResult.bloodGroup
                              : undefined,
                          component: scanResult.component,
                          urgencyNote: scanResult.clinicalSummary,
                        })
                      }
                      className="flex-1 py-2.5 px-4 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Auto-Fill Emergency Request</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onOpenBloodMap({
                          bloodGroup:
                            scanResult.bloodGroup !== 'UNKNOWN'
                              ? scanResult.bloodGroup
                              : undefined,
                          component: scanResult.component,
                        })
                      }
                      className="py-2.5 px-4 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      <span>Locate on Blood Map</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {scanResult.confidenceNote}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: AI DONOR READINESS & IRON COACH ================= */}
        {activeTab === 'coach' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 Cols: Donor Profile Form */}
            <form
              onSubmit={handleGenerateCoachPlan}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-rose-700 font-semibold">
                  NBTC-Aligned Personalized Plan
                </div>
                <h2 className="text-lg font-display font-bold text-slate-950 mt-0.5">
                  AI Donor Readiness &amp; Iron Coach
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Get a tailored readiness score, hydration timing, and Indian iron-rich meal plan before your donation slot.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="coach-bg" className="block text-xs font-medium text-slate-700 mb-1">
                    Blood Group
                  </label>
                  <select
                    id="coach-bg"
                    value={coachBloodGroup}
                    onChange={(e) => setCoachBloodGroup(e.target.value as BloodGroup)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-950"
                  >
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="coach-gender" className="block text-xs font-medium text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    id="coach-gender"
                    value={coachGender}
                    onChange={(e) =>
                      setCoachGender(e.target.value as 'Male' | 'Female' | 'Other')
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-950"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="coach-age" className="block text-xs font-medium text-slate-700 mb-1">
                    Age (yrs)
                  </label>
                  <input
                    id="coach-age"
                    type="number"
                    min={16}
                    max={80}
                    value={coachAge}
                    onChange={(e) => setCoachAge(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono text-slate-950"
                  />
                </div>

                <div>
                  <label htmlFor="coach-weight" className="block text-xs font-medium text-slate-700 mb-1">
                    Weight (kg)
                  </label>
                  <input
                    id="coach-weight"
                    type="number"
                    min={35}
                    max={180}
                    value={coachWeight}
                    onChange={(e) => setCoachWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono text-slate-950"
                  />
                </div>

                <div>
                  <label htmlFor="coach-hb" className="block text-xs font-medium text-slate-700 mb-1">
                    Hb (g/dL)
                  </label>
                  <input
                    id="coach-hb"
                    type="number"
                    step="0.1"
                    min={7}
                    max={20}
                    value={coachHb}
                    onChange={(e) => setCoachHb(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono text-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="coach-diet" className="block text-xs font-medium text-slate-700 mb-1">
                    Diet Preference
                  </label>
                  <select
                    id="coach-diet"
                    value={coachDiet}
                    onChange={(e) => setCoachDiet(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-950"
                  >
                    <option value="Vegetarian">Vegetarian</option>
                    <option value="Eggetarian">Eggetarian</option>
                    <option value="Non-Vegetarian">Non-Vegetarian</option>
                    <option value="Vegan">Vegan</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="coach-last" className="block text-xs font-medium text-slate-700 mb-1">
                    Last Donation (Optional)
                  </label>
                  <input
                    id="coach-last"
                    type="date"
                    value={coachLastDonation}
                    onChange={(e) => setCoachLastDonation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono text-slate-950"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="coach-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Recent Medications, Travel, or Health Notes (Optional)
                </label>
                <textarea
                  id="coach-notes"
                  rows={2}
                  value={coachNotes}
                  onChange={(e) => setCoachNotes(e.target.value)}
                  placeholder="e.g., Finished antibiotics 2 weeks ago, first-time donor..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-950"
                />
              </div>

              {coachError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {coachError}
                </div>
              )}

              <button
                id="ai-generate-donor-plan-btn"
                type="submit"
                disabled={coaching}
                className="w-full py-3 px-4 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {coaching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                    <span>Building Readiness Plan...</span>
                  </>
                ) : (
                  <>
                    <HeartPulse className="w-4 h-4 text-rose-400" />
                    <span>Generate Personalized Donor Plan</span>
                  </>
                )}
              </button>
            </form>

            {/* Right 7 Cols: Structured Donor Plan Output */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              {!coachPlan ? (
                <div className="py-16 text-center space-y-2.5">
                  <div className="w-11 h-11 rounded-lg bg-[#F8FAFC] border border-slate-200 mx-auto flex items-center justify-center text-slate-400">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Personalized Clinical Readiness &amp; Meal Plan
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Enter your donor details on the left to receive an NBTC-aligned readiness score, recommended donation type, hydration protocol, and diet-matched iron recovery foods.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-rose-700 font-semibold">
                        {coachPlan.eligibilityVerdict} · Recommended: {coachPlan.recommendedDonationType}
                      </div>
                      <h3 className="text-xl font-display font-bold text-slate-950 mt-0.5">
                        Readiness Score:{' '}
                        <span className="font-mono tabular-data">{coachPlan.readinessScore}/100</span>
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleListenAloud(
                          'coach-plan',
                          `${coachPlan.eligibilityVerdict}. Readiness score ${coachPlan.readinessScore} out of 100. ${coachPlan.summary}`,
                          'advisor'
                        )
                      }
                      className="px-3 py-1.5 rounded-md border border-slate-200 hover:border-slate-900 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {speakingId === 'coach-plan' ? (
                        <>
                          <Square className="w-3 h-3 fill-current text-rose-700" />
                          <span>Stop Voice</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5 text-rose-700" />
                          <span>Listen Aloud</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Readiness Bar */}
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        coachPlan.readinessScore >= 75
                          ? 'bg-emerald-600'
                          : coachPlan.readinessScore >= 50
                          ? 'bg-amber-500'
                          : 'bg-rose-700'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(8, coachPlan.readinessScore))}%` }}
                    />
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed">{coachPlan.summary}</p>

                  {/* Hydration & Iron Meal Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-[#F8FAFC] border border-slate-200 space-y-2.5">
                      <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-slate-500 font-semibold">
                        Hydration &amp; Rest Protocol
                      </div>
                      <ul className="space-y-2 text-xs text-slate-700">
                        {coachPlan.hydrationProtocol.map((step) => (
                          <li key={step} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 rounded-lg bg-[#F8FAFC] border border-slate-200 space-y-2.5">
                      <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-slate-500 font-semibold">
                        Iron &amp; Folate Meal Plan ({coachDiet})
                      </div>
                      <div className="space-y-2.5 text-xs">
                        {coachPlan.ironRichMealPlan.map((meal) => (
                          <div key={`${meal.timing}-${meal.suggestion}`}>
                            <div className="font-mono font-semibold text-slate-900">
                              {meal.timing}
                            </div>
                            <div className="text-slate-600 mt-0.5">{meal.suggestion}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Clinical Safety Cautions */}
                  <div className="p-4 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                    <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-rose-700 font-semibold">
                      Clinical Safety Reminders
                    </div>
                    <ul className="space-y-1 text-slate-600">
                      {coachPlan.safetyCautions.map((caution) => (
                        <li key={caution}>• {caution}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenBooking({
                          bloodGroup: coachBloodGroup,
                          donationType:
                            coachPlan.recommendedDonationType === 'Apheresis Platelets' ||
                            coachPlan.recommendedDonationType === 'Plasma'
                              ? coachPlan.recommendedDonationType
                              : 'Whole Blood',
                        })
                      }
                      className="px-4 py-2.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Book 15-Min Donation Slot ({coachBloodGroup})</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenBloodMap({ layer: 'camps' })}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-950 cursor-pointer"
                    >
                      Find Nearby Donation Camps →
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
