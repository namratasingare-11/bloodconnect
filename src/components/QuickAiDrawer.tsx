import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  MapPin,
  Maximize2,
  Mic,
  Send,
  Square,
  Stethoscope,
  Volume2,
  X,
} from 'lucide-react';
import { BloodMapIntent, EmergencyPrefill } from '../types';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import {
  AiChatMessage,
  buildLiveClinicalContext,
  detectBloodGroupsInText,
  playBase64WavAudio,
  streamTriageChat,
  synthesizeClinicalSpeech,
} from '../services/aiApi';

interface QuickAiDrawerProps {
  currentView: string;
  onOpenFullDesk: (tab?: 'triage' | 'scanner' | 'coach') => void;
  onOpenBloodMap: (intent?: BloodMapIntent) => void;
  onOpenEmergency: (prefill?: EmergencyPrefill) => void;
}

export default function QuickAiDrawer({
  currentView,
  onOpenFullDesk,
  onOpenBloodMap,
  onOpenEmergency,
}: QuickAiDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'dock-welcome',
      role: 'model',
      text: 'Need quick help? Ask for live blood stock by type, compatible donor substitutes, or NBTC donation eligibility.',
      timestamp: '',
    },
  ]);

  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<{ audio: HTMLAudioElement; revoke: () => void } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.audio.pause();
        audioRef.current.revoke();
      }
    };
  }, []);

  // Hide dock when already inside the full AI Care Desk page
  if (currentView === 'ai_care') return null;

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.audio.pause();
      audioRef.current.revoke();
      audioRef.current = null;
    }
    setSpeakingId(null);
  };

  const handleSpeak = async (id: string, text: string) => {
    if (speakingId === id) {
      stopAudio();
      return;
    }
    stopAudio();
    setSpeakingId(id);
    try {
      const { audioBase64, mimeType } = await synthesizeClinicalSpeech(text, 'advisor');
      const player = playBase64WavAudio(audioBase64, mimeType);
      audioRef.current = player;
      player.audio.onended = () => {
        player.revoke();
        setSpeakingId(null);
      };
      await player.audio.play();
    } catch (err) {
      setSpeakingId(null);
      setError(err instanceof Error ? err.message : 'Unable to play audio.');
    }
  };

  const submitPromptText = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    setInput('');

    const userMsg: AiChatMessage = {
      id: `du-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: '',
    };
    const replyId = `dm-${Date.now() + 1}`;
    const nextHistory = [...messages, userMsg];

    setMessages([...nextHistory, { id: replyId, role: 'model', text: '', timestamp: '' }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamTriageChat(
        nextHistory.map((m) => ({ role: m.role, text: m.text })),
        buildLiveClinicalContext(),
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, text: m.text + chunk } : m))
          );
        },
        controller.signal
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'AI service unavailable.');
        setMessages((prev) => prev.filter((m) => m.id !== replyId || m.text.length > 0));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    await submitPromptText(input);
  };

  const {
    isRecording,
    isTranscribing,
    elapsedSeconds,
    toggleRecording,
  } = useVoiceRecorder({
    maxSeconds: 25,
    onTranscript: (text) => {
      setError(null);
      submitPromptText(text);
    },
    onError: (msg) => setError(msg),
  });

  return (
    <>
      {!isOpen && (
        <button
          id="quick-ai-dock-btn"
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI Clinical Care Desk"
          className="fixed bottom-5 right-5 z-40 px-4 py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold border border-slate-800 shadow-lg inline-flex items-center gap-2 transition-colors cursor-pointer no-print"
        >
          <Stethoscope className="w-3.5 h-3.5 text-rose-400" />
          <span>AI Care Desk</span>
        </button>
      )}

      {isOpen && (
        <div
          role="dialog"
          aria-label="Quick AI Clinical Assistant"
          className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2rem)] sm:w-[400px] h-[520px] bg-white border border-slate-300 rounded-xl shadow-2xl flex flex-col overflow-hidden no-print"
        >
          <div className="px-4 py-3 bg-slate-950 text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-rose-400" />
              <div>
                <div className="text-xs font-display font-bold">AI Care Desk</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Live Vaults · Voice In/Out · Eligibility
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenFullDesk('triage');
                }}
                title="Open full AI Care Desk (Scanner & Coach)"
                className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close AI Care Desk"
                className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Jump Strip to Scanner & Coach */}
          <div className="px-3 py-2 bg-[#F8FAFC] border-b border-slate-200 flex items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenFullDesk('scanner');
              }}
              className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-slate-900 font-semibold text-slate-800 cursor-pointer"
            >
              Scan Lab / Slip
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenFullDesk('coach');
              }}
              className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:border-slate-900 font-semibold text-slate-800 cursor-pointer"
            >
              Donor Iron Coach
            </button>
          </div>

          {/* Chat Feed */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const groups = !isUser ? detectBloodGroupsInText(msg.text) : [];
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-slate-950 text-white'
                        : 'bg-[#F8FAFC] border border-slate-200 text-slate-800'
                    }`}
                  >
                    {msg.text || (
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <Loader2 className="w-3 h-3 animate-spin text-rose-700" />
                        <span>Thinking...</span>
                      </span>
                    )}
                  </div>
                  {!isUser && msg.text && msg.id !== 'dock-welcome' && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSpeak(msg.id, msg.text)}
                        className="px-2 py-0.5 rounded-xs border border-slate-200 bg-white text-[10px] font-semibold text-slate-700 hover:border-slate-900 inline-flex items-center gap-1 cursor-pointer"
                      >
                        {speakingId === msg.id ? (
                          <Square className="w-2.5 h-2.5 fill-current text-rose-700" />
                        ) : (
                          <Volume2 className="w-3 h-3 text-rose-700" />
                        )}
                        <span>{speakingId === msg.id ? 'Stop' : 'Listen'}</span>
                      </button>
                      {groups[0] && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setIsOpen(false);
                              onOpenBloodMap({ bloodGroup: groups[0] });
                            }}
                            className="px-2 py-0.5 rounded-xs border border-slate-200 bg-white text-[10px] font-mono font-semibold text-slate-900 hover:border-slate-900 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <MapPin className="w-2.5 h-2.5 text-rose-700" />
                            <span>{groups[0]} Map</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsOpen(false);
                              onOpenEmergency({ bloodGroup: groups[0] });
                            }}
                            className="px-2 py-0.5 rounded-xs bg-rose-700 text-white text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <AlertCircle className="w-2.5 h-2.5" />
                            <span>SOS {groups[0]}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {error && (
            <div className="mx-3.5 mb-2 px-3 py-1.5 rounded-md bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSend}
            className="p-3 border-t border-slate-200 bg-white flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isStreaming || isTranscribing}
              title={isRecording ? 'Stop voice recording' : 'Speak your query (EN / HI / MR)'}
              aria-label={isRecording ? 'Stop voice recording' : 'Record voice query'}
              className={`px-2.5 py-2 rounded-md border text-[11px] font-mono font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                isRecording
                  ? 'bg-rose-700 border-rose-700 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-slate-950 hover:text-slate-950'
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-700" />
              ) : isRecording ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span className="tabular-data">0:{String(elapsedSeconds).padStart(2, '0')}</span>
                </>
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isRecording
                  ? 'Listening... tap Stop to send'
                  : isTranscribing
                    ? 'Transcribing voice...'
                    : 'Ask or tap mic (EN / Hindi / Marathi)...'
              }
              disabled={isStreaming || isRecording || isTranscribing}
              className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-slate-950"
            />
            <button
              type="submit"
              disabled={isStreaming || isRecording || isTranscribing || !input.trim()}
              className="p-2 rounded-md bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white cursor-pointer"
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
