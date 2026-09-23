import { useState, useRef } from 'react';
import { useComposerStore } from '@/store/useComposerStore';
import { updateEffector } from '@/core/audio/ToneEngine';
import { X } from 'lucide-react';

interface KnobProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
}

const Knob = ({ label, value, onChange }: KnobProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    startY.current = e.clientY || (e as any).touches?.[0]?.clientY || 0;
    startVal.current = value;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const currentY = e.clientY || (e as any).touches?.[0]?.clientY || 0;
    const deltaY = startY.current - currentY; 
    let newVal = startVal.current + (deltaY * 0.8);
    newVal = Math.max(0, Math.min(100, Math.round(newVal)));
    onChange(newVal);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const rotation = -135 + (value / 100) * 270;

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[11px] text-[#8B8276] tracking-wide text-center max-w-[80px] leading-tight">{label}</span>
      
      <div 
        className="w-[48px] h-[48px] md:w-[52px] md:h-[52px] rounded-full bg-[#171513] border border-[#352F2A] shadow-[inset_0_4px_8px_rgba(0,0,0,0.8),_0_2px_4px_rgba(0,0,0,0.5)] relative cursor-ns-resize group touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="absolute inset-0 rounded-full transition-transform group-active:scale-95 duration-75" style={{ transform: `rotate(${rotation}deg)` }}>
          <div className="absolute top-1.5 left-1/2 w-[2px] h-[14px] md:h-4 bg-[#C4B9AA] -translate-x-1/2 rounded-full shadow-[0_0_3px_rgba(196,185,170,0.6)]" />
        </div>
      </div>

      <div className="w-10 md:w-12 rounded-sm bg-[#1C1917] border border-[#352F2A] py-0.5 text-center shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
        <span className="text-[10px] md:text-[11px] text-[#C4B9AA] font-mono">{value}</span>
      </div>
    </div>
  );
};

interface EffectorModalProps {
  onClose: () => void;
}

import { useShallow } from 'zustand/react/shallow';

export function EffectorModal({ onClose }: EffectorModalProps) {
  const { effectorSettings, setEffectorSettings } = useComposerStore(useShallow(state => ({
    effectorSettings: state.effectorSettings, setEffectorSettings: state.setEffectorSettings
  })));

  const handleUpdate = (key: keyof typeof effectorSettings, value: number) => {
    const newSettings = { ...effectorSettings, [key]: value };
    setEffectorSettings(newSettings);
    updateEffector(newSettings);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="fixed left-1/2 top-1/2 z-50 flex w-[90%] md:w-max max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-[#3E3832] bg-[#231F1C] shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden">
        
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#352F2A] bg-[#26221E] shrink-0">
          <span className="text-[13px] font-medium text-[#DAB16C]">Effector</span>
          <button onClick={onClose} className="text-[#8B8276] hover:text-[#DAB16C] transition-colors p-1">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-col md:flex-row px-4 md:px-8 py-6 gap-6 md:gap-8 overflow-y-auto items-center md:items-stretch">
          
          <div className="flex flex-col items-center gap-4 md:gap-5 w-full md:w-auto">
            <span className="text-xs font-semibold text-[#DAB16C]">Reverb</span>
            <Knob label="Time" value={effectorSettings.reverbTime} onChange={(val) => handleUpdate('reverbTime', val)} />
          </div>

          <div className="w-full h-px md:w-px md:h-auto bg-gradient-to-r md:bg-gradient-to-b from-transparent via-[#352F2A] to-transparent my-2 md:my-0 md:mx-2 shrink-0" />

          <div className="flex flex-col items-center gap-4 md:gap-5 w-full md:w-auto">
            <span className="text-xs font-semibold text-[#DAB16C]">Delay</span>
            <Knob label="Feedback" value={effectorSettings.delayFeedback} onChange={(val) => handleUpdate('delayFeedback', val)} />
          </div>

          <div className="w-full h-px md:w-px md:h-auto bg-gradient-to-r md:bg-gradient-to-b from-transparent via-[#352F2A] to-transparent my-2 md:my-0 md:mx-2 shrink-0" />

          <div className="flex flex-col items-center gap-4 md:gap-5 w-full md:w-auto">
            <span className="text-xs font-semibold text-[#DAB16C]">Chorus</span>
            <div className="flex flex-wrap md:flex-nowrap justify-center gap-4 md:gap-6">
              <Knob label="Feedback" value={effectorSettings.chorusFeedback} onChange={(val) => handleUpdate('chorusFeedback', val)} />
              <Knob label="LFO Depth" value={effectorSettings.chorusDepth} onChange={(val) => handleUpdate('chorusDepth', val)} />
              <Knob label="LFO Frequency" value={effectorSettings.chorusFreq} onChange={(val) => handleUpdate('chorusFreq', val)} />
            </div>
          </div>

        </div>
      </div>
    </>
  );
}