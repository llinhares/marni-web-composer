import React from 'react';
import { History } from 'lucide-react';

interface RecoveryBannerProps {
  savedAt: Date;
  title: string;
  trackCount: number;
  noteCount: number;
  onRestore: () => void;
  onDiscard: () => void;
}

/** Offers to restore the last autosaved session after a reload, crash or closed tab. */
export const RecoveryBanner: React.FC<RecoveryBannerProps> = ({
  savedAt,
  title,
  trackCount,
  noteCount,
  onRestore,
  onDiscard,
}) => {
  const when = savedAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div
      className="fixed left-1/2 top-16 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-amber-500/40 bg-[#1c1a1a] p-4 shadow-2xl text-stone-200"
      role="alertdialog"
      aria-labelledby="recovery-title"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 shrink-0">
          <History className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 id="recovery-title" className="text-sm font-semibold text-stone-100">
            Recuperar sessão anterior?
          </h3>
          <p className="mt-1 text-xs text-stone-400 leading-relaxed">
            Encontramos um salvamento automático de <span className="text-stone-200 font-medium">{title || 'Sem título'}</span>{' '}
            ({trackCount} {trackCount === 1 ? 'faixa' : 'faixas'}, {noteCount} notas) de {when}.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={onDiscard}
              className="px-3 py-1.5 rounded-lg border border-[#3e3832] bg-[#23201e] text-xs font-medium text-stone-300 hover:text-stone-100 hover:border-stone-500 transition-colors"
            >
              Descartar
            </button>
            <button
              onClick={onRestore}
              autoFocus
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors"
            >
              Restaurar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
