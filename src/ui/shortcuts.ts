/**
 * Keyboard shortcut table: one source of truth for matching keys and for the shortcuts help dialog.
 */

export type ShortcutId =
  | 'save'
  | 'saveAs'
  | 'open'
  | 'undo'
  | 'redo'
  | 'redoAlt'
  | 'playPause'
  | 'record'
  | 'metronome'
  | 'loop'
  | 'mixer'
  | 'addMarker'
  | 'prevMarker'
  | 'nextMarker'
  | 'toolPointer'
  | 'toolSelect'
  | 'toolPencil'
  | 'toolEraser'
  | 'toolPan'
  | 'help';

export interface ShortcutDef {
  id: ShortcutId;
  key: string; // KeyboardEvent.key, case-insensitive for letters; 'Space' matches event.code
  mod?: boolean; // Ctrl (Windows/Linux) or Cmd (macOS)
  shift?: boolean;
  alt?: boolean;
  allowInInputs?: boolean; // also while typing in a text field
  label: string;
  description: string;
  group: 'Projeto' | 'Transporte' | 'Ferramentas' | 'Edição' | 'Navegação' | 'Geral';
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'save', key: 's', mod: true, allowInInputs: true, label: 'Ctrl+S', description: 'Salvar projeto', group: 'Projeto' },
  { id: 'saveAs', key: 's', mod: true, shift: true, allowInInputs: true, label: 'Ctrl+Shift+S', description: 'Salvar como', group: 'Projeto' },
  { id: 'open', key: 'o', mod: true, allowInInputs: true, label: 'Ctrl+O', description: 'Abrir projeto', group: 'Projeto' },
  { id: 'undo', key: 'z', mod: true, label: 'Ctrl+Z', description: 'Desfazer', group: 'Edição' },
  { id: 'redo', key: 'y', mod: true, label: 'Ctrl+Y', description: 'Refazer', group: 'Edição' },
  { id: 'redoAlt', key: 'z', mod: true, shift: true, label: 'Ctrl+Shift+Z', description: 'Refazer', group: 'Edição' },
  { id: 'playPause', key: 'Space', label: 'Espaço', description: 'Tocar / pausar', group: 'Transporte' },
  { id: 'record', key: 'r', label: 'R', description: 'Gravar do teclado MIDI', group: 'Transporte' },
  { id: 'metronome', key: 'k', label: 'K', description: 'Metrônomo', group: 'Transporte' },
  { id: 'loop', key: 'l', label: 'L', description: 'Loop (seleção ou 4 compassos)', group: 'Transporte' },
  { id: 'mixer', key: 'x', label: 'X', description: 'Abrir/fechar mixer', group: 'Geral' },
  { id: 'addMarker', key: 'm', shift: true, label: 'Shift+M', description: 'Adicionar marcador', group: 'Navegação' },
  { id: 'prevMarker', key: '[', label: '[', description: 'Marcador anterior', group: 'Navegação' },
  { id: 'nextMarker', key: ']', label: ']', description: 'Próximo marcador', group: 'Navegação' },
  { id: 'toolPointer', key: 'v', label: 'V', description: 'Ferramenta ponteiro', group: 'Ferramentas' },
  { id: 'toolSelect', key: 'm', label: 'M', description: 'Seleção em área', group: 'Ferramentas' },
  { id: 'toolPencil', key: 'b', label: 'B', description: 'Lápis', group: 'Ferramentas' },
  { id: 'toolEraser', key: 'e', label: 'E', description: 'Borracha', group: 'Ferramentas' },
  { id: 'toolPan', key: 'h', label: 'H', description: 'Mão (mover tela)', group: 'Ferramentas' },
  { id: 'help', key: '?', shift: true, label: '?', description: 'Mostrar atalhos', group: 'Geral' },
];

/** Shortcuts handled inside the piano roll (listed in the help dialog). */
export const PIANO_ROLL_SHORTCUTS: Pick<ShortcutDef, 'label' | 'description' | 'group'>[] = [
  { label: 'Ctrl+A', description: 'Selecionar todas as notas da faixa', group: 'Edição' },
  { label: 'Ctrl+C / Ctrl+X / Ctrl+V', description: 'Copiar / recortar / colar no playhead', group: 'Edição' },
  { label: 'Ctrl+D', description: 'Duplicar seleção', group: 'Edição' },
  { label: 'Delete', description: 'Apagar seleção', group: 'Edição' },
  { label: '← → (Alt: 1 tick)', description: 'Mover seleção na grade', group: 'Edição' },
  { label: '↑ ↓ (Shift: oitava)', description: 'Transpor seleção', group: 'Edição' },
  { label: 'Q (Shift+Q: 50%)', description: 'Quantizar seleção', group: 'Edição' },
  { label: 'Shift+arrastar na régua', description: 'Definir região de loop', group: 'Navegação' },
  { label: 'Ctrl+roda', description: 'Zoom', group: 'Navegação' },
];

export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Exact modifier match: plain "V" never fires on Ctrl+V, "R" never on Ctrl+R (browser reload). */
export function matchesShortcut(e: KeyEventLike, s: ShortcutDef): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (!!s.mod !== mod || !!s.alt !== e.altKey) return false;
  if (s.key === 'Space') return e.code === 'Space' && !e.shiftKey;
  // Symbols like "?" already imply Shift on most layouts; letters compare case-insensitively
  const isLetter = /^[a-z]$/i.test(s.key);
  if (isLetter && !!s.shift !== e.shiftKey) return false;
  return isLetter ? e.key.toLowerCase() === s.key : e.key === s.key;
}

export function findShortcut(e: KeyEventLike, inEditable: boolean): ShortcutDef | null {
  for (const s of SHORTCUTS) {
    if (inEditable && !s.allowInInputs) continue;
    if (matchesShortcut(e, s)) return s;
  }
  return null;
}

/** True when focus is in a text field, select or rich-text editor (typing must not trigger shortcuts). */
export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'color'].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}
