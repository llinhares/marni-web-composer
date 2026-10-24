import React, { useEffect, useRef, useState } from 'react';
import { X, Layers, Play, Square, FileAudio, Loader2 } from 'lucide-react';
import type { Track } from '../types/music.ts';
import { extractAudioBufferFromFile, estimateBpmFromAudioBuffer } from '../utils/audioToMidi.ts';
import { separateStems, toDemucsInput } from '../audio/stems/stemSeparation.ts';
import { transcribeStems, type StemPart } from '../audio/stems/stemImport.ts';
import { DEMUCS_SAMPLE_RATE, type StemName, type Stems } from '../audio/stems/stemTypes.ts';
import { bdoInstrumentFromCode, getBdoInstrument, type BdoInstrumentKey } from '../bdo/bdoInstruments.ts';
import { instrumentTrackFields } from '../bdo/trackInstrument.ts';
import { BdoInstrumentSelect } from './BdoInstrumentSelect.tsx';
import { BetaBadge } from './BetaBadge.tsx';
import { newId } from '../utils/ids.ts';
import { notify } from '../ui/notify.ts';
import { formatTimecode } from '../utils/musicMath.ts';

interface StemSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBpm: number;
  /** Adds the tracks to the project (bpm: set the project tempo; title: song title). */
  onImportTracks: (tracks: Track[], options: { bpm?: number; title?: string }) => void;
}

interface Row extends StemPart {
  include: boolean;
}

/**
 * "Separar instrumentos": splits an audio or video file into vocals, drums, bass and other with
 * Demucs, transcribes each stem and creates one track per stem with a game instrument.
 */
