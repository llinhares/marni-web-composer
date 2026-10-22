import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Upload,
  Key,
  CheckCircle2,
  AlertCircle,
  Music,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  FileText,
  RotateCw,
  Layers,
  Split,
  BookOpen,
} from 'lucide-react';
import type { Track, Note, InstrumentId, TimeSignature } from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';
import {
  getGeminiApiKey,
  saveGeminiApiKey,
  clearGeminiApiKey,
  transcribeSheetImageWithGemini,
  fetchAvailableGeminiModels,
  ParsedScoreResult,
} from '../utils/aiSheetScanner.ts';
import { newId } from '../utils/ids.ts';

interface AiSheetScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  activeTrackId: string;
  onImportScore: (result: {
    notes: Note[];
    targetTrackId: string;
    createNewTrack?: {
      name: string;
      instrumentId: InstrumentId;
    };
    secondTrack?: {
      trackId: string;
      name: string;
      instrumentId: InstrumentId;
      notes: Note[];
    };
    appendMode?: boolean;
    bpm?: number;
    title?: string;
    timeSignature?: TimeSignature;
  }) => void;
}

export const AiSheetScannerModal: React.FC<AiSheetScannerModalProps> = ({
  isOpen,
  onClose,
  tracks,
  activeTrackId,
  onImportScore,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([
    'gemini-3.8-flash',
    'gemini-3.8-flash-lite',
    'gemini-2.5-flash',
  ]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');

  // Destination & Track Options
  const [destinationMode, setDestinationMode] = useState<'new-2tracks' | 'new-1track' | 'existing'>('new-2tracks');
  const [newTrackName, setNewTrackName] = useState('Partitura IA');
  const [newTrackInstrument, setNewTrackInstrument] = useState<InstrumentId>('grand-piano');
  const [targetTrackId, setTargetTrackId] = useState(activeTrackId);
  const [isAppendMode, setIsAppendMode] = useState(false);

  // Multi-page Range & Playback Options
  const [pageRangeMode, setPageRangeMode] = useState<'all' | 'custom'>('all');
  const [customPageRange, setCustomPageRange] = useState('');
  const [autoApplyBpm, setAutoApplyBpm] = useState(true);

  // Execution states
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ParsedScoreResult | null>(null);
  const [showKeyGuide, setShowKeyGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const savedKey = getGeminiApiKey();
      setApiKey(savedKey);
      setTargetTrackId(activeTrackId);
      setErrorMessage(null);
      setScanResult(null);

      if (savedKey.trim()) {
        fetchAvailableGeminiModels(savedKey).then((models) => {
          if (models && models.length > 0) {
            setAvailableModels(models);
            if (!models.includes(selectedModel)) {
              setSelectedModel(models[0]);
            }
          }
        });
      }
    }
  }, [isOpen, activeTrackId]);

  useEffect(() => {
    if (selectedFile) {
      if (selectedFile.type.startsWith('image/')) {
        const url = URL.createObjectURL(selectedFile);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
      } else {
        setPreviewUrl(null);
      }
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  if (!isOpen) return null;

  const handleSaveKey = () => {
    saveGeminiApiKey(apiKey);
    if (apiKey.trim()) {
      fetchAvailableGeminiModels(apiKey).then((models) => {
        if (models && models.length > 0) {
          setAvailableModels(models);
          if (!models.includes(selectedModel)) {
            setSelectedModel(models[0]);
          }
        }
      });
    }
  };

  const handleClearKey = () => {
    clearGeminiApiKey();
    setApiKey('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(null);
      setScanResult(null);
      if (file.name) {
        const baseName = file.name.replace(/\.[^/.]+$/, '').trim();
        if (baseName) setNewTrackName(baseName);
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(null);
      setScanResult(null);
      if (file.name) {
        const baseName = file.name.replace(/\.[^/.]+$/, '').trim();
        if (baseName) setNewTrackName(baseName);
      }
    }
  };

  // Compute start tick offset if user wants to append after existing notes
  const targetTrackObj = tracks.find((t) => t.id === targetTrackId);
  const existingNotesEnd =
    targetTrackObj && targetTrackObj.notes.length > 0
      ? Math.max(...targetTrackObj.notes.map((n) => n.startTick + n.durationTicks))
      : 0;
  const computedOffset =
    isAppendMode && destinationMode === 'existing' && existingNotesEnd > 0
      ? Math.ceil(existingNotesEnd / 1920) * 1920
      : 0;

  const handleStartScan = async () => {
    if (!apiKey.trim()) {
      setErrorMessage('Por favor, insira sua chave de API do Gemini para continuar.');
      return;
    }
    if (!selectedFile) {
      setErrorMessage('Selecione uma imagem ou arquivo PDF de partitura.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setScanResult(null);
    setStatusMessage('Enviando partitura para o Gemini Vision...');
    handleSaveKey();

    try {
      setStatusMessage('Decodificando pauta dupla (Claves de Sol e Fá), notas e compassos...');
      const result = await transcribeSheetImageWithGemini(selectedFile, apiKey, {
        model: selectedModel,
        targetTrackId: destinationMode === 'existing' ? targetTrackId : newId('track'),
        pageRange: pageRangeMode === 'custom' && customPageRange.trim() ? customPageRange.trim() : 'all',
        startTickOffset: computedOffset,
      });

      setScanResult(result);
      setStatusMessage('Transcrição concluída com sucesso!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (!scanResult) return;

    const baseTitle = newTrackName || scanResult.title || 'Partitura IA';

    if (destinationMode === 'new-2tracks') {
      const rightTrackId = newId('track');
      const leftTrackId = newId('track');

      const rightNotes = (
        scanResult.rightHandNotes.length > 0 ? scanResult.rightHandNotes : scanResult.notes
      ).map((n) => ({
        ...n,
        id: newId('note'),
        trackId: rightTrackId,
      }));

      const leftNotes = scanResult.leftHandNotes.map((n) => ({
        ...n,
        id: newId('note'),
        trackId: leftTrackId,
      }));

      onImportScore({
        notes: rightNotes,
        targetTrackId: rightTrackId,
        createNewTrack: {
          name: `${baseTitle} (Mão Direita / Clave Sol)`,
          instrumentId: newTrackInstrument,
        },
        secondTrack:
          leftNotes.length > 0
            ? {
                trackId: leftTrackId,
                name: `${baseTitle} (Mão Esquerda / Clave Fá)`,
                instrumentId: newTrackInstrument,
                notes: leftNotes,
              }
            : undefined,
        bpm: autoApplyBpm ? scanResult.bpm : undefined,
        title: scanResult.title,
        timeSignature: scanResult.timeSignature,
      });
    } else if (destinationMode === 'new-1track') {
      const createdTrackId = newId('track');
      const remappedNotes = scanResult.notes.map((n) => ({
        ...n,
        id: newId('note'),
        trackId: createdTrackId,
      }));
      onImportScore({
        notes: remappedNotes,
        targetTrackId: createdTrackId,
        createNewTrack: {
          name: baseTitle,
          instrumentId: newTrackInstrument,
        },
        bpm: autoApplyBpm ? scanResult.bpm : undefined,
        title: scanResult.title,
        timeSignature: scanResult.timeSignature,
      });
    } else {
      const remappedNotes = scanResult.notes.map((n) => ({
        ...n,
        id: newId('note'),
        trackId: targetTrackId,
      }));
      onImportScore({
        notes: remappedNotes,
        targetTrackId,
        appendMode: isAppendMode,
        bpm: autoApplyBpm ? scanResult.bpm : undefined,
        title: scanResult.title,
        timeSignature: scanResult.timeSignature,
      });
    }

    onClose();
  };


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#161412] border border-[#3e342b] rounded-2xl shadow-2xl p-6 text-stone-200 max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="omr-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#2d2722] pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="omr-title" className="text-lg font-bold tracking-wide text-amber-400 font-serif">
                  Importar Partitura por Imagem (IA OMR)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm">
                  BETA
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-stone-800 text-stone-300 border border-[#3e342b]">
                  {selectedModel}
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Converta partituras em imagem ou PDF diretamente para trilhas MIDI no Piano Roll usando visão computacional multimodal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto pr-1 py-4 space-y-4 flex-1 text-xs">
          {/* BETA Disclaimer & Recommendation Banner */}
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200/90 space-y-1.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500 text-stone-950">
                  RECURSO BETA
                </span>
                <span className="font-semibold text-xs text-amber-300">
                  Transcrição por Visão Computacional em Desenvolvimento
                </span>
              </div>
              <span className="text-[10px] text-amber-400/80 font-mono">Experimental</span>
            </div>
            <p className="text-[11px] text-stone-300 leading-relaxed">
              O leitor de partituras utiliza visão computacional do Gemini para estimar pautas, claves e notas. Em partituras densas, polifônicas ou muito longas (como arranjos complexos de piano), imprecisões melódicas e rítmicas podem ocorrer.
            </p>
            <div className="text-[11px] text-amber-300/95 bg-amber-950/40 p-2 rounded-lg border border-amber-500/20 flex items-start gap-1.5">
              <span className="text-sm shrink-0">💡</span>
              <span>
                <strong>Dica para fidelidade de 100%:</strong> Para partituras completas e perfeitas (como as do MuseScore), prefira sempre baixar o arquivo <strong>MIDI (.mid)</strong> e importá-lo diretamente na DAW. Todas as notas, tempos e mãos entrarão idênticos ao original.
              </span>
            </div>
          </div>

          {/* 1. Gemini API Key Configuration Box */}
          <div className="p-3.5 rounded-xl bg-stone-900/80 border border-[#2d2722] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-stone-200">Chave de API do Google Gemini</span>
                {apiKey ? (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-800/40">
                    <CheckCircle2 className="w-3 h-3" /> Salva localmente
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-400/90 bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-800/40">
                    Gratuita no Google AI Studio
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowKeyGuide(!showKeyGuide)}
                className="text-stone-400 hover:text-amber-400 transition-colors flex items-center gap-1 text-[11px]"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Como obter chave grátis?</span>
              </button>
            </div>

            {/* API Key Input */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={handleSaveKey}
                  placeholder="Cole sua API Key do Google AI Studio (ex: AIzaSy...)"
                  className="w-full bg-[#141210] border border-[#3e342b] focus:border-amber-500 rounded-lg px-3 py-2 pr-9 text-stone-200 text-xs font-mono placeholder:text-stone-600 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 transition-colors"
                  title={showApiKey ? 'Ocultar' : 'Visualizar'}
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              {apiKey && (
                <button
                  type="button"
                  onClick={handleClearKey}
                  className="px-2.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-400 hover:text-stone-200 border border-[#3e342b] transition-colors"
                  title="Remover Chave"
                >
                  Limpar
                </button>
              )}

              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-400 flex items-center gap-1.5 transition-colors font-medium whitespace-nowrap"
              >
                <span>Obter Chave</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Quick Tutorial Dropdown */}
            {showKeyGuide && (
              <div className="p-3 rounded-lg bg-[#141210] border border-amber-500/20 text-stone-300 space-y-2 mt-2">
                <h4 className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Passo a passo para gerar sua chave gratuita:
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-stone-300 pl-1 leading-relaxed">
                  <li>
                    Acesse o portal oficial{' '}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 underline"
                    >
                      Google AI Studio (aistudio.google.com)
                    </a>{' '}
                    e faça login com sua conta Google.
                  </li>
                  <li>Clique no botão azul <strong>&quot;Create API Key&quot;</strong> (Criar chave de API).</li>
                  <li>Escolha ou crie um projeto padrão do Google Cloud (gratuito) e confirme.</li>
                  <li>Copie a chave gerada (inicia com <code>AIzaSy...</code>) e cole no campo acima.</li>
                  <li>A chave fica armazenada exclusivamente no seu navegador (localStorage).</li>
                </ol>
              </div>
            )}
          </div>

          {/* 2. File Upload / Drop Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
              selectedFile
                ? 'border-amber-500/70 bg-amber-950/10'
                : 'border-[#3e342b] hover:border-amber-500/50 bg-stone-900/40 hover:bg-stone-900/70'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg,image/webp,image/jpg,application/pdf"
              className="hidden"
            />

            {previewUrl ? (
              <div className="flex flex-col items-center gap-2">
                <img
                  src={previewUrl}
                  alt="Partitura Selecionada"
                  className="max-h-36 rounded-lg border border-[#3e342b] object-contain shadow-lg"
                />
                <div className="flex items-center gap-2 text-xs text-stone-300 font-medium">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>{selectedFile?.name}</span>
                  <span className="text-[10px] text-stone-500 font-mono">
                    ({Math.round((selectedFile?.size || 0) / 1024)} KB)
                  </span>
                </div>
                <span className="text-[11px] text-amber-400/90 underline">
                  Clique ou arraste para trocar de arquivo
                </span>
              </div>
            ) : selectedFile ? (
              <div className="flex flex-col items-center gap-1.5 py-3">
                <FileText className="w-10 h-10 text-amber-400" />
                <span className="text-xs font-semibold text-stone-200">{selectedFile.name}</span>
                <span className="text-[10px] text-stone-500 font-mono">
                  {Math.round(selectedFile.size / 1024)} KB
                </span>
                <span className="text-[11px] text-amber-400/90 underline">Trocar arquivo</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-3">
                <div className="p-3 rounded-full bg-stone-800 text-stone-400">
                  <Upload className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <span className="font-semibold text-stone-200 text-xs">
                    Arraste a partitura aqui ou clique para selecionar
                  </span>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Formatos suportados: PNG, JPG, JPEG, WEBP ou PDF (Pegasus Fantasy, clássicos, animes, etc.)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 3. Destination, Hands & Multi-Page Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-stone-900/60 border border-[#2d2722]">
            {/* Destination Selection */}
            <div className="space-y-2">
              <span className="font-semibold text-stone-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Destino das Notas & Pauta
              </span>

              {/* 3 Mode Buttons */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDestinationMode('new-2tracks')}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold leading-tight text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                    destinationMode === 'new-2tracks'
                      ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-sm'
                      : 'bg-stone-900 border-[#3e342b] text-stone-400 hover:text-stone-200'
                  }`}
                  title="Separa Clave de Sol (Mão Direita) e Clave de Fá (Mão Esquerda) em duas faixas"
                >
                  <Split className="w-3 h-3" />
                  <span>2 Faixas (Piano)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDestinationMode('new-1track')}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold leading-tight text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                    destinationMode === 'new-1track'
                      ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-sm'
                      : 'bg-stone-900 border-[#3e342b] text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>1 Faixa Única</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDestinationMode('existing')}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold leading-tight text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                    destinationMode === 'existing'
                      ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-sm'
                      : 'bg-stone-900 border-[#3e342b] text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Music className="w-3 h-3" />
                  <span>Faixa Atual</span>
                </button>
              </div>

              {destinationMode !== 'existing' ? (
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTrackName}
                      onChange={(e) => setNewTrackName(e.target.value)}
                      placeholder="Nome da Faixa / Música"
                      className="flex-1 bg-[#141210] border border-[#3e342b] rounded-lg px-2.5 py-1 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                    />
                    <select
                      value={newTrackInstrument}
                      onChange={(e) => setNewTrackInstrument(e.target.value as InstrumentId)}
                      className="bg-[#141210] border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                    >
                      {BDO_INSTRUMENTS.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-[10px] text-stone-400 leading-tight">
                    {destinationMode === 'new-2tracks'
                      ? '🎹 Separa a partitura em 2 trilhas: Clave de Sol (Mão Direita) e Clave de Fá (Mão Esquerda) para edição independente.'
                      : 'Todas as notas de ambas as claves serão combinadas em uma única faixa.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-400 whitespace-nowrap">Faixa:</span>
                    <select
                      value={targetTrackId}
                      onChange={(e) => setTargetTrackId(e.target.value)}
                      className="flex-1 bg-[#141210] border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                    >
                      {tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.notes.length} notas)
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-[11px] text-stone-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAppendMode}
                      onChange={(e) => setIsAppendMode(e.target.checked)}
                      className="rounded border-[#3e342b] accent-amber-500 w-3.5 h-3.5"
                    />
                    <span>Anexar ao final da faixa (modo continuação)</span>
                  </label>

                  {isAppendMode && existingNotesEnd > 0 && (
                    <span className="block text-[10px] text-amber-400/90 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/30">
                      Iniciará a partir do compasso {Math.ceil(existingNotesEnd / 1920) + 1} (~tick {computedOffset})
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Page Range, Model & BPM Options */}
            <div className="space-y-2">
              <span className="font-semibold text-stone-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                Páginas da Partitura
              </span>

              {/* Page Range Selection */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPageRangeMode('all')}
                  className={`py-1 px-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    pageRangeMode === 'all'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-stone-900 border-[#3e342b] text-stone-400 hover:text-stone-200'
                  }`}
                >
                  Todas as Páginas
                </button>
                <button
                  type="button"
                  onClick={() => setPageRangeMode('custom')}
                  className={`py-1 px-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    pageRangeMode === 'custom'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-stone-900 border-[#3e342b] text-stone-400 hover:text-stone-200'
                  }`}
                >
                  Páginas Específicas
                </button>

                {pageRangeMode === 'custom' && (
                  <input
                    type="text"
                    value={customPageRange}
                    onChange={(e) => setCustomPageRange(e.target.value)}
                    placeholder="ex: 1-4 ou 5-8"
                    className="flex-1 bg-[#141210] border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                )}
              </div>

              {/* Model & BPM Options */}
              <div className="pt-1 space-y-1.5 border-t border-[#2d2722]/80">
                <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApplyBpm}
                    onChange={(e) => setAutoApplyBpm(e.target.checked)}
                    className="rounded border-[#3e342b] accent-amber-500 w-3.5 h-3.5"
                  />
                  <span>Ajustar BPM do projeto automaticamente ao tempo</span>
                </label>

                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] text-stone-400 whitespace-nowrap">Modelo IA:</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="flex-1 bg-[#141210] border border-[#3e342b] rounded-lg px-2 py-1 text-xs text-stone-300 focus:outline-none"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m === 'gemini-3.8-flash'
                          ? 'Gemini 3.8 Flash (Recomendado)'
                          : m === 'gemini-3.8-flash-lite'
                          ? 'Gemini 3.8 Flash-Lite (Rápido)'
                          : m === 'gemini-2.5-flash'
                          ? 'Gemini 2.5 Flash'
                          : m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Error Message Box */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/50 text-red-200 flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-[11px] leading-relaxed">
                <span className="font-semibold block text-red-300">Falha ao processar partitura:</span>
                {errorMessage}
              </div>
            </div>
          )}

          {/* Success Scan Result Card */}
          {scanResult && (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-3 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between border-b border-amber-500/20 pb-2 gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-amber-300 text-sm">
                    {scanResult.title || 'Partitura Transcrita'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[11px] font-bold">
                    {scanResult.stats.totalNotes} Notas no total
                  </span>
                  <span className="px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/40 font-mono text-[11px]">
                    Mão Dir: {scanResult.stats.rightHandCount}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 font-mono text-[11px]">
                    Mão Esq: {scanResult.stats.leftHandCount}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-mono text-[11px]">
                    {scanResult.bpm} BPM
                  </span>
                  <span className="px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-mono text-[11px]">
                    {scanResult.timeSignature}
                  </span>
                </div>
              </div>

              {destinationMode === 'new-2tracks' && scanResult.stats.leftHandCount > 0 && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-2">
                  <Split className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Serão criadas 2 faixas simultâneas: <strong>Mão Direita (Clave de Sol)</strong> com {scanResult.stats.rightHandCount} notas e <strong>Mão Esquerda (Clave de Fá)</strong> com {scanResult.stats.leftHandCount} notas.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-stone-900/60 border border-[#2d2722]">
                  <span className="text-stone-500 block">Tonalidade / Armadura:</span>
                  <span className="font-medium text-stone-200">{scanResult.keySignature}</span>
                </div>
                <div className="p-2 rounded-lg bg-stone-900/60 border border-[#2d2722]">
                  <span className="text-stone-500 block">Total de Compassos:</span>
                  <span className="font-medium text-stone-200">~{scanResult.stats.measures} compassos</span>
                </div>
                <div className="p-2 rounded-lg bg-stone-900/60 border border-[#2d2722]">
                  <span className="text-stone-500 block">Extensão / Altura:</span>
                  <span className="font-medium text-stone-200">
                    Nota {scanResult.stats.lowestPitch} até {scanResult.stats.highestPitch}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-stone-900/60 border border-[#2d2722]">
                  <span className="text-stone-500 block">Acordes Cifrados:</span>
                  <span className="font-medium text-stone-200">
                    {scanResult.chords.length > 0
                      ? scanResult.chords.slice(0, 5).map((c) => c.chord).join(', ')
                      : 'Nenhum'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#2d2722] pt-4 shrink-0">
          <div className="text-[11px] text-stone-500">
            {isProcessing && (
              <span className="flex items-center gap-2 text-amber-400 font-medium">
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                {statusMessage}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-[#3e342b] transition-colors text-xs font-semibold"
            >
              Cancelar
            </button>

            {scanResult ? (
              <button
                onClick={handleConfirmImport}
                className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-all text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.3)] active:scale-95"
              >
                <Music className="w-4 h-4" />
                <span>Carregar no Piano Roll</span>
              </button>
            ) : (
              <button
                onClick={handleStartScan}
                disabled={isProcessing || !selectedFile || !apiKey}
                className={`px-5 py-2 rounded-lg font-bold transition-all text-xs flex items-center gap-2 shadow-sm ${
                  isProcessing || !selectedFile || !apiKey
                    ? 'bg-stone-800 text-stone-500 cursor-not-allowed border border-[#3e342b]'
                    : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-[0_0_15px_rgba(245,158,11,0.3)] active:scale-95'
                }`}
              >
                {isProcessing ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Transcrevendo...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 fill-current" />
                    <span>Transcrever Partitura com IA</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
