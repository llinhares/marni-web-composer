import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Video,
  Upload,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Split,
  Eye,
  RefreshCw,
  Scissors,
  Pipette,
  RotateCcw,
  Palette,
} from 'lucide-react';
import type { Track, Note, InstrumentId, TimeSignature } from '../types/music.ts';
import { TICKS_PER_BEAT, BDO_INSTRUMENTS } from '../types/music.ts';
import {
  extractAudioBufferFromFile,
  transcribeAudioBufferToNotes,
  estimateBpmFromAudioBuffer,
  AudioTranscriptionResult,
} from '../utils/audioToMidi.ts';
import {
  scanVideoFrames,
  fuseAudioAndVisionNotes,
  detectKeyHitsFromVideoContext,
  detectKeyboardLayoutInFrame,
  KeyboardLayout,
  hexToRgb,
  rgbToHex,
  DetectedBarSegment,
  KeyHit,
} from '../utils/videoScanner.ts';
import { pitchToNoteName, formatTimecode } from '../utils/musicMath.ts';
import { newId } from '../utils/ids.ts';

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

const COLOR_PRESETS = [
  { name: 'Verde', hex: '#22c55e' },
  { name: 'Azul Céu', hex: '#38bdf8' },
  { name: 'Roxo', hex: '#a855f7' },
  { name: 'Laranja', hex: '#f97316' },
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Amarelo', hex: '#eab308' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Ciano', hex: '#06b6d4' },
];