export const StemSplitModal: React.FC<StemSplitModalProps> = ({ isOpen, onClose, currentBpm, onImportTracks }) => {
  const [file, setFile] = useState<File | null>(null);
  const [audio, setAudio] = useState<AudioBuffer | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stems, setStems] = useState<Stems | null>(null);
  const [bpm, setBpm] = useState(currentBpm);
  const [applyBpm, setApplyBpm] = useState(true);
  const [playing, setPlaying] = useState<StemName | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null);

  const stopPreview = () => {
    previewRef.current?.src.stop();
    void previewRef.current?.ctx.close();
    previewRef.current = null;
    setPlaying(null);
  };

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      stopPreview();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const reset = () => {
    setRows(null);
    setStems(null);
    setProgress(0);
    setStage('');
  };

  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    reset();
    setFile(f);
    setAudio(null);
    setBusy(true);
    setStage('Lendo o áudio do arquivo...');
    try {
      const buf = await extractAudioBufferFromFile(f);
      setAudio(buf);
      setStart(0);
      setEnd(Math.floor(buf.duration));
      setStage('');
    } catch {
      setFile(null);
      notify.error('Não foi possível ler o áudio deste arquivo. Use MP3, WAV, OGG, M4A, MP4 ou WEBM.');
      setStage('');
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!audio || !file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    reset();
    try {
      const from = Math.max(0, Math.min(start, audio.duration - 1));
      const to = end > from ? Math.min(end, audio.duration) : audio.duration;
      const detected = estimateBpmFromAudioBuffer(audio, from, to);
      setBpm(detected);
      setStage('Preparando o áudio...');
      const input = await toDemucsInput(audio, from, to);
      const separated = await separateStems(input, {
        signal: controller.signal,
        onProgress: ({ progress: p, stage: s }) => {
          setProgress(p * 0.8);
          setStage(s);
        },
      });
      setStems(separated);
      const parts = await transcribeStems(separated, {
        bpm: detected,
        signal: controller.signal,
        onProgress: (p, s) => {
          setProgress(0.8 + p * 0.2);
          setStage(s);
        },
      });
      setRows(parts.map((p) => ({ ...p, include: !p.silent && p.notes.length > 0 })));
      setProgress(1);
      setStage('Pronto! Revise as faixas e importe.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStage('Cancelado.');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setStage('');
        notify.error(`Falha ao separar os instrumentos: ${msg}`);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const preview = (stem: StemName) => {
    if (playing === stem) {
      stopPreview();
      return;
    }
    stopPreview();
    if (!stems) return;
    const ctx = new AudioContext();
    const s = stems[stem];
    const buf = ctx.createBuffer(2, s.left.length, DEMUCS_SAMPLE_RATE);
    buf.copyToChannel(s.left, 0);
    buf.copyToChannel(s.right, 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => {
      if (previewRef.current?.src === src) stopPreview();
    };
    src.start();
    previewRef.current = { ctx, src };
    setPlaying(stem);
  };

  const importTracks = () => {
    if (!rows) return;
    stopPreview();
    const chosen = rows.filter((r) => r.include && r.notes.length > 0);
    if (chosen.length === 0) {
      notify.info('Nenhuma faixa selecionada para importar.');
      return;
    }
    // Keep the real timing when the project tempo is kept
    const ratio = applyBpm ? 1 : currentBpm / bpm;
    const title = file ? file.name.replace(/\.[^/.]+$/, '').trim() : undefined;
    const tracks: Track[] = chosen.map((r) => {
      const id = newId('track');
      const def = getBdoInstrument(r.instrument)!;
      return {
        id,
        name: `${r.label} · ${def.name}`,
        ...instrumentTrackFields(r.instrument),
        sustainPedal: false,
        pan: 0,
        isMuted: false,
        isSolo: false,
        auxSend: true,
        notes: r.notes.map((n) => ({
          ...n,
          id: newId('note'),
          trackId: id,
          startTick: Math.round(n.startTick * ratio),
          durationTicks: Math.max(15, Math.round(n.durationTicks * ratio)),
          selected: false,
        })),
      };
    });
    onImportTracks(tracks, { bpm: applyBpm ? bpm : undefined, title });
    notify.success(`${tracks.length} ${tracks.length === 1 ? 'faixa importada' : 'faixas importadas'}.`);
    onClose();
  };

  const setInstrument = (stem: StemName, code: number) => {
    const found = bdoInstrumentFromCode(code);
    if (!found) return;
    setRows((prev) => prev?.map((r) => (r.stem === stem ? { ...r, instrument: found.def.key as BdoInstrumentKey } : r)) ?? null);
  };

  const close = () => {
    abortRef.current?.abort();
    stopPreview();
    onClose();
  };

  const minutes = audio ? Math.max(0, (end || audio.duration) - start) / 60 : 0;

  return (
    <div className="modal-overlay animate-in fade-in duration-150" onClick={busy ? undefined : close}>
      <div
        className="w-full max-w-2xl modal-panel p-6 text-stone-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stem-split-title"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="stem-split-title" className="modal-title flex items-center gap-2">
              <Layers className="w-5 h-5 text-sky-400" />
              Separar Instrumentos
              <BetaBadge />
            </h2>
            <p className="modal-subtitle">
              Separa voz, bateria, baixo e harmonia de um áudio ou vídeo e cria uma faixa com instrumento do jogo para cada um.
            </p>
          </div>
          <button onClick={close} className="modal-close" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label
          className={`block rounded-xl border border-dashed p-4 text-center cursor-pointer transition-colors ${
            busy ? 'opacity-60 pointer-events-none' : 'border-[#4a3f35] hover:border-sky-500/60 bg-stone-900/40'
          }`}
        >
          <input
            type="file"
            accept="audio/*,video/*,.mp3,.wav,.ogg,.m4a,.flac,.mp4,.webm,.mov,.mkv"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
            disabled={busy}
          />
          <FileAudio className="w-6 h-6 mx-auto text-sky-400 mb-1" />
          <span className="text-sm font-semibold text-stone-200">{file ? file.name : 'Escolher arquivo de áudio ou vídeo'}</span>
          <span className="block text-[11px] text-stone-400 mt-0.5">
            {audio ? `Duração ${formatTimecode(audio.duration)} • de vídeos só o áudio é usado` : 'MP3, WAV, OGG, M4A, FLAC, MP4, WEBM...'}
          </span>
        </label>

        {audio && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-stone-400">Início do trecho (s)</span>
              <input
                type="number"
                min={0}
                max={Math.floor(audio.duration)}
                value={start}
                disabled={busy}
                onChange={(e) => setStart(Math.max(0, Number(e.target.value) || 0))}
                className="bg-stone-900 border border-[#3e342b] rounded-md px-2 py-1.5 text-stone-200 focus:outline-none focus:border-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-stone-400">Fim do trecho (s)</span>
              <input
                type="number"
                min={1}
                max={Math.ceil(audio.duration)}
                value={end}
                disabled={busy}
                onChange={(e) => setEnd(Math.max(0, Number(e.target.value) || 0))}
                className="bg-stone-900 border border-[#3e342b] rounded-md px-2 py-1.5 text-stone-200 focus:outline-none focus:border-sky-500"
              />
            </label>
            <p className="col-span-2 text-[11px] text-stone-500 leading-snug">
              A separação roda no seu computador: leva alguns minutos ({minutes.toFixed(1)} min de música). Na primeira vez o
              modelo de IA (180 MB) é baixado e fica guardado no navegador. Trechos menores processam mais rápido.
            </p>
          </div>
        )}

        {(busy || stage) && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-xs text-stone-300 mb-1.5">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />}
              <span>{stage}</span>
            </div>
            <div className="h-1.5 rounded bg-stone-800 overflow-hidden">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )}

        {rows && (
          <div className="mt-5 border border-[#2d2722] rounded-lg overflow-hidden text-xs">
            <div className="grid grid-cols-[24px_1fr_1.6fr_70px_34px] gap-2 bg-stone-900/90 px-3 py-2 text-[10px] uppercase font-semibold text-stone-400 tracking-wider">
              <span />
              <span>Parte</span>
              <span>Instrumento</span>
              <span className="text-right">Notas</span>
              <span />
            </div>
            {rows.map((r) => (
              <div
                key={r.stem}
                className={`grid grid-cols-[24px_1fr_1.6fr_70px_34px] gap-2 items-center px-3 py-2 border-t border-[#2d2722] ${
                  r.silent ? 'opacity-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={r.include}
                  disabled={r.notes.length === 0}
                  onChange={(e) => setRows((prev) => prev?.map((x) => (x.stem === r.stem ? { ...x, include: e.target.checked } : x)) ?? null)}
                  aria-label={`Importar ${r.label}`}
                  className="accent-sky-500"
                />
                <span className="text-stone-200 font-medium">
                  {r.label}
                  {r.silent && <span className="block text-[10px] text-stone-500">sem som nesta música</span>}
                </span>
                <BdoInstrumentSelect
                  perSound={false}
                  value={getBdoInstrument(r.instrument)!.code}
                  onChange={(code) => setInstrument(r.stem, code)}
                  className="bg-stone-900/90 border border-[#3e342b] rounded-md px-2 py-1 text-xs text-stone-200 min-w-0 focus:outline-none focus:border-sky-500"
                />
                <span className="text-right font-mono text-sky-300">{r.notes.length}</span>
                <button
                  onClick={() => preview(r.stem)}
                  disabled={r.silent}
                  className="p-1.5 rounded border border-[#3e342b] hover:border-sky-500 text-stone-300 hover:text-sky-300 disabled:opacity-40"
                  title={playing === r.stem ? 'Parar' : `Ouvir a parte separada (${r.label})`}
                >
                  {playing === r.stem ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {rows && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-300">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={applyBpm} onChange={(e) => setApplyBpm(e.target.checked)} className="accent-sky-500" />
              Usar o andamento detectado
            </label>
            <span className="font-mono text-sky-300">{bpm} BPM</span>
            {!applyBpm && <span className="text-stone-500">(as notas mantêm o tempo real em {currentBpm} BPM)</span>}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {busy ? (
            <button onClick={() => abortRef.current?.abort()} className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs text-stone-200">
              Cancelar
            </button>
          ) : (
            <button onClick={close} className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs text-stone-200">
              Fechar
            </button>
          )}
          {rows ? (
            <button
              onClick={importTracks}
              className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-stone-950 text-xs font-bold"
            >
              Importar {rows.filter((r) => r.include && r.notes.length > 0).length} faixas
            </button>
          ) : (
            <button
              onClick={() => void run()}
              disabled={!audio || busy}
              className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 text-xs font-bold"
            >
              Separar e transcrever
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
