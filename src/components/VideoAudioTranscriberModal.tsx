import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Video,
  Music,
  Upload,
  Play,
  Pause,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Split,
  Eye,
  RefreshCw,
} from 'lucide-react';
import type { Track, Note, InstrumentId, TimeSignature } from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';
import {
  extractAudioBufferFromFile,
  transcribeAudioBufferToNotes,
  AudioTranscriptionResult,
} from '../utils/audioToMidi.ts';
import {
  scanVideoFrames,
  fuseAudioAndVisionNotes,
  VisualNoteEvent,
} from '../utils/videoScanner.ts';

interface VideoAudioTranscriberModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  activeTrackId: string;
  currentBpm: number;
  onImportTranscribedNotes: (result: {
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

export const VideoAudioTranscriberModal: React.FC<VideoAudioTranscriberModalProps> = ({
  isOpen,
  onClose,
  tracks,
  activeTrackId,
  currentBpm,
  onImportTranscribedNotes,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState<boolean>(false);

  // Settings
  const [transcriptionMode, setTranscriptionMode] = useState<'hybrid' | 'audio-only'>('hybrid');
  const [splitHands, setSplitHands] = useState<boolean>(true);
  const [destinationMode, setDestinationMode] = useState<'new-tracks' | 'existing'>('new-tracks');
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentId>('grand-piano');
  const [targetTrackId, setTargetTrackId] = useState<string>(activeTrackId);
  const [autoApplyBpm, setAutoApplyBpm] = useState<boolean>(true);
  const [sensitivity, setSensitivity] = useState<number>(0.55);

  // Video Calibration
  const [scanlineY, setScanlineY] = useState<number>(85); // 85% from top
  const [keyboardXStart, setKeyboardXStart] = useState<number>(2); // 2% from left
  const [keyboardXEnd, setKeyboardXEnd] = useState<number>(98); // 98% from left
  const [brightnessThreshold, setBrightnessThreshold] = useState<number>(45);

  // Playback state for video preview
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Result state
  const [transcriptionResult, setTranscriptionResult] = useState<{
    rightHandNotes: Note[];
    leftHandNotes: Note[];
    allNotes: Note[];
    detectedBpm: number;
    durationSec: number;
    suppressedHarmonics: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      setTargetTrackId(activeTrackId);
      setErrorMessage(null);
    } else {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
        setFileUrl(null);
      }
      setSelectedFile(null);
      setTranscriptionResult(null);
      setIsProcessing(false);
      setProgress(0);
    }
  }, [isOpen, activeTrackId]);

  // Handle File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileUrl) {
      URL.revokeObjectURL(fileUrl);
    }

    const isVid = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
    setIsVideo(isVid);
    setTranscriptionMode(isVid ? 'hybrid' : 'audio-only');
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setTranscriptionResult(null);
    setErrorMessage(null);
  };

  // Draw calibration overlay on video
  useEffect(() => {
    if (!isVideo || !fileUrl) return;

    const canvas = canvasOverlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderOverlay = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const y = (scanlineY / 100) * canvas.height;
      const x1 = (keyboardXStart / 100) * canvas.width;
      const x2 = (keyboardXEnd / 100) * canvas.width;

      // Draw keyboard bounds
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x2, 0);
      ctx.lineTo(x2, canvas.height);
      ctx.stroke();

      // Draw active scanline
      ctx.setLineDash([]);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      // Scanline label
      ctx.fillStyle = '#f59e0b';
      ctx.font = '10px monospace';
      ctx.fillText(`LINHA DE IMPACTO (${scanlineY}%)`, x1 + 8, y - 6);
    };

    renderOverlay();
  }, [isVideo, fileUrl, scanlineY, keyboardXStart, keyboardXEnd]);

  // Execute Transcription
  const handleStartTranscription = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setProgress(0);
    setErrorMessage(null);
    setTranscriptionResult(null);
    setStatusMessage('Iniciando processamento...');

    try {
      // 1. Audio Transcription Phase
      setStatusMessage('Extraindo e decodificando áudio via Web Audio API...');
      const audioBuffer = await extractAudioBufferFromFile(selectedFile);

      setStatusMessage('Detectando notas musicais e dinâmicas pelo áudio...');
      const audioResult: AudioTranscriptionResult = await transcribeAudioBufferToNotes(audioBuffer, {
        bpm: autoApplyBpm ? undefined : currentBpm,
        sensitivity,
        onProgress: (p, stage) => {
          // Allocate 0% to 50% for audio phase
          const scaled = isVideo && transcriptionMode === 'hybrid' ? p * 0.5 : p;
          setProgress(scaled);
          setStatusMessage(stage);
        },
      });

      const effectiveBpm = audioResult.detectedBpm || currentBpm;

      // 2. Video Computer Vision Phase (if video & hybrid mode selected)
      if (isVideo && transcriptionMode === 'hybrid' && videoRef.current) {
        setStatusMessage('Iniciando leitura dos frames do teclado do vídeo...');
        const videoElement = videoRef.current;

        const videoScanResult = await scanVideoFrames(videoElement, {
          scanlineYRatio: scanlineY / 100,
          keyboardXStartRatio: keyboardXStart / 100,
          keyboardXEndRatio: keyboardXEnd / 100,
          brightnessThreshold,
          fps: 25,
          onProgress: (p, stage) => {
            // Allocate 50% to 90% for visual phase
            setProgress(0.5 + p * 0.4);
            setStatusMessage(stage);
          },
        });

        setStatusMessage('Cruzando notas do áudio com visão computacional...');
        const fused = fuseAudioAndVisionNotes(
          audioResult.notes,
          videoScanResult.visualNotes,
          effectiveBpm
        );

        setTranscriptionResult({
          rightHandNotes: fused.rightHandNotes,
          leftHandNotes: fused.leftHandNotes,
          allNotes: fused.allNotes,
          detectedBpm: effectiveBpm,
          durationSec: audioResult.durationSeconds,
          suppressedHarmonics: fused.suppressedHarmonicsCount,
        });
      } else {
        // Audio-only mode: separate hands by Middle C (60) heuristic
        const rightNotes: Note[] = [];
        const leftNotes: Note[] = [];
        for (const n of audioResult.notes) {
          if (n.pitch >= 60) {
            rightNotes.push(n);
          } else {
            leftNotes.push(n);
          }
        }

        setTranscriptionResult({
          rightHandNotes: rightNotes,
          leftHandNotes: leftNotes,
          allNotes: audioResult.notes,
          detectedBpm: effectiveBpm,
          durationSec: audioResult.durationSeconds,
          suppressedHarmonics: 0,
        });
      }

      setProgress(1.0);
      setStatusMessage('Transcrição finalizada com sucesso!');
    } catch (err: unknown) {
      console.error('Erro na transcrição:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm Import into Project
  const handleConfirmImport = () => {
    if (!transcriptionResult) return;

    const baseTitle = selectedFile
      ? selectedFile.name.replace(/\.[^/.]+$/, '').trim()
      : 'Transcrição IA';

    if (splitHands && transcriptionResult.rightHandNotes.length > 0 && transcriptionResult.leftHandNotes.length > 0) {
      // 2 Tracks: Right Hand + Left Hand
      const rightTrackId = `track-trans-rh-${Date.now()}`;
      const leftTrackId = `track-trans-lh-${Date.now() + 1}`;

      const rightNotes = transcriptionResult.rightHandNotes.map((n) => ({
        ...n,
        id: `note-${Date.now()}-${Math.random()}`,
        trackId: rightTrackId,
      }));

      const leftNotes = transcriptionResult.leftHandNotes.map((n) => ({
        ...n,
        id: `note-${Date.now() + 1}-${Math.random()}`,
        trackId: leftTrackId,
      }));

      onImportTranscribedNotes({
        notes: rightNotes,
        targetTrackId: rightTrackId,
        createNewTrack: {
          name: `${baseTitle} (Mão Direita)`,
          instrumentId: selectedInstrument,
        },
        secondTrack: {
          trackId: leftTrackId,
          name: `${baseTitle} (Mão Esquerda)`,
          instrumentId: selectedInstrument,
          notes: leftNotes,
        },
        bpm: autoApplyBpm ? transcriptionResult.detectedBpm : undefined,
        title: baseTitle,
      });
    } else {
      // Single Track
      const trackId = destinationMode === 'existing' ? targetTrackId : `track-trans-${Date.now()}`;
      const notes = transcriptionResult.allNotes.map((n) => ({
        ...n,
        id: `note-${Date.now()}-${Math.random()}`,
        trackId,
      }));

      onImportTranscribedNotes({
        notes,
        targetTrackId: trackId,
        createNewTrack:
          destinationMode === 'new-tracks'
            ? {
                name: baseTitle,
                instrumentId: selectedInstrument,
              }
            : undefined,
        appendMode: destinationMode === 'existing',
        bpm: autoApplyBpm ? transcriptionResult.detectedBpm : undefined,
        title: baseTitle,
      });
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#191614] border border-[#382f27] rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-stone-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2d2722] flex items-center justify-between bg-[#141210]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-stone-100">
                  Transcritor de Vídeo & Áudio (Cascata / Synthesia)
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  HÍBRIDO IA
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  NOVO
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Converte vídeos de teclado em cascata e áudios diretamente para faixas MIDI com dinâmicas e separação de mãos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* File Upload / Dropzone */}
          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1.5">
              Arquivo de Vídeo ou Áudio
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                selectedFile
                  ? 'border-amber-500/50 bg-amber-950/10'
                  : 'border-[#382f27] hover:border-amber-500/40 bg-stone-900/40 hover:bg-stone-900/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-matroska,audio/mp3,audio/wav,audio/mpeg,audio/flac,audio/ogg,audio/m4a"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="p-3 rounded-full bg-stone-800/80 border border-[#2d2722] text-amber-400">
                  {isVideo ? <Video className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                </div>
                {selectedFile ? (
                  <div>
                    <span className="text-sm font-semibold text-amber-300">{selectedFile.name}</span>
                    <p className="text-[11px] text-stone-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB •{' '}
                      {isVideo ? 'Vídeo detectado (Suporta calibragem visual)' : 'Áudio detectado'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm font-semibold text-stone-300">
                      Clique para selecionar ou arraste o arquivo
                    </span>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Suporta MP4, WEBM, MOV, MKV (vídeo) ou MP3, WAV, FLAC, M4A (áudio)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Video Preview with Calibration Scanline */}
          {isVideo && fileUrl && (
            <div className="bg-stone-900/60 border border-[#2d2722] rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />
                  Calibração da Visão Computacional (Cascata Synthesia)
                </span>
                <span className="text-[11px] text-stone-400">
                  Ajuste a linha amarela para que fique exatamente acima das teclas do piano
                </span>
              </div>

              {/* Video with Canvas Overlay */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-stone-800 flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={fileUrl}
                  className="w-full h-full object-contain"
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setVideoCurrentTime(videoRef.current.currentTime);
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setVideoDuration(videoRef.current.duration);
                    }
                  }}
                  playsInline
                />
                <canvas
                  ref={canvasOverlayRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />

                {/* Video Play/Pause Overlay Button */}
                <button
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    if (v.paused) {
                      v.play();
                      setIsVideoPlaying(true);
                    } else {
                      v.pause();
                      setIsVideoPlaying(false);
                    }
                  }}
                  className="absolute bottom-3 left-3 p-2 rounded-lg bg-black/70 hover:bg-black/90 text-amber-400 border border-stone-700 transition-colors shadow-lg"
                  title={isVideoPlaying ? 'Pausar vídeo' : 'Tocar vídeo'}
                >
                  {isVideoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
              </div>

              {/* Calibration Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                    <span>Altura da Linha de Leitura (Y)</span>
                    <span className="font-mono text-amber-300 font-bold">{scanlineY}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={98}
                    value={scanlineY}
                    onChange={(e) => setScanlineY(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                    <span>Início do Teclado (X)</span>
                    <span className="font-mono text-amber-300 font-bold">{keyboardXStart}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={keyboardXStart}
                    onChange={(e) => setKeyboardXStart(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                    <span>Fim do Teclado (X)</span>
                    <span className="font-mono text-amber-300 font-bold">{keyboardXEnd}%</span>
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={100}
                    value={keyboardXEnd}
                    onChange={(e) => setKeyboardXEnd(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mode & Split Hands */}
            <div className="bg-stone-900/50 border border-[#2d2722] rounded-xl p-3.5 space-y-3">
              <span className="font-semibold text-stone-300 block">Modo de Conversão</span>
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="transcriptionMode"
                    value="hybrid"
                    checked={transcriptionMode === 'hybrid'}
                    onChange={() => setTranscriptionMode('hybrid')}
                    disabled={!isVideo}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <span className="font-medium text-stone-200">
                      Híbrido (Áudio + Visão Computacional)
                    </span>
                    <p className="text-[11px] text-stone-400">
                      Ideal para vídeos Synthesia: extrai velocity e ritmo pelo áudio e lê as cores e teclas pelo vídeo.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="transcriptionMode"
                    value="audio-only"
                    checked={transcriptionMode === 'audio-only'}
                    onChange={() => setTranscriptionMode('audio-only')}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <span className="font-medium text-stone-200">Apenas Áudio (Frequências & Transientes)</span>
                    <p className="text-[11px] text-stone-400">
                      Rápido e direto pelas ondas de som. Recomendado para arquivos de áudio puro ou vídeos sem teclado.
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-2 border-t border-stone-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={splitHands}
                    onChange={(e) => setSplitHands(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span className="font-medium text-stone-300 flex items-center gap-1.5">
                    <Split className="w-3.5 h-3.5 text-amber-400" />
                    Separar em 2 faixas (Mão Direita e Mão Esquerda)
                  </span>
                </label>
              </div>
            </div>

            {/* Instrument & Output Settings */}
            <div className="bg-stone-900/50 border border-[#2d2722] rounded-xl p-3.5 space-y-3">
              <span className="font-semibold text-stone-300 block">Destino e Instrumento</span>

              <div>
                <label className="block text-[11px] text-stone-400 mb-1">Instrumento das Faixas</label>
                <select
                  value={selectedInstrument}
                  onChange={(e) => setSelectedInstrument(e.target.value as InstrumentId)}
                  className="w-full bg-stone-900 border border-[#382f27] rounded-lg px-2.5 py-1.5 text-stone-200 focus:outline-none focus:border-amber-500/60"
                >
                  {BDO_INSTRUMENTS.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} ({inst.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-stone-400 mb-1">Destino das Notas</label>
                <select
                  value={destinationMode}
                  onChange={(e) => setDestinationMode(e.target.value as 'new-tracks' | 'existing')}
                  className="w-full bg-stone-900 border border-[#382f27] rounded-lg px-2.5 py-1.5 text-stone-200 focus:outline-none focus:border-amber-500/60"
                >
                  <option value="new-tracks">Criar Novas Faixas no Projeto</option>
                  <option value="existing">Adicionar à Faixa Atual Selecionada</option>
                </select>
              </div>

              <div className="pt-2 border-t border-stone-800 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApplyBpm}
                    onChange={(e) => setAutoApplyBpm(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span className="text-[11px] text-stone-300">Detectar e aplicar BPM automaticamente</span>
                </label>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {isProcessing && (
            <div className="bg-stone-900/90 border border-amber-500/40 rounded-xl p-4 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-amber-300 font-semibold flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  {statusMessage}
                </span>
                <span className="font-mono text-amber-400 font-bold">{Math.round(progress * 100)}%</span>
              </div>
              <div className="w-full bg-stone-800 rounded-full h-2 overflow-hidden border border-stone-700">
                <div
                  className="bg-amber-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/50 text-red-200 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Transcription Results Preview Card */}
          {transcriptionResult && (
            <div className="bg-emerald-950/20 border border-emerald-500/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Transcrição Concluída com Sucesso!
                </span>
                <span className="font-mono text-xs text-stone-300">
                  Andamento: <strong className="text-amber-400">{transcriptionResult.detectedBpm} BPM</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center font-mono">
                <div className="bg-stone-900/60 p-2 rounded-lg border border-stone-800">
                  <span className="text-[10px] text-stone-400 block font-sans">Total de Notas</span>
                  <span className="text-sm font-bold text-stone-100">{transcriptionResult.allNotes.length}</span>
                </div>
                <div className="bg-stone-900/60 p-2 rounded-lg border border-stone-800">
                  <span className="text-[10px] text-stone-400 block font-sans">Mão Direita</span>
                  <span className="text-sm font-bold text-emerald-400">{transcriptionResult.rightHandNotes.length}</span>
                </div>
                <div className="bg-stone-900/60 p-2 rounded-lg border border-stone-800">
                  <span className="text-[10px] text-stone-400 block font-sans">Mão Esquerda</span>
                  <span className="text-sm font-bold text-sky-400">{transcriptionResult.leftHandNotes.length}</span>
                </div>
                <div className="bg-stone-900/60 p-2 rounded-lg border border-stone-800">
                  <span className="text-[10px] text-stone-400 block font-sans">Harmônicos Filtrados</span>
                  <span className="text-sm font-bold text-amber-400">{transcriptionResult.suppressedHarmonics}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[#2d2722] bg-[#141210] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-[#382f27] text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {!transcriptionResult ? (
              <button
                onClick={handleStartTranscription}
                disabled={!selectedFile || isProcessing}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                Iniciar Transcrição
              </button>
            ) : (
              <button
                onClick={handleConfirmImport}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Importar para o Projeto
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
