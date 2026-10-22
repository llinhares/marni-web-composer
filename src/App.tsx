/**
 * Marni Web Composer - Optimized DAW & BDO Music Studio
 * Created by Lucas Linhares (Tchepper)
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
  Marker,
} from './types/music.ts';
import { BDO_INSTRUMENTS, BDO_GRADE_LIMITS } from './types/music.ts';
import { AudioEngine } from './audio/AudioEngine.ts';
import { createPlayheadStore } from './audio/playheadStore.ts';
import { newId } from './utils/ids.ts';
import { getSavedAuthor, getSavedOwnerId, migrateLegacyProfile, saveAuthor } from './user/userProfile.ts';
import { barRangeOf } from './editing/noteOps.ts';
import { readImportFile } from './import/fileImport.ts';
import { findShortcut, isEditableElement, type ShortcutId } from './ui/shortcuts.ts';
import { UndoHistory } from './editing/undoHistory.ts';
import { sessionSnapshotsEqual, type SessionSnapshot } from './editing/sessionSnapshot.ts';
import { createMidiRecorder, recordedToNotes, type MidiRecorder, type RecordedNoteEvent } from './midi/midiRecorder.ts';
import { sampleLibrary } from './audio/sampleLibrary.ts';
import { WebMidiManager } from './midi/webMidi.ts';
import { createStandardMidiFile, triggerFileDownload } from './midi/midiEncoder.ts';
import { exportWavFile } from './export/audioExporter.ts';
import { getBeatsPerMeasure } from './utils/musicMath.ts';
import { mergeImportedTracks, type ImportMode } from './utils/trackImport.ts';
import { Header } from './components/Header.tsx';
import { TrackList } from './components/TrackList.tsx';
import { PianoRoll } from './components/PianoRoll.tsx';
import { BottomBar } from './components/BottomBar.tsx';
import { EffectorModal } from './components/EffectorModal.tsx';
import { AddInstrumentModal } from './components/AddInstrumentModal.tsx';
import { BdoExportModal } from './components/BdoExportModal.tsx';
import { MidiSettingsModal } from './components/MidiSettingsModal.tsx';
import { AiSheetScannerModal } from './components/AiSheetScannerModal.tsx';
import { VideoAudioTranscriberModal } from './components/VideoAudioTranscriberModal.tsx';
import { RecoveryBanner } from './components/RecoveryBanner.tsx';
import { MixerPanel } from './components/MixerPanel.tsx';
import { Notifications } from './components/Notifications.tsx';
import { HelpCenter, type HelpTab } from './components/HelpCenter.tsx';
import { GuidedTour } from './components/GuidedTour.tsx';
import { TOUR_STORAGE_KEY, TOUR_VERSION } from './ui/tourLayout.ts';
import { notify, errorMessage } from './ui/notify.ts';
import {
  DEFAULT_EFFECTOR_SETTINGS,
  parseProjectFile,
  projectFileName,
  projectSignature,
  serializeProject,
  type BdoGrade,
  type ProjectFile,
  type ProjectState,
} from './project/projectFile.ts';
import { readAutosave, writeAutosave } from './project/autosave.ts';
import { pickProjectFile, saveProjectToDisk, type FileHandleLike } from './project/projectIO.ts';

const AUTOSAVE_DELAY_MS = 1200;

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
  // The current user's name and BDO owner ID: empty until they inform them (never a built-in default)
  const [author, setAuthor] = useState<string>(() => {
    migrateLegacyProfile();
    return getSavedAuthor();
  });
  const [bdoOwnerId, setBdoOwnerId] = useState<number>(() => getSavedOwnerId() ?? 0);
  const [isBdoProtected, setIsBdoProtected] = useState<boolean>(false);
  const [originalBdoAuthor, setOriginalBdoAuthor] = useState<string>('');
  const [originalBdoComposer, setOriginalBdoComposer] = useState<string>('');
  const [originalBdoArranger, setOriginalBdoArranger] = useState<string>('');
  const [originalBdoOwnerId, setOriginalBdoOwnerId] = useState<number | null>(null);

  const handleAuthorChange = useCallback((newAuthor: string) => {
    if (isBdoProtected) return;
    setAuthor(newAuthor);
    saveAuthor(newAuthor);
  }, [isBdoProtected]);

  const [bpm, setBpm] = useState<number>(120);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const [timeSignature, setTimeSignature] = useState<TimeSignature>('4/4');
  const [gridSnap, setGridSnap] = useState<GridSnap>('1/4');
  const [toolMode, setToolMode] = useState<ToolMode>('pointer');
  const [accidentals, setAccidentals] = useState<'sharp' | 'flat'>('sharp');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [scaleType, setScaleType] = useState<string>('chromatic');
  const [bdoGrade, setBdoGrade] = useState<BdoGrade>('S');

  // Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  // Playhead lives outside React state: only the timecode and the piano-roll overlay follow it
  const [playhead] = useState(() => createPlayheadStore(0));

  // Effector / VST State
  const [effectorSettings, setEffectorSettings] = useState<EffectorSettings>(DEFAULT_EFFECTOR_SETTINGS);

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
  const [isVideoTranscriberOpen, setIsVideoTranscriberOpen] = useState(false);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [help, setHelp] = useState<{ open: boolean; tab: HelpTab }>({ open: false, tab: 'guide' });
  const [isTourOpen, setIsTourOpen] = useState(false);
  const finishTour = useCallback(() => {
    setIsTourOpen(false);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, TOUR_VERSION);
    } catch {
      // private mode: the tour may show again next time
    }
  }, []);
  const readMeterPeaks = useCallback(() => audioEngineRef.current?.getMeterPeaks() ?? null, []);

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

      midi.onNote((event) => handleMidiNoteRef.current(event));
      midi.onSustain((down) => handleMidiSustainRef.current(down));
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

  // Undo / Redo History (notes, tracks, tempo, meter and effects)
  const effectorRef = useRef(effectorSettings);
  effectorRef.current = effectorSettings;
  const bpmHistRef = useRef(bpm);
  bpmHistRef.current = bpm;
  const timeSigHistRef = useRef(timeSignature);
  timeSigHistRef.current = timeSignature;

  const snapshotOf = (trackList: Track[], activeId: string): SessionSnapshot => ({
    tracks: trackList,
    activeTrackId: activeId,
    bpm: bpmHistRef.current,
    timeSignature: timeSigHistRef.current,
    effectorSettings: effectorRef.current,
  });

  const historyRef = useRef<UndoHistory<SessionSnapshot> | null>(null);
  historyRef.current ??= new UndoHistory(
    { tracks: INITIAL_TRACKS, activeTrackId: 'track-piano', bpm: 120, timeSignature: '4/4', effectorSettings: DEFAULT_EFFECTOR_SETTINGS },
    { equals: sessionSnapshotsEqual }
  );
  const [, setHistoryVersion] = useState(0);

  const pushHistory = useCallback((newTracks: Track[], newActiveId?: string, group?: string) => {
    if (historyRef.current!.push(snapshotOf(newTracks, newActiveId || activeTrackIdRef.current), group)) {
      setHistoryVersion((v) => v + 1);
    }
  }, []);

  /** Applies a track change immediately (also to the ref, so edits in the same frame stack up) and records it. */
  const commitTracks = useCallback(
    (updater: (prev: Track[]) => Track[], opts: { history?: boolean; activeId?: string; group?: string } = {}) => {
      const next = updater(tracksRef.current);
      if (next === tracksRef.current) return;
      tracksRef.current = next;
      setTracks(next);
      if (opts.history !== false) pushHistory(next, opts.activeId, opts.group);
    },
    [pushHistory]
  );

  const restoreSnapshot = useCallback((snap: SessionSnapshot | null) => {
    if (!snap) return;
    tracksRef.current = snap.tracks;
    setTracks(snap.tracks);
    setActiveTrackId(snap.activeTrackId);
    setBpm(snap.bpm);
    setTimeSignature(snap.timeSignature);
    setEffectorSettings(snap.effectorSettings);
    setHistoryVersion((v) => v + 1);
  }, []);

  const handleUndo = useCallback(() => restoreSnapshot(historyRef.current!.undo()), [restoreSnapshot]);
  const handleRedo = useCallback(() => restoreSnapshot(historyRef.current!.redo()), [restoreSnapshot]);

  // Tempo, meter and effect changes are undoable too (typing/dragging collapses into one step)
  useEffect(() => {
    const cur = historyRef.current!.current;
    if (cur.bpm === bpm && cur.timeSignature === timeSignature && cur.effectorSettings === effectorSettings) return;
    const group = cur.bpm !== bpm ? 'bpm' : cur.timeSignature !== timeSignature ? 'meter' : 'fx';
    pushHistory(tracksRef.current, activeTrackIdRef.current, group);
  }, [bpm, timeSignature, effectorSettings, pushHistory]);

  const canUndo = historyRef.current.canUndo;
  const canRedo = historyRef.current.canRedo;

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

  // Playback & recording
  const [isRecording, setIsRecording] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState<boolean>(() => localStorage.getItem('marni_metronome') === '1');
  const [countInOn, setCountInOn] = useState<boolean>(() => localStorage.getItem('marni_count_in') !== '0');
  const recorderRef = useRef<{ recorder: MidiRecorder; trackId: string; baseNotes: Note[] } | null>(null);
  const liveTakeRef = useRef<RecordedNoteEvent[]>([]);
  const countInRef = useRef(countInOn);
  countInRef.current = countInOn;
  const timeSignatureRef = useRef(timeSignature);
  timeSignatureRef.current = timeSignature;

  useEffect(() => {
    localStorage.setItem('marni_metronome', metronomeOn ? '1' : '0');
    localStorage.setItem('marni_count_in', countInOn ? '1' : '0');
    audioEngineRef.current?.setMetronome(metronomeOn, getBeatsPerMeasure(timeSignature));
  }, [metronomeOn, countInOn, timeSignature]);

  /** Writes the take into its track: notes appear live while recording, one undo step at the end. */
  const showTake = useCallback(
    (events: RecordedNoteEvent[], commit: boolean) => {
      const rec = recorderRef.current;
      if (!rec) return;
      const recorded = recordedToNotes(events, rec.trackId, () => newId('note'));
      commitTracks(
        (prev) => prev.map((t) => (t.id === rec.trackId ? { ...t, notes: [...rec.baseNotes, ...recorded] } : t)),
        { history: commit, activeId: rec.trackId }
      );
    },
    [commitTracks]
  );

  const finishRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    const events = rec.recorder.finish(audioEngineRef.current?.currentTick() ?? playhead.get());
    if (events.length > 0) showTake(events, true);
    recorderRef.current = null;
    liveTakeRef.current = [];
    setIsRecording(false);
  }, [playhead, showTake]);

  const startEngineAt = useCallback(
    (tick: number, countInTicks = 0) => {
      audioEngineRef.current?.startPlayback(
        tracksRef.current,
        bpmRef.current,
        tick,
        (t) => playhead.set(t),
        () => {
          finishRecording();
          setIsPlaying(false);
          playhead.set(0);
        },
        { countInTicks }
      );
    },
    [playhead, finishRecording]
  );

  const handlePlay = useCallback(() => {
    if (!audioEngineRef.current) return;
    audioEngineRef.current.init().then(() => {
      setIsPlaying(true);
      startEngineAt(playhead.get());
    });
  }, [playhead, startEngineAt]);

  const handlePause = useCallback(() => {
    finishRecording();
    audioEngineRef.current?.pausePlayback();
    setIsPlaying(false);
  }, [finishRecording]);

  const handleStop = useCallback(() => {
    finishRecording();
    audioEngineRef.current?.stopPlayback();
    setIsPlaying(false);
    playhead.set(0);
  }, [playhead, finishRecording]);

  /** Records the MIDI keyboard into the active track, from the playhead (optionally after a count-in bar). */
  const handleRecord = useCallback(() => {
    if (recorderRef.current) {
      handlePause();
      return;
    }
    const engine = audioEngineRef.current;
    const track = tracksRef.current.find((t) => t.id === activeTrackIdRef.current);
    if (!engine || !track) return;
    engine.init().then(() => {
      const startTick = playhead.get();
      recorderRef.current = { recorder: createMidiRecorder(startTick), trackId: track.id, baseNotes: track.notes };
      liveTakeRef.current = [];
      setIsRecording(true);
      setIsPlaying(true);
      startEngineAt(startTick, countInRef.current ? getBeatsPerMeasure(timeSignatureRef.current) * 480 : 0);
    });
  }, [handlePause, playhead, startEngineAt]);

  // MIDI keyboard: notes sound while the key is held; captured when recording
  const handleMidiNoteRef = useRef<(e: { type: 'noteon' | 'noteoff'; pitch: number; velocity: number }) => void>(
    () => {}
  );
  const handleMidiSustainRef = useRef<(down: boolean) => void>(() => {});
  const heldVoicesRef = useRef(new Map<number, string>());
  const pedalDownRef = useRef(false);
  handleMidiNoteRef.current = (e) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const rec = recorderRef.current;
    const tick = engine.currentTick();
    if (e.type === 'noteon') {
      const track =
        tracksRef.current.find((t) => t.id === (rec?.trackId ?? activeTrackIdRef.current)) ?? tracksRef.current[0];
      if (!track) return;
      void engine.init();
      const prev = heldVoicesRef.current.get(e.pitch);
      if (prev) engine.releaseHeldNote(prev);
      heldVoicesRef.current.set(
        e.pitch,
        engine.startHeldNote(
          track.instrumentId,
          e.pitch,
          e.velocity,
          track.volume,
          track.auxSend,
          track.pan,
          pedalDownRef.current || !!track.sustainPedal
        )
      );
      rec?.recorder.noteOn(e.pitch, e.velocity, tick);
    } else {
      const voice = heldVoicesRef.current.get(e.pitch);
      if (voice && !pedalDownRef.current) {
        engine.releaseHeldNote(voice);
        heldVoicesRef.current.delete(e.pitch);
      }
      const closed = rec?.recorder.noteOff(e.pitch, tick);
      if (closed) {
        liveTakeRef.current = [...liveTakeRef.current, closed];
        showTake(liveTakeRef.current, false);
      }
    }
  };
  handleMidiSustainRef.current = (down) => {
    pedalDownRef.current = down;
    const engine = audioEngineRef.current;
    if (!down && engine) {
      heldVoicesRef.current.forEach((voice) => engine.releaseHeldNote(voice));
      heldVoicesRef.current.clear();
    }
    const rec = recorderRef.current;
    if (rec && engine) {
      const closed = rec.recorder.sustainPedal(down, engine.currentTick());
      if (closed.length > 0) {
        liveTakeRef.current = [...liveTakeRef.current, ...closed];
        showTake(liveTakeRef.current, false);
      }
    }
  };

  const handleSeek = useCallback(
    (tick: number) => {
      playhead.set(tick);
      if (isPlaying && !recorderRef.current) startEngineAt(tick);
    },
    [isPlaying, playhead, startEngineAt]
  );

  // Markers (saved with the project)
  const [markers, setMarkers] = useState<Marker[]>([]);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const handleAddMarker = useCallback(() => {
    const tick = Math.round(playhead.get());
    setMarkers((prev) =>
      prev.some((m) => m.tick === tick)
        ? prev
        : [...prev, { id: newId('marker'), tick, name: `Marcador ${prev.length + 1}` }].sort((a, b) => a.tick - b.tick)
    );
  }, [playhead]);
  const handleRenameMarker = useCallback((id: string, name: string) => {
    setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)));
  }, []);
  const handleDeleteMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);
  const jumpToMarker = useCallback(
    (direction: 1 | -1) => {
      const here = playhead.get();
      const list = markersRef.current;
      const target =
        direction > 0 ? list.find((m) => m.tick > here + 1) : [...list].reverse().find((m) => m.tick < here - 1);
      if (target) handleSeek(target.tick);
      else if (direction < 0) handleSeek(0);
    },
    [playhead, handleSeek]
  );

  // Loop region (Shift+drag on the ruler, or L to loop the selection / the next 4 bars)
  const [loop, setLoop] = useState<{ start: number; end: number; enabled: boolean } | null>(null);
  useEffect(() => {
    audioEngineRef.current?.setLoop(loop?.enabled ? loop : null);
  }, [loop]);
  const handleLoopChange = useCallback((range: { start: number; end: number }) => {
    setLoop({ ...range, enabled: true });
  }, []);
  const handleToggleLoop = useCallback(() => {
    setLoop((prev) => {
      if (prev) return { ...prev, enabled: !prev.enabled };
      const ticksPerBar = getBeatsPerMeasure(timeSignatureRef.current) * 480;
      const active = tracksRef.current.find((t) => t.id === activeTrackIdRef.current);
      const fromSelection = barRangeOf(active?.notes.filter((n) => n.selected) ?? [], ticksPerBar);
      if (fromSelection) return { ...fromSelection, enabled: true };
      const barStart = Math.floor(playhead.get() / ticksPerBar) * ticksPerBar;
      return { start: barStart, end: barStart + 4 * ticksPerBar, enabled: true };
    });
  }, [playhead]);

  // Download the sampled instruments the song uses (cached after the first time)
  const instrumentKey = [...new Set(tracks.map((t) => t.instrumentId))].sort().join(',');
  const instrumentIds = useMemo(() => (instrumentKey ? (instrumentKey.split(',') as InstrumentId[]) : []), [instrumentKey]);
  useEffect(() => {
    void sampleLibrary.loadAll(instrumentIds);
  }, [instrumentIds]);

  // Edits, mute/solo and tempo changes reach the engine while it plays
  useEffect(() => {
    audioEngineRef.current?.updateSong(tracks);
  }, [tracks]);
  useEffect(() => {
    audioEngineRef.current?.setTempo(bpm);
  }, [bpm]);

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
      commitTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, notes: updatedNotes } : t)), {
        history: commitHistory,
        activeId: trackId,
      });
    },
    [commitTracks]
  );

  const handleAddTrack = (instrumentId: InstrumentId) => {
    const inst = BDO_INSTRUMENTS.find((i) => i.id === instrumentId);
    const count = tracks.filter((t) => t.instrumentId === instrumentId).length;
    const name = count === 0 ? (inst?.name || 'Instrumento') : `${inst?.name} ${count + 1}`;

    const newTrack: Track = {
      id: newId('track'),
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

    commitTracks((prev) => [...prev, newTrack], { activeId: newTrack.id });
    setActiveTrackId(newTrack.id);
  };

  const handleDeleteTrack = (trackId: string) => {
    if (tracksRef.current.length <= 1) return;
    const remaining = tracksRef.current.filter((t) => t.id !== trackId);
    const nextActiveId = activeTrackId === trackId ? remaining[0]?.id || '' : activeTrackId;
    if (activeTrackId === trackId) setActiveTrackId(nextActiveId);
    commitTracks(() => remaining, { activeId: nextActiveId });
  };

  const handleDuplicateTrack = (trackId: string) => {
    const source = tracks.find((t) => t.id === trackId);
    if (!source) return;

    const duplicated: Track = {
      ...source,
      id: newId('track'),
      name: `${source.name} (Cópia)`,
      notes: [],
    };
    duplicated.notes = source.notes.map((n) => ({ ...n, id: newId('note'), trackId: duplicated.id }));

    commitTracks((prev) => [...prev, duplicated], { activeId: duplicated.id });
    setActiveTrackId(duplicated.id);
  };

  const handleUpdateTrack = (trackId: string, updates: Partial<Track>) => {
    // Grouped per track and field: dragging a volume/pan slider is a single undo step
    commitTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...updates } : t)), {
      group: `track:${trackId}:${Object.keys(updates).sort().join(',')}`,
    });
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
    setMarkers([]);
    setActiveTrackId('track-piano');
    playhead.set(0);
    setTitle('Marni Web Composer - Example');
    setIsBdoProtected(false);
    setOriginalBdoAuthor('');
    setOriginalBdoComposer('');
    setOriginalBdoArranger('');
    setOriginalBdoOwnerId(null);
    setAuthor(getSavedAuthor());
    setIsResetConfirmOpen(false);
    pushHistory(resetTracks, 'track-piano');
    // A reset starts a new, not-yet-saved project
    fileHandleRef.current = null;
    setProjectFileLabel(null);
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
      await exportWavFile(tracks, bpm, effectorSettings, filename, bitDepth);
      notify.success(`Áudio exportado: ${filename}`);
    } catch (err) {
      console.error('Falha ao exportar WAV:', err);
      notify.error(errorMessage(err, 'Não foi possível exportar o áudio.'));
    } finally {
      setIsExportingAudio(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Project file (.marni), dirty state, autosave & crash recovery
  // ---------------------------------------------------------------------------

  const projectState: ProjectState = useMemo(
    () => ({
      title,
      author,
      bpm,
      timeSignature,
      gridSnap,
      accidentals,
      scaleType,
      bdoGrade,
      bdoOwnerId,
      effectorSettings,
      tracks,
      activeTrackId,
      markers,
      bdoProtection: {
        isProtected: isBdoProtected,
        author: originalBdoAuthor,
        composer: originalBdoComposer,
        arranger: originalBdoArranger,
        ownerId: originalBdoOwnerId,
      },
    }),
    [
      title,
      author,
      bpm,
      timeSignature,
      gridSnap,
      accidentals,
      scaleType,
      bdoGrade,
      bdoOwnerId,
      effectorSettings,
      tracks,
      activeTrackId,
      markers,
      isBdoProtected,
      originalBdoAuthor,
      originalBdoComposer,
      originalBdoArranger,
      originalBdoOwnerId,
    ]
  );
  const projectStateRef = useRef(projectState);
  projectStateRef.current = projectState;

  const currentSignature = useMemo(() => projectSignature(projectState), [projectState]);
  // Signature of the content last written to / read from a .marni file (or the startup state)
  const [savedSignature, setSavedSignature] = useState<string>(currentSignature);
  const isDirty = currentSignature !== savedSignature;
  const fileHandleRef = useRef<FileHandleLike | null>(null);
  const [projectFileLabel, setProjectFileLabel] = useState<string | null>(null);
  const [lastAutosaveAt, setLastAutosaveAt] = useState<Date | null>(null);
  // Until the user answers the recovery prompt, autosave must not overwrite the stored session
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryOffer, setRecoveryOffer] = useState<{ project: ProjectFile; savedAt: Date; isDirty: boolean } | null>(
    null
  );


  const applyProject = useCallback(
    (p: ProjectFile) => {
      handleStop();
      setTracks(p.tracks);
      setActiveTrackId(p.activeTrackId);
      setTitle(p.title);
      setAuthor(p.author);
      setBpm(p.bpm);
      setTimeSignature(p.timeSignature);
      setGridSnap(p.gridSnap);
      setAccidentals(p.accidentals);
      setScaleType(p.scaleType);
      setBdoGrade(p.bdoGrade);
      if (p.bdoOwnerId > 0) setBdoOwnerId(p.bdoOwnerId);
      setEffectorSettings(p.effectorSettings);
      setMarkers(p.markers);
      setIsBdoProtected(p.bdoProtection.isProtected);
      setOriginalBdoAuthor(p.bdoProtection.author);
      setOriginalBdoComposer(p.bdoProtection.composer);
      setOriginalBdoArranger(p.bdoProtection.arranger);
      setOriginalBdoOwnerId(p.bdoProtection.ownerId);
      playhead.set(0);
      // A loaded project starts a fresh undo history
      historyRef.current!.reset({
        tracks: p.tracks,
        activeTrackId: p.activeTrackId,
        bpm: p.bpm,
        timeSignature: p.timeSignature,
        effectorSettings: p.effectorSettings,
      });
      setHistoryVersion((v) => v + 1);
      return projectSignature({ ...p, bdoOwnerId: p.bdoOwnerId > 0 ? p.bdoOwnerId : bdoOwnerId });
    },
    [handleStop, bdoOwnerId]
  );

  const handleSaveProject = useCallback(
    async (saveAs = false) => {
      const state = projectStateRef.current;
      try {
        const result = await saveProjectToDisk(
          serializeProject(state),
          fileHandleRef.current?.name ?? projectFileName(state.title),
          fileHandleRef.current,
          saveAs
        );
        if (result === 'cancelled') return;
        fileHandleRef.current = result;
        setProjectFileLabel(result?.name ?? projectFileName(state.title));
        setSavedSignature(projectSignature(state));
        notify.success(result ? `Projeto salvo em ${result.name}` : 'Projeto baixado (.marni)');
      } catch (err) {
        console.error('Falha ao salvar projeto:', err);
        notify.error(errorMessage(err, 'Não foi possível salvar o projeto.'));
      }
    },
    []
  );

  const openProjectText = useCallback(
    async (text: string, handle: FileHandleLike | null, fileName: string) => {
      const project = parseProjectFile(text);
      if (
        isDirty &&
        !(await notify.confirm({
          title: 'Abrir outro projeto?',
          message: 'O projeto atual tem alterações que não foram salvas em arquivo (elas continuam no salvamento automático).',
          confirmLabel: 'Abrir mesmo assim',
          danger: true,
        }))
      ) {
        return;
      }
      const signature = applyProject(project);
      fileHandleRef.current = handle;
      setProjectFileLabel(fileName);
      setSavedSignature(signature);
      notify.success(`Projeto aberto: ${fileName}`);
    },
    [applyProject, isDirty]
  );

  const handleOpenProject = useCallback(async () => {
    try {
      const picked = await pickProjectFile();
      if (picked === 'unsupported') {
        handleTriggerImportRef.current('replace');
        return;
      }
      if (!picked) return;
      await openProjectText(picked.text, picked.handle, picked.handle.name);
    } catch (err) {
      console.error('Falha ao abrir projeto:', err);
      notify.error(errorMessage(err, 'Não foi possível abrir o projeto.'));
    }
  }, [openProjectText]);

  // Startup: offer to restore the last autosaved session if it differs from what is on screen
  useEffect(() => {
    let cancelled = false;
    readAutosave()
      .then((found) => {
        if (cancelled) return;
        if (found && found.record.signature !== projectSignature(projectStateRef.current)) {
          setRecoveryOffer({
            project: found.project,
            savedAt: new Date(found.record.savedAt),
            isDirty: found.record.isDirty,
          });
        } else {
          setRecoveryChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setRecoveryChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // First visit: guided tour, once the recovery prompt (if any) is out of the way
  useEffect(() => {
    if (!recoveryChecked || recoveryOffer) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(TOUR_STORAGE_KEY);
    } catch {
      seen = null;
    }
    if (seen !== TOUR_VERSION) setIsTourOpen(true);
  }, [recoveryChecked, recoveryOffer]);

  const handleRestoreRecovery = () => {
    if (!recoveryOffer) return;
    const signature = applyProject(recoveryOffer.project);
    // Changes that were never written to a .marni file stay flagged as unsaved
    setSavedSignature(recoveryOffer.isDirty ? '' : signature);
    setProjectFileLabel(null);
    fileHandleRef.current = null;
    setRecoveryOffer(null);
    setRecoveryChecked(true);
    notify.success('Sessão anterior restaurada');
  };

  const handleDiscardRecovery = () => {
    setRecoveryOffer(null);
    setRecoveryChecked(true);
  };

  // Debounced autosave to IndexedDB
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const flushAutosave = useCallback(() => {
    const state = projectStateRef.current;
    const now = new Date();
    return writeAutosave({
      savedAt: now.toISOString(),
      signature: projectSignature(state),
      json: serializeProject(state, now),
      isDirty: isDirtyRef.current,
    })
      .then(() => setLastAutosaveAt(now))
      .catch((err) => console.warn('Autosave falhou:', err));
  }, []);

  useEffect(() => {
    if (!recoveryChecked) return;
    const timer = window.setTimeout(flushAutosave, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [currentSignature, isDirty, recoveryChecked, flushAutosave]);

  // Warn before closing with changes not written to a .marni file (the autosave still keeps them)
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (recoveryChecked) void flushAutosave();
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && recoveryChecked) void flushAutosave();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [recoveryChecked, flushAutosave]);

  useEffect(() => {
    document.title = `${isDirty ? '• ' : ''}${title || 'Sem título'} — Marni Web Composer`;
  }, [title, isDirty]);

  // Global keyboard shortcuts (table in ui/shortcuts.ts; piano-roll editing keys live in PianoRoll)
  const shortcutHandlers: Partial<Record<ShortcutId, () => void>> = {
    save: () => void handleSaveProject(false),
    saveAs: () => void handleSaveProject(true),
    open: () => void handleOpenProject(),
    undo: handleUndo,
    redo: handleRedo,
    redoAlt: handleRedo,
    playPause: () => (isPlaying ? handlePause() : handlePlay()),
    record: handleRecord,
    metronome: () => setMetronomeOn((v) => !v),
    loop: handleToggleLoop,
    mixer: () => setIsMixerOpen((v) => !v),
    addMarker: handleAddMarker,
    prevMarker: () => jumpToMarker(-1),
    nextMarker: () => jumpToMarker(1),
    toolPointer: () => setToolMode('pointer'),
    toolSelect: () => setToolMode('select'),
    toolPencil: () => setToolMode('pencil'),
    toolEraser: () => setToolMode('eraser'),
    toolPan: () => setToolMode('pan'),
    help: () => setHelp((h) => ({ open: !h.open, tab: 'commands' })),
  };
  const shortcutHandlersRef = useRef(shortcutHandlers);
  shortcutHandlersRef.current = shortcutHandlers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const focused = document.activeElement;
      const shortcut = findShortcut(e, isEditableElement(focused));
      const handler = shortcut && shortcutHandlersRef.current[shortcut.id];
      if (!handler) return;
      e.preventDefault();
      // Space must not also "click" a focused button when its key is released
      if (shortcut.id === 'playPause' && focused instanceof HTMLButtonElement) focused.blur();
      handler();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Import Mode ('replace' | 'append')
  const importModeRef = useRef<ImportMode>('replace');

  const handleTriggerImport = useCallback((mode: ImportMode) => {
    importModeRef.current = mode;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);
  const handleTriggerImportRef = useRef(handleTriggerImport);
  handleTriggerImportRef.current = handleTriggerImport;

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
      const result = await readImportFile(file);
      if (result.kind === 'project') await openProjectText(result.text, null, result.fileName);
      else if (result.kind === 'tracks') {
        applyImportedData(result);
        notify.success(`${file.name} importado`);
      } else notify.error(result.message);
    } catch (err) {
      console.error('Falha ao importar partitura:', err);
      notify.error(
        err instanceof Error && err.name === 'ProjectFormatError' ? err.message : 'Não foi possível processar o arquivo selecionado.'
      );
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
        playhead={playhead}
        isRecording={isRecording}
        onRecord={handleRecord}
        metronomeOn={metronomeOn}
        onToggleMetronome={() => setMetronomeOn((v) => !v)}
        countInOn={countInOn}
        onToggleCountIn={() => setCountInOn((v) => !v)}
        loopOn={!!loop?.enabled}
        onToggleLoop={handleToggleLoop}
        beatsPerBar={getBeatsPerMeasure(timeSignature)}
        isMixerOpen={isMixerOpen}
        onToggleMixer={() => setIsMixerOpen((v) => !v)}
        onOpenHelp={() => setHelp({ open: true, tab: 'guide' })}
        markers={markers}
        onAddMarker={handleAddMarker}
        onJumpToTick={handleSeek}
        onRenameMarker={handleRenameMarker}
        onDeleteMarker={handleDeleteMarker}
        maxTick={maxTick}
        instrumentIds={instrumentIds}
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
        onOpenVideoTranscriber={() => setIsVideoTranscriberOpen(true)}
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
          onOpenVideoTranscriber={() => setIsVideoTranscriberOpen(true)}
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
          playhead={playhead}
          isPlaying={isPlaying}
          loop={loop}
          onLoopChange={handleLoopChange}
          markers={markers}
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
        onOpenProject={handleOpenProject}
        onSaveProject={() => void handleSaveProject(false)}
        isDirty={isDirty}
        projectFileLabel={projectFileLabel}
        lastAutosaveAt={lastAutosaveAt}
      />

      <Notifications />
      <HelpCenter
        isOpen={help.open}
        initialTab={help.tab}
        onClose={() => setHelp((h) => ({ ...h, open: false }))}
        onStartTour={() => {
          setHelp((h) => ({ ...h, open: false }));
          setIsTourOpen(true);
        }}
      />
      <GuidedTour isOpen={isTourOpen} onFinish={finishTour} />

      <MixerPanel
        isOpen={isMixerOpen}
        onClose={() => setIsMixerOpen(false)}
        tracks={tracks}
        activeTrackId={activeTrackId}
        onSelectTrack={setActiveTrackId}
        onUpdateTrack={handleUpdateTrack}
        readPeaks={readMeterPeaks}
      />

      {recoveryOffer && (
        <RecoveryBanner
          savedAt={recoveryOffer.savedAt}
          title={recoveryOffer.project.title}
          trackCount={recoveryOffer.project.tracks.length}
          noteCount={recoveryOffer.project.tracks.reduce((acc, t) => acc + t.notes.length, 0)}
          onRestore={handleRestoreRecovery}
          onDiscard={handleDiscardRecovery}
        />
      )}

      {/* Hidden File Input for import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileImport}
        accept=".marni,.xml,.bdo,.mid,.midi,.musicxml,.mxl,.json,.bms,*"
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
        onApplyTracks={(fixed) => {
          setTracks(fixed);
          pushHistory(fixed);
        }}
        onGradeChange={setBdoGrade}
        onAuthorChange={handleAuthorChange}
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

      {/* Video & Audio AI Transcriber Modal (Synthesia Cascata / Audio-to-MIDI) */}
      <VideoAudioTranscriberModal
        isOpen={isVideoTranscriberOpen}
        onClose={() => setIsVideoTranscriberOpen(false)}
        tracks={tracks}
        activeTrackId={activeTrackId}
        currentBpm={bpm}
        onImportTranscribedNotes={handleImportAiScore}
      />

      {/* Reset All Confirmation Modal */}
      {isResetConfirmOpen && (
        <div
          className="modal-overlay animate-in fade-in duration-150"
          onClick={() => setIsResetConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md modal-panel p-6 text-[#e0d4c8] select-none"
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
