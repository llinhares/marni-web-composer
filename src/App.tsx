/**
 * Marni Web Composer - Optimized DAW & BDO Music Studio
 * Developed based on Marni Web Composer v2 by Lucas Linhares (Tchepper)
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import type {
  Track,
  Note,
  ToolMode,
  GridSnap,
  TimeSignature,
  EffectorSettings,
  SongMetadata,
  InstrumentId,
} from './types/music.ts';
import { BDO_INSTRUMENTS, BDO_GRADE_LIMITS } from './types/music.ts';
import { AudioEngine } from './audio/AudioEngine.ts';
import { WebMidiManager } from './midi/webMidi.ts';
import { createStandardMidiFile, triggerFileDownload } from './midi/midiEncoder.ts';
import { parseStandardMidiFile } from './midi/midiDecoder.ts';
import { exportWavFile } from './export/audioExporter.ts';
import { isBlackKey } from './utils/musicMath.ts';
import { isMusicXmlContent, parseMusicXml } from './musicxml/musicXmlDecoder.ts';
import { isBdoBinaryContent, parseBdoBinaryFile } from './bdo/bdoDecoder.ts';
import { mergeImportedTracks, type ImportMode } from './utils/trackImport.ts';
import { detectBdoInstrument } from './utils/instrumentDetection.ts';
import { Header } from './components/Header.tsx';
import { TrackList } from './components/TrackList.tsx';
import { PianoRoll } from './components/PianoRoll.tsx';
import { BottomBar } from './components/BottomBar.tsx';
import { EffectorModal } from './components/EffectorModal.tsx';
import { AddInstrumentModal } from './components/AddInstrumentModal.tsx';
import { BdoExportModal } from './components/BdoExportModal.tsx';
import { MidiSettingsModal } from './components/MidiSettingsModal.tsx';
import { AiSheetScannerModal } from './components/AiSheetScannerModal.tsx';

// Initial demo score inspired by Balenos Theme in Black Desert Online
const INITIAL_TRACKS: Track[] = [
  {
    id: 'track-piano',
    name: 'Grand Piano',
    instrumentId: 'grand-piano',
    color: '#d4a373',
    volume: 75,
    pan: 0,
    isMuted: false,
    isSolo: false,
    auxSend: true,
    sustainPedal: true,
    notes: [
      // Measure 1 - Beautiful opening theme
      { id: 'n1', trackId: 'track-piano', pitch: 72, startTick: 0, durationTicks: 480, velocity: 95 }, // C5
      { id: 'n2', trackId: 'track-piano', pitch: 76, startTick: 480, durationTicks: 480, velocity: 90 }, // E5
      { id: 'n3', trackId: 'track-piano', pitch: 79, startTick: 960, durationTicks: 480, velocity: 92 }, // G5
      { id: 'n4', trackId: 'track-piano', pitch: 84, startTick: 1440, durationTicks: 480, velocity: 100 }, // C6
      // Measure 2
      { id: 'n5', trackId: 'track-piano', pitch: 83, startTick: 1920, durationTicks: 480, velocity: 90 }, // B5
      { id: 'n6', trackId: 'track-piano', pitch: 79, startTick: 2400, durationTicks: 480, velocity: 88 }, // G5
      { id: 'n7', trackId: 'track-piano', pitch: 81, startTick: 2880, durationTicks: 960, velocity: 95 }, // A5
      // Measure 3
      { id: 'n8', trackId: 'track-piano', pitch: 88, startTick: 3840, durationTicks: 480, velocity: 100 }, // E6
      { id: 'n9', trackId: 'track-piano', pitch: 86, startTick: 4320, durationTicks: 480, velocity: 95 }, // D6
      { id: 'n10', trackId: 'track-piano', pitch: 84, startTick: 4800, durationTicks: 960, velocity: 98 }, // C6
    ],
  },
  {
    id: 'track-violin',
    name: 'Violino',
    instrumentId: 'violin',
    color: '#e07a5f',
    volume: 70,
    pan: -0.2,
    isMuted: false,
    isSolo: false,
    auxSend: true,
    notes: [
      // Measure 1 - 2 sustained string harmony
      { id: 'nv1', trackId: 'track-violin', pitch: 60, startTick: 0, durationTicks: 1920, velocity: 80 }, // C4
      { id: 'nv2', trackId: 'track-violin', pitch: 64, startTick: 0, durationTicks: 1920, velocity: 75 }, // E4
      // Measure 2
      { id: 'nv3', trackId: 'track-violin', pitch: 57, startTick: 1920, durationTicks: 1920, velocity: 82 }, // A3
      { id: 'nv4', trackId: 'track-violin', pitch: 60, startTick: 1920, durationTicks: 1920, velocity: 78 }, // C4
      // Measure 3
      { id: 'nv5', trackId: 'track-violin', pitch: 55, startTick: 3840, durationTicks: 1920, velocity: 85 }, // G3
      { id: 'nv6', trackId: 'track-violin', pitch: 59, startTick: 3840, durationTicks: 1920, velocity: 80 }, // B3
    ],
  },
];

export default function App() {
  // Audio Engine & MIDI singletons
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const midiManagerRef = useRef<WebMidiManager | null>(null);

  // Core DAW State
  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [activeTrackId, setActiveTrackId] = useState<string>('track-piano');
  const [title, setTitle] = useState<string>('Marni Web Composer - Example');
  const [author, setAuthor] = useState<string>(() => {
    return localStorage.getItem('marni_bdo_author') || 'Tchepper';
  });
  const [bdoOwnerId, setBdoOwnerId] = useState<number>(() => {
    const saved = localStorage.getItem('marni_bdo_owner_id');
    return saved ? parseInt(saved, 10) : 1009649;
  });
  const [isBdoProtected, setIsBdoProtected] = useState<boolean>(false);
  const [originalBdoAuthor, setOriginalBdoAuthor] = useState<string>('');
  const [originalBdoComposer, setOriginalBdoComposer] = useState<string>('');
  const [originalBdoArranger, setOriginalBdoArranger] = useState<string>('');
  const [originalBdoOwnerId, setOriginalBdoOwnerId] = useState<number | null>(null);

  const handleAuthorChange = useCallback((newAuthor: string) => {
    if (isBdoProtected) return;
    setAuthor(newAuthor);
    localStorage.setItem('marni_bdo_author', newAuthor);
  }, [isBdoProtected]);

  const [bpm, setBpm] = useState<number>(120);
  const [timeSignature, setTimeSignature] = useState<TimeSignature>('4/4');
  const [gridSnap, setGridSnap] = useState<GridSnap>('1/4');
  const [toolMode, setToolMode] = useState<ToolMode>('pointer');
  const [accidentals, setAccidentals] = useState<'sharp' | 'flat'>('sharp');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [scaleType, setScaleType] = useState<string>('chromatic');
  const [bdoGrade, setBdoGrade] = useState<'F' | 'D' | 'C' | 'B' | 'A' | 'S'>('S');

  // Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentPlayheadTick, setCurrentPlayheadTick] = useState<number>(0);

  // Effector / VST State
  const [effectorSettings, setEffectorSettings] = useState<EffectorSettings>({
    reverb: { enabled: true, time: 65, damp: 40, mix: 45 },
    delay: { enabled: false, feedback: 35, time: 40, mix: 30 },
    chorus: { enabled: false, feedback: 20, lfoDepth: 40, lfoFrequency: 35, mix: 35 },
  });

  // Modal Dialogs
  const [isEffectorOpen, setIsEffectorOpen] = useState(false);
  const [isAddInstrumentOpen, setIsAddInstrumentOpen] = useState(false);
  const [isBdoExportOpen, setIsBdoExportOpen] = useState(false);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState(false);
  const [hasMidiDevices, setHasMidiDevices] = useState(false);
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isAiSheetScannerOpen, setIsAiSheetScannerOpen] = useState(false);

  // Hidden file input for importing MIDI / XML / JSON
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize AudioEngine & MIDI
  useEffect(() => {
    const engine = new AudioEngine();
    audioEngineRef.current = engine;

    const midi = new WebMidiManager();
    midiManagerRef.current = midi;

    if (midi.getSupported()) {
      midi.requestAccess().then((ok) => {
        if (ok) {
          setHasMidiDevices(midi.getDevices().length > 0);
        }
      });

      midi.onNote((event) => {
        if (event.type === 'noteon') {
          // Audition note in active track
          const currentTracks = tracksRef.current;
          const currentActiveId = activeTrackIdRef.current;
          const active = currentTracks.find((t) => t.id === currentActiveId) || currentTracks[0];
          if (active) {
            engine.playNote(active.instrumentId, event.pitch, event.velocity);
          }
        }
      });
    }

    return () => {
      engine.stopPlayback();
    };
  }, []);

  // Sync refs for event listeners
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const activeTrackIdRef = useRef(activeTrackId);
  activeTrackIdRef.current = activeTrackId;

  // Undo / Redo History Stack
  interface HistorySnapshot {
    tracks: Track[];
    activeTrackId: string;
  }

  const [history, setHistory] = useState<HistorySnapshot[]>([
    { tracks: INITIAL_TRACKS, activeTrackId: 'track-piano' },
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const historyRef = useRef(history);
  historyRef.current = history;
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

  const pushHistory = useCallback((newTracks: Track[], newActiveId?: string) => {
    const activeId = newActiveId || activeTrackIdRef.current;
    const currentSnap = historyRef.current[historyIndexRef.current];
    if (
      currentSnap &&
      currentSnap.tracks === newTracks &&
      currentSnap.activeTrackId === activeId
    ) {
      return;
    }

    // Ignore snapshots where only selection flags changed without musical differences
    if (currentSnap && currentSnap.activeTrackId === activeId) {
      const prevT = currentSnap.tracks;
      if (prevT.length === newTracks.length) {
        let isIdentical = true;
        for (let i = 0; i < prevT.length; i++) {
          const tA = prevT[i];
          const tB = newTracks[i];
          if (
            tA.id !== tB.id ||
            tA.instrumentId !== tB.instrumentId ||
            tA.volume !== tB.volume ||
            tA.pan !== tB.pan ||
            tA.isMuted !== tB.isMuted ||
            tA.isSolo !== tB.isSolo ||
            tA.notes.length !== tB.notes.length
          ) {
            isIdentical = false;
            break;
          }
          for (let j = 0; j < tA.notes.length; j++) {
            const nA = tA.notes[j];
            const nB = tB.notes[j];
            if (
              nA.id !== nB.id ||
              nA.pitch !== nB.pitch ||
              nA.startTick !== nB.startTick ||
              nA.durationTicks !== nB.durationTicks ||
              nA.velocity !== nB.velocity
            ) {
              isIdentical = false;
              break;
            }
          }
          if (!isIdentical) break;
        }
        if (isIdentical) return;
      }
    }

    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndexRef.current + 1);
      const updated = [...sliced, { tracks: newTracks, activeTrackId: activeId }];
      if (updated.length > 50) {
        updated.shift();
      }
      return updated;
    });
    setHistoryIndex((prev) => Math.min(49, prev + 1));
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      const newIdx = historyIndexRef.current - 1;
      const snap = historyRef.current[newIdx];
      if (snap) {
        setHistoryIndex(newIdx);
        setTracks(snap.tracks);
        setActiveTrackId(snap.activeTrackId);
      }
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      const newIdx = historyIndexRef.current + 1;
      const snap = historyRef.current[newIdx];
      if (snap) {
        setHistoryIndex(newIdx);
        setTracks(snap.tracks);
        setActiveTrackId(snap.activeTrackId);
      }
    }
  }, []);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Effector update sync
  useEffect(() => {
    audioEngineRef.current?.updateEffectorSettings(effectorSettings);
  }, [effectorSettings]);

  // Compute total notes and limits
  const totalNotes = useMemo(() => {
    return tracks.reduce((acc, tr) => acc + tr.notes.length, 0);
  }, [tracks]);

  const maxTick = useMemo(() => {
    let max = 0;
    tracks.forEach((t) => {
      t.notes.forEach((n) => {
        const end = n.startTick + n.durationTicks;
        if (end > max) max = end;
      });
    });
    return Math.max(max, 480 * 16);
  }, [tracks]);

  const maxNotesAllowed = BDO_GRADE_LIMITS[bdoGrade]?.maxNotes || 10000;

  // Song Metadata object
  const metadata: SongMetadata = useMemo(
    () => ({
      title,
      author,
      bpm,
      timeSignature,
      ticksPerQuarterNote: 480,
      accidentals,
      gridSnap,
      bdoGrade,
      isBdoProtected,
      originalBdoAuthor,
      originalBdoComposer,
      originalBdoArranger,
      originalBdoOwnerId: originalBdoOwnerId ?? undefined,
    }),
    [
      title,
      author,
      bpm,
      timeSignature,
      accidentals,
      gridSnap,
      bdoGrade,
      isBdoProtected,
      originalBdoAuthor,
      originalBdoComposer,
      originalBdoArranger,
      originalBdoOwnerId,
    ]
  );

  // Playback Controls
  const handlePlay = useCallback(() => {
    if (!audioEngineRef.current) return;
    audioEngineRef.current.init().then(() => {
      setIsPlaying(true);
      audioEngineRef.current?.startPlayback(
        tracks,
        bpm,
        currentPlayheadTick,
        (tick) => {
          setCurrentPlayheadTick(tick);
        },
        () => {
          setIsPlaying(false);
          setCurrentPlayheadTick(0);
        }
      );
    });
  }, [tracks, bpm, currentPlayheadTick]);

  const handlePause = useCallback(() => {
    audioEngineRef.current?.pausePlayback();
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    audioEngineRef.current?.stopPlayback();
    setIsPlaying(false);
    setCurrentPlayheadTick(0);
  }, []);

  const handleSeek = useCallback(
    (tick: number) => {
      setCurrentPlayheadTick(tick);
      if (isPlaying && audioEngineRef.current) {
        audioEngineRef.current.startPlayback(
          tracks,
          bpm,
          tick,
          (t) => setCurrentPlayheadTick(t),
          () => {
            setIsPlaying(false);
            setCurrentPlayheadTick(0);
          }
        );
      }
    },
    [isPlaying, tracks, bpm]
  );

  // Audition single pitch
  const handleAuditionPitch = useCallback(
    (pitch: number, velocity: number = 95) => {
      const active = tracks.find((t) => t.id === activeTrackId) || tracks[0];
      if (active && audioEngineRef.current) {
        audioEngineRef.current.init();
        audioEngineRef.current.playNote(
          active.instrumentId,
          pitch,
          velocity,
          0.8,
          active.volume,
          active.auxSend,
          active.pan,
          active.sustainPedal ?? (active.instrumentId === 'grand-piano')
        );
      }
    },
    [tracks, activeTrackId]
  );

  // Track manipulation
  const handleUpdateNotes = useCallback(
    (trackId: string, updatedNotes: Note[], commitHistory: boolean = true) => {
      setTracks((prev) => {
        const updated = prev.map((t) => (t.id === trackId ? { ...t, notes: updatedNotes } : t));
        if (commitHistory) {
          pushHistory(updated, trackId);
        }
        return updated;
      });
    },
    [pushHistory]
  );

  const handleAddTrack = (instrumentId: InstrumentId) => {
    const inst = BDO_INSTRUMENTS.find((i) => i.id === instrumentId);
    const count = tracks.filter((t) => t.instrumentId === instrumentId).length;
    const name = count === 0 ? (inst?.name || 'Instrumento') : `${inst?.name} ${count + 1}`;

    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name,
      instrumentId,
      color: inst?.color || '#d4a373',
      volume: inst?.defaultVolume || 75,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      sustainPedal: instrumentId === 'grand-piano',
      notes: [],
    };

    setTracks((prev) => {
      const updated = [...prev, newTrack];
      pushHistory(updated, newTrack.id);
      return updated;
    });
    setActiveTrackId(newTrack.id);
  };

  const handleDeleteTrack = (trackId: string) => {
    if (tracks.length <= 1) return;
    setTracks((prev) => {
      const filtered = prev.filter((t) => t.id !== trackId);
      const nextActiveId = activeTrackId === trackId ? filtered[0]?.id || '' : activeTrackId;
      if (activeTrackId === trackId) {
        setActiveTrackId(nextActiveId);
      }
      pushHistory(filtered, nextActiveId);
      return filtered;
    });
  };

  const handleDuplicateTrack = (trackId: string) => {
    const source = tracks.find((t) => t.id === trackId);
    if (!source) return;

    const duplicated: Track = {
      ...source,
      id: `track-${Date.now()}`,
      name: `${source.name} (Cópia)`,
      notes: source.notes.map((n) => ({ ...n, id: `note-${Date.now()}-${Math.random()}` })),
    };

    setTracks((prev) => {
      const updated = [...prev, duplicated];
      pushHistory(updated, duplicated.id);
      return updated;
    });
    setActiveTrackId(duplicated.id);
  };

  const handleUpdateTrack = (trackId: string, updates: Partial<Track>) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, ...updates } : t))
    );
  };

  const handleResetAll = () => {
    setIsResetConfirmOpen(true);
  };

  const confirmResetAll = () => {
    handleStop();
    const resetTracks: Track[] = [
      {
        id: 'track-piano',
        name: 'Grand Piano',
        instrumentId: 'grand-piano',
        color: '#d4a373',
        volume: 75,
        pan: 0,
        isMuted: false,
        isSolo: false,
        auxSend: true,
        notes: [],
      },
    ];
    setTracks(resetTracks);
    setActiveTrackId('track-piano');
    setCurrentPlayheadTick(0);
    setTitle('Marni Web Composer - Example');
    setIsBdoProtected(false);
    setOriginalBdoAuthor('');
    setOriginalBdoComposer('');
    setOriginalBdoArranger('');
    setOriginalBdoOwnerId(null);
    setAuthor(localStorage.getItem('marni_bdo_author') || 'Tchepper');
    setIsResetConfirmOpen(false);
    pushHistory(resetTracks, 'track-piano');
  };

  // Export handlers
  const handleSaveMidi = () => {
    const midiBytes = createStandardMidiFile(tracks, bpm, 480);
    const filename = `${(title || 'marni_song').toLowerCase().replace(/\s+/g, '_')}.mid`;
    triggerFileDownload(midiBytes, filename, 'audio/midi');
  };

  const handleExportWav = async (bitDepth: 16 | 24 = 24) => {
    setIsExportingAudio(true);
    try {
      const suffix = bitDepth === 24 ? '_master_24bit.wav' : '_cd_16bit.wav';
      const filename = `${(title || 'marni_composition').toLowerCase().replace(/\s+/g, '_')}${suffix}`;
      await exportWavFile(tracks, bpm, filename, bitDepth);
    } finally {
      setIsExportingAudio(false);
    }
  };

  // Keyboard Shortcuts (Space, V, B, E, and Ctrl+Z / Ctrl+Y for Undo/Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z (without Shift)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Y / Cmd+Y or Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          handlePause();
        } else {
          handlePlay();
        }
      } else if (e.key === 'v' || e.key === 'V') {
        setToolMode('pointer');
      } else if (e.key === 'm' || e.key === 'M') {
        setToolMode('select');
      } else if (e.key === 'b' || e.key === 'B') {
        setToolMode('pencil');
      } else if (e.key === 'e' || e.key === 'E') {
        setToolMode('eraser');
      } else if (e.key === 'h' || e.key === 'H') {
        setToolMode('pan');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, handlePlay, handlePause, handleStop, handleUndo, handleRedo]);

  // Import Mode ('replace' | 'append')
  const importModeRef = useRef<ImportMode>('replace');

  const handleTriggerImport = useCallback((mode: ImportMode) => {
    importModeRef.current = mode;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  const applyImportedData = useCallback(
    (data: {
      importedTracks: Track[];
      bpm?: number;
      title?: string;
      timeSignature?: TimeSignature;
      bdoMeta?: {
        author: string;
        composer: string;
        arranger: string;
        ownerId?: number | null;
        effectorSettings?: EffectorSettings;
      };
    }) => {
      const { importedTracks, bpm: impBpm, title: impTitle, timeSignature: impTimeSig, bdoMeta } = data;
      if (!importedTracks || importedTracks.length === 0) return;

      handleStop();

      const currentTracks = tracksRef.current;
      const mode = importModeRef.current;
      const result = mergeImportedTracks(currentTracks, importedTracks, mode);

      if (result.isAppended) {
        setTracks(result.tracks);
        setActiveTrackId(result.activeTrackId);
        pushHistory(result.tracks, result.activeTrackId);
      } else {
        // Replace mode (or empty canvas)
        if (bdoMeta) {
          setIsBdoProtected(true);
          setOriginalBdoAuthor(bdoMeta.author);
          setOriginalBdoComposer(bdoMeta.composer);
          setOriginalBdoArranger(bdoMeta.arranger);
          setOriginalBdoOwnerId(bdoMeta.ownerId ?? null);
          setAuthor(bdoMeta.author);
          if (typeof bdoMeta.ownerId === 'number') {
            setBdoOwnerId(bdoMeta.ownerId);
          }
          if (bdoMeta.effectorSettings) {
            setEffectorSettings(bdoMeta.effectorSettings);
          }
        } else {
          setIsBdoProtected(false);
          setOriginalBdoAuthor('');
          setOriginalBdoComposer('');
          setOriginalBdoArranger('');
          setOriginalBdoOwnerId(null);
        }

        setTracks(result.tracks);
        setActiveTrackId(result.activeTrackId);
        if (impBpm) setBpm(impBpm);
        if (impTitle) setTitle(impTitle);
        if (impTimeSig) setTimeSignature(impTimeSig);
        pushHistory(result.tracks, result.activeTrackId);
      }
    },
    [handleStop, pushHistory]
  );

  // Handle File Import (MIDI / XML / JSON)
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 1. Detect Standard MIDI File (SMF): starts with "MThd" (0x4D, 0x54, 0x68, 0x64) or .mid extension
      const isMidi =
        (bytes.length >= 4 &&
          bytes[0] === 0x4d &&
          bytes[1] === 0x54 &&
          bytes[2] === 0x68 &&
          bytes[3] === 0x64) ||
        file.name.toLowerCase().endsWith('.mid') ||
        file.name.toLowerCase().endsWith('.midi');

      if (isMidi) {
        const decoded = parseStandardMidiFile(buffer, file.name);
        if (decoded.tracks.length > 0) {
          applyImportedData({
            importedTracks: decoded.tracks,
            bpm: decoded.bpm,
            title: decoded.title,
            timeSignature: decoded.timeSignature,
          });
        } else {
          alert('O arquivo MIDI foi lido, mas nenhuma nota ou faixa com notas foi encontrada.');
        }
        return;
      }

      // 2. Detect BDO In-game Binary Score (BMS / ICE Encrypted format: starts with 0x09 0x00 0x00 0x00)
      if (isBdoBinaryContent(bytes) || file.name.toLowerCase().endsWith('.bms')) {
        const fileTitle = file.name.replace(/\.[^/.]+$/, '').trim();
        const decoded = parseBdoBinaryFile(bytes, fileTitle);
        if (decoded.tracks.length > 0) {
          const detectedComposer = decoded.composer.trim();
          const detectedArranger = decoded.arranger.trim();
          const detectedAuthor = (decoded.author || detectedComposer || detectedArranger || 'Desconhecido').trim();
          applyImportedData({
            importedTracks: decoded.tracks,
            bpm: decoded.bpm,
            title: fileTitle || decoded.title,
            timeSignature: decoded.timeSignature,
            bdoMeta: {
              author: detectedAuthor,
              composer: detectedComposer,
              arranger: detectedArranger,
              ownerId: decoded.ownerId,
              effectorSettings: decoded.effectorSettings,
            },
          });
        } else {
          alert('O arquivo de partitura do Black Desert foi lido, mas nenhuma nota foi encontrada.');
        }
        return;
      }

      // 3. Decode text for MusicXML / XML / JSON
      const text = new TextDecoder().decode(buffer);

      if (isMusicXmlContent(text) || file.name.toLowerCase().endsWith('.musicxml')) {
        const decoded = parseMusicXml(text);
        if (decoded.tracks.length > 0) {
          applyImportedData({
            importedTracks: decoded.tracks,
            bpm: decoded.bpm,
            title: decoded.title,
            timeSignature: decoded.timeSignature,
          });
        } else {
          alert('O arquivo MusicXML foi lido, mas nenhuma nota foi encontrada.');
        }
        return;
      }

      if (text.includes('<MarniScore') || (text.includes('<?xml') && text.includes('<Tracks>'))) {
        // Parse BDO XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        const titleEl = xmlDoc.querySelector('Title');
        const bpmEl = xmlDoc.querySelector('BPM');
        const xmlTitle = titleEl?.textContent || undefined;
        const xmlBpm = bpmEl?.textContent ? Number(bpmEl.textContent) : undefined;

        const trackElements = xmlDoc.querySelectorAll('Track');
        if (trackElements.length > 0) {
          const importedTracks: Track[] = [];
          trackElements.forEach((tEl, idx) => {
            const name = tEl.getAttribute('name') || `Faixa ${idx + 1}`;

            const noteElements = tEl.querySelectorAll('Note');
            const notes: Note[] = [];
            noteElements.forEach((nEl) => {
              notes.push({
                id: `note-imp-${Date.now()}-${Math.random()}`,
                trackId: `track-imp-${idx}`,
                pitch: Number(nEl.getAttribute('pitch')) || 60,
                startTick: Number(nEl.getAttribute('startTick')) || 0,
                durationTicks: Number(nEl.getAttribute('duration')) || 480,
                velocity: Number(nEl.getAttribute('velocity')) || 90,
              });
            });

            const rawInstAttr = tEl.getAttribute('instrumentId');
            const instrumentId =
              rawInstAttr && BDO_INSTRUMENTS.some((i) => i.id === rawInstAttr)
                ? (rawInstAttr as InstrumentId)
                : detectBdoInstrument({ name, fileName: file.name, notes });
            const inst = BDO_INSTRUMENTS.find((i) => i.id === instrumentId);

            importedTracks.push({
              id: `track-imp-${idx}`,
              name,
              instrumentId,
              color: inst?.color || '#d4a373',
              volume: inst?.defaultVolume || 75,
              pan: 0,
              isMuted: false,
              isSolo: false,
              auxSend: true,
              notes,
            });
          });

          applyImportedData({
            importedTracks,
            bpm: xmlBpm,
            title: xmlTitle,
          });
        }
        return;
      }

      if (text.trim().startsWith('{')) {
        // Parse JSON project
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
          applyImportedData({
            importedTracks: parsed.tracks,
            bpm: parsed.bpm,
            title: parsed.title,
            timeSignature: parsed.timeSignature,
          });
        }
        return;
      }
    } catch (err) {
      console.error('Falha ao importar partitura:', err);
      alert('Não foi possível processar o arquivo selecionado.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportAiScore = useCallback(
    (result: {
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
    }) => {
      let nextTracks = [...tracks];
      let nextActiveId = result.targetTrackId;

      if (result.createNewTrack) {
        const primaryTrack: Track = {
          id: result.targetTrackId,
          name: result.createNewTrack.name,
          instrumentId: result.createNewTrack.instrumentId,
          color: '#d4a373',
          volume: 75,
          pan: 0,
          isMuted: false,
          isSolo: false,
          auxSend: true,
          notes: result.notes,
        };
        nextTracks = [...nextTracks, primaryTrack];
        nextActiveId = primaryTrack.id;

        if (result.secondTrack && result.secondTrack.notes.length > 0) {
          const secondTrack: Track = {
            id: result.secondTrack.trackId,
            name: result.secondTrack.name,
            instrumentId: result.secondTrack.instrumentId,
            color: '#a373d4',
            volume: 75,
            pan: 0,
            isMuted: false,
            isSolo: false,
            auxSend: true,
            notes: result.secondTrack.notes,
          };
          nextTracks = [...nextTracks, secondTrack];
        }
      } else {
        if (result.appendMode) {
          nextTracks = nextTracks.map((t) =>
            t.id === result.targetTrackId
              ? { ...t, notes: [...t.notes, ...result.notes] }
              : t
          );
        } else {
          nextTracks = nextTracks.map((t) =>
            t.id === result.targetTrackId ? { ...t, notes: result.notes } : t
          );
        }
      }

      handleStop();
      setTracks(nextTracks);
      setActiveTrackId(nextActiveId);
      if (result.bpm) setBpm(result.bpm);
      if (result.title) setTitle(result.title);
      if (result.timeSignature) setTimeSignature(result.timeSignature);

      pushHistory(nextTracks, nextActiveId);
    },
    [tracks, handleStop, pushHistory]
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#141210] text-stone-200 font-sans select-none">
      {/* Top Header Bar */}
      <Header
        toolMode={toolMode}
        onSetToolMode={setToolMode}
        isPlaying={isPlaying}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        currentTick={currentPlayheadTick}
        maxTick={maxTick}
        bpm={bpm}
        onBpmChange={setBpm}
        timeSignature={timeSignature}
        onTimeSignatureChange={setTimeSignature}
        gridSnap={gridSnap}
        onGridSnapChange={setGridSnap}
        accidentals={accidentals}
        onToggleAccidentals={() => setAccidentals((prev) => (prev === 'sharp' ? 'flat' : 'sharp'))}
        effectorSettings={effectorSettings}
        onOpenEffectorModal={() => setIsEffectorOpen(true)}
        onToggleReverb={() =>
          setEffectorSettings((prev) => ({
            ...prev,
            reverb: { ...prev.reverb, enabled: !prev.reverb.enabled },
          }))
        }
        onToggleDelay={() =>
          setEffectorSettings((prev) => ({
            ...prev,
            delay: { ...prev.delay, enabled: !prev.delay.enabled },
          }))
        }
        onToggleChorus={() =>
          setEffectorSettings((prev) => ({
            ...prev,
            chorus: { ...prev.chorus, enabled: !prev.chorus.enabled },
          }))
        }
        onOpenMidiModal={() => setIsMidiModalOpen(true)}
        onOpenAiSheetScanner={() => setIsAiSheetScannerOpen(true)}
        hasMidiDevices={hasMidiDevices}
        scaleType={scaleType}
        onScaleChange={setScaleType}
        zoomLevel={zoomLevel}
        onZoomChange={(delta) => setZoomLevel((prev) => Math.max(0.5, Math.min(2.5, prev + delta)))}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleSidebar={() => setIsSidebarOpenMobile((prev) => !prev)}
        isSidebarOpen={isSidebarOpenMobile}
      />

      {/* Main Workspace (Track Sidebar + Piano Roll) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Track Sidebar */}
        <TrackList
          tracks={tracks}
          activeTrackId={activeTrackId}
          onSelectTrack={(id) => {
            setActiveTrackId(id);
            setIsSidebarOpenMobile(false);
          }}
          onAddTrack={() => setIsAddInstrumentOpen(true)}
          onDeleteTrack={handleDeleteTrack}
          onDuplicateTrack={handleDuplicateTrack}
          onUpdateTrack={handleUpdateTrack}
          onResetAll={handleResetAll}
          onImportClick={handleTriggerImport}
          onOpenAiSheetScanner={() => setIsAiSheetScannerOpen(true)}
          totalNotes={totalNotes}
          maxNotes={maxNotesAllowed}
          bdoGrade={bdoGrade}
          isOpenOnMobile={isSidebarOpenMobile}
        />

        {/* Center Piano Roll Editor */}
        <PianoRoll
          tracks={tracks}
          activeTrackId={activeTrackId}
          onUpdateNotes={handleUpdateNotes}
          onAuditionPitch={handleAuditionPitch}
          toolMode={toolMode}
          gridSnap={gridSnap}
          timeSignature={timeSignature}
          accidentals={accidentals}
          currentPlayheadTick={currentPlayheadTick}
          isPlaying={isPlaying}
          onSeek={handleSeek}
          zoomLevel={zoomLevel}
          onZoomChange={(delta) => setZoomLevel((prev) => Math.max(0.5, Math.min(2.5, prev + delta)))}
          scaleType={scaleType}
        />
      </div>

      {/* Bottom Action Bar */}
      <BottomBar
        title={title}
        onTitleChange={setTitle}
        author={author}
        onAuthorChange={handleAuthorChange}
        isBdoProtected={isBdoProtected}
        onSaveMidi={handleSaveMidi}
        onExportBdo={() => setIsBdoExportOpen(true)}
        onExportWav={handleExportWav}
        isExportingAudio={isExportingAudio}
      />

      {/* Hidden File Input for import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileImport}
        accept=".xml,.bdo,.mid,.midi,.musicxml,.mxl,.json,.bms,*"
        className="hidden"
        aria-hidden="true"
      />

      {/* Effector / VST FX Modal */}
      <EffectorModal
        isOpen={isEffectorOpen}
        onClose={() => setIsEffectorOpen(false)}
        settings={effectorSettings}
        onChange={setEffectorSettings}
      />

      {/* Add Instrument Modal */}
      <AddInstrumentModal
        isOpen={isAddInstrumentOpen}
        onClose={() => setIsAddInstrumentOpen(false)}
        onSelectInstrument={handleAddTrack}
      />

      {/* BDO Export Modal */}
      <BdoExportModal
        isOpen={isBdoExportOpen}
        onClose={() => setIsBdoExportOpen(false)}
        tracks={tracks}
        metadata={metadata}
        effectorSettings={effectorSettings}
      />

      {/* Web MIDI Settings Modal */}
      {midiManagerRef.current && (
        <MidiSettingsModal
          isOpen={isMidiModalOpen}
          onClose={() => setIsMidiModalOpen(false)}
          midiManager={midiManagerRef.current}
        />
      )}

      {/* AI Sheet Music Scanner Modal (Gemini OMR) */}
      <AiSheetScannerModal
        isOpen={isAiSheetScannerOpen}
        onClose={() => setIsAiSheetScannerOpen(false)}
        tracks={tracks}
        activeTrackId={activeTrackId}
        onImportScore={handleImportAiScore}
      />

      {/* Reset All Confirmation Modal */}
      {isResetConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setIsResetConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#1c1a1a] border border-[#3e3832] rounded-xl shadow-2xl p-6 text-[#e0d4c8] select-none"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <RotateCcw className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-base font-semibold text-stone-100">Restaurar Partitura?</h3>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed mb-6">
              Esta ação irá apagar todas as notas e faixas personalizadas, restaurando a DAW para uma única faixa de Grand Piano vazia.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#3e3832] bg-[#23201e] text-xs font-medium text-stone-300 hover:text-stone-100 hover:border-stone-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmResetAll}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-all shadow-md active:scale-95"
              >
                Restaurar Tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
