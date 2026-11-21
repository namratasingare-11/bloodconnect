import { BloodComponent, BloodGroup } from '../types';
import { db } from '../db/databaseStore';
import { BLOOD_GROUPS } from '../config/constants';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface LiveClinicalContext {
  availableByGroup: Record<string, number>;
  hospitalsSummary: string;
  upcomingCampsSummary: string;
}

export interface ClinicalSlipAnalysis {
  documentType: string;
  bloodGroup: BloodGroup | 'UNKNOWN';
  component: BloodComponent;
  unitsRequired: number;
  urgency: 'Emergency' | 'Urgent' | 'Normal';
  patientName?: string;
  hemoglobinGdl?: string;
  hospitalHint?: string;
  clinicalSummary: string;
  recommendedNextSteps: string[];
  confidenceNote: string;
}

export interface DonorReadinessPlan {
  eligibilityVerdict: string;
  readinessScore: number;
  recommendedDonationType: string;
  summary: string;
  hydrationProtocol: string[];
  ironRichMealPlan: { timing: string; suggestion: string }[];
  safetyCautions: string[];
}

export function buildLiveClinicalContext(): LiveClinicalContext {
  const availability = db.getLiveBloodAvailability();
  const availableByGroup: Record<string, number> = {};
  availability.forEach((item) => {
    availableByGroup[item.bloodGroup] = item.availableUnits;
  });

  const hospitalsSummary = db
    .getHospitals()
    .map((h) => `${h.name} (${h.city}, ${h.address}, Desk: ${h.phone})`)
    .join('; ');

  const upcomingCampsSummary = db
    .getCamps()
    .filter((c) => c.status === 'Upcoming')
    .slice(0, 5)
    .map((c) => `${c.name} on ${c.date} at ${c.location}, ${c.city}`)
    .join('; ');

  return {
    availableByGroup,
    hospitalsSummary,
    upcomingCampsSummary,
  };
}

export function detectBloodGroupsInText(text: string): BloodGroup[] {
  const found: BloodGroup[] = [];
  const pattern = /\b(AB|A|B|O)\s*([+-])\b/gi;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    const candidate = `${match[1].toUpperCase()}${match[2]}` as BloodGroup;
    if ((BLOOD_GROUPS as readonly string[]).includes(candidate) && !found.includes(candidate)) {
      found.push(candidate);
    }
    match = pattern.exec(text);
  }
  return found;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string };
    if (data?.message) return data.message;
  } catch {
    // Non-JSON response
  }
  return `Request failed with status ${response.status}.`;
}

export async function streamTriageChat(
  messages: { role: 'user' | 'model'; text: string }[],
  liveContext: LiveClinicalContext,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/ai/triage-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, liveContext }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  if (!response.body) {
    throw new Error('Streaming response unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const rawEvent of events) {
      const line = rawEvent
        .split('\n')
        .find((l) => l.startsWith('data: '));
      if (!line) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;
      const parsed = JSON.parse(jsonStr) as {
        chunk?: string;
        done?: boolean;
        error?: string;
      };
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      if (parsed.chunk) {
        onChunk(parsed.chunk);
      }
    }
  }
}

export async function analyzeClinicalSlip(payload: {
  imageBase64?: string;
  mimeType?: string;
  clinicalNoteText?: string;
}): Promise<ClinicalSlipAnalysis> {
  const response = await fetch('/api/ai/analyze-slip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json()) as { analysis: ClinicalSlipAnalysis };
  return data.analysis;
}

export async function generateDonorPlan(payload: {
  bloodGroup: BloodGroup;
  gender: 'Male' | 'Female' | 'Other';
  age: number;
  weightKg: number;
  hemoglobinGdl: number | null;
  dietPreference: string;
  lastDonationDate: string;
  notes: string;
}): Promise<DonorReadinessPlan> {
  const response = await fetch('/api/ai/donor-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json()) as { plan: DonorReadinessPlan };
  return data.plan;
}

export async function synthesizeClinicalSpeech(
  text: string,
  style: 'emergency' | 'advisor' = 'advisor'
): Promise<{ mimeType: string; audioBase64: string }> {
  const response = await fetch('/api/ai/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, style }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json()) as { mimeType: string; audioBase64: string };
  return {
    mimeType: data.mimeType || 'audio/wav',
    audioBase64: data.audioBase64,
  };
}

export function playBase64WavAudio(
  audioBase64: string,
  mimeType = 'audio/wav'
): { audio: HTMLAudioElement; revoke: () => void } {
  const binaryString = atob(audioBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  const revoke = () => URL.revokeObjectURL(objectUrl);
  return { audio, revoke };
}

export type SosAppealLanguage = 'English' | 'Hindi' | 'Marathi' | 'Hinglish';

export async function transcribeVoiceAudio(
  audioBase64: string,
  mimeType: string
): Promise<string> {
  const response = await fetch('/api/ai/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64, mimeType }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json()) as { transcript: string };
  return data.transcript;
}

export async function draftMultilingualSosAppeal(payload: {
  mode?: 'family_sos' | 'donor_outreach';
  language: SosAppealLanguage;
  bloodGroup: BloodGroup;
  unitsNeeded: number;
  component: BloodComponent;
  compatibleSubstitutes?: BloodGroup[];
  patientName?: string;
  hospitalName?: string;
  hospitalPhone?: string;
  hospitalCity?: string;
  donorName?: string;
  donorCity?: string;
}): Promise<{ language: SosAppealLanguage; appealText: string }> {
  const response = await fetch('/api/ai/sos-appeal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json()) as {
    language: SosAppealLanguage;
    appealText: string;
  };
  return {
    language: data.language,
    appealText: data.appealText,
  };
}
