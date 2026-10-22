import React, { useState, useRef, useEffect, useCallback } from 'react';

interface KnobProps {
  label: string;
  value: number; // 0 to 100
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  size?: number;
  compact?: boolean; // small label, for dense layouts like the mixer
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  unit = '',
  size = 64,
  compact = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(value);

  // Map 0 - 100 to angle: -135deg to +135deg (total 270 degrees)
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + normalized * 270;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = value;
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dy = startYRef.current - e.clientY;
      const range = max - min;
      // Moving 150px traverses the entire range
      const deltaVal = (dy / 150) * range;
      const newVal = Math.max(min, Math.min(max, Math.round(startValRef.current + deltaVal)));
      onChange(newVal);
    },
    [isDragging, max, min, onChange]
  );

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture released
      }
      setIsDragging(false);
    }
  };

  return (
    <div className="flex flex-col items-center select-none text-stone-300">
      <span
        className={
          compact
            ? 'text-[9px] font-medium text-amber-200/80 mb-1 uppercase'
            : 'text-xs font-medium text-amber-200/80 mb-2 uppercase tracking-wider'
        }
      >
        {label}
      </span>
      <div
        className="relative cursor-ns-resize group touch-none"
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title={`${label}: ${value}${unit}`}
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
      >
        {/* Outer Ring */}
        <div className="absolute inset-0 rounded-full border-2 border-stone-800 bg-stone-900 shadow-inner group-hover:border-amber-700/60 transition-colors" />

        {/* Value Arc Tracker */}
        <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 36 36">
          <path
            className="text-stone-800"
            strokeWidth="2.5"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            strokeDasharray="75, 100"
            strokeDashoffset="-12.5"
          />
          <path
            className="text-amber-500/90 transition-all duration-75"
            strokeWidth="2.8"
            strokeDasharray={`${normalized * 75}, 100`}
            strokeDashoffset="-12.5"
            strokeLinecap="round"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>

        {/* Rotating Inner Cap */}
        <div
          className="absolute inset-1.5 rounded-full bg-gradient-to-b from-stone-800 to-stone-950 border border-stone-700 shadow-md flex items-center justify-center transition-transform"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* Indicator Notch / Needle */}
          <div className="absolute top-1.5 w-1 h-3 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
        </div>
      </div>

      {/* Numeric Readout Box */}
      <div className="mt-2 px-2.5 py-0.5 rounded bg-stone-950/90 border border-stone-800 text-xs font-mono text-amber-400 min-w-[36px] text-center shadow-inner">
        {value}
        {unit}
      </div>
    </div>
  );
};
