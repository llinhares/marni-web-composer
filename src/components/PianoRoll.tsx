import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Maximize2,
  Minimize2,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  X as CloseIcon,
  Music,
  Sliders,
  Volume2,
} from 'lucide-react';
import type { Note, Track, ToolMode, GridSnap, TimeSignature } from '../types/music.ts';
import type { PlayheadStore } from '../audio/playheadStore.ts';
import {
  pitchToNoteName,
  isBlackKey,
  snapTickToGrid,
  getGridSnapTicks,
  isPitchInScale,
  getBeatsPerMeasure,
  getBdoDrumInfo,
  BdoDrumPiece,
} from '../utils/musicMath.ts';

const BDO_DRUM_PADS = [
  { pitch: 48, label: 'Bumbo (Kick)', code: '48', icon: '🥁', color: '#f59e0b' },
  { pitch: 50, label: 'Caixa (Snare)', code: '50', icon: '🥁', color: '#f43f5e' },
  { pitch: 51, label: 'Rimshot', code: '51', icon: '🥢', color: '#fb7185' },
  { pitch: 52, label: 'Caixa Flam', code: '52', icon: '🥁', color: '#e11d48' },
  { pitch: 54, label: 'Chimbal Fech.', code: '54', icon: '🪙', color: '#38bdf8' },
  { pitch: 56, label: 'Pedal Chimbal', code: '56', icon: '👣', color: '#0ea5e9' },
  { pitch: 58, label: 'Chimbal Ab.', code: '58', icon: '🔔', color: '#0284c7' },
  { pitch: 53, label: 'Tom 1 (Grave)', code: '53', icon: '🪘', color: '#34d399' },
  { pitch: 55, label: 'Tom 2 (Médio-Grv)', code: '55', icon: '🪘', color: '#10b981' },
  { pitch: 57, label: 'Tom 3 (Médio)', code: '57', icon: '🪘', color: '#059669' },
  { pitch: 59, label: 'Tom 4 (Agudo)', code: '59', icon: '🪘', color: '#047857' },
  { pitch: 60, label: 'Tom 5 (Sup. Agudo)', code: '60', icon: '🪘', color: '#065f46' },
  { pitch: 61, label: 'Crash', code: '61', icon: '💥', color: '#c084fc' },
  { pitch: 62, label: 'Ride', code: '62', icon: '📀', color: '#a855f7' },
];

interface PianoRollProps {
  tracks: Track[];
  activeTrackId: string;
  onUpdateNotes: (trackId: string, notes: Note[], commitHistory?: boolean) => void;
  onAuditionPitch: (pitch: number, velocity?: number) => void;
  toolMode: ToolMode;
  gridSnap: GridSnap;
  timeSignature: TimeSignature;
  accidentals: 'sharp' | 'flat';
  sustenidoActive?: boolean;
  onToggleSustenido?: () => void;
  playhead: PlayheadStore;
  isPlaying?: boolean;
  onSeek: (tick: number) => void;
  zoomLevel: number;
  onZoomChange?: (delta: number) => void;
  scaleType: string;
}

const MIN_PITCH = 12; // C0 (BDO lowest pitch)
const MAX_PITCH = 119; // B8 (BDO highest pitch)
const TOTAL_PITCHES = MAX_PITCH - MIN_PITCH + 1; // 108 pitches
const DEFAULT_KEY_HEIGHT = 20;
const RULER_HEIGHT = 28;

