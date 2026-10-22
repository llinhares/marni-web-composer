/**
 * Guided tour: steps and tooltip placement (pure, unit-tested).
 */

export interface TourStep {
  /** Element highlighted by the step: [data-tour="..."]. Omit for a centred step. */
  target?: string;
  title: string;
  body: string;
}

export const TOUR_STORAGE_KEY = 'marni_tour_done';
/** Bump when the tour changes enough that returning users should see it again. */
export const TOUR_VERSION = '1';

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Bem-vindo ao Marni Web Composer',
    body: 'Uma DAW no navegador para compor, gravar, mixar e exportar música — e, se quiser, levar suas músicas para o Black Desert. Este tour mostra o básico em 9 passos; use as setas ou os botões.',
  },
  {
    target: 'tracks',
    title: 'Faixas',
    body: 'Cada faixa é um instrumento. Clique numa faixa para editá-la no piano roll; M silencia, S deixa só ela tocando e o controle ajusta o volume.',
  },
  {
    target: 'add-track',
    title: 'Adicionar instrumentos',
    body: 'Crie novas faixas aqui. Ao lado ficam a importação de arquivos (MIDI, MusicXML e partituras do BDO) e as ferramentas de IA.',
  },
  {
    target: 'tools',
    title: 'Ferramentas de edição',
    body: 'Ponteiro (V) seleciona e move notas, Lápis (B) cria notas com um clique, Borracha (E) apaga e Mão (H) move a tela.',
  },
  {
    target: 'piano-roll',
    title: 'Piano roll',
    body: 'Aqui você escreve as notas: altura na vertical, tempo na horizontal. Clique na régua para mover o playhead; Ctrl+roda dá zoom.',
  },
  {
    target: 'transport',
    title: 'Tocar e gravar',
    body: 'Espaço toca e pausa. O botão vermelho grava do seu teclado MIDI; ao lado ficam metrônomo, contagem e loop.',
  },
  {
    target: 'tempo',
    title: 'Andamento e grade',
    body: 'Defina aqui o andamento (BPM). A fórmula de compasso (Ritmo) e o encaixe das notas (Grade) ficam no canto direito do topo.',
  },
  {
    target: 'project',
    title: 'Salvar o projeto',
    body: 'Abra e salve projetos .marni (Ctrl+O / Ctrl+S). O trabalho também é salvo automaticamente no navegador.',
  },
  {
    target: 'export',
    title: 'Exportar',
    body: 'Exporte áudio WAV, um arquivo MIDI para outros programas ou a partitura do Black Desert (com verificação do que o jogo mudaria).',
  },
  {
    target: 'help',
    title: 'Ajuda sempre à mão',
    body: 'Aqui estão todos os comandos, explicações de cada recurso e este tour, se quiser rever. Boa composição!',
  },
];

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Placement = 'bottom' | 'top' | 'right' | 'left' | 'center';

/**
 * Where to put the tooltip card next to the highlighted rect: below if it fits, then above, right,
 * left; otherwise centred. The card is always kept inside the viewport with a margin.
 */
export function placeTooltip(
  target: Rect | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 12,
  margin = 12
): { top: number; left: number; placement: Placement } {
  const clampLeft = (x: number) => Math.max(margin, Math.min(viewport.width - card.width - margin, x));
  const clampTop = (y: number) => Math.max(margin, Math.min(viewport.height - card.height - margin, y));
  const center = {
    top: clampTop((viewport.height - card.height) / 2),
    left: clampLeft((viewport.width - card.width) / 2),
    placement: 'center' as Placement,
  };
  if (!target || target.width <= 0 || target.height <= 0) return center;

  const cx = target.left + target.width / 2 - card.width / 2;
  const cy = target.top + target.height / 2 - card.height / 2;
  const below = target.top + target.height + gap;
  const above = target.top - gap - card.height;
  const right = target.left + target.width + gap;
  const left = target.left - gap - card.width;

  if (below + card.height + margin <= viewport.height) return { top: below, left: clampLeft(cx), placement: 'bottom' };
  if (above >= margin) return { top: above, left: clampLeft(cx), placement: 'top' };
  if (right + card.width + margin <= viewport.width) return { top: clampTop(cy), left: right, placement: 'right' };
  if (left >= margin) return { top: clampTop(cy), left, placement: 'left' };
  return center;
}

/** Highlight box around the target, padded and clipped to the viewport. */
export function spotlightRect(target: Rect, viewport: { width: number; height: number }, pad = 6): Rect {
  const top = Math.max(0, target.top - pad);
  const left = Math.max(0, target.left - pad);
  const bottom = Math.min(viewport.height, target.top + target.height + pad);
  const right = Math.min(viewport.width, target.left + target.width + pad);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
