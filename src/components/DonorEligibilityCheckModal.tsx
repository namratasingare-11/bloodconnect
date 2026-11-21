import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Heart,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface DonorEligibilityCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBooking?: () => void;
  onOpenRegister?: () => void;
  onOpenCamps?: () => void;
}

export default function DonorEligibilityCheckModal({
  isOpen,
  onClose,
  onOpenBooking,
  onOpenRegister,
  onOpenCamps
}: DonorEligibilityCheckModalProps) {
  const [age, setAge] = useState<number>(26);
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [weightKg, setWeightKg] = useState<number>(65);
  const [lastDonation, setLastDonation] = useState<'never' | 'more_than_3_months' | 'recent'>('never');
  const [lastDonationDate, setLastDonationDate] = useState<string>(() => {
    const d = new Date(Date.now() - 45 * 86400000);
    return d.toISOString().split('T')[0];
  });
  const [hasTattooOrPiercing, setHasTattooOrPiercing] = useState<boolean>(false);
  const [hasActiveInfection, setHasActiveInfection] = useState<boolean>(false);
  const [isPregnantOrLactating, setIsPregnantOrLactating] = useState<boolean>(false);
  const [evaluated, setEvaluated] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const minRecoveryDays = gender === 'Female' ? 120 : 90;

  let calculatedNextEligibleDate: string | null = null;
  let daysRemaining = 0;
  if (lastDonation === 'recent' && lastDonationDate) {
    const parsed = new Date(`${lastDonationDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      const eligibleDate = new Date(parsed.getTime() + minRecoveryDays * 86400000);
      calculatedNextEligibleDate = eligibleDate.toISOString().split('T')[0];
      daysRemaining = Math.max(0, Math.ceil((eligibleDate.getTime() - Date.now()) / 86400000));
    }
  }

  const deferralReasons: string[] = [];
  if (age < 18 || age > 65) {
    deferralReasons.push('Donor age must be between 18 and 65 years.');
  }
  if (weightKg < 45) {
    deferralReasons.push('Minimum body weight requirement is 45 kg (50 kg for 450 mL whole blood collection).');
  }
  if (lastDonation === 'recent' && daysRemaining > 0) {
    deferralReasons.push(
      `A minimum rest interval of ${minRecoveryDays} days is required between whole blood donations. Your next eligible date is ${calculatedNextEligibleDate} (${daysRemaining} days remaining).`
    );
  }
  if (hasTattooOrPiercing) {
    deferralReasons.push('Temporary 6-month deferral applies after any tattoo, body piercing, or major dental extraction.');
  }
  if (hasActiveInfection) {
    deferralReasons.push('Fever, systemic infection, or antibiotic treatment within the past 14 days requires full recovery first.');
  }
  if (gender === 'Female' && isPregnantOrLactating) {
    deferralReasons.push('Pregnancy, childbirth within the past 12 months, and active lactation require temporary deferral for maternal safety.');
  }

  const isEligible = deferralReasons.length === 0;

  const handleRunEvaluation = (e: React.FormEvent) => {
    e.preventDefault();
    setEvaluated(true);
    if (isEligible) {
      try {
        confetti({ particleCount: 45, spread: 55, origin: { y: 0.6 } });
      } catch {
        // ignore in headless browsers
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eligibility-modal-title"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl p-6 sm:p-7 shadow-xl border border-slate-200 relative my-auto space-y-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close eligibility check"
          className="absolute top-5 right-5 p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="pr-8">
          <p className="text-xs font-medium text-rose-700 mb-1">
            Clinical Pre-Screening · NBTC Guidelines
          </p>
          <h2 id="eligibility-modal-title" className="text-xl font-display font-bold text-slate-950 tracking-tight">
            60-Second Donor Eligibility Self-Check
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Verify national health and recovery-interval criteria before scheduling a donation slot.
          </p>
        </div>

        {!evaluated ? (
          <form onSubmit={handleRunEvaluation} className="space-y-4">
            {/* Age & Gender */}
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="elig-age" className="block text-xs font-semibold text-slate-700 mb-1">
                  Age (Years)
                </label>
                <input
                  id="elig-age"
                  type="number"
                  min={16}
                  max={80}
                  value={age}
                  onChange={e => setAge(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 text-xs font-semibold font-mono tabular-data rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600"
                  required
                />
                <span className="text-[11px] text-slate-400">Eligible range: 18–65</span>
              </div>

              <div>
                <label htmlFor="elig-gender" className="block text-xs font-semibold text-slate-700 mb-1">
                  Biological Sex
                </label>
                <select
                  id="elig-gender"
                  value={gender}
                  onChange={e => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 bg-white"
                >
                  <option value="Male">Male (90-day interval)</option>
                  <option value="Female">Female (120-day interval)</option>
                  <option value="Other">Other (90-day interval)</option>
                </select>
                <span className="text-[11px] text-slate-400">Determines recovery window</span>
              </div>
            </div>

            {/* Weight */}
            <div>
              <label htmlFor="elig-weight" className="block text-xs font-semibold text-slate-700 mb-1">
                Body Weight (kg)
              </label>
              <input
                id="elig-weight"
                type="number"
                min={30}
                max={160}
                value={weightKg}
                onChange={e => setWeightKg(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs font-semibold font-mono tabular-data rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600"
                required
              />
              <span className="text-[11px] text-slate-400">Minimum 45 kg required</span>
            </div>

            {/* Last Donation */}
            <div className="space-y-3">
              <div>
                <label htmlFor="elig-last-donation" className="block text-xs font-semibold text-slate-700 mb-1">
                  Previous Blood Donation
                </label>
                <select
                  id="elig-last-donation"
                  value={lastDonation}
                  onChange={e => setLastDonation(e.target.value as 'never' | 'more_than_3_months' | 'recent')}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 bg-white"
                >
                  <option value="never">First-time donor (Never donated before)</option>
                  <option value="more_than_3_months">More than 4 months ago</option>
                  <option value="recent">Donated recently (calculate exact next date)</option>
                </select>
              </div>

              {lastDonation === 'recent' && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label htmlFor="elig-last-date" className="block text-xs font-semibold text-slate-800">
                      Date of Last Donation
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Calculates your exact {minRecoveryDays}-day clearance date
                    </p>
                  </div>
                  <input
                    id="elig-last-date"
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={lastDonationDate}
                    onChange={e => setLastDonationDate(e.target.value)}
                    className="px-3 py-1.5 text-xs font-mono font-semibold rounded-lg border border-slate-300 bg-white text-slate-900"
                  />
                </div>
              )}
            </div>

            {/* Health Checklist */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="block text-xs font-semibold text-slate-800">
                Recent Medical &amp; Lifestyle Screening
              </span>

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={hasTattooOrPiercing}
                  onChange={e => setHasTattooOrPiercing(e.target.checked)}
                  className="rounded text-rose-700 focus:ring-rose-600 h-4 w-4 mt-0.5"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  Tattoo, ear/body piercing, acupuncture, or dental extraction within the <strong>last 6 months</strong>
                </span>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={hasActiveInfection}
                  onChange={e => setHasActiveInfection(e.target.checked)}
                  className="rounded text-rose-700 focus:ring-rose-600 h-4 w-4 mt-0.5"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  Fever, cold, active antibiotic medication, or feeling unwell within the <strong>last 14 days</strong>
                </span>
              </label>

              {gender === 'Female' && (
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={isPregnantOrLactating}
                    onChange={e => setIsPregnantOrLactating(e.target.checked)}
                    className="rounded text-rose-700 focus:ring-rose-600 h-4 w-4 mt-0.5"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    Currently pregnant, delivered within the past 12 months, or currently lactating
                  </span>
                </label>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors cursor-pointer"
              >
                Evaluate My Eligibility
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-5">
            {isEligible ? (
              <div className="p-6 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-2.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-display font-bold text-emerald-950">
                  Cleared for Whole Blood Donation
                </h3>
                <p className="text-xs text-emerald-800 leading-relaxed max-w-sm mx-auto">
                  You meet the primary NBTC criteria. A single 350–450 mL donation separates into red cells, platelets, and plasma to support up to 3 patients.
                </p>
                <div className="text-[11px] font-medium text-emerald-800 flex items-center justify-center gap-1.5 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Quick on-site hemoglobin check (&ge; 12.5 g/dL) is performed at arrival</span>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-display font-bold text-amber-950">
                      Temporary Deferral Advised
                    </h3>
                    <p className="text-xs text-amber-800">
                      Please review the clinical observations below:
                    </p>
                  </div>
                </div>

                {calculatedNextEligibleDate && daysRemaining > 0 && (
                  <div className="p-3 rounded-lg bg-white border border-amber-200 flex items-center justify-between text-xs">
                    <span className="text-slate-600">Calculated Next Eligible Date</span>
                    <span className="font-mono font-bold text-slate-950 tabular-data">
                      {calculatedNextEligibleDate} ({daysRemaining} days left)
                    </span>
                  </div>
                )}

                <ul className="space-y-1.5 pt-2 border-t border-amber-200 text-xs text-amber-900 list-disc list-inside">
                  {deferralReasons.map(reason => (
                    <li key={reason} className="leading-relaxed">
                      {reason}
                    </li>
                  ))}
                </ul>

                <p className="text-[11px] text-amber-800">
                  Temporary deferrals protect both your iron stores and patient safety. You are welcome back as soon as the window clears.
                </p>
              </div>
            )}

            <div className="space-y-2.5">
              {isEligible && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {onOpenBooking ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenBooking();
                      }}
                      className="py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Book Donation Slot</span>
                    </button>
                  ) : (
                    onOpenCamps && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenCamps();
                        }}
                        className="py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Browse Blood Camps</span>
                      </button>
                    )
                  )}

                  {onOpenRegister && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenRegister();
                      }}
                      className="py-2.5 px-4 rounded-lg text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Heart className="w-4 h-4 text-rose-700" />
                      <span>Register as Donor</span>
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setEvaluated(false)}
                className="w-full py-2.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Re-take Eligibility Check
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
