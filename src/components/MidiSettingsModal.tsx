import React, { useState, useEffect } from 'react';
import { X, Radio, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { WebMidiManager, MidiDevice } from '../midi/webMidi.ts';
import { pitchToNoteName } from '../utils/musicMath.ts';

interface MidiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  midiManager: WebMidiManager;
}

export const MidiSettingsModal: React.FC<MidiSettingsModalProps> = ({
  isOpen,
  onClose,
  midiManager,
}) => {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [status, setStatus] = useState<'idle' | 'connected' | 'unsupported' | 'denied'>('idle');
  const [lastNote, setLastNote] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (!midiManager.getSupported()) {
      setStatus('unsupported');
      return;
    }

    midiManager.requestAccess().then((success) => {
      if (success) {
        setStatus('connected');
        setDevices(midiManager.getDevices());
      } else {
        setStatus('denied');
      }
    });

    midiManager.setDevicesChangedListener((devs) => {
      setDevices(devs);
    });

    const unsubscribe = midiManager.onNote((event) => {
      if (event.type === 'noteon') {
        setLastNote(`${pitchToNoteName(event.pitch)} (Vel: ${event.velocity})`);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, midiManager]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#161412] border border-[#3e342b] rounded-2xl shadow-2xl p-6 text-stone-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="midi-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2d2722] pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-amber-500 animate-pulse" />
            <h2 id="midi-title" className="text-lg font-bold text-amber-400 font-serif">
              Interface Web MIDI
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status description */}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-900 border border-stone-800 text-xs">
            <span className="text-stone-400">Status da Conexão:</span>
            {status === 'connected' && (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" /> MIDI Ativo & Pronto
              </span>
            )}
            {status === 'unsupported' && (
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <AlertCircle className="w-4 h-4" /> Navegador sem Web MIDI
              </span>
            )}
            {status === 'denied' && (
              <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                <AlertCircle className="w-4 h-4" /> Acesso MIDI Negado
              </span>
            )}
          </div>

          {/* Connected Devices List */}
          <div>
            <h3 className="text-xs font-semibold text-stone-300 uppercase tracking-wider mb-2">
              Controladores Detectados ({devices.length})
            </h3>
            {devices.length === 0 ? (
              <div className="p-4 rounded-xl bg-stone-950/60 border border-dashed border-stone-800 text-center text-xs text-stone-500">
                Nenhum teclado ou controlador MIDI USB detectado no momento. Conecte seu dispositivo para tocar em tempo real.
              </div>
            ) : (
              <div className="space-y-2">
                {devices.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-amber-300">{d.name}</div>
                      <div className="text-[11px] text-stone-400">{d.manufacturer || 'MIDI Controller'}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 font-mono text-[10px]">
                      Conectado
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live note monitor */}
          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between text-xs">
            <span className="text-stone-400">Última Nota Recebida:</span>
            <span className="font-mono text-amber-400 font-bold">{lastNote || 'Aguardando toque...'}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[#2d2722] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
