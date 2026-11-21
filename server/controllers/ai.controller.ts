import { Request, Response, NextFunction } from 'express';
import { ThinkingLevel, Type } from '@google/genai';
import { sendSuccess, ValidationError } from '../utils/apiResponse';
import {
  assertAiRateLimit,
  getGeminiClient,
  mapGeminiError,
  withModelFallback,
} from '../utils/geminiClient';

const TEXT_MODEL = 'gemini-4-hydrogen';
const FALLBACK_TEXT_MODEL = 'gemini-3.1-flash-lite';
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/x-m4a',
]);
const MAX_BASE64_LENGTH = 5_500_000; // ~4MB decoded binary image/audio

function getClientIp(req: Request): string {
  return (req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

interface ChatTurnInput {
  role: 'user' | 'model';
  text: string;
}

/**
 * POST /api/ai/triage-chat
 * Streams real-time clinical blood guidance & live vault recommendations using Server-Sent Events (SSE).
 */
export async function streamTriageChat(req: Request, res: Response, next: NextFunction) {
  try {
    assertAiRateLimit(getClientIp(req));

    const body = req.body as {
      messages?: ChatTurnInput[];
      liveContext?: {
        availableByGroup?: Record<string, number>;
        hospitalsSummary?: string;
        upcomingCampsSummary?: string;
      };
    };

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new ValidationError('At least one message is required.');
    }

    const sanitizedHistory = body.messages
      .slice(-12)
      .map((turn) => ({
        role: turn.role === 'model' ? ('model' as const) : ('user' as const),
        text: typeof turn.text === 'string' ? turn.text.trim().slice(0, 1500) : '',
      }))
      .filter((turn) => turn.text.length > 0);

    if (sanitizedHistory.length === 0) {
      throw new ValidationError('Message text cannot be empty.');
    }

    const ai = getGeminiClient();

    const stockLines = body.liveContext?.availableByGroup
      ? Object.entries(body.liveContext.availableByGroup)
          .map(([bg, units]) => `${bg}: ${units} units`)
          .join(', ')
      : 'Live inventory context unavailable';

    const hospitalsContext =
      typeof body.liveContext?.hospitalsSummary === 'string'
        ? body.liveContext.hospitalsSummary.slice(0, 1800)
        : 'Mumbai Metropolitan accredited hospital vaults';

    const campsContext =
      typeof body.liveContext?.upcomingCampsSummary === 'string'
        ? body.liveContext.upcomingCampsSummary.slice(0, 1000)
        : '';

    const systemInstruction = [
      'You are the BloodConnect Clinical Care Desk Assistant for an accredited Mumbai/Maharashtra blood bank network.',
      'Your job is to help families in emergencies, blood donors, and hospital coordinators make fast, safe, clinically accurate decisions.',
      'Follow these strict rules:',
      '1. Ground your availability answers in the LIVE BLOODCONNECT NETWORK SNAPSHOT below. Never invent fake hospitals or phone numbers.',
      '2. Always include accurate ABO/Rh red-cell compatibility substitutes when a rare blood group (like O-, AB-, B-, A-) is discussed.',
      '3. Follow NBTC (National Blood Transfusion Council) India guidelines for donor eligibility (Age 18-65, weight >= 45kg, Hb >= 12.5 g/dL, 90-day male / 120-day female whole blood interval).',
      '4. Keep responses crisp, calm, scannable, and under 180 words with clear bullet points when listing steps.',
      '5. Include a brief 1-line clinical safety note reminding patients that final cross-match and medical clearance must be performed by the attending physician or blood bank medical officer.',
      '',
      `LIVE REGIONAL STOCK: ${stockLines}`,
      `CONNECTED HOSPITAL VAULTS: ${hospitalsContext}`,
      campsContext ? `UPCOMING DONATION CAMPS: ${campsContext}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const contents = sanitizedHistory.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }));

    const stream = await withModelFallback(
      TEXT_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) =>
        ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction,
            abortSignal,
            ...(model === TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          },
        }),
      8_000
    );

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    for await (const chunk of stream) {
      const piece = chunk.text;
      if (piece) {
        res.write(`data: ${JSON.stringify({ chunk: piece })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const mapped = mapGeminiError(err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: mapped.message, code: mapped.code })}\n\n`);
      res.end();
      return;
    }
    next(mapped);
  }
}

/**
 * POST /api/ai/analyze-slip
 * Multimodal Gemini vision + text extraction for hospital blood requisition slips or CBC/blood group reports.
 */
export async function analyzeClinicalSlip(req: Request, res: Response, next: NextFunction) {
  try {
    assertAiRateLimit(getClientIp(req), 12, 60_000);

    const body = req.body as {
      imageBase64?: string;
      mimeType?: string;
      clinicalNoteText?: string;
    };

    const noteText =
      typeof body.clinicalNoteText === 'string' ? body.clinicalNoteText.trim().slice(0, 2500) : '';
    const hasImage = typeof body.imageBase64 === 'string' && body.imageBase64.trim().length > 0;

    if (!hasImage && !noteText) {
      throw new ValidationError('Upload a slip/report image or paste a clinical requisition note.');
    }

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (hasImage) {
      const mime = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase().trim() : '';
      if (!ALLOWED_IMAGE_MIMES.has(mime)) {
        throw new ValidationError('Unsupported image format. Please upload a JPG, PNG, or WebP file.');
      }

      const cleanedBase64 = body.imageBase64!.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
      if (cleanedBase64.length > MAX_BASE64_LENGTH) {
        throw new ValidationError('Image exceeds the 4 MB limit. Please upload a smaller image.');
      }

      parts.push({
        inlineData: {
          mimeType: mime,
          data: cleanedBase64,
        },
      });
    }

    parts.push({
      text: [
        'Analyze this hospital blood requisition slip, lab CBC report, or clinical transfusion note.',
        noteText ? `Clinical text provided:\n${noteText}` : '',
        'Extract structured blood bank requisition details accurately.',
        'If a blood group is not clearly stated, set bloodGroup to "UNKNOWN".',
        'Map component strictly to one of: "Whole Blood", "Packed Red Cells", "Platelets", "Fresh Frozen Plasma", "Cryoprecipitate". Default to "Packed Red Cells" if red cells/PRBC/blood transfusion for low hemoglobin is indicated.',
        'Map urgency strictly to one of: "Emergency", "Urgent", "Normal".',
        'Never invent patient names or lab values not present in the source.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });

    const ai = getGeminiClient();

    const response = await withModelFallback(
      TEXT_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) =>
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction:
              'You are a clinical transfusion intake parser. Extract structured fields accurately from blood bank slips, lab CBC reports, or emergency ward notes. Keep clinicalSummary plain-language, concise, and helpful for patients and hospital staff.',
            responseMimeType: 'application/json',
            abortSignal,
            ...(model === TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentType: {
              type: Type.STRING,
              description: 'Short label like "Hospital Requisition Slip", "CBC Lab Report", or "Emergency Ward Note".',
            },
            bloodGroup: {
              type: Type.STRING,
              description: 'One of A+, A-, B+, B-, AB+, AB-, O+, O-, or UNKNOWN.',
            },
            component: {
              type: Type.STRING,
              description: 'One of Whole Blood, Packed Red Cells, Platelets, Fresh Frozen Plasma, Cryoprecipitate.',
            },
            unitsRequired: {
              type: Type.INTEGER,
              description: 'Number of blood units requested (1 to 10). Default 1 if unspecified.',
            },
            urgency: {
              type: Type.STRING,
              description: 'One of Emergency, Urgent, Normal.',
            },
            patientName: {
              type: Type.STRING,
              description: 'Patient name or ward identifier if visible, otherwise empty string.',
            },
            hemoglobinGdl: {
              type: Type.STRING,
              description: 'Observed hemoglobin reading with units (e.g. "7.4 g/dL") if present, otherwise empty string.',
            },
            hospitalHint: {
              type: Type.STRING,
              description: 'Hospital or clinic name mentioned, otherwise empty string.',
            },
            clinicalSummary: {
              type: Type.STRING,
              description: '2-3 concise sentences explaining the requisition in plain language.',
            },
            recommendedNextSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 concrete immediate actions for the family or coordinator.',
            },
            confidenceNote: {
              type: Type.STRING,
              description: 'Short note on extraction certainty and reminder to verify against original lab order.',
            },
          },
          required: [
            'documentType',
            'bloodGroup',
            'component',
            'unitsRequired',
            'urgency',
            'clinicalSummary',
            'recommendedNextSteps',
            'confidenceNote',
          ],
        },
      },
    }),
      10_000
    );

    const rawJson = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawJson);

    return sendSuccess(res, { analysis: parsed });
  } catch (err) {
    next(mapGeminiError(err));
  }
}

/**
 * POST /api/ai/donor-plan
 * Generates a personalized NBTC-aligned donor readiness assessment, hydration schedule, and 7-day iron recovery meal plan.
 */
export async function generateDonorPlan(req: Request, res: Response, next: NextFunction) {
  try {
    assertAiRateLimit(getClientIp(req), 15, 60_000);

    const body = req.body as {
      bloodGroup?: string;
      gender?: string;
      age?: number;
      weightKg?: number;
      hemoglobinGdl?: number | null;
      dietPreference?: string;
      lastDonationDate?: string;
      notes?: string;
    };

    const age = Number(body.age);
    const weightKg = Number(body.weightKg);

    if (!Number.isFinite(age) || age < 14 || age > 90) {
      throw new ValidationError('Please provide a valid age between 14 and 90.');
    }
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 200) {
      throw new ValidationError('Please provide a valid weight in kilograms.');
    }

    const bloodGroup = typeof body.bloodGroup === 'string' ? body.bloodGroup.slice(0, 5) : 'O+';
    const gender = typeof body.gender === 'string' ? body.gender.slice(0, 16) : 'Other';
    const diet = typeof body.dietPreference === 'string' ? body.dietPreference.slice(0, 30) : 'Vegetarian';
    const lastDonationDate =
      typeof body.lastDonationDate === 'string' ? body.lastDonationDate.slice(0, 20) : 'Never / Over 6 months ago';
    const hbText =
      body.hemoglobinGdl !== null && body.hemoglobinGdl !== undefined && Number.isFinite(Number(body.hemoglobinGdl))
        ? `${Number(body.hemoglobinGdl)} g/dL`
        : 'Not measured recently';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 400) : 'None reported';

    const prompt = [
      'Create a personalized blood donation readiness and iron-recovery plan following NBTC India clinical standards:',
      `- Blood Group: ${bloodGroup}`,
      `- Gender: ${gender}`,
      `- Age: ${age} years`,
      `- Weight: ${weightKg} kg`,
      `- Recent Hemoglobin: ${hbText}`,
      `- Dietary Preference: ${diet}`,
      `- Last Donation Date: ${lastDonationDate || 'Never / Over 6 months ago'}`,
      `- Recent medications, health notes, or travel: ${notes || 'None'}`,
      `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
      'Make meal suggestions practical, affordable, and tailored to Indian kitchens (e.g., spinach/palak, dates, jaggery/gur, roasted chana, pomegranate, lentils, citrus vitamin-C pairing, or lean iron sources if non-vegetarian).',
    ].join('\n');

    const ai = getGeminiClient();

    const response = await withModelFallback(
      TEXT_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are a clinical hematology donor educator following NBTC India blood safety standards. Be encouraging, medically accurate, and concise. Never override a deferral requirement (age < 18 or > 65, weight < 45kg, Hb < 12.5 g/dL, or active antibiotics/fever).',
            responseMimeType: 'application/json',
            abortSignal,
            ...(model === TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseSchema: {
          type: Type.OBJECT,
          properties: {
            eligibilityVerdict: {
              type: Type.STRING,
              description: 'One of "Likely Eligible", "Needs Medical Officer Review", or "Temporary Deferral Advised".',
            },
            readinessScore: {
              type: Type.INTEGER,
              description: 'Score from 0 to 100 reflecting current donation readiness.',
            },
            recommendedDonationType: {
              type: Type.STRING,
              description: 'One of "Whole Blood", "Apheresis Platelets", "Plasma", or "Wait Before Donating".',
            },
            summary: {
              type: Type.STRING,
              description: '2-3 concise sentences explaining the assessment and why their blood group matters.',
            },
            hydrationProtocol: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 concrete pre- and post-donation hydration & rest steps.',
            },
            ironRichMealPlan: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timing: { type: Type.STRING, description: 'e.g. "24 Hours Before", "2-3 Hours Before", "Post-Donation Recovery"' },
                  suggestion: { type: Type.STRING, description: 'Specific iron + Vitamin C food pairing.' },
                },
                required: ['timing', 'suggestion'],
              },
              description: '3-4 practical meal recommendations tailored to dietPreference.',
            },
            safetyCautions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2-3 concise clinical cautions or deferral reminders.',
            },
          },
          required: [
            'eligibilityVerdict',
            'readinessScore',
            'recommendedDonationType',
            'summary',
            'hydrationProtocol',
            'ironRichMealPlan',
            'safetyCautions',
          ],
        },
      },
    }),
      10_000
    );

    const rawJson = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawJson);

    return sendSuccess(res, { plan: parsed });
  } catch (err) {
    next(mapGeminiError(err));
  }
}

