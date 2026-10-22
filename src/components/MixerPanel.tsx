import React, { useEffect, useRef } from 'react';
import { X, SlidersVertical } from 'lucide-react';
import type { Track, TrackMixer } from '../types/music.ts';
import { Knob } from './Knob.tsx';
import { EQ_BANDS, dbToMeter, meterFall, mixerOf, peakToDb } from '../audio/mixer.ts';

interface MixerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  activeTrackId: string;
  onSelectTrack: (id: string) => void;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
  /** Current linear peaks (null when the engine is not running). */
  readPeaks: () => { tracks: Record<string, number>; master: number } | null;
}

/** Vertical peak meter driven by requestAnimationFrame (writes the DOM directly, no re-renders). */
const useMeters = (isOpen: boolean, readPeaks: MixerPanelProps['readPeaks']) => {
  const bars = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (!isOpen) return;
    const levels = new Map<string, number>();
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const peaks = readPeaks();
      bars.current.forEach((el, id) => {
        const peak = id === '__master' ? peaks?.master ?? 0 : peaks?.tracks[id] ?? 0;
        const db = meterFall(levels.get(id) ?? -120, peakToDb(peak), dt);
        levels.set(id, db);
        el.style.transform = `scaleY(${dbToMeter(db)})`;
        el.style.background = db > -1 ? '#ef4444' : db > -9 ? '#f59e0b' : '#22c55e';
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isOpen, readPeaks]);
  return (id: string) => (el: HTMLDivElement | null) => {
    if (el) bars.current.set(id, el);
    else bars.current.delete(id);
  };
};

const Meter: React.FC<{ barRef: (el: HTMLDivElement | null) => void; label: string }> = ({ barRef, label }) => (
  <div className="relative w-2.5 h-28 rounded-sm bg-stone-950 border border-stone-800 overflow-hidden" aria-label={label}>
    <div ref={barRef} className="absolute inset-x-0 bottom-0 h-full origin-bottom" style={{ transform: 'scaleY(0)' }} />
  </div>
);

export const MixerPanel: React.FC<MixerPanelProps> = ({
  isOpen,
  onClose,
  tracks,
  activeTrackId,
  onSelectTrack,
  onUpdateTrack,
  readPeaks,
}) => {
  const meterRef = useMeters(isOpen, readPeaks);
  if (!isOpen) return null;

  const setMixer = (track: Track, patch: Partial<TrackMixer>) =>
    onUpdateTrack(track.id, { mixer: { ...mixerOf(track), ...patch } });

  return (
    <div
      className="fixed inset-x-0 bottom-14 z-40 bg-[#161412]/98 border-t border-[#3e342b] shadow-2xl backdrop-blur-md"
      role="dialog"
      aria-label="Mixer"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2d2722]">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
          <SlidersVertical className="w-4 h-4" /> Mixer
        </div>
        <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-100" aria-label="Fechar mixer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2 p-3 overflow-x-auto">
        {tracks.map((track) => {
          const m = mixerOf(track);
          const active = track.id === activeTrackId;
          return (
            <div
              key={track.id}
              className={`shrink-0 w-44 rounded-xl border p-2 flex flex-col gap-2 text-[10px] text-stone-300 ${
                active ? 'border-amber-500/60 bg-amber-950/10' : 'border-[#2d2722] bg-stone-900/50'
              }`}
            >
              <button
                onClick={() => onSelectTrack(track.id)}
                className="flex items-center gap-1.5 text-left font-semibold text-xs text-stone-100 truncate"
                title={track.name}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: track.color }} />
                <span className="truncate">{track.name}</span>
              </button>

              <div className="grid grid-cols-3 gap-1.5 text-[9px]">
                {EQ_BANDS.map((band) => (
                  <Knob
                    key={band.key}
                    label={band.label}
                    value={m[band.key]}
                    min={-12}
                    max={12}
                    unit="dB"
                    size={30}
                    compact
                    onChange={(v) => setMixer(track, { [band.key]: Math.round(v * 2) / 2 })}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between gap-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={m.compressor}
                    onChange={(e) => setMixer(track, { compressor: e.target.checked })}
                    className="accent-amber-500"
                  />
                  Comp
                </label>
                <input
                  type="range"
                  min={-40}
                  max={0}
                  value={m.compThreshold}
                  disabled={!m.compressor}
                  onChange={(e) => setMixer(track, { compThreshold: Number(e.target.value) })}
                  className="w-16 accent-amber-500 disabled:opacity-40"
                  title={`Limiar ${m.compThreshold} dB • razão ${m.compRatio}:1`}
                  aria-label="Limiar do compressor"
                />
              </div>

              <div className="flex items-end justify-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={track.volume}
                  onChange={(e) => onUpdateTrack(track.id, { volume: Number(e.target.value) })}
                  className="h-28 accent-amber-500 [writing-mode:vertical-lr] [direction:rtl]"
                  aria-label={`Volume ${track.name}`}
                  title={`Volume ${track.volume}`}
                />
                <Meter barRef={meterRef(track.id)} label={`Nível ${track.name}`} />
              </div>

              <input
                type="range"
                min={-100}
                max={100}
                value={Math.round(track.pan * 100)}
                onChange={(e) => onUpdateTrack(track.id, { pan: Number(e.target.value) / 100 })}
                onDoubleClick={() => onUpdateTrack(track.id, { pan: 0 })}
                className="w-full accent-amber-500"
                title={`Pan ${Math.round(track.pan * 100)} (duplo clique centraliza)`}
                aria-label={`Pan ${track.name}`}
              />

              <div className="flex gap-1">
                <button
                  onClick={() => onUpdateTrack(track.id, { isMuted: !track.isMuted })}
                  className={`flex-1 py-0.5 rounded font-bold ${track.isMuted ? 'bg-red-600 text-white' : 'bg-stone-800 text-stone-400'}`}
                  aria-pressed={track.isMuted}
                >
                  M
                </button>
                <button
                  onClick={() => onUpdateTrack(track.id, { isSolo: !track.isSolo })}
                  className={`flex-1 py-0.5 rounded font-bold ${track.isSolo ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400'}`}
                  aria-pressed={track.isSolo}
                >
                  S
                </button>
                <button
                  onClick={() => onUpdateTrack(track.id, { auxSend: !track.auxSend })}
                  className={`flex-1 py-0.5 rounded font-bold ${track.auxSend ? 'bg-sky-700 text-white' : 'bg-stone-800 text-stone-400'}`}
                  aria-pressed={track.auxSend}
                  title="Envio para os efeitos (reverb/delay/chorus)"
                >
                  FX
                </button>
              </div>
            </div>
          );
        })}

        <div className="shrink-0 w-20 rounded-xl border border-[#3e342b] bg-stone-950/60 p-2 flex flex-col items-center gap-2 text-[10px] text-stone-300">
          <span className="font-bold text-xs text-amber-400">Master</span>
          <Meter barRef={meterRef('__master')} label="Nível master" />
          <span className="text-stone-500 text-center leading-tight">Limitador −1 dB</span>
        </div>
      </div>
    </div>
  );
};
