import { useState, useRef } from 'react';
import { Plus, MoreHorizontal, Upload, BarChart2 } from 'lucide-react'
import { useComposerStore } from '@/store/useComposerStore';
import { type Track, type InstrumentType } from '@/types';
import { AddInstrumentModal } from '../controls/AddInstrumentModal'; 
import { Midi } from '@tonejs/midi';
import { GM_TO_DRUM_NAME } from '@/utils/constants';

import { applySustainToNotes, type MidiNoteLike } from '@/utils/midiSustain';

const generateId = () => Math.random().toString(36).substring(2, 9);

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

import { useShallow } from 'zustand/react/shallow';

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { 
    tracks, activeTrackId, setActiveTrack, addTrack, 
    updateTrackVolume, toggleTrackMute, toggleTrackSolo,
    clearTrackNotes, duplicateTrack, removeTrack, setMidiData
  } = useComposerStore(useShallow(state => ({
    tracks: state.tracks, 
    activeTrackId: state.activeTrackId, 
    setActiveTrack: state.setActiveTrack, 
    addTrack: state.addTrack, 
    updateTrackVolume: state.updateTrackVolume, 
    toggleTrackMute: state.toggleTrackMute, 
    toggleTrackSolo: state.toggleTrackSolo,
    clearTrackNotes: state.clearTrackNotes, 
    duplicateTrack: state.duplicateTrack, 
    removeTrack: state.removeTrack, 
    setMidiData: state.setMidiData
  })));
  
  const [showInstrumentMenu, setShowInstrumentMenu] = useState(false);
  const [trackMenuOpen, setTrackMenuOpen] = useState<string | null>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddTrack = (instrument: InstrumentType) => {
    const newTrack: Track = {
      id: `track-${generateId()}`, name: instrument, instrument: instrument,
      volume: 70, isMuted: false, isSolo: false, notes: [],
    };
    addTrack(newTrack);
    setActiveTrack(newTrack.id);
    setShowInstrumentMenu(false);
  };

  const handleMidiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const midi = new Midi(arrayBuffer);

      const getInstrumentFromMidi = (midiTrack: any): InstrumentType => {
        const program = midiTrack.instrument.number ?? 0;
        if (midiTrack.instrument.percussion || midiTrack.channel === 9 || midiTrack.channel === 10) {
          return 'Kit de Bateria';
        }
        if (program < 24) return 'Grand Piano';
        if (program <= 25) return 'Violão Acústico';
        if (program <= 27) return 'Guitarra Silver Wave';
        if (program <= 31) return 'Guitarra Highway';
        if (program <= 39) return 'Contrabaixo';
        if (program <= 41) return 'Violino';
        if (program <= 43) return 'Contrabaixo';
        if (program <= 46) return 'Harpa';
        if (program === 47) return 'Kit de Bateria'; // Timpani
        if (program <= 55) return 'Violino';
        if (program <= 63) return 'Trompa';
        if (program <= 71) return 'Clarinete';
        if (program <= 79) return 'Flauta Transversal';
        if (program <= 87) return 'Marnian Wavy Planet';
        if (program <= 95) return 'Marnian Illusion Tree';
        if (program <= 103) return 'Marnibass';
        if (program <= 111) return 'Handpan';
        if (program <= 119) return 'Tamborim';
        return 'Grand Piano'; 
      };

      const targetBpm = Math.round(midi.header.tempos[0]?.bpm || 120);
      const ticksPerSecond = (targetBpm * 480) / 60;

      const newTracks: Track[] = midi.tracks.map((midiTrack, index) => {
        const instType = getInstrumentFromMidi(midiTrack);
        const isPerc = instType === 'Kit de Bateria' || instType === 'Tamborim' || instType === 'Pratos';
        
        // Extract CC64 events for this track and bake time
        const rawCc64 = (midiTrack.controlChanges?.[64] || (midiTrack.controlChanges as any)?.['sustain'] || []) as any[];
        const cc64List = rawCc64.map(cc => ({
           value: cc.value,
           ticks: Math.round((cc.time * ticksPerSecond) / 15) * 15
        }));

        // Bake absolute time into constant PPQ ticks with 15-tick (1/128) quantization
        const mappedNotes: MidiNoteLike[] = midiTrack.notes.map(n => ({
          name: n.name,
          midi: n.midi,
          velocity: n.velocity,
          ticks: Math.round((n.time * ticksPerSecond) / 15) * 15,
          durationTicks: Math.max(15, Math.round((n.duration * ticksPerSecond) / 15) * 15)
        }));

        // Apply CC64 sustain processing
        const sustainedNotes = applySustainToNotes(mappedNotes, cc64List);

        return {
          id: `track-midi-${index}-${Date.now()}`,
          name: midiTrack.name || `MIDI Track ${index + 1}`,
          instrument: instType,
          volume: 70,
          isMuted: false,
          isSolo: false,
          notes: sustainedNotes.map(note => {
            let notePitch = note.name;
            if (isPerc) {
              notePitch = GM_TO_DRUM_NAME[note.midi] || 'Kck';
            }
            return {
              id: `note-midi-${Math.random().toString(36).substring(2, 9)}`,
              pitch: notePitch,
              startTick: note.ticks,
              durationTicks: note.durationTicks,
              velocity: Math.max(1, Math.min(127, Math.floor(note.velocity * 100)))
            };
          })
        };
      }).filter(t => t.notes.length > 0);

      if (newTracks.length > 0) {
        const bpm = midi.header.tempos[0]?.bpm || 120;
        setMidiData(newTracks, Math.round(bpm));
      }
    } catch (err) {
      console.error("Erro ao carregar MIDI:", err);
      alert("Não foi possível processar o arquivo MIDI.");
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  return (
    <>
      {isOpen && (
        <div 
          className="absolute inset-0 z-30 bg-black/60 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      <aside 
        className={`absolute md:relative left-0 top-0 h-full w-[260px] flex-col border-r border-grid-light bg-surface-panel z-40 transition-transform duration-300 ease-in-out flex shadow-2xl md:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {tracks.map((track) => {
            const isActive = activeTrackId === track.id;
            const isMenuOpen = trackMenuOpen === track.id;
            
            return (
              <div 
                key={track.id}
                onClick={() => {
                  setActiveTrack(track.id);
                  if (window.innerWidth < 768) onClose();
                }}
                style={{ zIndex: isMenuOpen ? 50 : 10 }}
                className={`group relative flex flex-col gap-3 rounded-md border p-3 cursor-pointer transition-all ${
                  isActive 
                    ? 'border-[#C39556] bg-gradient-to-br from-[#A7763D] to-[#6A4B29] shadow-md' 
                    : 'border-[#352F2A] bg-[#1C1917] hover:border-[#524840]'
                }`}
              >
                {isActive && (
                  <div className="absolute right-0 top-0 h-full w-24 opacity-30 bg-[url('https://tonejs.github.io/audio/salamander/A0.mp3')] bg-cover bg-center rounded-r-md overflow-hidden pointer-events-none" /> 
                )}

                <div className="relative flex items-center justify-between z-20">
                  <span className={`font-semibold text-sm ${isActive ? 'text-[#F3E3CC]' : 'text-content-primary'}`}>
                    {track.name}
                  </span>
                  
                  <div className="flex items-center gap-1 relative">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id); }}
                      className={`flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold border transition-colors ${
                        track.isMuted ? 'bg-red-600 border-red-400 text-white' : 'border-[#4A423B] text-content-muted hover:bg-white/10'
                      }`}
                    >M</button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleTrackSolo(track.id); }}
                      className={`flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold border transition-colors ${
                        track.isSolo ? 'bg-[#DAB16C] border-[#F3E3CC] text-[#1C1A1A]' : 'border-[#4A423B] text-content-muted hover:bg-white/10'
                      }`}
                    >S</button>

                    <button onClick={(e) => { e.stopPropagation(); setTrackMenuOpen(isMenuOpen ? null : track.id); }} className="p-1 text-content-muted hover:text-white">
                      <MoreHorizontal size={14} />
                    </button>

                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setTrackMenuOpen(null); }} />
                        <div className="absolute top-6 right-0 w-40 bg-[#1C1917] border border-[#352F2A] rounded shadow-[0_8px_30px_rgb(0,0,0,0.8)] z-50 flex flex-col py-1.5 overflow-hidden">
                          <button className="text-left px-4 py-2 text-xs text-[#938A7E] hover:bg-[#2A2522] hover:text-[#DAB16C]" onClick={(e) => { e.stopPropagation(); clearTrackNotes(track.id); setTrackMenuOpen(null); }}>Restaurar Tudo</button>
                          <button className="text-left px-4 py-2 text-xs text-[#938A7E] hover:bg-[#2A2522] hover:text-[#DAB16C]" onClick={(e) => { e.stopPropagation(); duplicateTrack(track.id); setTrackMenuOpen(null); }}>Copiar</button>
                          <button className="text-left px-4 py-2 text-xs text-[#FF4C4C] hover:bg-[#2A2522]" onClick={(e) => { e.stopPropagation(); removeTrack(track.id); setTrackMenuOpen(null); }}>Apagar</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="relative flex items-center gap-2 z-10">
                  <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-[#F3E3CC]' : 'bg-content-muted'}`} />
                  <span className={`text-[10px] uppercase font-medium tracking-wide ${isActive ? 'text-[#E2C499]' : 'text-content-muted'}`}>Aux Send</span>
                </div>
                
                <div className="relative flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
                  <BarChart2 size={14} className={isActive ? 'text-[#F3E3CC]' : 'text-content-muted'} />
                  <span className={`text-xs w-5 ${isActive ? 'text-[#F3E3CC]' : 'text-content-muted'}`}>{track.volume}</span>
                  <input 
                    type="range" min="0" max="100" value={track.volume} 
                    onChange={(e) => updateTrackVolume(track.id, parseInt(e.target.value))} 
                    className={`flex-1 h-1.5 rounded-full appearance-none cursor-ew-resize ${isActive ? 'bg-black/30 accent-[#F3E3CC]' : 'bg-grid-dark accent-accent-primary'}`} 
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 p-3 bg-surface-panel border-t border-grid-light">
          <div className="flex gap-2">
            <button 
              onClick={() => setShowInstrumentMenu(true)}
              className="flex-1 flex items-center justify-center rounded border border-[#3E3832] bg-[#1C1917] py-2 md:py-1.5 text-content-muted hover:text-content-primary hover:border-content-muted transition-colors"
            >
              <Plus size={18} />
            </button>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center rounded border border-[#3E3832] bg-[#1C1917] px-4 py-2 md:py-1.5 text-content-muted hover:text-content-primary hover:border-content-muted transition-colors"
              title="Importar MIDI"
            >
              <Upload size={16} />
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".mid,.midi" 
                onChange={handleMidiUpload} 
              />
            </button>
          </div>
          <button 
            onClick={() => { if(activeTrackId) clearTrackNotes(activeTrackId); }}
            className="w-full rounded border border-[#3E3832] bg-[#352F2A] py-2 md:py-1.5 text-xs font-medium text-content-primary hover:bg-[#453D37] transition-colors"
          >
            Restaurar Tudo
          </button>
        </div>
      </aside>

      {showInstrumentMenu && <AddInstrumentModal onClose={() => setShowInstrumentMenu(false)} onSelect={handleAddTrack} />}
    </>
  );
}