/**
 * POST /api/ai/tts
 * Synthesizes calm, clear clinical voice read-aloud WAV audio using gemini-3.8-flash-lite-tts.
 */
export async function synthesizeSpeech(req: Request, res: Response, next: NextFunction) {
  try {
    assertAiRateLimit(getClientIp(req), 12, 60_000);

    const body = req.body as { text?: string; style?: string };
    const cleanText =
      typeof body.text === 'string'
        ? body.text
            .replace(/[*#`_]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 750)
        : '';

    if (!cleanText) {
      throw new ValidationError('Text is required for audio synthesis.');
    }

    const style =
      body.style === 'emergency'
        ? 'Calm, reassuring, crystal-clear medical dispatcher'
        : 'Warm, articulate clinical health advisor';

    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: cleanText,
              // speechMetadata supported by gemini-3.8-flash-lite-tts
              ...({ speechMetadata: { style } } as Record<string, unknown>),
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data
    );
    const base64Audio = audioPart?.inlineData?.data;

    if (!base64Audio) {
      throw new Error('No audio returned from speech synthesis model.');
    }

    return sendSuccess(res, {
      mimeType: audioPart?.inlineData?.mimeType || 'audio/wav',
      audioBase64: base64Audio,
    });
  } catch (err) {
    next(mapGeminiError(err));
  }
}

/**
 * POST /api/ai/transcribe
 * Transcribes spoken voice queries (English, Hindi, Marathi, Hinglish) into clean clinical triage text using gemini-3.5-transcribe.
 */
export async function transcribeVoiceQuery(req: Request, res: Response, next: NextFunction) {
  try {
    assertAiRateLimit(getClientIp(req), 16, 60_000);

    const body = req.body as { audioBase64?: string; mimeType?: string };
    const rawMime = typeof body.mimeType === 'string' ? body.mimeType.split(';')[0].toLowerCase().trim() : '';

    if (!body.audioBase64 || typeof body.audioBase64 !== 'string') {
      throw new ValidationError('Audio recording is required for transcription.');
    }
    if (!ALLOWED_AUDIO_MIMES.has(rawMime)) {
      throw new ValidationError('Unsupported audio format. Please record using your browser microphone.');
    }

    const cleanedBase64 = body.audioBase64.replace(/^data:audio\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
    if (!cleanedBase64 || cleanedBase64.length > MAX_BASE64_LENGTH) {
      throw new ValidationError('Audio clip is empty or exceeds the 4 MB limit.');
    }

    const ai = getGeminiClient();

    const response = await withModelFallback(
      TRANSCRIBE_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) =>
        ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: rawMime === 'audio/x-m4a' ? 'audio/mp4' : rawMime,
                  data: cleanedBase64,
                },
              },
              {
                text: 'Transcribe this spoken blood-bank or donor query accurately. Preserve blood groups (like O-, AB+, B-), hospital names, and medical terms cleanly. If spoken in Hindi or Marathi, output clear natural text (or Hinglish/English as spoken). Return only the transcript without extra commentary.',
              },
            ],
          },
          config: { abortSignal },
        }),
      12_000
    );

    const transcript = (response.text ?? '').trim();
    if (!transcript) {
      throw new ValidationError('No clear speech was detected in the recording. Please try speaking closer to the microphone.');
    }

    return sendSuccess(res, { transcript });
  } catch (err) {
    next(mapGeminiError(err));
  }
}

