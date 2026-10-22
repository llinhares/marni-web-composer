import React from 'react';
import {
  Play,
  Square,
  Pause,
  MousePointer,
  BoxSelect,
  Pencil,
  Eraser,
  Sliders,
  Radio,
  Feather,
  Volume2,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Hand,
} from 'lucide-react';
import type { ToolMode, GridSnap, TimeSignature, EffectorSettings } from '../types/music.ts';
import { formatTimecode, ticksToSeconds } from '../utils/musicMath.ts';
import { usePlayheadTick, type PlayheadStore } from '../audio/playheadStore.ts';

const Timecode: React.FC<{ playhead: PlayheadStore; maxTick: number; bpm: number }> = ({ playhead, maxTick, bpm }) => {
  const currentTick = usePlayheadTick(playhead);
  return (
    <div className="px-2.5 py-1 rounded-md bg-stone-950 border border-stone-800 font-mono text-xs flex items-center gap-1.5 shadow-inner">
      <span className="text-amber-400 font-bold">{formatTimecode(ticksToSeconds(currentTick, bpm))}</span>
      <span className="text-stone-600">/</span>
      <span className="text-stone-400">{formatTimecode(ticksToSeconds(Math.max(currentTick, maxTick), bpm))}</span>
    </div>
  );
};

