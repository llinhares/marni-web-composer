import React, { useState } from 'react';
import {
  Plus,
  Upload,
  RotateCcw,
  Volume2,
  VolumeX,
  MoreVertical,
  Trash2,
  Copy,
  Music,
  Sparkles,
  ListPlus,
  FileUp,
  ChevronUp,
  Video,
} from 'lucide-react';
import type { Track, InstrumentId } from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';
import { AddInstrumentModal } from './AddInstrumentModal.tsx';

interface TrackListProps {
  tracks: Track[];
  activeTrackId: string;
  onSelectTrack: (trackId: string) => void;
  onAddTrack: () => void;
  onDeleteTrack: (trackId: string) => void;
  onDuplicateTrack: (trackId: string) => void;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
  onResetAll: () => void;
  onImportClick: (mode: 'replace' | 'append') => void;
  onOpenAiSheetScanner?: () => void;
  onOpenVideoTranscriber?: () => void;
  totalNotes: number;
  maxNotes: number;
  bdoGrade: string;
  isOpenOnMobile?: boolean;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  activeTrackId,
  onSelectTrack,
  onAddTrack,
  onDeleteTrack,
  onDuplicateTrack,
  onUpdateTrack,
  onResetAll,
  onImportClick,
  onOpenAiSheetScanner,
  onOpenVideoTranscriber,
  totalNotes,
  maxNotes,
  bdoGrade,
  isOpenOnMobile = false,
}) => {
  const [menuOpenTrackId, setMenuOpenTrackId] = useState<string | null>(null);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [changingTrackId, setChangingTrackId] = useState<string | null>(null);

  return (
    <aside
      className={`w-64 md:w-72 bg-[#161412] border-r border-[#2d2722] flex-col justify-between shrink-0 select-none ${isOpenOnMobile
          ? 'flex absolute inset-y-0 left-0 z-40 shadow-2xl bg-[#161412]/95 backdrop-blur-md'
          : 'hidden md:flex z-10'
        }`}
    >
      {/* Top Section: Note Budget & Track Cards */}
      <div className="flex-1 overflow-y-auto">
        {/* BDO Note Counter Bar matching screenshot 1 */}
        <div className="px-3 py-2 bg-[#141210] border-b border-[#2d2722] flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-mono text-stone-300">
            <span className="text-amber-400 font-bold">{totalNotes}</span>
            <span className="text-stone-500">/</span>
            <span className="text-stone-400">{maxNotes}</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-800/60 text-amber-300 font-mono text-[10px]">
            Rank {bdoGrade}
          </span>
        </div>

        {/* Track Cards List */}
        <div className="p-2 space-y-2">
          {tracks.map((track) => {
            const isActive = track.id === activeTrackId;
            const inst = BDO_INSTRUMENTS.find((i) => i.id === track.instrumentId);

            return (
              <div
                key={track.id}
                onClick={() => onSelectTrack(track.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer relative ${isActive
                    ? 'border-amber-600/70 bg-gradient-to-r from-[#2a221a] to-[#221c17] shadow-[0_2px_12px_rgba(0,0,0,0.4)]'
                    : 'border-[#2d2722] bg-[#1c1917]/80 hover:bg-[#231f1c]'
                  }`}
              >
                {/* Track Card Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: inst?.color || '#d4a373' }}
                    />
                    <span className="font-semibold text-xs text-stone-200 truncate tracking-wide">
                      {track.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Mute Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTrack(track.id, { isMuted: !track.isMuted });
                      }}
                      className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] transition-colors ${track.isMuted
                          ? 'bg-rose-900 text-rose-200 border border-rose-700'
                          : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-[#2d2722]'
                        }`}
                      title={track.isMuted ? 'Desmutar Faixa' : 'Mutar Faixa'}
                      aria-label="Mutar Faixa"
                    >
                      M
                    </button>

                    {/* Solo Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTrack(track.id, { isSolo: !track.isSolo });
                      }}
                      className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] transition-colors ${track.isSolo
                          ? 'bg-amber-500 text-stone-950 font-extrabold border border-amber-400'
                          : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-[#2d2722]'
                        }`}
                      title={track.isSolo ? 'Desativar Solo' : 'Solo Faixa'}
                      aria-label="Solo Faixa"
                    >
                      S
                    </button>

                    {/* Track Menu */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenTrackId(menuOpenTrackId === track.id ? null : track.id);
                      }}
                      className="w-6 h-6 rounded flex items-center justify-center text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
                      aria-label="Opções da Faixa"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Dropdown Menu Options */}
                {menuOpenTrackId === track.id && (
                  <div
                    className="absolute right-2 top-10 z-30 w-44 rounded-lg bg-stone-900 border border-[#3e342b] shadow-xl py-1 text-xs text-stone-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setChangingTrackId(track.id);
                        setMenuOpenTrackId(null);
                      }}
                      className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-stone-850 text-left"
                    >
                      <Music className="w-3 h-3 text-amber-400" /> Trocar Instrumento...
                    </button>
                    <button
                      onClick={() => {
                        onDuplicateTrack(track.id);
                        setMenuOpenTrackId(null);
                      }}
                      className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-stone-850 text-left"
                    >
                      <Copy className="w-3 h-3 text-amber-400" /> Duplicar
                    </button>
                    {tracks.length > 1 && (
                      <button
                        onClick={() => {
                          onDeleteTrack(track.id);
                          setMenuOpenTrackId(null);
                        }}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-stone-850 text-rose-400 text-left"
                      >
                        <Trash2 className="w-3 h-3" /> Excluir Faixa
                      </button>
                    )}
                  </div>
                )}

                {/* Quick Instrument Selector Dropdown */}
                <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={track.instrumentId}
                    onChange={(e) => {
                      const newInstId = e.target.value as InstrumentId;
                      const newInst = BDO_INSTRUMENTS.find((i) => i.id === newInstId);
                      const oldInst = BDO_INSTRUMENTS.find((i) => i.id === track.instrumentId);

                      let newName = track.name;
                      if (oldInst) {
                        const oldBase = oldInst.name;
                        if (track.name === oldBase) {
                          newName = newInst?.name || 'Instrumento';
                        } else if (track.name.startsWith(`${oldBase} `)) {
                          const suffix = track.name.slice(oldBase.length);
                          newName = `${newInst?.name || 'Instrumento'}${suffix}`;
                        }
                      }

                      onUpdateTrack(track.id, {
                        instrumentId: newInstId,
                        name: newName,
                        color: newInst?.color || track.color,
                        volume: newInst?.defaultVolume !== undefined ? newInst.defaultVolume : track.volume,
                        sustainPedal: newInstId === 'grand-piano' ? true : (newInstId === 'percussion' ? false : track.sustainPedal),
                      });
                    }}
                    className="w-full bg-[#12100e] hover:bg-[#1a1714] border border-[#2d2722] hover:border-amber-600/70 rounded-md px-2 py-1 text-[11px] text-amber-300 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer transition-colors truncate shadow-inner"
                    title="Clique para trocar o tipo de instrumento desta faixa"
                    aria-label={`Trocar instrumento da faixa ${track.name}`}
                  >
                    {BDO_INSTRUMENTS.map((instOption) => (
                      <option
                        key={instOption.id}
                        value={instOption.id}
                        className="bg-[#1c1917] text-stone-200"
                      >
                        {instOption.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* AUX Send Toggle Button */}
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateTrack(track.id, { auxSend: !track.auxSend });
                    }}
                    className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${track.auxSend
                        ? 'text-amber-400 bg-amber-950/40 border border-amber-800/50'
                        : 'text-stone-400 bg-stone-900 border border-[#2d2722]'
                      }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${track.auxSend ? 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.8)]' : 'bg-stone-600'
                        }`}
                    />
                    AUX SEND
                  </button>
                  <span className="text-[10px] text-stone-400 font-mono">
                    {track.notes.length} notas
                  </span>
                </div>

                {/* Volume Slider with Audio Level Meter Icon */}
                <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <Volume2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span className="font-mono text-xs text-amber-400/90 w-6 text-right">
                    {track.volume}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={track.volume}
                    onChange={(e) =>
                      onUpdateTrack(track.id, { volume: Number(e.target.value) })
                    }
                    className="flex-1 accent-amber-500 h-1.5 bg-stone-950 rounded-lg cursor-pointer"
                    aria-label={`Volume ${track.name}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Controls: + Add, Import, Reset All */}
      <div className="p-3 border-t border-[#2d2722] space-y-2 bg-[#141210]">
        <div className="flex items-center gap-2">
          {/* Add Track Button */}
          <button
            onClick={onAddTrack}
            className="flex-1 py-2 rounded-lg bg-stone-900 hover:bg-stone-850 border border-[#2d2722] hover:border-amber-700/60 text-stone-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            title="Adicionar Novo Instrumento"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Adicionar</span>
          </button>

          {/* Import Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setIsImportMenuOpen((prev) => !prev)}
              className={`p-2 rounded-lg border transition-colors flex items-center gap-1 ${
                isImportMenuOpen
                  ? 'bg-stone-800 border-amber-600/70 text-amber-300'
                  : 'bg-stone-900 hover:bg-stone-850 border-[#2d2722] hover:border-amber-700/60 text-stone-400 hover:text-stone-200'
              }`}
              title="Opções de Importação"
              aria-label="Opções de Importação"
            >
              <Upload className="w-4 h-4" />
              <ChevronUp
                className={`w-3 h-3 text-stone-400 transition-transform duration-200 ${
                  isImportMenuOpen ? 'rotate-180 text-amber-400' : ''
                }`}
              />
            </button>

            {isImportMenuOpen && (
              <>
                {/* Backdrop overlay for click-outside */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsImportMenuOpen(false)}
                />

                {/* Dropdown Menu */}
                <div className="absolute left-0 bottom-full mb-2 w-64 rounded-xl bg-[#1c1917] border border-[#3e342b] shadow-2xl p-1.5 text-xs text-stone-300 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-1.5 text-[10px] uppercase font-bold text-stone-500 tracking-wider border-b border-[#2d2722] mb-1">
                    Opções de Importação
                  </div>

                  <button
                    onClick={() => {
                      setIsImportMenuOpen(false);
                      onImportClick('append');
                    }}
                    className="w-full p-2 rounded-lg flex items-start gap-2.5 hover:bg-stone-850 text-left transition-colors group cursor-pointer"
                  >
                    <ListPlus className="w-4 h-4 text-amber-400 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="font-semibold text-stone-200 group-hover:text-amber-300 transition-colors">
                        Importar como Faixa
                      </div>
                      <div className="text-[10px] text-stone-400 leading-tight mt-0.5">
                        Adiciona ao projeto atual como nova faixa (sem apagar as existentes)
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setIsImportMenuOpen(false);
                      onImportClick('replace');
                    }}
                    className="w-full p-2 rounded-lg flex items-start gap-2.5 hover:bg-stone-850 text-left transition-colors group cursor-pointer"
                  >
                    <FileUp className="w-4 h-4 text-stone-400 group-hover:text-amber-400 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="font-semibold text-stone-200 group-hover:text-amber-300 transition-colors">
                        Importar e Sobrescrever
                      </div>
                      <div className="text-[10px] text-stone-400 leading-tight mt-0.5">
                        Substitui completamente o projeto aberto pelo novo arquivo
                      </div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* AI Sheet Music Scanner Button */}
          {onOpenAiSheetScanner && (
            <button
              onClick={onOpenAiSheetScanner}
              className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 hover:border-amber-400 text-amber-300 transition-colors flex items-center justify-center shadow-sm"
              title="Ler Partitura por Imagem com IA (Gemini OMR)"
              aria-label="Ler Partitura com IA"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
            </button>
          )}

          {/* Video & Audio AI Transcriber Button */}
          {onOpenVideoTranscriber && (
            <button
              onClick={onOpenVideoTranscriber}
              className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 transition-colors flex items-center justify-center shadow-sm"
              title="Transcrever Vídeo (Cascata Synthesia) ou Áudio para Faixas MIDI com IA"
              aria-label="Transcritor de Vídeo e Áudio com IA"
            >
              <Video className="w-4 h-4 text-emerald-400" />
            </button>
          )}
        </div>

        {/* Reset All Button */}
        <button
          onClick={onResetAll}
          className="w-full py-1.5 rounded-lg bg-stone-900/60 hover:bg-stone-850 border border-[#2d2722] text-stone-400 hover:text-stone-300 text-xs transition-colors flex items-center justify-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
          <span>Restaurar Tudo</span>
        </button>

        {/* Creator Footer & Version */}
        <div className="pt-2 text-center text-[10px] text-stone-400 flex items-center justify-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-800/60 text-amber-300 font-mono text-[9px] font-bold">
            v2.0.0
          </span>
          <span className="text-stone-600">•</span>
          <span>
            by <span className="font-semibold text-stone-300">Lucas Linhares</span> (Tchepper)
          </span>
          <span className="text-stone-600">•</span>
          <a
            href="https://github.com/llinhares/marni-web-composer"
            target="_blank"
            rel="noreferrer"
            className="text-amber-500/80 hover:text-amber-400 underline underline-offset-2"
          >
            GitHub
          </a>
        </div>
      </div>

      {/* Modal to change instrument via full catalog */}
      {changingTrackId && (() => {
        const targetTrack = tracks.find((t) => t.id === changingTrackId);
        return (
          <AddInstrumentModal
            isOpen={Boolean(changingTrackId)}
            onClose={() => setChangingTrackId(null)}
            title="Trocar Instrumento"
            subtitle={`Escolha o novo timbre para a faixa "${targetTrack?.name || 'Faixa'}"`}
            initialInstrumentId={targetTrack?.instrumentId}
            onSelectInstrument={(newInstId) => {
              if (targetTrack) {
                const newInst = BDO_INSTRUMENTS.find((i) => i.id === newInstId);
                const oldInst = BDO_INSTRUMENTS.find((i) => i.id === targetTrack.instrumentId);

                let newName = targetTrack.name;
                if (oldInst) {
                  const oldBase = oldInst.name;
                  if (targetTrack.name === oldBase) {
                    newName = newInst?.name || 'Instrumento';
                  } else if (targetTrack.name.startsWith(`${oldBase} `)) {
                    const suffix = targetTrack.name.slice(oldBase.length);
                    newName = `${newInst?.name || 'Instrumento'}${suffix}`;
                  }
                }

                onUpdateTrack(targetTrack.id, {
                  instrumentId: newInstId,
                  name: newName,
                  color: newInst?.color || targetTrack.color,
                  volume: newInst?.defaultVolume !== undefined ? newInst.defaultVolume : targetTrack.volume,
                  sustainPedal: newInstId === 'grand-piano' ? true : (newInstId === 'percussion' ? false : targetTrack.sustainPedal),
                });
              }
              setChangingTrackId(null);
            }}
          />
        );
      })()}
    </aside>
  );
};
