import React, { useEffect, useState } from 'react';
import {
  CircleHelp,
  X,
  Keyboard,
  BookOpen,
  Info,
  Compass,
  Layers,
  MousePointer2,
  Play,
  SlidersVertical,
  Save,
  Upload,
  Sparkles,
} from 'lucide-react';
import { PIANO_ROLL_SHORTCUTS, SHORTCUTS, type ShortcutDef } from '../ui/shortcuts.ts';
import { APP_VERSION, APP_VERSION_LABEL } from '../version.ts';

export type HelpTab = 'guide' | 'commands' | 'about';

interface HelpCenterProps {
  isOpen: boolean;
  initialTab?: HelpTab;
  onClose: () => void;
  onStartTour: () => void;
}

const GROUP_ORDER: ShortcutDef['group'][] = ['Transporte', 'Edição', 'Ferramentas', 'Navegação', 'Projeto', 'Geral'];

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700/60 text-[10px] font-mono font-semibold text-amber-300 whitespace-nowrap">
    {children}
  </kbd>
);

interface GuideSection {
  icon: React.ReactNode;
  title: string;
  items: React.ReactNode[];
}

const GUIDE: GuideSection[] = [
  {
    icon: <Compass className="w-4 h-4" />,
    title: 'Como funciona',
    items: [
      <>O Marni é um estúdio para compor músicas para os instrumentos do Black Desert Online.</>,
      <>
        O caminho básico é: <b>criar faixas</b> (uma por instrumento) → <b>escrever notas</b> no piano roll → <b>ouvir e mixar</b> →{' '}
        <b>salvar o projeto</b> → <b>exportar</b> para o jogo, MIDI ou áudio.
      </>,
      <>Tudo roda no seu navegador: seus projetos e chaves de API ficam só no seu computador.</>,
    ],
  },
  {
    icon: <Layers className="w-4 h-4" />,
    title: 'Faixas (barra lateral)',
    items: [
      <>
        <b>Adicionar</b> cria uma faixa de instrumento. Clique numa faixa para torná-la ativa: o piano roll edita só a faixa ativa, as
        outras aparecem em cinza ao fundo.
      </>,
      <>
        <b>M</b> silencia (mute) e <b>S</b> deixa só ela tocando (solo). O controle deslizante ajusta o volume; o menu ⋮ troca o instrumento,
        duplica ou exclui a faixa.
      </>,
      <>
        O botão de importar abre MIDI (.mid), MusicXML, partituras do BDO, XML e projetos .marni — substituindo o projeto ou somando
        faixas.
      </>,
    ],
  },
  {
    icon: <MousePointer2 className="w-4 h-4" />,
    title: 'Piano roll',
    items: [
      <>
        Ferramentas: <Kbd>V</Kbd> ponteiro (selecionar, mover, esticar pela borda direita), <Kbd>M</Kbd> seleção em área,{' '}
        <Kbd>B</Kbd> lápis (clique para criar notas), <Kbd>E</Kbd> borracha e <Kbd>H</Kbd> mão (mover a tela).
      </>,
      <>
        Clique na régua para mover o playhead. <Kbd>Shift</Kbd>+arrastar na régua define a região de loop.
      </>,
      <>
        <Kbd>Ctrl</Kbd>+roda faz zoom, <Kbd>Shift</Kbd>+roda rola na horizontal e <Kbd>Alt</Kbd>+roda muda a intensidade. A pista{' '}
        <b>Intensidade</b> (canto inferior direito) mostra e edita a força de cada nota.
      </>,
      <>
        <b>Grade</b> (no topo) define o encaixe das notas. Linhas sombreadas em vermelho estão fora da extensão do instrumento.
      </>,
      <>
        Com notas selecionadas: copiar/colar, setas para mover e transpor, <Kbd>Q</Kbd> para quantizar e a barra flutuante com
        Expandir, Encolher, Quantizar e Humanizar.
      </>,
    ],
  },
  {
    icon: <Play className="w-4 h-4" />,
    title: 'Tocar, gravar e navegar',
    items: [
      <>
        <Kbd>Espaço</Kbd> toca/pausa; o quadrado para e volta ao início. O visor mostra compasso.tempo e o tempo decorrido.
      </>,
      <>
        <Kbd>R</Kbd> grava do teclado MIDI na faixa ativa (com 1 compasso de contagem, se ligado). <Kbd>K</Kbd> liga o metrônomo e{' '}
        <Kbd>L</Kbd> o loop.
      </>,
      <>
        Marcadores: <Kbd>Shift+M</Kbd> adiciona no playhead, <Kbd>[</Kbd> e <Kbd>]</Kbd> pulam entre eles; renomeie no menu da bandeira.
      </>,
      <>BPM, fórmula de compasso e grade ficam no topo e valem para o projeto inteiro.</>,
    ],
  },
  {
    icon: <SlidersVertical className="w-4 h-4" />,
    title: 'Som, efeitos e mixer',
    items: [
      <>Os instrumentos usam timbres gravados, baixados na primeira vez e guardados para uso offline.</>,
      <>Reverb, Delay e Chorus ligam/desligam no topo; o botão de ajustes ao lado abre os parâmetros.</>,
      <>
        <Kbd>X</Kbd> abre o mixer: equalizador de 3 bandas, compressor, pan, envio para efeitos e medidores de nível por faixa.
      </>,
    ],
  },
  {
    icon: <Save className="w-4 h-4" />,
    title: 'Projetos e segurança',
    items: [
      <>
        <Kbd>Ctrl+S</Kbd> salva o projeto (.marni) e <Kbd>Ctrl+O</Kbd> abre. O ponto âmbar no botão salvar indica alterações não salvas.
      </>,
      <>O projeto também é salvo automaticamente no navegador: se a aba fechar, ele oferece recuperar a sessão.</>,
      <>
        <Kbd>Ctrl+Z</Kbd> desfaz e <Kbd>Ctrl+Y</Kbd> refaz — notas, faixas, mixer, BPM e efeitos.
      </>,
    ],
  },
  {
    icon: <Upload className="w-4 h-4" />,
    title: 'Exportar',
    items: [
      <>
        <b>Exportar para o BDO</b> gera o arquivo do jogo (salve em Documentos/Black Desert/Music, sem extensão). Antes de exportar, a
        verificação mostra o que o jogo mudaria e oferece correções; escolha ali o rank da partitura.
      </>,
      <>Carregue um arquivo salvo pelo seu personagem para preencher o Owner ID e o nome automaticamente.</>,
      <>
        <b>Salvar MIDI</b> exporta para outros programas; <b>Exportar WAV</b> grava o áudio com os mesmos timbres e efeitos que você ouve.
      </>,
    ],
  },
  {
    icon: <Sparkles className="w-4 h-4" />,
    title: 'Ferramentas de IA',
    items: [
      <>
        <b>Partitura por imagem</b>: envie uma foto ou PDF e o Gemini lê os compassos (requer sua chave gratuita do Google AI Studio).
        Para fidelidade total, prefira importar MIDI ou MusicXML.
      </>,
      <>
        <b>Vídeo/Áudio para MIDI</b>: transcreve vídeos no estilo Synthesia (lendo as barras coloridas) e gravações de áudio.
      </>,
    ],
  },
];

