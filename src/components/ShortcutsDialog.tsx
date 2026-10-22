import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { PIANO_ROLL_SHORTCUTS, SHORTCUTS, type ShortcutDef } from '../ui/shortcuts.ts';

const GROUP_ORDER: ShortcutDef['group'][] = ['Transporte', 'Edição', 'Ferramentas', 'Navegação', 'Projeto', 'Geral'];

/** Lists every keyboard shortcut, from the same table that handles them. */
export const ShortcutsDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  // "Ctrl+Y" and "Ctrl+Shift+Z" both redo: show one row per description
  const rows = [...SHORTCUTS, ...PIANO_ROLL_SHORTCUTS].reduce<Map<string, { label: string; description: string; group: ShortcutDef['group'] }>>(
    (acc, s) => {
      const key = `${s.group}|${s.description}`;
      const prev = acc.get(key);
      acc.set(key, prev ? { ...prev, label: `${prev.label} / ${s.label}` } : { label: s.label, description: s.description, group: s.group });
      return acc;
    },
    new Map()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[#3e342b] bg-[#161412] p-5 shadow-2xl text-stone-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="shortcuts-title" className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Keyboard className="w-4 h-4" /> Atalhos de teclado
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-100" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
          {GROUP_ORDER.map((group) => {
            const items = [...rows.values()].filter((r) => r.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group}>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">{group}</h3>
                <dl className="space-y-1 text-xs">
                  {items.map((r) => (
                    <div key={r.description} className="flex items-center justify-between gap-3">
                      <dt className="text-stone-300">{r.description}</dt>
                      <dd>
                        <kbd className="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700/60 text-[10px] font-mono text-amber-300 whitespace-nowrap">
                          {r.label}
                        </kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