interface HeaderProps {
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  playhead: PlayheadStore;
  maxTick: number;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  timeSignature: TimeSignature;
  onTimeSignatureChange: (sig: TimeSignature) => void;
  gridSnap: GridSnap;
  onGridSnapChange: (snap: GridSnap) => void;
  accidentals: 'sharp' | 'flat';
  onToggleAccidentals: () => void;
  sustenidoActive?: boolean;
  hasSelectedNotes?: boolean;
  isSelectionSharp?: boolean;
  effectorSettings: EffectorSettings;
  onOpenEffectorModal: () => void;
  onToggleReverb: () => void;
  onToggleDelay: () => void;
  onToggleChorus: () => void;
  onOpenMidiModal: () => void;
  hasMidiDevices: boolean;
  scaleType: string;
  onScaleChange: (scale: string) => void;
  zoomLevel: number;
  onZoomChange: (delta: number) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenAiSheetScanner?: () => void;
  onOpenVideoTranscriber?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  toolMode,
  onSetToolMode,
  isPlaying,
  onPlay,
  onPause,
  onStop,
  playhead,
  maxTick,
  bpm,
  onBpmChange,
  timeSignature,
  onTimeSignatureChange,
  gridSnap,
  onGridSnapChange,
  accidentals,
  onToggleAccidentals,
  sustenidoActive = true,
  hasSelectedNotes = false,
  isSelectionSharp = false,
  effectorSettings,
  onOpenEffectorModal,
  onToggleReverb,
  onToggleDelay,
  onToggleChorus,
  onOpenMidiModal,
  onOpenAiSheetScanner,
  onOpenVideoTranscriber,
  hasMidiDevices,
  scaleType,
  onScaleChange,
  zoomLevel,
  onZoomChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onToggleSidebar,
  isSidebarOpen,
}) => {
  return (
    <header className="h-14 bg-[#141210] border-b border-[#2d2722] px-2 sm:px-4 flex items-center justify-between select-none text-stone-300 text-xs shrink-0 z-20 gap-1 sm:gap-3">
      {/* Left Segment: Mobile Sidebar Toggle, Logo, Tools, FX Toggles, BPM */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className={`md:hidden p-1.5 rounded-lg border transition-colors ${isSidebarOpen
              ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
              : 'bg-stone-900 border-[#2d2722] text-stone-400'
              }`}
            title="Alternar Faixas / Painel"
            aria-label="Alternar Painel de Faixas"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Edit Tools */}
        <div className="flex items-center rounded-lg bg-stone-900/90 p-0.5 border border-[#2d2722]">
          <button
            onClick={() => onSetToolMode('pointer')}
            className={`p-1.5 rounded-md transition-colors ${toolMode === 'pointer'
              ? 'bg-amber-500 text-stone-950 font-bold shadow'
              : 'text-stone-400 hover:text-stone-200'
              }`}
            title="Mover e Ajustar Notas (V)"
            aria-label="Ferramenta Ponteiro"
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetToolMode('select')}
            className={`p-1.5 rounded-md transition-colors ${toolMode === 'select'
              ? 'bg-amber-500 text-stone-950 font-bold shadow'
              : 'text-stone-400 hover:text-stone-200'
              }`}
            title="Seleção Múltipla em Caixa / Marquee (M)"
            aria-label="Ferramenta Seleção Múltipla"
          >
            <BoxSelect className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetToolMode('pencil')}
            className={`p-1.5 rounded-md transition-colors ${toolMode === 'pencil'
              ? 'bg-amber-500 text-stone-950 font-bold shadow'
              : 'text-stone-400 hover:text-stone-200'
              }`}
            title="Inserir Notas (B)"
            aria-label="Ferramenta Lápis"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetToolMode('eraser')}
            className={`p-1.5 rounded-md transition-colors ${toolMode === 'eraser'
              ? 'bg-amber-500 text-stone-950 font-bold shadow'
              : 'text-stone-400 hover:text-stone-200'
              }`}
            title="Apagar Notas (E)"
            aria-label="Ferramenta Borracha"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSetToolMode('pan')}
            className={`p-1.5 rounded-md transition-colors ${toolMode === 'pan'
              ? 'bg-amber-500 text-stone-950 font-bold shadow'
              : 'text-stone-400 hover:text-stone-200'
              }`}
            title="Mover Grade / Panorâmica (H)"
            aria-label="Ferramenta Mover / Panorâmica"
          >
            <Hand className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Undo / Redo History Buttons */}
        <div className="flex items-center rounded-lg bg-stone-900/90 p-0.5 border border-[#2d2722]">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded-md transition-colors ${canUndo
              ? 'text-stone-300 hover:text-amber-400 hover:bg-stone-800'
              : 'text-stone-600 cursor-not-allowed'
              }`}
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer Ação"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded-md transition-colors ${canRedo
              ? 'text-stone-300 hover:text-amber-400 hover:bg-stone-800'
              : 'text-stone-600 cursor-not-allowed'
              }`}
            title="Refazer (Ctrl+Y / Ctrl+Shift+Z)"
            aria-label="Refazer Ação"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Effector Quick Toggles (Reverb, Delay, Chorus) */}
        <div className="hidden lg:flex items-center gap-1.5">
          <button
            onClick={onToggleReverb}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors ${effectorSettings.reverb.enabled
              ? 'bg-amber-950/40 border-amber-500/60 text-amber-300'
              : 'bg-stone-900/50 border-[#2d2722] text-stone-400 hover:text-stone-300'
              }`}
            title="Alternar Reverb"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${effectorSettings.reverb.enabled ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]' : 'bg-stone-600'
                }`}
            />
            Reverb
          </button>

          <button
            onClick={onToggleDelay}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors ${effectorSettings.delay.enabled
              ? 'bg-amber-950/40 border-amber-500/60 text-amber-300'
              : 'bg-stone-900/50 border-[#2d2722] text-stone-400 hover:text-stone-300'
              }`}
            title="Alternar Delay"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${effectorSettings.delay.enabled ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]' : 'bg-stone-600'
                }`}
            />
            Delay
          </button>

          <button
            onClick={onToggleChorus}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors ${effectorSettings.chorus.enabled
              ? 'bg-amber-950/40 border-amber-500/60 text-amber-300'
              : 'bg-stone-900/50 border-[#2d2722] text-stone-400 hover:text-stone-300'
              }`}
            title="Alternar Chorus"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${effectorSettings.chorus.enabled ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]' : 'bg-stone-600'
                }`}
            />
            Chorus
          </button>

          <button
            onClick={onOpenEffectorModal}
            className="p-1 rounded-md text-stone-400 hover:text-amber-400 hover:bg-stone-900 transition-colors"
            title="Abrir Rack de Efeitos Effector"
            aria-label="Abrir Effector"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* BPM Selector */}
        <div className="flex items-center gap-1 bg-stone-900/90 px-2 py-1 rounded-md border border-[#2d2722]">
          <span className="text-[11px] text-amber-400/80 font-bold">BPM</span>
          <input
            type="number"
            min={40}
            max={260}
            value={bpm}
            onChange={(e) => onBpmChange(Math.max(40, Math.min(260, Number(e.target.value) || 120)))}
            className="w-12 bg-transparent text-amber-400 font-mono text-center font-bold focus:outline-none"
            aria-label="Tempo em Batidas Por Minuto"
          />
        </div>
      </div>

      {/* Center Segment: Play, Pause, Stop, Timecode Display */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 transition-all shadow-[0_0_12px_rgba(245,158,11,0.25)] flex items-center justify-center"
          title={isPlaying ? 'Pausar (Espaço)' : 'Tocar Partitura (Espaço)'}
          aria-label={isPlaying ? 'Pausar' : 'Tocar'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
        </button>

        <button
          onClick={onStop}
          className="p-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-[#2d2722] transition-colors"
          title="Parar e Retornar ao Início"
          aria-label="Parar"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>

        {/* Timecode Readout (only this element re-renders while playing) */}
        <Timecode playhead={playhead} maxTick={maxTick} bpm={bpm} />
      </div>

      {/* Right Segment: Time Signature, Grid Snap, Sustenido (#/b), MIDI, Zoom */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Ritmo (Time Signature) */}
        <div className="hidden sm:flex items-center gap-1">
          <span className="text-stone-400 text-[11px]">Ritmo</span>
          <select
            value={timeSignature}
            onChange={(e) => onTimeSignatureChange(e.target.value as TimeSignature)}
            className="bg-stone-900 border border-[#2d2722] rounded-md px-1.5 py-1 text-stone-200 text-xs focus:outline-none focus:border-amber-500/60"
            aria-label="Compasso Musical"
          >
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
            <option value="6/8">6/8</option>
            <option value="2/4">2/4</option>
            <option value="12/8">12/8</option>
          </select>
        </div>

        {/* Grade (Grid Snap) */}
        <div className="flex items-center gap-1">
          <span className="hidden md:inline text-stone-400 text-[11px]">Grade</span>
          <select
            value={gridSnap}
            onChange={(e) => onGridSnapChange(e.target.value as GridSnap)}
            className="bg-stone-900 border border-[#2d2722] rounded-md px-1.5 py-1 text-stone-200 text-xs focus:outline-none focus:border-amber-500/60"
            aria-label="Encaixe na Grade"
          >
            <option value="1/1">1/1 (Bar)</option>
            <option value="1/2">1/2</option>
            <option value="1/4">1/4</option>
            <option value="1/8">1/8</option>
            <option value="1/16">1/16</option>
            <option value="1/32">1/32</option>
            <option value="1/64">1/64</option>
            <option value="1/4T">1/4 T</option>
            <option value="1/8T">1/8 T</option>
            <option value="1/16T">1/16 T</option>
            <option value="off">Livre</option>
          </select>
        </div>

        {/* MIDI Controller Connect */}
        <button
          onClick={onOpenMidiModal}
          className={`p-1.5 rounded-md border text-xs transition-colors flex items-center gap-1 ${hasMidiDevices
            ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400'
            : 'bg-stone-900 border-[#2d2722] text-stone-400 hover:text-amber-400'
            }`}
          title="Interface Web MIDI"
          aria-label="Configurar MIDI"
        >
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden xl:inline text-[11px]">MIDI</span>
        </button>

        {/* Zoom Controls */}
        <div className="hidden xl:flex items-center rounded-lg bg-stone-900/80 p-0.5 border border-[#2d2722]">
          <button
            onClick={() => onZoomChange(-0.15)}
            className="p-1 rounded text-stone-400 hover:text-stone-200"
            title="Reduzir Zoom"
            aria-label="Menos zoom"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onClick={() => onZoomChange(0.15)}
            className="p-1 rounded text-stone-400 hover:text-stone-200"
            title="Aumentar Zoom"
            aria-label="Mais zoom"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>
      </div>
    </header>
  );
};
