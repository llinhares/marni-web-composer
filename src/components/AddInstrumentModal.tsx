import React, { useEffect, useState } from 'react';
import { X, Wind, Music, Piano, Drum, Check } from 'lucide-react';
import {
  BDO_INSTRUMENT_DEFS,
  BDO_TABS,
  BDO_TIER_NAMES,
  getBdoInstrument,
  type BdoInstrumentKey,
  type BdoTab,
  type BdoTier,
} from '../bdo/bdoInstruments.ts';

interface AddInstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectInstrument: (key: BdoInstrumentKey) => void;
  title?: string;
  subtitle?: string;
  /** Instrument shown as current (when changing a track's instrument). */
  initialInstrument?: BdoInstrumentKey;
}

const TAB_ICONS: Record<BdoTab, React.ReactNode> = {
  flute: <Wind className="w-4 h-4" />,
  strings: <Music className="w-4 h-4" />,
  keys: <Piano className="w-4 h-4" />,
  percussion: <Drum className="w-4 h-4" />,
};

// Card colours of the game's three tiers
const TIER_STYLE: Record<BdoTier, string> = {
  beginner: 'bg-[#25272c] border-[#3a3d44] hover:border-stone-400/60',
  florchestra: 'bg-[#3a2a20] border-[#6b4a32] hover:border-amber-500/70',
  marnis: 'bg-[#26301f] border-[#4c5e37] hover:border-lime-400/60',
};

/**
 * Instrument picker laid out like the game's "Adicionar Instrumento" window: the four tabs and the
 * Para Novato / Florquestra / Marnis cards. Every choice is exported to Black Desert as that instrument.
 */
export const AddInstrumentModal: React.FC<AddInstrumentModalProps> = ({
  isOpen,
  onClose,
  onSelectInstrument,
  title = 'Adicionar Instrumento',
  subtitle = 'Os mesmos instrumentos do compositor do Black Desert',
  initialInstrument,
}) => {
  const [tab, setTab] = useState<BdoTab>('keys');

  useEffect(() => {
    if (isOpen) setTab(getBdoInstrument(initialInstrument)?.tab ?? 'keys');
  }, [isOpen, initialInstrument]);

  if (!isOpen) return null;

  const choose = (key: BdoInstrumentKey) => {
    onSelectInstrument(key);
    onClose();
  };

  return (
    <div className="modal-overlay animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="w-full max-w-4xl modal-panel text-stone-200 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-inst-title"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <h2 id="add-inst-title" className="modal-title">
              {title}
            </h2>
            <p className="modal-subtitle">{subtitle}</p>
          </div>
          <button onClick={onClose} className="modal-close" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex justify-center gap-1 sm:gap-6 border-b border-[#2d2722] px-4" role="tablist">
          {BDO_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 sm:px-6 py-2.5 text-xs sm:text-sm border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-stone-200 text-stone-100 font-semibold' : 'border-transparent text-stone-500 hover:text-stone-300'
              }`}
            >
              {TAB_ICONS[t.id]}
              {t.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-4 overflow-y-auto flex-1 min-h-[240px] content-start">
          {BDO_INSTRUMENT_DEFS.filter((d) => d.tab === tab).map((d) => {
            const current = d.key === initialInstrument;
            return (
              <button
                key={d.key}
                onClick={() => choose(d.key)}
                className={`relative text-left rounded-md border p-3 min-h-[88px] transition-colors ${TIER_STYLE[d.tier]} ${
                  current ? 'ring-2 ring-amber-400' : ''
                }`}
                title={`${BDO_TIER_NAMES[d.tier]} · ${d.name}${d.sounds > 1 ? ' (4 sons, escolha na faixa)' : ''}`}
              >
                {current && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                )}
                <span className="block text-[11px] text-stone-400">{BDO_TIER_NAMES[d.tier]}</span>
                <span className="block text-sm sm:text-[15px] font-semibold text-stone-100 leading-snug mt-0.5">{d.name}</span>
                {d.sounds > 1 && <span className="block text-[10px] text-lime-300/70 mt-1">4 sons</span>}
                {d.drumKit && <span className="block text-[10px] text-amber-300/70 mt-1">17 peças</span>}
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#2d2722] py-3 text-center text-xs text-stone-400">Selecione o instrumento.</div>
      </div>
    </div>
  );
};
