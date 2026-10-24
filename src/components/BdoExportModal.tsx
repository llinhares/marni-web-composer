import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Upload,
  Copy,
  Check,
  Download,
  AlertTriangle,
  FileCode,
  Music,
  AudioWaveform,
  Lock,
  CircleAlert,
  Info,
  Wrench,
  CheckCircle2,
} from 'lucide-react';
import type { Track, EffectorSettings, SongMetadata } from '../types/music.ts';
import {
  exportToBdo,
  decryptOwnerHeader,
  exportCodeForTrack,
  type ExportOptions,
  type SongContext,
} from '../bdo/bdoExportV2.ts';
import { bdoInstrumentFromCode } from '../bdo/bdoInstruments.ts';
import { BdoInstrumentSelect } from './BdoInstrumentSelect.tsx';
import { generateBdoScore } from '../bdo/bdoConverter.ts';
import { notify, errorMessage } from '../ui/notify.ts';
import { getSavedAuthor, getSavedOwnerId, saveOwnerId } from '../user/userProfile.ts';
import { BDO_GRADE_LIMITS } from '../types/music.ts';
import {
  applyBdoFix,
  timeSignatureParts,
  validateForBdo,
  BDO_GRADES,
  type BdoGradeId,
  type BdoIssue,
} from '../bdo/bdoValidation.ts';

interface BdoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  metadata: SongMetadata;
  effectorSettings: EffectorSettings;
  onApplyTracks: (tracks: Track[]) => void;
  /** The author name is the same everywhere (bottom bar, project, BDO composer). */
  onAuthorChange: (name: string) => void;
  onGradeChange: (grade: BdoGradeId) => void;
}

const SEVERITY_STYLE: Record<BdoIssue['severity'], { box: string; icon: React.ReactNode }> = {
  error: {
    box: 'border-red-700/60 bg-red-950/30 text-red-200',
    icon: <CircleAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />,
  },
  warning: {
    box: 'border-amber-700/50 bg-amber-950/30 text-amber-100',
    icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />,
  },
  info: {
    box: 'border-[#3e342b] bg-stone-900/60 text-stone-300',
    icon: <Info className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />,
  },
};

