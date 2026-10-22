import React, { useState } from 'react';
import { X, Piano, Wind, Music, Drum, Volume2, Sparkles, Megaphone, Disc, Radio, Check } from 'lucide-react';
import { BDO_INSTRUMENTS, InstrumentId, InstrumentInfo } from '../types/music.ts';

interface AddInstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectInstrument: (instrumentId: InstrumentId) => void;
  title?: string;
  subtitle?: string;
  initialInstrumentId?: InstrumentId;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Piano: <Piano className="w-10 h-10 text-amber-400" />,
  Wind: <Wind className="w-10 h-10 text-sky-400" />,
  Music: <Music className="w-10 h-10 text-orange-400" />,
  Drum: <Drum className="w-10 h-10 text-emerald-400" />,
  Guitar: <Music className="w-10 h-10 text-amber-500" />,
  Volume2: <Volume2 className="w-10 h-10 text-rose-400" />,
  Sparkles: <Sparkles className="w-10 h-10 text-purple-400" />,
  Megaphone: <Megaphone className="w-10 h-10 text-yellow-400" />,
  Disc: <Disc className="w-10 h-10 text-teal-400" />,
  Radio: <Radio className="w-10 h-10 text-emerald-300" />,
};

export const AddInstrumentModal: React.FC<AddInstrumentModalProps> = ({
  isOpen,
  onClose,
  onSelectInstrument,
  title = 'Adicionar Instrumento',
  subtitle = 'Escolha o instrumento da nova faixa (todos também exportáveis para o Black Desert)',
  initialInstrumentId = 'grand-piano',
}) => {
  const [selectedId, setSelectedId] = useState<InstrumentId>(initialInstrumentId);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedId(initialInstrumentId);
    }
  }, [isOpen, initialInstrumentId]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onSelectInstrument(selectedId);
    onClose();
  };

  return (
    <div
      className="modal-overlay animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl modal-panel p-6 text-stone-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-inst-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2d2722] pb-4 mb-4">
          <div>
            <h2 id="add-inst-title" className="modal-title">
              {title}
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instruments Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 overflow-y-auto pr-1 py-2 flex-1">
          {BDO_INSTRUMENTS.map((inst: InstrumentInfo) => {
            const isSelected = selectedId === inst.id;
            return (
              <button
                key={inst.id}
                onClick={() => setSelectedId(inst.id)}
                className={`relative flex flex-col items-center text-center p-4 rounded-xl border transition-all text-left group ${
                  isSelected
                    ? 'border-amber-500 bg-gradient-to-b from-amber-950/60 to-stone-900 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                    : 'border-[#2d2722] bg-stone-900/60 hover:border-amber-700/50 hover:bg-stone-850'
                }`}
              >
                {/* Active check indicator */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-stone-950 shadow">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                )}

                {/* Instrument Icon Graphic */}
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105 ${
                    isSelected ? 'bg-amber-500/20 shadow-inner' : 'bg-stone-800/80'
                  }`}
                >
                  {ICON_MAP[inst.iconName] || <Music className="w-8 h-8 text-amber-400" />}
                </div>

                {/* Instrument Name */}
                <span className={`font-semibold text-sm mb-1 ${isSelected ? 'text-amber-300' : 'text-stone-200'}`}>
                  {inst.name}
                </span>

                {/* BDO Mnemonic Tag */}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-950/80 border border-stone-800 text-amber-400/90 mb-2">
                  BDO {inst.bdoMnemonic}
                </span>

                {/* Short description */}
                <span className="text-[11px] text-stone-400 line-clamp-2 leading-tight">
                  {inst.description}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-[#2d2722] flex items-center justify-between text-xs text-stone-400">
          <span>Escolha o tipo de instrumento para adicionar à partitura.</span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-colors shadow-[0_0_12px_rgba(245,158,11,0.3)]"
            >
              Adicionar Faixa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