export const PianoRoll: React.FC<PianoRollProps> = ({
  tracks,
  activeTrackId,
  onUpdateNotes,
  onAuditionPitch,
  toolMode,
  gridSnap,
  timeSignature,
  accidentals,
  sustenidoActive = true,
  onToggleSustenido,
  playhead,
  isPlaying = false,
  onSeek,
  zoomLevel,
  onZoomChange,
  scaleType,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Viewport scroll offsets (default centered on Middle C / Octaves 3-5)
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(900);

  // Active track
  const activeTrack = useMemo(
    () => tracks.find((t) => t.id === activeTrackId) || tracks[0],
    [tracks, activeTrackId]
  );
  const activeNotes = activeTrack?.notes || [];
  const isPercussion = activeTrack?.instrumentId === 'percussion';

  // Dynamic keyboard width for drum names with full descriptions
  const keyboardWidth = isPercussion ? 148 : 58;

  // Selected note IDs
  const selectedNoteIds = useMemo(
    () => new Set(activeNotes.filter((n) => n.selected).map((n) => n.id)),
    [activeNotes]
  );

  // Metrics based on zoom & dynamic song length
  const pixelsPerTick = 0.2 * zoomLevel;
  const keyHeight = Math.max(16, Math.min(36, Math.round(DEFAULT_KEY_HEIGHT * Math.sqrt(zoomLevel))));
  const totalGridHeight = TOTAL_PITCHES * keyHeight;
  const beatsPerMeasure = getBeatsPerMeasure(timeSignature);
  const ticksPerMeasure = beatsPerMeasure * 480;

  // Find furthest note or playhead to dynamically extend grid width
  const maxSongTick = useMemo(() => {
    let max = 0;
    tracks.forEach((t) => {
      t.notes.forEach((n) => {
        const end = n.startTick + n.durationTicks;
        if (end > max) max = end;
      });
    });
    return max;
  }, [tracks]);

  // Guarantee at least 64 bars, and expand 48 bars beyond the furthest note
  const totalGridBars = useMemo(() => {
    const minBars = 64;
    const songBars = Math.ceil(maxSongTick / ticksPerMeasure);
    return Math.max(minBars, songBars + 48);
  }, [maxSongTick, ticksPerMeasure]);

  const totalGridTicks = totalGridBars * ticksPerMeasure;
  const totalGridWidth = totalGridTicks * pixelsPerTick;

  // Container resize observer for responsive scrollbars and layout
  const [containerWidth, setContainerWidth] = useState(1000);
  const [containerHeight, setContainerHeight] = useState(700);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      if (container.clientWidth > 0) {
        setContainerWidth(container.clientWidth);
      }
      if (container.clientHeight > 0) {
        setContainerHeight(container.clientHeight);
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Prevent browser page zoom on Ctrl+Wheel and trigger Piano Roll zoom instead
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        onZoomChange?.(delta);
      }
    };

    container.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', onNativeWheel);
  }, [onZoomChange]);

  const [showVelocityLane, setShowVelocityLane] = useState<boolean>(false);
  const [defaultVelocity, setDefaultVelocity] = useState<number>(95);

  const VERTICAL_SCROLLBAR_WIDTH = 12;
  const HORIZONTAL_SCROLLBAR_HEIGHT = 12;
  const VELOCITY_LANE_HEIGHT = showVelocityLane ? 80 : 0;

  const visibleWidth = Math.max(100, containerWidth - keyboardWidth - VERTICAL_SCROLLBAR_WIDTH);
  const visibleHeight = Math.max(
    100,
    containerHeight - RULER_HEIGHT - HORIZONTAL_SCROLLBAR_HEIGHT - VELOCITY_LANE_HEIGHT
  );
  const maxScrollX = Math.max(0, totalGridWidth - visibleWidth);
  const maxScrollY = Math.max(0, totalGridHeight - visibleHeight);

  // Auto-focus drum kit range (pitches 48 to 62) when switching to percussion track
  useEffect(() => {
    if (isPercussion) {
      const centerIndex = MAX_PITCH - 55;
      const targetScroll = Math.max(0, Math.min(maxScrollY, centerIndex * keyHeight - visibleHeight / 2));
      setScrollY(targetScroll);
    }
  }, [isPercussion, activeTrackId, keyHeight, maxScrollY, visibleHeight]);

  // Clamp vertical scroll whenever bounds change (resize, zoom, etc.)
  useEffect(() => {
    setScrollY((prev) => Math.max(0, Math.min(maxScrollY, prev)));
  }, [maxScrollY]);

  // Drag interaction states (including Pan with middle-click or pan tool, and velocity lane editing)
  const [dragAction, setDragAction] = useState<{
    type: 'create' | 'move' | 'resize' | 'pan' | 'selectBox' | 'velocityLane';
    targetNoteId?: string;
    initialNotes?: Map<string, Note>;
    startX: number;
    startY: number;
    currentX?: number;
    currentY?: number;
    startTick: number;
    startPitch: number;
    startScrollX?: number;
    startScrollY?: number;
  } | null>(null);

  // Horizontal Scrollbar dragging state
  const [isDraggingScrollbar, setIsDraggingScrollbar] = useState(false);
  const scrollbarDragStart = useRef<{ startX: number; startScrollX: number }>({ startX: 0, startScrollX: 0 });

  const scrollbarThumbWidth = Math.max(
    36,
    Math.min(visibleWidth, (visibleWidth / Math.max(1, totalGridWidth)) * visibleWidth)
  );
  const scrollbarTrackDistance = Math.max(1, visibleWidth - scrollbarThumbWidth);
  const scrollbarThumbLeft =
    maxScrollX > 0
      ? (Math.min(maxScrollX, Math.max(0, scrollX)) / maxScrollX) * scrollbarTrackDistance
      : 0;

  // Vertical Scrollbar dragging state
  const [isDraggingVerticalScrollbar, setIsDraggingVerticalScrollbar] = useState(false);
  const verticalScrollbarDragStart = useRef<{ startY: number; startScrollY: number }>({ startY: 0, startScrollY: 0 });

  const scrollbarThumbHeight = Math.max(
    36,
    Math.min(visibleHeight, (visibleHeight / Math.max(1, totalGridHeight)) * visibleHeight)
  );
  const scrollbarTrackDistanceY = Math.max(1, visibleHeight - scrollbarThumbHeight);
  const scrollbarThumbTop =
    maxScrollY > 0
      ? (Math.min(maxScrollY, Math.max(0, scrollY)) / maxScrollY) * scrollbarTrackDistanceY
      : 0;

  // Auto-scroll to follow the playhead during playback (driven by the playhead store, not React state)
  const followRef = useRef({ pixelsPerTick, scrollX, keyboardWidth, visibleWidth, maxScrollX });
  followRef.current = { pixelsPerTick, scrollX, keyboardWidth, visibleWidth, maxScrollX };
  const canFollow = isPlaying && dragAction?.type !== 'pan' && !isDraggingScrollbar;

  useEffect(() => {
    if (!canFollow) return;
    const follow = () => {
      const v = followRef.current;
      const tick = playhead.get();
      const playheadX = v.keyboardWidth + tick * v.pixelsPerTick - v.scrollX;
      // Page forward near the right edge, or jump back when the playhead left the view
      if (playheadX > v.keyboardWidth + v.visibleWidth * 0.85 || playheadX < v.keyboardWidth) {
        setScrollX(Math.max(0, Math.min(v.maxScrollX, tick * v.pixelsPerTick - v.visibleWidth * 0.2)));
      }
    };
    follow();
    return playhead.subscribe(follow);
  }, [canFollow, playhead]);

  // Coordinate transformations
  const pitchToY = useCallback(
    (pitch: number) => {
      const index = MAX_PITCH - pitch;
      return RULER_HEIGHT + index * keyHeight - scrollY;
    },
    [keyHeight, scrollY]
  );

  const yToPitch = useCallback(
    (y: number) => {
      const gridY = y - RULER_HEIGHT + scrollY;
      const index = Math.floor(gridY / keyHeight);
      const pitch = MAX_PITCH - index;
      return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
    },
    [keyHeight, scrollY]
  );

  const tickToX = useCallback(
    (tick: number) => {
      return keyboardWidth + tick * pixelsPerTick - scrollX;
    },
    [keyboardWidth, pixelsPerTick, scrollX]
  );

  const xToTick = useCallback(
    (x: number) => {
      const gridX = x - keyboardWidth + scrollX;
      return Math.max(0, gridX / pixelsPerTick);
    },
    [keyboardWidth, pixelsPerTick, scrollX]
  );

  // Keyboard Shortcuts (Ctrl+A, Delete, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        onUpdateNotes(
          activeTrack.id,
          activeNotes.map((n) => ({ ...n, selected: true })),
          false
        );
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNoteIds.size > 0) {
          e.preventDefault();
          onUpdateNotes(
            activeTrack.id,
            activeNotes.filter((n) => !selectedNoteIds.has(n.id)),
            true
          );
        }
      } else if (e.key === 'Escape') {
        onUpdateNotes(
          activeTrack.id,
          activeNotes.map((n) => ({ ...n, selected: false })),
          false
        );
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        // Duplicate selected notes shifted by 1 beat
        if (selectedNoteIds.size > 0) {
          e.preventDefault();
          const snapTicks = getGridSnapTicks(gridSnap) || 480;
          const duplicated = activeNotes
            .filter((n) => selectedNoteIds.has(n.id))
            .map((n) => ({
              ...n,
              id: `note-dup-${Date.now()}-${Math.random()}`,
              startTick: n.startTick + snapTicks,
              selected: true,
            }));
          onUpdateNotes(
            activeTrack.id,
            activeNotes.map((n) => ({ ...n, selected: false })).concat(duplicated),
            true
          );
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTrack.id, activeNotes, selectedNoteIds, gridSnap, onUpdateNotes]);

  // Proportional Expansion and Compression of Selected Notes
  const handleScaleSelection = useCallback(
    (factor: number) => {
      if (selectedNoteIds.size === 0) return;
      const selected = activeNotes.filter((n) => selectedNoteIds.has(n.id));
      if (selected.length === 0) return;

      const minStart = Math.min(...selected.map((n) => n.startTick));
      const snapTicks = getGridSnapTicks(gridSnap) || 60;

      const updated = activeNotes.map((note) => {
        if (!selectedNoteIds.has(note.id)) return note;
        const relativeStart = note.startTick - minStart;
        const newRelativeStart = Math.round(relativeStart * factor);
        const newDuration = Math.max(snapTicks, Math.round(note.durationTicks * factor));
        const newStart = snapTicks > 0 ? snapTickToGrid(minStart + newRelativeStart, gridSnap) : minStart + newRelativeStart;
        return {
          ...note,
          startTick: Math.max(0, newStart),
          durationTicks: newDuration,
        };
      });

      onUpdateNotes(activeTrack.id, updated);
    },
    [activeNotes, selectedNoteIds, activeTrack.id, gridSnap, onUpdateNotes]
  );

  const handleTransposeSelection = useCallback(
    (semitones: number) => {
      if (selectedNoteIds.size === 0) return;
      const updated = activeNotes.map((note) => {
        if (!selectedNoteIds.has(note.id)) return note;
        const newPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, note.pitch + semitones));
        return { ...note, pitch: newPitch };
      });
      onUpdateNotes(activeTrack.id, updated);
    },
    [activeNotes, selectedNoteIds, activeTrack.id, onUpdateNotes]
  );

  const handleDuplicateSelection = useCallback(() => {
    if (selectedNoteIds.size === 0) return;
    const snapTicks = getGridSnapTicks(gridSnap) || 480;
    const selected = activeNotes.filter((n) => selectedNoteIds.has(n.id));
    const duplicated = selected.map((n) => ({
      ...n,
      id: `note-dup-${Date.now()}-${Math.random()}`,
      startTick: n.startTick + snapTicks,
      selected: true,
    }));
    const unselected = activeNotes.map((n) => ({ ...n, selected: false }));
    onUpdateNotes(activeTrack.id, unselected.concat(duplicated));
  }, [activeNotes, selectedNoteIds, activeTrack.id, gridSnap, onUpdateNotes]);

  const handleDeleteSelection = useCallback(() => {
    if (selectedNoteIds.size === 0) return;
    onUpdateNotes(
      activeTrack.id,
      activeNotes.filter((n) => !selectedNoteIds.has(n.id))
    );
  }, [activeNotes, selectedNoteIds, activeTrack.id, onUpdateNotes]);

  const handleDeselectAll = useCallback(() => {
    onUpdateNotes(
      activeTrack.id,
      activeNotes.map((n) => ({ ...n, selected: false })),
      false
    );
  }, [activeNotes, activeTrack.id, onUpdateNotes]);

  // Check if selected notes are currently sharp (black keys)
  const isSelectionSharp = useMemo(() => {
    const selected = activeNotes.filter((n) => selectedNoteIds.has(n.id));
    if (selected.length === 0) return false;
    return selected.every((n) => isBlackKey(n.pitch));
  }, [activeNotes, selectedNoteIds]);

  // Toggle Sustenido on selected notes: if any is natural, sharpen all (+1); if all are sharp, naturalize all (-1)
  const handleToggleSelectionSharp = useCallback(() => {
    if (selectedNoteIds.size === 0) return;
    const selected = activeNotes.filter((n) => selectedNoteIds.has(n.id));
    if (selected.length === 0) return;

    const anyNatural = selected.some((n) => !isBlackKey(n.pitch));

    const updated = activeNotes.map((note) => {
      if (!selectedNoteIds.has(note.id)) return note;
      if (anyNatural) {
        // Turn sharp ON: shift natural note up by 1 semitone
        const newPitch = isBlackKey(note.pitch) ? note.pitch : Math.min(MAX_PITCH, note.pitch + 1);
        return { ...note, pitch: newPitch };
      } else {
        // Turn sharp OFF: shift sharp note down by 1 semitone
        const newPitch = isBlackKey(note.pitch) ? Math.max(MIN_PITCH, note.pitch - 1) : note.pitch;
        return { ...note, pitch: newPitch };
      }
    });

    onUpdateNotes(activeTrack.id, updated);

    // Audition modified pitch
    const firstSelected = updated.find((n) => selectedNoteIds.has(n.id));
    if (firstSelected) {
      onAuditionPitch(firstSelected.pitch);
    }
  }, [activeNotes, selectedNoteIds, activeTrack.id, onUpdateNotes, onAuditionPitch]);

  // Check if all selected notes have Sustain Pedal active
  const isSelectionSustained = useMemo(() => {
    const selected = activeNotes.filter((n) => selectedNoteIds.has(n.id));
    if (selected.length === 0) return false;
    return selected.every((n) => n.sustain);
  }, [activeNotes, selectedNoteIds]);

  const handleToggleSelectionSustain = useCallback(() => {
    if (selectedNoteIds.size === 0) return;
    const shouldSustain = !isSelectionSustained;
    const updated = activeNotes.map((note) => {
      if (!selectedNoteIds.has(note.id)) return note;
      return { ...note, sustain: shouldSustain };
    });
    onUpdateNotes(activeTrack.id, updated, true);
  }, [activeNotes, selectedNoteIds, isSelectionSustained, activeTrack.id, onUpdateNotes]);

  // Selected notes velocity (returns exact number if all identical or 1 selected, or average)
  const selectionVelocity = useMemo(() => {
    const selected = activeNotes.filter((n) => selectedNoteIds.has(n.id));
    if (selected.length === 0) return null;
    const firstVel = selected[0].velocity ?? 95;
    const allSame = selected.every((n) => (n.velocity ?? 95) === firstVel);
    if (allSame) return firstVel;
    const avg = Math.round(selected.reduce((acc, n) => acc + (n.velocity ?? 95), 0) / selected.length);
    return avg;
  }, [activeNotes, selectedNoteIds]);

  // Adjust velocity of all selected notes by delta (e.g. +5 or -5)
  const handleAdjustVelocity = useCallback(
    (delta: number) => {
      if (selectedNoteIds.size === 0) return;
      const updated = activeNotes.map((note) => {
        if (!selectedNoteIds.has(note.id)) return note;
        const currentVel = note.velocity ?? 95;
        const newVel = Math.max(1, Math.min(127, currentVel + delta));
        return { ...note, velocity: newVel };
      });
      onUpdateNotes(activeTrack.id, updated, true);

      // Audition preview with new velocity
      const first = updated.find((n) => selectedNoteIds.has(n.id));
      if (first) {
        setDefaultVelocity(first.velocity);
        onAuditionPitch(first.pitch, first.velocity);
      }
    },
    [activeNotes, selectedNoteIds, activeTrack.id, onUpdateNotes, onAuditionPitch]
  );

  // Set exact velocity on all selected notes
  const handleSetVelocity = useCallback(
    (vel: number) => {
      if (selectedNoteIds.size === 0) return;
      const clamped = Math.max(1, Math.min(127, Math.round(vel)));
      const updated = activeNotes.map((note) => {
        if (!selectedNoteIds.has(note.id)) return note;
        return { ...note, velocity: clamped };
      });
      setDefaultVelocity(clamped);
      onUpdateNotes(activeTrack.id, updated, true);

      const first = updated.find((n) => selectedNoteIds.has(n.id));
      if (first) {
        onAuditionPitch(first.pitch, clamped);
      }
    },
    [activeNotes, selectedNoteIds, activeTrack.id, onUpdateNotes, onAuditionPitch]
  );

  const handleDrumPadClick = useCallback(
    (pitch: number) => {
      onAuditionPitch(pitch);
      const centerIndex = MAX_PITCH - pitch;
      const targetScroll = Math.max(0, Math.min(maxScrollY, centerIndex * keyHeight - visibleHeight / 2));
      setScrollY(targetScroll);
    },
    [onAuditionPitch, keyHeight, maxScrollY, visibleHeight]
  );

  // Main Canvas Render
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const isHeadless =
      typeof navigator !== 'undefined' &&
      (Boolean((navigator as unknown as { webdriver?: boolean }).webdriver) ||
        /HeadlessChrome/i.test(navigator.userAgent));
    const dpr = isHeadless ? 1 : Math.min(2, window.devicePixelRatio || 1);

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Reallocating the backing store is expensive: only do it when the size actually changed
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Grid Background
    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, width, height);

    const gridBottom = RULER_HEIGHT + visibleHeight;

    // 2. Pitch / Drum Rows
    for (let p = MIN_PITCH; p <= MAX_PITCH; p++) {
      const y = pitchToY(p);
      if (y + keyHeight < RULER_HEIGHT || y > gridBottom) continue;

      const isBlack = isBlackKey(p);
      const inScale = isPitchInScale(p, 0, scaleType);
      const drumInfo = isPercussion ? getBdoDrumInfo(p) : null;

      if (isPercussion) {
        if (drumInfo?.isNativeBdo) {
          switch (drumInfo.category) {
            case 'bass':
              ctx.fillStyle = '#2a1a10';
              break;
            case 'snare':
              ctx.fillStyle = '#2d141b';
              break;
            case 'hihat':
              ctx.fillStyle = '#122430';
              break;
            case 'tom':
              ctx.fillStyle = '#13281e';
              break;
            case 'cymbal':
              ctx.fillStyle = '#261430';
              break;
            default:
              ctx.fillStyle = '#1f1b17';
          }
        } else {
          ctx.fillStyle = '#0e0c0b';
        }
      } else {
        if (isBlack) {
          ctx.fillStyle = inScale ? '#171513' : '#12100e';
        } else {
          ctx.fillStyle = inScale ? '#1e1a17' : '#181513';
        }
      }

      ctx.fillRect(keyboardWidth, y, width - keyboardWidth, keyHeight);

      // In drum mode, show watermark of the piece name on the row
      if (isPercussion && drumInfo?.isNativeBdo) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.font = 'bold 9px "JetBrains Mono", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(`[${p}] ${drumInfo.name}`, keyboardWidth + 8, y + keyHeight / 2);
      } else if (isPercussion && !drumInfo?.isNativeBdo) {
        // Dimmed inactive row indicator
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(keyboardWidth, y, width - keyboardWidth, keyHeight);
      }

      // Horizontal Row separator line
      ctx.strokeStyle = p % 12 === 0 ? '#383029' : '#231e1a';
      ctx.lineWidth = p % 12 === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(keyboardWidth, y + keyHeight);
      ctx.lineTo(width, y + keyHeight);
      ctx.stroke();
    }

    // 3. Grid Columns (Beats & Subdivisions)
    const startTickVisible = Math.max(0, Math.floor(xToTick(keyboardWidth)));
    const endTickVisible = Math.ceil(xToTick(width));
    const snapTicks = getGridSnapTicks(gridSnap);
    const snapToDraw = snapTicks < 120 ? 120 : snapTicks;
    const firstSnapTick = Math.floor(startTickVisible / snapToDraw) * snapToDraw;

    for (let t = firstSnapTick; t <= endTickVisible; t += snapToDraw) {
      const x = tickToX(t);
      if (x < keyboardWidth || x > width) continue;

      const isMeasureLine = t % ticksPerMeasure === 0;
      const isBeatLine = t % 480 === 0;

      if (isMeasureLine) {
        ctx.strokeStyle = '#3e342b';
        ctx.lineWidth = 1.5;
      } else if (isBeatLine) {
        ctx.strokeStyle = '#28231e';
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = '#1e1a16';
        ctx.lineWidth = 0.8;
      }

      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT);
      ctx.lineTo(x, gridBottom);
      ctx.stroke();
    }

    // 4. Ghost Notes for Inactive Tracks
    tracks.forEach((track) => {
      if (track.id === activeTrack?.id || track.isMuted) return;
      ctx.fillStyle = 'rgba(168, 162, 158, 0.2)';
      track.notes.forEach((note) => {
        const x = tickToX(note.startTick);
        const y = pitchToY(note.pitch);
        const w = note.durationTicks * pixelsPerTick;
        if (x + w < keyboardWidth || x > width || y + keyHeight < RULER_HEIGHT || y > gridBottom) return;
        ctx.fillRect(x, y + 2, Math.max(4, w), keyHeight - 4);
      });
    });

    // 5. Active Track Notes (Amber Gold with Selection Highlighting & Velocity Visuals)
    activeNotes.forEach((note) => {
      const x = tickToX(note.startTick);
      const y = pitchToY(note.pitch);
      const w = Math.max(6, note.durationTicks * pixelsPerTick);
      if (x + w < keyboardWidth || x > width || y + keyHeight < RULER_HEIGHT || y > gridBottom) return;

      const isSelected = note.selected;
      const vel = Math.max(1, Math.min(127, note.velocity ?? 95));
      const velRatio = vel / 127;

      const gradient = ctx.createLinearGradient(x, y, x, y + keyHeight);
      if (isSelected) {
        gradient.addColorStop(0, '#fef08a');
        gradient.addColorStop(1, '#f59e0b');
      } else {
        const topAlpha = 0.55 + velRatio * 0.45;
        gradient.addColorStop(0, `rgba(223, 168, 106, ${topAlpha})`);
        gradient.addColorStop(1, `rgba(194, 133, 67, ${topAlpha})`);
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y + 1.5, w, keyHeight - 3, 3);
      ctx.fill();

      // Velocity Level Indicator Bar at bottom of note
      const velBarW = Math.max(2, (w - 4) * velRatio);
      ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.75)' : 'rgba(245, 158, 11, 0.65)';
      ctx.fillRect(x + 2, y + keyHeight - 3.5, velBarW, 1.5);

      // Sustain Pedal Visual Indicator
      if (note.sustain) {
        ctx.fillStyle = isSelected ? '#ffffff' : '#67e8f9';
        ctx.beginPath();
        ctx.arc(x + 4, y + keyHeight - 5.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Outer Selection Glow / Stroke
      ctx.strokeStyle = isSelected ? '#ffffff' : '#7c4d1e';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Right Resize Handle Grip
      if (w > 12) {
        ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
        ctx.fillRect(x + w - 4, y + 3, 2.5, keyHeight - 6);
      }

      // Note Label
      if (w > 26) {
        ctx.fillStyle = isSelected ? '#1c1917' : '#1a140f';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        let label = pitchToNoteName(note.pitch, accidentals);
        if (isPercussion) {
          const drum = getBdoDrumInfo(note.pitch);
          if (drum) label = drum.code;
        }
        if (w > 56) {
          label = `${label} (${vel})`;
        }
        ctx.fillText(label, x + 4, y + keyHeight / 2 - 1);
      }
    });

    // 5.5 Velocity Lane (when enabled)
    if (showVelocityLane) {
      const laneTop = RULER_HEIGHT + visibleHeight;
      const laneHeight = VELOCITY_LANE_HEIGHT;

      // Lane Background
      ctx.fillStyle = '#171412';
      ctx.fillRect(keyboardWidth, laneTop, width - keyboardWidth, laneHeight);

      // Top divider border
      ctx.strokeStyle = '#383029';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, laneTop);
      ctx.lineTo(width, laneTop);
      ctx.stroke();

      // Keyboard left corner for Velocity Lane
      ctx.fillStyle = '#141210';
      ctx.fillRect(0, laneTop, keyboardWidth, laneHeight);
      ctx.strokeStyle = '#2d2722';
      ctx.strokeRect(0, laneTop, keyboardWidth, laneHeight);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 9px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('VELOCITY', 6, laneTop + 6);

      ctx.fillStyle = '#78716c';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText('127 (ff)', 6, laneTop + 20);
      ctx.fillText('95 (mf)', 6, laneTop + 36);
      ctx.fillText('60 (p)', 6, laneTop + 50);
      ctx.fillText('1 (min)', 6, laneTop + 64);

      // Horizontal dashed guide lines at velocity levels (127, 95, 60)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      [127, 95, 60].forEach((v) => {
        const lineY = laneTop + laneHeight - 6 - (v / 127) * (laneHeight - 18);
        ctx.beginPath();
        ctx.moveTo(keyboardWidth, lineY);
        ctx.lineTo(width, lineY);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // Draw velocity stems for each note in active track
      activeNotes.forEach((n) => {
        const nx = tickToX(n.startTick) + 2;
        if (nx < keyboardWidth || nx > width) return;

        const vel = Math.max(1, Math.min(127, n.velocity ?? 95));
        const barH = (vel / 127) * (laneHeight - 18);
        const stemTop = laneTop + laneHeight - 6 - barH;
        const stemBottom = laneTop + laneHeight - 6;

        // Stem line
        ctx.strokeStyle = n.selected ? '#fef08a' : '#d97706';
        ctx.lineWidth = n.selected ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(nx, stemBottom);
        ctx.lineTo(nx, stemTop);
        ctx.stroke();

        // Knob at top
        ctx.fillStyle = n.selected ? '#ffffff' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(nx, stemTop, n.selected ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
        if (n.selected) {
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }

    // 6. Marquee Selection Box
    if (
      dragAction?.type === 'selectBox' &&
      dragAction.currentX !== undefined &&
      dragAction.currentY !== undefined
    ) {
      const boxLeft = Math.min(dragAction.startX, dragAction.currentX);
      const boxTop = Math.min(dragAction.startY, dragAction.currentY);
      const boxWidth = Math.abs(dragAction.currentX - dragAction.startX);
      const boxHeight = Math.abs(dragAction.currentY - dragAction.startY);

      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(boxLeft, boxTop, boxWidth, boxHeight);
      ctx.setLineDash([]);
    }

    // 7. Timeline Ruler at Top
    ctx.fillStyle = '#161412';
    ctx.fillRect(keyboardWidth, 0, width - keyboardWidth, RULER_HEIGHT);

    ctx.strokeStyle = '#2d2722';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(keyboardWidth, RULER_HEIGHT);
    ctx.lineTo(width, RULER_HEIGHT);
    ctx.stroke();

    const firstMeasure = Math.floor(startTickVisible / ticksPerMeasure);
    const lastMeasure = Math.ceil(endTickVisible / ticksPerMeasure) + 1;

    for (let m = firstMeasure; m <= lastMeasure; m++) {
      const mTick = m * ticksPerMeasure;
      const x = tickToX(mTick);
      if (x < keyboardWidth || x > width) continue;

      ctx.strokeStyle = '#57483b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.stroke();

      ctx.fillStyle = '#a89f91';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(String(m + 1), x + 4, 6);

      for (let b = 1; b < beatsPerMeasure; b++) {
        const bTick = mTick + b * 480;
        const bx = tickToX(bTick);
        if (bx >= keyboardWidth && bx <= width) {
          ctx.strokeStyle = '#382f27';
          ctx.beginPath();
          ctx.moveTo(bx, RULER_HEIGHT - 6);
          ctx.lineTo(bx, RULER_HEIGHT);
          ctx.stroke();
        }
      }
    }

    // 8. Left Vertical Keyboard Column (with BDO Drum Mapping Support!)
    ctx.fillStyle = '#191614';
    ctx.fillRect(0, 0, keyboardWidth, gridBottom);

    for (let p = MIN_PITCH; p <= MAX_PITCH; p++) {
      const y = pitchToY(p);
      if (y + keyHeight < RULER_HEIGHT || y > gridBottom) continue;

      const isBlack = isBlackKey(p);
      const isC = p % 12 === 0;
      const drumInfo = isPercussion ? getBdoDrumInfo(p) : null;

      // Key Background
      if (isPercussion && drumInfo) {
        if (drumInfo.isNativeBdo) {
          ctx.fillStyle = '#26201b';
        } else {
          ctx.fillStyle = '#1a1614';
        }
      } else {
        ctx.fillStyle = isBlack ? '#12100e' : '#231f1c';
      }
      ctx.fillRect(0, y, keyboardWidth, keyHeight);

      // Key separator
      ctx.strokeStyle = isC || (drumInfo?.isNativeBdo) ? '#524335' : '#141210';
      ctx.lineWidth = isC ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y + keyHeight);
      ctx.lineTo(keyboardWidth, y + keyHeight);
      ctx.stroke();

      // Key Label Text
      if (isPercussion) {
        if (drumInfo?.isNativeBdo) {
          // Category indicator dot
          ctx.fillStyle =
            drumInfo.category === 'bass'
              ? '#f59e0b'
              : drumInfo.category === 'snare'
              ? '#f43f5e'
              : drumInfo.category === 'hihat'
              ? '#38bdf8'
              : drumInfo.category === 'cymbal'
              ? '#a855f7'
              : '#34d399';
          ctx.beginPath();
          ctx.arc(8, y + keyHeight / 2, 3, 0, Math.PI * 2);
          ctx.fill();

          // Pitch number badge
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(p), 16, y + keyHeight / 2);

          // Drum short name
          ctx.fillStyle = '#f5f5f4';
          ctx.font = 'bold 9.5px sans-serif';
          ctx.fillText(drumInfo.shortName, 36, y + keyHeight / 2);
        } else {
          ctx.fillStyle = '#57534e';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${pitchToNoteName(p, accidentals)} (Inativo)`, 8, y + keyHeight / 2);
        }
      } else {
        ctx.fillStyle = isBlack ? '#786e65' : isC ? '#e5a855' : '#a89f91';
        ctx.font = isC ? 'bold 10px "JetBrains Mono", monospace' : '9px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(pitchToNoteName(p, accidentals), 8, y + keyHeight / 2);
      }
    }

    // Top-Left Corner Box
    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, keyboardWidth, RULER_HEIGHT);
    ctx.strokeStyle = '#2d2722';
    ctx.strokeRect(0, 0, keyboardWidth, RULER_HEIGHT);

    if (isPercussion) {
      ctx.fillStyle = '#d4ab6a';
      ctx.font = 'bold 9px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('Bateria BDO', 8, RULER_HEIGHT / 2);
    }

    ctx.restore();
  }, [
    activeNotes,
    activeTrack,
    tracks,
    scrollX,
    scrollY,
    zoomLevel,
    keyHeight,
    pixelsPerTick,
    accidentals,
    gridSnap,
    timeSignature,
    scaleType,
    keyboardWidth,
    isPercussion,
    dragAction,
    pitchToY,
    xToTick,
    tickToX,
    ticksPerMeasure,
    beatsPerMeasure,
    showVelocityLane,
    visibleHeight,
  ]);

  // Scrollbar Dragging and Clicking Handlers
  const handleScrollbarThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDraggingScrollbar(true);
    scrollbarDragStart.current = {
      startX: e.clientX,
      startScrollX: scrollX,
    };
  };

  const handleScrollbarThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingScrollbar) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - scrollbarDragStart.current.startX;
    const scrollDelta = (dx / scrollbarTrackDistance) * maxScrollX;
    setScrollX(Math.max(0, Math.min(maxScrollX, scrollbarDragStart.current.startScrollX + scrollDelta)));
  };

  const handleScrollbarThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingScrollbar) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsDraggingScrollbar(false);
    }
  };

  const handleScrollbarTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const targetThumbLeft = clickX - scrollbarThumbWidth / 2;
    const ratio = Math.max(0, Math.min(1, targetThumbLeft / scrollbarTrackDistance));
    setScrollX(ratio * maxScrollX);
  };

  // Vertical Scrollbar Dragging and Clicking Handlers
  const handleVerticalScrollbarThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDraggingVerticalScrollbar(true);
    verticalScrollbarDragStart.current = {
      startY: e.clientY,
      startScrollY: scrollY,
    };
  };

  const handleVerticalScrollbarThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingVerticalScrollbar) return;
    e.preventDefault();
    e.stopPropagation();
    const dy = e.clientY - verticalScrollbarDragStart.current.startY;
    const scrollDelta = (dy / scrollbarTrackDistanceY) * maxScrollY;
    setScrollY(Math.max(0, Math.min(maxScrollY, verticalScrollbarDragStart.current.startScrollY + scrollDelta)));
  };

  const handleVerticalScrollbarThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingVerticalScrollbar) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsDraggingVerticalScrollbar(false);
    }
  };

  const handleVerticalScrollbarTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const targetThumbTop = clickY - scrollbarThumbHeight / 2;
    const ratio = Math.max(0, Math.min(1, targetThumbTop / scrollbarTrackDistanceY));
    setScrollY(ratio * maxScrollY);
  };

  // Pointer Interaction (Selection, Proportional Resize, Move, Pan)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 0. Middle Click (Button 1) or Hand/Pan Tool
    if (e.button === 1 || toolMode === 'pan') {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setDragAction({
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startScrollX: scrollX,
        startScrollY: scrollY,
        startTick: 0,
        startPitch: 0,
      });
      return;
    }

    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 1. Clicked Keyboard
    if (x < keyboardWidth) {
      if (y >= RULER_HEIGHT) {
        const pitch = yToPitch(y);
        onAuditionPitch(pitch);
      }
      return;
    }

    // 2. Clicked Ruler
    if (y < RULER_HEIGHT) {
      const clickTick = snapTickToGrid(xToTick(x), gridSnap);
      onSeek(clickTick);
      return;
    }

    // 2.5 Clicked inside Velocity Lane!
    const laneTop = RULER_HEIGHT + visibleHeight;
    if (showVelocityLane && y >= laneTop && y <= laneTop + VELOCITY_LANE_HEIGHT) {
      if (x < keyboardWidth) return;
      const clampedY = Math.max(laneTop + 4, Math.min(laneTop + VELOCITY_LANE_HEIGHT - 6, y));
      const calculatedVel = Math.max(
        1,
        Math.min(
          127,
          Math.round(((laneTop + VELOCITY_LANE_HEIGHT - 6 - clampedY) / (VELOCITY_LANE_HEIGHT - 18)) * 127)
        )
      );

      // Find note near this x (within 14px)
      const nearbyNote = activeNotes.find((n) => {
        const nX = tickToX(n.startTick);
        return Math.abs(x - nX) <= 14;
      });

      if (nearbyNote) {
        const updated = activeNotes.map((n) =>
          n.id === nearbyNote.id ? { ...n, velocity: calculatedVel, selected: true } : n
        );
        onUpdateNotes(activeTrack.id, updated, true);
        onAuditionPitch(nearbyNote.pitch, calculatedVel);
        setDefaultVelocity(calculatedVel);
      }

      setDragAction({
        type: 'velocityLane',
        startX: x,
        startY: y,
        startTick: xToTick(x),
        startPitch: 0,
        targetNoteId: nearbyNote?.id,
      });
      return;
    }

    const clickedTick = xToTick(x);
    const clickedPitch = yToPitch(y);

    // 3. Find if a note was clicked
    const clickedNote = activeNotes.find((note) => {
      const noteX = tickToX(note.startTick);
      const noteY = pitchToY(note.pitch);
      const noteW = Math.max(6, note.durationTicks * pixelsPerTick);
      return x >= noteX && x <= noteX + noteW && y >= noteY && y <= noteY + keyHeight;
    });

    if (toolMode === 'eraser') {
      if (clickedNote) {
        onUpdateNotes(
          activeTrack.id,
          activeNotes.filter((n) => n.id !== clickedNote.id)
        );
      }
      return;
    }

    if (clickedNote) {
      const noteX = tickToX(clickedNote.startTick);
      const noteW = Math.max(6, clickedNote.durationTicks * pixelsPerTick);
      const isRightEdge = x >= noteX + noteW - 8;

      let newActiveNotes = [...activeNotes];

      // Shift-click toggles selection
      if (e.shiftKey) {
        newActiveNotes = newActiveNotes.map((n) =>
          n.id === clickedNote.id ? { ...n, selected: !n.selected } : n
        );
      } else if (!clickedNote.selected) {
        // Unselected note clicked without shift -> select only this note
        newActiveNotes = newActiveNotes.map((n) =>
          n.id === clickedNote.id ? { ...n, selected: true } : { ...n, selected: false }
        );
      }

      onUpdateNotes(activeTrack.id, newActiveNotes, false);
      const noteVel = clickedNote.velocity ?? 95;
      setDefaultVelocity(noteVel);
      onAuditionPitch(clickedNote.pitch, noteVel);

      // Snapshot initial state of all currently selected notes for proportional resize/move
      const selectedMap = new Map<string, Note>();
      newActiveNotes.forEach((n) => {
        if (n.selected || n.id === clickedNote.id) {
          selectedMap.set(n.id, { ...n });
        }
      });

      if (isRightEdge) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        setDragAction({
          type: 'resize',
          targetNoteId: clickedNote.id,
          initialNotes: selectedMap,
          startX: x,
          startY: y,
          startScrollX: scrollX,
          startScrollY: scrollY,
          startTick: clickedNote.startTick,
          startPitch: clickedNote.pitch,
        });
      } else {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        setDragAction({
          type: 'move',
          targetNoteId: clickedNote.id,
          initialNotes: selectedMap,
          startX: x,
          startY: y,
          startScrollX: scrollX,
          startScrollY: scrollY,
          startTick: clickedNote.startTick,
          startPitch: clickedNote.pitch,
        });
      }
    } else {
      // Clicked on empty space: Marquee Box Select OR Pencil Draw
      if (toolMode === 'pointer' || toolMode === 'select' || e.shiftKey) {
        if (!e.shiftKey) {
          // Deselect all
          onUpdateNotes(
            activeTrack.id,
            activeNotes.map((n) => ({ ...n, selected: false })),
            false
          );
        }
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        setDragAction({
          type: 'selectBox',
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          startTick: clickedTick,
          startPitch: clickedPitch,
        });
      } else {
        // Draw new note
        const snappedTick = snapTickToGrid(clickedTick, gridSnap);
        const snapTicks = getGridSnapTicks(gridSnap);
        const defaultDuration = snapTicks > 1 ? snapTicks : 480;

        // Apply Sustenido to new note if active and not a percussion trigger
        let finalPitch = clickedPitch;
        if (sustenidoActive && !isPercussion) {
          if (!isBlackKey(clickedPitch)) {
            finalPitch = Math.min(MAX_PITCH, clickedPitch + 1);
          }
        }

        const hasTrackSustain =
          activeTrack.instrumentId === 'grand-piano' || Boolean(activeTrack.sustainPedal);

        const newNote: Note = {
          id: `note-${Date.now()}-${Math.random()}`,
          trackId: activeTrack.id,
          pitch: finalPitch,
          startTick: snappedTick,
          durationTicks: defaultDuration,
          velocity: defaultVelocity,
          selected: true,
          sustain: hasTrackSustain,
        };

        const updated: Note[] = [
          ...activeNotes.map((n) => ({ ...n, selected: false })),
          newNote,
        ];
        onAuditionPitch(finalPitch, defaultVelocity);
        onUpdateNotes(activeTrack.id, updated);

        const map = new Map<string, Note>();
        map.set(newNote.id, { ...newNote });

        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        setDragAction({
          type: 'resize',
          targetNoteId: newNote.id,
          initialNotes: map,
          startX: x,
          startY: y,
          startScrollX: scrollX,
          startScrollY: scrollY,
          startTick: newNote.startTick,
          startPitch: newNote.pitch,
        });
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 0. Pan Dragging
    if (dragAction?.type === 'pan') {
      e.currentTarget.style.cursor = 'grabbing';
      const dx = e.clientX - dragAction.startX;
      const dy = e.clientY - dragAction.startY;
      const startX = dragAction.startScrollX ?? scrollX;
      const startY = dragAction.startScrollY ?? scrollY;

      setScrollX(Math.max(0, Math.min(maxScrollX, startX - dx)));
      setScrollY(Math.max(0, Math.min(maxScrollY, startY - dy)));
      return;
    }

    if (!dragAction) {
      if (toolMode === 'pan') {
        e.currentTarget.style.cursor = 'grab';
        return;
      }
      if (x < keyboardWidth) {
        e.currentTarget.style.cursor = 'pointer';
        return;
      }
      if (y < RULER_HEIGHT) {
        e.currentTarget.style.cursor = 'col-resize';
        return;
      }

      // Check if mouse is hovering over right edge of any note
      const hoveredNote = activeNotes.find((note) => {
        const noteX = tickToX(note.startTick);
        const noteY = pitchToY(note.pitch);
        const noteW = Math.max(6, note.durationTicks * pixelsPerTick);
        return x >= noteX && x <= noteX + noteW && y >= noteY && y <= noteY + keyHeight;
      });

      if (hoveredNote) {
        const noteX = tickToX(hoveredNote.startTick);
        const noteW = Math.max(6, hoveredNote.durationTicks * pixelsPerTick);
        const isRightEdge = x >= noteX + noteW - 8;
        if (isRightEdge) {
          e.currentTarget.style.cursor = 'ew-resize';
        } else if (toolMode === 'eraser') {
          e.currentTarget.style.cursor = 'not-allowed';
        } else {
          e.currentTarget.style.cursor = 'move';
        }
      } else {
        if (toolMode === 'select') {
          e.currentTarget.style.cursor = 'crosshair';
        } else if (toolMode === 'pencil') {
          e.currentTarget.style.cursor = 'crosshair';
        } else if (toolMode === 'eraser') {
          e.currentTarget.style.cursor = 'default';
        } else {
          e.currentTarget.style.cursor = 'default';
        }
      }
      return;
    }

    if (dragAction.type === 'velocityLane') {
      const laneTop = RULER_HEIGHT + visibleHeight;
      const laneBottom = laneTop + VELOCITY_LANE_HEIGHT;
      const clampedY = Math.max(laneTop + 10, Math.min(laneBottom - 8, y));
      const normalizedRatio = 1 - (clampedY - (laneTop + 10)) / (VELOCITY_LANE_HEIGHT - 18);
      const calculatedVel = Math.max(1, Math.min(127, Math.round(normalizedRatio * 127)));

      const noteToUpdate =
        (dragAction.targetNoteId && activeNotes.find((n) => n.id === dragAction.targetNoteId)) ||
        activeNotes.find((n) => {
          const noteX = tickToX(n.startTick);
          return Math.abs(noteX - x) < 20;
        });

      if (noteToUpdate) {
        const isSelected = noteToUpdate.selected;
        let updated: Note[];
        if (isSelected && selectedNoteIds.size > 1) {
          const diff = calculatedVel - (noteToUpdate.velocity ?? 95);
          updated = activeNotes.map((n) => {
            if (n.selected) {
              const cur = n.velocity ?? 95;
              return { ...n, velocity: Math.max(1, Math.min(127, cur + diff)) };
            }
            return n;
          });
        } else {
          updated = activeNotes.map((n) =>
            n.id === noteToUpdate.id ? { ...n, velocity: calculatedVel } : n
          );
        }
        onUpdateNotes(activeTrack.id, updated, false);
        setDefaultVelocity(calculatedVel);
      }
      return;
    }

    if (dragAction.type === 'selectBox') {
      setDragAction((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null));

      // Calculate bounding box in canvas coordinates
      const boxLeft = Math.min(dragAction.startX, x);
      const boxRight = Math.max(dragAction.startX, x);
      const boxTop = Math.min(dragAction.startY, y);
      const boxBottom = Math.max(dragAction.startY, y);

      // Select all notes whose visual box intersects with selection box
      const updated = activeNotes.map((note) => {
        const noteX = tickToX(note.startTick);
        const noteY = pitchToY(note.pitch);
        const noteW = Math.max(6, note.durationTicks * pixelsPerTick);
        const noteBottom = noteY + keyHeight;

        const intersects =
          noteX < boxRight &&
          noteX + noteW > boxLeft &&
          noteY < boxBottom &&
          noteBottom > boxTop;

        return { ...note, selected: intersects };
      });

      onUpdateNotes(activeTrack.id, updated, false);
    } else if (dragAction.type === 'resize' && dragAction.targetNoteId && dragAction.initialNotes) {
      const targetInitial = dragAction.initialNotes.get(dragAction.targetNoteId);
      if (!targetInitial) return;

      const currentTick = snapTickToGrid(xToTick(x), gridSnap);
      const minDuration = getGridSnapTicks(gridSnap) || 60;
      const newTargetDuration = Math.max(minDuration, currentTick - targetInitial.startTick);

      // Proportional ratio based on target note expansion
      const ratio = newTargetDuration / Math.max(1, targetInitial.durationTicks);

      const allInitials = Array.from(dragAction.initialNotes.values());
      const minStart = Math.min(...allInitials.map((n) => n.startTick));

      const updated = activeNotes.map((note) => {
        const initial = dragAction.initialNotes?.get(note.id);
        if (initial) {
          const scaledDur = Math.max(minDuration, Math.round(initial.durationTicks * ratio));
          // If multiple notes are selected across time, scale their start positions proportionally too
          const scaledStart =
            dragAction.initialNotes!.size > 1
              ? minStart + Math.round((initial.startTick - minStart) * ratio)
              : initial.startTick;
          return {
            ...note,
            startTick: Math.max(0, snapTickToGrid(scaledStart, gridSnap)),
            durationTicks: scaledDur,
          };
        }
        return note;
      });

      onUpdateNotes(activeTrack.id, updated, false);
    } else if (dragAction.type === 'move' && dragAction.initialNotes) {
      const allInitials = Array.from(dragAction.initialNotes.values());
      const minInitialTick = Math.min(...allInitials.map((n) => n.startTick));
      const minInitialPitch = Math.min(...allInitials.map((n) => n.pitch));
      const maxInitialPitch = Math.max(...allInitials.map((n) => n.pitch));

      const rawDxTicks =
        ((x + scrollX) - (dragAction.startX + (dragAction.startScrollX ?? scrollX))) /
        pixelsPerTick;
      const dxTicks = snapTickToGrid(rawDxTicks, gridSnap);
      const clampedDxTicks = Math.max(-minInitialTick, dxTicks);

      const dyPitch = Math.round(yToPitch(y) - dragAction.startPitch);
      const clampedDyPitch = Math.max(
        MIN_PITCH - minInitialPitch,
        Math.min(MAX_PITCH - maxInitialPitch, dyPitch)
      );

      const updated = activeNotes.map((note) => {
        const initial = dragAction.initialNotes?.get(note.id);
        if (initial) {
          const newStartTick = Math.max(0, initial.startTick + clampedDxTicks);
          const newPitch = initial.pitch + clampedDyPitch;
          return { ...note, startTick: newStartTick, pitch: newPitch };
        }
        return note;
      });

      onUpdateNotes(activeTrack.id, updated, false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (
      dragAction?.type === 'resize' ||
      dragAction?.type === 'move' ||
      dragAction?.type === 'velocityLane'
    ) {
      // Commit once upon gesture completion
      onUpdateNotes(activeTrack.id, activeNotes, true);
    }
    setDragAction(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
      onZoomChange?.(zoomDelta);
      return;
    }

    if (e.altKey) {
      const delta = e.deltaY < 0 ? 5 : -5;
      handleAdjustVelocity(delta);
      return;
    }

    if (e.shiftKey) {
      setScrollX((prev) => Math.max(0, Math.min(maxScrollX, prev + e.deltaY)));
    } else {
      setScrollY((prev) => Math.max(0, Math.min(maxScrollY, prev + e.deltaY)));
      if (Math.abs(e.deltaX) > 0) {
        setScrollX((prev) => Math.max(0, Math.min(maxScrollX, prev + e.deltaX)));
      }
    }
  };

  // Playhead overlay: a separate transparent canvas, so moving the playhead never repaints the grid/notes
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = containerWidth;
    const height = containerHeight;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    let frame = 0;
    const draw = () => {
      frame = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const x = keyboardWidth + playhead.get() * pixelsPerTick - scrollX;
      if (x < keyboardWidth || x > width) return;

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(x - 5, 0);
      ctx.lineTo(x + 5, 0);
      ctx.lineTo(x, 10);
      ctx.closePath();
      ctx.fill();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    draw();
    const unsubscribe = playhead.subscribe(schedule);
    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [playhead, keyboardWidth, pixelsPerTick, scrollX, containerWidth, containerHeight]);

  return (
    <div
      ref={containerRef}
      className="flex-1 h-full w-full relative overflow-hidden bg-[#141210] touch-none select-none"
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        className="w-full h-full block"
      />
      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />

      {/* Top BDO Drum Kit Quick-Pads Bar (Visible when active track is percussion) */}
      {isPercussion && (
        <div className="absolute top-10 left-38 right-4 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#181513]/95 border border-amber-600/40 shadow-xl backdrop-blur-md z-30 overflow-x-auto text-xs">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-amber-400 text-[11px] tracking-wide">
              Bateria BDO (Notas 48 a 62):
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto">
            {BDO_DRUM_PADS.map((pad) => (
              <button
                key={pad.pitch}
                onClick={() => handleDrumPadClick(pad.pitch)}
                className="px-2 py-1 rounded bg-[#231e1a] hover:bg-[#2e2620] border border-[#3e342b] hover:border-amber-500/80 text-[11px] text-stone-200 transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                title={`Tocar e Focar no ${pad.label} (Nota ${pad.pitch})`}
              >
                <span>{pad.icon}</span>
                <span className="font-medium">{pad.label}</span>
                <span className="text-[9px] font-mono text-amber-400/80 font-bold">[{pad.code}]</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating Multi-Selection & Proportional Transform Toolbar */}
      {selectedNoteIds.size > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 px-3 rounded-xl bg-[#1c1917]/95 border border-amber-500/70 shadow-2xl backdrop-blur-md z-40 text-xs whitespace-nowrap max-w-[calc(100vw-2rem)] overflow-x-auto">
          <div className="flex items-center gap-2 pr-2 border-r border-[#3e342b] shrink-0 whitespace-nowrap">
            <span className="px-2 py-0.5 rounded-md bg-amber-500 text-stone-950 font-bold text-xs shadow-sm whitespace-nowrap">
              {selectedNoteIds.size} notas
            </span>
            <span className="text-[11px] text-stone-300 font-medium hidden md:inline whitespace-nowrap">
              Selecionadas
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
            {/* Proportional 2x Expand */}
            <button
              onClick={() => handleScaleSelection(2)}
              className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-[#3e342b] hover:border-amber-500 text-stone-200 text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm whitespace-nowrap shrink-0"
              title="Expandir todas as notas e compassos selecionados proporcionalmente em 2x"
            >
              <Maximize2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="whitespace-nowrap">2x Expandir</span>
            </button>

            {/* Proportional 0.5x Shrink */}
            <button
              onClick={() => handleScaleSelection(0.5)}
              className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-[#3e342b] hover:border-amber-500 text-stone-200 text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm whitespace-nowrap shrink-0"
              title="Encolher todas as notas e compassos selecionados proporcionalmente em 0.5x"
            >
              <Minimize2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="whitespace-nowrap">0.5x Encolher</span>
            </button>

            {/* Transpose Up +1 */}
            <button
              onClick={() => handleTransposeSelection(1)}
              className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-[#3e342b] hover:border-amber-500 text-stone-300 transition-colors shrink-0"
              title="Transpor +1 Semitom (Subir)"
            >
              <ArrowUp className="w-3.5 h-3.5 text-amber-400" />
            </button>

            {/* Transpose Down -1 */}
            <button
              onClick={() => handleTransposeSelection(-1)}
              className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-[#3e342b] hover:border-amber-500 text-stone-300 transition-colors shrink-0"
              title="Transpor -1 Semitom (Descer)"
            >
              <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
            </button>

            {/* Sustenido (#) Toggle for Selected Notes */}
            <button
              onClick={handleToggleSelectionSharp}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all shadow-sm whitespace-nowrap shrink-0 ${
                isSelectionSharp
                  ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                  : 'bg-stone-900 hover:bg-stone-800 border-[#3e342b] hover:border-amber-500 text-stone-200'
              }`}
              title={
                isSelectionSharp
                  ? 'Desligar Sustenido da(s) nota(s) selecionada(s) (-1 semitom para natural)'
                  : 'Ligar Sustenido para a(s) nota(s) selecionada(s) (+1 semitom para sustenido)'
              }
            >
              <span className="font-mono font-bold text-sm leading-none shrink-0">#</span>
              <span className="whitespace-nowrap">{isSelectionSharp ? 'Sustenido (#)' : 'Natural'}</span>
            </button>

            {/* Pedal de Sustain Toggle for Selected Notes */}
            <button
              onClick={handleToggleSelectionSustain}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm whitespace-nowrap shrink-0 ${
                isSelectionSustained
                  ? 'bg-amber-400 text-stone-950 border-amber-300 font-bold shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                  : 'bg-stone-900 hover:bg-stone-800 border-[#3e342b] hover:border-amber-500 text-stone-200'
              }`}
              title={
                isSelectionSustained
                  ? 'Desativar Pedal de Sustain nas notas selecionadas'
                  : 'Ativar Pedal de Sustain nas notas selecionadas (ressonância do BDO, gravado como byte 11)'
              }
            >
              <span className="text-xs font-serif font-bold italic tracking-tighter shrink-0">Ped</span>
              <span className="whitespace-nowrap">{isSelectionSustained ? 'Pedal Ativo' : 'Pedal'}</span>
            </button>

            {/* Intensidade (Velocity) Controls */}
            <div className="flex items-center gap-1 pl-2 pr-1 border-l border-[#3e342b] whitespace-nowrap shrink-0">
              <span className="text-[11px] text-amber-400 font-bold flex items-center gap-1 mr-0.5 whitespace-nowrap shrink-0">
                <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">Vel:</span>
              </span>
              <button
                onClick={() => handleAdjustVelocity(-5)}
                className="w-6 h-6 rounded bg-stone-900 hover:bg-stone-800 border border-[#3e342b] hover:border-amber-500 text-stone-200 font-bold text-xs flex items-center justify-center transition-colors shadow-sm shrink-0"
                title="Diminuir intensidade (-5) de todas as notas selecionadas"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={127}
                value={selectionVelocity ?? ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    handleSetVelocity(val);
                  }
                }}
                className="w-11 h-6 bg-stone-900 border border-[#3e342b] focus:border-amber-400 rounded text-center text-xs text-amber-300 font-bold focus:outline-none shrink-0"
                title="Intensidade / Velocity (1 a 127) de todas as notas selecionadas"
              />
              <button
                onClick={() => handleAdjustVelocity(5)}
                className="w-6 h-6 rounded bg-stone-900 hover:bg-stone-800 border border-[#3e342b] hover:border-amber-500 text-stone-200 font-bold text-xs flex items-center justify-center transition-colors shadow-sm shrink-0"
                title="Aumentar intensidade (+5) de todas as notas selecionadas"
              >
                +
              </button>

              {/* Dynamic Presets: p, mp, mf, f, ff */}
              <div className="flex items-center gap-0.5 ml-1 shrink-0 whitespace-nowrap">
                {[
                  { label: 'p', vel: 55, title: 'Piano (Suave, 55)' },
                  { label: 'mp', vel: 75, title: 'Mezzo-piano (Médio-baixo, 75)' },
                  { label: 'mf', vel: 95, title: 'Mezzo-forte (Padrão, 95)' },
                  { label: 'f', vel: 112, title: 'Forte (112)' },
                  { label: 'ff', vel: 127, title: 'Fortíssimo (Máximo, 127)' },
                ].map((preset) => {
                  const isCurrent = selectionVelocity === preset.vel;
                  return (
                    <button
                      key={preset.label}
                      onClick={() => handleSetVelocity(preset.vel)}
                      className={`px-1.5 h-6 rounded text-[10px] font-serif font-bold italic transition-colors shrink-0 whitespace-nowrap ${
                        isCurrent
                          ? 'bg-amber-500 text-stone-950 shadow-sm font-black'
                          : 'bg-stone-900 hover:bg-stone-800 border border-[#3e342b] text-stone-300 hover:text-amber-300'
                      }`}
                      title={preset.title}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duplicate */}
            <button
              onClick={handleDuplicateSelection}
              className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-[#3e342b] hover:border-amber-500 text-stone-300 transition-colors shrink-0"
              title="Duplicar Notas Selecionadas (Ctrl+D)"
            >
              <Copy className="w-3.5 h-3.5 text-amber-400" />
            </button>

            {/* Delete */}
            <button
              onClick={handleDeleteSelection}
              className="p-1.5 rounded-lg bg-stone-900 hover:bg-red-950/60 border border-[#3e342b] hover:border-red-500 text-stone-300 hover:text-red-400 transition-colors shrink-0"
              title="Apagar Notas Selecionadas (Del)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Deselect All */}
            <button
              onClick={handleDeselectAll}
              className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-[#3e342b] text-stone-400 hover:text-stone-200 transition-colors ml-1 shrink-0"
              title="Desmarcar Todas (Esc)"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Velocity Lane Toggle Button */}
      <button
        onClick={() => setShowVelocityLane((prev) => !prev)}
        className={`absolute bottom-4 right-6 z-40 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xl backdrop-blur-md border ${
          showVelocityLane
            ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold shadow-amber-500/20'
            : 'bg-[#1c1917]/90 hover:bg-[#25201c] border-[#3e342b] text-stone-300 hover:text-stone-100'
        }`}
        title={
          showVelocityLane
            ? 'Ocultar Pista de Intensidade (Velocity Lane)'
            : 'Mostrar Pista de Intensidade (Velocity Lane) para editar volume das notas'
        }
      >
        <Sliders className="w-3.5 h-3.5" />
        <span>Intensidade</span>
      </button>

      {/* Horizontal Scrollbar */}
      <div
        className="absolute bottom-0 h-3 bg-[#181513]/90 border-t border-[#2d2722] z-30 flex items-center select-none cursor-pointer"
        style={{ left: `${keyboardWidth}px`, right: `${VERTICAL_SCROLLBAR_WIDTH}px` }}
        onClick={handleScrollbarTrackClick}
      >
        <div
          className={`h-2 rounded-full transition-colors cursor-grab active:cursor-grabbing ${
            isDraggingScrollbar
              ? 'bg-amber-500 shadow-md shadow-amber-500/30'
              : 'bg-[#443a32] hover:bg-amber-600/70'
          }`}
          style={{
            width: `${scrollbarThumbWidth}px`,
            transform: `translateX(${scrollbarThumbLeft}px)`,
          }}
          onPointerDown={handleScrollbarThumbPointerDown}
          onPointerMove={handleScrollbarThumbPointerMove}
          onPointerUp={handleScrollbarThumbPointerUp}
          onPointerCancel={handleScrollbarThumbPointerUp}
        />
      </div>

      {/* Vertical Scrollbar */}
      <div
        className="absolute right-0 w-3 bg-[#181513]/90 border-l border-[#2d2722] z-30 flex justify-center select-none cursor-pointer"
        style={{
          top: `${RULER_HEIGHT}px`,
          bottom: `${HORIZONTAL_SCROLLBAR_HEIGHT + VELOCITY_LANE_HEIGHT}px`,
        }}
        onClick={handleVerticalScrollbarTrackClick}
      >
        <div
          className={`w-2 rounded-full transition-colors cursor-grab active:cursor-grabbing ${
            isDraggingVerticalScrollbar
              ? 'bg-amber-500 shadow-md shadow-amber-500/30'
              : 'bg-[#443a32] hover:bg-amber-600/70'
          }`}
          style={{
            height: `${scrollbarThumbHeight}px`,
            transform: `translateY(${scrollbarThumbTop}px)`,
          }}
          onPointerDown={handleVerticalScrollbarThumbPointerDown}
          onPointerMove={handleVerticalScrollbarThumbPointerMove}
          onPointerUp={handleVerticalScrollbarThumbPointerUp}
          onPointerCancel={handleVerticalScrollbarThumbPointerUp}
        />
      </div>
    </div>
  );
};
