import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeVoiceAudio } from '../services/aiApi';

interface UseVoiceRecorderOptions {
  maxSeconds?: number;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
}

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Could not read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Reusable browser microphone recorder wired to server-side Gemini audio transcription.
 */
export function useVoiceRecorder({
  maxSeconds = 30,
  onTranscript,
  onError,
}: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);

  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

  const cleanupTracks = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // Ignore stop race on unmount
        }
      }
      cleanupTracks();
    };
  }, [cleanupTracks]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      onErrorRef.current?.(
        'Microphone recording is not supported in this browser. Please type your query instead.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMime = pickSupportedMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const recordedMime = (recorder.mimeType || preferredMime || 'audio/webm').split(';')[0];
        const audioBlob = new Blob(chunksRef.current, { type: recordedMime });
        cleanupTracks();
        setIsRecording(false);
        setElapsedSeconds(0);

        if (audioBlob.size < 400) {
          onErrorRef.current?.('Recording was too short. Hold and speak for at least 1 second.');
          return;
        }
        if (audioBlob.size > 4 * 1024 * 1024) {
          onErrorRef.current?.('Audio clip exceeded 4 MB. Please keep voice queries under 30 seconds.');
          return;
        }

        setIsTranscribing(true);
        try {
          const base64 = await blobToBase64(audioBlob);
          const transcript = await transcribeVoiceAudio(base64, recordedMime);
          onTranscriptRef.current(transcript);
        } catch (err) {
          onErrorRef.current?.(
            err instanceof Error ? err.message : 'Unable to transcribe your voice recording.'
          );
        } finally {
          setIsTranscribing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setElapsedSeconds(0);

      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= maxSeconds) {
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
              recorderRef.current.stop();
            }
          }
          return next;
        });
      }, 1000);
    } catch {
      cleanupTracks();
      setIsRecording(false);
      onErrorRef.current?.(
        'Microphone access was blocked. Allow microphone permission in your browser to use Voice Triage.'
      );
    }
  }, [cleanupTracks, isRecording, isTranscribing, maxSeconds]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isTranscribing,
    elapsedSeconds,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
