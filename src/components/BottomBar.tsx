import React, { useState } from 'react';
import { Download, Music, Disc, ChevronUp, FileAudio } from 'lucide-react';

interface BottomBarProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  onSaveMidi: () => void;
  onExportBdo: () => void;
  onExportWav: (bitDepth: 16 | 24) => void;
  isExportingAudio: boolean;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  title,
  onTitleChange,
  onSaveMidi,
  onExportBdo,
  onExportWav,
  isExportingAudio,
}) => {
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);

  return (
    <footer className="h-14 bg-[#141210] border-t border-[#2d2722] px-3 sm:px-4 flex items-center justify-between gap-3 shrink-0 z-20 text-xs text-stone-300">
      {/* Left / Song Title Input */}
      <div className="flex-1 max-w-md">
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Insira o título da música..."
          className="w-full bg-stone-900/90 border border-[#2d2722] rounded-lg px-3 py-1.5 text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500/60 font-medium text-xs transition-colors"
          aria-label="Título da Música"
        />
      </div>

      {/* Center Helpful Shortcuts Hint */}
      <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono select-none">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-900/80 border border-[#2d2722] text-stone-400">
          <span className="text-amber-500/90 font-semibold font-sans">Dica:</span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-stone-850 border border-stone-700/60 text-[10px] text-stone-300 font-sans">H</kbd> ou <kbd className="px-1.5 py-0.5 rounded bg-stone-850 border border-stone-700/60 text-[10px] text-stone-300 font-sans">Clique Scroll</kbd> mover tela
          </span>
          <span className="text-stone-600">•</span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-stone-850 border border-stone-700/60 text-[10px] text-stone-300 font-sans">Shift + Scroll</kbd> rolar horizontal
          </span>
          <span className="text-stone-600">•</span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-stone-850 border border-stone-700/60 text-[10px] text-stone-300 font-sans">Alt + Scroll</kbd> intensidade
          </span>
        </div>
      </div>

      {/* Right / Export Action Buttons matching Screenshot 1 */}
      <div className="flex items-center gap-2">
        {/* High-Resolution Lossless Audio Dropdown (WAV 24-bit / 16-bit) */}
        <div className="relative">
          <button
            onClick={() => setAudioMenuOpen(!audioMenuOpen)}
            disabled={isExportingAudio}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 border border-[#2d2722] hover:border-amber-700/60 text-stone-300 font-semibold transition-colors text-xs"
            title="Exportar Áudio em Alta Resolução (WAV)"
          >
            <FileAudio className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Exportar WAV</span>
            <ChevronUp className="w-3 h-3 text-stone-400" />
          </button>

          {audioMenuOpen && (
            <div className="absolute right-0 bottom-full mb-1 w-48 rounded-xl bg-stone-900 border border-[#3e342b] shadow-2xl py-1 text-xs text-stone-300 z-30">
              <button
                onClick={() => {
                  setAudioMenuOpen(false);
                  onExportWav(24);
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-stone-800 text-left"
              >
                <Disc className="w-3.5 h-3.5 text-amber-400" />
                <div>
                  <div className="font-semibold text-stone-200">Studio Master (24-bit)</div>
                  <div className="text-[10px] text-stone-400">48kHz • Qualidade máxima</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setAudioMenuOpen(false);
                  onExportWav(16);
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-stone-800 text-left"
              >
                <Disc className="w-3.5 h-3.5 text-stone-400" />
                <div>
                  <div className="font-semibold text-stone-200">Padrão CD (16-bit)</div>
                  <div className="text-[10px] text-stone-400">44.1kHz • Compatibilidade</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Salvar MIDI Button */}
        <button
          onClick={onSaveMidi}
          className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 border border-[#2d2722] hover:border-amber-700/60 text-stone-200 font-semibold transition-colors text-xs shadow-sm"
          title="Salvar Partitura como Arquivo MIDI Padrão (.mid)"
        >
          <Music className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Salvar MIDI</span>
          <span className="sm:hidden">MIDI</span>
        </button>

        {/* Exportar para o BDO Button */}
        <button
          onClick={onExportBdo}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-all shadow-[0_0_12px_rgba(245,158,11,0.3)] text-xs"
          title="Exportar para Black Desert Online"
        >
          <Download className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="hidden sm:inline">Exportar para o BDO</span>
          <span className="sm:hidden">BDO</span>
        </button>
      </div>
    </footer>
  );
};
