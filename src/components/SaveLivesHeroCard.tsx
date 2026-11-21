import { useState } from 'react';
import { ArrowRight, Droplet } from 'lucide-react';
import heroDonationImg from '../assets/images/hero_clinical_donation_1795168582519.jpg';

interface SaveLivesHeroCardProps {
  onBookDonation: () => void;
}

const HERO_IMAGE_PATH = heroDonationImg;

export default function SaveLivesHeroCard({ onBookDonation }: SaveLivesHeroCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="w-full h-full flex flex-col rounded-2xl bg-white border border-slate-200 overflow-hidden">
      {/* High-Fidelity Clinical Editorial Photograph */}
      <div className="relative aspect-[4/3] lg:flex-1 lg:min-h-[300px] w-full overflow-hidden bg-slate-100">
        {!imgFailed ? (
          <img
            src={HERO_IMAGE_PATH}
            alt="Clinical nurse preparing sterile blood collection equipment inside a sunlit modern hospital donation center"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-100 via-rose-50/40 to-slate-100 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-700/10 text-rose-700 flex items-center justify-center mb-3">
              <Droplet className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Accredited Blood Collection Network</p>
            <p className="text-xs text-slate-500 mt-1">100% single-use sterile kits · 2°C–6°C cold-chain verified</p>
          </div>
        )}

        {/* Measured contrast scrim for crisp legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent" />

        {/* Editorial caption on image */}
        <div className="absolute bottom-5 left-5 right-5 text-white">
          <p className="text-xs font-medium text-rose-200">
            One 350 mL donation · Separates into 3 life-saving components
          </p>
          <h3 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-white mt-1">
            Safe, sterile donation in 15 minutes.
          </h3>
        </div>
      </div>

      {/* Quiet Clinical Footer Strip inside Hero Visual */}
      <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-4">
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-slate-900">100% NAT Screened</span>
          <span className="mx-1.5 text-slate-300">·</span>
          <span>Single-use sterile kits</span>
        </div>

        <button
          type="button"
          onClick={onBookDonation}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <span>Schedule a Slot</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
