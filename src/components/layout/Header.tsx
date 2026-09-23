import { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, ChevronDown, MousePointer2, Grid3X3, PenTool, Menu,
  Undo2, Redo2, ZoomIn, ZoomOut, RotateCcw,
  Circle, Ghost, Sliders, Cable
} from 'lucide-react';
import * as Tone from 'tone';
import { useComposerStore, useComposerHistoryState } from '@/store/useComposerStore';
import { playComposition, stopComposition, setGlobalBpm } from '@/core/audio/ToneEngine';
import { EffectorModal } from '../controls/EffectorModal';
import { webMidi } from '@/core/midi/WebMidiManager';

import { useShallow } from 'zustand/react/shallow';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { 
    song, tracks, isPlaying, setIsPlaying, setBpm, snapResolution, setSnapResolution, setTimeSignature,
    currentTool, setCurrentTool, noteStyle, setNoteStyle,
    zoomX, setZoomX, seekTick,
    ghostNotesEnabled, toggleGhostNotes,
    isRecording, setIsRecording,
    midiConnected, setShowMixer
  } = useComposerStore(useShallow(state => ({
    song: state.song, tracks: state.tracks, isPlaying: state.isPlaying, setIsPlaying: state.setIsPlaying, setBpm: state.setBpm, snapResolution: state.snapResolution, setSnapResolution: state.setSnapResolution, setTimeSignature: state.setTimeSignature,
    currentTool: state.currentTool, setCurrentTool: state.setCurrentTool, noteStyle: state.noteStyle, setNoteStyle: state.setNoteStyle,
    zoomX: state.zoomX, setZoomX: state.setZoomX, seekTick: state.seekTick,
    ghostNotesEnabled: state.ghostNotesEnabled, toggleGhostNotes: state.toggleGhostNotes,
    isRecording: state.isRecording, setIsRecording: state.setIsRecording,
    midiConnected: state.midiConnected, setShowMixer: state.setShowMixer
  })));

  const { canUndo, canRedo, undo, redo } = useComposerHistoryState();
  
  const [totalTime, setTotalTime] = useState("00:00.0"); 
  const [showEffector, setShowEffector] = useState(false);
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);

  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);

  // Initialize Web MIDI detection automatically
  useEffect(() => {
    webMidi.init();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (styleRef.current && !styleRef.current.contains(event.target as Node)) {
        setShowStyleDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Efficient DOM-ref timer to eliminate 60 FPS full re-renders
  useEffect(() => {
    let animId: number;
    const updateTimer = () => {
      if (isPlaying && Tone.Transport.state === 'started') {
        const seconds = Tone.Transport.seconds;
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        const millis = Math.floor((seconds % 1) * 10);
        if (timeDisplayRef.current) {
          timeDisplayRef.current.textContent = `${mins}:${secs}.${millis}`;
        }
      }
      animId = requestAnimationFrame(updateTimer);
    };

    if (isPlaying) {
      updateTimer();
    } else if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = "00:00.0";
    }

    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  useEffect(() => {
    let maxTick = 0;
    tracks.forEach(track => {
      track.notes.forEach(note => {
        const endTick = note.startTick + note.durationTicks;
        if (endTick > maxTick) maxTick = endTick;
      });
    });
    if (maxTick === 0) {
      setTotalTime("00:00.0");
      return;
    }
    const ticksPerSecond = (song.bpm * 480) / 60;
    const totalSeconds = maxTick / ticksPerSecond;
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    const millis = Math.floor((totalSeconds % 1) * 10);
    setTotalTime(`${mins}:${secs}.${millis}`);
  }, [tracks, song.bpm]);

  const handlePlay = () => {
    if (isPlaying) return;
    setIsPlaying(true);
    playComposition(tracks, song.bpm, seekTick);
  };

  const handleStop = () => {
    setIsPlaying(false);
    stopComposition();
  };

  return (
    <header className="relative flex h-14 w-full items-center border-b border-grid-light bg-surface-panel px-3 md:px-4 z-30 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      
      <div className="flex items-center justify-between min-w-max w-full gap-4 md:gap-6">
        
        <div className="flex items-center">
          
          <button onClick={onMenuClick} className="md:hidden mr-3 text-[#DAB16C] hover:text-white transition-colors">
            <Menu size={22} />
          </button>

          <div className="flex items-center gap-2.5 md:gap-3.5">
            {/* Tools (Select / Draw) */}
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setCurrentTool('select')}
                title="Ferramenta Seleção"
                className={`rounded border p-1.5 transition-colors ${currentTool === 'select' ? 'border-accent-primary text-accent-primary bg-black/30' : 'border-grid-light bg-surface-modal hover:text-accent-primary'}`}
              >
                <MousePointer2 size={16} />
              </button>
              <button 
                onClick={() => setCurrentTool('draw')}
                title="Ferramenta Desenhar Nota"
                className={`rounded border p-1.5 transition-colors ${currentTool === 'draw' ? 'border-accent-primary text-accent-primary bg-black/30' : 'border-grid-light bg-surface-modal hover:text-accent-primary'}`}
              >
                <PenTool size={16} />
              </button>
            </div>

            {/* Ghost Notes Toggle (Alt+V) */}
            <button
              onClick={toggleGhostNotes}
              title="Notas Fantasma / Ghost Notes (Alt+V)"
              className={`rounded border p-1.5 transition-colors ${
                ghostNotesEnabled 
                  ? 'border-accent-primary text-accent-primary bg-black/30' 
                  : 'border-grid-light bg-surface-modal text-content-muted hover:text-content-primary'
              }`}
            >
              <Ghost size={15} />
            </button>

            {/* Undo / Redo */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => undo()}
                disabled={!canUndo}
                title="Desfazer (Ctrl+Z)"
                className={`rounded border p-1.5 transition-colors ${
                  canUndo 
                    ? 'border-grid-light bg-surface-modal text-content-primary hover:text-accent-primary hover:border-accent-primary cursor-pointer' 
                    : 'border-[#26221E] bg-[#141211] text-[#554E46] cursor-not-allowed opacity-50'
                }`}
              >
                <Undo2 size={15} />
              </button>
              <button
                onClick={() => redo()}
                disabled={!canRedo}
                title="Refazer (Ctrl+Y)"
                className={`rounded border p-1.5 transition-colors ${
                  canRedo 
                    ? 'border-grid-light bg-surface-modal text-content-primary hover:text-accent-primary hover:border-accent-primary cursor-pointer' 
                    : 'border-[#26221E] bg-[#141211] text-[#554E46] cursor-not-allowed opacity-50'
                }`}
              >
                <Redo2 size={15} />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-surface-modal border border-grid-light rounded px-1.5 py-0.5">
              <button
                onClick={() => setZoomX(zoomX - 0.2)}
                title="Diminuir Zoom"
                className="text-content-muted hover:text-accent-primary p-0.5"
              >
                <ZoomOut size={13} />
              </button>
              <span className="text-[10px] font-mono text-[#DAB16C] px-1 select-none min-w-[34px] text-center">
                {Math.round(zoomX * 100)}%
              </span>
              <button
                onClick={() => setZoomX(zoomX + 0.2)}
                title="Aumentar Zoom"
                className="text-content-muted hover:text-accent-primary p-0.5"
              >
                <ZoomIn size={13} />
              </button>
              {zoomX !== 1 && (
                <button
                  onClick={() => setZoomX(1)}
                  title="Redefinir Zoom (100%)"
                  className="text-content-muted hover:text-accent-primary p-0.5 ml-0.5"
                >
                  <RotateCcw size={11} />
                </button>
              )}
            </div>

            {/* Mixer Button */}
            <button
              onClick={() => setShowMixer(true)}
              title="Abrir Mesa de Som (Mixer Pro)"
              className="flex items-center gap-1.5 rounded border border-grid-light bg-surface-modal px-2.5 py-1.5 text-xs text-content-primary hover:border-accent-primary hover:text-accent-primary transition-colors"
            >
              <Sliders size={14} className="text-[#DAB16C]" />
              <span className="hidden lg:inline text-[11px] font-medium">Mixer</span>
            </button>

            {/* Web MIDI USB status badge */}
            <button
              onClick={() => webMidi.init()}
              title={midiConnected ? "Teclado MIDI USB Conectado" : "Clique para Ativar Teclado MIDI USB"}
              className={`flex items-center gap-1.5 rounded border px-2 py-1.5 text-[11px] transition-colors ${
                midiConnected 
                  ? 'border-emerald-600 bg-emerald-950/40 text-emerald-400' 
                  : 'border-grid-light bg-surface-modal text-content-muted hover:text-accent-primary hover:border-accent-primary'
              }`}
            >
              <Cable size={13} />
              <span className="hidden xl:inline">{midiConnected ? 'MIDI Ativo' : 'Ativar MIDI'}</span>
            </button>
            
            {/* Effector button */}
            <div 
              className="flex items-center gap-3 rounded-full bg-surface-modal px-3 py-1.5 border border-grid-light cursor-pointer hover:border-accent-primary transition-colors"
              onClick={() => setShowEffector(true)}
            >
              {['Reverb', 'Delay', 'Chorus'].map(eff => (
                <div key={eff} className="flex items-center gap-1 text-[11px] md:text-xs text-content-primary">
                  <div className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-content-muted" /> <span>{eff}</span>
                </div>
              ))}
            </div>

            {/* BPM */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] md:text-[11px] font-medium text-content-muted uppercase">BPM</span>
              <input 
                type="number" min="30" max="300" value={song.bpm}
                onChange={(e) => {
                  const newBpm = parseInt(e.target.value);
                  if (newBpm > 0) { setBpm(newBpm); setGlobalBpm(newBpm); }
                }}
                className="w-10 md:w-12 rounded-sm border border-grid-light bg-surface-modal px-1 py-0.5 text-center text-xs text-accent-primary outline-none"
              />
            </div>
          </div>
        </div>

        {/* Playback & Record Controls */}
        <div className="flex items-center gap-3 bg-[#1C1917] px-3.5 py-1.5 rounded-full border border-[#352F2A] shadow-inner">
          {/* Record Button */}
          <button 
            onClick={() => setIsRecording(!isRecording)} 
            title={isRecording ? "Gravação MIDI Ativa (Clique para Desativar)" : "Ativar Gravação MIDI"}
            className={`transition-colors p-1 rounded-full ${
              isRecording 
                ? 'text-red-500 bg-red-950/60 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse' 
                : 'text-content-muted hover:text-red-400'
            }`}
          >
            <Circle size={12} fill="currentColor" />
          </button>

          <button onClick={handlePlay} className={`transition-colors ${isPlaying ? 'text-accent-primary' : 'text-content-primary hover:text-accent-primary'}`}>
            <Play size={14} fill="currentColor" />
          </button>
          <button onClick={handleStop} className="text-content-primary hover:text-red-400 transition-colors">
            <Square size={12} fill="currentColor" />
          </button>
          <span ref={timeDisplayRef} className="text-[11px] text-[#DAB16C] font-mono ml-1">00:00.0</span>
          <span className="text-[9px] text-content-muted font-mono">{totalTime}</span>
        </div>

        {/* Time Signature, Grid Snap & Style */}
        <div className="flex items-center gap-3 md:gap-4 text-content-muted shrink-0">
          
          <div className="flex flex-col items-start gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] md:text-[11px] text-content-muted">Ritmo</span>
              <div className="relative flex items-center rounded-sm border border-grid-light bg-surface-modal px-2 py-0.5">
                <select 
                  value={`${song.timeSignature[0]}/${song.timeSignature[1]}`}
                  onChange={(e) => {
                    const [num, den] = e.target.value.split('/').map(Number);
                    setTimeSignature([num, den]);
                  }}
                  className="appearance-none bg-transparent text-xs text-content-primary outline-none pr-4 cursor-pointer"
                >
                  <option value="4/4">4/4</option><option value="3/4">3/4</option><option value="6/8">6/8</option>
                </select>
                <ChevronDown size={12} className="absolute right-1 text-content-muted pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Grid3X3 size={12} className="text-content-muted" />
              <div className="relative flex items-center rounded-sm border border-grid-light bg-surface-modal px-2 py-0.5">
                <select 
                  value={snapResolution}
                  onChange={(e) => setSnapResolution(Number(e.target.value))}
                  className="appearance-none bg-transparent text-xs text-content-primary outline-none pr-4 cursor-pointer"
                >
                  <option value="4">1/4</option><option value="8">1/8</option><option value="16">1/16</option>
                  <option value="32">1/32</option><option value="64">1/64</option>
                </select>
                <ChevronDown size={12} className="absolute right-1 text-content-muted pointer-events-none" />
              </div>
            </div>

            <div className="relative" ref={styleRef}>
              <div 
                className="relative flex items-center rounded-sm border border-grid-light bg-surface-modal px-2 py-1 cursor-pointer min-w-[110px]"
                onClick={() => setShowStyleDropdown(!showStyleDropdown)}
              >
                <div className={`h-1.5 w-1.5 rounded-sm mr-1.5 ${noteStyle === 'Sustenido' ? 'bg-content-muted' : 'bg-green-500'}`} />
                <span className="text-[11px] text-content-primary truncate mr-4">{noteStyle}</span>
                <ChevronDown size={12} className="absolute right-1 text-content-muted" />
              </div>
              {showStyleDropdown && (
                <div className="absolute top-full right-0 mt-1 w-44 bg-surface-modal border border-grid-light rounded shadow-xl z-50 flex flex-col overflow-hidden">
                  <button className="flex items-center gap-2 px-3 py-2 text-xs text-content-primary hover:bg-surface-base transition-colors" onClick={() => { setNoteStyle('Sustenido'); setShowStyleDropdown(false); }}>
                    <div className="h-1.5 w-1.5 rounded-sm bg-content-muted" /> Sustenido
                  </button>
                  <button className="flex items-center gap-2 px-3 py-2 text-xs text-content-primary hover:bg-surface-base transition-colors" onClick={() => { setNoteStyle('Pedal de Sustentação'); setShowStyleDropdown(false); }}>
                    <div className="h-1.5 w-1.5 rounded-sm bg-green-500" /> Pedal de Sustentação
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {showEffector && <EffectorModal onClose={() => setShowEffector(false)} />}
    </header>
  );
}