export const VideoAudioTranscriberModal: React.FC<VideoAudioTranscriberModalProps> = ({
  isOpen,
  onClose,
  activeTrackId,
  currentBpm,
  onImportTranscribedNotes,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState<boolean>(false);

  // Settings
  const [transcriptionMode, setTranscriptionMode] = useState<'hybrid' | 'audio-only' | 'video-only'>('hybrid');
  const [splitHands, setSplitHands] = useState<boolean>(true);
  const [destinationMode, setDestinationMode] = useState<'new-tracks' | 'existing'>('new-tracks');
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentId>('grand-piano');
  const [targetTrackId, setTargetTrackId] = useState<string>(activeTrackId);
  const [autoApplyBpm, setAutoApplyBpm] = useState<boolean>(true);
  const [sensitivity] = useState<number>(0.55);

  // Timeline Cropping (Intro & Outro Trimmer)
  const [cropStartTime, setCropStartTime] = useState<number>(0);
  const [cropEndTime, setCropEndTime] = useState<number>(0);
  const [isDraggingHandle, setIsDraggingHandle] = useState<'start' | 'end' | 'scrub' | null>(null);

  // Color Selection & Hand Classification
  const [colorMode, setColorMode] = useState<'two-colors' | 'single-color'>('two-colors');
  const [hand1ColorHex, setHand1ColorHex] = useState<string>('#22c55e'); // Green default (Right hand)
  const [hand2ColorHex, setHand2ColorHex] = useState<string>('#38bdf8'); // Sky blue default (Left hand)
  const [splitPitch, setSplitPitch] = useState<number>(60); // Middle C default
  const [eyedropperTarget, setEyedropperTarget] = useState<'hand1' | 'hand2' | null>(null);
  const [hoveredColor, setHoveredColor] = useState<{ r: number; g: number; b: number; x: number; y: number } | null>(null);

  // Video Calibration
  const [scanlineY, setScanlineY] = useState<number>(64); // 64% from top (above white smoke)
  const [keyboardXStart, setKeyboardXStart] = useState<number>(0); // 0% from left
  const [keyboardXEnd, setKeyboardXEnd] = useState<number>(100); // 100% from left
  const [octaveShift, setOctaveShift] = useState<number>(0); // -2 to +2 octaves
  const [detectedLayout, setDetectedLayout] = useState<KeyboardLayout | null>(null);
  const [brightnessThreshold] = useState<number>(38);
  const [minSaturation] = useState<number>(0.20);
  const [liveBars, setLiveBars] = useState<{ right: number; left: number }>({ right: 0, left: 0 });

  // Playback state
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
    matchedVisualCount: number;
    mode: 'hybrid' | 'audio-only' | 'video-only';
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);

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
      setCropStartTime(0);
      setCropEndTime(0);
      setVideoDuration(0);
      setEyedropperTarget(null);
      setHoveredColor(null);
      setDetectedLayout(null);
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
    setCropStartTime(0);
    setCropEndTime(0);

    // If pure audio, read duration via temporary Audio instance
    if (!isVid) {
      const audio = new Audio(url);
      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration)) {
          setVideoDuration(audio.duration);
          setCropStartTime(0);
          setCropEndTime(audio.duration);
        }
      };
    }
  };

  // Sample a pixel from video accounting for letterboxing (object-contain)
  const sampleVideoPixel = (canvasX: number, canvasY: number): { r: number; g: number; b: number } | null => {
    const video = videoRef.current;
    const canvas = canvasOverlayRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null;

    const cWidth = canvas.clientWidth;
    const cHeight = canvas.clientHeight;
    const vAspect = video.videoWidth / video.videoHeight;
    const cAspect = cWidth / cHeight;

    let renderW = cWidth;
    let renderH = cHeight;
    let renderX = 0;
    let renderY = 0;

    if (cAspect > vAspect) {
      renderW = cHeight * vAspect;
      renderX = (cWidth - renderW) / 2;
    } else {
      renderH = cWidth / vAspect;
      renderY = (cHeight - renderH) / 2;
    }

    if (canvasX < renderX || canvasX > renderX + renderW || canvasY < renderY || canvasY > renderY + renderH) {
      return null;
    }

    const normX = (canvasX - renderX) / renderW;
    const normY = (canvasY - renderY) / renderH;

    const vX = Math.floor(normX * video.videoWidth);
    const vY = Math.floor(normY * video.videoHeight);

    const off = document.createElement('canvas');
    off.width = 1;
    off.height = 1;
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return null;

    offCtx.drawImage(video, vX, vY, 1, 1, 0, 0, 1, 1);
    const data = offCtx.getImageData(0, 0, 1, 1).data;
    return { r: data[0], g: data[1], b: data[2] };
  };

  // Canvas Eyedropper Pointer handlers
  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!eyedropperTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const sampled = sampleVideoPixel(x, y);
    if (sampled) {
      setHoveredColor({ ...sampled, x, y });
    } else {
      setHoveredColor(null);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!eyedropperTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const sampled = sampleVideoPixel(x, y);
    if (sampled) {
      const hex = rgbToHex(sampled.r, sampled.g, sampled.b);
      if (eyedropperTarget === 'hand1') {
        setHand1ColorHex(hex);
      } else {
        setHand2ColorHex(hex);
      }
      setEyedropperTarget(null);
      setHoveredColor(null);
      setDetectedLayout(null);
    }
  };

  // Native EyeDropper API fallback (if supported in Chromium)
  const triggerNativeEyedropper = async (target: 'hand1' | 'hand2') => {
    // @ts-expect-error window.EyeDropper is a modern Web API
    if (typeof window !== 'undefined' && window.EyeDropper) {
      try {
        // @ts-expect-error window.EyeDropper
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          if (target === 'hand1') setHand1ColorHex(result.sRGBHex);
          else setHand2ColorHex(result.sRGBHex);
          return;
        }
      } catch {
        // User cancelled or native eyedropper threw
      }
    }
    // Activate canvas eyedropper
    setEyedropperTarget(target);
  };

  // Draw calibration overlay & real-time bar detections on video
  const renderOverlay = useCallback(
    (overrideSegments?: (DetectedBarSegment | KeyHit)[]) => {
      if (!isVideo || !fileUrl) return;

      const canvas = canvasOverlayRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Account for object-contain letterboxing
      const cWidth = canvas.width;
      const cHeight = canvas.height;
      const vW = video.videoWidth || 1280;
      const vH = video.videoHeight || 720;
      const vAspect = vW / vH;
      const cAspect = cWidth / Math.max(1, cHeight);

      let renderW = cWidth;
      let renderH = cHeight;
      let renderX = 0;
      let renderY = 0;

      if (cAspect > vAspect) {
        renderW = cHeight * vAspect;
        renderX = (cWidth - renderW) / 2;
      } else {
        renderH = cWidth / vAspect;
        renderY = (cHeight - renderH) / 2;
      }

      const y = renderY + (scanlineY / 100) * renderH;
      const stripH = Math.max(6, renderH * 0.04);
      const x1 = renderX + (keyboardXStart / 100) * renderW;
      const x2 = renderX + (keyboardXEnd / 100) * renderW;

      // Draw shaded 4% vertical capture strip above scanline
      ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
      ctx.fillRect(x1, Math.max(renderY, y - stripH), x2 - x1, stripH);

      // Draw keyboard bounds
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(x1, renderY);
      ctx.lineTo(x1, renderY + renderH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x2, renderY);
      ctx.lineTo(x2, renderY + renderH);
      ctx.stroke();

      let currentLayout = detectedLayout;
      if (!currentLayout && video.videoWidth > 0 && video.readyState >= 2) {
        try {
          const off = document.createElement('canvas');
          off.width = 640;
          off.height = 360;
          const offCtx = off.getContext('2d', { willReadFrequently: true });
          if (offCtx) {
            const found = detectKeyboardLayoutInFrame(offCtx, video, 640, 360, 0.45);
            if (found) {
              currentLayout = found;
              setDetectedLayout(found);
            }
          }
        } catch {
          // ignore
        }
      }

      // Draw subtle piano key markers along the scanline
      if (currentLayout) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        for (const k of currentLayout.keys) {
          const kx = renderX + k.centerRatio * renderW;
          const h = k.isBlack ? 11 : 7;
          ctx.fillRect(kx - 0.5, y - h / 2, 1, h);
        }
      } else {
        const totalWhiteKeys = 52;
        const kw = (x2 - x1) / totalWhiteKeys;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
        for (let k = 0; k <= totalWhiteKeys; k++) {
          const kx = x1 + k * kw;
          ctx.fillRect(kx - 0.5, y - 4, 1, 8);
        }
      }

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
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`FAIXA DE LEITURA (${scanlineY}%)`, x1 + 8, Math.max(12, y - stripH - 4));

      // Real-time Bar Detection Preview on current frame
      let rCount = 0;
      let lCount = 0;
      const workW = 640;
      const workH = 360;
      const vKbWidth = Math.max(
        10,
        Math.round(workW * (keyboardXEnd / 100)) - Math.round(workW * (keyboardXStart / 100))
      );

      let segments: (DetectedBarSegment | KeyHit)[] = [];
      if (overrideSegments) {
        segments = overrideSegments;
      } else if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        try {
          const offCanvas = document.createElement('canvas');
          offCanvas.width = workW;
          offCanvas.height = workH;
          const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
          if (offCtx) {
            segments = detectKeyHitsFromVideoContext(offCtx, video, workW, workH, {
              scanlineYRatio: scanlineY / 100,
              keyboardXStartRatio: keyboardXStart / 100,
              keyboardXEndRatio: keyboardXEnd / 100,
              minPitch: 21,
              maxPitch: 108,
              minSaturation,
              brightnessThreshold,
              colorMode,
              hand1Color: hexToRgb(hand1ColorHex),
              hand2Color: hexToRgb(hand2ColorHex),
              splitPitch,
              layout: currentLayout,
            });
          }
        } catch {
          // ignore offscreen extraction errors on unloaded video
        }
      }

      for (const seg of segments) {
        let canvasX: number;
        if ('centerRatio' in seg && typeof seg.centerRatio === 'number') {
          canvasX = renderX + seg.centerRatio * renderW;
        } else {
          const rawSeg = seg as DetectedBarSegment;
          canvasX = x1 + (rawSeg.centerX / Math.max(1, overrideSegments ? 960 * ((keyboardXEnd - keyboardXStart) / 100) : vKbWidth)) * (x2 - x1);
        }
        const isRight = seg.hand === 'right';
        if (isRight) rCount++;
        else lCount++;

        // Glowing indicator circle in user-configured hand color
        ctx.fillStyle = isRight ? hand1ColorHex : hand2ColorHex;
        ctx.beginPath();
        ctx.arc(canvasX, y - stripH / 2, 6.5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Note Name badge (shifted by octaveShift if applicable)
        const displayPitch = seg.pitch + octaveShift * 12;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pitchToNoteName(displayPitch, 'sharp'), canvasX, Math.max(12, y - stripH - 4));
      }

      setLiveBars({ right: rCount, left: lCount });
    },
    [
      isVideo,
      fileUrl,
      scanlineY,
      keyboardXStart,
      keyboardXEnd,
      minSaturation,
      brightnessThreshold,
      colorMode,
      hand1ColorHex,
      hand2ColorHex,
      splitPitch,
      octaveShift,
    ]
  );

  useEffect(() => {
    renderOverlay();
  }, [renderOverlay, videoCurrentTime]);

  // Timeline Trimmer Pointer interactions (Dual handles & scrubber)
  const handleTimelinePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    handleType: 'start' | 'end' | 'scrub'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingHandle(handleType);

    const track = timelineTrackRef.current;
    if (!track) return;

    const dur = videoDuration > 0 ? videoDuration : 1;

    const onPointerMove = (ev: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const clientX = Math.max(rect.left, Math.min(rect.right, ev.clientX));
      const ratio = (clientX - rect.left) / rect.width;
      const time = Math.max(0, Math.min(dur, ratio * dur));

      if (handleType === 'start') {
        const safeStart = Math.min(time, Math.max(0, (cropEndTime || dur) - 0.5));
        setCropStartTime(safeStart);
        if (videoRef.current) {
          videoRef.current.currentTime = safeStart;
        }
      } else if (handleType === 'end') {
        const safeEnd = Math.max(time, cropStartTime + 0.5);
        setCropEndTime(safeEnd);
        if (videoRef.current) {
          videoRef.current.currentTime = safeEnd;
        }
      } else if (handleType === 'scrub') {
        if (videoRef.current) {
          videoRef.current.currentTime = time;
        }
      }
    };

    const onPointerUp = () => {
      setIsDraggingHandle(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingHandle) return;
    const track = timelineTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = ratio * (videoDuration > 0 ? videoDuration : 1);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  // Execute Transcription
  const handleStartTranscription = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setProgress(0);
    setErrorMessage(null);
    setTranscriptionResult(null);
    setStatusMessage('Iniciando processamento...');

    try {
      const effEndTime = cropEndTime > cropStartTime ? cropEndTime : undefined;

      // MODE 1: SOMENTE VÍDEO (VISÃO COMPUTACIONAL DIRETA)
      if (transcriptionMode === 'video-only') {
        if (!videoRef.current) throw new Error('Vídeo não carregado.');

        // Estimate BPM if audio is present and autoApplyBpm is on
        let effectiveBpm = currentBpm;
        if (autoApplyBpm) {
          try {
            const audioBuffer = await extractAudioBufferFromFile(selectedFile);
            effectiveBpm = estimateBpmFromAudioBuffer(audioBuffer, cropStartTime, effEndTime);
          } catch {
            effectiveBpm = currentBpm;
          }
        }

        setStatusMessage('Lendo barras coloridas do teclado no vídeo...');
        const videoScanResult = await scanVideoFrames(videoRef.current, {
          scanlineYRatio: scanlineY / 100,
          keyboardXStartRatio: keyboardXStart / 100,
          keyboardXEndRatio: keyboardXEnd / 100,
          brightnessThreshold,
          minSaturation,
          fps: 10,
          startTime: cropStartTime,
          endTime: effEndTime,
          colorMode,
          hand1Color: hexToRgb(hand1ColorHex),
          hand2Color: hexToRgb(hand2ColorHex),
          splitPitch,
          octaveShift,
          keyboardLayout: detectedLayout,
          onFrameDetections: (segments) => {
            renderOverlay(segments);
          },
          onProgress: (p, stage) => {
            setProgress(p);
            setStatusMessage(stage);
          },
        });

        if (videoScanResult.keyboardLayout && !detectedLayout) {
          setDetectedLayout(videoScanResult.keyboardLayout);
        }

        const ticksPerSecond = (effectiveBpm * TICKS_PER_BEAT) / 60;
        const rightHandNotes: Note[] = [];
        const leftHandNotes: Note[] = [];
        const allNotes: Note[] = [];

        for (let i = 0; i < videoScanResult.visualNotes.length; i++) {
          const v = videoScanResult.visualNotes[i];
          const startTick = Math.max(0, Math.round(v.startSec * ticksPerSecond));
          const durationTicks = Math.max(60, Math.round((v.endSec - v.startSec) * ticksPerSecond));
          const note: Note = {
            id: newId('note'),
            trackId: '',
            pitch: v.pitch,
            startTick,
            durationTicks,
            velocity: 90,
          };
          allNotes.push(note);
          if (v.hand === 'right') {
            rightHandNotes.push(note);
          } else {
            leftHandNotes.push(note);
          }
        }

        rightHandNotes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
        leftHandNotes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
        allNotes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);

        setTranscriptionResult({
          rightHandNotes,
          leftHandNotes,
          allNotes,
          detectedBpm: effectiveBpm,
          durationSec: (effEndTime || videoDuration) - cropStartTime,
          matchedVisualCount: allNotes.length,
          mode: 'video-only',
        });
      }
      // MODE 2: SOMENTE ÁUDIO
      else if (transcriptionMode === 'audio-only') {
        setStatusMessage('Extraindo e decodificando áudio via Web Audio API...');
        const audioBuffer = await extractAudioBufferFromFile(selectedFile);

        setStatusMessage('Detectando notas musicais e dinâmicas pelo áudio...');
        const audioResult: AudioTranscriptionResult = await transcribeAudioBufferToNotes(audioBuffer, {
          bpm: autoApplyBpm ? undefined : currentBpm,
          sensitivity,
          startTime: cropStartTime,
          endTime: effEndTime,
          onProgress: (p, stage) => {
            setProgress(p);
            setStatusMessage(stage);
          },
        });

        const effectiveBpm = audioResult.detectedBpm || currentBpm;
        const rightNotes: Note[] = [];
        const leftNotes: Note[] = [];
        for (const n of audioResult.notes) {
          if (n.pitch >= splitPitch) {
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
          matchedVisualCount: 0,
          mode: 'audio-only',
        });
      }
      // MODE 3: HÍBRIDO (ÁUDIO + VÍDEO)
      else {
        setStatusMessage('Extraindo e decodificando áudio via Web Audio API...');
        const audioBuffer = await extractAudioBufferFromFile(selectedFile);

        setStatusMessage('Detectando notas musicais e dinâmicas pelo áudio...');
        const audioResult: AudioTranscriptionResult = await transcribeAudioBufferToNotes(audioBuffer, {
          bpm: autoApplyBpm ? undefined : currentBpm,
          sensitivity,
          startTime: cropStartTime,
          endTime: effEndTime,
          onProgress: (p, stage) => {
            setProgress(p * 0.45);
            setStatusMessage(stage);
          },
        });

        const effectiveBpm = audioResult.detectedBpm || currentBpm;

        if (isVideo && videoRef.current) {
          setStatusMessage('Lendo barras coloridas do teclado no vídeo...');
          const videoScanResult = await scanVideoFrames(videoRef.current, {
            scanlineYRatio: scanlineY / 100,
            keyboardXStartRatio: keyboardXStart / 100,
            keyboardXEndRatio: keyboardXEnd / 100,
            brightnessThreshold,
            minSaturation,
            fps: 10,
            startTime: cropStartTime,
            endTime: effEndTime,
            colorMode,
            hand1Color: hexToRgb(hand1ColorHex),
            hand2Color: hexToRgb(hand2ColorHex),
            splitPitch,
            octaveShift,
            keyboardLayout: detectedLayout,
            onFrameDetections: (segments) => {
              renderOverlay(segments);
            },
            onProgress: (p, stage) => {
              setProgress(0.45 + p * 0.45);
              setStatusMessage(stage);
            },
          });

          if (videoScanResult.keyboardLayout && !detectedLayout) {
            setDetectedLayout(videoScanResult.keyboardLayout);
          }

          setStatusMessage('Cruzando notas do áudio com visão computacional...');
          const fused = fuseAudioAndVisionNotes(
            audioResult.notes,
            videoScanResult.visualNotes,
            effectiveBpm,
            TICKS_PER_BEAT,
            splitPitch,
            {
              // Bars read against the detected keyboard are exact: audio only adds velocities then
              backbone: videoScanResult.method === 'tape' && videoScanResult.visualNotes.length > 0 ? 'video' : 'auto',
              autoAlign: true,
            }
          );

          setTranscriptionResult({
            rightHandNotes: fused.rightHandNotes,
            leftHandNotes: fused.leftHandNotes,
            allNotes: fused.allNotes,
            detectedBpm: effectiveBpm,
            durationSec: audioResult.durationSeconds,
            matchedVisualCount: fused.matchedVisualCount,
            mode: 'hybrid',
          });
        } else {
          const rightNotes: Note[] = [];
          const leftNotes: Note[] = [];
          for (const n of audioResult.notes) {
            if (n.pitch >= splitPitch) {
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
            matchedVisualCount: 0,
            mode: 'audio-only',
          });
        }
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
      const rightTrackId = newId('track');
      const leftTrackId = newId('track');

      const rightNotes = transcriptionResult.rightHandNotes.map((n) => ({
        ...n,
        id: newId('note'),
        trackId: rightTrackId,
      }));

      const leftNotes = transcriptionResult.leftHandNotes.map((n) => ({
        ...n,
        id: newId('note'),
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
      const trackId = destinationMode === 'existing' ? targetTrackId : newId('track');
      const notes = transcriptionResult.allNotes.map((n) => ({
        ...n,
        id: newId('note'),
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

  const totalDur = videoDuration > 0 ? videoDuration : 100;
  const effectiveEnd = cropEndTime > 0 ? Math.min(totalDur, cropEndTime) : totalDur;
  const startPct = Math.max(0, Math.min(100, (cropStartTime / totalDur) * 100));
  const endPct = Math.max(0, Math.min(100, (effectiveEnd / totalDur) * 100));
  const playheadPct = Math.max(0, Math.min(100, (videoCurrentTime / totalDur) * 100));

  return (
    <div className="modal-overlay animate-in fade-in duration-150">
      <div className="modal-panel w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-stone-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2d2722] flex items-center justify-between bg-[#141210]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="modal-title">
                  Transcritor de Vídeo & Áudio (Cascata / Synthesia)
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  HÍBRIDO IA
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Converte vídeos Synthesia e gravações para MIDI com corte de intro/outro, paleta de cores e separação de mãos.
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
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
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
              <div className="flex flex-col items-center justify-center gap-1.5">
                <div className="p-2.5 rounded-full bg-stone-800/80 border border-[#2d2722] text-amber-400">
                  {isVideo ? <Video className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </div>
                {selectedFile ? (
                  <div>
                    <span className="text-sm font-semibold text-amber-300">{selectedFile.name}</span>
                    <p className="text-[11px] text-stone-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB •{' '}
                      {isVideo ? 'Vídeo Synthesia detectado' : 'Áudio detectado'} •{' '}
                      Duração: {formatTimecode(videoDuration)}
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

          {/* Interactive Video Preview with Calibration Scanline & Eyedropper */}
          {isVideo && fileUrl && (
            <div className="bg-stone-900/60 border border-[#2d2722] rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />
                  Calibração da Visão Computacional (Cascata Synthesia)
                </span>
                <span className="text-[11px] text-stone-400">
                  {eyedropperTarget ? 'Clique no vídeo para capturar a cor!' : 'Ajuste a linha amarela acima das teclas'}
                </span>
              </div>

              {/* Eyedropper Active Banner */}
              {eyedropperTarget && (
                <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 flex items-center justify-between animate-pulse">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Pipette className="w-4 h-4" />
                    Modo Pipeta Ativo: Clique em cima de uma barra no vídeo para capturar a cor da{' '}
                    {eyedropperTarget === 'hand1' ? 'Mão Direita' : 'Mão Esquerda'}.
                  </span>
                  <button
                    onClick={() => {
                      setEyedropperTarget(null);
                      setHoveredColor(null);
                    }}
                    className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-[10px] font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Video with Canvas Overlay */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-stone-800 flex items-center justify-center select-none">
                <video
                  ref={videoRef}
                  src={fileUrl}
                  className="w-full h-full object-contain"
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      const cur = videoRef.current.currentTime;
                      if (!isProcessing) {
                        setVideoCurrentTime(cur);
                      }
                      if (!isProcessing && cropEndTime > cropStartTime && cur >= cropEndTime && isVideoPlaying) {
                        videoRef.current.pause();
                        setIsVideoPlaying(false);
                        videoRef.current.currentTime = cropStartTime;
                      }
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      const dur = videoRef.current.duration;
                      setVideoDuration(dur);
                      setCropStartTime(0);
                      setCropEndTime(dur);
                    }
                  }}
                  onLoadedData={() => renderOverlay()}
                  onSeeked={() => {
                    if (!isProcessing) renderOverlay();
                  }}
                  onPause={() => {
                    if (!isProcessing) renderOverlay();
                  }}
                  playsInline
                />
                <canvas
                  ref={canvasOverlayRef}
                  className={`absolute inset-0 w-full h-full ${
                    eyedropperTarget ? 'cursor-crosshair' : 'pointer-events-none'
                  }`}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerDown={handleCanvasPointerDown}
                />

                {/* Eyedropper Hover Loupe Swatch */}
                {eyedropperTarget && hoveredColor && (
                  <div
                    className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 flex items-center gap-1.5 px-2 py-1 rounded bg-black/90 border border-white/40 shadow-xl text-[10px] text-white z-40"
                    style={{ left: hoveredColor.x, top: hoveredColor.y }}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white"
                      style={{ backgroundColor: rgbToHex(hoveredColor.r, hoveredColor.g, hoveredColor.b) }}
                    />
                    <span className="font-mono font-bold">
                      {rgbToHex(hoveredColor.r, hoveredColor.g, hoveredColor.b).toUpperCase()}
                    </span>
                  </div>
                )}

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
                  className="absolute bottom-3 left-3 p-2 rounded-lg bg-black/70 hover:bg-black/90 text-amber-400 border border-stone-700 transition-colors shadow-lg z-30"
                  title={isVideoPlaying ? 'Pausar vídeo' : 'Tocar vídeo'}
                >
                  {isVideoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
              </div>

              {/* Real-time Detection Status */}
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-stone-800/80 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-stone-400">Detecção no Frame Atual:</span>
                  <span
                    className="px-2 py-0.5 rounded font-semibold flex items-center gap-1.5 border"
                    style={{
                      backgroundColor: `${hand1ColorHex}20`,
                      borderColor: `${hand1ColorHex}50`,
                      color: hand1ColorHex,
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hand1ColorHex }} />
                    Mão Direita: {liveBars.right}
                  </span>
                  {colorMode === 'two-colors' && (
                    <span
                      className="px-2 py-0.5 rounded font-semibold flex items-center gap-1.5 border"
                      style={{
                        backgroundColor: `${hand2ColorHex}20`,
                        borderColor: `${hand2ColorHex}50`,
                        color: hand2ColorHex,
                      }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hand2ColorHex }} />
                      Mão Esquerda: {liveBars.left}
                    </span>
                  )}
                </div>
                <span className="text-stone-500 text-[10px]">
                  Filtro Ativo: Faíscas, chamas e teclas brancas ignoradas
                </span>
              </div>

              {/* Calibration Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                    <span>Altura da Linha (Y)</span>
                    <span className="font-mono text-amber-300 font-bold">{scanlineY}%</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={90}
                    value={scanlineY}
                    onChange={(e) => setScanlineY(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                    <span>Início Teclado (X)</span>
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
                    <span>Fim Teclado (X)</span>
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

                <div>
                  <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                    <span>Ajuste de Oitava</span>
                    <span className={`font-mono font-bold ${octaveShift === 0 ? 'text-stone-300' : 'text-amber-400'}`}>
                      {octaveShift > 0 ? `+${octaveShift}` : octaveShift} {octaveShift === 0 ? '(Padrão)' : '8va'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[-2, -1, 0, 1, 2].map((shift) => (
                      <button
                        key={shift}
                        type="button"
                        onClick={() => setOctaveShift(shift)}
                        className={`flex-1 py-1 text-xs font-mono rounded border transition-colors ${
                          octaveShift === shift
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                            : 'bg-stone-800/60 text-stone-400 border-stone-700/50 hover:bg-stone-700/50 hover:text-stone-200'
                        }`}
                        title={shift === 0 ? 'Oitava original' : `${shift > 0 ? '+' : ''}${shift} oitava(s)`}
                      >
                        {shift > 0 ? `+${shift}` : shift}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Visual Timeline Trimmer (Intro & Outro Trimmer) */}
          {fileUrl && (
            <div className="bg-stone-900/60 border border-[#2d2722] rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <Scissors className="w-4 h-4" />
                  Corte Visual de Intro & Outro (Seleção de Trecho)
                </span>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-stone-400">Duração do Trecho:</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
                    {formatTimecode(Math.max(0, effectiveEnd - cropStartTime))}
                  </span>
                  <span className="text-stone-500">de {formatTimecode(videoDuration)}</span>
                </div>
              </div>

              {/* Dual-handle Timeline Bar */}
              <div
                ref={timelineTrackRef}
                onClick={handleTimelineClick}
                className="relative h-11 bg-stone-950 rounded-lg overflow-hidden border border-stone-800 select-none cursor-pointer"
              >
                {/* Intro Darkened Area */}
                <div
                  className="absolute top-0 bottom-0 left-0 bg-stone-950/80 border-r border-amber-500/40 z-10 flex items-center justify-end pr-1.5"
                  style={{ width: `${startPct}%` }}
                >
                  {startPct > 10 && (
                    <span className="text-[9px] font-bold text-stone-500 select-none truncate">
                      INTRO CORTADA
                    </span>
                  )}
                </div>

                {/* Active Selected Region */}
                <div
                  className="absolute top-0 bottom-0 bg-amber-500/20 border-y-2 border-amber-500/80 z-0 transition-colors"
                  style={{
                    left: `${startPct}%`,
                    width: `${Math.max(0, endPct - startPct)}%`,
                  }}
                />

                {/* Outro Darkened Area */}
                <div
                  className="absolute top-0 bottom-0 right-0 bg-stone-950/80 border-l border-amber-500/40 z-10 flex items-center pl-1.5"
                  style={{ width: `${Math.max(0, 100 - endPct)}%` }}
                >
                  {100 - endPct > 10 && (
                    <span className="text-[9px] font-bold text-stone-500 select-none truncate">
                      OUTRO CORTADA
                    </span>
                  )}
                </div>

                {/* Playhead Red Needle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-20 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                  style={{ left: `${playheadPct}%` }}
                >
                  <div className="w-2 h-2 bg-red-500 rounded-full -ml-[3px] -mt-0.5" />
                </div>

                {/* Draggable Handle: START (In-Point) */}
                <div
                  onPointerDown={(e) => handleTimelinePointerDown(e, 'start')}
                  className="absolute top-0 bottom-0 -ml-2.5 w-5 z-30 cursor-ew-resize flex items-center justify-center group"
                  style={{ left: `${startPct}%` }}
                  title={`Início: ${formatTimecode(cropStartTime)}`}
                >
                  <div className="w-2 h-7 rounded bg-amber-400 border border-amber-200 shadow-md group-hover:scale-125 transition-transform" />
                </div>

                {/* Draggable Handle: END (Out-Point) */}
                <div
                  onPointerDown={(e) => handleTimelinePointerDown(e, 'end')}
                  className="absolute top-0 bottom-0 -ml-2.5 w-5 z-30 cursor-ew-resize flex items-center justify-center group"
                  style={{ left: `${endPct}%` }}
                  title={`Fim: ${formatTimecode(effectiveEnd)}`}
                >
                  <div className="w-2 h-7 rounded bg-amber-400 border border-amber-200 shadow-md group-hover:scale-125 transition-transform" />
                </div>
              </div>

              {/* Timeline Quick Control Buttons & Precise Values */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1 text-[11px]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const cur = videoCurrentTime;
                      setCropStartTime(Math.min(cur, Math.max(0, effectiveEnd - 0.5)));
                    }}
                    className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-semibold flex items-center gap-1 transition-colors"
                  >
                    <span>[ ⏵|</span> Marcar Início Aqui
                  </button>

                  <button
                    onClick={() => {
                      const cur = videoCurrentTime;
                      setCropEndTime(Math.max(cur, cropStartTime + 0.5));
                    }}
                    className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-semibold flex items-center gap-1 transition-colors"
                  >
                    <span>|⏵ ]</span> Marcar Fim Aqui
                  </button>

                  <button
                    onClick={() => {
                      setCropStartTime(0);
                      setCropEndTime(videoDuration);
                    }}
                    className="px-2 py-1 rounded text-stone-400 hover:text-stone-200 hover:bg-stone-800 flex items-center gap-1 transition-colors"
                    title="Redefinir para o vídeo completo"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Resetar
                  </button>
                </div>

                <div className="flex items-center gap-3 font-mono">
                  <div className="flex items-center gap-1">
                    <span className="text-stone-400">Início:</span>
                    <span className="font-bold text-amber-300">{formatTimecode(cropStartTime)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-stone-400">Fim:</span>
                    <span className="font-bold text-amber-300">{formatTimecode(effectiveEnd)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Color Picker & Hand Separation Section */}
          {isVideo && transcriptionMode !== 'audio-only' && (
            <div className="bg-stone-900/60 border border-[#2d2722] rounded-xl p-3.5 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <Palette className="w-4 h-4" />
                  Cores das Barras & Separação de Mãos
                </span>
                <span className="text-[11px] text-stone-400">
                  Configure as cores do vídeo para separar mão direita e esquerda com precisão
                </span>
              </div>

              {/* Mode Toggle: 2 Colors vs Single Color */}
              <div className="flex items-center gap-4 bg-stone-950/60 p-2 rounded-lg border border-stone-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="colorMode"
                    value="two-colors"
                    checked={colorMode === 'two-colors'}
                    onChange={() => setColorMode('two-colors')}
                    className="accent-amber-500"
                  />
                  <span className="font-medium text-stone-200">2 Cores Diferentes (Mão Direita e Esquerda)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="colorMode"
                    value="single-color"
                    checked={colorMode === 'single-color'}
                    onChange={() => setColorMode('single-color')}
                    className="accent-amber-500"
                  />
                  <span className="font-medium text-stone-200">Cor Única (Vídeo Monocromático)</span>
                </label>
              </div>

              {/* Hand 1 Color (Right Hand or Single Color) */}
              <div className="space-y-2 p-3 rounded-lg bg-stone-950/40 border border-stone-800/80">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/60 shadow"
                      style={{ backgroundColor: hand1ColorHex }}
                    />
                    <span className="font-semibold text-stone-200">
                      {colorMode === 'two-colors'
                        ? 'Cor da Mão Direita (Melodia / Agudos)'
                        : 'Cor de Todas as Barras do Vídeo'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={hand1ColorHex}
                      onChange={(e) => setHand1ColorHex(e.target.value)}
                      className="w-7 h-7 rounded border border-stone-700 bg-transparent cursor-pointer"
                      title="Selecionar cor"
                    />
                    <span className="font-mono text-stone-300 font-bold text-[11px] uppercase">
                      {hand1ColorHex}
                    </span>
                    <button
                      onClick={() => triggerNativeEyedropper('hand1')}
                      className={`px-2 py-1 rounded border text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                        eyedropperTarget === 'hand1'
                          ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold'
                          : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700'
                      }`}
                      title="Clique para ativar a pipeta e clicar na barra no vídeo"
                    >
                      <Pipette className="w-3.5 h-3.5" />
                      Pipeta no Vídeo
                    </button>
                  </div>
                </div>

                {/* Preset Chips */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-stone-400 mr-1">Paleta Rápida:</span>
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() => setHand1ColorHex(preset.hex)}
                      className={`w-5 h-5 rounded-full border transition-transform hover:scale-125 ${
                        hand1ColorHex.toLowerCase() === preset.hex.toLowerCase()
                          ? 'border-white scale-110 shadow-lg'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: preset.hex }}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>

              {/* Hand 2 Color (Left Hand - only in two-colors mode) */}
              {colorMode === 'two-colors' ? (
                <div className="space-y-2 p-3 rounded-lg bg-stone-950/40 border border-stone-800/80">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/60 shadow"
                        style={{ backgroundColor: hand2ColorHex }}
                      />
                      <span className="font-semibold text-stone-200">
                        Cor da Mão Esquerda (Baixo / Harmonia)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={hand2ColorHex}
                        onChange={(e) => setHand2ColorHex(e.target.value)}
                        className="w-7 h-7 rounded border border-stone-700 bg-transparent cursor-pointer"
                        title="Selecionar cor"
                      />
                      <span className="font-mono text-stone-300 font-bold text-[11px] uppercase">
                        {hand2ColorHex}
                      </span>
                      <button
                        onClick={() => triggerNativeEyedropper('hand2')}
                        className={`px-2 py-1 rounded border text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                          eyedropperTarget === 'hand2'
                            ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700'
                        }`}
                        title="Clique para ativar a pipeta e clicar na barra no vídeo"
                      >
                        <Pipette className="w-3.5 h-3.5" />
                        Pipeta no Vídeo
                      </button>
                    </div>
                  </div>

                  {/* Preset Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-stone-400 mr-1">Paleta Rápida:</span>
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        onClick={() => setHand2ColorHex(preset.hex)}
                        className={`w-5 h-5 rounded-full border transition-transform hover:scale-125 ${
                          hand2ColorHex.toLowerCase() === preset.hex.toLowerCase()
                            ? 'border-white scale-110 shadow-lg'
                            : 'border-transparent'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                        title={preset.name}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* Split pitch selector when monochromatic */
                <div className="p-3 rounded-lg bg-stone-950/40 border border-stone-800/80 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <span className="font-semibold text-stone-200 block">Ponto de Divisão das Mãos</span>
                    <p className="text-[11px] text-stone-400">
                      Como todas as notas têm a mesma cor, a divisão será feita pela altura da nota no piano.
                    </p>
                  </div>
                  <select
                    value={splitPitch}
                    onChange={(e) => setSplitPitch(Number(e.target.value))}
                    className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-stone-200 font-mono focus:outline-none focus:border-amber-500"
                  >
                    <option value={48}>Dó 3 (Pitch 48 / Grave)</option>
                    <option value={60}>Dó Central C4 (Pitch 60 / Padrão)</option>
                    <option value={72}>Dó 5 (Pitch 72 / Agudo)</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mode & Split Hands */}
            <div className="bg-stone-900/50 border border-[#2d2722] rounded-xl p-3.5 space-y-3">
              <span className="font-semibold text-stone-300 block">Modo de Conversão</span>
              <div className="space-y-2.5">
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
                      Híbrido (Áudio + Vídeo)
                    </span>
                    <p className="text-[11px] text-stone-400">
                      Combina o ritmo e dinâmicas do áudio com a separação precisa de mãos pelas cores das barras do vídeo.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="transcriptionMode"
                    value="video-only"
                    checked={transcriptionMode === 'video-only'}
                    onChange={() => setTranscriptionMode('video-only')}
                    disabled={!isVideo}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <span className="font-medium text-stone-200 flex items-center gap-1.5">
                      Apenas Vídeo (Visão Computacional)
                      <span className="px-1 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        DIRETO DO TECLADO
                      </span>
                    </span>
                    <p className="text-[11px] text-stone-400">
                      Lê 100% das notas diretamente das barras caindo no teclado do vídeo. Ideal para validar calibração e cores.
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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Transcrição Concluída com Sucesso!
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {transcriptionResult.mode === 'video-only'
                      ? 'SOMENTE VÍDEO'
                      : transcriptionResult.mode === 'audio-only'
                      ? 'SOMENTE ÁUDIO'
                      : 'HÍBRIDO (ÁUDIO + VÍDEO)'}
                  </span>
                </div>
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
                  <span className="text-[10px] text-stone-400 block font-sans">
                    {transcriptionResult.mode === 'video-only'
                      ? 'Lidas do Vídeo'
                      : transcriptionResult.mode === 'hybrid'
                      ? 'Sincronizadas Vídeo'
                      : 'Modo Áudio'}
                  </span>
                  <span className="text-sm font-bold text-amber-400">
                    {transcriptionResult.mode === 'video-only'
                      ? transcriptionResult.allNotes.length
                      : transcriptionResult.mode === 'hybrid'
                      ? transcriptionResult.matchedVisualCount
                      : 'Por Registro'}
                  </span>
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
