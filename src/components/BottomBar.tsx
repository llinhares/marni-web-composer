import React, { useState } from 'react';
import { Download, Music, Disc, ChevronUp, FileAudio, Lock, FolderOpen, Save } from 'lucide-react';

interface BottomBarProps {
  onOpenProject: () => void;
  onSaveProject: () => void;
  isDirty: boolean;
  projectFileLabel: string | null;
  lastAutosaveAt: Date | null;
  projectNotice: string | null;
  title: string;
  onTitleChange: (newTitle: string) => void;
  author?: string;
  onAuthorChange?: (newAuthor: string) => void;
  isBdoProtected?: boolean;
  onSaveMidi: () => void;
  onExportBdo: () => void;
  onExportWav: (bitDepth: 16 | 24) => void;
  isExportingAudio: boolean;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  title,
  onTitleChange,
  author,
  onAuthorChange,
  isBdoProtected,
  onSaveMidi,
  onExportBdo,
  onExportWav,
  isExportingAudio,
  onOpenProject,
  onSaveProject,
  isDirty,
  projectFileLabel,
  lastAutosaveAt,
  projectNotice,
}) => {
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const autosaveTime = lastAutosaveAt?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const statusText =
    projectNotice ??
    (isDirty
      ? `Alterações não salvas${autosaveTime ? ` • autosalvo ${autosaveTime}` : ''}`
      : projectFileLabel
        ? `Salvo • ${projectFileLabel}`
        : autosaveTime
          ? `Autosalvo ${autosaveTime}`
          : '');

  return (
    <footer className="relative h-14 bg-[#141210] border-t border-[#2d2722] px-3 sm:px-4 flex items-center justify-between gap-3 shrink-0 z-40 text-xs text-stone-300">
      {/* Left / Project file actions, Song Title & Author Input */}
      <div className="flex-1 max-w-2xl flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onOpenProject}
            className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 border border-[#2d2722] hover:border-amber-700/60 text-stone-300 transition-colors"
            title="Abrir projeto .marni (Ctrl+O)"
            aria-label="Abrir projeto"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          </button>
          <button
            onClick={onSaveProject}
            className="relative p-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 border border-[#2d2722] hover:border-amber-700/60 text-stone-300 transition-colors"
            title="Salvar projeto .marni (Ctrl+S) • Salvar como: Ctrl+Shift+S"
            aria-label={isDirty ? 'Salvar projeto (alterações não salvas)' : 'Salvar projeto'}
          >
            <Save className="w-3.5 h-3.5 text-amber-400" />
            {isDirty && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
            )}
          </button>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Insira o título da música..."
          className="flex-1 bg-stone-900/90 border border-[#2d2722] rounded-lg px-3 py-1.5 text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500/60 font-medium text-xs transition-colors"
          aria-label="Título da Música"
        />
        {onAuthorChange !== undefined && (
          <div className="relative flex items-center">
            <input
              type="text"
              value={author ?? ''}
              onChange={(e) => {
                if (!isBdoProtected) {
                  onAuthorChange(e.target.value);
                }
              }}
              readOnly={isBdoProtected}
              disabled={isBdoProtected}
              placeholder="Personagem / Família..."
              className={`w-40 bg-stone-900/90 border rounded-lg px-2.5 py-1.5 font-medium text-xs transition-colors ${
                isBdoProtected
                  ? 'border-amber-900/40 text-amber-400/90 cursor-not-allowed pr-7 bg-stone-900/95 selection:bg-none'
                  : 'border-[#2d2722] text-stone-300 placeholder-stone-500 focus:outline-none focus:border-amber-500/60'
              }`}
              title={
                isBdoProtected
                  ? 'Partitura original do Black Desert: Composição e Arranjo protegidos contra plágio.'
                  : 'Nome de Personagem / Família (usado igualmente em Composição e Arranjo no BDO)'
              }
              aria-label="Autor da Música"
            />
            {isBdoProtected && (
              <span
                className="absolute right-2 text-amber-400/80 pointer-events-none"
                title="Partitura original do Black Desert: Composição e Arranjo protegidos contra plágio."
              >
                <Lock className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        )}
        {statusText && (
          <span
            className={`hidden md:inline truncate text-[11px] ${isDirty && !projectNotice ? 'text-amber-400/80' : 'text-stone-500'}`}
            role="status"
            aria-live="polite"
          >
            {statusText}
          </span>
        )}
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
            <>
              {/* Backdrop overlay for click-outside */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAudioMenuOpen(false)}
              />
              <div className="absolute right-0 bottom-full mb-2 w-52 rounded-xl bg-stone-900 border border-[#3e342b] shadow-2xl py-1.5 text-xs text-stone-300 z-50 animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    setAudioMenuOpen(false);
                    onExportWav(24);
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-stone-850 text-left transition-colors cursor-pointer group"
                >
                  <Disc className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
                  <div>
                    <div className="font-semibold text-stone-200 group-hover:text-amber-300 transition-colors">
                      Studio Master (24-bit)
                    </div>
                    <div className="text-[10px] text-stone-400">48kHz • Qualidade máxima</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setAudioMenuOpen(false);
                    onExportWav(16);
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-stone-850 text-left transition-colors cursor-pointer group"
                >
                  <Disc className="w-4 h-4 text-stone-400 group-hover:text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
                  <div>
                    <div className="font-semibold text-stone-200 group-hover:text-amber-300 transition-colors">
                      Padrão CD (16-bit)
                    </div>
                    <div className="text-[10px] text-stone-400">44.1kHz • Compatibilidade</div>
                  </div>
                </button>
              </div>
            </>
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
