import { useState, useEffect } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { PianoRoll } from '../piano-roll/PianoRoll';
import { useComposerStore } from '@/store/useComposerStore';
import { Midi } from '@tonejs/midi';
import { BdoExportModal } from '../controls/BdoExportModal';
import { OnboardingModal } from '../controls/OnboardingModal'; 
import { MixerModal } from '../controls/MixerModal';
import { exportWavAudio } from '@/core/audio/ToneEngine';

import { useShallow } from 'zustand/react/shallow';

export function MainLayout() {
  const { song, tracks, setTitle, showMixer, setShowMixer } = useComposerStore(useShallow(state => ({
    song: state.song, tracks: state.tracks, setTitle: state.setTitle, showMixer: state.showMixer, setShowMixer: state.setShowMixer
  })));
  const [showBdoExport, setShowBdoExport] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isExportingWav, setIsExportingWav] = useState(false);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('bdo_composer_onboarding_seen');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  const handleCloseOnboarding = () => {
    localStorage.setItem('bdo_composer_onboarding_seen', 'true');
    setShowOnboarding(false);
  };

  const handleSaveMidi = () => {
    if (!song.title.trim()) {
      alert('Por favor, insira o título da música antes de salvar.');
      return;
    }

    const midi = new Midi();
    midi.header.tempos.push({ ticks: 0, bpm: song.bpm }); 

    tracks.forEach(track => {
      if (track.notes.length === 0) return;

      const midiTrack = midi.addTrack();
      midiTrack.name = track.name;

      if (track.instrument === 'Kit de Bateria' || track.instrument === 'Tamborim') {
        midiTrack.channel = 9; 
      } else {
        let program = 0; 
        switch (track.instrument) {
          case 'Violão Acústico': program = 24; break; 
          case 'Contrabaixo': program = 43; break;     
          case 'Harpa': program = 46; break;           
          case 'Violino': program = 40; break;         
          case 'Flauta Transversal': program = 73; break; 
          case 'Clarinete': program = 71; break;       
          case 'Trompa': program = 60; break;          
          case 'Grand Piano':
          default: program = 0; break;
        }
        midiTrack.instrument.number = program;
      }

      track.notes.forEach(note => {
        midiTrack.addNote({
          name: note.pitch,
          ticks: note.startTick,
          durationTicks: note.durationTicks,
          velocity: note.velocity / 100, 
        });
      });
    });

    const midiArray = midi.toArray();
    const blob = new Blob([new Uint8Array(midiArray)], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${song.title.trim()}.mid`; 
    
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportWav = async () => {
    if (!song.title.trim()) {
      alert('Por favor, insira o título da música antes de exportar.');
      return;
    }

    const activeNotes = tracks.reduce((sum, t) => sum + (t.isMuted ? 0 : t.notes.length), 0);
    if (activeNotes === 0) {
      alert('A partitura não contém notas ativas para renderizar.');
      return;
    }

    try {
      setIsExportingWav(true);
      const wavBlob = await exportWavAudio(tracks, song.bpm);
      const url = URL.createObjectURL(wavBlob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${song.title.trim()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao renderizar áudio WAV:', err);
      alert('Ocorreu um erro ao renderizar o áudio WAV.');
    } finally {
      setIsExportingWav(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-surface-base overflow-hidden font-sans">
      
      {showOnboarding && <OnboardingModal onClose={handleCloseOnboarding} />}

      <Header onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
      
      <div className="relative flex flex-1 overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        
        <main className="relative flex-1 bg-surface-base">
          <PianoRoll />
        </main>
      </div>

      <div className="flex flex-col md:flex-row w-full items-center justify-between border-t border-grid-light bg-[#26221E] px-4 py-3 md:py-0 md:h-12 z-20 gap-3">
        <div className="hidden md:flex text-[10px] font-medium text-content-muted">
          by 
          <a href='https://lucaslinhares.dev.br/?utm_source=marni-web-composer&utm_medium=footer&utm_campaign=footer_author_link' target='_blank' className="text-accent-primary hover:underline px-2">Lucas Linhares</a> 
          (<a href='https://www.sa.playblackdesert.com/pt-BR/Adventure/Profile?profileTarget=tbXSK7e39Sb3U3yPi7UDjoJ4HYP1uBJ0uXeDeCYer%2bf%2bGlEQ676FP3ea0Tf9bI6Eja3ry0lOzD32JW64BFHjaZehfLNYT5yISM8UmVniDcH%2fTCFWXFSLP3gNw9v4HHPzzy8QRxELwnZvpQIx%2btz%2fODOSAB%2b0G62GY2UmkHMmraop%2bvsMnvB1eDQJ3uQA6MTA' target='_blank' className="text-accent-primary hover:underline px-1">Tchepper</a>)
          <a href='https://github.com/llinhares/marni-web-composer' target='_blank' className="text-accent-primary hover:underline px-2">GitHub</a>
        </div>
        
        <div className="flex flex-wrap md:flex-nowrap gap-3 items-center w-full md:w-auto">
          <div className="flex w-full md:w-auto justify-center md:justify-start">
            <input 
              type="text" 
              value={song.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Insira o título da música." 
              className="w-full md:w-72 rounded-sm border border-grid-light bg-surface-modal px-3 py-1.5 text-xs text-content-primary outline-none transition-colors focus:border-accent-primary placeholder:text-content-muted"
            />
          </div>
          
          <div className="flex flex-wrap w-full md:w-auto items-center justify-center md:justify-end gap-2">
            <button 
              onClick={handleSaveMidi}
              className="flex-1 md:flex-none rounded-sm border border-[#4A423B] bg-[#352F2A] px-4 py-2 md:py-1.5 text-xs font-medium text-[#C4B9AA] hover:bg-[#453D37] transition-colors whitespace-nowrap"
            >
              Salvar MIDI
            </button>
            
            <button 
              onClick={handleExportWav}
              disabled={isExportingWav}
              className={`flex-1 md:flex-none rounded-sm border px-4 py-2 md:py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                isExportingWav 
                  ? 'border-[#8B7340] bg-[#42361E] text-[#DAB16C] animate-pulse cursor-wait' 
                  : 'border-[#4A423B] bg-[#352F2A] text-[#C4B9AA] hover:bg-[#453D37]'
              }`}
            >
              {isExportingWav ? 'Renderizando WAV...' : 'Exportar Áudio WAV'}
            </button>

            <button 
              onClick={() => setShowBdoExport(true)} 
              className="flex-1 md:flex-none rounded-sm border border-[#6B5330] bg-[#42361E] px-4 py-2 md:py-1.5 text-xs font-medium text-[#DAB16C] hover:bg-[#544426] transition-colors whitespace-nowrap shadow-sm"
            >
              Exportar para o BDO
            </button>
          </div>
        </div>
      </div>

      {showBdoExport && <BdoExportModal onClose={() => setShowBdoExport(false)} />}
      {showMixer && <MixerModal onClose={() => setShowMixer(false)} />}
    </div>
  );
}