export const HelpCenter: React.FC<HelpCenterProps> = ({ isOpen, initialTab = 'guide', onClose, onStartTour }) => {
  const [tab, setTab] = useState<HelpTab>(initialTab);

  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // "Ctrl+Y" and "Ctrl+Shift+Z" both redo: one row per description
  const commandRows = [...SHORTCUTS, ...PIANO_ROLL_SHORTCUTS].reduce<
    Map<string, { label: string; description: string; group: ShortcutDef['group'] }>
  >((acc, s) => {
    const key = `${s.group}|${s.description}`;
    const prev = acc.get(key);
    acc.set(key, prev ? { ...prev, label: `${prev.label} / ${s.label}` } : { label: s.label, description: s.description, group: s.group });
    return acc;
  }, new Map());

  const tabs: Array<{ id: HelpTab; label: string; icon: React.ReactNode }> = [
    { id: 'guide', label: 'Como usar', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'commands', label: 'Comandos', icon: <Keyboard className="w-3.5 h-3.5" /> },
    { id: 'about', label: 'Sobre', icon: <Info className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="modal-overlay animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="modal-panel w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#2d2722]">
          <h2 id="help-title" className="modal-title flex items-center gap-2">
            <CircleHelp className="w-4 h-4" /> Ajuda
          </h2>
          <button onClick={onClose} className="modal-close" aria-label="Fechar ajuda">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-[#2d2722]" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-colors ${
                tab === t.id ? 'bg-[#1a1715] border-[#3e342b] text-amber-400' : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 text-xs text-stone-300 leading-relaxed">
          {tab === 'guide' && (
            <div className="space-y-5">
              <button
                onClick={onStartTour}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-colors"
              >
                <Compass className="w-4 h-4" /> Fazer o tour guiado
              </button>
              {GUIDE.map((section) => (
                <section key={section.title}>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-100 mb-2">
                    <span className="text-amber-400">{section.icon}</span>
                    {section.title}
                  </h3>
                  <ul className="space-y-1.5 pl-6 list-disc marker:text-stone-600">
                    {section.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {tab === 'commands' && (
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
              {GROUP_ORDER.map((group) => {
                const items = [...commandRows.values()].filter((r) => r.group === group);
                if (items.length === 0) return null;
                return (
                  <section key={group}>
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">{group}</h3>
                    <dl className="space-y-1.5">
                      {items.map((r) => (
                        <div key={r.description} className="flex items-center justify-between gap-3">
                          <dt className="text-stone-300">{r.description}</dt>
                          <dd>
                            <Kbd>{r.label}</Kbd>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                );
              })}
            </div>
          )}

          {tab === 'about' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img src="/MWC_Logo.svg" alt="" className="w-12 h-12" />
                <div>
                  <div className="text-base font-bold text-stone-100">Marni Web Composer</div>
                  <div className="text-stone-400">
                    Versão {APP_VERSION_LABEL} <span className="text-stone-600">({APP_VERSION})</span>
                  </div>
                </div>
              </div>
              <p>
                DAW no navegador para compor, ouvir, mixar e exportar partituras para os instrumentos do Black Desert Online — com piano roll,
                gravação MIDI, timbres gravados, mixer e ferramentas de transcrição por IA.
              </p>
              <p>
                Criado por <b className="text-stone-100">Lucas Linhares</b> (Tchepper) •{' '}
                <a href="https://github.com/llinhares/marni-web-composer" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">
                  GitHub
                </a>
              </p>
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">Créditos</h3>
                <ul className="space-y-1 pl-5 list-disc marker:text-stone-600">
                  <li>Timbres: FluidR3_GM (Frank Wen), CC BY 3.0, via midi-js-soundfonts.</li>
                  <li>Transcrição de áudio: Spotify basic-pitch (Apache-2.0).</li>
                  <li>Leitura de partituras: Google Gemini (com a chave do próprio usuário).</li>
                </ul>
              </div>
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">Privacidade</h3>
                <p>
                  Projetos, salvamento automático e chaves de API ficam apenas no seu navegador. Só são enviados para a internet a imagem da
                  partitura (ao Gemini, quando você usa essa ferramenta) e os pedidos de download dos timbres.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
