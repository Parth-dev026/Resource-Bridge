import React, { useState } from 'react';
import {
  Activity,
  Box,
  Cpu,
  Microscope,
  Monitor,
  Users,
  Wrench,
} from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  code?: string;
  category?: string;
  className?: string;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  code,
  category,
  className = 'w-full h-full object-cover',
}) => {
  const [hasError, setHasError] = useState(false);

  // Render a friendly, domain-specific educational card background
  const renderFallback = () => {
    const text = (alt + ' ' + (code || '') + ' ' + (category || '')).toLowerCase();

    let Icon = Cpu;
    let badgeColor = 'bg-teal-900/80 text-teal-200 border-teal-700/50';
    let gradient = 'from-slate-900 via-slate-800 to-teal-950';

    if (text.includes('computer') || text.includes('lab 2') || text.includes('workstation')) {
      Icon = Monitor;
      badgeColor = 'bg-blue-900/80 text-blue-200 border-blue-700/50';
      gradient = 'from-slate-900 via-slate-800 to-blue-950';
    } else if (text.includes('3d') || text.includes('maker') || text.includes('print')) {
      Icon = Box;
      badgeColor = 'bg-amber-900/80 text-amber-200 border-amber-700/50';
      gradient = 'from-slate-900 via-slate-800 to-amber-950';
    } else if (text.includes('microscope') || text.includes('biology') || text.includes('science')) {
      Icon = Microscope;
      badgeColor = 'bg-emerald-900/80 text-emerald-200 border-emerald-700/50';
      gradient = 'from-slate-900 via-slate-800 to-emerald-950';
    } else if (text.includes('multimeter') || text.includes('circuit') || text.includes('toolkit')) {
      Icon = Wrench;
      badgeColor = 'bg-orange-900/80 text-orange-200 border-orange-700/50';
      gradient = 'from-slate-900 via-slate-800 to-orange-950';
    } else if (text.includes('seminar') || text.includes('room') || text.includes('collaboration')) {
      Icon = Users;
      badgeColor = 'bg-indigo-900/80 text-indigo-200 border-indigo-700/50';
      gradient = 'from-slate-900 via-slate-800 to-indigo-950';
    } else if (text.includes('robot') || text.includes('arduino')) {
      Icon = Cpu;
      badgeColor = 'bg-teal-900/80 text-teal-200 border-teal-700/50';
      gradient = 'from-slate-900 via-slate-800 to-teal-950';
    }

    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br ${gradient} text-slate-200 p-6 select-none relative overflow-hidden ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center mb-2.5 backdrop-blur-xs">
            <Icon className="w-6 h-6 text-teal-300" />
          </div>
          {code && (
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded border mb-1.5 ${badgeColor}`}>
              {code}
            </span>
          )}
          <span className="text-xs font-semibold text-slate-100 max-w-[28ch] line-clamp-2">
            {alt}
          </span>
          <span className="text-[10px] text-slate-400 mt-1">School &amp; College Shared Resource</span>
        </div>
      </div>
    );
  };

  if (hasError || !src) {
    return renderFallback();
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
};