export const BdoExportModal: React.FC<BdoExportModalProps> = ({
  isOpen,
  onClose,
  tracks,
  metadata,
  effectorSettings,
  onApplyTracks,
  onGradeChange,
  onAuthorChange,
}) => {
  // Active Export Mode: 'binary' (Game-compatible .bms ICE file) or 'xml-mml' (Sheet Score preview from print)
  const [activeTab, setActiveTab] = useState<'binary' | 'xml'>('binary');
  const [xmlSubTab, setXmlSubTab] = useState<'xml' | 'mml'>('xml');
  const [copied, setCopied] = useState(false);

  // Binary Exporter State (from Lucas Linhares v2)
  // Name and owner ID belong to whoever is using the app: no defaults, only what they informed
  const initialComposer = () =>
    metadata.isBdoProtected && (metadata.originalBdoComposer || metadata.originalBdoAuthor)
      ? (metadata.originalBdoComposer || metadata.originalBdoAuthor)!
      : metadata.author || getSavedAuthor();
  const initialOwner = () =>
    metadata.isBdoProtected && metadata.originalBdoOwnerId !== undefined
      ? metadata.originalBdoOwnerId.toString()
      : (getSavedOwnerId()?.toString() ?? '');
  const describeId = (owner: string, name: string) => {
    if (!owner || !(Number(owner) > 0)) return 'Nenhum ID carregado';
    const protSuffix = metadata.isBdoProtected ? ' [Protegido contra Plágio]' : '';
    return `0x${Number(owner).toString(16)}${name ? ` (${name})` : ''}${protSuffix}`;
  };
  const [charName, setCharName] = useState<string>(initialComposer);
  const [ownerId, setOwnerId] = useState<string>(initialOwner);
  const [idStatus, setIdStatus] = useState<string>(() => describeId(initialOwner(), initialComposer()));
  const [transpose, setTranspose] = useState<string>('0');
  const [maxChunkNotes, setMaxChunkNotes] = useState<string>('730');

  // Velocity Compression options
  const [velMode, setVelMode] = useState<'layered' | 'stepped' | 'rescale' | 'floor' | 'off'>('layered');
  const [stepBase, setStepBase] = useState<string>('100');
  const [stepStep, setStepStep] = useState<string>('5');
  const [rescaleMin, setRescaleMin] = useState<string>('80');
  const [rescaleMax, setRescaleMax] = useState<string>('127');
  const [floorVal, setFloorVal] = useState<string>('100');

  // Instrument overrides, volume scales, and sustain pedal per track
  const [instOverrides, setInstOverrides] = useState<Record<string, number>>({});
  const [velScales, setVelScales] = useState<Record<string, number>>({});
  const [sustainOverrides, setSustainOverrides] = useState<Record<string, boolean>>({});
  const [mergeTarget, setMergeTarget] = useState<number>(0x11); // Florquestra · Piano

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize overrides from tracks and metadata
  useEffect(() => {
    if (!isOpen) return;
    const composer = initialComposer();
    const owner = initialOwner();
    setCharName(composer);
    setOwnerId(owner);
    setIdStatus(describeId(owner, composer));

    const initialOverrides: Record<string, number> = {};
    const initialScales: Record<string, number> = {};
    const initialSustains: Record<string, boolean> = {};

    tracks.forEach((t) => {
      // The track's own game instrument (chosen when it was created or imported)
      initialOverrides[t.id] = exportCodeForTrack(t);
      initialScales[t.id] = 100;
      initialSustains[t.id] = t.sustainPedal !== undefined ? t.sustainPedal : t.notes.some((n) => n.sustain);
    });

    setInstOverrides(initialOverrides);
    setVelScales(initialScales);
    setSustainOverrides(initialSustains);
  }, [tracks, metadata, isOpen]);

  // Generate XML / MML for preview
  const bdoScoreResult = useMemo(() => {
    if (!isOpen) return null;
    return generateBdoScore(tracks, metadata);
  }, [tracks, metadata, isOpen]);

  const validation = useMemo(
    () =>
      isOpen
        ? validateForBdo(tracks, {
          grade: metadata.bdoGrade,
          timeSignature: metadata.timeSignature,
          instrumentOverrides: instOverrides,
          ownerId: metadata.isBdoProtected ? metadata.originalBdoOwnerId : Number(ownerId) || 0,
          author: metadata.isBdoProtected ? metadata.originalBdoComposer || metadata.originalBdoAuthor : charName,
        })
        : null,
    [isOpen, tracks, metadata, instOverrides, ownerId, charName]
  );
  const gradeLimits = BDO_GRADE_LIMITS[metadata.bdoGrade] ?? BDO_GRADE_LIMITS.S;

  const handleFix = (issue: BdoIssue) => {
    const fix = issue.fix;
    if (!fix) return;
    if (fix.kind === 'use-grade') {
      if (fix.grade) onGradeChange(fix.grade);
      return;
    }
    const fixed = applyBdoFix(tracks, fix.kind, instOverrides);
    if (fixed !== tracks) onApplyTracks(fixed);
  };

  if (!isOpen) return null;

  const handleMergeAll = () => {
    const newOverrides = { ...instOverrides };
    tracks.forEach((t) => {
      if (!bdoInstrumentFromCode(newOverrides[t.id] ?? exportCodeForTrack(t))?.def.percussion) {
        newOverrides[t.id] = mergeTarget;
      }
    });
    setInstOverrides(newOverrides);
  };

  const handleExtractId = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (metadata.isBdoProtected) return;
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const view = new DataView(buffer);
      const version = view.getUint32(0, true);

      if (version !== 9 && version !== 8) {
        throw new Error('Versão de arquivo BDO inválida.');
      }

      const payload = new Uint8Array(buffer, 4);
      const decrypted = decryptOwnerHeader(payload);
      const extractedId = new DataView(decrypted.buffer).getUint32(decrypted.byteOffset, true);

      // In BDO, offset 8 is composer (criador original), offset 70 is arranger
      let extractedComposer = '';
      for (let i = 8; i < 8 + 62; i += 2) {
        const charCode = decrypted[i] | (decrypted[i + 1] << 8);
        if (charCode === 0) break;
        extractedComposer += String.fromCharCode(charCode);
      }
      extractedComposer = extractedComposer.trim();

      let extractedArranger = '';
      for (let i = 70; i < 70 + 62; i += 2) {
        const charCode = decrypted[i] | (decrypted[i + 1] << 8);
        if (charCode === 0) break;
        extractedArranger += String.fromCharCode(charCode);
      }
      extractedArranger = extractedArranger.trim();

      const extractedName = extractedComposer || extractedArranger;

      // The user loaded a file from their own character: remember it for next time
      setOwnerId(extractedId.toString());
      saveOwnerId(extractedId);
      if (extractedName) {
        setCharName(extractedName);
        onAuthorChange(extractedName);
      }
      setIdStatus(`0x${extractedId.toString(16)} (${extractedName || 'Personagem'})`);
    } catch {
      setIdStatus('Erro ao ler arquivo BDO');
    }
  };

  const handleExportBinary = () => {
    const songTitle = (metadata.title || 'Marni_Song').trim();
    const resolvedComposer = (
      metadata.isBdoProtected && (metadata.originalBdoComposer || metadata.originalBdoAuthor)
        ? (metadata.originalBdoComposer || metadata.originalBdoAuthor)
        : charName || metadata.author || ''
    )!.trim();

    const resolvedArranger = (
      metadata.isBdoProtected && metadata.originalBdoArranger
        ? metadata.originalBdoArranger
        : resolvedComposer
    ).trim();

    const resolvedOwnerId =
      metadata.isBdoProtected && metadata.originalBdoOwnerId !== undefined
        ? metadata.originalBdoOwnerId
        : parseInt(ownerId, 10) || 0;

    const songContext: SongContext = {
      bpm: metadata.bpm,
      timeSignature: timeSignatureParts(metadata.timeSignature),
      title: songTitle,
      author: resolvedComposer,
    };

    const options: ExportOptions = {
      charName: resolvedComposer,
      composerName: resolvedComposer,
      arrangerName: resolvedArranger,
      ownerId: resolvedOwnerId,
      transpose: parseInt(transpose, 10) || 0,
      velMode,
      velStepBase: parseInt(stepBase, 10) || 100,
      velStepStep: parseInt(stepStep, 10) || 5,
      velRescaleMin: parseInt(rescaleMin, 10) || 80,
      velRescaleMax: parseInt(rescaleMax, 10) || 127,
      velFloorVal: parseInt(floorVal, 10) || 100,
      instrumentOverrides: instOverrides,
      velocityScales: velScales,
      sustainOverrides,
      effector: effectorSettings,
      maxChunkNotes: parseInt(maxChunkNotes, 10) || 730,
    };

    try {
      const blob = exportToBdo(tracks, songContext, options);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // In Black Desert Online, music files in Documents/Black Desert/Music/ have NO extension
      a.download = songTitle.replace(/\s+/g, '_');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      onClose();
    } catch (err) {
      console.error('Erro na exportação BDO:', err);
      notify.error(errorMessage(err, 'Não foi possível gerar o arquivo do BDO.'));
    }
  };

  const handleCopyCode = async () => {
    if (!bdoScoreResult) return;
    const textToCopy = xmlSubTab === 'xml' ? bdoScoreResult.xmlContent : bdoScoreResult.mmlContent;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { }
  };

  const handleDownloadXml = () => {
    if (!bdoScoreResult) return;
    const blob = new Blob([bdoScoreResult.xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(metadata.title || 'Marni_Score').toLowerCase().replace(/\s+/g, '_')}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const activeTracks = tracks.filter((t) => !t.isMuted && t.notes.length > 0);

  return (
    <div
      className="modal-overlay animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl modal-panel text-stone-200 max-h-[92vh] flex flex-col font-sans select-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bdo-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#2d2722] shrink-0 bg-[#141210]/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h2 id="bdo-title" className="modal-title">
                Exportar para o BDO (Black Desert Online)
              </h2>
              <p className="text-xs text-stone-400">
                Partitura pronta para o Álbum de Música / Florin Shai & Instrumentos Marni
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-100 hover:bg-stone-850 rounded-lg p-1.5 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Note Budget / BDO Grade Status Bar */}
        <div className="px-5 sm:px-6 py-2.5 bg-[#141210] border-b border-[#2d2722] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5" title="Notas que serão gravadas (sem faixas mutadas e duplicadas)">
              <span className="text-stone-400">Notas:</span>
              <span
                className={`font-mono font-bold text-sm ${(validation?.exportedNotes ?? 0) > gradeLimits.maxNotes ? 'text-red-400' : 'text-amber-400'
                  }`}
              >
                {validation?.exportedNotes ?? 0}
              </span>
              <span className="text-stone-500">/</span>
              <span className="font-mono text-stone-400">{gradeLimits.maxNotes}</span>
            </div>
            <div className="flex items-center gap-1.5" title={`Compassos em ${metadata.timeSignature}`}>
              <span className="text-stone-400">Compassos:</span>
              <span
                className={`font-mono font-bold text-sm ${(validation?.bars ?? 0) > gradeLimits.maxBars ? 'text-red-400' : 'text-amber-400'
                  }`}
              >
                {validation?.bars ?? 0}
              </span>
              <span className="text-stone-500">/</span>
              <span className="font-mono text-stone-400">{gradeLimits.maxBars}</span>
            </div>
          </div>

          <label className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-950/40 border border-amber-600/40 text-amber-400 font-mono text-xs font-semibold">
            <span>Grau BDO:</span>
            <select
              value={metadata.bdoGrade}
              onChange={(e) => onGradeChange(e.target.value as BdoGradeId)}
              className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer"
              aria-label="Grau (rank) da partitura no BDO"
            >
              {BDO_GRADES.map((g) => (
                <option key={g} value={g} className="bg-stone-900">
                  Rank {g}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center px-5 sm:px-6 pt-3 border-b border-[#2d2722] bg-[#141210] shrink-0 gap-2">
          <button
            onClick={() => setActiveTab('binary')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors border-t border-x ${activeTab === 'binary'
              ? 'bg-[#1a1715] border-[#3e342b] text-amber-400 border-b-transparent'
              : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
          >
            🎮 Arquivo Nativo BDO (Sem Extensão)
          </button>
          <button
            onClick={() => setActiveTab('xml')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors border-t border-x ${activeTab === 'xml'
              ? 'bg-[#1a1715] border-[#3e342b] text-amber-400 border-b-transparent'
              : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
          >
            📄 Código XML / MML (Visualização)
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeTab === 'binary' ? (
            <>
              {/* SECTION 0: PRE-EXPORT CHECK */}
              {validation && (
                <div className="rounded-xl border border-[#3e342b] bg-[#1a1715]/70 p-3 space-y-2" aria-live="polite">
                  {validation.issues.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>
                        Pronta para o jogo: nada será alterado na exportação
                        {validation.minGrade ? ` • rank mínimo: ${validation.minGrade}` : ''}.
                      </span>
                    </div>
                  ) : (
                    validation.issues.map((issue) => (
                      <div
                        key={issue.id}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs ${SEVERITY_STYLE[issue.severity].box}`}
                      >
                        {SEVERITY_STYLE[issue.severity].icon}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold">{issue.title}</div>
                          <div className="opacity-80 leading-relaxed">{issue.detail}</div>
                        </div>
                        {issue.fix && (
                          <button
                            onClick={() => handleFix(issue)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-900 border border-[#3e342b] hover:border-amber-500/60 text-stone-200 hover:text-amber-300 font-semibold transition-colors"
                          >
                            <Wrench className="w-3 h-3" />
                            {issue.fix.label}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* SECTION 1: SETTINGS */}
              <div className="relative rounded-xl border border-[#3e342b] bg-[#1a1715]/70 p-4 pt-5 shadow-sm">
                <span className="absolute -top-2.5 left-3 bg-[#161412] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-[#3e342b] rounded-md">
                  CONFIGURAÇÕES
                </span>

                {/* Anti-Plagiarism Protection Banner */}
                {metadata.isBdoProtected && (
                  <div className="mb-4 flex items-start gap-2.5 bg-amber-950/40 border border-amber-600/50 p-3 rounded-xl text-xs text-amber-200">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <span>Partitura Protegida (Anti-Plágio)</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700/50 font-mono">BDO Oficial</span>
                      </div>
                      <p className="text-[11px] text-amber-200/90 leading-relaxed">
                        Esta partitura foi importada diretamente do Black Desert. Os dados de <b>Compositor Original</b> ({metadata.originalBdoComposer || metadata.originalBdoAuthor}){metadata.originalBdoArranger && metadata.originalBdoArranger !== (metadata.originalBdoComposer || metadata.originalBdoAuthor) ? ` e Arranjo (${metadata.originalBdoArranger})` : ''} e <b>Owner ID</b> estão bloqueados para proteger os créditos e a autoria do criador original.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3 text-xs">
                  {/* Character Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-center gap-2">
                    <span className="text-stone-400 sm:text-right sm:pr-3 font-medium">
                      {metadata.isBdoProtected ? 'Compositor Original:' : 'Autor (Personagem/Família):'}
                    </span>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={
                            metadata.isBdoProtected
                              ? (metadata.originalBdoComposer || metadata.originalBdoAuthor || charName)
                              : charName
                          }
                          onChange={(e) => {
                            if (!metadata.isBdoProtected) {
                              setCharName(e.target.value);
                              onAuthorChange(e.target.value);
                            }
                          }}
                          readOnly={metadata.isBdoProtected}
                          disabled={metadata.isBdoProtected}
                          placeholder={metadata.isBdoProtected ? 'Nome do Compositor Original' : 'Nome de Personagem ou Família'}
                          title={
                            metadata.isBdoProtected
                              ? 'Compositor original da partitura do Black Desert: protegido contra plágio.'
                              : 'Nome preenchido igualmente em Composição e Arranjo no BDO'
                          }
                          className={`w-48 bg-stone-900/90 border rounded-lg px-3 py-1.5 text-xs outline-none transition-colors ${metadata.isBdoProtected
                              ? 'border-amber-900/50 text-amber-400/95 cursor-not-allowed pr-7 bg-stone-900/95'
                              : 'border-[#3e342b] text-stone-200 focus:border-amber-500'
                            }`}
                        />
                        {metadata.isBdoProtected && (
                          <span className="absolute right-2 text-amber-400/80 pointer-events-none">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      {!metadata.isBdoProtected && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#3e342b] bg-stone-850 hover:bg-stone-800 text-xs font-medium text-stone-300 hover:text-amber-300 hover:border-amber-500/50 transition-all"
                          title="Extrair Owner ID e Nome de um arquivo salvo pelo seu personagem no Black Desert (Documents\Black Desert\Music)"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Carregar ID BDO</span>
                        </button>
                      )}
                      {!metadata.isBdoProtected && (
                        <input
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          accept="*"
                          onChange={handleExtractId}
                        />
                      )}
                    </div>
                  </div>

                  {/* Arranger Row if protected and distinct */}
                  {metadata.isBdoProtected && metadata.originalBdoArranger && (
                    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-center gap-2">
                      <span className="text-stone-400 sm:text-right sm:pr-3 font-medium">Arranjador:</span>
                      <div className="bg-stone-900/90 border border-[#2d2722] px-2.5 py-1 rounded-md text-xs font-mono text-stone-300 w-fit">
                        {metadata.originalBdoArranger}
                      </div>
                    </div>
                  )}

                  {/* Status ID Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-center gap-2">
                    <span className="text-stone-400 sm:text-right sm:pr-3 font-medium">Status ID:</span>
                    <div className="bg-stone-900/90 border border-[#2d2722] px-2.5 py-1 rounded-md text-xs font-mono text-stone-400 w-fit">
                      {idStatus}
                    </div>
                  </div>

                  {/* Transpose & Max Chunk */}
                  <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-center gap-2">
                    <span className="text-stone-400 sm:text-right sm:pr-3 font-medium">Transpose:</span>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={transpose}
                          onChange={(e) => setTranspose(e.target.value)}
                          className="w-16 bg-stone-900/90 border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 text-center outline-none focus:border-amber-500 transition-colors"
                        />
                        <span className="text-stone-400 text-xs">semitons</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-stone-400 text-xs">Max Notas/Trilha:</span>
                        <input
                          type="number"
                          value={maxChunkNotes}
                          onChange={(e) => setMaxChunkNotes(e.target.value)}
                          className="w-16 bg-stone-900/90 border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 text-center outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Owner ID Warning Notice */}
                {!metadata.isBdoProtected && ownerId === '0' && (
                  <div className="mt-4 flex items-start gap-2 bg-amber-950/30 border border-amber-600/40 p-3 rounded-lg text-xs text-amber-200 leading-relaxed">
                    <span className="font-bold text-amber-400">Aviso:</span>
                    <span>
                      O <b>Owner ID</b> é 0. Para que o seu personagem possa reproduzir ou salvar a partitura no jogo, use o botão <b>Carregar ID BDO</b> com um arquivo já salvo previamente pelo seu personagem no Black Desert.
                    </span>
                  </div>
                )}
              </div>

              {/* SECTION 2: INSTRUMENTS */}
              <div className="relative rounded-xl border border-[#3e342b] bg-[#1a1715]/70 p-4 pt-5 shadow-sm">
                <span className="absolute -top-2.5 left-3 bg-[#161412] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-[#3e342b] rounded-md">
                  INSTRUMENTOS
                </span>

                {/* Merge all into row */}
                <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
                  <span className="text-stone-400 font-medium">Mesclar todos em:</span>
                  <BdoInstrumentSelect
                    value={mergeTarget}
                    onChange={setMergeTarget}
                    className="bg-stone-900/90 border border-[#3e342b] rounded-lg px-2.5 py-1 text-xs text-stone-200 outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    onClick={handleMergeAll}
                    className="px-3 py-1 rounded-lg border border-[#3e342b] bg-stone-850 hover:bg-stone-800 text-xs font-medium text-stone-300 hover:text-amber-300 hover:border-amber-500/50 transition-all"
                  >
                    Aplicar
                  </button>
                </div>

                {/* Tracks Table */}
                <div className="border border-[#2d2722] rounded-lg overflow-hidden text-xs">
                  <div className="grid grid-cols-[1.1fr_1.3fr_0.9fr_64px] bg-stone-900/90 px-3 py-2 border-b border-[#2d2722] text-[10px] uppercase font-semibold text-stone-400 tracking-wider">
                    <span>FAIXA DE ORIGEM</span>
                    <span>INSTRUMENTO BDO</span>
                    <span>VOLUME</span>
                    <span className="text-center">PEDAL</span>
                  </div>

                  <div className="divide-y divide-[#2d2722] max-h-40 overflow-y-auto">
                    {activeTracks.map((track) => {
                      const currentInst = instOverrides[track.id] ?? exportCodeForTrack(track);
                      const currentVol = velScales[track.id] ?? 100;
                      const hasSustain = Boolean(sustainOverrides[track.id]);

                      return (
                        <div
                          key={track.id}
                          className="grid grid-cols-[1.1fr_1.3fr_0.9fr_64px] items-center px-3 py-2.5 hover:bg-stone-850/40 gap-2"
                        >
                          <span className="text-stone-200 font-medium truncate">
                            {track.name} ({track.notes.length})
                          </span>

                          <div className="flex items-center gap-1.5">
                            <span className="text-stone-500">→</span>
                            <BdoInstrumentSelect
                              value={currentInst}
                              onChange={(code) => setInstOverrides((prev) => ({ ...prev, [track.id]: code }))}
                              className="bg-stone-900/90 border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 outline-none focus:border-amber-500 flex-1 min-w-0 transition-colors"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={10}
                              max={200}
                              value={currentVol}
                              onChange={(e) =>
                                setVelScales((prev) => ({
                                  ...prev,
                                  [track.id]: Number(e.target.value),
                                }))
                              }
                              className="flex-1 accent-amber-500 h-1.5 bg-stone-800 rounded cursor-pointer"
                            />
                            <span className="text-[11px] font-mono text-amber-400 w-8 text-right">
                              {currentVol}%
                            </span>
                          </div>

                          <div className="flex items-center justify-center">
                            <label
                              className="flex items-center gap-1 cursor-pointer"
                              title="Pedal de Sustain do BDO (byte 11 - ressonância do piano/instrumento)"
                            >
                              <input
                                type="checkbox"
                                checked={hasSustain}
                                onChange={(e) =>
                                  setSustainOverrides((prev) => ({
                                    ...prev,
                                    [track.id]: e.target.checked,
                                  }))
                                }
                                className="accent-amber-500 w-4 h-4 cursor-pointer rounded"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* SECTION 3: ✨ EFEITOS GLOBAIS */}
              <div className="relative rounded-xl border border-[#3e342b] bg-[#1a1715]/70 p-3.5 pt-4 shadow-sm">
                <span className="absolute -top-2.5 left-3 bg-[#161412] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-[#3e342b] rounded-md flex items-center gap-1">
                  <AudioWaveform className="w-3 h-3 text-amber-400" /> EFEITOS GLOBAIS
                </span>

                <div className="flex items-center justify-around py-1 text-xs font-mono text-amber-400">
                  <span>Reverb: <b>{effectorSettings?.reverb?.enabled ? effectorSettings.reverb.time : 0}</b></span>
                  <span className="text-stone-700">|</span>
                  <span>Delay: <b>{effectorSettings?.delay?.enabled ? effectorSettings.delay.feedback : 0}</b></span>
                  <span className="text-stone-700">|</span>
                  <span>Chorus: <b>{effectorSettings?.chorus?.enabled ? effectorSettings.chorus.feedback : 0}</b></span>
                </div>
              </div>

              {/* SECTION 4: VELOCITY COMPRESSION */}
              <div className="relative rounded-xl border border-[#3e342b] bg-[#1a1715]/70 p-4 pt-5 shadow-sm">
                <span className="absolute -top-2.5 left-3 bg-[#161412] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-[#3e342b] rounded-md">
                  COMPRESSÃO DE VELOCIDADE
                </span>

                {/* Dynamic Mode Radio Buttons */}
                <div className="flex items-center gap-4 flex-wrap mb-4 text-xs">
                  <span className="text-stone-400 font-medium">Modo de Dinâmica:</span>
                  {(['layered', 'stepped', 'rescale', 'floor', 'off'] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-1.5 cursor-pointer capitalize text-stone-300 hover:text-amber-300 transition-colors">
                      <input
                        type="radio"
                        name="velMode"
                        value={mode}
                        checked={velMode === mode}
                        onChange={() => setVelMode(mode)}
                        className="accent-amber-500"
                      />
                      <span>{mode}</span>
                    </label>
                  ))}
                </div>

                {/* Grid fields */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400 w-12 text-right">Base:</span>
                    <input
                      type="number"
                      value={stepBase}
                      disabled={velMode !== 'stepped'}
                      onChange={(e) => setStepBase(e.target.value)}
                      className="w-16 bg-stone-900/90 border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 text-center outline-none focus:border-amber-500 disabled:opacity-30 transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-stone-400 w-12 text-right">Step:</span>
                    <input
                      type="number"
                      value={stepStep}
                      disabled={velMode !== 'stepped'}
                      onChange={(e) => setStepStep(e.target.value)}
                      className="w-16 bg-stone-900/90 border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 text-center outline-none focus:border-amber-500 disabled:opacity-30 transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-stone-400 w-12 text-right">Min:</span>
                    <input
                      type="number"
                      value={rescaleMin}
                      disabled={velMode !== 'rescale'}
                      onChange={(e) => setRescaleMin(e.target.value)}
                      className="w-16 bg-stone-900/90 border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 text-center outline-none focus:border-amber-500 disabled:opacity-30 transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-stone-400 w-12 text-right">Max:</span>
                    <input
                      type="number"
                      value={rescaleMax}
                      disabled={velMode !== 'rescale'}
                      onChange={(e) => setRescaleMax(e.target.value)}
                      className="w-16 bg-stone-900/90 border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 text-center outline-none focus:border-amber-500 disabled:opacity-30 transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2 sm:col-span-2">
                    <span className="text-stone-400 text-right">Floor Limit:</span>
                    <input
                      type="number"
                      value={floorVal}
                      disabled={velMode !== 'floor'}
                      onChange={(e) => setFloorVal(e.target.value)}
                      className="w-16 bg-stone-900/90 border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 text-center outline-none focus:border-amber-500 disabled:opacity-30 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* XML & MML Score View */
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setXmlSubTab('xml')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${xmlSubTab === 'xml'
                      ? 'bg-amber-500 text-stone-950 shadow'
                      : 'bg-stone-900 border border-[#3e342b] text-stone-300 hover:text-stone-100'
                      }`}
                  >
                    XML Estruturado (BDO Marni)
                  </button>
                  <button
                    onClick={() => setXmlSubTab('mml')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${xmlSubTab === 'mml'
                      ? 'bg-amber-500 text-stone-950 shadow'
                      : 'bg-stone-900 border border-[#3e342b] text-stone-300 hover:text-stone-100'
                      }`}
                  >
                    MML Código Direto
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#3e342b] bg-stone-850 hover:bg-stone-800 text-xs font-medium text-stone-200 hover:text-amber-300 hover:border-amber-500/50 transition-all"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                  </button>

                  <button
                    onClick={handleDownloadXml}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-600/60 bg-amber-950/40 text-xs font-medium text-amber-300 hover:bg-amber-900/50 transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Baixar Arquivo .XML</span>
                  </button>
                </div>
              </div>

              {/* Code Box */}
              <div className="rounded-lg border border-[#3e342b] bg-stone-950 p-4 font-code text-xs text-amber-100/90 max-h-80 overflow-y-auto overflow-x-auto whitespace-pre leading-relaxed select-text shadow-inner">
                {xmlSubTab === 'xml' ? bdoScoreResult?.xmlContent : bdoScoreResult?.mmlContent}
              </div>
            </div>
          )}

          {/* Guide Note Box */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#141210] border border-[#2d2722] text-xs text-stone-400 leading-relaxed">
            <FileCode className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-stone-200">Como importar no Black Desert:</span>
              <p className="mt-0.5 text-[11px] text-stone-400">
                Copie o arquivo gerado (sem extensão, com o mesmo nome da música) diretamente para a pasta:{' '}
                <code className="text-amber-400 bg-stone-900 px-1 py-0.5 rounded">
                  Documents\Black Desert\Music\
                </code>
                . O Black Desert reconhece o arquivo diretamente pelo nome sem extensão. No jogo, abra o menu Esc &gt; Comunidade &gt; Álbum de Música para carregar sua partitura!
              </p>
            </div>
          </div>
        </div>

        {/* Footer with Big Gold Button */}
        <div className="p-4 border-t border-[#2d2722] bg-[#141210] shrink-0 flex items-center gap-3">
          <button
            onClick={handleExportBinary}
            disabled={validation?.exportedNotes === 0}
            className={`w-full py-3 rounded-lg font-bold text-sm tracking-wider uppercase transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${validation && !validation.canExport
                ? 'bg-red-900/70 hover:bg-red-800/80 text-red-100 border border-red-700/60'
                : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-[0_0_15px_rgba(245,158,11,0.25)] hover:shadow-[0_0_20px_rgba(245,158,11,0.45)]'
              }`}
          >
            <Download className="w-4 h-4" />
            {validation && !validation.canExport
              ? 'EXPORTAR MESMO ASSIM (FORA DO LIMITE DO RANK)'
              : 'EXPORTAR ARQUIVO BDO'}
          </button>
        </div>
      </div>
    </div>
  );
};
