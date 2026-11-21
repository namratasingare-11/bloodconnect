import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: 'neutral' | 'crimson' | 'emerald' | 'amber';
  compact?: boolean;
}

const VALUE_TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'text-slate-950',
  crimson: 'text-rose-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
};

const LABEL_TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'text-slate-500',
  crimson: 'text-rose-700',
  emerald: 'text-slate-500',
  amber: 'text-slate-500',
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  sublabel,
  tone = 'neutral',
  compact = false,
}) => {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${compact ? 'p-4' : 'p-5'}`}>
      <div className={`text-xs font-medium mb-1.5 ${LABEL_TONE_CLASSES[tone]}`}>{label}</div>
      <div
        className={`${compact ? 'text-2xl' : 'text-3xl'} font-display font-bold font-mono tabular-data ${VALUE_TONE_CLASSES[tone]}`}
      >
        {value}
      </div>
      {sublabel && <span className="text-xs text-slate-500 mt-1 block">{sublabel}</span>}
    </div>
  );
};
