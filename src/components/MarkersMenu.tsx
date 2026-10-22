import React, { useState } from 'react';
import { Flag, Plus, Trash2, CornerDownRight } from 'lucide-react';
import type { Marker } from '../types/music.ts';

interface MarkersMenuProps {
  markers: Marker[];
  formatPosition: (tick: number) => string;
  onAdd: () => void;
  onJump: (tick: number) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/** Song markers: add at the playhead (Shift+M), jump ([ / ]), rename and delete. */
export const MarkersMenu: React.FC<MarkersMenuProps> = ({ markers, formatPosition, onAdd, onJump, onRename, onDelete }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`p-1.5 rounded-md border transition-colors flex items-center gap-1 ${
          open ? 'bg-amber-500/15 border-amber-500/60 text-amber-400' : 'bg-stone-900 border-[#2d2722] text-stone-400 hover:text-stone-200'
        }`}
        title="Marcadores (Shift+M adiciona • [ e ] navegam)"
        aria-label="Marcadores"
        aria-expanded={open}
      >
        <Flag className="w-3.5 h-3.5" />
        {markers.length > 0 && <span className="text-[10px] font-mono">{markers.length}</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-72 rounded-xl bg-stone-900 border border-[#3e342b] shadow-2xl p-2 z-50 text-xs">
            <button
              onClick={onAdd}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-stone-800 text-amber-400 font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar no playhead
              <kbd className="ml-auto text-[10px] text-stone-500 font-mono">Shift+M</kbd>
            </button>
            {markers.length === 0 ? (
              <p className="px-2 py-2 text-stone-500">Nenhum marcador. Use marcadores para seções (intro, refrão...).</p>
            ) : (
              <ul className="mt-1 max-h-64 overflow-y-auto space-y-0.5">
                {markers.map((m) => (
                  <li key={m.id} className="flex items-center gap-1.5 px-1 py-0.5 rounded-lg hover:bg-stone-800/70">
                    <button
                      onClick={() => {
                        onJump(m.tick);
                        setOpen(false);
                      }}
                      className="p-1 text-stone-400 hover:text-amber-400"
                      title="Ir para o marcador"
                      aria-label={`Ir para ${m.name}`}
                    >
                      <CornerDownRight className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-[10px] text-stone-500 w-12 shrink-0">{formatPosition(m.tick)}</span>
                    <input
                      value={m.name}
                      onChange={(e) => onRename(m.id, e.target.value)}
                      className="flex-1 min-w-0 bg-transparent border border-transparent focus:border-amber-500/50 rounded px-1 py-0.5 text-stone-200 focus:outline-none"
                      aria-label="Nome do marcador"
                    />
                    <button
                      onClick={() => onDelete(m.id)}
                      className="p-1 text-stone-500 hover:text-red-400"
                      title="Remover marcador"
                      aria-label={`Remover ${m.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