const ALLOWED_LANGUAGES = new Set(['English', 'Hindi', 'Marathi', 'Hinglish']);

/**
 * POST /api/ai/sos-appeal
 * Drafts a calm, verified, share-ready multilingual emergency SOS blood appeal or polite donor outreach message.
 */
export async function draftEmergencySosAppeal(req: Request, res: Response, next: NextFunction) {
  try {
    assertAiRateLimit(getClientIp(req), 18, 60_000);

    const body = req.body as {
      mode?: 'family_sos' | 'donor_outreach';
      language?: string;
      bloodGroup?: string;
      unitsNeeded?: number;
      component?: string;
      compatibleSubstitutes?: string[];
      patientName?: string;
      hospitalName?: string;
      hospitalPhone?: string;
      hospitalCity?: string;
      donorName?: string;
      donorCity?: string;
    };

    const mode = body.mode === 'donor_outreach' ? 'donor_outreach' : 'family_sos';
    const language = typeof body.language === 'string' && ALLOWED_LANGUAGES.has(body.language)
      ? body.language
      : 'English';
    const bloodGroup = typeof body.bloodGroup === 'string' ? body.bloodGroup.trim().slice(0, 5) : '';
    if (!bloodGroup) {
      throw new ValidationError('Blood group is required to draft an appeal.');
    }

    const unitsNeeded = Math.max(1, Math.min(10, Number(body.unitsNeeded) || 2));
    const component = typeof body.component === 'string' ? body.component.trim().slice(0, 40) : 'Packed Red Cells';
    const substitutes = Array.isArray(body.compatibleSubstitutes)
      ? body.compatibleSubstitutes.slice(0, 8).map((s) => String(s).slice(0, 5)).join(', ')
      : '';
    const patientName = typeof body.patientName === 'string' ? body.patientName.trim().slice(0, 80) : '';
    const hospitalName = typeof body.hospitalName === 'string' ? body.hospitalName.trim().slice(0, 120) : 'BloodConnect Accredited Hospital Vault';
    const hospitalPhone = typeof body.hospitalPhone === 'string' ? body.hospitalPhone.trim().slice(0, 32) : '1800-11-9999';
    const hospitalCity = typeof body.hospitalCity === 'string' ? body.hospitalCity.trim().slice(0, 40) : 'Mumbai';
    const donorName = typeof body.donorName === 'string' ? body.donorName.trim().slice(0, 60) : '';
    const donorCity = typeof body.donorCity === 'string' ? body.donorCity.trim().slice(0, 40) : '';

    const prompt =
      mode === 'donor_outreach'
        ? [
            `Write a polite, concise, respectful WhatsApp/SMS outreach message in ${language} to a verified voluntary blood donor.`,
            `- Donor First Name: ${donorName || 'Voluntary Donor'}`,
            `- Donor City: ${donorCity || hospitalCity}`,
            `- Blood Group Needed: ${bloodGroup} (${unitsNeeded} unit(s) of ${component})`,
            `- Accredited Blood Centre: ${hospitalName}, ${hospitalCity}`,
            `- Blood Bank Desk Phone: ${hospitalPhone}`,
            'Rules:',
            '1. Never pressure or guilt-trip the donor; clearly state it is completely voluntary and subject to standard NBTC medical screening.',
            '2. Keep under 90 words so it fits cleanly on a mobile WhatsApp screen.',
            '3. Output plain text only (no markdown headings or commentary).',
          ].join('\n')
        : [
            `Write a clear, urgent, calm WhatsApp/SMS emergency blood appeal in ${language} for family and community groups.`,
            `- Required Blood Group: ${bloodGroup} (${unitsNeeded} unit(s) of ${component})`,
            substitutes ? `- Clinically Compatible Red-Cell Substitutes: ${substitutes}` : '',
            patientName ? `- Patient / Ward Reference: ${patientName}` : '',
            `- Verified Blood Bank / Hospital: ${hospitalName}, ${hospitalCity}`,
            `- Verified Blood Bank Phone: ${hospitalPhone}`,
            `- 24/7 Helpline: 1800-11-9999`,
            'Rules:',
            '1. Lead clearly with the blood group, units, and hospital so busy readers immediately see if they can help.',
            '2. Keep every number, hospital name, and phone exact — do not invent any contact details.',
            '3. Keep under 105 words, crisp and scannable with short lines. Output plain text only (no markdown code fences or extra notes).',
          ]
            .filter(Boolean)
            .join('\n');

    const ai = getGeminiClient();
    const response = await withModelFallback(
      TEXT_MODEL,
      FALLBACK_TEXT_MODEL,
      (model, abortSignal) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are a clinical emergency communications coordinator for an accredited Indian blood bank network. Produce accurate, calm, dignified, mobile-ready messages in the exact requested language (English, Hindi in Devanagari script, Marathi in Devanagari script, or natural Hinglish).',
            abortSignal,
            ...(model === TEXT_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          },
        }),
      8_000
    );

    const appealText = (response.text ?? '').trim();
    if (!appealText) {
      throw new Error('Empty appeal returned by AI service.');
    }

    return sendSuccess(res, {
      language,
      mode,
      appealText,
    });
  } catch (err) {
    next(mapGeminiError(err));
  }
}
