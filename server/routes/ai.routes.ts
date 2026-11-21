import { Router } from 'express';
import {
  analyzeClinicalSlip,
  draftEmergencySosAppeal,
  generateDonorPlan,
  streamTriageChat,
  synthesizeSpeech,
  transcribeVoiceQuery,
} from '../controllers/ai.controller';

const router = Router();

router.post('/triage-chat', streamTriageChat);
router.post('/analyze-slip', analyzeClinicalSlip);
router.post('/donor-plan', generateDonorPlan);
router.post('/tts', synthesizeSpeech);
router.post('/transcribe', transcribeVoiceQuery);
router.post('/sos-appeal', draftEmergencySosAppeal);

export default router;
