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
  Sliders,
  AudioWaveform,
} from 'lucide-react';
import type { Track, EffectorSettings, SongMetadata } from '../types/music.ts';
import {
  exportToBdo,
  decryptOwnerHeader,
  FULL_BDO_INSTRUMENTS,
  getDefaultBdoInstrument,
  BDO_PERCUSSION_IDS,
  type ExportOptions,
  type SongContext,
} from '../bdo/bdoExportV2.ts';
import { generateBdoScore } from '../bdo/bdoConverter.ts';
import { BDO_GRADE_LIMITS } from '../types/music.ts';

interface BdoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  metadata: SongMetadata;
  effectorSettings: EffectorSettings;
}

export const BdoExportModal: React.FC<BdoExportModalProps> = ({
  isOpen,
  onClose,
  tracks,
  metadata,
  effectorSettings,
}) => {
  // Active Export Mode: 'binary' (Game-compatible .bms ICE file) or 'xml-mml' (Sheet Score preview from print)
  const [activeTab, setActiveTab] = useState<'binary' | 'xml'>('binary');
  const [xmlSubTab, setXmlSubTab] = useState<'xml' | 'mml'>('xml');
  const [copied, setCopied] = useState(false);

  // Binary Exporter State (from Lucas Linhares v2)
  const [charName, setCharName] = useState<string>(() => {
    return metadata.author || localStorage.getItem('marni_bdo_author') || 'Tchepper';
  });
  const [ownerId, setOwnerId] = useState<string>(() => {
    return localStorage.getItem('marni_bdo_owner_id') || '1009649';
  }); // Default or extracted ID
  const [idStatus, setIdStatus] = useState<string>(() => {
    const savedOwner = localStorage.getItem('marni_bdo_owner_id') || '1009649';
    const savedName = metadata.author || localStorage.getItem('marni_bdo_author') || 'Tchepper';
    return `0x${parseInt(savedOwner, 10).toString(16)} (${savedName})`;
  });
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
  const [instOverrides, setInstOverrides] = useState<Record<string, string>>({});
  const [velScales, setVelScales] = useState<Record<string, number>>({});
  const [sustainOverrides, setSustainOverrides] = useState<Record<string, boolean>>({});
  const [mergeTarget, setMergeTarget] = useState<string>('Florchestra Piano');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bdoInstrumentNames = Object.keys(FULL_BDO_INSTRUMENTS);

  // Initialize overrides from tracks and metadata
  useEffect(() => {
    if (!isOpen) return;
    const initialAuthor = metadata.author || localStorage.getItem('marni_bdo_author') || 'Tchepper';
    const initialOwner = localStorage.getItem('marni_bdo_owner_id') || '1009649';
    setCharName(initialAuthor);
    setOwnerId(initialOwner);
    setIdStatus(`0x${parseInt(initialOwner, 10).toString(16)} (${initialAuthor})`);

    const initialOverrides: Record<string, string> = {};
    const initialScales: Record<string, number> = {};
    const initialSustains: Record<string, boolean> = {};

    tracks.forEach((t) => {
      initialOverrides[t.id] = getDefaultBdoInstrument(t.instrumentId || t.name);
      initialScales[t.id] = 100;
      const isPiano = t.instrumentId === 'grand-piano' || t.name.toLowerCase().includes('piano');
      initialSustains[t.id] =
        t.sustainPedal !== undefined ? t.sustainPedal : (isPiano || t.notes.some((n) => n.sustain));
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

  const totalNotes = tracks.reduce((acc, tr) => acc + tr.notes.length, 0);
  const maxNotesAllowed = BDO_GRADE_LIMITS[metadata.bdoGrade]?.maxNotes || 10000;

  if (!isOpen) return null;

  const handleMergeAll = () => {
    const newOverrides = { ...instOverrides };
    tracks.forEach((t) => {
      const currentInstId = FULL_BDO_INSTRUMENTS[newOverrides[t.id]];
      if (!BDO_PERCUSSION_IDS.includes(currentInstId)) {
        newOverrides[t.id] = mergeTarget;
      }
    });
    setInstOverrides(newOverrides);
  };

  const handleExtractId = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

      // In BDO, offset 70 is arranger, offset 8 is composer
      let extractedName = '';
      for (let i = 70; i < 70 + 62; i += 2) {
        const charCode = decrypted[i] | (decrypted[i + 1] << 8);
        if (charCode === 0) break;
        extractedName += String.fromCharCode(charCode);
      }
      if (!extractedName) {
        for (let i = 8; i < 8 + 62; i += 2) {
          const charCode = decrypted[i] | (decrypted[i + 1] << 8);
          if (charCode === 0) break;
          extractedName += String.fromCharCode(charCode);
        }
      }
      extractedName = extractedName.trim();

      setOwnerId(extractedId.toString());
      localStorage.setItem('marni_bdo_owner_id', extractedId.toString());
      if (extractedName) {
        setCharName(extractedName);
        localStorage.setItem('marni_bdo_author', extractedName);
      }
      setIdStatus(`0x${extractedId.toString(16)} (${extractedName || 'Personagem'})`);
    } catch {
      setIdStatus('Erro ao ler arquivo BDO');
    }
  };

  const handleExportBinary = () => {
    const songTitle = (metadata.title || 'Marni_Song').trim();
    const resolvedCharName = (
      charName ||
      metadata.author ||
      localStorage.getItem('marni_bdo_author') ||
      'Tchepper'
    ).trim();

    localStorage.setItem('marni_bdo_author', resolvedCharName);
    if (ownerId) {
      localStorage.setItem('marni_bdo_owner_id', ownerId);
    }

    const songContext: SongContext = {
      bpm: metadata.bpm,
      timeSignature: [4, 4],
      title: songTitle,
      author: resolvedCharName,
    };

    const options: ExportOptions = {
      charName: resolvedCharName,
      ownerId: parseInt(ownerId, 10) || 1009649,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#1c1a1a] border border-[#3e3832] rounded-xl shadow-2xl text-[#e0d4c8] max-h-[92vh] flex flex-col font-sans select-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bdo-title"
      >
        {/* Header matching image print */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#2a2a2a] shrink-0 bg-[#171515]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h2 id="bdo-title" className="text-[15px] font-bold text-amber-400 tracking-wide">
                Exportar para o BDO (Black Desert Online)
              </h2>
              <p className="text-[11px] text-[#8b847a]">
                Partitura pronta para o Álbum de Música / Florin Shai & Instrumentos Marni
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b847a] hover:text-[#d4ab6a] transition-colors p-1"
            aria-label="Fechar"
          >
            <X className="w-5 h-5 stroke-[1.5]" />
          </button>
        </div>

        {/* Note Budget / BDO Grade Status Bar matching image print */}
        <div className="px-5 sm:px-6 py-2.5 bg-[#141210] border-b border-[#2a2a2a] flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[#8b847a]">Total de Notas:</span>
            <span className="font-mono font-bold text-amber-400 text-sm">{totalNotes}</span>
            <span className="text-stone-500">/</span>
            <span className="font-mono text-stone-400">{maxNotesAllowed}</span>
          </div>

          <div className="px-2.5 py-1 rounded bg-[#2a1c10] border border-amber-600/50 text-amber-400 font-mono text-xs font-semibold">
            Grau BDO: Rank {metadata.bdoGrade}
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center px-5 sm:px-6 pt-3 border-b border-[#2a2a2a] bg-[#171515] shrink-0 gap-2">
          <button
            onClick={() => setActiveTab('binary')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors border-t border-x ${activeTab === 'binary'
              ? 'bg-[#1c1a1a] border-[#3e3832] text-amber-400 border-b-transparent'
              : 'border-transparent text-[#8b847a] hover:text-[#e0d4c8]'
              }`}
          >
            🎮 Arquivo do Jogo (.bms / Criptografado ICE)
          </button>
          <button
            onClick={() => setActiveTab('xml')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors border-t border-x ${activeTab === 'xml'
              ? 'bg-[#1c1a1a] border-[#3e3832] text-amber-400 border-b-transparent'
              : 'border-transparent text-[#8b847a] hover:text-[#e0d4c8]'
              }`}
          >
            📄 Código XML / MML (Visualização)
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeTab === 'binary' ? (
            <>
              {/* SECTION 1: SETTINGS */}
              <div className="relative rounded-md border border-[#3e3832] bg-[#151515] p-4 pt-5">
                <span className="absolute -top-2.5 left-3 bg-[#1c1a1a] px-2 text-[10px] font-bold uppercase tracking-wider text-[#d4ab6a] border border-[#3e3832] rounded">
                  SETTINGS
                </span>

                <div className="space-y-3 text-xs">
                  {/* Character Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-center gap-2">
                    <span className="text-[#8b847a] sm:text-right sm:pr-3 font-medium">
                      Autor (Personagem/Família):
                    </span>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <input
                        type="text"
                        value={charName}
                        onChange={(e) => {
                          setCharName(e.target.value);
                          localStorage.setItem('marni_bdo_author', e.target.value);
                        }}
                        placeholder="Nome de Personagem ou Família"
                        title="Nome preenchido igualmente em Composição e Arranjo no BDO"
                        className="w-48 bg-[#1c1a1a] border border-[#3e3832] rounded px-3 py-1.5 text-xs text-[#e0d4c8] outline-none focus:border-[#d4ab6a] transition-colors"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#3e3832] bg-[#23201e] text-xs font-medium text-[#e0d4c8] hover:text-[#d4ab6a] hover:border-[#d4ab6a] transition-all"
                        title="Extrair Owner ID e Nome de um arquivo salvo pelo seu personagem no Black Desert (Documents\Black Desert\Music)"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Carregar ID BDO</span>
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="*"
                        onChange={handleExtractId}
                      />
                    </div>
                  </div>

                  {/* Status ID Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] items-center gap-2">
                    <span className="text-[#8b847a] sm:text-right sm:pr-3 font-medium">Status ID:</span>
                    <div className="bg-[#1c1a1a] border border-[#2a2a2a] px-2.5 py-1 rounded text-xs font-mono text-[#8b847a] w-fit">
                      {idStatus}
                    </div>
                  </div>

                  {/* Transpose & Max Chunk */}
                  <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr] items-center gap-2">
                    <span className="text-[#8b847a] sm:text-right sm:pr-3 font-medium">Transpose:</span>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={transpose}
                          onChange={(e) => setTranspose(e.target.value)}
                          className="w-16 bg-[#1c1a1a] border border-[#3e3832] rounded px-2 py-1 text-xs text-[#e0d4c8] text-center outline-none focus:border-[#d4ab6a]"
                        />
                        <span className="text-[#8b847a] text-xs">semitons</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#8b847a] text-xs">Max Notas/Trilha:</span>
                        <input
                          type="number"
                          value={maxChunkNotes}
                          onChange={(e) => setMaxChunkNotes(e.target.value)}
                          className="w-16 bg-[#1c1a1a] border border-[#3e3832] rounded px-2 py-1 text-xs text-[#e0d4c8] text-center outline-none focus:border-[#d4ab6a]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Owner ID Warning Notice from Lucas Linhares v2 */}
                {ownerId === '0' && (
                  <div className="mt-4 flex items-start gap-2 bg-[#2A1E14] border border-[#6B4B24] p-3 rounded text-xs text-[#E6C280] leading-relaxed">
                    <span className="font-bold text-[#D4AB6A]">Aviso:</span>
                    <span>
                      O <b>Owner ID</b> é 0. Para que o seu personagem possa reproduzir ou salvar a partitura no jogo, use o botão <b>Carregar ID BDO</b> com um arquivo <code>.bms</code> já salvo previamente pelo seu personagem no Black Desert.
                    </span>
                  </div>
                )}
              </div>

              {/* SECTION 2: INSTRUMENTS */}
              <div className="relative rounded-md border border-[#3e3832] bg-[#151515] p-4 pt-5">
                <span className="absolute -top-2.5 left-3 bg-[#1c1a1a] px-2 text-[10px] font-bold uppercase tracking-wider text-[#d4ab6a] border border-[#3e3832] rounded">
                  INSTRUMENTS
                </span>

                {/* Merge all into row */}
                <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
                  <span className="text-[#8b847a] font-medium">Merge all into:</span>
                  <select
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                    className="bg-[#1c1a1a] border border-[#3e3832] rounded px-2.5 py-1 text-xs text-[#e0d4c8] outline-none focus:border-[#d4ab6a]"
                  >
                    {bdoInstrumentNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleMergeAll}
                    className="px-3 py-1 rounded border border-[#3e3832] bg-[#23201e] text-xs font-medium text-[#e0d4c8] hover:text-[#d4ab6a] hover:border-[#d4ab6a] transition-all"
                  >
                    Apply
                  </button>
                </div>

                {/* Tracks Table */}
                <div className="border border-[#2a2a2a] rounded overflow-hidden text-xs">
                  <div className="grid grid-cols-[1.1fr_1.3fr_0.9fr_64px] bg-[#1c1a1a] px-3 py-2 border-b border-[#2a2a2a] text-[10px] uppercase font-semibold text-[#8b847a] tracking-wider">
                    <span>SOURCE TRACK</span>
                    <span>BDO INSTRUMENT</span>
                    <span>VOLUME SCALE</span>
                    <span className="text-center">PEDAL</span>
                  </div>

                  <div className="divide-y divide-[#23201e] max-h-40 overflow-y-auto">
                    {activeTracks.map((track) => {
                      const currentInst = instOverrides[track.id] || 'Florchestra Piano';
                      const currentVol = velScales[track.id] ?? 100;
                      const hasSustain = Boolean(sustainOverrides[track.id]);

                      return (
                        <div
                          key={track.id}
                          className="grid grid-cols-[1.1fr_1.3fr_0.9fr_64px] items-center px-3 py-2.5 hover:bg-[#1a1818] gap-2"
                        >
                          <span className="text-[#e0d4c8] font-medium truncate">
                            {track.name} ({track.notes.length})
                          </span>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[#8b847a]">→</span>
                            <select
                              value={currentInst}
                              onChange={(e) =>
                                setInstOverrides((prev) => ({ ...prev, [track.id]: e.target.value }))
                              }
                              className="bg-[#1c1a1a] border border-[#3e3832] rounded px-2 py-1 text-xs text-[#e0d4c8] outline-none focus:border-[#d4ab6a] flex-1 min-w-0"
                            >
                              {bdoInstrumentNames.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
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
                              className="flex-1 accent-[#d4ab6a] h-1.5 bg-[#23201e] rounded cursor-pointer"
                            />
                            <span className="text-[11px] font-mono text-[#d4ab6a] w-8 text-right">
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
                                className="accent-[#d4ab6a] w-4 h-4 cursor-pointer rounded"
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
              <div className="relative rounded-md border border-[#3e3832] bg-[#151515] p-3.5 pt-4">
                <span className="absolute -top-2.5 left-3 bg-[#1c1a1a] px-2 text-[10px] font-bold uppercase tracking-wider text-[#d4ab6a] border border-[#3e3832] rounded flex items-center gap-1">
                  <AudioWaveform className="w-3 h-3 text-amber-400" /> EFEITOS GLOBAIS
                </span>

                <div className="flex items-center justify-around py-1 text-xs font-mono text-[#d4ab6a]">
                  <span>Reverb: <b>{effectorSettings?.reverb?.enabled ? effectorSettings.reverb.time : 0}</b></span>
                  <span className="text-[#3e3832]">|</span>
                  <span>Delay: <b>{effectorSettings?.delay?.enabled ? effectorSettings.delay.feedback : 0}</b></span>
                  <span className="text-[#3e3832]">|</span>
                  <span>Chorus: <b>{effectorSettings?.chorus?.enabled ? effectorSettings.chorus.feedback : 0}</b></span>
                </div>
              </div>

              {/* SECTION 4: VELOCITY COMPRESSION */}
              <div className="relative rounded-md border border-[#3e3832] bg-[#151515] p-4 pt-5">
                <span className="absolute -top-2.5 left-3 bg-[#1c1a1a] px-2 text-[10px] font-bold uppercase tracking-wider text-[#d4ab6a] border border-[#3e3832] rounded">
                  VELOCITY COMPRESSION
                </span>

                {/* Dynamic Mode Radio Buttons */}
                <div className="flex items-center gap-4 flex-wrap mb-4 text-xs">
                  <span className="text-[#8b847a] font-medium">Modo de Dinâmica:</span>
                  {(['layered', 'stepped', 'rescale', 'floor', 'off'] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-1.5 cursor-pointer capitalize text-[#e0d4c8] hover:text-[#d4ab6a] transition-colors">
                      <input
                        type="radio"
                        name="velMode"
                        value={mode}
                        checked={velMode === mode}
                        onChange={() => setVelMode(mode)}
                        className="accent-[#d4ab6a]"
                      />
                      <span>{mode}</span>
                    </label>
                  ))}
                </div>

                {/* Grid fields */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[#8b847a] w-12 text-right">Base:</span>
                    <input
                      type="number"
                      value={stepBase}
                      disabled={velMode !== 'stepped'}
                      onChange={(e) => setStepBase(e.target.value)}
                      className="w-16 bg-[#1c1a1a] border border-[#3e3832] rounded px-2 py-1 text-xs text-[#e0d4c8] text-center outline-none focus:border-[#d4ab6a] disabled:opacity-30"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[#8b847a] w-12 text-right">Step:</span>
                    <input
                      type="number"
                      value={stepStep}
                      disabled={velMode !== 'stepped'}
                      onChange={(e) => setStepStep(e.target.value)}
                      className="w-16 bg-[#1c1a1a] border border-[#3e3832] rounded px-2 py-1 text-xs text-[#e0d4c8] text-center outline-none focus:border-[#d4ab6a] disabled:opacity-30"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[#8b847a] w-12 text-right">Min:</span>
                    <input
                      type="number"
                      value={rescaleMin}
                      disabled={velMode !== 'rescale'}
                      onChange={(e) => setRescaleMin(e.target.value)}
                      className="w-16 bg-[#1c1a1a] border border-[#3e3832] rounded px-2 py-1 text-xs text-[#e0d4c8] text-center outline-none focus:border-[#d4ab6a] disabled:opacity-30"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[#8b847a] w-12 text-right">Max:</span>
                    <input
                      type="number"
                      value={rescaleMax}
                      disabled={velMode !== 'rescale'}
                      onChange={(e) => setRescaleMax(e.target.value)}
                      className="w-16 bg-[#1c1a1a] border border-[#3e3832] rounded px-2 py-1 text-xs text-[#e0d4c8] text-center outline-none focus:border-[#d4ab6a] disabled:opacity-30"
                    />
                  </div>

                  <div className="flex items-center gap-2 sm:col-span-2">
                    <span className="text-[#8b847a] text-right">Floor Limit:</span>
                    <input
                      type="number"
                      value={floorVal}
                      disabled={velMode !== 'floor'}
                      onChange={(e) => setFloorVal(e.target.value)}
                      className="w-16 bg-[#1c1a1a] border border-[#3e3832] rounded px-2 py-1 text-xs text-[#e0d4c8] text-center outline-none focus:border-[#d4ab6a] disabled:opacity-30"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* XML & MML Score View matching Image Print */
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setXmlSubTab('xml')}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${xmlSubTab === 'xml'
                      ? 'bg-amber-500 text-stone-950 shadow'
                      : 'bg-stone-900 border border-[#3e3832] text-stone-300 hover:text-stone-100'
                      }`}
                  >
                    XML Estruturado (BDO Marni)
                  </button>
                  <button
                    onClick={() => setXmlSubTab('mml')}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${xmlSubTab === 'mml'
                      ? 'bg-amber-500 text-stone-950 shadow'
                      : 'bg-stone-900 border border-[#3e3832] text-stone-300 hover:text-stone-100'
                      }`}
                  >
                    MML Código Direto
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#3e3832] bg-[#23201e] text-xs font-medium text-[#e0d4c8] hover:text-[#d4ab6a] hover:border-[#d4ab6a] transition-all"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                  </button>

                  <button
                    onClick={handleDownloadXml}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-amber-600/70 bg-amber-950/40 text-xs font-medium text-amber-300 hover:bg-amber-900/50 transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Baixar Arquivo .XML</span>
                  </button>
                </div>
              </div>

              {/* Code Box */}
              <div className="rounded-lg border border-[#3e3832] bg-[#11100e] p-4 font-mono text-xs text-amber-100/90 max-h-80 overflow-y-auto overflow-x-auto whitespace-pre leading-relaxed select-text shadow-inner">
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
        <div className="p-4 border-t border-[#2a2a2a] bg-[#171616] shrink-0 flex items-center gap-3">
          <button
            onClick={handleExportBinary}
            className="w-full py-3 rounded-md bg-[#b09046] hover:bg-[#d8ad70] text-[#161618] font-bold text-sm tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(216,173,112,0.25)] hover:shadow-[0_0_20px_rgba(216,173,112,0.45)] active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            EXPORTAR ARQUIVO BDO (SEM EXTENSÃO)
          </button>
        </div>
      </div>
    </div>
  );
};
