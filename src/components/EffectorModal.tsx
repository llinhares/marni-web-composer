import React from 'react';
import { X, Sliders } from 'lucide-react';
import type { EffectorSettings } from '../types/music.ts';
import { Knob } from './Knob.tsx';

interface EffectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EffectorSettings;
  onChange: (updated: EffectorSettings) => void;
}

export const EffectorModal: React.FC<EffectorModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#1c1917] border border-[#3e342b] rounded-xl shadow-2xl p-6 text-stone-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="effector-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2d2722] pb-4 mb-6">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-500" />
            <h2 id="effector-title" className="text-lg font-semibold tracking-wide text-amber-400 font-serif">
              Effector
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
            aria-label="Fechar Effector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Effector Rack Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-[#2d2722]">
          {/* Reverb Section */}
          <div className="flex flex-col items-center pt-2 md:pt-0">
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`w-2 h-2 rounded-full ${
                  settings.reverb.enabled ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-stone-600'
                }`}
              />
              <button
                onClick={() =>
                  onChange({
                    ...settings,
                    reverb: { ...settings.reverb, enabled: !settings.reverb.enabled },
                  })
                }
                className="font-medium text-amber-400 hover:text-amber-300 text-sm tracking-wide"
              >
                Reverb
              </button>
            </div>
            <div className="flex items-center gap-6">
              <Knob
                label="Time"
                value={settings.reverb.time}
                onChange={(val) =>
                  onChange({
                    ...settings,
                    reverb: { ...settings.reverb, time: val },
                  })
                }
              />
              <Knob
                label="Mix"
                value={settings.reverb.mix}
                onChange={(val) =>
                  onChange({
                    ...settings,
                    reverb: { ...settings.reverb, mix: val },
                  })
                }
              />
            </div>
          </div>

          {/* Delay Section */}
          <div className="flex flex-col items-center pt-4 md:pt-0 md:pl-6">
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`w-2 h-2 rounded-full ${
                  settings.delay.enabled ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-stone-600'
                }`}
              />
              <button
                onClick={() =>
                  onChange({
                    ...settings,
                    delay: { ...settings.delay, enabled: !settings.delay.enabled },
                  })
                }
                className="font-medium text-amber-400 hover:text-amber-300 text-sm tracking-wide"
              >
                Delay
              </button>
            </div>
            <div className="flex items-center gap-6">
              <Knob
                label="Feedback"
                value={settings.delay.feedback}
                onChange={(val) =>
                  onChange({
                    ...settings,
                    delay: { ...settings.delay, feedback: val },
                  })
                }
              />
              <Knob
                label="Time"
                value={settings.delay.time}
                onChange={(val) =>
                  onChange({
                    ...settings,
                    delay: { ...settings.delay, time: val },
                  })
                }
              />
            </div>
          </div>

          {/* Chorus Section */}
          <div className="flex flex-col items-center pt-4 md:pt-0 md:pl-6">
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`w-2 h-2 rounded-full ${
                  settings.chorus.enabled ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-stone-600'
                }`}
              />
              <button
                onClick={() =>
                  onChange({
                    ...settings,
                    chorus: { ...settings.chorus, enabled: !settings.chorus.enabled },
                  })
                }
                className="font-medium text-amber-400 hover:text-amber-300 text-sm tracking-wide"
              >
                Chorus
              </button>
            </div>
            <div className="flex items-center gap-4 flex-wrap justify-center">
              <Knob
                label="Feedback"
                size={56}
                value={settings.chorus.feedback}
                onChange={(val) =>
                  onChange({
                    ...settings,
                    chorus: { ...settings.chorus, feedback: val },
                  })
                }
              />
              <Knob
                label="LFO Depth"
                size={56}
                value={settings.chorus.lfoDepth}
                onChange={(val) =>
                  onChange({
                    ...settings,
                    chorus: { ...settings.chorus, lfoDepth: val },
                  })
                }
              />
              <Knob
                label="LFO Freq"
                size={56}
                value={settings.chorus.lfoFrequency}
                onChange={(val) =>
                  onChange({
                    ...settings,
                    chorus: { ...settings.chorus, lfoFrequency: val },
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-8 pt-4 border-t border-[#2d2722] flex items-center justify-between text-xs text-stone-400">
          <span>AUX Send: Ajuste o envio por faixa no painel à esquerda.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-amber-600/30 hover:bg-amber-600/50 border border-amber-600/50 text-amber-300 font-medium transition-colors"
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
};
